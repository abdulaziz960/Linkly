import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";

const allowedFields = [
  "provider",
  "status",
  "businessName",
  "wabaName",
  "phoneNumber",
  "phoneNumberId",
  "wabaId",
  "appId",
  "configId",
  "verifyToken",
  "accessToken",
  "webhookUrl"
] as const;

export async function GET() {
  const settings = await getIntegrationSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  await getIntegrationSettings();
  const body = await request.json();
  const data = Object.fromEntries(
    allowedFields
      .filter((field) => typeof body[field] === "string")
      .map((field) => [field, body[field].trim()])
  );

  const settings = await prisma.integrationSetting.update({
    where: { id: "meta-whatsapp" },
    data: {
      ...data,
      updatedAt: new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Riyadh"
      }).format(new Date())
    }
  });

  return NextResponse.json({
    ...settings,
    provider: settings.provider,
    status: settings.status
  });
}
