# Multi-stage build for Cloud Run. node:22-slim (glibc) instead of alpine -
# Prisma's query engine binary has known issues on alpine's musl libc.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A placeholder postgresql:// URL so scripts/prisma-schema.mjs swaps the
# schema provider to "postgresql" and prisma generate targets it - no real
# database is contacted at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN node scripts/prisma-generate.mjs
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
