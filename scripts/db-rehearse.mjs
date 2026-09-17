// Dry run of a production migration on a throwaway local PostgreSQL that has
// production's exact STRUCTURE - without copying any customer data.
//
//   npm run db:rehearse -- --sql "UPDATE email_integrations SET ... WHERE ..."
//
// 1. Reads from production (read-only): the schema (tables, columns,
//    indexes, defaults), _prisma_migrations, the id/tenant/provider keys of
//    integration_settings and email_integrations (the only rows the pending
//    migrations' unique indexes and back-fills depend on), and table sizes.
// 2. Starts a temporary local PostgreSQL (127.0.0.1 only, random port) and
//    rebuilds that structure and those rows.
// 3. Runs your plan there, in the same order you would in production:
//    each --sql statement, then `migrate resolve --rolled-back` for every
//    failed migration, then the safety guard, then `prisma migrate deploy`.
// 4. Reports PASS/FAIL and deletes the temporary database.
//
// Production is never written to. Needs initdb, pg_ctl and psql on PATH
// (brew install postgresql@16 or newer).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePrismaSchema } from "./prisma-schema.mjs";
import { runPrisma } from "./prisma-cli.mjs";
import { explainDatabaseError, inspectMigrationState, ledgerColumnState, printMigrationAdvice } from "./db-migration-state.mjs";

const { provider, schemaPath } = writePrismaSchema();
if (provider !== "postgresql" || process.env.LINKLY_POSTGRES_CLIENT_READY !== "1") {
  console.error("Run this with `npm run db:rehearse` (see docs/database-access.md).");
  process.exit(1);
}

const args = process.argv.slice(2);
const statements = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--sql" && args[i + 1]) statements.push(args[(i += 1)]);
  else if (args[i] === "--sql-file" && args[i + 1]) statements.push(readFileSync(args[(i += 1)], "utf8"));
  else {
    console.error(`Unknown argument: ${args[i]}\nusage: npm run db:rehearse -- [--sql "<statement>"]... [--sql-file <path>]...`);
    process.exit(2);
  }
}

for (const tool of ["initdb", "pg_ctl", "psql"]) {
  if (spawnSync("sh", ["-c", `command -v ${tool}`]).status !== 0) {
    console.error(`${tool} was not found. Install PostgreSQL client and server tools first (brew install postgresql@16).`);
    process.exit(1);
  }
}

const productionUrl = process.env.DATABASE_URL;
const work = mkdtempSync(join(tmpdir(), "linkly-rehearsal-"));
const quiet = { encoding: "utf8" };
let localStarted = false;
let exitCode = 1;

// Ctrl+C: stop at the next step boundary and still remove the temporary
// database (the finally block below), instead of dying and leaving it running.
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    interrupted = true;
  });
}

