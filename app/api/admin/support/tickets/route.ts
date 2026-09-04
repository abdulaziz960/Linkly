import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const priority = searchParams.get("priority") || undefined;
  const category = searchParams.get("category") || undefined;
  const tenantId = searchParams.get("tenantId") || undefined;
  const assignedAgentId = searchParams.get("assignedAgentId") || undefined;
  const search = searchParams.get("search")?.trim();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const where = {
    status: status || undefined,
    priority: priority || undefined,
    category: category || undefined,
    tenantId: tenantId || undefined,
    assignedAgentId: assignedAgentId === "unassigned" ? "" : assignedAgentId || undefined,
    ...(search
      ? {
          OR: [
            { ticketNumber: { contains: search } },
            { subject: { contains: search } },
            { companyName: { contains: search } },
            { createdByEmail: { contains: search } },
            { createdByName: { contains: search } }
          ]
        }
      : {})
  };

  const [tickets, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.supportTicket.count({ where })
  ]);

  const counts = await prisma.supportTicket.groupBy({
    by: ["status"],
    _count: { _all: true }
  });
  const urgentCount = await prisma.supportTicket.count({
    where: { priority: "urgent", status: { notIn: ["resolved", "closed"] } }
  });
  const unassignedCount = await prisma.supportTicket.count({
    where: { assignedAgentId: "", status: { notIn: ["resolved", "closed"] } }
  });
  const assignedToMeCount = await prisma.supportTicket.count({
    where: { assignedAgentId: admin.id, status: { notIn: ["resolved", "closed"] } }
  });

  return jsonOk({
    tickets,
    total,
    page,
    pageSize: PAGE_SIZE,
    counts: {
      byStatus: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
      urgent: urgentCount,
      unassigned: unassignedCount,
      assignedToMe: assignedToMeCount
    }
  });
}
