import { getConversations } from "../../../lib/database";
import { jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getConversations());
}
