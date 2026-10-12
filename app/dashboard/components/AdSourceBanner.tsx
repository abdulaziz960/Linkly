"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Source = { platform: "meta" | "tiktok" | "snapchat" | "google" | "unknown"; adId: string; headline: string; sourceUrl: string; hasClickId: boolean; thumbnailUrl?: string; mediaType?: "image" | "video" | ""; fromForm?: boolean };

/** A slim strip above the messages saying which ad opened the conversation; nothing is shown for conversations that did not come from an ad. */
export default function AdSourceBanner({ conversationId }: { conversationId: string }) {
  const { t } = useLanguage();
  const [source, setSource] = useState<Source | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
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
  const platform = source.platform === "tiktok" ? "TikTok" : source.platform === "snapchat" ? "Snapchat" : source.platform === "google" ? "Google" : source.platform === "meta" ? "Meta" : t("إعلان", "Ad");
  const showImage = Boolean(source.thumbnailUrl) && !imageFailed;
  const tile: React.CSSProperties = { width: 72, height: 72, borderRadius: 10, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, #f3f7f6)", flexShrink: 0 };

  return (
    <div style={{ flexShrink: 0, margin: "8px 12px 0", padding: 10, borderRadius: 12, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, rgba(23,138,130,0.07))", fontSize: 13.5, lineHeight: 1.7, display: "flex", gap: 12, alignItems: "flex-start" }}>
      {showImage ? (
        <a href={source.sourceUrl || source.thumbnailUrl} target="_blank" rel="noopener noreferrer" aria-label={t("فتح الإعلان", "Open the ad")} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
          {/* The ad picture comes from the ad platform's CDN; if it expired the strip falls back to the tile. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source.thumbnailUrl} alt={source.headline || t("صورة الإعلان", "Ad picture")} width={72} height={72} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} style={{ ...tile, objectFit: "cover" }} />
          {source.mediaType === "video" ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 22, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>▶</span> : null}
        </a>
      ) : (
        <span aria-hidden="true" style={{ ...tile, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13, color: "#178a82" }}>{source.mediaType === "video" ? "▶" : "AD"}</span>
      )}
      <div style={{ minWidth: 0, display: "grid", gap: 2, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ padding: "1px 10px", borderRadius: 999, fontWeight: 800, fontSize: 12, background: "#178a82", color: "#fff" }}>{platform}</span>
          <b>{source.fromForm ? t("جاءت من نموذج إعلان", "Came from an ad form") : t("جاءت من إعلان", "Came from an ad")}</b>
        </div>
        {source.headline ? <span style={{ fontWeight: 700 }}>{source.headline}</span> : null}
        {source.adId ? <small dir="ltr" style={{ textAlign: "start", opacity: 0.8 }}>{source.fromForm && source.platform === "snapchat" ? t("معرّف النموذج", "Form ID") : t("معرّف الإعلان", "Ad ID")}: {source.adId}</small> : null}
        {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ textAlign: "start", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.sourceUrl}</a> : null}
      </div>
    </div>
  );
}
