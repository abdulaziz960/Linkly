import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "../../../_utils/json";
import { getWorkspaceViewer } from "../../../../../lib/workspaces/service";
import { buildWorkspaceState } from "../../../../../lib/workspaces/state";
import { updateProject, WorkspaceInputError } from "../../../../../lib/workspaces/store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  if (!viewer.ownsAccount) return jsonError("تعديل المشاريع للمالك فقط", 403);
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; color?: unknown; archived?: unknown };
  try {
    // The project must belong to the viewer's own account: the group id comes from the server, never from the request.
    await updateProject(viewer.group.groupId, id, body);
  } catch (error) {
    if (error instanceof WorkspaceInputError) return jsonError(error.message, 400);
    console.error("Updating a project failed", error);
    return jsonError("تعذر تعديل المشروع", 500);
  }
  const refreshed = await getWorkspaceViewer();
  return jsonOk(refreshed ? await buildWorkspaceState(refreshed) : null);
}
