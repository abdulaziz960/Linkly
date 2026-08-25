import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings, getTenantIntegrationId } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret, integrationSecretFields, maskIntegrationSecrets, SECRET_MASK } from "../../../../lib/secret-storage";

const allowedFields = [
  "provider",
  "businessName",
  "wabaName",
  "phoneNumber",
  "phoneNumberId",
  "wabaId",
  "appId",
  "configId",
  "verifyToken",
  "accessToken",
  "xConsumerKey",
  "xConsumerSecret",
  "xBearerToken",
  "xAccessToken",
  "xAccessTokenSecret",
  "googleAccountId",
  "googleLocationId",
  "googleRefreshToken",
  "webhookUrl"
] as const;

type IntegrationChannel = "whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "tiktok" | "sms" | "leads";
type IntegrationField = (typeof allowedFields)[number];
type ConnectionCheck = {
  status: string;
  message: string;
  missingFields: string[];
  verifiedName?: string;
  displayPhoneNumber?: string;
};
const secretFieldSet = new Set<string>(integrationSecretFields);

function serializeSettings<T extends Record<string, unknown>>(settings: T, channel: IntegrationChannel) {
  const masked = maskIntegrationSecrets(settings);
  if (channel === "website" && typeof settings.verifyToken === "string") (masked as Record<string, unknown>).verifyToken = settings.verifyToken;
  return masked;
}

const whatsappRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "phoneNumberId", label: "Phone Number ID" },
  { field: "wabaId", label: "WABA ID" },
  { field: "accessToken", label: "Access Token" },
  { field: "verifyToken", label: "Verify Token" },
  { field: "webhookUrl", label: "رابط الويبهوك" }
];

const instagramRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "wabaId", label: "Instagram Account ID" },
  { field: "accessToken", label: "Access Token" },
  { field: "verifyToken", label: "Verify Token" },
  { field: "webhookUrl", label: "رابط الويبهوك" }
];

const facebookRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "appId", label: "App ID" },
  { field: "wabaId", label: "Facebook Page ID" },
  { field: "accessToken", label: "Page Access Token" },
  { field: "verifyToken", label: "Verify Token" },
  { field: "webhookUrl", label: "رابط الويبهوك" }
];

const telegramRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "accessToken", label: "Bot Token" },
  { field: "webhookUrl", label: "رابط الويبهوك" }
];

const xRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "appId", label: "Client ID" },
  { field: "configId", label: "Client Secret" },
  { field: "xConsumerSecret", label: "Consumer Secret" },
  { field: "verifyToken", label: "Webhook Secret" },
  { field: "webhookUrl", label: "رابط الويبهوك" }
];

const googleMapsRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "appId", label: "Google Client ID" },
  { field: "configId", label: "Google Client Secret" },
  { field: "accessToken", label: "Access Token" },
  { field: "googleRefreshToken", label: "Refresh Token" },
  { field: "googleAccountId", label: "Google Account" },
  { field: "googleLocationId", label: "Google Location" }
];

const emailRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "businessName", label: "اسم المرسل" },
  { field: "phoneNumber", label: "بريد الإرسال" },
  { field: "verifyToken", label: "Secret Token" },
  { field: "webhookUrl", label: "رابط الويبهوك" }
];

const tiktokRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "appId", label: "App Key" },
  { field: "configId", label: "App Secret" },
  { field: "accessToken", label: "Access Token" }
];

const smsRequiredConnectionFields: Array<{ field: IntegrationField; label: string }> = [
  { field: "appId", label: "AppSid" },
  { field: "phoneNumber", label: "اسم/رقم المرسل (Sender ID)" }
];

function getIntegrationChannel(request: NextRequest): IntegrationChannel {
  const channel = request.nextUrl.searchParams.get("channel");
  if (channel === "instagram" || channel === "facebook" || channel === "telegram" || channel === "x" || channel === "google_maps" || channel === "email" || channel === "website" || channel === "tiktok" || channel === "sms" || channel === "leads") return channel;
  return "whatsapp";
}

function getIntegrationId(channel: IntegrationChannel, tenantId?: string) {
  return getTenantIntegrationId(channel, tenantId);
}

function getMissingConnectionFields(settings: Partial<Record<IntegrationField, string>>, channel: IntegrationChannel) {
  const requiredConnectionFields = channel === "instagram"
    ? instagramRequiredConnectionFields
    : channel === "facebook"
      ? facebookRequiredConnectionFields
    : channel === "telegram"
      ? telegramRequiredConnectionFields
      : channel === "x"
        ? xRequiredConnectionFields
        : channel === "google_maps"
          ? googleMapsRequiredConnectionFields
        : channel === "email"
          ? emailRequiredConnectionFields
        : channel === "tiktok"
          ? tiktokRequiredConnectionFields
        : channel === "sms"
          ? smsRequiredConnectionFields
        : whatsappRequiredConnectionFields;

  return requiredConnectionFields
    .filter(({ field }) => !settings[field]?.trim())
    .map(({ label }) => label);
}

