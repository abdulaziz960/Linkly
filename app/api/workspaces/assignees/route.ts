import { jsonError, jsonOk } from "../../_utils/json";
import { prisma } from "../../../../lib/prisma";
import { getWorkspaceViewer } from "../../../../lib/workspaces/service";

export const runtime = "nodejs";

/** The employees conversations can be handed to: the employees of every project of the viewer's own account, tagged with their project. */
export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  const projects = viewer.group.projects.filter((project) => !project.archived);
  const employees = await prisma.employee.findMany({
    where: { tenantId: { in: projects.map((project) => project.tenantId) } },
    select: { id: true, name: true, tenantId: true, status: true },
    orderBy: { name: "asc" }
  });
  const projectByTenant = new Map(projects.map((project) => [project.tenantId, project]));
  return jsonOk(employees.flatMap((employee) => {
    const project = projectByTenant.get(employee.tenantId);
    return project ? [{ employeeId: employee.id, name: employee.name, projectId: project.id, projectName: project.name, projectColor: project.color, ownProject: employee.tenantId === viewer.user.tenantId }] : [];
  }));
}
