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

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.EMAIL_FROM || "AudienceW <onboarding@resend.dev>";

export async function sendActivationEmail({ to, name, activationUrl }: SendActivationEmailInput): Promise<EmailDeliveryResult> {
  if (!resendApiKey) {
    console.warn("Employee activation email was not sent because RESEND_API_KEY is not configured", {
      to,
      activationUrl
    });

    return {
      sent: false,
      message: "تم إنشاء الموظف، لكن خدمة البريد غير مفعلة بعد. استخدم رابط التفعيل أدناه للتجربة.",
      activationUrl
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: "تفعيل حسابك في AudienceW",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
          <h2>مرحباً ${name}</h2>
          <p>تمت إضافتك كموظف في منصة AudienceW.</p>
          <p>اضغط الزر التالي لتفعيل حسابك وإنشاء كلمة السر:</p>
          <p>
            <a href="${activationUrl}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;">
              تفعيل الحساب
            </a>
          </p>
          <p>إذا لم يعمل الزر، انسخ الرابط التالي وافتحه في المتصفح:</p>
          <p style="direction:ltr;text-align:left;word-break:break-all;">${activationUrl}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.error("Activation email failed", payload);

    return {
      sent: false,
      message: "تم إنشاء الموظف، لكن تعذر إرسال رابط التفعيل عبر البريد. استخدم رابط التفعيل أدناه للتجربة.",
      activationUrl
    };
  }

  return {
    sent: true,
    message: "تم إنشاء الموظف وإرسال رابط التفعيل إلى بريده الإلكتروني."
  };
}
