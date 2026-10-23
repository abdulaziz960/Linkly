// Choices on a catalog product, like a restaurant menu: groups of options (size: one of; extras: several), each option
// with an optional extra price. The customer answers the groups one after another in the chat, and what they chose
// becomes part of the cart line - its name and its unit price - so the order, the payment and the receipt carry it.

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import type { OptionDetail } from "./catalog-option-text";
export { optionLines, type OptionDetail } from "./catalog-option-text";

export const MAX_OPTIONS_PER_GROUP = 9;
export const MAX_GROUPS_PER_PRODUCT = 8;

export type CatalogOption = { id: string; groupId: string; name: string; /** "" when no English name was given. */ nameEn: string; priceDelta: number; sortOrder: number };
export type OptionGroup = {
  id: string;
  nameEn: string;
  /** "" = every product. */
  productId: string;
  name: string;
  required: boolean;
  multiple: boolean;
  /** For a multiple group: how many may be picked (0 = any number). */
  maxChoices: number;
  sortOrder: number;
  options: CatalogOption[];
};

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

type GroupRow = { id: string; product_id: string; name: string; required: number | bigint; multiple: number | bigint; max_choices: number | bigint; sort_order: number | bigint };
type OptionRow = { id: string; group_id: string; name: string; price_delta: number; sort_order: number | bigint };

function toGroup(row: GroupRow, options: CatalogOption[], nameEn = ""): OptionGroup {
  return { id: row.id, nameEn, productId: row.product_id, name: row.name, required: Number(row.required) === 1, multiple: Number(row.multiple) === 1, maxChoices: Number(row.max_choices), sortOrder: Number(row.sort_order), options };
}

function toOption(row: OptionRow): CatalogOption {
  return { id: row.id, groupId: row.group_id, name: row.name, nameEn: "", priceDelta: Number(row.price_delta), sortOrder: Number(row.sort_order) };
}

async function englishNames(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!ids.length) return result;
  const { Prisma } = await import("@prisma/client");
  const rows = await prisma.$queryRaw<Array<{ ref_id: string; name_en: string }>>`SELECT ref_id, name_en FROM catalog_option_names_en WHERE ref_id IN (${Prisma.join(ids)})`;
  for (const row of rows) result.set(row.ref_id, row.name_en);
  return result;
}

async function optionsOf(groupIds: string[]): Promise<Map<string, CatalogOption[]>> {
  const map = new Map<string, CatalogOption[]>();
  for (const id of groupIds) {
    const rows = await prisma.$queryRaw<OptionRow[]>`SELECT id, group_id, name, price_delta, sort_order FROM catalog_options WHERE group_id = ${id} AND active = 1 ORDER BY sort_order ASC, name ASC`;
    map.set(id, rows.map(toOption));
  }
  // The English names of the options come in one query.
  const names = await englishNames([...map.values()].flat().map((option) => option.id));
  for (const options of map.values()) for (const option of options) option.nameEn = names.get(option.id) ?? "";
  return map;
}

async function withEnglishGroups(rows: GroupRow[], options: Map<string, CatalogOption[]>): Promise<OptionGroup[]> {
  const names = await englishNames(rows.map((row) => row.id));
  return rows.map((row) => toGroup(row, options.get(row.id) ?? [], names.get(row.id) ?? ""));
}

/** The groups a customer answers for a product: the product's own and the ones for every product, each with its options; empty groups are skipped. */
export async function groupsForProduct(tenantId: string, productId: string): Promise<OptionGroup[]> {
  await ensureTables();
  const rows = await prisma.$queryRaw<GroupRow[]>`SELECT id, product_id, name, required, multiple, max_choices, sort_order FROM catalog_option_groups WHERE tenant_id = ${tenantId} AND active = 1 AND (product_id = ${productId} OR product_id = '') ORDER BY sort_order ASC, created_at ASC`;
  const options = await optionsOf(rows.map((row) => row.id));
  return (await withEnglishGroups(rows, options)).filter((group) => group.options.length > 0).slice(0, MAX_GROUPS_PER_PRODUCT);
}

/** Every group of the workspace for the merchant's editor ("" = the ones for every product). */
export async function listGroups(tenantId: string, productId?: string): Promise<OptionGroup[]> {
  await ensureTables();
  const rows = productId === undefined
    ? await prisma.$queryRaw<GroupRow[]>`SELECT id, product_id, name, required, multiple, max_choices, sort_order FROM catalog_option_groups WHERE tenant_id = ${tenantId} AND active = 1 ORDER BY sort_order ASC, created_at ASC`
    : await prisma.$queryRaw<GroupRow[]>`SELECT id, product_id, name, required, multiple, max_choices, sort_order FROM catalog_option_groups WHERE tenant_id = ${tenantId} AND active = 1 AND product_id = ${productId} ORDER BY sort_order ASC, created_at ASC`;
  const options = await optionsOf(rows.map((row) => row.id));
  return withEnglishGroups(rows, options);
}

