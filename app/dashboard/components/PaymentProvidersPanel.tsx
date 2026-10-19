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
  const pill = (status: Status | undefined) => {
    if (!status?.configured) return <span className="pay-pill off">{t("غير مربوط", "Not set up")}</span>;
    if (!status.enabled) return <span className="pay-pill off">{t("متوقف", "Off")}</span>;
    return <span className={`pay-pill ${status.testMode ? "test" : "on"}`}>{status.testMode ? t("مفعّل (تجريبي)", "On (test)") : t("مفعّل", "On")}</span>;
  };

  return (
    <>
      {message ? <p className={`automation-feedback pay-feedback ${message.type}`} role="status">{message.text}</p> : null}

      <div className="pay-card">
        <div className="pay-card-head">
          <div className="pay-card-title">
            <h3>{t("تابي (Tabby)", "Tabby")}</h3>
            <small>{t("قسّم المشتريات على دفعات", "Split purchases into instalments")}</small>
          </div>
          {pill(tabbyStatus)}
        </div>
        <label className="pay-switch">
          <input type="checkbox" checked={Boolean(tabbyStatus?.enabled)} disabled={!canManage || !tabbyStatus?.configured || saving === "tabby"} aria-label={t("تفعيل تابي", "Enable Tabby")} onChange={(event) => void save("tabby", { enabled: event.target.checked }, event.target.checked ? t("تم تفعيل تابي", "Tabby is on") : t("تم إيقاف تابي", "Tabby is off"))} />
          <span>{tabbyStatus?.enabled ? t("ظاهر لعملائك عند الدفع", "Shown to customers at checkout") : t("غير ظاهر لعملائك", "Not shown to customers")}</span>
        </label>
        {canManage ? (
          <>
            <div className="pay-fields">
              <label className="reengagement-field">
                <span>{t("المفتاح السري (Secret Key)", "Secret Key")}</span>
                <input type="password" dir="ltr" autoComplete="off" value={tabby.secretKey} onChange={(event) => setTabby({ ...tabby, secretKey: event.target.value })} placeholder={tabbyStatus?.configured ? "••••••••••••" : "sk_test_..."} />
                <small>{tabbyStatus?.configured ? t("محفوظ. اكتب مفتاحًا جديدًا لاستبداله.", "Saved. Type a new key to replace it.") : t("يبدأ بـ sk_ (أو sk_test_ للتجربة).", "Starts with sk_ (sk_test_ for testing).")}</small>
              </label>
              <label className="reengagement-field">
                <span>{t("المفتاح العام (Public Key)", "Public Key")}</span>
                <input dir="ltr" autoComplete="off" value={tabby.publicKey} onChange={(event) => setTabby({ ...tabby, publicKey: event.target.value })} placeholder={tabbyStatus?.hasPublicKey ? t("محفوظ", "Saved") : "pk_test_..."} />
                <small>{t("اختياري: لعرض إعلانات تابي لاحقًا.", "Optional: for Tabby messaging later.")}</small>
              </label>
              <label className="reengagement-field">
                <span>{t("رمز التاجر (Merchant Code)", "Merchant Code")}</span>
                <input dir="ltr" autoComplete="off" value={tabby.merchantCode} onChange={(event) => setTabby({ ...tabby, merchantCode: event.target.value })} placeholder="your_merchant_code" />
                <small>{t("الرمز الذي سلّمه لك تابي لفرعك.", "The code Tabby gave your branch.")}</small>
              </label>
            </div>
            <div className="pay-card-foot">
              <button className="btn primary" type="button" disabled={saving === "tabby" || (!tabby.secretKey.trim() && !tabbyStatus?.configured) || !tabby.merchantCode.trim()} onClick={() => void save("tabby", { secretKey: tabby.secretKey.trim(), publicKey: tabby.publicKey.trim(), merchantCode: tabby.merchantCode.trim(), enabled: true }, t("تم حفظ تابي وتفعيله", "Tabby saved and turned on")).then((ok) => { if (ok) setTabby((current) => ({ ...current, secretKey: "", publicKey: "" })); })}>{saving === "tabby" ? t("جاري التحقق...", "Checking...") : t("حفظ وتفعيل", "Save and turn on")}</button>
              {tabbyStatus?.configured ? <button className="btn danger" type="button" onClick={() => void remove("tabby")}>{t("حذف", "Remove")}</button> : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="pay-card">
        <div className="pay-card-head">
          <div className="pay-card-title">
            <h3>{t("تمارا (Tamara)", "Tamara")}</h3>
            <small>{t("ادفع على دفعات مع تمارا", "Pay in instalments with Tamara")}</small>
          </div>
          {pill(tamaraStatus)}
        </div>
        <label className="pay-switch">
          <input type="checkbox" checked={Boolean(tamaraStatus?.enabled)} disabled={!canManage || !tamaraStatus?.configured || saving === "tamara"} aria-label={t("تفعيل تمارا", "Enable Tamara")} onChange={(event) => void save("tamara", { enabled: event.target.checked }, event.target.checked ? t("تم تفعيل تمارا", "Tamara is on") : t("تم إيقاف تمارا", "Tamara is off"))} />
          <span>{tamaraStatus?.enabled ? t("ظاهرة لعملائك عند الدفع", "Shown to customers at checkout") : t("غير ظاهرة لعملائك", "Not shown to customers")}</span>
        </label>
        {canManage ? (
          <>
            <div className="pay-fields">
              <label className="reengagement-field">
                <span>{t("رمز الواجهة (API Token)", "API Token")}</span>
                <input type="password" dir="ltr" autoComplete="off" value={tamara.apiToken} onChange={(event) => setTamara({ ...tamara, apiToken: event.target.value })} placeholder={tamaraStatus?.configured ? "••••••••••••" : ""} />
                <small>{tamaraStatus?.configured ? t("محفوظ. اكتب رمزًا جديدًا لاستبداله.", "Saved. Type a new one to replace it.") : t("من حساب تمارا للتجار (Partners Portal).", "From your Tamara merchant account.")}</small>
              </label>
              <label className="reengagement-field">
                <span>{t("المفتاح العام (Public Key)", "Public Key")}</span>
                <input dir="ltr" autoComplete="off" value={tamara.publicKey} onChange={(event) => setTamara({ ...tamara, publicKey: event.target.value })} placeholder={tamaraStatus?.hasPublicKey ? t("محفوظ", "Saved") : ""} />
                <small>{t("اختياري: لعرض ودجات تمارا لاحقًا.", "Optional: for Tamara widgets later.")}</small>
              </label>
              <label className="reengagement-field">
                <span>{t("رمز الإشعارات (Notification Token)", "Notification Token")}</span>
                <input type="password" dir="ltr" autoComplete="off" value={tamara.notificationToken} onChange={(event) => setTamara({ ...tamara, notificationToken: event.target.value })} />
                <small>{t("اختياري.", "Optional.")}</small>
              </label>
              <label className="pay-switch">
                <input type="checkbox" checked={tamara.sandbox} onChange={(event) => setTamara({ ...tamara, sandbox: event.target.checked })} />
                <span>{t("بيئة تجريبية (Sandbox)", "Sandbox (testing)")}</span>
              </label>
            </div>
            <div className="pay-card-foot">
              <button className="btn primary" type="button" disabled={saving === "tamara" || (!tamara.apiToken.trim() && !tamaraStatus?.configured)} onClick={() => void save("tamara", { apiToken: tamara.apiToken.trim(), publicKey: tamara.publicKey.trim(), notificationToken: tamara.notificationToken.trim(), sandbox: tamara.sandbox, enabled: true }, t("تم حفظ تمارا وتفعيلها", "Tamara saved and turned on")).then((ok) => { if (ok) setTamara((current) => ({ ...current, apiToken: "", publicKey: "", notificationToken: "" })); })}>{saving === "tamara" ? t("جاري التحقق...", "Checking...") : t("حفظ وتفعيل", "Save and turn on")}</button>
              {tamaraStatus?.configured ? <button className="btn danger" type="button" onClick={() => void remove("tamara")}>{t("حذف", "Remove")}</button> : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
