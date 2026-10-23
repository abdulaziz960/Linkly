// Demo workspaces: a private link gives each visitor a fresh, complete workspace (conversations, a catalog, a connected fake
// Salla store, a "connected" WhatsApp number that never reaches Meta). It lives DEMO_DAYS days, then is deleted entirely.

import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { getIntegrationSettings, getTenantIntegrationId } from "./database";
import { getActivePlans } from "./plans";
import { saveStoreTokens } from "./store-connections";
import { seedDemoSallaOrders } from "./demo-salla";
import { DEMO_DAYS, forgetDemoTenant } from "./demo-mode";
import { deleteTenant } from "./subscriptions";
import { formatMessageTime } from "./time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether `key` is the secret of the reviewer link (DEMO_ACCESS_KEY). Fails closed when it is not set. */
export function isDemoKeyValid(key: string | null | undefined): boolean {
  const secret = process.env.DEMO_ACCESS_KEY?.trim();
  if (!secret || secret.length < 16 || !key) return false;
  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(key).digest();
  return timingSafeEqual(expected, actual);
}

const CUSTOMERS = [
  { name: "سارة العتيبي", phone: "966501234567" },
  { name: "محمد القحطاني", phone: "966555123456" },
  { name: "نورة الدوسري", phone: "966541112233" },
  { name: "خالد الشمري", phone: "966533445566" },
  { name: "ريم الحربي", phone: "966590001122" }
];

const CHATS: Array<{ status: "assigned" | "unassigned" | "closed"; unread: number; tags: string[]; stage: string; messages: Array<["in" | "out", string]> }> = [
  { status: "assigned", unread: 0, tags: ["طلب جديد"], stage: "جديد", messages: [["in", "السلام عليكم، وين وصل طلبي رقم 230041؟"], ["out", "وعليكم السلام سارة 🌷 طلبك قيد المراجعة وسيصلك إشعار فور شحنه."], ["in", "تمام شكرًا"]] },
  { status: "unassigned", unread: 2, tags: ["استفسار"], stage: "مهتم", messages: [["in", "هلا، هل الساعة الكلاسيك متوفرة؟"], ["in", "وكم مدة التوصيل للرياض؟"]] },
  { status: "closed", unread: 0, tags: ["عميل مهم"], stage: "فاز", messages: [["in", "وصلني الطلب، شكرًا لكم"], ["out", "يسعدنا خدمتك نورة، نتمنى أن ينال رضاك ✨"]] },
  { status: "assigned", unread: 1, tags: ["طلب إلغاء"], stage: "جديد", messages: [["in", "ممكن ألغي طلبي الأخير؟ غيرت رأيي"]] },
  { status: "unassigned", unread: 1, tags: ["استفسار"], stage: "جديد", messages: [["in", "هل عندكم تقسيط؟"]] }
];

const PRODUCTS = [
  { name: "قميص قطن", price: 149, category: "ملابس" },
  { name: "حقيبة جلد", price: 320, category: "إكسسوارات" },
  { name: "ساعة كلاسيك", price: 450, category: "إكسسوارات" },
  { name: "حذاء رياضي", price: 275, category: "ملابس" },
  { name: "محفظة", price: 95, category: "إكسسوارات" },
  { name: "وشاح صوف", price: 120, category: "ملابس" }
];

async function pickDemoPlan(): Promise<{ name: string; employeeLimit: number }> {
  const plans = (await getActivePlans()).filter((plan) => plan.monthlyPrice > 0).sort((a, b) => b.monthlyPrice - a.monthlyPrice);
  const plan = plans[0];
  return plan ? { name: plan.name, employeeLimit: plan.employeeLimit } : { name: "باقة البداية", employeeLimit: 3 };
}

export type DemoWorkspace = { tenantId: string; userId: string; expiresAt: string };

