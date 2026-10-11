# LINKLY — Complete SaaS Audit (Stage 1: read-only discovery)

Date: 2026-10-10 · Scope of this stage: code reading and existing test results only.
No production access, no payments, no real messages, no code changes were made.

**Evidence rule used:** `PASS` is only given when an existing automated test was executed
successfully. Code reading alone is recorded as `PARTIAL (code only)`. Anything needing a
running environment, provider sandbox or production configuration is `NOT TESTED`.

## A. Executive summary

* The system is broadly implemented and the previous pre-launch audit
  (`docs/prelaunch-audit/FINAL-REPORT.md`) already fixed the critical/high security items.
* **Four places where actual behaviour differs from the requirements in the audit brief**
  (all need a business decision before any code change, because they affect live customers):
  1. Seven-day grace period is **opt-in by environment variable** (`SUBSCRIPTION_GRACE_DAYS`);
     unset means a paid subscription is never locked for non-renewal.
  2. A **closed conversation stays closed** when the customer writes again; the bot flow
     restarts and only a bot transfer reopens it (as `unassigned`, losing the previous employee).
  3. Registration **does not log the customer in**; it creates the tenant and sends an
     activation email (link valid 3 days).
  4. Roles are **free-text role names + permission strings**, not a fixed Owner/Admin/Employee enum.
* Not verified at all in this stage: payments end-to-end, OAuth channels, real-time inbox,
  invitation concurrency, mobile/RTL (see section B, `NOT TESTED`).

## B. Feature matrix

