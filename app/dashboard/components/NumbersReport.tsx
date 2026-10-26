"use client";

import { useState } from "react";
import { useLanguage } from "../i18n";
import { PHONE_REASON_LABELS, type PhoneRejectReason } from "../../../lib/phone-validation";

export type NumbersReportData = {
  count: number;
  totalRows: number;
  duplicates: number;
  rejected: Array<{ line: number; raw: string; name: string; reason: PhoneRejectReason }>;
  rejectedCount: number;
  sample?: Array<{ phone: string; name: string }>;
};

/** The result of checking a file or pasted numbers: how many can be messaged, and exactly which ones cannot and why. */
export default function NumbersReport({ report, source }: { report: NumbersReportData; source: "file" | "paste" }) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(true);
  const num = (value: number) => value.toLocaleString("en-US");

  function downloadRejected() {
    const lines = [[t("السطر", "Line"), t("الرقم", "Number"), t("الاسم", "Name"), t("السبب", "Reason")].join(",")];
    for (const row of report.rejected) lines.push([row.line, `"${row.raw.replace(/"/g, '""')}"`, `"${row.name.replace(/"/g, '""')}"`, `"${PHONE_REASON_LABELS[row.reason][language === "en" ? 1 : 0]}"`].join(","));
    const url = URL.createObjectURL(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "rejected-numbers.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="numbers-report" role="status">
      <div className="numbers-summary">
        <span className="numbers-chip good"><b>{num(report.count)}</b> {t("رقم معتمد", "accepted")}</span>
        <span className={report.rejectedCount ? "numbers-chip bad" : "numbers-chip"}><b>{num(report.rejectedCount)}</b> {t("رقم غير معتمد", "rejected")}</span>
        {report.duplicates ? <span className="numbers-chip"><b>{num(report.duplicates)}</b> {t("مكرر (حُذف)", "duplicates removed")}</span> : null}
        <span className="numbers-chip"><b>{num(report.totalRows)}</b> {source === "file" ? t("صف في الملف", "rows in file") : t("سطر ملصوق", "pasted lines")}</span>
      </div>
      {report.rejectedCount ? (
        <>
          <p className="numbers-note">{t("هذه الأرقام لن يُرسل لها، وسيُرسل للأرقام المعتمدة فقط. صحّحها ثم أعد المحاولة إن أردت إضافتها.", "These will not be messaged - only the accepted numbers are sent to. Fix them and try again to include them.")}</p>
          <div className="numbers-actions">
            <button className="btn soft" type="button" onClick={() => setOpen(!open)}>{open ? t("إخفاء الأرقام غير المعتمدة", "Hide rejected numbers") : t("عرض الأرقام غير المعتمدة", "Show rejected numbers")}</button>
            <button className="btn soft" type="button" onClick={downloadRejected}>{t("تنزيل الأرقام غير المعتمدة", "Download rejected")}</button>
          </div>
          {open ? (
            <div className="table-wrap numbers-table">
              <table>
                <thead><tr><th>{t("السطر", "Line")}</th><th>{t("الرقم", "Number")}</th><th>{t("الاسم", "Name")}</th><th>{t("سبب الرفض", "Why rejected")}</th></tr></thead>
                <tbody>
                  {report.rejected.map((row, index) => (
                    <tr key={`${row.line}-${index}`}><td>{row.line}</td><td dir="ltr">{row.raw || "—"}</td><td>{row.name || "—"}</td><td><span className="st no">{PHONE_REASON_LABELS[row.reason][language === "en" ? 1 : 0]}</span></td></tr>
                  ))}
                </tbody>
              </table>
              {report.rejectedCount > report.rejected.length ? <p className="muted-copy">{t(`يعرض أول ${num(report.rejected.length)} من ${num(report.rejectedCount)}.`, `Showing the first ${num(report.rejected.length)} of ${num(report.rejectedCount)}.`)}</p> : null}
            </div>
          ) : null}
        </>
      ) : report.count ? <p className="numbers-note good">{t("كل الأرقام صحيحة.", "All numbers look valid.")}</p> : null}
    </div>
  );
}
