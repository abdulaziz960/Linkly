import type { Team } from "../types";

export const teams: Team[] = [
  {
    id: "team-support",
    name: "الدعم",
    lead: "نورة القحطاني",
    memberIds: ["emp-noura"],
    routing: "تلقائي بالتساوي"
  },
  {
    id: "team-sales",
    name: "المبيعات",
    lead: "عبدالعزيز الكيالي",
    memberIds: ["emp-owner"],
    routing: "يدوي"
  }
];
