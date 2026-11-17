import { postPath, postSeoText, postShareImage } from "../lib/blog-seo";
import Link from "next/link";
import ContentShell from "./ContentShell";
import type { FaqPair } from "../lib/faq-store";
import type { PublicPost } from "../lib/blog-store";
import { listCategories } from "../lib/blog-store";
import type { ReactNode } from "react";
import JsonLd from "./JsonLd";
import { ProductNextSteps, SolutionLinks } from "./SolutionView";
import { Breadcrumbs, withLinks, type Crumb } from "./content-links";

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
      <JsonLd data={jsonLd} />
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

const blogBase = (lang: Lang) => (lang === "en" ? "/en/blog" : "/blog");
const homePath = (lang: Lang) => (lang === "en" ? "/en" : "/");
const crumbRoot = (lang: Lang): Crumb[] => [{ name: lang === "en" ? "Home" : "الرئيسية", path: homePath(lang) }, { name: lang === "en" ? "Blog" : "المدونة", path: blogBase(lang) }];

function PostCard({ post, lang }: { post: PublicPost; lang: Lang }) {
  const content = post[lang]!;
  const href = `${blogBase(lang)}/${post.slug}`;
  return (
    <article className="post-card">
      {post.seo.featuredImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="post-card-cover" src={post.seo.featuredImage} alt={postSeoText(post, lang).imageAlt} width={1200} height={630} loading="lazy" decoding="async" />
      ) : (
        // A post without a picture gets the brand tile, so the grid keeps its rhythm.
        <div className="post-card-cover post-card-cover-fallback" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/linkly-logo.png" alt="" width={72} height={40} loading="lazy" decoding="async" />
        </div>
      )}
      <div className="post-card-body">
        <p className="post-card-meta">
          {post.category ? <Link href={`${blogBase(lang)}/category/${post.category.slug}`}>{post.category[lang]}</Link> : null}
          <span>{dateLabel(post.date, lang)}</span>
        </p>
        <h2><Link href={href}>{content.title}</Link></h2>
        <p className="post-card-excerpt">{content.description}</p>
        <span className="post-card-more" aria-hidden="true">{lang === "en" ? "Read the article ←" : "اقرأ المقال ←"}</span>
      </div>
    </article>
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
      <div className="post-grid">
        {posts.filter((post) => post[lang]).map((post) => <PostCard key={post.slug} post={post} lang={lang} />)}
      </div>
    </ContentShell>
  );
}

export function BlogCategoryView({ lang, categoryName, posts }: { lang: Lang; categoryName: string; posts: PublicPost[] }) {
  return (
    <ContentShell lang={lang}>
      <Breadcrumbs lang={lang} items={[...crumbRoot(lang), { name: categoryName }]} />
      <h1>{categoryName}</h1>
      <div className="post-grid">
        {posts.map((post) => <PostCard key={post.slug} post={post} lang={lang} />)}
      </div>
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
      <JsonLd data={jsonLd} />
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
        {content.blocks.map((block, index) => (
          block.type === "h2" ? <h2 key={index}>{block.text}</h2>
          : block.type === "h3" ? <h3 key={index}>{block.text}</h3>
          : block.type === "img" ? (
            <figure key={index} className="post-figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={block.src} alt={block.text} {...(block.width && block.height ? { width: block.width, height: block.height } : {})} loading="lazy" decoding="async" />
            </figure>
          )
          : <p key={index}>{withLinks(block.text)}</p>
        ))}
      </article>
      <ProductNextSteps lang={lang} />
      <SolutionLinks lang={lang} />
      {related.length ? (
        <aside className="related-posts" aria-label={lang === "en" ? "Related articles" : "مقالات ذات صلة"}>
          <h2>{lang === "en" ? "Related articles" : "مقالات ذات صلة"}</h2>
          <ul>{related.map((item) => <li key={item.slug}><Link href={`${blogBase(lang)}/${item.slug}`}>{item[lang]!.title}</Link></li>)}</ul>
        </aside>
      ) : null}
    </ContentShell>
  );
}
