import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; phone?: string };
  const name = body.name?.trim();
  const phone = body.phone?.trim();

  if (!name) return jsonError("اسم العميل مطلوب");
  if (!phone) return jsonError("رقم الجوال مطلوب");

  try {
    const existing = await prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true }
    });

    if (!existing) return jsonError("تعذر تحديث العميل", 404);

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        phone,
        initial: name.slice(0, 1)
      }
    });

    return jsonOk(customer);
  } catch {
    return jsonError("تعذر تحديث العميل", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const { id } = await context.params;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true }
      });

      if (!existing) throw new Error("not-found");

      const conversations = await tx.conversation.findMany({
        where: { customerId: id, tenantId: user.tenantId },
        select: { id: true }
      });
      const conversationIds = conversations.map((conversation) => conversation.id);

      if (conversationIds.length) {
        await tx.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
        await tx.conversationTag.deleteMany({ where: { conversationId: { in: conversationIds } } });
        await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      }

      await tx.customer.delete({ where: { id } });
    });

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف العميل", 404);
  }
}
