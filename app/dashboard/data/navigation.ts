import type { NavItem, ViewKey } from "../types";

export const navItems: NavItem[] = [
  { key: "inbox", label: "المحادثات" },
  { key: "contacts", label: "العملاء" },
  { key: "tags", label: "الوسوم" },
  { key: "bot", label: "الرد الآلي" },
  { key: "automations", label: "الأتمتة" },
  { key: "campaigns", label: "الحملات" },
  { key: "templates", label: "القوالب" },
  { key: "quickReplies", label: "الردود السريعة" },
  { key: "workHours", label: "ساعات العمل" },
  { key: "reports", label: "التقارير" },
  { key: "leads", label: "العملاء المحتملون CRM" },
  { key: "teams", label: "الفرق" },
  { key: "employees", label: "الموظفين والصلاحيات" },
  { key: "settings", label: "الإعدادات والربط" }
];

export const viewTitles: Record<ViewKey, string> = {
  inbox: "المحادثات",
  contacts: "العملاء",
  tags: "الوسوم",
  bot: "الرد الآلي",
  automations: "الأتمتة",
  campaigns: "الحملات",
  templates: "القوالب",
  quickReplies: "الردود السريعة",
  workHours: "ساعات العمل",
  reports: "التقارير",
  leads: "العملاء المحتملون CRM",
  teams: "الفرق",
  employees: "الموظفين والصلاحيات",
  settings: "الإعدادات والربط"
};
