"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { RenewalAlert } from "../utils";
import type { SubscriptionRow } from "../types";
import { formatNumber, getRenewalAlert, RENEWAL_SOON_DAYS } from "../utils";

export default function AlertsView({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const [chargeClient, setChargeClient] = useState<SubscriptionRow | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [isCharging, setIsCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeUrl, setChargeUrl] = useState("");

  const renewalAlerts = subscriptions
    .map((subscription) => ({ subscription, alert: getRenewalAlert(subscription) }))
    .filter((item): item is { subscription: SubscriptionRow; alert: RenewalAlert } => item.alert !== null)
    .sort((a, b) => (a.alert.tier === "overdue" ? 0 : 1) - (b.alert.tier === "overdue" ? 0 : 1));

  function openChargeModal(client: SubscriptionRow) {
    setChargeClient(client);
    setChargeAmount(String(client.amount || 499));
    setChargeError("");
    setChargeUrl("");
  }

  async function handleCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chargeClient) return;

    const amount = Number(chargeAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setChargeError("اكتب قيمة فاتورة صحيحة");
      return;
    }

    setIsCharging(true);
    setChargeError("");
    setChargeUrl("");

    const response = await fetch("/api/admin/subscriptions/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: chargeClient.tenantId, amount })
    });
    const result = (await response.json()) as { ok: boolean; paymentUrl?: string; error?: string };

    setIsCharging(false);

    if (!response.ok || !result.ok || !result.paymentUrl) {
      setChargeError(result.error || "تعذر إنشاء طلب الدفع");
      return;
    }

    setChargeUrl(result.paymentUrl);
  }

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>تنبيهات التجديد</h2>
            <p>اشتراكات نشطة تحتاج متابعة: تجديد قريب خلال {formatNumber(RENEWAL_SOON_DAYS)} أيام أو متأخرة عن موعدها.</p>
          </div>
        </div>
        <div className="admin-list">
          {renewalAlerts.map(({ subscription, alert }) => (
            <div className="admin-list-row" key={subscription.tenantId}>
              <div>
                <strong>{subscription.companyName}</strong>
                <span>{subscription.plan} · التجديد: {subscription.renewalAt || "غير محدد"}</span>
              </div>
              <span className={`admin-pill ${alert.tier === "overdue" ? "is-danger" : "is-warn"}`}>{alert.label}</span>
              <button type="button" onClick={() => openChargeModal(subscription)}>
                شحن الاشتراك
              </button>
            </div>
          ))}
          {!renewalAlerts.length ? <p className="admin-empty-state">لا توجد اشتراكات تحتاج متابعة حاليًا.</p> : null}
        </div>
      </section>

      {chargeClient ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="charge-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="charge-title">شحن / تجديد الاشتراك</h2>
                <p>ينشئ رابط دفع Moyasar حقيقي لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا.</p>
              </div>
              <button type="button" onClick={() => setChargeClient(null)} aria-label="إغلاق">
                ×
              </button>
            </div>

            {chargeUrl ? (
              <div className="admin-invite-result">
                <p>تم إنشاء رابط الدفع. أرسله للعميل ليكمل الدفع:</p>
                <a className="activation-link" href={chargeUrl} target="_blank" rel="noreferrer">
                  فتح رابط الدفع
                </a>
                <div className="admin-form-actions">
                  <button type="button" onClick={() => setChargeClient(null)}>
                    تم
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleCharge}>
                <label>
                  العميل
                  <input value={chargeClient.companyName} readOnly />
                </label>
                <label>
                  قيمة الفاتورة (ر.س)
                  <input
                    type="number"
                    min="1"
                    value={chargeAmount}
                    onChange={(event) => setChargeAmount(event.target.value)}
                  />
                </label>

                {chargeError ? <p className="admin-form-error">{chargeError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setChargeClient(null)}>
                    إلغاء
                  </button>
                  <button type="submit" disabled={isCharging}>
                    {isCharging ? "جاري الإنشاء..." : "إنشاء رابط الدفع"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
