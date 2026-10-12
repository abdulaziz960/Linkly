import { normalizeWhatsAppPhone, storeWhatsAppMessage } from "./whatsapp-inbox";
import { getIntegrationSettings } from "./database";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { recordFormAdSource } from "./ad-source";

type MetaLeadField = { name?: string; values?: string[] };

type MetaLeadgenPayload = {
  id?: string;
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  field_data?: MetaLeadField[];
  error?: { message?: string };
};

const nameFieldNames = ["full_name", "first_name"];
const phoneFieldNames = ["phone_number", "whatsapp_number", "mobile"];

function pickFieldValue(fieldData: MetaLeadField[], candidates: string[]) {
  for (const candidate of candidates) {
    const match = fieldData.find((field) => field.name?.toLowerCase() === candidate);
    const value = match?.values?.[0]?.trim();
    if (value) return value;
  }
  return "";
}

export async function fetchMetaLead(leadgenId: string, pageAccessToken: string): Promise<MetaLeadgenPayload | null> {
  const url = new URL(`https://graph.facebook.com/v22.0/${leadgenId}`);
  url.searchParams.set("fields", "field_data,ad_id,ad_name,campaign_id,campaign_name,form_id,platform");
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as MetaLeadgenPayload | null;
  if (!response.ok || !payload) {
    console.error("Meta lead ads: failed to fetch lead details", payload?.error);
    return null;
  }
  return payload;
}

/**
 * Runs when a Facebook/Instagram Lead Ad form is submitted: pulls the
 * submitted name/phone and opens a new WhatsApp conversation attributed to
 * the ad/campaign (it then shows on the leads page). The lead is always
 * saved; the welcome template is sent only when the tenant turned it on,
 * picked a template and connected WhatsApp.
 */
export async function handleMetaLeadgenEvent(tenantId: string, pageAccessToken: string, leadgenId: string) {
  const lead = await fetchMetaLead(leadgenId, pageAccessToken);
  if (!lead?.field_data) return;

  const phone = normalizeWhatsAppPhone(pickFieldValue(lead.field_data, phoneFieldNames));
  if (!phone) return;
  const name = pickFieldValue(lead.field_data, nameFieldNames);

  const campaignName = lead.campaign_name || lead.ad_name || "";
  const stored = await storeWhatsAppMessage({
    phone,
    name,
    text: `عميل محتمل جديد من إعلان${campaignName ? ` "${campaignName}"` : ""}`,
    direction: "out",
    tenantId,
    author: "نظام",
    // A fixed id per lead: the same lead delivered twice (webhook retry) is stored once and never welcomed twice.
    messageId: `leadgen-${leadgenId}`,
    attribution: {
      utmSource: lead.platform || "meta",
      utmMedium: "lead_ad",
      utmCampaign: lead.campaign_name || "",
      utmContent: lead.ad_name || "",
      pageId: lead.form_id || "",
      linkId: lead.ad_id || ""
    }
  });

  await recordFormAdSource({
    tenantId,
    conversationId: stored.conversationId,
    platform: "meta",
    adId: lead.ad_id || lead.form_id || "",
    headline: [lead.campaign_name, lead.ad_name].filter(Boolean).join(" · ")
  });

  if (!stored.isNew) return;

  // The lead is saved either way; the welcome goes out only when the workspace set it up.
  const leadsSettings = await getIntegrationSettings("meta_leads", tenantId);
  const template = leadsSettings.leadWelcomeTemplateName.trim();
  if (!leadsSettings.leadAdsEnabled || !template) return;
  const whatsappSettings = await getIntegrationSettings("whatsapp", tenantId);
  if (!whatsappSettings.phoneNumberId || !whatsappSettings.accessToken) return;

  await sendWhatsAppTemplate(tenantId, phone, template, "ar", name);
}
