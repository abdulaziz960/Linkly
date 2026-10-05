// Turns raw audit rows (action keys + JSON details) into readable Arabic
// sentences. Pure and client-safe. Sensitive keys are always dropped.

export type ActionLogRow = {
  id: string;
  adminUserId: string;
  adminEmail: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
};

// `previous` is set when the audit entry recorded the value before the change.
export type ActivityDetail = { label: string; value: string; previous?: string };
export type ActivityView = {
  id: string;
  at: string;
  actor: string;
  actorInitial: string;
  title: string;
  target: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  details: ActivityDetail[];
  technicalId: string;
};

const SENSITIVE = /(key|secret|token|password|authorization|cookie|hash|signature)/i;

const FIELD_LABELS: Record<string, string> = {
  company: "المنشأة",
  companyName: "المنشأة",
  plan: "الباقة",
  planName: "الباقة",
  status: "الحالة",
  amount: "المبلغ",
  gateway: "بوابة الدفع",
  name: "الاسم",
  email: "البريد الإلكتروني",
  monthlyPrice: "السعر الشهري",
  employeeLimit: "حد الموظفين",
  aiDailyLimit: "حد الذكاء الاصطناعي اليومي",
  aiMonthlyLimit: "حد الذكاء الاصطناعي الشهري",
  messageQuota: "حصة الرسائل",
  messages: "عدد الرسائل",
  active: "مفعّل",
  sortOrder: "الترتيب",
  allowedChannels: "القنوات المسموحة",
  code: "الكود",
  discountType: "نوع الخصم",
  discountValue: "قيمة الخصم",
  usageLimit: "حد الاستخدام",
  startsAt: "تاريخ البداية",
  expiresAt: "تاريخ الانتهاء",
  billingCycle: "دورة الفوترة",
  renewalAt: "تاريخ التجديد",
  role: "الدور",
  tenantId: "معرّف العميل",
  rejectionReason: "سبب الرفض",
  maxDiscountAmount: "أقصى مبلغ خصم",
  minimumAmount: "الحد الأدنى للمبلغ",
  applicablePlanIds: "الباقات المشمولة",
  newUsersOnly: "للمستخدمين الجدد فقط",
  firstSubscriptionOnly: "لأول اشتراك فقط",
  usageLimitPerUser: "حد الاستخدام لكل مستخدم",
  permissions: "الصلاحيات",
  subject: "العنصر"
};

const STATUS_VALUES: Record<string, string> = {
  pending: "قيد المراجعة",
  in_progress: "جاري العمل عليها",
  resolved: "تم التنفيذ",
  rejected: "مرفوضة",
  new: "جديدة",
  open: "مفتوحة",
  closed: "مغلقة"
};

type Template = { title: (actor: string, target: string) => string; tone: ActivityView["tone"] };

const TEMPLATES: Record<string, Template> = {
  "create-client": { title: (a, t) => `أضاف ${a} عميلًا جديدًا${t ? `: ${t}` : ""}`, tone: "success" },
  "update-client-subscription": { title: (a) => `عدّل ${a} اشتراك أحد العملاء`, tone: "info" },
  "edit-client-employee": { title: (a) => `عدّل ${a} بيانات موظف لدى أحد العملاء`, tone: "info" },
  "add-campaign-balance": { title: (a) => `أضاف ${a} رصيد رسائل لأحد العملاء`, tone: "success" },
  "create-manual-invoice": { title: (a) => `أنشأ ${a} فاتورة يدوية لأحد العملاء`, tone: "warning" },
  "create-plan": { title: (a) => `أنشأ ${a} باقة جديدة`, tone: "success" },
  "update-plan": { title: (a) => `عدّل ${a} إعدادات إحدى الباقات`, tone: "info" },
  "create-discount-code": { title: (a) => `أنشأ ${a} كود خصم جديدًا`, tone: "success" },
  "update-discount-code": { title: (a) => `عدّل ${a} كود خصم`, tone: "info" },
  "delete-discount-code": { title: (a) => `حذف ${a} كود خصم`, tone: "danger" },
  "invite-platform-admin": { title: (a) => `دعا ${a} عضوًا جديدًا إلى فريق المنصة`, tone: "info" },
  "revoke-platform-admin": { title: (a) => `سحب ${a} صلاحية الإدارة من أحد أعضاء الفريق`, tone: "danger" },
  "update-development-request": { title: (a) => `حدّث ${a} حالة طلب تطوير`, tone: "info" },
  "update-support-ticket": { title: (a) => `حدّث ${a} تذكرة دعم فني`, tone: "info" }
};

export const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key;

export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (key === "active") return Number(value) === 1 ? "نعم" : "لا";
  if (typeof value === "number") return new Intl.NumberFormat("ar-SA", { numberingSystem: "latn" }).format(value);
  if (key === "status" && typeof value === "string" && STATUS_VALUES[value]) return STATUS_VALUES[value];
  if (typeof value === "object") return "—";
  return String(value);
}

export function parseDetails(raw: string): ActivityDetail[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      // New format: { subject?, before: {...}, after: {...} } - show "from -> to".
      if (record.after && typeof record.after === "object" && !Array.isArray(record.after)) {
        const after = record.after as Record<string, unknown>;
        const before = (record.before && typeof record.before === "object" ? record.before : {}) as Record<string, unknown>;
        return Object.keys(after)
          .filter((key) => !SENSITIVE.test(key))
          .map((key) => ({ label: FIELD_LABELS[key] ?? key, value: formatValue(key, after[key]), previous: key in before ? formatValue(key, before[key]) : undefined }));
      }
      return Object.entries(record)
        .filter(([key, value]) => !SENSITIVE.test(key) && (typeof value !== "object" || value === null))
        .map(([key, value]) => ({ label: FIELD_LABELS[key] ?? key, value: formatValue(key, value) }));
    }
  } catch {
    // Not JSON: some actions store a plain sentence (e.g. support ticket changes).
  }
  return [{ label: "ملاحظة", value: raw.length > 300 ? `${raw.slice(0, 300)}…` : raw }];
}

export function describeAction(row: ActionLogRow): ActivityView {
  const actor = row.adminName || row.adminEmail.split("@")[0] || "أحد أعضاء الفريق";
  const template = TEMPLATES[row.action];
  const details = parseDetails(row.details);
  let subject = "";
  try {
    const parsed: unknown = JSON.parse(row.details);
    if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).subject === "string") subject = (parsed as Record<string, string>).subject;
  } catch {
    // plain-text details have no subject
  }
  const target = subject || (details.find((detail) => detail.label === "المنشأة" || detail.label === "الاسم" || detail.label === "الكود")?.value ?? "");
  return {
    id: row.id,
    at: row.createdAt,
    actor,
    actorInitial: actor.slice(0, 1),
    title: template ? template.title(actor, target === "—" ? "" : target) : `نفّذ ${actor} إجراءً إداريًا`,
    target: target === "—" ? "" : target,
    tone: template?.tone ?? "neutral",
    details,
    technicalId: row.action
  };
}

// "منذ ٣ ساعات" style relative time, falling back to a date for older items.
export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return "وقت غير معروف";
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 45) return "الآن";
  const formatter = new Intl.RelativeTimeFormat("ar", { numeric: "auto", numberingSystem: "latn" } as Intl.RelativeTimeFormatOptions);
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return formatter.format(-days, "day");
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(timestamp);
}
