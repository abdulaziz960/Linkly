"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { PlanRow } from "../types";
import { formatNumber } from "../utils";

export default function PlansView({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false);
  const [isPlanSaving, setIsPlanSaving] = useState(false);
  const [planFormError, setPlanFormError] = useState("");
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null);
  const [editPlanPrice, setEditPlanPrice] = useState("");
  const [editPlanLimit, setEditPlanLimit] = useState("");
  const [editPlanActive, setEditPlanActive] = useState(true);
  const [isEditPlanSaving, setIsEditPlanSaving] = useState(false);
  const [editPlanError, setEditPlanError] = useState("");

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
      setPlanFormError(result.error || "تعذر إنشاء الباقة");
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
      setEditPlanError("تحقق من السعر وحد المستخدمين");
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
      setEditPlanError(result.error || "تعذر تحديث الباقة");
      return;
    }

    setEditPlan(null);
    router.refresh();
  }

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>الباقات</h2>
            <p>الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => { setIsAddPlanOpen(true); setPlanFormError(""); }}>
              إضافة باقة
            </button>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>الباقة</th>
                <th>السعر الشهري</th>
                <th>حد المستخدمين</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.name}</td>
                  <td>{formatNumber(plan.monthlyPrice)} ر.س</td>
                  <td>{formatNumber(plan.employeeLimit)}</td>
                  <td>
                    <span className={`admin-pill ${plan.active === 1 ? "is-good" : "is-danger"}`}>
                      {plan.active === 1 ? "مفعّلة" : "معطّلة"}
                    </span>
                  </td>
                  <td>
                    <button type="button" onClick={() => openEditPlan(plan)}>
                      تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plans.length === 0 ? <p className="admin-empty-state">لا توجد باقات بعد.</p> : null}
      </section>

      {isAddPlanOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="add-plan-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="add-plan-title">إضافة باقة جديدة</h2>
              </div>
              <button type="button" onClick={() => setIsAddPlanOpen(false)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleCreatePlan}>
              <label>
                اسم الباقة
                <input name="name" placeholder="مثال: باقة الأعمال" required />
              </label>
              <label>
                السعر الشهري (ر.س)
                <input name="monthlyPrice" type="number" min="0" defaultValue="0" required />
              </label>
              <label>
                حد المستخدمين
                <input name="employeeLimit" type="number" min="1" defaultValue="1" required />
              </label>

              {planFormError ? <p className="admin-form-error">{planFormError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setIsAddPlanOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isPlanSaving}>
                  {isPlanSaving ? "جاري الحفظ..." : "إنشاء الباقة"}
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
                <h2 id="edit-plan-title">تعديل الباقة</h2>
              </div>
              <button type="button" onClick={() => setEditPlan(null)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleUpdatePlan}>
              <label>
                الباقة
                <input value={editPlan.name} readOnly />
              </label>
              <label>
                السعر الشهري (ر.س)
                <input
                  type="number"
                  min="0"
                  value={editPlanPrice}
                  onChange={(event) => setEditPlanPrice(event.target.value)}
                />
              </label>
              <label>
                حد المستخدمين
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
                مفعّلة (تظهر عند إضافة عميل جديد)
              </label>

              {editPlanError ? <p className="admin-form-error">{editPlanError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setEditPlan(null)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isEditPlanSaving}>
                  {isEditPlanSaving ? "جاري الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
