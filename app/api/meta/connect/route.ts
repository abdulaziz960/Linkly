import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings, type IntegrationChannel } from "../../../../lib/database";
import { createOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";

const techProviderMetaAppId = "1296230909161568";
const techProviderMetaConfigId = "1428169365888624";
// Instagram is connected through the "API setup with Instagram login"
// product on the same Meta app ("Linkly int") - a direct instagram.com
// login, no Facebook Page required. Its App ID (visible under that
// product's settings) is a *different* number from the app's main
// Facebook App ID (1600375064844173, used for Basic Settings/Facebook
// Login) - confirmed directly against Meta's dashboard. Hardcoded the same
// way as the WhatsApp/Facebook app id, instead of trusting a per-tenant
// settings.appId field - a tenant pasting the wrong App ID there silently
// broke Instagram connect with Meta's opaque "Invalid platform app" error.
const techProviderInstagramAppId = "1384578340228125";

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
  const appId = channel === "instagram" ? techProviderInstagramAppId : techProviderMetaAppId;
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

  if (channel === "instagram") {
    metaUrl.searchParams.set(
      "scope",
      "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish"
    );
  } else if (channel === "facebook") {
    metaUrl.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging");
  } else if (channel === "whatsapp") {
    metaUrl.searchParams.set("scope", "whatsapp_business_management,whatsapp_business_messaging");
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
