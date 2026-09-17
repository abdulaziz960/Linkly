// Shared, read-only inspection of a PostgreSQL database's Prisma Migrate
// state, used by db:check (report), db:migrate:deploy (guard), db:baseline
// and db:resolve. It never writes.
//
// Why a guard is needed: production tables were historically created by the
// app's runtime bootstrap (lib/database.ts), not by `prisma migrate deploy`.
// On such an "unmanaged" database `migrate deploy` would
//   - fail on 20260821000000_baseline (CREATE TABLE without IF NOT EXISTS), and
//   - run 20260827000000_remove_leads_feature, which DROPs the live `leads`
//     table (Meta / Snapchat lead-ad data). No later migration recreates it;
//     only the app's runtime bootstrap does, empty - so this is data loss.
// Every other migration only creates/alters objects with IF [NOT] EXISTS
// guards (plus idempotent back-fills), so it is safe - and necessary - to let
// deploy run them: on PostgreSQL the runtime bootstrap does NOT create
// everything they create (e.g. support_tickets, feature_requests, several
// unique and performance indexes).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const sourceMigrationsDir = join(root, "prisma", "migrations");
/** What `prisma migrate deploy --schema prisma/.generated/schema.prisma` actually executes. */
export const generatedMigrationsDir = join(root, "prisma", ".generated", "migrations");
export const BASELINE_MIGRATION = "20260821000000_baseline";
export const LEDGER_MIGRATION = "20260917090000_payment_ledger_details";

/**
 * Migrations that drop a table. `liveColumns` identifies the table shape the
 * CURRENT app uses: only that shape holds data we must never drop. Any other
 * shape (e.g. the pre-lead-ads CRM `leads` table from the baseline) is
 * obsolete - keeping it would break the app's start-up, which recreates the
 * table and indexes it in the new shape.
 */
const DESTRUCTIVE_MIGRATIONS = {
  "20260827000000_remove_leads_feature": { table: "leads", liveColumns: ["customer_id", "created_at"] }
};

/**
 * Unique indexes whose columns are added or back-filled by the same
 * migration: the duplicate preflight must group by the value each row will
 * have AFTER that migration, not the current one. `present` says whether the
 * column already exists.
 */
const POST_MIGRATION_VALUES = {
  "20260828170000_tenant_isolation_integration_scope": {
    integration_settings: {
      tenant_id: (present) => `CASE WHEN position(':' in "id") > 0 THEN split_part("id", ':', 1) ELSE ${present ? '"tenant_id"' : "'tenant-demo'"} END`
    },
    email_integrations: {
      tenant_id: (present) => `CASE WHEN "id" LIKE 'email:%' AND length("id") > 6 THEN substring("id" from 7) ELSE ${present ? '"tenant_id"' : "'tenant-demo'"} END`
    }
  }
};

export const LEDGER_COLUMNS = {
  subscription_payments: ["gateway", "gateway_payment_id", "payment_method", "gateway_status", "failure_reason", "failed_at", "initiated_by", "metadata_json", "period_start", "period_end"],
  campaign_payments: ["gateway", "gateway_payment_id", "payment_method", "gateway_status", "failure_reason", "failed_at", "initiated_by", "metadata_json"]
};

export function isPostgresUrl(url = "") {
  return /^postgres(ql)?:\/\//.test(url);
}

/** host/port, database and user from DATABASE_URL - never the password. */
export function describeDatabaseUrl(url = "") {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host || "(socket)",
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "(default)",
      user: decodeURIComponent(parsed.username) || "(none)",
      hasPassword: parsed.password !== ""
    };
  } catch {
    return { host: "(unparseable DATABASE_URL)", database: "?", user: "?", hasPassword: false };
  }
}

