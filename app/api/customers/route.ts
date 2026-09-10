import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCustomers } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";
import { isValidSaudiPhone } from "../../../lib/validation";
import { logAdminAction, getTenantCompanyName } from "../../../lib/subscriptions";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  return jsonOk(await getCustomers(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "contacts"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as { name?: string; phone?: string };
  const name = body.name?.trim();
  const phone = body.phone?.trim();

  if (!name) return jsonError("اسم العميل مطلوب");
  if (!phone) return jsonError("رقم الجوال مطلوب");
  if (!isValidSaudiPhone(phone)) return jsonError("أدخل رقم جوال سعودي صحيح (مثال: 05XXXXXXXX)");

  const id = `c-${randomUUID()}`;
  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        id,
        name,
        phone,
        initial: name.slice(0, 1),
        tenantId: user.tenantId
      }
    });

    await tx.conversation.create({
      data: {
        id,
        customerId: id,
        channel: "whatsapp",
        lastMessage: "لا توجد رسائل بعد",
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 1,
        tenantId: user.tenantId
      }
    });

    return created;
  });

  await logAdminAction(
    user.tenantId,
    await getTenantCompanyName(user.tenantId),
    `تمت إضافة العميل "${name}" بواسطة ${user.name}.`,
    "معلومة",
    "العملاء"
  );

  return jsonOk(customer);
}
