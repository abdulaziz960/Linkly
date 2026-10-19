import { prisma } from "./prisma";
import { getAppOrigin } from "./app-url";
import {
  createCartOrder,
  createOrder,
  formatPrice,
  getMerchantGatewayKey,
  getProduct,
  isProductAvailable,
  listBotProducts,
  reserveCartStock,
  type CatalogProduct
} from "./catalog";
import { addToCart, applyDiscountCode, CART_DETAILED_MAX_CHARS, clearCart, clearPendingProduct, formatCart, formatMoney, formatOrderSummary, getCart, maxUnitsFor, PENDING_DISCOUNT, removeDiscountCode, removeLine, resolveCart, setLineQuantity, setPendingProduct } from "./catalog-cart";
import { redeemDiscount, releaseDiscountUse } from "./catalog-discounts";
import { createMerchantInvoice, shortOrderNumber } from "./catalog-payments";
import { clearCheckoutState, getCheckoutState, getZidCatalogMode, isZidProduct, setCheckoutState } from "./catalog-zid";
import { createZidOrder } from "./zid-checkout";
import { formatMessageTime } from "./time";
import { sendWhatsAppCtaUrl, sendWhatsAppIdButtons } from "./whatsapp-send";

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
const ID_CART_ADD = "cartadd_";
const ID_CART_QTY = "cartqty_";
const ID_CART_VIEW = "cart_view";
const ID_CART_PAY = "cart_pay";
const ID_CART_CODE = "cart_code";
/** In the Zid checkout state, the product id that means "the whole cart". */
const CART_CHECKOUT = "__cart__";
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

  const textList = () => `${body}\n${products.map((product, index) => `${offset + index + 1}. ${productLine(product)}`).join("\n")}\n\nللإضافة إلى السلة اكتب: سلة + اسم المنتج، ولعرض السلة اكتب: السلة`;

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

  const cartUnits = (await getCart(ctx.conversationId)).lines.reduce((sum, line) => sum + line.quantity, 0);
  await sendWhatsAppIdButtons({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    to: ctx.recipientId,
    bodyText: hasMore ? "هل تريد رؤية المزيد من المنتجات؟" : "هل تحتاج مساعدة؟",
    buttons: [
      ...(hasMore ? [{ id: `${ID_MORE}${offset + CARDS_PER_PAGE}`, title: "عرض المزيد" }] : []),
      ...(cartUnits > 0 ? [{ id: ID_CART_VIEW, title: `السلة (${cartUnits})` }] : []),
      { id: ID_AGENT, title: "التحدث مع موظف" }
    ],
    displayText: hasMore ? "هل تريد رؤية المزيد من المنتجات؟" : "هل تحتاج مساعدة؟",
    author: AUTHOR
  });
  return true;
}

