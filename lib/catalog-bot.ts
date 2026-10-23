import { prisma } from "./prisma";
import { buildCustomerTrackingReply, hasTrackableOrders } from "./order-tracking";
import { getAppOrigin } from "./app-url";
import {
  createCartOrder,
  createOrder,
  formatPrice,
  getMerchantGatewayKey,
  getProduct,
  isProductAvailable,
  listBotProducts,
  listBotCategories,
  reserveCartStock,
  updateOrderStatus,
  type CatalogProduct
} from "./catalog";
import { addToCart, applyDiscountCode, CART_DETAILED_MAX_CHARS, clearCart, clearPendingProduct, formatCart, formatMoney, formatOrderSummary, getCart, maxUnitsFor, PENDING_DISCOUNT, removeDiscountCode, removeLine, resolveCart, setLineQuantity, setPendingProduct, type ShippingQuote } from "./catalog-cart";
import { redeemDiscount, releaseDiscountUse } from "./catalog-discounts";
import { clearCheckoutFlow, getCheckoutFlow, setCheckoutFlow, type CheckoutFlow } from "./catalog-checkout-flow";
import { customerPaymentHistory, listPaymentChoices, startExternalPayment } from "./payments/registry";
import { PaymentProviderError, PROVIDER_BUTTON_LABELS, PROVIDER_LABELS, type ProviderKey } from "./payments/types";
import { getShippingMethod, hasConnectedStore, listShippingMethods, methodsForCity, servedCities, shippingFee, type ShippingMethod } from "./catalog-shipping";
import { createMerchantInvoice, shortOrderNumber } from "./catalog-payments";
import { clearCheckoutState, getCheckoutState, getZidCatalogMode, isZidProduct, setCheckoutState } from "./catalog-zid";
import { createZidOrder } from "./zid-checkout";
import { formatMessageTime } from "./time";
import { sendWhatsAppCtaUrl, sendWhatsAppIdButtons, sendWhatsAppRowList } from "./whatsapp-send";
import { clearPickupChoice, cleanCarDetails, cleanPlate, getPickupChoice, getPickupSettings, pickupText, recordOrderPickup, setPickupChoice, type PickupSettings } from "./catalog-pickup";
import { clearOptionFlow, getOptionFlow, groupsForProduct, resolveSelection, setOptionFlow, type OptionFlow, type OptionGroup } from "./catalog-options";

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
const ID_LIST = "catl_"; // catl_<offset>:<category> - a page of products (category "*" = all, "other" = uncategorised)
const ID_ORDER = ID_BUY; // "اطلب الآن" reuses the buy flow (staff follow-up when payment is off)
const ID_BACK = "cat_back";
const ID_AGENT = "cat_agent";
const ID_CART_ADD = "cartadd_";
const ID_FUL_DELIVERY = "ful_delivery";
const ID_FUL_PICKUP = "ful_pickup";
const ID_PICK_STORE = "pk_store";
const ID_PICK_CAR = "pk_car";
const ID_PICK_CONFIRM = "pk_confirm";
const ID_PICK_EDIT = "pk_edit";
const ID_OPT = "opt_";
const ID_OPT_DONE = "opt_done";
const ID_OPT_SKIP = "opt_skip";
const ID_CART_QTY = "cartqty_";
const ID_CART_VIEW = "cart_view";
const ID_TRACK = "track_order";
const ID_CART_PAY = "cart_pay";
const ID_CART_CODE = "cart_code";
const ID_SHIP = "ship_";
const ID_SHIP_CONFIRM = "ship_confirm";
const ID_SHIP_EDIT = "ship_edit";
const ID_PAY = "pay_";
/** In the Zid checkout state, the product id that means "the whole cart". */
const CART_CHECKOUT = "__cart__";
const CARDS_PER_PAGE = 9; // a WhatsApp list holds 10 rows: nine products and a "show more" row

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

function listRowFor(product: CatalogProduct) {
  const price = formatPrice(product.price, product.currency);
  // The row title is cut at 24 characters, so a longer name continues in the description next to the price.
  const description = product.name.length > 24 ? `${price} · ${product.name}` : price;
  return { id: `${ID_PRODUCT}${product.id}`, title: product.name, description: description.slice(0, 72) };
}

export async function sendCatalogMenu(ctx: CatalogCtx, intro: string, offset = 0, category?: string): Promise<boolean> {
  const body = intro.trim() || CATALOG_DEFAULT_INTRO;

  // WhatsApp with more than one category: the customer picks a category first.
  if (ctx.channel === "whatsapp" && category === undefined) {
    const categories = await listBotCategories(ctx.tenantId);
    if (categories.length > 1) {
      const rows = categories.slice(0, 9).map((entry) => ({
        id: `${ID_LIST}0:${entry.name || "other"}`.slice(0, 200),
        title: entry.name || "أخرى",
        description: `${entry.count} ${entry.count === 1 ? "منتج" : "منتجات"}`
      }));
      rows.push({ id: `${ID_LIST}0:*`, title: "كل المنتجات", description: "" });
      const sent = await sendWhatsAppRowList({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: body, buttonLabel: "الأقسام", rows, displayText: body, author: AUTHOR });
      if (sent.ok) {
        await sendMenuFooter(ctx, false);
        return true;
      }
    }
  }

  // One extra row tells us whether a "show more" row is needed.
  const fetched = await listBotProducts(ctx.tenantId, offset + CARDS_PER_PAGE + 1, category);
  const products = fetched.slice(offset, offset + CARDS_PER_PAGE);
  const hasMore = fetched.length > offset + CARDS_PER_PAGE;

  if (!products.length) {
    await ctx.sendText("لا توجد منتجات متاحة حاليًا. سيتواصل معك أحد موظفينا قريبًا.");
    return false;
  }

  const textList = () => `${body}\n${products.map((product, index) => `${offset + index + 1}. ${productLine(product)}`).join("\n")}\n\nللإضافة إلى السلة اكتب: سلة + اسم المنتج، ولعرض السلة اكتب: السلة\nولمتابعة طلبك اكتب: تتبع طلبي`;

  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(textList());
    return true;
  }

  // WhatsApp: one list - name and price per row; tapping a row opens the product card (image, description, buttons).
  // (Rows cannot carry images; Meta's native catalog messages need a Meta Commerce catalog.)
  const rows = products.map(listRowFor);
  if (hasMore) rows.push({ id: `${ID_LIST}${offset + CARDS_PER_PAGE}:${category ?? "*"}`.slice(0, 200), title: "عرض المزيد", description: "" });
  const listBody = category && category !== "*" ? `${category === "other" ? "أخرى" : category}\n${body}` : body;
  const sent = await sendWhatsAppRowList({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: offset === 0 ? listBody : "المزيد من المنتجات:", buttonLabel: "عرض المنتجات", rows, displayText: textList(), author: AUTHOR });
  if (!sent.ok) {
    await ctx.sendText(textList());
    return true;
  }
  await sendMenuFooter(ctx, hasMore);
  return true;
}