export type GroupInput = {
  id?: unknown;
  nameEn?: unknown;
  productId?: unknown;
  name?: unknown;
  required?: unknown;
  multiple?: unknown;
  maxChoices?: unknown;
  sortOrder?: unknown;
  options?: unknown;
};

export type CleanGroup = { id: string; productId: string; name: string; nameEn: string; required: boolean; multiple: boolean; maxChoices: number; sortOrder: number; options: Array<{ id: string; name: string; nameEn: string; priceDelta: number }> };

/** Pure: a group from the merchant's form into a valid one, or an Arabic error. */
export function cleanGroupInput(input: GroupInput): { ok: true; data: CleanGroup } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, error: "اكتب اسم المجموعة، مثل: الحجم" };
  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options: CleanGroup["options"] = [];
  const seen = new Set<string>();
  for (const raw of rawOptions) {
    const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const optionName = String(entry.name ?? "").trim().slice(0, 40);
    if (!optionName) continue;
    const key = optionName.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `الخيار «${optionName}» مكرر داخل المجموعة` };
    seen.add(key);
    const delta = entry.priceDelta === undefined || entry.priceDelta === "" || entry.priceDelta === null ? 0 : Number(entry.priceDelta);
    if (!Number.isFinite(delta) || delta < 0 || delta > 100_000) return { ok: false, error: `السعر الإضافي لـ «${optionName}» غير صحيح` };
    options.push({ id: typeof entry.id === "string" && entry.id ? entry.id : "", name: optionName, nameEn: String(entry.nameEn ?? "").trim().slice(0, 40), priceDelta: Math.round(delta * 100) / 100 });
  }
  if (!options.length) return { ok: false, error: "أضف خيارًا واحدًا على الأقل" };
  if (options.length > MAX_OPTIONS_PER_GROUP) return { ok: false, error: `الحد الأقصى ${MAX_OPTIONS_PER_GROUP} خيارات في المجموعة الواحدة` };
  const multiple = input.multiple === true;
  const maxChoices = multiple ? Math.min(options.length, Math.max(0, Math.floor(Number(input.maxChoices)) || 0)) : 1;
  return {
    ok: true,
    data: {
      id: typeof input.id === "string" ? input.id : "",
      productId: typeof input.productId === "string" ? input.productId.trim().slice(0, 100) : "",
      name,
      nameEn: String(input.nameEn ?? "").trim().slice(0, 40),
      required: input.required !== false,
      multiple,
      maxChoices,
      sortOrder: Math.max(0, Math.floor(Number(input.sortOrder)) || 0),
      options
    }
  };
}

export async function saveGroup(tenantId: string, input: GroupInput): Promise<{ ok: true; group: OptionGroup } | { ok: false; error: string }> {
  const cleaned = cleanGroupInput(input);
  if (!cleaned.ok) return cleaned;
  await ensureTables();
  const data = cleaned.data;
  const now = new Date().toISOString();
  let id = data.id;
  if (id) {
    const exists = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_option_groups WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1`;
    if (!exists.length) return { ok: false, error: "المجموعة غير موجودة" };
    await prisma.$executeRaw`UPDATE catalog_option_groups SET product_id = ${data.productId}, name = ${data.name}, required = ${data.required ? 1 : 0}, multiple = ${data.multiple ? 1 : 0}, max_choices = ${data.maxChoices}, sort_order = ${data.sortOrder} WHERE id = ${id} AND tenant_id = ${tenantId}`;
  } else {
    const perProduct = await prisma.$queryRaw<Array<{ total: number | bigint }>>`SELECT COUNT(*) AS total FROM catalog_option_groups WHERE tenant_id = ${tenantId} AND product_id = ${data.productId} AND active = 1`;
    if (Number(perProduct[0]?.total ?? 0) >= MAX_GROUPS_PER_PRODUCT) return { ok: false, error: `الحد الأقصى ${MAX_GROUPS_PER_PRODUCT} مجموعات لكل منتج` };
    id = `og-${randomUUID()}`;
    await prisma.$executeRaw`INSERT INTO catalog_option_groups (id, tenant_id, product_id, name, required, multiple, max_choices, sort_order, active, created_at) VALUES (${id}, ${tenantId}, ${data.productId}, ${data.name}, ${data.required ? 1 : 0}, ${data.multiple ? 1 : 0}, ${data.maxChoices}, ${data.sortOrder}, 1, ${now})`;
  }
  // The options are replaced as a whole; one that keeps its id is updated, the others are removed (soft: an old cart still resolves).
  const keep = new Set<string>();
  for (const [index, option] of data.options.entries()) {
    const optionId = option.id && (await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_options WHERE id = ${option.id} AND group_id = ${id} LIMIT 1`).length ? option.id : `oo-${randomUUID()}`;
    keep.add(optionId);
    const found = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_options WHERE id = ${optionId} LIMIT 1`;
    if (found.length) await prisma.$executeRaw`UPDATE catalog_options SET name = ${option.name}, price_delta = ${option.priceDelta}, sort_order = ${index}, active = 1 WHERE id = ${optionId}`;
    else await prisma.$executeRaw`INSERT INTO catalog_options (id, group_id, tenant_id, name, price_delta, sort_order, active) VALUES (${optionId}, ${id}, ${tenantId}, ${option.name}, ${option.priceDelta}, ${index}, 1)`;
  }
  await setEnglishName(id, data.nameEn);
  const keptIds = [...keep];
  for (const [index, option] of data.options.entries()) {
    if (keptIds[index]) await setEnglishName(keptIds[index], option.nameEn);
  }
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_options WHERE group_id = ${id} AND active = 1`;
  for (const row of existing) if (!keep.has(row.id)) await prisma.$executeRaw`UPDATE catalog_options SET active = 0 WHERE id = ${row.id}`;
  const group = (await listGroups(tenantId)).find((entry) => entry.id === id);
  return group ? { ok: true, group } : { ok: false, error: "تعذر حفظ المجموعة" };
}