async function showProduct(ctx: CatalogCtx, product: CatalogProduct) {
  const details = productDetails(product);
  // Connected to Zid: payment is Zid's, and only a product from the store can be bought here; otherwise the merchant's own gateway.
  const zid = await getZidCatalogMode(ctx.tenantId);
  const paymentOn = zid.connected ? zid.ready && isZidProduct(product) : Boolean(await getMerchantGatewayKey(ctx.tenantId));

  if (ctx.channel !== "whatsapp") {
    const tail = (paymentOn ? `\n\nللشراء اكتب: شراء ${product.name}` : `\n\nلتقديم طلب اكتب: شراء ${product.name}${product.productUrl ? `\n\nصفحة المنتج: ${product.productUrl}` : ""}`) + `\nللإضافة إلى السلة اكتب: سلة ${product.name}`;
    await ctx.sendText(`${details}${tail}`);
    return;
  }

  const common = { tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, author: AUTHOR };
  const image = whatsappImageUrl(product);
  // Three buttons is WhatsApp's limit: add to the cart (any quantity), buy this one now, or back to all products.
  const nav = [{ id: ID_BACK, title: "كل المنتجات" }];
  const cartButton = { id: `${ID_CART_ADD}${product.id}`, title: "أضف للسلة" };

  const orderButton = { id: `${ID_ORDER}${product.id}`, title: paymentOn ? "اشترِ الآن" : "تقديم طلب" };

  // Payment off with a product page: the details message carries the "open the product page"
  // button (WhatsApp allows one URL button and never next to reply buttons), and the actions -
  // "submit an order" (lands in the Orders tab), all products, talk to an agent - follow right under it.
  if (!paymentOn && product.productUrl) {
    let sent = await sendWhatsAppCtaUrl({ ...common, bodyText: details, buttonLabel: "فتح صفحة المنتج", url: product.productUrl, displayText: details, headerImageUrl: image });
    if (!sent.ok && image) sent = await sendWhatsAppCtaUrl({ ...common, bodyText: details, buttonLabel: "فتح صفحة المنتج", url: product.productUrl, displayText: details });
    if (!sent.ok) await ctx.sendText(`${details}\n\nصفحة المنتج: ${product.productUrl}`);
    await sendWhatsAppIdButtons({ ...common, bodyText: "ماذا تريد أن تفعل؟", buttons: [cartButton, orderButton, ...nav], displayText: "ماذا تريد أن تفعل؟" });
    return;
  }

  // Payment on ("buy now" -> a payment link), or no product page: one message with the reply buttons.
  const buttons = [cartButton, orderButton, ...nav];
  let sent = await sendWhatsAppIdButtons({ ...common, bodyText: details, buttons, displayText: details, headerImageUrl: image });
  if (!sent.ok && image) sent = await sendWhatsAppIdButtons({ ...common, bodyText: details, buttons, displayText: details });
  if (!sent.ok) await ctx.sendText(details);
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

  // A Zid store: the order is created in the store itself (address questions first). Stock is Zid's to track.
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (zid.connected && zid.ready && isZidProduct(product)) {
    await setCheckoutState(ctx.tenantId, ctx.conversationId, { productId: product.id, step: "city", city: "" });
    await ctx.sendText("ممتاز 👌 لتجهيز طلبك أحتاج عنوان التوصيل.\nما اسم *مدينتك*؟\n(اكتب «إلغاء» للإيقاف)");
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
  // Connected to Zid, the merchant's own gateway is never used (a product that is not from the store, or
  // checkout not set up yet, goes to a person); otherwise the gateway when there is one.
  const gatewayKey = zid.connected ? "" : await getMerchantGatewayKey(ctx.tenantId);

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
        successUrl: `${origin}/order/thanks?o=${encodeURIComponent(order.id)}`,
        backUrl: `${origin}/order/thanks`,
        metadata: { order_id: order.id, product: product.name.slice(0, 100) }
      });
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { paymentId: invoice.id, paymentUrl: invoice.url, updatedAt: new Date().toISOString() } });
      await addOrderNote(ctx.conversationId, `طلب جديد بانتظار الدفع: ${summary}`);
      await ctx.sendText(`تم تجهيز طلبك ✅\nرقم الطلب: ${shortOrderNumber(order.id)}\n${summary}\n\nلإتمام الدفع بأمان اضغط على الرابط:\n${invoice.url}`);
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

// ---------- the cart ----------

const CART_HELP = "لتعديل الكمية اكتب: *تعديل 1 3* (رقم المنتج ثم الكمية)\nللحذف اكتب: *حذف 1*\nلتفريغ السلة اكتب: *تفريغ السلة*";

function cartButtons() {
  return [
    { id: ID_CART_PAY, title: "إتمام الدفع" },
    { id: ID_CART_CODE, title: "لدي كود خصم" },
    { id: ID_BACK, title: "متابعة التسوق" }
  ];
}

/** Shows the cart: each product with its quantity, the total, and the next steps. */
async function showCart(ctx: CatalogCtx, prefix = "") {
  const cart = await resolveCart(ctx.tenantId, ctx.conversationId);
  if (!cart.lines.length) {
    await ctx.sendText(`${prefix}${prefix ? "\n\n" : ""}سلتك فارغة حاليًا.`);
    await sendCatalogMenu(ctx, "اختر منتجًا لإضافته:");
    return;
  }
  const droppedNote = `${cart.dropped.length ? `\n\nلم يعد متوفرًا وتمت إزالته: ${cart.dropped.join("، ")}` : ""}${cart.discountNote ? `\n\nتم إلغاء كود الخصم (${cart.discountNote})` : ""}`;
  const head = prefix ? `${prefix}\n\n` : "";
  // A long cart would exceed WhatsApp's message limit: show one short line per product instead.
  const detailed = `${head}${formatCart(cart)}${droppedNote}`;
  const body = detailed.length > CART_DETAILED_MAX_CHARS ? `${head}${formatCart(cart, { compact: true })}${droppedNote}` : detailed;
  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(`${body}\n\n${CART_HELP}\nلإدخال كود خصم اكتب: كود + الكود\nللدفع اكتب: إتمام الدفع\nلمتابعة التسوق اكتب: المنتجات`);
    return;
  }
  const sent = await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: `${body}\n\n${CART_HELP}`, buttons: cartButtons(), displayText: body, author: AUTHOR });
  if (!sent.ok) await ctx.sendText(`${body}\n\n${CART_HELP}\nللدفع اكتب: إتمام الدفع`);
}

