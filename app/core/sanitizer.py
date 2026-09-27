"""
app/core/sanitizer.py

PURPOSE:
Provides strict string sanitization against Cross-Site Scripting (XSS),
HTML injection, and control character attacks.

SECURITY DECISIONS:
- Strips all HTML tags from user-supplied text inputs (names, fields of study).
- Converts special characters into HTML entities where needed.
- Rejects inputs containing embedded null bytes or control characters.

THREAT MODEL ADDRESSED:
- XSS via profile fields (full_name, university, field_of_study)
- HTML injection payloads designed to execute in another user's browser
- Control characters used for log injection / terminal escape sequence attacks
"""

import html
import re

# Regex matching any HTML tag (<script>, <iframe>, <img> with onerror, etc.)
HTML_TAG_REGEX = re.compile(r"<[^>]*?>")

# Regex matching dangerous control characters except standard whitespace
CONTROL_CHAR_REGEX = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


def sanitize_string(value: str | None) -> str | None:
    """
    Sanitizes user input strings to eradicate XSS payloads.

    Pipeline:
    1. Removes null bytes and dangerous control characters.
    2. Strips HTML tags.
    3. Trims whitespace.
    4. HTML-escapes remaining characters (&, <, >, ", ').
    """
    if value is None:
        return None

    # 1. Remove control characters & null bytes
    cleaned = CONTROL_CHAR_REGEX.sub("", value)

    # 2. Strip all HTML tags
    cleaned = HTML_TAG_REGEX.sub("", cleaned)

    # 3. Strip leading/trailing whitespace
    cleaned = cleaned.strip()

    # 4. Escape any remaining HTML characters
    cleaned = html.escape(cleaned, quote=True)

    return cleaned
