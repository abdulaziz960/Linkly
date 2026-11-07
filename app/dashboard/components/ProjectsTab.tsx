"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "../../../lib/ui-dialogs";
import { useLanguage } from "../i18n";

type Project = { id: string; name: string; aliases: string; active: boolean; location: string; priceText: string; details: string; dailyVisitLimit: number | null };
type Draft = { id: string; name: string; aliases: string; active: boolean; location: string; priceText: string; details: string; dailyVisitLimit: string };

type Unit = { id: string; projectId: string; name: string; kind: string; model: string; area: string; priceText: string; total: number; available: number; reserved: number };
type UnitStatus = "available" | "reserved" | "sold";
type SheetUnit = { name: string; kind: string; model: string; area: string; priceText: string; status: UnitStatus };
const statusOf = (unit: Pick<Unit, "available" | "reserved">): UnitStatus => (unit.available > 0 ? "available" : unit.reserved > 0 ? "reserved" : "sold");
type UnitDraft = { name: string; area: string; priceText: string; kind: string; status: UnitStatus; total: string; available: string };
const EMPTY_UNIT: UnitDraft = { name: "", area: "", priceText: "", kind: "", status: "available", total: "", available: "" };
const UNIT_GRID: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(80px, 1fr) minmax(90px, 1fr) minmax(110px, 1.2fr) minmax(130px, 1.6fr) minmax(120px, 1.1fr) auto", gap: 6, alignItems: "center" };
const ADD_GRID: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(80px, 1fr) minmax(90px, 1fr) minmax(110px, 1.2fr) minmax(130px, 1.6fr) minmax(120px, 1.1fr)", gap: 6, alignItems: "center" };
const CELL: React.CSSProperties = { width: "100%", minHeight: 38, padding: "0 10px", borderRadius: 9, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontSize: 13 };

const EMPTY: Draft = { id: "", name: "", aliases: "", active: true, location: "", priceText: "", details: "", dailyVisitLimit: "" };
const field: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit" };

/**
 * Project profiles: everything a salesperson knows about a project, written once. The AI reads the profile of the
 * project a customer asks about and answers from it. A project can have its own daily visit limit.
 */
