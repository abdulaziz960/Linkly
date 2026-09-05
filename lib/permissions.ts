import type { Employee, ViewKey } from "../app/dashboard/types";

export const allViewKeys: ViewKey[] = [
  "inbox",
  "contacts",
  "tags",
  "bot",
  "automations",
  "campaigns",
  "segments",
  "templates",
  "quickReplies",
  "workHours",
  "reports",
  "teams",
  "employees",
  "settings"
];

export const permissionViewMap: Array<{ keyword: string; views: ViewKey[] }> = [
  { keyword: "محادثات", views: ["inbox"] },
  { keyword: "عملاء", views: ["contacts"] },
  { keyword: "وسوم", views: ["tags"] },
  { keyword: "قوالب", views: ["templates"] },
  { keyword: "ردود", views: ["quickReplies"] },
  { keyword: "رد آلي", views: ["bot"] },
  { keyword: "أتمتة", views: ["automations"] },
  { keyword: "حملات", views: ["campaigns", "segments"] },
  { keyword: "ساعات", views: ["workHours"] },
  { keyword: "تقارير", views: ["reports"] },
  { keyword: "فرق", views: ["teams"] },
  { keyword: "موظفين", views: ["employees"] },
  { keyword: "صلاحيات", views: ["employees"] },
  { keyword: "ربط", views: ["settings"] }
];

export function computeAllowedViews(role: string, permissions: string): ViewKey[] {
  if (role === "مالك الحساب" || permissions === "الكل") return allViewKeys;

  const views = new Set<ViewKey>();
  permissionViewMap.forEach((permission) => {
    if (permissions.includes(permission.keyword)) {
      permission.views.forEach((view) => views.add(view));
    }
  });

  return views.size ? Array.from(views) : ["inbox"];
}

/**
 * Whether a given role/permissions combination grants Owner-equivalent
 * access (full conversation visibility via role, or every dashboard view).
 * Delegates to computeAllowedViews rather than checking permissions==="الكل"
 * directly, since a permissions string that happens to contain every
 * individual keyword also resolves to every view without ever equaling
 * the literal "الكل" flag - that bypass must be caught here too. Only an
 * existing Owner may grant this to a new or existing employee - see
 * app/api/employees/route.ts.
 */
export function isOwnerEquivalentGrant(role: string, permissions: string): boolean {
  if (role === "مالك الحساب") return true;
  return computeAllowedViews(role, permissions).length === allViewKeys.length;
}

/**
 * Conversation visibility is strictly role-based: only the account owner
 * sees every conversation. The "الكل" employee permission grants access to
 * every app section/menu - it's a feature-access flag, not a data-scope
 * grant, so it must not also unlock other employees' conversations.
 */
export function canSeeAllConversations(role: string, _employee?: Pick<Employee, "permissions">) {
  void _employee;
  return role === "مالك الحساب";
}
