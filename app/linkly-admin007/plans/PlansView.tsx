"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { PlanRow } from "../types";
import { formatNumber } from "../utils";
import { useLanguage } from "../i18n";

type PlansViewProps = {
  plans: PlanRow[];
  subscriberCounts: Record<string, number>;
};

export default function PlansView({ plans, subscriberCounts }: PlansViewProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false);
  const [isPlanSaving, setIsPlanSaving] = useState(false);
  const [planFormError, setPlanFormError] = useState("");
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null);
  const [editPlanPrice, setEditPlanPrice] = useState("");
  const [editPlanLimit, setEditPlanLimit] = useState("");
  const [editPlanActive, setEditPlanActive] = useState(true);
  const [isEditPlanSaving, setIsEditPlanSaving] = useState(false);
  const [editPlanError, setEditPlanError] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const activeCount = plans.filter((p) => p.active === 1).length;
  const totalSubscribers = plans.reduce((sum, p) => sum + (subscriberCounts[p.name] || 0), 0);
  const averagePrice = plans.length ? Math.round(plans.reduce((sum, p) => sum + p.monthlyPrice, 0) / plans.length) : 0;

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPlanSaving(true);
    setPlanFormError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || ""),
      monthlyPrice: Number(formData.get("monthlyPrice") || 0),
      employeeLimit: Number(formData.get("employeeLimit") || 1)
    };

    const response = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsPlanSaving(false);

    if (!response.ok || !result.ok) {
      setPlanFormError(result.error || t("تعذر إنشاء الباقة", "Failed to create plan"));
      return;
    }

    setIsAddPlanOpen(false);
    router.refresh();
  }

  function openEditPlan(plan: PlanRow) {
    setEditPlan(plan);
    setEditPlanPrice(String(plan.monthlyPrice));
    setEditPlanLimit(String(plan.employeeLimit));
    setEditPlanActive(plan.active === 1);
    setEditPlanError("");
  }

  async function handleUpdatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editPlan) return;

    const monthlyPrice = Number(editPlanPrice);
    const employeeLimit = Number(editPlanLimit);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || !Number.isFinite(employeeLimit) || employeeLimit < 1) {
      setEditPlanError(t("تحقق من السعر وحد المستخدمين", "Check the price and user limit"));
      return;
    }

    setIsEditPlanSaving(true);
    setEditPlanError("");

    const response = await fetch(`/api/admin/plans/${editPlan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyPrice, employeeLimit, active: editPlanActive })
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsEditPlanSaving(false);

    if (!response.ok || !result.ok) {
      setEditPlanError(result.error || t("تعذر تحديث الباقة", "Failed to update plan"));
      return;
    }

    setEditPlan(null);
    router.refresh();
  }

  async function handleToggleActive(plan: PlanRow) {
    setTogglingId(plan.id);
    const response = await fetch(`/api/admin/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: plan.active !== 1 })
    });
    setTogglingId("");
    if (response.ok) router.refresh();
  }

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي الباقات", "Total plans")}</span>
            <strong>{formatNumber(plans.length)}</strong>
            <small>{t(`${formatNumber(activeCount)} مفعّلة`, `${formatNumber(activeCount)} active`)}</small>
          </article>
          <article>
            <span>{t("مشتركون", "Subscribers")}</span>
            <strong>{formatNumber(totalSubscribers)}</strong>
            <small>{t("عميل موزّع على كل الباقات", "Clients spread across all plans")}</small>
          </article>
          <article>
            <span>{t("متوسط السعر الشهري", "Average monthly price")}</span>
            <strong>{formatNumber(averagePrice)}</strong>
            <small>{t("ريال عبر كل الباقات", "SAR across all plans")}</small>
          </article>
          <article>
            <span>{t("باقات معطّلة", "Disabled plans")}</span>
            <strong>{formatNumber(plans.length - activeCount)}</strong>
            <small>{t("لا تظهر عند إضافة عميل جديد", "Not shown when adding a new client")}</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("الباقات", "Plans")}</h2>
            <p>{t("الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.", "The plans shown when adding a new client, their monthly price, and user limit.")}</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => { setIsAddPlanOpen(true); setPlanFormError(""); }}>
              {t("إضافة باقة", "Add Plan")}
            </button>
          </div>
        </div>

        <div className="admin-plan-cards">
          {plans.map((plan) => {
            const subscribers = subscriberCounts[plan.name] || 0;
            return (
              <article className={`admin-plan-card ${plan.active !== 1 ? "is-inactive" : ""}`} key={plan.id}>
                <div className="admin-plan-card-top">
                  <strong>{plan.name}</strong>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={plan.active === 1}
                      disabled={togglingId === plan.id}
                      onChange={() => handleToggleActive(plan)}
                    />
                    <span />
                  </label>
                </div>
                <div className="admin-plan-price">
                  <strong>{formatNumber(plan.monthlyPrice)}</strong>
                  <span>{t("ر.س / شهريًا", "SAR / month")}</span>
                </div>
                <ul className="admin-plan-facts">
                  <li>
                    <span>{t("حد المستخدمين", "User limit")}</span>
                    <strong>{formatNumber(plan.employeeLimit)}</strong>
                  </li>
                  <li>
                    <span>{t("المشتركون", "Subscribers")}</span>
                    <strong>{formatNumber(subscribers)}</strong>
                  </li>
                </ul>
                <div className="admin-plan-card-actions">
                  <button type="button" onClick={() => openEditPlan(plan)}>
                    {t("تعديل الباقة", "Edit Plan")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {plans.length === 0 ? <p className="admin-empty-state">{t("لا توجد باقات بعد.", "No plans yet.")}</p> : null}
      </section>

      {isAddPlanOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="add-plan-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="add-plan-title">{t("إضافة باقة جديدة", "Add a New Plan")}</h2>
              </div>
              <button type="button" onClick={() => setIsAddPlanOpen(false)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleCreatePlan}>
              <label>
                {t("اسم الباقة", "Plan name")}
                <input name="name" placeholder={t("مثال: باقة الأعمال", "Example: Business Plan")} required />
              </label>
              <label>
                {t("السعر الشهري (ر.س)", "Monthly price (SAR)")}
                <input name="monthlyPrice" type="number" min="0" defaultValue="0" required />
              </label>
              <label>
                {t("حد المستخدمين", "User limit")}
                <input name="employeeLimit" type="number" min="1" defaultValue="1" required />
              </label>

              {planFormError ? <p className="admin-form-error">{planFormError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setIsAddPlanOpen(false)}>
                  {t("إلغاء", "Cancel")}
                </button>
                <button type="submit" disabled={isPlanSaving}>
                  {isPlanSaving ? t("جاري الحفظ...", "Saving...") : t("إنشاء الباقة", "Create Plan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editPlan ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="edit-plan-title">{t("تعديل الباقة", "Edit Plan")}</h2>
              </div>
              <button type="button" onClick={() => setEditPlan(null)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleUpdatePlan}>
              <label>
                {t("الباقة", "Plan")}
                <input value={editPlan.name} readOnly />
              </label>
              <label>
                {t("السعر الشهري (ر.س)", "Monthly price (SAR)")}
                <input
                  type="number"
                  min="0"
                  value={editPlanPrice}
                  onChange={(event) => setEditPlanPrice(event.target.value)}
                />
              </label>
              <label>
                {t("حد المستخدمين", "User limit")}
                <input
                  type="number"
                  min="1"
                  value={editPlanLimit}
                  onChange={(event) => setEditPlanLimit(event.target.value)}
                />
              </label>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={editPlanActive}
                  onChange={(event) => setEditPlanActive(event.target.checked)}
                />
                {t("مفعّلة (تظهر عند إضافة عميل جديد)", "Active (shown when adding a new client)")}
              </label>

              {editPlanError ? <p className="admin-form-error">{editPlanError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setEditPlan(null)}>
                  {t("إلغاء", "Cancel")}
                </button>
                <button type="submit" disabled={isEditPlanSaving}>
                  {isEditPlanSaving ? t("جاري الحفظ...", "Saving...") : t("حفظ", "Save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
