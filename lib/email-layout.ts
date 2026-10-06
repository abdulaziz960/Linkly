/**
 * One layout for every outgoing email. Mail clients (Gmail above all) drop the dir
 * attribute on <html>/<body>, which is why the old templates showed Arabic with the
 * comma and full stop on the wrong side: right-to-left is therefore set on every
 * table, cell and paragraph here, not only at the top.
 *
 * Email clients cannot load data URLs or SVG, so the Linkly logo is the hosted PNG;
 * a white-label workspace (its own brand name) gets its name as text instead of Linkly's logo.
 */

export const EMAIL_LOGO_URL = "https://linklysa.io/assets/linkly-logo.png";
export const EMAIL_SITE_URL = "https://linklysa.io";

export type EmailBrand = { name: string; color: string };

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

const RTL = "direction:rtl;text-align:right;unicode-bidi:embed";
const FONT = "font-family:Tahoma,Arial,sans-serif";

type EmailTone = "default" | "danger";

export type EmailContent = {
  brand: EmailBrand;
  heading: string;
  /** Plain text; "name" is rendered as a greeting line. */
  greetingName?: string;
  paragraphs?: string[];
  /** A one-time code shown large and left-to-right. */
  code?: string;
  button?: { label: string; url: string };
  /** Show the URL as copyable text under the button (for when the button does not work). */
  fallbackLink?: boolean;
  /** Small grey text under the content. */
  note?: string;
  /** Key/value rows (internal notifications). */
  rows?: Array<[string, string]>;
  /** Free text under the rows, line breaks kept. */
  body?: string;
  tone?: EmailTone;
};

function isDefaultBrand(brand: EmailBrand) {
  return brand.name.trim().toLowerCase() === "linkly";
}

function headerCell(brand: EmailBrand, accent: string) {
  if (isDefaultBrand(brand)) {
    return `<a href="${EMAIL_SITE_URL}" style="text-decoration:none"><img src="${EMAIL_LOGO_URL}" width="104" alt="Linkly" style="display:block;border:0;outline:none;height:auto;max-width:104px"></a>`;
  }
  return `<span style="${FONT};font-size:22px;font-weight:800;color:${accent}">${escapeEmailHtml(brand.name)}</span>`;
}

export function renderEmail(content: EmailContent): string {
  const accent = content.tone === "danger" ? "#b42318" : content.brand.color;
  const heading = escapeEmailHtml(content.heading);
  const cell = (inner: string, padding: string) => `<tr><td dir="rtl" align="right" style="${RTL};padding:${padding}">${inner}</td></tr>`;

  const parts: string[] = [];
  parts.push(`<tr><td height="6" style="height:6px;font-size:0;line-height:0;background:${accent}">&nbsp;</td></tr>`);
  parts.push(cell(headerCell(content.brand, accent), "26px 36px 0"));
  parts.push(cell(`<h1 style="margin:0;${FONT};${RTL};font-size:24px;line-height:1.5;font-weight:800;color:#0f1f1c">${heading}</h1>`, "22px 36px 6px"));

  const paragraphs = [
    ...(content.greetingName ? [`مرحباً ${content.greetingName}،`] : []),
    ...(content.paragraphs ?? [])
  ];
  if (paragraphs.length) {
    parts.push(cell(paragraphs.map((text) => `<p style="margin:0 0 12px;${FONT};${RTL};font-size:16px;line-height:1.95;color:#44544f">${escapeEmailHtml(text)}</p>`).join(""), "6px 36px 0"));
  }

  if (content.code) {
    parts.push(cell(`<div dir="ltr" style="margin:6px 0 4px;${FONT};direction:ltr;text-align:center;font-size:36px;font-weight:800;letter-spacing:8px;color:${accent};background:#eef6f4;border-radius:14px;padding:18px 12px">${escapeEmailHtml(content.code)}</div>`, "8px 36px 0"));
  }

  if (content.rows?.length) {
    const rows = content.rows
      .map(([label, value]) => `<tr><td dir="rtl" align="right" style="${RTL};${FONT};color:#66756f;padding:6px 0 6px 16px;vertical-align:top;white-space:nowrap;font-size:14px">${escapeEmailHtml(label)}</td><td dir="rtl" align="right" style="${RTL};${FONT};padding:6px 0;font-weight:700;font-size:14px;color:#0f1f1c">${escapeEmailHtml(value)}</td></tr>`)
      .join("");
    parts.push(cell(`<table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" style="${RTL}">${rows}</table>`, "8px 36px 0"));
  }
  if (content.body) {
    parts.push(cell(`<p style="margin:12px 0 0;padding-top:14px;border-top:1px solid #e3ebe8;${FONT};${RTL};font-size:14px;line-height:1.9;color:#0f1f1c;white-space:pre-wrap">${escapeEmailHtml(content.body)}</p>`, "0 36px"));
  }

  if (content.button) {
    const url = escapeEmailHtml(content.button.url);
    parts.push(cell(`<a href="${url}" style="display:inline-block;${FONT};background:${accent};color:#ffffff;padding:15px 38px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:800">${escapeEmailHtml(content.button.label)}</a>`, "18px 36px 0"));
    if (content.fallbackLink) {
      parts.push(cell(`<p style="margin:0 0 8px;${FONT};${RTL};font-size:12.5px;color:#7b8a85">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:</p><div dir="ltr" style="${FONT};direction:ltr;text-align:left;background:#f1f6f4;border:1px solid #e3ebe8;border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.6;word-break:break-all"><a href="${url}" style="color:#0b61c4;text-decoration:underline">${url}</a></div>`, "22px 36px 0"));
    }
  }

  if (content.note) {
    parts.push(cell(`<p style="margin:0;${FONT};${RTL};font-size:13px;line-height:1.8;color:#7b8a85">${escapeEmailHtml(content.note)}</p>`, "20px 36px 0"));
  }

  const footerName = isDefaultBrand(content.brand) ? "Linkly" : escapeEmailHtml(content.brand.name);
  parts.push(`<tr><td dir="rtl" align="right" style="${RTL};padding:28px 36px 30px"><div style="border-top:1px solid #e3ebe8;padding-top:16px;${FONT};${RTL};font-size:12.5px;line-height:1.8;color:#7b8a85"><strong style="color:#44544f">${footerName}</strong> — منصة إدارة محادثات العملاء<br>هذه رسالة آلية، يرجى عدم الرد عليها.${isDefaultBrand(content.brand) ? ` <a href="${EMAIL_SITE_URL}" style="color:#7b8a85">linklysa.io</a>` : ""}</div></td></tr>`);

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${heading}</title></head><body dir="rtl" style="margin:0;padding:0;background:#eef3f1;${RTL};${FONT};color:#0f1f1c"><table role="presentation" width="100%" dir="rtl" cellpadding="0" cellspacing="0" style="background:#eef3f1;${RTL}"><tr><td dir="rtl" align="center" style="padding:28px 12px"><table role="presentation" width="100%" dir="rtl" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dde7e4;border-radius:16px;overflow:hidden;${RTL}">${parts.join("")}</table></td></tr></table></body></html>`;
}
