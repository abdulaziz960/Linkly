"use client";

import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import type { Campaign, Segment, Tag } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import CampaignEngagementReport from "../components/CampaignEngagementReport";
import type { EngagementBucket } from "../../../lib/campaign-engagement";

type EngagementBucketOrEmpty = "" | EngagementBucket;

type SegmentFormState = {
  id?: string;
  name: string;
  tagNames: string[];
  inactiveDays: string;
  sourceCampaignId: string;
  engagementBucket: EngagementBucketOrEmpty;
  engagementDateFrom: string;
  engagementDateTo: string;
  engagementClickCount: string;
};

const emptyForm: SegmentFormState = {
  name: "", tagNames: [], inactiveDays: "", sourceCampaignId: "",
  engagementBucket: "", engagementDateFrom: "", engagementDateTo: "", engagementClickCount: ""
};

// A segment can only target a campaign that has actually gone out - one
// still scheduled or cancelled has no CampaignRecipient engagement data yet.
const launchedCampaignStatuses = new Set(["قيد الإرسال", "الحملة أنجزت"]);

type OverviewRow = { name: string; phone: string; campaignName: string; clickCount: number };
type Overview = { counts: Record<EngagementBucket, number>; rows: Record<EngagementBucket, OverviewRow[]> };
type SegmentRecipientDetail = { name: string; phone: string; campaignName: string; clickCount: number };

// clickCount is 0 for a recipient who clicked before this counter existed
// (the column defaults to 0 and old clicks are never backfilled), and is
// meaningless outside the "clicked" bucket - "-" is clearer there than a
// misleading "0", matching CampaignEngagementReport's same convention.
function clickCountLabel(bucket: EngagementBucket, clickCount: number) {
  if (bucket !== "clicked" || clickCount <= 0) return "-";
  return clickCount.toLocaleString("en-US");
}