/** The cart / tracking / staff buttons that follow the product list. */
async function sendMenuFooter(ctx: CatalogCtx, hasMore: boolean) {
  const cartUnits = (await getCart(ctx.conversationId)).lines.reduce((sum, line) => sum + line.quantity, 0);
  const hasOrders = await hasTrackableOrders(ctx.tenantId, ctx.conversationId);
  const menuButtons = [
    ...(cartUnits > 0 ? [{ id: ID_CART_VIEW, title: `السلة (${cartUnits})` }] : []),
    ...(hasOrders ? [{ id: ID_TRACK, title: "تتبع طلبي" }] : []),
    { id: ID_AGENT, title: "التحدث مع موظف" }
  ];
  const text = hasMore ? "اختر من القائمة أعلاه أو اضغط «عرض المزيد»." : "هل تحتاج مساعدة؟";
  await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: text, buttons: menuButtons, displayText: text, author: AUTHOR });
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

/**
 * "Buy now" / "submit an order" on a product. For the platform's own catalog the product goes into the cart (one
 * unit, unless it is already there) and the cart opens, so the customer can change the quantity, enter a discount
 * code and then pay. A workspace connected to a Zid store keeps the direct single-product order (the store owns
 * prices, coupons and payment there).
 */
async function purchase(ctx: CatalogCtx, productId: string) {
  const zid = await getZidCatalogMode(ctx.tenantId);
  if (zid.connected) {
    await purchaseSingle(ctx, productId);
    return;
  }
  const product = await getProduct(ctx.tenantId, productId);
  if (!product || !isProductAvailable(product)) {
    await ctx.sendText("عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    await sendCatalogMenu(ctx, "يمكنك اختيار منتج آخر:");
    return;
  }
  // A product with choices (size, extras) asks them first, then goes into the cart.
  if ((await groupsForProduct(ctx.tenantId, product.id)).length) {
    await startProductChoices(ctx, product.id, "buy");
    return;
  }
  const cart = await getCart(ctx.conversationId);
  if (!cart.lines.some((line) => line.productId === product.id)) {
    const added = await addToCart(ctx.tenantId, ctx.conversationId, product.id, 1);
    if (!added.ok) {
      await ctx.sendText(added.reason === "cart-full" ? "وصلت سلتك للحد الأقصى من المنتجات. أتمّ الطلب أو احذف منتجًا." : "عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
      return;
    }
  }
  await showCart(ctx, `أضفنا «${product.name}» إلى سلتك. أتمّ الدفع من الزر، أو غيّر الكمية، أو أدخل كود خصم.`);
}

async function purchaseSingle(ctx: CatalogCtx, productId: string) {
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

/** Once a code is applied the "I have a discount code" button goes away: one code per order. */
function cartButtons(codeApplied: boolean) {
  return [
    { id: ID_CART_PAY, title: "إتمام الدفع" },
    ...(codeApplied ? [] : [{ id: ID_CART_CODE, title: "لدي كود خصم" }]),
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
    await ctx.sendText(`${body}\n\n${CART_HELP}\n${cart.discount ? "لإلغاء كود الخصم اكتب: حذف الكود" : "لإدخال كود خصم اكتب: كود + الكود"}\nللدفع اكتب: إتمام الدفع\nلمتابعة التسوق اكتب: المنتجات`);
    return;
  }
  const sent = await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: `${body}\n\n${CART_HELP}${cart.discount ? "\nلإلغاء كود الخصم اكتب: *حذف الكود*" : ""}`, buttons: cartButtons(Boolean(cart.discount)), displayText: body, author: AUTHOR });
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
  // The options the customer chose before being asked the quantity.
  const flow = await getOptionFlow(ctx.conversationId);
  const options = flow && flow.productId === productId && flow.groupIndex < 0 ? flow.chosen : [];
  const result = await addToCart(ctx.tenantId, ctx.conversationId, productId, quantity, options);
  await clearOptionFlow(ctx.conversationId);
  if (!result.ok) {
    await ctx.sendText(result.reason === "cart-full" ? "وصلت سلتك للحد الأقصى من المنتجات. أتمّ الطلب أو احذف منتجًا." : "عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    return;
  }
  const product = await getProduct(ctx.tenantId, productId);
  const selection = options.length ? resolveSelection(await groupsForProduct(ctx.tenantId, productId), options) : null;
  const label = product ? `«${product.name}${selection?.ok && selection.text ? ` (${selection.text})` : ""}»` : "المنتج";
  const note = result.capped ? `\n(الكمية المتاحة من هذا المنتج ${result.quantity} فقط)` : "";
  await showCart(ctx, `تمت إضافة ${label} إلى السلة${note}`);
}

// ---------- product choices (size, extras) ----------

/** "Add to cart" / "buy now" on a product: its choices are asked one group after another; without any, straight to the quantity. */
async function startProductChoices(ctx: CatalogCtx, productId: string, mode: "cart" | "buy") {
  const product = await getProduct(ctx.tenantId, productId);
  if (!product || !isProductAvailable(product)) {
    await ctx.sendText("عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
    return;
  }
  const groups = await groupsForProduct(ctx.tenantId, productId);
  if (!groups.length) {
    if (mode === "buy") await purchase(ctx, productId);
    else await askQuantity(ctx, productId);
    return;
  }
  await setOptionFlow(ctx.tenantId, ctx.conversationId, { productId, mode, groupIndex: 0, chosen: [] });
  await askOptionGroup(ctx, product, groups[0], [], "");
}

function optionPriceText(priceDelta: number) {
  return priceDelta > 0 ? `+${formatMoney(priceDelta)}` : "";
}

/** The question of one group: a WhatsApp list or buttons (the extras of a "several" group are picked one at a time, then "done"). */
async function askOptionGroup(ctx: CatalogCtx, product: CatalogProduct, group: OptionGroup, chosen: string[], note: string) {
  const picked = group.options.filter((option) => chosen.includes(option.id));
  const available = group.options.filter((option) => !chosen.includes(option.id));
  const hint = group.multiple ? (group.maxChoices ? `اختر حتى ${group.maxChoices} ثم اضغط «تم».` : "اختر ما تريد ثم اضغط «تم».") : group.required ? "اختر واحدًا." : "اختر واحدًا أو اضغط «بدون».";
  const body = `${note ? `${note}\n\n` : ""}*${product.name}*\n${group.name}${group.required ? "" : " (اختياري)"}\n${hint}${picked.length ? `\nاخترت: ${picked.map((option) => option.name).join("، ")}` : ""}`;
  const rows = available.map((option) => ({ id: `${ID_OPT}${option.id}`, title: option.name, description: optionPriceText(option.priceDelta) || undefined }));
  const finish = group.multiple ? { id: ID_OPT_DONE, title: "تم ✔" } : !group.required ? { id: ID_OPT_SKIP, title: "بدون" } : null;
  if (finish) rows.push({ ...finish, description: undefined });

  const numbered = () => `${body}\n${rows.map((row, index) => (row.id === ID_OPT_DONE || row.id === ID_OPT_SKIP ? `0) ${row.title}` : `${index + 1}) ${row.title}${row.description ? ` (${row.description})` : ""}`)).join("\n")}\nاكتب رقم الخيار، أو «إلغاء».`;
  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(numbered());
    return;
  }
  const common = { tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, author: AUTHOR };
  const sent = rows.length <= 3
    ? await sendWhatsAppIdButtons({ ...common, bodyText: body, buttons: rows.map((row) => ({ id: row.id, title: row.description ? `${row.title} ${row.description}` : row.title })), displayText: body })
    : await sendWhatsAppRowList({ ...common, bodyText: body, buttonLabel: "اختر", rows, displayText: body });
  if (!sent.ok) await ctx.sendText(numbered());
}