/** "Add to cart" was pressed: ask how many (buttons for 1-3 on WhatsApp; any number can be typed). */
async function askQuantity(ctx: CatalogCtx, productId: string) {
  const product = await getProduct(ctx.tenantId, productId);
  if (!product || !isProductAvailable(product)) {
    await ctx.sendText("عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    return;
  }
  await setPendingProduct(ctx.tenantId, ctx.conversationId, product.id);
  const max = maxUnitsFor(product);
  const question = `كم قطعة من *${product.name}* تريد؟\nاختر من الأزرار أو اكتب الرقم${max < 99 ? ` (المتاح ${max})` : ""}.`;
  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(`${question}\nمثال: 2`);
    return;
  }
  const sent = await sendWhatsAppIdButtons({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    to: ctx.recipientId,
    bodyText: question,
    buttons: [1, 2, 3].filter((count) => count <= max).map((count) => ({ id: `${ID_CART_QTY}${count}`, title: String(count) })),
    displayText: question,
    author: AUTHOR
  });
  if (!sent.ok) await ctx.sendText(`${question}\nمثال: 2`);
}

/** The quantity came in (a button or a typed number): put it in the cart and show the cart. */
async function addPendingToCart(ctx: CatalogCtx, productId: string, quantity: number) {
  const result = await addToCart(ctx.tenantId, ctx.conversationId, productId, quantity);
  if (!result.ok) {
    await ctx.sendText(result.reason === "cart-full" ? "وصلت سلتك للحد الأقصى من المنتجات. أتمّ الطلب أو احذف منتجًا." : "عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    return;
  }
  const product = await getProduct(ctx.tenantId, productId);
  const note = result.capped ? `\n(الكمية المتاحة من هذا المنتج ${result.quantity} فقط)` : "";
  await showCart(ctx, `تمت إضافة ${product ? `«${product.name}»` : "المنتج"} إلى السلة${note}`);
}

/** One line for the conversation's internal note: "name ×qty، name ×qty". */
/** "I have a discount code": the next message the customer sends is the code. */
async function askDiscountCode(ctx: CatalogCtx) {
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (zid.connected) {
    await ctx.sendText("أكواد الخصم غير متاحة حاليًا. يمكنك إتمام الطلب من السلة.");
    return;
  }
  const cart = await resolveCart(ctx.tenantId, ctx.conversationId);
  if (!cart.lines.length) {
    await showCart(ctx);
    return;
  }
  await setPendingProduct(ctx.tenantId, ctx.conversationId, PENDING_DISCOUNT);
  await ctx.sendText("اكتب كود الخصم الآن.\n(أو اكتب «إلغاء» للرجوع إلى السلة)");
}

/** A code came in (typed after the button, or as "كود XXXX"): apply it and show the cart with the discount. */
async function applyCodeAndShow(ctx: CatalogCtx, code: string) {
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (zid.connected) {
    await clearPendingProduct(ctx.tenantId, ctx.conversationId);
    await ctx.sendText("أكواد الخصم غير متاحة حاليًا. يمكنك إتمام الطلب من السلة.");
    return;
  }
  const result = await applyDiscountCode(ctx.tenantId, ctx.conversationId, code);
  if (!result.ok) {
    // Stay waiting for a code: the customer may have mistyped it.
    await ctx.sendText(`${result.reason}.\nجرّب كودًا آخر، أو اكتب «إلغاء» للرجوع إلى السلة.`);
    return;
  }
  await clearPendingProduct(ctx.tenantId, ctx.conversationId);
  await showCart(ctx, `تم تطبيق الكود ${result.code}، وفّرت ${formatMoney(result.amount)}`);
}

function notesLine(cart: Awaited<ReturnType<typeof resolveCart>>) {
  return cart.lines.map((line) => `${line.product.name} ×${line.quantity}`).join("، ");
}


/** "Complete payment": one order for the whole cart and one payment link for its total. */
async function checkoutCart(ctx: CatalogCtx) {
  const cart = await resolveCart(ctx.tenantId, ctx.conversationId);
  if (!cart.lines.length) {
    await showCart(ctx);
    return;
  }

  // A code that stopped working (used up by someone else, expired...) changes the total: show it before charging.
  if (cart.discountNote) {
    await showCart(ctx, `تم إلغاء كود الخصم (${cart.discountNote}).\nراجع إجمالي سلتك قبل الدفع.`);
    return;
  }

  // Less stock than they asked for: change the quantity, show the cart, and let them confirm again.
  if (cart.adjusted.length) {
    for (const change of cart.adjusted) await setLineQuantity(ctx.tenantId, ctx.conversationId, change.position, change.to);
    await showCart(ctx, `تغيّرت الكمية المتاحة:\n${cart.adjusted.map((change) => `${change.name}: من ${change.from} إلى ${change.to}`).join("\n")}`);
    return;
  }

  // A Zid store: the order is created in the store itself, after the address questions.
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (zid.connected && zid.ready && cart.lines.every((line) => isZidProduct(line.product))) {
    await setCheckoutState(ctx.tenantId, ctx.conversationId, { productId: CART_CHECKOUT, step: "city", city: "" });
    await ctx.sendText(`لتجهيز طلبك أحتاج عنوان التوصيل.\nما اسم *مدينتك*؟\n(اكتب «إلغاء» للإيقاف)`);
    return;
  }

  // The discount code is taken first (its last use can go to someone else), and given back if the stock then fails.
  if (cart.discount && !(await redeemDiscount(ctx.tenantId, cart.discount.id))) {
    await removeDiscountCode(ctx.tenantId, ctx.conversationId);
    await showCart(ctx, `كود الخصم (${cart.discount.code}) لم يعد متاحًا، وتم إلغاؤه من السلة.`);
    return;
  }
  const reserved = await reserveCartStock(ctx.tenantId, cart.lines);
  if (!reserved.ok) {
    if (cart.discount) await releaseDiscountUse(ctx.tenantId, cart.discount.id);
    await ctx.sendText(`عذرًا، نفدت الكمية من «${reserved.productName}» للتو. عدّل سلتك ثم أعد المحاولة.`);
    await showCart(ctx);
    return;
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: ctx.conversationId }, include: { customer: true } });
  const customerName = conversation?.customer.name || "";
  const customerPhone = conversation?.customer.phone || "";
  const gatewayKey = zid.connected ? "" : await getMerchantGatewayKey(ctx.tenantId);

  const order = await createCartOrder({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    customerName,
    customerPhone,
    lines: cart.lines.map((line) => ({ product: line.product, quantity: line.quantity })),
    status: gatewayKey ? "awaiting_payment" : "new",
    discount: cart.discount
  });
  const orderText = formatOrderSummary(cart);
  const totalText = formatMoney(order.total, order.currency);

  if (gatewayKey) {
    try {
      const origin = getAppOrigin();
      const invoice = await createMerchantInvoice({
        secretKey: gatewayKey,
        amount: order.total,
        description: `${cart.lines.length > 1 ? `${cart.lines.length} منتجات` : cart.lines[0].product.name}`.slice(0, 120),
        callbackUrl: `${origin}/api/catalog/payment-webhook?o=${encodeURIComponent(order.id)}`,
        successUrl: `${origin}/order/thanks?o=${encodeURIComponent(order.id)}`,
        backUrl: `${origin}/order/thanks`,
        metadata: { order_id: order.id, product: cart.lines.map((line) => `${line.product.name}×${line.quantity}`).join(", ").slice(0, 100) }
      });
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { paymentId: invoice.id, paymentUrl: invoice.url, updatedAt: new Date().toISOString() } });
      await clearCart(ctx.conversationId);
      await addOrderNote(ctx.conversationId, `طلب جديد بانتظار الدفع (${cart.units} قطعة): ${notesLine(cart)} - ${totalText}`);
      await ctx.sendText(`تم تجهيز طلبك\nرقم الطلب: ${shortOrderNumber(order.id)}\n\n${orderText}\n\nلإتمام الدفع بأمان اضغط على الرابط:\n${invoice.url}`);
      return;
    } catch {
      // The merchant's key/account is the likely culprit - fall through to a human follow-up.
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { status: "new", updatedAt: new Date().toISOString() } });
    }
  }

  await clearCart(ctx.conversationId);
  await reopenForStaff(ctx.conversationId);
  await addOrderNote(ctx.conversationId, `طلب جديد يحتاج متابعة (${cart.units} قطعة): ${notesLine(cart)} - ${totalText}`);
  await ctx.sendText(`تم استلام طلبك\n\n${orderText}\n\nسيتواصل معك أحد موظفينا قريبًا لإتمام الطلب.`);
}