async function verifyGoogleMapsConnection(
  settings: Partial<Record<IntegrationField, string>>
): Promise<ConnectionCheck> {
  const hasAppCredentials = Boolean(settings.appId?.trim() && settings.configId?.trim());
  const hasGoogleToken = Boolean(settings.accessToken?.trim() || settings.googleRefreshToken?.trim());
  const hasOAuthConnection = Boolean(
    settings.accessToken?.trim() &&
    settings.googleRefreshToken?.trim() &&
    settings.googleAccountId?.trim() &&
    settings.googleLocationId?.trim()
  );

  if (!hasAppCredentials) {
    return {
      status: "pending",
      message: "غير مكتمل: احفظ Google Client ID و Client Secret أولاً",
      missingFields: ["Google Client ID", "Google Client Secret"]
    };
  }

  if (hasGoogleToken && (!settings.googleAccountId?.trim() || !settings.googleLocationId?.trim())) {
    const reason = settings.phoneNumber?.trim();
    return {
      status: "pending",
      message: reason
        ? `تمت مصادقة Google، لكن تعذر قراءة حساب النشاط أو الموقع: ${reason}`
        : "تمت مصادقة Google، لكن تعذر قراءة حساب النشاط أو الموقع. تأكد أن المشروع حاصل على وصول Google Business Profile API وأن الحساب يملك موقعاً تجارياً.",
      missingFields: ["Google Business Profile access"]
    };
  }

  if (!hasOAuthConnection) {
    return {
      status: "pending",
      message: "تم حفظ بيانات تطبيق Google. اضغط ربط Google لإكمال المصادقة واختيار الموقع.",
      missingFields: ["ربط Google"]
    };
  }

  return {
    status: "connected",
    message: "متصل: تم حفظ حساب خرائط Google والموقع بنجاح",
    missingFields: [],
    verifiedName: settings.wabaName || settings.businessName || "خرائط Google",
    displayPhoneNumber: settings.googleLocationId
  };
}

function getAbsoluteWebhookUrl(request: NextRequest, webhookUrl?: string) {
  const value = webhookUrl?.trim() || "";
  if (value.startsWith("http")) return value;
  return new URL(value || "/api/telegram/webhook", request.nextUrl.origin).toString();
}

