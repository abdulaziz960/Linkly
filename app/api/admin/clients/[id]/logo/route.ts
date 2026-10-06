import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { getClientLogoDataUrl } from "../../../../../../lib/admin-client-logos";
import { attachmentResponseHeaders, parseDataUrl } from "../../../../../../lib/message-attachments";
import { jsonError } from "../../../../_utils/json";

export const runtime = "nodejs";

/** The client logo as an image, for the admin panel avatars. 404 means use the initial letter. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const dataUrl = await getClientLogoDataUrl(id);
  const parsed = dataUrl ? parseDataUrl(dataUrl) : null;
  if (!parsed) return jsonError("لا يوجد شعار", 404);

  // Same safe-serving rules as chat attachments: only allow-listed image types are shown inline.
  const headers = attachmentResponseHeaders(parsed.mimeType, "logo", parsed.bytes.length);
  headers["Cache-Control"] = "private, max-age=300";
  return new Response(new Uint8Array(parsed.bytes), { status: 200, headers });
}
