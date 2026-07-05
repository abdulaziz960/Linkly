import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getProviderClients } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getProviderClients());
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json()) as {
    company?: string;
    owner?: string;
    plan?: string;
    status?: string;
    subscriptionStatus?: string;
    renewal?: string;
    phone?: string;
    wabaId?: string;
    employees?: number;
    amount?: number;
    billingCycle?: string;
    paymentMethod?: string;
  };

  if (!body.company?.trim()) return jsonError("اسم العميل مطلوب");
  if (!body.owner?.trim()) return jsonError("اسم المسؤول مطلوب");

  const now = new Date();
  const id = `tenant-${Date.now()}`;
  const subscriptionId = `sub-${Date.now()}`;
  const logId = `log-${Date.now()}`;
  const company = body.company.trim();
  const owner = body.owner.trim();
  const plan = body.plan || "باقة النمو";
  const status = body.status || "تجربة";
  const subscriptionStatus = body.subscriptionStatus || (status === "تجربة" ? "تجريبي" : "مدفوع");
  const renewal =
    body.renewal ||
    new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const phone = body.phone?.trim() || "بانتظار الربط";
  const wabaId = body.wabaId?.trim() || "بانتظار الربط";
  const employees = Number(body.employees || 1);
  const amount = Number(body.amount ?? (subscriptionStatus === "تجريبي" ? 0 : 499));
  const createdAt = now.toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO provider_clients (
        id, company, owner, plan, status, subscription_status, renewal, phone, waba_id,
        conversations, employees, last_activity, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      company,
      owner,
      plan,
      status,
      subscriptionStatus,
      renewal,
      phone,
      wabaId,
      0,
      employees,
      "الآن",
      createdAt
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO provider_subscriptions (
        id, client_id, client_name, plan, status, amount, renewal, billing_cycle, payment_method
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      subscriptionId,
      id,
      company,
      plan,
      subscriptionStatus,
      amount,
      renewal,
      body.billingCycle || (subscriptionStatus === "تجريبي" ? "تجربة 14 يوم" : "شهري"),
      body.paymentMethod || (subscriptionStatus === "تجريبي" ? "بدون دفع" : "تحويل بنكي")
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO admin_logs (id, at, client_id, client_name, source, level, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      logId,
      now.toLocaleString("ar-SA"),
      id,
      company,
      "Provider Admin",
      "معلومة",
      `تم إنشاء عميل جديد بواسطة ${user.name}.`
    );
  });

  return jsonOk({ id });
}
