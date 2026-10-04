// Short "what is this feature" notes shown in the upgrade popup for a locked
// section, so a customer who taps a lock learns what they'd get before paying.

import type { ViewKey } from "../app/dashboard/types";
import type { ChannelKey } from "./channel-catalog";

export type FeatureBlurb = {
  ar: { text: string; points: string[] };
  en: { text: string; points: string[] };
};

export const VIEW_BLURBS: Partial<Record<ViewKey, FeatureBlurb>> = {
  catalog: {
    ar: { text: "اعرض منتجاتك لعملائك داخل محادثة واتساب بصورها وأسعارها، ودعهم يطلبون ويدفعون من نفس المحادثة.", points: ["بطاقات منتجات بالصور داخل الرد الآلي", "دفع آمن عبر بوابتك أنت (ميسر)", "مزامنة تلقائية من موقعك أو عبر API"] },
    en: { text: "Show your products inside the WhatsApp chat with photos and prices, and let customers order and pay right there.", points: ["Product cards with photos in the auto-reply", "Secure payment through your own gateway (Moyasar)", "Automatic sync from your website or via API"] }
  },
  branches: {
    ar: { text: "أضف فروعك، وإذا شارك العميل موقعه على واتساب أرسل له أقرب فرع تلقائيًا.", points: ["اسم الفرع والعنوان والمسافة ورابط الخريطة", "دبوس موقع يفتح الاتجاهات بضغطة", "يعمل ضمن الرد الآلي بدون موظف"] },
    en: { text: "Add your branches, and when a customer shares their location on WhatsApp, send them the nearest one automatically.", points: ["Branch name, address, distance and map link", "A location pin that opens directions in one tap", "Works inside the auto-reply, no agent needed"] }
  },
  ai: {
    ar: { text: "مساعد ذكي يقترح على موظفيك الردود ويلخّص المحادثات، وقد يرد بنفسه على عملائك.", points: ["اقتراح ردود بنبرة نشاطك", "تلخيص المحادثات وتفريغ الرسائل الصوتية", "خطوة رد آلي بالذكاء الاصطناعي"] },
    en: { text: "A smart assistant that suggests replies to your agents, summarizes chats and can even answer customers itself.", points: ["Reply suggestions in your business's tone", "Chat summaries and voice-note transcription", "An AI auto-reply step"] }
  },
  knowledgeBase: {
    ar: { text: "أضف أسئلتك الشائعة وإجاباتها ليرد بها الرد الآلي والمساعد بدقة وبدون موظف.", points: ["رد تلقائي من إجاباتك أنت", "يجعل ردود الذكاء الاصطناعي أدق", "تعديل الإجابات في أي وقت"] },
    en: { text: "Add your common questions and answers so the auto-reply and the assistant answer accurately without an agent.", points: ["Automatic answers from your own content", "Makes AI replies more accurate", "Edit answers anytime"] }
  },
  automations: {
    ar: { text: "قواعد تعمل وحدها: وزّع المحادثات، وسم العملاء، وصعّد المتأخر دون تدخل منك.", points: ["إسناد تلقائي حسب شروطك", "إجراءات بعد مدة معينة", "تجربة القاعدة قبل تفعيلها"] },
    en: { text: "Rules that run on their own: route chats, tag customers and escalate delays with no manual work.", points: ["Automatic assignment by your conditions", "Actions after a set delay", "Test a rule before enabling it"] }
  },
  campaigns: {
    ar: { text: "أرسل رسائل تسويقية لعملائك على واتساب بقوالب معتمدة، وتابع من فتحها ومن ضغط روابطها.", points: ["جدولة الحملات وإرسالها لشريحة محددة", "روابط تتبع النقرات وتقرير للتفاعل", "حماية تلقائية لمن أوقف الرسائل التسويقية"] },
    en: { text: "Send marketing messages to your customers on WhatsApp with approved templates, and see who opened and clicked.", points: ["Schedule campaigns to a chosen segment", "Click-tracking links and an engagement report", "Automatic protection for people who opted out"] }
  },
  segments: {
    ar: { text: "قسّم عملاءك إلى شرائح لتستهدف كل مجموعة بالرسالة المناسبة.", points: ["شرائح بالوسوم وأيام عدم التفاعل", "شرائح بتفاعل الحملات السابقة", "استهدفها مباشرة في الحملات"] },
    en: { text: "Group your customers into segments and target each group with the right message.", points: ["Segments by tags and inactivity days", "Segments by past campaign engagement", "Target them directly in campaigns"] }
  },
  pipeline: {
    ar: { text: "تابع فرص البيع كلوحة كانبان من أول اهتمام إلى إغلاق الصفقة.", points: ["مراحل واضحة لكل عميل", "قيمة الصفقات ونسب النجاح", "ربط المحادثة بمرحلة البيع"] },
    en: { text: "Track sales opportunities on a kanban board from first interest to a closed deal.", points: ["Clear stages for every customer", "Deal values and win rates", "Link each chat to a sales stage"] }
  },
  templates: {
    ar: { text: "أنشئ قوالب رسائل واتساب المعتمدة لإعادة فتح المحادثات والحملات.", points: ["قوالب بصور وأزرار", "إعادة فتح محادثة بعد 24 ساعة", "تُستخدم في الحملات"] },
    en: { text: "Create approved WhatsApp message templates to re-open chats and run campaigns.", points: ["Templates with images and buttons", "Re-open a chat after 24 hours", "Used in campaigns"] }
  },
  workHours: {
    ar: { text: "حدّد ساعات دوامك وأرسل رداً تلقائيًا للعملاء خارج الدوام.", points: ["جدول لكل فريق", "رد تلقائي خارج الدوام", "يوقف التصعيد خارج الدوام"] },
    en: { text: "Set your working hours and auto-reply to customers outside them.", points: ["A schedule per team", "Automatic out-of-hours reply", "Pauses escalation outside hours"] }
  },
  teams: {
    ar: { text: "نظّم موظفيك في فرق وزّع عليها المحادثات تلقائيًا بالتساوي.", points: ["توزيع تلقائي على المتصلين", "مسؤول لكل فريق", "تقارير أداء لكل فريق"] },
    en: { text: "Organize agents into teams and route chats to them evenly and automatically.", points: ["Automatic routing to online agents", "A lead for each team", "Performance reports per team"] }
  },
  operations: {
    ar: { text: "لوحة للمالك ترى منها كل أنشطة الموظفين وحالة المحادثات لحظة بلحظة.", points: ["نظرة على كل الموظفين", "المحادثات المتأخرة والمتصاعدة", "مؤشرات التزام الرد"] },
    en: { text: "An owner dashboard to see every agent's activity and the state of all chats live.", points: ["An overview of all agents", "Late and escalated conversations", "Response-time indicators"] }
  },
  integrations: {
    ar: { text: "اربط لنكلي بأدواتك الأخرى مثل Zapier ونماذج العملاء المحتملين.", points: ["استقبال العملاء المحتملين تلقائيًا", "ربط عبر Webhook", "بدون برمجة"] },
    en: { text: "Connect Linkly with your other tools such as Zapier and lead forms.", points: ["Receive leads automatically", "Connect via webhook", "No coding needed"] }
  },
  developers: {
    ar: { text: "واجهة API وWebhooks لربط موقعك أو نظامك بلنكلي برمجيًا.", points: ["مفاتيح API وإحداثيات موثقة", "أحداث فورية عبر Webhooks", "مزامنة المنتجات والعملاء"] },
    en: { text: "An API and webhooks to connect your website or system to Linkly programmatically.", points: ["API keys and documented endpoints", "Real-time events via webhooks", "Sync products and customers"] }
  },
  branding: {
    ar: { text: "ضع شعارك واسمك على لوحة التحكم بدل شعار لنكلي (White-label).", points: ["شعار واسم نشاطك", "تجربة موحدة لفريقك", "مناسب للشركات الكبيرة"] },
    en: { text: "Put your own logo and name on the dashboard instead of Linkly's (white-label).", points: ["Your logo and business name", "A consistent experience for your team", "Built for larger companies"] }
  },
  reports: {
    ar: { text: "تقارير تفصيلية عن أداء موظفيك وفرقك والتزامهم بوقت الرد.", points: ["أداء كل موظف وفريق", "أوقات الذروة وملخصات الذكاء", "تصدير إلى Excel"] },
    en: { text: "Detailed reports on your agents' and teams' performance and response times.", points: ["Per-agent and per-team performance", "Peak hours and AI summaries", "Excel export"] }
  }
};

