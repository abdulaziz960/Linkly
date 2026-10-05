import type { IconName } from "./ds/Icon";

const BASE = "/linkly-admin007";

export type NavItem = { href: string; label: string; icon: IconName; badge?: "renewals" | "support" | "development" };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "الإدارة العامة",
    items: [{ href: BASE, label: "نظرة عامة", icon: "dashboard" }]
  },
  {
    label: "العملاء والاشتراكات",
    items: [
      { href: `${BASE}/clients`, label: "العملاء", icon: "users" },
      { href: `${BASE}/alerts`, label: "تنبيهات التجديد", icon: "calendar", badge: "renewals" },
      { href: `${BASE}/plans`, label: "الباقات", icon: "layers" },
      { href: `${BASE}/discount-codes`, label: "أكواد الخصم", icon: "ticket" }
    ]
  },
  {
    label: "الإيرادات",
    items: [{ href: `${BASE}/payments`, label: "المدفوعات", icon: "card" }]
  },
  {
    label: "التشغيل",
    items: [
      { href: `${BASE}/support`, label: "الدعم الفني", icon: "lifebuoy", badge: "support" },
      { href: `${BASE}/development`, label: "التطوير", icon: "code", badge: "development" },
      { href: `${BASE}/usage`, label: "الاستخدام", icon: "chart" },
      { href: `${BASE}/faq`, label: "الأسئلة الشائعة", icon: "lifebuoy" },
      { href: `${BASE}/blog`, label: "المدونة", icon: "scroll" },
      { href: `${BASE}/landing`, label: "نصوص الرئيسية", icon: "scroll" },
      { href: `${BASE}/page-seo`, label: "SEO الصفحات", icon: "chart" },
      { href: `${BASE}/redirects`, label: "التحويلات", icon: "code" }
    ]
  },
  {
    label: "الفريق والأمان",
    items: [
      { href: `${BASE}/team`, label: "الفريق والصلاحيات", icon: "shield" },
      { href: `${BASE}/logs`, label: "سجلات النشاط", icon: "scroll" },
      { href: `${BASE}/admin-actions`, label: "سجل التدقيق", icon: "receipt" },
      { href: `${BASE}/settings`, label: "إعدادات الحساب", icon: "settings" }
    ]
  }
];

export const QUICK_ACTIONS: { label: string; href: string; icon: IconName }[] = [
  { label: "عميل جديد", href: `${BASE}/clients?new=1`, icon: "users" },
  { label: "باقة جديدة", href: `${BASE}/plans?new=1`, icon: "layers" },
  { label: "كود خصم جديد", href: `${BASE}/discount-codes?new=1`, icon: "ticket" },
  { label: "دعوة عضو للفريق", href: `${BASE}/team?invite=1`, icon: "shield" }
];

// Breadcrumb trail for the topbar, derived from the path.
export function breadcrumbsFor(pathname: string): { label: string; href?: string }[] {
  const trail: { label: string; href?: string }[] = [{ label: "لوحة التحكم", href: BASE }];
  const flat = NAV_GROUPS.flatMap((group) => group.items);
  const match = flat.filter((item) => item.href !== BASE && (pathname === item.href || pathname.startsWith(`${item.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return pathname === BASE ? [{ label: "نظرة عامة" }] : trail;
  const detail = pathname !== match.href;
  trail.push({ label: match.label, href: detail ? match.href : undefined });
  if (detail) trail.push({ label: "التفاصيل" });
  return trail;
}
