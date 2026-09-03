import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings, type IntegrationChannel } from "../../../../lib/database";
import { createOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";

const techProviderMetaAppId = "1296230909161568";
const techProviderMetaConfigId = "1428169365888624";

function getChannel(request: NextRequest): Extract<IntegrationChannel, "whatsapp" | "instagram" | "facebook"> {
  const channel = request.nextUrl.searchParams.get("channel");
  if (channel === "instagram" || channel === "facebook") return channel;
  return "whatsapp";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const channel = getChannel(request);
  const settings = await getIntegrationSettings(channel, user.tenantId);
  // Instagram uses its own standalone "Instagram API with Instagram Login" app
  // (instagram.com/oauth/authorize), whose App ID is NOT a valid classic
  // Facebook Platform app ID. Facebook Pages need a real classic app for
  // facebook.com/dialog/oauth, so it reuses Linkly's WhatsApp tech-provider
  // app (already a verified, working classic Meta app) instead of falling
  // back to the Instagram-only app ID, which produced "Invalid App ID".
  const appId = channel === "whatsapp" || channel === "facebook"
    ? techProviderMetaAppId
    : settings.appId.trim() || process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "";
  const configId = channel === "whatsapp" ? techProviderMetaConfigId : settings.configId.trim();

  if (!appId || !/^\d+$/.test(appId)) {
    return NextResponse.redirect(new URL("/dashboard?meta=missing-app-id", getAppOrigin(request)));
  }

  const redirectUri = `${getAppOrigin(request)}/api/meta/callback`;
  const metaUrl = new URL(channel === "instagram" ? "https://www.instagram.com/oauth/authorize" : "https://www.facebook.com/v22.0/dialog/oauth");

  metaUrl.searchParams.set("client_id", appId);
  metaUrl.searchParams.set("redirect_uri", redirectUri);
  metaUrl.searchParams.set("response_type", "code");
  const oauthState = createOAuthState("meta", { channel });
  metaUrl.searchParams.set("state", oauthState.state);
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

  const response = NextResponse.redirect(metaUrl);
  response.cookies.set("audiencew_meta_state", oauthState.nonce, {
    httpOnly: true,
    maxAge: oauthState.maxAgeSeconds,
    path: "/api/meta",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