function downloadBlob(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SegmentsView({ tags }: { tags: Tag[] }) {
  const { t, language } = useLanguage();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SegmentFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);

  const [overviewDateFrom, setOverviewDateFrom] = useState("");
  const [overviewDateTo, setOverviewDateTo] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<EngagementBucket | null>(null);
  const [quickSaveName, setQuickSaveName] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickSaveMessage, setQuickSaveMessage] = useState("");
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
  const [segmentDetails, setSegmentDetails] = useState<SegmentRecipientDetail[]>([]);
  const [segmentDetailsLoading, setSegmentDetailsLoading] = useState(false);

  const launchedCampaigns = useMemo(() => campaigns.filter((campaign) => launchedCampaignStatuses.has(campaign.status)), [campaigns]);

  async function loadSegments() {
    setLoading(true);
    try {
      const response = await fetch("/api/segments");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setSegments(body.data ?? []);
    } catch {
      // Non-critical - the list simply stays as-is on a transient failure.
    }
    setLoading(false);
  }

  async function loadCampaigns() {
    try {
      const response = await fetch("/api/campaigns");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setCampaigns(body.data ?? []);
    } catch {
      // Non-critical - campaign-engagement targeting just won't be offered.
    }
  }

  async function loadOverview(dateFrom: string, dateTo: string) {
    setOverviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const response = await fetch(`/api/segments/engagement-overview?${params.toString()}`);
      const body = await response.json().catch(() => null);
      setOverview(response.ok && body?.ok ? body.data : null);
    } catch {
      setOverview(null);
    }
    setOverviewLoading(false);
  }

  useEffect(() => {
    loadSegments();
    loadCampaigns();
    loadOverview("", "");
  }, []);

  function applyOverviewDates() {
    setActiveBucket(null);
    setQuickSaveMessage("");
    loadOverview(overviewDateFrom, overviewDateTo);
  }

  function clearOverviewDates() {
    setOverviewDateFrom("");
    setOverviewDateTo("");
    setActiveBucket(null);
    setQuickSaveMessage("");
    loadOverview("", "");
  }

  const filteredSegments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return segments;
    return segments.filter((segment) => segment.name.toLowerCase().includes(query));
  }, [search, segments]);

  function openCreateForm() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  async function toggleSegmentDetails(segment: Segment) {
    if (expandedSegmentId === segment.id) {
      setExpandedSegmentId(null);
      return;
    }
    setExpandedSegmentId(segment.id);
    setSegmentDetails([]);
    setSegmentDetailsLoading(true);
    try {
      const response = await fetch(`/api/segments/${segment.id}/recipients`);
      const body = await response.json().catch(() => null);
      setSegmentDetails(response.ok && body?.ok ? body.data ?? [] : []);
    } catch {
      setSegmentDetails([]);
    }
    setSegmentDetailsLoading(false);
  }

  function toggleTag(tagName: string) {
    setForm((current) => ({
      ...current,
      tagNames: current.tagNames.includes(tagName)
        ? current.tagNames.filter((name) => name !== tagName)
        : [...current.tagNames, tagName]
    }));
  }

  async function saveSegment(payload: { name: string; tagNames: string[]; inactiveDays: number; sourceCampaignId: string; engagementBucket: EngagementBucketOrEmpty; engagementDateFrom: string; engagementDateTo: string; engagementClickCount: number }, id?: string) {
    const response = await fetch(id ? `/api/segments/${id}` : "/api/segments", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => null);
    return { ok: Boolean(response.ok && body?.ok), error: body?.error as string | undefined };
  }

  async function submitSegment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const result = await saveSegment({
      name: form.name,
      tagNames: form.tagNames,
      inactiveDays: Number(form.inactiveDays) || 0,
      sourceCampaignId: form.sourceCampaignId,
      engagementBucket: form.engagementBucket,
      engagementDateFrom: form.engagementDateFrom,
      engagementDateTo: form.engagementDateTo,
      engagementClickCount: form.engagementBucket === "clicked" ? Number(form.engagementClickCount) || 0 : 0
    }, form.id);

    if (!result.ok) {
      setError(result.error || t("تعذر حفظ التقسيم", "Could not save the segment"));
      setSaving(false);
      return;
    }

    await loadSegments();
    setSaving(false);
    setFormOpen(false);
  }

  async function saveQuickSegment() {
    if (!activeBucket || !quickSaveName.trim()) return;
    setQuickSaving(true);
    setQuickSaveMessage("");

    const result = await saveSegment({
      name: quickSaveName.trim(),
      tagNames: [],
      inactiveDays: 0,
      sourceCampaignId: "",
      engagementBucket: activeBucket,
      engagementDateFrom: overviewDateFrom,
      engagementDateTo: overviewDateTo,
      engagementClickCount: 0
    });

    if (!result.ok) {
      setQuickSaveMessage(result.error || t("تعذر حفظ المجموعة", "Could not save the group"));
      setQuickSaving(false);
      return;
    }

    await loadSegments();
    setQuickSaveName("");
    setQuickSaveMessage(t("تم حفظ المجموعة بنجاح - تقدر تختارها الآن عند إنشاء حملة.", "Group saved - you can now pick it when creating a campaign."));
    setQuickSaving(false);
  }

  function engagementBucketLabel(bucket: EngagementBucketOrEmpty) {
    if (bucket === "clicked") return t("تفاعل مع الحملة", "Clicked the campaign");
    if (bucket === "opened") return t("فتح الحملة بدون تفاعل", "Opened the campaign, no click");
    if (bucket === "notOpened") return t("لم يفتح الحملة", "Didn't open the campaign");
    if (bucket === "notReceived") return t("لم يستلم الرسالة", "Didn't receive the message");
    return "";
  }

  function shortBucketLabel(bucket: EngagementBucket) {
    if (bucket === "clicked") return t("تفاعل", "Clicked");
    if (bucket === "opened") return t("فتحها بدون ضغط", "Opened, no click");
    if (bucket === "notOpened") return t("ما فتحها", "Not opened");
    return t("لم يستلم الرسالة", "Didn't receive");
  }

  function criteriaSummary(segment: Segment) {
    const parts: string[] = [];
    if (segment.tagNames.length) parts.push(t(`الوسم: ${segment.tagNames.join("، ")}`, `Tag: ${segment.tagNames.join(", ")}`));
    if (segment.inactiveDays > 0) parts.push(t(`لم يتفاعل آخر ${segment.inactiveDays} يوم`, `Inactive for ${segment.inactiveDays}+ days`));
    if (segment.engagementBucket) {
      const scope = segment.sourceCampaignId
        ? campaigns.find((campaign) => campaign.id === segment.sourceCampaignId)?.name || t("حملة محذوفة", "Deleted campaign")
        : t("كل الحملات", "All campaigns");
      const range = segment.engagementDateFrom || segment.engagementDateTo
        ? ` (${segment.engagementDateFrom || "…"} → ${segment.engagementDateTo || "…"})`
        : "";
      const exactClicks = segment.engagementBucket === "clicked" && segment.engagementClickCount > 0
        ? ` - ${t(`نقر ${segment.engagementClickCount} مرة بالضبط`, `clicked exactly ${segment.engagementClickCount}x`)}`
        : "";
      parts.push(`${engagementBucketLabel(segment.engagementBucket)} - ${scope}${range}${exactClicks}`);
    }
    return parts.length ? parts.join(" + ") : t("كل العملاء", "All customers");
  }

  async function exportOverviewExcel() {
    if (!activeBucket || !overview) return;
    const rows = overview.rows[activeBucket];
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(shortBucketLabel(activeBucket), { views: [{ rightToLeft: language === "ar" }] });
    sheet.columns = [
      { header: t("الاسم", "Name"), key: "name", width: 28 },
      { header: t("رقم الهاتف", "Phone number"), key: "phone", width: 20 },
      { header: t("من أي حملة", "From which campaign"), key: "campaignName", width: 28 },
      ...(activeBucket === "clicked" ? [{ header: t("مرات النقر", "Clicks"), key: "clickCount", width: 14 }] : [])
    ];
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    const buffer = await book.xlsx.writeBuffer();
    downloadBlob(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${shortBucketLabel(activeBucket)}.xlsx`);
  }

  return (
    <section className="page-stack segments-page">
      <p className="segments-page-intro segments-print-hide">
        {t(
          "ثلاث خطوات: (١) شوف تصنيف عملائك تلقائيًا حسب تفاعلهم مع كل حملاتك، (٢) أو حسب حملة واحدة بالتحديد، (٣) ثم استخدم أي مجموعة محفوظة كجمهور جاهز عند إنشاء حملة جديدة.",
          "Three steps: (1) see your customers classified automatically by engagement across all campaigns, (2) or by one specific campaign, (3) then use any saved group as a ready-made audience when creating a new campaign."
        )}
      </p>

      <div className="panel">
        <div className="panel-head">
          <h2><span className="segment-section-badge">١</span> {t("أداء الحملات - كل العملاء", "Campaign performance - all customers")} <span className="segment-section-tag">{t("تلقائي", "Automatic")}</span></h2>
        </div>
        <div className="panel-body">
          <p className="muted-copy">{t("تصنيف تلقائي لكل عملائك عبر جميع الحملات مجتمعة - إذا تفاعل عميل مع أكثر من حملة، تُحتسب أفضل حالة تفاعل له. حدد فترة زمنية لتضييق النتائج ثم احفظها كمجموعة باسم تختاره لاستخدامها لاحقًا بحملة جديدة.", "An automatic breakdown of every customer across all your campaigns combined - a customer active in more than one campaign counts under their single best engagement. Narrow by date range, then save the result as a named group to reuse in a new campaign.")}</p>
          <div className="inline-filter segments-print-hide">
            <label className="entries">{t("من", "From")} <input type="date" value={overviewDateFrom} onChange={(event) => setOverviewDateFrom(event.target.value)} /></label>
            <label className="entries">{t("إلى", "To")} <input type="date" value={overviewDateTo} onChange={(event) => setOverviewDateTo(event.target.value)} /></label>
            <button className="btn primary" type="button" onClick={applyOverviewDates}>{t("تطبيق", "Apply")}</button>
            <button className="btn soft" type="button" onClick={clearOverviewDates}>{t("مسح", "Clear")}</button>
          </div>
          {overviewLoading ? <p className="muted-copy">{t("جارٍ التحميل...", "Loading...")}</p> : null}
          {!overviewLoading && overview ? (
            <>
              <div className="campaign-engagement-tiles campaign-engagement-tiles-4 segments-print-hide">
                {(["notReceived", "notOpened", "opened", "clicked"] as EngagementBucket[]).map((bucket) => (
                  <button
                    key={bucket}
                    type="button"
                    className={activeBucket === bucket ? "engagement-tile active" : "engagement-tile"}
                    onClick={() => { setActiveBucket((current) => current === bucket ? null : bucket); setQuickSaveMessage(""); }}
                  >
                    <b>{overview.counts[bucket].toLocaleString("en-US")}</b>
                    <span>{shortBucketLabel(bucket)}</span>
                  </button>
                ))}
              </div>
              {activeBucket ? (
                <>
                  <div className="campaign-toolbar report-toolbar segments-print-hide">
                    <button className="btn soft" type="button" onClick={exportOverviewExcel}>{t("تصدير Excel", "Export Excel")}</button>
                    <button className="btn soft" type="button" onClick={() => window.print()}>{t("تصدير PDF", "Export PDF")}</button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t("الاسم", "Name")}</th><th>{t("رقم الهاتف", "Phone number")}</th><th>{t("من أي حملة", "From which campaign")}</th>{activeBucket === "clicked" ? <th>{t("مرات النقر", "Clicks")}</th> : null}<th className="segments-print-hide">{t("إجراء", "Action")}</th></tr></thead>
                      <tbody>
                        {overview.rows[activeBucket].map((row) => (
                          <tr key={row.phone}>
                            <td>{row.name || "-"}</td>
                            <td dir="ltr">{row.phone}</td>
                            <td>{row.campaignName || t("حملة محذوفة", "Deleted campaign")}</td>
                            {activeBucket === "clicked" ? <td>{clickCountLabel(activeBucket, row.clickCount)}</td> : null}
                            <td className="segments-print-hide"><a className="btn soft" href={`/dashboard?view=inbox&phone=${encodeURIComponent(row.phone)}&name=${encodeURIComponent(row.name)}`} target="_blank" rel="noopener noreferrer">{t("إرسال رسالة", "Send message")}</a></td>
                          </tr>
                        ))}
                        {!overview.rows[activeBucket].length ? <tr><td colSpan={activeBucket === "clicked" ? 5 : 4}>{t("لا يوجد عملاء بهذه الحالة.", "No customers in this state.")}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="quick-save-segment segments-print-hide">
                    <input value={quickSaveName} onChange={(event) => setQuickSaveName(event.target.value)} placeholder={t("اكتب اسم المجموعة لحفظها كتقسيم...", "Type a group name to save it as a segment...")} />
                    <button className="btn primary" type="button" disabled={quickSaving || !quickSaveName.trim()} onClick={saveQuickSegment}>{quickSaving ? t("جارٍ الحفظ...", "Saving...") : t("حفظ كتقسيم", "Save as segment")}</button>
                  </div>
                  {quickSaveMessage ? <p className="form-error segments-print-hide">{quickSaveMessage}</p> : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="panel campaign-classification-panel">
        <div className="panel-head">
          <h2><span className="segment-section-badge">٢</span> {t("تصنيف حسب الحملات", "Classification by campaign")} <span className="segment-section-tag">{t("تلقائي", "Automatic")}</span></h2>
        </div>
        <div className="panel-body">
          <p className="muted-copy">{t("كل حملة أرسلتها تظهر هنا تلقائيًا مع تصنيف عملائها حسب تفاعلهم - اضغط على الحملة لعرض القوائم وإرسال رسالة مباشرة لأي عميل.", "Every campaign you've sent appears here automatically, with its recipients classified by engagement - click a campaign to see the lists and message any customer directly.")}</p>
          <div className="campaign-engagement-list">
            {launchedCampaigns.map((campaign) => (
              <div key={campaign.id} className="campaign-engagement-card">
                <button type="button" className="campaign-engagement-card-head" onClick={() => setExpandedCampaignId((current) => current === campaign.id ? null : campaign.id)}>
                  <span>{campaign.name}</span>
                  <span className="campaign-engagement-card-meta">{campaign.updatedAt} · {campaign.sent.toLocaleString("en-US")}/{campaign.total.toLocaleString("en-US")}</span>
                  <span aria-hidden="true">{expandedCampaignId === campaign.id ? "▲" : "▼"}</span>
                </button>
                {expandedCampaignId === campaign.id ? <CampaignEngagementReport campaignId={campaign.id} campaignName={campaign.name} /> : null}
              </div>
            ))}
            {!launchedCampaigns.length ? <p className="muted-copy">{t("لا توجد حملات مرسلة بعد.", "No campaigns sent yet.")}</p> : null}
          </div>
        </div>
      </div>

      <div className="panel segments-manual-panel">
        <div className="panel-head">
          <h2><span className="segment-section-badge">٣</span> {t("المجموعات المحفوظة", "Saved groups")} <span className="segment-section-tag segment-section-tag-manual">{t("يدوي", "Manual")}</span></h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة تقسيم", "Add segment")}</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("أنشئ تقسيماً بناءً على الوسوم أو عدم التفاعل أو تفاعل الحملات، واستخدمه مباشرة كجمهور عند إنشاء حملة جديدة.", "Build a segment from tags, inactivity, or campaign engagement, and use it directly as a campaign's audience.")}</p>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث باسم التقسيم...", "Search by segment name...")} />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>{t("مسح", "Clear")}</button>
          </div>
          <table>
            <thead><tr><th>{t("الاسم", "Name")}</th><th>{t("الشروط", "Criteria")}</th><th>{t("عدد العملاء", "Recipients")}</th></tr></thead>
            <tbody>
              {filteredSegments.map((segment) => (
                <Fragment key={segment.id}>
                  <tr className="segment-row-clickable" onClick={() => toggleSegmentDetails(segment)}>
                    <td><b>{segment.name}</b> <span aria-hidden="true">{expandedSegmentId === segment.id ? "▲" : "▼"}</span></td>
                    <td>{criteriaSummary(segment)}</td>
                    <td>{segment.recipientCount.toLocaleString("en-US")}</td>
                  </tr>
                  {expandedSegmentId === segment.id ? (
                    <tr>
                      <td colSpan={3}>
                        {segmentDetailsLoading ? <p className="muted-copy">{t("جارٍ التحميل...", "Loading...")}</p> : (
                          <div className="table-wrap">
                            <table>
                              <thead><tr><th>{t("الاسم", "Name")}</th><th>{t("رقم الهاتف", "Phone number")}</th><th>{t("من أي حملة", "From which campaign")}</th>{segment.engagementBucket === "clicked" ? <th>{t("مرات النقر", "Clicks")}</th> : null}<th>{t("إجراء", "Action")}</th></tr></thead>
                              <tbody>
                                {segmentDetails.map((row) => (
                                  <tr key={row.phone}>
                                    <td>{row.name || "-"}</td>
                                    <td dir="ltr">{row.phone}</td>
                                    <td>{row.campaignName || "-"}</td>
                                    {segment.engagementBucket === "clicked" ? <td>{clickCountLabel(segment.engagementBucket, row.clickCount)}</td> : null}
                                    <td><a className="btn soft" href={`/dashboard?view=inbox&phone=${encodeURIComponent(row.phone)}&name=${encodeURIComponent(row.name)}`} target="_blank" rel="noopener noreferrer">{t("إرسال رسالة", "Send message")}</a></td>
                                  </tr>
                                ))}
                                {!segmentDetails.length ? <tr><td colSpan={segment.engagementBucket === "clicked" ? 5 : 4}>{t("لا يوجد عملاء مطابقون حاليًا.", "No matching customers right now.")}</td></tr> : null}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!filteredSegments.length ? (
                <tr><td colSpan={3}>{loading ? t("جاري التحميل...", "Loading...") : segments.length ? t("لا توجد تقسيمات مطابقة للبحث.", "No segments match your search.") : t("لا توجد تقسيمات بعد، اضغط \"إضافة تقسيم\" لإنشاء أول واحد.", "No segments yet — click \"Add segment\" to create your first one.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ تقسيم", "Save segment")} onSubmit={submitSegment} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل تقسيم", "Edit segment") : t("إضافة تقسيم", "Add segment")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("اسم التقسيم", "Segment name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("الوسوم (اختياري - أي وسم يطابق)", "Tags (optional - any match)")}</span>
                <div className="segment-tag-picker">
                  {tags.map((tag) => (
                    <label key={tag.id} className="segment-tag-option">
                      <input type="checkbox" checked={form.tagNames.includes(tag.name)} onChange={() => toggleTag(tag.name)} />
                      <span className="tag-color-swatch" style={{ background: tag.color }} />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                  {!tags.length ? <p className="muted-copy">{t("لا توجد وسوم بعد.", "No tags yet.")}</p> : null}
                </div>
              </label>
              <label>
                <span>{t("عدم التفاعل لعدد أيام (اختياري)", "Inactive for N days (optional)")}</span>
                <input
                  type="number"
                  min={0}
                  value={form.inactiveDays}
                  onChange={(event) => setForm((current) => ({ ...current, inactiveDays: event.target.value }))}
                  placeholder={t("بدون شرط", "No condition")}
                />
                <small className="field-hint">{t("مثال: 30 يعني عملاء لم يتفاعلوا خلال آخر 30 يوم.", "Example: 30 means customers who haven't interacted in the last 30 days.")}</small>
              </label>
              <label>
                <span>{t("استهداف حسب تفاعل الحملات (اختياري)", "Target by campaign engagement (optional)")}</span>
                <CustomSelect
                  value={form.engagementBucket}
                  onChange={(value) => setForm((current) => ({
                    ...current, engagementBucket: value as EngagementBucketOrEmpty,
                    sourceCampaignId: value ? current.sourceCampaignId : "",
                    engagementDateFrom: value ? current.engagementDateFrom : "",
                    engagementDateTo: value ? current.engagementDateTo : "",
                    engagementClickCount: value === "clicked" ? current.engagementClickCount : ""
                  }))}
                  options={[
                    { value: "", label: t("بدون شرط", "No condition") },
                    { value: "notReceived", label: t("لم يستلم الرسالة", "Didn't receive the message") },
                    { value: "notOpened", label: t("لم يفتح الرسالة", "Didn't open the message") },
                    { value: "opened", label: t("فتحها بدون تفاعل", "Opened, no click") },
                    { value: "clicked", label: t("تفاعل (ضغط الرابط أو الزر)", "Clicked (link or button)") }
                  ]}
                />
              </label>
              {form.engagementBucket ? (
                <>
                  <label>
                    <span>{t("الحملة (اختياري - افتراضيًا كل الحملات)", "Campaign (optional - defaults to all campaigns)")}</span>
                    <CustomSelect
                      value={form.sourceCampaignId}
                      onChange={(value) => setForm((current) => ({ ...current, sourceCampaignId: value }))}
                      options={[
                        { value: "", label: t("كل الحملات", "All campaigns") },
                        ...launchedCampaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))
                      ]}
                    />
                  </label>
                  <label>
                    <span>{t("من تاريخ الإرسال (اختياري)", "From send date (optional)")}</span>
                    <input type="date" value={form.engagementDateFrom} onChange={(event) => setForm((current) => ({ ...current, engagementDateFrom: event.target.value }))} />
                  </label>
                  <label>
                    <span>{t("إلى تاريخ الإرسال (اختياري)", "To send date (optional)")}</span>
                    <input type="date" value={form.engagementDateTo} onChange={(event) => setForm((current) => ({ ...current, engagementDateTo: event.target.value }))} />
                  </label>
                  <small className="field-hint">{t("يقتصر هذا الشرط على العملاء المطابقين ضمن الحملة والفترة المحددتين (أو كل الحملات إذا تُركتا فارغتين).", "This condition only applies to matching customers within the chosen campaign and date range (or every campaign if left blank).")}</small>
                </>
              ) : null}
              {form.engagementBucket === "clicked" ? (
                <label>
                  <span>{t("عدد مرات النقر بالضبط (اختياري)", "Exact number of clicks (optional)")}</span>
                  <input
                    type="number"
                    min={0}
                    value={form.engagementClickCount}
                    onChange={(event) => setForm((current) => ({ ...current, engagementClickCount: event.target.value }))}
                    placeholder={t("بدون شرط", "No condition")}
                  />
                  <small className="field-hint">{t("مثال: 3 يعني عملاء ضغطوا الرابط 3 مرات بالضبط. اتركه فارغاً ليشمل كل من تفاعل بغض النظر عن عدد مرات النقر.", "Example: 3 means customers who clicked the link exactly 3 times. Leave it blank to include everyone who clicked, regardless of how many times.")}</small>
                </label>
              ) : null}
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving || !form.name.trim()}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
