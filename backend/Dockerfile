# syntax=docker/dockerfile:1

# ---- Stage 1: install every dependency and compile TypeScript ----------------
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first so this layer is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: production dependencies only -----------------------------------
# Built separately so the runtime image never carries the TypeScript toolchain.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Stage 3: runtime --------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# dumb-init gives us a real PID 1, so SIGTERM from Cloud Run reaches Node and
# in-flight requests get drained instead of the container being killed outright.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
# Cloud Run injects PORT; this default only matters when running the image locally.
ENV PORT=8080

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./

# Never run as root. The node image already ships an unprivileged `node` user.
USER node

EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
