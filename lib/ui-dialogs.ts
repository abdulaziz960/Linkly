/**
 * One confirmation dialog and one notification (toast) for the whole app, replacing the browser's native
 * window.confirm / window.alert (unbranded, not translatable, blocks the page, not right-to-left aware).
 *
 *   if (!(await confirmDialog("حذف الوسم؟"))) return;
 *   notify("تعذر الحفظ", "error");
 *
 * Both work from any event handler, with no provider to wire up: <DialogHost /> (app/components/DialogHost.tsx)
 * renders them. On a page without a host they fall back to the browser's own dialogs, so a call is never lost.
 */

export type NoticeTone = "info" | "success" | "error";

export type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button as destructive. Guessed from the wording when omitted (delete, remove, stop...). */
  tone?: "default" | "danger";
};

export type ConfirmRequest = { id: number; message: string; options: ConfirmOptions; resolve: (accepted: boolean) => void };
export type Notice = { id: number; message: string; tone: NoticeTone };

type State = { confirm: ConfirmRequest | null; queue: ConfirmRequest[]; notices: Notice[] };

let state: State = { confirm: null, queue: [], notices: [] };
let nextId = 1;
let hosts = 0;
const listeners = new Set<() => void>();

function emit() {
  state = { ...state };
  listeners.forEach((listener) => listener());
}

export function subscribeDialogs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDialogState() {
  return state;
}

/** Called by <DialogHost /> while it is mounted, so calls know someone will draw them. */
export function registerDialogHost() {
  hosts += 1;
  return () => {
    hosts = Math.max(0, hosts - 1);
  };
}

const DANGEROUS_START = /^\s*(حذف|إلغاء|إيقاف|فك|إزالة|Delete|Remove|Revoke|Stop|Unlink|Cancel)(?![\p{L}])/iu;

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (hosts === 0) {
    // No host on this page (or server render): the browser's own dialog, so the question is still asked.
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false);
  }
  return new Promise<boolean>((resolve) => {
    const request: ConfirmRequest = {
      id: nextId++,
      message,
      options: { ...options, tone: options.tone ?? (DANGEROUS_START.test(message) ? "danger" : "default") },
      resolve
    };
    if (state.confirm) state.queue.push(request);
    else state.confirm = request;
    emit();
  });
}

/** Called by the host when the person answers. */
export function answerConfirm(accepted: boolean) {
  const current = state.confirm;
  if (!current) return;
  current.resolve(accepted);
  state.confirm = state.queue.shift() ?? null;
  emit();
}

const NOTICE_MS: Record<NoticeTone, number> = { info: 6000, success: 4000, error: 9000 };

export function notify(message: string, tone: NoticeTone = "info") {
  const text = String(message || "").trim();
  if (!text) return;
  if (hosts === 0) {
    if (typeof window !== "undefined") window.alert(text);
    return;
  }
  const notice: Notice = { id: nextId++, message: text, tone };
  state.notices = [...state.notices.slice(-3), notice];
  emit();
  if (typeof window !== "undefined") window.setTimeout(() => dismissNotice(notice.id), NOTICE_MS[tone]);
}

/** An error the person should notice: a red toast that is announced to screen readers as an alert. */
export function notifyError(message: string) {
  notify(message, "error");
}

export function dismissNotice(id: number) {
  if (!state.notices.some((notice) => notice.id === id)) return;
  state.notices = state.notices.filter((notice) => notice.id !== id);
  emit();
}
