// Pure constants/helpers shared by the template builder (client) and the webhook (server).
export const CATALOG_TEMPLATE_PREFIX = "catalog_";
export const CATALOG_TEMPLATE_DEFAULT_BUTTON = "تصفح المنتجات";

export function isCatalogTemplateName(name: string): boolean {
  return name.startsWith(CATALOG_TEMPLATE_PREFIX);
}
