import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "../public/assets/linkly-logo.png";
import LandingNav from "./LandingNav";
import ScrollReveal from "./ScrollReveal";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "Linkly | محادثات عملائك وفريقك في مكان واحد",
  description: "منصة سعودية تجمع محادثات واتساب وإنستقرام والبريد وتيليجرام وتيك توك وتساعد فرق الخدمة والمبيعات على التوزيع والمتابعة من مكان واحد.",
  alternates: { canonical: "/" },
  openGraph: { title: "Linkly | كل محادثات عملائك في مكان واحد", description: "صندوق وارد موحد، توزيع للمحادثات، أتمتة وتقارير لفريقك.", locale: "ar_SA", type: "website" }
};

const features = [
  ["صندوق وارد موحد", "توفّر وقتك بدل التنقل بين تطبيقات؛ كل رسالة وسجل العميل في مكان واحد."],
  ["توزيع المحادثات", "ما تضيع رسالة بلا رد؛ كل محادثة عندها مسؤول واضح من أول لحظة."],
  ["حالات ووسوم", "تعرف فورًا وش يحتاج متابعة اليوم بدل ما تراجع كل محادثة يدويًا."],
  ["تعاون الفريق", "يشتغل فريقك بدون تكرار ردود ولا تعارض، لأن الكل يشوف نفس السياق."],
  ["ردود وأتمتة", "يرد فريقك أسرع بدون كتابة نفس الرد كل مرة، والحالات المعقدة تتحول تلقائيًا."],
  ["تقارير تشغيلية", "تعرف بالأرقام وين التأخير ووين الفرصة، بدل التخمين."]
] as const;
const faqs = [
  ["هل أقدر أستخدم أكثر من موظف؟", "نعم. أضف الموظفين وحدد أدوارهم وفرقهم وصلاحياتهم من لوحة واحدة."],
  ["هل أقدر أربط رقم واتساب الحالي؟", "يعتمد على حالة الرقم ومتطلبات WhatsApp Cloud API لدى Meta، ونساعدك في مراجعة مسار الربط."],
  ["هل أحتاج رقم واتساب جديد؟", "ليس دائمًا. نراجع وضع رقمك الحالي أولًا ثم نحدد أفضل مسار."],
  ["هل تدعمون WhatsApp Business API؟", "نعم، الربط التشغيلي مبني على واجهات WhatsApp Cloud API الرسمية."],
  ["هل يوجد API؟", "تتوفر Webhooks وواجهات تكامل ضمن باقة التوسع وفق نطاق التكامل المطلوب."],
  ["هل أقدر ألغي الاشتراك؟", "يمكن جدولة الإلغاء لنهاية الفترة الحالية من شاشة الفوترة."],
  ["هل يوجد رسم تجهيز؟", "خدمة تجهيز حسابات Meta والربط الكامل اختيارية وتكلف 500 ريال مرة واحدة."],
  ["كيف تُحتسب رسوم واتساب؟", "رسوم رسائل WhatsApp الرسمية من Meta، إن وجدت، منفصلة عن اشتراك Linkly."],
  ["هل بيانات العملاء آمنة؟", "تستخدم المنصة صلاحيات مستخدمين، وتشفيرًا لأسرار التكاملات، وجلسات محددة المدة، وسجلات تشغيل للمساعدة في تتبع النشاط."]
] as const;
const plans = [
  { name:"البداية", price:"249", audience:"الأنسب لصاحب عمل يبدأ لحاله ويحتاج يرتب رسائله.", cta:"ابدأ التجربة", items:["مستخدم واحد","صندوق وارد واحد لكل رسائلك","ردود سريعة ووسوم","تقارير أساسية"] },
  { name:"النمو", price:"499", audience:"الأنسب لفريق صغير يحتاج توزيع محادثات وردود آلية.", cta:"جرّب باقة النمو", featured:true, items:["حتى 3 مستخدمين","توزيع المحادثات","رد آلي وقواعد تحويل","تقارير أداء وSLA"] },
  { name:"الأعمال", price:"999", audience:"الأنسب لفرق متعددة تحتاج تكامل API وتقارير متقدمة.", cta:"جرّب باقة الأعمال", items:["حتى 10 مستخدمين","فرق متعددة","Webhooks وAPI","دعم أولوية"] }
] as const;
const jsonLd = { "@context":"https://schema.org", "@graph":[
  { "@type":"Organization", name:"Linkly", url:"https://audiencew.audience.sa", logo:"https://audiencew.audience.sa/assets/linkly-logo.png" },
  { "@type":"SoftwareApplication", name:"Linkly", applicationCategory:"BusinessApplication", operatingSystem:"Web", offers:{"@type":"AggregateOffer",lowPrice:"249",highPrice:"999",priceCurrency:"SAR"} },
  { "@type":"FAQPage", mainEntity:faqs.map(([q,a])=>({"@type":"Question",name:q,acceptedAnswer:{"@type":"Answer",text:a}})) }
]};

