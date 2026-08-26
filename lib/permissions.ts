import type { Employee, ViewKey } from "../app/dashboard/types";

export const allViewKeys: ViewKey[] = [
  "inbox",
  "contacts",
  "tags",
  "bot",
  "automations",
  "campaigns",
  "templates",
  "quickReplies",
  "workHours",
  "reports",
  "leads",
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
  { keyword: "حملات", views: ["campaigns"] },
  { keyword: "ساعات", views: ["workHours"] },
  { keyword: "تقارير", views: ["reports"] },
  { keyword: "محتملون", views: ["leads"] },
  { keyword: "فرق", views: ["teams"] },
  { keyword: "موظفين", views: ["employees"] },
  { keyword: "صلاحيات", views: ["employees"] },
  { keyword: "ربط", views: ["settings"] }
];

/**
 * Whether a given role/permissions combination grants Owner-equivalent
 * access (full conversation visibility via role, or every dashboard view
 * via the "الكل" permissions flag). Only an existing Owner may grant this
 * to a new or existing employee - see app/api/employees/route.ts.
 */
export function isOwnerEquivalentGrant(role: string, permissions: string): boolean {
  return role === "مالك الحساب" || permissions === "الكل";
}

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
 * Conversation visibility is strictly role-based: only the account owner
 * sees every conversation. The "الكل" employee permission grants access to
 * every app section/menu - it's a feature-access flag, not a data-scope
 * grant, so it must not also unlock other employees' conversations.
 */
export function canSeeAllConversations(role: string, _employee?: Pick<Employee, "permissions">) {
  void _employee;
  return role === "مالك الحساب";
}
