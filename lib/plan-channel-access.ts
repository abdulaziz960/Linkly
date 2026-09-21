import { prisma } from "./prisma";
import { parseAllowedChannels, type AllowedChannels, type ChannelKey } from "./channel-catalog";

/**
 * A tenant with no subscription row, or one pointed at a plan name that no
 * longer exists (legacy data, a plan deleted after the fact), fails OPEN
 * (unrestricted) rather than silently locking out an existing customer over
 * a data inconsistency that isn't their fault.
 */
export async function getAllowedChannelsForTenant(tenantId: string): Promise<AllowedChannels> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: true } });
  if (!subscription) return "*";
  const plan = await prisma.plan.findUnique({ where: { name: subscription.plan }, select: { allowedChannels: true } });
  if (!plan) return "*";
  return parseAllowedChannels(plan.allowedChannels);
}

export async function isChannelAllowedForTenant(tenantId: string, channel: ChannelKey): Promise<boolean> {
  const allowed = await getAllowedChannelsForTenant(tenantId);
  return allowed === "*" || allowed.includes(channel);
}
