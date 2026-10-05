import type { Tone } from "../ds/primitives";
import { fieldLabel, formatValue } from "../activity";

export type ActionLike = {
  id: string;
  adminEmail: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
};

/** Arabic names for the action keys written by recordAdminAction; unknown keys show as-is. */
export const ACTION_LABEL: Record<string, string> = {
  "add-campaign-balance": "إضافة رصيد رسائل حملات",
  "create-blog-post": "إنشاء مقال",
  "update-blog-post": "تعديل مقال",
  "delete-blog-post": "حذف مقال",
  "create-client": "إنشاء عميل",
  "create-discount-code": "إنشاء كود خصم",
  "update-discount-code": "تعديل كود خصم",
  "delete-discount-code": "حذف كود خصم",
  "create-faq": "إضافة سؤال شائع",
  "update-faq": "تعديل سؤال شائع",
  "delete-faq": "حذف سؤال شائع",
  "reorder-faq": "إعادة ترتيب الأسئلة الشائعة",
  "create-manual-invoice": "إنشاء فاتورة يدوية",
  "create-plan": "إنشاء باقة",
  "update-plan": "تعديل باقة",
  "edit-client-employee": "تعديل موظف لدى عميل",
  "invite-platform-admin": "دعوة عضو للفريق",
  "revoke-platform-admin": "إزالة صلاحية عضو",
  "update-client-subscription": "تعديل اشتراك عميل",
  "update-development-request": "تحديث اقتراح تطوير",
  "update-feature-grants": "تعديل صلاحيات عميل الاستثنائية",
  "update-support-ticket": "تحديث تذكرة دعم",
  "update-team-permissions": "تعديل صلاحيات عضو",
  "suspend-platform-admin": "إيقاف حساب عضو",
  "reactivate-platform-admin": "إعادة تفعيل عضو",
  "revoke-platform-admin-sessions": "إنهاء جلسات عضو",
  "add-client-note": "إضافة ملاحظة على عميل",
  "delete-client-note": "حذف ملاحظة على عميل"
};

export const TARGET_LABEL: Record<string, string> = {
  plan: "باقة",
  discount_code: "كود خصم",
  client: "عميل",
  tenant: "عميل",
  blog_post: "مقال",
  faq: "سؤال شائع",
  support_ticket: "تذكرة",
  user: "مستخدم"
};

export function actionLabel(action: string) {
  return ACTION_LABEL[action] ?? action;
}

export function actionTone(action: string): Tone {
  if (/^delete|^revoke/.test(action)) return "danger";
  if (/^create|^invite|^add/.test(action)) return "success";
  return "info";
}

export function filterActions<T extends ActionLike>(actions: T[], filters: { admin: string; action: string; query: string }) {
  const needle = filters.query.trim().toLowerCase();
  return actions.filter((row) => {
    if (filters.admin !== "all" && row.adminEmail !== filters.admin) return false;
    if (filters.action !== "all" && row.action !== filters.action) return false;
    if (!needle) return true;
    return [row.adminEmail, row.adminName, row.action, actionLabel(row.action), row.targetType, row.targetId, row.details].some((value) => value.toLowerCase().includes(needle));
  });
}

/**
 * Turns the stored details string into rows: [label, value, previous?]. The
 * "before/after" format written by changeDetails() yields rows with the
 * previous value; flat JSON and plain text keep their original shape.
 * Nested objects are never dumped as raw JSON.
 */
export function parseDetails(details: string): Array<[string, string] | [string, string, string]> {
  const text = details.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.after && typeof record.after === "object" && !Array.isArray(record.after)) {
        const after = record.after as Record<string, unknown>;
        const before = (record.before && typeof record.before === "object" ? record.before : {}) as Record<string, unknown>;
        return Object.keys(after).map((key) => (key in before
          ? [fieldLabel(key), formatValue(key, after[key]), formatValue(key, before[key])] as [string, string, string]
          : [fieldLabel(key), formatValue(key, after[key])] as [string, string]));
      }
      return Object.entries(record).map(([key, value]) => [key, typeof value === "string" ? value : typeof value === "object" && value !== null ? "—" : JSON.stringify(value)] as [string, string]);
    }
  } catch {
    // Not JSON - show it verbatim.
  }
  return [["التفاصيل", text]];
}

export function paginate<T>(rows: T[], page: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pageCount };
}

export function formatActionDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(time);
}
