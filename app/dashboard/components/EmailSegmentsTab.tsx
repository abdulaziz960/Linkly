"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tag } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { EditIcon, UsersIcon } from "./ActionIcons";
import { BarList } from "./MiniCharts";

type Segment = {
  id: string; name: string; tagNames: string[]; inactiveDays: number; sourceCampaignId: string;
  engagementBucket: string; engagementDateFrom: string; engagementDateTo: string; recipientCount: number; updatedAt: string;
};
type Member = { name: string; email: string; campaignName: string };
type CampaignOption = { id: string; name: string };
type Form = { id?: string; name: string; tagNames: string[]; inactiveDays: string; sourceCampaignId: string; engagementBucket: string; engagementDateFrom: string; engagementDateTo: string };
const emptyForm: Form = { name: "", tagNames: [], inactiveDays: "", sourceCampaignId: "", engagementBucket: "", engagementDateFrom: "", engagementDateTo: "" };

/** Saved customer segments for email campaigns: build, preview, export, and pick them when creating an email campaign. */
export default function EmailSegmentsTab({ tags }: { tags: Tag[] }) {
  const { t } = useLanguage();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/segments/email");
      const body = await response.json().catch(() => null);
      setSegments(response.ok && body?.ok ? body.data ?? [] : []);
    } catch { setSegments([]); }
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/segments/email-campaigns").then((response) => response.json().catch(() => null)).then((body) => setCampaigns(body?.ok ? (body.data ?? []).map((campaign: CampaignOption) => ({ id: campaign.id, name: campaign.name })) : [])).catch(() => setCampaigns([]));
  }, []);

  const bucketLabel = (bucket: string) => ({
    notReceived: t("لم يستلم الرسالة", "Didn't receive"), notOpened: t("لم يفتح الرسالة", "Didn't open"), opened: t("فتحها بدون تفاعل", "Opened, no interaction"),
    clicked: t("تفاعل (ضغط رابط)", "Interacted (click)"), unsubscribed: t("ألغى الاشتراك", "Unsubscribed")
  } as Record<string, string>)[bucket] || "";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? segments.filter((segment) => segment.name.toLowerCase().includes(query)) : segments;
  }, [segments, search]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    const response = await fetch(form.id ? `/api/segments/email/${form.id}` : "/api/segments/email", {
      method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, inactiveDays: Number(form.inactiveDays) || 0 })
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !body?.ok) { setError(body?.error || t("تعذر حفظ التقسيم", "Could not save the segment")); return; }
    setForm(null);
    await load();
  }

  async function toggleMembers(segment: Segment) {
    if (openId === segment.id) { setOpenId(null); return; }
    setOpenId(segment.id); setMembers([]); setMembersLoading(true);
    try {
      const response = await fetch(`/api/segments/email/${segment.id}/recipients`);
      const body = await response.json().catch(() => null);
      setMembers(response.ok && body?.ok ? body.data ?? [] : []);
    } catch { setMembers([]); }
    setMembersLoading(false);
  }

  async function exportMembers(segment: Segment) {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(segment.name.slice(0, 28), { views: [{ rightToLeft: true }] });
    sheet.columns = [{ header: t("الاسم", "Name"), key: "name", width: 28 }, { header: t("البريد الإلكتروني", "Email"), key: "email", width: 34 }, { header: t("من أي حملة", "From which campaign"), key: "campaignName", width: 28 }];
    members.forEach((member) => sheet.addRow(member));
    sheet.getRow(1).font = { bold: true };
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${segment.name}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
  }

  const total = segments.reduce((sum, segment) => sum + segment.recipientCount, 0);
  const largest = [...segments].sort((a, b) => b.recipientCount - a.recipientCount)[0];

  return (
    <div className="seg-tab-stack">
      <div className="seg-kpis">
        <div className="seg-kpi seg-kpi-b"><span>{t("عدد التقسيمات", "Segments")}</span><b>{segments.length}</b></div>
        <div className="seg-kpi seg-kpi-good"><span>{t("إجمالي المستهدفين", "Total targeted")}</span><b>{total.toLocaleString("en-US")}</b></div>
        <div className="seg-kpi"><span>{t("أكبر تقسيم", "Largest segment")}</span><b className="seg-kpi-text">{largest?.name || "-"}</b></div>
        <div className="seg-kpi seg-kpi-unsub"><span>{t("مبنية على الحملات", "Campaign-based")}</span><b>{segments.filter((segment) => segment.engagementBucket).length}</b></div>
      </div>
      {segments.length ? <div className="panel"><div className="panel-head"><h2>{t("حجم كل تقسيم", "Segment sizes")}</h2></div><div className="panel-body"><BarList items={[...segments].sort((a, b) => b.recipientCount - a.recipientCount).slice(0, 8).map((segment) => ({ label: segment.name, value: segment.recipientCount }))} /></div></div> : null}
      <div className="seg-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث باسم التقسيم...", "Search by segment name...")} />
        <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{filtered.length}</b></span>
        <button className="btn primary" type="button" onClick={() => { setError(""); setForm(emptyForm); }}>＋ {t("إنشاء تقسيم", "New segment")}</button>
      </div>
      <p className="muted-copy">{t("استخدم أي تقسيم محفوظ جمهورًا عند إنشاء حملة بريدية (اختر «تقسيم محفوظ»). العملاء الذين ألغوا اشتراكهم يُستبعدون تلقائيًا عند الإرسال.", "Pick any saved segment as the audience when creating an email campaign. Unsubscribed customers are skipped automatically when sending.")}</p>
      <div className="segcards">
        {filtered.map((segment) => (
          <div key={segment.id} className="sc">
            <div className="sh"><b>{segment.name}</b><span className="st ok">{segment.recipientCount.toLocaleString("en-US")} {t("عميل", "contacts")}</span></div>
            <div className="chips2">
              {segment.tagNames.map((tag) => <span key={tag}>{t("وسم", "Tag")}: {tag}</span>)}
              {segment.inactiveDays > 0 ? <span>{t(`غير نشط ${segment.inactiveDays} يوم`, `Inactive ${segment.inactiveDays}d`)}</span> : null}
              {segment.engagementBucket ? <span>{bucketLabel(segment.engagementBucket)}</span> : null}
              {segment.engagementBucket ? <span>{segment.sourceCampaignId ? campaigns.find((campaign) => campaign.id === segment.sourceCampaignId)?.name || t("حملة محذوفة", "Deleted campaign") : t("كل الحملات", "All campaigns")}</span> : null}
              {!segment.tagNames.length && !segment.inactiveDays && !segment.engagementBucket ? <span>{t("كل العملاء ببريد", "All customers with email")}</span> : null}
            </div>
            <div className="ft">
              <span>{(segment.updatedAt || "").slice(0, 10)}</span>
              <span>
                <button className="ic" type="button" title={t("عرض العملاء", "View contacts")} onClick={() => toggleMembers(segment)}>{UsersIcon}</button>
                <button className="ic" type="button" title={t("تعديل", "Edit")} onClick={() => { setError(""); setForm({ id: segment.id, name: segment.name, tagNames: segment.tagNames, inactiveDays: segment.inactiveDays ? String(segment.inactiveDays) : "", sourceCampaignId: segment.sourceCampaignId, engagementBucket: segment.engagementBucket, engagementDateFrom: segment.engagementDateFrom, engagementDateTo: segment.engagementDateTo }); }}>{EditIcon}</button>
              </span>
            </div>
            {openId === segment.id ? (
              <div className="table-wrap">
                {membersLoading ? <p className="muted-copy">{t("جارٍ التحميل...", "Loading...")}</p> : (
                  <>
                    <div className="seg-toolbar"><button className="btn soft" type="button" onClick={() => exportMembers(segment)} disabled={!members.length}>{t("تصدير Excel", "Export Excel")}</button></div>
                    <table><thead><tr><th>{t("الاسم", "Name")}</th><th>{t("البريد الإلكتروني", "Email")}</th><th>{t("من أي حملة", "From which campaign")}</th></tr></thead>
                      <tbody>
                        {members.map((member) => <tr key={member.email}><td>{member.name || "-"}</td><td dir="ltr">{member.email}</td><td>{member.campaignName || "-"}</td></tr>)}
                        {!members.length ? <tr><td colSpan={3}>{t("لا يوجد عملاء مطابقون حاليًا.", "No matching contacts right now.")}</td></tr> : null}
                      </tbody></table>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ))}
        {!filtered.length ? <p className="muted-copy">{loading ? t("جارٍ التحميل...", "Loading...") : t("لا توجد تقسيمات بعد. أنشئ أول تقسيم لاستخدامه في حملاتك البريدية.", "No segments yet. Create your first one to use in email campaigns.")}</p> : null}
      </div>

      {form ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setForm(null)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); save(); }} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setForm(null)}>×</button>
              <h2>{form.id ? t("تعديل تقسيم", "Edit segment") : t("تقسيم جديد للبريد", "New email segment")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label><span>{t("اسم التقسيم", "Segment name")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
              <label><span>{t("الوسوم (اختياري - أي وسم يطابق)", "Tags (optional - any match)")}</span>
                <div className="segment-tag-picker">
                  {tags.map((tag) => (
                    <label key={tag.id} className="segment-tag-option">
                      <input type="checkbox" checked={form.tagNames.includes(tag.name)} onChange={() => setForm({ ...form, tagNames: form.tagNames.includes(tag.name) ? form.tagNames.filter((name) => name !== tag.name) : [...form.tagNames, tag.name] })} />
                      <span className="tag-color-swatch" style={{ background: tag.color }} /><span>{tag.name}</span>
                    </label>
                  ))}
                  {!tags.length ? <p className="muted-copy">{t("لا توجد وسوم بعد.", "No tags yet.")}</p> : null}
                </div>
              </label>
              <label><span>{t("عدم التفاعل لعدد أيام (اختياري)", "Inactive for N days (optional)")}</span><input type="number" min={0} value={form.inactiveDays} onChange={(event) => setForm({ ...form, inactiveDays: event.target.value })} placeholder={t("بدون شرط", "No condition")} /></label>
              <label><span>{t("استهداف حسب تفاعل الحملات البريدية (اختياري)", "Target by email campaign engagement (optional)")}</span>
                <CustomSelect value={form.engagementBucket} onChange={(value) => setForm({ ...form, engagementBucket: value, sourceCampaignId: value ? form.sourceCampaignId : "", engagementDateFrom: value ? form.engagementDateFrom : "", engagementDateTo: value ? form.engagementDateTo : "" })}
                  options={[{ value: "", label: t("بدون شرط", "No condition") }, ...["notReceived", "notOpened", "opened", "clicked", "unsubscribed"].map((bucket) => ({ value: bucket, label: bucketLabel(bucket) }))]} />
              </label>
              {form.engagementBucket ? (
                <>
                  <label><span>{t("الحملة (اختياري - افتراضيًا كل الحملات)", "Campaign (optional - all by default)")}</span>
                    <CustomSelect value={form.sourceCampaignId} onChange={(value) => setForm({ ...form, sourceCampaignId: value })} options={[{ value: "", label: t("كل الحملات", "All campaigns") }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]} />
                  </label>
                  <label><span>{t("من تاريخ الإرسال", "From send date")}</span><input type="date" value={form.engagementDateFrom} onChange={(event) => setForm({ ...form, engagementDateFrom: event.target.value })} /></label>
                  <label><span>{t("إلى تاريخ الإرسال", "To send date")}</span><input type="date" value={form.engagementDateTo} onChange={(event) => setForm({ ...form, engagementDateTo: event.target.value })} /></label>
                </>
              ) : null}
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setForm(null)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving || !form.name.trim()}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
