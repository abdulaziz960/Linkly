# Linkly

**Every customer conversation in one place.**

Linkly is a multi-channel customer engagement platform for support and sales teams. It brings WhatsApp, Instagram, email, Telegram, and other customer touchpoints into one shared workspace so teams can reply faster, assign conversations, automate follow-ups, and keep the full customer context visible.

## What Linkly offers

- **Shared inbox** — manage conversations and customer history from one place.
- **Team collaboration** — assign conversations and control employee permissions.
- **Campaigns** — create, send, and track multi-channel outreach.
- **Automations** — route conversations and trigger actions using configurable rules.
- **Bot flows** — build structured automated customer journeys.
- **Reports** — monitor conversations, campaigns, and team activity.
- **Channel integrations** — connect WhatsApp, Instagram, Facebook Messenger, Telegram, email, Google Maps reviews, and X. TikTok messaging support is prepared for businesses with the required approval.
- **SaaS operations** — manage tenants, subscriptions, billing, and platform administration.

## Tech stack

| Area | Technology |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Data | Prisma, SQLite for local development, `DATABASE_URL` for production |
| Quality | Vitest, ESLint, TypeScript |

## Quick start

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure the environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

For local development, Linkly falls back to `file:./dev.db` when `DATABASE_URL` is not set. Use unique, securely generated secrets in every deployed environment.

### 3. Start the development server

```bash
npm run dev
```

The development command generates the Prisma client before starting Next.js.

## Environment variables

Only configure the integrations you intend to use. Never commit real credentials.

| Category | Variables |
| --- | --- |
| Production runtime | `DATABASE_URL`, `AUTH_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Meta and WhatsApp | `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| Billing | `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` |
| Transactional email fallback | `GOOGLE_APPS_SCRIPT_URL`, `GOOGLE_APPS_SCRIPT_SECRET` |

See [`.env.example`](.env.example) for the complete list, aliases, and operational notes.

## Database

Generate the Prisma client manually when needed:

```bash
node scripts/prisma-generate.mjs
```

Apply committed migrations in production:

```bash
npm run db:migrate:deploy
```

Prisma migrations are the production source of truth. Administrative recovery and bootstrap procedures should remain in private operational documentation.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Production builds require `DATABASE_URL` and `AUTH_SECRET`.

## Architecture

```text
app/          Next.js pages, API route handlers, webhooks, and widget endpoints
lib/          Authentication, authorization, data access, integrations, and business logic
prisma/       Prisma schema and production migrations
public/       Public browser assets and the embeddable widget
scripts/      Database and administrative scripts
tests/        Security and business-boundary tests
```

## Security

Linkly isolates tenant data, enforces role-based access, encrypts integration credentials, and validates incoming provider requests. Never commit credentials, expose administrative procedures publicly, or log sensitive authentication data. Keep deployment-specific security controls and incident procedures in private operational documentation.

## Production checklist

1. Configure the required production environment variables.
2. Apply Prisma migrations.
3. Run lint, type checking, tests, and the production build.
4. Configure provider callbacks and credentials through their secure dashboards.
5. Complete the private administrative bootstrap procedure.
