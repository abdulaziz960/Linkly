import { prisma } from "./prisma";
import { ensureSchema, getIntegrationSettings } from "./database";
import { createMetaTemplate, isMetaWhatsAppConfigured, syncMetaTemplates } from "./meta-templates";
import { getTenantCompanyName } from "./subscriptions";

/**
 * The "open the chat" template every WhatsApp-connected workspace gets
 * automatically with its subscription.
 *
 * WhatsApp only lets a business message a customer freely for 24 hours after
 * the customer's last message; after that the first message has to be an
 * approved template. This one is a short, friendly greeting with a single
 * "talk to us" button - when the customer taps it (or just replies), they
 * message the business, the 24-hour window reopens and the conversation can
 * continue normally. It's what lets a plan without the Templates page (or a
 * workspace that never created a template) still re-open a chat.
 *
 * Provisioned by the cron tick (not at signup) so it also reaches workspaces
 * that were connected before this existed, and re-tries on its own if Meta
 * was unreachable; its review status is refreshed the same way, since a
 * plan without the Templates page never triggers a manual sync.
 */

export const OPENER_TEMPLATE_NAME = "linkly_open_chat";
export const OPENER_BUTTON_TEXT = "تحدث معنا";
const MAX_PROVISION_PER_TICK = 5;
const MAX_SYNC_PER_TICK = 10;

export function openerTemplateBody(companyName: string) {
  // Braces/newlines in a company name would corrupt the {{1}} placeholder or be rejected by Meta.
  const company = companyName.replace(/[{}\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "فريق الدعم";
  return `أهلًا {{1}} 👋\nمعك ${company}. يسعدنا خدمتك، اضغط على الزر أدناه وأخبرنا كيف نقدر نساعدك.`;
}

export type OpenerResult = "created" | "exists" | "not_connected" | "failed";

export async function ensureOpenerTemplate(tenantId: string): Promise<OpenerResult> {
  await ensureSchema();
  // getIntegrationSettings creates a blank row for a workspace without one - check first so this never does.
  const row = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "whatsapp_cloud" }, select: { wabaId: true } });
  if (!row?.wabaId) return "not_connected";
  const integration = await getIntegrationSettings("whatsapp", tenantId);
  if (!isMetaWhatsAppConfigured(integration)) return "not_connected";

  const existing = await prisma.template.findFirst({ where: { tenantId, name: OPENER_TEMPLATE_NAME } });
  if (existing) return "exists";

  const message = openerTemplateBody(await getTenantCompanyName(tenantId));
  const result = await createMetaTemplate(integration, {
    name: OPENER_TEMPLATE_NAME,
    category: "MARKETING",
    language: "ar",
    headerType: "NONE",
    headerText: "",
    headerMediaHandle: "",
    message,
    footer: "",
    buttonType: "QUICK_REPLY",
    buttonText: OPENER_BUTTON_TEXT,
    buttonPhone: "",
    buttonUrl: "",
    bodyExamples: { "1": "محمد" }
  });

  if (!result.ok) {
    // Meta says the name already exists (created earlier, local row lost): pull it in instead of failing forever.
    if (/already|موجود|exist/i.test(result.error)) {
      await syncMetaTemplates(tenantId, integration.wabaId, integration.accessToken).catch(() => undefined);
      return "exists";
    }
    console.error("Opener template creation failed", { tenantId, error: result.error });
    return "failed";
  }

  await prisma.template.create({
    data: {
      id: `tmpl-${tenantId}-${OPENER_TEMPLATE_NAME}`,
      tenantId,
      name: OPENER_TEMPLATE_NAME,
      message,
      type: "تسويق",
      category: "MARKETING",
      language: "ar",
      status: result.status,
      headerType: "NONE",
      headerText: "",
      headerMedia: "",
      footer: "",
      buttonType: "QUICK_REPLY",
      buttonText: OPENER_BUTTON_TEXT,
      buttonPhone: "",
      buttonUrl: "",
      metaId: result.id,
      syncedAt: "-",
      lastUsed: "-"
    }
  });
  return "created";
}

/** Cron step: create the opener where it's missing and refresh its review status where it's pending. */
export async function provisionOpenerTemplates(): Promise<{ created: number; synced: number }> {
  await ensureSchema();
  let created = 0;
  let synced = 0;

  const connected = await prisma.integrationSetting.findMany({
    where: { provider: "whatsapp_cloud", status: "connected", wabaId: { not: "" }, accessToken: { not: "" } },
    select: { tenantId: true },
    take: 200
  });
  const tenantIds = connected.map((row) => row.tenantId);

  if (tenantIds.length) {
    const have = await prisma.template.findMany({ where: { tenantId: { in: tenantIds }, name: OPENER_TEMPLATE_NAME }, select: { tenantId: true } });
    const haveSet = new Set(have.map((row) => row.tenantId));
    for (const tenantId of tenantIds.filter((id) => !haveSet.has(id)).slice(0, MAX_PROVISION_PER_TICK)) {
      if ((await ensureOpenerTemplate(tenantId).catch(() => "failed")) === "created") created += 1;
    }
  }

  const pending = await prisma.template.findMany({
    where: { name: OPENER_TEMPLATE_NAME, status: "قيد المراجعة", metaId: { not: "" } },
    select: { tenantId: true },
    take: MAX_SYNC_PER_TICK
  });
  for (const { tenantId } of pending) {
    const integration = await getIntegrationSettings("whatsapp", tenantId);
    if (!isMetaWhatsAppConfigured(integration)) continue;
    const result = await syncMetaTemplates(tenantId, integration.wabaId, integration.accessToken).catch(() => null);
    if (result?.ok) synced += 1;
  }

  return { created, synced };
}
