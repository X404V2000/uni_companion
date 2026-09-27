#!/usr/bin/env bash
#
# scripts/tunnel_keepalive.sh
#
# Keeps the demo tunnels alive for the duration of the hackathon.
#
# WHY THIS EXISTS
# ---------------
# Cloudflare revokes free "quick" tunnels after roughly two to three hours with
# the server error "Unauthorized: Tunnel not found". The cloudflared process
# stays alive retrying forever, so the failure is silent: local services are
# healthy, the process list looks fine, and only the public URL is dead. That is
# exactly what made the site unreachable mid-session.
#
# A named tunnel with a permanent hostname needs a domain you own (Cloudflare
# requires a DNS zone), so until that exists this script is the mitigation:
#
#   1. Proactively RE-CREATES each tunnel before it reaches the age at which
#      Cloudflare tends to revoke it, so it never goes dead in the first place.
#   2. Reactively repairs a tunnel that is already revoked (probes the URL and
#      restarts it if the probe does not return 200).
#   3. Rebuilds the frontend when the BACKEND url changes, because VITE_API_BASE
#      is baked in at build time and a stale value makes every action fail.
#
# USAGE
#   Run it in the background before presenting:
#       ./scripts/tunnel_keepalive.sh &
#   Or in a spare terminal window and leave it running.
#
#   ./scripts/tunnel_keepalive.sh --once    # one check, then exit
#
# It deliberately does not run forever as a daemon by itself; the operator
# decides, so nothing unexpected keeps making outbound requests.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

TUNNEL_DIR="${TUNNEL_LOG_DIR:-/tmp/vc_tunnels}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# Refresh well before Cloudflare's revocation window. Two hours is safely under
# the ~2.5-3h observed, and costs one brief URL change per cycle.
MAX_AGE_SECONDS="${MAX_AGE_SECONDS:-6900}"   # 115 minutes
CHECK_INTERVAL="${CHECK_INTERVAL:-120}"      # check every 2 minutes
ONCE=0
[[ "${1:-}" == "--once" ]] && ONCE=1

mkdir -p "$TUNNEL_DIR"

log() { printf '[keepalive %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

tunnel_pid_for_port() {
  # Match only the real cloudflared process for this port.
  pgrep -f "^cloudflared tunnel --url http://127\.0\.0\.1:${1}( |$)" 2>/dev/null | head -1
}

tunnel_age_for_port() {
  local pid="$1"
  [[ -z "$pid" ]] && { echo 0; return; }
  local secs
  secs="$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ')"
  echo "${secs:-0}"
}

is_real_tunnel_host() {
  # WHY THIS EXISTS: the naive pattern 'https://[a-z0-9-]+\.trycloudflare\.com'
  # also matches Cloudflare's own API host, "api.trycloudflare.com", which
  # appears in cloudflared's ERROR output ("Post https://api.trycloudflare.com/
  # tunnel: context deadline exceeded"). When a tunnel failed to start, that
  # error line was scraped and recorded as the tunnel URL, and the frontend was
  # then rebuilt against Cloudflare's API - a host that answers 200 to
  # everything, so every health check passed while the app was actually broken
  # and the browser showed Cloudflare error 1033.
  #
  # A genuine quick-tunnel hostname always has at least TWO hyphen-joined labels
  # (e.g. "ashley-surge-mental-sand.trycloudflare.com"). API and status hosts are
  # single words. So: require a hyphen, and refuse the known service hosts.
  local host="$1"
  [[ -z "$host" ]] && return 1
  case "$host" in
    api.trycloudflare.com|www.trycloudflare.com|trycloudflare.com|\
    update.trycloudflare.com|registry.trycloudflare.com) return 1 ;;
  esac
  # Must contain a hyphen in the first label.
  [[ "${host%%.*}" == *-* ]] || return 1
  return 0
}

url_from_log() {
  local url host
  url="$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' \
    "$TUNNEL_DIR/$1.log" 2>/dev/null | head -1)"
  [[ -z "$url" ]] && return 1
  host="${url#https://}"
  # Reject service hosts that the pattern above can still match.
  is_real_tunnel_host "$host" || return 1
  printf '%s' "$url"
}

probe_url() {
  # 200 means the tunnel is actually serving traffic.
  curl -s -o /dev/null -m 15 -w '%{http_code}' "$1" 2>/dev/null || echo 000
}

kill_duplicate_tunnels() {
  # WHY: more than one tunnel for the same port means two competing public URLs.
  # Which one answers flips unpredictably, so the recorded URL can point at the
  # losing one and the site appears broken even though a tunnel is "running".
  # This happened for real during a rehearsal: two backend tunnels were alive,
  # the log named one host and the metrics endpoint named another.
  #
  # Keep the OLDEST (the one the recorded URL most likely refers to) and stop
  # the rest.
  local port="$1" name="$2"
  local pids
  pids="$(pgrep -f "^cloudflared tunnel --url http://127\.0\.0\.1:${port}( |$)" 2>/dev/null | sort -n)"
  local count
  count="$(printf '%s\n' "$pids" | grep -c . || true)"
  (( count <= 1 )) && return 0

  local keep first=1
  for keep in $pids; do
    if (( first == 1 )); then
      first=0
      continue
    fi
    log "$name: stopping DUPLICATE tunnel pid $keep (keeping $(printf '%s' "$pids" | head -1))"
    kill "$keep" 2>/dev/null || true
  done
  sleep 2
}

