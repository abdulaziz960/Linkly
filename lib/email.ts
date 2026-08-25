type SendActivationEmailInput = {
  to: string;
  name: string;
  activationUrl: string;
};

type EmailDeliveryResult = {
  sent: boolean;
  message: string;
  activationUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function activationEmailContent(name: string, activationUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(activationUrl);
  const text = `مرحباً ${name}\n\nتم إنشاء حسابك في منصة Linkly. افتح الرابط التالي لتفعيل الحساب واختيار كلمة السر:\n${activationUrl}\n\nينتهي رابط التفعيل خلال 3 أيام.`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#eaf3f1;font-family:Arial,Tahoma,sans-serif;color:#123330"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eaf3f1;padding:32px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;background:#f6fbfa;border:1px solid #bcd8d3;border-radius:28px;overflow:hidden"><tr><td style="padding:28px 36px;background:#123330;color:#fff;text-align:center"><div style="font-size:28px;font-weight:800;letter-spacing:.2px">Linkly</div><div style="margin-top:6px;color:#a9d6d1;font-size:14px">كل محادثات عملائك في مكان واحد</div></td></tr><tr><td style="padding:42px 38px;text-align:right"><div style="display:inline-block;background:#e1efed;color:#178a82;border-radius:999px;padding:8px 14px;font-size:14px;font-weight:700">تفعيل مساحة العمل</div><h1 style="margin:22px 0 12px;font-size:30px;line-height:1.45;color:#123330">مرحباً ${safeName}</h1><p style="margin:0 0 24px;color:#5b7570;font-size:17px;line-height:1.9">أصبحت مساحة عملك في Linkly جاهزة. اضغط الزر التالي لإنشاء كلمة السر والبدء بإعداد قنوات التواصل.</p><p style="margin:30px 0;text-align:center"><a href="${safeUrl}" style="display:inline-block;background:#178a82;color:#fff;padding:15px 30px;border-radius:14px;text-decoration:none;font-size:17px;font-weight:800">تفعيل الحساب الآن</a></p><p style="margin:26px 0 8px;color:#5b7570;font-size:13px;line-height:1.7">إذا لم يعمل الزر، انسخ الرابط التالي:</p><p style="direction:ltr;text-align:left;word-break:break-all;background:#eaf3f1;border-radius:12px;padding:12px;color:#106b65;font-size:12px">${safeUrl}</p><p style="margin:24px 0 0;color:#5b7570;font-size:12px">ينتهي رابط التفعيل خلال 3 أيام. إذا لم تطلب هذا الحساب يمكنك تجاهل الرسالة.</p></td></tr><tr><td style="padding:20px 36px;background:#e1efed;text-align:center;color:#5b7570;font-size:12px">Linkly — منصة إدارة محادثات العملاء</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendActivationEmail({ to, name, activationUrl }: SendActivationEmailInput): Promise<EmailDeliveryResult> {
  const content = activationEmailContent(name, activationUrl);
  const googleScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  const googleScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim();

  if (googleScriptUrl && googleScriptSecret) {
    try {
      const response = await fetch(googleScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: googleScriptSecret,
          to,
          subject: "تفعيل حسابك في Linkly",
          text: content.text,
          html: content.html,
          htmlBody: content.html
        })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && payload?.ok) {
        return { sent: true, message: "تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني." };
      }
      console.error("Google Script activation email failed", { status: response.status, payload });
    } catch (error) {
      console.error("Google Script activation email request failed", error);
    }
  }

  console.warn("Activation email was not sent because no working email provider is configured", { to, activationUrl });

  return {
    sent: false,
    message: "تم إنشاء الحساب، لكن تعذر إرسال البريد. استخدم رابط التفعيل المباشر.",
    activationUrl
  };
}
