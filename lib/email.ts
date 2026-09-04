type SendActivationEmailInput = {
  to: string;
  name: string;
  activationUrl: string;
  purpose?: "activation" | "password_reset";
};

type EmailDeliveryResult = {
  sent: boolean;
  message: string;
  activationUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function activationEmailContent(name: string, activationUrl: string, purpose: "activation" | "password_reset") {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(activationUrl);
  const isReset = purpose === "password_reset";
  const heading = isReset ? "إعادة تعيين كلمة السر" : "تحقق من بريدك الإلكتروني";
  const buttonLabel = isReset ? "إعادة تعيين كلمة السر" : "تأكيد البريد الإلكتروني";
  const description = isReset
    ? "تلقينا طلباً لإعادة تعيين كلمة السر لحسابك في Linkly. اضغط الزر أدناه لاختيار كلمة سر جديدة."
    : "مرحباً بك في Linkly! اضغط الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.";
  const expiry = isReset ? "ساعة واحدة" : "3 أيام";
  const text = `مرحباً ${name}\n\n${description}\n${activationUrl}\n\nينتهي الرابط خلال ${expiry}. إذا لم تطلب هذا الإجراء، تجاهل هذه الرسالة.`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#eaf3f1;font-family:Arial,Tahoma,sans-serif;color:#123330"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eaf3f1;padding:32px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#ffffff;border:1px solid #d8e8e5;border-radius:20px;overflow:hidden"><tr><td style="padding:48px 24px 40px;background:#e1efed;text-align:center"><table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto"><tr><td width="88" height="88" style="width:88px;height:88px;background:#178a82;border-radius:50%;text-align:center;vertical-align:middle;font-size:40px;line-height:88px;color:#ffffff;font-weight:800">&#10003;</td></tr></table></td></tr><tr><td style="padding:36px 32px 8px;text-align:center"><h1 style="margin:0 0 16px;font-size:26px;line-height:1.4;color:#123330;font-weight:800">${heading}</h1><p style="margin:0 0 28px;color:#5b7570;font-size:16px;line-height:1.9">${safeName ? `مرحباً ${safeName}،<br>` : ""}${description}</p><p style="margin:0 0 32px"><a href="${safeUrl}" style="display:inline-block;background:#178a82;color:#fff;padding:16px 40px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:800">${buttonLabel}</a></p><p style="margin:0 0 8px;color:#8ba39d;font-size:13px;line-height:1.7">إذا لم يعمل الزر، انسخ الرابط التالي:</p><p style="direction:ltr;text-align:left;word-break:break-all;background:#eaf3f1;border-radius:12px;padding:12px;color:#106b65;font-size:12px;margin:0 0 24px">${safeUrl}</p></td></tr><tr><td style="padding:0 32px 36px;text-align:center;color:#8ba39d;font-size:13px;line-height:1.7">ينتهي الرابط خلال ${expiry}.<br>إذا لم تطلب هذا الإجراء، تجاهل هذه الرسالة ولن يتغير شيء.</td></tr><tr><td style="padding:20px 32px;background:#e1efed;text-align:center;color:#5b7570;font-size:12px">Linkly — منصة إدارة محادثات العملاء</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

/**
 * Shared delivery path behind every outbound email: Resend first, falling
 * back to a configured Google Apps Script relay. Neither provider is
 * required - callers get back whether it actually sent so they can decide
 * what to do (activation falls back to a direct link; reminders just skip).
 */
async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim() || "Linkly <noreply@linklysa.io>";

  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({ from: resendFrom, to, subject, text, html })
      });
      const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
      if (response.ok && payload?.id) return true;
      console.error("Resend email failed", { status: response.status, payload });
    } catch (error) {
      console.error("Resend email request failed", error);
    }
  }

  const googleScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  const googleScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim();

  if (googleScriptUrl && googleScriptSecret) {
    try {
      const response = await fetch(googleScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: googleScriptSecret, to, subject, text, html, htmlBody: html })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && payload?.ok) return true;
      console.error("Google Script email failed", { status: response.status, payload });
    } catch (error) {
      console.error("Google Script email request failed", error);
    }
  }

  return false;
}

export async function sendActivationEmail({ to, name, activationUrl, purpose = "activation" }: SendActivationEmailInput): Promise<EmailDeliveryResult> {
  const content = activationEmailContent(name, activationUrl, purpose);
  const subject = purpose === "password_reset" ? "إعادة تعيين كلمة السر في Linkly" : "تفعيل حسابك في Linkly";

  const sent = await sendEmail({ to, subject, text: content.text, html: content.html });
  if (sent) {
    return { sent: true, message: "تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني." };
  }

  console.warn("Activation email was not sent because no working email provider is configured", { to, activationUrl });

  return {
    sent: false,
    message: "تم إنشاء الحساب، لكن تعذر إرسال البريد. استخدم رابط التفعيل المباشر.",
    activationUrl
  };
}

function trialEndingEmailContent(name: string, hoursLeft: number, billingUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(billingUrl);
  const timeLabel = hoursLeft >= 24 ? `${Math.round(hoursLeft / 24)} يوم` : `${hoursLeft} ساعة`;
  const text = `مرحباً ${name}\n\nتجربتك المجانية في Linkly تنتهي خلال ${timeLabel}. رقّي حسابك الآن حتى لا تفقد الوصول لمحادثاتك وفريقك.\n${billingUrl}`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#eaf3f1;font-family:Arial,Tahoma,sans-serif;color:#123330"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eaf3f1;padding:32px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#ffffff;border:1px solid #d8e8e5;border-radius:20px;overflow:hidden"><tr><td style="padding:48px 24px 40px;background:#e1efed;text-align:center"><table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto"><tr><td width="88" height="88" style="width:88px;height:88px;background:#178a82;border-radius:50%;text-align:center;vertical-align:middle;font-size:36px;line-height:88px;color:#ffffff;font-weight:800">&#9203;</td></tr></table></td></tr><tr><td style="padding:36px 32px 8px;text-align:center"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;color:#123330;font-weight:800">تجربتك تنتهي خلال ${timeLabel}</h1><p style="margin:0 0 28px;color:#5b7570;font-size:16px;line-height:1.9">${safeName ? `مرحباً ${safeName}،<br>` : ""}رقّي حسابك الآن حتى لا تفقد الوصول لمحادثاتك وفريقك وإعداداتك.</p><p style="margin:0 0 32px"><a href="${safeUrl}" style="display:inline-block;background:#178a82;color:#fff;padding:16px 40px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:800">الترقية الآن</a></p></td></tr><tr><td style="padding:20px 32px;background:#e1efed;text-align:center;color:#5b7570;font-size:12px">Linkly — منصة إدارة محادثات العملاء</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendTrialEndingEmail({ to, name, hoursLeft, billingUrl }: { to: string; name: string; hoursLeft: number; billingUrl: string }): Promise<boolean> {
  const content = trialEndingEmailContent(name, hoursLeft, billingUrl);
  return sendEmail({ to, subject: "تجربتك المجانية في Linkly توشك على الانتهاء", text: content.text, html: content.html });
}
