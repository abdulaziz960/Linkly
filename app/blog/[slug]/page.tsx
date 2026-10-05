import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostView } from "../../ContentViews";
import { getPublicPost } from "../../../lib/blog-store";
import { postMetadata } from "../../../lib/blog-seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublicPost((await params).slug);
  if (!post) return {};
  return postMetadata(post, "ar");
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getPublicPost((await params).slug);
  if (!post) notFound();
  return <BlogPostView post={post} lang="ar" />;
}
