"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "../../../lib/ui-dialogs";
import { useLanguage } from "../i18n";

type Project = { id: string; name: string; aliases: string; active: boolean; location: string; priceText: string; details: string; dailyVisitLimit: number | null };
type Draft = { id: string; name: string; aliases: string; active: boolean; location: string; priceText: string; details: string; dailyVisitLimit: string };

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

  const load = useCallback(async () => {
    const response = await fetch("/api/crm/projects", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { projects: Project[] } } | null;
    if (body?.ok && body.data) setProjects(body.data.projects);
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

  const edit = (project: Project) => setDraft({ ...project, dailyVisitLimit: project.dailyVisitLimit === null ? "" : String(project.dailyVisitLimit) });

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
