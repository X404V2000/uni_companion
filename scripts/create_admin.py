"""
scripts/create_admin.py

Out-of-band bootstrap for the first SUPERUSER/ADMIN account.

WHY A SCRIPT (architect Decision 2):
- Runs OUTSIDE the HTTP layer, so no public or even role-gated provisioning
  endpoint is exposed before RBAC is fully rolled out.
- Invokes the service layer directly, guaranteeing the same hashing/consent
  path as any other user creation.

Usage:
    python scripts/create_admin.py --email admin@example.com --password '...' \
        [--name "Admin User"] [--role superuser]
"""
import argparse
import getpass
import sys

from app.core.roles import UserRole
from app.db.session import SessionLocal
from app.schemas.user import UserCreate
from app.services import user_service


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an admin account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", default=None,
                        help="Omit to be prompted securely.")
    parser.add_argument("--name", default="Platform Administrator")
    parser.add_argument("--role", default=UserRole.SUPERUSER.value,
                        choices=[r.value for r in UserRole])
    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass("Password: ")
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.", file=sys.stderr)
        return 2

    role = UserRole(args.role)
    data = UserCreate(
        email=args.email,
        password=password,
        full_name=args.name,
        terms_version="1.0",
        privacy_version="1.0",
    )

    db = SessionLocal()
    try:
        user = user_service.create_user(db, data, role=role)
        print(f"Created {role.value} account: {user.email} (id={user.id})")
        return 0
    except user_service.DuplicateEmailError:
        print("ERROR: an account with that email already exists.", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
