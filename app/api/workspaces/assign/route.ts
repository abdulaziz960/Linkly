import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "../../_utils/json";
import { getWorkspaceViewer } from "../../../../lib/workspaces/service";
import { assignAcrossProjects, AssignError } from "../../../../lib/workspaces/assign";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  const body = (await request.json().catch(() => ({}))) as { conversationId?: string; employeeId?: string | null };
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  if (!conversationId) return jsonError("المحادثة مطلوبة");
  const employeeId = typeof body.employeeId === "string" && body.employeeId ? body.employeeId : null;
  try {
    return jsonOk(await assignAcrossProjects(viewer, conversationId, employeeId));
  } catch (error) {
    if (error instanceof AssignError) return jsonError(error.message, error.status);
    console.error("Cross-project assignment failed", error);
    return jsonError("تعذر الإسناد", 500);
  }
}
