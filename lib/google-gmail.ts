import { storeEmailMessage } from "@/lib/email-inbox";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

export const gmailScopes = [
  "openid",
  "email",
  "profile",
  GMAIL_SCOPE,
  "https://www.googleapis.com/auth/gmail.send",
];

function decodeBase64Url(value = "") {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function header(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function findBody(part?: GmailPart, mimeType = "text/plain"): string {
  if (!part) return "";
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts || []) {
    const value = findBody(child, mimeType);
    if (value) return value;
  }
  return "";
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddress(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  return {
    name: (match?.[1] || "").replace(/^["']|["']$/g, "").trim(),
    email: (match?.[2] || value).trim().toLowerCase(),
  };
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Gmail OAuth is not configured");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "تعذر تحديث اتصال Gmail");
  return data.access_token as string;
}

export async function sendGmailMessage(input: {
  refreshToken: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string;
}) {
  const token = await refreshGmailAccessToken(input.refreshToken);
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`);
  }
  lines.push("", input.text);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeBase64Url(lines.join("\r\n")), threadId: input.threadId || undefined }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "تعذر إرسال الرسالة عبر Gmail");
  return data as { id: string; threadId?: string };
}

export async function syncGmailInbox(input: {
  tenantId: string;
  refreshToken: string;
  accountEmail: string;
  maxResults?: number;
}) {
  const token = await refreshGmailAccessToken(input.refreshToken);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", "in:inbox newer_than:30d");
  listUrl.searchParams.set("maxResults", String(input.maxResults || 50));
  const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const listData = await listResponse.json();
  if (!listResponse.ok) throw new Error(listData.error?.message || "تعذرت مزامنة Gmail");

  let imported = 0;
  for (const item of listData.messages || []) {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) continue;
    const message = await response.json();
    const headers = message.payload?.headers as GmailHeader[] | undefined;
    const from = parseAddress(header(headers, "From"));
    if (!from.email || from.email === input.accountEmail.toLowerCase()) continue;
    const html = findBody(message.payload, "text/html");
    const text = findBody(message.payload, "text/plain") || stripHtml(html) || message.snippet || "";
    await storeEmailMessage({
      tenantId: input.tenantId,
      from: from.email,
      fromName: from.name,
      subject: header(headers, "Subject") || "بدون عنوان",
      text,
      html,
      messageId: message.id,
      threadId: message.threadId,
      internetMessageId: header(headers, "Message-ID"),
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined,
    });
    imported += 1;
  }
  return { imported, total: (listData.messages || []).length };
}
