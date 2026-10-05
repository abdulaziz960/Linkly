import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogCategoryView } from "../../../../ContentViews";
import { getPublicPosts, listCategories, postsInCategory } from "../../../../../lib/blog-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ cat: string }> };

async function load(cat: string) {
  const posts = await getPublicPosts();
  const category = listCategories(posts, "en").find((item) => item.slug === cat);
  return category ? { category, posts: postsInCategory(posts, cat, "en"), hasOther: listCategories(posts, "ar").some((item) => item.slug === cat) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).cat;
  const found = await load(slug);
  if (!found) return {};
  const path = "/en/blog/category/" + slug;
  return {
    title: { absolute: `${found.category.name} | Linkly` },
    description: `Articles about ${found.category.name} from the Linkly blog.`,
    alternates: { canonical: path, ...(found.hasOther ? { languages: { "ar-SA": "/blog/category/" + slug, en: "/en/blog/category/" + slug } } : {}) }
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const found = await load((await params).cat);
  if (!found) notFound();
  return <BlogCategoryView lang="en" categoryName={found.category.name} posts={found.posts} />;
}
