import type { ConversationStatus } from "../types";

export function statusLabel(status: ConversationStatus, language: "ar" | "en" = "ar") {
  if (language === "en") {
    if (status === "assigned") return "Assigned";
    if (status === "unassigned") return "Unassigned";
    return "Closed";
  }
  if (status === "assigned") return "مسندة";
  if (status === "unassigned") return "غير مسندة";
  return "مغلقة";
}
