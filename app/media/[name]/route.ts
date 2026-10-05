import { getCmsImage } from "../../../lib/cms-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves an image uploaded from the admin panel. Names are unique, so it can be cached for a year. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const image = await getCmsImage((await params).name);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
