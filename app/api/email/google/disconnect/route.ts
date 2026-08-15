import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getTenantIntegrationId } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  await prisma.integrationSetting.updateMany({
    where: { id: getTenantIntegrationId("email", user.tenantId) },
    data: {
      provider: "email",
      status: "disconnected",
      googleRefreshToken: "",
      phoneNumber: ""
    }
  });

  return NextResponse.json({ ok: true });
}
