import type { AutomationRule } from "../types";

export const automationRules: AutomationRule[] = [
  {
    id: "auto-hiring",
    name: "توزيع المحادثات الجديدة",
    description: "يسند المحادثات غير المخصصة إلى فريق الدعم حسب التوفر.",
    trigger: "محادثة جديدة",
    action: "تعيين المحادثة",
    target: "فريق الدعم",
    delayMinutes: 0,
    conditions: [{ field: "حالة المحادثة", operator: "يساوي", value: "غير مسندة" }],
    actions: [{ type: "إسناد إلى فريق", target: "الدعم" }],
    createdAt: "اليوم",
    enabled: true
  },
  {
    id: "auto-complaints",
    name: "تنبيه الشكاوى",
    description: "يرفع المحادثة للمشرف عند إضافة وسم شكوى.",
    trigger: "وسم مضاف",
    action: "إشعار المشرف",
    target: "المشرف",
    delayMinutes: 0,
    conditions: [{ field: "العميل لديه وسم", operator: "يساوي", value: "شكوى" }],
    actions: [{ type: "إشعار المشرف", target: "المشرف" }],
    createdAt: "أمس",
    enabled: true
  },
  {
    id: "auto-business-hours",
    name: "الرد خارج ساعات العمل",
    description: "يرسل الرد التلقائي المعرّف في صفحة ساعات العمل عندما تصل رسالة خارج الدوام.",
    trigger: "رد العميل",
    action: "إرسال رد ساعات العمل",
    target: "إعدادات ساعات العمل",
    delayMinutes: 0,
    conditions: [{ field: "وقت الرسالة", operator: "خارج", value: "ساعات العمل" }],
    actions: [{ type: "إرسال رد ساعات العمل", target: "إعدادات ساعات العمل" }],
    createdAt: "اليوم",
    enabled: true
  }
];
