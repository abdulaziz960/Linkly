import { redirect } from "next/navigation";
import { getAdminPermissions } from "../../lib/admin-auth";
import { getCurrentUser } from "../../lib/auth";
import type { AdminPermission } from "../../lib/admin-permissions";
import { PERMISSION_LABELS } from "../../lib/admin-permissions";
import { ErrorState } from "./ds/primitives";

/**
 * Server-side page guard. Runs BEFORE the page loads its data, so a member
 * without the permission never receives that data (hiding the link is not
 * enough). Returns the "no permission" state to render, or null to continue.
 */
export async function guardPage(permission: AdminPermission) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isPlatformAdmin !== 1) redirect("/dashboard");
  const permissions = await getAdminPermissions(user.id);
  if (permissions.includes(permission)) return null;
  return (
    <ErrorState
      kind="denied"
      title="لا تملك صلاحية الوصول لهذه الصفحة"
      description={`هذه الصفحة تتطلب صلاحية «${PERMISSION_LABELS[permission].label}». تواصل مع مدير الفريق إذا كنت تحتاجها.`}
    />
  );
}
