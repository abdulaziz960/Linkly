import { prisma } from "./prisma";

// admin_logs used to have only a human-readable, locale-formatted "at" text and
// random ids, so "the newest rows" could not be asked of the database - every
// reader loaded the whole table and sorted it in memory. created_at holds an ISO
// timestamp (sortable as text) and is indexed. Rows written before it existed
// keep '' and sort as oldest.
//
// Additive and idempotent: information_schema / PRAGMA is consulted first so a
// start-up never takes an ACCESS EXCLUSIVE lock for a column that is there.
const isPostgres = () =>
  process.env.DATABASE_URL?.startsWith("postgres://") || process.env.DATABASE_URL?.startsWith("postgresql://");

export const ADMIN_LOGS_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS admin_logs_created_at_idx ON admin_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS admin_logs_client_id_created_at_idx ON admin_logs(client_id, created_at)`
];

async function hasCreatedAtColumn() {
  if (isPostgres()) {
    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'admin_logs' AND column_name = 'created_at'`
    );
    return rows.length > 0;
  }
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(admin_logs)`);
  return columns.some((column) => column.name === "created_at");
}

export async function ensureAdminLogsSchema() {
  try {
    if (!(await hasCreatedAtColumn())) {
      await prisma.$executeRawUnsafe(`ALTER TABLE admin_logs ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`);
    }
    for (const statement of ADMIN_LOGS_INDEX_STATEMENTS) await prisma.$executeRawUnsafe(statement);
  } catch (error) {
    console.error("[schema] admin_logs migration failed", error);
  }
}
