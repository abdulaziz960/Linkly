import JsonLd from "./JsonLd";

const SITE = "https://linklysa.io";

/** Structured data for a plain page (page + breadcrumb): what a search engine reads about it besides its text. */
export default function PageSchema({ lang, path, name, kind = "WebPage" }: { lang: "ar" | "en"; path: string; name: string; kind?: "WebPage" | "ContactPage" }) {
  const en = lang === "en";
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          { "@type": kind, "@id": `${SITE}${path}#webpage`, url: `${SITE}${path}`, name, inLanguage: en ? "en" : "ar-SA", isPartOf: { "@type": "WebSite", name: "Linkly", url: SITE } },
          { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: en ? "Home" : "الرئيسية", item: `${SITE}${en ? "/en" : "/"}` }, { "@type": "ListItem", position: 2, name }] }
        ]
      }}
    />
  );
}
