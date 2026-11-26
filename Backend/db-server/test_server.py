import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server


class LinkedInSignupTests(unittest.TestCase):
    def test_new_linkedin_user_is_persisted_with_unpaid_role(self):
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        server.migrate_schema(connection)

        user = server.create_linkedin_user(
            connection,
            {
                "identity": {
                    "linkedin_sub": "linkedin-sub-1",
                    "email": "ada@example.com",
                    "email_verified": True,
                    "name": "Ada Lovelace",
                    "given_name": "Ada",
                    "family_name": "Lovelace",
                },
                "password_hash": "scrypt-hash",
            },
        )

        self.assertEqual(user["role"], "unpaid")
        self.assertEqual(user["email"], "ada@example.com")
        self.assertEqual(user["password_hash"], "scrypt-hash")


if __name__ == "__main__":
    unittest.main()
