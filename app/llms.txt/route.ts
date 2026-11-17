import { solutionPath } from "../../lib/solution-content";
import { getPublicSolutions } from "../../lib/solution-store";

// A plain-text guide for AI assistants and search tools: what Linkly is and which public pages answer what.
// The guide list comes from the admin panel, so this is built on each request (with the built-in guides as the fallback).
export const dynamic = "force-dynamic";

const BASE = "https://linklysa.io";

export async function GET() {
  const guides = await getPublicSolutions();
  const lines = [
    "# Linkly",
    "",
    "> Linkly (لنكلي) is a Saudi platform that brings customer conversations from WhatsApp, Instagram, Facebook, Telegram and email into one shared inbox for a team, with conversation routing, automatic replies, campaigns and reports. A free 3-day trial needs no card.",
    "",
    "## Main pages",
    `- [Home (Arabic)](${BASE}/): what Linkly does, channels, features and plans`,
    `- [Home (English)](${BASE}/en): the same, in English`,
    `- [Pricing](${BASE}/pricing): plans, what each includes, and what the prices cover (${BASE}/en/pricing in English)`,
    `- [FAQ](${BASE}/faq): common questions on WhatsApp, plans, fees, security and the API`,
    `- [Blog](${BASE}/blog): guides for customer service and sales teams`,
    "",
    "## Guides",
    ...guides.flatMap((solution) => [`- [${solution.ar.title}](${BASE}${solutionPath(solution.slug, "ar")}): ${solution.ar.description}`, ...(solution.en ? [`- [${solution.en.title}](${BASE}${solutionPath(solution.slug, "en")}): ${solution.en.description}`] : [])]),
    "",
    "## Policies",
    `- [Privacy](${BASE}/privacy)`,
    `- [Terms](${BASE}/terms)`,
    `- [Data deletion](${BASE}/data-deletion)`,
    `- [Contact](${BASE}/contact)`,
    ""
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
