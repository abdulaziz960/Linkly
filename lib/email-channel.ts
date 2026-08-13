import { prisma } from "./prisma";

type EmailProvider = "gmail" | "outlook";

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

export function getOAuthUrl(provider: EmailProvider) {
  const clientId = provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return null;
  const redirectUri = `${baseUrl()}/api/email/oauth/${provider}/callback`;
  const state = Buffer.from(JSON.stringify({ provider, issuedAt: Date.now() })).toString("base64url");
  if (provider === "gmail") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly", state }).toString();
    return url.toString();
  }
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "offline_access User.Read Mail.Read Mail.Send", state }).toString();
  return url.toString();
}

export async function saveOAuthConnection(provider: EmailProvider, code: string) {
  const clientId = provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("OAuth credentials are not configured");
  const redirectUri = `${baseUrl()}/api/email/oauth/${provider}/callback`;
  const tokenUrl = provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || "Token exchange failed");
  const profileUrl = provider === "gmail" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json();
  const emailAddress = provider === "gmail" ? profile.email : profile.mail || profile.userPrincipalName;
  if (!emailAddress) throw new Error("Could not identify the email account");
  await prisma.emailIntegration.update({ where: { id: "primary-email" }, data: { provider, status: "connected", emailAddress, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || "", tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), updatedAt: new Date().toISOString() } });
  return emailAddress as string;
}

export async function sendEmailMessage(to: string, text: string, subject = "رسالة من AudienceW") {
  const integration = await prisma.emailIntegration.findUniqueOrThrow({ where: { id: "primary-email" } });
  if (integration.provider === "gmail" && integration.accessToken) {
    const raw = Buffer.from([`To: ${to}`, `From: ${integration.emailAddress}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", text].join("\r\n")).toString("base64url");
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
    const response = await fetch(googleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: googleScriptSecret, to, subject, text })
    });
    if (response.ok) return;
    throw new Error("تعذر الإرسال عبر Google Script. تحقق من نشر السكربت وصلاحيات Gmail.");
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("اربط Gmail أو Outlook، أو أضف RESEND_API_KEY لتفعيل الإرسال.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM || "AudienceW <onboarding@resend.dev>", to, subject, text }) });
  if (!response.ok) throw new Error("تعذر إرسال البريد عبر خدمة الإرسال.");
}
