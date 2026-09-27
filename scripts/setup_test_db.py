"""One-time helper: create a dedicated Neon test database.

Connects to the maintenance 'postgres' database via the *direct* (non-pooler)
endpoint so CREATE DATABASE is permitted (pgBouncer in pooled mode blocks it).
"""
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine, text

from app.core.config import settings

TEST_DB_NAME = "varsity_companion_test"

p = urlparse(settings.database_url)
host = p.hostname.replace("-pooler.", ".")
userinfo = ""
if p.username:
    userinfo = p.username
    if p.password:
        userinfo += ":" + p.password
    userinfo += "@"
new_netloc = userinfo + host

direct_url = urlunparse(
    (p.scheme, new_netloc, "/postgres", p.params, p.query, p.fragment)
)
engine = create_engine(
    direct_url,
    pool_pre_ping=False,
    connect_args={"autocommit": True, "options": "-c statement_timeout=20000"},
)

with engine.connect() as conn:
    exists = conn.execute(
        text("SELECT 1 FROM pg_database WHERE datname=:d"), {"d": TEST_DB_NAME}
    ).scalar()
    if exists:
        print(f"test database '{TEST_DB_NAME}' already exists.")
    else:
        conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
        print(f"created test database '{TEST_DB_NAME}'")
