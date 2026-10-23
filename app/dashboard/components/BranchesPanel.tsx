"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Branch = { id: string; name: string; nameEn: string; address: string; mapUrl: string; active: boolean };
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

/** Branches: the customer picks one at checkout and the order is taken from that branch's own stock. */
export default function BranchesPanel() {
  const { t, language } = useLanguage();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        <h2>{t("مخزون الفروع", "Branch stock")}</h2>
        <span />
        <a className="btn soft" href="/dashboard?view=branches">{t("إدارة الفروع", "Manage branches")}</a>
      </div>
      <div className="panel-body">
        <p className="muted-copy">{t("عند إتمام الطلب يختار العميل الفرع الذي يريد الطلب منه، وتُخصم الكمية من مخزون ذلك الفرع. لا يرى العميل الكمية المتبقية. ملاحظة: اترك كمية المنتج العامة فارغة، واضبط الكميات من هنا لكل فرع. الفروع نفسها (الاسم والموقع) تُضاف وتُعدَّل من صفحة «الفروع».", "At checkout the customer picks the branch to order from and the quantity is taken from that branch's stock. Customers never see the remaining quantity. Tip: leave a product's general stock empty and set the quantities here, per branch. Branches themselves (name and location) are added and edited on the Branches page.")}</p>
        {feedback ? <p className={`automation-feedback ${feedback.type}`} role="status">{feedback.text}</p> : null}

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
                </div>
              </div>
            ))}
          </div>
        ) : <p className="empty-note">{t("لا توجد فروع بعد. أضفها من صفحة «الفروع» وستظهر هنا لضبط مخزونها. بدون فروع يعمل المخزون العام كما هو.", "No branches yet. Add them on the Branches page and they appear here to set their stock. Without branches the general stock works as before.")}</p>}

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
