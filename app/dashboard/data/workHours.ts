import type { WorkSchedule } from "../types";

export const workSchedules: WorkSchedule[] = [
  { id: "wh-support", team: "الدعم", days: "الأحد - الخميس", start: "9:00 ص", end: "6:00 م", status: "نشط", holidays: "غير مفعلة" },
  { id: "wh-sales", team: "المبيعات", days: "كل الأيام", start: "10:00 ص", end: "10:00 م", status: "نشط", holidays: "غير مفعلة" },
  { id: "wh-shipping", team: "الشحن", days: "الأحد - الخميس", start: "8:00 ص", end: "4:00 م", status: "متوقف", holidays: "مفعلة" }
];
