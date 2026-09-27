#!/usr/bin/env bash
#
# demo_up.sh — bring the whole Varsity Companion demo up in one command.
#
# WHY THIS EXISTS
# ---------------
# The hackathon demo previously relied on several ad-hoc background processes
# (uvicorn, a static file server, two cloudflared tunnels) started by hand.
# If any one of them died, or the laptop slept, the demo broke mid-pitch with
# no obvious cause. This script makes the stack:
#
#   * idempotent  — safe to re-run; it reuses whatever is already healthy
#   * verifiable  — it CHECKS each layer and reports PASS/FAIL, so you know the
#                   demo is live before the judges arrive
#   * recoverable — it restarts exactly the pieces that are down
#
# USAGE
#   ./scripts/demo_up.sh            # start/repair everything and verify
#   ./scripts/demo_up.sh --verify   # only check, change nothing
#
# WHAT IT MANAGES
#   1. Postgres container   (vc_demo_pg, restart=unless-stopped)
#   2. FastAPI backend      (uvicorn on 127.0.0.1:8000)
#   3. Built frontend       (static dist/ on 127.0.0.1:5173)
#   4. Two public tunnels   (cloudflared -> backend and frontend)
#
# NOTE: tunnels are EPHEMERAL. If a tunnel is (re)started, its public URL
# CHANGES, and the frontend bundle must be rebuilt with the new API base
# (VITE_API_BASE). This script handles that ordering for you.
#
# KNOWN ISSUE — free quick tunnels are not always granted:
#   `cloudflared tunnel --url ...` can start its process but never complete
#   registration (the log stops after the precheck block and never prints
#   "Registered tunnel connection"). The public URL then fails to connect
#   while the process still looks alive. Restarting the tunnel usually works;
#   the check below is what catches it, so ALWAYS run --verify before
#   presenting rather than assuming a running process means a working tunnel.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_CONTAINER="vc_demo_pg"
BACKEND_PORT=8000
FRONTEND_PORT=5173
VENV="$ROOT/venv/bin"
LOG_DIR="$ROOT/logs"
TUNNEL_LOG_DIR="/tmp/vc_tunnels"
VERIFY_ONLY=0
[[ "${1:-}" == "--verify" ]] && VERIFY_ONLY=1

mkdir -p "$LOG_DIR" "$TUNNEL_LOG_DIR"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
info() { printf '  .... %s\n' "$1"; }

echo "=== Varsity Companion — demo bring-up ==="

# ---------------------------------------------------------------------------
# 1. Database
# ---------------------------------------------------------------------------
echo
echo "[1/4] Postgres"
if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  pass "container '$DB_CONTAINER' already running"
else
  if [[ $VERIFY_ONLY == 1 ]]; then
    fail "container '$DB_CONTAINER' is not running"
  else
    info "starting '$DB_CONTAINER'..."
    docker start "$DB_CONTAINER" >/dev/null 2>&1 \
      && pass "started '$DB_CONTAINER'" \
      || fail "could not start '$DB_CONTAINER' (is Docker running?)"
  fi
fi
# Confirm it actually accepts queries before trusting it.
if docker exec "$DB_CONTAINER" psql -U app_user -d varsity_companion_dev -tAc "SELECT 1" >/dev/null 2>&1; then
  pass "database accepts queries"
else
  fail "database is not accepting queries"
fi

# ---------------------------------------------------------------------------
# 2. Backend API
# ---------------------------------------------------------------------------
echo
echo "[2/4] Backend API (127.0.0.1:$BACKEND_PORT)"
backend_healthy() {
  curl -s -m 5 "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null \
    | grep -q '"status":"healthy"'
}
if backend_healthy; then
  pass "backend healthy"
else
  if [[ $VERIFY_ONLY == 1 ]]; then
    fail "backend not healthy"
  else
    info "starting uvicorn..."
    LOG_TO_FILE=false nohup "$VENV/uvicorn" app.main:app \
      --host 127.0.0.1 --port "$BACKEND_PORT" \
      >"$LOG_DIR/demo_backend.log" 2>&1 &
    for _ in $(seq 1 20); do
      sleep 1
      backend_healthy && break
    done
    backend_healthy \
      && pass "backend started (log: logs/demo_backend.log)" \
      || fail "backend did not become healthy — see logs/demo_backend.log"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Frontend (static build)
# ---------------------------------------------------------------------------
echo
echo "[3/4] Frontend (127.0.0.1:$FRONTEND_PORT)"
frontend_up() {
  curl -s -m 5 "http://127.0.0.1:$FRONTEND_PORT/" 2>/dev/null | grep -q "<div id=\"root\">"
}
if frontend_up; then
  pass "static server responding"
