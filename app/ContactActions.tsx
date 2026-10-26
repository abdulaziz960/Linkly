import WhatsAppCta from "./WhatsAppCta";

export default function ContactActions({ lang }: { lang: "ar" | "en" }) {
  const en = lang === "en";
  const subject = en ? "Request a Linkly walkthrough" : "طلب عرض توضيحي لمنصة لنكلي";
  const message = en ? "Hi, I would like a Linkly walkthrough and help choosing a plan for my team." : "مرحبًا، أرغب بعرض توضيحي للنكلي ومساعدة في اختيار باقة لفريقي.";
  return <section className="legal-contact">
    <h2>{en ? "See how Linkly fits your team" : "شاهد كيف يناسب لنكلي فريقك"}</h2>
    <p>{en ? "Tell us your channels and team size. We can review connection requirements and help you choose a plan before you create your trial." : "أخبرنا بقنواتك وعدد أفراد فريقك. نراجع معك متطلبات الربط ونساعدك في اختيار الباقة قبل إنشاء التجربة."}</p>
    <div className="legal-links">
      <WhatsAppCta pageId={en ? "contact-en" : "contact-ar"} linkId="contact-whatsapp" message={message}>{en ? "Chat on WhatsApp" : "راسلنا واتساب"}</WhatsAppCta>
      <a href={`mailto:info@linklysa.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>{en ? "Request a walkthrough by email" : "اطلب عرضًا توضيحيًا بالبريد"}</a>
    </div>
  </section>;
}
