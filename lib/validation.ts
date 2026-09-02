// Reasonably strict (not full RFC 5322) email check: local part, an @, and a
// domain with at least one dot and a valid-looking final segment.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function toAsciiDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    return String(code >= 0x0660 && code <= 0x0669 ? code - 0x0660 : code - 0x06f0);
  });
}

/**
 * Accepts a Saudi mobile number in any common written form - 05XXXXXXXX,
 * 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX, with Arabic-Indic
 * digits or ASCII, with spaces/dashes - by normalizing down to the bare
 * "5" + 8 digits and checking that.
 */
export function isValidSaudiPhone(value: string): boolean {
  let digits = toAsciiDigits(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^5\d{8}$/.test(digits);
}

// A person/company name field: rejects empty strings, single-character
// input, and anything that's only punctuation or whitespace with no real
// letters - accepts Arabic and Latin scripts, digits, and typical
// separators (space, dash, dot, apostrophe, ampersand).
const NAME_HAS_LETTERS_REGEX = /\p{L}{2,}/u;
const NAME_ALLOWED_CHARS_REGEX = /^[\p{L}\p{N}\s.'&-]+$/u;

export function isValidDisplayName(value: string, minLength = 2): boolean {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < minLength) return false;
  if (!NAME_ALLOWED_CHARS_REGEX.test(trimmed)) return false;
  return NAME_HAS_LETTERS_REGEX.test(trimmed);
}
