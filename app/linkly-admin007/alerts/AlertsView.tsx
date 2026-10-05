"use client";

import { useMemo, useState } from "react";
import type { SubscriptionRow } from "../types";
import { formatNumber, RENEWAL_SOON_DAYS } from "../utils";
import { Badge, Button, EmptyState, Segmented, StatCard } from "../ds/primitives";
import ChargeDialog from "../clients/ChargeDialog";
import { invoiceBreakdown } from "../clients/clients-data";
import { callAdminApi, jsonInit } from "../content-api";
import { useToast } from "../ds/Toast";
import { BUCKETS, FOLLOW_UP_LABEL, bucketCounts, buildAlerts, exposure, inBucket, isFollowUp, type Bucket, type FollowUp } from "./alerts-data";

export type FollowUpEntries = Record<string, { status: FollowUp; updatedBy: string; updatedAt: string }>;

export default function AlertsView({ subscriptions, initialStatus = "all", initialFollowUps = {} }: { subscriptions: SubscriptionRow[]; initialStatus?: string; initialFollowUps?: FollowUpEntries }) {
  const toast = useToast();
  const [bucket, setBucket] = useState<Bucket>(initialStatus === "overdue" ? "overdue" : "all");
  const [chargeClient, setChargeClient] = useState<SubscriptionRow | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpEntries>(initialFollowUps);

  // Shared across the whole admin team: saved on the server, so everyone sees who last touched a client.
  async function setFollowUp(tenantId: string, value: FollowUp) {
    const previous = followUps[tenantId];
    setFollowUps((current) => ({ ...current, [tenantId]: { status: value, updatedBy: "أنت", updatedAt: new Date().toISOString() } }));
    const result = await callAdminApi<{ status: FollowUp; updatedBy: string; updatedAt: string }>("/api/admin/renewal-followups", jsonInit("PUT", { tenantId, status: value }));
    if (result.ok && result.data) {
      const saved = result.data;
      setFollowUps((current) => ({ ...current, [tenantId]: saved }));
      return;
    }
    setFollowUps((current) => {
      const next = { ...current };
      if (previous) next[tenantId] = previous;
      else delete next[tenantId];
      return next;
    });
    toast("error", "تعذر حفظ حالة المتابعة", result.error);
  }

  const alerts = useMemo(() => buildAlerts(subscriptions), [subscriptions]);
  const counts = useMemo(() => bucketCounts(alerts), [alerts]);
  const visible = useMemo(() => alerts.filter((item) => inBucket(item.alert, bucket)), [alerts, bucket]);
  const overdueExposure = useMemo(() => exposure(alerts.filter((item) => item.alert.tier === "overdue")), [alerts]);

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="اشتراكات متأخرة" value={formatNumber(counts.overdue)} hint="تجاوزت موعد التجديد" icon="alert" tone={counts.overdue ? "danger" : "neutral"} />
        <StatCard label="تجديد خلال 7 أيام" value={formatNumber(counts["1"] + counts["3"] + counts["7"])} hint="تحتاج تواصلًا قريبًا" icon="clock" tone="warning" />
        <StatCard label="تجديد خلال 30 يومًا" value={formatNumber(alerts.length - counts.overdue)} hint={`ضمن ${formatNumber(RENEWAL_SOON_DAYS)} يومًا القادمة`} icon="calendar" />
        <StatCard label="قيمة المتأخر شهريًا" value={`${formatNumber(overdueExposure)} ر.س`} hint="مجموع فواتير الاشتراكات المتأخرة" icon="wallet" tone={overdueExposure ? "danger" : "neutral"} />
      </div>

      <section className="ds-section" aria-labelledby="alerts-heading">
        <header className="ds-section-head">
          <div>
            <h2 id="alerts-heading">اشتراكات تحتاج متابعة</h2>
            <p>اشتراكات نشطة تتجدد خلال {formatNumber(RENEWAL_SOON_DAYS)} يومًا أو تأخرت عن موعدها.</p>
          </div>
        </header>

        <div className="ds-toolbar">
          <Segmented label="تصفية حسب المدة" value={bucket} onChange={setBucket} options={BUCKETS.map((item) => ({ value: item.value, label: `${item.label} (${formatNumber(counts[item.value])})` }))} />
        </div>

        {alerts.length === 0 ? (
          <EmptyState icon="checkCircle" title="لا توجد اشتراكات تحتاج متابعة" description="كل الاشتراكات النشطة بعيدة عن موعد التجديد." />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="لا توجد اشتراكات ضمن هذا التصنيف" action={<Button variant="outline" onClick={() => setBucket("all")}>عرض الكل</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">العميل</th>
                  <th scope="col">التجديد</th>
                  <th scope="col">الفاتورة الشهرية</th>
                  <th scope="col">المتابعة</th>
                  <th scope="col"><span className="ds-sr-only">إجراء</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ subscription, alert }) => {
                  const entry = followUps[subscription.tenantId];
                  const followUp = entry?.status ?? "new";
                  return (
                    <tr key={subscription.tenantId}>
                      <td data-cell="main">
                        <div className="ds-cell-main">
                          <span className="ds-avatar" aria-hidden="true">{subscription.companyName.slice(0, 1) || "ع"}</span>
                          <div><strong>{subscription.companyName}</strong><span>{subscription.plan}</span></div>
                        </div>
                      </td>
                      <td data-label="التجديد">
                        <div className="ds-cell-stack">
                          <strong>{subscription.renewalAt || "غير محدد"}</strong>
                          <Badge tone={alert.tier === "overdue" ? "danger" : "warning"}>{alert.label}</Badge>
                        </div>
                      </td>
                      <td data-label="الفاتورة الشهرية"><strong>{formatNumber(invoiceBreakdown(subscription).total)} ر.س</strong></td>
                      <td data-label="المتابعة">
                        <select
                          className="ds-select"
                          style={{ minWidth: 140 }}
                          aria-label={`حالة متابعة ${subscription.companyName}`}
                          value={followUp}
                          onChange={(event) => isFollowUp(event.target.value) && void setFollowUp(subscription.tenantId, event.target.value)}
                        >
                          {(Object.keys(FOLLOW_UP_LABEL) as FollowUp[]).map((key) => <option key={key} value={key}>{FOLLOW_UP_LABEL[key]}</option>)}
                        </select>
                        {entry?.updatedBy ? <small style={{ display: "block", color: "var(--ds-text-muted)", fontSize: 11.5, marginTop: 4 }}>آخر تحديث: <bdi dir="ltr">{entry.updatedBy}</bdi></small> : null}
                      </td>
                      <td>
                        <div className="ds-cell-actions">
                          <Button variant="primary" icon="wallet" onClick={() => setChargeClient(subscription)}>تجديد / دفع</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ds-table-foot">حالة المتابعة مشتركة بين فريق الإدارة، وتظهر لكل عضو مع آخر من حدّثها.</div>
          </div>
        )}
      </section>

      <ChargeDialog client={chargeClient} onClose={() => setChargeClient(null)} />
    </>
  );
}
