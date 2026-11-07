"use client";

import { useEffect, useMemo, useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";

type Visit = { id: string; date: string; time: string; status: string; projectName: string; bookedBy: string };
type Entry = { id: string; kind: "stage" | "assign" | "visit" | "unit" | "note" | "ai"; at: string; text: string; from?: string; to?: string; actor: string };
type Detail = {
  conversationId: string;
  customer: { name: string; phone: string; email: string };
  unit: { unitId: string; name: string; sold: boolean } | null;
  projectUnits: Array<{ id: string; name: string; kind?: string; available: number; reserved?: number; total: number }>;
  stage: string; assignee: string; channel: string; dealValue: number; tags: string[];
  firstContactAt: string; lastActivityAt: string; source: string; project: string;
  answers: Array<{ question: string; answer: string }>;
  upcomingVisit: Visit | null; visits: Visit[]; timeline: Entry[];
  interactions: { incoming: number; outgoing: number; recent: Array<{ direction: string; text: string; at: string; author: string }> };
};

const STAGE_COLORS: Record<string, { bg: string; fg: string }> = {
  "جديد": { bg: "#dbeafe", fg: "#1e40af" },
  "مهتم": { bg: "#dcfce7", fg: "#166534" },
  "مؤهل": { bg: "#ccfbf1", fg: "#115e59" },
  "عرض سعر": { bg: "#fef3c7", fg: "#92400e" },
  "تم الحجز": { bg: "#ede9fe", fg: "#5b21b6" },
  "فاز": { bg: "#bbf7d0", fg: "#14532d" },
  "خسر": { bg: "#fee2e2", fg: "#991b1b" }
};
const ICONS: Record<Entry["kind"], string> = { stage: "✎", assign: "👤", visit: "📅", unit: "🏠", note: "📝", ai: "✦" };

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(date);
};
const dayOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh" }).format(date);
};
const whenOf = (iso: string) => (iso ? `${dayOf(iso)} ${timeOf(iso)}` : "—");

/**
 * A lead's detail panel: an overview (who, which project, the stage, the visit, the form answers) and a
 * timeline of everything that happened to the customer - stage changes, visits, notes, assignment - plus
 * the latest messages. Opened by pressing a lead on the board or in the table.
 */
