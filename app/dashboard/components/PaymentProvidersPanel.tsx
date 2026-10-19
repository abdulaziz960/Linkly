"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Status = { provider: "tabby" | "tamara"; enabled: boolean; configured: boolean; testMode: boolean; merchantCode?: string; hasPublicKey: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, error: payload?.error || "حدث خطأ" };
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }
}

/** Tabby and Tamara (buy now, pay later): keys, and a switch for each. Cards (Moyasar) stay in the section above. */
export default function PaymentProvidersPanel({ canManage }: { canManage: boolean }) {
  const { t } = useLanguage();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [storeConnected, setStoreConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState("");
  const [tabby, setTabby] = useState({ secretKey: "", publicKey: "", merchantCode: "" });
  const [tamara, setTamara] = useState({ apiToken: "", publicKey: "", notificationToken: "", sandbox: false });

  const load = useCallback(async () => {
    const result = await api<{ providers: Status[]; storeConnected: boolean }>("/api/catalog/payment-providers");
    if (result.ok && result.data) {
      setStatuses(result.data.providers);
      setStoreConnected(result.data.storeConnected);
      const saved = result.data.providers.find((status) => status.provider === "tamara");
      if (saved) setTamara((current) => ({ ...current, sandbox: saved.testMode }));
      const savedTabby = result.data.providers.find((status) => status.provider === "tabby");
      if (savedTabby?.merchantCode) setTabby((current) => ({ ...current, merchantCode: savedTabby.merchantCode ?? "" }));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(provider: "tabby" | "tamara", fields: Record<string, unknown>, success: string) {
    setSaving(provider);
    setMessage(null);
    const result = await api<{ providers: Status[] }>("/api/catalog/payment-providers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, ...fields }) });
    setSaving("");
    if (!result.ok) {
      setMessage({ type: "error", text: result.error || t("تعذر الحفظ", "Could not save") });
      return false;
    }
    if (result.data) setStatuses(result.data.providers);
    setMessage({ type: "success", text: success });
    return true;
  }

  async function remove(provider: "tabby" | "tamara") {
    if (!window.confirm(provider === "tabby" ? t("حذف إعدادات تابي؟", "Remove the Tabby settings?") : t("حذف إعدادات تمارا؟", "Remove the Tamara settings?"))) return;
    const result = await api<{ providers: Status[] }>(`/api/catalog/payment-providers?provider=${provider}`, { method: "DELETE" });
    if (result.ok && result.data) {
      setStatuses(result.data.providers);
      if (provider === "tabby") setTabby({ secretKey: "", publicKey: "", merchantCode: "" });
      else setTamara({ apiToken: "", publicKey: "", notificationToken: "", sandbox: false });
      setMessage({ type: "success", text: t("تم الحذف", "Removed") });
    }
  }

  if (!loaded || storeConnected) return null;
  const tabbyStatus = statuses.find((status) => status.provider === "tabby");
  const tamaraStatus = statuses.find((status) => status.provider === "tamara");

  return (
    <div className="panel">
      <div className="panel-head"><h2>{t("طرق دفع إضافية: تابي وتمارا", "More payment methods: Tabby and Tamara")}</h2></div>
      <div className="panel-body">
        <p>{t("فعّل التقسيط لعملائك. عند إتمام الدفع، إن كانت أكثر من طريقة مفعّلة (مع البطاقة) يختار العميل طريقته من أزرار في واتساب. يمكنك تفعيل كل طريقة أو إيقافها متى شئت.", "Offer instalments. At checkout, if more than one method is on (cards included) the customer picks from WhatsApp buttons. You can switch each method on or off at any time.")}</p>
        <p className="muted-copy">{t("تحتاج حساب تاجر معتمد لدى تابي ولدى تمارا. نحتفظ بالمفاتيح مشفّرة ولا تظهر مرة أخرى.", "You need an approved merchant account with Tabby and with Tamara. Keys are stored encrypted and never shown again.")}</p>
        {message ? <p className={`automation-feedback ${message.type}`} role="status">{message.text}</p> : null}
        {!canManage ? <p className="muted-copy">{t("إعدادات الدفع متاحة لمالك الحساب فقط.", "Payment settings are available to the account owner only.")}</p> : null}
      </div>

      <div className="panel-body">
        <h3>{t("تابي (Tabby)", "Tabby")}</h3>
        <label className="automation-switch">
          <input type="checkbox" checked={Boolean(tabbyStatus?.enabled)} disabled={!canManage || !tabbyStatus?.configured || saving === "tabby"} aria-label={t("تفعيل تابي", "Enable Tabby")} onChange={(event) => void save("tabby", { enabled: event.target.checked }, event.target.checked ? t("تم تفعيل تابي", "Tabby is on") : t("تم إيقاف تابي", "Tabby is off"))} />
          <span>{tabbyStatus?.enabled ? t("تابي مفعّل", "Tabby on") : t("تابي متوقف", "Tabby off")}{tabbyStatus?.configured && tabbyStatus.testMode ? ` · ${t("وضع تجريبي", "test mode")}` : ""}</span>
        </label>
        {canManage ? (
          <>
            <label className="reengagement-field">
              <span>{t("المفتاح السري (Secret Key)", "Secret Key")}</span>
              <input type="password" dir="ltr" autoComplete="off" value={tabby.secretKey} onChange={(event) => setTabby({ ...tabby, secretKey: event.target.value })} placeholder={tabbyStatus?.configured ? "••••••••••••" : "sk_test_..."} />
              <small>{tabbyStatus?.configured ? t("مفتاح محفوظ. اكتب مفتاحًا جديدًا لاستبداله.", "Key saved. Type a new key to replace it.") : t("من لوحة تابي. يبدأ بـ sk_ (أو sk_test_ للتجربة).", "From the Tabby dashboard. Starts with sk_ (sk_test_ for testing).")}</small>
            </label>
            <label className="reengagement-field">
              <span>{t("المفتاح العام (Public Key)", "Public Key")}</span>
              <input dir="ltr" autoComplete="off" value={tabby.publicKey} onChange={(event) => setTabby({ ...tabby, publicKey: event.target.value })} placeholder={tabbyStatus?.hasPublicKey ? t("محفوظ. اكتب مفتاحًا جديدًا لاستبداله", "Saved. Type a new one to replace it") : "pk_test_..."} />
              <small>{t("يبدأ بـ pk_ (أو pk_test_). لا يلزم لقبول الدفع، ونحفظه لعرض إعلانات تابي في المحادثة لاحقًا.", "Starts with pk_ (pk_test_). Not needed to take payments; saved for Tabby on-site messaging later.")}</small>
            </label>
            <label className="reengagement-field">
              <span>{t("رمز التاجر (Merchant Code)", "Merchant Code")}</span>
              <input dir="ltr" autoComplete="off" value={tabby.merchantCode} onChange={(event) => setTabby({ ...tabby, merchantCode: event.target.value })} placeholder="your_merchant_code" />
              <small>{t("الرمز الذي سلّمه لك تابي لفرعك.", "The code Tabby gave your branch.")}</small>
            </label>
            <div className="row-actions">
              <button className="btn primary" type="button" disabled={saving === "tabby" || (!tabby.secretKey.trim() && !tabbyStatus?.configured) || !tabby.merchantCode.trim()} onClick={() => void save("tabby", { secretKey: tabby.secretKey.trim(), publicKey: tabby.publicKey.trim(), merchantCode: tabby.merchantCode.trim(), enabled: true }, t("تم حفظ تابي وتفعيله", "Tabby saved and turned on")).then((ok) => { if (ok) setTabby((current) => ({ ...current, secretKey: "", publicKey: "" })); })}>{saving === "tabby" ? t("جاري التحقق...", "Checking...") : t("حفظ وتفعيل", "Save and turn on")}</button>
              {tabbyStatus?.configured ? <button className="btn danger" type="button" onClick={() => void remove("tabby")}>{t("حذف الإعدادات", "Remove")}</button> : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="panel-body">
        <h3>{t("تمارا (Tamara)", "Tamara")}</h3>
        <label className="automation-switch">
          <input type="checkbox" checked={Boolean(tamaraStatus?.enabled)} disabled={!canManage || !tamaraStatus?.configured || saving === "tamara"} aria-label={t("تفعيل تمارا", "Enable Tamara")} onChange={(event) => void save("tamara", { enabled: event.target.checked }, event.target.checked ? t("تم تفعيل تمارا", "Tamara is on") : t("تم إيقاف تمارا", "Tamara is off"))} />
          <span>{tamaraStatus?.enabled ? t("تمارا مفعّلة", "Tamara on") : t("تمارا متوقفة", "Tamara off")}{tamaraStatus?.configured && tamaraStatus.testMode ? ` · ${t("وضع تجريبي", "sandbox")}` : ""}</span>
        </label>
        {canManage ? (
          <>
            <label className="reengagement-field">
              <span>{t("رمز الواجهة (API Token)", "API Token")}</span>
              <input type="password" dir="ltr" autoComplete="off" value={tamara.apiToken} onChange={(event) => setTamara({ ...tamara, apiToken: event.target.value })} placeholder={tamaraStatus?.configured ? "••••••••••••" : ""} />
              <small>{tamaraStatus?.configured ? t("رمز محفوظ. اكتب رمزًا جديدًا لاستبداله.", "Token saved. Type a new one to replace it.") : t("من حساب تمارا للتجار (Partners Portal).", "From your Tamara merchant account (Partners Portal).")}</small>
            </label>
            <label className="reengagement-field">
              <span>{t("المفتاح العام (Public Key) — اختياري", "Public Key — optional")}</span>
              <input dir="ltr" autoComplete="off" value={tamara.publicKey} onChange={(event) => setTamara({ ...tamara, publicKey: event.target.value })} placeholder={tamaraStatus?.hasPublicKey ? t("محفوظ. اكتب مفتاحًا جديدًا لاستبداله", "Saved. Type a new one to replace it") : ""} />
              <small>{t("لا يلزم لقبول الدفع، ونحفظه لعرض ودجات تمارا في المحادثة لاحقًا.", "Not needed to take payments; saved for Tamara widgets later.")}</small>
            </label>
            <label className="reengagement-field">
              <span>{t("رمز الإشعارات (Notification Token) — اختياري", "Notification Token — optional")}</span>
              <input type="password" dir="ltr" autoComplete="off" value={tamara.notificationToken} onChange={(event) => setTamara({ ...tamara, notificationToken: event.target.value })} />
            </label>
            <label className="automation-switch">
              <input type="checkbox" checked={tamara.sandbox} onChange={(event) => setTamara({ ...tamara, sandbox: event.target.checked })} />
              <span>{t("بيئة تجريبية (Sandbox)", "Sandbox (testing)")}</span>
            </label>
            <div className="row-actions">
              <button className="btn primary" type="button" disabled={saving === "tamara" || (!tamara.apiToken.trim() && !tamaraStatus?.configured)} onClick={() => void save("tamara", { apiToken: tamara.apiToken.trim(), publicKey: tamara.publicKey.trim(), notificationToken: tamara.notificationToken.trim(), sandbox: tamara.sandbox, enabled: true }, t("تم حفظ تمارا وتفعيلها", "Tamara saved and turned on")).then((ok) => { if (ok) setTamara((current) => ({ ...current, apiToken: "", publicKey: "", notificationToken: "" })); })}>{saving === "tamara" ? t("جاري التحقق...", "Checking...") : t("حفظ وتفعيل", "Save and turn on")}</button>
              {tamaraStatus?.configured ? <button className="btn danger" type="button" onClick={() => void remove("tamara")}>{t("حذف الإعدادات", "Remove")}</button> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
