"use client";

import CustomSelect from "../../components/CustomSelect";
import { channelNames, type ChannelNameKey } from "../../channel-names";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";
import { EMPTY_LEAD_FILTERS, hasActiveFilters, type DatePreset, type FilterOptions, type LeadFilters } from "../lead-filters";
import { pipelineStages } from "../types";

type Props = {
  filters: LeadFilters;
  options: FilterOptions;
  total: number;
  shown: number;
  onChange: (next: LeadFilters) => void;
};

/** Search, date, platform chips and the source / project / stage / employee selects of the leads page. */
export default function LeadFiltersBar({ filters, options, total, shown, onChange }: Props) {
  const { t, language } = useLanguage();
  const lang = language === "en" ? "en" : "ar";
  const set = (patch: Partial<LeadFilters>) => onChange({ ...filters, ...patch });

  const channelLabel = (value: string) => (value in channelNames ? channelNames[value as ChannelNameKey][lang] : value);
  const sourceLabel = (value: string) =>
    ({
      meta: t("إعلانات ميتا", "Meta ads"),
      tiktok: t("إعلانات تيك توك", "TikTok ads"),
      snapchat: t("إعلانات سناب", "Snapchat ads"),
      google: t("إعلانات قوقل", "Google ads"),
      ad: t("إعلان (منصة غير معروفة)", "Ad (unknown platform)"),
      direct: t("مباشر (بدون إعلان)", "Direct (no ad)")
    }[value] ?? value);

  const datePresets: Array<{ value: DatePreset; label: string }> = [
    { value: "all", label: t("كل التواريخ", "All dates") },
    { value: "today", label: t("اليوم", "Today") },
    { value: "7d", label: t("آخر 7 أيام", "Last 7 days") },
    { value: "30d", label: t("آخر 30 يومًا", "Last 30 days") },
    { value: "custom", label: t("فترة مخصصة", "Custom range") }
  ];

  const chip = (active: boolean): React.CSSProperties => ({
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${active ? "#178a82" : "var(--line, #cfd9d6)"}`,
    background: active ? "#e1efed" : "var(--surface, #fff)",
    color: active ? "#106b65" : "inherit",
    font: "inherit",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer"
  });
  const input: React.CSSProperties = { minHeight: 40, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 600 };
  const field: React.CSSProperties = { display: "grid", gap: 4, minWidth: 150, flex: "1 1 150px", fontSize: 12.5, fontWeight: 800, opacity: 0.95 };

  return (
    <section className="lead-filters" aria-label={t("تصفية العملاء المحتملين", "Filter leads")} style={{ display: "grid", gap: 12, padding: 14, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)", marginBottom: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label style={{ ...field, flex: "2 1 220px" }}>
          {t("بحث بالاسم أو الجوال", "Search name or phone")}
          <input style={input} value={filters.search} onChange={(event) => set({ search: event.target.value })} placeholder={t("اكتب للبحث…", "Type to search…")} />
        </label>
        <label style={field}>
          {t("التاريخ", "Date")}
          <CustomSelect value={filters.datePreset} onChange={(value) => set({ datePreset: value as DatePreset })} options={datePresets} />
        </label>
        {filters.datePreset === "custom" ? (
          <>
            <label style={field}>
              {t("من", "From")}
              <input dir="ltr" type="date" style={input} value={filters.from} max={filters.to || undefined} onChange={(event) => set({ from: event.target.value })} />
            </label>
            <label style={field}>
              {t("إلى", "To")}
              <input dir="ltr" type="date" style={input} value={filters.to} min={filters.from || undefined} onChange={(event) => set({ to: event.target.value })} />
            </label>
          </>
        ) : null}
      </div>

      <div role="group" aria-label={t("المنصة", "Platform")} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>{t("المنصة", "Platform")}</span>
        <button type="button" style={chip(filters.channel === "all")} aria-pressed={filters.channel === "all"} onClick={() => set({ channel: "all" })}>
          {t("الكل", "All")} ({total})
        </button>
        {options.channels.map((channel) => (
          <button key={channel.value} type="button" style={chip(filters.channel === channel.value)} aria-pressed={filters.channel === channel.value} onClick={() => set({ channel: channel.value })}>
            {channelLabel(channel.value)} ({channel.count})
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label style={field}>
          {t("مصدر الإعلان", "Ad source")}
          <CustomSelect value={filters.source} onChange={(value) => set({ source: value })} options={[
            { value: "all", label: t("كل المصادر", "All sources") },
            ...options.sources.map((source) => ({ value: source.value, label: `${sourceLabel(source.value)} (${source.count})` }))
          ]} />
        </label>
        <label style={field}>
          {t("المشروع / الحملة", "Project / campaign")}
          <CustomSelect value={filters.project} onChange={(value) => set({ project: value })} options={[
            { value: "all", label: t("كل المشاريع", "All projects") },
            ...options.projects.map((project) => ({ value: project.value, label: `${project.value} (${project.count})` }))
          ]} />
        </label>
        <label style={field}>
          {t("المرحلة", "Stage")}
          <CustomSelect value={filters.stage} onChange={(value) => set({ stage: value })} options={[
            { value: "all", label: t("كل المراحل", "All stages") },
            ...pipelineStages.map((stage) => ({ value: stage, label: stageDisplayLabel(stage, lang) }))
          ]} />
        </label>
        <label style={field}>
          {t("الموظف", "Employee")}
          <CustomSelect value={filters.assignee} onChange={(value) => set({ assignee: value })} options={[
            { value: "all", label: t("كل الموظفين", "All employees") },
            ...options.assignees.map((assignee) => ({ value: assignee, label: assignee }))
          ]} />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }} aria-live="polite">
          {hasActiveFilters(filters) ? t(`يعرض ${shown} من ${total}`, `Showing ${shown} of ${total}`) : t(`${total} عميل محتمل`, `${total} leads`)}
        </span>
        {hasActiveFilters(filters) ? (
          <button type="button" className="soft-action" onClick={() => onChange(EMPTY_LEAD_FILTERS)}>{t("مسح الفلاتر", "Clear filters")}</button>
        ) : null}
      </div>
    </section>
  );
}
