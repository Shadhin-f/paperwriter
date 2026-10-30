// How other people reach this PaperWriter: the local network, or a Cloudflare quick tunnel.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BIN, IS_WIN, which, spawnProgram, run } from './util.js';

const CLOUDFLARED_LOCAL = path.join(BIN, IS_WIN ? 'cloudflared.exe' : 'cloudflared');

/** IPv4 addresses other devices on the same network can use. */
export function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push({ name, address: a.address });
    }
  }
  return out;
}

export async function cloudflaredPath() {
  if (fs.existsSync(CLOUDFLARED_LOCAL)) return CLOUDFLARED_LOCAL;
  return which('cloudflared');
}

let tunnel = null; // { child, url, port }

export function tunnelStatus() {
  return tunnel ? { running: true, url: tunnel.url } : { running: false, url: null };
}

/**
 * Starts a free Cloudflare quick tunnel (no account needed) and resolves with its https URL.
 * Anyone can reach the URL, but PaperWriter still requires a valid share link for every project.
 */
export async function startTunnel(port) {
  if (tunnel?.url) return tunnelStatus();
  const bin = await cloudflaredPath();
  if (!bin) throw Object.assign(new Error('cloudflared is not installed'), { status: 400 });
  const child = spawnProgram(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`]);
  tunnel = { child, url: null, port };
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloudflare did not hand out an address in time. Try again.')), 30000);
    const onData = (d) => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited (code ${code})`));
    });
  }).catch((e) => {
    child.kill();
    tunnel = null;
    throw e;
  });
  tunnel.url = url;
  child.on('exit', () => {
    if (tunnel?.child === child) tunnel = null;
  });
  return tunnelStatus();
}

export function stopTunnel() {
  tunnel?.child.kill();
  tunnel = null;
  return tunnelStatus();
}

process.on('exit', () => tunnel?.child.kill());

/** Downloads the official cloudflared binary from GitHub into .data/bin. */
export async function installCloudflared() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const asset = IS_WIN ? `cloudflared-windows-${arch}.exe` : process.platform === 'darwin' ? `cloudflared-darwin-${arch}.tgz` : `cloudflared-linux-${arch}`;
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PaperWriter' } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  await fsp.mkdir(BIN, { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  if (asset.endsWith('.tgz')) {
    const tgz = path.join(BIN, asset);
    await fsp.writeFile(tgz, buf);
    await run('tar', ['-xzf', tgz, '-C', BIN]);
    await fsp.rm(tgz, { force: true });
  } else await fsp.writeFile(CLOUDFLARED_LOCAL, buf);
  if (!IS_WIN) await fsp.chmod(CLOUDFLARED_LOCAL, 0o755);
  return { ok: true, path: CLOUDFLARED_LOCAL };
}
