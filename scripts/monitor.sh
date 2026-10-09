#!/usr/bin/env bash
# PriceLens production monitor: checks, then alerts on changes (CLAUDE.md, "Runbook").
#
# Run by pricelens-monitor.timer every 5 minutes. Each check yields OK or a
# problem line. A problem is sent once when it starts ("FIRING") and once when
# it clears ("RESOLVED"), never every run; state lives in $STATE_DIR.
#
# Checks
#   site / api       the public site and an API route through the proxy
#                    (catches the stale-upstream 502 as well as a dead API)
#   ready            /health/ready on the API port (Postgres, cache, queue)
#   containers       the stack is running; a restart since the last run
#                    (an out-of-memory crash) fires once
#   disk             root filesystem >= DISK_PCT (2026-09-27: filled in 2 h)
#   memory           worker / API node RSS >= MEM_MB
#   errors           >= ERROR_5XX 5xx answers from the proxy in 5 minutes
#   queue            ingestion backlog (waiting) >= QUEUE_WAITING
#   store:<slug>     a store with priced listings refreshed none of them in
#                    24 h (its scraper is failing or blocked; prices go stale)
#   backup           newest backup older than 26 h (when backups are enabled)
#
# Alert delivery, first configured wins (settings in $ALERT_ENV, chmod 600):
#   ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID   Telegram message
#     (+ optional ALERT_TELEGRAM_EXTRA_CHAT_IDS, space-separated, e.g. a group)
#   ALERT_COMMAND                                       any command; the alert text on stdin
#   neither                                             written to stdout (the journal)
#
# Test that alerts fire:  MONITOR_TEST=1 scripts/monitor.sh
#   raises one synthetic problem, delivers it, then resolves it.
set -uo pipefail

ALERT_ENV="${ALERT_ENV:-$HOME/.config/pricelens/alerts.env}"
# shellcheck disable=SC1090
[[ -f "$ALERT_ENV" ]] && . "$ALERT_ENV"

STATE_DIR="${STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/pricelens/monitor}"
SITE="${SITE:-pricelens.store}"
API_PORT="${API_PORT:-3002}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pricelens/backups/db}"
DISK_PCT="${DISK_PCT:-85}"
MEM_MB="${MEM_MB:-1500}"
ERROR_5XX="${ERROR_5XX:-20}"
QUEUE_WAITING="${QUEUE_WAITING:-2000}"
CONTAINERS="${CONTAINERS:-pricelens-api pricelens-worker pricelens-proxy pricelens-postgres pricelens-redis}"
mkdir -p "$STATE_DIR"

declare -A problem=()
fail() { problem[$1]="$2"; }

http() { curl -s -o /dev/null -w '%{http_code}' -m 10 --resolve "$SITE:443:127.0.0.1" "https://$SITE$1"; }
rss_mb() { podman top "$1" pid rss args 2>/dev/null | awk '/node dist/ {print int($2 / 1024)}' | head -1; }

if [[ -n "${MONITOR_TEST:-}" ]]; then
  fail test "synthetic alert from MONITOR_TEST (monitor.sh delivery test)"
