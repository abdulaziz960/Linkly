CREATE TABLE IF NOT EXISTS "admin_action_logs" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "admin_name" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL DEFAULT '',
    "target_id" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_action_logs_admin_user_id_created_at_idx" ON "admin_action_logs"("admin_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "admin_action_logs_target_type_target_id_idx" ON "admin_action_logs"("target_type", "target_id");
