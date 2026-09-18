// Read-only health check for the production billing tables. Run it through
// `npm run db:check` (which loads .env.db and generates the PostgreSQL Prisma
// client first). Works whether or not the payment-ledger migration
// (20260917090000_payment_ledger_details) has been applied yet: it only
// queries the new columns when they exist. Makes no writes and never prints
// the password.
import {
  explainDatabaseError,
  inspectMigrationState,
  isPostgresUrl,
  ledgerColumnState,
  printMigrationAdvice,
  problemDetails
} from "./db-migration-state.mjs";

if (!isPostgresUrl(process.env.DATABASE_URL)) {
  console.error("Run this with `npm run db:check` (see docs/database-access.md).");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ log: [] });

function section(title) {
  console.log(`\n== ${title}`);
}

function table(rows) {
  if (!rows.length) return console.log("  (none)");
  console.table(rows);
}

const ISO_TIMESTAMP = "'^[0-9]{4}-[0-9]{2}-[0-9]{2}T'";

async function main() {
  section("Connection");
  const [server] = await prisma.$queryRawUnsafe(`SELECT current_user AS "user", current_database() AS database, current_schema() AS schema, current_setting('server_version') AS version`);
  console.log(`  ${server.user}@${server.database} (schema ${server.schema}, PostgreSQL ${server.version})`);

  section("Payment-ledger columns");
  const columns = await ledgerColumnState(prisma);
  let missingTotal = 0;
  for (const [tableName, { missing }] of Object.entries(columns)) {
    missingTotal += missing.length;
    console.log(`  ${tableName}: ${missing.length ? `missing ${missing.join(", ")}` : "ok"}`);
  }
  if (missingTotal) console.log("  (expected until the payment-ledger migration is applied or the new app version has started once)");
  const has = (tableName, column) => columns[tableName].present.includes(column);

  section("Prisma migration history");
  const state = await inspectMigrationState(prisma);
  console.log(`  ${state.managed ? `${state.applied.length} applied` : "no _prisma_migrations table"}, ${state.pending.length} pending of ${state.local.length} in prisma/migrations`);
  if (state.applied.length) console.log(`  latest applied: ${state.applied[state.applied.length - 1]}`);
  if (state.pending.length) console.log(`  pending: ${state.pending.length > 6 ? `${state.pending.slice(0, 3).join(", ")} ... ${state.pending.slice(-2).join(", ")}` : state.pending.join(", ")}`);
  printMigrationAdvice(state);

  const details = await problemDetails(prisma, state);
  for (const failure of details.failedLogs) {
    section(`Why ${failure.migration} failed (from _prisma_migrations.logs)`);
    const lines = failure.logs.split("\n").filter((line) => line.trim() && !/^\s*at\s/.test(line));
    console.log(lines.length ? lines.slice(0, 12).map((line) => `  ${line.slice(0, 220)}`).join("\n") : "  (no log recorded)");
  }
  for (const conflict of details.conflictRows) {
    section(`Rows blocking unique index ${conflict.index} (${conflict.table}; key_* = value after the migration)`);
    table(conflict.rows);
  }

  section("Plans");
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, monthlyPrice: true, employeeLimit: true, active: true } });
  table(plans.map((plan) => ({ id: plan.id, name: plan.name, monthlyPriceSar: plan.monthlyPrice, employeeLimit: plan.employeeLimit, active: plan.active })));

  section("Subscriptions by status");
  const subscriptions = await prisma.subscription.findMany({ select: { status: true, renewalAt: true } });
  const now = Date.now();
  const summary = {};
  for (const subscription of subscriptions) {
    const paidThrough = subscription.renewalAt ? new Date(subscription.renewalAt).getTime() : Number.NaN;
    const overdue = subscription.status === "نشط" && Number.isFinite(paidThrough) && paidThrough < now;
    const key = overdue ? `${subscription.status} (overdue)` : subscription.status;
    summary[key] = (summary[key] || 0) + 1;
  }
  table(Object.entries(summary).map(([status, count]) => ({ status, count })));

  const gatewayExpr = (tableName) => (has(tableName, "gateway") ? `COALESCE(NULLIF(gateway, ''), '(unset)')` : `'(column missing)'`);

  section("Subscription payments by status / gateway");
  const subscriptionPayments = await prisma.$queryRawUnsafe(
    `SELECT status, ${gatewayExpr("subscription_payments")} AS gateway, COUNT(*)::bigint AS n, COALESCE(SUM(amount), 0)::float8 AS total
     FROM subscription_payments GROUP BY 1, 2 ORDER BY 1, 2`
  );
  table(subscriptionPayments.map((row) => ({ status: row.status, gateway: row.gateway, count: Number(row.n), totalSar: row.total })));

  section("Campaign top-up payments by status / gateway");
  const campaignPayments = await prisma.$queryRawUnsafe(
    `SELECT status, ${gatewayExpr("campaign_payments")} AS gateway, COUNT(*)::bigint AS n, COALESCE(SUM(amount), 0)::float8 AS total, COALESCE(SUM(messages), 0)::bigint AS messages
     FROM campaign_payments GROUP BY 1, 2 ORDER BY 1, 2`
  );
  table(campaignPayments.map((row) => ({ status: row.status, gateway: row.gateway, count: Number(row.n), totalSar: row.total, messages: Number(row.messages) })));

  section("Pending payments older than 1 hour (the cron reconciler re-checks these after 24 hours)");
  const cutoff = new Date(now - 60 * 60 * 1000).toISOString();
  const stale = await prisma.$queryRawUnsafe(
    `SELECT 'subscription' AS kind, id, tenant_id, amount::float8 AS amount, moyasar_id, created_at FROM subscription_payments WHERE status = 'قيد الانتظار' AND created_at < $1
     UNION ALL
     SELECT 'campaign_topup', id, tenant_id, amount::float8, moyasar_id, created_at FROM campaign_payments WHERE status = 'قيد الانتظار' AND created_at < $1
     ORDER BY created_at DESC LIMIT 20`,
    cutoff
  );
  table(stale.map((row) => ({ kind: row.kind, id: row.id, tenantId: row.tenant_id, amountSar: row.amount, moyasarId: row.moyasar_id, createdAt: row.created_at })));

  section("Latest 10 completed subscription payments");
  const ledger = has("subscription_payments", "period_start")
    ? `COALESCE(NULLIF(gateway, ''), '(unset)') AS gateway, payment_method AS method, CASE WHEN period_start <> '' THEN period_start || ' -> ' || period_end ELSE '' END AS period`
    : `'(column missing)' AS gateway, '' AS method, '' AS period`;
  const latest = await prisma.$queryRawUnsafe(
    `SELECT id, tenant_id, amount::float8 AS amount, plan_name, ${ledger}, completed_at
     FROM subscription_payments WHERE status = 'مكتمل'
     ORDER BY (completed_at ~ ${ISO_TIMESTAMP}) DESC, completed_at DESC LIMIT 10`
  );
  table(latest.map((row) => ({ id: row.id, tenantId: row.tenant_id, amountSar: row.amount, plan: row.plan_name, gateway: row.gateway, method: row.method, period: row.period, completedAt: row.completed_at })));

  console.log("\nDone. No changes were made.");
}

try {
  await main();
} catch (error) {
  const explanation = explainDatabaseError(error);
  console.error(`\n${explanation || `db:check failed: ${String(error?.message || error).trim()}`}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
