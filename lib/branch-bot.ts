import { branchMapUrl, distanceKm, formatDistance, listBranches, nearestBranch, type Branch } from "./branches";
import { sendWhatsAppLocation, sendWhatsAppLocationRequest } from "./whatsapp-send";

/**
 * The bot's "أقرب فرع" step. WhatsApp never tells a business where a
 * customer is - the customer has to share it - so the step asks with
 * WhatsApp's one-tap "send location" prompt, then replies with the closest
 * branch. Kept free of imports from bot-engine (which imports this).
 */

export type BranchCtx = {
  channel: "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";
  tenantId: string;
  conversationId: string;
  recipientId: string;
  sendText: (text: string) => Promise<unknown>;
};

export type Coordinates = { latitude: number; longitude: number };

const AUTHOR = "الرد الآلي";
export const BRANCH_DEFAULT_ASK = "لنرسل لك أقرب فرع، شاركنا موقعك الحالي 📍";

function branchDetails(branch: Branch, distance?: number) {
  const lines = [`📍 *${branch.name}*`];
  if (branch.address) lines.push(branch.address);
  if (distance !== undefined) lines.push(`المسافة التقريبية: ${formatDistance(distance)}`);
  if (branch.workingHours) lines.push(`الدوام: ${branch.workingHours}`);
  if (branch.phone) lines.push(`للتواصل: ${branch.phone}`);
  lines.push(`الموقع على الخريطة:\n${branchMapUrl(branch)}`);
  return lines.join("\n");
}

async function sendBranchPin(ctx: BranchCtx, branch: Branch) {
  if (ctx.channel !== "whatsapp") return;
  await sendWhatsAppLocation({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    to: ctx.recipientId,
    latitude: branch.latitude,
    longitude: branch.longitude,
    name: branch.name,
    address: branch.address,
    author: AUTHOR
  }).catch(() => undefined);
}

/** Every active branch as text (when the customer can't or won't share a location). */
export async function sendAllBranches(ctx: BranchCtx, intro: string): Promise<boolean> {
  const branches = (await listBranches(ctx.tenantId, { activeOnly: true })).slice(0, 10);
  if (!branches.length) return false;
  await ctx.sendText(`${intro}\n\n${branches.map((branch) => branchDetails(branch)).join("\n\n")}`);
  return true;
}

export async function sendNearestBranch(ctx: BranchCtx, location: Coordinates): Promise<boolean> {
  const branches = await listBranches(ctx.tenantId, { activeOnly: true });
  const best = nearestBranch(branches, location.latitude, location.longitude);
  if (!best) return false;

  await ctx.sendText(`أقرب فرع لك:\n\n${branchDetails(best.branch, best.distanceKm)}`);
  await sendBranchPin(ctx, best.branch);
  return true;
}

/**
 * Starts the step. "waiting": a location prompt was sent and the bot should
 * wait for the customer's reply. "done": answered right away (location was
 * already known, or the channel can't share one). "none": no branches yet.
 */
export async function startBranchStep(ctx: BranchCtx, ask: string, known?: Coordinates): Promise<"waiting" | "done" | "none"> {
  if (known) return (await sendNearestBranch(ctx, known)) ? "done" : "none";

  const branches = await listBranches(ctx.tenantId, { activeOnly: true });
  if (!branches.length) return "none";

  const body = ask.trim() || BRANCH_DEFAULT_ASK;
  if (ctx.channel !== "whatsapp") {
    await sendAllBranches(ctx, "فروعنا:");
    return "done";
  }
  const sent = await sendWhatsAppLocationRequest({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: body, author: AUTHOR });
  if (!sent.ok) {
    await ctx.sendText(`${body}\n\n(اضغط 📎 ثم «الموقع» ثم أرسل موقعك الحالي)`);
  }
  return "waiting";
}

/** The customer replied while we wait for a location. Always resolves the step. */
export async function handleBranchReply(ctx: BranchCtx, location: Coordinates | undefined): Promise<void> {
  if (location && (await sendNearestBranch(ctx, location))) return;
  await sendAllBranches(ctx, "لم نتمكن من تحديد موقعك. هذه فروعنا:");
}

export { distanceKm };
