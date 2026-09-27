"""
core/legal.py

PURPOSE
-------
Holds the CURRENT versions of both legal documents users consent to:
1. Terms of Service (terms_version)
2. Privacy Policy (privacy_version)

WHY THIS EXISTS AS ITS OWN FILE
-------------------------------
Under POPIA, "consent" isn't a one-time checkbox that covers you forever.
If either document changes materially, users may need to re-consent.

By stamping every user's consent record with the SEPARATE versions they
agreed to (see models/user.py), you can always answer:
- "Which version of the Privacy Policy did this user agree to?"
- "Which version of the Terms did this user agree to?"

HOW TO USE THIS
---------------
Whenever either document changes, bump the respective version number
(e.g., "1.0" -> "1.1"). This is a manual, deliberate decision — it should
NOT change automatically or often.

SECURITY NOTE:
These are constants used at SIGNUP TIME to stamp the user's record.
They should NOT be user-controllable in any way.
"""

# Current version of the Terms of Service
CURRENT_TERMS_VERSION = "1.0"

# Current version of the Privacy Policy
CURRENT_PRIVACY_VERSION = "1.0"
