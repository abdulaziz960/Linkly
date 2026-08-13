import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

type EmailProvider = "gmail" | "outlook";
type OAuthOwner = { userId: string; tenantId: string };

const oauthSecret = process.env.AUTH_SECRET || "audiencew-local-dev-secret";

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

function envValue(value?: string) {
  return value?.split(/\s+/).find(Boolean)?.trim() || "";
}

function createOAuthState(provider: EmailProvider, owner: OAuthOwner) {
  const payload = Buffer.from(JSON.stringify({ provider, ...owner, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", oauthSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string | null): (OAuthOwner & { provider: EmailProvider }) | null {
  if (!state) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", oauthSecret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.userId || !parsed.tenantId || !["gmail", "outlook"].includes(parsed.provider) || Date.now() - parsed.issuedAt > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getOAuthUrl(provider: EmailProvider, owner: OAuthOwner) {
  const clientId = envValue(provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID);
  if (!clientId) return null;
  const redirectUri = `${baseUrl()}/api/email/oauth/${provider}/callback`;
  const state = createOAuthState(provider, owner);
  if (provider === "gmail") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "select_account consent", include_granted_scopes: "true", scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly", state }).toString();
    return url.toString();
  }
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "offline_access User.Read Mail.Read Mail.Send", state }).toString();
  return url.toString();
}

export async function saveOAuthConnection(provider: EmailProvider, code: string, tenantId: string) {
  const clientId = envValue(provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID);
  const clientSecret = envValue(provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("OAuth credentials are not configured");
  const redirectUri = `${baseUrl()}/api/email/oauth/${provider}/callback`;
  const tokenUrl = provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || "Token exchange failed");
  const profileUrl = provider === "gmail" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName";
  const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json();
  const emailAddress = provider === "gmail" ? profile.email : profile.mail || profile.userPrincipalName;
  if (!emailAddress) throw new Error("Could not identify the email account");
  const senderName = provider === "gmail" ? profile.name || "" : profile.displayName || "";
  await prisma.emailIntegration.upsert({
    where: { id: `email:${tenantId}` },
    update: { provider, status: "connected", senderName, emailAddress, accessToken: tokens.access_token, ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}), tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), updatedAt: new Date().toISOString() },
    create: { id: `email:${tenantId}`, provider, status: "connected", senderName, emailAddress, webhookSecret: createHmac("sha256", oauthSecret).update(`email:${tenantId}`).digest("hex"), accessToken: tokens.access_token, refreshToken: tokens.refresh_token || "", tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), updatedAt: new Date().toISOString() }
  });
  return emailAddress as string;
}

export async function sendEmailMessage(to: string, text: string, subject = "رسالة من AudienceW", tenantId = "tenant-demo") {
  const integration = await prisma.emailIntegration.findUnique({ where: { id: `email:${tenantId}` } })
    ?? await prisma.emailIntegration.findUniqueOrThrow({ where: { id: "primary-email" } });
  if (integration.provider === "gmail" && integration.accessToken) {
    const fromHeader = integration.senderName ? `${integration.senderName} <${integration.emailAddress}>` : integration.emailAddress;
    const raw = Buffer.from([`To: ${to}`, `From: ${fromHeader}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", text].join("\r\n")).toString("base64url");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${integration.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
    if (response.ok) return;
    throw new Error("تعذر الإرسال عبر Gmail. أعد ربط الحساب إذا انتهت صلاحية التفويض.");
  }
  if (integration.provider === "outlook" && integration.accessToken) {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${integration.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
    if (response.ok) return;
    throw new Error("تعذر الإرسال عبر Outlook. أعد ربط الحساب إذا انتهت صلاحية التفويض.");
  }
  const googleScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const googleScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
  if (googleScriptUrl && googleScriptSecret) {
    const response = await fetch(googleScriptUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: googleScriptSecret, to, subject, text }) });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok) return;
    throw new Error("تعذر الإرسال عبر Google Script. تحقق من نشر السكربت وصلاحيات Gmail.");
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("اربط Gmail أو Outlook، أو أضف RESEND_API_KEY لتفعيل الإرسال.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM || "AudienceW <onboarding@resend.dev>", to, subject, text }) });
  if (!response.ok) throw new Error("تعذر إرسال البريد عبر خدمة الإرسال.");
}
