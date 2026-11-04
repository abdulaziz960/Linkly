"use client";

import { useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";

export type AdEventPreset = { value: string; ar: string; en: string };

const CUSTOM = "__custom";

/**
 * One row per pipeline stage: pick the ad-platform event it sends from the platform's standard
 * events (each explained), "send nothing", or a custom event typed by hand. Shared by the Meta,
 * TikTok and Snapchat settings so they behave the same.
 */
export default function AdEventMappingTable({
  statuses,
  mapping,
  onChange,
  presets,
  sanitize,
  customPlaceholder,
  stageHeader,
  eventHeader,
  inputStyle
}: {
  statuses: string[];
  mapping: Record<string, string>;
  onChange: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  presets: AdEventPreset[];
  /** Cleans what is typed in the custom field (case / allowed characters of that platform). */
  sanitize: (raw: string) => string;
  customPlaceholder: string;
  stageHeader: string;
  eventHeader: string;
  inputStyle: React.CSSProperties;
}) {
  const { t, language } = useLanguage();
  const lang = language === "en" ? "en" : "ar";
  // Stages the client switched to "custom event" (kept even while the field is still empty).
  const [forcedCustom, setForcedCustom] = useState<string[]>([]);
  const isPreset = (value: string) => presets.some((preset) => preset.value === value);
  const isCustom = (status: string) => forcedCustom.includes(status) || Boolean(mapping[status] && !isPreset(mapping[status]));

  function pick(status: string, value: string) {
    if (value === CUSTOM) {
      setForcedCustom((current) => (current.includes(status) ? current : [...current, status]));
      onChange((current) => ({ ...current, [status]: isPreset(current[status] ?? "") ? "" : current[status] ?? "" }));
      return;
    }
    setForcedCustom((current) => current.filter((item) => item !== status));
    onChange((current) => ({ ...current, [status]: value }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.8fr) 1.4fr", gap: "10px 12px", alignItems: "center" }}>
      <b style={{ fontSize: 12.5, opacity: 0.7 }}>{stageHeader}</b>
      <b style={{ fontSize: 12.5, opacity: 0.7 }}>{eventHeader}</b>
      {statuses.map((status) => (
        <div key={status} style={{ display: "contents" }}>
          <span style={{ fontWeight: 700 }}>{stageDisplayLabel(status, lang)}</span>
          <div style={{ display: "grid", gap: 6 }}>
            <CustomSelect
              ariaLabel={status}
              value={isCustom(status) ? CUSTOM : mapping[status] ?? ""}
              onChange={(value) => pick(status, value)}
              options={[
                { value: "", label: t("لا ترسل شيئًا", "Send nothing") },
                ...presets.map((preset) => ({ value: preset.value, label: `${preset.value} — ${lang === "en" ? preset.en : preset.ar}` })),
                { value: CUSTOM, label: t("حدث مخصص…", "Custom event…") }
              ]}
            />
            {isCustom(status) ? (
              <input
                dir="ltr"
                style={inputStyle}
                aria-label={`${status} custom`}
                value={mapping[status] ?? ""}
                onChange={(event) => onChange((current) => ({ ...current, [status]: sanitize(event.target.value) }))}
                placeholder={customPlaceholder}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
