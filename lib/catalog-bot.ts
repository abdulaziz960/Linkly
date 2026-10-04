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
import { sendWhatsAppIdButtons } from "./whatsapp-send";

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
const ID_MORE = "cat_more_";
const ID_ORDER = ID_BUY; // "اطلب الآن" reuses the buy flow (staff follow-up when payment is off)
const ID_BACK = "cat_back";
const ID_AGENT = "cat_agent";
const CARDS_PER_PAGE = 10;

/**
 * WhatsApp message images must be JPEG or PNG - a WebP link (very common on
 * merchant sites) is accepted by the API and then silently fails to deliver.
 * Anything not clearly JPEG/PNG goes through our converting route.
 */
function whatsappImageUrl(product: CatalogProduct): string | undefined {
  if (!product.imageUrl) return undefined;
  if (/\.(jpe?g|png)(\?|#|$)/i.test(product.imageUrl)) return product.imageUrl;
  return `${getAppOrigin()}/api/catalog/image/${encodeURIComponent(product.id)}`;
}

function productLine(product: CatalogProduct) {
  return `${product.name} - ${formatPrice(product.price, product.currency)}`;
}

function productDetails(product: CatalogProduct) {
  const parts = [`*${product.name}*`, `السعر: ${formatPrice(product.price, product.currency)}`];
  if (product.description) parts.push(product.description.slice(0, 600));
  if (product.stock > 0 && product.stock <= 5) parts.push(`متبقي ${product.stock} فقط`);
  return parts.join("\n");
}

export async function sendCatalogMenu(ctx: CatalogCtx, intro: string, offset = 0): Promise<boolean> {
  const body = intro.trim() || CATALOG_DEFAULT_INTRO;
  // One extra row tells us whether a "show more" button is needed.
  const fetched = await listBotProducts(ctx.tenantId, offset + CARDS_PER_PAGE + 1);
  const products = fetched.slice(offset, offset + CARDS_PER_PAGE);
  const hasMore = fetched.length > offset + CARDS_PER_PAGE;

  if (!products.length) {
    await ctx.sendText("لا توجد منتجات متاحة حاليًا. سيتواصل معك أحد موظفينا قريبًا.");
    return false;
  }

  const textList = () => `${body}\n${products.map((product, index) => `${offset + index + 1}. ${productLine(product)}`).join("\n")}`;

  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(textList());
    return true;
  }

  // WhatsApp: each product is a card - image on top, name and price, and a
  // "details" button. (Meta's native catalog messages need a Meta Commerce
  // catalog; image-header button messages work on any Cloud API number.)
  if (offset === 0) await ctx.sendText(body);
  let sentCards = 0;
  for (const product of products) {
    const caption = `*${product.name}*\n${formatPrice(product.price, product.currency)}`;
    const card = await sendWhatsAppIdButtons({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      to: ctx.recipientId,
      bodyText: caption,
      buttons: [{ id: `${ID_PRODUCT}${product.id}`, title: "عرض التفاصيل" }],
      displayText: caption,
      headerImageUrl: whatsappImageUrl(product),
      author: AUTHOR
    });
    // A bad image link makes Meta reject the header - retry as a text-only card.
    if (!card.ok && product.imageUrl) {
      const plain = await sendWhatsAppIdButtons({
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        to: ctx.recipientId,
        bodyText: caption,
        buttons: [{ id: `${ID_PRODUCT}${product.id}`, title: "عرض التفاصيل" }],
        displayText: caption,
        author: AUTHOR
      });
      if (plain.ok) sentCards += 1;
    } else if (card.ok) {
      sentCards += 1;
    }
  }

  if (sentCards === 0) {
    await ctx.sendText(textList());
    return true;
  }

  await sendWhatsAppIdButtons({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    to: ctx.recipientId,
    bodyText: hasMore ? "هل تريد رؤية المزيد من المنتجات؟" : "هل تحتاج مساعدة؟",
    buttons: [
      ...(hasMore ? [{ id: `${ID_MORE}${offset + CARDS_PER_PAGE}`, title: "عرض المزيد" }] : []),
      { id: ID_AGENT, title: "التحدث مع موظف" }
    ],
    displayText: hasMore ? "هل تريد رؤية المزيد من المنتجات؟" : "هل تحتاج مساعدة؟",
    author: AUTHOR
  });
  return true;
}

async function showProduct(ctx: CatalogCtx, product: CatalogProduct) {
  const details = productDetails(product);
  const paymentOn = Boolean(await getMerchantGatewayKey(ctx.tenantId));

  if (ctx.channel !== "whatsapp") {
    const tail = paymentOn ? `\n\nللشراء اكتب: شراء ${product.name}` : `\n\nلتقديم طلب اكتب: شراء ${product.name}${product.productUrl ? `\n\nصفحة المنتج: ${product.productUrl}` : ""}`;
    await ctx.sendText(`${details}${tail}`);
    return;
  }

  const common = { tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, author: AUTHOR };
  const image = whatsappImageUrl(product);
  const nav = [{ id: ID_BACK, title: "كل المنتجات" }, { id: ID_AGENT, title: "التحدث مع موظف" }];

  // Payment on -> "buy now" (a payment link). Payment off -> "submit an order": it lands in the
  // Orders tab and a team member follows up. The product page link rides in the message text,
  // since WhatsApp can't put a URL button next to reply buttons.
  const body = !paymentOn && product.productUrl ? `${details}\n\nصفحة المنتج: ${product.productUrl}` : details;
  const buttons = [{ id: `${ID_ORDER}${product.id}`, title: paymentOn ? "🛒 اشترِ الآن" : "تقديم طلب" }, ...nav];
  let sent = await sendWhatsAppIdButtons({ ...common, bodyText: body, buttons, displayText: body, headerImageUrl: image });
  if (!sent.ok && image) sent = await sendWhatsAppIdButtons({ ...common, bodyText: body, buttons, displayText: body });
  if (!sent.ok) await ctx.sendText(body);
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
  await ctx.sendText(`تم استلام طلبك ✅\n${summary}\n\nسيتواصل معك أحد موظفينا قريبًا لإتمام الطلب.`);
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
  if (id.startsWith(ID_MORE)) {
    await sendCatalogMenu(ctx, intro, Math.max(0, Number(id.slice(ID_MORE.length)) || 0));
    return "handled";
  }
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
