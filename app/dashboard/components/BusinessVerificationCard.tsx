"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import type { VerificationState } from "../../../lib/business-verification";

const TONE: Record<VerificationState, string> = { verified: "#15803d", pending: "#b45309", rejected: "#c0392b", not_verified: "#c0392b", unknown: "#64748b" };

/** Meta business verification: shows the status and sends the owner to Meta's Security Center to upload the documents. */
export default function BusinessVerificationCard() {
  const { t } = useLanguage();
  const [data, setData] = useState<{ state: VerificationState; url: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/business-verification", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; data?: { state: VerificationState; url: string; error?: string } } | null;
      if (response.ok && result?.ok && result.data) setData(result.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const label: Record<VerificationState, string> = {
    verified: t("موثّق", "Verified"),
    pending: t("قيد المراجعة", "In review"),
    rejected: t("مرفوض", "Rejected"),
    not_verified: t("غير موثّق", "Not verified"),
    unknown: t("لا تتوفر الحالة", "Status unavailable")
  };
  const state = data?.state ?? "unknown";

  return (
    <div style={{ display: "grid", gap: 10, border: "1px solid var(--line, #cfd9d6)", borderRadius: 12, padding: 14 }}>
      <strong style={{ fontSize: 14 }}>{t("التوثيق التجاري (Business Verification)", "Business Verification")}</strong>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: TONE[state] }}>● {loading && !data ? t("جارٍ التحميل...", "Loading...") : label[state]}</span>
      </div>
      {state !== "verified" ? (
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 1.9, opacity: 0.85 }}>
          <li>{t("يُرفع التوثيق من حساب Meta الخاص بك، فمستندات الشركة لا تمر عبر لنكلي.", "Verification is submitted from your own Meta account; your company documents never pass through Linkly.")}</li>
          <li>{t("جهّز السجل التجاري أو الترخيص، وإثبات عنوان أو هاتف الشركة، وموقعًا إلكترونيًا بنفس اسم النشاط.", "Prepare your commercial registration or licence, proof of the company address or phone, and a website matching the business name.")}</li>
          <li>{t("المراجعة تأخذ عادةً من يوم إلى عدة أيام عمل.", "Review usually takes from one to several business days.")}</li>
        </ul>
      ) : null}
      {data?.error ? <span style={{ fontSize: 12.5, color: "#c0392b" }}>{data.error}</span> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state !== "verified" && data?.url ? <a className="primary-action" href={data.url} target="_blank" rel="noopener noreferrer">{t("فتح صفحة التوثيق في Meta", "Open verification in Meta")}</a> : null}
        <button type="button" className="soft-action" disabled={loading} onClick={() => void load()}>{t("تحديث الحالة", "Refresh status")}</button>
      </div>
    </div>
  );
}
