// The end-of-day sales summary of the chat orders, sent to each workspace owner by email and as a push alert (run once a
// day by Cloud Scheduler, late evening Saudi time). A day with no sales sends nothing; each day is sent once per workspace.
// (A WhatsApp message to the owner would need a Meta-approved template, so it is not used.)

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { dailyReport, dayRange, todayInRiyadh, type DailyReport } from "./catalog-daily-report";
import { logAdminAction } from "./subscriptions";

export async function getSummaryEnabled(tenantId: string): Promise<boolean> {
  await ensureCatalogSchema();
  const rows = await prisma.$queryRaw<Array<{ enabled: number | bigint }>>`SELECT enabled FROM catalog_daily_summary_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ? Number(rows[0].enabled) === 1 : true;
}

export async function setSummaryEnabled(tenantId: string, enabled: boolean) {
  await ensureCatalogSchema();
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO catalog_daily_summary_settings (tenant_id, enabled, updated_at) VALUES (${tenantId}, ${enabled ? 1 : 0}, ${now}) ON CONFLICT (tenant_id) DO UPDATE SET enabled = ${enabled ? 1 : 0}, updated_at = ${now}`;
}

const PAYMENT_LABELS: Record<string, string> = { mada: "مدى", card: "بطاقة", applepay: "Apple Pay", stcpay: "STC Pay", samsungpay: "Samsung Pay", tabby: "تابي", tamara: "تمارا", zid: "زد", cash: "عند الاستلام", unknown: "غير مسجّلة", other: "أخرى" };

const money = (value: number, currency: string) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency === "SAR" ? "ر.س" : currency}`;

/** Pure: the lines of the summary email. */
export function summaryRows(report: DailyReport): [string, string][] {
  const change = report.previous.change;
  const rows: [string, string][] = [
    ["إجمالي المبيعات", money(report.sales, report.currency)],
    ["عدد الطلبات", String(report.orderCount)],
    ["متوسط الطلب", money(report.average, report.currency)],
    ["مقارنة بالأمس", change === null ? "لا مبيعات بالأمس للمقارنة" : `${change > 0 ? "+" : ""}${change}% (${money(report.previous.sales, report.currency)})`]
  ];
  for (const row of report.byPayment) rows.push([`الدفع: ${PAYMENT_LABELS[row.key] ?? row.key}`, `${money(row.total, report.currency)} (${row.count})`]);
  if (report.awaiting.count) rows.push(["بانتظار الدفع", `${money(report.awaiting.total, report.currency)} (${report.awaiting.count})`]);
  if (report.cancelled.count) rows.push(["ملغي", `${money(report.cancelled.total, report.currency)} (${report.cancelled.count})`]);
  const top = report.products.slice(0, 3).map((product) => `${product.name} × ${product.quantity}`).join("، ");
  if (top) rows.push(["الأكثر مبيعًا", top]);
  return rows;
}

/** Sends the day's summary to every workspace that had sales and has not switched it off. Safe to run twice: a day goes once. */
export async function sendDailySummaries(baseUrl: string, now = new Date()): Promise<{ sent: number }> {
  await ensureCatalogSchema();
  const day = todayInRiyadh(now);
  const range = dayRange(day);
  const tenants = await prisma.catalogOrder.findMany({ where: { createdAt: { gte: range.from, lt: range.to } }, distinct: ["tenantId"], select: { tenantId: true } });
  let sent = 0;
  for (const { tenantId } of tenants) {
    try {
      const marker = `[daily-summary:${tenantId}:${day}]`;
      if (!(await getSummaryEnabled(tenantId))) continue;
      if (await prisma.adminLog.findFirst({ where: { clientId: tenantId, message: { contains: marker } } })) continue;
      const report = await dailyReport(tenantId, day);
      if (!report.orderCount) continue;
      const owner = await prisma.userAccount.findFirst({ where: { tenantId, role: "مالك الحساب" }, orderBy: { createdAt: "asc" } });
      let delivered = false;
      if (owner?.email) {
        const { sendDailySummaryEmail } = await import("./email");
        const { getTenantBranding } = await import("./tenant-branding");
        const branding = await getTenantBranding(tenantId);
        delivered = await sendDailySummaryEmail({ to: owner.email, name: owner.name, day, rows: summaryRows(report), dashboardUrl: `${baseUrl}/dashboard?view=catalog`, branding: { name: branding.name, color: branding.color } });
      }
      const { notifyTenant } = await import("./push-notifications");
      await notifyTenant(tenantId, { title: "ملخص مبيعات اليوم", body: `${report.orderCount} طلب · ${money(report.sales, report.currency)}`, url: "/dashboard?view=catalog" }).catch(() => null);
      await logAdminAction(tenantId, owner?.name || tenantId, `${marker} ${delivered ? "تم إرسال" : "تعذر إرسال"} ملخص مبيعات اليوم (${report.orderCount} طلب)`);
      if (delivered) sent += 1;
    } catch (error) {
      console.error("Daily summary failed", { tenantId, error });
    }
  }
  return { sent };
}