/** Next step of the address questions: the city, then the address, then the order is created in Zid. */
async function continueZidCheckout(ctx: CatalogCtx, state: { productId: string; step: "city" | "address"; city: string }, text: string): Promise<boolean> {
  if (!text) return false;
  if (/^(إلغاء|الغاء|cancel)$/i.test(text)) {
    await clearCheckoutState(ctx.conversationId);
    await ctx.sendText("تم إلغاء الطلب. يمكنك اختيار منتج آخر متى شئت.");
    return true;
  }
  if (state.step === "city") {
    if (text.length > 60) {
      await ctx.sendText("اكتب اسم المدينة فقط، مثل: الرياض");
      return true;
    }
    await setCheckoutState(ctx.tenantId, ctx.conversationId, { productId: state.productId, step: "address", city: text });
    await ctx.sendText("وما *عنوانك* بالتفصيل؟ (الحي والشارع ورقم المبنى)");
    return true;
  }

  // The address came in: create the order in the store.
  await clearCheckoutState(ctx.conversationId);
  if (state.productId === CART_CHECKOUT) return finishZidCartCheckout(ctx, state.city, text);
  const product = await getProduct(ctx.tenantId, state.productId);
  const conversation = await prisma.conversation.findUnique({ where: { id: ctx.conversationId }, include: { customer: true } });
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (!product || !isProductAvailable(product) || !conversation || !zid.ready || !isZidProduct(product)) {
    await ctx.sendText("عذرًا، تعذّر تجهيز الطلب الآن. سيتواصل معك أحد موظفينا قريبًا.");
    await reopenForStaff(ctx.conversationId);
    return true;
  }

  const customerName = conversation.customer.name;
  const created = await createZidOrder(ctx.tenantId, {
    customerName,
    phone: conversation.customer.phone,
    city: state.city,
    addressLine: text,
    sku: product.sku,
    quantity: 1,
    shippingMethodId: zid.shippingMethodId,
    paymentMethodId: zid.paymentMethodId,
    linkValidHours: zid.linkValidHours,
    currency: product.currency
  });

  const order = await createOrder({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    customerName,
    customerPhone: conversation.customer.phone,
    product,
    status: created.ok && created.paymentLink ? "awaiting_payment" : "new"
  });
  const summary = `${product.name} - ${formatPrice(order.total, order.currency)}`;

  if (created.ok && created.paymentLink) {
    await prisma.catalogOrder.update({ where: { id: order.id }, data: { paymentId: `zid-${created.orderId}`, paymentUrl: created.paymentLink, updatedAt: new Date().toISOString() } });
    await addOrderNote(ctx.conversationId, `طلب جديد في متجر زد (${created.code}) بانتظار الدفع: ${summary}`);
    await ctx.sendText(`تم تجهيز طلبك ✅\nرقم الطلب: ${created.code}\n${summary}\n\nلإتمام الدفع بأمان اضغط على الرابط:\n${created.paymentLink}`);
    return true;
  }

  // Zid refused the order (an address its shipping does not cover, a product without stock...): a person finishes it.
  console.error("Zid order creation failed", created.ok ? "no payment link" : created.message);
  await reopenForStaff(ctx.conversationId);
  await addOrderNote(ctx.conversationId, `طلب يحتاج متابعة (تعذر إنشاؤه في زد${created.ok ? "" : `: ${created.message}`}): ${summary}\nالمدينة: ${state.city}\nالعنوان: ${text}`);
  await ctx.sendText(`تم استلام طلبك ✅\n${summary}\n\nسيتواصل معك أحد موظفينا قريبًا لإتمام الطلب.`);
  return true;
}

