"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { RenewalAlert } from "../utils";
import type { SubscriptionRow } from "../types";
import { formatNumber, getRenewalAlert, RENEWAL_SOON_DAYS } from "../utils";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

export default function AlertsView({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const { t } = useLanguage();
  const [chargeClient, setChargeClient] = useState<SubscriptionRow | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeGateway, setChargeGateway] = useState<"moyasar" | "stripe">("moyasar");
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
      setChargeError(t("اكتب قيمة فاتورة صحيحة", "Enter a valid invoice amount"));
      return;
    }

    setIsCharging(true);
    setChargeError("");
    setChargeUrl("");

    const response = await fetch("/api/admin/subscriptions/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: chargeClient.tenantId, amount, gateway: chargeGateway })
    });
    const result = (await response.json()) as { ok: boolean; paymentUrl?: string; error?: string };

    setIsCharging(false);

    if (!response.ok || !result.ok || !result.paymentUrl) {
      setChargeError(result.error || t("تعذر إنشاء طلب الدفع", "Could not create the payment request"));
      return;
    }

    setChargeUrl(result.paymentUrl);
  }

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("تنبيهات التجديد", "Renewal Alerts")}</h2>
            <p>
              {t(
                `اشتراكات نشطة تحتاج متابعة: تجديد قريب خلال ${formatNumber(RENEWAL_SOON_DAYS)} أيام أو متأخرة عن موعدها.`,
                `Active subscriptions that need follow-up: renewal due within ${formatNumber(RENEWAL_SOON_DAYS)} days or already overdue.`
              )}
            </p>
          </div>
        </div>
        <div className="admin-list">
          {renewalAlerts.map(({ subscription, alert }) => (
            <div className="admin-list-row" key={subscription.tenantId}>
              <div>
                <strong>{subscription.companyName}</strong>
                <span>{subscription.plan} · {t("التجديد", "Renewal")}: {subscription.renewalAt || t("غير محدد", "Not set")}</span>
              </div>
              <span className={`admin-pill ${alert.tier === "overdue" ? "is-danger" : "is-warn"}`}>{alert.label}</span>
              <button type="button" onClick={() => openChargeModal(subscription)}>
                {t("شحن الاشتراك", "Charge Subscription")}
              </button>
            </div>
          ))}
          {!renewalAlerts.length ? <p className="admin-empty-state">{t("لا توجد اشتراكات تحتاج متابعة حاليًا.", "No subscriptions need follow-up right now.")}</p> : null}
        </div>
      </section>

      {chargeClient ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="charge-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="charge-title">{t("شحن / تجديد الاشتراك", "Charge / Renew Subscription")}</h2>
                <p>{t("ينشئ رابط دفع حقيقي لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا.", "Creates a real payment link to send to the client. Once paid, the subscription activates automatically.")}</p>
              </div>
              <button type="button" onClick={() => setChargeClient(null)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            {chargeUrl ? (
              <div className="admin-invite-result">
                <p>{t("تم إنشاء رابط الدفع. أرسله للعميل ليكمل الدفع:", "The payment link has been created. Send it to the client to complete the payment:")}</p>
                <a className="activation-link" href={chargeUrl} target="_blank" rel="noreferrer">
                  {t("فتح رابط الدفع", "Open Payment Link")}
                </a>
                <div className="admin-form-actions">
                  <button type="button" onClick={() => setChargeClient(null)}>
                    {t("تم", "Done")}
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleCharge}>
                <label>
                  {t("العميل", "Client")}
                  <input value={chargeClient.companyName} readOnly />
                </label>
                <label>
                  {t("بوابة الدفع", "Payment Gateway")}
                  <CustomSelect
                    value={chargeGateway}
                    onChange={(value) => setChargeGateway(value as "moyasar" | "stripe")}
                    options={[
                      { value: "moyasar", label: "Moyasar" },
                      { value: "stripe", label: t("Stripe (وضع اختبار)", "Stripe (test mode)") }
                    ]}
                  />
                </label>
                <label>
                  {t("قيمة الفاتورة (ر.س)", "Invoice Amount (SAR)")}
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
                    {t("إلغاء", "Cancel")}
                  </button>
                  <button type="submit" disabled={isCharging}>
                    {isCharging ? t("جاري الإنشاء...", "Creating...") : t("إنشاء رابط الدفع", "Create Payment Link")}
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
