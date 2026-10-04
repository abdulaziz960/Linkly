import { CATALOG_TEMPLATE_PREFIX } from "./catalog-template-shared";
import { prisma } from "./prisma";

/**
 * A "catalog template" is an ordinary WhatsApp template (so it passes Meta's
 * review and can go out in a campaign at any time) whose single quick-reply
 * button opens the dashboard catalog. The name prefix marks it: it survives
 * Meta syncs, unlike any extra column we could add to the row.
 */
/** True when `buttonText` is the tapped quick-reply label of one of the tenant's catalog templates. */
export async function isCatalogTemplateButton(tenantId: string, buttonText: string): Promise<boolean> {
  const text = buttonText.trim();
  if (!text) return false;
  const match = await prisma.template.findFirst({
    where: { tenantId, name: { startsWith: CATALOG_TEMPLATE_PREFIX }, buttonType: "QUICK_REPLY", buttonText: text },
    select: { name: true }
  });
  return Boolean(match);
}
