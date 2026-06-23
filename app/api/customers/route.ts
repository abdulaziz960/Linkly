import { NextRequest } from "next/server";
import { getCustomers } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getCustomers());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; phone?: string };
  const name = body.name?.trim();
  const phone = body.phone?.trim();

  if (!name) return jsonError("اسم العميل مطلوب");
  if (!phone) return jsonError("رقم الجوال مطلوب");

  const id = `c-${Date.now()}`;
  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        id,
        name,
        phone,
        initial: name.slice(0, 1)
      }
    });

    await tx.conversation.create({
      data: {
        id,
        customerId: id,
        lastMessage: "لا توجد رسائل بعد",
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 1
      }
    });

    return created;
  });

  return jsonOk(customer);
}
