import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { listBranches } from "../../../../lib/catalog-branches";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  return { user };
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  return jsonOk(await listBranches(auth.user.tenantId));
}
