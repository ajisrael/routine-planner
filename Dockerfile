# syntax=docker/dockerfile:1

# ---------- Stage 1: install deps + build all workspaces ----------
FROM node:22-alpine AS build
WORKDIR /app

# better-sqlite3 compiles from source when a prebuilt binary isn't available.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: production-only deps (toolchain for native modules) ----------
FROM node:22-alpine AS proddeps
WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace @planner/server --include-workspace-root

# ---------- Stage 3: runtime (non-root, no build toolchain) ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web/dist

COPY --from=proddeps /app/node_modules node_modules
# @planner/shared is imported at runtime through its compiled dist; its
# package.json must exist because node_modules/@planner/shared symlinks here.
COPY shared/package.json shared/package.json
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY package.json ./
COPY scripts scripts/

RUN addgroup -S planner && adduser -S planner -G planner \
    && mkdir -p /data && chown planner:planner /data
USER planner

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
