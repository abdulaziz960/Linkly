"use client";

import Link from "next/link";
import type { DiscountCodeRow, DiscountCodeUsageRow } from "../../types";
import { formatNumber } from "../../utils";
import { useLanguage } from "../../i18n";

type DiscountCodeDetailViewProps = {
  discountCode: DiscountCodeRow;
  stats: {
    totalUses: number;
    totalDiscountGiven: number;
    revenueGenerated: number;
    usages: DiscountCodeUsageRow[];
  };
};

export default function DiscountCodeDetailView({ discountCode, stats }: DiscountCodeDetailViewProps) {
  const { t } = useLanguage();

  return (
    <>
      <section className="admin-section">
        <Link href="/linkly-admin007/discount-codes">{t("← العودة لأكواد الخصم", "← Back to discount codes")}</Link>
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي الاستخدامات", "Total uses")}</span>
            <strong>{formatNumber(stats.totalUses)}</strong>
          </article>
          <article>
            <span>{t("إجمالي الخصم الممنوح", "Total discount given")}</span>
            <strong>{formatNumber(stats.totalDiscountGiven)} {t("ر.س", "SAR")}</strong>
          </article>
          <article>
            <span>{t("الإيرادات المحققة", "Revenue generated")}</span>
            <strong>{formatNumber(stats.revenueGenerated)} {t("ر.س", "SAR")}</strong>
          </article>
          <article>
            <span>{t("الحد الأقصى للاستخدام", "Usage limit")}</span>
            <strong>{discountCode.usageLimit === -1 ? t("بلا حد", "Unlimited") : `${formatNumber(discountCode.usedCount)} / ${formatNumber(discountCode.usageLimit)}`}</strong>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("سجل الاستخدام", "Usage log")}</h2>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("العميل", "Client")}</th>
                <th>{t("الباقة", "Plan")}</th>
                <th>{t("السعر الأصلي", "Original")}</th>
                <th>{t("الخصم", "Discount")}</th>
                <th>{t("المدفوع", "Paid")}</th>
                <th>{t("التاريخ", "Date")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.usages.map((usage) => (
                <tr key={usage.id}>
                  <td>{usage.userName || usage.email || usage.tenantId}</td>
                  <td>{usage.planName}</td>
                  <td>{formatNumber(usage.originalAmount)} {t("ر.س", "SAR")}</td>
                  <td>{formatNumber(usage.discountAmount)} {t("ر.س", "SAR")}</td>
                  <td>{formatNumber(usage.finalAmount)} {t("ر.س", "SAR")}</td>
                  <td>{usage.usedAt ? usage.usedAt.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.usages.length === 0 ? <p className="admin-empty-state">{t("لا توجد استخدامات مكتملة بعد.", "No completed uses yet.")}</p> : null}
      </section>
    </>
  );
}
