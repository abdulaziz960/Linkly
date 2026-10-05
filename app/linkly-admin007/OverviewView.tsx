"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { PaymentRow, SubscriptionRow } from "./types";
import type { AdminLog } from "../../lib/database";
import type { ActionLogRow, ActivityView } from "./activity";
import { relativeTime } from "./activity";
import { buildOverview, percentChange, resolveRange, type RangeKey, type UrgentTicket } from "./overview-data";
import { formatNumber, parseTimestamp } from "./utils";
import Icon from "./ds/Icon";
import { Drawer } from "./ds/Dialog";
import { Badge, Button, EmptyState, Section, Segmented, Skeleton, StatCard, type Tone } from "./ds/primitives";
import { BarChart, BarList, CHART_COLORS, Donut, LineChart } from "./ds/charts";

type Props = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  logs: AdminLog[];
  actions: ActionLogRow[];
  urgentTickets: UrgentTicket[];
  generatedAt: number;
  // Sections hidden for team members without the matching permission.
  showRevenue?: boolean;
  showActivity?: boolean;
};

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "7d", label: "7 أيام" },
  { value: "30d", label: "30 يومًا" },
  { value: "month", label: "هذا الشهر" },
  { value: "custom", label: "مخصص" }
];

const LEVEL_BADGE: Record<string, { label: string; tone: Tone }> = {
  high: { label: "عاجل", tone: "danger" },
  medium: { label: "متوسط", tone: "warning" },
  low: { label: "للمتابعة", tone: "info" }
};

const money = (value: number) => `${formatNumber(value)} ر.س`;
const SLICE_COLORS = ["var(--ds-chart-1)", "var(--ds-chart-2)", "var(--ds-chart-3)", "var(--ds-chart-4)", "var(--ds-chart-5)"];
const PRIORITY_PREVIEW = 6;

function formatUpdated(ms: number) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(ms);
}

function formatDue(value: string) {
  const time = parseTimestamp(value) || (value ? new Date(`${value}T00:00:00`).getTime() : 0);
  if (!time) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(time);
}

