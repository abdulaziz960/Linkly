import { postPath, postSeoText, postShareImage } from "../lib/blog-seo";
import Link from "next/link";
import ContentShell from "./ContentShell";
import type { FaqPair } from "../lib/faq-store";
import type { PublicPost } from "../lib/blog-store";
import { listCategories } from "../lib/blog-store";
import type { ReactNode } from "react";

type Lang = "ar" | "en";

function dateLabel(date: string, lang: Lang) {
  return new Date(date).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { dateStyle: "long", timeZone: "UTC" });
}

export function FaqView({ lang, faqs }: { lang: Lang; faqs: FaqPair[] }) {
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

const SITE = "https://linklysa.io";

export type Crumb = { name: string; path?: string };

/** Visible breadcrumb trail plus its BreadcrumbList structured data. The last crumb is the current page (no link). */
export function Breadcrumbs({ items, lang }: { items: Crumb[]; lang: Lang }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, ...(item.path ? { item: `${SITE}${item.path}` } : {}) }))
  };
  return (
    <nav className="crumbs" aria-label={lang === "en" ? "Breadcrumb" : "مسار التنقل"}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ol>
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`}>{item.path && index < items.length - 1 ? <Link href={item.path}>{item.name}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.name}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

/** Text with [label](/path) or [label](https://...) links turned into real links; anything else stays plain text. */
function withLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, label, href] = match;
    parts.push(href.startsWith("/") ? <Link key={match.index} href={href}>{label}</Link> : <a key={match.index} href={href} rel="noopener">{label}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const blogBase = (lang: Lang) => (lang === "en" ? "/en/blog" : "/blog");
const homePath = (lang: Lang) => (lang === "en" ? "/en" : "/");
const crumbRoot = (lang: Lang): Crumb[] => [{ name: lang === "en" ? "Home" : "الرئيسية", path: homePath(lang) }, { name: lang === "en" ? "Blog" : "المدونة", path: blogBase(lang) }];

function PostCard({ post, lang }: { post: PublicPost; lang: Lang }) {
  const content = post[lang]!;
  return (
    <section>
      <h2><Link href={`${blogBase(lang)}/${post.slug}`}>{content.title}</Link></h2>
      <p className="post-meta"><span>{dateLabel(post.date, lang)}</span>{post.category ? <Link href={`${blogBase(lang)}/category/${post.category.slug}`}>{post.category[lang]}</Link> : null}</p>
      {post.seo.featuredImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="post-thumb" src={post.seo.featuredImage} alt={postSeoText(post, lang).imageAlt} width={1200} height={630} loading="lazy" decoding="async" />
      ) : null}
      <p>{content.description}</p>
    </section>
  );
}

export function BlogIndexView({ lang, posts }: { lang: Lang; posts: PublicPost[] }) {
  const categories = listCategories(posts, lang);
  return (
    <ContentShell lang={lang}>
      <Breadcrumbs lang={lang} items={[crumbRoot(lang)[0], { name: lang === "en" ? "Blog" : "المدونة" }]} />
      <h1>{lang === "en" ? "Linkly blog" : "مدونة Linkly"}</h1>
      <p>{lang === "en" ? "Practical guides for customer service and sales teams." : "أدلة عملية لفرق خدمة العملاء والمبيعات."}</p>
      {categories.length ? (
        <p className="post-meta">{categories.map((category) => <Link key={category.slug} href={`${blogBase(lang)}/category/${category.slug}`}>{category.name} ({category.count})</Link>)}</p>
      ) : null}
      {posts.filter((post) => post[lang]).map((post) => <PostCard key={post.slug} post={post} lang={lang} />)}
    </ContentShell>
  );
}

export function BlogCategoryView({ lang, categoryName, posts }: { lang: Lang; categoryName: string; posts: PublicPost[] }) {
  return (
    <ContentShell lang={lang}>
      <Breadcrumbs lang={lang} items={[...crumbRoot(lang), { name: categoryName }]} />
      <h1>{categoryName}</h1>
      {posts.map((post) => <PostCard key={post.slug} post={post} lang={lang} />)}
    </ContentShell>
  );
}

export function BlogPostView({ post, lang, related = [] }: { post: PublicPost; lang: Lang; related?: PublicPost[] }) {
  const content = post[lang]!; // the page only renders a post that has this language
  const image = postShareImage(post);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: content.title,
    description: content.description,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: lang === "en" ? "en" : "ar-SA",
    mainEntityOfPage: `${SITE}${postPath(post.slug, lang)}`,
    ...(image ? { image: image.startsWith("/") ? `${SITE}${image}` : image } : {}),
    ...(post.category ? { articleSection: post.category[lang] } : {}),
    author: post.author ? { "@type": "Person", name: post.author } : { "@type": "Organization", name: "Linkly" },
    publisher: { "@type": "Organization", name: "Linkly", logo: { "@type": "ImageObject", url: `${SITE}/assets/linkly-logo.png` } }
  };
  const crumbs: Crumb[] = [...crumbRoot(lang), ...(post.category ? [{ name: post.category[lang], path: `${blogBase(lang)}/category/${post.category.slug}` }] : []), { name: content.title }];
  return (
    <ContentShell lang={lang}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs lang={lang} items={crumbs} />
      <article className="article-body">
        <h1>{content.title}</h1>
        <p className="post-meta">
          <span>{dateLabel(post.date, lang)}</span>
          {post.author ? <span>{lang === "en" ? `By ${post.author}` : `بقلم ${post.author}`}</span> : null}
          {post.category ? <Link href={`${blogBase(lang)}/category/${post.category.slug}`}>{post.category[lang]}</Link> : null}
        </p>
        {post.seo.featuredImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="post-cover" src={post.seo.featuredImage} alt={postSeoText(post, lang).imageAlt} width={1200} height={630} fetchPriority="high" decoding="async" />
        ) : null}
        {content.blocks.map((block, index) => (block.type === "h2" ? <h2 key={index}>{block.text}</h2> : <p key={index}>{withLinks(block.text)}</p>))}
      </article>
      {related.length ? (
        <aside className="related-posts" aria-label={lang === "en" ? "Related articles" : "مقالات ذات صلة"}>
          <h2>{lang === "en" ? "Related articles" : "مقالات ذات صلة"}</h2>
          <ul>{related.map((item) => <li key={item.slug}><Link href={`${blogBase(lang)}/${item.slug}`}>{item[lang]!.title}</Link></li>)}</ul>
        </aside>
      ) : null}
    </ContentShell>
  );
}
