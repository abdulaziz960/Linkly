import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_* is inlined into the browser bundle at build time (see
// Dockerfile/cloudbuild.yaml's _SENTRY_DSN substitution) - a Sentry DSN is
// meant to be public (it can only submit events, not read/modify anything),
// same trust model as NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: 0.1
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
