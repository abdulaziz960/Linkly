import { NextRequest } from "next/server";
import { getLeads } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getLeads());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { customer?: string; interest?: string; budget?: string; stage?: string; employee?: string; lastContact?: string };
  if (!body.customer?.trim()) return jsonError("اسم العميل مطلوب");
  const lead = await prisma.lead.create({
    data: {
      id: `lead-${Date.now()}`,
      customer: body.customer.trim(),
      interest: body.interest || "",
      budget: body.budget || "",
      stage: body.stage || "مهتم",
      employee: body.employee || "بدون موظف",
      lastContact: body.lastContact || "اليوم"
    }
  });
  return jsonOk(lead);
}
