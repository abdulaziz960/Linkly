/**
 * Outbound SMS via Unifonic's REST API.
 * Endpoint and parameter names confirmed against Unifonic's published API
 * docs: POST https://el.cloud.unifonic.com/rest/SMS/messages with a JSON
 * body of AppSid / SenderID / Body / Recipient.
 */
type SendSmsInput = {
  appSid: string;
  senderId: string;
  to: string;
  text: string;
};

export async function sendUnifonicSms({ appSid, senderId, to, text }: SendSmsInput) {
  const response = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      AppSid: appSid,
      SenderID: senderId,
      Body: text,
      Recipient: to,
      responseType: "JSON"
    })
  });

  const payload = await response.json().catch(() => null) as { success?: boolean; message?: string; errorCode?: number } | null;

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `تعذر إرسال الرسالة عبر Unifonic (${response.status})`);
  }

  return payload;
}
