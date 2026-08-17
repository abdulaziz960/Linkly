import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const techProviderMetaAppId = "1296230909161568";

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

async function exchangeWhatsAppCodeForToken(appId: string, appSecret: string, code: string, redirectUri: string) {
  if (!appId || !appSecret || !code) return "";

  const url = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.access_token) {
    console.error("WhatsApp embedded signup token exchange failed", payload);
    return "";
  }

  return payload.access_token;
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
  const fallbackUrl = `${origin}${redirectPath}`;
  return new NextResponse(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الربط</title></head><body><p>تم. سيتم إغلاق النافذة...</p><script>if(window.opener){window.opener.postMessage({type:"audiencew:meta-connected"},${JSON.stringify(origin)});window.close();}else{window.location.href=${JSON.stringify(fallbackUrl)};}</script></body></html>`,
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
  const requestedChannel = searchParams.get("state") || searchParams.get("channel") || "";
  const channel = requestedChannel === "instagram" || requestedChannel === "facebook" ? requestedChannel : "whatsapp";
  const user = await getCurrentUser();
  const settings = await getIntegrationSettings(channel, user?.tenantId);
  const wabaId = searchParams.get("waba_id") || searchParams.get("whatsapp_business_account_id") || "";
  const phoneNumberId = searchParams.get("phone_number_id") || "";
  const businessId = searchParams.get("business_id") || "";
  const phoneNumber = searchParams.get("phone_number") || "";
  const code = searchParams.get("code") || "";
  const wantsJson = request.headers.get("accept")?.includes("application/json");

  if (channel === "instagram" && code) {
    const appId = settings.appId.trim() || process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "";
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "";
    const redirectUri = `${request.nextUrl.origin}/api/meta/callback`;

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

        await prisma.integrationSetting.update({
          where: { id: settings.id },
          data: {
            status: instagramId ? "connected" : "pending",
            businessName: accountsPayload?.account_type || settings.businessName,
            wabaName: accountsPayload?.username || accountsPayload?.name || settings.wabaName,
            wabaId: instagramId || settings.wabaId,
            accessToken: longLivedAccessToken,
            updatedAt: new Intl.DateTimeFormat("ar-SA", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Riyadh"
            }).format(new Date())
          }
        });
      }
    } else {
      await prisma.integrationSetting.update({
        where: { id: settings.id },
        data: {
          status: "pending",
          updatedAt: new Intl.DateTimeFormat("ar-SA", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Riyadh"
          }).format(new Date())
        }
      });
    }

    return closePopupAndRedirect(request.nextUrl.origin, "/dashboard?meta=instagram-callback&view=settings");
  }

  if (channel === "facebook" && code) {
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "";
    const redirectUri = `${request.nextUrl.origin}/api/meta/callback`;

    if (settings.appId && appSecret) {
      const tokenUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", settings.appId);
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

          await prisma.integrationSetting.update({
            where: { id: settings.id },
            data: {
              status: "connected",
              businessName: "Facebook",
              wabaName: page.name || settings.wabaName,
              phoneNumber: page.name || settings.phoneNumber,
              wabaId: page.id,
              accessToken: page.access_token,
              updatedAt: new Intl.DateTimeFormat("ar-SA", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Riyadh"
              }).format(new Date())
            }
          });
        }
      }
    }

    return closePopupAndRedirect(request.nextUrl.origin, "/dashboard?meta=facebook-callback&view=settings");
  }

  if (channel === "whatsapp" && (wabaId || phoneNumberId || businessId || code)) {
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "";
    const appId = techProviderMetaAppId;
    const redirectUri = `${request.nextUrl.origin}/api/meta/callback`;
    const accessToken = code ? await exchangeWhatsAppCodeForToken(appId, appSecret, code, redirectUri) : settings.accessToken;
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

    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: {
        status: effectiveWabaId && effectivePhoneNumberId && accessToken ? "connected" : "pending",
        businessName: businessId || settings.businessName,
        wabaName: phoneDetails?.verified_name || businessDetails?.name || settings.wabaName,
        wabaId: effectiveWabaId,
        phoneNumberId: effectivePhoneNumberId,
        phoneNumber: phoneDetails?.display_phone_number || phoneNumber || settings.phoneNumber,
        accessToken: accessToken || settings.accessToken,
        updatedAt: new Intl.DateTimeFormat("ar-SA", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Riyadh"
        }).format(new Date())
      }
    });

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        connected: Boolean(effectiveWabaId && effectivePhoneNumberId && accessToken)
      });
    }
  }

  if (wantsJson) {
    return NextResponse.json({ ok: true });
  }

  return closePopupAndRedirect(request.nextUrl.origin, "/dashboard?meta=callback&view=settings");
}
