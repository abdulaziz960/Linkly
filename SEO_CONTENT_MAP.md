# Linkly — SEO Content Map

Two tiers: **A. Existing pages** (live now, metadata verified/fixed this pass) and **B. Recommended pages** (do not exist yet — prioritized to ~14 pages / 7 topics × 2 languages, not the full 40+ route list from the brief, per its own "prioritize 20-30 strong pages instead of hundreds of thin pages" rule and "audit whether the capability exists" rule). Building tier B is future work — see `SEO_CONTENT_BACKLOG.md`.

---

## A. Existing Pages

### `/` (Arabic homepage)
- **Intent**: navigational/commercial — "what is Linkly, can it replace my WhatsApp chaos"
- **Primary keyword**: منصة واتساب للأعمال في السعودية
- **Secondary keywords**: صندوق وارد موحد، إدارة محادثات العملاء، برنامج خدمة عملاء واتساب
- **Title**: `Linkly | صندوق موحّد لواتساب وإنستقرام والقنوات — منصة سعودية لخدمة العملاء`
- **Meta description**: منصة سعودية تجمع محادثات واتساب وإنستقرام والبريد وتيليجرام وتيك توك وتساعد فرق الخدمة والمبيعات على التوزيع والمتابعة من مكان واحد.
- **H1**: رد أسرع على عملائك ولا تضيع ولا محادثة
- **H2 structure** (existing): المشكلة → المنتج (معاينة) → القنوات → المميزات → طريقة العمل → حالات الاستخدام → الأمان والثقة → الأسعار → الأسئلة الشائعة → CTA ختامي
- **FAQ topics** (existing, 9): multi-user support, connecting an existing WhatsApp number, needing a new number, WhatsApp Business API support, API availability, cancellation, Meta setup fee, WhatsApp message fees, data security
- **Internal links**: `/en`, `/login`, `/signup`, `/contact`, anchors to `#features #how #pricing #faq`
- **Schema**: `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage` (all on-page, verified valid)

### `/en` (English homepage) — mirror of `/`, same structure, English copy and keywords (WhatsApp Business Platform Saudi Arabia / shared inbox / customer support software).

### `/contact` + `/en/contact`
- **Intent**: transactional — reach sales/support
- **Primary keyword**: تواصل مع Linkly / Contact Linkly
- **Title/description**: page-specific, already correct language on both
- **H1**: "سنساعدك بإعداد مساحة عملك والقنوات" (AR) / "We'll help you set up your workspace and channels" (EN)
- **Content**: email + business hours only — thin but appropriate for a contact page (spec's thin-content rule targets landing pages, not a contact card)
- **Schema**: none currently — low priority to add (`ContactPage`/`Organization.contactPoint` would be the candidate, not urgent)

### `/terms` + `/en/terms`
- **Intent**: trust/legal
- **Title (fixed this pass)**: شروط الاستخدام | Linkly (AR) / Terms of Service | Linkly (EN)
- **H1**: شروط الاستخدام / Terms of Use
- **H2s**: استخدام الخدمة، القنوات والربط، حسابات المستخدمين، البيانات والمحتوى، تغييرات على الخدمة، التواصل (AR); mirrored in EN
- **Schema**: none — not a priority for legal pages

### `/privacy` + `/en/privacy`
- **Title (fixed this pass)**: سياسة الخصوصية | Linkly (AR) / Privacy Policy | Linkly (EN)
- Same structural notes as `/terms`.

### `/data-deletion` + `/en/data-deletion`
- **Title (fixed this pass)**: حذف البيانات | Linkly (AR) / Data Deletion | Linkly (EN)
- Meta compliance page (WhatsApp/Meta platform policy requires a public data-deletion instructions page) — low SEO value, high compliance value, already adequate.

---

## B. Recommended Pages (not yet built — prioritized)

Only capabilities **confirmed to exist in the product** were included (verified against the homepage's own feature list, FAQ answers, and plan feature lists this session — shared inbox, conversation routing/assignment, tags/statuses, quick replies, automation rules, reports, webhooks/API on the Business plan). Capabilities the homepage does NOT claim (e.g. a standalone public live-chat widget, a ticketing system separate from the shared inbox, a chatbot product distinct from "automation rules") were **excluded** rather than guessed at — verify with product before building pages that claim them.

| Priority | AR route | EN route | Primary keyword (AR) | Primary keyword (EN) | Schema |
|---|---|---|---|---|---|
| P0 | `/about` | `/en/about` | عن لنكلي | About Linkly | `Organization` (reuse homepage entity) |
| P0 | `/pricing` | `/en/pricing` | أسعار Linkly | Linkly pricing | `Offer` × 3 (real prices: 249/499/999 SAR — already public on homepage) |
| P1 | `/whatsapp-business` | `/en/whatsapp-business` | منصة واتساب للأعمال | WhatsApp Business Platform Saudi Arabia | `SoftwareApplication`, `FAQPage` |
| P1 | `/shared-inbox` | `/en/shared-inbox` | صندوق وارد موحد | Shared team inbox for WhatsApp | `FAQPage` |
| P1 | `/customer-support` | `/en/customer-support` | برنامج خدمة العملاء | Customer support software Saudi Arabia | `FAQPage` |
| P1 | `/automation` | `/en/automation` | أتمتة الرد على واتساب | WhatsApp automation | `FAQPage` |
| P2 | `/integrations` | `/en/integrations` | تكاملات Linkly وواجهة برمجة التطبيقات | Linkly integrations & API | `FAQPage` |

For each: unique title/description, one H1, a "ما هو / ما هي" (What is X?) answer-first opening paragraph (40–120 words, directly quotable), a features section grounded in real product capability, 3–5 FAQs, and internal links to `/pricing`, `/contact`, and 2 sibling pages from this table. Full topic list and everything below P2 lives in `SEO_CONTENT_BACKLOG.md`.

**Deliberately not mapped here** (per the brief's own rules): comparison pages (`/linkly-vs-*`) — no confidently-maintainable competitor fact set available right now; industry/solution pages (`/solutions/*`) — would need real per-industry use cases verified with product/sales first, not generated; blog — architecture only, in the backlog, not prioritized pages, until 2-3 genuinely useful articles can be written.