/** The address of a Zid cart checkout came in: one order in the store with every product of the cart. */
async function finishZidCartCheckout(ctx: CatalogCtx, city: string, addressLine: string): Promise<boolean> {
  const cart = await resolveCart(ctx.tenantId, ctx.conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: ctx.conversationId }, include: { customer: true } });
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (!cart.lines.length || !conversation || !zid.ready || !cart.lines.every((line) => isZidProduct(line.product))) {
    await ctx.sendText("عذرًا، تعذّر تجهيز الطلب الآن. سيتواصل معك أحد موظفينا قريبًا.");
    await reopenForStaff(ctx.conversationId);
    return true;
  }

  const customerName = conversation.customer.name;
  const created = await createZidOrder(ctx.tenantId, {
    customerName,
    phone: conversation.customer.phone,
    city,
    addressLine,
    lines: cart.lines.map((line) => ({ sku: line.product.sku, quantity: line.quantity })),
    shippingMethodId: zid.shippingMethodId,
    paymentMethodId: zid.paymentMethodId,
    linkValidHours: zid.linkValidHours,
    currency: cart.currency
  });

  const order = await createCartOrder({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    customerName,
    customerPhone: conversation.customer.phone,
    lines: cart.lines.map((line) => ({ product: line.product, quantity: line.quantity })),
    status: created.ok && created.paymentLink ? "awaiting_payment" : "new"
  });
  const orderText = formatOrderSummary(cart);
  const totalText = formatMoney(order.total, order.currency);

  if (created.ok && created.paymentLink) {
    await prisma.catalogOrder.update({ where: { id: order.id }, data: { paymentId: `zid-${created.orderId}`, paymentUrl: created.paymentLink, updatedAt: new Date().toISOString() } });
    await clearCart(ctx.conversationId);
    await addOrderNote(ctx.conversationId, `طلب جديد في متجر زد (${created.code}) بانتظار الدفع (${cart.units} قطعة): ${notesLine(cart)} - ${totalText}`);
    await ctx.sendText(`تم تجهيز طلبك\nرقم الطلب: ${created.code}\n\n${orderText}\n\nلإتمام الدفع بأمان اضغط على الرابط:\n${created.paymentLink}`);
    return true;
  }

  console.error("Zid cart order creation failed", created.ok ? "no payment link" : created.message);
  await clearCart(ctx.conversationId);
  await reopenForStaff(ctx.conversationId);
  await addOrderNote(ctx.conversationId, `طلب يحتاج متابعة (تعذر إنشاؤه في زد${created.ok ? "" : `: ${created.message}`}): ${notesLine(cart)} - ${totalText}\nالمدينة: ${city}\nالعنوان: ${addressLine}`);
  await ctx.sendText(`تم استلام طلبك\n\n${orderText}\n\nسيتواصل معك أحد موظفينا قريبًا لإتمام الطلب.`);
  return true;
}

