import { notFound } from "next/navigation";
import SolutionView from "../../SolutionView";
import { solutions, solutionMetadata, solutionPath } from "../../../lib/solution-content";
import { applyPageSeo } from "../../../lib/page-seo";

// The SEO fields come from the database (an admin's edit shows up at once), so this is read on each request, never at build time.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) notFound();
  return applyPageSeo(solutionPath(solution.slug, "ar"), solutionMetadata(solution, "ar"));
}
export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) notFound();
  return <SolutionView solution={solution} lang="ar" />;
}
