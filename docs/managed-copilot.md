# Managed employee Copilot

Status: code prepared locally; production activation requires a paid Gemini API project/key and deployment verification. A Gemini consumer subscription does not automatically cover API usage.

## Server configuration

- `AI_MANAGED_PROVIDER=gemini`
- `GEMINI_MODEL=gemini-3.1-flash-lite` (other managed model IDs fail closed)
- `GEMINI_API_KEY`: inject through Google Secret Manager into the application service; never commit or expose in browser configuration.
- `AI_MANAGED_BUDGET_SAR=50`: platform-wide allowance, not per tenant. Zero disables managed calls. Invalid values or amounts above 50 disable calls.

Use a dedicated API project/key and provider quotas. This is the Gemini Developer API, not a locally hosted model or Vertex AI. No GPU is required. Review Google's paid-service data terms and customer privacy disclosures before sending production conversations.

## Guardrails

Explicit workspace enablement and plan quotas are required. Only employee Copilot requests may use the managed connection. Replies, rewrites, corrections, translations, summaries, sentiment and next-step suggestions require employee review; this endpoint does not send messages.

The request uses up to six recent non-note messages, each clipped to 700 UTF-8 bytes, and up to 1000 bytes of workspace instructions. Drafts above 4000 bytes are rejected. Total input is capped at 12000 bytes, output at 512 tokens. Summaries therefore cover abbreviated recent context, not the complete thread. No automatic model fallback, retry, tools or paid grounding is enabled.

A database transaction reserves one platform allowance unit plus tenant daily/monthly quota before the provider call. Each attempt reserves 0.025 SAR conservatively, allowing 2000 attempts at the default 50 SAR allowance. Failed or ambiguous attempts retain their reservation. Tenant quota rejection rolls back the platform reservation. Calendar periods use UTC. All instances must share the same database for this limit to apply platform-wide.

This is an application usage guard, NOT a guaranteed cap on the Google invoice. Hosting, tax, other consumers of the key, exchange-rate/pricing changes and external requests are not covered. Recorded estimated cost is USD using $0.25/M input and $1.50/M output tokens including reported thinking tokens, reviewed against https://ai.google.dev/gemini-api/docs/pricing on 2026-09-21. Review prices and tokenizer assumptions before increasing limits.

## Activation verification

Deploy after configuring secrets; enable AI for a test workspace with a valid plan. Verify all seven operations against a synthetic conversation, confirm no outbound message is created, and inspect usage events. Verify a second tenant cannot read the first tenant's events. Test budget exhaustion using an isolated staging database and a small allowance. A configured key is not proof of a working connection. Never run a budget-exhaustion test against production.
