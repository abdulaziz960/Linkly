import { jsonError, jsonOk } from "../_utils/json";
import { getWorkspaceViewer } from "../../../lib/workspaces/service";
import { buildWorkspaceState } from "../../../lib/workspaces/state";

export const runtime = "nodejs";

// Not enabled for this account (or nobody signed in): the same 404 an unknown route would give. Nothing about the feature is revealed.
export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  return jsonOk(await buildWorkspaceState(viewer));
}