/** One answer of a product's choices. Returns false when the message is not for the flow. */
async function continueProductChoices(ctx: CatalogCtx, flow: OptionFlow, reply: { id?: string; text: string }): Promise<boolean> {
  const id = reply.id || "";
  const text = reply.text.trim();
  const product = await getProduct(ctx.tenantId, flow.productId);
  const groups = product ? await groupsForProduct(ctx.tenantId, flow.productId) : [];
  const group = groups[flow.groupIndex];
  if (!product || !isProductAvailable(product) || !group) {
    await clearOptionFlow(ctx.conversationId);
    await ctx.sendText("تغيّرت خيارات هذا المنتج. اختره من جديد.");
    return true;
  }
  if (!id && /^(إلغاء|الغاء|cancel)$/i.test(text)) {
    await clearOptionFlow(ctx.conversationId);
    await showProduct(ctx, product);
    return true;
  }

  const inGroup = (ids: string[]) => group.options.filter((option) => ids.includes(option.id));
  const available = group.options.filter((option) => !flow.chosen.includes(option.id));
  let optionId = "";
  let done = false;
  if (id === ID_OPT_DONE || id === ID_OPT_SKIP) done = true;
  else if (id.startsWith(ID_OPT)) optionId = id.slice(ID_OPT.length);
  else if (!id && /^\d{1,2}$/.test(text)) {
    if (Number(text) === 0) done = true;
    else optionId = available[Number(text) - 1]?.id ?? "";
  } else if (!id) {
    // A typed name of an option works too.
    optionId = available.find((option) => option.name === text)?.id ?? "";
    if (!optionId && /^(تم|انتهيت|بدون)$/i.test(text)) done = true;
  }

  let chosen = flow.chosen;
  if (done) {
    if (group.required && inGroup(chosen).length === 0) {
      await askOptionGroup(ctx, product, group, chosen, "اختر خيارًا واحدًا على الأقل.");
      return true;
    }
    return advanceChoices(ctx, product, groups, flow, chosen);
  }
  if (!optionId || !available.some((option) => option.id === optionId)) {
    await askOptionGroup(ctx, product, group, chosen, "اختر من الخيارات المعروضة.");
    return true;
  }
  chosen = [...chosen, optionId];
  if (group.multiple) {
    const count = inGroup(chosen).length;
    if ((group.maxChoices > 0 && count >= group.maxChoices) || count >= group.options.length) return advanceChoices(ctx, product, groups, flow, chosen);
    await setOptionFlow(ctx.tenantId, ctx.conversationId, { ...flow, chosen });
    await askOptionGroup(ctx, product, group, chosen, "");
    return true;
  }
  return advanceChoices(ctx, product, groups, flow, chosen);
}

