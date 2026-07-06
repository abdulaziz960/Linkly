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

type IntegrationField = (typeof allowedFields)[number];

export async function GET() {
  const settings = await getIntegrationSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const existingSettings = await getIntegrationSettings();
  const body = await request.json();
  const allowBlankOverwrite = body.reset === true || body.allowBlankOverwrite === true;
  const data: Partial<Record<IntegrationField, string>> = {};

  for (const field of allowedFields) {
    if (typeof body[field] !== "string") continue;

    const value = body[field].trim();
    const previousValue = existingSettings[field];

    if (!allowBlankOverwrite && value === "" && previousValue.trim() !== "") {
      continue;
    }

    data[field] = value;
  }

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
