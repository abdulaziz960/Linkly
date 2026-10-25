"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "../../lib/ui-dialogs";

/**
 * Guards a long form against losing work. `open` is whether the form is showing and `current` is everything the
 * person can change in it. What it held when it opened is the baseline: when it differs, leaving the page asks the
 * browser to confirm, and `confirmClose()` asks (in the app's own dialog) before the form is closed.
 */
export function useUnsavedChanges(open: boolean, current: unknown, t: (ar: string, en: string) => string) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const serialized = JSON.stringify(current);

  useEffect(() => {
    // Taken when the form opens (the form's state is already set up by then) and dropped when it closes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseline(open ? serialized : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = open && baseline !== null && serialized !== baseline;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const confirmClose = useCallback(async () => {
    if (!dirty) return true;
    return confirmDialog(t("لديك تعديلات غير محفوظة. إذا أغلقت النافذة ستفقدها.", "You have unsaved changes. If you close this window you will lose them."), {
      title: t("تعديلات غير محفوظة", "Unsaved changes"),
      tone: "danger",
      confirmLabel: t("إغلاق وفقدان التعديلات", "Close and discard"),
      cancelLabel: t("متابعة التعديل", "Keep editing")
    });
  }, [dirty, t]);

  return { dirty, confirmClose };
}
