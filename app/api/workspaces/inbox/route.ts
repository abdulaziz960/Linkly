import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "../../_utils/json";
import { getWorkspaceViewer, resolveScope } from "../../../../lib/workspaces/service";
import { aggregatedConversations, crossProjectConversations } from "../../../../lib/workspaces/inbox";

export const runtime = "nodejs";

/**
 * mode=all    the combined inbox of every project the user belongs to (scope "all"), plus conversations handed to them from other projects.
 * mode=extras only the conversations handed to the user from projects they are not a member of - appended to the normal inbox.
 */
export async function GET(request: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  const mode = new URL(request.url).searchParams.get("mode") === "all" ? "all" : "extras";
  if (mode === "all") {
    if ((await resolveScope(viewer)) !== "all") return jsonError("عرض كل المشاريع غير محدد", 409);
    return jsonOk(await aggregatedConversations(viewer));
  }
  return jsonOk(await crossProjectConversations(viewer));
}