export default function LeadDetailDrawer({ conversationId, onClose, onOpenConversation }: { conversationId: string; onClose: () => void; onOpenConversation: (id: string) => void }) {
  const { t, language } = useLanguage();
  const lang = language === "en" ? "en" : "ar";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "timeline">("overview");
  const [sub, setSub] = useState<"log" | "interactions">("log");
  const [unitError, setUnitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/crm/leads/${encodeURIComponent(conversationId)}`, { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Detail } | null;
      if (cancelled) return;
      if (body?.ok && body.data) setDetail(body.data);
      else setError(body?.error || t("تعذر تحميل بيانات العميل", "Couldn't load the customer"));
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function chooseUnit(unitId: string) {
    setUnitError("");
    const response = await fetch(`/api/crm/leads/${encodeURIComponent(conversationId)}/unit`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitId: unitId || null }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!body?.ok) {
      setUnitError(body?.error || t("تعذر حفظ الوحدة", "Couldn't save the unit"));
      return;
    }
    const picked = detail?.projectUnits.find((unit) => unit.id === unitId);
    setDetail((current) => (current ? { ...current, unit: picked ? { unitId: picked.id, name: picked.name, sold: false } : null } : current));
  }

  const chip = (stage: string) => {
    const color = STAGE_COLORS[stage] ?? { bg: "#e2e8f0", fg: "#334155" };
    return <span style={{ padding: "2px 10px", borderRadius: 999, background: color.bg, color: color.fg, fontWeight: 700, whiteSpace: "nowrap" }}>{stageDisplayLabel(stage, lang)}</span>;
  };

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of detail?.timeline ?? []) map.set(dayOf(entry.at), [...(map.get(dayOf(entry.at)) ?? []), entry]);
    return [...map.entries()];
  }, [detail]);

  const field = (label: string, value: React.ReactNode) => (
    <div style={{ display: "grid", gap: 2 }}>
      <small style={{ opacity: 0.65 }}>{label}</small>
      <b style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value || "—"}</b>
    </div>
  );

  const entryText = (entry: Entry) => {
    if (entry.kind === "stage") {
      return (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {t("تم تحديث مرحلة العميل من", "Stage changed from")} {chip(entry.from ?? "")} {t("إلى", "to")} {chip(entry.to ?? "")}
        </span>
      );
    }
    return <span style={{ whiteSpace: "pre-wrap" }}>{entry.text}</span>;
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("تفاصيل العميل", "Customer details")} style={{ width: "min(760px, 96vw)" }} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={onClose}>×</button>
          <h2>{detail ? detail.customer.name : t("تفاصيل العميل", "Customer details")}</h2>
        </header>
        <div className="account-modal-body" style={{ gridAutoRows: "max-content", alignContent: "start" }}>
          {error ? <p role="alert" style={{ color: "#b42318" }}>{error}</p> : null}
          {!detail && !error ? <p style={{ opacity: 0.7 }}>{t("جاري التحميل...", "Loading...")}</p> : null}
          {detail ? (
            <>
              <div className="pipeline-tabs" role="tablist" aria-label={t("أقسام العميل", "Customer sections")} style={{ marginTop: 0 }}>
                <button type="button" role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>{t("نظرة عامة", "Overview")}</button>
                <button type="button" role="tab" aria-selected={tab === "timeline"} onClick={() => setTab("timeline")}>{t("الخط الزمني", "Timeline")}</button>
              </div>

              {tab === "overview" ? (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {chip(detail.stage)}
                    <span style={{ opacity: 0.75 }}>{t("الموظف", "Employee")}: <b>{detail.assignee || "—"}</b></span>
                    <button type="button" className="btn" style={{ marginInlineStart: "auto" }} onClick={() => { onClose(); onOpenConversation(detail.conversationId); }}>{t("فتح المحادثة", "Open conversation")}</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
                    {field(t("المشروع المهتم به", "Interested in"), detail.project)}
                    {field(t("الجوال", "Phone"), <bdi dir="ltr">{detail.customer.phone}</bdi>)}
                    {field(t("البريد", "Email"), <bdi dir="ltr">{detail.customer.email}</bdi>)}
                    {field(t("المصدر", "Source"), detail.source)}
                    {field(t("القناة", "Channel"), detail.channel)}
                    {field(t("أول تواصل", "First contact"), whenOf(detail.firstContactAt))}
                    {field(t("آخر نشاط", "Last activity"), whenOf(detail.lastActivityAt))}
                    {detail.dealValue > 0 ? field(t("قيمة الصفقة", "Deal value"), `${detail.dealValue} ${t("ر.س", "SAR")}`) : null}
                    {field(t("الوسوم", "Tags"), detail.tags.join("، "))}
                  </div>
                  {detail.projectUnits.length || detail.unit ? (
                    <section style={{ border: "1px solid var(--line, #dfe7e5)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                      <b>{t("الوحدة المهتم بها", "Unit of interest")}</b>
                      <CustomSelect
                        ariaLabel={t("الوحدة المهتم بها", "Unit of interest")}
                        value={detail.unit?.unitId ?? ""}
                        disabled={detail.unit?.sold}
                        onChange={(value) => void chooseUnit(value)}
                        options={[{ value: "", label: t("لم تُحدَّد", "Not set") }, ...detail.projectUnits.map((unit) => ({ value: unit.id, label: `${unit.name}${unit.kind ? ` (${unit.kind})` : ""} — ${unit.total === 1 ? (unit.available > 0 ? t("متاحة", "available") : (unit.reserved ?? 0) > 0 ? t("محجوزة", "reserved") : t("مباعة", "sold")) : unit.available > 0 ? t(`متاح ${unit.available}`, `${unit.available} left`) : t("نفدت", "sold out")}` }))]}
                      />
                      <small style={{ opacity: 0.7, lineHeight: 1.7 }}>{detail.unit?.sold ? t("بيعت هذه الوحدة (خُصمت من المخزون). أعد العميل من «تم البيع» لتغييرها.", "This unit was sold (taken from the stock). Move the customer out of “Sold” to change it.") : t("عند نقل العميل إلى «تم البيع» تُخصم وحدة من هذا النوع تلقائيًا.", "When the customer is moved to “Sold”, one unit of this type is taken from the stock automatically.")}</small>
                      {unitError ? <small role="alert" style={{ color: "#b42318" }}>{unitError}</small> : null}
                    </section>
                  ) : null}
                  <section style={{ border: "1px solid var(--line, #dfe7e5)", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}>
                    <b>{t("الزيارة", "Visit")}</b>
                    {detail.upcomingVisit
                      ? <span>{detail.upcomingVisit.date} · <bdi dir="ltr">{detail.upcomingVisit.time}</bdi>{detail.upcomingVisit.projectName ? ` · ${detail.upcomingVisit.projectName}` : ""} <small style={{ opacity: 0.7 }}>({detail.upcomingVisit.bookedBy})</small></span>
                      : <span style={{ opacity: 0.7 }}>{detail.visits.length ? t("لا توجد زيارة قادمة", "No upcoming visit") : t("لم يحدد زيارة بعد", "No visit booked yet")}</span>}
                    {detail.visits.filter((visit) => visit.id !== detail.upcomingVisit?.id).map((visit) => (
                      <small key={visit.id} style={{ opacity: 0.75 }}>{visit.date} · {visit.time} · {visit.status}</small>
                    ))}
                  </section>
                  {detail.answers.length ? (
                    <section style={{ border: "1px solid var(--line, #dfe7e5)", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}>
                      <b>{t("بيانات النموذج", "Form answers")}</b>
                      {detail.answers.map((answer, index) => <span key={index}><small style={{ opacity: 0.65 }}>{answer.question}: </small>{answer.answer}</span>)}
                    </section>
                  ) : null}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  <div className="pipeline-tabs" role="tablist" aria-label={t("نوع السجل", "History type")} style={{ marginTop: 0, justifySelf: "start" }}>
                    <button type="button" role="tab" aria-selected={sub === "log"} onClick={() => setSub("log")}>{t("السجل", "Log")}</button>
                    <button type="button" role="tab" aria-selected={sub === "interactions"} onClick={() => setSub("interactions")}>{t("التفاعلات", "Interactions")} ({detail.interactions.incoming + detail.interactions.outgoing})</button>
                  </div>
                  {sub === "log" ? (
                    <div style={{ display: "grid", gap: 14 }}>
                      {!groups.length ? <p style={{ opacity: 0.7 }}>{t("لا توجد تحديثات بعد.", "No updates yet.")}</p> : null}
                      {groups.map(([day, entries]) => (
                        <section key={day} style={{ display: "grid", gap: 10 }}>
                          <span style={{ justifySelf: "start", padding: "4px 14px", border: "1px solid var(--line, #dfe7e5)", borderRadius: 8, background: "var(--surface-soft, #f4f7f6)", fontWeight: 700 }}>{day}</span>
                          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14, borderInlineStart: "2px solid var(--line, #e2e8e6)", marginInlineStart: 18, paddingInlineStart: 16 }}>
                            {entries.map((entry) => (
                              <li key={entry.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start", position: "relative" }}>
                                <span aria-hidden style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)", display: "grid", placeItems: "center", marginInlineStart: -34 }}>{ICONS[entry.kind]}</span>
                                <div style={{ display: "grid", gap: 3, marginInlineStart: -18 }}>
                                  <small style={{ opacity: 0.65 }}>{timeOf(entry.at)}{entry.actor ? ` · ${entry.actor}` : ""}</small>
                                  <div>{entryText(entry)}</div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      <p style={{ margin: 0, opacity: 0.75 }}>{t(`${detail.interactions.incoming} رسالة من العميل · ${detail.interactions.outgoing} رد`, `${detail.interactions.incoming} from the customer · ${detail.interactions.outgoing} replies`)}</p>
                      {detail.interactions.recent.map((message, index) => (
                        <div key={index} style={{ padding: "8px 12px", borderRadius: 12, background: message.direction === "in" ? "var(--surface-soft, #f1f5f4)" : "#e0f2f1", justifySelf: message.direction === "in" ? "start" : "end", maxWidth: "88%" }}>
                          <small style={{ opacity: 0.65 }}>{message.direction === "in" ? detail.customer.name : message.author || t("رد", "Reply")} · {whenOf(message.at)}</small>
                          <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
