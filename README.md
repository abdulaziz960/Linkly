# Linkly

Linkly is a multi-tenant SaaS platform for managing customer conversations, campaigns, automations, bot flows, employee permissions, subscriptions, billing, and channel integrations.

## Architecture

- `app/` contains the Next.js App Router pages and API route handlers.
- `app/api/` contains authenticated tenant APIs, platform-admin APIs, public webhooks, and public widget endpoints.
- `lib/` contains authentication, authorization, Prisma access, integrations, billing, campaign processing, bot execution, and webhook utilities.
- `prisma/` contains the Prisma schema and migrations. Prisma migrations are the production source of truth for database schema changes.
- `tests/` contains Vitest coverage for security and business logic boundaries.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Prisma
- SQLite for local development
- PostgreSQL-compatible deployment through `DATABASE_URL`
- Vitest
- ESLint

## Local Development

```bash
npm ci
npm run dev
```

If `DATABASE_URL` is not set outside production, Linkly falls back to `file:./dev.db`.

## Environment Variables

Copy `.env.example` to `.env.local` and fill only the values needed for your environment.

Required in production:

- `DATABASE_URL`
- `AUTH_SECRET`
- `INTEGRATION_ENCRYPTION_KEY`
- `CRON_SECRET`

Common integration variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `META_APP_ID`
- `META_APP_SECRET`
- `WHATSAPP_META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `X_CLIENT_ID`
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `MOYASAR_SECRET_KEY`
- `MOYASAR_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `GOOGLE_APPS_SCRIPT_URL`
- `GOOGLE_APPS_SCRIPT_SECRET`

Never commit real secrets.

## Database Setup

Generate the Prisma client:

```bash
node scripts/prisma-generate.mjs
```

Apply migrations in production:

```bash
npm run db:migrate:deploy
```

Runtime schema repair is disabled in production by default. Use `ENABLE_RUNTIME_SCHEMA_REPAIR=true` only during a controlled compatibility repair window.

## Admin Bootstrap

Create or reset a Platform Admin explicitly:

```bash
SUPER_ADMIN_EMAIL="admin@example.com" SUPER_ADMIN_PASSWORD="StrongPassword123" npm run admin:create
```

Do not reuse a tenant-owner email for Platform Admin access. Existing tenant accounts are not silently promoted to Platform Admin.

## Running Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Production builds require `DATABASE_URL` and `AUTH_SECRET`.

## Webhooks

Configure provider webhooks with secrets whenever the provider supports them:

- Meta/WhatsApp/Instagram/Facebook: signed `x-hub-signature-256`
- Moyasar: `MOYASAR_WEBHOOK_SECRET`
- Telegram: `x-telegram-bot-api-secret-token`
- X: `x-twitter-webhooks-signature`
- Email inbound: tenant webhook secret

Webhook handlers should be idempotent and must not log tokens, passwords, or provider secrets.

## Multi-Tenant Security

Every tenant-owned resource must be read or mutated through a `tenantId` boundary. API routes that accept IDs from params or request bodies should verify the resource belongs to the current user's tenant before returning or changing it.

Platform Admin is a separate persisted permission (`isPlatformAdmin`) and must not be inferred from tenant ownership or email alone.

## Deployment

Before deploying:

1. Configure production environment variables.
2. Run Prisma migrations.
3. Run lint, typecheck, tests, and build.
4. Configure webhook URLs and secrets in provider dashboards.
5. Create the initial Platform Admin through the bootstrap script.
