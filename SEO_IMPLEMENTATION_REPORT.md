# Linkly — SEO / GEO / AEO Implementation Report

Date: 2026-09-06
Scope: public marketing site only (`/`, `/en`, `/contact`, `/en/contact`, `/terms`, `/en/terms`, `/privacy`, `/en/privacy`, `/data-deletion`, `/en/data-deletion`, `/robots.txt`, `/sitemap.xml`, 404). No dashboard, auth, billing, API, or tenant logic was touched.

## Executive Summary

The marketing site already had a solid, modern foundation before this pass: Next.js 16 App Router with real per-page `metadata` exports, a dynamic `app/robots.ts` / `app/sitemap.ts`, and JSON-LD (`Organization` / `SoftwareApplication` / `FAQPage`) on both homepages. That meant this wasn't a from-scratch build — it was a gap-closing pass. The concrete gaps found and fixed: three Arabic legal pages were shipping **English titles/descriptions** (a real duplicate-content and wrong-language signal), six pages had no canonical/hreflang at all, the admin panel's real path wasn't matched by the robots disallow rule, the sitemap was missing half the site's URLs and had no hreflang annotations, four English pages never corrected the server-rendered `lang="ar" dir="rtl"`, there was no custom 404, and the entity schema didn't carry the brand's Arabic/English name variants.

Everything in this report that could be fixed safely in code **was fixed in code** — nothing here is a "you should do X" left undone without a documented reason (see §10).

## Issues Found (classified)

