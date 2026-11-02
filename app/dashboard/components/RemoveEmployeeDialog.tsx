"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Employee } from "../types";
import { useLanguage } from "../i18n";

/** Removes an employee from the workspace (nothing is deleted): their seat is freed and their open conversations move to the chosen employee. */
export default function RemoveEmployeeDialog({ employee, openCount, candidates, onClose, onDone }: {
  employee: Employee;
  openCount: number;
  candidates: Employee[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (openCount > 0 && !reassignTo) { setMessage(t("اختر الموظف الذي تُنقل إليه المحادثات المفتوحة", "Choose who the open conversations move to")); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reassignTo }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { reassigned?: number } } | null;
      if (!response.ok || !payload?.ok) { setMessage(payload?.error || t("تعذرت إزالة الموظف", "Could not remove the employee")); return; }
      const moved = payload.data?.reassigned ?? 0;
      onDone(moved
        ? t(`تمت إزالة ${employee.name} ونُقلت ${moved} محادثة.`, `${employee.name} was removed and ${moved} conversations were moved.`)
        : t(`تمت إزالة ${employee.name}.`, `${employee.name} was removed.`));
    } catch {
      setMessage(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="export-modal" role="dialog" aria-modal="true" aria-label={t("إزالة موظف", "Remove employee")} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="export-card" onSubmit={submit}>
        <h2>{t(`إزالة ${employee.name}`, `Remove ${employee.name}`)}</h2>
        <p>{t("يخرج الموظف من القائمة ويُقفل دخوله، ويتحرر مقعده من حد الموظفين. تبقى رسائله وسجله وتقاريره كما هي، لكن بريده يبقى محجوزًا.", "The employee leaves the list and their login is locked, and their seat is freed. Their messages, history and reports stay, but their email stays reserved.")}</p>
        {openCount > 0 ? (
          <label className="remove-employee-pick">
            {t(`عنده ${openCount} محادثة مفتوحة. انقلها إلى:`, `They have ${openCount} open conversations. Move them to:`)}
            <select value={reassignTo} onChange={(event) => setReassignTo(event.target.value)} required>
              <option value="">{t("اختر موظفًا", "Choose an employee")}</option>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
        ) : <small className="export-hint">{t("لا توجد محادثات مفتوحة مسندة له.", "No open conversations are assigned to them.")}</small>}
        {message ? <p className="export-error" role="alert">{message}</p> : null}
        <div className="export-actions">
          <button className="btn danger" type="submit" disabled={busy}>{busy ? t("جارٍ الإزالة…", "Removing…") : t("إزالة الموظف", "Remove employee")}</button>
          <button className="btn secondary" type="button" disabled={busy} onClick={onClose}>{t("إلغاء", "Cancel")}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
