import { prisma } from "./prisma";
import { getAppOrigin } from "./app-url";
import {
  createOrder,
  formatPrice,
  getMerchantGatewayKey,
  getProduct,
  isProductAvailable,
  listBotProducts,
  type CatalogProduct
} from "./catalog";
import { createMerchantInvoice } from "./catalog-payments";
import { formatMessageTime } from "./time";
import { sendWhatsAppIdButtons, sendWhatsAppImageByUrl, sendWhatsAppRowList } from "./whatsapp-send";

/**
 * The in-chat shopping flow behind the bot's "عرض الكتالوج" step: browse the
 * products, open one, buy it. WhatsApp gets native pickers/buttons whose ids
 * carry the product (prod_<id> / buy_<id>), so a tap is unambiguous even for
 * long or duplicate names; other channels fall back to a numbered text list.
 *
 * Kept free of any import from bot-engine (which imports this) - text sends
 * come in through `sendText`.
 */

export type CatalogChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

export type CatalogCtx = {
  channel: CatalogChannel;
  tenantId: string;
  conversationId: string;
  recipientId: string;
  sendText: (text: string) => Promise<unknown>;
};

const AUTHOR = "الرد الآلي";
export const CATALOG_DEFAULT_INTRO = "أهلًا بك 👋 تصفّح منتجاتنا واختر ما يناسبك:";

const ID_PRODUCT = "prod_";
const ID_BUY = "buy_";
const ID_BACK = "cat_back";
const ID_AGENT = "cat_agent";

function productLine(product: CatalogProduct) {
  return `${product.name} - ${formatPrice(product.price, product.currency)}`;
}

function productDetails(product: CatalogProduct) {
  const parts = [`*${product.name}*`, `السعر: ${formatPrice(product.price, product.currency)}`];
  if (product.description) parts.push(product.description.slice(0, 600));
  if (product.stock > 0 && product.stock <= 5) parts.push(`متبقي ${product.stock} فقط`);
  return parts.join("\n");
}

export async function sendCatalogMenu(ctx: CatalogCtx, intro: string): Promise<boolean> {
  const products = await listBotProducts(ctx.tenantId, 10);
  const body = intro.trim() || CATALOG_DEFAULT_INTRO;

  if (!products.length) {
    await ctx.sendText("لا توجد منتجات متاحة حاليًا. سيتواصل معك أحد موظفينا قريبًا.");
    return false;
  }

  const displayText = `${body}\n${products.map((product, index) => `${index + 1}. ${productLine(product)}`).join("\n")}`;

  if (ctx.channel === "whatsapp") {
    const result = await sendWhatsAppRowList({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      to: ctx.recipientId,
      bodyText: body,
      buttonLabel: "عرض المنتجات",
      rows: products.map((product) => ({
        id: `${ID_PRODUCT}${product.id}`,
        title: product.name,
        description: formatPrice(product.price, product.currency) + (product.category ? ` · ${product.category}` : "")
      })),
      displayText,
      author: AUTHOR
    });
    if (result.ok) return true;
  }

  await ctx.sendText(displayText);
  return true;
}

async function showProduct(ctx: CatalogCtx, product: CatalogProduct) {
  const details = productDetails(product);

  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(`${details}\n\nللشراء اكتب: شراء ${product.name}`);
    return;
  }

  let sentImage = false;
  if (product.imageUrl) {
    const image = await sendWhatsAppImageByUrl({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      to: ctx.recipientId,
      imageUrl: product.imageUrl,
      caption: details,
      author: AUTHOR
    });
    sentImage = Boolean(image.ok);
  }

  const buttons = await sendWhatsAppIdButtons({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    to: ctx.recipientId,
    bodyText: sentImage ? "هل تريد شراء هذا المنتج؟" : details,
    buttons: [
      { id: `${ID_BUY}${product.id}`, title: "🛒 اشترِ الآن" },
      { id: ID_BACK, title: "كل المنتجات" },
      { id: ID_AGENT, title: "التحدث مع موظف" }
    ],
    displayText: sentImage ? "هل تريد شراء هذا المنتج؟" : details,
    author: AUTHOR
  });
  if (!buttons.ok && !sentImage) await ctx.sendText(details);
}

async function reopenForStaff(conversationId: string) {
  // A bot-handled conversation sits "closed" so it stays out of agents'
  // queues; an order needs a human, so put it back in the unassigned queue.
  await prisma.conversation.updateMany({ where: { id: conversationId, status: "closed" }, data: { status: "unassigned", assignee: "بدون موظف" } });
}

