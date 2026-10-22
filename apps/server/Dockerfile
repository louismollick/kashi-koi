FROM node:24-bookworm-slim
# Reject base images missing the October 2026 security release.
RUN node -e "const [major, minor, patch] = process.versions.node.split('.').map(Number); if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) process.exit(1)"
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@0.161.0 \
    && mkdir -p /data/codex && chown -R node:node /data
# better-sqlite3 ships linux x64 and arm64 prebuilds, so no compiler toolchain is needed. Its lockfile
# entry still has hasInstallScript, which would make npm build it from source, so scripts are skipped.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace @kashi-koi/server --workspace @kashi-koi/shared
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
USER node
ENV NODE_ENV=production KASHI_DATA_DIR=/data CODEX_HOME=/data/codex PORT=8787
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
