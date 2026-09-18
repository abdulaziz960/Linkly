// Wrapped `prisma migrate resolve` for the production database, so recovery
// never requires exporting the production URL in a shell (which would also
// point `npm run dev` at production) or hand-regenerating the schema.
//
//   npm run db:resolve -- --rolled-back 20260917090000_payment_ledger_details
//   npm run db:resolve -- --applied     20260917090000_payment_ledger_details
//
// --applied accepts only migrations present in prisma/migrations.
// --rolled-back also accepts any migration recorded as FAILED in
// _prisma_migrations (e.g. one renamed or removed after it failed), since
// Prisma needs no local folder to roll a failed record back.
import { writePrismaSchema } from "./prisma-schema.mjs";
import { runPrisma } from "./prisma-cli.mjs";
import { describeDatabaseUrl, explainDatabaseError, listMigrations, sourceMigrationsDir } from "./db-migration-state.mjs";

const { provider, schemaPath } = writePrismaSchema();
if (provider !== "postgresql" || process.env.LINKLY_POSTGRES_CLIENT_READY !== "1") {
  console.error("Run this with `npm run db:resolve -- --rolled-back <migration>` (see docs/database-access.md).");
  process.exit(1);
}

const args = process.argv.slice(2);
const [mode, name] = args;
if (args.length !== 2 || !["--rolled-back", "--applied"].includes(mode) || !/^[A-Za-z0-9_-]+$/.test(name || "")) {
  console.error("usage: npm run db:resolve -- --rolled-back <migration>   (or --applied <migration>)");
  process.exit(2);
}

const isLocal = listMigrations(sourceMigrationsDir).includes(name);
let isFailedRecord = false;
if (!isLocal && mode === "--rolled-back") {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ log: [] });
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS n FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`,
      name
    );
    isFailedRecord = Number(rows[0]?.n ?? 0) > 0;
  } catch (error) {
    console.error(explainDatabaseError(error) || `Could not read _prisma_migrations: ${String(error?.message || error).trim()}`);
    process.exit(1);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

if (!isLocal && !isFailedRecord) {
  console.error(mode === "--applied"
    ? `Unknown migration "${name}". --applied only accepts a folder name under prisma/migrations.`
    : `"${name}" is neither a folder under prisma/migrations nor a failed record in _prisma_migrations.`);
  process.exit(2);
}

const { host, database } = describeDatabaseUrl(process.env.DATABASE_URL);
console.log(`Marking ${name} as ${mode === "--applied" ? "applied" : "rolled back"} on ${host}/${database} (writes only _prisma_migrations).`);
const result = runPrisma(["migrate", "resolve", mode, name, "--schema", schemaPath]);
if (result.status === 0) console.log("Done. Next: npm run db:check");
process.exit(result.status ?? 1);
