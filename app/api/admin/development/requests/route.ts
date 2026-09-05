import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search")?.trim();

  const requests = await prisma.featureRequest.findMany({
    where: {
      status: status || undefined,
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { companyName: { contains: search } },
              { createdByName: { contains: search } }
            ]
          }
        : {})
    },
    orderBy: { createdAt: "desc" }
  });

  const counts = await prisma.featureRequest.groupBy({
    by: ["status"],
    _count: { _all: true }
  });

  return jsonOk({
    requests,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all]))
  });
}