async function addOrderNote(conversationId: string, text: string) {
  const now = new Date();
  await prisma.message.create({
    data: {
      id: `sys-order-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      direction: "note",
      text,
      time: formatMessageTime(now),
      createdAt: now.toISOString(),
      author: "",
      sourceType: "catalog_order"
    }
  }).catch((error) => console.error("Failed to log catalog order note", error));
}

async function purchase(ctx: CatalogCtx, productId: string) {
  const product = await getProduct(ctx.tenantId, productId);
  if (!product || !isProductAvailable(product)) {
    await ctx.sendText("عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    await sendCatalogMenu(ctx, "يمكنك اختيار منتج آخر:");
    return;
  }

  // Tracked stock: take one unit atomically so two customers can't both buy the last one.
  if (product.stock > 0) {
    const taken = await prisma.product.updateMany({ where: { id: product.id, tenantId: ctx.tenantId, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
    if (taken.count === 0) {
      await ctx.sendText("عذرًا، نفدت الكمية من هذا المنتج للتو.");
      return;
    }
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: ctx.conversationId }, include: { customer: true } });
  const customerName = conversation?.customer.name || "";
  const customerPhone = conversation?.customer.phone || "";
  const gatewayKey = await getMerchantGatewayKey(ctx.tenantId);

  const order = await createOrder({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    customerName,
    customerPhone,
    product,
    status: gatewayKey ? "awaiting_payment" : "new"
  });
  const summary = `${product.name} - ${formatPrice(order.total, order.currency)}`;

  if (gatewayKey) {
    try {
      const origin = getAppOrigin();
      const invoice = await createMerchantInvoice({
        secretKey: gatewayKey,
        amount: order.total,
        description: product.name,
        callbackUrl: `${origin}/api/catalog/payment-webhook?o=${encodeURIComponent(order.id)}`,
        successUrl: `${origin}/order/thanks`,
        backUrl: `${origin}/order/thanks`,
        metadata: { order_id: order.id, product: product.name.slice(0, 100) }
      });
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { paymentId: invoice.id, paymentUrl: invoice.url, updatedAt: new Date().toISOString() } });
      await addOrderNote(ctx.conversationId, `طلب جديد بانتظار الدفع: ${summary}`);
      await ctx.sendText(`تم تجهيز طلبك ✅\n${summary}\n\nلإتمام الدفع بأمان اضغط على الرابط:\n${invoice.url}`);
      return;
    } catch {
      // The merchant's key/account is the likely culprit - fall through to a
      // human follow-up instead of leaving the customer with nothing.
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { status: "new", updatedAt: new Date().toISOString() } });
    }
  }

  await reopenForStaff(ctx.conversationId);
  await addOrderNote(ctx.conversationId, `طلب جديد يحتاج متابعة: ${summary}`);
  const link = product.productUrl ? `\n\nيمكنك أيضًا إتمام الشراء من هنا:\n${product.productUrl}` : "";
  await ctx.sendText(`تم استلام طلبك ✅\n${summary}\n\nسيتواصل معك أحد موظفينا قريبًا لإتمام الطلب.${link}`);
}

/**
 * Handles the customer's reply while the bot is waiting at a catalog step.
 * Returns "agent" when they asked for a human, "handled" when the reply was
 * understood, "ignored" for anything else (the bot stays quiet so a normal
 * chat with an employee isn't talked over).
 */
export async function handleCatalogReply(ctx: CatalogCtx, reply: { id?: string; text: string }, intro: string): Promise<"handled" | "agent" | "ignored"> {
  const id = reply.id || "";

  if (id === ID_AGENT) return "agent";
  if (id === ID_BACK) {
    await sendCatalogMenu(ctx, intro);
    return "handled";
  }
  if (id.startsWith(ID_BUY)) {
    await purchase(ctx, id.slice(ID_BUY.length));
    return "handled";
  }
  if (id.startsWith(ID_PRODUCT)) {
    const product = await getProduct(ctx.tenantId, id.slice(ID_PRODUCT.length));
    if (product && isProductAvailable(product)) await showProduct(ctx, product);
    else await ctx.sendText("عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    return "handled";
  }

  const text = reply.text.trim();
  if (!text) return "ignored";

  // Channels without tappable ids: "3" picks the 3rd listed product, "شراء <name>" buys, a name opens it.
  const products = await listBotProducts(ctx.tenantId, 10);
  const buy = text.match(/^(?:شراء|اشتري|اشترِ|buy)\s+(.+)$/i);
  const needle = (buy ? buy[1] : text).trim();
  const numeric = /^\d+$/.test(needle) ? Number(needle) : null;
  const picked = (numeric ? products[numeric - 1] : undefined)
    ?? products.find((product) => product.name === needle || product.name.slice(0, 24) === needle);
  if (picked) {
    if (buy) await purchase(ctx, picked.id);
    else await showProduct(ctx, picked);
    return "handled";
  }

  if (/منتج|كتالوج|قائمة|المنتجات|menu|catalog/i.test(text)) {
    await sendCatalogMenu(ctx, intro);
    return "handled";
  }

  return "ignored";
}
