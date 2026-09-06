// Native browser notifications for new inbound messages - fire even when
// this tab isn't focused or is in the background, unlike the in-page chime
// (notification-sound.ts) which only helps while the tab is actually open
// and visible.

export function requestNotificationPermissionOnce() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission();
}

export function showNewMessageNotification(customerNames: string[]) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // The in-page chime + UI update already cover the case where the user is
  // looking at this tab right now - a native notification on top of that
  // would just be a redundant, distracting popup.
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  const title = customerNames.length === 1
    ? `رسالة جديدة من ${customerNames[0]}`
    : `${customerNames.length} رسائل جديدة`;
  const body = customerNames.length === 1
    ? "افتح لوحة Linkly للرد."
    : `من: ${customerNames.slice(0, 3).join("، ")}${customerNames.length > 3 ? "…" : ""}`;

  try {
    const notification = new Notification(title, { body, icon: "/assets/linkly-logo.png", tag: "linkly-new-message" });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Ignore - native notifications are a nice-to-have, never worth surfacing an error for.
  }
}