/**
 * Handles the customer's reply while the bot is waiting at a catalog step.
 * Returns "agent" when they asked for a human, "handled" when the reply was
 * understood, "ignored" for anything else (the bot stays quiet so a normal
 * chat with an employee isn't talked over).
 */
export async function handleCatalogReply(ctx: CatalogCtx, reply: { id?: string; text: string }, intro: string): Promise<"handled" | "agent" | "ignored"> {
  const id = reply.id || "";

  // Answering the address questions of a Zid checkout.
  if (!id) {
    const state = await getCheckoutState(ctx.conversationId);
    if (state && (await continueZidCheckout(ctx, state, reply.text.trim()))) return "handled";
  } else {
    // Any tap on the menu abandons a half-finished checkout.
    await clearCheckoutState(ctx.conversationId);
  }

  // The cart: a tapped button, or the quantity the customer was asked for.
  if (id.startsWith(ID_CART_QTY)) {
    const pending = (await getCart(ctx.conversationId)).pendingProductId;
    if (pending) await addPendingToCart(ctx, pending, Math.max(1, Number(id.slice(ID_CART_QTY.length)) || 1));
    else await showCart(ctx);
    return "handled";
  }
  if (id) await clearPendingProduct(ctx.tenantId, ctx.conversationId);
  if (id.startsWith(ID_CART_ADD)) {
    await askQuantity(ctx, id.slice(ID_CART_ADD.length));
    return "handled";
  }
  if (id === ID_CART_VIEW) {
    await showCart(ctx);
    return "handled";
  }
  if (id === ID_CART_PAY) {
    await checkoutCart(ctx);
    return "handled";
  }
  if (id === ID_CART_CODE) {
    await askDiscountCode(ctx);
    return "handled";
  }

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

  const cartState = await getCart(ctx.conversationId);
  // Waiting for a discount code: whatever they send is the code (or "cancel").
  if (cartState.pendingProductId === PENDING_DISCOUNT) {
    if (/^(إلغاء|الغاء|cancel)$/i.test(text)) {
      await clearPendingProduct(ctx.tenantId, ctx.conversationId);
      await showCart(ctx);
      return "handled";
    }
    await applyCodeAndShow(ctx, text);
    return "handled";
  }
  // Waiting for a quantity: a number is the quantity (never a product pick).
  if (cartState.pendingProductId) {
    if (/^\d{1,2}$/.test(text) && Number(text) >= 1) {
      await addPendingToCart(ctx, cartState.pendingProductId, Number(text));
      return "handled";
    }
    await ctx.sendText("اكتب الكمية رقمًا فقط، مثل: 2");
    return "handled";
  }

  // Cart commands, typed (the only way on channels without buttons).
  if (/^(?:السلة|سلتي|عرض السلة|cart|my cart)$/i.test(text)) {
    await showCart(ctx);
    return "handled";
  }
  if (/^(?:إتمام الدفع|اتمام الدفع|ادفع|الدفع|checkout|pay)$/i.test(text)) {
    await checkoutCart(ctx);
    return "handled";
  }
  if (/^(?:تفريغ السلة|افراغ السلة|إفراغ السلة|clear cart)$/i.test(text)) {
    await clearCart(ctx.conversationId);
    await ctx.sendText("تم تفريغ السلة.");
    return "handled";
  }
  const codeCommand = text.match(/^(?:كود|خصم|كوبون|code|coupon)\s+(\S+)$/i);
  if (codeCommand) {
    await applyCodeAndShow(ctx, codeCommand[1]);
    return "handled";
  }
  if (/^(?:حذف الكود|إلغاء الكود|الغاء الكود|remove code)$/i.test(text)) {
    await removeDiscountCode(ctx.tenantId, ctx.conversationId);
    await showCart(ctx, "تم إلغاء كود الخصم.");
    return "handled";
  }
  const remove = text.match(/^(?:حذف|احذف|remove)\s+(\d{1,2})$/i);
  if (remove) {
    const ok = await removeLine(ctx.tenantId, ctx.conversationId, Number(remove[1]));
    await showCart(ctx, ok ? "تم حذف المنتج من السلة." : "لا يوجد منتج بهذا الرقم في السلة.");
    return "handled";
  }
  const change = text.match(/^(?:تعديل|عدل|edit)\s+(\d{1,2})\s+(\d{1,2})$/i);
  if (change) {
    const ok = await setLineQuantity(ctx.tenantId, ctx.conversationId, Number(change[1]), Number(change[2]));
    await showCart(ctx, ok ? "تم تعديل الكمية." : "لا يوجد منتج بهذا الرقم في السلة.");
    return "handled";
  }

  // Channels without tappable ids: "3" picks the 3rd listed product, "شراء <name>" buys, a name opens it.
  const products = await listBotProducts(ctx.tenantId, 10);
  const buy = text.match(/^(?:شراء|اشتري|اشترِ|buy)\s+(.+)$/i);
  const addCommand = text.match(/^(?:سلة|أضف|اضف|add)\s+(.+)$/i);
  const needle = (buy ? buy[1] : addCommand ? addCommand[1] : text).trim();
  const numeric = /^\d+$/.test(needle) ? Number(needle) : null;
  const picked = (numeric ? products[numeric - 1] : undefined)
    ?? products.find((product) => product.name === needle || product.name.slice(0, 24) === needle);
  if (picked) {
    if (buy) await purchase(ctx, picked.id);
    else if (addCommand) await askQuantity(ctx, picked.id);
    else await showProduct(ctx, picked);
    return "handled";
  }

  if (/منتج|كتالوج|قائمة|المنتجات|menu|catalog/i.test(text)) {
    await sendCatalogMenu(ctx, intro);
    return "handled";
  }

  return "ignored";
}
