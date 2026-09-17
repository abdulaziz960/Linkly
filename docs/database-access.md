# Production database access

Linkly's production data lives in a Cloud SQL for PostgreSQL instance in the
`linkly-prod` GCP project. The Cloud Run service `linkly` (region
`me-central2`) reads `DATABASE_URL` from Secret Manager and attaches to the
instance over the Cloud SQL connector.

| Item | Value |
| --- | --- |
| GCP project | `linkly-prod` |
| Instance | `linkly-pg` (PostgreSQL 17, `me-central2`) |
| Connection name | `linkly-prod:me-central2:linkly-pg` |
| Public IP | `35.252.45.183` (no authorized networks configured) |
| Database | `linkly` |
| Application user | `linkly_app` |
| Secret with the full URL | Secret Manager `DATABASE_URL` in `linkly-prod` |

## Where the password goes

In **`.env.db`** at the repository root, written for you by:

```sh
npm run db:env
```

It asks for the user (default `linkly_app`), the password (hidden while you
type), the local proxy port (default `6543`) and the database (default
`linkly`). It percent-encodes the password and writes a single
`DATABASE_URL=...` line that only your user can read.

- Type the password exactly as it is. Do not encode it yourself.
- If you only have the full URL from Secret Manager, paste the **whole URL**
  at the password prompt. Its password is already encoded, so the script
  decodes it and takes the user from it. The host is always replaced by the
  local proxy.
- Press Ctrl+C at any prompt to cancel without writing anything.

`.env.db` is git-ignored and excluded from Docker builds. Only the
`npm run db:*` commands read it; Next.js never does.

**Do not put the production URL in `.env`, `.env.local`, or an `export` in
your terminal.** Next.js reads those, so `npm run dev` would run against
production. In development the app seeds demo fixtures and runs schema
repair on start-up. As a safety net, `lib/prisma.ts` refuses to start
outside production when `DATABASE_URL` looks like production. That means
the URL written by `npm run db:env` (it carries
`application_name=linkly-db-scripts`), user `linkly_app` with database
`linkly` on a local address, the default proxy port, or the production IP.

To read the URL from Secret Manager (owners of `linkly-prod` only):

```sh
gcloud secrets versions access latest --secret DATABASE_URL --project linkly-prod
```

Copy it straight into the `npm run db:env` password prompt. Resetting the
`linkly_app` password in the Cloud SQL console instead would break the
running app until the secret is updated and a new Cloud Run revision is
deployed.

## Connecting

The Cloud SQL Auth Proxy authenticates with your Google account and opens an
encrypted tunnel. The instance's public IP does not need your address
whitelisted.

One-time setup:

```sh
brew install cloud-sql-proxy
gcloud auth login                       # account with roles/cloudsql.client (or owner) on linkly-prod
gcloud auth application-default login   # optional; the proxy falls back to your gcloud login
npm run db:env                          # writes .env.db
```

Every session:

```sh
# Terminal 1 - keep open. Tunnels 127.0.0.1:6543 -> linkly-pg
npm run db:proxy

# Terminal 2
npm run db:check
```

For an interactive session, run this. The URL stays inside one command and
is never exported:

```sh
psql "$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' .env.db)"
```

Do not leave a psql transaction open while migrating. An open transaction on
`subscriptions` makes the migration wait for its lock and time out.

Port `6543` avoids clashing with a local PostgreSQL. Docker commonly holds
`5432` or `5433`. To use another port, run
`DB_PROXY_PORT=7654 npm run db:proxy` and enter the same port in
`npm run db:env`.

## Commands