/** The group is answered: the next group, or - all answered - the quantity (or straight into the cart for "buy now"). */
async function advanceChoices(ctx: CatalogCtx, product: CatalogProduct, groups: OptionGroup[], flow: OptionFlow, chosen: string[]): Promise<boolean> {
  const next = flow.groupIndex + 1;
  if (next < groups.length) {
    await setOptionFlow(ctx.tenantId, ctx.conversationId, { ...flow, groupIndex: next, chosen });
    await askOptionGroup(ctx, product, groups[next], chosen, "");
    return true;
  }
  const selection = resolveSelection(groups, chosen);
  if (!selection.ok) {
    await clearOptionFlow(ctx.conversationId);
    await ctx.sendText("تعذر تأكيد اختياراتك. اختر المنتج من جديد.");
    return true;
  }
  if (flow.mode === "buy") {
    const added = await addToCart(ctx.tenantId, ctx.conversationId, product.id, 1, chosen);
    await clearOptionFlow(ctx.conversationId);
    if (!added.ok) {
      await ctx.sendText(added.reason === "cart-full" ? "وصلت سلتك للحد الأقصى من المنتجات. أتمّ الطلب أو احذف منتجًا." : "عذرًا، هذا المنتج لم يعد متوفرًا حاليًا.");
      return true;
    }
    await showCart(ctx, `أضفنا «${product.name}${selection.text ? ` (${selection.text})` : ""}» إلى سلتك. أتمّ الدفع من الزر، أو غيّر الكمية، أو أدخل كود خصم.`);
    return true;
  }
  // The quantity comes next; the choices wait in the flow (group_index -1) until it arrives.
  await setOptionFlow(ctx.tenantId, ctx.conversationId, { ...flow, groupIndex: -1, chosen });
  await ctx.sendText(`اخترت: ${selection.text || "بدون إضافات"}${selection.delta > 0 ? ` (+${formatMoney(selection.delta)})` : ""}`);
  await askQuantity(ctx, product.id);
  return true;
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

  // The platform's own catalog, no store connected: with delivery or pickup set up, the customer says how the order reaches them first.
  await clearPickupChoice(ctx.conversationId);
  if (!zid.connected && !(await hasConnectedStore(ctx.tenantId))) {
    const methods = await listShippingMethods(ctx.tenantId, { activeOnly: true });
    const pickup = await getPickupSettings(ctx.tenantId);
    if (pickup.enabled && methods.length) {
      await askFulfillment(ctx);
      return;
    }
    if (pickup.enabled) {
      await startPickupFlow(ctx, pickup);
      return;
    }
    if (methods.length) {
      await startShippingFlow(ctx, methods);
      return;
    }
  }

  await proceedToPayment(ctx, cart, undefined);
}

// ---------- delivery questions ----------

type Delivery = { method: ShippingMethod; city: string; address: string };

function describeMethod(method: ShippingMethod, productsTotal: number) {
  const fee = shippingFee(method, productsTotal);
  return `${method.name}: ${fee > 0 ? formatMoney(fee) : "مجاني"}${method.eta ? ` (${method.eta})` : ""}`;
}

async function startShippingFlow(ctx: CatalogCtx, methods: ShippingMethod[]) {
  await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "city", data: {} });
  const served = servedCities(methods);
  const list = served && served.length && served.length <= 15 ? `\nالمدن المتاحة: ${served.join("، ")}` : "";
  await ctx.sendText(`لتجهيز طلبك أحتاج وجهة التوصيل.\nما اسم *مدينتك*؟${list}\n(اكتب «إلغاء» للرجوع إلى السلة)`);
}

/** Products total the delivery threshold is judged on: after any discount. */
function productsTotal(cart: Awaited<ReturnType<typeof resolveCart>>) {
  return Math.round((cart.subtotal - (cart.discount?.amount ?? 0)) * 100) / 100;
}

async function askAddress(ctx: CatalogCtx, flow: CheckoutFlow, method: ShippingMethod, cart: Awaited<ReturnType<typeof resolveCart>>) {
  await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "address", data: { ...flow.data, methodId: method.id } });
  await ctx.sendText(`سنوصل طلبك إلى ${flow.data.city} عبر ${describeMethod(method, productsTotal(cart))}.\nاكتب *عنوانك* بالتفصيل (الحي والشارع ورقم المبنى).`);
}

async function showDeliverySummary(ctx: CatalogCtx, delivery: Delivery, cart: Awaited<ReturnType<typeof resolveCart>>) {
  const quote: ShippingQuote = { methodName: delivery.method.name, city: delivery.city, fee: shippingFee(delivery.method, productsTotal(cart)), eta: delivery.method.eta };
  const body = `*ملخص الطلب*\n${formatOrderSummary(cart, quote)}\n\nالعنوان: ${delivery.address}${delivery.method.eta ? `\nمدة التوصيل: ${delivery.method.eta}` : ""}`;
  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(`${body}\n\nللتأكيد اكتب: تأكيد\nلتغيير العنوان اكتب: تعديل العنوان\nللإلغاء اكتب: إلغاء`);
    return;
  }
  const sent = await sendWhatsAppIdButtons({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    to: ctx.recipientId,
    bodyText: body,
    buttons: [{ id: ID_SHIP_CONFIRM, title: "تأكيد وإتمام الدفع" }, { id: ID_SHIP_EDIT, title: "تعديل العنوان" }],
    displayText: body,
    author: AUTHOR
  });
  if (!sent.ok) await ctx.sendText(`${body}\n\nللتأكيد اكتب: تأكيد\nلتغيير العنوان اكتب: تعديل العنوان`);
}

/** Resolves the delivery the flow collected against what is configured now (an option may have been removed meanwhile). */
async function deliveryFromFlow(ctx: CatalogCtx, flow: CheckoutFlow): Promise<Delivery | null> {
  const { city, methodId, address } = flow.data;
  if (!city || !methodId || !address) return null;
  const method = await getShippingMethod(ctx.tenantId, methodId);
  if (!method || !method.active || !methodsForCity([method], city).length) return null;
  return { method, city, address };
}

/**
 * One answer of the delivery questions. Returns false when the message is not for the flow (so normal handling goes on).
 * A tap on something else abandons the flow (done by the caller).
 */
