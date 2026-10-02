"use client";

import { useState } from "react";
import { useLanguage } from "../i18n";

const API = "https://linklysa.io/api/v1/products";

type LangKey = "php" | "node" | "python" | "java" | "csharp" | "go" | "curl";

const LANGS: Array<{ key: LangKey; label: string }> = [
  { key: "php", label: "PHP" },
  { key: "node", label: "Node.js" },
  { key: "python", label: "Python" },
  { key: "java", label: "Java" },
  { key: "csharp", label: "C#" },
  { key: "go", label: "Go" },
  { key: "curl", label: "cURL" }
];

// Push samples: one function that upserts a product and one that deletes it.
const PUSH: Record<LangKey, string> = {
  php: `<?php
define('LINKLY_KEY', getenv('LINKLY_KEY')); // lk_xxxxxxxx

function linkly_request($method, $url, $data = null) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . LINKLY_KEY, 'Content-Type: application/json'],
    ]);
    if ($data !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));
    $res = curl_exec($ch);
    curl_close($ch);
    return $res;
}

// after saving a product in your database
linkly_request('POST', '${API}', ['products' => [[
    'externalId' => 'p-1001',
    'name'       => 'قميص قطن',
    'price'      => 149.5,
    'imageUrl'   => 'https://example.com/shirt.jpg',
    'productUrl' => 'https://example.com/p/1001',
    'stock'      => 12,
]]]);

// after deleting a product
linkly_request('DELETE', '${API}/p-1001');`,
  node: `const KEY = process.env.LINKLY_KEY; // lk_xxxxxxxx
const headers = { Authorization: \`Bearer \${KEY}\`, "Content-Type": "application/json" };

// after saving a product in your database
await fetch("${API}", {
  method: "POST",
  headers,
  body: JSON.stringify({ products: [{
    externalId: "p-1001",
    name: "قميص قطن",
    price: 149.5,
    imageUrl: "https://example.com/shirt.jpg",
    productUrl: "https://example.com/p/1001",
    stock: 12,
  }] }),
});

// after deleting a product
await fetch("${API}/p-1001", { method: "DELETE", headers });`,
  python: `import os, requests

HEADERS = {"Authorization": f"Bearer {os.environ['LINKLY_KEY']}"}  # lk_xxxxxxxx

# after saving a product in your database
requests.post("${API}", headers=HEADERS, timeout=10, json={"products": [{
    "externalId": "p-1001",
    "name": "قميص قطن",
    "price": 149.5,
    "imageUrl": "https://example.com/shirt.jpg",
    "productUrl": "https://example.com/p/1001",
    "stock": 12,
}]})

# after deleting a product
requests.delete("${API}/p-1001", headers=HEADERS, timeout=10)`,
  java: `import java.net.URI;
import java.net.http.*;

HttpClient client = HttpClient.newHttpClient();
String key = System.getenv("LINKLY_KEY"); // lk_xxxxxxxx

// after saving a product in your database
String json = """
{"products":[{"externalId":"p-1001","name":"قميص قطن","price":149.5,
"imageUrl":"https://example.com/shirt.jpg","productUrl":"https://example.com/p/1001","stock":12}]}
""";
client.send(HttpRequest.newBuilder(URI.create("${API}"))
    .header("Authorization", "Bearer " + key)
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(json)).build(),
    HttpResponse.BodyHandlers.ofString());

// after deleting a product
client.send(HttpRequest.newBuilder(URI.create("${API}/p-1001"))
    .header("Authorization", "Bearer " + key)
    .DELETE().build(), HttpResponse.BodyHandlers.ofString());`,
  csharp: `using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;

var http = new HttpClient();
http.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("LINKLY_KEY")); // lk_xxxxxxxx

// after saving a product in your database
var json = """
{"products":[{"externalId":"p-1001","name":"قميص قطن","price":149.5,
"imageUrl":"https://example.com/shirt.jpg","productUrl":"https://example.com/p/1001","stock":12}]}
""";
await http.PostAsync("${API}", new StringContent(json, Encoding.UTF8, "application/json"));

// after deleting a product
await http.DeleteAsync("${API}/p-1001");`,
  go: `package main

import (
	"net/http"
	"os"
	"strings"
)

func linkly(method, url, body string) {
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("LINKLY_KEY")) // lk_xxxxxxxx
	req.Header.Set("Content-Type", "application/json")
	if res, err := http.DefaultClient.Do(req); err == nil {
		res.Body.Close()
	}
}

func main() {
	// after saving a product in your database
	linkly("POST", "${API}", \`{"products":[{"externalId":"p-1001","name":"قميص قطن","price":149.5,
"imageUrl":"https://example.com/shirt.jpg","productUrl":"https://example.com/p/1001","stock":12}]}\`)

	// after deleting a product
	linkly("DELETE", "${API}/p-1001", "")
}`,
  curl: `# add / update (up to 100 products per request)
curl -X POST ${API} \\
  -H "Authorization: Bearer lk_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"products":[{"externalId":"p-1001","name":"قميص قطن","price":149.5,"imageUrl":"https://example.com/shirt.jpg","productUrl":"https://example.com/p/1001","stock":12}]}'

# delete
curl -X DELETE ${API}/p-1001 \\
  -H "Authorization: Bearer lk_xxxxxxxxxxxxxxxxxxxxxxxx"

# list
curl "${API}?limit=50" -H "Authorization: Bearer lk_xxxxxxxxxxxxxxxxxxxxxxxx"`
};

