import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { createProject, deleteProject, listProjects, updateProject, type ProjectInput } from "../../../../lib/crm-projects";
import { inventoryByProject } from "../../../../lib/crm-units";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Project profiles (what the AI reads to answer about a project). Everyone with the leads page sees them; the owner edits. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const [projects, inventory] = await Promise.all([listProjects(user.tenantId), inventoryByProject(user.tenantId)]);
  return jsonOk({ projects, inventory });
}

async function ownerOnly(request: NextRequest) {
  if (!isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("يلزم تسجيل الدخول", 401) };
  if (user.role !== "مالك الحساب") return { error: jsonError("إدارة المشاريع متاحة لمالك الحساب فقط", 403) };
  return { user };
}

export async function POST(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as ProjectInput | null;
  const result = await createProject(auth.user!.tenantId, body ?? {});
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ project: result.project, projects: await listProjects(auth.user!.tenantId) });
}

export async function PATCH(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as (ProjectInput & { id?: string }) | null;
  const result = await updateProject(auth.user!.tenantId, String(body?.id ?? ""), body ?? {});
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ project: result.project, projects: await listProjects(auth.user!.tenantId) });
}

export async function DELETE(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!(await deleteProject(auth.user!.tenantId, String(body?.id ?? "")))) return jsonError("المشروع غير موجود", 404);
  return jsonOk({ projects: await listProjects(auth.user!.tenantId) });
}
