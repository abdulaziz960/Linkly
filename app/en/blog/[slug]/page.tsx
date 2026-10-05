import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostView } from "../../../ContentViews";
import { getPublicPost } from "../../../../lib/blog-store";
import { postMetadata, postSeoText } from "../../../../lib/blog-seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublicPost((await params).slug);
  if (!post?.en) return {};
  return { ...postMetadata(post, "en"), title: { absolute: `${postSeoText(post, "en").metaTitle} | Linkly` } };
}

export default async function BlogPostPageEn({ params }: Props) {
  const post = await getPublicPost((await params).slug);
  if (!post?.en) notFound();
  return <BlogPostView post={post} lang="en" />;
}
