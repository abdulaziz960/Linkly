import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

// The link-preview picture is a prepared PNG (public/assets/og-image.png), not drawn on the server: the server-side image
// renderer cannot order and space Arabic words correctly. To change the wording, edit scripts/generate-og-image.mjs and run
// `node scripts/generate-og-image.mjs`. This is a plain route (not Next's opengraph-image file convention) so the pages can
// point at a versioned address (?v=N) - chat apps keep the picture they first saw for an address, and a new version forces a refresh.
export async function GET() {
  const image = await readFile(path.join(process.cwd(), "public/assets/og-image.png"));
  return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
