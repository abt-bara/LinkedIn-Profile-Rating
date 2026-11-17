"""Service-token and database-backed actor authentication."""
from __future__ import annotations

import hmac
from dataclasses import dataclass


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class Actor:
    id: str
    role: str


def verify_service_token(header: str | None, expected: str) -> None:
    if not expected:
        raise AuthError(503, "Database service is not configured")
    scheme, _, supplied = (header or "").partition(" ")
    if scheme.lower() != "bearer" or not supplied or not hmac.compare_digest(supplied, expected):
        raise AuthError(401, "Invalid service credentials")


def load_actor(conn, actor_id: str | None, actor_role: str | None) -> Actor:
    if not actor_id or not actor_role:
        raise AuthError(401, "Actor context is required")
    row = conn.execute("SELECT id, role FROM users WHERE id = ?", (actor_id,)).fetchone()
    if row is None or row["role"] not in ("USER", "ADMIN"):
        raise AuthError(401, "Invalid actor context")
    if actor_role not in ("USER", "ADMIN") or not hmac.compare_digest(row["role"], actor_role):
        raise AuthError(401, "Invalid actor context")
    return Actor(row["id"], row["role"])


def require_admin(actor: Actor) -> None:
    if actor.role != "ADMIN":
        raise AuthError(403, "Administrator access required")