export function listMigrations(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

export async function tableExists(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT to_regclass(CAST($1 AS text)) IS NOT NULL AS present`, table);
  return Boolean(rows[0]?.present);
}

async function indexExists(prisma, index) {
  const rows = await prisma.$queryRawUnsafe(`SELECT to_regclass(CAST($1 AS text)) IS NOT NULL AS present`, index);
  return Boolean(rows[0]?.present);
}

export async function existingColumns(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    table
  );
  return rows.map((row) => row.column_name);
}

/** Which payment-ledger columns are present on each table. */
export async function ledgerColumnState(prisma) {
  const state = {};
  for (const [table, columns] of Object.entries(LEDGER_COLUMNS)) {
    const present = await existingColumns(prisma, table);
    state[table] = { present: columns.filter((column) => present.includes(column)), missing: columns.filter((column) => !present.includes(column)) };
  }
  return state;
}

async function countRows(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
  return Number(rows[0]?.n ?? 0);
}

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A pending `CREATE UNIQUE INDEX IF NOT EXISTS` fails - and marks its whole
 * migration as failed - when the table will hold duplicates at that point.
 * Find those before deploy runs. Returns conflicts, plus indexes that could
 * not be verified (reported as warnings, never silently skipped).
 */
async function uniqueIndexConflicts(prisma, pending, dir) {
  const conflicts = [];
  const unverifiable = [];
  const pattern = /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+"?(\w+)"?\s+ON\s+"?(\w+)"?\s*\(([^)]+)\)/gi;
  for (const name of pending) {
    const file = join(dir, name, "migration.sql");
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, "utf8");
    for (const match of sql.matchAll(pattern)) {
      const [, index, table, rawColumns] = match;
      const columns = rawColumns.split(",").map((column) => column.trim().replace(/"/g, ""));
      if (![index, table, ...columns].every((part) => identifier.test(part))) {
        unverifiable.push({ migration: name, index, reason: "unexpected index definition" });
        continue;
      }
      // A table the migration creates itself starts empty.
      if (!(await tableExists(prisma, table)) || (await indexExists(prisma, index))) continue;
      const present = await existingColumns(prisma, table);
      const overrides = POST_MIGRATION_VALUES[name]?.[table] || {};
      const expressions = [];
      let verifiable = true;
      for (const column of columns) {
        if (overrides[column]) expressions.push(overrides[column](present.includes(column)));
        else if (present.includes(column)) expressions.push(`"${column}"`);
        else verifiable = false;
      }
      if (!verifiable) {
        unverifiable.push({ migration: name, index, reason: `column(s) ${columns.filter((column) => !present.includes(column)).join(", ")} do not exist yet` });
        continue;
      }
      const groupBy = expressions.map((_, i) => i + 1).join(", ");
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS n FROM (SELECT ${expressions.join(", ")} FROM "${table}" GROUP BY ${groupBy} HAVING COUNT(*) > 1) duplicates`
      );
      const groups = Number(rows[0]?.n ?? 0);
      if (groups > 0) conflicts.push({ migration: name, index, table, columns, expressions, groups });
    }
  }
  return { conflicts, unverifiable };
}

/**
 * ALTER TABLE / CREATE INDEX / DROP INDEX need ownership of the table, and
 * CREATE TABLE needs CREATE on the schema. A disposable rehearsal runs as a
 * superuser and can't see these, so check them on the real database.
 */
async function permissionProblems(prisma, pending, dir) {
  const tables = new Set();
  let createsObjects = false;
  for (const name of pending) {
    const file = join(dir, name, "migration.sql");
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, "utf8").replace(/--[^\n]*/g, "");
    for (const match of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"?(\w+)"?/gi)) tables.add(match[1]);
    for (const match of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\w+"?\s+ON\s+"?(\w+)"?/gi)) tables.add(match[1]);
    if (/CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)/i.test(sql)) createsObjects = true;
  }
  const problems = [];
  if (tables.size) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, pg_has_role(current_user, c.relowner, 'MEMBER') AS allowed, current_user AS me
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND c.relname = ANY($1::text[])`,
      [...tables]
    );
    const blocked = rows.filter((row) => !row.allowed);
    if (blocked.length) {
      const listed = blocked.slice(0, 6).map((row) => `${row.name} (owner ${row.owner})`).join(", ");
      const more = blocked.length > 6 ? ` and ${blocked.length - 6} more` : "";
      const owners = [...new Set(blocked.map((row) => row.owner))].join(", ");
      problems.push(`User ${blocked[0].me} does not own ${blocked.length} table(s) that pending migrations alter: ${listed}${more}. Those migrations would fail. Run them as the owner, or have the owner run: GRANT ${owners} TO ${blocked[0].me};`);
    }
  }
  if (createsObjects) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT has_schema_privilege(current_user, current_schema(), 'CREATE') AS allowed, current_schema() AS schema`);
    if (!row?.allowed) problems.push(`The connected user cannot create tables or indexes in schema ${row?.schema}, which pending migrations need.`);
  }
  return problems;
}

