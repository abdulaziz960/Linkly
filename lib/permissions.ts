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

export function canSeeAllConversations(role: string, employee?: Pick<Employee, "permissions">) {
  return role === "مالك الحساب" || employee?.permissions === "الكل";
}
