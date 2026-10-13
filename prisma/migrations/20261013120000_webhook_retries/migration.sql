CREATE TABLE IF NOT EXISTS "webhook_retries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "next_attempt_at" TEXT NOT NULL,
    "last_status" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "webhook_retries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_retries_status_next_attempt_at_idx" ON "webhook_retries"("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "webhook_retries_webhook_id_idx" ON "webhook_retries"("webhook_id");
