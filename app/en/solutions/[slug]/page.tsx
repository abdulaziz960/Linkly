import { notFound } from "next/navigation";
import SolutionView from "../../../SolutionView";
import { solutions, solutionMetadata } from "../../../../lib/solution-content";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) notFound();
  return solutionMetadata(solution, "en");
}
export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) notFound();
  return <SolutionView solution={solution} lang="en" />;
}
