"""
core/config.py

PURPOSE
-------
Defines the Settings class, which loads every configuration value
(database URL, JWT secrets, etc.) from my .env file into a single,
typed-checked Python object.

WHY NOT JUST USE os.getenv() EVERYWHERE?
----------------------------------------
1.  Centralization: every other file imports the same 'settings' object
    below, instead of each file independently reading environnment
    variables. One source of truth.
2.  Fail fast: if a REQUIRED value (like database_url) is missing from
    .env, the app refures to start immediately, with a clear error
    pointig at the missing key, instead of failing later, mid-request,
    with a confusing database error.
3.  Type safety: declaring 'database_url: str' means Pydantic checks the
    value is actually a string. If you later add 'port: int' and someone
    puts letters in .env by mistake, you get an error at startup, not a
    crash buried three request later.
"""

from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ##-----------------------------------------------------------------
    ## Each attribute name below is matched (case-insensitivity) to a
    ## key in your .env file. E.g., 'database_url' here reads the
    ## DATABASE_URL line from .env.
    ##-----------------------------------------------------------------

    ## Full Neon Postgres connection string. No default value given,
    ## that makes it REQUIRED. The app will not start without it.
    database_url: str

    ## JWT signing secret. REQUIRED (no default): a weak or missing secret
    ## would let anyone forge tokens. Generate via `openssl rand -hex 32`.
    ## Do not reuse across environments.
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    ## Switches behaviour between local development and production:
    ## - "development": relaxed for local HTTP (e.g. non-secure cookies,
    ##   verbose errors, docs enabled).
    ## - "production": hardened (Secure cookies, generic errors, docs off).
    ## - "staging": pre-production smoke environment; hardened EXACTLY like
    ##   "production" (Secure cookies + docs off + boot guard). Added to satisfy
    ##   the Week-4 Day-3 blueprint and to keep staging parity with prod.
    ## - "testing": used by the automated CI pipeline. Hardened like production
    ##   (docs off, generic errors) but WITHOUT Secure cookies (the test client
    ##   speaks plain HTTP) and WITHOUT HSTS.
    ## Restricted to these exact values so typos can't silently disable
    ## production security controls.
    environment: Literal["development", "production", "staging", "testing"] = "development"

    ## Which frontend origins are allowed to call this API
    cors_origins: str = "http://localhost:8000"

    ## --- Transactional email (Week 2, Day 4) ---
    ## Provider: "resend" (primary). API key + sender come from .env.
    ## Missing/blank api_key = emails are gracefully skipped (no-op), so local
    ## dev works without a live provider.
    email_provider: str = "resend"
    email_api_key: str = ""
    email_from: str = "onboarding@varsitycompanion.co.za"

    ## --- POPIA hard-purge (Week 2, Day 5) ---
    ## Soft-deleted accounts older than this many days are eligible for
    ## physical erasure. Env key: POPIA_RETENTION_DAYS.
    popia_retention_days: int = 30

    ## --- Distributed-infrastructure readiness (Week-2, architect feedback) ---
    ## When set (e.g. "redis://host:6379/0"), slowapi uses a shared Redis
    ## backend for rate-limit counters so limits hold across multiple
    ## horizontal instances. None (default) = in-memory (single instance).
    ## NOTE: production images must include the `limits[redis]` extra.
    redis_url: str | None = None

    ## True (default) writes structured logs to a rotating local file in
    ## addition to stdout. Set False in containers/orchestrated deployments
    ## where stdout is captured centrally (no writable local disk).
    log_to_file: bool = True

    ## --- AI summary engine (Month 2, Week 1) ---
    ## Provider: Google Gemini REST API, called over plain httpx (no SDK).
    ## Missing/blank gemini_api_key = summary generation is gracefully refused
    ## BEFORE quota is deducted or a cache row is written (see ai_service).
    gemini_api_key: str = ""
    # "gemini-flash-latest" is Google's maintained alias for the current
    # low-cost flash model, so we stay on the cheap tier without pinning a
    # version that deprecates out from under us (gemini-1.5-flash etc. have
    # already been removed from the API).
    gemini_model: str = "gemini-flash-latest"
    gemini_endpoint: str = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "{model}:generateContent"
    )

    ## Output budget for generated study guides.
    ## The old hard-coded value was 512, which cut structured guides off
    ## mid-sentence and made summaries feel thin. 3072 leaves room for several
    ## sections, a worked example and a self-test while staying inside the
    ## free tier's per-request limits.
    summary_max_output_tokens: int = 3072
    ## Factual but explanatory. Too low produced flat bullet lists; too high
    ## risks invented detail in a study context.
    summary_temperature: float = 0.6

    ## RAG retrieval mode for "Chat with your brief".
    ## False (default): deterministic KEYWORD retrieval — no extra network call,
    ## no extra cost, and citations still work when the LLM is unavailable.
    ## True: semantic retrieval via embeddings (needs the embedding model below
    ## and populated `brief_chunks.embedding`). The column already exists, so
    ## this can be switched on without a schema change.
    rag_embedding_enabled: bool = False
    gemini_embedding_model: str = "text-embedding-004"

    # Deep-link base URL for module sharing. NOT used by the backend (the
    # client constructs the link); documented here so the contract guide and
    # the client team agree on the URL shape.
    share_link_base_url: str = "https://varsitycompanion.co.za"

    ##-----------------------------------------------------------------
    ## DERIVED SECURITY MODE
    ##-----------------------------------------------------------------
    @property
    def is_hardened(self) -> bool:
        """True for any non-local mode (production, staging, CI/testing).

        Controls the strict posture: interactive docs off and verbose error
        detail suppressed. Local development is the only relaxed mode.
        """
        return self.environment != "development"

    @property
    def cookie_secure(self) -> bool:
        """Whether auth cookies carry the `Secure` attribute.

        Secure cookies are only ever TRANSMITTED over HTTPS, so this is tied to
        HTTPS-terminated modes: production AND staging. The CI pipeline and
        local runs drive the app over plain HTTP (`http://testserver`); marking
        cookies Secure there means the client never sends them back and every
        authenticated test would 401.
        """
        return self.environment in ("production", "staging")

    @property
    def docs_enabled(self) -> bool:
        """Interactive API docs are available in local development only."""
        return self.environment == "development"

    @property
    def hsts_enabled(self) -> bool:
        """Emit Strict-Transport-Security — only on HTTPS-terminated modes.

        Production and staging sit behind TLS; development (plain HTTP) and
        testing (test client over http) must NOT send HSTS.
        """
        return self.environment in ("production", "staging")

    @property
    def requires_boot_guard(self) -> bool:
        """True where a weak JWT secret must refuse startup (prod + staging)."""
        return self.environment in ("production", "staging")

    ##-----------------------------------------------------------------
    ## BOOT-TIME VALIDATION (Week 4, Day 3)
    ##-----------------------------------------------------------------
    ## A known-weak secret in production/staging would let anyone forge tokens.
    ## This denylist + minimum length causes Settings() construction to raise at
    ## import, i.e. the app refuses to boot, rather than running insecurely.
    ## (See tests/test_production_config.py.)
    _WEAK_JWT_DEFAULTS = frozenset(
        {
            "ci-testing-super-secret-key-min-32-chars",
            "ci-testing-super-secret-key-min-32-chars-long",
            "your-secret-key-here",
            "your-super-secret-key-change-this-in-production",
            "local-docker-dev-super-secret-key-min-32-chars",
            "local-docker-development-super-secret-key-32chars",
        }
    )

    @model_validator(mode="after")
    def _validate_jwt_secret_strength(self) -> "Settings":
        """Refuse weak JWT secrets in production/staging.

        Runs after all fields are parsed, so `self.environment` is the
        validated Literal value. A known-weak or too-short secret in a
        production/staging deploy makes Settings() construction raise, i.e.
        the app refuses to boot rather than running insecurely.
        """
        if self.requires_boot_guard:
            if len(self.jwt_secret_key) < 32:
                raise ValueError(
                    f"Insecure JWT_SECRET_KEY for {self.environment}: "
                    "must be at least 32 chars."
                )
            if self.jwt_secret_key in self._WEAK_JWT_DEFAULTS:
                raise ValueError(
                    f"Insecure JWT_SECRET_KEY for {self.environment}: "
                    "value matches a known default."
                )
        return self

    ##-----------------------------------------------------------------
    ## model_config tells pydantic-settings WHERE to look for the .env
    ## file, and to silently ignore any extra keys in .env that aren't
    ## declared as attributes above (rather than crashing on them).
    ##-----------------------------------------------------------------
    model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore",
        )
## Created ONCE, at import time. Every other file in the app imports this
## exact 'settings' object rather than creating its own Settings()
## instance, this guarantees .env is only read once, and every part of
## the app sees identical, consistent configuration.
settings = Settings()
