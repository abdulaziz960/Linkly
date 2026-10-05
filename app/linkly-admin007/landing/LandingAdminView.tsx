"use client";

import { useState } from "react";
import type { LandingRow } from "../../../lib/landing-content";
import { callAdminApi, jsonInit } from "../content-api";
import { Badge, Button, Segmented, Section } from "../ds/primitives";
import { useToast } from "../ds/Toast";

type Lang = "ar" | "en";
const SAVED = "يظهر التعديل في الصفحة الرئيسية خلال نحو نصف دقيقة.";

export default function LandingAdminView({ initialRows }: { initialRows: LandingRow[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<LandingRow[]>(initialRows);
  const [lang, setLang] = useState<Lang>("ar");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const valueOf = (row: LandingRow) => drafts[row.id] ?? row.override;

  async function save(row: LandingRow, value: string) {
    setBusy(row.id);
    const result = await callAdminApi(`/api/admin/landing`, jsonInit("PUT", { id: row.id, value }));
    setBusy("");
    if (!result.ok) return toast("error", "تعذر الحفظ", result.error);
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, override: value.trim() } : item)));
    setDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    toast("success", value.trim() ? "تم الحفظ" : "أُعيد النص الأصلي", SAVED);
  }

  const shown = rows.filter((row) => row.lang === lang);

  return (
    <Section
      title={lang === "ar" ? "الصفحة العربية (/)" : "الصفحة الإنجليزية (/en)"}
      description="الحقل الفارغ يعني النص الأصلي الظاهر تحت كل حقل."
      actions={<Segmented<Lang> label="اللغة" value={lang} onChange={setLang} options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} />}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {shown.map((row) => {
          const value = valueOf(row);
          const changed = value.trim() !== row.override;
          return (
            <div key={row.id} className="ds-field" style={{ borderBottom: "1px solid var(--ds-border, #e2e8f0)", paddingBottom: 14 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{row.label}{row.override ? <Badge tone="info">معدَّل</Badge> : null}</span>
              <textarea
                className="ds-textarea"
                dir={row.lang === "en" ? "ltr" : "rtl"}
                rows={row.multiline ? 3 : 1}
                value={value}
                maxLength={600}
                placeholder={row.text}
                onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
              />
              <small>الأصلي: <bdi dir={row.lang === "en" ? "ltr" : "rtl"}>{row.text}</bdi></small>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" disabled={!changed} loading={busy === row.id} onClick={() => void save(row, value)}>حفظ</Button>
                {row.override ? <Button variant="outline" disabled={busy === row.id} onClick={() => void save(row, "")}>استعادة الأصلي</Button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