| # | Issue | Priority | Status |
|---|---|---|---|
| 1 | `/terms`, `/privacy`, `/data-deletion` (Arabic) shipped **English** titles/descriptions identical to their `/en/*` counterparts — duplicate + wrong-language metadata | P0 | ✅ Fixed |
| 2 | 6 legal pages (AR+EN ×3) had **no canonical/hreflang** at all | P0 | ✅ Fixed |
| 3 | `robots.ts` disallowed `/admin/`, but the real admin panel lives at `/linkly-admin007/` — the rule never matched anything | P1 | ✅ Fixed |
| 4 | `sitemap.ts` was missing 5 of 10 public URLs (`/data-deletion`, all 4 remaining `/en/*` pages except the homepage) | P1 | ✅ Fixed |
| 5 | Sitemap entries had no hreflang `alternates` | P1 | ✅ Fixed |
| 6 | `/signup`, `/forgot-password` not disallowed in robots.txt (auth-flow pages, no SEO value, shouldn't be indexed) | P2 | ✅ Fixed |
| 7 | `/login` not disallowed at the robots.txt level (it already carries page-level `noindex`, but robots.txt should say so too, defense in depth) | P2 | ✅ Fixed |
| 8 | 4 of 6 English pages (`contact`, `terms`, `privacy`, `data-deletion`) never corrected `document.documentElement.lang/dir` — only the homepage did, via `HtmlLangSync` | P1 | ✅ Fixed |
| 9 | No custom 404 page (Next's generic default) | P2 | ✅ Fixed |
| 10 | Organization schema had no `alternateName`, `description`, or a `WebSite` entity | P2 | ✅ Fixed |
| 11 | No OpenAI `OAI-SearchBot` rule in robots.txt | P2 | ✅ Fixed |
| 12 | `/en/*` pages render `lang="ar" dir="rtl"` in the **raw server HTML** (client-side `HtmlLangSync` patch only fixes it post-hydration) | P2 | Documented, not fixed — see §10 |
| 13 | No analytics/conversion tracking installed anywhere on the site | P1 (business, not technical-SEO) | Documented — see §10 |
| 14 | AR legal pages have noticeably less prose than their EN counterparts (EN ~2–2.5× longer) | P3 | Documented — see §10 |
| 15 | No dedicated feature/solution/comparison/blog pages exist yet (`/pricing`, `/about`, `/whatsapp-business`, etc.) | P1 (content, not a defect) | Scoped into `SEO_CONTENT_MAP.md` / `SEO_CONTENT_BACKLOG.md` rather than rushed — see those files and §10 |

## Changes Implemented

### Files modified
- `app/robots.ts` — rewritten: fixed the `/admin/` → `/linkly-admin007/` mismatch, added `/signup`, `/forgot-password`, `/login` to disallow, added an explicit `OAI-SearchBot` rule (same allow/disallow as `*`), kept `sitemap`/`host`.
- `app/sitemap.ts` — rewritten: now emits all 10 public URLs (5 AR + 5 EN) with reciprocal `alternates.languages` (ar-SA / en / x-default) on every entry.
- `app/page.tsx`, `app/en/page.tsx` — JSON-LD `Organization` gained `alternateName` (Linkly Saudi / Linkly السعودية / لنكلي), `description` (the exact entity definition), `areaServed: "SA"`; added a `WebSite` entity to the `@graph`.
- `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/data-deletion/page.tsx` — replaced English title/description with real Arabic ones; added `alternates.canonical` + `alternates.languages`.
- `app/en/terms/page.tsx`, `app/en/privacy/page.tsx`, `app/en/data-deletion/page.tsx`, `app/en/contact/page.tsx` — added `alternates` where missing (terms/privacy/data-deletion), added the `HtmlLangSync` fix (all four), tightened `terms`/`privacy`/`data-deletion` descriptions to be page-specific instead of generic one-liners.

### New files
- `app/not-found.tsx` — branded, Arabic-default 404 with links back to home, contact, login, and the English site. `noindex, follow` (a 404 shouldn't be indexed, but its outbound links should still be followed).

## New Routes
None added. This pass fixed metadata/indexing on existing routes; new content routes (feature pages, `/about`, `/pricing`) are scoped in `SEO_CONTENT_MAP.md` rather than built in bulk — see §10 and that file for why.

## Metadata Improvements
- 3 Arabic pages: wrong-language title/description → correct Arabic, page-specific copy.
- 6 pages: added canonical + hreflang (`ar-SA` / `en`).
- 4 English pages: fixed the missing client-side `lang`/`dir` correction.
- Homepage (both languages): richer entity metadata in JSON-LD.

## Structured Data
- `Organization`: added `alternateName`, `description`, `areaServed`. `logo`/`url` were already present and correct (verified the logo file exists at `/assets/linkly-logo.png`). No `sameAs` added — no verified social profile URLs were available to add without inventing them (see §10).
- `WebSite`: new, `{name, url, inLanguage: ["ar-SA","en"]}`.
- `SoftwareApplication` and `FAQPage`: unchanged — already valid, already reflect real plans/FAQs from the visible page content (verified the FAQ schema's `mainEntity` is generated from the same `faqs` array rendered on the page, so it can't drift out of sync with visible content).
- Validated by parsing the actual rendered `<script type="application/ld+json">` output from a local dev server with `JSON.parse` — both homepages produce syntactically valid JSON-LD with the expected `@graph` types.

## Indexing Changes
- `robots.txt`: `/linkly-admin007/`, `/signup`, `/forgot-password`, `/login` now explicitly disallowed (in addition to the pages that already carried page-level `noindex`). `/api/`, `/dashboard/`, `/billing/`, `/checkout/`, `/activate` were already disallowed and remain so.
- `sitemap.xml`: went from 5 URLs to 10 (every public page now listed, each with hreflang alternates).
- Verified locally: `/robots.txt` and `/sitemap.xml` both render correctly (fetched and inspected raw output — see §9 QA below).

## GEO/AEO Improvements
- Organization entity now carries all four name variants the brand is known by (Linkly / Linkly Saudi / Linkly السعودية / لنكلي) plus a factual, feature-accurate description matching exactly what you specified — verified against the actual FAQ content and plan features already on the homepage rather than invented.
- `WebSite` entity gives generative engines an unambiguous site-level anchor separate from the software product entity.
- The homepage's existing `FAQPage` schema (9 Arabic Q&As, mirrored in English) was already well-suited for AI answer extraction — direct-answer-first phrasing, no marketing filler — left as-is since it already meets the AEO bar (see rule 15's "answer immediately, no filler" guidance: it already does this).

## Technical SEO Fixes
- robots.txt path mismatch (admin panel).
- Sitemap completeness + hreflang.
- Canonical/hreflang on 6 previously-uncovered pages.
- Wrong-language metadata on 3 Arabic pages.
- Client-side `lang`/`dir` correction now applied consistently across all 6 English pages (was 2 of 6).
- Custom 404 instead of framework default.

## Performance Improvements
None made — the existing implementation is already sound on this axis: dynamic route-file-convention robots/sitemap (no extra package), local self-hosted fonts with `display: swap`, `next/image` for the logo, and no client-JS-only rendering of critical content (verified the homepage's H1/copy/links/canonical/JSON-LD are all present in the raw server HTML — confirmed by curling the local dev server directly, not just visually). I deliberately did **not** add a middleware-based per-request locale header for the `lang`/`dir` SSR fix (see §10) specifically to avoid forcing the whole site into dynamic (non-cacheable) rendering — a performance regression the brief explicitly warned against trading for a cosmetic SEO gain.

## Content Recommendations
See `SEO_CONTENT_MAP.md` (prioritized structure for ~20 pages worth building) and `SEO_CONTENT_BACKLOG.md` (everything else, P0/P1/P2).

## Items Requiring Manual Action

1. **Google Search Console** — verify `linklysa.io`, submit `https://linklysa.io/sitemap.xml`. No verification token exists in the repo to wire up; add a `google-site-verification` meta tag or DNS TXT record once you have one.
2. **Bing Webmaster Tools** — same; no token present, needs your account.
3. **Social profile URLs (`sameAs`)** — I did not add any to the `Organization` schema because I couldn't verify real, live Linkly social accounts from the repo. If you have official X/LinkedIn/Instagram accounts, give me the URLs and I'll add them (5-minute change).
4. **Analytics/conversion tracking** — none exists on the marketing site at all (confirmed by grep — no GA4, GTM, Meta Pixel, or `dataLayer` anywhere). This is a real gap for measuring any of the above work, but I did not add one myself per your instruction not to blindly add analytics products. If you want GA4/GTM, note the CSP in `next.config.ts` (`script-src 'self' 'unsafe-inline' https://connect.facebook.net`) will need the relevant domains whitelisted or the script will be silently blocked.
5. **`/en/*` SSR `lang`/`dir`** — currently corrected client-side only (post-hydration). A fully SSR-correct fix exists (middleware setting a request-scoped header, read via `headers()` in the root layout) but that call makes Next treat every page under that layout as dynamic (opts out of static rendering/caching) for **all** routes, not just `/en/*`, since there's one shared root layout. I judged that performance trade-off unwise for a cosmetic hreflang-adjacent signal search engines already get correctly from `<link rel="alternate" hreflang>` and per-page `lang` attributes on inner `<main>` elements. If you want this fully SSR-correct despite the trade-off, the cleanest real fix is restructuring routes under an `app/[locale]/` dynamic segment with its own layout — a bigger, riskier change I did not make unprompted, consistent with "don't rewrite the entire application solely for SEO."
6. **AR/EN legal-page content parity** — the English `/terms`, `/privacy`, `/data-deletion` pages have meaningfully more prose than their Arabic originals. I didn't rewrite either version's substantive legal content (that's a legal/company decision, not a code fix), but flagging it since GEO consistency benefits from both languages saying the same thing at the same depth.
7. **Cloudflare / infra-level bot rules** — I have no visibility into any Cloudflare account, WAF rules, or bot-management settings from this repo. If Cloudflare (or similar) sits in front of `linklysa.io`, verify its bot-fight-mode/managed-challenge settings aren't blocking Googlebot, Bingbot, or `OAI-SearchBot` — that's outside what a code change here can fix or confirm.
8. **Backlinks / off-page SEO** — out of scope for a code change, not attempted.

## Recommended Next 30 Days
1. Get Search Console + Bing Webmaster verified and the sitemap submitted (manual action above) — nothing else here matters until Google/Bing actually know the sitemap exists.
2. Decide on the `/en/[locale]` restructuring trade-off (item 5 above) — a real decision, not a default.
3. Build the highest-priority 3-5 pages from `SEO_CONTENT_MAP.md` (P0 tier) — `/about` and `/pricing` are the two most load-bearing missing pages (referenced constantly in the brief's own examples, don't exist yet, and pricing is currently only a homepage anchor section with no own URL/metadata/schema).
4. Add real social profile URLs to `Organization.sameAs` once available.
5. Decide on analytics (GA4 minimum) so the impact of all of the above is actually measurable.

## Recommended Next 90 Days
1. Build out the P1 tier of `SEO_CONTENT_MAP.md` (the 4-6 highest-intent feature pages: WhatsApp Business, shared inbox, customer support, automation).
2. Normalize AR/EN legal page content depth.
3. Revisit the `/en` SSR lang/dir trade-off once real traffic/Search Console data shows whether it's actually costing anything.
4. Start the blog/resource architecture at minimal scale (2-3 genuinely useful foundational articles, not a bulk content dump) per `SEO_CONTENT_BACKLOG.md`.
5. Only pursue comparison pages (`/linkly-vs-*`) once competitor facts can be confidently sourced and kept current — do not publish speculative comparisons.
