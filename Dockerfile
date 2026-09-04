# syntax=docker/dockerfile:1

# ---------- Stage 1: install deps + build all workspaces ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web/dist

# Production deps only (server + shared)
COPY package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace @planner/server --include-workspace-root

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

RUN addgroup -S planner && adduser -S planner -G planner \
    && mkdir -p /data && chown planner:planner /data
USER planner

EXPOSE 3000
CMD ["node", "server/dist/index.js"]