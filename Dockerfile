# PaperWriter: one container with the editor, live co-editing and the LaTeX engine.
#   docker compose up -d        (see docker-compose.yml)
FROM node:22-slim

# Tectonic (installed by the setup guide into the data volume) needs certificates and fontconfig.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig tar \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5178 \
    PW_DOCKER=1

# Your papers and settings live here; keep them in volumes so updates never touch them.
VOLUME ["/app/projects", "/app/.data"]
EXPOSE 5178
CMD ["node", "--env-file-if-exists=.env", "server.js"]
