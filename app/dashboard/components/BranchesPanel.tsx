"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Branch = { id: string; name: string; nameEn: string; address: string; active: boolean };
type StockRow = { id: string; name: string; stock: number };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, error: payload?.error || "حدث خطأ" };
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }
}

const emptyDraft = { id: "", name: "", nameEn: "", address: "", active: true };

/** Branches: the customer picks one at checkout and the order is taken from that branch's own stock. */
export default function BranchesPanel() {
  const { t, language } = useLanguage();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await call<Branch[]>("/api/catalog/branches");
    if (result.ok) setBranches(result.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openStock(id: string) {
    setSelected(id);
    setStock([]);
    const result = await call<StockRow[]>(`/api/catalog/branches/${id}/stock`);
    if (result.ok) setStock(result.data ?? []);
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    const result = await call<Branch[]>("/api/catalog/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    setBusy(false);
    if (!result.ok) {
      setFeedback({ type: "error", text: result.error || t("تعذر الحفظ", "Could not save") });
      return;
    }
    setBranches(result.data ?? []);
    setDraft(emptyDraft);
    setEditing(false);
    setFeedback({ type: "success", text: t("تم حفظ الفرع", "Branch saved") });
  }

  async function remove(branch: Branch) {
    if (!window.confirm(t(`حذف الفرع «${branch.name}» ومخزونه؟`, `Delete the branch "${branch.name}" and its stock?`))) return;
    const result = await call<Branch[]>(`/api/catalog/branches?id=${encodeURIComponent(branch.id)}`, { method: "DELETE" });
    if (result.ok) {
      setBranches(result.data ?? []);
      if (selected === branch.id) setSelected("");
    }
  }

  async function saveStock(row: StockRow, value: string) {
    const trimmed = value.trim();
    const next = trimmed === "" ? -1 : Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(next) || next < 0)) return;
    if (next === row.stock) return;
    const result = await call(`/api/catalog/branches/${selected}/stock`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: row.id, stock: trimmed === "" ? null : next }) });
    if (result.ok) setStock((current) => current.map((item) => (item.id === row.id ? { ...item, stock: next } : item)));
    else setFeedback({ type: "error", text: result.error || t("تعذر حفظ الكمية", "Could not save the quantity") });
  }

  const selectedBranch = branches.find((branch) => branch.id === selected);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("الفروع", "Branches")}</h2>
        <span />
        <button className="btn primary" type="button" onClick={() => { setDraft(emptyDraft); setEditing(true); }}>{t("إضافة فرع", "Add branch")}</button>
      </div>
      <div className="panel-body">
        <p className="muted-copy">{t("عند إتمام الطلب يختار العميل الفرع الذي يريد الطلب منه، وتُخصم الكمية من مخزون ذلك الفرع. لا يرى العميل الكمية المتبقية. ملاحظة: اترك كمية المنتج العامة فارغة، واضبط الكميات من هنا لكل فرع.", "At checkout the customer picks the branch to order from and the quantity is taken from that branch's stock. Customers never see the remaining quantity. Tip: leave a product's general stock empty and set the quantities here, per branch.")}</p>
        {feedback ? <p className={`automation-feedback ${feedback.type}`} role="status">{feedback.text}</p> : null}

        {editing ? (
          <div className="branch-form">
            <label>{t("اسم الفرع", "Branch name")}<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} /></label>
            <label>{t("الاسم بالإنجليزية (اختياري)", "English name (optional)")}<input dir="ltr" value={draft.nameEn} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })} maxLength={80} /></label>
            <label>{t("العنوان أو الحي (اختياري)", "Address or area (optional)")}<input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} maxLength={200} /></label>
            <label className="branch-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />{t("الفرع يستقبل الطلبات", "Branch accepts orders")}</label>
            <div className="branch-form-actions">
              <button className="btn primary" type="button" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{t("حفظ", "Save")}</button>
              <button className="btn soft" type="button" onClick={() => setEditing(false)}>{t("إلغاء", "Cancel")}</button>
            </div>
          </div>
        ) : null}

        {branches.length ? (
          <div className="category-grid">
            {branches.map((branch) => (
              <div className={`category-card${selected === branch.id ? " selected" : ""}`} key={branch.id}>
                <span className="category-card-icon" aria-hidden="true">⌂</span>
                <div className="category-card-text">
                  <strong>{language === "en" && branch.nameEn ? branch.nameEn : branch.name}</strong>
                  <small>{branch.active ? (branch.address || t("يستقبل الطلبات", "Accepting orders")) : t("متوقف", "Paused")}</small>
                </div>
                <div className="branch-actions">
                  <button className="btn soft" type="button" onClick={() => void openStock(branch.id)}>{t("المخزون", "Stock")}</button>
                  <button className="btn soft" type="button" onClick={() => { setDraft({ id: branch.id, name: branch.name, nameEn: branch.nameEn, address: branch.address, active: branch.active }); setEditing(true); }}>{t("تعديل", "Edit")}</button>
                  <button className="btn soft danger" type="button" onClick={() => void remove(branch)}>{t("حذف", "Delete")}</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="empty-note">{t("لا توجد فروع بعد. بدون فروع يعمل المخزون العام كما هو.", "No branches yet. Without branches the general stock works as before.")}</p>}

        {selectedBranch ? (
          <div className="branch-stock">
            <h3>{t(`مخزون فرع «${selectedBranch.name}»`, `Stock of "${selectedBranch.nameEn || selectedBranch.name}"`)}</h3>
            <p className="muted-copy">{t("اترك الخانة فارغة إذا كان المنتج غير محدد الكمية في هذا الفرع (متاح دائمًا). اكتب 0 لإيقافه في هذا الفرع.", "Leave it empty when the product has no tracked quantity at this branch (always available). Enter 0 to switch it off at this branch.")}</p>
            <table className="branch-stock-table">
              <thead><tr><th>{t("المنتج", "Product")}</th><th>{t("الكمية", "Quantity")}</th></tr></thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td><input type="number" min={0} dir="ltr" defaultValue={row.stock < 0 ? "" : row.stock} placeholder={t("غير محدد", "Not tracked")} onBlur={(event) => void saveStock(row, event.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stock.length ? <p className="empty-note">{t("لا توجد منتجات.", "No products.")}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
