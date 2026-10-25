-- Rolls back 20261025200000_campaign_description_tags (run by hand; Prisma has no automatic down).
ALTER TABLE campaigns DROP COLUMN IF EXISTS description;
ALTER TABLE campaigns DROP COLUMN IF EXISTS tags;
