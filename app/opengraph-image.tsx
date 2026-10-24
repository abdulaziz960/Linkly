import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "Linkly — صندوق موحد لمحادثات العملاء";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The link-preview picture is a prepared PNG (public/assets/og-image.png), not drawn on the server: the server-side image
// renderer cannot order and space Arabic words correctly. To change the wording, edit scripts/generate-og-image.mjs and
// run `node scripts/generate-og-image.mjs`.
export default async function OpenGraphImage() {
  const image = await readFile(path.join(process.cwd(), "public/assets/og-image.png"));
  return new Response(new Uint8Array(image), { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" } });
}
