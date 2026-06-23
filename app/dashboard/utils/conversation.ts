import type { ConversationStatus } from "../types";

export function statusLabel(status: ConversationStatus) {
  if (status === "assigned") return "مسندة";
  if (status === "unassigned") return "غير مسندة";
  return "مغلقة";
}
