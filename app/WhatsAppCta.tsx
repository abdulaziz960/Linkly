"use client";

import { useRef, useState } from "react";

// A real WhatsApp click-to-chat CTA for the marketing site, distinct from
// the existing "ابدأ تجربتك مجانًا" signup buttons. Records a LinkClick
// (page/link id + UTM/referrer context) before opening WhatsApp, and
// embeds that click's id as an invisible marker in the pre-filled message
// so an inbound reply can be attributed back to it - see
// app/api/attribution/click/route.ts and lib/whatsapp-inbox.ts.
export default function WhatsAppCta({
  pageId,
  linkId,
  buttonId,
  message,
  className,
  children
}: {
  pageId: string;
  linkId: string;
  buttonId?: string;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const navigating = useRef(false);
  const number = process.env.NEXT_PUBLIC_SALES_WHATSAPP_NUMBER;

  if (!number) return null;

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (navigating.current) return;
    navigating.current = true;
    setPending(true);

    let ref = "";
    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch("/api/attribution/click", {
        signal: AbortSignal.timeout(4000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          linkId,
          buttonId: buttonId || linkId,
          referrer: document.referrer || "",
          utmSource: params.get("utm_source") || "",
          utmMedium: params.get("utm_medium") || "",
          utmCampaign: params.get("utm_campaign") || "",
          utmContent: params.get("utm_content") || ""
        })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; id?: string } | null;
      if (result?.ok && result.id) ref = result.id;
    } catch {
      // Attribution is best-effort - never block the visitor from reaching WhatsApp over it.
    } finally {
      setPending(false);
      navigating.current = false;
    }

    const text = ref ? `${message}\n​[REF:${ref}]` : message;
    window.location.assign(`https://wa.me/${number}?text=${encodeURIComponent(text)}`);
  }

  return (
    <a href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`} className={className} onClick={handleClick} aria-busy={pending}>
      {children}
    </a>
  );
}
