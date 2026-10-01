#!/bin/sh
# ============================================================================
# Container entrypoint.
#
# WHY THIS EXISTS
# ---------------
# The image previously ran uvicorn directly. Two things make that unsuitable for
# a hosted deployment, both of which would have failed at the worst moment:
#
#   1. NO MIGRATIONS. Nothing ever ran `alembic upgrade head`, so on a fresh
#      database the app would boot against an empty schema and every request
#      would fail with "relation does not exist". Locally the schema already
#      existed, which is exactly why this was never noticed.
#
#   2. HARDCODED PORT. The CMD pinned --port 8000. Most free hosts inject the
#      port to bind as $PORT and will consider the service unhealthy if it
#      listens anywhere else.
#
# Fail-fast on migrations is deliberate: if the schema cannot be brought up to
# date, starting the API would only serve errors, and a clear crash here is
# easier to diagnose than a running process that 500s on every route.
# ============================================================================
set -e

PORT="${PORT:-8000}"

# Invoked as a module rather than via the `alembic` console script: the
# dependencies live in /install/lib with no virtualenv, so the script in
# /install/bin is not necessarily on PATH. `python -m` resolves through
# PYTHONPATH and cannot miss.
echo "[entrypoint] applying database migrations..."
python -m alembic upgrade head

echo "[entrypoint] migrations applied; starting API on port ${PORT}"
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers "${WEB_CONCURRENCY:-2}"