async function continueShippingFlow(ctx: CatalogCtx, flow: CheckoutFlow, reply: { id?: string; text: string }): Promise<boolean> {
  const id = reply.id || "";
  const text = reply.text.trim();

  if (!id && /^(إلغاء|الغاء|cancel)$/i.test(text)) {
    await clearCheckoutFlow(ctx.conversationId);
    await showCart(ctx);
    return true;
  }

  const cart = await resolveCart(ctx.tenantId, ctx.conversationId);
  if (!cart.lines.length) {
    await clearCheckoutFlow(ctx.conversationId);
    await showCart(ctx);
    return true;
  }
  const methods = await listShippingMethods(ctx.tenantId, { activeOnly: true });

  // The payment method and Tabby's email come after the delivery questions (or alone, when there is no delivery).
  if (flow.step === "payment" || flow.step === "email") return continuePaymentFlow(ctx, flow, reply, cart);
  if (flow.step === "fulfillment" || flow.step === "pickup_kind" || flow.step === "plate" || flow.step === "car_details" || flow.step === "pickup_confirm") return continuePickupFlow(ctx, flow, reply, cart);

  if (!methods.length) {
    // Delivery was switched off meanwhile: carry on without it.
    await clearCheckoutFlow(ctx.conversationId);
    await proceedToPayment(ctx, cart, undefined);
    return true;
  }

  if (flow.step === "city") {
    if (!text || id) return false;
    if (text.length > 60) {
      await ctx.sendText("اكتب اسم المدينة فقط، مثل: الرياض");
      return true;
    }
    const matches = methodsForCity(methods, text);
    if (!matches.length) {
      const served = servedCities(methods);
      await ctx.sendText(`نعتذر، لا يتوفر التوصيل إلى «${text}» حاليًا.${served && served.length ? `\nالمدن المتاحة: ${served.slice(0, 15).join("، ")}${served.length > 15 ? "، وغيرها" : ""}` : ""}\nاكتب مدينة أخرى، أو «إلغاء» للرجوع إلى السلة.`);
      return true;
    }
    const withCity: CheckoutFlow = { step: "city", data: { city: text } };
    if (matches.length === 1) {
      await askAddress(ctx, withCity, matches[0], cart);
      return true;
    }
    await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "method", data: withCity.data });
    const total = productsTotal(cart);
    const options = matches.map((method, index) => `${index + 1}) ${describeMethod(method, total)}`).join("\n");
    if (ctx.channel === "whatsapp" && matches.length <= 3) {
      const body = `اختر طريقة التوصيل إلى ${text}:\n${options}`;
      const sent = await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: body, buttons: matches.map((method) => ({ id: `${ID_SHIP}${method.id}`, title: method.name.slice(0, 20) })), displayText: body, author: AUTHOR });
      if (!sent.ok) await ctx.sendText(`${body}\nاكتب رقم الخيار.`);
    } else {
      await ctx.sendText(`اختر طريقة التوصيل إلى ${text}:\n${options}\nاكتب رقم الخيار.`);
    }
    return true;
  }

  if (flow.step === "method") {
    const matches = methodsForCity(methods, flow.data.city ?? "");
    const picked = id.startsWith(ID_SHIP) && id !== ID_SHIP_CONFIRM && id !== ID_SHIP_EDIT
      ? matches.find((method) => method.id === id.slice(ID_SHIP.length))
      : /^\d{1,2}$/.test(text) ? matches[Number(text) - 1] : undefined;
    if (!picked) {
      await ctx.sendText("اختر طريقة التوصيل من الأزرار، أو اكتب رقم الخيار.");
      return true;
    }
    await askAddress(ctx, flow, picked, cart);
    return true;
  }

  if (flow.step === "address") {
    if (id || !text) return false;
    if (text.length < 6) {
      await ctx.sendText("اكتب العنوان بالتفصيل (الحي والشارع ورقم المبنى).");
      return true;
    }
    const next: CheckoutFlow = { step: "confirm", data: { ...flow.data, address: text.slice(0, 300) } };
    await setCheckoutFlow(ctx.tenantId, ctx.conversationId, next);
    const delivery = await deliveryFromFlow(ctx, next);
    if (!delivery) {
      await startShippingFlow(ctx, methods);
      return true;
    }
    await showDeliverySummary(ctx, delivery, cart);
    return true;
  }

  // step "confirm"
  if (id === ID_SHIP_EDIT || /^(تعديل العنوان|تغيير العنوان|تعديل)$/i.test(text)) {
    await startShippingFlow(ctx, methods);
    return true;
  }
  if (id === ID_SHIP_CONFIRM || /^(تأكيد|تاكيد|أكد|اكد|نعم|confirm|ok)$/i.test(text)) {
    const delivery = await deliveryFromFlow(ctx, flow);
    if (!delivery) {
      await ctx.sendText("تغيّرت خيارات التوصيل. لنُعد اختيار التوصيل.");
      await startShippingFlow(ctx, methods);
      return true;
    }
    await clearCheckoutFlow(ctx.conversationId);
    await proceedToPayment(ctx, cart, delivery);
    return true;
  }
  await ctx.sendText("للمتابعة اضغط «تأكيد وإتمام الدفع»، أو اكتب «تعديل العنوان»، أو «إلغاء».");
  return true;
}

// ---------- pickup (from the store or from the car) ----------

/** Both delivery and pickup are on: the customer picks how the order reaches them. */
async function askFulfillment(ctx: CatalogCtx) {
  await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "fulfillment", data: {} });
  const body = "كيف تريد استلام طلبك؟";
  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(`${body}\n1) توصيل\n2) استلام من المحل\nاكتب رقم الخيار، أو «إلغاء» للرجوع إلى السلة.`);
    return;
  }
  const sent = await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: body, buttons: [{ id: ID_FUL_DELIVERY, title: "توصيل" }, { id: ID_FUL_PICKUP, title: "استلام من المحل" }], displayText: body, author: AUTHOR });
  if (!sent.ok) await ctx.sendText(`${body}\n1) توصيل\n2) استلام من المحل`);
}

/** Pickup chosen (or the only way): from the store or the car when both are on; the car asks for the plate. */
async function startPickupFlow(ctx: CatalogCtx, settings: PickupSettings) {
  if (settings.inStore && settings.curbside) {
    await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "pickup_kind", data: {} });
    const body = `كيف تريد الاستلام؟${settings.note ? `\n${settings.note}` : ""}`;
    if (ctx.channel !== "whatsapp") {
      await ctx.sendText(`${body}\n1) من السيارة\n2) بنفسي من المحل\nاكتب رقم الخيار، أو «إلغاء».`);
      return;
    }
    const sent = await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: body, buttons: [{ id: ID_PICK_CAR, title: "من السيارة" }, { id: ID_PICK_STORE, title: "بنفسي من المحل" }], displayText: body, author: AUTHOR });
    if (!sent.ok) await ctx.sendText(`${body}\n1) من السيارة\n2) بنفسي من المحل`);
    return;
  }
  await choosePickupKind(ctx, settings.curbside ? "car" : "store", settings);
}

