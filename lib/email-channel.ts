import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { storeIncomingEmail } from "./email-inbox";
import { decryptSecret, encryptSecret } from "./secret-storage";
import type { EmailIntegration } from "@prisma/client";

type EmailProvider = "gmail" | "outlook";
type OAuthOwner = { userId: string; tenantId: string };

function oauthSigningSecret() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.OAUTH_STATE_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET or OAUTH_STATE_SECRET must be configured in production");
  }
  return secret || "audiencew-local-dev-secret";
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

function envValue(value?: string) {
  return value?.split(/\s+/).find(Boolean)?.trim() || "";
}

function createOAuthState(provider: EmailProvider, owner: OAuthOwner) {
  const payload = Buffer.from(JSON.stringify({ provider, ...owner, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", oauthSigningSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string | null): (OAuthOwner & { provider: EmailProvider }) | null {
  if (!state) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", oauthSigningSecret()).update(payload).digest("base64url");
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
    update: { provider, status: "connected", senderName, emailAddress, accessToken: encryptSecret(tokens.access_token), ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}), tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), updatedAt: new Date().toISOString() },
    create: { id: `email:${tenantId}`, provider, status: "connected", senderName, emailAddress, webhookSecret: encryptSecret(randomUUID()), accessToken: encryptSecret(tokens.access_token), refreshToken: encryptSecret(tokens.refresh_token || ""), tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), updatedAt: new Date().toISOString() }
  });
  return emailAddress as string;
}

async function refreshAccessToken(integration: EmailIntegration): Promise<string> {
  const clientId = envValue(integration.provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID);
  const clientSecret = envValue(integration.provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET);
  const accessToken = decryptSecret(integration.accessToken);
  const refreshToken = decryptSecret(integration.refreshToken);
  if (!clientId || !clientSecret || !refreshToken) return accessToken;
  const tokenUrl = integration.provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) return accessToken;
  const tokenExpiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  await prisma.emailIntegration.update({
    where: { id: integration.id },
    data: { accessToken: encryptSecret(tokens.access_token), tokenExpiresAt, ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}), updatedAt: new Date().toISOString() }
  });
  return tokens.access_token as string;
}

async function getValidAccessToken(integration: EmailIntegration): Promise<string> {
  const expiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return decryptSecret(integration.accessToken);
  return refreshAccessToken(integration);
}

function encodeHeaderWord(value: string) {
  if (!value || /^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export async function sendEmailMessage(to: string, text: string, subject = "رسالة من AudienceW", tenantId = "tenant-demo") {
  const integration = await prisma.emailIntegration.findUnique({ where: { id: `email:${tenantId}` } })
    ?? await prisma.emailIntegration.findUnique({ where: { id: "primary-email" } });
  if (integration?.provider === "gmail" && integration.accessToken) {
    const accessToken = await getValidAccessToken(integration);
    const fromHeader = integration.senderName ? `${encodeHeaderWord(integration.senderName)} <${integration.emailAddress}>` : integration.emailAddress;
    const raw = Buffer.from([`To: ${to}`, `From: ${fromHeader}`, `Subject: ${encodeHeaderWord(subject)}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", text].join("\r\n")).toString("base64url");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
    if (response.ok) return;
    throw new Error("تعذر الإرسال عبر Gmail. أعد ربط الحساب إذا انتهت صلاحية التفويض.");
  }
  if (integration?.provider === "outlook" && integration.accessToken) {
    const accessToken = await getValidAccessToken(integration);
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
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
  throw new Error("اربط Gmail أو Outlook لتفعيل إرسال البريد.");
}

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

const automatedLocalParts = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "security",
  "billing",
  "updates",
  "update",
  "newsletter",
  "newsletters",
  "marketing",
  "mailer-daemon",
  "postmaster"
];

function isAutomatedSender(headers: Array<{ name: string; value: string }>): boolean {
  const get = (name: string) => headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

  if (get("List-Unsubscribe") || get("List-Id")) return true;
  if (/\bbulk\b/i.test(get("Precedence"))) return true;

  const from = get("From").toLowerCase();
  const emailMatch = from.match(/<([^>]+)>/);
  const address = (emailMatch?.[1] || from).trim();
  const localPart = address.split("@")[0] || "";
  return automatedLocalParts.some((marker) => localPart === marker || localPart.startsWith(`${marker}-`) || localPart.startsWith(`${marker}.`));
}

function extractPlainText(payload?: GmailMessagePart): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

/**
 * Gmail has no inbound webhook here, so incoming mail is pulled on demand:
 * fetch messages newer than the last sync and hand each to storeIncomingEmail
 * (idempotent by Gmail message id, so calling this repeatedly is safe).
 */
export async function syncGmailInbox(tenantId = "tenant-demo"): Promise<{ synced: number }> {
  const integration = await prisma.emailIntegration.findUnique({ where: { id: `email:${tenantId}` } });
  if (!integration || integration.provider !== "gmail" || !integration.accessToken) return { synced: 0 };

  const accessToken = await getValidAccessToken(integration);
  const afterSeconds = integration.lastSyncedAt
    ? Math.floor(new Date(integration.lastSyncedAt).getTime() / 1000) - 60
    : Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.search = new URLSearchParams({ q: `in:inbox after:${afterSeconds}`, maxResults: "25" }).toString();
  const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listResponse.ok) {
    if (listResponse.status === 401) throw new Error("تعذر جلب الرسائل. أعد ربط حساب Gmail لأن التفويض انتهى.");
    throw new Error("تعذر جلب الرسائل من Gmail.");
  }
  const listData = await listResponse.json();
  const ids: string[] = Array.isArray(listData.messages) ? listData.messages.map((message: { id: string }) => message.id) : [];

  let synced = 0;
  for (const id of ids) {
    const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!messageResponse.ok) continue;
    const message = await messageResponse.json();
    const headers: Array<{ name: string; value: string }> = message.payload?.headers || [];
    const from = headers.find((header) => header.name === "From")?.value || "";
    if (!from) continue;
    if (isAutomatedSender(headers)) continue;
    const subject = headers.find((header) => header.name === "Subject")?.value || "";
    const text = extractPlainText(message.payload) || message.snippet || "";
    await storeIncomingEmail({
      from,
      subject,
      text,
      messageId: message.id,
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : undefined,
      tenantId
    });
    synced += 1;
  }

  await prisma.emailIntegration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date().toISOString() } });
  return { synced };
}