| Command | Writes to production? | What it does |
| --- | --- | --- |
| `npm run db:proxy` | no | Opens the tunnel. |
| `npm run db:env` | no | Writes `.env.db` locally. |
| `npm run db:check` | no | Shows the connection, payment-ledger columns, migration history with a safety verdict and exact next steps, plans, subscriptions, payments, and stale pending payments. |
| `npm run db:rehearse -- [--sql "<statement>"]` | no | Dry run: rebuilds production's structure (no customer data) in a temporary local PostgreSQL, applies your SQL, resolves failed migrations, runs the guard and `migrate deploy` there, and reports PASS or FAIL. Needs local PostgreSQL tools (`brew install postgresql@16`). |
| `npm run db:baseline` | `_prisma_migrations` only | Records the migrations that must not be executed as already applied. Asks you to type `baseline`. |
| `npm run db:migrate:deploy` | schema and data | Applies pending migrations after a safety check. |
| `npm run db:resolve -- --rolled-back <name>` | `_prisma_migrations` only | Marks a failed migration for retry. `--applied <name>` records it as done instead. |
| `npm run db:push` | **never use on production** | Runs `prisma db push`, which syncs the schema directly and can drop columns. |

`db:check`, `db:rehearse`, `db:baseline`, `db:resolve` and `db:migrate:deploy` generate a
PostgreSQL Prisma client first. Afterwards they restore your local client,
normally SQLite, even when you press Ctrl+C. If a crash ever leaves
`npm test` failing with "URL must start with the protocol", restore the
client manually:

```sh
node scripts/prisma-generate.mjs
```

## Applying the payment-ledger migration

1. Run `npm run db:check` and read the **Prisma migration history** section.
2. Follow its verdict:
   - **"Safe to apply"**: run `npm run db:migrate:deploy`.
   - **"20260821000000_baseline is not recorded"**: the production tables
     were created by the app's start-up code, not by Prisma Migrate. Run
     `npm run db:baseline`, then `npm run db:check` again, then
     `npm run db:migrate:deploy`.
   - **"would DROP the live leads table"**: `npm run db:baseline` handles
     this as well.
   - **"The leads table has an obsolete shape"**: the table is the old CRM
     version, which the current app can't use, and it still has rows. Keep
     them by renaming the table, then run `npm run db:check` again:
     `ALTER TABLE leads RENAME TO leads_legacy;`
   - **"duplicate group(s) exist"**: a pending migration adds a unique
     index, but the table has duplicate rows. Remove the duplicates first;
     `db:check` names the table and columns.
   - **"Failed migration(s)"**: read `logs` on that migration's row in
     `_prisma_migrations` and fix the cause. Then run
     `npm run db:resolve -- --rolled-back <name>` and
     `npm run db:migrate:deploy` again. `--rolled-back` also accepts a
     failed record whose folder no longer exists locally.
   - **"Could not check ... for duplicates"** (a warning, not a blocker):
     deploy may still succeed. If that migration fails, follow the
     failed-migration step above.
3. Run `npm run db:check` again. Both payment tables should show `ok` under
   **Payment-ledger columns**, and the history should show nothing pending.

### Running it safely

1. Stop any tunnel that is already running (Ctrl+C in its terminal),
   refresh your Google login, then start the tunnel again. Google sign-ins
   on this account expire periodically, and a tunnel started before that
   can't recover: every `db:*` command then fails with "Can't reach
   database server" even though the tunnel still seems to be running.

   ```sh
   gcloud auth login
   gcloud auth application-default login
   npm run db:proxy
   ```

   `npm run db:proxy` checks the credentials before it starts and falls
   back to your `gcloud auth login` credentials if the application-default
   ones have expired.

2. Take an on-demand backup and wait until it reports `SUCCESSFUL`:

   ```sh
   gcloud sql backups create --instance linkly-pg --project linkly-prod --description "before payment-ledger migrations"
   gcloud sql backups list --instance linkly-pg --project linkly-prod --limit 3
   ```

3. Dry-run the exact plan: `npm run db:rehearse -- --sql "<your fix>"`.
   Continue only on `PASS`.
4. Run the same steps on production at a quiet time. Close any open psql
   sessions first.
5. Run `npm run db:check`, open the dashboard and billing page, and check
   the Cloud Run logs for errors.

What can go wrong, and what happens then:

- **A migration fails:** PostgreSQL rolls that migration back. Earlier ones
  stay applied, and the running app does not depend on any of them.
  `npm run db:check` shows the reason and the retry command.
- **A migration waits for a lock:** requests touching that table wait with
  it. The payment-ledger migration gives up after 10 seconds. For the
  others, stop with Ctrl+C if it hangs, then check `npm run db:check`.
- **Something is wrong after it succeeds:** restore the backup from step 2.
  This rolls the whole database back to that moment, so use it only as a
  last resort.

### Known case: two email rows for tenant-demo

Production's `20260828170000_tenant_isolation_integration_scope` failed
with `Key (tenant_id)=(tenant-demo) is duplicated` on
`email_integrations_tenant_id_key`. `tenant-demo` had two rows: the old
seeded `primary-email` (provider `webhook`; the email webhook route is
disabled) and `email:tenant-demo` (the Gmail connection). Lookups picked
one of them at random.

Fix it by moving the old row to a placeholder tenant. Don't delete it: the
app version deployed before this fix re-creates `primary-email` on every
start whenever it is missing, and once the unique index exists that failure
breaks every request.

```sh
npm run db:rehearse -- --sql "UPDATE email_integrations SET tenant_id = 'legacy-primary-email' WHERE id = 'primary-email' AND tenant_id = 'tenant-demo'"
# continue only if it prints PASS
psql "$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' .env.db)" -c "UPDATE email_integrations SET tenant_id = 'legacy-primary-email' WHERE id = 'primary-email' AND tenant_id = 'tenant-demo'"
npm run db:resolve -- --rolled-back 20260828170000_tenant_isolation_integration_scope
npm run db:check
npm run db:migrate:deploy
```

The parked row can be deleted once a version of the app containing the new
seed logic (`lib/database.ts`, "tenant-demo gets a default email integration
only if it has none") is deployed.

### What baselining records, and what still runs

`db:baseline` records only two migrations as applied:

- `20260821000000_baseline`, which creates tables without `IF NOT EXISTS`
  and would fail on a database that already has them;
- `20260827000000_remove_leads_feature`, when `leads` is the current
  lead-ads table. That migration drops `leads`, and no later migration
  recreates it; only the app's start-up code does, and empty. Running it
  would delete every Meta and Snapchat lead-ad record. If `leads` is still
  the old, empty CRM table, the migration is allowed to drop it, because the
  current app can't start with that shape.

Every other migration then runs. Each only creates or alters objects with
`IF [NOT] EXISTS`, drops defaults, or back-fills values idempotently, so it
is safe on a database that already has some of those objects. Running them
matters: on PostgreSQL the app's start-up code never creates the support
ticket and feature request tables, several unique indexes, or the
performance indexes that those migrations add.

Each migration runs in its own transaction. If one fails, only that
migration is rolled back and recorded as failed. The payment-ledger
migration sets a 10-second lock timeout, so it fails fast instead of
stalling logins while it waits for a lock.

`db:migrate:deploy` refuses to start in any of the unsafe cases above. For a
database you have inspected yourself, you can bypass the check with
`npm run db:migrate:deploy -- --skip-guard`. It then asks you to type the
database name. There is deliberately no environment variable that turns the
check off.

### Order relative to deploying the app

Both orders are safe. The migration only adds columns, so the running app
ignores them. The new app version also adds any missing payment-ledger
columns itself on start-up, in `runRequiredProductionMigrations` in
`lib/database.ts`; it alters only columns that are actually missing. The
migration is still needed because it back-fills the gateway, period and
last-payment values for existing rows. Cloud Build does not run migrations
on deploy.

## Direct public IP (fallback)

Use this only if the proxy is not an option. Add your IP as an authorized
network on the instance (Cloud SQL console, Connections, Networking), then
run `npm run db:env` with port `5432`. Edit `.env.db` so the host is
`35.252.45.183` and `?sslmode=require` is appended. Remove the authorized
network when you are done.