export default function OverviewView({ subscriptions, payments, logs, actions, urgentTickets, generatedAt, showRevenue = true, showActivity = true }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [selected, setSelected] = useState<ActivityView | null>(null);

  // Everything below depends on the clock and time zone of the viewer, so it is
  // computed after mount to keep the server and client markup identical.
  useEffect(() => setMounted(true), []);

  const range = useMemo(() => resolveRange(rangeKey, generatedAt, { from: customFrom, to: customTo }), [rangeKey, customFrom, customTo, generatedAt]);
  const overview = useMemo(
    () => (mounted ? buildOverview({ subscriptions, payments, logs, actions, urgentTickets, now: generatedAt }, range) : null),
    [mounted, subscriptions, payments, logs, actions, urgentTickets, generatedAt, range]
  );

  const customInvalid = rangeKey === "custom" && Boolean(customFrom && customTo && customFrom > customTo);

  if (!overview) {
    return (
      <div aria-busy="true" aria-label="جارٍ تحميل النظرة العامة">
        <div className="ds-stat-grid">
          {Array.from({ length: 10 }, (_, index) => (
            <div className="ds-stat" key={index}><Skeleton width="55%" height={13} /><Skeleton width="40%" height={28} /><Skeleton width="80%" height={12} /></div>
          ))}
        </div>
      </div>
    );
  }

  const { kpis } = overview;
  const priorities = showAllPriorities ? overview.priorities : overview.priorities.slice(0, PRIORITY_PREVIEW);
  const newClientsDelta = percentChange(kpis.newClients, kpis.newClientsPrev);
  const collectedDelta = percentChange(kpis.collected, kpis.collectedPrev);
  const noPayments = payments.length === 0;

  return (
    <>
      {/* 1. Executive summary: range + freshness */}
      <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <Segmented label="النطاق الزمني" value={rangeKey} onChange={setRangeKey} options={RANGES} />
            {rangeKey === "custom" ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <label className="ds-field" style={{ gridAutoFlow: "column", alignItems: "center", gap: 6 }}>من<input className="ds-input" type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} style={{ minHeight: 36 }} /></label>
                <label className="ds-field" style={{ gridAutoFlow: "column", alignItems: "center", gap: 6 }}>إلى<input className="ds-input" type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} style={{ minHeight: 36 }} /></label>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ds-text-muted)", fontSize: 13 }}>
            <span>آخر تحديث للبيانات: <b style={{ color: "var(--ds-text)" }}>{formatUpdated(generatedAt)}</b></span>
            <Button variant="outline" icon="refresh" loading={refreshing} onClick={() => startRefresh(() => router.refresh())}>تحديث</Button>
          </div>
        </div>
        {customInvalid ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />تاريخ البداية يجب أن يسبق تاريخ النهاية.</p> : null}
        <p className="ds-note" style={{ margin: 0 }}>
          <Icon name="info" size={16} />
          <span>النطاق الزمني ({range.label}) يؤثر على <b>الإيراد المحصل</b> و<b>العملاء الجدد</b> فقط. أما بقية المؤشرات (العملاء، الاشتراكات، MRR، المستحقات) فهي حالة لحظية للحسابات.</span>
        </p>
      </div>

      {/* 2. Priority actions */}
      <Section id="priorities" title="الإجراءات ذات الأولوية" description={overview.priorities.length ? `${overview.priorities.length} بند يحتاج متابعة، مرتّبة حسب الأهمية.` : undefined}>
        {overview.priorities.length === 0 ? (
          <div className="ds-all-clear"><Icon name="checkCircle" size={22} />لا توجد إجراءات عاجلة الآن. التجديدات والمدفوعات والدعم كلها تحت السيطرة.</div>
        ) : (
          <div className="ds-card">
            <ul className="ds-priority-list">
              {priorities.map((item) => {
                const level = LEVEL_BADGE[item.level];
                const due = formatDue(item.due);
                return (
                  <li key={item.id} className="ds-priority" data-level={item.level}>
                    <span className="ds-priority-icon"><Icon name={item.icon} size={19} /></span>
                    <div className="ds-priority-body">
                      <strong>{item.title} <Badge tone={level.tone}>{level.label}</Badge></strong>
                      <span>{item.description}</span>
                      <div className="ds-priority-meta">
                        <span>العميل: <b style={{ color: "var(--ds-text)" }}>{item.clientName || "—"}</b></span>
                        {due ? <span>{item.id.startsWith("overdue") || item.id.startsWith("renew") ? "تاريخ الاستحقاق" : "التاريخ"}: {due}</span> : null}
                      </div>
                    </div>
                    <Link href={item.href} className="ds-btn" data-variant="outline">{item.actionLabel}</Link>
                  </li>
                );
              })}
            </ul>
            {overview.priorities.length > PRIORITY_PREVIEW ? (
              <div style={{ padding: 12, borderTop: "1px solid var(--ds-border)", textAlign: "center" }}>
                <Button variant="ghost" onClick={() => setShowAllPriorities((value) => !value)}>{showAllPriorities ? "عرض أقل" : `عرض كل البنود (${overview.priorities.length})`}</Button>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      {/* 3. KPI cards */}
      <Section id="kpis" title="المؤشرات الرئيسية">
        <div className="ds-stat-grid">
          <StatCard icon="users" label="إجمالي العملاء" value={formatNumber(kpis.totalClients)} href="/linkly-admin007/clients" delta={newClientsDelta === null ? null : { value: newClientsDelta, goodWhen: "up" }} hint={`${formatNumber(kpis.newClients)} عميل جديد (${range.label}) · العدد الكلي لحظي`} />
          <StatCard icon="checkCircle" tone="success" label="العملاء النشطون" value={formatNumber(kpis.activeClients)} href="/linkly-admin007/clients" hint="حسابات حالة اشتراكها «نشط» الآن" />
          <StatCard icon="clock" tone="info" label="في الفترة التجريبية" value={formatNumber(kpis.trialClients)} href="/linkly-admin007/clients" hint="حسابات تجريبية لم تتحول لاشتراك مدفوع بعد" />
          <StatCard icon="receipt" label="الاشتراكات النشطة" value={formatNumber(kpis.paidSubscriptions)} href="/linkly-admin007/clients" hint="اشتراكات نشطة بمبلغ أعلى من صفر (مدفوعة)" />
          {showRevenue ? (<StatCard icon="trendUp" label="MRR المتوقع" value={money(kpis.mrr)} help={{ term: "MRR المتوقع", definition: "الإيراد الشهري المتكرر: مجموع قيمة الاشتراكات النشطة محسوبة شهريًا (السنوي يُقسَّم على 12) شاملًا المستخدمين الإضافيين، قبل الخصومات. تقدير وليس إيرادًا محصّلًا." }} href="/linkly-admin007/clients" hint="تقدير شهري من الاشتراكات النشطة، وليس مبلغًا محصّلًا" />) : null}
          {showRevenue ? (<StatCard icon="chart" label="ARR المتوقع" value={money(kpis.arr)} help={{ term: "ARR المتوقع", definition: "الإيراد السنوي المتكرر = MRR × 12. رقم استرشادي لحجم الأعمال السنوي ولا يعني أنه تم تحصيله." }} hint="MRR × 12 · تقدير سنوي وليس إيرادًا محصّلًا" />) : null}
          {showRevenue ? (<StatCard icon="wallet" tone="success" label="الإيراد المحصّل" value={money(kpis.collected)} href="/linkly-admin007/payments" delta={collectedDelta === null ? null : { value: collectedDelta, goodWhen: "up" }} hint={noPayments ? "لا توجد مدفوعات مسجّلة بعد" : `مدفوعات مكتملة فعليًا خلال ${range.label}`} />) : null}
          {showRevenue ? (<StatCard icon="alert" tone={kpis.outstanding > 0 ? "warning" : "neutral"} label="المبالغ المستحقة" value={money(kpis.outstanding)} href="/linkly-admin007/payments" hint={kpis.outstandingCount ? `${formatNumber(kpis.outstandingCount)} دفعة قيد الانتظار ولم تُحصَّل بعد` : "لا توجد دفعات معلّقة"} />) : null}
          <StatCard icon="message" label="المحادثات تحت الإدارة" value={formatNumber(kpis.conversations)} href="/linkly-admin007/usage" hint="مجموع محادثات كل العملاء حاليًا" />
          <StatCard icon="calendar" tone={kpis.overdueRenewals ? "danger" : "neutral"} label="التجديدات القادمة" value={formatNumber(kpis.upcomingRenewals)} href="/linkly-admin007/alerts" hint={`خلال 30 يومًا بقيمة ${money(kpis.upcomingRenewalsAmount)}${kpis.overdueRenewals ? ` · ${formatNumber(kpis.overdueRenewals)} متأخر` : ""}`} />
        </div>
      </Section>

      {/* 4. Charts */}
      <Section id="charts" title="التحليلات" description="الرسوم تعرض آخر 12 شهرًا بغضّ النظر عن النطاق الزمني أعلاه.">
        <div className="ds-grid-main">
          <div className="ds-card ds-card-pad">
            <div className="ds-card-head"><div><h3>نمو العملاء</h3><p>إجمالي الحسابات بنهاية كل شهر</p></div></div>
            <LineChart labels={overview.growth.labels} series={[{ name: "العملاء", color: CHART_COLORS[0], values: overview.growth.values }]} format={(value) => formatNumber(Math.round(value))} caption="نمو عدد العملاء خلال آخر 12 شهرًا" empty={<EmptyState icon="users" title="لا توجد بيانات كافية" description="سيظهر نمو العملاء هنا بعد تسجيل عملاء." />} />
          </div>
          <div className="ds-card ds-card-pad">
            <div className="ds-card-head"><div><h3>توزيع حالات العملاء</h3><p>عدد الحسابات حسب حالة الاشتراك</p></div></div>
            <Donut caption="توزيع العملاء حسب حالة الاشتراك" centerLabel="عميل" slices={overview.statusSlices.map((slice, index) => ({ ...slice, color: SLICE_COLORS[index % SLICE_COLORS.length] }))} format={(value) => formatNumber(value)} />
            {overview.statusSlices.length === 0 ? <EmptyState icon="users" title="لا يوجد عملاء بعد" /> : null}
          </div>
        </div>

        <div className="ds-grid-main" style={{ marginTop: 16 }}>
          {showRevenue ? (
          <div className="ds-card ds-card-pad">
            <div className="ds-card-head"><div><h3>الإيرادات المحصّلة والمتوقعة</h3><p>المحصّل = مدفوعات مكتملة · المتوقع = تقدير من الاشتراكات النشطة</p></div></div>
            <LineChart
              labels={overview.revenue.labels}
              series={[
                { name: "محصّل", color: CHART_COLORS[0], values: overview.revenue.collected },
                { name: "متوقع", color: CHART_COLORS[1], values: overview.revenue.expected, dashed: true }
              ]}
              format={(value) => formatNumber(Math.round(value))}
              caption="الإيرادات المحصّلة والمتوقعة بالريال"
              empty={<EmptyState icon="wallet" title="لا توجد إيرادات بعد" description="ستظهر المدفوعات المكتملة والمتوقعة هنا." />}
            />
            <div style={{ display: "flex", gap: 18, marginTop: 10, color: "var(--ds-text-muted)", fontSize: 13 }}>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 14, height: 3, background: CHART_COLORS[0], borderRadius: 2 }} />محصّل</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 14, height: 0, borderTop: `3px dashed ${CHART_COLORS[1]}` }} />متوقع</span>
            </div>
          </div>
          ) : null}
          <div className="ds-card ds-card-pad">
            <div className="ds-card-head"><div><h3>العملاء حسب الباقة</h3><p>عدد الحسابات على كل باقة</p></div></div>
            <Donut caption="توزيع العملاء حسب الباقة" centerLabel="عميل" slices={overview.planSlices.map((slice, index) => ({ ...slice, color: SLICE_COLORS[index % SLICE_COLORS.length] }))} format={(value) => formatNumber(value)} />
            {overview.planSlices.length === 0 ? <EmptyState icon="layers" title="لا توجد اشتراكات بعد" /> : null}
          </div>
        </div>

        <div className="ds-grid-2" style={{ marginTop: 16 }}>
          {showRevenue ? (
          <div className="ds-card ds-card-pad">
            <div className="ds-card-head"><div><h3>التجديدات خلال الأشهر القادمة</h3><p>قيمة الاشتراكات حسب تاريخ تجديدها المسجّل (ر.س)</p></div></div>
            <BarChart labels={overview.renewalsByMonth.labels} values={overview.renewalsByMonth.values} format={(value) => formatNumber(Math.round(value))} caption="قيمة التجديدات القادمة بالريال" empty={<EmptyState icon="calendar" title="لا توجد تجديدات قادمة" description="ستظهر هنا عند وجود اشتراكات نشطة بتواريخ تجديد." />} />
          </div>
          ) : null}
          <div className="ds-card ds-card-pad">
            <div className="ds-card-head"><div><h3>الاستخدام حسب العميل</h3><p>أعلى 6 عملاء من حيث عدد المحادثات</p></div><Link href="/linkly-admin007/usage" className="ds-btn" data-variant="ghost">كل الاستخدام</Link></div>
            <BarList rows={overview.usageTop} format={(value) => `${formatNumber(value)} محادثة`} empty={<EmptyState icon="message" title="لا توجد محادثات بعد" description="سيظهر الاستخدام عندما يبدأ العملاء باستقبال محادثات." />} />
          </div>
        </div>
      </Section>

      {showActivity ? (
        <>
      {/* 5. Recent activity */}
      <Section id="activity" title="آخر الأنشطة والتغييرات الحساسة" actions={<Link href="/linkly-admin007/admin-actions" className="ds-btn" data-variant="outline">سجل التدقيق الكامل</Link>}>
        <div className="ds-card ds-card-pad">
          {overview.activity.length === 0 ? (
            <EmptyState icon="scroll" title="لا توجد أنشطة مسجّلة بعد" description="ستظهر هنا تغييرات فريق الإدارة (الباقات، الاشتراكات، أكواد الخصم، الفريق…)." />
          ) : (
            <ul className="ds-feed">
              {overview.activity.map((item) => {
                const when = parseTimestamp(item.at);
                return (
                  <li key={item.id}>
                    <span className="ds-avatar" aria-hidden="true">{item.actorInitial}</span>
                    <div className="ds-feed-body">
                      <strong>{item.title}</strong>
                      <span>{relativeTime(when, generatedAt)}{item.target ? ` · ${item.target}` : ""}</span>
                    </div>
                    <Button variant="ghost" onClick={() => setSelected(item)}>عرض التفاصيل</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

        </>
      ) : null}

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ""} description={selected ? `${relativeTime(parseTimestamp(selected.at), generatedAt)} · ${formatDue(selected.at)}` : undefined}>
        {selected ? (
          <>
            {selected.details.length ? (
              <div className="ds-diff">
                <div className="ds-diff-h">الحقل</div>
                <div className="ds-diff-h">{selected.details.some((detail) => detail.previous !== undefined) ? "قبل" : ""}</div>
                <div className="ds-diff-h">{selected.details.some((detail) => detail.previous !== undefined) ? "بعد" : "القيمة المسجّلة"}</div>
                {selected.details.flatMap((detail) => [
                  <div key={`${detail.label}-l`} style={{ fontWeight: 700 }}>{detail.label}</div>,
                  <div key={`${detail.label}-p`} className="ds-diff-old">{detail.previous ?? ""}</div>,
                  <div key={`${detail.label}-v`} className="ds-diff-new">{detail.value}</div>
                ])}
              </div>
            ) : (
              <EmptyState icon="info" title="لا توجد تفاصيل إضافية" description="لم يسجّل هذا الإجراء بيانات تفصيلية." />
            )}
            <p className="ds-note"><Icon name="info" size={16} /><span>عند تعديل باقة أو اشتراك أو كود خصم أو موظف تُعرض القيمة قبل التغيير وبعده. السجلات الأقدم تعرض القيم الجديدة فقط. لا تُعرض مفاتيح أو أسرار في هذا السجل.</span></p>
            <p style={{ margin: 0, color: "var(--ds-text-faint)", fontSize: 12 }}>رمز العملية: <span dir="ltr">{selected.technicalId}</span></p>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
