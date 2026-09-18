import * as Sentry from "@sentry/nextjs";

// Runtime env var (Secret Manager/Cloud Run env, not a NEXT_PUBLIC_* build
// arg) - the server never needs it inlined at build time. Sentry DSNs are
// not secrets (safe to expose client-side too, see instrumentation-client.ts),
// this just doesn't need to be public here.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    // Conservative default for a freshly-launched product - keep the ingest
    // volume/cost bounded until real traffic patterns are known.
    tracesSampleRate: 0.1
  });
}
