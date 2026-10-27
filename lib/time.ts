export function formatMessageTime(date = new Date()) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(date);
}

export function formatDateTime(value: string, lang: "ar" | "en" = "ar") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(date);
}

/**
 * A stored campaign time is either an ISO string or, in older rows, the server's `toLocaleString("en-US")`
 * ("10/25/2026, 3:22:30 PM") written in UTC. Returns null when it is neither.
 */
export function parseStoredDate(value: string | null | undefined): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(text);
  if (legacy) {
    const [, month, day, year, hourText, minute, second, meridiem] = legacy;
    let hour = Number(hourText);
    if (meridiem) hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minute), Number(second ?? 0)));
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Gregorian, Western digits, 24-hour clock, Riyadh time: "25 أكتوبر 2026، 15:22". */
export function formatFullDateTime(date: Date, lang: "ar" | "en" = "ar") {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(date);
}

/** The Riyadh calendar day of a moment, "2026-10-26": messages of one day share it. */
export function riyadhDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The chip above a day's messages: "اليوم – 26 أكتوبر 2026", "أمس – ..." or just the date. */
export function messageDayLabel(date: Date, lang: "ar" | "en" = "ar", now = Date.now()) {
  const text = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh", numberingSystem: "latn", calendar: "gregory" }).format(date);
  const key = riyadhDayKey(date);
  if (key === riyadhDayKey(new Date(now))) return `${lang === "en" ? "Today" : "اليوم"} – ${text}`;
  if (key === riyadhDayKey(new Date(now - 86_400_000))) return `${lang === "en" ? "Yesterday" : "أمس"} – ${text}`;
  return text;
}

/** "قبل ساعتين" / "2 hours ago" for the past, "بعد 3 أيام" / "in 3 days" for the future. */
export function formatRelativeTime(date: Date, lang: "ar" | "en" = "ar", now = Date.now()) {
  const seconds = Math.round((date.getTime() - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86400], ["hour", 3600], ["minute", 60]];
  const formatter = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "ar-u-nu-latn", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, "minute");
}