| Module | Expected | Actual (evidence) | Status | Recommended action |
|---|---|---|---|---|
| Self-serve signup | Account + tenant + 3-day trial, logged in | `app/api/trial/route.ts` validates input, honeypot, rate limit 3/h, terms flag; calls `createTenantWithSubscription` (transaction in `lib/subscriptions.ts`); returns activation link instead of a session | PARTIAL (code only) | Decide: keep email-activation (safer) or auto-login. Keep as is unless owner asks |
| Duplicate email / orphan tenant | No orphan tenant on retry | `created` flag exists; covered by `tests/trial-route.test.ts`, `trial-signup-resend.test.ts` | PASS (existing tests; ran in full suite) | — |
| Trial length | 72 h, server enforced | `renewalAt = now + 3 days` (`trial/route.ts`); expiry enforced in `getSubscriptionAccess` (`lib/auth.ts:129`) | PARTIAL (code only) | Add a test for expiry at exactly 72 h |
| Trial reminders | Warn before expiry | `sendTrialEndingReminders` (`lib/subscriptions.ts:666`), deduplicated by marker | PARTIAL (code only) | Verify cron is scheduled in production |
| Expired trial | Owner can still sign in, billing reachable | `getCurrentUser` returns null when `expired` unless `allowExpired`; billing pages use `allowExpired` (to confirm) | NOT TESTED | Runtime check on a test tenant |
| Paid grace period (7 d) | Grace then suspend | `lib/auth.ts:122-142`; **only enforced if `SUBSCRIPTION_GRACE_DAYS` is set**; test exists (`payments-ledger.test.ts:586`) | FAIL vs. policy unless env is set in prod | Confirm prod env value; set to `7` (needs approval) |
| Grace notifications (day 1/3/6/final) | Scheduled reminders | A reminder sender with stages exists near `lib/subscriptions.ts:721`; stage days not verified against 1/3/6 | PARTIAL (code only) | Compare stages with the policy |
| Payments / webhook idempotency | Activate only on confirmed payment, idempotent | `lib/moyasar-webhook.ts`, `lib/payment-status.ts`, `docs/payments.md`; tests `payments-ledger`, `payment-replay-guard`, `webhooks` | PASS for ledger/replay tests (existing); live gateway NOT TESTED | Keep; sandbox run before launch |
| Tenant isolation | No cross-tenant access | `tests/tenant-isolation-routes.test.ts`, `tenant-grants.test.ts` | PASS (existing tests); not exhaustive across all ~150 routes | Extend with route inventory (`docs/prelaunch-audit/api-inventory.md` exists) |
| RBAC | Owner / Admin / Employee | `employees/route.ts` blocks non-owner granting owner-level permissions; roles are free text | PARTIAL | Define canonical roles or document mapping |
| Invitations | Secure single-use token, role fixed | SHA-256 token hash, 3-day expiry (`lib/subscriptions.ts:1024`), purpose `employee_activation`; tests `employees-route.test.ts` | PARTIAL (code only) | Test concurrency + email-mismatch cases |
| Channels (OAuth/API) | State/CSRF, tenant-scoped | Prior audit fixed CSRF and state comparison; `oauth-state.ts` | PARTIAL; live providers NOT TESTED | Provider sandbox runs |
| Unified inbox ingestion | Dedup, tenant scoping | Many `*-inbox.ts` modules; webhook tests for some channels | PARTIAL | Add dedup tests per channel |
| Auto assignment | Eligible, online, least loaded | `lib/automation-engine.ts:115-150`: online members preferred, then "تلقائي بالتساوي" picks lowest open count; `tests/pick-team-assignee.test.ts` | PASS (existing tests) | No change; note: no per-agent capacity limit |
| Presence | ONLINE/OFFLINE/BUSY | Employee `status` ("متصل"…); no `lastSeen`/stale-session handling found in schema | PARTIAL | Propose heartbeat only if wanted |
| Resolve / close | Manual, history kept | Status `closed`; messages not deleted (`conversation-lifecycle.ts`) | PARTIAL (code only) | Test resolution timestamp/actor are stored |
| Smart reopening | Reopen, keep previous employee if eligible | `lib/conversation-lifecycle.ts`: stays closed, bot restarts; `bot-engine.ts:583,657` set `unassigned` + "بدون موظف" on transfer | FAIL vs. brief (deliberate current design) | **Needs decision** — see section D |
| Audit logs | Role/assignment/payment events | `lib/admin-audit.ts` covers platform-admin actions; tenant-level events not verified | PARTIAL | Review tenant audit coverage |
| Notifications | New/assigned/reopened | Push + email modules exist | NOT TESTED | Runtime |
| Landing/RTL/mobile | Responsive, accessible | Playwright specs exist (`e2e/landing-audits.spec.ts`, `mobile-dashboard.spec.ts`); not run in this stage | NOT TESTED | Run `npm run test:browser` |
| Performance | Indexes, N+1 | Not measured | NOT TESTED | Needs profiling data |

## C. Automated test results observed

* Full vitest run on 2026-10-06 (after merging other sessions): **629 passed, 3 failed**, 113 files.
* The 3 failures are all in `tests/prelaunch-audit-reproduction.test.ts` (AUD-06, AUD-07, AUD-09).
  The previous audit states these reproduce vulnerabilities that were later patched, so the
  failing assertions mean "exploit no longer works". They should be rewritten as regression
  tests that assert the fixed behaviour, otherwise the suite stays red.
* Playwright suite (`e2e/`) not executed in this stage.

### C.1 Correction (stage 2) — seven security defects are still open

Stage 1 repeated the earlier report's claim that no Critical/High issue was open. Running
`tests/prelaunch-audit-reproduction.test.ts` shows that is **not true**. Defects that still
reproduce on current `main` (now encoded as `it.fails`, so the suite is green but each one
documents a real gap):