resolve_url_via_metrics() {
  # Authoritative source for a running tunnel's hostname. The log file can be
  # stale (it is appended across restarts and still holds dead hostnames), and
  # /quicktunnel reports what the CURRENT process actually serves.
  local port="$1" pid mport
  pid="$(pgrep -f "^cloudflared tunnel --url http://127\.0\.0\.1:${port}( |$)" 2>/dev/null | head -1)"
  [[ -z "$pid" ]] && return 1
  mport="$(ss -ltnp 2>/dev/null | grep "pid=$pid," \
    | grep -oE '127\.0\.0\.1:202[0-9][0-9]' | head -1 | cut -d: -f2)"
  [[ -z "$mport" ]] && return 1
  local url host
  url="$(curl -s -m 5 "http://127.0.0.1:${mport}/quicktunnel" 2>/dev/null \
    | grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' | head -1)"
  [[ -z "$url" ]] && return 1
  host="${url#https://}"
  is_real_tunnel_host "$host" || return 1
  printf '%s' "$url"
}

start_tunnel() {
  local name="$1" port="$2"
  # Clear the LOG only. The .url file is deliberately left until a replacement
  # is known, because other tools (and the operator) read it, and removing it
  # mid-restart left the demo with no address at all during a rehearsal.
  rm -f "$TUNNEL_DIR/$name.log"
  setsid nohup cloudflared tunnel --url "http://127.0.0.1:$port" --no-autoupdate \
    >"$TUNNEL_DIR/$name.log" 2>&1 </dev/null &
  disown 2>/dev/null || true

  local waited=0 url
  while (( waited < 40 )); do
    sleep 2; waited=$((waited + 2))
    # Prefer the metrics endpoint: it reports the hostname the live process is
    # actually serving, unlike the log which can hold a superseded hostname.
    url="$(resolve_url_via_metrics "$port" || true)"
    [[ -z "$url" ]] && url="$(url_from_log "$name")"
    if [[ -n "$url" ]]; then
      printf '%s' "$url" > "$TUNNEL_DIR/$name.url"
      log "$name tunnel up: $url"
      return 0
    fi
  done
  log "$name tunnel FAILED to produce a URL (see $TUNNEL_DIR/$name.log)"
  return 1
}

ensure_tunnel() {
  # $1 = name, $2 = port, $3 = probe path
  local name="$1" port="$2" path="$3"
  local pid age url code

  # Collapse duplicates FIRST so "the pid" below is unambiguous.
  kill_duplicate_tunnels "$port" "$name"

  pid="$(tunnel_pid_for_port "$port")"
  age="$(tunnel_age_for_port "$pid")"
  # Prefer the metrics endpoint over the log: the log is appended across
  # restarts and can still name a hostname that has since been revoked.
  url="$(resolve_url_via_metrics "$port" || true)"
  [[ -z "$url" ]] && url="$(url_from_log "$name")"

  if [[ -z "$pid" ]]; then
    log "$name: no process -> starting"
    start_tunnel "$name" "$port"; return
  fi

  # Proactive refresh: recreate before Cloudflare revokes it.
  if (( age > MAX_AGE_SECONDS )); then
    log "$name: age ${age}s exceeds ${MAX_AGE_SECONDS}s -> refreshing BEFORE it is revoked"
    kill "$pid" 2>/dev/null || true
    sleep 3
    start_tunnel "$name" "$port"; return
  fi

  # Reactive repair: the process is alive but the URL may be dead.
  if [[ -n "$url" ]]; then
    code="$(probe_url "${url}${path}")"
    if [[ "$code" != "200" ]]; then
      log "$name: URL returned $code (revoked/unreachable) -> restarting"
      kill "$pid" 2>/dev/null || true
      sleep 3
      start_tunnel "$name" "$port"; return
    fi
    log "$name: healthy (age $((age / 60))m, HTTP 200)"
  else
    log "$name: process alive but no URL in log yet (age $((age / 60))m)"
  fi
}

sync_frontend_build() {
  # VITE_API_BASE is compiled into the bundle. If the backend URL changed, the
  # deployed frontend points at a dead API, so rebuild.
  local backend_url bundle_base
  backend_url="$(cat "$TUNNEL_DIR/backend.url" 2>/dev/null || true)"
  [[ -z "$backend_url" ]] && return
  bundle_base="$(cat frontend/dist/.api_base 2>/dev/null || true)"
  if [[ "$backend_url" != "$bundle_base" ]]; then
    log "backend URL changed -> rebuilding frontend against $backend_url"
    ( cd frontend && VITE_API_BASE="$backend_url" npx vite build >/dev/null 2>&1 ) \
      && printf '%s' "$backend_url" > frontend/dist/.api_base \
      && log "frontend rebuilt" \
      || log "frontend rebuild FAILED - run ./scripts/demo_up.sh"
  fi
}

log "starting (refresh at ${MAX_AGE_SECONDS}s, check every ${CHECK_INTERVAL}s)"
log "leave this running while you demo"

while true; do
  ensure_tunnel backend "$BACKEND_PORT" "/health"
  ensure_tunnel frontend "$FRONTEND_PORT" "/"
  sync_frontend_build

  if (( ONCE == 1 )); then
    echo
    echo "  DEMO URL: $(cat "$TUNNEL_DIR/frontend.url" 2>/dev/null || echo '(unavailable)')"
    break
  fi
  sleep "$CHECK_INTERVAL"
done
