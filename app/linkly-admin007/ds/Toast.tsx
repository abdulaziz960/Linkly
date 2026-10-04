"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; title: string; description?: string };

const ToastContext = createContext<{ toast: (kind: ToastKind, title: string, description?: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const toast = useCallback((kind: ToastKind, title: string, description?: string) => {
    const id = ++nextId.current;
    setItems((current) => [...current.slice(-3), { id, kind, title, description }]);
    // Errors stay longer so they can actually be read.
    window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4500);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ds-toasts" role="region" aria-label="الإشعارات" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="ds-toast" data-kind={item.kind} role={item.kind === "error" ? "alert" : "status"}>
            <Icon name={item.kind === "success" ? "checkCircle" : item.kind === "error" ? "alert" : "info"} size={20} />
            <div>
              <strong>{item.title}</strong>
              {item.description ? <p>{item.description}</p> : null}
            </div>
            <button type="button" className="ds-icon-btn" aria-label="إغلاق" onClick={() => dismiss(item.id)}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context.toast;
}