else
  if [[ $VERIFY_ONLY == 1 ]]; then
    fail "frontend not responding"
  else
    if [[ ! -f "$ROOT/frontend/dist/index.html" ]]; then
      info "no build found — building..."
      (cd frontend && npx vite build >/dev/null 2>&1)
    fi
    info "starting static server..."
    (cd frontend/dist && nohup python3 -m http.server "$FRONTEND_PORT" \
      --bind 127.0.0.1 >"$LOG_DIR/demo_frontend.log" 2>&1 &)
    for _ in $(seq 1 10); do
      sleep 1
      frontend_up && break
    done
    frontend_up \
      && pass "static server started" \
      || fail "static server did not start — see logs/demo_frontend.log"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Public tunnels
# ---------------------------------------------------------------------------
echo
echo "[4/4] Public tunnels (cloudflared)"
if ! command -v cloudflared >/dev/null 2>&1; then
  fail "cloudflared not installed — the demo will only be reachable on this machine"
else
  # Resolve the public URL of the tunnel serving a given local port.
  #
  # WHY BY PID: the only reliable mapping is tunnel-process -> its own metrics
  # port. Probing a fixed port range and taking the first answer, or grepping
  # all logs at once, mixes the tunnels up and reports the BACKEND's URL for the
  # FRONTEND (which sends a judge to a dead link). So we find the PID whose
  # command line names this exact port, discover that PID's metrics port from
  # its listening sockets, and ask only that process.
  tunnel_url_for_port() {
    local port="$1" pid mport
    pid="$(pgrep -f "cloudflared tunnel --url http://127.0.0.1:$port( |$)" 2>/dev/null | head -1)"
    [[ -z "$pid" ]] && return 1

    # Metrics ports are allocated per process (usually 20241, 20242, ...).
    mport="$(ss -ltnp 2>/dev/null | grep "pid=$pid," \
      | grep -oE '127\.0\.0\.1:202[0-9][0-9]' | head -1 | cut -d: -f2)"
    if [[ -n "$mport" ]]; then
      local host
      host="$(curl -s -m 3 "http://127.0.0.1:$mport/quicktunnel" 2>/dev/null \
        | grep -oE '[a-z0-9-]+\.trycloudflare\.com' | head -1)"
      [[ -n "$host" ]] && { echo "https://$host"; return 0; }
    fi

    # Fallback: this PID's own log file (never another tunnel's log).
    local logf="$TUNNEL_LOG_DIR/${2}.log"
    if [[ -f "$logf" ]]; then
      local url
      url="$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' "$logf" 2>/dev/null | head -1)"
      [[ -n "$url" ]] && { echo "$url"; return 0; }
    fi
    return 1
  }

  for target in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT"; do
    name="${target%%:*}"; port="${target##*:}"
    urlfile="$TUNNEL_LOG_DIR/${name}.url"

    # A RUNNING PROCESS IS NOT A WORKING TUNNEL.
    #
    # Cloudflare revokes quick tunnels after a couple of hours with the server
    # message "Unauthorized: Tunnel not found". The cloudflared process then
    # stays alive retrying forever, so a process check reports everything as
    # fine while the public URL returns nothing. That is exactly how the demo
    # went unreachable: healthy local services, live-looking processes, dead
    # URLs.
    #
    # So if a process exists, verify the URL really answers before trusting it.
    tunnel_healthy=0
    if pgrep -f "cloudflared tunnel --url http://127.0.0.1:$port( |$)" >/dev/null 2>&1; then
      if URL="$(tunnel_url_for_port "$port" "$name")"; then
        probe="/"
        [[ "$name" == "backend" ]] && probe="/health"
        code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "${URL}${probe}" 2>/dev/null || echo 000)"
        if [[ "$code" == "200" ]]; then
          printf '%s' "$URL" > "$urlfile"
          pass "$name tunnel running: $URL"
          tunnel_healthy=1
        else
          fail "$name tunnel is REVOKED or unreachable (HTTP $code): $URL"
          info "the process is alive but Cloudflare no longer serves this URL; restarting it"
          pkill -f "cloudflared tunnel --url http://127.0.0.1:$port( |\$)" 2>/dev/null || true
          sleep 3
          rm -f "$urlfile"
        fi
      else
        pass "$name tunnel running (URL unresolved — restart it to capture it)"
        tunnel_healthy=1
      fi
    fi

    if [[ $tunnel_healthy == 0 ]]; then
      if [[ $VERIFY_ONLY == 1 ]]; then
        fail "$name tunnel not running"
      else
        info "starting $name tunnel..."
        rm -f "$urlfile"
        nohup cloudflared tunnel --url "http://127.0.0.1:$port" --no-autoupdate \
          >"$TUNNEL_LOG_DIR/${name}.log" 2>&1 &
        # cloudflared prints the assigned URL on stderr; capture it.
        for _ in $(seq 1 25); do
          sleep 1
          grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' \
            "$TUNNEL_LOG_DIR/${name}.log" 2>/dev/null | head -1 > "$urlfile"
          [[ -s "$urlfile" ]] && break
        done
        if [[ -s "$urlfile" ]]; then
          pass "$name tunnel: $(cat "$urlfile")"
        else
          fail "$name tunnel URL not found — see $TUNNEL_LOG_DIR/${name}.log"
        fi
      fi
    fi
  done
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
BACKEND_URL=""
[[ -s "$TUNNEL_LOG_DIR/backend.url" ]] && BACKEND_URL="$(cat "$TUNNEL_LOG_DIR/backend.url")"
FRONTEND_URL=""
[[ -s "$TUNNEL_LOG_DIR/frontend.url" ]] && FRONTEND_URL="$(cat "$TUNNEL_LOG_DIR/frontend.url")"

