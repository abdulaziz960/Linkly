"use client";

import { useEffect, useId, type ReactNode } from "react";
import Icon from "./Icon";

// Labelled form field with hint and inline validation message.
export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="ds-field" data-invalid={error ? "" : undefined}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true" style={{ color: "var(--ds-danger)" }}> *</span> : null}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? <span id={`${id}-err`} className="ds-field-error" role="alert"><Icon name="alert" size={13} />{error}</span> : hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}

// Warns before leaving the page (reload / close tab) while a form has unsaved changes.
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

// Result shape shared by every /api/admin/* route.
// `raw` is the whole JSON body, for the few routes that return fields next to `ok`.
export type ApiResult<T = unknown> = { ok: true; data: T; raw: Record<string, unknown> } | { ok: false; error: string; status: number };

export async function adminRequest<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store"
    });
    const body = (await response.json().catch(() => null)) as ({ ok?: boolean; data?: T; error?: string } & Record<string, unknown>) | null;
    if (response.status === 401) return { ok: false, error: "انتهت جلستك. سجّل الدخول من جديد.", status: 401 };
    if (response.status === 403) return { ok: false, error: "لا تملك صلاحية تنفيذ هذا الإجراء.", status: 403 };
    if (!response.ok || !body?.ok) return { ok: false, error: body?.error || "تعذر تنفيذ العملية. حاول مرة أخرى.", status: response.status };
    return { ok: true, data: body.data as T, raw: body };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة.", status: 0 };
  }
}
