import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getEmployeeForUser, getVisibleAssigneeNames, userHasViewPermission } from "../../../../lib/permissions-server";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { getTenantCompanyName } from "../../../../lib/subscriptions";
import { exportPeriod, loadConversationExport } from "../../../../lib/conversation-export";
import { buildConversationsPrintHtml, buildConversationsWorkbook } from "../../../../lib/conversation-export-files";
import { jsonError } from "../../_utils/json";

export const runtime = "nodejs";

/** GET /api/conversations/export?from=2026-11-01&to=2026-11-07&format=xlsx|pdf&notes=1&attachments=1 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "inbox"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const rateLimit = await consumeRateLimit("conversations-export", requestIdentifier(request, user.id), 6, 60_000);
  if (!rateLimit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const params = request.nextUrl.searchParams;
  const period = exportPeriod(params.get("from"), params.get("to"));
  if ("error" in period) return jsonError(period.error, 400);
  const format = params.get("format") === "xlsx" ? "xlsx" : "pdf";
  const includeNotes = params.get("notes") === "1";
  const includeAttachments = params.get("attachments") === "1";

  const employee = await getEmployeeForUser(user);
  const assigneeNames = await getVisibleAssigneeNames(user, employee);
  const data = await loadConversationExport(user.tenantId, assigneeNames, period, { includeNotes, includeAttachments });
  const name = `conversations-${period.from}_${period.to}`;

  if (format === "xlsx") {
    const buffer = await buildConversationsWorkbook(data, includeAttachments);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
        "Cache-Control": "private, no-store"
      }
    });
  }
  const companyName = (await getTenantCompanyName(user.tenantId)) || "Linkly";
  return new Response(buildConversationsPrintHtml(data, { companyName, withAttachments: includeAttachments, withNotes: includeNotes }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  });
}
