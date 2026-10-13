ALTER TABLE "admin_logs" ADD COLUMN IF NOT EXISTS "created_at" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "admin_logs_created_at_idx" ON "admin_logs"("created_at");
CREATE INDEX IF NOT EXISTS "admin_logs_client_id_created_at_idx" ON "admin_logs"("client_id", "created_at");
