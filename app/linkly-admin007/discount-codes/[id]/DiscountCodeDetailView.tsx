"use client";

import { useState } from "react";
import type { DiscountCodeRow, DiscountCodeUsageRow } from "../../types";
import { formatNumber } from "../../utils";
import { Badge, EmptyState, LinkButton, Section, StatCard } from "../../ds/primitives";
import { STATUS_LABEL, STATUS_TONE, computeStatus, discountLabel } from "../codes-data";

type Props = {
  discountCode: DiscountCodeRow;
  stats: {
    totalUses: number;
    totalDiscountGiven: number;
    revenueGenerated: number;
    usages: DiscountCodeUsageRow[];
  };
};

export default function DiscountCodeDetailView({ discountCode, stats }: Props) {
  const [now] = useState(() => Date.now());
  const status = computeStatus(discountCode, now);
  const label = discountLabel(discountCode, formatNumber);

  return (
    <>
      <div className="ds-card ds-card-pad ds-profile-hero">
        <div className="ds-profile-hero-main">
          <div className="ds-profile-hero-title">
            <h2 dir="ltr" style={{ letterSpacing: "0.04em" }}>{discountCode.code}</h2>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            <Badge tone="neutral" dot={false}>{label.main}{label.note ? ` · ${label.note}` : ""}</Badge>
          </div>
          <p>{discountCode.name}</p>
        </div>
        <div className="ds-section-actions">
          <LinkButton href="/linkly-admin007/discount-codes" variant="outline" icon="chevronRight">كل أكواد الخصم</LinkButton>
        </div>
      </div>

      <div className="ds-stat-grid" style={{ marginTop: 16 }}>
        <StatCard label="إجمالي الاستخدامات" value={formatNumber(stats.totalUses)} hint="دفعات مكتملة بهذا الكود" icon="checkCircle" tone="success" />
        <StatCard label="إجمالي الخصم الممنوح" value={`${formatNumber(stats.totalDiscountGiven)} ر.س`} hint="مجموع ما خُصم من العملاء" icon="ticket" tone="warning" />
        <StatCard label="الإيرادات المحققة" value={`${formatNumber(stats.revenueGenerated)} ر.س`} hint="بعد الخصم" icon="wallet" tone="success" />
        <StatCard
          label="الحد الأقصى للاستخدام"
          value={discountCode.usageLimit === -1 ? "بلا حد" : `${formatNumber(discountCode.usedCount)} / ${formatNumber(discountCode.usageLimit)}`}
          hint={`لكل عميل: ${formatNumber(discountCode.usageLimitPerUser)}`}
          icon="users"
        />
      </div>

      <Section title="سجل الاستخدام" description="الدفعات المكتملة التي استُخدم فيها هذا الكود.">
        {stats.usages.length === 0 ? (
          <EmptyState icon="receipt" title="لا توجد استخدامات مكتملة بعد" description="ستظهر هنا الدفعات عند استخدام الكود وإتمامها." />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">العميل</th>
                  <th scope="col">الباقة</th>
                  <th scope="col">السعر الأصلي</th>
                  <th scope="col">الخصم</th>
                  <th scope="col">المدفوع</th>
                  <th scope="col">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {stats.usages.map((usage) => (
                  <tr key={usage.id}>
                    <td data-cell="main"><strong>{usage.userName || usage.email || usage.tenantId}</strong></td>
                    <td data-label="الباقة">{usage.planName}</td>
                    <td data-label="السعر الأصلي">{formatNumber(usage.originalAmount)} ر.س</td>
                    <td data-label="الخصم">{formatNumber(usage.discountAmount)} ر.س</td>
                    <td data-label="المدفوع"><strong>{formatNumber(usage.finalAmount)} ر.س</strong></td>
                    <td data-label="التاريخ">{usage.usedAt ? usage.usedAt.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ds-table-foot">{formatNumber(stats.usages.length)} استخدام.</div>
          </div>
        )}
      </Section>
    </>
  );
}
