import { notFound } from "next/navigation";
import SolutionView from "../../../SolutionView";
import { solutionMetadata, solutionPath } from "../../../../lib/solution-content";
import { getPublicSolution } from "../../../../lib/solution-store";
import { applyPageSeo } from "../../../../lib/page-seo";

// The SEO fields come from the database (an admin's edit shows up at once), so this is read on each request, never at build time.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const solution = await getPublicSolution(slug);
  if (!solution || !solution["en"]) notFound();
  return applyPageSeo(solutionPath(solution.slug, "en"), solutionMetadata(solution, "en"));
}
export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const solution = await getPublicSolution(slug);
  if (!solution || !solution["en"]) notFound();
  return <SolutionView solution={solution} lang="en" />;
}
