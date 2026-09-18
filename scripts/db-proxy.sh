#!/bin/sh
# Opens a local, IAM-authenticated tunnel to the production Cloud SQL
# instance so Prisma / psql can connect to 127.0.0.1:${DB_PROXY_PORT}
# without whitelisting your IP on the instance or exposing it publicly.
#
#   Prereqs (one-time):
#     brew install cloud-sql-proxy
#     gcloud auth login                 # account needs roles/cloudsql.client on linkly-prod
#
#   Usage:
#     npm run db:env                    # once: stores the password in .env.db
#     npm run db:proxy                  # keep this terminal open
#     npm run db:check                  # in another terminal
#
# Credentials: Google sign-ins on this account expire periodically. The
# script checks them BEFORE starting: it uses Application Default
# Credentials when they still work, otherwise your `gcloud auth login`
# credentials (--gcloud-auth), otherwise it tells you what to run. A tunnel
# that was already running when the sign-in expired cannot recover: stop it
# (Ctrl+C), sign in again, and start it again.
#
# The instance/port can be overridden with CLOUD_SQL_INSTANCE / DB_PROXY_PORT.
# The default port is 6543 (not 5432/5433) to stay clear of any local
# PostgreSQL installation. DB_PROXY_DRY_RUN=1 prints the decision and exits.
set -eu

INSTANCE="${CLOUD_SQL_INSTANCE:-linkly-prod:me-central2:linkly-pg}"
PORT="${DB_PROXY_PORT:-6543}"

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "cloud-sql-proxy is not installed. Run: brew install cloud-sql-proxy" >&2
  exit 1
fi
if ! command -v gcloud >/dev/null 2>&1; then
  echo "The gcloud CLI is not installed. See https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  HOLDER_NAME="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}')"
  HOLDER_PID="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')"
  echo "Port ${PORT} is already in use by ${HOLDER_NAME} (pid ${HOLDER_PID})." >&2
  echo "If that is an old tunnel, stop it with Ctrl+C in its terminal (or: kill ${HOLDER_PID})," >&2
  echo "then run npm run db:proxy again. Or use another port: DB_PROXY_PORT=7654 npm run db:proxy" >&2
  exit 1
fi

AUTH_FLAG=""
ADC_FILE="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"
if [ -f "${ADC_FILE}" ] && gcloud auth application-default print-access-token >/dev/null 2>&1; then
  AUTH_DESC="Application Default Credentials"
elif gcloud auth print-access-token >/dev/null 2>&1; then
  AUTH_FLAG="--gcloud-auth"
  AUTH_DESC="your gcloud login ($(gcloud config get-value account 2>/dev/null || echo unknown account))"
  if [ -f "${ADC_FILE}" ]; then
    echo "Note: your Application Default Credentials have expired; using your gcloud login instead."
    echo "      (Refresh them any time with: gcloud auth application-default login)"
  fi
else
  echo "Your Google sign-in has expired (or you are not signed in). Run:" >&2
  echo "  gcloud auth login" >&2
  echo "  gcloud auth application-default login" >&2
  echo "then start the tunnel again with: npm run db:proxy" >&2
  exit 1
fi

echo "Cloud SQL Auth Proxy -> ${INSTANCE} on 127.0.0.1:${PORT}, authenticated with ${AUTH_DESC}"
echo "Leave this running. In another terminal: npm run db:check  (password from .env.db - see npm run db:env)"
echo "If db:* commands later say \"Can't reach database server\", your sign-in expired: Ctrl+C here, sign in again, restart."
if [ "${DB_PROXY_DRY_RUN:-}" = "1" ]; then
  echo "(dry run: not starting the proxy; flag=\"${AUTH_FLAG}\")"
  exit 0
fi
# shellcheck disable=SC2086
exec cloud-sql-proxy "${INSTANCE}" ${AUTH_FLAG} --address 127.0.0.1 --port "${PORT}"
