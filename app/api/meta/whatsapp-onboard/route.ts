import { NextResponse } from "next/server";

const techProviderMetaAppId = "1296230909161568";
const techProviderMetaConfigId = "1428169365888624";

export async function GET() {
  const metaUrl = new URL("https://business.facebook.com/messaging/whatsapp/onboard/");
  metaUrl.searchParams.set("app_id", techProviderMetaAppId);
  metaUrl.searchParams.set("config_id", techProviderMetaConfigId);
  metaUrl.searchParams.set(
    "extras",
    JSON.stringify({
      sessionInfoVersion: "3",
      version: "v4"
    })
  );

  return NextResponse.redirect(metaUrl);
}
