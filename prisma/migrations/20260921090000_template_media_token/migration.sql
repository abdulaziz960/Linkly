-- Public media-serving URL token, decoupled from the template's own
-- predictable id (tmpl-<tenantId>-<name>). See pre-launch audit F-01.
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "media_token" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "templates_media_token_idx" ON "templates"("media_token");