// Feed samples: the endpoint your site exposes for Linkly to pull.
const FEED: Partial<Record<LangKey, string>> = {
  php: `<?php
// feed.php  ->  https://yoursite.com/feed.php?key=SECRET
if (($_GET['key'] ?? '') !== 'SECRET_LETTERS_AND_DIGITS_ONLY') { http_response_code(403); exit; }
header('Content-Type: application/json; charset=utf-8');

$rows = $pdo->query("SELECT * FROM products WHERE is_active = 1")->fetchAll(PDO::FETCH_ASSOC);
$products = [];
foreach ($rows as $r) {
    $products[] = [
        'id'          => 'p-' . $r['id'],      // stable id, never changes
        'name'        => $r['name'],
        'price'       => (float)$r['price'],
        'image'       => 'https://yoursite.com' . $r['image'],
        'link'        => 'https://yoursite.com/product.php?id=' . $r['id'],
        'description' => $r['description'],
    ];
}
echo json_encode(['products' => $products], JSON_UNESCAPED_UNICODE);`,
  node: `// Express: GET /feed?key=SECRET
app.get("/feed", async (req, res) => {
  if (req.query.key !== process.env.FEED_KEY) return res.sendStatus(403);
  const rows = await db.products.findAll({ where: { active: true } });
  res.json({
    products: rows.map((p) => ({
      id: \`p-\${p.id}\`,                 // stable id, never changes
      name: p.name,
      price: Number(p.price),
      image: \`https://yoursite.com\${p.image}\`,
      link: \`https://yoursite.com/product/\${p.id}\`,
      description: p.description,
    })),
  });
});`,
  python: `# Flask: GET /feed?key=SECRET
@app.get("/feed")
def feed():
    if request.args.get("key") != os.environ["FEED_KEY"]:
        abort(403)
    rows = Product.query.filter_by(active=True).all()
    return jsonify(products=[{
        "id": f"p-{p.id}",              # stable id, never changes
        "name": p.name,
        "price": float(p.price),
        "image": f"https://yoursite.com{p.image}",
        "link": f"https://yoursite.com/product/{p.id}",
        "description": p.description,
    } for p in rows])`
};

