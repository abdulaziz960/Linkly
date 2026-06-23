import type { Lead } from "../types";

export const leads: Lead[] = [
  { id: "lead-sarah", customer: "سارة العتيبي", interest: "شقة 3 غرف · شمال الرياض", budget: "850k", stage: "زيارة مجدولة", employee: "سارة الحربي", lastContact: "اليوم" },
  { id: "lead-abdullah", customer: "عبدالله الحربي", interest: "فيلا · شرق الرياض", budget: "1.9M", stage: "مهتم جاد", employee: "عبدالعزيز الكيالي", lastContact: "أمس" },
  { id: "lead-noura", customer: "نورة القحطاني", interest: "استثمار · وحدتين", budget: "1.4M", stage: "متابعة لاحقة", employee: "نورة القحطاني", lastContact: "قبل 3 أيام" }
];
