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
