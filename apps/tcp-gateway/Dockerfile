FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/tcp-gateway/package.json ./apps/tcp-gateway/
COPY packages/telemetry-types/package.json ./packages/telemetry-types/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY apps/tcp-gateway/src ./apps/tcp-gateway/src
COPY apps/tcp-gateway/tsconfig.json ./apps/tcp-gateway/
COPY packages/telemetry-types/src ./packages/telemetry-types/src

# Build
RUN pnpm --filter @mobilus/tcp-gateway build

# Production image
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

COPY --from=builder /app/apps/tcp-gateway/dist ./dist
COPY --from=builder /app/apps/tcp-gateway/node_modules ./node_modules
COPY --from=builder /app/packages/telemetry-types ./packages/telemetry-types

EXPOSE 5000 3000 9090

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
