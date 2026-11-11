// Installed alongside the dashboard PWA (see app/dashboard/components/PwaInstallButton.tsx,
// registered from app/dashboard/layout.tsx). Only handles Web Push - no
// offline caching, since the dashboard needs a live connection anyway.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Linkly", body: event.data.text() };
  }

  const title = payload.title || "رسالة جديدة";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // One notification per conversation (the server sends the tag): a second chat no longer replaces the first.
    tag: payload.tag || "linkly-message",
    renotify: true,
    data: { url: payload.url || "/dashboard?view=inbox" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard?view=inbox";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// The browser rotated or dropped our subscription: take a new one and tell the server, so notifications keep coming
// without anyone having to open the app and switch them on again.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const keyResponse = await fetch("/api/push/vapid-public-key").then((res) => res.json());
      const publicKey = keyResponse?.data?.publicKey;
      if (!publicKey) return;
      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()), credentials: "same-origin" });
    } catch {
      // The next time the app is opened it registers again (see usePwaInstall).
    }
  })());
});
