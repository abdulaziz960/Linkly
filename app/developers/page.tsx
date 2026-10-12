import type { Metadata } from "next";
import Link from "next/link";
import {
  API_BASE_URL,
  API_KEY_PLACEHOLDER,
  AUTH_NOTES,
  ENDPOINTS,
  ERROR_CODES,
  GENERAL_NOTES,
  QUICKSTART_SAMPLES,
  STORE_EXAMPLE,
  WEBHOOK_EVENTS,
  WEBHOOK_NOTES,
  WEBHOOK_VERIFY_SAMPLES,
  curlFor,
  type DocEndpoint,
  type DocField
} from "../../lib/api-docs";
import CodeBlock from "./CodeBlock";
import "./developers.css";

export const metadata: Metadata = {
  title: "توثيق واجهة Linkly البرمجية (API)",
  description: "دليل المطورين: مفاتيح API، فتح المحادثات، إرسال الرسائل، العملاء، المنتجات، وWebhooks مع أمثلة جاهزة ومواصفات OpenAPI.",
  alternates: { canonical: "/developers" }
};

const TAGS = Array.from(new Set(ENDPOINTS.map((endpoint) => endpoint.tag)));

function FieldsTable({ fields, title }: { fields: DocField[]; title: string }) {
  return (
    <div className="dev-table-wrap">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr><th scope="col">الحقل</th><th scope="col">النوع</th><th scope="col">مطلوب</th><th scope="col">الوصف</th></tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <td><code dir="ltr">{field.name}</code></td>
              <td><code dir="ltr">{field.type}</code></td>
              <td>{field.required ? "نعم" : "لا"}</td>
              <td>{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointSection({ endpoint }: { endpoint: DocEndpoint }) {
  return (
    <section className="dev-endpoint" id={endpoint.id} aria-labelledby={`${endpoint.id}-title`}>
      <h3 id={`${endpoint.id}-title`}>
        <span className={`dev-method dev-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
        <code dir="ltr">{endpoint.path}</code>
      </h3>
      <p className="dev-summary">{endpoint.summary}</p>
      <p>{endpoint.description}</p>
      {endpoint.pathParams ? <FieldsTable title="معاملات المسار" fields={endpoint.pathParams} /> : null}
      {endpoint.query ? <FieldsTable title="معاملات الاستعلام (Query)" fields={endpoint.query} /> : null}
      {endpoint.body ? (
        <>
          <FieldsTable title={`حقول الطلب (${endpoint.body.contentTypes.join(" · ")})`} fields={endpoint.body.fields} />
        </>
      ) : null}
      {endpoint.notes ? (
        <ul className="dev-notes">
          {endpoint.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
      <CodeBlock label="cURL" code={curlFor(endpoint)} />
      <CodeBlock label="الرد (200)" code={JSON.stringify(endpoint.responseExample, null, 2)} />
      <p className="dev-errors">
        أخطاء محتملة:{" "}
        {endpoint.errors.map((status) => <code key={status} dir="ltr">{status}</code>)}
      </p>
    </section>
  );
}

export default function DevelopersPage() {
  return (
    <main className="dev-page" dir="rtl" lang="ar">
      <header className="dev-header">
        <Link href="/" className="dev-brand">Linkly</Link>
        <nav aria-label="روابط التوثيق">
          <a href="/openapi.json">OpenAPI (JSON)</a>
          <Link href="/login">لوحة التحكم</Link>
        </nav>
      </header>

      <div className="dev-layout">
        <aside className="dev-toc" aria-label="فهرس التوثيق">
          <ul>
            <li><a href="#quickstart">البدء السريع</a></li>
            <li><a href="#auth">المصادقة</a></li>
            <li><a href="#conventions">الصيغ والحدود</a></li>
            <li><a href="#errors">الأخطاء</a></li>
            {TAGS.map((tag) => (
              <li key={tag}>
                <a href={`#tag-${TAGS.indexOf(tag)}`}>{tag}</a>
                <ul>
                  {ENDPOINTS.filter((endpoint) => endpoint.tag === tag).map((endpoint) => (
                    <li key={endpoint.id}><a href={`#${endpoint.id}`}><span className={`dev-method dev-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span> <bdi dir="ltr">{endpoint.path}</bdi></a></li>
                  ))}
                </ul>
              </li>
            ))}
            <li><a href="#webhooks">Webhooks</a></li>
            <li><a href="#examples">أمثلة تكامل</a></li>
          </ul>
        </aside>

        <article className="dev-content">
          <h1>توثيق واجهة Linkly البرمجية</h1>
          <p className="dev-lead">
            استخدم الواجهة لربط متجرك أو نظامك مع لنكلي: افتح المحادثات، أرسل الرسائل، زامن العملاء والمنتجات، واستقبل الأحداث لحظيًا عبر Webhooks.
          </p>
          <p>
            الرابط الأساسي: <code dir="ltr">{API_BASE_URL}</code> · الإصدار الحالي <code dir="ltr">v1</code> · المواصفات الآلية: <a href="/openapi.json">openapi.json</a>
          </p>

          <section id="quickstart" aria-labelledby="quickstart-title">
            <h2 id="quickstart-title">البدء السريع</h2>
            <ol>
              <li>من لوحة التحكم افتح <b>المطورون</b> ثم <b>إنشاء مفتاح</b>، وانسخ المفتاح (يظهر مرة واحدة).</li>
              <li>احفظه كمتغير بيئة في خادمك باسم <code dir="ltr">LINKLY_API_KEY</code>.</li>
              <li>أرسل أول طلب:</li>
            </ol>
            <CodeBlock label="cURL" code={`curl -X POST "${API_BASE_URL}/conversations" \\\n  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"customerPhone":"0501234567","customerName":"عميل","text":"مرحبًا"}'`} />
            <CodeBlock label="Node.js" code={QUICKSTART_SAMPLES.node} />
            <CodeBlock label="Python" code={QUICKSTART_SAMPLES.python} />
            <CodeBlock label="PHP" code={QUICKSTART_SAMPLES.php} />
          </section>

          <section id="auth" aria-labelledby="auth-title">
            <h2 id="auth-title">المصادقة</h2>
            <CodeBlock label="Header" code={`Authorization: Bearer ${API_KEY_PLACEHOLDER}`} />
            <ul className="dev-notes">
              {AUTH_NOTES.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>

          <section id="conventions" aria-labelledby="conventions-title">
            <h2 id="conventions-title">الصيغ والحدود</h2>
            <dl className="dev-dl">
              <dt>صيغة الرد</dt><dd>{GENERAL_NOTES.envelope}</dd>
              <dt>حد الطلبات</dt><dd>{GENERAL_NOTES.rateLimit}</dd>
              <dt>الترقيم</dt><dd>{GENERAL_NOTES.pagination}</dd>
              <dt>أرقام الجوال</dt><dd>{GENERAL_NOTES.phone}</dd>
              <dt>الترميز</dt><dd>{GENERAL_NOTES.encoding}</dd>
              <dt>رسائل الخطأ</dt><dd>{GENERAL_NOTES.language}</dd>
            </dl>
          </section>

          <section id="errors" aria-labelledby="errors-title">
            <h2 id="errors-title">رموز الاستجابة</h2>
            <div className="dev-table-wrap">
              <table>
                <thead><tr><th scope="col">الرمز</th><th scope="col">المعنى</th><th scope="col">ما تفعله</th></tr></thead>
                <tbody>
                  {ERROR_CODES.map((item) => (
                    <tr key={item.status}><td><code dir="ltr">{item.status}</code></td><td>{item.meaning}</td><td>{item.action}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {TAGS.map((tag, index) => (
            <section key={tag} id={`tag-${index}`} aria-labelledby={`tag-${index}-title`}>
              <h2 id={`tag-${index}-title`}>{tag}</h2>
              {ENDPOINTS.filter((endpoint) => endpoint.tag === tag).map((endpoint) => <EndpointSection key={endpoint.id} endpoint={endpoint} />)}
            </section>
          ))}

          <section id="webhooks" aria-labelledby="webhooks-title">
            <h2 id="webhooks-title">Webhooks</h2>
            <ul className="dev-notes">
              {WEBHOOK_NOTES.map((note) => <li key={note}>{note}</li>)}
            </ul>
            <h3>الأحداث</h3>
            {WEBHOOK_EVENTS.map((event) => (
              <div key={event.name} className="dev-event">
                <h4><code dir="ltr">{event.name}</code></h4>
                <p>{event.description}</p>
                {event.notes ? <p className="dev-muted">{event.notes}</p> : null}
                <CodeBlock label="الحمولة" code={JSON.stringify({ event: event.name, data: event.data, sentAt: "2026-10-01T10:15:31.000Z" }, null, 2)} />
              </div>
            ))}
            <h3>التحقق من التوقيع</h3>
            <CodeBlock label="Node.js" code={WEBHOOK_VERIFY_SAMPLES.node} />
            <CodeBlock label="Python" code={WEBHOOK_VERIFY_SAMPLES.python} />
            <CodeBlock label="PHP" code={WEBHOOK_VERIFY_SAMPLES.php} />
          </section>

          <section id="examples" aria-labelledby="examples-title">
            <h2 id="examples-title">أمثلة تكامل</h2>
            <h3>متجر إلكتروني (سلة أو زد أو موقع خاص)</h3>
            <p>عند وصول طلب جديد، افتح محادثة مع المشتري ثم أرسل له تأكيد الطلب. المثال قابل للتعديل وليس تطبيقًا جاهزًا في متجر التطبيقات.</p>
            <CodeBlock label="Node.js" code={STORE_EXAMPLE} />
            <h3>رفع كتالوج المنتجات</h3>
            <p>أرسل منتجات موقعك دفعة واحدة (حتى 100). أعد إرسال نفس <code dir="ltr">externalId</code> لتحديث السعر أو المخزون.</p>
            <CodeBlock label="cURL" code={`curl -X POST "${API_BASE_URL}/products" \\\n  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"products":[{"externalId":"SKU-100","name":"قميص قطن","price":120,"stock":25},{"externalId":"SKU-101","name":"بنطلون","price":180}]}'`} />
          </section>

          <footer className="dev-footer">
            <p>هل تحتاج مساعدة في التكامل؟ <Link href="/contact">تواصل معنا</Link>.</p>
          </footer>
        </article>
      </div>
    </main>
  );
}
