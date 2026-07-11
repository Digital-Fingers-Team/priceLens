#!/bin/sh
set -e

export DISPLAY=:99

Xvfb :99 -screen 0 1366x850x24 -nolisten tcp &
XVFB_PID=$!

fluxbox >/tmp/fluxbox.log 2>&1 &

# noVNC is OFF by default. Only turn it on (ENABLE_NOVNC=true) temporarily when
# you need to do a one-time interactive login/CAPTCHA-solve for a connector's
# profile (see apps/api/scripts/login-store.ts), then turn it back off — it's
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

cleanup() {
  kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup TERM INT

node dist/src/main &
APP_PID=$!
wait "$APP_PID"
