import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostView } from "../../../ContentViews";
import { blogPosts, getBlogPost } from "../../../../lib/blog";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getBlogPost((await params).slug);
  if (!post) return {};
  return {
    title: { absolute: `${post.en.title} | Linkly` },
    description: post.en.description,
    alternates: { canonical: `/en/blog/${post.slug}`, languages: { "ar-SA": `/blog/${post.slug}`, en: `/en/blog/${post.slug}` } }
  };
}

export default async function BlogPostPageEn({ params }: Props) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  return <BlogPostView post={post} lang="en" />;
}
