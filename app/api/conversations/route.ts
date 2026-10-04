import { NextRequest } from "next/server";
import { getConversations } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { getEmployeeForUser, getVisibleAssigneeNames } from "../../../lib/permissions-server";
import { prisma } from "../../../lib/prisma";
import { normalizeWhatsAppPhone } from "../../../lib/whatsapp-inbox";
import { processDueAutomations } from "../../../lib/automation-engine";
import { jsonError, jsonOk } from "../_utils/json";
import { firstChar } from "../../../lib/first-char";

export const runtime = "nodejs";

/**
 * Mirrors lib/permissions.ts canSeeAllConversations / DashboardClient's
 * client-side scoping, plus a supervisor's team - see getVisibleAssigneeNames.
 */
async function assigneeScopeFor(user: { role: string; email: string; tenantId: string }) {
  const employee = await getEmployeeForUser(user);
  return getVisibleAssigneeNames(user, employee);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  processDueAutomations(user.tenantId).catch((error) => {
    console.error("Automation queue processing failed", error);
  });
  const assigneeNames = await assigneeScopeFor(user);
  return jsonOk(await getConversations(user.tenantId, assigneeNames));
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
      create: { id: customerId, name, phone: normalizedPhone, initial: firstChar(name) || "ع", tenantId: user.tenantId }
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
