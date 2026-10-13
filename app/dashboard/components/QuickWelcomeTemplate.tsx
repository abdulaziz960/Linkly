"use client";

import { useState } from "react";
import { useLanguage } from "../i18n";

const SUGGESTIONS = [
  {
    ar: "أهلاً {{1}} 👋 شكرًا لتواصلك معنا، وصلنا طلبك وسيتواصل معك أحد مستشارينا قريبًا. يمكنك كتابة ما تحتاجه هنا مباشرة.",
    en: "Hi {{1}} 👋 Thanks for reaching out. We received your request and one of our advisors will contact you shortly. You can write what you need right here."
  },
  {
    ar: "مرحبًا {{1}}، شكرًا لتعبئة النموذج. استلمنا بياناتك بنجاح، ويسعدنا خدمتك. اكتب لنا هنا وسنرد عليك بأسرع وقت.",
    en: "Hello {{1}}, thanks for filling in the form. We received your details and we're happy to help. Write to us here and we'll reply as soon as possible."
  },
  {
    ar: "أهلاً {{1}}، تم استلام طلبك. فريقنا سيتواصل معك خلال ساعات العمل، وإن كان لديك سؤال عاجل يمكنك مراسلتنا هنا.",
    en: "Hi {{1}}, your request was received. Our team will contact you during working hours, and you can message us here for anything urgent."
  }
];

/**
 * Write a welcome message right where the template is chosen and send it to
 * Meta for approval, instead of going to the Templates page. {{1}} is the
 * customer's name; the sending code fills every variable with it.
 */
export default function QuickWelcomeTemplate({ onCreated }: { onCreated?: () => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    const body = message.trim();
    if (!body) {
      setResult({ ok: false, text: t("اكتب نص الرسالة أولًا.", "Write the message first.") });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const name = `welcome_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          message: body,
          type: "ترحيب",
          category: "UTILITY",
          language: "ar",
          bodyExamples: { "1": "محمد" }
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر إرسال القالب للاعتماد.", "Could not submit the template for approval."));
      setResult({
        ok: true,
        text: t(
          "أُرسلت رسالتك لميتا للاعتماد. تظهر في القائمة بعد الموافقة، وهي تأخذ عادة من دقائق إلى ساعات.",
          "Your message was sent to Meta for approval. It will appear in the list once approved, usually minutes to hours."
        )
      });
      setMessage("");
      onCreated?.();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : t("تعذر إرسال القالب للاعتماد.", "Could not submit the template for approval.") });
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    try {
      await fetch("/api/templates/sync-meta", { method: "POST" });
      onCreated?.();
      setResult({ ok: true, text: t("تم تحديث حالة القوالب.", "Template statuses refreshed.") });
    } catch {
      setResult({ ok: false, text: t("تعذر تحديث الحالة.", "Could not refresh the status.") });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          justifySelf: "start",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 46,
          padding: "0 18px",
          borderRadius: 12,
          border: "1.5px solid var(--primary, #0f6b5c)",
          background: "var(--surface, #fff)",
          color: "var(--primary, #0f6b5c)",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer"
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
        {t("اكتب رسالة ترحيب جديدة", "Write a new welcome message")}
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, padding: 14, borderRadius: 12, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, #f6faf9)" }}>
      <b>{t("اكتب رسالة الترحيب وأرسلها للاعتماد", "Write the welcome message and submit it for approval")}</b>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <small style={{ width: "100%", opacity: 0.75 }}>{t("اقتراحات جاهزة، اضغط واحدًا لتعديله:", "Ready suggestions, tap one to edit it:")}</small>
        {SUGGESTIONS.map((suggestion, index) => (
          <button key={index} type="button" className="btn soft" style={{ textAlign: "start", whiteSpace: "normal", lineHeight: 1.7 }} onClick={() => setMessage(t(suggestion.ar, suggestion.en))}>
            {t(suggestion.ar, suggestion.en)}
          </button>
        ))}
      </div>
      <textarea
        value={message}
        maxLength={1024}
        rows={4}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t("اكتب رسالتك هنا. اكتب {{1}} مكان اسم العميل.", "Write your message. Use {{1}} where the customer's name goes.")}
      />
      <small style={{ opacity: 0.75, lineHeight: 1.7 }}>
        {t(
          "{{1}} يُستبدل باسم العميل. تجنّب الأسعار والعروض الترويجية لتزيد فرصة الاعتماد. لا يمكن تعديل الرسالة بعد الاعتماد.",
          "{{1}} is replaced by the customer's name. Avoid prices and promotions to improve approval. A message can't be edited after approval."
        )}
      </small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>
          {busy ? t("جارٍ الإرسال...", "Sending...") : t("إرسال للاعتماد من ميتا", "Submit to Meta for approval")}
        </button>
        <button type="button" className="btn soft" disabled={busy} onClick={() => void refreshStatus()}>{t("تحديث الحالة", "Refresh status")}</button>
        <button type="button" className="btn soft" disabled={busy} onClick={() => setOpen(false)}>{t("إغلاق", "Close")}</button>
      </div>
      {result ? <div className={`automation-feedback ${result.ok ? "success" : "error"}`} role="status">{result.text}</div> : null}
    </div>
  );
}