async function choosePickupKind(ctx: CatalogCtx, kind: "store" | "car", settings: PickupSettings) {
  if (kind === "car") {
    await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "plate", data: { pickupKind: "car" } });
    await ctx.sendText("اكتب *رقم لوحة سيارتك* ليخرج لك الموظف الطلب.\nمثال: أ ب ج 1234\n(اكتب «إلغاء» للرجوع إلى السلة)");
    return;
  }
  await askPickupConfirm(ctx, { step: "pickup_confirm", data: { pickupKind: "store" } }, settings);
}

async function askPickupConfirm(ctx: CatalogCtx, flow: CheckoutFlow, settings: PickupSettings) {
  await setCheckoutFlow(ctx.tenantId, ctx.conversationId, flow);
  const cart = await resolveCart(ctx.tenantId, ctx.conversationId);
  const pickup = { kind: (flow.data.pickupKind === "car" ? "car" : "store") as "car" | "store", plate: flow.data.plate ?? "", carDetails: flow.data.carDetails ?? "" };
  const body = `*ملخص الطلب*\n${formatOrderSummary(cart)}\n\n${pickupText(pickup)}${settings.note ? `\n${settings.note}` : ""}`;
  if (ctx.channel !== "whatsapp") {
    await ctx.sendText(`${body}\n\nللتأكيد اكتب: تأكيد\nلتغيير طريقة الاستلام اكتب: تعديل\nللإلغاء اكتب: إلغاء`);
    return;
  }
  const sent = await sendWhatsAppIdButtons({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, to: ctx.recipientId, bodyText: body, buttons: [{ id: ID_PICK_CONFIRM, title: "تأكيد وإتمام الدفع" }, { id: ID_PICK_EDIT, title: "تعديل" }], displayText: body, author: AUTHOR });
  if (!sent.ok) await ctx.sendText(`${body}\n\nللتأكيد اكتب: تأكيد\nللتعديل اكتب: تعديل`);
}

/** One answer of the pickup questions. Returns false when the message is not for the flow. */
async function continuePickupFlow(ctx: CatalogCtx, flow: CheckoutFlow, reply: { id?: string; text: string }, cart: Awaited<ReturnType<typeof resolveCart>>): Promise<boolean> {
  const id = reply.id || "";
  const text = reply.text.trim();
  const settings = await getPickupSettings(ctx.tenantId);
  if (!settings.enabled) {
    // Pickup was switched off meanwhile: back to the usual checkout.
    await clearCheckoutFlow(ctx.conversationId);
    await checkoutCart(ctx);
    return true;
  }

  if (flow.step === "fulfillment") {
    const wantsDelivery = id === ID_FUL_DELIVERY || (!id && /^(1|توصيل)$/.test(text));
    const wantsPickup = id === ID_FUL_PICKUP || (!id && /^(2|استلام|استلام من المحل)$/.test(text));
    if (wantsDelivery) {
      const methods = await listShippingMethods(ctx.tenantId, { activeOnly: true });
      if (methods.length) await startShippingFlow(ctx, methods);
      else await startPickupFlow(ctx, settings);
      return true;
    }
    if (wantsPickup) {
      await startPickupFlow(ctx, settings);
      return true;
    }
    await askFulfillment(ctx);
    return true;
  }

  if (flow.step === "pickup_kind") {
    if (id === ID_PICK_CAR || (!id && text === "1")) {
      await choosePickupKind(ctx, "car", settings);
      return true;
    }
    if (id === ID_PICK_STORE || (!id && text === "2")) {
      await choosePickupKind(ctx, "store", settings);
      return true;
    }
    await startPickupFlow(ctx, settings);
    return true;
  }

  if (flow.step === "plate") {
    if (id || !text) return false;
    const plate = cleanPlate(text);
    if (!plate) {
      await ctx.sendText("اكتب رقم اللوحة بشكل صحيح، مثل: أ ب ج 1234");
      return true;
    }
    if (settings.askCarDetails) {
      await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "car_details", data: { ...flow.data, plate } });
      await ctx.sendText("اكتب *لون ونوع سيارتك* لنعرفها بسهولة.\nمثال: كامري بيضاء\n(أو اكتب «تخطي»)");
      return true;
    }
    await askPickupConfirm(ctx, { step: "pickup_confirm", data: { ...flow.data, plate } }, settings);
    return true;
  }

  if (flow.step === "car_details") {
    if (id || !text) return false;
    const details = /^(تخطي|تخطى|skip)$/i.test(text) ? "" : cleanCarDetails(text);
    await askPickupConfirm(ctx, { step: "pickup_confirm", data: { ...flow.data, carDetails: details } }, settings);
    return true;
  }

  // step "pickup_confirm"
  if (id === ID_PICK_EDIT || (!id && /^(تعديل|تغيير|تعديل الاستلام)$/i.test(text))) {
    await startPickupFlow(ctx, settings);
    return true;
  }
  if (id === ID_PICK_CONFIRM || (!id && /^(تأكيد|تاكيد|أكد|اكد|نعم|confirm|ok)$/i.test(text))) {
    const kind = flow.data.pickupKind === "car" ? "car" : "store";
    await setPickupChoice(ctx.tenantId, ctx.conversationId, { kind, plate: kind === "car" ? flow.data.plate ?? "" : "", carDetails: kind === "car" ? flow.data.carDetails ?? "" : "" });
    await clearCheckoutFlow(ctx.conversationId);
    await proceedToPayment(ctx, cart, undefined);
    return true;
  }
  await ctx.sendText("للمتابعة اضغط «تأكيد وإتمام الدفع»، أو اكتب «تعديل»، أو «إلغاء».");
  return true;
}

// ---------- payment method ----------

function flowDataFromDelivery(delivery: Delivery | undefined): CheckoutFlow["data"] {
  return delivery ? { city: delivery.city, methodId: delivery.method.id, address: delivery.address } : {};
}

/**
 * The payment method: with one method on, straight to it; with several, the customer picks (buttons); with none, the order
 * goes to a person to follow up. `exclude` leaves out a method that just refused this purchase.
 */
