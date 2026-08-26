const GRAPH_VERSION = "v22.0";
// The WhatsApp OAuth flow (app/api/meta/connect|callback/route.ts) always
// issues access tokens scoped to Linkly's own tech-provider Meta app, never
// a per-tenant settings.appId (that field belongs to the Instagram/Facebook
// connect flow) - the resumable upload session must be created against that
// same app or Meta rejects the follow-up upload with "Unsupported post
// request... does not exist" since the token isn't valid for a foreign app.
const techProviderMetaAppId = "1296230909161568";

type MetaError = { message?: string; code?: number; error_subcode?: number };

function formatMetaError(error: MetaError | undefined, fallback: string) {
  if (!error?.message) return fallback;
  const codePart = error.code !== undefined ? ` (code ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ""})` : "";
  return `${error.message}${codePart}`;
}

export type MetaMediaUploadResult = { ok: true; handle: string } | { ok: false; error: string };

// Uploads a data: URL (image/video/document) through Meta's resumable Upload
// API and returns the resulting media handle - used both for the WhatsApp
// business profile photo and for message-template header media examples.
export async function uploadMetaMedia(accessToken: string, dataUrl: string): Promise<MetaMediaUploadResult> {
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return { ok: false, error: "صيغة الملف غير صالحة" };

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  const sessionResponse = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${techProviderMetaAppId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(accessToken)}`,
    { method: "POST" }
  );
  const sessionPayload = await sessionResponse.json().catch(() => null);
  if (!sessionResponse.ok || !sessionPayload?.id) {
    return { ok: false, error: formatMetaError(sessionPayload?.error, "تعذر بدء رفع الملف") };
  }

  const uploadResponse = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${sessionPayload.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0"
    },
    body: buffer
  });
  const uploadPayload = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploadPayload?.h) {
    return { ok: false, error: formatMetaError(uploadPayload?.error, "تعذر رفع الملف إلى Meta") };
  }

  return { ok: true, handle: uploadPayload.h };
}
