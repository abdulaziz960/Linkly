import { prisma } from "./prisma";
import { ensureSchema, getIntegrationSettings } from "./database";
import { isCustomerInactive } from "./segments";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { getTenantCompanyName, logAdminAction } from "./subscriptions";

// Bounds one cron tick's worth of work per tenant, matching the campaigns
// cron's own batching style (see app/api/cron/campaigns/route.ts). Ordered
// by reengagementSentAt ascending so never-reminded customers (empty string
// sorts first) and the longest-overdue ones are processed first - any
// customer pushed past the cap this tick rises to the front on the next one.
const MAX_CUSTOMERS_PER_TENANT = 200;

/**
 * Sends each tenant's configured "we miss you" WhatsApp template to
 * customers whose last recorded VISIT (Customer.lastVisitAt - a real-world
 * event like a Foodics/Reeqo reservation, recorded via POST
 * /api/v1/conversations with visit:true) is older than their configured
 * reengagementDays. Deliberately NOT based on WhatsApp conversation
 * activity - a customer can message without visiting, or visit without
 * messaging again after the initial booking confirmation. Runs off the
 * existing campaigns cron tick rather than a new schedule
 * (app/api/cron/campaigns/route.ts).
 *
 * Dedup: reengagementSentAt is only compared against the customer's own
 * lastVisitAt, not a fixed cycle id - a reminder fires once per "went quiet"
 * period. If the customer visits again after being reminded, lastVisitAt
 * moves past reengagementSentAt and they become eligible for another
 * reminder once they go quiet again.
 */
export async function sendReengagementReminders() {
  await ensureSchema();

  const tenants = await prisma.tenantPreference.findMany({
    where: { reengagementEnabled: 1, reengagementTemplateName: { not: "" } }
  });

  let sent = 0;

  for (const tenant of tenants) {
    const integration = await getIntegrationSettings("whatsapp", tenant.tenantId);
    if (!integration.phoneNumberId?.trim() || !integration.accessToken?.trim()) continue;

    const days = tenant.reengagementDays > 0 ? tenant.reengagementDays : 30;
    const now = new Date();

    const customers = await prisma.customer.findMany({
      where: { tenantId: tenant.tenantId, marketingOptOut: 0, lastVisitAt: { not: "" } },
      orderBy: { reengagementSentAt: "asc" },
      take: MAX_CUSTOMERS_PER_TENANT
    });

    const companyName = await getTenantCompanyName(tenant.tenantId);

    for (const customer of customers) {
      if (!isCustomerInactive(customer.lastVisitAt, days, now)) continue;
      if (customer.reengagementSentAt && customer.reengagementSentAt >= customer.lastVisitAt) continue;

      const result = await sendWhatsAppTemplate(tenant.tenantId, customer.phone, tenant.reengagementTemplateName, "ar", customer.name);

      await prisma.customer.update({
        where: { id: customer.id },
        data: { reengagementSentAt: new Date().toISOString() }
      });

      if (result.ok) {
        sent += 1;
      } else {
        await logAdminAction(
          tenant.tenantId,
          companyName,
          `[reengagement-reminder] تعذر إرسال تذكير الانقطاع لـ ${customer.name}: ${result.error}`,
          "تنبيه"
        ).catch(() => {});
      }
    }
  }

  return { sent };
}
