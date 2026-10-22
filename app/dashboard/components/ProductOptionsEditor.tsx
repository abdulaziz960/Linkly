"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Option = { id: string; name: string; priceDelta: number };
type Group = { id: string; productId: string; name: string; required: boolean; multiple: boolean; maxChoices: number; options: Option[] };
type Draft = { id: string; name: string; required: boolean; multiple: boolean; maxChoices: string; options: Array<{ id: string; name: string; priceDelta: string }> };

const EMPTY: Draft = { id: "", name: "", required: true, multiple: false, maxChoices: "0", options: [{ id: "", name: "", priceDelta: "" }, { id: "", name: "", priceDelta: "" }] };

/** The choices a customer answers before a product goes into the cart (size, extras...), for one product or for every product. */
export default function ProductOptionsEditor({ productId, productName, onClose }: { productId: string; productName: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<Group[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: "no-store" }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; data?: Group[] } | null;
    if (result?.ok && result.data) setGroups(result.data);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function edit(group: Group) {
    setNote(null);
    setDraft({ id: group.id, name: group.name, required: group.required, multiple: group.multiple, maxChoices: String(group.maxChoices), options: group.options.map((option) => ({ id: option.id, name: option.name, priceDelta: option.priceDelta ? String(option.priceDelta) : "" })) });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/catalog/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, productId, name: draft.name, required: draft.required, multiple: draft.multiple, maxChoices: Number(draft.maxChoices) || 0, options: draft.options.map((option) => ({ id: option.id, name: option.name, priceDelta: option.priceDelta })) })
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setNote({ ok: false, text: result?.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      setDraft(null);
      setNote({ ok: true, text: t("تم الحفظ.", "Saved.") });
      await load();
    } catch {
      setNote({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: Group) {
    if (!window.confirm(t(`حذف المجموعة «${group.name}»؟`, `Delete the group “${group.name}”?`))) return;
    await fetch(`/api/catalog/options/${encodeURIComponent(group.id)}`, { method: "DELETE" }).catch(() => null);
    await load();
  }

  const setOption = (index: number, patch: Partial<Draft["options"][number]>) => setDraft((current) => (current ? { ...current, options: current.options.map((option, at) => (at === index ? { ...option, ...patch } : option)) } : current));

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="account-modal form-modal options-editor" role="dialog" aria-modal="true" aria-label={t("خيارات المنتج", "Product options")} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={onClose}>×</button>
          <h2>{productId ? t(`خيارات «${productName}»`, `Options for “${productName}”`) : t("خيارات لكل المنتجات", "Options for every product")}</h2>
        </header>
        <div className="account-modal-body">
          <p className="muted-copy">{t("يجيب العميل عن المجموعات بالترتيب قبل إضافة المنتج للسلة (مثل الحجم ثم الإضافات). السعر الإضافي يُضاف على سعر المنتج. حتى 9 خيارات في المجموعة.", "The customer answers the groups in order before the product goes into the cart (size, then extras). An extra price is added to the product's price. Up to 9 options per group.")}{!productId ? ` ${t("هذه المجموعات تظهر لكل المنتجات.", "These groups appear on every product.")}` : ""}</p>

          {groups.map((group) => (
            <div className="options-group-row" key={group.id}>
              <div>
                <b>{group.name}</b>
                <small>{group.multiple ? t(`اختيار متعدد${group.maxChoices ? ` (حتى ${group.maxChoices})` : ""}`, `Several${group.maxChoices ? ` (up to ${group.maxChoices})` : ""}`) : t("اختيار واحد", "One choice")} · {group.required ? t("إجباري", "Required") : t("اختياري", "Optional")}</small>
                <span>{group.options.map((option) => `${option.name}${option.priceDelta > 0 ? ` (+${option.priceDelta})` : ""}`).join("، ")}</span>
              </div>
              <div className="options-group-actions">
                <button type="button" className="soft-action" onClick={() => edit(group)}>{t("تعديل", "Edit")}</button>
                <button type="button" className="soft-action" onClick={() => void remove(group)}>{t("حذف", "Delete")}</button>
              </div>
            </div>
          ))}
          {!groups.length && !draft ? <p className="muted-copy">{t("لا توجد مجموعات بعد.", "No groups yet.")}</p> : null}

          {draft ? (
            <div className="options-form">
              <label>{t("اسم المجموعة (مثل: الحجم، الإضافات)", "Group name (such as Size, Extras)")}
                <input value={draft.name} maxLength={40} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <div className="options-form-row">
                <label>{t("نوع الاختيار", "Choice type")}
                  <select value={draft.multiple ? "multiple" : "single"} onChange={(event) => setDraft({ ...draft, multiple: event.target.value === "multiple" })}>
                    <option value="single">{t("اختيار واحد", "One choice")}</option>
                    <option value="multiple">{t("اختيار متعدد", "Several choices")}</option>
                  </select>
                </label>
                {draft.multiple ? (
                  <label>{t("أقصى عدد (0 = بلا حد)", "Maximum (0 = any)")}
                    <input type="number" min={0} max={9} dir="ltr" value={draft.maxChoices} onChange={(event) => setDraft({ ...draft, maxChoices: event.target.value })} />
                  </label>
                ) : null}
                <label className="options-check">
                  <input type="checkbox" checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />
                  {t("إجباري", "Required")}
                </label>
              </div>
              <div className="options-rows">
                {draft.options.map((option, index) => (
                  <div key={index}>
                    <input placeholder={t("اسم الخيار", "Option name")} value={option.name} maxLength={40} onChange={(event) => setOption(index, { name: event.target.value })} />
                    <input placeholder={t("سعر إضافي", "Extra price")} type="number" min={0} dir="ltr" value={option.priceDelta} onChange={(event) => setOption(index, { priceDelta: event.target.value })} />
                    <button type="button" className="soft-action" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, at) => at !== index) })}>×</button>
                  </div>
                ))}
                {draft.options.length < 9 ? <button type="button" className="soft-action" onClick={() => setDraft({ ...draft, options: [...draft.options, { id: "", name: "", priceDelta: "" }] })}>{t("+ خيار", "+ Option")}</button> : null}
              </div>
              {note && !note.ok ? <span className="store-orders-error">{note.text}</span> : null}
              <div className="store-order-actions">
                <button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>{busy ? t("جارٍ الحفظ...", "Saving...") : t("حفظ المجموعة", "Save group")}</button>
                <button type="button" className="soft-action" disabled={busy} onClick={() => setDraft(null)}>{t("إلغاء", "Cancel")}</button>
              </div>
            </div>
          ) : (
            <div className="store-order-actions">
              <button type="button" className="primary-action" onClick={() => { setNote(null); setDraft({ ...EMPTY, options: EMPTY.options.map((option) => ({ ...option })) }); }}>{t("إضافة مجموعة", "Add a group")}</button>
              {note?.ok ? <span className="store-order-ok">{note.text}</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
