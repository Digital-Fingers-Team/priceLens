#!/bin/sh
set -e

export DISPLAY=:99

Xvfb :99 -screen 0 1366x850x24 -nolisten tcp &
XVFB_PID=$!

fluxbox >/tmp/fluxbox.log 2>&1 &

# noVNC is OFF by default. Only turn it on (ENABLE_NOVNC=true) temporarily when
# you need to do a one-time interactive login/CAPTCHA-solve for a connector's
# profile (see apps/api/scripts/ops/login-store.ts), then turn it back off — it's
# a remote-control window into this container's browser session, which is why
# it refuses to start without a real VNC_PASSWORD rather than defaulting open.
if [ "${ENABLE_NOVNC:-false}" = "true" ]; then
  if [ -z "$VNC_PASSWORD" ]; then
    echo "ENABLE_NOVNC=true but VNC_PASSWORD is not set — refusing to start an unauthenticated remote desktop. Set VNC_PASSWORD and restart." >&2
    exit 1
  fi
  x11vnc -display :99 -forever -shared -rfbport 5900 -passwd "$VNC_PASSWORD" -quiet >/tmp/x11vnc.log 2>&1 &
  websockify --web=/usr/share/novnc/ "${NOVNC_PORT:-6080}" localhost:5900 >/tmp/novnc.log 2>&1 &
fi

# Give Xvfb a moment before Chrome ever tries to attach to it.
sleep 1

# ─── Database migrations ─────────────────────────────────────────────────────
# Nothing in the deploy path ran migrations before this, so every schema change
# had to be remembered and applied by hand -- and a forgotten one surfaces as
# runtime errors against columns that do not exist.
#
# `migrate deploy` is idempotent (it only applies what _prisma_migrations says
# is outstanding) and never generates or resets anything, so it is safe to run
# on every boot. It is fatal on failure on purpose: serving traffic against a
# schema the code does not expect is worse than not starting.
#
# Set RUN_MIGRATIONS_ON_START=false when running more than one API replica, and
# apply migrations as a separate step instead.
if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo "Applying database migrations..."
  if ! node /repo/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js migrate deploy; then
    echo "Database migration failed — refusing to start." >&2
    exit 1
  fi
fi

cleanup() {
  kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup TERM INT

node dist/src/main &
APP_PID=$!
wait "$APP_PID"
