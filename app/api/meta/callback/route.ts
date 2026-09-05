import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";
import { syncMetaTemplates } from "../../../../lib/meta-templates";
import { verifyOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";

const techProviderMetaAppId = "1296230909161568";
// Must match techProviderInstagramAppId in app/api/meta/connect/route.ts -
// this is Instagram's own App ID under "API setup with Instagram login" on
// the "Linkly int" app, distinct from that same app's main Facebook App ID
// (techProviderMetaAppId is a *different* Meta app entirely, WhatsApp's).
const techProviderInstagramAppId = "1384578340228125";

async function exchangeInstagramLongLivedToken(shortLivedToken: string, appSecret: string) {
  if (!shortLivedToken || !appSecret) return shortLivedToken;

  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as { access_token?: string } | null;

  if (!response.ok || !payload?.access_token) {
    console.error("Instagram long-lived token exchange failed", payload);
    return shortLivedToken;
  }

  return payload.access_token;
}

async function exchangeWhatsAppCodeForToken(appId: string, appSecret: string, code: string) {
  if (!appId || !appSecret || !code) {
    return { token: "", error: `missing ${!appId ? "appId" : !appSecret ? "appSecret" : "code"}` };
  }

  // The code from FB.login()'s popup-based Embedded Signup is not tied to a
  // redirect_uri (no browser redirect ever happens), so this exchange must
  // NOT send redirect_uri — doing so causes Meta to reject the code and the
  // exchange silently returns no access_token.
  const url = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.access_token) {
    console.error("WhatsApp embedded signup token exchange failed", payload);
    return { token: "", error: payload?.error?.message || `http ${response.status}` };
  }

  return { token: payload.access_token, error: "" };
}