function step(title) {
  if (interrupted) throw new Error("Interrupted.");
  console.log(`\n== ${title}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

const { PrismaClient } = await import("@prisma/client");

try {
  // ---- 1. read production (read-only) -----------------------------------
  step("Reading production structure (read-only, no customer data)");
  const schemaFile = join(work, "schema.sql");
  const diff = runPrisma(["migrate", "diff", "--from-empty", "--to-schema-datasource", schemaPath, "--script", "--output", schemaFile], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (diff.status !== 0 || !existsSync(schemaFile)) {
    const output = `${diff.stdout || ""}\n${diff.stderr || ""}`;
    throw new Error(explainDatabaseError(output, productionUrl) || `Could not read the production schema: ${output.trim().slice(-600)}`);
  }

  const production = new PrismaClient({ log: [] });
  let history;
  let keyRows;
  let sizes;
  try {
    history = await production.$queryRawUnsafe(`SELECT id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at`);
    keyRows = {
      integration_settings: await production.$queryRawUnsafe(`SELECT id, tenant_id, provider, status FROM integration_settings`),
      email_integrations: await production.$queryRawUnsafe(`SELECT id, tenant_id, provider, status FROM email_integrations`)
    };
    sizes = await production.$queryRawUnsafe(
      `SELECT c.relname AS name, GREATEST(c.reltuples, 0)::bigint AS approx_rows, pg_total_relation_size(c.oid)::bigint AS bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = current_schema() AND c.relkind = 'r' ORDER BY 3 DESC LIMIT 8`
    );
  } finally {
    await production.$disconnect();
  }
  console.log(`  ${history.length} migration record(s), ${keyRows.integration_settings.length} integration and ${keyRows.email_integrations.length} email integration key row(s)`);
  console.log(`  largest tables: ${sizes.map((row) => `${row.name} ~${Number(row.approx_rows)} rows (${Math.round(Number(row.bytes) / 1024)} KB)`).join(", ")}`);

  // ---- 2. local copy of the structure -----------------------------------
  step("Building a temporary local copy of that structure");
  const port = await freePort();
  const dataDir = join(work, "pgdata");
  const pgEnv = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "rehearsal", PGDATABASE: "rehearsal" };
  delete pgEnv.PGPASSWORD;
  if (spawnSync("initdb", ["-D", dataDir, "-U", "rehearsal", "--auth=trust", "-E", "UTF8"], quiet).status !== 0) throw new Error("initdb failed");
  const started = spawnSync("pg_ctl", ["-D", dataDir, "-l", join(work, "pg.log"), "-w", "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, "start"], quiet);
  if (started.status !== 0) throw new Error(`Could not start the temporary PostgreSQL: ${started.stderr || started.stdout}`);
  localStarted = true;
  const psql = (sqlArgs) => spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres", ...sqlArgs], { ...quiet, env: pgEnv });
  if (psql(["-c", "CREATE DATABASE rehearsal"]).status !== 0) throw new Error("Could not create the temporary database");
  const runSql = (sql, label) => {
    const file = join(work, `${label}.sql`);
    writeFileSync(file, sql);
    const result = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { ...quiet, env: pgEnv });
    if (result.status !== 0) throw new Error(`${label} failed: ${(result.stderr || "").trim()}`);
    return result;
  };
  runSql(readFileSync(schemaFile, "utf8"), "schema");
  runSql(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0);`, "history-table");
  if (history.length) {
    runSql(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES\n${history
        .map((row) => `(${[row.id, row.checksum, row.finished_at, row.migration_name, row.logs, row.rolled_back_at, row.started_at, Number(row.applied_steps_count)].map(sqlLiteral).join(", ")})`)
        .join(",\n")};`,
      "history-rows"
    );
  }

  const localUrl = `postgresql://rehearsal@127.0.0.1:${port}/rehearsal`;
  const local = new PrismaClient({ log: [], datasourceUrl: localUrl });
  try {
    for (const [tableName, rows] of Object.entries(keyRows)) {
      if (!rows.length) continue;
      const required = await local.$queryRawUnsafe(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1 AND is_nullable = 'NO' AND column_default IS NULL`,
        tableName
      );
      const filler = required.filter((column) => !["id", "tenant_id", "provider", "status"].includes(column.column_name));
      const presentColumns = (await local.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, tableName)).map((column) => column.column_name);
      const keyColumns = ["id", "tenant_id", "provider", "status"].filter((column) => presentColumns.includes(column));
      const columns = [...keyColumns, ...filler.map((column) => column.column_name)];
      const fill = (type) => (/int|numeric|double|real/.test(type) ? "0" : /timestamp|date/.test(type) ? "now()" : /bool/.test(type) ? "false" : "''");
      const values = rows.map((row) => `(${[...keyColumns.map((column) => sqlLiteral(row[column])), ...filler.map((column) => fill(column.data_type))].join(", ")})`);
      runSql(`INSERT INTO "${tableName}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES\n${values.join(",\n")};`, `${tableName}-rows`);
    }
    console.log(`  temporary database ready on 127.0.0.1:${port}`);

    // ---- 3. the plan -------------------------------------------------------
    const localEnv = { ...process.env, DATABASE_URL: localUrl };
    statements.forEach((statement, index) => {
      step(`Your SQL #${index + 1}`);
      const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-c", statement], { ...quiet, env: pgEnv });
      process.stdout.write(`  ${(result.stdout || "").trim()}\n`);
      if (result.status !== 0) throw new Error(`SQL #${index + 1} failed: ${(result.stderr || "").trim()}`);
    });

    let state = await inspectMigrationState(local);
    for (const name of state.failed) {
      step(`npm run db:resolve -- --rolled-back ${name}`);
      const resolved = runPrisma(["migrate", "resolve", "--rolled-back", name, "--schema", schemaPath], { env: localEnv, stdio: ["ignore", "ignore", "inherit"] });
      if (resolved.status !== 0) throw new Error(`Could not mark ${name} as rolled back`);
      console.log("  marked as rolled back");
    }

    step("npm run db:check (safety verdict)");
    state = await inspectMigrationState(local);
    printMigrationAdvice(state);
    if (!state.safeToDeploy) {
      console.log("\nFAIL: the guard would refuse to deploy. Fix the problems above (add the fix as --sql) and rehearse again.");
      exitCode = 1;
    } else if (!state.pending.length) {
      console.log("\nPASS: nothing to apply.");
      exitCode = 0;
    } else {
      step(`npm run db:migrate:deploy (${state.pending.length} migration(s))`);
      const startedAt = Date.now();
      const deployed = runPrisma(["migrate", "deploy", "--schema", schemaPath], { env: localEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      const output = `${deployed.stdout || ""}\n${deployed.stderr || ""}`;
      if (deployed.status !== 0) {
        const reason = output.split("\n").filter((line) => /ERROR|DETAIL|Migration name|P30\d\d/.test(line)).slice(0, 6).join("\n  ");
        console.log(`  failed after ${seconds}s:\n  ${reason || output.trim().slice(-800)}`);
        console.log("\nFAIL: this plan would stop part-way in production. Nothing was changed there.");
        exitCode = 1;
      } else {
        console.log(`  all ${state.pending.length} applied in ${seconds}s`);
        const after = await inspectMigrationState(local);
        const ledger = await ledgerColumnState(local);
        const missing = Object.values(ledger).reduce((sum, table) => sum + table.missing.length, 0);
        if (after.pending.length || after.failed.length || missing) {
          console.log(`\nFAIL: after deploying, ${after.pending.length} pending, ${after.failed.length} failed, ${missing} ledger column(s) missing.`);
          exitCode = 1;
        } else {
          console.log("\nPASS: on production's structure this plan applies cleanly. Run the same steps against production at a quiet time.");
          exitCode = 0;
        }
      }
    }
  } finally {
    await local.$disconnect().catch(() => {});
  }
} catch (error) {
  const explanation = interrupted ? "Interrupted." : explainDatabaseError(error, productionUrl);
  console.error(`\nRehearsal could not complete: ${explanation || String(error?.message || error).trim()}`);
  exitCode = 1;
} finally {
  if (localStarted) spawnSync("pg_ctl", ["-D", join(work, "pgdata"), "-m", "fast", "stop"], quiet);
  rmSync(work, { recursive: true, force: true });
  console.log("\nTemporary database removed. Production was not modified.");
}

process.exit(interrupted ? 130 : exitCode);
