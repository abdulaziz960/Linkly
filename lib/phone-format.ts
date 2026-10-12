/** Digits with the country code: 05xxxxxxxx / 5xxxxxxxx get 966, 00-prefixed numbers lose the 00. "" when it cannot be a WhatsApp number. */
export function leadWhatsappNumber(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}
