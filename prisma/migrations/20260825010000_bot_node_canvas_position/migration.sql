-- Store free-form canvas coordinates for the auto-reply visual flow editor.
ALTER TABLE "bot_nodes"
  ADD COLUMN IF NOT EXISTS "canvas_x" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bot_nodes"
  ADD COLUMN IF NOT EXISTS "canvas_y" DOUBLE PRECISION NOT NULL DEFAULT 0;