function Check(){return <span className={s.check} aria-hidden="true">✓</span>}
type Platform = "whatsapp" | "instagram" | "email" | "telegram" | "tiktok";
function PlatformLogo({platform}:{platform:Platform}){
  if(platform==="instagram") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" className={s.logoDot}/></svg>;
  if(platform==="email") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>;
  if(platform==="telegram") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path className={s.logoFill} d="M21.4 3.2 18.2 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.3 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L5.8 13.7 1 12.2c-1-.3-1.1-1 .2-1.5L20 3.4c.9-.3 1.7.2 1.4-.2Z"/></svg>;
  if(platform==="tiktok") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path className={s.logoFill} d="M15.2 3c.4 2.3 1.7 3.7 3.8 4.1v3.2a9 9 0 0 1-3.8-1.2v6.1a5.8 5.8 0 1 1-5-5.7v3.3a2.6 2.6 0 1 0 1.8 2.5V3h3.2Z"/></svg>;
  return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.7a8 8 0 0 1-11.8 7l-4.2 1.1 1.1-4.1A8 8 0 1 1 20 11.7Z"/><path d="M9 8.5c.3 2.8 2 4.6 4.8 5.5.5.1 1.3-.8 1.5-1.2"/></svg>;
}
function Preview(){return <div className={s.preview} aria-label="معاينة صندوق محادثات Linkly">
  <header><div><i/><i/><i/></div><b>Linkly Inbox</b><span>متصل</span></header>
  <div className={s.previewBody}><aside><Image src={logo} alt="" width={34} height={34}/><b>⌁</b><b>◎</b><b>♢</b><b>⚙</b></aside>
  <section className={s.conversations}><h3>المحادثات <small>12 جديدة</small></h3>{[["و","وليد السبيعي","هل المنتج متوفر اليوم؟","واتساب"],["ن","نورة أحمد","وصلتني رسالتكم من الإعلان","Instagram"],["س","شركة سمارت","طلب عرض سعر للفريق","البريد"],["م","محمد علي","أحتاج مساعدة في الطلب","Telegram"],["ر","ريم خالد","مهتمة بالربط بعد اعتماد تيك توك","TikTok"]].map((x,i)=><article className={i===0?s.selected:""} key={x[1]}><em>{x[0]}</em><div><b>{x[1]}</b><p>{x[2]}</p><small>{x[3]} · الآن</small></div></article>)}</section>
  <section className={s.chat}><header><div><b>وليد السبيعي</b><small>محادثة مفتوحة</small></div><span>فريق المبيعات</span></header><div><p>السلام عليكم، هل المنتج متوفر اليوم؟</p><p>وعليكم السلام، نعم متوفر. أرسل لك رابط الطلب الآن.</p><small>عميل مهتم　 متابعة اليوم</small></div><footer>اكتب ردك هنا… <b>↑</b></footer></section></div>
  </div>}

