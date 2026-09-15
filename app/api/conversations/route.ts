import { NextRequest } from "next/server";
import { getConversations } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { getEmployeeForUser } from "../../../lib/permissions-server";
import { canSeeAllConversations } from "../../../lib/permissions";
import { prisma } from "../../../lib/prisma";
import { normalizeWhatsAppPhone } from "../../../lib/whatsapp-inbox";
import { processDueAutomations } from "../../../lib/automation-engine";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

/**
 * Anyone without full conversation visibility only ever sees conversations
 * assigned to them - mirrors lib/permissions.ts canSeeAllConversations,
 * used client-side for the same scoping. If we can't resolve their
 * employee record, fail closed (an unmatched sentinel) rather than
 * accidentally returning everyone's conversations.
 */
async function assigneeScopeFor(user: { role: string; email: string; tenantId: string }) {
  const employee = await getEmployeeForUser(user);
  if (canSeeAllConversations(user.role, employee ?? undefined)) return undefined;
  return employee?.name || "__no_matching_employee__";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  processDueAutomations(user.tenantId).catch((error) => {
    console.error("Automation queue processing failed", error);
  });
  const assigneeName = await assigneeScopeFor(user);
  return jsonOk(await getConversations(user.tenantId, assigneeName));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { customerId?: string; phone?: string; name?: string };
  let customerId = body.customerId?.trim();
  const phone = body.phone?.trim();

  if (!customerId && !phone) return jsonError("العميل مطلوب");

  if (!customerId && phone) {
    // A campaign/segment recipient row only ever has a phone number, not a
    // customer id. Reuse the exact deterministic id scheme a real inbound
    // WhatsApp message would create (lib/whatsapp-inbox.ts), so "send
    // message" opens a real conversation even for a phone-only lead who
    // never messaged in before - upserting is safe/idempotent if they did.
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    if (!normalizedPhone) return jsonError("رقم الهاتف غير صالح");
    const scopedPrefix = user.tenantId === "tenant-demo" ? "" : `${user.tenantId}-`;
    customerId = `${scopedPrefix}wa-${normalizedPhone}`;
    const name = body.name?.trim() || `عميل ${normalizedPhone.slice(-4) || "واتساب"}`;
    await prisma.customer.upsert({
      where: { id: customerId },
      update: {},
      create: { id: customerId, name, phone: normalizedPhone, initial: name.charAt(0) || "ع", tenantId: user.tenantId }
    });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { conversations: true }
  });

  if (!customer) return jsonError("لم يتم العثور على العميل", 404);
  if (customer.tenantId !== user.tenantId) return jsonError("لم يتم العثور على العميل", 404);

  const conversationId = customer.conversations[0]?.id || customer.id;

  if (!customer.conversations.length) {
    await prisma.conversation.create({
      data: {
        id: conversationId,
        customerId: customer.id,
        channel: "whatsapp",
        lastMessage: "لا توجد رسائل بعد",
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 1,
        tenantId: user.tenantId
      }
    });
  }

  const conversations = await getConversations(user.tenantId);
  const conversation = conversations.find((item) => item.id === conversationId);

  if (!conversation) return jsonError("تعذر فتح محادثة العميل");

  return jsonOk(conversation);
}