async function verifyXConnection(
  settings: Partial<Record<IntegrationField, string>>
): Promise<ConnectionCheck> {
  const missingFields = getMissingConnectionFields(settings, "x");

  if (missingFields.length) {
    return {
      status: "pending",
      message: `غير مكتمل: أكمل ${missingFields.join("، ")}`,
      missingFields
    };
  }

  const accessToken = settings.accessToken?.trim();
  if (!accessToken) {
    return {
      status: "pending",
      message: "تم حفظ تطبيق X. اضغط ربط X لإكمال المصادقة بحسابك.",
      missingFields: []
    };
  }

  try {
    const response = await fetch("https://api.x.com/2/users/me?user.fields=username,name", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const result = await response.json().catch(() => null) as { data?: { id?: string; username?: string; name?: string } } | null;

    if (!response.ok || !result?.data?.id) {
      return {
        status: "pending",
        message: "انتهت صلاحية ربط X أو تم إلغاؤه. اضغط ربط X لإعادة المصادقة.",
        missingFields: []
      };
    }

    return {
      status: "connected",
      message: "متصل: تم التحقق من حساب X بنجاح",
      missingFields: [],
      verifiedName: result.data.username ? `@${result.data.username}` : result.data.name || settings.wabaName || "X",
      displayPhoneNumber: result.data.id
    };
  } catch {
    return {
      status: "pending",
      message: "تعذر الوصول إلى X للتحقق من الربط",
      missingFields: []
    };
  }
}

async function verifyEmailConnection(
  settings: Partial<Record<IntegrationField, string>>
): Promise<ConnectionCheck> {
  const missingFields = getMissingConnectionFields(settings, "email");

  if (missingFields.length) {
    return {
      status: "pending",
      message: `غير مكتمل: أكمل ${missingFields.join("، ")}`,
      missingFields
    };
  }

  return {
    status: "connected",
    message: "متصل: تم حفظ ربط البريد الإلكتروني بنجاح",
    missingFields: [],
    verifiedName: settings.businessName || "البريد الإلكتروني",
    displayPhoneNumber: settings.phoneNumber
  };
}

async function verifyTikTokConnection(
  settings: Partial<Record<IntegrationField, string>>
): Promise<ConnectionCheck> {
  const missingFields = getMissingConnectionFields(settings, "tiktok");

  if (missingFields.length) {
    return {
      status: "pending",
      message: `غير مكتمل: أكمل ${missingFields.join("، ")}`,
      missingFields
    };
  }

  // TikTok's Business Messaging API requires approved Messaging Partner
  // access before any live call can be verified here - see lib/tiktok-inbox.ts.
  return {
    status: "pending",
    message: "تم حفظ بيانات TikTok. الإرسال والاستقبال الفعلي بينتظر تفعيل صلاحية Business Messaging من TikTok.",
    missingFields: [],
    verifiedName: settings.businessName || "TikTok"
  };
}

async function verifySmsConnection(
  settings: Partial<Record<IntegrationField, string>>
): Promise<ConnectionCheck> {
  const missingFields = getMissingConnectionFields(settings, "sms");

  if (missingFields.length) {
    return {
      status: "pending",
      message: `غير مكتمل: أكمل ${missingFields.join("، ")}`,
      missingFields
    };
  }

  return {
    status: "connected",
    message: "متصل: تم حفظ بيانات Unifonic بنجاح",
    missingFields: [],
    verifiedName: settings.phoneNumber || "Unifonic SMS"
  };
}

async function verifyTelegramConnection(
  request: NextRequest,
  settings: Partial<Record<IntegrationField, string>>
): Promise<ConnectionCheck> {
  const missingFields = getMissingConnectionFields(settings, "telegram");

  if (missingFields.length) {
    return {
      status: "pending",
      message: `غير مكتمل: أكمل ${missingFields.join("، ")}`,
      missingFields
    };
  }

  const token = settings.accessToken?.trim();
  const webhookUrl = getAbsoluteWebhookUrl(request, settings.webhookUrl);
  const secretToken = settings.verifyToken?.trim();

  try {
    const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const me = await meResponse.json().catch(() => null) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string; id?: number };
      description?: string;
    } | null;

    if (!meResponse.ok || !me?.ok) {
      return {
        status: "pending",
        message: me?.description || "غير مكتمل: تعذر التحقق من Bot Token",
        missingFields: []
      };
    }

    const setWebhookResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        ...(secretToken ? { secret_token: secretToken } : {})
      })
    });
    const webhookResult = await setWebhookResponse.json().catch(() => null) as { ok?: boolean; description?: string } | null;

    if (!setWebhookResponse.ok || !webhookResult?.ok) {
      return {
        status: "pending",
        message: webhookResult?.description || "غير مكتمل: تعذر تفعيل Webhook في Telegram",
        missingFields: []
      };
    }

    return {
      status: "connected",
      message: "متصل: تم التحقق من بوت Telegram وتفعيل الويبهوك",
      missingFields: [],
      verifiedName: me.result?.username || me.result?.first_name,
      displayPhoneNumber: me.result?.id ? String(me.result.id) : undefined
    };
  } catch {
    return {
      status: "pending",
      message: "غير مكتمل: تعذر الوصول إلى Telegram للتحقق من الربط",
      missingFields: []
    };
  }
}

