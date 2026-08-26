import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { ensureSchema, getIntegrationSettings, getTenantIntegrationId } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { normalizeWhatsAppPhone, storeWhatsAppMessage } from "../../../../lib/whatsapp-inbox";
import { jsonError, jsonOk } from "../../_utils/json";

function secretsMatch(received: string, expected: string) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export const runtime = "nodejs";

type ZapierLeadPayload = {
  name?: string;
  customer?: string;
  full_name?: string;
  phone?: string;
  mobile?: string;
  whatsapp?: string;
  interest?: string;
  service?: string;
  budget?: string;
  source?: string;
  platform?: string;
  campaign?: string;
  notes?: string;
  message?: string;
  tenantId?: string;
};

function getZapierToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) return authHeader.slice(7).trim();
  return request.headers.get("x-audiencew-zapier-secret") || request.nextUrl.searchParams.get("token") || "";
}

async function resolveTenantId(request: NextRequest, body: ZapierLeadPayload) {
  return request.nextUrl.searchParams.get("tenant")?.trim() || body.tenantId?.trim() || process.env.ZAPIER_DEFAULT_TENANT_ID || "tenant-demo";
}

async function requireZapierSecret(request: NextRequest, tenantId: string) {
  const token = getZapierToken(request);
  const envSecret = process.env.ZAPIER_LEADS_SECRET || "";
  if (envSecret && secretsMatch(token, envSecret)) return true;

  const integration = await getIntegrationSettings("leads", tenantId);
  return Boolean(integration.verifyToken) && secretsMatch(token, integration.verifyToken);
}

function pickName(body: ZapierLeadPayload) {
  return body.name?.trim() || body.customer?.trim() || body.full_name?.trim() || "عميل جديد";
}

function pickPhone(body: ZapierLeadPayload) {
  return normalizeWhatsAppPhone(body.phone || body.mobile || body.whatsapp || "");
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ZapierLeadPayload | null;
  if (!body) return jsonError("بيانات Zapier غير صحيحة", 400);
  await ensureSchema();

  const tenantId = await resolveTenantId(request, body);
  if (!(await requireZapierSecret(request, tenantId))) return jsonError("توكن Zapier غير صحيح", 401);

  const customer = pickName(body);
  const phone = pickPhone(body);
  if (!phone) return jsonError("رقم الجوال مطلوب من Zapier", 400);

  const interest = body.interest?.trim() || body.service?.trim() || "";
  const source = body.source?.trim() || body.platform?.trim() || body.campaign?.trim() || "Zapier";
  const notes = body.notes?.trim() || body.message?.trim() || "";
  const leadId = `lead-zapier-${tenantId}-${phone}-${Date.now()}`;

  const lead = await prisma.lead.create({
    data: {
      id: leadId,
      customer,
      phone,
      interest,
      budget: body.budget?.trim() || "",
      source,
      notes,
      stage: "جديد",
      employee: "بدون موظف",
      lastContact: "اليوم",
      tenantId
    }
  });

  await storeWhatsAppMessage({
    tenantId,
    phone,
    name: customer,
    text: `ليد جديد من ${source}${interest ? ` - الاهتمام: ${interest}` : ""}${notes ? ` - ${notes}` : ""}`,
    direction: "in",
    messageId: `zapier-${leadId}`,
    author: "Zapier"
  });

  const integrationId = getTenantIntegrationId("whatsapp", tenantId);

  return jsonOk({
    lead,
    conversationId: tenantId === "tenant-demo" ? `conv-${phone}` : `${tenantId}-conv-${phone}`,
    integrationId,
    ai: {
      enabled: process.env.AI_LEAD_ASSISTANT_ENABLED === "true",
      startsAfterCustomerReply: true
    }
  });
}
