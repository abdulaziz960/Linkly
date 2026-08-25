-- Track real WhatsApp delivery status (sent/delivered/read/failed) reported
-- back via Meta's webhook status callbacks, instead of only trusting the
-- synchronous "accepted" response from the send API.
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "delivery_status" TEXT NOT NULL DEFAULT '';
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "delivery_error" TEXT NOT NULL DEFAULT '';
