import { NextRequest } from "next/server";
import { createHash } from "crypto";
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

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  processDueAutomations(user.tenantId).catch((error) => {
    console.error("Automation queue processing failed", error);
  });
  const assigneeNames = await assigneeScopeFor(user);
  const body = JSON.stringify({ ok: true, data: await getConversations(user.tenantId, assigneeNames) });

  // The dashboard re-fetches this every few seconds and the body is the whole
  // inbox (about 2 MB), which made it ~90% of the site's outbound traffic. The
  // ETag is a hash of the exact body, so a 304 can only be returned when the
  // client already holds identical data - it can never serve a stale inbox.
  // no-store keeps the browser from writing private conversations to its disk
  // cache; the dashboard sends If-None-Match itself and keeps the last copy in memory.
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-store" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
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

  // Opening a customer must not bypass the assignee scope the inbox list applies:
  // a non-owner can open only their own (or their team's) or an unassigned conversation.
  const visibleAssignees = await assigneeScopeFor(user);
  const assignee = conversation.assignee || "";
  if (visibleAssignees && assignee && assignee !== "بدون موظف" && !visibleAssignees.includes(assignee)) {
    return jsonError("لم يتم العثور على العميل", 404);
  }

  return jsonOk(conversation);
}
