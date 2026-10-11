"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Source = { platform: "meta" | "tiktok" | "unknown"; adId: string; headline: string; sourceUrl: string; hasClickId: boolean; createdAt: string };

/** Shows which ad opened the conversation; renders nothing when it did not come from an ad. */
export default function AdSourceInfo({ conversationId }: { conversationId: string }) {
  const { t } = useLanguage();
  const [source, setSource] = useState<Source | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
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
  const platform = source.platform === "tiktok" ? "TikTok" : source.platform === "meta" ? "Meta (Facebook / Instagram)" : t("إعلان", "Ad");
  return (
    <div>
      <dt>{t("مصدر المحادثة", "Conversation source")}</dt>
      <dd>
    <span style={{ display: "grid", gap: 4 }}>
      <b>{t(`جاءت من إعلان ${platform}`, `Came from a ${platform} ad`)}</b>
      {source.headline ? <span>{source.headline}</span> : null}
      {source.adId ? <small dir="ltr">{t("معرّف الإعلان", "Ad ID")}: {source.adId}</small> : null}
      {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ overflowWrap: "anywhere" }}>{source.sourceUrl}</a> : null}
      {source.platform === "tiktok" ? <small>{source.hasClickId ? t("معرّف النقر محفوظ ويُرسل مع أحداث TikTok.", "Click ID saved and sent with TikTok events.") : t("لم يصل معرّف النقر.", "No click ID received.")}</small> : null}
    </span>
      </dd>
    </div>
  );
}
