export function formatMessageTime(date = new Date()) {
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh"
  }).format(date);
}