async function verifyMetaConnection(settings: Partial<Record<IntegrationField, string>>, channel: IntegrationChannel): Promise<ConnectionCheck> {
  const missingFields = getMissingConnectionFields(settings, channel);

  if (missingFields.length) {
    return {
      status: "pending",
      message: `غير مكتمل: أكمل ${missingFields.join("، ")}`,
      missingFields
    };
  }

  const metaObjectId = channel === "instagram" || channel === "facebook" ? settings.wabaId : settings.phoneNumberId;
  const graphHost = channel === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const url = new URL(`${graphHost}/v22.0/${metaObjectId}`);
  url.searchParams.set("fields", channel === "instagram" ? "id,username,name" : channel === "facebook" ? "id,name" : "id,display_phone_number,verified_name");

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`
      }
    });
    const result = await response.json().catch(() => null) as {
      display_phone_number?: string;
      verified_name?: string;
      username?: string;
      name?: string;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      return {
        status: "pending",
        message: result?.error?.message || "غير مكتمل: تعذر التحقق من بيانات Meta",
        missingFields: []
      };
    }

    return {
      status: "connected",
      message: channel === "instagram"
        ? "متصل: تم التحقق من حساب Instagram بنجاح"
        : channel === "facebook"
          ? "متصل: تم التحقق من صفحة Facebook بنجاح"
          : "متصل: تم التحقق من بيانات Meta بنجاح",
      missingFields: [],
      verifiedName: channel === "instagram" || channel === "facebook" ? result?.username || result?.name : result?.verified_name,
      displayPhoneNumber: result?.display_phone_number
    };
  } catch {
    return {
      status: "pending",
      message: "غير مكتمل: تعذر الوصول إلى Meta للتحقق من الربط",
      missingFields: []
    };
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const channel = getIntegrationChannel(request);
  if (!(await userHasViewPermission(user, channel === "leads" ? "leads" : "settings"))) {
    return NextResponse.json({ message: "لا تملك صلاحية الوصول لهذه الميزة" }, { status: 403 });
  }

  const settings = await getIntegrationSettings(channel, user.tenantId);
  return NextResponse.json(serializeSettings(settings, channel));
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  if (!(await userHasViewPermission(user, getIntegrationChannel(request) === "leads" ? "leads" : "settings"))) {
    return NextResponse.json({ message: "لا تملك صلاحية الوصول لهذه الميزة" }, { status: 403 });
  }

  const channel = getIntegrationChannel(request);
  const existingSettings = await getIntegrationSettings(channel, user.tenantId);
  const body = await request.json();
  const allowBlankOverwrite = body.reset === true || body.allowBlankOverwrite === true;
  const data: Partial<Record<IntegrationField, string>> = {};

  for (const field of allowedFields) {
    if (typeof body[field] !== "string") continue;

    const value = body[field].trim();
    const previousValue = existingSettings[field];

    const shouldProtect = secretFieldSet.has(field) && !(channel === "website" && field === "verifyToken");
    if (shouldProtect && value === SECRET_MASK) continue;

    if (!allowBlankOverwrite && value === "" && previousValue.trim() !== "") {
      continue;
    }

    data[field] = shouldProtect && value ? encryptSecret(value) : value;
  }

  const verificationData = Object.fromEntries(
    Object.entries(data).map(([field, value]) => [field, secretFieldSet.has(field) ? (value ? body[field].trim() : value) : value])
  ) as Partial<Record<IntegrationField, string>>;

  if (body.reset !== true && (channel === "telegram" || channel === "x") && user.tenantId && user.tenantId !== "tenant-demo") {
    data.webhookUrl = `/api/${channel}/webhook?tenant=${user.tenantId}`;
  }

  const connectionCheck: ConnectionCheck = body.reset === true
    ? { status: "pending", message: "غير مكتمل: لم يتم حفظ بيانات الربط بعد", missingFields: [] as string[] }
    : channel === "telegram"
      ? await verifyTelegramConnection(request, { ...existingSettings, ...verificationData })
      : channel === "x"
        ? await verifyXConnection({ ...existingSettings, ...verificationData })
      : channel === "google_maps"
          ? await verifyGoogleMapsConnection({ ...existingSettings, ...verificationData })
      : channel === "email"
          ? await verifyEmailConnection({ ...existingSettings, ...verificationData })
      : channel === "tiktok"
          ? await verifyTikTokConnection({ ...existingSettings, ...verificationData })
      : channel === "sms"
          ? await verifySmsConnection({ ...existingSettings, ...verificationData })
      : await verifyMetaConnection({ ...existingSettings, ...verificationData }, channel);
  const settings = await prisma.integrationSetting.update({
    where: { id: getIntegrationId(channel, user.tenantId) },
    data: {
      ...data,
      provider: channel === "instagram" ? "instagram" : channel === "facebook" ? "facebook" : channel === "telegram" ? "telegram" : channel === "x" ? "x" : channel === "google_maps" ? "google_maps" : channel === "email" ? "email" : channel === "tiktok" ? "tiktok" : channel === "sms" ? "unifonic" : data.provider,
      status: connectionCheck.status,
      updatedAt: new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Riyadh",
        numberingSystem: "latn",
        calendar: "gregory"
      }).format(new Date())
    }
  });

  if (
    !body.reset &&
    (settings.status !== connectionCheck.status ||
      (connectionCheck.status === "connected" &&
      ((connectionCheck.verifiedName && connectionCheck.verifiedName !== settings.wabaName) ||
        (connectionCheck.displayPhoneNumber && connectionCheck.displayPhoneNumber !== settings.phoneNumber))))
  ) {
    const refreshedSettings = await prisma.integrationSetting.update({
      where: { id: getIntegrationId(channel, user.tenantId) },
      data: {
        status: connectionCheck.status,
        wabaName: connectionCheck.verifiedName || settings.wabaName,
        phoneNumber: connectionCheck.displayPhoneNumber || settings.phoneNumber
      }
    });

    return NextResponse.json(serializeSettings({
      ...refreshedSettings,
      provider: refreshedSettings.provider,
      status: refreshedSettings.status,
      connectionMessage: connectionCheck.message,
      missingFields: connectionCheck.missingFields
    }, channel));
  }

  return NextResponse.json(serializeSettings({
    ...settings,
    provider: settings.provider,
    status: settings.status,
    connectionMessage: connectionCheck.message,
    missingFields: connectionCheck.missingFields
  }, channel));
}
