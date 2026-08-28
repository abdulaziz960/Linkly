CREATE TABLE IF NOT EXISTS "tenant_preferences" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "leads_pipeline_enabled" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TEXT NOT NULL
);
