import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "../../_utils/json";
import { getWorkspaceViewer } from "../../../../lib/workspaces/service";
import { buildWorkspaceState } from "../../../../lib/workspaces/state";
import { createProject, WorkspaceInputError } from "../../../../lib/workspaces/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  if (!viewer.ownsAccount) return jsonError("إنشاء المشاريع للمالك فقط", 403);
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; color?: unknown };
  try {
    await createProject({
      billingTenantId: viewer.group.billingTenantId,
      accountName: viewer.group.name,
      owner: { id: viewer.user.id, name: viewer.user.name, email: viewer.user.email },
      name: body.name,
      color: body.color
    });
  } catch (error) {
    if (error instanceof WorkspaceInputError) return jsonError(error.message, 400);
    console.error("Creating a project failed", error);
    return jsonError("تعذر إنشاء المشروع", 500);
  }
  const refreshed = await getWorkspaceViewer();
  return jsonOk(refreshed ? await buildWorkspaceState(refreshed) : null);
}
