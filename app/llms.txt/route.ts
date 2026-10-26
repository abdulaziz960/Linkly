import { solutions, solutionPath } from "../../lib/solution-content";

// A plain-text guide for AI assistants and search tools: what Linkly is and which public pages answer what.
// Static content only (no database), so it is safe to build ahead of time.
export const dynamic = "force-static";

const BASE = "https://linklysa.io";

export function GET() {
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
    ...solutions.flatMap((solution) => [`- [${solution.ar.title}](${BASE}${solutionPath(solution.slug, "ar")}): ${solution.ar.description}`, `- [${solution.en.title}](${BASE}${solutionPath(solution.slug, "en")}): ${solution.en.description}`]),
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