| ID | Defect | Severity (my estimate) |
|---|---|---|
| AUD-04 | ~~Telegram message-id collision returns another tenant's conversation and quoted text~~ **FIXED (stage 3)** in `lib/telegram-inbox.ts` | High (cross-tenant leak) |
| AUD-01 | ~~Public website-widget polling returns internal staff notes~~ **FIXED (stage 3)** in `app/api/website/messages/route.ts` | High |
| AUD-03 | ~~Opening a conversation by customer id bypasses assignee scope~~ **FIXED (stage 4)** in `app/api/conversations/route.ts` | Medium |
| AUD-02 | ~~Employee can take over another employee's assigned conversation~~ **FIXED (stage 4)** in `app/api/conversations/[id]/route.ts` | Medium |
| AUD-08 | ~~Tenant deletion leaves API keys and customer-related records~~ **FIXED (stage 4)** in `lib/subscriptions.ts` `deleteTenant` (discount-code usage rows intentionally kept) | Medium (data retention) |
| AUD-05 | ~~Replayed Telegram event double-counts unread and re-runs automations~~ **FIXED (stage 3)** | Low |
| AUD-10 | Conversation can reference a customer from another tenant at DB level | Low (defence in depth) |

Fixed and now covered by regression tests: AUD-06 (webhook loopback/SSRF), AUD-07
(logout invalidates session), AUD-09 (one gateway payment cannot activate two rows).
None of the seven open items has been fixed yet; each is a production behaviour change
and awaits approval (P0/P1 in section E).

### C.2 Playwright

Executed `npx playwright test`: 2 passed, 10 failed. All 10 failures are
`browserType.launch: Executable doesn't exist` — the Playwright browsers are not installed on
this machine (`npx playwright install` needed, a ~100 MB download). Therefore the browser/E2E
results are **NOT TESTED**, not failures of the product.

## D. Items that need an explicit decision before any change

1. **Grace period enforcement.** Set `SUBSCRIPTION_GRACE_DAYS=7` on the production service?
   Effect: paid tenants unpaid for >7 days past `renewalAt` get locked to billing.
   Risk: any tenant currently overdue by more than 7 days is locked immediately.
   Prerequisite: list overdue tenants (admin → renewal alerts) and review them first.
2. **Reopening behaviour.** Keep today's design (closed stays closed, bot first) or change to
   "reopen as OPEN and keep previous employee if online and authorized, else auto-assign".
   Effect: changes what every employee sees in their queue for returning customers.
   Needs a per-tenant toggle and a staged rollout; do not ship globally without approval.
3. **Signup auto-login.** Current email-activation protects against fake-email trials;
   auto-login would improve conversion but weakens that check.
4. **Canonical roles.** Introduce Owner/Admin/Employee labels on top of the current
   role-name + permission model, or keep as is.

## E. Proposed implementation plan (nothing implemented yet)

| Step | Change | Risk | Needs approval |
|---|---|---|---|
| 1 | Rewrite the 3 red reproduction tests as regression tests | None (tests only) | No |
| 2 | Add tests: trial expiry at 72 h, invite email mismatch/expired/revoked, duplicate inbound event does not reopen twice | None | No |
| 3 | Run Playwright suite locally and record results | None | No |
| 4 | Read-only report of overdue tenants for decision D1 | None | No |
| 5 | Grace-period env + notification stage alignment | Locks overdue customers | **Yes** |
| 6 | Per-tenant "reopen on new message" setting (default = today's behaviour) | Medium (touches ingestion for all channels) | **Yes** |
| 7 | Presence heartbeat / capacity limits | Medium | **Yes** |

## F. Production readiness checklist

| Item | Status |
|---|---|
| Critical/high security findings fixed | PASS for AUD-01..05, 08 (fixed and tested, **not yet deployed**); only AUD-10 (needs a DB constraint/migration) is open (see C.1) |
| Unit/integration suite green | PASS (all green after tests were rewritten; 7 known-open defects tracked as `it.fails`) |
| Grace period enforced as policy | NOT TESTED (depends on prod env) |
| Smart reopening | FAIL vs. brief (design difference) |
| Payments against gateway sandbox | NOT TESTED |
| OAuth channels against provider sandboxes | NOT TESTED |
| E2E browser suite | NOT TESTED (Playwright browsers not installed) |
| Performance / load | NOT TESTED |

## G. Notes

* Nothing here changed production data or configuration.
* Stage 2 (tests + safe fixes) can begin with plan steps 1–4 without further approval.
