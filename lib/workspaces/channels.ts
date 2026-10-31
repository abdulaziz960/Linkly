import { prisma } from "../prisma";
import { workspacesConfigured } from "./feature";
import { getGroupContext } from "./store";

export type ChannelIdentity = {
  phoneNumberId?: string;
  wabaId?: string;
  googleLocationId?: string;
  youtubeChannelId?: string;
  linkedinOrgId?: string;
  snapchatAdAccountId?: string;
};

const FIELDS = ["phoneNumberId", "wabaId", "googleLocationId", "youtubeChannelId", "linkedinOrgId", "snapchatAdAccountId"] as const;

/**
 * One channel belongs to one project of an account. Returns the name of ANOTHER project of the same account that already has the same
 * phone number / business account / location / channel connected, or null. Accounts without the feature are never checked.
 */
export async function channelUsedByOtherProject(tenantId: string, identity: ChannelIdentity): Promise<string | null> {
  if (!workspacesConfigured()) return null;
  const group = await getGroupContext(tenantId);
  if (!group) return null;
  const siblings = group.projects.filter((project) => project.tenantId !== tenantId);
  if (!siblings.length) return null;
  const conditions = FIELDS.flatMap((field) => {
    const value = (identity[field] ?? "").trim();
    return value ? [{ [field]: value }] : [];
  });
  if (!conditions.length) return null;
  const found = await prisma.integrationSetting.findFirst({
    where: { tenantId: { in: siblings.map((project) => project.tenantId) }, OR: conditions },
    select: { tenantId: true }
  });
  if (!found) return null;
  return siblings.find((project) => project.tenantId === found.tenantId)?.name ?? "مشروع آخر";
}
