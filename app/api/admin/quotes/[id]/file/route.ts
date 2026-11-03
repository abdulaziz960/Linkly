import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { getQuoteFile } from "../../../../../../lib/quotes/store";
import { jsonError } from "../../../../_utils/json";

export const runtime = "nodejs";

/** The uploaded quotation's PDF, for the platform team only. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const file = await getQuoteFile((await params).id);
  if (!file) return jsonError("الملف غير موجود", 404);
  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
