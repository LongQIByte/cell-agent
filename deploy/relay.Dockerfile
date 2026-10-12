FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/protocol packages/protocol
COPY apps/relay apps/relay
RUN npm ci --omit=dev --workspace @codex-remote/relay --include-workspace-root
RUN mkdir -p /data && chown node:node /data
ENV RELAY_DATA_DIR=/data RELAY_PORT=8787
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "--import", "tsx", "apps/relay/src/index.ts"]
