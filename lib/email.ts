import { renderEmail } from "./email-layout";

type SendActivationEmailInput = {
  to: string;
  name: string;
  activationUrl: string;
  purpose?: "activation" | "password_reset" | "workspace_invite";
  // Only used for purpose "workspace_invite" - the company inviting an
  // already-registered person into a second tenant as an employee.
  workspaceName?: string;
};

type EmailDeliveryResult = {
  sent: boolean;
  message: string;
  activationUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function activationEmailContent(name: string, activationUrl: string, purpose: "activation" | "password_reset" | "workspace_invite", workspaceName = "") {
  const isReset = purpose === "password_reset";
  const isWorkspaceInvite = purpose === "workspace_invite";
  const heading = isReset ? "إعادة تعيين كلمة السر" : isWorkspaceInvite ? "دعوة للانضمام إلى شركة جديدة" : "تحقق من بريدك الإلكتروني";
  const buttonLabel = isReset ? "إعادة تعيين كلمة السر" : isWorkspaceInvite ? "تأكيد الانضمام" : "تأكيد البريد الإلكتروني";
  const description = isReset
    ? "تلقينا طلباً لإعادة تعيين كلمة السر لحسابك في Linkly. اضغط الزر أدناه لاختيار كلمة سر جديدة."
    : isWorkspaceInvite
      ? `${escapeHtml(workspaceName) || "شركة"} تدعوك للانضمام إلى مساحة عملها على Linkly بنفس حسابك الحالي. اضغط الزر أدناه وأدخل كلمة سرك الحالية لتأكيد الانضمام - إذا لم يكن هذا طلبك، تجاهل هذه الرسالة.`
      : "مرحباً بك في Linkly! اضغط الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.";
  const expiry = isReset ? "ساعة واحدة" : "3 أيام";
  const text = `مرحباً ${name}\n\n${description}\n${activationUrl}\n\nينتهي الرابط خلال ${expiry}. إذا لم تطلب هذا الإجراء، تجاهل هذه الرسالة.`;
  const html = renderEmail({ brand: DEFAULT_EMAIL_BRANDING, heading, greetingName: name || undefined, paragraphs: [description], button: { label: buttonLabel, url: activationUrl }, fallbackLink: true, note: `ينتهي هذا الرابط خلال ${expiry}. إذا لم تطلب هذا الإجراء، تجاهل هذه الرسالة.` });
  return { text, html };
}

/**
 * Shared delivery path behind every outbound email: Resend first, falling
 * back to a configured Google Apps Script relay. Neither provider is
 * required - callers get back whether it actually sent so they can decide
 * what to do (activation falls back to a direct link; reminders just skip).
 */
async function sendEmail({ to, subject, text, html, idempotencyKey }: { to: string; subject: string; text: string; html: string; idempotencyKey?: string }): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim() || "Linkly <noreply@linklysa.io>";

  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}`, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
        signal: AbortSignal.timeout(10000),
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
        signal: AbortSignal.timeout(10000),
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

/** Called only for a newly committed self-service signup, never activation resends. */
export async function sendTrialSignupNotification(input: { tenantId: string; companyName: string; ownerName: string; ownerEmail: string }): Promise<boolean> {
  const text = `تسجيل تجربة جديد في Linkly\nالنشاط: ${input.companyName}\nالاسم: ${input.ownerName}\nالبريد: ${input.ownerEmail}\nالحساب بانتظار تأكيد البريد الإلكتروني.`;
  const html = renderEmail({ brand: DEFAULT_EMAIL_BRANDING, heading: "تسجيل تجربة جديد في Linkly", rows: [["النشاط", input.companyName], ["الاسم", input.ownerName], ["البريد", input.ownerEmail]], note: "الحساب بانتظار تأكيد البريد الإلكتروني." });
  return sendEmail({ to: "info@linklysa.io", subject: "تسجيل تجربة جديد في Linkly", text, html, idempotencyKey: `trial-signup/${input.tenantId}` });
}

export async function sendActivationEmail({ to, name, activationUrl, purpose = "activation", workspaceName }: SendActivationEmailInput): Promise<EmailDeliveryResult> {
  const content = activationEmailContent(name, activationUrl, purpose, workspaceName);
  const subject = purpose === "password_reset"
    ? "إعادة تعيين كلمة السر في Linkly"
    : purpose === "workspace_invite"
      ? "دعوة للانضمام إلى شركة جديدة في Linkly"
      : "تفعيل حسابك في Linkly";
  const sentMessage = purpose === "workspace_invite"
    ? "تم إرسال دعوة تأكيد الانضمام إلى بريدك الإلكتروني."
    : "تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني.";
  const fallbackMessage = purpose === "workspace_invite"
    ? "تعذر إرسال البريد. استخدم رابط تأكيد الانضمام المباشر."
    : "تم إنشاء الحساب، لكن تعذر إرسال البريد. استخدم رابط التفعيل المباشر.";

  const sent = await sendEmail({ to, subject, text: content.text, html: content.html });
  if (sent) {
    return { sent: true, message: sentMessage };
  }

  // Never log activationUrl - it's a live, single-use bearer link (password
  // reset/activation/invite acceptance). The API response already carries it
  // back to the caller for the direct-link fallback; that's the only place
  // it should travel.
  console.warn("Activation email was not sent because no working email provider is configured", { to, purpose });

  return {
    sent: false,
    message: fallbackMessage,
    activationUrl
  };
}

function twoFactorCodeEmailContent(name: string, code: string) {
  const text = `مرحباً ${name}\n\nرمز تسجيل الدخول الخاص بك في Linkly هو: ${code}\n\nصالح لمدة 10 دقائق. إذا لم تطلب تسجيل الدخول، تجاهل هذه الرسالة.`;
  const html = renderEmail({ brand: DEFAULT_EMAIL_BRANDING, heading: "رمز تسجيل الدخول", greetingName: name || undefined, paragraphs: ["استخدم الرمز التالي لإكمال تسجيل الدخول إلى Linkly."], code, note: "صالح لمدة 10 دقائق. إذا لم تطلب تسجيل الدخول، تجاهل هذه الرسالة ولن يتغير شيء." });
  return { text, html };
}

/**
 * Login 2FA one-time code (lib/two-factor.ts issueTwoFactorCode). Unlike
 * sendActivationEmail, this has no direct-link fallback - if no mail
 * provider is configured, 2FA-enabled login is effectively unusable, same
 * tradeoff as any code-based 2FA without a working delivery channel.
 */
export async function sendTwoFactorCodeEmail({ to, name, code }: { to: string; name: string; code: string }): Promise<boolean> {
  const content = twoFactorCodeEmailContent(name, code);
  return sendEmail({ to, subject: "رمز تسجيل الدخول في Linkly", text: content.text, html: content.html });
}

type EmailBranding = { name: string; color: string };
const DEFAULT_EMAIL_BRANDING: EmailBranding = { name: "Linkly", color: "#178a82" };

function trialEndingEmailContent(name: string, hoursLeft: number, billingUrl: string, branding: EmailBranding) {
  const timeLabel = hoursLeft >= 24 ? `${Math.round(hoursLeft / 24)} يوم` : `${hoursLeft} ساعة`;
  const text = `مرحباً ${name}\n\nتجربتك المجانية في ${branding.name} تنتهي خلال ${timeLabel}. رقّي حسابك الآن حتى لا تفقد الوصول لمحادثاتك وفريقك.\n${billingUrl}`;
  const html = renderEmail({ brand: branding, heading: `تجربتك تنتهي خلال ${timeLabel}`, greetingName: name || undefined, paragraphs: ["رقّي حسابك الآن حتى لا تفقد الوصول لمحادثاتك وفريقك وإعداداتك."], button: { label: "الترقية الآن", url: billingUrl } });
  return { text, html };
}

export async function sendTrialEndingEmail({ to, name, hoursLeft, billingUrl, branding = DEFAULT_EMAIL_BRANDING }: { to: string; name: string; hoursLeft: number; billingUrl: string; branding?: EmailBranding }): Promise<boolean> {
  const content = trialEndingEmailContent(name, hoursLeft, billingUrl, branding);
  return sendEmail({ to, subject: `تجربتك المجانية في ${branding.name} توشك على الانتهاء`, text: content.text, html: content.html });
}

function subscriptionRenewalEmailContent(name: string, daysLeft: number, renewalDate: string, billingUrl: string, branding: EmailBranding) {
  const timeLabel = daysLeft <= 1 ? "غداً" : `${daysLeft} أيام`;
  const text = `مرحباً ${name}\n\nاشتراكك في ${branding.name} ينتهي خلال ${timeLabel} (بتاريخ ${renewalDate}). جدّد الآن حتى لا ينقطع الوصول لمحادثاتك وفريقك.\n${billingUrl}`;
  const html = renderEmail({ brand: branding, heading: `اشتراكك ينتهي خلال ${timeLabel}`, greetingName: name || undefined, paragraphs: [`اشتراكك ينتهي بتاريخ ${renewalDate}. جدّد الآن حتى لا ينقطع وصولك لمحادثاتك وفريقك وإعداداتك.`], button: { label: "تجديد الاشتراك", url: billingUrl } });
  return { text, html };
}

export async function sendSubscriptionRenewalEmail({ to, name, daysLeft, renewalDate, billingUrl, branding = DEFAULT_EMAIL_BRANDING }: { to: string; name: string; daysLeft: number; renewalDate: string; billingUrl: string; branding?: EmailBranding }): Promise<boolean> {
  const content = subscriptionRenewalEmailContent(name, daysLeft, renewalDate, billingUrl, branding);
  return sendEmail({ to, subject: `اشتراكك في ${branding.name} يقترب من التجديد`, text: content.text, html: content.html });
}

function subscriptionRenewalFailedEmailContent(name: string, disabled: boolean, billingUrl: string, branding: EmailBranding) {
  const body = disabled
    ? "تعذّر شحن بطاقتك المحفوظة عدة مرات، فأوقفنا التجديد التلقائي على حسابك. جدّد يدويًا من صفحة الفوترة حتى لا ينقطع وصولك، ويمكنك تفعيل التجديد التلقائي من جديد ببطاقة أخرى."
    : "تعذّر شحن بطاقتك المحفوظة لتجديد اشتراكك. سنحاول مرة أخرى، لكن يمكنك أيضًا التجديد يدويًا الآن أو تحديث بيانات بطاقتك.";
  const text = `مرحباً ${name}\n\n${body}\n${billingUrl}`;
  const html = renderEmail({ brand: branding, heading: "تعذّر تجديد اشتراكك تلقائيًا", greetingName: name || undefined, paragraphs: [body], button: { label: "الذهاب لصفحة الفوترة", url: billingUrl }, tone: "danger" });
  return { text, html };
}

export async function sendSubscriptionRenewalFailedEmail({ to, name, disabled, billingUrl, branding = DEFAULT_EMAIL_BRANDING }: { to: string; name: string; disabled: boolean; billingUrl: string; branding?: EmailBranding }): Promise<boolean> {
  const content = subscriptionRenewalFailedEmailContent(name, disabled, billingUrl, branding);
  return sendEmail({ to, subject: `تعذّر تجديد اشتراكك في ${branding.name} تلقائيًا`, text: content.text, html: content.html });
}

function lowBalanceEmailContent(name: string, remaining: number, percent: number, topUpUrl: string, branding: EmailBranding) {
  const remainingLabel = remaining.toLocaleString("en-US");
  const text = `مرحباً ${name}\n\nرصيد رسائل حملاتك في ${branding.name} وصل إلى ${percent}% (${remainingLabel} رسالة متبقية). اشحن رصيدك الآن حتى لا تتوقف حملاتك القادمة.\n${topUpUrl}`;
  const html = renderEmail({ brand: branding, heading: `رصيد رسائل حملاتك عند ${percent}%`, greetingName: name || undefined, paragraphs: [`تبقّى لديك ${remainingLabel} رسالة فقط. اشحن رصيدك الآن حتى لا تتوقف حملاتك القادمة.`], button: { label: "شحن الرصيد الآن", url: topUpUrl } });
  return { text, html };
}

export async function sendLowBalanceEmail({ to, name, remaining, percent, topUpUrl, branding = DEFAULT_EMAIL_BRANDING }: { to: string; name: string; remaining: number; percent: number; topUpUrl: string; branding?: EmailBranding }): Promise<boolean> {
  const content = lowBalanceEmailContent(name, remaining, percent, topUpUrl, branding);
  return sendEmail({ to, subject: `رصيد رسائل حملاتك في ${branding.name} عند ${percent}%`, text: content.text, html: content.html });
}

const ADMIN_NOTIFICATION_EMAIL = "info@linklysa.io";

/** Shared "info@" team-inbox ping layout: a heading, a label/value table, and an optional free-text body (ticket/suggestion description). */
function adminNotificationContent(heading: string, rows: [string, string][], body?: string) {
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = body ? `${heading}\n\n${textRows}\n\n${body}` : `${heading}\n\n${textRows}`;
  const html = renderEmail({ brand: DEFAULT_EMAIL_BRANDING, heading, rows, body });
  return { text, html };
}

/** Internal-only "new support ticket" ping to the team inbox. Best-effort - never blocks ticket creation. */
export async function sendNewSupportTicketAdminNotification({ ticketId, ticketNumber, subject, categoryLabel, priorityLabel, companyName, submitterName, submitterEmail, description }: { ticketId: string; ticketNumber: string; subject: string; categoryLabel: string; priorityLabel: string; companyName: string; submitterName: string; submitterEmail: string; description: string }): Promise<boolean> {
  const content = adminNotificationContent(`تذكرة دعم جديدة: ${ticketNumber}`, [
    ["الشركة", companyName || "—"],
    ["مقدّم الطلب", submitterName],
    ["البريد الإلكتروني", submitterEmail],
    ["التصنيف", categoryLabel],
    ["الأولوية", priorityLabel],
    ["الموضوع", subject]
  ], description);
  return sendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: `تذكرة دعم جديدة ${ticketNumber}: ${subject}`, text: content.text, html: content.html, idempotencyKey: `support-ticket/${ticketId}` });
}

/** Internal-only "new development suggestion" ping to the team inbox. Best-effort - never blocks submission. */
export async function sendNewDevelopmentRequestAdminNotification({ requestId, title, companyName, submitterName, submitterEmail, description }: { requestId: string; title: string; companyName: string; submitterName: string; submitterEmail: string; description: string }): Promise<boolean> {
  const content = adminNotificationContent("اقتراح تطوير جديد في Linkly", [
    ["الشركة", companyName || "—"],
    ["مقدّم الاقتراح", submitterName],
    ["البريد الإلكتروني", submitterEmail],
    ["العنوان", title]
  ], description);
  return sendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: `اقتراح تطوير جديد: ${title}`, text: content.text, html: content.html, idempotencyKey: `development-request/${requestId}` });
}
