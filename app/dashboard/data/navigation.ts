import type { NavItem, ViewKey } from "../types";

export const navItems: NavItem[] = [
  { key: "inbox", label: "المحادثات" },
  { key: "contacts", label: "العملاء" },
  { key: "tags", label: "الوسوم" },
  { key: "bot", label: "الرد الآلي" },
  { key: "automations", label: "الأتمتة" },
  { key: "campaigns", label: "الحملات" },
  { key: "segments", label: "تقسيم الجمهور" },
  { key: "templates", label: "القوالب" },
  { key: "quickReplies", label: "الردود السريعة" },
  { key: "workHours", label: "ساعات العمل" },
  { key: "reports", label: "التقارير" },
  { key: "teams", label: "الفرق" },
  { key: "employees", label: "الموظفين والصلاحيات" },
  { key: "settings", label: "الإعدادات والربط" }
];

// English labels currently cover the sidebar navigation only (a partial,
// limited-scope rollout) - the rest of the dashboard's UI text stays Arabic.
export const navItemLabelsEn: Record<ViewKey, string> = {
  inbox: "Conversations",
  contacts: "Customers",
  tags: "Tags",
  bot: "Auto-reply",
  automations: "Automations",
  campaigns: "Campaigns",
  segments: "Segments",
  templates: "Templates",
  quickReplies: "Quick replies",
  workHours: "Work hours",
  reports: "Reports",
  teams: "Teams",
  employees: "Employees & permissions",
  settings: "Settings & channels"
};

export const viewTitles: Record<ViewKey, string> = {
  inbox: "المحادثات",
  contacts: "العملاء",
  tags: "الوسوم",
  bot: "الرد الآلي",
  automations: "الأتمتة",
  campaigns: "الحملات",
  segments: "تقسيم الجمهور",
  templates: "القوالب",
  quickReplies: "الردود السريعة",
  workHours: "ساعات العمل",
  reports: "التقارير",
  teams: "الفرق",
  employees: "الموظفين والصلاحيات",
  settings: "الإعدادات والربط"
};
