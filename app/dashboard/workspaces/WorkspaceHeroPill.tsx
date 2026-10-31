"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaces } from "./WorkspacesContext";

/** The project filter that sits inside every page banner: shows the project being viewed and switches it (the same choice as the sidebar). */
export default function WorkspaceHeroPill() {
  const { state, selectScope } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!state) return null;
  const projects = state.projects.filter((project) => !project.archived);
  if (projects.length < 2 && !state.canViewAll) return null;
  const current = state.scope === "all" ? null : projects.find((project) => project.id === state.scope) ?? null;
  async function choose(scope: string) {
    setOpen(false);
    if (scope !== state?.scope) await selectScope(scope);
  }
  return (
    <div className="ws-hero-pill" ref={rootRef}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="ws-mark" style={{ background: current?.color ?? "#178a82" }} aria-hidden="true">{current ? current.name.slice(0, 1) : "∞"}</span>
        <b>{current ? current.name : "كل المشاريع"}</b>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="ws-menu" role="listbox" aria-label="المشاريع">
          {state.canViewAll ? <button type="button" role="option" aria-selected={state.scope === "all"} className={state.scope === "all" ? "on" : ""} onClick={() => void choose("all")}><span className="ws-mark" style={{ background: "#178a82" }} aria-hidden="true">∞</span><span>كل المشاريع</span></button> : null}
          {projects.map((project) => (
            <button key={project.id} type="button" role="option" aria-selected={state.scope === project.id} disabled={!project.member} className={state.scope === project.id ? "on" : ""} onClick={() => void choose(project.id)}>
              <span className="ws-mark" style={{ background: project.color }} aria-hidden="true">{project.name.slice(0, 1)}</span><span>{project.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