export default function ProjectsTab() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inventory, setInventory] = useState<Array<{ projectId: string; total: number; available: number }>>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(EMPTY_UNIT);
  const [typeMode, setTypeMode] = useState(false);
  const [unitError, setUnitError] = useState("");
  // A price sheet (PDF) being read, then shown for review before anything is saved.
  const [sheet, setSheet] = useState<SheetUnit[] | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/crm/projects", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { projects: Project[]; inventory?: Array<{ projectId: string; total: number; available: number }> } } | null;
    if (body?.ok && body.data) {
      setProjects(body.data.projects);
      setInventory(body.data.inventory ?? []);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    const payload = { id: draft.id || undefined, name: draft.name, aliases: draft.aliases, active: draft.active, location: draft.location, priceText: draft.priceText, details: draft.details, dailyVisitLimit: draft.dailyVisitLimit.trim() === "" ? null : Number(draft.dailyVisitLimit) };
    const response = await fetch("/api/crm/projects", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { projects: Project[] } } | null;
    setBusy(false);
    if (!body?.ok || !body.data) {
      setError(body?.error || t("تعذر حفظ المشروع", "Couldn't save the project"));
      return;
    }
    setProjects(body.data.projects);
    setDraft(null);
  }

  async function remove(project: Project) {
    if (!(await confirmDialog(t(`حذف مشروع «${project.name}»؟`, `Delete the project “${project.name}”?`)))) return;
    const response = await fetch("/api/crm/projects", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: project.id }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { projects: Project[] } } | null;
    if (body?.ok && body.data) setProjects(body.data.projects);
  }

  async function loadUnits(projectId: string) {
    const response = await fetch(`/api/crm/projects/units?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { units: Unit[] } } | null;
    setUnits(body?.ok && body.data ? body.data.units : []);
  }

  const edit = (project: Project) => {
    setUnits([]);
    setUnitDraft(EMPTY_UNIT);
    setTypeMode(false);
    setUnitError("");
    setSheet(null);
    setSheetMessage(null);
    setDraft({ ...project, dailyVisitLimit: project.dailyVisitLimit === null ? "" : String(project.dailyVisitLimit) });
    void loadUnits(project.id);
  };

  async function unitCall(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    setUnitError("");
    const response = await fetch("/api/crm/projects/units", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { units: Unit[] } } | null;
    if (!body?.ok || !body.data) {
      setUnitError(body?.error || t("تعذر حفظ الوحدة", "Couldn't save the unit"));
      return false;
    }
    setUnits(body.data.units);
    void load();
    return true;
  }


  async function readSheet(file: File) {
    setSheetBusy(true);
    setSheetMessage(null);
    setSheet(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/crm/projects/units/parse", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { units: SheetUnit[] } } | null;
      if (!response.ok || !body?.ok || !body.data) throw new Error(body?.error || t("تعذر قراءة الملف.", "Could not read the file."));
      setSheet(body.data.units);
    } catch (failure) {
      setSheetMessage({ ok: false, text: failure instanceof Error ? failure.message : t("تعذر قراءة الملف.", "Could not read the file.") });
    } finally {
      setSheetBusy(false);
    }
  }

  async function importSheet() {
    if (!sheet || !draft?.id) return;
    setSheetBusy(true);
    setSheetMessage(null);
    try {
      const response = await fetch("/api/crm/projects/units/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: draft.id, units: sheet }) });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { created: number; updated: number; units: Unit[] } } | null;
      if (!response.ok || !body?.ok || !body.data) throw new Error(body?.error || t("تعذر الاستيراد.", "Could not import."));
      setUnits(body.data.units);
      setSheet(null);
      setSheetMessage({ ok: true, text: t(`تم الاستيراد: أُضيفت ${body.data.created} وحدة وحُدّثت ${body.data.updated}.`, `Imported: ${body.data.created} added, ${body.data.updated} updated.`) });
      void load();
    } catch (failure) {
      setSheetMessage({ ok: false, text: failure instanceof Error ? failure.message : t("تعذر الاستيراد.", "Could not import.") });
    } finally {
      setSheetBusy(false);
    }
  }

  async function addUnit() {
    if (!draft?.id) return;
    const common = { projectId: draft.id, name: unitDraft.name, area: unitDraft.area, priceText: unitDraft.priceText, kind: unitDraft.kind };
    const ok = await unitCall("POST", typeMode
      ? { ...common, total: Number(unitDraft.total), available: unitDraft.available.trim() === "" ? undefined : Number(unitDraft.available) }
      : { ...common, total: 1, status: unitDraft.status });
    if (ok) setUnitDraft({ ...EMPTY_UNIT, status: unitDraft.status });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8, flex: "1 1 320px" }}>
          {t("اكتب ملف تعريف لكل مشروع (الموقع، الأسعار، المساحات، المميزات، خطة الدفع، موعد التسليم). عندما يسأل عميل عن مشروع يقرأ الذكاء الاصطناعي ملف ذلك المشروع ويرد منه.", "Write a profile for each project (location, prices, areas, features, payment plan, delivery). When a customer asks about a project, the AI reads that project's profile and answers from it.")}
        </p>
        <button type="button" className="btn primary" onClick={() => { setError(""); setDraft({ ...EMPTY }); }}>{t("إضافة مشروع", "Add project")}</button>
      </div>

      {loaded && !projects.length ? <p style={{ opacity: 0.7 }}>{t("لا توجد مشاريع بعد.", "No projects yet.")}</p> : null}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {projects.map((project) => (
          <article key={project.id} style={{ border: "1px solid var(--line, #dfe7e5)", borderRadius: 14, padding: 14, background: "var(--surface, #fff)", display: "grid", gap: 6, opacity: project.active ? 1 : 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <b>{project.name}</b>
              {!project.active ? <small>{t("متوقف", "Inactive")}</small> : null}
            </div>
            {project.location ? <small style={{ opacity: 0.75 }}>{project.location}</small> : null}
            {project.priceText ? <small>{project.priceText}</small> : null}
            {(() => {
              const stock = inventory.find((row) => row.projectId === project.id);
              return stock ? <small><b>{stock.available}</b> {t("وحدة متاحة من", "units available of")} {stock.total}</small> : null;
            })()}
            <small style={{ opacity: 0.7 }}>{project.details ? t(`${project.details.length} حرف من التفاصيل`, `${project.details.length} characters of details`) : t("بلا تفاصيل بعد", "No details yet")}{project.dailyVisitLimit ? ` · ${t(`حد ${project.dailyVisitLimit} زيارة/يوم`, `limit ${project.dailyVisitLimit} visits/day`)}` : ""}</small>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="button" className="btn" onClick={() => edit(project)}>{t("تعديل", "Edit")}</button>
              <button type="button" className="btn" onClick={() => void remove(project)} aria-label={t(`حذف ${project.name}`, `Delete ${project.name}`)}>{t("حذف", "Delete")}</button>
            </div>
          </article>
        ))}
      </div>

      {draft ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDraft(null)}>
          <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={draft.id ? t("تعديل مشروع", "Edit project") : t("إضافة مشروع", "Add project")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setDraft(null)}>×</button>
              <h2>{draft.id ? t("تعديل مشروع", "Edit project") : t("إضافة مشروع", "Add project")}</h2>
            </header>
            <div className="account-modal-body" style={{ gridAutoRows: "max-content", alignContent: "start" }}>
              <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("اسم المشروع", "Project name")}
                <input style={field} value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("أسماء أخرى يستخدمها العملاء (اختياري، افصل بفاصلة)", "Other names customers use (optional, comma-separated)")}
                <input style={field} value={draft.aliases} maxLength={300} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("الموقع", "Location")}
                  <input style={field} value={draft.location} maxLength={200} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
                </label>
                <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("الأسعار", "Prices")}
                  <input style={field} value={draft.priceText} maxLength={200} placeholder={t("مثل: من 1.2 إلى 1.8 مليون", "e.g. from 1.2M to 1.8M")} onChange={(event) => setDraft({ ...draft, priceText: event.target.value })} />
                </label>
              </div>
              <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("تفاصيل المشروع (يقرأها الذكاء الاصطناعي)", "Project details (read by the AI)")}
                <textarea style={{ ...field, minHeight: 200, padding: 12, lineHeight: 1.8 }} value={draft.details} maxLength={8000} onChange={(event) => setDraft({ ...draft, details: event.target.value })} placeholder={t("الوحدات والمساحات، المميزات، خطة الدفع، موعد التسليم، الخدمات القريبة...", "Units and areas, features, payment plan, delivery, nearby services...")} />
                <small style={{ fontWeight: 400, opacity: 0.65 }}>{draft.details.length} / 8000</small>
              </label>
              <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("حد الزيارات اليومي لهذا المشروع (اختياري)", "Daily visit limit for this project (optional)")}
                <input style={field} inputMode="numeric" value={draft.dailyVisitLimit} placeholder={t("فارغ = حد الحساب العام", "empty = the workspace limit")} onChange={(event) => setDraft({ ...draft, dailyVisitLimit: event.target.value.replace(/[^0-9]/g, "") })} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
                <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} style={{ width: 18, height: 18 }} />
                {t("المشروع نشط (يتعرّف عليه الذكاء الاصطناعي)", "Project is active (the AI recognises it)")}
              </label>
              {error ? <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p> : null}

              <section aria-label={t("الوحدات", "Units")} style={{ border: "1px solid var(--line, #dfe7e5)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                <b>{t("الوحدات (المخزون)", "Units (stock)")}</b>
                {!draft.id ? (
                  <small style={{ opacity: 0.7 }}>{t("احفظ المشروع أولًا ثم أضف أنواع الوحدات وأعدادها المتاحة.", "Save the project first, then add its unit types and how many are available.")}</small>
                ) : (
                  <>
                    <small style={{ opacity: 0.7, lineHeight: 1.7 }}>{t("كل وحدة بمفردها (A1 مثلًا) بحالتها: متاح أو محجوز أو مباعة، أو نوع له عدد (مثل «فيلا 4 غرف»). يجيب الذكاء الاصطناعي العميل من المتاح فقط، وعند نقل عميل إلى «تم البيع» تُخصم وحدته تلقائيًا.", "Each unit on its own (A1, say) with its status: available, reserved or sold, or a type with a count (e.g. “4-bedroom villa”). The AI answers from what is available only, and moving a customer to “Sold” takes their unit off automatically.")}</small>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ minWidth: 660, display: "grid", gap: 6 }}>
                        <div style={{ ...UNIT_GRID, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                          <span>{t("الوحدة", "Unit")}</span><span>{t("المساحة", "Area")}</span><span>{t("السعر", "Price")}</span><span>{t("وصف الوحدة", "Description")}</span><span>{t("حالة الوحدة", "Status")}</span><span />
                        </div>
                        {units.map((unit, index) => (
                          <div key={unit.id} style={{ display: "grid", gap: 6 }}>
                            {unit.model && unit.model !== units[index - 1]?.model ? <b style={{ display: "block", margin: "6px 0 0", fontSize: 13, opacity: 0.8 }}>{t(`نموذج ${unit.model}`, `Model ${unit.model}`)}</b> : null}
                            <div style={UNIT_GRID}>
                              <b style={{ overflowWrap: "anywhere" }}>{unit.name}</b>
                              <input style={CELL} aria-label={t(`مساحة ${unit.name}`, `Area of ${unit.name}`)} defaultValue={unit.area} key={`${unit.id}-a-${unit.area}`} maxLength={60} onBlur={(event) => { if (event.target.value !== unit.area) void unitCall("PATCH", { id: unit.id, area: event.target.value }); }} />
                              <input style={CELL} aria-label={t(`سعر ${unit.name}`, `Price of ${unit.name}`)} defaultValue={unit.priceText} key={`${unit.id}-p-${unit.priceText}`} maxLength={80} onBlur={(event) => { if (event.target.value !== unit.priceText) void unitCall("PATCH", { id: unit.id, priceText: event.target.value }); }} />
                              <input style={CELL} aria-label={t(`وصف ${unit.name}`, `Description of ${unit.name}`)} defaultValue={unit.kind} key={`${unit.id}-k-${unit.kind}`} maxLength={60} onBlur={(event) => { if (event.target.value !== unit.kind) void unitCall("PATCH", { id: unit.id, kind: event.target.value }); }} />
                              {unit.total === 1 ? (
                                <select style={CELL} aria-label={t(`حالة ${unit.name}`, `Status of ${unit.name}`)} value={statusOf(unit)} onChange={(event) => void unitCall("PATCH", { id: unit.id, status: event.target.value })}>
                                  <option value="available">{t("متاح", "Available")}</option>
                                  <option value="reserved">{t("محجوز", "Reserved")}</option>
                                  <option value="sold">{t("مباعة", "Sold")}</option>
                                </select>
                              ) : (
                                <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}>
                                  <input style={{ ...CELL, minWidth: 0 }} inputMode="numeric" aria-label={t(`المتاح من ${unit.name}`, `Available ${unit.name}`)} defaultValue={unit.available} key={`${unit.id}-${unit.available}-${unit.total}`} onBlur={(event) => { const value = event.target.value.replace(/[^0-9]/g, ""); if (value !== "" && Number(value) !== unit.available) void unitCall("PATCH", { id: unit.id, available: Number(value) }); }} />
                                  <span>{t("من", "of")}</span>
                                  <input style={{ ...CELL, minWidth: 0 }} inputMode="numeric" aria-label={t(`الكلي من ${unit.name}`, `Total ${unit.name}`)} defaultValue={unit.total} key={`${unit.id}-t-${unit.total}`} onBlur={(event) => { const value = event.target.value.replace(/[^0-9]/g, ""); if (value !== "" && Number(value) !== unit.total) void unitCall("PATCH", { id: unit.id, total: Number(value) }); }} />
                                </span>
                              )}
                              <button type="button" className="btn" aria-label={t(`حذف ${unit.name}`, `Delete ${unit.name}`)} onClick={() => void unitCall("DELETE", { id: unit.id, projectId: unit.projectId })}>{t("حذف", "Delete")}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {!units.length ? <small style={{ opacity: 0.7 }}>{t("لا توجد وحدات بعد.", "No units yet.")}</small> : null}
                    <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 10, background: "var(--surface-soft, #f6faf9)" }}>
                      <b style={{ fontSize: 14 }}>{t("استيراد من ملف الأسعار (PDF)", "Import from the price sheet (PDF)")}</b>
                      <small style={{ opacity: 0.7, lineHeight: 1.7 }}>{t("ارفع جدول الأسعار والوحدات، ويقرؤه الذكاء الاصطناعي بمفتاح مساحة عملك (Claude أو GPT أو Gemini). تراجع الوحدات قبل الحفظ، ولا يُحفظ شيء حتى تؤكد.", "Upload the price and unit sheet and the AI reads it with your workspace's key (Claude, GPT or Gemini). You review the units before saving; nothing is saved until you confirm.")}</small>
                      <input type="file" accept="application/pdf,.pdf" aria-label={t("ملف الأسعار PDF", "Price sheet PDF")} disabled={sheetBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readSheet(file); }} />
                      {sheetBusy && !sheet ? <small>{t("جارٍ قراءة الملف... قد يستغرق دقيقة.", "Reading the file... this can take a minute.")}</small> : null}
                      {sheetMessage ? <p role="status" style={{ margin: 0, color: sheetMessage.ok ? "#047857" : "#b42318" }}>{sheetMessage.text}</p> : null}
                      {sheet ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <b style={{ fontSize: 14 }}>{t(`وجدت ${sheet.length} وحدة: ${sheet.filter((unit) => unit.status === "available").length} متاح، ${sheet.filter((unit) => unit.status === "reserved").length} محجوز، ${sheet.filter((unit) => unit.status === "sold").length} مباعة`, `Found ${sheet.length} units: ${sheet.filter((unit) => unit.status === "available").length} available, ${sheet.filter((unit) => unit.status === "reserved").length} reserved, ${sheet.filter((unit) => unit.status === "sold").length} sold`)}</b>
                          <small style={{ opacity: 0.7 }}>{t("راجع الأرقام، واحذف أي صف خاطئ بزر ×. الوحدة التي اسمها موجود في المشروع تتحدّث بدل أن تتكرر.", "Check the numbers and remove a wrong row with ×. A unit whose name already exists in the project is updated, not duplicated.")}</small>
                          <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--line, #dfe7e5)", borderRadius: 10 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead><tr>{[t("الوحدة", "Unit"), t("النموذج", "Model"), t("النوع", "Type"), t("المساحة", "Area"), t("السعر", "Price"), t("الحالة", "Status"), ""].map((label, index) => <th key={index} style={{ position: "sticky", top: 0, background: "#f3f6f8", padding: "8px 10px", textAlign: "start", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
                              <tbody>
                                {sheet.map((unit, index) => (
                                  <tr key={`${unit.name}-${index}`} style={{ borderTop: "1px solid #e8eeec" }}>
                                    <td style={{ padding: "6px 10px", fontWeight: 700 }}>{unit.name}</td>
                                    <td style={{ padding: "6px 10px" }}>{unit.model || "—"}</td>
                                    <td style={{ padding: "6px 10px" }}>{unit.kind || "—"}</td>
                                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{unit.area || "—"}</td>
                                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{unit.priceText || "—"}</td>
                                    <td style={{ padding: "6px 10px" }}><span style={{ padding: "2px 10px", borderRadius: 999, fontWeight: 700, background: unit.status === "available" ? "#dcfce7" : unit.status === "reserved" ? "#fef3c7" : "#fee2e2", color: unit.status === "available" ? "#15803d" : unit.status === "reserved" ? "#b45309" : "#b91c1c" }}>{unit.status === "available" ? t("متاح", "Available") : unit.status === "reserved" ? t("محجوز", "Reserved") : t("مباعة", "Sold")}</span></td>
                                    <td style={{ padding: "6px 4px" }}><button type="button" className="icon-btn" aria-label={t(`حذف الصف ${unit.name}`, `Remove row ${unit.name}`)} onClick={() => setSheet(sheet.filter((_, rowIndex) => rowIndex !== index))}>×</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" className="btn primary" disabled={sheetBusy || !sheet.length} onClick={() => void importSheet()}>{sheetBusy ? t("جارٍ الحفظ...", "Saving...") : t(`استيراد ${sheet.length} وحدة`, `Import ${sheet.length} units`)}</button>
                            <button type="button" className="btn" disabled={sheetBusy} onClick={() => setSheet(null)}>{t("إلغاء", "Cancel")}</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 10, border: "1px dashed var(--line, #cfd9d6)" }}>
                      <b style={{ fontSize: 14 }}>{typeMode ? t("إضافة نوع له عدد", "Add a type with a count") : t("إضافة وحدة", "Add a unit")}</b>
                      <div style={{ overflowX: "auto" }}>
                        <div style={{ minWidth: 660, display: "grid", gap: 6 }}>
                          <div style={{ ...ADD_GRID, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                            <span>{typeMode ? t("اسم النوع", "Type name") : t("الوحدة", "Unit")}</span><span>{t("المساحة", "Area")}</span><span>{t("السعر", "Price")}</span><span>{t("وصف الوحدة", "Description")}</span><span>{typeMode ? t("الكلي / المتاح", "Total / available") : t("حالة الوحدة", "Status")}</span>
                          </div>
                          <div style={ADD_GRID}>
                            <input style={CELL} aria-label={typeMode ? t("اسم نوع الوحدة", "Unit type name") : t("اسم الوحدة", "Unit name")} placeholder={typeMode ? t("فيلا 4 غرف", "4-bed villa") : "A1"} value={unitDraft.name} maxLength={80} onChange={(event) => setUnitDraft({ ...unitDraft, name: event.target.value })} />
                            <input style={CELL} aria-label={t("مساحة الوحدة", "Unit area")} placeholder={t("270 م²", "270 m²")} value={unitDraft.area} maxLength={60} onChange={(event) => setUnitDraft({ ...unitDraft, area: event.target.value })} />
                            <input style={CELL} aria-label={t("سعر الوحدة", "Unit price")} placeholder={t("950,000 ر.س", "950,000 SAR")} value={unitDraft.priceText} maxLength={80} onChange={(event) => setUnitDraft({ ...unitDraft, priceText: event.target.value })} />
                            <input style={CELL} aria-label={t("وصف الوحدة", "Unit description")} placeholder={t("دور أرضي", "Ground floor")} value={unitDraft.kind} maxLength={60} onChange={(event) => setUnitDraft({ ...unitDraft, kind: event.target.value })} />
                            {typeMode ? (
                              <span style={{ display: "flex", gap: 4 }}>
                                <input style={{ ...CELL, minWidth: 0 }} aria-label={t("العدد الكلي", "Total count")} inputMode="numeric" placeholder={t("الكلي", "Total")} value={unitDraft.total} onChange={(event) => setUnitDraft({ ...unitDraft, total: event.target.value.replace(/[^0-9]/g, "") })} />
                                <input style={{ ...CELL, minWidth: 0 }} aria-label={t("العدد المتاح", "Available count")} inputMode="numeric" placeholder={t("المتاح", "Available")} value={unitDraft.available} onChange={(event) => setUnitDraft({ ...unitDraft, available: event.target.value.replace(/[^0-9]/g, "") })} />
                              </span>
                            ) : (
                              <select style={CELL} aria-label={t("حالة الوحدة الجديدة", "New unit status")} value={unitDraft.status} onChange={(event) => setUnitDraft({ ...unitDraft, status: event.target.value as UnitStatus })}>
                                <option value="available">{t("متاح", "Available")}</option>
                                <option value="reserved">{t("محجوز", "Reserved")}</option>
                                <option value="sold">{t("مباعة", "Sold")}</option>
                              </select>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        <button type="button" className="btn primary" disabled={unitDraft.name.trim().length < 2 || (typeMode && unitDraft.total === "")} onClick={() => void addUnit()}>{typeMode ? t("إضافة نوع وحدة", "Add unit type") : t("إضافة وحدة", "Add unit")}</button>
                        <button type="button" className="btn soft" onClick={() => { setTypeMode(!typeMode); setUnitError(""); }}>{typeMode ? t("إضافة وحدة واحدة بدل ذلك", "Add a single unit instead") : t("نوع له عدد (مثل 5 فلل متشابهة)", "A type with a count (e.g. 5 identical villas)")}</button>
                      </div>
                    </div>
                    {unitError ? <p role="alert" style={{ margin: 0, color: "#b42318" }}>{unitError}</p> : null}
                  </>
                )}
              </section>
            </div>
            <footer className="modal-foot">
              <button type="button" className="btn" onClick={() => setDraft(null)}>{t("إلغاء", "Cancel")}</button>
              <button type="button" className="btn primary" disabled={busy || draft.name.trim().length < 2} onClick={() => void save()}>{t("حفظ", "Save")}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
