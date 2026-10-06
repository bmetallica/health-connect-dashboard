# ---- frontend build ----
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=web /web/dist ./web-dist

ENV DATA_DIR=/data \
    TZ=Europe/Berlin \
    APP_TZ=Europe/Berlin \
    NODE_ENV=production
EXPOSE 8321 8322

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8321/health >/dev/null || exit 1

CMD ["node", "server/index.js"]
