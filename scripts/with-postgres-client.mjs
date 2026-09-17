// Runs a database maintenance script against a PostgreSQL DATABASE_URL with
// a Prisma client generated for PostgreSQL, then puts back the client your
// local env files imply (normally SQLite) so `npm test` and `npm run dev`
// keep working afterwards. Exits with the wrapped script's exit code (130 if
// interrupted, non-zero if the local client could not be restored).
//
//   node --env-file-if-exists=.env.db scripts/with-postgres-client.mjs scripts/db-payments-check.mjs
//
// DATABASE_URL comes from .env.db (git-ignored; see `npm run db:env`), or
// from the command line for one-off use. Never from .env / .env.local.
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describeDatabaseUrl, isPostgresUrl, root } from "./db-migration-state.mjs";

// Installed first, before anything slow runs, so an interruption at any
// point still reaches the restore step below. Ctrl+C is delivered by the
// terminal to the whole process group (the wrapped script receives it
// directly); SIGTERM/SIGHUP sent to this wrapper alone are forwarded.
let interrupted = false;
let child = null;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    interrupted = true;
    if (child && signal !== "SIGINT") child.kill(signal);
  });
}

const yieldToSignals = () => new Promise((resolve) => setImmediate(resolve));

const [target, ...targetArgs] = process.argv.slice(2);
if (!target) {
  console.error("usage: with-postgres-client.mjs <script.mjs> [args...]");
  process.exit(2);
}

const url = process.env.DATABASE_URL || "";
if (!isPostgresUrl(url)) {
  console.error(url
    ? "DATABASE_URL is not a postgresql:// URL. These commands only work against the production PostgreSQL database."
    : "No database configured. Run `npm run db:env` once - it stores the connection in the git-ignored .env.db.");
  console.error("See docs/database-access.md.");
  process.exit(1);
}

const { host, database, user } = describeDatabaseUrl(url);
console.log(`Database: ${user}@${host}/${database}`);

function generate(env) {
  return spawnSync(process.execPath, [join(root, "scripts", "prisma-generate.mjs")], { cwd: root, env, encoding: "utf8" });
}

function restoreLocalClient() {
  // Regenerate without the production URL so the provider follows the local
  // .env / .env.local (or SQLite when they don't set one).
  const localEnv = { ...process.env };
  delete localEnv.DATABASE_URL;
  const restored = generate(localEnv);
  if (restored.status !== 0) {
    console.error("Warning: could not restore the local Prisma client. Run `node scripts/prisma-generate.mjs` before `npm test`.");
    return false;
  }
  return true;
}

async function finish(code) {
  const restored = restoreLocalClient();
  await yieldToSignals();
  if (interrupted) {
    console.error("\nInterrupted.");
    process.exit(130);
  }
  process.exit(code !== 0 ? code : restored ? 0 : 1);
}

const generated = generate(process.env);
await yieldToSignals();
if (interrupted || generated.status !== 0) {
  if (!interrupted) {
    process.stderr.write(generated.stdout || "");
    process.stderr.write(generated.stderr || "");
    console.error("Could not generate the PostgreSQL Prisma client.");
  }
  await finish(generated.status || 1);
}

const code = await new Promise((resolve) => {
  child = spawn(process.execPath, [join(root, target), ...targetArgs], {
    cwd: root,
    env: { ...process.env, LINKLY_POSTGRES_CLIENT_READY: "1" },
    stdio: "inherit"
  });
  child.on("error", (error) => {
    console.error(`Could not start ${target}: ${error.message}`);
    resolve(1);
  });
  child.on("exit", (status, signal) => {
    if (signal) interrupted = true;
    resolve(status ?? 1);
  });
});
child = null;

await finish(code);
