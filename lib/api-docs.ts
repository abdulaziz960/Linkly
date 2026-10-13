/**
 * Single source of truth for the public API documentation: the /developers page and
 * /openapi.json are both generated from this file, so they cannot drift apart.
 * Keep it in step with app/api/v1/* (see tests/api-docs.test.ts for the route check).
 */

export const API_BASE_URL = "https://linklysa.io/api/v1";
export const API_KEY_PLACEHOLDER = "lk_xxxxxxxxxxxxxxxxxxxxxxxx";

export type DocField = {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  required?: boolean;
  description: string;
  example?: string | number | boolean;
};

export type DocEndpoint = {
  id: string;
  method: "GET" | "POST" | "DELETE";
  path: string; // relative to API_BASE_URL, OpenAPI style: /products/{id}
  tag: "المحادثات" | "الرسائل" | "العملاء" | "العملاء المحتملون" | "المنتجات";
  summary: string;
  description: string;
  pathParams?: DocField[];
  query?: DocField[];
  body?: { contentTypes: string[]; fields: DocField[]; example: unknown };
  responseExample: unknown;
  errors: number[];
  notes?: string[];
};

export const AUTH_NOTES = [
  "كل طلب يحتاج ترويسة Authorization بصيغة Bearer ومعها مفتاح API.",
  "تُنشئ المفاتيح من لوحة التحكم ← المطورون. يظهر المفتاح كاملًا مرة واحدة فقط عند إنشائه، فاحفظه في مكان آمن.",
  "كل مفتاح مرتبط بحساب (Workspace) واحد، ولا يرى إلا بيانات ذلك الحساب.",
  "لا تضع المفتاح في كود يعمل في المتصفح أو في تطبيق جوال منشور. استخدمه من خادمك فقط، ويمكنك إلغاؤه من اللوحة في أي وقت."
];

export const GENERAL_NOTES = {
  envelope: "كل الردود JSON بهذه الصيغة: { \"ok\": true, \"data\": ... } عند النجاح، و{ \"ok\": false, \"error\": \"...\" } عند الفشل.",
  rateLimit: "الحد 60 طلبًا في الدقيقة لكل مفتاح. عند تجاوزه يرجع 429 مع ترويسة Retry-After بعدد الثواني للانتظار.",
  pagination: "قوائم GET تدعم limit (من 1 إلى 100، الافتراضي 25) و cursor. أرسل nextCursor من الرد السابق كقيمة cursor لجلب الصفحة التالية. القيمة null تعني نهاية القائمة، وقد تكون الصفحة الأخيرة فارغة.",
  phone: "أرقام الجوال يجب أن تكون أرقامًا سعودية صالحة (مثل 0501234567 أو 966501234567).",
  encoding: "أرسل Content-Type: application/json بترميز UTF-8. نقطة POST /conversations تقبل أيضًا application/x-www-form-urlencoded و multipart/form-data (مفيد لـ Zapier).",
  language: "رسائل الخطأ (error) إنجليزية في الغالب، وأخطاء التحقق من حقول المنتجات بالعربية. اعتمد على رمز HTTP وليس على نص الرسالة في الكود البرمجي."
};

export const ERROR_CODES: Array<{ status: number; meaning: string; action: string }> = [
  { status: 200, meaning: "نجح الطلب", action: "—" },
  { status: 400, meaning: "بيانات ناقصة أو غير صالحة", action: "راجع حقول الطلب ورسالة error، ثم أعد الإرسال بعد التصحيح." },
  { status: 401, meaning: "مفتاح API مفقود أو غير صحيح أو ملغى", action: "تأكد من ترويسة Authorization ومن أن المفتاح ما زال فعّالًا." },
  { status: 404, meaning: "العنصر غير موجود في حسابك", action: "تحقق من المعرّف (id)." },
  { status: 429, meaning: "تجاوزت حد الطلبات", action: "انتظر Retry-After ثانية ثم أعد المحاولة." },
  { status: 500, meaning: "خطأ داخلي", action: "أعد المحاولة لاحقًا، وتواصل معنا إن استمر." },
  { status: 502, meaning: "تعذر تسليم الرسالة لقناة واتساب", action: "تحقق من اتصال القناة في لوحة التحكم ومن نافذة الـ 24 ساعة." }
];