async function proceedToPayment(ctx: CatalogCtx, cart: Awaited<ReturnType<typeof resolveCart>>, delivery: Delivery | undefined, exclude: ProviderKey[] = []) {
  const choices = (await listPaymentChoices(ctx.tenantId)).filter((key) => !exclude.includes(key));
  if (choices.length > 1) {
    await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "payment", data: flowDataFromDelivery(delivery) });
    await askPaymentMethod(ctx, cart, delivery, choices);
    return;
  }
  await startPayment(ctx, cart, delivery, choices[0]);
}

async function askPaymentMethod(ctx: CatalogCtx, cart: Awaited<ReturnType<typeof resolveCart>>, delivery: Delivery | undefined, choices: ProviderKey[]) {
  const fee = delivery ? shippingFee(delivery.method, productsTotal(cart)) : 0;
  const total = Math.round((cart.total + fee) * 100) / 100;
  const body = `اختر طريقة الدفع.\n*الإجمالي: ${formatMoney(total, cart.currency)}*`;
  if (ctx.channel === "whatsapp" && choices.length <= 3) {
    const sent = await sendWhatsAppIdButtons({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      to: ctx.recipientId,
      bodyText: body,
      buttons: choices.map((key) => ({ id: `${ID_PAY}${key}`, title: PROVIDER_BUTTON_LABELS[key] })),
      displayText: body,
      author: AUTHOR
    });
    if (sent.ok) return;
  }
  await ctx.sendText(`${body}\n${choices.map((key, index) => `${index + 1}) ${PROVIDER_LABELS[key]}`).join("\n")}\nاكتب رقم الخيار، أو «إلغاء» للرجوع إلى السلة.`);
}

/** One answer of the payment questions: the method (a button or its number), then Tabby's email. */
async function continuePaymentFlow(ctx: CatalogCtx, flow: CheckoutFlow, reply: { id?: string; text: string }, cart: Awaited<ReturnType<typeof resolveCart>>): Promise<boolean> {
  const id = reply.id || "";
  const text = reply.text.trim();
  const delivery = (flow.data.methodId ? await deliveryFromFlow(ctx, flow) : undefined) ?? undefined;
  if (flow.data.methodId && !delivery) {
    // The delivery option vanished meanwhile: ask the delivery questions again.
    const methods = await listShippingMethods(ctx.tenantId, { activeOnly: true });
    if (methods.length) {
      await ctx.sendText("تغيّرت خيارات التوصيل. لنُعد اختيار التوصيل.");
      await startShippingFlow(ctx, methods);
      return true;
    }
  }
  const choices = await listPaymentChoices(ctx.tenantId);

  if (flow.step === "payment") {
    const picked: ProviderKey | undefined = id.startsWith(ID_PAY)
      ? choices.find((key) => key === id.slice(ID_PAY.length))
      : /^\d$/.test(text) ? choices[Number(text) - 1] : undefined;
    if (!picked) {
      await askPaymentMethod(ctx, cart, delivery, choices);
      return true;
    }
    if (picked === "tabby") {
      // Tabby asks for the buyer's email.
      await setCheckoutFlow(ctx.tenantId, ctx.conversationId, { step: "email", data: { ...flow.data, provider: picked } });
      await ctx.sendText("لإتمام الدفع عبر تابي اكتب *بريدك الإلكتروني*.\n(أو اكتب «إلغاء» للرجوع إلى السلة)");
      return true;
    }
    await clearCheckoutFlow(ctx.conversationId);
    await startPayment(ctx, cart, delivery, picked);
    return true;
  }

  // step "email"
  if (id || !text) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) || text.length > 120) {
    await ctx.sendText("اكتب بريدًا إلكترونيًا صحيحًا، مثل: name@example.com");
    return true;
  }
  const provider = (flow.data.provider as ProviderKey | undefined) ?? "tabby";
  await clearCheckoutFlow(ctx.conversationId);
  await startPayment(ctx, cart, delivery, provider, text);
  return true;
}

/** The method is known: place the order and give the customer its payment link (or hand it to a person). */
async function startPayment(ctx: CatalogCtx, cart: Awaited<ReturnType<typeof resolveCart>>, delivery: Delivery | undefined, provider: ProviderKey | undefined, email?: string) {
  await finalizeCartOrder(ctx, cart, delivery, provider, email);
}

