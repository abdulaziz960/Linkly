import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const requests = await prisma.featureRequest.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" }
  });

  return jsonOk(requests);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { title?: string; description?: string };

  const title = body.title?.trim();
  const description = body.description?.trim();
  if (!title) return jsonError("عنوان الفكرة مطلوب");
  if (title.length > 200) return jsonError("عنوان الفكرة أطول من الحد المسموح");
  if (!description) return jsonError("وصف الفكرة مطلوب");
  if (description.length > 4000) return jsonError("وصف الفكرة أطول من الحد المسموح");

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
    select: { companyName: true }
  });

  const now = new Date().toISOString();
  const created = await prisma.featureRequest.create({
    data: {
      id: `fr-${randomUUID()}`,
      tenantId: user.tenantId,
      createdByUserId: user.id,
      createdByName: user.name,
      companyName: subscription?.companyName || "",
      title,
      description,
      status: "pending",
      createdAt: now,
      updatedAt: now
    }
  });

  return jsonOk(created);
}
