"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Source = { platform: "meta" | "tiktok" | "unknown"; adId: string; headline: string; sourceUrl: string; hasClickId: boolean; thumbnailUrl?: string; mediaType?: "image" | "video" | "" };

/** A slim strip above the messages saying which ad opened the conversation; nothing is shown for conversations that did not come from an ad. */
export default function AdSourceBanner({ conversationId }: { conversationId: string }) {
  const { t } = useLanguage();
  const [source, setSource] = useState<Source | null>(null);
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setOpen(false);
    setImageFailed(false);
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}/ad-source`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: Source | null }) => {
        if (!cancelled && result.ok && result.data) setSource(result.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!source) return null;
  const platform = source.platform === "tiktok" ? "TikTok" : source.platform === "meta" ? "Meta" : t("إعلان", "Ad");

  return (
    <div style={{ flexShrink: 0, margin: "8px 12px 0", padding: "8px 12px", borderRadius: 12, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, rgba(23,138,130,0.07))", fontSize: 13.5, lineHeight: 1.7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {source.thumbnailUrl && !imageFailed ? (
          <a href={source.sourceUrl || source.thumbnailUrl} target="_blank" rel="noopener noreferrer" aria-label={t("فتح الإعلان", "Open the ad")} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            {/* The ad picture comes from the ad platform's CDN; if it expired the strip simply drops it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source.thumbnailUrl} alt={source.headline || t("صورة الإعلان", "Ad picture")} width={40} height={40} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line, #dfe7e5)" }} />
            {source.mediaType === "video" ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 14, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>▶</span> : null}
          </a>
        ) : null}
        <span style={{ padding: "1px 10px", borderRadius: 999, fontWeight: 800, fontSize: 12, background: "#178a82", color: "#fff" }}>{platform}</span>
        <b>{t("جاءت من إعلان", "Came from an ad")}</b>
        {source.headline ? <span style={{ opacity: 0.85 }}>· {source.headline}</span> : null}
        {source.adId || source.sourceUrl ? (
          <button type="button" className="soft-action" style={{ marginInlineStart: "auto", minHeight: 28, padding: "0 10px", fontSize: 12.5 }} onClick={() => setOpen((current) => !current)} aria-expanded={open}>
            {open ? t("إخفاء التفاصيل", "Hide details") : t("التفاصيل", "Details")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
          {source.adId ? <small dir="ltr" style={{ textAlign: "start" }}>{t("معرّف الإعلان", "Ad ID")}: {source.adId}</small> : null}
          {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ overflowWrap: "anywhere", textAlign: "start" }}>{source.sourceUrl}</a> : null}
        </div>
      ) : null}
    </div>
  );
}
