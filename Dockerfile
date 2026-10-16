# Multi-stage build for Cloud Run. node:22-slim (glibc) instead of alpine -
# Prisma's query engine binary has known issues on alpine's musl libc.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: `npm ci` otherwise runs the postinstall hook
# (scripts/prisma-generate.mjs), but only package.json/package-lock.json
# exist in this stage yet - the actual generate runs explicitly in the
# builder stage below, once the full source is present.
RUN npm ci --ignore-scripts

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A placeholder postgresql:// URL so scripts/prisma-schema.mjs swaps the
# schema provider to "postgresql" and prisma generate targets it - no real
# database is contacted at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# this one has to arrive as a build arg (from cloudbuild.yaml's
# --build-arg), not a Cloud Run runtime env var - a runtime-only var would
# never reach the already-built client JS.
ARG NEXT_PUBLIC_SALES_WHATSAPP_NUMBER=""
ENV NEXT_PUBLIC_SALES_WHATSAPP_NUMBER=$NEXT_PUBLIC_SALES_WHATSAPP_NUMBER
# Safe to expose client-side by design (Moyasar's own public/publishable
# key, distinct from MOYASAR_SECRET_KEY) - the embedded checkout form
# (app/billing/pay/[paymentId]) needs it in the browser bundle.
ARG NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY=$NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY
# Sentry DSNs only accept events (no read/write access to anything), so this
# is safe to expose client-side the same way - see instrumentation-client.ts.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
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
# The X Chat engine (lib/xchat/engine.ts) loads its WASM file by path at runtime, so the bundler's file tracing does not
# see it: copy the package next to the app's own node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@xdevplatform/chat-xdk ./node_modules/@xdevplatform/chat-xdk

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
