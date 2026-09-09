# Conversations implementation and verification

## Implemented slice

- The public WhatsApp CTA records page/link/button and campaign attribution and carries a short reference in the WhatsApp message.
- A signed inbound webhook associates the reference with a tenant-scoped contact and conversation.
- Inbox displays the conversation and its acquisition source. Pipeline exposes stage and deal-value edits with save feedback.
- Analytics reports attributed revenue, page conversions and CTA performance.
- Copilot supports reply, rewrite, correction, translation, summary, sentiment and next-step suggestions. Summaries and analysis are not inserted into the outgoing composer.
- Workspace owners can configure Gemini, OpenAI, OpenRouter or DeepSeek. Keys are encrypted and never returned by the settings endpoint. Daily/monthly request reservations and usage events are tenant-scoped; failed attempts count toward limits. Cost estimates require configured token prices and provider usage metadata.

## Automated verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run test:browser`.

The browser test builds and starts the application against a fresh temporary SQLite database. It visits the public page, follows the WhatsApp CTA, submits a signed inbound webhook, signs in, opens Inbox, requests an AI draft, changes a Pipeline stage/value, reloads, verifies Analytics, and saves AI settings without exposing the saved key. GitHub Actions runs the same browser test.

External WhatsApp navigation and AI output are simulated. Provider request formatting, quotas, secret storage, access checks and the server-side attribution journey have separate integration tests. This is not evidence of live Meta delivery or a live paid AI request. Do not use the fixture credentials outside the isolated test server.

## Remaining roadmap

The complete nine-module product request is not finished. In particular, full knowledge ingestion/chunking/embeddings with cited retrieval and confidence-based handoff, autonomous AI Agent behavior, department/channel-specific prompts, automatic close summaries, and the complete operations/campaign/flow-builder feature set still need implementation and dedicated end-to-end coverage. Existing screens do not by themselves establish completion of those requirements.

Production rollout must retain `INTEGRATION_ENCRYPTION_KEY`, apply database migrations through the normal deployment process, configure an actual provider and model, and verify signed Meta webhooks against the intended workspace. A template send does not reopen WhatsApp's free-text window without a customer reply.
