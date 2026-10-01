# ============================================================================
# Varsity Companion API — Multi-Stage Production Image (Alpine-optimized)
# ============================================================================
# Strategy (Week 4, Day 2 + CI size-budget recovery):
#   * python:3.13-alpine (musl): ~15 MB base vs ~45 MB for slim. psycopg[binary]
#     and bcrypt ship musllinux wheels, so no compiler toolchain is needed.
#   * Plain `uvicorn` (no [standard] extra) — drops uvloop/httptools/watchfiles/
#     websockets (~20 MB) which a 2-worker production API does not need.
#   * Dependencies install straight into system Python (NO virtualenv). A venv
#     would duplicate the stdlib (~30 MB) on top of the base Python.
#   * A transient builder installs wheels, then the runtime stage copies ONLY
#     site-packages + app code. No pip, no compilers, no apk caches remain.
#   * Non-root `appuser` (OWASP least privilege).
#   * HEALTHCHECK hits the DB-aware /health probe.
# ============================================================================

# ------------------------------ Stage 1: builder ---------------------------
FROM python:3.13-alpine AS builder

# Force unbuffered stdout + no __pycache__.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install runtime wheels into a disposable prefix. psycopg[binary] + bcrypt
# provide musllinux wheels, so no build-base / libpq-dev are required.
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt \
    # Strip type stubs + bytecode caches (not needed at runtime; saves ~10-15 MB,
    # mostly from sqlalchemy's bundled .pyi files) — do it in the SAME layer so
    # the removed bytes never persist as an intermediate layer.
    && find /install -name '__pycache__' -type d -prune -exec rm -rf {} + \
    && find /install -name '*.pyi' -type f -delete \
    && find /install -name '*.pyc' -type f -delete

# ------------------------------ Stage 2: runtime ----------------------------
FROM python:3.13-alpine AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/install/lib/python3.13/site-packages \
    PATH=/install/bin:$PATH \
    LOG_TO_FILE=false

WORKDIR /app

# Non-root user (OWASP container security control).
RUN addgroup -g 1000 appuser && adduser -D -u 1000 -G appuser appuser \
    # Drop pip/setuptools (not needed at runtime) to reclaim space.
    && find /usr/local/lib/python3.13 -name 'pip*' -type d -prune -exec rm -rf {} + \
    && rm -rf /root/.cache /tmp/*

# Copy ONLY the installed site-packages (not a duplicated stdlib venv).
COPY --from=builder --chown=appuser:appuser /install /install
COPY --chown=appuser:appuser . /app
RUN chmod +x /app/scripts/docker_entrypoint.sh

USER appuser

EXPOSE 8000

# DB-aware liveness/readiness: /health runs SELECT 1, so 200 means the API AND
# its database are both reachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status==200 else 1)" || exit 1

# Two workers; pool settings sized for Neon free-tier (see day_2_report.md).
# Entrypoint applies migrations before serving, and honours $PORT (most free
# hosts inject the port to bind). See scripts/docker_entrypoint.sh for why both
# matter - running uvicorn directly here left a fresh database unmigrated.
CMD ["./scripts/docker_entrypoint.sh"]
