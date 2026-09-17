// Records the migrations that must NOT be executed against this database as
// "applied" in _prisma_migrations (the historical baseline, when Linkly's
// tables already exist, and any migration that would drop a live table), so
// `prisma migrate deploy` runs everything else. Writes nothing but
// _prisma_migrations rows; no tables, columns or data change. Asks for
// confirmation unless --yes is passed.
//
//   npm run db:baseline
import { askLine } from "./prompt.mjs";
import { writePrismaSchema } from "./prisma-schema.mjs";
import { runPrisma } from "./prisma-cli.mjs";
import { describeDatabaseUrl, explainDatabaseError, inspectMigrationState, printMigrationAdvice } from "./db-migration-state.mjs";

const { provider, schemaPath } = writePrismaSchema();
if (provider !== "postgresql" || process.env.LINKLY_POSTGRES_CLIENT_READY !== "1") {
  console.error("Run this with `npm run db:baseline` (see docs/database-access.md).");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const client = new PrismaClient({ log: [] });
let state;
try {
  state = await inspectMigrationState(client);
} catch (error) {
  console.error(explainDatabaseError(error) || `Could not inspect the database: ${String(error?.message || error).trim()}`);
  process.exit(1);
} finally {
  await client.$disconnect().catch(() => {});
}

if (!state.baselineCandidates.length) {
  console.log("Nothing to baseline.");
  printMigrationAdvice(state);
  process.exit(0);
}

const { host, database } = describeDatabaseUrl(process.env.DATABASE_URL);
console.log(`\nThese migrations will be recorded as already applied on ${host}/${database}, and will NOT be executed:`);
state.baselineCandidates.forEach((name) => console.log(`  ${name}`));
console.log("Only _prisma_migrations is written. No tables, columns or rows change.\n");

if (!process.argv.includes("--yes")) {
  const answer = await askLine('Type "baseline" to continue: ');
  if (answer !== "baseline") {
    console.log("Cancelled. Nothing was written.");
    process.exit(1);
  }
}

for (const name of state.baselineCandidates) {
  const result = runPrisma(["migrate", "resolve", "--applied", name, "--schema", schemaPath]);
  if (result.status !== 0) {
    console.error(`Stopped: could not mark ${name} as applied. Earlier ones in the list were recorded.`);
    process.exit(result.status ?? 1);
  }
}

console.log(state.willRun.length
  ? `\nDone. Next: npm run db:check, then npm run db:migrate:deploy  (will run ${state.willRun.length} migration(s))`
  : "\nDone. Nothing else is pending.");