const FIELDS: Array<[string, string, string]> = [
  ["externalId", "معرّف المنتج عندك (ثابت لا يتغير) - مطلوب في API", "Your product id (stable, never changes) - required for the API"],
  ["name", "اسم المنتج (حتى 120 حرفًا) - مطلوب", "Product name (up to 120 chars) - required"],
  ["price", "السعر بالريال - مطلوب", "Price in SAR - required"],
  ["imageUrl", "رابط الصورة (https كامل)", "Image URL (full https)"],
  ["productUrl", "رابط صفحة المنتج في موقعك", "Product page URL on your site"],
  ["category / sku", "التصنيف / الرمز", "Category / SKU"],
  ["stock", "-1 أو بدونه = بدون تتبع، 0 = نفد، رقم = الكمية", "-1 or omitted = untracked, 0 = sold out, number = quantity"],
  ["description", "الوصف", "Description"],
  ["active", "false لإخفاء المنتج", "false to hide the product"]
];

export default function CatalogIntegrationGuide({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [method, setMethod] = useState<"feed" | "api">("feed");
  const [lang, setLang] = useState<LangKey>("php");
  const [copied, setCopied] = useState("");

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); the code stays selectable.
    }
  }

  const feedCode = FEED[lang];
  const pushCode = PUSH[lang];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="account-modal form-modal catalog-guide" role="dialog" aria-modal="true" aria-label={t("دليل الربط للمبرمج", "Developer integration guide")} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={onClose}>×</button>
          <h2>{t("دليل ربط موقعك بالكتالوج", "Connect your website to the catalog")}</h2>
        </header>
        <div className="account-modal-body catalog-guide-body">
          <p>{t("اختر طريقة المزامنة، ثم انسخ المثال بلغتك وأعطه لمبرمج موقعك.", "Pick a sync method, then copy the example in your language and hand it to your developer.")}</p>

          <div className="catalog-guide-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={method === "feed"} className={method === "feed" ? "active" : ""} onClick={() => setMethod("feed")}>{t("أ) ملف منتجات (موصى به)", "A) Product feed (recommended)")}</button>
            <button type="button" role="tab" aria-selected={method === "api"} className={method === "api" ? "active" : ""} onClick={() => setMethod("api")}>{t("ب) API (فوري)", "B) API (instant)")}</button>
          </div>

          {method === "feed" ? (
            <section>
              <h3>{t("كيف تعمل؟", "How it works")}</h3>
              <ol>
                <li>{t("موقعك يعرض رابطًا فيه كل المنتجات بصيغة JSON (أو XML أو CSV).", "Your site exposes a URL listing all products as JSON (or XML / CSV).")}</li>
                <li>{t("ضع الرابط في خانة «رابط ملف المنتجات» ثم احفظ واضغط «مزامنة الآن».", "Paste the URL into \"Product feed URL\", save, then press \"Sync now\".")}</li>
                <li>{t("لنكلي يسحبه تلقائيًا كل مدة تحددها (15 دقيقة كحد أدنى): تظهر المنتجات الجديدة، وتتحدث التعديلات، وتُخفى المنتجات المحذوفة.", "Linkly pulls it automatically at your chosen interval (15 min minimum): new products appear, edits update, removed products are hidden.")}</li>
              </ol>
              <ul className="catalog-guide-notes">
                <li>{t("اجعل الرابط محميًا بكلمة سرية في الرابط نفسه (?key=...) من حروف وأرقام فقط - الرموز مثل # و& تكسر الرابط.", "Protect the URL with a secret in the query (?key=...) using letters and digits only - symbols like # and & break the URL.")}</li>
                <li>{t("المعرّف id ثابت لكل منتج؛ تغييره يُنشئ منتجًا جديدًا.", "Keep each product id stable; changing it creates a new product.")}</li>
                <li>{t("الرابط لازم يكون عامًّا على الإنترنت، وحجم الملف حتى 8 ميجا، والمهلة 20 ثانية.", "The URL must be publicly reachable, up to 8 MB, 20 s timeout.")}</li>
                <li>{t("أسماء الحقول المقبولة: id, name/title, price (sale_price يُفضَّل), image/image_link, link/url, description, category, sku, stock/quantity/availability, status.", "Accepted field names: id, name/title, price (sale_price preferred), image/image_link, link/url, description, category, sku, stock/quantity/availability, status.")}</li>
              </ul>
            </section>
          ) : (
            <section>
              <h3>{t("كيف تعمل؟", "How it works")}</h3>
              <ol>
                <li>{t("أنشئ مفتاح API من صفحة «المطورون» (يظهر مرة واحدة).", "Create an API key on the Developers page (shown once).")}</li>
                <li>{t("من خادم موقعك فقط (لا تضعه في كود المتصفح) أرسل المنتج عند إضافته أو تعديله، وأرسل حذفًا عند حذفه.", "From your server only (never browser code) send the product when it is added or edited, and a delete when it is removed.")}</li>
                <li>{t("إعادة إرسال نفس externalId تحدّث المنتج بدل تكراره. حتى 100 منتج في الطلب، والحد 60 طلبًا في الدقيقة.", "Re-sending the same externalId updates the product instead of duplicating it. Up to 100 products per request, 60 requests per minute.")}</li>
              </ol>
              <ul className="catalog-guide-notes">
                <li>{t("غلّف الاستدعاء بـ try/catch حتى لا يتعطل موقعك لو تأخر لنكلي.", "Wrap the call in try/catch so your site never breaks if Linkly is slow.")}</li>
                <li>{t("للمنتجات الموجودة أصلًا: مرّ عليها كلها مرة واحدة وأرسلها بدفعات من 100.", "For existing products: loop over all of them once and send in batches of 100.")}</li>
              </ul>
            </section>
          )}

          <div className="catalog-guide-tabs catalog-guide-langs" role="tablist" aria-label={t("لغة البرمجة", "Language")}>
            {LANGS.filter((item) => method === "api" || FEED[item.key]).map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={lang === item.key} className={lang === item.key ? "active" : ""} onClick={() => setLang(item.key)}>{item.label}</button>
            ))}
          </div>

          {method === "feed" ? (
            <>
              {feedCode ? (
                <div className="catalog-code">
                  <button type="button" onClick={() => copy("feed", feedCode)}>{copied === "feed" ? t("تم النسخ", "Copied") : t("نسخ", "Copy")}</button>
                  <pre className="code-block" dir="ltr">{feedCode}</pre>
                </div>
              ) : null}
              <p>{t("ملاحظة: مثال الملف متوفر بـ PHP وNode.js وPython؛ أي لغة أخرى يكفيها أن تُرجع نفس شكل JSON:", "The feed example is available for PHP, Node.js and Python; any other language just needs to return the same JSON shape:")}</p>
              <pre className="code-block" dir="ltr">{`{"products":[{"id":"p-1001","name":"قميص قطن","price":149.5,"image":"https://example.com/a.jpg","link":"https://example.com/p/1001","description":"..."}]}`}</pre>
            </>
          ) : (
            <div className="catalog-code">
              <button type="button" onClick={() => copy("push", pushCode)}>{copied === "push" ? t("تم النسخ", "Copied") : t("نسخ", "Copy")}</button>
              <pre className="code-block" dir="ltr">{pushCode}</pre>
            </div>
          )}

          <h3>{t("حقول المنتج", "Product fields")}</h3>
          <table className="catalog-guide-table">
            <tbody>
              {FIELDS.map(([name, ar, en]) => (
                <tr key={name}><td dir="ltr"><code>{name}</code></td><td>{t(ar, en)}</td></tr>
              ))}
            </tbody>
          </table>

          <h3>{t("قائمة التحقق", "Checklist")}</h3>
          <ul className="catalog-guide-notes">
            <li>{t("المنتج الجديد يظهر في الكتالوج ← المنتجات.", "A new product appears under Catalog → Products.")}</li>
            <li>{t("تعديل السعر في موقعك ينعكس هنا، وحذف المنتج أو إيقافه يخفيه.", "Editing a price on your site is reflected here; deleting or deactivating a product hides it.")}</li>
            <li>{t("الصور بروابط https كاملة، والمفتاح وكلمة السر غير موجودين في كود الواجهة أو مستودع عام.", "Images use full https URLs; the key and secret are not in frontend code or a public repo.")}</li>
            <li>{t("احذف أي ملفات تجربة من الاستضافة بعد الانتهاء.", "Delete any test files from your hosting when done.")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
