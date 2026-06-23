import { NextRequest } from "next/server";
import { getCampaigns } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getCampaigns());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; total?: number; status?: string };
  if (!body.name?.trim()) return jsonError("اسم الحملة مطلوب");
  const total = body.total ?? 0;
  const campaign = await prisma.campaign.create({
    data: {
      id: `camp-${Date.now()}`,
      name: body.name.trim(),
      sent: 0,
      total,
      progress: total ? "0%" : "0%",
      status: body.status || "مجدولة",
      updatedAt: new Date().toLocaleString("en-US")
    }
  });
  return jsonOk(campaign);
}