async function fetchWhatsAppPhoneDetails(phoneNumberId: string, accessToken: string) {
  if (!phoneNumberId || !accessToken) return null;

  const url = new URL(`https://graph.facebook.com/v22.0/${phoneNumberId}`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as {
    display_phone_number?: string;
    verified_name?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    console.error("WhatsApp phone details fetch failed", payload);
    return null;
  }

  return payload;
}

async function fetchWhatsAppBusinessDetails(wabaId: string, accessToken: string) {
  if (!wabaId || !accessToken) return null;

  const url = new URL(`https://graph.facebook.com/v22.0/${wabaId}`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as {
    name?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    console.error("WhatsApp business details fetch failed", payload);
    return null;
  }

  return payload;
}

function closePopupAndRedirect(origin: string, redirectPath: string) {
  return new NextResponse(
    popupCloseHtml(origin, "تم. سيتم إغلاق النافذة...", { type: "audiencew:meta-connected" }, redirectPath),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

async function subscribeWhatsAppBusinessAccount(wabaId: string, accessToken: string) {
  if (!wabaId || !accessToken) return;

  const url = new URL(`https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("WhatsApp business webhook subscription failed", payload);
  }
}

async function registerWhatsAppPhoneNumber(phoneNumberId: string, accessToken: string) {
  if (!phoneNumberId || !accessToken) return;

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin: "000000"
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("WhatsApp phone number registration failed", payload);
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stateValues = verifyOAuthState(searchParams.get("state"), "meta", request.cookies.get("audiencew_meta_state")?.value);
  const requestedChannelParam = searchParams.get("channel") || "";
  const requestedChannel = stateValues?.channel || requestedChannelParam || "";
  const channel = requestedChannel === "instagram" || requestedChannel === "facebook" ? requestedChannel : "whatsapp";
  const user = await getCurrentUser();
  const wantsJson = request.headers.get("accept")?.includes("application/json");

  if (!stateValues && searchParams.has("code") && requestedChannelParam !== "whatsapp") {
    if (wantsJson) return NextResponse.json({ ok: false, error: "تعذر التحقق من طلب الربط" }, { status: 400 });
    return closePopupAndRedirect(getAppOrigin(request), "/dashboard?meta=invalid-state&view=settings");
  }

  if (!user) {
    if (wantsJson) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  }

  const settings = await getIntegrationSettings(channel, user.tenantId);
  const wabaId = searchParams.get("waba_id") || searchParams.get("whatsapp_business_account_id") || "";
  const phoneNumberId = searchParams.get("phone_number_id") || "";
  const businessId = searchParams.get("business_id") || "";
  const phoneNumber = searchParams.get("phone_number") || "";
  const code = searchParams.get("code") || "";

  if (channel === "instagram" && code) {
    // Direct Instagram login ("API setup with Instagram login") - a
    // separate token-exchange endpoint and its own App ID/secret, distinct
    // from the Facebook-based flows below. No Facebook Page involved.
    const appId = techProviderInstagramAppId;
    const appSecret = process.env.INSTAGRAM_APP_SECRET || "";
    const redirectUri = `${getAppOrigin(request)}/api/meta/callback`;

    if (appId && appSecret) {
      const tokenForm = new URLSearchParams();
      tokenForm.set("client_id", appId);
      tokenForm.set("client_secret", appSecret);
      tokenForm.set("grant_type", "authorization_code");
      tokenForm.set("redirect_uri", redirectUri);
      tokenForm.set("code", code);

      const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenForm
      });
      const tokenPayload = await tokenResponse.json().catch(() => null) as {
        access_token?: string;
        user_id?: string | number;
      } | null;
      const accessToken = tokenPayload?.access_token || "";

      if (tokenResponse.ok && accessToken) {
        const longLivedAccessToken = await exchangeInstagramLongLivedToken(accessToken, appSecret);
        const accountsUrl = new URL("https://graph.instagram.com/v22.0/me");
        accountsUrl.searchParams.set("fields", "user_id,username,name,account_type");
        accountsUrl.searchParams.set("access_token", longLivedAccessToken);
        const accountsResponse = await fetch(accountsUrl);
        const accountsPayload = await accountsResponse.json().catch(() => null) as {
          user_id?: string | number;
          username?: string;
          name?: string;
          account_type?: string;
        } | null;
        const instagramId = String(accountsPayload?.user_id || tokenPayload?.user_id || "");

        await prisma.integrationSetting.updateMany({
          where: { id: settings.id, tenantId: user.tenantId },
          data: {
            status: instagramId ? "connected" : "pending",
            businessName: accountsPayload?.account_type || settings.businessName,
            wabaName: accountsPayload?.username || accountsPayload?.name || settings.wabaName,
            wabaId: instagramId || settings.wabaId,
            accessToken: encryptSecret(longLivedAccessToken),
            updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Riyadh",
              numberingSystem: "latn",
              calendar: "gregory"
            }).format(new Date())
          }
        });
      } else {
        console.error("Instagram token exchange failed", tokenPayload);
      }
    } else {
      await prisma.integrationSetting.updateMany({
        where: { id: settings.id, tenantId: user.tenantId },
        data: {
          status: "pending",
          updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Riyadh",
            numberingSystem: "latn",
            calendar: "gregory"
          }).format(new Date())
        }
      });
    }

    const response = closePopupAndRedirect(getAppOrigin(request), "/dashboard?meta=instagram-callback&view=settings");
    response.cookies.delete("audiencew_meta_state");
    return response;
  }

  if (channel === "facebook" && code) {
    // Must match the client_id actually sent to facebook.com/dialog/oauth in
    // /api/meta/connect (Linkly's WhatsApp tech-provider app, not the
    // Instagram-only app_id that used to live in settings.appId).
    const appId = techProviderMetaAppId;
    const appSecret = process.env.WHATSAPP_META_APP_SECRET || "";
    const redirectUri = `${getAppOrigin(request)}/api/meta/callback`;

    if (appId && appSecret) {
      const tokenUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("code", code);

      const tokenResponse = await fetch(tokenUrl);
      const tokenPayload = await tokenResponse.json().catch(() => null) as {
        access_token?: string;
        error?: { message?: string };
      } | null;
      const userAccessToken = tokenPayload?.access_token || "";

      if (tokenResponse.ok && userAccessToken) {
        const pagesUrl = new URL("https://graph.facebook.com/v22.0/me/accounts");
        pagesUrl.searchParams.set("fields", "id,name,access_token");
        pagesUrl.searchParams.set("access_token", userAccessToken);
        const pagesResponse = await fetch(pagesUrl);
        const pagesPayload = await pagesResponse.json().catch(() => null) as {
          data?: Array<{ id?: string; name?: string; access_token?: string }>;
        } | null;
        const page = pagesPayload?.data?.find((item) => item.id && item.access_token);

        if (page?.id && page.access_token) {
          const subscribedUrl = new URL(`https://graph.facebook.com/v22.0/${page.id}/subscribed_apps`);
          subscribedUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks,message_deliveries,message_reads");
          subscribedUrl.searchParams.set("access_token", page.access_token);
          const subscribedResponse = await fetch(subscribedUrl, { method: "POST" });
          const subscribedPayload = await subscribedResponse.json().catch(() => null);
          if (!subscribedResponse.ok) {
            console.error("Facebook page webhook subscription failed", subscribedPayload);
          }

          await prisma.integrationSetting.updateMany({
            where: { id: settings.id, tenantId: user.tenantId },
            data: {
              status: "connected",
              businessName: "Facebook",
              wabaName: page.name || settings.wabaName,
              phoneNumber: page.name || settings.phoneNumber,
              wabaId: page.id,
              accessToken: encryptSecret(page.access_token),
              updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Riyadh",
                numberingSystem: "latn",
                calendar: "gregory"
              }).format(new Date())
            }
          });
        }
      }
    }

    const response = closePopupAndRedirect(getAppOrigin(request), "/dashboard?meta=facebook-callback&view=settings");
    response.cookies.delete("audiencew_meta_state");
    return response;
  }

  if (channel === "whatsapp" && (wabaId || phoneNumberId || businessId || code)) {
    // WhatsApp always uses Linkly's own tech-provider Meta app (see
    // techProviderMetaAppId above), which is a different Meta app from the
    // per-tenant Instagram/Facebook app — so it needs its own app secret,
    // never META_APP_SECRET/FACEBOOK_APP_SECRET (those belong to the
    // Instagram app and caused "Error validating client secret").
    const appSecret = process.env.WHATSAPP_META_APP_SECRET || "";
    const appId = techProviderMetaAppId;
    const exchangeResult = code ? await exchangeWhatsAppCodeForToken(appId, appSecret, code) : { token: settings.accessToken, error: "" };
    const accessToken = exchangeResult.token;
    const effectiveWabaId = wabaId || settings.wabaId;
    const effectivePhoneNumberId = phoneNumberId || settings.phoneNumberId;
    const phoneDetails = accessToken ? await fetchWhatsAppPhoneDetails(effectivePhoneNumberId, accessToken) : null;
    const businessDetails = accessToken ? await fetchWhatsAppBusinessDetails(effectiveWabaId, accessToken) : null;

    if (accessToken && effectiveWabaId) {
      await subscribeWhatsAppBusinessAccount(effectiveWabaId, accessToken);
    }

    if (accessToken && effectivePhoneNumberId) {
      await registerWhatsAppPhoneNumber(effectivePhoneNumberId, accessToken);
    }

    await prisma.integrationSetting.updateMany({
      where: { id: settings.id, tenantId: user.tenantId },
      data: {
        status: effectiveWabaId && effectivePhoneNumberId && accessToken ? "connected" : "pending",
        businessName: businessId || settings.businessName,
        wabaName: phoneDetails?.verified_name || businessDetails?.name || settings.wabaName,
        wabaId: effectiveWabaId,
        phoneNumberId: effectivePhoneNumberId,
        phoneNumber: phoneDetails?.display_phone_number || phoneNumber || settings.phoneNumber,
        accessToken: encryptSecret(accessToken || settings.accessToken),
        updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Riyadh",
          numberingSystem: "latn",
          calendar: "gregory"
        }).format(new Date())
      }
    });

    if (accessToken && effectiveWabaId) {
      // Pulls in any templates already approved on the WABA (including
      // Meta's built-in "hello_world" sample every account gets by default)
      // so a freshly connected tenant has a usable template immediately.
      await syncMetaTemplates(user.tenantId, effectiveWabaId, accessToken).catch(() => null);
    }

    if (wantsJson) {
      const response = NextResponse.json({
        ok: true,
        connected: Boolean(effectiveWabaId && effectivePhoneNumberId && accessToken),
        message: exchangeResult.error ? "تعذر إكمال تبادل رمز Meta" : undefined
      });
      response.cookies.delete("audiencew_meta_state");
      return response;
    }
  }

  if (wantsJson) {
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("audiencew_meta_state");
    return response;
  }

  const response = closePopupAndRedirect(getAppOrigin(request), "/dashboard?meta=callback&view=settings");
  response.cookies.delete("audiencew_meta_state");
  return response;
}