export default function HomePage(){return <div className={s.page}>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,"\\u003c")}}/>
  <ScrollReveal />
  <LandingNav />
  <main>
    <section className={s.hero}><div><span className={s.eyebrow}><i/> منصة واحدة لكل فريقك</span><h1>رد أسرع على عملائك <strong>ولا تضيع ولا محادثة</strong></h1><p>واتساب، إنستقرام، البريد وتيليجرام — فريقك يرد ويوزّع ويتابع من صندوق وارد واحد، مع جاهزية تيك توك بعد اعتماد صلاحية المراسلة.</p><div className={s.actions}><Link className={s.primaryLarge} href="/signup">ابدأ تجربتك مجانًا</Link><a className={s.secondary} href="#product">شاهد كيف يعمل ←</a></div><small className={s.micro}><Check/> 3 أيام مجانًا <Check/> بدون بطاقة دفع <Check/> نجهّز لك القنوات</small><div className={s.heroMetrics}><div><b>4</b><span>قنوات متاحة، وتيك توك قريبًا</span></div><div><b>1</b><span>Inbox لكل الفريق</span></div><div><b>∞</b><span>سياق واضح لكل محادثة</span></div></div></div><Preview/></section>
    <section className={s.trust}><b>مصممة لفرق خدمة العملاء والمبيعات</b><span><Check/> رد أسرع</span><span><Check/> مسؤول واضح</span><span><Check/> متابعة لا تضيع</span><span><Check/> صلاحيات للفريق</span></section>
    <section className={`${s.section} ${s.problem}`}><Intro kicker="المشكلة" title="قنوات متعددة. عشرات المحادثات. فريق واحد يحاول يلحق عليها." copy="التنقل بين التطبيقات والجوالات يبطئ الرد ويخفي المسؤول ويجعل متابعة العميل تعتمد على الذاكرة."/><div className={`${s.problemVisual} ${s.revealFade}`}><div className={s.channelMarks}><i title="WhatsApp"><PlatformLogo platform="whatsapp"/></i><i title="Instagram"><PlatformLogo platform="instagram"/></i><i title="البريد الإلكتروني"><PlatformLogo platform="email"/></i><i title="Telegram"><PlatformLogo platform="telegram"/></i><i title="TikTok"><PlatformLogo platform="tiktok"/></i></div><span>←</span><article><Image src={logo} alt="" width={48} height={48}/><div><b>Inbox واحد</b><p>سياق كامل، توزيع واضح، ومتابعة من مكان واحد.</p></div></article></div></section>
    <section className={`${s.section} ${s.product}`} id="product"><Intro kicker="المنتج" title="واجهة واحدة ترى فيها ما يحتاجه الفريق الآن" copy="من أول رسالة إلى الإغلاق، تبقى المحادثة والعميل والمسؤول والخطوة التالية في نفس السياق."/><div className={s.productGrid}><div className={s.numberList}>{[["01","المحادثة أمامك كاملة","الرسائل والقناة والوسوم والحالة دون تنقل."],["02","المسؤول معروف","اسند المحادثة لموظف أو فريق وتابع العمل."],["03","الخطوة التالية واضحة","حوّلها إلى متابعة مبيعات أو دعم أو تصعيد."]].map((x,i)=><article key={x[0]} className={s.reveal} style={{transitionDelay:`${i*80}ms`}}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></article>)}</div><Preview/></div></section>
    <section className={`${s.section} ${s.channels}`}><Intro kicker="القنوات" title="كل قناة بطبيعتها. إدارة واحدة لفريقك." copy="فعّل القنوات التي يحتاجها نشاطك، واجعل الفريق يعمل من صندوق وارد واحد."/><div className={s.channelsGrid}>{[["whatsapp","WhatsApp","محادثات العملاء والقوالب والمرفقات عبر Cloud API."],["instagram","Instagram","استقبل الرسائل وتابع سياق العميل ورد من نفس المساحة."],["email","البريد الإلكتروني","اربط Gmail أو Outlook للإرسال والاستلام."],["telegram","Telegram","اربط البوت واستقبل الرسائل ووزّعها بأمان."],["tiktok","TikTok","جاهز للإعداد بعد حصول النشاط على اعتماد TikTok Business Messaging."]].map((x,i)=><article key={x[1]} className={s.reveal} style={{transitionDelay:`${i*70}ms`}}><i><PlatformLogo platform={x[0] as Platform}/></i><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div></section>
    <section className={`${s.section} ${s.features}`} id="features"><Intro kicker="المميزات" title="كل ما يحتاجه فريقك لإدارة المحادثة بوضوح" copy="أدوات عملية مبنية حول سير العمل اليومي، لا قائمة طويلة من المزايا النظرية."/><div className={s.featureGrid}>{features.map(([t,c],i)=><article key={t} className={s.reveal} style={{transitionDelay:`${i*60}ms`}}><span>0{i+1}</span><h3>{t}</h3><p>{c}</p></article>)}</div><div className={s.inlineCta}><p><b>جاهز تجمع محادثات فريقك؟</b><span>ابدأ بحساب مجاني ثم جهّز قنواتك خطوة بخطوة.</span></p><Link className={s.primary} href="/signup">ابدأ تجربتك مجانًا</Link></div></section>
    <section className={`${s.section} ${s.how}`} id="how"><Intro kicker="طريقة العمل" title="ابدأ خلال أربع خطوات" copy="مسار واضح من إنشاء الحساب إلى أول محادثة يديرها فريقك."/><ol>{[["1","أنشئ حسابك","ابدأ التجربة وأكمل بيانات نشاطك."],["2","اربط قنواتك","جهّز القنوات المتاحة لنشاطك."],["3","أضف فريقك","حدد الموظفين والفرق والصلاحيات."],["4","ابدأ الرد","وزّع المحادثات وتابع الأداء."]].map((x,i)=><li key={x[0]} className={s.reveal} style={{transitionDelay:`${i*80}ms`}}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></li>)}</ol></section>
    <section className={`${s.section} ${s.useCases}`}><Intro kicker="حالات الاستخدام" title="من أول استفسار إلى عميل تمت خدمته"/><div>{[["↗","المبيعات","عميل يأتي من واتساب أو إنستقرام، يُسند لموظف مبيعات وتُحفظ خطوته التالية.","Lead ← تعيين ← متابعة"],["◎","خدمة العملاء","استفسار أو شكوى تدخل للصندوق وتنتقل للفريق الصحيح مع كامل السياق.","رسالة ← فريق ← حل"],["⌁","التشغيل والمتابعة","القواعد والردود السريعة وساعات العمل تقلل التأخير وتحافظ على تجربة ثابتة.","قاعدة ← إجراء ← قياس"]].map((x,i)=><article key={x[1]} className={s.reveal} style={{transitionDelay:`${i*80}ms`}}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p><small dir="rtl">{x[3]}</small></article>)}</div></section>
    <section className={`${s.section} ${s.security}`}><Intro kicker="الأمان والثقة" title="بيانات عملائك تستحق حماية على مستوى أعمالك" copy="الحماية جزء أساسي من المنتج، من تسجيل الدخول إلى ربط قنواتك."/><div>{[["01","تشفير الأسرار","بيانات ربط قنواتك محمية ومشفّرة، وما تظهر كاملة لأي أحد بالواجهة."],["02","صلاحيات وسجلات تشغيل","لكل موظف صلاحياته، ولك سجل بكل نشاط مهم يصير بحسابك."],["03","تحقق من مصدر الرسائل","نتأكد إن كل رسالة قادمة فعليًا من القناة الرسمية قبل ما نقبلها."],["04","جلسات دخول آمنة","جلسات محددة المدة، وكلمات المرور محفوظة بتشفير قوي دايمًا."]].map((x,i)=><article key={x[0]} className={s.reveal} style={{transitionDelay:`${i*70}ms`}}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></article>)}</div></section>
    <section className={`${s.section} ${s.pricing}`} id="pricing"><Intro kicker="الأسعار" title="باقة واضحة لكل مرحلة من نمو فريقك" copy="ابدأ بالتجربة أولًا، ثم اختر السعة والأدوات المناسبة لطريقة عملك."/><div className={s.planGrid}>{plans.map((p,pi)=>{const featured="featured" in p&&p.featured;return <article className={`${featured?s.featured:""} ${s.revealFade}`} key={p.name} style={{transitionDelay:`${pi*90}ms`}}>{featured?<span className={s.popular}>الأكثر اختيارًا</span>:null}<h3>{p.name}</h3><p className={s.planAudience}>{p.audience}</p><div className={s.price}><b>{p.price}</b><span>ريال<br/>/ الشهر</span></div><ul>{p.items.map(i=><li key={i}><Check/>{i}</li>)}</ul><Link className={featured?s.primaryLarge:s.planButton} href="/signup">{p.cta}</Link></article>})}</div>
      <div className={`${s.metaSetup} ${s.revealFade}`}><span className={s.metaSetupGlow} aria-hidden="true"/><div className={s.metaSetupBadge}><b>500</b><span>ريال<br/>مرة واحدة</span></div><div className={s.metaSetupBody}><h2>ما عندك حساب Facebook أو Meta Business؟</h2><p>نجهز لك الحساب وربط WhatsApp Business بالكامل — إضافة اختيارية. <Link className={s.metaSetupLink} href="/contact">اعرف التفاصيل<span aria-hidden="true">←</span></Link></p><p className={s.metaSetupNote}>رسوم الخدمة تدفع مرة واحدة ولا تشمل رسوم Meta أو أي رسوم طرف ثالث إن وجدت.</p></div></div>
      <p className={s.whatsappNote}><b>رسوم WhatsApp:</b> رسوم الرسائل الرسمية من Meta، إن وجدت، منفصلة عن اشتراك Linkly.</p>
    </section>
    <section className={`${s.section} ${s.faq}`} id="faq"><Intro kicker="الأسئلة الشائعة" title="إجابات واضحة قبل أن تبدأ"/><div>{faqs.map(([q,a],i)=><details key={q} open={i<2}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={`${s.finalCta} ${s.revealFade}`}><div><span>ابدأ اليوم</span><h2>خل فريقك يركز على العميل، مو على التنقل بين التطبيقات.</h2><p>ابدأ تجربة Linkly مجانًا لمدة 3 أيام.</p></div><div><Link href="/signup">ابدأ تجربتك مجانًا</Link><small>بدون بطاقة دفع</small></div></section>
  </main>
  <footer className={s.footer}><div><section><Link className={s.brand} href="/"><Image src={logo} alt="" width={38} height={38}/><span>Linkly</span></Link><p>منصة لإدارة محادثات العملاء وتشغيل فرق الخدمة والمبيعات من مكان واحد.</p></section><nav><b>المنتج</b><a href="#features">المميزات</a><a href="#how">طريقة العمل</a><a href="#pricing">الأسعار</a></nav><nav><b>الشركة</b><Link href="/privacy">الخصوصية</Link><Link href="/terms">شروط الاستخدام</Link><Link href="/data-deletion">حذف البيانات</Link><Link href="/contact">تواصل معنا</Link></nav></div><small>جميع الحقوق محفوظة لشركة الجمهور المخصص للدعاية والإعلان.　 Linkly © 2026</small></footer>
  <Link className={s.mobileCta} href="/signup">ابدأ تجربتك مجانًا</Link>
  </div>}

function Intro({kicker,title,copy}:{kicker:string;title:string;copy?:string}){return <div className={s.intro}><span>{kicker}</span><h2>{title}</h2>{copy?<p>{copy}</p>:null}</div>}
