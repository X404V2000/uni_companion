"""scripts/reset_password.py

PURPOSE
-------
Help a locked-out student recover, from the terminal, with no email provider.

Two commands:

    # 1. Issue a recovery token for a student (they are locked out)
    python scripts/reset_password.py issue --email them@university.ac.za

    # 2. Promote an existing student to admin (one-off)
    python scripts/reset_password.py promote --email you@example.com

WHY THIS EXISTS
---------------
`create_admin.py` refuses when the account already exists, so a founder who
signed up as a student could not be made an admin - their own bootstrap path
was closed. And there was no way at all to help a student who forgot their
password, so the only outcome was "make a new account and lose your deadlines".

WHY IT PRINTS THE TOKEN TO THE TERMINAL
---------------------------------------
There is no email delivery and adding one costs money. The token is shown ONCE,
here, and stored only as a hash. Copy it and send it to the student by whatever
channel you already use - WhatsApp, SMS, in person. The security property is the
same as an email link: a one-time secret that only that student receives.

WHAT TO TELL THE STUDENT
------------------------
    Open <frontend>/reset?token=<token>
    It works once, and expires in 30 minutes.

TREAT THE TOKEN AS A PASSWORD
-----------------------------
Whoever holds it can set a new password for that account. Do not paste it into a
group chat; send it to the individual.
"""
from __future__ import annotations

import argparse
import sys


def _connect():
    """Build a session, with the same sys.path fix the other scripts use."""
    sys.path.insert(0, ".")
    from app.db.session import SessionLocal

    return SessionLocal()


def cmd_issue(db, email: str) -> int:
    from app.models.user import User
    from app.services import password_reset_service

    student = (
        db.query(User)
        .filter(User.email == email.strip().lower(), User.is_active.is_(True))
        .first()
    )
    if student is None:
        print(f"ERROR: no active account with email {email!r}.", file=sys.stderr)
        return 1

    raw = password_reset_service.issue_token(db, student, created_by=None)
    minutes = password_reset_service.TOKEN_LIFETIME_MINUTES

    print(f"\nRecovery token for {student.full_name} <{student.email}>")
    print(f"Valid for {minutes} minutes, single use.\n")
    print(f"    {raw}\n")
    print("Send this to that student only. Do not post it anywhere public.")
    print(f"Tell them to open:  <your-frontend-url>/reset?token={raw}")
    return 0


def cmd_promote(db, email: str, role: str) -> int:
    from app.models.user import User

    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if user is None:
        print(
            f"ERROR: no account with email {email!r}. Sign up first, then promote.",
            file=sys.stderr,
        )
        return 1

    previous = user.role
    user.role = role
    db.commit()
    print(f"{user.email}: role {previous} -> {role}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    issue = sub.add_parser("issue", help="issue a recovery token")
    issue.add_argument("--email", required=True)

    promote = sub.add_parser("promote", help="change an account's role")
    promote.add_argument("--email", required=True)
    promote.add_argument(
        "--role", default="admin", choices=["student", "admin", "superuser"]
    )

    args = parser.parse_args(argv)
    db = _connect()
    try:
        if args.command == "issue":
            return cmd_issue(db, args.email)
        return cmd_promote(db, args.email, args.role)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
