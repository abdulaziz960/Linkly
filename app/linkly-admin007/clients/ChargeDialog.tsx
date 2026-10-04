"use client";

import { useState, type FormEvent } from "react";
import type { SubscriptionRow } from "../types";
import { Button } from "../ds/primitives";
import { Dialog } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";

/**
 * Creates a real payment link for a client's subscription. The parent keys
 * this by client so each opening starts from fresh state.
 */
export default function ChargeDialog({ client, onClose }: { client: SubscriptionRow | null; onClose: () => void }) {
  return client ? <ChargeDialogBody key={client.tenantId} client={client} onClose={onClose} /> : null;
}

function ChargeDialogBody({ client, onClose }: { client: SubscriptionRow; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(client.amount || 499));
  const [gateway, setGateway] = useState<"moyasar" | "stripe">("moyasar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  function close() {
    if (!busy) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) return setError("اكتب قيمة فاتورة صحيحة (1 ر.س على الأقل).");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/subscriptions/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: client.tenantId, amount: value, gateway })
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; paymentUrl?: string; error?: string };
      if (!response.ok || !result.ok || !result.paymentUrl) return setError(result.error || "تعذر إنشاء رابط الدفع");
      setUrl(result.paymentUrl);
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("success", "تم نسخ الرابط");
    } catch {
      toast("error", "تعذر النسخ", "انسخ الرابط يدويًا من الحقل.");
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      title="شحن / تجديد الاشتراك"
      description="ينشئ رابط دفع حقيقيًا لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا."
      footer={
        url ? (
          <Button variant="primary" onClick={onClose}>تم</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>إلغاء</Button>
            <Button variant="primary" type="submit" form="charge-form" loading={busy}>إنشاء رابط الدفع</Button>
          </>
        )
      }
    >
      {url ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0 }}>تم إنشاء رابط الدفع. أرسله للعميل ليكمل الدفع:</p>
          <input className="ds-input" readOnly dir="ltr" value={url} aria-label="رابط الدفع" onFocus={(event) => event.currentTarget.select()} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" icon="external" onClick={() => window.open(url, "_blank", "noreferrer")}>فتح رابط الدفع</Button>
            <Button variant="outline" onClick={() => void copy()}>نسخ الرابط</Button>
          </div>
        </div>
      ) : (
        <form id="charge-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label className="ds-field">العميل<input className="ds-input" readOnly value={client.companyName} /></label>
          <label className="ds-field">
            بوابة الدفع
            <select className="ds-select" value={gateway} onChange={(event) => setGateway(event.target.value as "moyasar" | "stripe")}>
              <option value="moyasar">Moyasar</option>
              <option value="stripe">Stripe (وضع اختبار)</option>
            </select>
          </label>
          <label className="ds-field">قيمة الفاتورة (ر.س)<input data-autofocus className="ds-input" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
        </form>
      )}
    </Dialog>
  );
}
