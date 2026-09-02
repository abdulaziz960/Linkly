-- Store the actual header image/video data (not just Meta's one-time upload
-- handle) so campaign sends can reference a stable, our-own-domain URL that
-- Meta can re-fetch for every send, instead of only at template creation.
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "header_media_data_url" TEXT NOT NULL DEFAULT '';
