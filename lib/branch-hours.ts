// Opening hours of a branch, read from the free text the merchant typed on the Branches page ("9 ص - 11 م", "09:00-23:00",
// "من 9 صباحا إلى 12 منتصف الليل", "24 ساعة"). Text that cannot be read counts as "always open", so a branch is never
// hidden by a guess. Saudi time (UTC+3) - the markets Linkly serves have no daylight saving.

export type BranchHours = { known: boolean; alwaysOpen: boolean; startMinutes: number; endMinutes: number };

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const RIYADH_OFFSET_MINUTES = 3 * 60;

function latinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

const RANGE = /(\d{1,2})(?::(\d{2}))?\s*(ص|م|am|pm|صباحا|صباحًا|مساء|مساءً|مساءا)?\s*(?:-|–|—|إلى|الى|to|حتى)\s*(\d{1,2})(?::(\d{2}))?\s*(ص|م|am|pm|صباحا|صباحًا|مساء|مساءً|مساءا)?/i;

function toMinutes(hour: number, minute: number, suffix: string | undefined): number {
  const s = (suffix ?? "").toLowerCase();
  const pm = s === "م" || s === "pm" || s.startsWith("مساء");
  const am = s === "ص" || s === "am" || s.startsWith("صباح");
  let h = hour % 24;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + minute;
}

export function parseBranchHours(text: string): BranchHours {
  const unknown: BranchHours = { known: false, alwaysOpen: true, startMinutes: 0, endMinutes: 0 };
  const source = latinDigits(String(text ?? "")).trim();
  if (!source) return unknown;
  if (/(24\s*(ساعة|ساعه|h|\/\s*7)|طوال اليوم|على مدار الساعة|24\/7)/i.test(source)) return { known: true, alwaysOpen: true, startMinutes: 0, endMinutes: 0 };
  const match = RANGE.exec(source);
  if (!match) return unknown;
  const startHour = Number(match[1]);
  const endHour = Number(match[4]);
  if (startHour > 24 || endHour > 24) return unknown;
  const startMinute = Number(match[2] ?? 0);
  const endMinute = Number(match[5] ?? 0);
  if (startMinute > 59 || endMinute > 59) return unknown;
  let start = toMinutes(startHour, startMinute, match[3]);
  let end = toMinutes(endHour, endMinute, match[6] ?? (match[3] ? undefined : undefined));
  // "9-11" with no ص / م: a shop is not open for two hours, so the closing time is the evening one.
  if (!match[3] && !match[6] && endHour <= 12 && endHour > startHour && endHour - startHour < 6) end += 12 * 60;
  if (end === start) return { known: true, alwaysOpen: true, startMinutes: start, endMinutes: end };
  if (/منتصف الليل/.test(source) && endHour === 12 && !match[6]) end = 24 * 60;
  start = start % (24 * 60);
  return { known: true, alwaysOpen: false, startMinutes: start, endMinutes: end % (24 * 60) || (end === 24 * 60 ? 24 * 60 : 0) };
}

function minutesNow(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + RIYADH_OFFSET_MINUTES) % (24 * 60);
}

export function isBranchOpen(workingHours: string, now = new Date()): boolean {
  const hours = parseBranchHours(workingHours);
  if (hours.alwaysOpen) return true;
  const current = minutesNow(now);
  // A range that crosses midnight (18:00-02:00) is open late in the evening and early in the morning.
  return hours.startMinutes < hours.endMinutes ? current >= hours.startMinutes && current < hours.endMinutes : current >= hours.startMinutes || current < hours.endMinutes;
}

/** "9 ص" / "9:30 م" - the opening time the bot tells a customer who asks while the branch is closed. */
export function openingTimeLabel(workingHours: string): string {
  const hours = parseBranchHours(workingHours);
  if (hours.alwaysOpen) return "";
  const h24 = Math.floor(hours.startMinutes / 60);
  const minute = hours.startMinutes % 60;
  const suffix = h24 >= 12 ? "م" : "ص";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
}