export const CHANNEL_BLURBS: Partial<Record<ChannelKey, FeatureBlurb>> = {
  instagram: { ar: { text: "استقبل رسائل إنستغرام وتعليقاته وردّ عليها من نفس صندوق الوارد.", points: ["رسائل وتعليقات في مكان واحد", "نفس سياق العميل مع واتساب"] }, en: { text: "Receive Instagram messages and comments and reply from the same inbox.", points: ["Messages and comments in one place", "The same customer context as WhatsApp"] } },
  telegram: { ar: { text: "اربط بوت تيليجرام لاستقبال رسائل عملائك وتوزيعها على فريقك.", points: ["رد آلي على تيليجرام", "توزيع على الفريق"] }, en: { text: "Connect a Telegram bot to receive customer messages and route them to your team.", points: ["Auto-reply on Telegram", "Route to your team"] } },
  email: { ar: { text: "اربط بريد جيميل لاستقبال رسائل العملاء والرد عليها من صندوق واحد.", points: ["إرسال واستقبال", "نفس نظام الإسناد والوسوم"] }, en: { text: "Connect Gmail to receive and reply to customer emails from one inbox.", points: ["Send and receive", "Same assignment and tags"] } },
  facebook: { ar: { text: "استقبل رسائل صفحتك على فيسبوك ماسنجر وردّ عليها.", points: ["رسائل الصفحة في صندوقك", "رد آلي"] }, en: { text: "Receive your Facebook page's Messenger messages and reply to them.", points: ["Page messages in your inbox", "Auto-reply"] } },
  google_maps: { ar: { text: "تابع مراجعات نشاطك على جوجل وردّ عليها من لنكلي.", points: ["مراجعات جوجل بزنس", "رد سريع على التقييمات"] }, en: { text: "Follow your Google Business reviews and reply from Linkly.", points: ["Google Business reviews", "Fast replies to ratings"] } },
  meta_leads: { ar: { text: "استقبل عملاء نماذج إعلانات ميتا فور تعبئتها وابدأ التواصل معهم.", points: ["عملاء الإعلانات مباشرة", "رسالة ترحيب تلقائية"] }, en: { text: "Receive Meta lead-ad form submissions instantly and start talking to them.", points: ["Ad leads straight to your inbox", "Automatic welcome message"] } },
  tiktok: { ar: { text: "اربط حساب تيك توك لمتابعة التواصل مع جمهورك.", points: ["ربط الحساب", "المراسلة تتطلب صلاحية من تيك توك"] }, en: { text: "Connect your TikTok account to keep in touch with your audience.", points: ["Account linking", "Messaging needs TikTok's permission"] } },
  youtube: { ar: { text: "تابع تعليقات فيديوهاتك على يوتيوب وردّ عليها من لنكلي.", points: ["تعليقات الفيديوهات في صندوقك", "رد سريع"] }, en: { text: "Follow comments on your YouTube videos and reply from Linkly.", points: ["Video comments in your inbox", "Fast replies"] } },
  linkedin: { ar: { text: "تابع تعليقات منشورات صفحتك على لينكدإن وردّ عليها.", points: ["تعليقات الصفحة في صندوقك", "رد سريع"] }, en: { text: "Follow comments on your LinkedIn page posts and reply to them.", points: ["Page comments in your inbox", "Fast replies"] } },
  snapchat: { ar: { text: "استقبل عملاء إعلانات سناب شات المحتملين وابدأ التواصل معهم.", points: ["عملاء النماذج مباشرة", "متابعتهم من صندوقك"] }, en: { text: "Receive Snapchat lead-ad customers and start talking to them.", points: ["Form leads straight to you", "Follow up from your inbox"] } },
  sms: { ar: { text: "أرسل واستقبل رسائل SMS مع عملائك عبر يونيفونك.", points: ["رسائل نصية في صندوقك", "للعملاء بدون واتساب"] }, en: { text: "Send and receive SMS with your customers through Unifonic.", points: ["Text messages in your inbox", "For customers without WhatsApp"] } },
  x: { ar: { text: "تابع رسائل إكس (تويتر) ومنشنات حسابك وردّ عليها.", points: ["الرسائل والمنشنات", "ردود عامة أو خاصة"] }, en: { text: "Follow your X (Twitter) DMs and mentions and reply to them.", points: ["DMs and mentions", "Public or private replies"] } }
};

export const BOT_STEP_BLURBS: Record<string, FeatureBlurb> = {
  "رد AI تلقائي": VIEW_BLURBS.ai!,
  "رد من قاعدة المعرفة": VIEW_BLURBS.knowledgeBase!,
  "عرض الكتالوج": VIEW_BLURBS.catalog!,
  "أقرب فرع": VIEW_BLURBS.branches!,
  "إرسال قائمة طويلة": { ar: { text: "قائمة اختيارات طويلة (حتى 10 خيارات) يضغط منها العميل بدل أن يكتب.", points: ["خيارات أكثر من القائمة القصيرة", "كل خيار يقود لخطوة"] }, en: { text: "A long choice list (up to 10 options) the customer taps instead of typing.", points: ["More options than the short list", "Each option leads to a step"] } },
  "تحويل لفريق": VIEW_BLURBS.teams!
};
