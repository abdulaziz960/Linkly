import { prisma } from "./prisma";

// Defence in depth for tenant isolation: a conversation may only point at a
// customer of its own tenant. The application derives customer ids from the
// tenant and checks ownership where a client supplies one, but the database
// itself had no constraint, so any future slip would silently link two
// tenants' data (prelaunch audit AUD-10).
//
// Triggers rather than a foreign key because the tables carry no relations
// (see DB-02) and a constraint cannot be added blind to a production table
// that may hold old inconsistent rows. The triggers only look at rows being
// inserted, or whose customer / tenant is being changed, so existing rows and
// ordinary updates (last message, status...) are never touched. A customer
// that does not exist yet is allowed.
const isPostgres = () =>
  process.env.DATABASE_URL?.startsWith("postgres://") || process.env.DATABASE_URL?.startsWith("postgresql://");

const MESSAGE = "conversation customer belongs to another tenant";

export const SQLITE_TENANT_INTEGRITY_STATEMENTS = [
  `CREATE TRIGGER IF NOT EXISTS conversations_customer_same_tenant_insert
   BEFORE INSERT ON conversations
   WHEN EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND tenant_id <> NEW.tenant_id)
   BEGIN SELECT RAISE(ABORT, '${MESSAGE}'); END`,
  `CREATE TRIGGER IF NOT EXISTS conversations_customer_same_tenant_update
   BEFORE UPDATE OF customer_id, tenant_id ON conversations
   WHEN (NEW.customer_id <> OLD.customer_id OR NEW.tenant_id <> OLD.tenant_id)
     AND EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND tenant_id <> NEW.tenant_id)
   BEGIN SELECT RAISE(ABORT, '${MESSAGE}'); END`
];

const POSTGRES_FUNCTION = `CREATE OR REPLACE FUNCTION linkly_conversation_customer_same_tenant() RETURNS trigger AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND tenant_id <> NEW.tenant_id) THEN
    RAISE EXCEPTION '${MESSAGE}' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql`;

const POSTGRES_TRIGGERS: Array<{ name: string; statement: string }> = [
  {
    name: "conversations_customer_same_tenant_insert",
    statement: `CREATE TRIGGER conversations_customer_same_tenant_insert BEFORE INSERT ON conversations
      FOR EACH ROW EXECUTE FUNCTION linkly_conversation_customer_same_tenant()`
  },
  {
    name: "conversations_customer_same_tenant_update",
    statement: `CREATE TRIGGER conversations_customer_same_tenant_update BEFORE UPDATE OF customer_id, tenant_id ON conversations
      FOR EACH ROW WHEN (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
      EXECUTE FUNCTION linkly_conversation_customer_same_tenant()`
  }
];

export async function ensureTenantIntegritySchema() {
  try {
    if (!isPostgres()) {
      for (const statement of SQLITE_TENANT_INTEGRITY_STATEMENTS) await prisma.$executeRawUnsafe(statement);
      return;
    }
    // Look first: CREATE/DROP TRIGGER takes a table lock, which a start-up must not do needlessly.
    const existing = await prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('conversations_customer_same_tenant_insert', 'conversations_customer_same_tenant_update')`
    );
    const present = new Set(existing.map((row) => row.tgname));
    if (present.size === POSTGRES_TRIGGERS.length) return;
    await prisma.$executeRawUnsafe(POSTGRES_FUNCTION);
    for (const trigger of POSTGRES_TRIGGERS) {
      if (!present.has(trigger.name)) await prisma.$executeRawUnsafe(trigger.statement);
    }
  } catch (error) {
    console.error("[schema] tenant integrity triggers failed", error);
  }
}
