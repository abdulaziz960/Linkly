// Fine-grained access for platform team members. Pure helpers (no DB) so the
// rules can be unit tested and shared by the server and the UI.

export const ADMIN_PERMISSIONS = ["clients", "billing", "support", "content", "team"] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<AdminPermission, { label: string; hint: string }> = {
  clients: { label: "العملاء", hint: "عرض العملاء وملفاتهم وتعديل اشتراكاتهم والملاحظات الداخلية." },
  billing: { label: "الإيرادات", hint: "المدفوعات والباقات وأكواد الخصم وإنشاء روابط الدفع." },
  support: { label: "الدعم والتطوير", hint: "تذاكر الدعم الفني واقتراحات التطوير." },
  content: { label: "المحتوى", hint: "المدونة والأسئلة الشائعة." },
  team: { label: "الفريق والتدقيق", hint: "إدارة أعضاء الفريق وصلاحياتهم وسجل التدقيق." }
};

export const PERMISSION_PRESETS: { id: string; label: string; permissions: AdminPermission[] }[] = [
  { id: "owner", label: "مدير كامل", permissions: [...ADMIN_PERMISSIONS] },
  { id: "finance", label: "مالية", permissions: ["clients", "billing"] },
  { id: "support", label: "دعم فني", permissions: ["clients", "support"] },
  { id: "content", label: "محتوى", permissions: ["content"] }
];

/** Stored value -> permission list. "*" or an empty/absent value means full access (the pre-existing behaviour). */
export function parseAdminPermissions(raw: string | null | undefined): AdminPermission[] {
  const value = (raw ?? "").trim();
  if (!value || value === "*") return [...ADMIN_PERMISSIONS];
  return ADMIN_PERMISSIONS.filter((permission) => value.split(",").map((item) => item.trim()).includes(permission));
}

export function serializeAdminPermissions(permissions: readonly string[]): string {
  const valid = ADMIN_PERMISSIONS.filter((permission) => permissions.includes(permission));
  return valid.length === ADMIN_PERMISSIONS.length ? "*" : valid.join(",");
}

export function hasAdminPermission(permissions: readonly AdminPermission[], needed: AdminPermission) {
  return permissions.includes(needed);
}

// Which permission each admin page needs. Longest matching prefix wins; paths
// not listed (overview, settings, logs) are open to every team member.
const BASE = "/linkly-admin007";
const PATH_RULES: [string, AdminPermission][] = [
  [`${BASE}/clients`, "clients"],
  [`${BASE}/alerts`, "clients"],
  [`${BASE}/usage`, "clients"],
  [`${BASE}/payments`, "billing"],
  [`${BASE}/plans`, "billing"],
  [`${BASE}/discount-codes`, "billing"],
  [`${BASE}/support`, "support"],
  [`${BASE}/development`, "support"],
  [`${BASE}/blog`, "content"],
  [`${BASE}/faq`, "content"],
  [`${BASE}/redirects`, "content"],
  [`${BASE}/page-seo`, "content"],
  [`${BASE}/landing`, "content"],
  [`${BASE}/team`, "team"],
  [`${BASE}/admin-actions`, "team"]
];

export function permissionForPath(pathname: string): AdminPermission | null {
  const match = PATH_RULES.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  return match ? match[1] : null;
}

export function canAccessPath(permissions: readonly AdminPermission[], pathname: string) {
  const needed = permissionForPath(pathname);
  return needed === null || permissions.includes(needed);
}

/**
 * Validates a permission change for a team member. At least one member must
 * keep the "team" permission, otherwise nobody could manage the team again.
 */
export function validatePermissionChange(input: { targetId: string; next: AdminPermission[]; teamManagerIds: string[] }): string | null {
  if (input.next.length === 0) return "اختر صلاحية واحدة على الأقل، أو أزل العضو من الفريق.";
  const remainingManagers = input.teamManagerIds.filter((id) => id !== input.targetId).length + (input.next.includes("team") ? 1 : 0);
  if (remainingManagers === 0) return "لا يمكن إزالة صلاحية «الفريق والتدقيق» من آخر عضو يملكها.";
  return null;
}
