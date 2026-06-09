#!/usr/bin/env bash
#
# Local dev launcher for mytonstorage-org against the LOCAL backend.
#
# It:
#   1. starts a Cloudflare quick tunnel to the Next dev server,
#   2. reads the generated https URL,
#   3. writes that URL into .env.local (API base + manifest) and a
#      git-ignored public/tonconnect-manifest.local.json,
#   4. starts `next dev`.
#
# The tracked public/tonconnect-manifest.json (production) is never modified.
#
# This keeps the app, the /api proxy and the TON Connect manifest on a single
# HTTPS origin, so the session cookie works and Tonkeeper can load the manifest.
#
# Usage:  ./dev-local.sh
# Stop:   Ctrl+C (the tunnel is stopped automatically).

set -euo pipefail

ORG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ORG_DIR"

FRONT_PORT="${FRONT_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-9092}"

# --- locate cloudflared -----------------------------------------------------
CF_BIN="${CF_BIN:-}"
if [ -z "$CF_BIN" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CF_BIN="$(command -v cloudflared)"
  elif [ -x "$ORG_DIR/cloudflared" ]; then
    CF_BIN="$ORG_DIR/cloudflared"
  elif [ -x "$ORG_DIR/../mytonstorage-backend/cloudflared" ]; then
    CF_BIN="$ORG_DIR/../mytonstorage-backend/cloudflared"
  else
    echo "ERROR: cloudflared not found. Set CF_BIN=/path/to/cloudflared" >&2
    exit 1
  fi
fi
echo "Using cloudflared: $CF_BIN"

# --- warn if backend is down ------------------------------------------------
if ! curl -sf -o /dev/null "http://localhost:${BACKEND_PORT}/health"; then
  echo "WARNING: backend not reachable on http://localhost:${BACKEND_PORT}/health" >&2
  echo "         start it first (cd ../mytonstorage-backend && task deploy:up)" >&2
fi

# --- clean up stale processes ----------------------------------------------
pkill -f "next dev" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# --- start the tunnel -------------------------------------------------------
CF_LOG="$(mktemp -t cf-tunnel.XXXXXX.log)"
"$CF_BIN" tunnel --url "http://localhost:${FRONT_PORT}" >"$CF_LOG" 2>&1 &
CF_PID=$!

cleanup() {
  echo
  echo "Stopping tunnel (pid $CF_PID)..."
  kill "$CF_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- wait for the public URL -----------------------------------------------
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" | head -n1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "ERROR: could not obtain tunnel URL. cloudflared output:" >&2
  cat "$CF_LOG" >&2
  exit 1
fi

echo "============================================================"
echo " Tunnel URL : $URL"
echo " Open this  : $URL"
echo "============================================================"

# --- sync backend SYSTEM_HOST ----------------------------------------------
# The backend verifies the TON Connect proof domain against SYSTEM_HOST, so it
# must equal the tunnel host or login fails with "invalid proof".
BACKEND_DIR="${BACKEND_DIR:-$ORG_DIR/../mytonstorage-backend}"
DOMAIN="${URL#https://}"
if [ -f "$BACKEND_DIR/deploy/.env" ]; then
  CURRENT_HOST="$(grep -E '^SYSTEM_HOST=' "$BACKEND_DIR/deploy/.env" | head -n1 | cut -d= -f2-)"
  if [ "$CURRENT_HOST" != "$DOMAIN" ]; then
    echo "Updating backend SYSTEM_HOST: ${CURRENT_HOST:-<unset>} -> $DOMAIN"
    sed -i "s|^SYSTEM_HOST=.*|SYSTEM_HOST=${DOMAIN}|" "$BACKEND_DIR/deploy/.env"
    echo "Restarting backend container to apply SYSTEM_HOST..."
    ( cd "$BACKEND_DIR" && docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d backend )
    for _ in $(seq 1 30); do
      curl -sf -o /dev/null "http://localhost:${BACKEND_PORT}/health" && break
      sleep 1
    done
  else
    echo "Backend SYSTEM_HOST already matches ($DOMAIN)"
  fi
else
  echo "WARNING: $BACKEND_DIR/deploy/.env not found." >&2
  echo "         Set SYSTEM_HOST=$DOMAIN there and restart the backend manually." >&2
fi

# --- write config -----------------------------------------------------------
# A dedicated, git-ignored manifest is used for local dev so the tracked
# production manifest stays clean.
cat > .env.local <<EOF
NEXT_PUBLIC_API_BASE=$URL
NEXT_PUBLIC_TONCONNECT_MANIFEST_URL=$URL/tonconnect-manifest.local.json
EOF

cat > public/tonconnect-manifest.local.json <<EOF
{
  "url": "$URL",
  "name": "My TON Storage (local)",
  "iconUrl": "$URL/logo_180x180.png"
}
EOF

echo "Updated .env.local and public/tonconnect-manifest.local.json"
echo "Starting next dev on :${FRONT_PORT} ..."

# --- run the dev server (foreground) ---------------------------------------
npm run dev