const phoneField: DocField = { name: "customerPhone", type: "string", required: true, description: "جوال العميل. يقبل أيضًا الأسماء phone_number أو phone أو mobile.", example: "0501234567" };

export const ENDPOINTS: DocEndpoint[] = [
  {
    id: "open-conversation",
    method: "POST",
    path: "/conversations",
    tag: "المحادثات",
    summary: "فتح محادثة (أو استخدام المفتوحة) لعميل",
    description: "يفتح محادثة واتساب لرقم الجوال ويسجّل رسالة واردة عليها، فتظهر في صندوق الوارد وتعمل عليها الأتمتة. إن كان العميل موجودًا تُستخدم محادثته، وإلا يُنشأ عميل جديد.",
    body: {
      contentTypes: ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"],
      fields: [
        phoneField,
        { name: "customerName", type: "string", description: "اسم العميل (حتى 100 حرف). يقبل أيضًا full_name أو name.", example: "عميل" },
        { name: "text", type: "string", description: "نص الرسالة الواردة (حتى 4000 حرف). إن حذفته يُستخدم نص افتراضي.", example: "طلبك #1234 تم استلامه" },
        { name: "visit", type: "boolean", description: "true لتسجيل المحادثة كزيارة فعلية تدخل في حساب الزيارات وتذكير الانقطاع.", example: true },
        { name: "visitAt", type: "string", description: "تاريخ الزيارة بصيغة ISO 8601. اختياري مع visit.", example: "2026-10-01T10:30:00Z" },
        { name: "lead_source", type: "string", description: "اسم منصة الإعلان (TikTok وGoogle وغيرها) ليظهر مصدر العميل. يقبل أيضًا source أو platform أو utm_source." },
        { name: "campaign", type: "string", description: "اسم الحملة أو المشروع. يقبل أيضًا utm_campaign أو ad_name أو form_name أو project." }
      ],
      example: { customerPhone: "0501234567", customerName: "عميل", text: "حجز جديد", visit: true }
    },
    responseExample: { ok: true, data: { conversationId: "c-..." } },
    errors: [400, 401, 429, 500],
    notes: [
      "أي حقول إضافية في الطلب (مثل email وbudget) تُحفظ مع العميل المحتمل وتظهر في المحادثة.",
      "إن فعّلت رسالة الترحيب للعملاء المحتملين الخارجيين، ترسَل مرة واحدة لكل رقم."
    ]
  },
  {
    id: "send-message",
    method: "POST",
    path: "/messages",
    tag: "الرسائل",
    summary: "إرسال رسالة نصية على محادثة",
    description: "يرسل رسالة نصية عبر واتساب إلى جوال عميل المحادثة. يخضع لقواعد واتساب، فالرسالة النصية الحرة لا تصل خارج نافذة الـ 24 ساعة من آخر رسالة للعميل، ويحتاج الحساب قناة واتساب متصلة.",
    body: {
      contentTypes: ["application/json"],
      fields: [
        { name: "conversationId", type: "string", required: true, description: "معرّف المحادثة (يرجع من POST /conversations).", example: "c-..." },
        { name: "text", type: "string", required: true, description: "نص الرسالة (حتى 4000 حرف).", example: "تم شحن طلبك، رقم التتبع: 123456" }
      ],
      example: { conversationId: "c-...", text: "تم شحن طلبك، رقم التتبع: 123456" }
    },
    responseExample: { ok: true },
    errors: [400, 401, 404, 429, 502]
  },
  {
    id: "list-customers",
    method: "GET",
    path: "/customers",
    tag: "العملاء",
    summary: "قائمة العملاء",
    description: "يرجع عملاء الحساب مرتبين بالمعرّف، مع ترقيم بالمؤشر (cursor).",
    query: [
      { name: "limit", type: "integer", description: "عدد العناصر (1 إلى 100). الافتراضي 25.", example: 25 },
      { name: "cursor", type: "string", description: "قيمة nextCursor من الرد السابق." }
    ],
    responseExample: { ok: true, data: { items: [{ id: "c-...", name: "عميل", phone: "0501234567" }], nextCursor: null } },
    errors: [401, 429]
  },
  {
    id: "upsert-customer",
    method: "POST",
    path: "/customers",
    tag: "العملاء",
    summary: "إنشاء عميل أو تحديث اسمه",
    description: "ينشئ عميلًا برقم الجوال، وإن وُجد عميل بنفس الرقم يحدّث اسمه. لا يفتح محادثة (استخدم POST /conversations لذلك).",
    notes: ["يُحفظ الرقم كما أُرسل، والمطابقة مع العميل الموجود تتم على النص نفسه. أرسل الأرقام بصيغة واحدة ثابتة (مثل 05XXXXXXXX) لتجنب التكرار."],
    body: {
      contentTypes: ["application/json"],
      fields: [
        { name: "phone", type: "string", required: true, description: "جوال سعودي صالح.", example: "0501234567" },
        { name: "name", type: "string", required: true, description: "اسم العميل (حرفان على الأقل).", example: "عميل جديد" }
      ],
      example: { phone: "0501234567", name: "عميل جديد" }
    },
    responseExample: { ok: true, data: { id: "c-...", name: "عميل جديد", phone: "0501234567" } },
    errors: [400, 401, 429]
  },
  {
    id: "list-leads",
    method: "GET",
    path: "/leads",
    tag: "العملاء المحتملون",
    summary: "قائمة العملاء المحتملين",
    description: "العملاء المحتملون الذين وصلوا من نماذج القنوات المخصصة (حاليًا نماذج Snapchat Lead Generation).",
    query: [
      { name: "limit", type: "integer", description: "عدد العناصر (1 إلى 100). الافتراضي 25.", example: 25 },
      { name: "cursor", type: "string", description: "قيمة nextCursor من الرد السابق." }
    ],
    responseExample: {
      ok: true,
      data: {
        items: [{ id: "lead-...", customerId: "c-...", conversationId: "c-...", source: "snapchat", formName: "عرض سبتمبر", name: "عميل محتمل", phone: "+9665...", email: "", createdAt: "2026-09-10T10:15:30.000Z" }],
        nextCursor: null
      }
    },
    errors: [401, 429]
  },
  {
    id: "get-lead",
    method: "GET",
    path: "/leads/{id}",
    tag: "العملاء المحتملون",
    summary: "تفاصيل عميل محتمل",
    description: "يرجع نفس حقول القائمة مع formId وadAccountId ومصفوفة answers (أسئلة وأجوبة النموذج كما وصلت).",
    pathParams: [{ name: "id", type: "string", required: true, description: "معرّف العميل المحتمل.", example: "lead-..." }],
    responseExample: {
      ok: true,
      data: {
        id: "lead-...", customerId: "c-...", conversationId: "c-...", source: "snapchat", formId: "...", formName: "عرض سبتمبر", adAccountId: "...",
        name: "عميل محتمل", phone: "+9665...", email: "", answers: [{ question: "PHONE_NUMBER", answer: "+9665..." }], createdAt: "2026-09-10T10:15:30.000Z"
      }
    },
    errors: [401, 404, 429]
  },
  {
    id: "list-products",
    method: "GET",
    path: "/products",
    tag: "المنتجات",
    summary: "قائمة المنتجات",
    description: "منتجات كتالوج الحساب (اليدوية والمرفوعة عبر API أو الخلاصة)، مع ترقيم بالمؤشر.",
    query: [
      { name: "limit", type: "integer", description: "عدد العناصر (1 إلى 100). الافتراضي 25.", example: 25 },
      { name: "cursor", type: "string", description: "قيمة nextCursor من الرد السابق." }
    ],
    responseExample: {
      ok: true,
      data: {
        items: [{ id: "prod-...", externalId: "SKU-100", source: "api", name: "قميص قطن", description: "", price: 120, currency: "SAR", imageUrl: "https://example.com/a.jpg", productUrl: "https://example.com/p/100", category: "ملابس", sku: "SKU-100", stock: 25, active: true, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" }],
        nextCursor: null
      }
    },
    errors: [401, 429]
  },
  {
    id: "upsert-products",
    method: "POST",
    path: "/products",
    tag: "المنتجات",
    summary: "إنشاء أو تحديث منتج واحد أو دفعة منتجات",
    description: "يُنشئ المنتج أو يحدّثه بحسب externalId (معرّف المنتج في موقعك). أرسل منتجًا واحدًا بحقوله مباشرة، أو { \"products\": [...] } بحد أقصى 100 منتج في الطلب. إعادة إرسال نفس externalId تحدّث المنتج.",
    body: {
      contentTypes: ["application/json"],
      fields: [
        { name: "externalId", type: "string", required: true, description: "معرّف المنتج في موقعك (حتى 160 حرفًا).", example: "SKU-100" },
        { name: "name", type: "string", required: true, description: "اسم المنتج (حتى 120 حرفًا).", example: "قميص قطن" },
        { name: "price", type: "number", required: true, description: "السعر بالريال (حتى خانتين عشريتين، وحد أقصى 10,000,000). العملة دائمًا SAR.", example: 120 },
        { name: "description", type: "string", description: "الوصف (حتى 2000 حرف)." },
        { name: "imageUrl", type: "string", description: "رابط الصورة، يجب أن يبدأ بـ https.", example: "https://example.com/a.jpg" },
        { name: "productUrl", type: "string", description: "رابط صفحة المنتج (http أو https).", example: "https://example.com/p/100" },
        { name: "category", type: "string", description: "التصنيف (حتى 80 حرفًا)." },
        { name: "sku", type: "string", description: "رمز المنتج (حتى 80 حرفًا)." },
        { name: "stock", type: "integer", description: "المخزون. القيمة -1 تعني غير محدود (الافتراضي)، و0 تعني نفد.", example: 25 },
        { name: "active", type: "boolean", description: "هل المنتج معروض. الافتراضي true.", example: true }
      ],
      example: { products: [{ externalId: "SKU-100", name: "قميص قطن", price: 120, imageUrl: "https://example.com/a.jpg", stock: 25 }] }
    },
    responseExample: {
      ok: true,
      data: { created: 1, updated: 0, items: [{ id: "prod-...", externalId: "SKU-100", status: "created" }], errors: [] }
    },
    errors: [400, 401, 429],
    notes: [
      "المعالجة جزئية: العناصر الصحيحة تُحفظ، وأخطاء الباقي ترجع في data.errors مع index موضع العنصر في الطلب.",
      "إن فشلت كل العناصر يرجع الطلب بالحالة 400.",
      "قد يمنع حد باقتك عدد المنتجات إنشاء منتج جديد، ويظهر ذلك في errors لذلك العنصر."
    ]
  },
  {
    id: "delete-product",
    method: "DELETE",
    path: "/products/{id}",
    tag: "المنتجات",
    summary: "حذف منتج",
    description: "يحذف منتجًا بمعرّف لنكلي أو بـ externalId الخاص بموقعك.",
    pathParams: [{ name: "id", type: "string", required: true, description: "معرّف لنكلي أو externalId.", example: "SKU-100" }],
    responseExample: { ok: true, data: { id: "SKU-100" } },
    errors: [401, 404, 429]
  }
];

export type DocWebhookEvent = { name: string; description: string; data: unknown; notes?: string };

export const WEBHOOK_EVENTS: DocWebhookEvent[] = [
  {
    name: "message.received",
    description: "وصلت رسالة جديدة من عميل (من أي قناة متصلة).",
    data: { conversationId: "c-...", text: "السلام عليكم" }
  },
  {
    name: "conversation.closed",
    description: "أُغلقت محادثة من لوحة التحكم.",
    data: { conversationId: "c-..." }
  },
  {
    name: "lead.created",
    description: "وصل عميل محتمل جديد من نموذج قناة مخصصة (حاليًا Snapchat Lead Generation).",
    data: { id: "lead-...", source: "snapchat", customerId: "c-...", conversationId: "c-...", formId: "...", formName: "عرض سبتمبر", name: "عميل محتمل", phone: "+9665...", email: "", answers: [{ question: "PHONE_NUMBER", answer: "+9665..." }], createdAt: "2026-09-10T10:15:30.000Z" },
    notes: "العملاء القادمون عبر POST /conversations لا يطلقون هذا الحدث، استخدم message.received لهم."
  }
];

export const WEBHOOK_NOTES = [
  "تُسجَّل الـ Webhooks من لوحة التحكم ← المطورون: رابط HTTPS عام وقائمة أحداث، ويظهر سر التوقيع مرة واحدة.",
  "كل طلب POST بصيغة JSON: { \"event\": \"...\", \"data\": {...}, \"sentAt\": \"ISO\" }، ومعه ترويسة X-Linkly-Signature.",
  "التوقيع sha256=<hex> وهو HMAC-SHA256 للنص الخام للطلب (raw body) بسر الـ Webhook. تحقق منه قبل معالجة الطلب، واستخدم مقارنة ثابتة الزمن.",
  "يُعدّ التسليم ناجحًا عند ردّ 2xx خلال 8 ثوانٍ. أعد 2xx بسرعة وعالج العمل في الخلفية.",
  "عند الفشل المؤقت (انتهاء المهلة، خطأ شبكة، 5xx، 408، 429) نعيد المحاولة تلقائيًا بعد دقيقة، ثم 5 دقائق، ثم 30 دقيقة، ثم ساعتين، ثم 12 ساعة (6 محاولات كحد أقصى). لا تُعاد الردود 4xx الأخرى ولا إعادة التوجيه.",
  "كل محاولة تحمل الترويسات X-Linkly-Event وX-Linkly-Delivery وX-Linkly-Attempt. معرّف X-Linkly-Delivery ثابت لنفس الحدث عبر كل المحاولات، فاستخدمه لتجاهل التكرار لأن الحدث قد يصلك أكثر من مرة.",
  "لا تُتبع إعادة التوجيه (redirect)، ويُرفض أي رابط يحلّ إلى عنوان داخلي أو محلي (localhost أو شبكة خاصة).",
  "يعرض سجل التسليم في اللوحة آخر المحاولات (بما فيها إعادة المحاولة) ورمز HTTP ونتيجتها لكل Webhook."
];

export const WEBHOOK_VERIFY_SAMPLES = {
  node: `import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidLinklySignature(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader || "");
  return a.length === b.length && timingSafeEqual(a, b);
}`,
  python: `import hmac, hashlib

def is_valid_linkly_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")`,
  php: `<?php
function isValidLinklySignature(string $rawBody, string $signatureHeader, string $secret): bool {
    $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
    return hash_equals($expected, $signatureHeader);
}`
};

export function curlFor(endpoint: DocEndpoint): string {
  const url = `${API_BASE_URL}${endpoint.path.replace("{id}", "ID")}${endpoint.query?.length ? "?limit=25" : ""}`;
  const lines = [`curl -X ${endpoint.method} "${url}"`, `  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}"`];
  if (endpoint.body) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${JSON.stringify(endpoint.body.example)}'`);
  }
  return lines.join(" \\\n");
}

export const QUICKSTART_SAMPLES = {
  node: `const res = await fetch("${API_BASE_URL}/conversations", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.LINKLY_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ customerPhone: "0501234567", customerName: "عميل", text: "طلبك #1234 تم استلامه" })
});
const { ok, data, error } = await res.json();
if (!ok) throw new Error(error);
console.log(data.conversationId);`,
  python: `import os, requests

res = requests.post(
    "${API_BASE_URL}/conversations",
    headers={"Authorization": f"Bearer {os.environ['LINKLY_API_KEY']}"},
    json={"customerPhone": "0501234567", "customerName": "عميل", "text": "طلبك #1234 تم استلامه"},
    timeout=15,
)
body = res.json()
if not body["ok"]:
    raise RuntimeError(body["error"])
print(body["data"]["conversationId"])`,
  php: `<?php
$ch = curl_init("${API_BASE_URL}/conversations");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("LINKLY_API_KEY"),
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "customerPhone" => "0501234567",
        "customerName" => "عميل",
        "text" => "طلبك #1234 تم استلامه",
    ], JSON_UNESCAPED_UNICODE),
]);
$body = json_decode(curl_exec($ch), true);
if (!$body["ok"]) { throw new RuntimeException($body["error"]); }
echo $body["data"]["conversationId"];`
};

export const STORE_EXAMPLE = `// عند وصول Webhook "order.created" من متجرك (سلة أو زد أو موقع خاص):
const headers = { Authorization: \`Bearer \${LINKLY_API_KEY}\`, "Content-Type": "application/json" };

// 1) افتح محادثة مع المشتري
const { data } = await fetch("${API_BASE_URL}/conversations", {
  method: "POST", headers,
  body: JSON.stringify({ customerPhone: order.customer.mobile, customerName: order.customer.name, text: \`طلب جديد #\${order.id}\` })
}).then((r) => r.json());

// 2) أرسل تأكيد الطلب
await fetch("${API_BASE_URL}/messages", {
  method: "POST", headers,
  body: JSON.stringify({ conversationId: data.conversationId, text: \`شكرًا لطلبك! رقم الطلب #\${order.id}\` })
});`;

// ---------- OpenAPI 3.1 generation ----------

function schemaFor(fields: DocField[]) {
  return {
    type: "object",
    properties: Object.fromEntries(fields.map((field) => [field.name, { type: field.type, description: field.description, ...(field.example !== undefined ? { example: field.example } : {}) }])),
    required: fields.filter((field) => field.required).map((field) => field.name)
  };
}

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of ENDPOINTS) {
    const parameters = [
      ...(endpoint.pathParams ?? []).map((field) => ({ name: field.name, in: "path", required: true, description: field.description, schema: { type: field.type } })),
      ...(endpoint.query ?? []).map((field) => ({ name: field.name, in: "query", required: false, description: field.description, schema: { type: field.type } }))
    ];
    const operation: Record<string, unknown> = {
      operationId: endpoint.id,
      tags: [endpoint.tag],
      summary: endpoint.summary,
      description: [endpoint.description, ...(endpoint.notes ?? [])].join("\n\n"),
      ...(parameters.length ? { parameters } : {}),
      ...(endpoint.body
        ? {
            requestBody: {
              required: true,
              content: Object.fromEntries(endpoint.body.contentTypes.map((type) => [type, { schema: schemaFor(endpoint.body!.fields), ...(type === "application/json" ? { example: endpoint.body!.example } : {}) }]))
            }
          }
        : {}),
      responses: {
        "200": { description: "نجح الطلب", content: { "application/json": { example: endpoint.responseExample } } },
        ...Object.fromEntries(
          endpoint.errors.map((status) => [String(status), { description: ERROR_CODES.find((item) => item.status === status)?.meaning ?? "خطأ", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }])
        )
      },
      security: [{ bearerAuth: [] }]
    };
    const key = endpoint.path;
    paths[key] = { ...(paths[key] ?? {}), [endpoint.method.toLowerCase()]: operation };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Linkly API",
      version: "1.0.0",
      description: "واجهة Linkly البرمجية لفتح المحادثات وإرسال الرسائل وإدارة العملاء والمنتجات. التوثيق الكامل: https://linklysa.io/developers"
    },
    servers: [{ url: API_BASE_URL }],
    security: [{ bearerAuth: [] }],
    tags: Array.from(new Set(ENDPOINTS.map((endpoint) => endpoint.tag))).map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: `مفتاح API يبدأ بـ lk_ (مثل ${API_KEY_PLACEHOLDER})` } },
      schemas: {
        Error: { type: "object", properties: { ok: { type: "boolean", example: false }, error: { type: "string" } }, required: ["ok", "error"] }
      }
    }
  };
}
