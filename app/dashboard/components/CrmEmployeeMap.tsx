"use client";

import { useCallback, useEffect, useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

type Employee = { id: string; name: string; email: string };
type Mapping = { externalId: string; employeeId: string };

/**
 * For a CRM that assigns leads to its own employees: an employee id in the CRM -> the matching
 * Linkly employee. The CRM sends it as `assigneeId` when it creates the conversation. A CRM that
 * sends the employee's email (or exact name) needs no mapping.
 */
export default function CrmEmployeeMap() {
  const { t } = useLanguage();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [externalId, setExternalId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/developer/crm-employees", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { employees: Employee[]; mappings: Mapping[] } } | null;
    if (body?.ok && body.data) {
      setEmployees(body.data.employees);
      setMappings(body.data.mappings);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(method: "PUT" | "DELETE", payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/developer/crm-employees", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { mappings: Mapping[] } } | null;
    setBusy(false);
    if (!body?.ok || !body.data) {
      setError(body?.error || t("تعذر حفظ التغيير", "Couldn't save the change"));
      return;
    }
    setMappings(body.data.mappings);
    if (method === "PUT") {
      setExternalId("");
      setEmployeeId("");
    }
  }

  const nameOf = (id: string) => employees.find((employee) => employee.id === id)?.name ?? id;

  return (
    <div className="panel">
      <div className="panel-head"><h2>{t("ربط موظفي الـCRM", "CRM employee mapping")}</h2></div>
      <div className="panel-body" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, lineHeight: 1.8 }}>
          {t("عندما يرسل نظامك عميلًا محتملًا مع الموظف الذي أسنده إليه، تُسند محادثة واتساب لنفس الموظف هنا. يتعرّف لنكلي عليه ببريده (`assigneeEmail`) أو باسمه الدقيق (`assigneeName`)، أو بمعرّفه في نظامك (`assigneeId`) بعد ربطه هنا.", "When your system sends a lead with the employee it assigned, the WhatsApp conversation is assigned to the same employee here. Linkly finds them by email (`assigneeEmail`), exact name (`assigneeName`), or your system's own id (`assigneeId`) once mapped here.")}
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {mappings.map((mapping) => (
            <li key={mapping.externalId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: "1px solid var(--line, #dfe7e5)", borderRadius: 10 }}>
              <span><bdi dir="ltr"><b>{mapping.externalId}</b></bdi> ← {nameOf(mapping.employeeId)}</span>
              <button type="button" className="btn" disabled={busy} onClick={() => void call("DELETE", { externalId: mapping.externalId })}>{t("حذف", "Delete")}</button>
            </li>
          ))}
          {!mappings.length ? <li style={{ opacity: 0.7 }}>{t("لا توجد روابط بعد.", "No mappings yet.")}</li> : null}
        </ul>
        <form
          style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(160px, 1.4fr) auto", gap: 8, alignItems: "start" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (externalId.trim() && employeeId) void call("PUT", { externalId, employeeId });
          }}
        >
          <input dir="ltr" aria-label={t("معرّف الموظف في الـCRM", "Employee id in the CRM")} style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", font: "inherit" }} value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder={t("معرّف الموظف في الـCRM", "Employee id in the CRM")} />
          <CustomSelect ariaLabel={t("موظف لنكلي", "Linkly employee")} value={employeeId} onChange={setEmployeeId} options={[{ value: "", label: t("اختر موظف لنكلي", "Pick a Linkly employee") }, ...employees.map((employee) => ({ value: employee.id, label: employee.name }))]} />
          <button type="submit" className="btn primary" disabled={busy || !externalId.trim() || !employeeId}>{t("ربط", "Link")}</button>
        </form>
        {error ? <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p> : null}
      </div>
    </div>
  );
}
