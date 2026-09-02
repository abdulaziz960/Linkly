-- Lets a campaign attach its own header image/video per send, rather than
-- being permanently stuck with whatever media the template was saved with -
-- WhatsApp templates fix the header *format* (image/video/document) at
-- approval time, but the actual media content is meant to vary per send.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "header_media_data_url" TEXT NOT NULL DEFAULT '';