else
  code="$(http /)"; [[ "$code" == 200 ]] || fail site "https://$SITE/ answered $code"
  code="$(http /api/v1/billing/plans)"; [[ "$code" == 200 ]] || fail api "/api/v1/billing/plans answered $code (502 = proxy on a stale API address)"
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:$API_PORT/health/ready")"
  [[ "$code" == 200 ]] || fail ready "/health/ready answered $code (Postgres or Redis unreachable)"

  # Web: whichever colour the proxy points at (deploy-web.sh writes it).
  web="$(sed -n 's|.*# \(pricelens-web[a-z-]*\).*|\1|p' "$HOME/pricelens/docker/nginx-upstreams/web.conf" 2>/dev/null | head -1)"
  for name in $CONTAINERS $web; do
    info="$(podman inspect "$name" --format '{{.State.Running}} {{.RestartCount}} {{.State.StartedAt}}' 2>/dev/null)"
    if [[ -z "$info" || "${info%% *}" != true ]]; then fail "container:$name" "$name is not running"; continue; fi
    started="${info#* * }"
    last="$(cat "$STATE_DIR/started.$name" 2>/dev/null || true)"
    # A new start time with no deploy in between is a crash-restart. Deploys
    # recreate containers, which also changes it: those alerts are expected.
    if [[ -n "$last" && "$last" != "$started" ]]; then
      restarts="$(echo "$info" | cut -d' ' -f2)"
      echo "ALERT (one-off): $name started again at $started (restart count $restarts); after a deploy this is expected" > "$STATE_DIR/oneoff.$name"
    fi
    echo "$started" > "$STATE_DIR/started.$name"
  done

  pct="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
  (( pct < DISK_PCT )) || fail disk "root filesystem ${pct}% full (threshold $DISK_PCT%)"

  for name in pricelens-worker pricelens-api; do
    mb="$(rss_mb "$name")"
    [[ -z "$mb" || "$mb" -lt "$MEM_MB" ]] || fail "memory:$name" "$name node process at ${mb} MB (threshold $MEM_MB MB; heap limit ~2 GB)"
  done

  n5xx="$(podman logs --since 5m pricelens-proxy 2>/dev/null | awk '$9 ~ /^5[0-9][0-9]$/' | wc -l)"
  (( n5xx < ERROR_5XX )) || fail errors "$n5xx 5xx responses from the proxy in the last 5 minutes"

  ops="$(curl -s -m 15 "http://127.0.0.1:$API_PORT/health/ops")"
  if [[ -z "$ops" ]]; then
    fail ops "/health/ops did not answer"
  else
    while IFS=$'\t' read -r key message; do
      [[ -n "$key" ]] && fail "$key" "$message"
    done < <(node -e '
      let data;
      try { data = JSON.parse(require("fs").readFileSync(0, "utf8")).data; } catch {}
      if (!data || !data.queue) { console.log("ops\t/health/ops gave no report (older API image, or the API is failing)"); process.exit(0); }
      const limit = Number(process.argv[1]);
      if (data.queue.waiting >= limit) console.log(`queue\tingestion queue backlog: ${data.queue.waiting} waiting (threshold ${limit})`);
      for (const s of data.stores) {
        if (s.pricedListings >= 10 && s.refreshed24h === 0) {
          console.log(`store:${s.slug}\t${s.slug}: none of ${s.pricedListings} priced listings refreshed in 24 h (last ${s.lastSeenAt ?? "never"})`);
        }
      }' "$QUEUE_WAITING" <<<"$ops")
  fi

  if compgen -G "$BACKUP_DIR/pricelens-*.dump" >/dev/null; then
    newest="$(ls -t "$BACKUP_DIR"/pricelens-*.dump | head -1)"
    age_h=$(( ($(date +%s) - $(stat -c %Y "$newest")) / 3600 ))
    (( age_h < 26 )) || fail backup "newest database backup is ${age_h} h old ($(basename "$newest"))"
  fi
fi

send() {
  local text="[PriceLens] $1"
  if [[ -n "${ALERT_TELEGRAM_BOT_TOKEN:-}" && -n "${ALERT_TELEGRAM_CHAT_ID:-}" ]]; then
    local chat
    for chat in ${ALERT_TELEGRAM_CHAT_ID} ${ALERT_TELEGRAM_EXTRA_CHAT_IDS:-}; do
      curl -s -m 10 -o /dev/null "https://api.telegram.org/bot${ALERT_TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${chat}" --data-urlencode "text=$text" \
        || echo "telegram delivery failed ($chat): $text" >&2
    done
  elif [[ -n "${ALERT_COMMAND:-}" ]]; then
    printf '%s\n' "$text" | bash -c "$ALERT_COMMAND" || echo "ALERT_COMMAND failed: $text" >&2
  fi
  echo "$text"
}

# FIRING / RESOLVED on change only.
firing_file="$STATE_DIR/firing"
touch "$firing_file"
for key in "${!problem[@]}"; do
  grep -qxF "$key" "$firing_file" || send "FIRING $key: ${problem[$key]}"
done
while read -r key; do
  [[ -z "$key" || -n "${problem[$key]+x}" ]] || send "RESOLVED $key"
done < "$firing_file"
printf '%s\n' "${!problem[@]}" | sed '/^$/d' | sort > "$firing_file"

for oneoff in "$STATE_DIR"/oneoff.*; do
  [[ -f "$oneoff" ]] || continue
  send "$(cat "$oneoff")"
  rm -f "$oneoff"
done

# MONITOR_TEST: resolve the synthetic problem straight away.
if [[ -n "${MONITOR_TEST:-}" ]]; then
  send "RESOLVED test"
  sed -i '/^test$/d' "$firing_file"
fi
exit 0
