"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { DiscountCodeRow, PlanRow } from "../types";
import { formatNumber } from "../utils";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { useQueryFlag } from "../ds/useQueryFlag";

type DiscountCodesViewProps = {
  discountCodes: DiscountCodeRow[];
  plans: PlanRow[];
};

type StatusFilter = "الكل" | "نشط" | "مجدول" | "منتهي" | "معطل";
type SortKey = "created" | "usage" | "expiry";

function computeStatus(code: DiscountCodeRow): "active" | "scheduled" | "expired" | "usage_limit_reached" | "inactive" {
  if (code.active !== 1) return "inactive";
  const now = new Date();
  if (code.startsAt && new Date(code.startsAt) > now) return "scheduled";
  if (code.expiresAt && new Date(code.expiresAt) < now) return "expired";
  if (code.usageLimit !== -1 && code.usedCount >= code.usageLimit) return "usage_limit_reached";
  return "active";
}

function statusLabel(status: string, t: (ar: string, en: string) => string) {
  switch (status) {
    case "active":
      return t("نشط", "Active");
    case "scheduled":
      return t("مجدول", "Scheduled");
    case "expired":
      return t("منتهي", "Expired");
    case "usage_limit_reached":
      return t("اكتمل الاستخدام", "Usage limit reached");
    default:
      return t("معطل", "Inactive");
  }
}

function statusPillClass(status: string) {
  switch (status) {
    case "active":
      return "is-good";
    case "scheduled":
      return "is-warn";
    case "expired":
    case "usage_limit_reached":
      return "is-danger";
    default:
      return "is-warn";
  }
}

function planNames(applicablePlanIds: string, plans: PlanRow[], t: (ar: string, en: string) => string) {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(applicablePlanIds);
    if (Array.isArray(parsed)) ids = parsed;
  } catch {
    ids = [];
  }
  if (ids.length === 0) return t("كل الباقات", "All plans");
  const names = ids.map((id) => plans.find((plan) => plan.id === id)?.name || id);
  return names.join("، ");
}

const STATUS_FILTERS: StatusFilter[] = ["الكل", "نشط", "مجدول", "منتهي", "معطل"];

