"""
app/core/logging_config.py

PURPOSE:
Sets up structured, secure, and rotating log files for the application.
Ensures PII and credentials (passwords, tokens) are automatically redacted
before being written to disk or stdout.

SECURITY DESIGN:
1. Rotating File Handler: Writes to `logs/app.log` up to 5MB, rotating with 5 backups.
2. PII Redaction: Custom Formatter detects and replaces sensitive values.
3. Correlation IDs: Logs include a trace identifier for debugging.
"""

import contextvars
import logging
import os
import re
from logging.handlers import RotatingFileHandler

# File-log paths. Created lazily in setup_logging() ONLY when file logging
# is enabled, so stdout-only container deployments never require a writable
# local disk at import time.
LOGS_DIR = "logs"
LOG_FILE_PATH = os.path.join(LOGS_DIR, "app.log")

# ContextVar to store the request-scoped correlation ID
correlation_id_ctx = contextvars.ContextVar("correlation_id", default="N/A")

# Sensitive keys to redact
SENSITIVE_KEYS = [
    "password",
    "access_token",
    "token",
    "secret",
    "jwt_secret_key",
    "authorization",
    "cookie",
]

# Regex patterns to redact sensitive values in standard formats (JSON, URL
# queries, key=value, key: value). Order matters: most specific first.
# NOTE: "token" would over-redact the word "token" inside unrelated strings,
# so the key word boundaries are anchored only for the dedicated key forms.
_REDACT_KEYS = "|".join(SENSITIVE_KEYS)

REDACTION_PATTERNS = [
    # JSON string value:   "password": "secret"   (single/any quote form)
    (
        re.compile(
            r'(["\'](?:' + _REDACT_KEYS + r')["\']\s*:\s*["\'])([^"\']+)(["\'])',
            re.IGNORECASE,
        ),
        r"\1[REDACTED]\3",
    ),
    # quoted value after '=':  password="secret" / password='secret' / token="x"
    (re.compile(r'(\b(?:' + _REDACT_KEYS + r')\b\s*=\s*["\'])([^"\']+)(["\'])', re.IGNORECASE),
     r'\1[REDACTED]\3'),
    # bare value after '=':  password=secret  (stops at space/&/,/;/quote)
    (re.compile(r'(\b(?:' + _REDACT_KEYS + r')\b\s*=\s*)([^\s&,;\'"]+)', re.IGNORECASE),
     r'\1[REDACTED]'),
    # colon form:  password: secret  /  "password": secret
    (re.compile(r'(["\']?(?:' + _REDACT_KEYS + r')["\']?\s*:\s*)([^\s,;\'"]{3,})', re.IGNORECASE),
     r'\1[REDACTED]'),
    # Bearer token:  Bearer eyJhbGci... (base64url alphabet)
    (re.compile(r'(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)', re.IGNORECASE),
     r'\1[REDACTED]'),
]



class PIIRedactingFormatter(logging.Formatter):
    """
    Custom formatter that redacts sensitive keys/values from the log record message.
    """

    def redact(self, msg: str) -> str:
        if not isinstance(msg, str):
            return msg
        for pattern, replacement in REDACTION_PATTERNS:
            msg = pattern.sub(replacement, msg)
        return msg

    def format(self, record: logging.LogRecord) -> str:
        # Inject correlation_id from contextvar if not already set or defaulted
        if not hasattr(record, "correlation_id") or record.correlation_id == "N/A":
            record.correlation_id = correlation_id_ctx.get()

        # Redact the message
        original_msg = record.msg
        if isinstance(record.msg, str):
            record.msg = self.redact(record.msg)

        # Redact any formatted arguments
        if record.args:
            new_args = []
            for arg in record.args:
                if isinstance(arg, str):
                    new_args.append(self.redact(arg))
                else:
                    new_args.append(arg)
            record.args = tuple(new_args)

        try:
            formatted = super().format(record)
        finally:
            # Restore original message to prevent side effects
            record.msg = original_msg

        return formatted


def setup_logging(environment: str, to_file: bool = True) -> None:
    """
    Configures standard (stdout) and optional rotating file loggers with the
    PII Redacting formatter.

    DISTRIBUTED (Week-2, architect feedback):
    `to_file=False` emits ONLY to stdout (no local disk dependency) for
    containerised / horizontally-scaled deployments where a central log
    collector captures stdout. Default True keeps the rotating local file
    for single-node development.
    """
    log_level = logging.INFO if environment == "development" else logging.WARNING

    # Define standard format with correlation ID
    log_format = "%(asctime)s - [%(correlation_id)s] - %(name)s - %(levelname)s - %(message)s"
    formatter = PIIRedactingFormatter(log_format)

    # 1. Console (Stdout) Handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)

    # Configure Root Logger
    root_logger = logging.getLogger()

    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)

    # 2. Rotating File Handler (5MB max size, 5 backups) — optional.
    if to_file:
        os.makedirs(LOGS_DIR, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_FILE_PATH,
            maxBytes=5 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(log_level)
        root_logger.addHandler(file_handler)

    # Set external libraries to quiet levels unless warning/error
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
