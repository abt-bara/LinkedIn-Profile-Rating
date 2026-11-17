"""SQLite persistence and schema migration helpers for the private DB service."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parent
MIGRATIONS = ROOT / "migrations"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect(database_path: str) -> sqlite3.Connection:
    path = Path(database_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def migrate(database_path: str) -> None:
    conn = connect(database_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
        applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        for migration in sorted(MIGRATIONS.glob("[0-9][0-9][0-9]_*.sql")):
            version = int(migration.name.split("_", 1)[0])
            if version in applied:
                continue
            # executescript commits implicitly, so execute statements individually inside our transaction.
            script = migration.read_text(encoding="utf-8")
            for statement in script.split(";"):
                statement = statement.strip()
                if statement:
                    conn.execute(statement)
            conn.execute("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", (version, utc_now()))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def transaction(database_path: str, immediate: bool = True) -> Iterator[sqlite3.Connection]:
    conn = connect(database_path)
    try:
        conn.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_dict(row: sqlite3.Row | None):
    return dict(row) if row is not None else None
