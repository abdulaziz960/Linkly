"use client";

import { useCallback, useEffect, useState } from "react";

type GmailStatus = {
  connected: boolean;
  accountName?: string | null;
  accountEmail?: string | null;
};

export default function GmailConnectionPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/email/google/status", { cache: "no-store" });
      const data = (await response.json()) as GmailStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر قراءة حالة الربط");
      setStatus(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر قراءة حالة الربط");
      setStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") setNotice("تم ربط Gmail بنجاح");
    if (params.get("gmail") === "error") setNotice("تعذر إكمال ربط Gmail. حاول مرة أخرى.");
  }, [loadStatus]);

  async function runAction(url: string, successMessage: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(url, { method: "POST" });
      const data = (await response.json()) as { error?: string; imported?: number };
      if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية");
      setNotice(
        typeof data.imported === "number"
          ? `${successMessage} (${data.imported} رسالة)`
          : successMessage
      );
      await loadStatus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      dir="rtl"
      style={{
        border: "1px solid #e2e8f0",
        padding: 20,
        background: "#fff",
        marginBlock: 18
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20 }}>ربط البريد الإلكتروني</h3>
          <p style={{ margin: "7px 0 0", color: "#64748b" }}>
            اربط Gmail لاستقبال رسائل العملاء والرد عليها مباشرة من المنصة.
          </p>
        </div>

        {status?.connected ? (
          <span style={{ color: "#15803d", fontWeight: 700 }}>متصل</span>
        ) : (
          <span style={{ color: "#9a3412", fontWeight: 700 }}>غير متصل</span>
        )}
      </div>

      {status === null ? (
        <p style={{ color: "#64748b" }}>جارٍ التحقق من الربط...</p>
      ) : status.connected ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: 14 }}>
            <strong>{status.accountName || "حساب Gmail"}</strong>
            <div dir="ltr" style={{ color: "#64748b", marginTop: 4, textAlign: "right" }}>
              {status.accountEmail}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} onClick={() => void runAction("/api/email/google/sync", "تمت مزامنة البريد")}>
              مزامنة البريد
            </button>
            <button type="button" disabled={busy} onClick={() => void runAction("/api/email/google/disconnect", "تم فصل Gmail")}>
              فصل الحساب
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => window.location.assign("/api/email/google/connect")}
          style={{ marginTop: 18, background: "#0f172a", color: "#fff", border: 0, padding: "11px 18px", cursor: "pointer" }}
        >
          ربط Gmail
        </button>
      )}

      {notice ? <p role="status" style={{ margin: "14px 0 0", color: "#334155" }}>{notice}</p> : null}
    </section>
  );
}
