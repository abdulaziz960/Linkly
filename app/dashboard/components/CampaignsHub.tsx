"use client";

import { cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { Tag } from "../types";
import { useLanguage } from "../i18n";
import SegmentsView, { type SegTab } from "../views/SegmentsView";

type HubSection = "list" | SegTab;
const sections: HubSection[] = ["list", "report", "audience", "segments", "unsubscribed"];

/** One campaigns page per channel: the campaign list plus its reports, audience classification, customer segments and unsubscribed list as tabs. */
export default function CampaignsHub({ channel, tags, list, initialSection = "list" }: { channel: "whatsapp" | "email"; tags: Tag[]; list: ReactElement<{ hubTabs?: ReactNode }>; initialSection?: HubSection }) {
  const { t } = useLanguage();
  const [section, setSection] = useState<HubSection>(initialSection);

  useEffect(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("hub") as HubSection | null;
      if (wanted && sections.includes(wanted)) setSection(wanted);
    } catch {
      // the address is a convenience only
    }
  }, []);

  function choose(next: HubSection) {
    setSection(next);
    try {
      const params = new URLSearchParams(window.location.search);
      if (next === "list") params.delete("hub"); else params.set("hub", next);
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    } catch {
      // the address is a convenience only
    }
  }

  const tabs: Array<[HubSection, string]> = [
    ["list", t("الحملات", "Campaigns")],
    ["report", t("التقارير الشاملة", "Full reports")],
    ["audience", t("تصنيفات الجمهور", "Audience by campaign")],
    ["segments", t("تقسيم العملاء", "Customer segments")],
    ["unsubscribed", t("ألغوا الاشتراك", "Unsubscribed")]
  ];

  const tabsBar = (
    <div className="seg-tabs hub-tabs segments-print-hide" role="tablist" aria-label={channel === "email" ? t("النشرات البريدية", "Email newsletters") : t("حملات الواتساب", "WhatsApp campaigns")}>
      {tabs.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={section === key} className={section === key ? "seg-tab active" : "seg-tab"} onClick={() => choose(key)}>{label}</button>
      ))}
    </div>
  );

  return (
    <div className="campaigns-hub">
      {section === "list" && isValidElement(list) ? cloneElement(list, { hubTabs: tabsBar }) : (
        <>
          <div className="camp-hero">
            <div className="camp-hero-text">
              <small>{t("مركز الحملات", "CAMPAIGN CENTER")}</small>
              <h1>{channel === "email" ? t("حملات النشرات البريدية", "Email newsletters") : t("حملات الواتساب", "WhatsApp campaigns")}</h1>
              <p>{t("أنشئ جمهورك، اختر القالب، راجع التفاصيل ثم تابع التنفيذ من مكان واحد.", "Build your audience, choose a template, review details, and track execution in one place.")}</p>
            </div>
          </div>
          {tabsBar}
          <SegmentsView tags={tags} channel={channel} section={section as SegTab} />
        </>
      )}
    </div>
  );
}