/**
 * Compares the migrations `migrate deploy` will execute with
 * _prisma_migrations and decides whether deploy is safe to run as-is.
 *
 * `baselineCandidates` are pending migrations that must be recorded as
 * already applied (`prisma migrate resolve --applied`) instead of executed:
 *   - 20260821000000_baseline, when Linkly's tables already exist but the
 *     baseline was never recorded (the database predates Prisma Migrate);
 *   - destructive migrations whose target table exists (never drop a live
 *     table).
 * Everything else stays pending and is executed by deploy.
 */
export async function inspectMigrationState(prisma) {
  const source = listMigrations(sourceMigrationsDir);
  const generated = listMigrations(generatedMigrationsDir);
  const local = generated.length ? generated : source;
  const deployDir = generated.length ? generatedMigrationsDir : sourceMigrationsDir;
  const dirMismatch = generated.length > 0 && (generated.length !== source.length || generated.some((name, i) => name !== source[i]));

  const managed = await tableExists(prisma, "_prisma_migrations");
  let applied = [];
  let failed = [];
  if (managed) {
    const rows = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`);
    applied = rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name);
    const appliedNames = new Set(applied);
    failed = [...new Set(rows.filter((row) => !row.finished_at && !row.rolled_back_at).map((row) => row.migration_name))].filter((name) => !appliedNames.has(name));
  }
  const appliedSet = new Set(applied);
  const pending = local.filter((name) => !appliedSet.has(name));
  const unknownApplied = applied.filter((name) => !local.includes(name));
  const hasAppTables = await tableExists(prisma, "subscriptions");
  // "Unmanaged" = Linkly's tables exist but our baseline was never recorded
  // (a _prisma_migrations table holding only another project's rows counts too).
  const unmanaged = hasAppTables && !appliedSet.has(BASELINE_MIGRATION);

  const destructivePending = [];
  const legacyTables = [];
  for (const [name, { table, liveColumns }] of Object.entries(DESTRUCTIVE_MIGRATIONS)) {
    if (!pending.includes(name) || !(await tableExists(prisma, table))) continue;
    const columns = await existingColumns(prisma, table);
    const rows = await countRows(prisma, table);
    if (liveColumns.every((column) => columns.includes(column))) {
      destructivePending.push({ name, table, rows });
    } else if (rows > 0) {
      // Obsolete shape that still holds rows: dropping it loses them, keeping
      // it breaks start-up. The operator decides (rename keeps the data).
      legacyTables.push({ name, table, rows });
    }
    // Obsolete shape and empty: let the migration drop it.
  }

  const baselineCandidates = [
    ...(unmanaged && pending.includes(BASELINE_MIGRATION) ? [BASELINE_MIGRATION] : []),
    ...destructivePending.map((entry) => entry.name)
  ].sort();
  const willRun = pending.filter((name) => !baselineCandidates.includes(name));
  const { conflicts: indexConflicts, unverifiable: unverifiableIndexes } = await uniqueIndexConflicts(prisma, willRun, deployDir);

  const problems = [];
  const warnings = [];
  problems.push(...(await permissionProblems(prisma, willRun, deployDir)));
  if (dirMismatch) {
    problems.push("prisma/.generated/migrations (what deploy executes) differs from prisma/migrations. Run the command again through npm so it is refreshed.");
  }
  if (failed.length) {
    problems.push(`Failed migration(s) recorded in _prisma_migrations: ${failed.join(", ")}. prisma migrate deploy refuses to run until each is resolved.`);
  }
  if (unmanaged && pending.includes(BASELINE_MIGRATION)) {
    problems.push(`This database already has Linkly's tables but ${BASELINE_MIGRATION} is not recorded. deploy would try to create those tables again and fail.`);
  }
  for (const entry of destructivePending) {
    problems.push(`Pending migration ${entry.name} would DROP the live "${entry.table}" table (${entry.rows} row(s)).`);
  }
  for (const legacy of legacyTables) {
    problems.push(`The "${legacy.table}" table has an obsolete shape and ${legacy.rows} row(s); pending ${legacy.name} would DROP it, and keeping it breaks the app's start-up. Keep the data by renaming it first (ALTER TABLE ${legacy.table} RENAME TO ${legacy.table}_legacy;) or back it up, then run npm run db:check again.`);
  }
  for (const conflict of indexConflicts) {
    problems.push(`${conflict.migration} creates unique index ${conflict.index} on ${conflict.table}(${conflict.columns.join(", ")}), but ${conflict.groups} duplicate group(s) exist. Remove the duplicates first or the migration will fail.`);
  }
  for (const entry of unverifiableIndexes) {
    warnings.push(`Could not check ${entry.migration} unique index ${entry.index} for duplicates (${entry.reason}). If that migration fails, npm run db:check will show how to retry it.`);
  }
  if (unknownApplied.length) {
    warnings.push(`_prisma_migrations also lists migrations that are not in this checkout: ${unknownApplied.join(", ")}. Make sure you are on the latest main branch.`);
  }

  return {
    local,
    applied,
    failed,
    pending,
    willRun,
    unknownApplied,
    managed,
    unmanaged,
    hasAppTables,
    destructivePending,
    legacyTables,
    indexConflicts,
    unverifiableIndexes,
    baselineCandidates,
    problems,
    warnings,
    safeToDeploy: problems.length === 0
  };
}