/** The order itself: the code's use, the stock, the order row, then the payment link (or a person to follow up). */
async function finalizeCartOrder(ctx: CatalogCtx, cart: Awaited<ReturnType<typeof resolveCart>>, delivery: Delivery | undefined, provider?: ProviderKey, email?: string) {
  if (cart.discountNote) {
    await showCart(ctx, `تم إلغاء كود الخصم (${cart.discountNote}).\nراجع إجمالي سلتك قبل الدفع.`);
    return;
  }
  if (cart.adjusted.length) {
    for (const change of cart.adjusted) await setLineQuantity(ctx.tenantId, ctx.conversationId, change.position, change.to);
    await showCart(ctx, `تغيّرت الكمية المتاحة:\n${cart.adjusted.map((change) => `${change.name}: من ${change.from} إلى ${change.to}`).join("\n")}`);
    return;
  }
  const quote: ShippingQuote | undefined = delivery ? { methodName: delivery.method.name, city: delivery.city, fee: shippingFee(delivery.method, productsTotal(cart)), eta: delivery.method.eta } : undefined;

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
  const gatewayKey = provider === "moyasar" ? await getMerchantGatewayKey(ctx.tenantId) : "";

  const pickup = delivery ? null : await getPickupChoice(ctx.conversationId);
  const order = await createCartOrder({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    customerName,
    customerPhone,
    lines: cart.lines.map((line) => ({ product: line.product, quantity: line.quantity, baseName: line.baseName, optionDetails: line.optionDetails })),
    status: provider ? "awaiting_payment" : "new",
    discount: cart.discount,
    shipping: delivery && quote ? { methodName: delivery.method.name, city: delivery.city, address: delivery.address, fee: quote.fee, eta: delivery.method.eta } : undefined
  });
  if (pickup) await recordOrderPickup(order.id, pickup);
  const orderText = `${formatOrderSummary(cart, quote)}${delivery ? `\n\nالعنوان: ${delivery.address}` : pickup ? `\n\n${pickupText(pickup)}` : ""}`;
  const totalText = formatMoney(order.total, order.currency);
  const where = delivery ? ` | التوصيل: ${delivery.method.name} إلى ${delivery.city} - ${delivery.address}` : pickup ? ` | ${pickupText(pickup)}` : "";

  // Tabby / Tamara: a payment link from the provider. If it refuses this purchase, the order is cancelled (stock and code
  // come back) and the customer is offered the other methods.
  if (provider === "tabby" || provider === "tamara") {
    const origin = getAppOrigin();
    try {
      const firstMessage = await prisma.message.findFirst({ where: { conversationId: ctx.conversationId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      const created = await startExternalPayment(provider, {
        tenantId: ctx.tenantId,
        orderId: order.id,
        amount: order.total,
        currency: order.currency,
        description: `${cart.lines.length > 1 ? `${cart.lines.length} منتجات` : cart.lines[0].product.name}`.slice(0, 120),
        items: cart.lines.map((line) => ({ name: line.product.name, sku: line.product.sku, quantity: line.quantity, unitPrice: line.product.price })),
        customer: { name: customerName, phone: customerPhone, email, registeredSince: firstMessage?.createdAt || new Date().toISOString(), history: await customerPaymentHistory(ctx.tenantId, customerPhone) },
        discountAmount: cart.discount?.amount ?? 0,
        discountName: cart.discount ? `كود ${cart.discount.code}` : "",
        shippingFee: quote?.fee ?? 0,
        shipping: delivery ? { city: delivery.city, address: delivery.address } : undefined,
        urls: { success: `${origin}/order/thanks?o=${encodeURIComponent(order.id)}`, cancel: `${origin}/order/thanks`, failure: `${origin}/order/thanks` },
        notificationUrl: `${origin}/api/catalog/payment-webhook/tamara?t=${encodeURIComponent(ctx.tenantId)}`
      });
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { paymentId: created.storedId, paymentUrl: created.url, updatedAt: new Date().toISOString() } });
      await clearCart(ctx.conversationId);
      await addOrderNote(ctx.conversationId, `طلب جديد بانتظار الدفع عبر ${PROVIDER_LABELS[provider]} (${cart.units} قطعة): ${notesLine(cart)} - ${totalText}${where}`);
      await ctx.sendText(`تم تجهيز طلبك\nرقم الطلب: ${shortOrderNumber(order.id)}\n\n${orderText}\n\nلإتمام الدفع عبر ${PROVIDER_LABELS[provider]} اضغط على الرابط:\n${created.url}`);
      return;
    } catch (error) {
      await updateOrderStatus(ctx.tenantId, order.id, "cancelled");
      const rejected = error instanceof PaymentProviderError && error.kind === "rejected";
      await ctx.sendText(rejected ? `${(error as PaymentProviderError).message}` : `تعذّر تجهيز الدفع عبر ${PROVIDER_LABELS[provider]} الآن.`);
      // Offer what is left; with nothing left a person follows up.
      await proceedToPayment(ctx, cart, delivery, [provider]);
      return;
    }
  }

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
      await addOrderNote(ctx.conversationId, `طلب جديد بانتظار الدفع (${cart.units} قطعة): ${notesLine(cart)} - ${totalText}${where}`);
      await ctx.sendText(`تم تجهيز طلبك\nرقم الطلب: ${shortOrderNumber(order.id)}\n\n${orderText}\n\nلإتمام الدفع بأمان اضغط على الرابط:\n${invoice.url}`);
      return;
    } catch {
      // The merchant's key/account is the likely culprit - fall through to a human follow-up.
      await prisma.catalogOrder.update({ where: { id: order.id }, data: { status: "new", updatedAt: new Date().toISOString() } });
    }
  }

  await clearCart(ctx.conversationId);
  await reopenForStaff(ctx.conversationId);
  await addOrderNote(ctx.conversationId, `طلب جديد يحتاج متابعة (${cart.units} قطعة): ${notesLine(cart)} - ${totalText}${where}`);
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

  // Answering a product's choices (size, extras). A tap on anything else abandons them (the quantity answer is part of the flow).
  const optionFlow = await getOptionFlow(ctx.conversationId);
  if (optionFlow) {
    if (optionFlow.groupIndex >= 0 && (id.startsWith(ID_OPT) || !id)) {
      if (await continueProductChoices(ctx, optionFlow, reply)) return "handled";
    } else if (id && !id.startsWith(ID_OPT) && !id.startsWith(ID_CART_QTY)) {
      await clearOptionFlow(ctx.conversationId);
    }
  }

  // Answering the delivery questions of a checkout (city, delivery option, address, confirmation).
  const flow = await getCheckoutFlow(ctx.conversationId);
  if (flow) {
    if (!id || id.startsWith(ID_SHIP) || id.startsWith(ID_PAY) || id.startsWith("ful_") || id.startsWith("pk_")) {
      if (await continueShippingFlow(ctx, flow, reply)) return "handled";
    } else {
      // A tap on anything else abandons a half-finished checkout.
      await clearCheckoutFlow(ctx.conversationId);
    }
  }

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
    await startProductChoices(ctx, id.slice(ID_CART_ADD.length), "cart");
    return "handled";
  }
  if (id === ID_TRACK) {
    const reply = await buildCustomerTrackingReply(ctx.tenantId, ctx.conversationId, "");
    await ctx.sendText(reply ?? "لا توجد طلبات سابقة لك في هذه المحادثة.");
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
  if (id.startsWith(ID_LIST)) {
    const [offsetText, ...rest] = id.slice(ID_LIST.length).split(":");
    await sendCatalogMenu(ctx, intro, Math.max(0, Number(offsetText) || 0), rest.join(":") || "*");
    return "handled";
  }
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
    else if (addCommand) await startProductChoices(ctx, picked.id, "cart");
    else await showProduct(ctx, picked);
    return "handled";
  }

  if (/منتج|كتالوج|قائمة|المنتجات|menu|catalog/i.test(text)) {
    await sendCatalogMenu(ctx, intro);
    return "handled";
  }

  return "ignored";
}
