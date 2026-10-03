#!/usr/bin/env bash
# PriceLens live status board for Telegram (docs/RUNBOOK.md).
#
# One message that is EDITED in place on every run, so the chat keeps a single
# up-to-date board instead of a stream. Alerts stay in monitor.sh (they must
# notify); this is the dashboard you open to see the whole picture:
#   web / API / containers, catalog size, ingestion now + next, queue,
#   visitors online, Gemini key health.
#
# Run by pricelens-status.timer every 5 minutes.
# Settings (same file as monitor.sh): ALERT_TELEGRAM_BOT_TOKEN, ALERT_TELEGRAM_CHAT_ID;
# optional STATUS_TELEGRAM_CHAT_IDS (space-separated) to post the board somewhere other than
# the alert chats. One board per chat, each edited in place.
#
#   STATUS_DRY=1 scripts/status-report.sh    print the message, send nothing
#   STATUS_RESEND=1 scripts/status-report.sh post a fresh message (new board, e.g. to pin)
set -uo pipefail

ALERT_ENV="${ALERT_ENV:-$HOME/.config/pricelens/alerts.env}"
# shellcheck disable=SC1090
[[ -f "$ALERT_ENV" ]] && . "$ALERT_ENV"

STATE_DIR="${STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/pricelens/monitor}"
SITE="${SITE:-pricelens.store}"
API_PORT="${API_PORT:-3002}"
ONLINE_WINDOW_MIN="${ONLINE_WINDOW_MIN:-5}"
CONTAINERS="${CONTAINERS:-pricelens-api pricelens-worker pricelens-proxy pricelens-postgres pricelens-redis}"
CHAT_IDS="${STATUS_TELEGRAM_CHAT_IDS:-${ALERT_TELEGRAM_CHAT_ID:-} ${ALERT_TELEGRAM_EXTRA_CHAT_IDS:-}}"
mkdir -p "$STATE_DIR"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pq() { podman exec -i pricelens-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -v ON_ERROR_STOP=1' 2>/dev/null; }
timed() { curl -s -o /dev/null -w '%{http_code} %{time_total}' -m 10 "$@"; }

# --- probes -----------------------------------------------------------------
{
  echo "site $(timed --resolve "$SITE:443:127.0.0.1" "https://$SITE/")"
  echo "api $(timed --resolve "$SITE:443:127.0.0.1" "https://$SITE/api/v1/billing/plans")"
  echo "ready $(timed "http://127.0.0.1:$API_PORT/health/ready")"
} > "$work/http"

web="$(sed -n 's|.*# \(pricelens-web[a-z-]*\).*|\1|p' "$HOME/pricelens/docker/nginx-upstreams/web.conf" 2>/dev/null | head -1)"
for name in $CONTAINERS $web; do
  info="$(podman inspect "$name" --format '{{.State.Running}} {{.State.StartedAt}}' 2>/dev/null)"
  echo "$name ${info:-false -}"
done > "$work/containers"

curl -s -m 15 "http://127.0.0.1:$API_PORT/health/ops" > "$work/ops.json"

pq > "$work/db" <<'SQL'
select 'products', count(*) from canonical_products;
select 'products24', count(*) from canonical_products where created_at > now() - interval '24 hours';
select 'listings', count(*) from source_listings where price_usd > 0;
select 'running', p.slug, to_char(sj.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from scraping_jobs sj join platforms p on p.id = sj.platform_id
 where sj.status = 'RUNNING' and sj.started_at > now() - interval '3 hours' order by sj.started_at;
select 'lastdone', p.slug, to_char(sj.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from scraping_jobs sj join platforms p on p.id = sj.platform_id
 where sj.status = 'COMPLETED' order by sj.completed_at desc nulls last limit 1;
select 'signedin', count(distinct user_id) from sessions
 where revoked_at is null and expires_at > now() and coalesce(rotated_at, created_at) > now() - interval '15 minutes';
select 'users', count(*) from users;
SQL

# Visitors: distinct client IPs on real page/API hits in the window, bots filtered out.
timeout 20 podman logs --since "${ONLINE_WINDOW_MIN}m" pricelens-proxy 2>/dev/null > "$work/proxy.log" || true

# Gemini: slot pauses come from the worker log (state is in memory there).
timeout 20 podman logs --since 24h pricelens-worker 2>&1 | grep -F 'match-judgement call failed' > "$work/gemini.log" || true
keys_total="$(timeout 20 podman exec pricelens-worker printenv GEMINI_API_KEYS 2>/dev/null | tr ',' '\n' | grep -c .)"
models="$(timeout 20 podman exec pricelens-worker printenv GEMINI_MATCH_MODELS 2>/dev/null | tr ',' '\n' | grep -c .)"
live_cron="$(timeout 20 podman exec pricelens-worker printenv LIVE_INGESTION_CRON 2>/dev/null)"
sweep_cron="$(timeout 20 podman exec pricelens-worker printenv STORE_COVERAGE_SWEEP_CRON 2>/dev/null)"

# --- compose ----------------------------------------------------------------
message="$(WORK="$work" KEYS_TOTAL="${keys_total:-0}" MODELS="${models:-1}" LIVE_CRON="${live_cron:-0 */6 * * *}" \
  SWEEP_CRON="${sweep_cron:-}" WINDOW="$ONLINE_WINDOW_MIN" SITE="$SITE" node -e '
const fs = require("fs");
const W = process.env.WORK, rd = (f) => { try { return fs.readFileSync(`${W}/${f}`, "utf8"); } catch { return ""; } };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const now = Date.now();
const tz = "Africa/Cairo";
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const ago = (d) => { const m = Math.max(0, Math.round((now - new Date(d)) / 60000)); return m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`; };
const left = (d) => { const m = Math.max(0, Math.round((new Date(d) - now) / 60000)); return m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`; };
const num = (n) => Number(n).toLocaleString("en-US");

// Next fire of a 5-field cron (*, */n, a-b, a,b) in UTC, scanning minute by minute.
function nextFire(expr) {
  const f = expr.trim().split(/\s+/); if (f.length !== 5) return null;
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const sets = f.map((part, i) => {
    const [lo, hi] = ranges[i], s = new Set();
    for (const piece of part.split(",")) {
      const [r, step] = piece.split("/"); const st = step ? +step : 1;
      let a = lo, b = hi;
      if (r !== "*") { const [x, y] = r.split("-"); a = +x; b = y === undefined ? (step ? hi : +x) : +y; }
      for (let v = a; v <= b; v += st) s.add(v);
    }
    return s;
  });
  const t = new Date(Math.floor(now / 60000) * 60000 + 60000);
  for (let i = 0; i < 60 * 24 * 8; i++, t.setUTCMinutes(t.getUTCMinutes() + 1)) {
    if (sets[0].has(t.getUTCMinutes()) && sets[1].has(t.getUTCHours()) && sets[3].has(t.getUTCMonth() + 1)
      && (sets[2].has(t.getUTCDate()) || sets[4].has(t.getUTCDay()))) return new Date(t);
  }
  return null;
}

const http = Object.fromEntries(rd("http").trim().split("\n").map((l) => { const [k, c, s] = l.split(" "); return [k, { code: c, ms: Math.round(parseFloat(s || "0") * 1000) }]; }));
const containers = rd("containers").trim().split("\n").map((l) => { const [n, run] = l.split(" "); return { n, up: run === "true" }; });
let ops = null; try { ops = JSON.parse(rd("ops.json")).data; } catch {}
const db = { running: [], lastdone: null };
for (const l of rd("db").trim().split("\n")) {
  const [k, a, b] = l.split("|");
  if (k === "running") db.running.push({ slug: a, since: b });
  else if (k === "lastdone") db.lastdone = { slug: a, at: b };
  else db[k] = Number(a);
}

const ok = (c) => c === "200";
const dot = (good) => (good ? "🟢" : "🔴");
const out = [];
const down = [];

// Overall
const webOk = ok(http.site?.code), apiOk = ok(http.api?.code) && ok(http.ready?.code);
const downC = containers.filter((c) => !c.up);
out.push(`<b>📊 PriceLens — الحالة المباشرة</b>`);
out.push(`🕐 ${clock(now)} (القاهرة) · تتحدث كل 5 دقايق`);
out.push("");

// Services
out.push(`<b>⚙️ الخدمات</b>`);
out.push(`${dot(webOk)} الويب: ${webOk ? `شغال · ${http.site.ms}ms` : `واقع (HTTP ${http.site?.code})`}`);
out.push(`${dot(apiOk)} الـ API: ${apiOk ? `شغال · ${http.api.ms}ms` : `مشكلة (api ${http.api?.code} / ready ${http.ready?.code})`}`);
out.push(`${dot(!downC.length)} الكونتينرز: ${containers.length - downC.length}/${containers.length} شغالين${downC.length ? ` — واقف: ${esc(downC.map((c) => c.n.replace("pricelens-", "")).join(", "))}` : ""}`);
out.push("");

// Catalog
out.push(`<b>🛍 الكتالوج</b>`);
out.push(`• المنتجات: <b>${num(db.products ?? 0)}</b> (+${num(db.products24 ?? 0)} آخر 24 س)`);
out.push(`• عروض بأسعار: <b>${num(db.listings ?? 0)}</b>`);
if (ops) {
  const live = ops.stores.filter((s) => s.pricedListings > 0);
  const total = live.reduce((a, s) => a + s.pricedListings, 0);
  const fresh = live.reduce((a, s) => a + s.refreshed24h, 0);
  out.push(`• اتحدّث آخر 24 س: <b>${num(fresh)}</b> من ${num(total)} (${total ? Math.round((fresh / total) * 100) : 0}%)`);
}
out.push("");

// Ingestion
out.push(`<b>🔄 الـ Ingestion</b>`);
if (ops) {
  const q = ops.queue;
  const busy = q.active > 0 || db.running.length > 0;
  out.push(`${busy ? "🟢 شغال دلوقتي" : "⚪️ مفيش حاجة شغالة"} — ${q.active} job نشط · ${num(q.waiting)} مستني · ${q.delayed} مؤجل · ${q.failed} فاشل`);
  if (db.running.length) {
    const seen = new Set();
    const names = db.running.filter((r) => !seen.has(r.slug) && seen.add(r.slug)).map((r) => `${esc(r.slug)} (من ${ago(r.since)})`);
    out.push(`• بيمسح: ${names.join(" · ")}`);
  }
} else out.push(`🔴 /health/ops مش بيرد`);
if (db.lastdone) out.push(`• آخر مسح خلص: ${esc(db.lastdone.slug)} من ${ago(db.lastdone.at)}`);
const next = nextFire(process.env.LIVE_CRON);
if (next) out.push(`• الجاي: <b>${clock(next)}</b> (بعد ${left(next)})`);
if (ops) {
  const bad = ops.stores.filter((s) => s.pricedListings >= 10 && s.refreshed24h === 0);
  const flaky = ops.stores.filter((s) => s.sweeps24h.failed > s.sweeps24h.completed && s.sweeps24h.failed > 0);
  if (bad.length) out.push(`🔴 متوقف 24 س: ${esc(bad.map((s) => s.slug).join(", "))}`);
  if (flaky.length) out.push(`🟠 بيفشل أكتر ما بينجح: ${esc(flaky.map((s) => `${s.slug} (${s.sweeps24h.failed}✗/${s.sweeps24h.completed}✓)`).join(", "))}`);
}
out.push("");

// Online
const win = Number(process.env.WINDOW);
const bots = /bot|crawl|spider|slurp|gpt|claude|perplexity|bytespider|semrush|ahrefs|curl|python|go-http|monitor|uptime|headless|facebookexternalhit|preview/i;
const ips = new Set(); let hits = 0;
for (const line of rd("proxy.log").split("\n")) {
  const m = line.match(/^(\S+) .*?"(?:GET|POST|PUT|PATCH|DELETE) (\S+) [^"]*" (\d{3}) \d+ "[^"]*" "([^"]*)"/);
  if (!m) continue;
  const [, ip, path, status, ua] = m;
  if (!ua || bots.test(ua) || !/^[23]/.test(status)) continue;
  if (/^\/(_next|static|favicon|robots|sitemap|health|images?)\b|\.(js|css|png|jpe?g|webp|svg|ico|woff2?|map)(\?|$)/i.test(path)) continue;
  if (/^(127\.|10\.|192\.168\.|::1|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) continue;
  ips.add(ip); hits++;
}
out.push(`<b>👥 أونلاين</b>`);
out.push(`• زوار آخر ${win} دقايق: <b>${ips.size}</b> (${hits} طلب، من غير البوتات)`);
out.push(`• مسجلين دخول نشطين (آخر 15 د): <b>${db.signedin ?? 0}</b> من ${db.users ?? 0} مستخدم`);
out.push("");

// Gemini keys
const total = Number(process.env.KEYS_TOTAL), perKey = Math.max(1, Number(process.env.MODELS));
const slots = new Map();
for (const line of rd("gemini.log").split("\n")) {
  const m = line.match(/"timestamp":(\d+).*?gemini key #(\d+) (\S+) match-judgement call failed, pausing it for (\d+)s: Gemini HTTP (\d+)( \(daily quota spent\))?/);
  if (!m) continue;
  const [, ts, key, model, sec, status, daily] = m;
  const until = Number(ts) + Number(sec) * 1000;
  const prev = slots.get(`${key}/${model}`);
  if (!prev || Number(ts) >= prev.ts) slots.set(`${key}/${model}`, { key: Number(key), ts: Number(ts), until, status: Number(status), daily: !!daily });
}
const perKeyState = new Map();
for (const s of slots.values()) {
  if (s.until <= now) continue;
  const cur = perKeyState.get(s.key) ?? { paused: 0, daily: 0, bad: 0, until: 0 };
  cur.paused++; if (s.daily) cur.daily++; if (s.status === 401 || s.status === 403) cur.bad++;
  cur.until = Math.max(cur.until, s.until);
  perKeyState.set(s.key, cur);
}
let dead = [], spent = [], limited = [];
for (const [k, s] of perKeyState) {
  if (s.bad) dead.push(k); else if (s.daily) spent.push(k); else limited.push(k);
}
const healthy = Math.max(0, total - dead.length - spent.length - limited.length);
const keyIcon = total && healthy === total ? "🟢" : healthy > 0 ? "🟠" : "🔴";
out.push(`<b>🔑 مفاتيح Gemini</b> (${total} مفاتيح)`);
out.push(`${keyIcon} سليم: <b>${healthy}/${total}</b>`);
if (spent.length) out.push(`• ❌ الليميت اليومي خلص: #${spent.sort((a, b) => a - b).join(", #")}`);
if (limited.length) out.push(`• ⏳ rate-limit مؤقت (دقيقة): #${limited.sort((a, b) => a - b).join(", #")}`);
if (dead.length) out.push(`• 🚫 مرفوض/محظور (403): #${dead.sort((a, b) => a - b).join(", #")}`);
if (!spent.length && !limited.length && !dead.length) out.push(`• مفيش مفتاح عليه ليميت دلوقتي`);
out.push(`<i>من لوج الـ worker؛ الحالة بتتصفر لو الـ worker اتعمله restart.</i>`);

console.log(out.join("\n"));
')"

if [[ -n "${STATUS_DRY:-}" ]]; then
  printf '%s\n' "$message"
  exit 0
fi

[[ -n "${ALERT_TELEGRAM_BOT_TOKEN:-}" && -n "$CHAT_IDS" ]] || { echo "status-report: no Telegram settings in $ALERT_ENV" >&2; exit 1; }
api="https://api.telegram.org/bot${ALERT_TELEGRAM_BOT_TOKEN}"

# Messages other people posted since the board (the bot only sees them in groups once
# BotFather /setprivacy is Disabled): when there are any, post a fresh board at the bottom
# instead of editing the one that scrolled up. Pending updates are left unread.
curl -s -m 15 "$api/getUpdates" > "$work/updates.json" || true

latest_incoming() {
  CHAT="$1" node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  let max = 0;
  try { for (const u of JSON.parse(s).result || []) { const m = u.message; if (m && String(m.chat.id) === process.env.CHAT && m.message_id > max) max = m.message_id; } } catch {}
  console.log(max);
});' < "$work/updates.json"
}

rc=0
for CHAT_ID in $CHAT_IDS; do
  id_file="$STATE_DIR/status-message-id.$CHAT_ID"
  [[ "$CHAT_ID" == "-5429407202" && ! -e "$id_file" && -s "$STATE_DIR/status-message-id" ]] && mv "$STATE_DIR/status-message-id" "$id_file"
  [[ -n "${STATUS_RESEND:-}" ]] && rm -f "$id_file"

  if [[ -s "$id_file" ]]; then
    board_id="$(cat "$id_file")"
    if (( $(latest_incoming "$CHAT_ID") > board_id )); then
      rm -f "$id_file"
    else
      res="$(curl -s -m 15 "$api/editMessageText" --data-urlencode "chat_id=$CHAT_ID" --data-urlencode "message_id=$board_id" \
        --data-urlencode "parse_mode=HTML" --data-urlencode "disable_web_page_preview=true" --data-urlencode "text=$message")"
      # Unchanged text comes back as "message is not modified": fine. Anything else (deleted message): post anew.
      if grep -q '"ok":true' <<<"$res" || grep -q 'not modified' <<<"$res"; then continue; fi
      rm -f "$id_file"
    fi
  fi

  res="$(curl -s -m 15 "$api/sendMessage" --data-urlencode "chat_id=$CHAT_ID" --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_notification=true" --data-urlencode "disable_web_page_preview=true" --data-urlencode "text=$message")"
  mid="$(sed -n 's/.*"message_id":\([0-9]*\).*/\1/p' <<<"$res" | head -1)"
  if [[ -n "$mid" ]]; then echo "$mid" > "$id_file"; else echo "status-report: telegram send to $CHAT_ID failed: $res" >&2; rc=1; fi
done
exit $rc
