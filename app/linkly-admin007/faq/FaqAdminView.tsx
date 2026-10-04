"use client";

import { FormEvent, useState } from "react";
import type { FaqItemRow } from "../../../lib/faq-store";
import { callAdminApi, jsonInit } from "../content-api";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";

type Draft = { id: string; questionAr: string; answerAr: string; questionEn: string; answerEn: string; active: boolean };
const emptyDraft: Draft = { id: "", questionAr: "", answerAr: "", questionEn: "", answerEn: "", active: true };
const SAVED = "تظهر التغييرات للزوار خلال نحو نصف دقيقة.";

export default function FaqAdminView({ initialItems }: { initialItems: FaqItemRow[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<FaqItemRow[]>(initialItems);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const result = await callAdminApi<FaqItemRow[]>("/api/admin/faq");
    if (result.ok && result.data) setItems(result.data);
  }

  function open(next: Draft) {
    setDraft(next);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const body = { questionAr: draft.questionAr, answerAr: draft.answerAr, questionEn: draft.questionEn, answerEn: draft.answerEn, active: draft.active };
    const result = await callAdminApi<FaqItemRow>(draft.id ? `/api/admin/faq/${draft.id}` : "/api/admin/faq", jsonInit(draft.id ? "PATCH" : "POST", body));
    setSaving(false);
    if (!result.ok) return setError(result.error || "تعذر الحفظ");
    setDraft(null);
    toast("success", "تم الحفظ", SAVED);
    await reload();
  }

  async function toggleActive(item: FaqItemRow) {
    const result = await callAdminApi(`/api/admin/faq/${item.id}`, jsonInit("PATCH", { ...item, active: !item.active }));
    if (!result.ok) return toast("error", "تعذر التحديث", result.error);
    toast("success", item.active ? "تم إخفاء السؤال" : "تم إظهار السؤال", SAVED);
    await reload();
  }

  async function remove(item: FaqItemRow) {
    const ok = await confirm({ title: `حذف السؤال «${item.questionAr}»؟`, description: "سيُحذف نهائيًا من الموقع ولا يمكن التراجع.", confirmLabel: "حذف", tone: "danger" });
    if (!ok) return;
    const result = await callAdminApi(`/api/admin/faq/${item.id}`, { method: "DELETE" });
    if (!result.ok) return toast("error", "تعذر الحذف", result.error);
    toast("success", "تم حذف السؤال");
    await reload();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    const result = await callAdminApi("/api/admin/faq/reorder", jsonInit("POST", { ids: next.map((item) => item.id) }));
    if (!result.ok) {
      setItems(previous);
      toast("error", "تعذر حفظ الترتيب", result.error);
    }
  }

  return (
    <>
      <Section
        title={`الأسئلة (${formatNumber(items.length)})`}
        description="الترتيب هنا هو ترتيب ظهورها للزوار. المخفي لا يظهر في الموقع."
        actions={<Button variant="primary" icon="plus" onClick={() => open({ ...emptyDraft })}>إضافة سؤال</Button>}
      >
        {items.length === 0 ? (
          <EmptyState icon="message" title="لا توجد أسئلة" description="أضف أول سؤال ليظهر للزوار." action={<Button variant="primary" icon="plus" onClick={() => open({ ...emptyDraft })}>إضافة سؤال</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">الترتيب</th>
                  <th scope="col">السؤال</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">الإنجليزية</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="الترتيب">
                      <div className="ds-cell-actions" style={{ justifyContent: "flex-start" }}>
                        <Button variant="ghost" aria-label="تحريك للأعلى" disabled={index === 0} onClick={() => void move(index, -1)}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="chevronDown" size={16} /></span></Button>
                        <Button variant="ghost" aria-label="تحريك للأسفل" disabled={index === items.length - 1} onClick={() => void move(index, 1)}><Icon name="chevronDown" size={16} /></Button>
                      </div>
                    </td>
                    <td data-cell="main">
                      <div className="ds-cell-stack"><strong>{item.questionAr}</strong><small>{item.answerAr.length > 110 ? `${item.answerAr.slice(0, 110)}…` : item.answerAr}</small></div>
                    </td>
                    <td data-label="الحالة"><Badge tone={item.active ? "success" : "neutral"} dot>{item.active ? "ظاهر" : "مخفي"}</Badge></td>
                    <td data-label="الإنجليزية">{item.questionEn ? <Badge tone="info">متوفرة</Badge> : <small>تُعرض العربية</small>}</td>
                    <td>
                      <div className="ds-cell-actions">
                        <Button variant="outline" onClick={() => open({ id: item.id, questionAr: item.questionAr, answerAr: item.answerAr, questionEn: item.questionEn, answerEn: item.answerEn, active: item.active })}>تعديل</Button>
                        <ActionMenu
                          label={`المزيد لسؤال ${item.questionAr}`}
                          items={[
                            { key: "toggle", label: item.active ? "إخفاء" : "إظهار", icon: item.active ? "x" : "check", onSelect: () => void toggleActive(item) },
                            { key: "delete", label: "حذف", icon: "trash", tone: "danger", onSelect: () => void remove(item) }
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog
        open={Boolean(draft)}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "تعديل سؤال" : "إضافة سؤال"}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="faq-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="faq-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">السؤال (عربي)<input data-autofocus className="ds-input" value={draft.questionAr} onChange={(event) => setDraft({ ...draft, questionAr: event.target.value })} maxLength={300} required /></label>
            <label className="ds-field">الجواب (عربي)<textarea className="ds-textarea" rows={4} value={draft.answerAr} onChange={(event) => setDraft({ ...draft, answerAr: event.target.value })} maxLength={2000} required /></label>
            <label className="ds-field">Question (English) — اختياري<input className="ds-input" dir="ltr" value={draft.questionEn} onChange={(event) => setDraft({ ...draft, questionEn: event.target.value })} maxLength={300} /></label>
            <label className="ds-field">Answer (English) — اختياري<textarea className="ds-textarea" dir="ltr" rows={4} value={draft.answerEn} onChange={(event) => setDraft({ ...draft, answerEn: event.target.value })} maxLength={2000} /></label>
            <label className="ds-check"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />ظاهر للزوار</label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
