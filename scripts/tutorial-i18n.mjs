/** Language support for the tutorial recorder: `TUTORIAL_LANG=en` records the English interface.
 *  The English labels are read from the app's own t("عربي", "English") pairs, so the recorder always matches the UI. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
export const LANG = process.env.TUTORIAL_LANG === 'en' ? 'en' : 'ar';
const STR = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + '`[^`$]*`';
const PAIR = new RegExp(String.raw`\bt\(\s*(${STR})\s*,\s*(${STR})\s*\)`, 'g');
const OBJECT_PAIR = new RegExp(String.raw`\bar:\s*(${STR})\s*,\s*en:\s*(${STR})`, 'g');
const AR = /[؀-ۿ]/;
const unquote = (raw) => { const body = raw.slice(1, -1); return body.replace(/\\(["'`\\])/g, '$1').replace(/\\n/g, '\n'); };
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out); else if (/\.(tsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
const map = new Map();
if (LANG === 'en') {
  for (const file of walk('app')) {
    const source = readFileSync(file, 'utf8');
    for (const regex of [PAIR, OBJECT_PAIR]) {
      regex.lastIndex = 0;
      for (const match of source.matchAll(regex)) {
        const ar = unquote(match[1]).trim(); const en = unquote(match[2]).trim();
        if (AR.test(ar) && !map.has(ar)) map.set(ar, en);
      }
    }
  }
}
/** Demo values typed into fields and names the app itself doesn't translate. */
const EXTRA = {
  'آخر 30 يوماً': 'Last 30 days', 'إرسال رسالة': 'Send a message', 'الرد الآلي': 'Auto Reply',
  'أهلًا بك في متجرنا التجريبي. اختر الخدمة المناسبة من القائمة التالية.': 'Welcome to our demo store. Please choose the right service from the list below.',
  'أهلًا بك في نشاطنا، يسعدنا خدمتك.': 'Welcome to our business, we are happy to help.',
  'أهلًا بك، كيف نقدر نخدمك؟': 'Welcome, how can we help you?',
  'أهلًا بك، يسعدنا مساعدتك. هذا محتوى تجريبي لشرح الإعداد.': 'Welcome, we are happy to help. This is sample content to explain the setup.',
  'اختر الخدمة التي تحتاجها': 'Choose the service you need',
  'الأسعار': 'Prices', 'التحدث مع الدعم': 'Talk to support', 'الترحيب': 'Welcome', 'الخدمات': 'Services',
  'الخدمة الأساسية تبدأ من 100 ريال. اكتب الخدمة المطلوبة لمساعدتك.': 'The basic service starts from 100 SAR. Tell us which service you need.',
  'الطلب التالي يستخدم مفتاحًا تدريبيًا محليًا. قيمة المفتاح مخفية.': 'The next request uses a local training key. The key value is hidden.',
  'القائمة الرئيسية': 'Main menu', 'ترحيب المتجر': 'Store welcome', 'خدمة العملاء': 'Customer service',
  'خطوة تدريبية للحذف': 'Training step to delete', 'خيار تدريبي': 'Training option', 'دليل-تدريبي.txt': 'training-guide.txt',
  'رمز البوت التدريبي — لا يستخدم للربط': 'Training bot token - not used to connect',
  'شكرًا لتواصلك معنا.': 'Thank you for contacting us.', 'عميل API التجريبي': 'API test customer', 'عميل تجريبي': 'Test customer',
  'فريق الدعم': 'Support team', 'قائمة المتجر': 'Store menu', 'قاعدة تدريبية': 'Training rule', 'متجر التدريب': 'Training store',
  'مثال تدريبي — ': 'Training example - ', 'مثال تدريبي': 'Training example', 'مرحبًا، أحتاج مساعدة': 'Hello, I need help',
  'هذا مستند تدريبي لشرح رفع الملفات.': 'This is a training document that explains uploading files.', 'هذه خطوة مؤقتة': 'This is a temporary step',
  'تكامل تدريبي للفيديو': 'Video training integration',
  'ميتا (فيسبوك وإنستغرام)': 'Meta (Facebook and Instagram)',
  'تسجيل الدخول': 'Sign in',
  'ميتا (فيسبوك وإنستغرام)': 'Meta (Facebook & Instagram)',
  '＋ حملة جديدة': '＋ New campaign', '＋ حملة بريد جديدة': '＋ New email campaign',
  'ربط منصة': 'External platform', 'نسخ': 'Copy', 'إخفاء': 'Dismiss',
  'إضافة مسار خدمة عملاء كامل': 'Add Full customer service flow', '＋ خطوة مخصصة': '＋ Custom step', '＋ إضافة خيار': '＋ Add option',
  'العملاء والوسوم': 'Customers, leads & tags',
  'الخيار 1': 'Option 1', 'الخيار 2': 'Option 2', 'الخيار 4': 'Option 4',
  'إرسال صورة': 'Send an image', 'إرسال فيديو': 'Send a video', 'إرسال مستند': 'Send a document',
  'إرسال قائمة قصيرة': 'Send a short list', 'إرسال قائمة طويلة': 'Send a long list', 'رد من قاعدة المعرفة': 'Knowledge Base reply',
  'رد AI تلقائي': 'Automatic AI reply', 'عرض الكتالوج': 'Show the catalog', 'أقرب فرع': 'Nearest branch',
  'تحويل لفريق': 'Transfer to a team', 'تحويل لموظف': 'Transfer to an employee', 'إغلاق المحادثة': 'Close the conversation',
  'إرسال': 'Send', 'إرسال قائمة': 'Send a', 'رد من': 'Knowledge Base', 'رد AI': 'Automatic AI', 'تحويل': 'Transfer', 'أقرب ف': 'Nearest b', 'دليل': 'training', 'تدريبي': 'guide', '＋ إضافة خطوة': '＋ Add step', 'دليل-تدريبي': 'training-guide'
};
export const tr = (text) => (LANG === 'en' ? (EXTRA[text] ?? map.get(text) ?? text) : text);
/** A regex whose Arabic runs are replaced by their English labels. */
export const trx = (regex) => {
  if (LANG !== 'en') return regex;
  const source = regex.source.replace(/[؀-ۿ＋🧪][؀-ۿ\s＋🧪]*[؀-ۿ]|[؀-ۿ]/g, (run) => tr(run.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(source, regex.flags);
};
export const missingLabels = (labels) => labels.filter((label) => LANG === 'en' && tr(label) === label);