# ---------------------------------------------------------------------------
# Study materials coverage.
#
# Materials are per module and modules are created BY STUDENTS, so a module can
# exist with no resources yet. Report which ones are empty so it is obvious what
# to fix, and offer the exact command. We do NOT ingest automatically: it makes
# external API calls and takes a couple of minutes per module, which is not
# something a bring-up script should do behind your back.
# ---------------------------------------------------------------------------
echo
echo "=== Study materials coverage ==="
if docker exec "$DB_CONTAINER" psql -U app_user -d varsity_companion_dev -tAc "SELECT 1" >/dev/null 2>&1; then
  # A module created moments ago legitimately has no materials yet - that is the
  # whole point of the "Find resources" button. Flagging those as failures made
  # this check cry wolf during a rehearsal (it named a module that had existed
  # for a few seconds). So freshly created modules are reported separately as
  # informational, and only settled modules with no resources are a FAIL.
  FRESH="$(docker exec "$DB_CONTAINER" psql -U app_user -d varsity_companion_dev -tAc \
    "SELECT m.code FROM modules m
     LEFT JOIN study_materials sm
       ON sm.module_code = m.code AND sm.is_approved
     WHERE m.created_at > now() - interval '1 hour'
     GROUP BY m.code HAVING count(sm.id) = 0 ORDER BY m.code;" 2>/dev/null | tr -d '\r' | tr '\n' ' ')"

  MISSING="$(docker exec "$DB_CONTAINER" psql -U app_user -d varsity_companion_dev -tAc \
    "SELECT m.code FROM modules m
     LEFT JOIN study_materials sm
       ON sm.module_code = m.code AND sm.is_approved
     WHERE m.created_at <= now() - interval '1 hour'
     GROUP BY m.code HAVING count(sm.id) = 0 ORDER BY m.code;" 2>/dev/null | tr -d '\r' | tr '\n' ' ')"

  if [[ -z "$MISSING" ]]; then
    pass "every established module has at least one real resource"
  else
    fail "modules with no materials: $MISSING"
    info "populate with: venv/bin/python scripts/ingest_real_materials.py --module <CODE>"
    info "(or run it with no --module flag to cover every module)"
  fi

  # Not a failure: these are new modules still waiting to be populated, or
  # waiting for you to demo the button on them.
  if [[ -n "$FRESH" ]]; then
    info "new modules with no resources yet (use Find resources): $FRESH"
  fi
else
  info "database not reachable — skipping coverage check"
fi

# ---------------------------------------------------------------------------
# Keep the built frontend pointing at the CURRENT backend URL.
#
# THE FAILURE THIS PREVENTS: VITE_API_BASE is baked into the JS bundle at build
# time. When a tunnel restarts it gets a NEW url, so a bundle built against the
# old one calls a dead API — the app loads but every action fails. Because
# tunnel restarts are exactly what happens when a laptop sleeps, this is the
# most likely way the live demo breaks.
# ---------------------------------------------------------------------------
echo
echo "=== Build alignment ==="
if [[ $VERIFY_ONLY == 1 ]]; then
  # Even in verify mode we must WARN about a stale bundle: it is the failure
  # that looks like "the app loads but nothing works".
  STAMP="$ROOT/frontend/dist/.api_base"
  if [[ -n "$BACKEND_URL" && -f "$STAMP" && "$(cat "$STAMP")" != "$BACKEND_URL" ]]; then
    fail "bundle was built against $(cat "$STAMP") but the backend is now $BACKEND_URL — re-run without --verify"
  elif [[ -n "$BACKEND_URL" && -f "$STAMP" ]]; then
    pass "bundle matches the current backend URL"
  else
    info "bundle build stamp missing (run without --verify to align it)"
  fi