/** Creates a complete, separate demo workspace and its owner login (no password: the visitor is signed in by the link). */
export async function createDemoWorkspace(): Promise<DemoWorkspace> {
  await ensureCatalogSchema();
  const code = randomUUID().replace(/-/g, "").slice(0, 10);
  const tenantId = `demo-ws-${code}`;
  const employeeId = `emp-${tenantId}`;
  const userId = `user-${tenantId}`;
  const email = `demo-${code}@demo.linklysa.io`;
  const ownerName = "مراجع ديمو";
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + DEMO_DAYS * DAY_MS).toISOString();
  const plan = await pickDemoPlan();

  await prisma.$transaction(async (tx) => {
    await tx.userAccount.create({ data: { id: userId, name: ownerName, email, passwordHash: "", role: "مالك الحساب", tenantId, createdAt: now } });
    await tx.employee.create({ data: { id: employeeId, name: ownerName, email, role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "م", tenantId, userId } });
    await tx.subscription.create({
      data: {
        id: `sub-${tenantId}`, tenantId, companyName: "متجر الأناقة (ديمو)", ownerName, ownerEmail: email,
        plan: plan.name, status: "تجربة", employeeLimit: plan.employeeLimit, amount: 0, billingCycle: `ديمو ${DEMO_DAYS} أيام`,
        renewalAt: expiresAt, createdAt: now, updatedAt: now
      }
    });
    for (const [index, tag] of [["طلب جديد", "#127a70"], ["استفسار", "#2563eb"], ["عميل مهم", "#d97706"], ["طلب إلغاء", "#dc2626"]].entries()) {
      await tx.tag.create({ data: { id: `${tenantId}-tag-${index}`, name: tag[0], color: tag[1], description: "", tenantId } });
    }
    for (const [index, chat] of CHATS.entries()) {
      const customer = CUSTOMERS[index];
      const customerId = `${tenantId}-cust-${index}`;
      const conversationId = `${tenantId}-conv-${index}`;
      const lastAt = new Date(nowDate.getTime() - (index + 1) * 47 * 60_000);
      await tx.customer.create({ data: { id: customerId, name: customer.name, phone: customer.phone, initial: customer.name.slice(0, 1), tenantId } });
      await tx.conversation.create({
        data: {
          id: conversationId, customerId, channel: "whatsapp", lastMessage: chat.messages[chat.messages.length - 1][1], status: chat.status,
          assignee: chat.status === "unassigned" ? "بدون موظف" : ownerName, unread: chat.unread, windowExpired: 0,
          lastActivityAt: lastAt.toISOString(), tenantId, pipelineStage: chat.stage
        }
      });
      for (const [position, [direction, text]] of chat.messages.entries()) {
        const at = new Date(lastAt.getTime() - (chat.messages.length - position) * 60_000);
        await tx.message.create({ data: { id: `${conversationId}-m${position}`, conversationId, direction, text, time: formatMessageTime(at), createdAt: at.toISOString(), author: direction === "out" ? ownerName : "" } });
      }
      for (const tagName of chat.tags) await tx.conversationTag.create({ data: { conversationId, tagName } });
    }
    for (const [index, product] of PRODUCTS.entries()) {
      await tx.product.create({ data: { id: `${tenantId}-prod-${index}`, tenantId, name: product.name, price: product.price, category: product.category, description: "منتج تجريبي", stock: -1, active: 1, createdAt: now, updatedAt: now } });
    }
    for (const [index, template] of [
      ["order_confirmation_ar", "أهلًا {{1}}، وصلنا طلبك رقم {{2}} وحالته الآن: {{3}}. تتبعه من هنا: {{4}}"],
      ["cart_reminder_ar", "مرحبًا {{1}}، تركت منتجات في سلتك. أكمل طلبك من هنا: {{2}}"]
    ].entries()) {
      await tx.template.create({ data: { id: `tmpl-${tenantId}-${index}`, tenantId, name: template[0], message: template[1], type: "نص", category: "UTILITY", language: "ar", status: "معتمد", lastUsed: "-" } });
    }
    await tx.quickReply.create({ data: { id: `${tenantId}-qr-0`, tenantId, shortcut: "/شكرا", text: "شكرًا لتواصلك معنا، يسعدنا خدمتك دائمًا.", team: "الكل" } });
    await tx.adminLog.create({ data: { id: `log-${randomUUID()}`, at: now, createdAt: now, clientId: tenantId, clientName: "متجر الأناقة (ديمو)", source: "ديمو", level: "معلومة", message: "تم إنشاء مساحة ديمو مؤقتة." } });
  });

  await prisma.$executeRaw`INSERT INTO demo_workspaces (tenant_id, created_at, expires_at) VALUES (${tenantId}, ${now}, ${expiresAt})`;
  forgetDemoTenant(tenantId);

  // A "connected" WhatsApp number whose id starts with demo-: sends are answered locally (graphFetch), never by Meta.
  await getIntegrationSettings("whatsapp", tenantId);
  await prisma.integrationSetting.updateMany({
    where: { tenantId, id: getTenantIntegrationId("whatsapp", tenantId) },
    data: { status: "connected", businessName: "متجر الأناقة", wabaName: "متجر الأناقة (ديمو)", phoneNumber: "+966 50 000 0000", phoneNumberId: `demo-${code}`, wabaId: `demo-waba-${code}`, accessToken: "demo-not-a-real-token" }
  });
  await saveStoreTokens({ tenantId, store: "salla", accessToken: "demo-token", refreshToken: "", expiresAt: new Date(nowDate.getTime() + 30 * DAY_MS).toISOString(), merchantId: `demo-${code}`, merchantName: "متجر الأناقة (ديمو)" });
  await seedDemoSallaOrders(tenantId, CUSTOMERS);

  return { tenantId, userId, expiresAt };
}

/** Raw (lazy) tables that hold a workspace's rows; cleaned best-effort when the workspace goes. */
const RAW_TABLES = [
  "demo_salla_orders", "store_connections", "catalog_categories", "catalog_branches", "catalog_branch_stock", "catalog_branch_choice", "catalog_order_branch",
  "catalog_branch_links", "catalog_product_images", "catalog_carts", "catalog_pickup_choice", "catalog_checkout_flow", "loyalty_settings", "loyalty_progress"
];

/** Deletes the demo workspaces past their time (everything of theirs), returns how many went. */
export async function deleteExpiredDemoWorkspaces(now = new Date()): Promise<number> {
  await ensureCatalogSchema();
  const expired = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM demo_workspaces WHERE expires_at < ${now.toISOString()} LIMIT 50`;
  let removed = 0;
  for (const row of expired) {
    try {
      await deleteTenant(row.tenant_id);
    } catch (error) {
      console.error("Demo workspace delete failed", { tenantId: row.tenant_id, error });
      continue;
    }
    for (const table of RAW_TABLES) {
      try {
        await prisma.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE tenant_id = ${row.tenant_id}`);
      } catch {
        // A table that does not exist yet (or has no tenant_id) has nothing to remove.
      }
    }
    await prisma.$executeRaw`DELETE FROM demo_workspaces WHERE tenant_id = ${row.tenant_id}`;
    forgetDemoTenant(row.tenant_id);
    removed += 1;
  }
  return removed;
}
