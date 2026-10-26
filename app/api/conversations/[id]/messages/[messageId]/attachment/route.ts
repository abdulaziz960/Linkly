import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../../lib/auth";
import { prisma } from "../../../../../../../lib/prisma";
import { getEmployeeForUser, getVisibleAssigneeNames } from "../../../../../../../lib/permissions-server";
import { attachmentResponseHeaders, isInlineDataUrl, parseDataUrl } from "../../../../../../../lib/message-attachments";
import { jsonError } from "../../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const DELETED_MESSAGE_TEXT = "تم حذف هذه الرسالة";

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, messageId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  // Same visibility rule as the conversation list: the workspace, and for
  // non-owners only the conversations assigned to them (or their team).
  const assigneeNames = await getVisibleAssigneeNames(user, await getEmployeeForUser(user));
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversationId: id,
      conversation: { tenantId: user.tenantId, ...(assigneeNames ? { assignee: { in: assigneeNames } } : {}) }
    },
    select: { text: true, attachmentUrl: true, attachmentName: true, attachmentMime: true }
  });
  if (!message || message.text === DELETED_MESSAGE_TEXT || !isInlineDataUrl(message.attachmentUrl)) return jsonError("المرفق غير موجود", 404);

  const parsed = parseDataUrl(message.attachmentUrl);
  if (!parsed) return jsonError("المرفق غير موجود", 404);

  const mimeType = (message.attachmentMime || parsed.mimeType || "").toLowerCase();
  const headers = attachmentResponseHeaders(mimeType, message.attachmentName || "attachment", parsed.bytes.length);
  headers["Accept-Ranges"] = "bytes";
  // Video players (Safari above all) ask for the file in byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const total = parsed.bytes.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start >= total || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const slice = parsed.bytes.subarray(start, end + 1);
    return new Response(new Uint8Array(slice), { status: 206, headers: { ...headers, "Content-Length": String(slice.length), "Content-Range": `bytes ${start}-${end}/${total}` } });
  }
  return new Response(new Uint8Array(parsed.bytes), { status: 200, headers });
}
