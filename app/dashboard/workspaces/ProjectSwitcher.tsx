"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWorkspaces } from "./WorkspacesContext";

const COLORS = ["#178a82", "#8e6bbf", "#c9831b", "#d9534f", "#2563eb", "#2e9e6b", "#c0368a", "#4a5568"];

/** The dialogs sit on the page, not inside the sidebar: the sidebar's stacking context would put them behind the content. */
function onPage(node: ReactNode) {
  return typeof document === "undefined" ? null : createPortal(node, document.body);
}

function Mark({ color, label, size = 34 }: { color: string; label: string; size?: number }) {
  return <span className="ws-mark" style={{ background: color, width: size, height: size }} aria-hidden="true">{label}</span>;
}

/**
 * Takes the place of the "account" card in the sidebar. With the feature on it lists the account's projects ("all projects" or one);
 * for an account without it, it keeps the plain card and adds a locked "add a project" entry that only explains and links to contact.
 */
export default function ProjectSwitcher({ planLabel, isEnglish, collapsed }: { planLabel: string; isEnglish: boolean; collapsed?: boolean }) {
  const { state, locked, selectScope, createProject } = useWorkspaces();
  const t = (ar: string, en: string) => (isEnglish ? en : ar);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"" | "create" | "locked">("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[1]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  useEffect(() => {
    if (!dialog) return;
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setDialog(""); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [dialog]);

  const plainCard = (
    <div className="tenant-card">
      <b>{t("حساب العميل", "Account")}</b>
      <span>{planLabel}</span>
    </div>
  );

  if (!state) {
    if (!locked || collapsed) return plainCard;
    return (
      <>
        {plainCard}
        <button className="ws-locked-add" type="button" onClick={() => setDialog("locked")}>
          <span aria-hidden="true">＋</span> {t("إضافة مشروع", "Add a project")} <span aria-hidden="true" className="ws-lock">🔒</span>
        </button>
        {dialog === "locked" ? onPage(
          <div className="ws-modal" role="dialog" aria-modal="true" aria-label={t("إضافة مشروع", "Add a project")} onClick={(event) => { if (event.target === event.currentTarget) setDialog(""); }}>
            <div className="ws-modal-card">
              <h2>{t("إضافة مشروع", "Add a project")}</h2>
              <p>{t("باقتك لا تدعم إضافة مشروع آخر. تواصل معنا لنفعّلها لحسابك.", "Your plan does not support adding another project. Contact us and we will enable it for your account.")}</p>
              <div className="ws-modal-actions">
                <Link className="btn primary" href="/contact">{t("تواصل معنا", "Contact us")}</Link>
                <button className="btn secondary" type="button" onClick={() => setDialog("")}>{t("إغلاق", "Close")}</button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  const lockedDialog = dialog === "locked" ? onPage(
    <div className="ws-modal" role="dialog" aria-modal="true" aria-label={t("إضافة مشروع", "Add a project")} onClick={(event) => { if (event.target === event.currentTarget) setDialog(""); }}>
      <div className="ws-modal-card">
        <h2>{t("إضافة مشروع", "Add a project")}</h2>
        <p>{t("باقتك لا تدعم إضافة مشروع آخر. تواصل معنا لإضافة مشاريع لحسابك.", "Your plan does not support adding another project. Contact us to add projects to your account.")}</p>
        <div className="ws-modal-actions">
          <Link className="btn primary" href="/contact">{t("تواصل معنا", "Contact us")}</Link>
          <button className="btn secondary" type="button" onClick={() => setDialog("")}>{t("إغلاق", "Close")}</button>
        </div>
      </div>
    </div>
  ) : null;

  const current = state.scope === "all" ? null : state.projects.find((project) => project.id === state.scope) ?? null;
  const title = current ? current.name : t("كل المشاريع", "All projects");
  const activeProjects = state.projects.filter((project) => !project.archived);
  const totalUnread = activeProjects.reduce((sum, project) => sum + project.unread, 0);
  const sub = current ? t("مشروع", "Project") : t(`${activeProjects.length} مشاريع · ${state.accountName}`, `${activeProjects.length} projects · ${state.accountName}`);

  async function choose(scope: string) {
    setOpen(false);
    if (scope !== state?.scope) await selectScope(scope);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const error = await createProject(name, color);
    setBusy(false);
    if (error) { setMessage(error); return; }
    setName("");
    setDialog("");
  }

  return (
    <div className="ws-switcher" ref={rootRef}>
      <button className="tenant-card ws-switcher-btn" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Mark color={current?.color ?? "#178a82"} label={current ? current.name.slice(0, 1) : "∞"} />
        <span className="ws-switcher-text"><b>{title}</b><span>{sub}</span></span>
        <span className="ws-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="ws-menu" role="listbox" aria-label={t("المشاريع", "Projects")}>
          {state.canViewAll ? (
            <button type="button" role="option" aria-selected={state.scope === "all"} className={state.scope === "all" ? "on" : ""} onClick={() => void choose("all")}>
              <Mark color="#178a82" label="∞" size={26} /><span>{t("كل المشاريع", "All projects")}</span>{totalUnread ? <em>{totalUnread}</em> : null}
            </button>
          ) : null}
          {state.canViewAll ? <hr /> : null}
          {activeProjects.map((project) => (
            <button key={project.id} type="button" role="option" aria-selected={state.scope === project.id} disabled={!project.member} className={state.scope === project.id ? "on" : ""} onClick={() => void choose(project.id)}>
              <Mark color={project.color} label={project.name.slice(0, 1)} size={26} /><span>{project.name}</span>{project.unread ? <em>{project.unread}</em> : null}
            </button>
          ))}
          {state.ownsAccount ? (
            <>
              <hr />
              {/* At the plan's limit the entry is locked: it explains and links to contact instead of opening the form. */}
              <button type="button" onClick={() => { setOpen(false); setDialog(state.quota.used >= state.quota.max ? "locked" : "create"); setMessage(""); }}>
                <span className="ws-plus" aria-hidden="true">＋</span><span>{t("مشروع جديد", "New project")}</span>
                {state.quota.used >= state.quota.max ? <span className="ws-lock" aria-hidden="true">🔒</span> : <em>{state.quota.used}/{state.quota.max}</em>}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {lockedDialog}
      {dialog === "create" ? onPage(
        <div className="ws-modal" role="dialog" aria-modal="true" aria-label={t("مشروع جديد", "New project")} onClick={(event) => { if (event.target === event.currentTarget) setDialog(""); }}>
          <form className="ws-modal-card" onSubmit={submit}>
            <h2>{t("مشروع جديد", "New project")}</h2>
            <p>{t("لكل مشروع محادثاته وعملاؤه وقنواته ومحتواه. الاشتراك والرصيد يبقيان على حسابك.", "Each project has its own conversations, customers, channels and content. The subscription and credit stay on your account.")}</p>
            <label>{t("اسم المشروع", "Project name")}
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoFocus />
            </label>
            <div className="ws-colors" role="radiogroup" aria-label={t("لون المشروع", "Project color")}>
              {COLORS.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={color === value} className={color === value ? "on" : ""} style={{ background: value }} onClick={() => setColor(value)} aria-label={value} />
              ))}
            </div>
            {message ? <p className="ws-error" role="alert">{message}</p> : null}
            <div className="ws-modal-actions">
              <button className="btn primary" type="submit" disabled={busy || name.trim().length < 2}>{busy ? t("جارٍ الإنشاء…", "Creating…") : t("إنشاء المشروع", "Create project")}</button>
              <button className="btn secondary" type="button" onClick={() => setDialog("")}>{t("إلغاء", "Cancel")}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