async function setEnglishName(refId: string, nameEn: string) {
  await prisma.$executeRaw`DELETE FROM catalog_option_names_en WHERE ref_id = ${refId}`;
  if (nameEn) await prisma.$executeRaw`INSERT INTO catalog_option_names_en (ref_id, name_en) VALUES (${refId}, ${nameEn})`;
}

export async function deleteGroup(tenantId: string, id: string): Promise<boolean> {
  await ensureTables();
  const changed = await prisma.$executeRaw`UPDATE catalog_option_groups SET active = 0 WHERE id = ${id} AND tenant_id = ${tenantId} AND active = 1`;
  return Number(changed) > 0;
}

export type Selection = { ok: true; options: CatalogOption[]; delta: number; text: string } | { ok: false; reason: string; groupName?: string };

/** Pure: whether the chosen option ids satisfy the product's groups, and what they add to the price. */
export function resolveSelection(groups: OptionGroup[], chosenIds: string[]): Selection {
  const chosen = new Set(chosenIds);
  const picked: CatalogOption[] = [];
  for (const group of groups) {
    const inGroup = group.options.filter((option) => chosen.has(option.id));
    if (!group.multiple && inGroup.length > 1) return { ok: false, reason: "too-many", groupName: group.name };
    if (group.multiple && group.maxChoices > 0 && inGroup.length > group.maxChoices) return { ok: false, reason: "too-many", groupName: group.name };
    if (group.required && inGroup.length === 0) return { ok: false, reason: "missing", groupName: group.name };
    picked.push(...inGroup);
  }
  const known = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
  if (chosenIds.some((id) => !known.has(id))) return { ok: false, reason: "unknown" };
  const delta = Math.round(picked.reduce((sum, option) => sum + option.priceDelta, 0) * 100) / 100;
  return { ok: true, options: picked, delta, text: picked.map((option) => option.name).join("، ") };
}

/** Stable identity of a set of options (the same choices in any order are one cart line). */
export function optionsKey(optionIds: string[] | undefined): string {
  return [...new Set(optionIds ?? [])].sort().join(",");
}

// ---- where the customer is in a product's questions ----

export type OptionFlow = { productId: string; mode: "cart" | "buy"; groupIndex: number; chosen: string[] };

const FLOW_MINUTES = 30;

export async function getOptionFlow(conversationId: string): Promise<OptionFlow | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ product_id: string; mode: string; group_index: number | bigint; chosen_json: string; expires_at: string }>>`SELECT product_id, mode, group_index, chosen_json, expires_at FROM catalog_option_flow WHERE conversation_id = ${conversationId} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    await clearOptionFlow(conversationId);
    return null;
  }
  let chosen: string[] = [];
  try {
    const parsed = JSON.parse(row.chosen_json) as unknown;
    if (Array.isArray(parsed)) chosen = parsed.map(String);
  } catch {
    chosen = [];
  }
  return { productId: row.product_id, mode: row.mode === "buy" ? "buy" : "cart", groupIndex: Number(row.group_index), chosen };
}

export async function setOptionFlow(tenantId: string, conversationId: string, flow: OptionFlow) {
  await ensureTables();
  const expires = new Date(Date.now() + FLOW_MINUTES * 60_000).toISOString();
  await prisma.$executeRaw`DELETE FROM catalog_option_flow WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO catalog_option_flow (conversation_id, tenant_id, product_id, mode, group_index, chosen_json, expires_at) VALUES (${conversationId}, ${tenantId}, ${flow.productId}, ${flow.mode}, ${flow.groupIndex}, ${JSON.stringify(flow.chosen)}, ${expires})`;
}

export async function clearOptionFlow(conversationId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_option_flow WHERE conversation_id = ${conversationId}`;
}

/** Pure: the chosen options with their group names, in the order the groups are asked. */
export function describeSelection(groups: OptionGroup[], chosenIds: string[]): OptionDetail[] {
  const chosen = new Set(chosenIds);
  const details: OptionDetail[] = [];
  for (const group of groups) {
    for (const option of group.options) {
      if (chosen.has(option.id)) details.push({ group: group.name, groupEn: group.nameEn, name: option.name, nameEn: option.nameEn, delta: option.priceDelta });
    }
  }
  return details;
}

