import type { RenewalFilter, UsageFilter } from "./clients-filters";

export const RENEWAL_FILTER_OPTIONS: { value: RenewalFilter; label: string }[] = [
  { value: "any", label: "أي موعد" },
  { value: "overdue", label: "متأخر" },
  { value: "7d", label: "خلال 7 أيام" },
  { value: "30d", label: "خلال 30 يومًا" },
  { value: "none", label: "بدون تاريخ تجديد" }
];

export const USAGE_FILTER_OPTIONS: { value: UsageFilter; label: string }[] = [
  { value: "any", label: "أي استخدام" },
  { value: "idle", label: "بدون محادثات" },
  { value: "near", label: "قريب من حد المستخدمين (80%+)" },
  { value: "full", label: "وصل حد المستخدمين" }
];
