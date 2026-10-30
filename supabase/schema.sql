-- PaperWriter cloud schema.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.

-- ───────────── tables ─────────────

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- "Anyone with the link": none | viewer | editor
  link_role text not null default 'none' check (link_role in ('none', 'viewer', 'editor')),
  share_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Members are keyed by email so people can be invited before they have an account.
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);

-- The project's content is a Yjs document stored as an append-only log of updates.
-- Clients periodically merge old rows into one (insert merged row, then delete the rows it covers).
create table if not exists public.project_updates (
  id bigserial primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  "update" text not null, -- base64-encoded Yjs update
  created_at timestamptz not null default now()
);
create index if not exists project_updates_project_idx on public.project_updates (project_id, id);

-- ───────────── helpers ─────────────

-- The caller's role in a project (owner > editor > viewer), or null.
create or replace function public.project_role(pid uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.project_members m
  where m.project_id = pid
    and (m.user_id = auth.uid() or m.email = lower(coalesce(auth.jwt() ->> 'email', '')))
  order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end
  limit 1
$$;

-- The creator becomes the owner.
create or replace function public.handle_new_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, email, user_id, role, invited_by)
  values (new.id, lower(coalesce(auth.jwt() ->> 'email', '')), new.owner_id, 'owner', new.owner_id)
  on conflict (project_id, email) do update set role = 'owner', user_id = excluded.user_id;
  return new;
end $$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created after insert on public.projects
  for each row execute function public.handle_new_project();

-- Invited people get linked to their account the first time they open the project.
create or replace function public.claim_invites()
returns void language sql security definer set search_path = public as $$
  update public.project_members set user_id = auth.uid()
  where user_id is null and email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Join through a share link (only works while link sharing is switched on).
create or replace function public.join_project(token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.projects;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into p from public.projects where share_token = token;
  if p.id is null or p.link_role = 'none' then raise exception 'This link is invalid or sharing was turned off'; end if;
  insert into public.project_members (project_id, email, user_id, role, invited_by)
  values (p.id, lower(auth.jwt() ->> 'email'), auth.uid(), p.link_role, p.owner_id)
  on conflict (project_id, email) do update
    set user_id = excluded.user_id,
        role = case when public.project_members.role in ('owner', 'editor') then public.project_members.role else excluded.role end;
  return p.id;
end $$;

-- Owners/editors can rotate the link so old links stop working.
create or replace function public.reset_share_token(pid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid := gen_random_uuid();
begin
  if public.project_role(pid) not in ('owner', 'editor') then raise exception 'Not allowed'; end if;
  update public.projects set share_token = t where id = pid;
  return t;
end $$;

-- ───────────── row level security ─────────────

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_updates enable row level security;

drop policy if exists "members read projects" on public.projects;
create policy "members read projects" on public.projects for select to authenticated
  using (public.project_role(id) is not null or owner_id = auth.uid());
drop policy if exists "users create projects" on public.projects;
create policy "users create projects" on public.projects for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "editors update projects" on public.projects;
create policy "editors update projects" on public.projects for update to authenticated
  using (public.project_role(id) in ('owner', 'editor'));
drop policy if exists "owners delete projects" on public.projects;
create policy "owners delete projects" on public.projects for delete to authenticated
  using (public.project_role(id) = 'owner');

drop policy if exists "members read members" on public.project_members;
create policy "members read members" on public.project_members for select to authenticated
  using (public.project_role(project_id) is not null);
drop policy if exists "editors invite" on public.project_members;
create policy "editors invite" on public.project_members for insert to authenticated
  with check (public.project_role(project_id) in ('owner', 'editor') and role in ('editor', 'viewer'));
drop policy if exists "owners change roles" on public.project_members;
create policy "owners change roles" on public.project_members for update to authenticated
  using (public.project_role(project_id) = 'owner') with check (role in ('editor', 'viewer'));
drop policy if exists "owners remove members" on public.project_members;
create policy "owners remove members" on public.project_members for delete to authenticated
  using (role <> 'owner' and (public.project_role(project_id) = 'owner' or user_id = auth.uid()));

drop policy if exists "members read content" on public.project_updates;
create policy "members read content" on public.project_updates for select to authenticated
  using (public.project_role(project_id) is not null);
drop policy if exists "editors write content" on public.project_updates;
create policy "editors write content" on public.project_updates for insert to authenticated
  with check (public.project_role(project_id) in ('owner', 'editor'));
drop policy if exists "editors compact content" on public.project_updates;
create policy "editors compact content" on public.project_updates for delete to authenticated
  using (public.project_role(project_id) in ('owner', 'editor'));

-- ───────────── file storage (images, PDFs, …) ─────────────

insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "members read files" on storage.objects;
create policy "members read files" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.project_role(((storage.foldername(name))[1])::uuid) is not null);
drop policy if exists "editors upload files" on storage.objects;
create policy "editors upload files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.project_role(((storage.foldername(name))[1])::uuid) in ('owner', 'editor'));
drop policy if exists "editors update files" on storage.objects;
create policy "editors update files" on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and public.project_role(((storage.foldername(name))[1])::uuid) in ('owner', 'editor'));
drop policy if exists "editors delete files" on storage.objects;
create policy "editors delete files" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.project_role(((storage.foldername(name))[1])::uuid) in ('owner', 'editor'));

-- ───────────── realtime (live co-editing, cursors, presence) ─────────────
-- Private channels named "project:<uuid>" are limited to that project's members.

drop policy if exists "members receive project broadcasts" on realtime.messages;
create policy "members receive project broadcasts" on realtime.messages for select to authenticated
  using (realtime.topic() like 'project:%' and public.project_role(split_part(realtime.topic(), ':', 2)::uuid) is not null);
drop policy if exists "members send project broadcasts" on realtime.messages;
create policy "members send project broadcasts" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'project:%' and public.project_role(split_part(realtime.topic(), ':', 2)::uuid) is not null);

grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.join_project(uuid) to authenticated;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.reset_share_token(uuid) to authenticated;
