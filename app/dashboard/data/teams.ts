import type { Team } from "../types";

export const teams: Team[] = [
  { id: "team-support", name: "الدعم", lead: "عبدالعزيز الكيالي", memberIds: ["emp-owner", "emp-noura", "emp-sarah", "emp-abdullah"], routing: "تلقائي بالتساوي" },
  { id: "team-sales", name: "المبيعات", lead: "سارة الحربي", memberIds: ["emp-sarah", "emp-owner", "emp-noura"], routing: "تلقائي بالتساوي" },
  { id: "team-shipping", name: "الشحن", lead: "نورة القحطاني", memberIds: ["emp-noura", "emp-abdullah"], routing: "تلقائي بالتساوي" },
  { id: "team-billing", name: "الفواتير", lead: "عبدالله العتيبي", memberIds: ["emp-abdullah"], routing: "يدوي" }
];
