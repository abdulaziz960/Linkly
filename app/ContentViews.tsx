import Link from "next/link";
import ContentShell from "./ContentShell";
import { faqsAr, faqsEn } from "../lib/faq";
import { sortedBlogPosts, type BlogPost } from "../lib/blog";

type Lang = "ar" | "en";

function dateLabel(date: string, lang: Lang) {
  return new Date(date).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { dateStyle: "long", timeZone: "UTC" });
}

export function FaqView({ lang }: { lang: Lang }) {
  const faqs = lang === "en" ? faqsEn : faqsAr;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
  };
  return (
    <ContentShell lang={lang}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{lang === "en" ? "Frequently asked questions" : "الأسئلة الشائعة"}</h1>
      {faqs.map(([q, a]) => (
        <section key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </section>
      ))}
    </ContentShell>
  );
}

export function BlogIndexView({ lang }: { lang: Lang }) {
  const base = lang === "en" ? "/en/blog" : "/blog";
  return (
    <ContentShell lang={lang}>
      <h1>{lang === "en" ? "Linkly blog" : "مدونة Linkly"}</h1>
      <p>{lang === "en" ? "Practical guides for customer service and sales teams." : "أدلة عملية لفرق خدمة العملاء والمبيعات."}</p>
      {sortedBlogPosts().map((post) => (
        <section key={post.slug}>
          <h2><Link href={`${base}/${post.slug}`}>{post[lang].title}</Link></h2>
          <p><small>{dateLabel(post.date, lang)}</small></p>
          <p>{post[lang].description}</p>
        </section>
      ))}
    </ContentShell>
  );
}

export function BlogPostView({ post, lang }: { post: BlogPost; lang: Lang }) {
  const content = post[lang];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: content.title,
    description: content.description,
    datePublished: post.date,
    inLanguage: lang === "en" ? "en" : "ar-SA",
    author: { "@type": "Organization", name: "Linkly" },
    publisher: { "@type": "Organization", name: "Linkly" }
  };
  return (
    <ContentShell lang={lang}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article>
        <h1>{content.title}</h1>
        <p><small>{dateLabel(post.date, lang)}</small></p>
        {content.blocks.map((block, index) => (block.type === "h2" ? <h2 key={index}>{block.text}</h2> : <p key={index}>{block.text}</p>))}
      </article>
    </ContentShell>
  );
}
