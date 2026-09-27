"""Alembic migration environment.

Wires Alembic to:
  - our SQLAlchemy Base.metadata (so `--autogenerate` sees our models), and
  - the Neon connection string from app settings (never hard-coded).

Run from the repo root:  `python -m alembic upgrade head`
"""
from logging.config import fileConfig
import os
import sys

# Ensure `app` package is importable regardless of CWD.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.session import Base

# Import models so their tables register on Base.metadata.
import app.models  # noqa: F401  (executes models/__init__.py)

config = context.config

# Inject the DB URL from settings as a FALLBACK (never hard-coded in
# alembic.ini). If a caller explicitly sets sqlalchemy.url (e.g. the test
# harness pointing at the isolated *_test DB, or CI), respect that override
# and do NOT clobber it back to the dev URL.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a live DB)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
