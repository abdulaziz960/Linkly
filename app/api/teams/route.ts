import { NextRequest } from "next/server";
import { getTeams } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  return jsonOk(await getTeams(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = (await request.json()) as {
    name?: string;
    lead?: string;
    routing?: string;
    memberIds?: string[];
  };
  const name = body.name?.trim();

  if (!name) return jsonError("اسم الفريق مطلوب");

  const team = await prisma.team.create({
    data: {
      id: `team-${Date.now()}`,
      tenantId: user.tenantId,
      name,
      lead: body.lead?.trim() || "",
      routing: body.routing || "يدوي",
      members: {
        create: (body.memberIds || []).map((employeeId) => ({ employeeId }))
      }
    },
    include: { members: true }
  });

  return jsonOk(team);
}
