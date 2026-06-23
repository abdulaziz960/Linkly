import { NextRequest } from "next/server";
import { getTeams } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getTeams());
}

export async function POST(request: NextRequest) {
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