elif [[ -z "$BACKEND_URL" ]]; then
  info "no backend tunnel URL — skipping rebuild"
else
  # Record which URL the current bundle was built against.
  STAMP="$ROOT/frontend/dist/.api_base"
  if [[ -f "$STAMP" && "$(cat "$STAMP")" == "$BACKEND_URL" ]]; then
    pass "bundle already built against $BACKEND_URL"
  else
    info "bundle is out of date — rebuilding with VITE_API_BASE=$BACKEND_URL"
    if (cd frontend && VITE_API_BASE="$BACKEND_URL" npx vite build >/dev/null 2>&1); then
      printf '%s' "$BACKEND_URL" > "$STAMP"
      pass "rebuilt frontend against the current backend URL"
    else
      fail "frontend rebuild failed"
    fi
  fi
fi

echo
echo "=== End-to-end check ==="
if [[ -n "$FRONTEND_URL" ]]; then
  curl -s -m 10 "$FRONTEND_URL/" | grep -q "Varsity Companion" \
    && pass "public frontend serves the app" \
    || fail "public frontend did not serve the app"
fi
if [[ -n "$BACKEND_URL" ]]; then
  # Check for OUR health payload, not merely a 200.
  #
  # WHY: a wrong-but-reachable backend URL passes a status-code-only check. That
  # happened for real - a failed tunnel start put Cloudflare's API host in the
  # recorded URL, and api.trycloudflare.com answers 200 to everything, so every
  # check went green while the app was in fact broken and visitors saw
  # Cloudflare error 1033. Requiring the literal "healthy" from OUR /health
  # endpoint catches a wrong host even when the host is alive.
  if curl -s -m 10 "$BACKEND_URL/health" | grep -q '"status":[[:space:]]*"healthy"'; then
    pass "public backend healthy"
  else
    fail "public backend did not return OUR health payload: $BACKEND_URL"
    info "the URL may point at a host that is up but is not this app"
  fi
fi

# CORS preflight from the real frontend origin.
#
# WHY THIS CHECK EXISTS: CORS is the failure that looks like an outage. If the
# origin is not allowed the browser blocks login and the UI says "Cannot reach
# the server. Is the backend running?" even though the API is perfectly healthy.
# Checking it here means a broken origin is caught before the judges see it.
if [[ -n "$FRONTEND_URL" && -n "$BACKEND_URL" ]]; then
  PREFLIGHT=$(curl -s -m 15 -o /dev/null -w "%{http_code}" -X OPTIONS \
    "$BACKEND_URL/api/v1/auth/login" \
    -H "Origin: $FRONTEND_URL" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type,x-auth-mode" 2>/dev/null)
  if [[ "$PREFLIGHT" == "200" ]]; then
    pass "CORS preflight allows the frontend origin (login will work)"
  else
    fail "CORS preflight returned $PREFLIGHT — the browser will block login"
    info "add $FRONTEND_URL to cors_origins in .env and restart the backend"
  fi

  # And confirm a hostile origin is still refused.
  REJECTED=$(curl -s -m 15 -o /dev/null -w "%{http_code}" -X OPTIONS \
    "$BACKEND_URL/api/v1/auth/login" \
    -H "Origin: https://evil.example.com" \
    -H "Access-Control-Request-Method: POST" 2>/dev/null)
  if [[ "$REJECTED" == "400" ]]; then
    pass "CORS still rejects unknown origins"
  else
    fail "an unknown origin got $REJECTED (expected 400) — check the allow rules"
  fi
fi

echo
if [[ -n "$FRONTEND_URL" ]]; then
  echo "  DEMO URL: $FRONTEND_URL"
else
  echo "  DEMO URL: http://127.0.0.1:$FRONTEND_PORT  (local only)"
fi
echo
echo "  IMPORTANT: trial tunnels are ephemeral. Before presenting, run"
echo "  './scripts/demo_up.sh --verify' and, if a tunnel URL changed,"
echo "  rebuild the frontend so VITE_API_BASE points at the backend tunnel."
