import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getIntegrationSettings } from "@/lib/database";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const settings = await getIntegrationSettings("email", user.tenantId);
  const connected = (settings.provider as string) === "gmail" && settings.status === "connected" && Boolean(settings.googleRefreshToken);

  return NextResponse.json({
    connected,
    accountEmail: connected ? settings.phoneNumber : null,
    accountName: connected ? settings.businessName : null
  });
}
