"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Campaign, Segment, Tag } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type SegmentFormState = {
  id?: string;
  name: string;
  tagNames: string[];
  inactiveDays: string;
  sourceCampaignId: string;
  engagementBucket: "" | "notOpened" | "opened" | "clicked";
};

const emptyForm: SegmentFormState = { name: "", tagNames: [], inactiveDays: "", sourceCampaignId: "", engagementBucket: "" };

// A segment can only target a campaign that has actually gone out - one
// still scheduled or cancelled has no CampaignRecipient engagement data yet.
const launchedCampaignStatuses = new Set(["قيد الإرسال", "الحملة أنجزت"]);

export default function SegmentsView({ tags }: { tags: Tag[] }) {
  const { t } = useLanguage();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SegmentFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    loadSegments();
    loadCampaigns();
  }, []);

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

  function openEditForm(segment: Segment) {
    setError("");
    setForm({
      id: segment.id, name: segment.name, tagNames: segment.tagNames,
      inactiveDays: segment.inactiveDays ? String(segment.inactiveDays) : "",
      sourceCampaignId: segment.sourceCampaignId, engagementBucket: segment.engagementBucket
    });
    setFormOpen(true);
  }

  function toggleTag(tagName: string) {
    setForm((current) => ({
      ...current,
      tagNames: current.tagNames.includes(tagName)
        ? current.tagNames.filter((name) => name !== tagName)
        : [...current.tagNames, tagName]
    }));
  }

  async function submitSegment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.id ? `/api/segments/${form.id}` : "/api/segments", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        tagNames: form.tagNames,
        inactiveDays: Number(form.inactiveDays) || 0,
        sourceCampaignId: form.sourceCampaignId,
        engagementBucket: form.engagementBucket
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || t("تعذر حفظ التقسيم", "Could not save the segment"));
      setSaving(false);
      return;
    }

    await loadSegments();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteSegment(segment: Segment) {
    if (!window.confirm(t(`حذف تقسيم ${segment.name}؟`, `Delete segment "${segment.name}"?`))) return;
    await fetch(`/api/segments/${segment.id}`, { method: "DELETE" });
    await loadSegments();
  }

  function engagementBucketLabel(bucket: SegmentFormState["engagementBucket"]) {
    if (bucket === "clicked") return t("تفاعل مع الحملة", "Clicked the campaign");
    if (bucket === "opened") return t("فتح الحملة بدون تفاعل", "Opened the campaign, no click");
    if (bucket === "notOpened") return t("لم يفتح الحملة", "Didn't open the campaign");
    return "";
  }

  function criteriaSummary(segment: Segment) {
    const parts: string[] = [];
    if (segment.tagNames.length) parts.push(t(`الوسم: ${segment.tagNames.join("، ")}`, `Tag: ${segment.tagNames.join(", ")}`));
    if (segment.inactiveDays > 0) parts.push(t(`لم يتفاعل آخر ${segment.inactiveDays} يوم`, `Inactive for ${segment.inactiveDays}+ days`));
    if (segment.sourceCampaignId && segment.engagementBucket) {
      const campaignName = campaigns.find((campaign) => campaign.id === segment.sourceCampaignId)?.name || t("حملة محذوفة", "Deleted campaign");
      parts.push(`${engagementBucketLabel(segment.engagementBucket)} (${campaignName})`);
    }
    return parts.length ? parts.join(" + ") : t("كل العملاء", "All customers");
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("تقسيم الجمهور", "Segments")}</h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة تقسيم", "Add segment")}</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("أنشئ تقسيماً بناءً على الوسوم أو عدم التفاعل لفترة معينة، واستخدمه مباشرة كجمهور عند إنشاء حملة جديدة.", "Build a segment from tags or a period of inactivity, and use it directly as a campaign's audience.")}</p>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث باسم التقسيم...", "Search by segment name...")} />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>{t("مسح", "Clear")}</button>
          </div>
          <table>
            <thead><tr><th>{t("الاسم", "Name")}</th><th>{t("الشروط", "Criteria")}</th><th>{t("عدد العملاء", "Recipients")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {filteredSegments.map((segment) => (
                <tr key={segment.id}>
                  <td><b>{segment.name}</b></td>
                  <td>{criteriaSummary(segment)}</td>
                  <td>{segment.recipientCount.toLocaleString("en-US")}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => openEditForm(segment)}>{t("تعديل", "Edit")}</button>
                    <button className="btn danger" type="button" onClick={() => deleteSegment(segment)}>{t("حذف", "Delete")}</button>
                  </td>
                </tr>
              ))}
              {!filteredSegments.length ? (
                <tr><td colSpan={4}>{loading ? t("جاري التحميل...", "Loading...") : segments.length ? t("لا توجد تقسيمات مطابقة للبحث.", "No segments match your search.") : t("لا توجد تقسيمات بعد، اضغط \"إضافة تقسيم\" لإنشاء أول واحد.", "No segments yet — click \"Add segment\" to create your first one.")}</td></tr>
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
                <span>{t("استهداف حسب تفاعل حملة سابقة (اختياري)", "Target by a past campaign's engagement (optional)")}</span>
                <CustomSelect
                  value={form.sourceCampaignId}
                  onChange={(value) => setForm((current) => ({ ...current, sourceCampaignId: value, engagementBucket: value ? current.engagementBucket : "" }))}
                  options={[
                    { value: "", label: t("بدون شرط", "No condition") },
                    ...launchedCampaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))
                  ]}
                />
              </label>
              {form.sourceCampaignId ? (
                <label>
                  <span>{t("حالة التفاعل", "Engagement state")}</span>
                  <CustomSelect
                    value={form.engagementBucket}
                    onChange={(value) => setForm((current) => ({ ...current, engagementBucket: value as SegmentFormState["engagementBucket"] }))}
                    options={[
                      { value: "", label: t("اختر حالة", "Choose a state") },
                      { value: "notOpened", label: t("لم يفتح الرسالة", "Didn't open the message") },
                      { value: "opened", label: t("فتحها بدون تفاعل", "Opened, no click") },
                      { value: "clicked", label: t("تفاعل (ضغط الرابط أو الزر)", "Clicked (link or button)") }
                    ]}
                  />
                  <small className="field-hint">{t("يقتصر هذا الشرط على عملاء تلك الحملة المحددة، بحسب حالة رسالتهم فيها.", "This condition only applies to that campaign's own recipients, based on their status in it.")}</small>
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
