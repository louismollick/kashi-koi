FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace @kashi-koi/server --workspace @kashi-koi/shared

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@0.161.0 \
    && mkdir -p /data/codex && chown -R node:node /data
COPY --from=dependencies /app ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
USER node
ENV NODE_ENV=production KASHI_DATA_DIR=/data CODEX_HOME=/data/codex PORT=8787
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