/** Descriptive, non-secret columns shown when listing conflicting rows. Tokens and secrets are never selected. */
const SAFE_DETAIL_COLUMNS = ["id", "provider", "status", "email_address", "sender_name", "business_name", "phone_number", "created_at", "updated_at", "last_synced_at"];

/**
 * Read-only detail for the problems inspectMigrationState found: the error
 * Prisma recorded for each failed migration, and the actual rows behind each
 * duplicate-key conflict (with the key value they will have after the
 * migration).
 */
export async function problemDetails(prisma, state) {
  const failedLogs = [];
  if (state.failed.length) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name, started_at, logs FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at`
    );
    for (const row of rows) failedLogs.push({ migration: row.migration_name, startedAt: row.started_at, logs: String(row.logs || "").trim() });
  }
  const conflictRows = [];
  for (const conflict of state.indexConflicts) {
    const present = await existingColumns(prisma, conflict.table);
    const detail = SAFE_DETAIL_COLUMNS.filter((column) => present.includes(column)).map((column) => `"${column}"`);
    const keys = conflict.expressions.map((expression, i) => `${expression} AS "key_${conflict.columns[i]}"`);
    const tuple = `(${conflict.expressions.join(", ")})`;
    const groupBy = conflict.expressions.map((_, i) => i + 1).join(", ");
    const rows = await prisma.$queryRawUnsafe(
      `SELECT ${[...keys, ...detail].join(", ")} FROM "${conflict.table}"
       WHERE ${tuple} IN (SELECT ${conflict.expressions.join(", ")} FROM "${conflict.table}" GROUP BY ${groupBy} HAVING COUNT(*) > 1)
       ORDER BY ${groupBy}${detail.includes('"id"') ? ', "id"' : ""} LIMIT 50`
    );
    conflictRows.push({ ...conflict, rows });
  }
  return { failedLogs, conflictRows };
}

/**
 * Turns a Prisma connection/auth error into one actionable paragraph instead
 * of a minified stack trace. Returns null for errors it doesn't recognise.
 */
export function explainDatabaseError(error, url = process.env.DATABASE_URL || "") {
  const message = String(error?.message || error || "");
  const { host, user, database, hasPassword } = describeDatabaseUrl(url);
  if (/Authentication failed|password authentication failed/i.test(message)) {
    return [
      `The database rejected the password for user "${user}" (${host}/${database}).`,
      hasPassword ? "" : "DATABASE_URL has no password in it.",
      "Run `npm run db:env` and type the password as-is. If you copied it out of a URL (for example the Secret Manager value), paste that whole URL at the password prompt instead - its password is already encoded."
    ].filter(Boolean).join("\n");
  }
  if (/database string is invalid|Error parsing connection string|invalid port number/i.test(message)) {
    return [
      "DATABASE_URL could not be parsed.",
      "This almost always means the password contains characters such as  @ : / ? # %  that were not percent-encoded.",
      "Run `npm run db:env` to enter the password and have .env.db written with the correct encoding."
    ].join("\n");
  }
  if (/Can't reach database server|P1001|ECONNREFUSED|connect_timeout|timed out/i.test(message)) {
    return [
      `Could not reach the database through ${host}. Usually one of:`,
      "  - the tunnel is not running: start it with `npm run db:proxy` in another terminal and keep it open;",
      "  - the tunnel is running but your Google sign-in expired since it started (its terminal shows errors):",
      "    press Ctrl+C there, run `gcloud auth login` and `gcloud auth application-default login`, then `npm run db:proxy` again;",
      "  - the tunnel uses a different port: re-run `npm run db:env` with that port."
    ].join("\n");
  }
  if (/database .* does not exist/i.test(message)) {
    return `Database "${database}" does not exist on ${host}. The production database is named "linkly".`;
  }
  if (/must start with the protocol|provider/i.test(message) && /sqlite|postgres|file:/i.test(message)) {
    return "The generated Prisma client targets a different database type. Use the npm run db:* commands, which regenerate it for PostgreSQL first.";
  }
  return null;
}

export function printMigrationAdvice(state, log = console.log) {
  state.warnings.forEach((warning) => log(`  ~ ${warning}`));
  if (state.safeToDeploy) {
    log(state.pending.length
      ? `  -> Safe to apply: npm run db:migrate:deploy  (will run ${state.pending.length}: ${summarize(state.pending)})`
      : "  -> Migration history is up to date. Nothing to apply.");
    return;
  }
  state.problems.forEach((problem) => log(`  ! ${problem}`));
  const unresolvedFailures = state.failed.filter((name) => !state.baselineCandidates.includes(name));
  if (state.baselineCandidates.length) {
    log("");
    log("  Fix: record these as already applied (writes only to _prisma_migrations - no schema or data change):");
    state.baselineCandidates.forEach((name) => log(`       ${name}`));
    log("       npm run db:baseline");
    if (!unresolvedFailures.length && !state.indexConflicts.length && !state.legacyTables.length) {
      log(state.willRun.length
        ? `  Then: npm run db:migrate:deploy  (will run ${state.willRun.length}: ${summarize(state.willRun)})`
        : "  Then nothing else is pending.");
    }
  }
  if (unresolvedFailures.length) {
    log("");
    log(`  Failed migration(s) need a decision first: ${unresolvedFailures.join(", ")}.`);
    log("  Read the error in _prisma_migrations.logs for that row and fix the cause, then mark it for retry:");
    unresolvedFailures.forEach((name) => log(`       npm run db:resolve -- --rolled-back ${name}`));
    log("  and run npm run db:migrate:deploy again.");
  }
}

function summarize(names) {
  return names.length > 4 ? `${names.slice(0, 2).join(", ")} ... ${names.slice(-2).join(", ")}` : names.join(", ");
}