export default function DiscountCodesView({ discountCodes, plans }: DiscountCodesViewProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("الكل");
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  useQueryFlag("new", () => setIsCreateOpen(true));
  const [editCode, setEditCode] = useState<DiscountCodeRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const activeCount = discountCodes.filter((c) => computeStatus(c) === "active").length;
  const totalRedemptions = discountCodes.reduce((sum, c) => sum + c.usedCount, 0);

  const visibleCodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let rows = discountCodes.filter((code) => {
      if (query && !code.code.toLowerCase().includes(query) && !code.name.toLowerCase().includes(query)) return false;
      if (statusFilter === "الكل") return true;
      const status = computeStatus(code);
      if (statusFilter === "نشط") return status === "active";
      if (statusFilter === "مجدول") return status === "scheduled";
      if (statusFilter === "منتهي") return status === "expired" || status === "usage_limit_reached";
      if (statusFilter === "معطل") return status === "inactive";
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sortBy === "usage") return b.usedCount - a.usedCount;
      if (sortBy === "expiry") return (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999");
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }, [discountCodes, searchQuery, statusFilter, sortBy]);

  async function handleToggleActive(code: DiscountCodeRow) {
    setTogglingId(code.id);
    const response = await fetch(`/api/admin/discount-codes/${code.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: code.active !== 1 })
    });
    setTogglingId("");
    if (response.ok) router.refresh();
  }

  async function handleDelete(code: DiscountCodeRow) {
    if (!window.confirm(t("تأكيد حذف كود الخصم؟", "Delete this discount code?"))) return;
    const response = await fetch(`/api/admin/discount-codes/${code.id}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !result.ok) {
      window.alert(result.error || t("تعذر حذف كود الخصم", "Failed to delete discount code"));
      return;
    }
    router.refresh();
  }

  type FormState = {
    name: string;
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: string;
    maxDiscountAmount: string;
    minimumAmount: string;
    applyToAllPlans: boolean;
    selectedPlanIds: string[];
    newUsersOnly: boolean;
    firstSubscriptionOnly: boolean;
    usageLimit: string;
    usageLimitPerUser: string;
    startsAt: string;
    expiresAt: string;
  };

  const emptyForm: FormState = {
    name: "",
    code: "",
    discountType: "percentage",
    discountValue: "",
    maxDiscountAmount: "",
    minimumAmount: "",
    applyToAllPlans: true,
    selectedPlanIds: [],
    newUsersOnly: true,
    firstSubscriptionOnly: true,
    usageLimit: "",
    usageLimitPerUser: "1",
    startsAt: "",
    expiresAt: ""
  };

  const [form, setForm] = useState<FormState>(emptyForm);

  function parsePlanIds(json: string): string[] {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setFormError("");
    setIsCreateOpen(true);
  }

  function openEdit(code: DiscountCodeRow) {
    const planIds = parsePlanIds(code.applicablePlanIds);
    setForm({
      name: code.name,
      code: code.code,
      discountType: code.discountType === "fixed" ? "fixed" : "percentage",
      discountValue: String(code.discountValue),
      maxDiscountAmount: code.maxDiscountAmount ? String(code.maxDiscountAmount) : "",
      minimumAmount: code.minimumAmount ? String(code.minimumAmount) : "",
      applyToAllPlans: planIds.length === 0,
      selectedPlanIds: planIds,
      newUsersOnly: code.newUsersOnly === 1,
      firstSubscriptionOnly: code.firstSubscriptionOnly === 1,
      usageLimit: code.usageLimit === -1 ? "" : String(code.usageLimit),
      usageLimitPerUser: String(code.usageLimitPerUser),
      startsAt: code.startsAt ? code.startsAt.slice(0, 10) : "",
      expiresAt: code.expiresAt ? code.expiresAt.slice(0, 10) : ""
    });
    setFormError("");
    setEditCode(code);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    const payload = {
      name: form.name,
      code: form.code,
      discountType: form.discountType,
      discountValue: Number(form.discountValue || 0),
      maxDiscountAmount: Number(form.maxDiscountAmount || 0),
      minimumAmount: Number(form.minimumAmount || 0),
      applicablePlanIds: form.applyToAllPlans ? [] : form.selectedPlanIds,
      newUsersOnly: form.newUsersOnly,
      firstSubscriptionOnly: form.firstSubscriptionOnly,
      usageLimit: form.usageLimit === "" ? -1 : Number(form.usageLimit),
      usageLimitPerUser: Number(form.usageLimitPerUser || 1),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : ""
    };

    const url = editCode ? `/api/admin/discount-codes/${editCode.id}` : "/api/admin/discount-codes";
    const method = editCode ? "PATCH" : "POST";
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setSaving(false);
    if (!response.ok || !result.ok) {
      setFormError(result.error || t("تعذر حفظ كود الخصم", "Failed to save discount code"));
      return;
    }

    setIsCreateOpen(false);
    setEditCode(null);
    router.refresh();
  }

  function togglePlanId(id: string) {
    setForm((prev) => ({
      ...prev,
      selectedPlanIds: prev.selectedPlanIds.includes(id) ? prev.selectedPlanIds.filter((p) => p !== id) : [...prev.selectedPlanIds, id]
    }));
  }

  const modalOpen = isCreateOpen || editCode !== null;

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي الأكواد", "Total codes")}</span>
            <strong>{formatNumber(discountCodes.length)}</strong>
            <small>{t(`${formatNumber(activeCount)} نشطة`, `${formatNumber(activeCount)} active`)}</small>
          </article>
          <article>
            <span>{t("إجمالي الاستخدامات", "Total redemptions")}</span>
            <strong>{formatNumber(totalRedemptions)}</strong>
            <small>{t("عبر كل الأكواد", "Across all codes")}</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("أكواد الخصم", "Discount Codes")}</h2>
            <p>{t("أكواد خصم تُستخدم عند إنشاء أول اشتراك مدفوع.", "Discount codes redeemed on a first paid subscription.")}</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={openCreate}>
              {t("إنشاء كود خصم", "Create Discount Code")}
            </button>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder={t("ابحث بالكود أو الاسم...", "Search by code or name...")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div className="admin-filter-chips">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                className={`admin-filter-chip ${statusFilter === status ? "active" : ""}`}
                onClick={() => setStatusFilter(status)}
              >
                {status === "الكل" ? t("الكل", "All") : status === "نشط" ? t("نشط", "Active") : status === "مجدول" ? t("مجدول", "Scheduled") : status === "منتهي" ? t("منتهي", "Expired") : t("معطل", "Inactive")}
              </button>
            ))}
          </div>
          <CustomSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as SortKey)}
            options={[
              { value: "created", label: `${t("ترتيب", "Sort")}: ${t("تاريخ الإنشاء", "Created date")}` },
              { value: "usage", label: `${t("ترتيب", "Sort")}: ${t("الاستخدام", "Usage")}` },
              { value: "expiry", label: `${t("ترتيب", "Sort")}: ${t("تاريخ الانتهاء", "Expiry date")}` }
            ]}
          />
        </div>

        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("الكود", "Code")}</th>
                <th>{t("الاسم", "Name")}</th>
                <th>{t("النوع والقيمة", "Type and value")}</th>
                <th>{t("الباقات", "Plans")}</th>
                <th>{t("جدد فقط", "New users")}</th>
                <th>{t("الاستخدام", "Usage")}</th>
                <th>{t("الانتهاء", "Expiry")}</th>
                <th>{t("الحالة", "Status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleCodes.map((code) => {
                const status = computeStatus(code);
                return (
                  <tr key={code.id}>
                    <td dir="ltr"><b>{code.code}</b></td>
                    <td>{code.name}</td>
                    <td>{code.discountType === "percentage" ? `${formatNumber(code.discountValue)}%` : `${formatNumber(code.discountValue)} ${t("ر.س", "SAR")}`}</td>
                    <td>{planNames(code.applicablePlanIds, plans, t)}</td>
                    <td>{code.newUsersOnly === 1 ? t("نعم", "Yes") : t("لا", "No")}</td>
                    <td>{formatNumber(code.usedCount)}{code.usageLimit !== -1 ? ` / ${formatNumber(code.usageLimit)}` : ` / ${t("بلا حد", "Unlimited")}`}</td>
                    <td>{code.expiresAt ? code.expiresAt.slice(0, 10) : t("بلا انتهاء", "No expiry")}</td>
                    <td><span className={`admin-pill ${statusPillClass(status)}`}>{statusLabel(status, t)}</span></td>
                    <td>
                      <div className="admin-card-actions">
                        <button type="button" onClick={() => openEdit(code)}>{t("تعديل", "Edit")}</button>
                        <button type="button" disabled={togglingId === code.id} onClick={() => handleToggleActive(code)}>
                          {code.active === 1 ? t("تعطيل", "Deactivate") : t("تفعيل", "Activate")}
                        </button>
                        <Link href={`/linkly-admin007/discount-codes/${code.id}`}>{t("عرض الاستخدامات", "View Usage")}</Link>
                        <button type="button" onClick={() => handleDelete(code)}>{t("حذف", "Delete")}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleCodes.length === 0 ? <p className="admin-empty-state">{t("لا توجد أكواد خصم مطابقة.", "No matching discount codes.")}</p> : null}
      </section>

      {modalOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="discount-code-modal-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="discount-code-modal-title">{editCode ? t("تعديل كود الخصم", "Edit Discount Code") : t("إنشاء كود خصم جديد", "Create a New Discount Code")}</h2>
              </div>
              <button type="button" onClick={() => { setIsCreateOpen(false); setEditCode(null); }} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleSubmit}>
              <label>
                {t("اسم الكود", "Discount name")}
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("مثال: ترحيب بالمستخدمين الجدد", "Example: Welcome New Users")} required />
              </label>
              <label>
                {t("كود الخصم", "Discount code")}
                <input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" required disabled={editCode !== null} />
              </label>
              <label>
                {t("نوع الخصم", "Discount type")}
                <CustomSelect
                  value={form.discountType}
                  onChange={(value) => setForm({ ...form, discountType: value as "percentage" | "fixed" })}
                  options={[
                    { value: "percentage", label: t("نسبة مئوية", "Percentage") },
                    { value: "fixed", label: t("مبلغ ثابت", "Fixed amount") }
                  ]}
                />
              </label>
              <label>
                {form.discountType === "percentage" ? t("قيمة الخصم (%)", "Discount value (%)") : t("قيمة الخصم (ر.س)", "Discount value (SAR)")}
                <input type="number" min="0" max={form.discountType === "percentage" ? "100" : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} required />
              </label>
              {form.discountType === "percentage" ? (
                <label>
                  {t("الحد الأقصى للخصم (ر.س، اختياري)", "Maximum discount amount (SAR, optional)")}
                  <input type="number" min="0" value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} />
                </label>
              ) : null}
              <label>
                {t("الحد الأدنى لقيمة الاشتراك (ر.س، اختياري)", "Minimum subscription amount (SAR, optional)")}
                <input type="number" min="0" value={form.minimumAmount} onChange={(e) => setForm({ ...form, minimumAmount: e.target.value })} />
              </label>

              <label className="admin-checkbox-label">
                <input type="checkbox" checked={form.applyToAllPlans} onChange={(e) => setForm({ ...form, applyToAllPlans: e.target.checked })} />
                {t("ينطبق على كل الباقات", "Apply to all plans")}
              </label>
              {!form.applyToAllPlans ? (
                <div className="admin-checkbox-group">
                  {plans.map((plan) => (
                    <label className="admin-checkbox-label" key={plan.id}>
                      <input type="checkbox" checked={form.selectedPlanIds.includes(plan.id)} onChange={() => togglePlanId(plan.id)} />
                      {plan.name}
                    </label>
                  ))}
                </div>
              ) : null}

              <label className="admin-checkbox-label">
                <input type="checkbox" checked={form.newUsersOnly} onChange={(e) => setForm({ ...form, newUsersOnly: e.target.checked, firstSubscriptionOnly: e.target.checked ? true : form.firstSubscriptionOnly })} />
                {t("للمستخدمين الجدد فقط", "New users only")}
              </label>
              <label className="admin-checkbox-label">
                <input type="checkbox" checked={form.firstSubscriptionOnly} onChange={(e) => setForm({ ...form, firstSubscriptionOnly: e.target.checked })} />
                {t("لأول اشتراك مدفوع فقط", "First paid subscription only")}
              </label>

              <label>
                {t("الحد الأقصى للاستخدام (اتركه فارغًا لعدم التحديد)", "Total usage limit (leave empty for unlimited)")}
                <input type="number" min="0" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder={t("بلا حد", "Unlimited")} />
              </label>
              <label>
                {t("الحد الأقصى للاستخدام لكل عميل", "Usage limit per user")}
                <input type="number" min="1" value={form.usageLimitPerUser} onChange={(e) => setForm({ ...form, usageLimitPerUser: e.target.value })} />
              </label>

              <label>
                {t("تاريخ البداية (اختياري)", "Start date (optional)")}
                <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </label>
              <label>
                {t("تاريخ الانتهاء (اختياري)", "Expiry date (optional)")}
                <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </label>

              {formError ? <p className="admin-form-error">{formError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => { setIsCreateOpen(false); setEditCode(null); }}>
                  {t("إلغاء", "Cancel")}
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? t("جاري الحفظ...", "Saving...") : editCode ? t("حفظ", "Save") : t("إنشاء الكود", "Create Code")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
