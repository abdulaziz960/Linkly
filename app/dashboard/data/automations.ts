import type { AutomationRule } from "../types";

export const automationRules: AutomationRule[] = [
  {
    id: "auto-hiring",
    name: "توزيع المحادثات الجديدة",
    description: "يسند المحادثات غير المخصصة إلى فريق الدعم حسب التوفر.",
    createdAt: "اليوم",
    enabled: true
  },
  {
    id: "auto-complaints",
    name: "تنبيه الشكاوى",
    description: "يرفع المحادثة للمشرف عند إضافة وسم شكوى.",
    createdAt: "أمس",
    enabled: true
  }
];
