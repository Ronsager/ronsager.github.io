FROM node:22-bookworm-slim

# better-sqlite3 wird beim Installieren nativ gebaut
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY scripts ./scripts

# Die Datenbank liegt in einem Volume, damit sie Updates überlebt
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_FILE=/app/data/universe.db

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
