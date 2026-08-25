import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { createTenantWithSubscription, getSubscriptions } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getSubscriptions());
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json()) as {
    company?: string;
    owner?: string;
    ownerEmail?: string;
    plan?: string;
    status?: string;
    renewal?: string;
    amount?: number;
    billingCycle?: string;
  };

  const company = body.company?.trim();
  const owner = body.owner?.trim();
  const ownerEmail = body.ownerEmail?.trim();

  if (!company) return jsonError("اسم العميل مطلوب");
  if (!owner) return jsonError("اسم المسؤول مطلوب");
  if (!ownerEmail) return jsonError("البريد الإلكتروني لصاحب الحساب مطلوب");

  const plan = body.plan || "باقة النمو";
  const status = body.status || "تجربة";
  const renewalAt = body.renewal || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const amount = Number(body.amount ?? (status === "تجربة" ? 0 : 499));
  const billingCycle = body.billingCycle || (status === "تجربة" ? "تجربة 3 أيام" : "شهري");

  try {
    const { subscription, inviteDelivery } = await createTenantWithSubscription({
      companyName: company,
      ownerName: owner,
      ownerEmail,
      plan,
      status,
      amount,
      billingCycle,
      renewalAt,
      adminName: admin.name
    });

    return jsonOk({ subscription, inviteDelivery });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء العميل", 409);
  }
}
