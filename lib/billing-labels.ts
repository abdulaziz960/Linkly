const EN_LABELS: Record<string, string> = {
  // Payment statuses (lib/payment-status.ts)
  "قيد الانتظار": "Pending",
  "مكتمل": "Paid",
  "فشل": "Failed",
  "منتهي الصلاحية": "Expired",
  "مسترد": "Refunded",
  // Subscription statuses
  "نشط": "Active",
  "تجريبي": "Trial",
  "موقوف": "Suspended",
  "منتهي": "Ended",
  "ملغي": "Cancelled",
  // Billing cycles
  "شهري": "Monthly",
  "ربع سنوي": "Quarterly",
  "نصف سنوي": "Semi-annual",
  "سنوي": "Yearly",
  // Employee roles
  "مالك الحساب": "Account owner",
  "مشرف": "Supervisor",
  "موظف دعم": "Support Agent"
};

/** English label for a stored Arabic status/cycle value; unknown values pass through unchanged. */
export function billingLabel(value: string | undefined, lang: "ar" | "en"): string {
  if (!value) return "—";
  return lang === "en" ? EN_LABELS[value] || value : value;
}
