import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";

export async function GET(request: NextRequest) {
  const settings = await getIntegrationSettings();
  const searchParams = request.nextUrl.searchParams;
  const wabaId = searchParams.get("waba_id") || searchParams.get("whatsapp_business_account_id") || "";
  const phoneNumberId = searchParams.get("phone_number_id") || "";
  const businessId = searchParams.get("business_id") || "";
  const code = searchParams.get("code") || "";

  if (wabaId || phoneNumberId || businessId || code) {
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: {
        status: wabaId && phoneNumberId ? "connected" : "pending",
        wabaId: wabaId || settings.wabaId,
        phoneNumberId: phoneNumberId || settings.phoneNumberId,
        updatedAt: new Intl.DateTimeFormat("ar-SA", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Riyadh"
        }).format(new Date())
      }
    });
  }

  return NextResponse.redirect(new URL("/dashboard?meta=callback", request.url));
}
