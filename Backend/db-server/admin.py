"""Administrative CLI for safe first-admin provisioning."""
from __future__ import annotations

import argparse
import os
import uuid

from db import migrate, transaction, utc_now


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the DB or provision an administrator")
    parser.add_argument("--init-db", action="store_true", help="Apply local SQLite migrations")
    parser.add_argument("--provision-admin", action="store_true", help="Create or promote an account by LinkedIn subject")
    parser.add_argument("--linkedin-sub", help="Verified LinkedIn subject for the administrator")
    args = parser.parse_args()
    database = os.environ.get("DB_PATH", "./data/profile-rater.sqlite3")
    if args.init_db:
        migrate(database)
        print("Database initialized.")
    if args.provision_admin:
        if not args.linkedin_sub:
            parser.error("--provision-admin requires --linkedin-sub")
        migrate(database)
        with transaction(database) as conn:
            row = conn.execute("SELECT id FROM users WHERE linkedin_sub = ?", (args.linkedin_sub,)).fetchone()
            if row:
                conn.execute("UPDATE users SET role = 'ADMIN', updated_at = ? WHERE id = ?", (utc_now(), row["id"]))
                print("Existing account promoted to ADMIN.")
            else:
                user_id = str(uuid.uuid4())
                now = utc_now()
                conn.execute("INSERT INTO users(id, linkedin_sub, role, created_at, updated_at) VALUES (?, ?, 'ADMIN', ?, ?)", (user_id, args.linkedin_sub, now, now))
                print("Administrator account created. Complete the profile on next sign-in.")
    if not args.init_db and not args.provision_admin:
        parser.print_help()


if __name__ == "__main__":
    main()
