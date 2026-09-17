import { askLine } from "./prompt.mjs";
import { writePrismaSchema } from "./prisma-schema.mjs";
import { runPrisma } from "./prisma-cli.mjs";
import { describeDatabaseUrl, explainDatabaseError, inspectMigrationState, printMigrationAdvice } from "./db-migration-state.mjs";

const { provider, schemaPath } = writePrismaSchema();

if (provider !== "postgresql") {
  console.error(`Production migrations require PostgreSQL; received ${provider}`);
  process.exit(1);
}

// Safety guard: refuse to run against a database where `migrate deploy`
// would fail half-way or drop live data (see scripts/db-migration-state.mjs).
// It can only be skipped with an explicit command-line flag plus a typed
// confirmation - never through an environment variable, which could be left
// behind in an env file and silently disable the guard later.
const skipGuard = process.argv.includes("--skip-guard");

if (skipGuard) {
  const { host, database } = describeDatabaseUrl(process.env.DATABASE_URL);
  console.error(`\nWARNING: running prisma migrate deploy on ${host}/${database} WITHOUT the safety guard.`);
  const answer = await askLine(`Type the database name (${database}) to continue: `);
  if (answer !== database) {
    console.error("Cancelled. Nothing was run.");
    process.exit(1);
  }
} else {
  if (process.env.LINKLY_POSTGRES_CLIENT_READY !== "1") {
    const generated = runPrisma(["generate", "--schema", schemaPath]);
    if (generated.status !== 0) process.exit(generated.status ?? 1);
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

  if (!state.safeToDeploy) {
    console.error("\nRefusing to run `prisma migrate deploy` against this database:\n");
    printMigrationAdvice(state, console.error);
    process.exit(1);
  }
  state.warnings.forEach((warning) => console.log(`~ ${warning}`));
  if (!state.pending.length) {
    console.log("No pending migrations. Nothing to do.");
    process.exit(0);
  }
  console.log(`Applying ${state.pending.length} migration(s): ${state.pending.join(", ")}`);
}

const result = runPrisma(["migrate", "deploy", "--schema", schemaPath]);
if (result.status !== 0) {
  console.error("\nprisma migrate deploy failed. Run `npm run db:check` to see which migration failed and how to resolve it.");
}
process.exit(result.status ?? 1);
