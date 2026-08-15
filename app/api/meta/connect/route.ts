import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings, type IntegrationChannel } from "../../../../lib/database";

const techProviderMetaAppId = "1296230909161568";
const techProviderMetaConfigId = "1428169365888624";

function getChannel(request: NextRequest): Extract<IntegrationChannel, "whatsapp" | "instagram" | "facebook"> {
  const channel = request.nextUrl.searchParams.get("channel");
  if (channel === "instagram" || channel === "facebook") return channel;
  return "whatsapp";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const channel = getChannel(request);
  const settings = await getIntegrationSettings(channel, user?.tenantId);
  const appId = channel === "whatsapp"
    ? techProviderMetaAppId
    : settings.appId.trim() || process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "";
  const configId = channel === "whatsapp" ? techProviderMetaConfigId : settings.configId.trim();

  if (!appId || !/^\d+$/.test(appId)) {
    return NextResponse.redirect(new URL("/dashboard?meta=missing-app-id", request.nextUrl.origin));
  }

  const redirectUri = `${request.nextUrl.origin}/api/meta/callback`;
  const metaUrl = new URL(channel === "instagram" ? "https://www.instagram.com/oauth/authorize" : "https://www.facebook.com/v22.0/dialog/oauth");

  metaUrl.searchParams.set("client_id", appId);
  metaUrl.searchParams.set("redirect_uri", redirectUri);
  metaUrl.searchParams.set("response_type", "code");
  metaUrl.searchParams.set("state", channel);
  metaUrl.searchParams.set(
    "scope",
    channel === "instagram"
      ? "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments"
      : channel === "facebook"
        ? "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging"
        : "whatsapp_business_management,whatsapp_business_messaging"
  );

  if (channel === "instagram") {
    metaUrl.searchParams.set("enable_fb_login", "0");
    metaUrl.searchParams.set("force_authentication", "1");
  }

  if (channel === "whatsapp" && configId) {
    metaUrl.searchParams.set("config_id", configId);
  }

  if (channel === "whatsapp") {
    metaUrl.searchParams.set(
      "extras",
      JSON.stringify({
        feature: "whatsapp_embedded_signup",
        featureType: "whatsapp_embedded_signup",
        sessionInfoVersion: "3",
        version: "v4",
        setup: {
          business: {
            name: settings.businessName
          }
        }
      })
    );
  }

  return NextResponse.redirect(metaUrl);
}
