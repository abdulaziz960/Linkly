-- A conversation may only point at a customer of its own tenant (prelaunch
-- audit AUD-10). Triggers, not a foreign key: they act only on rows being
-- inserted or whose customer / tenant changes, so existing rows are untouched.
CREATE OR REPLACE FUNCTION linkly_conversation_customer_same_tenant() RETURNS trigger AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND tenant_id <> NEW.tenant_id) THEN
    RAISE EXCEPTION 'conversation customer belongs to another tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'conversations_customer_same_tenant_insert' AND NOT tgisinternal) THEN
    CREATE TRIGGER conversations_customer_same_tenant_insert BEFORE INSERT ON conversations
      FOR EACH ROW EXECUTE FUNCTION linkly_conversation_customer_same_tenant();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'conversations_customer_same_tenant_update' AND NOT tgisinternal) THEN
    CREATE TRIGGER conversations_customer_same_tenant_update BEFORE UPDATE OF customer_id, tenant_id ON conversations
      FOR EACH ROW WHEN (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
      EXECUTE FUNCTION linkly_conversation_customer_same_tenant();
  END IF;
END
$do$;
