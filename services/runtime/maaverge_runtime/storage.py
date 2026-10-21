"""Small transactional SQLite store with an explicit initial migration."""

import json
import sqlite3
import threading
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path
from typing import Any


def now() -> str:
    return datetime.now(UTC).isoformat()


def serialized(method):
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        with self.lock:
            if method.__name__ != "close":
                if not self.lease.in_transaction:
                    raise RuntimeError("数据目录锁已失效，停止业务读写")
                self.lease.execute("SELECT 1")
            return method(self, *args, **kwargs)

    return wrapper


class Store:
    def __init__(self, root: Path):
        self.lock = threading.RLock()
        root.mkdir(parents=True, exist_ok=True)
        # Shared with the TypeScript service. The service itself owns the lease;
        # a helper process must never release it while the writer remains alive.
        self.lease = sqlite3.connect(
            root / ".runtime-lock.sqlite3", timeout=0, check_same_thread=False
        )
        try:
            mode = self.lease.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
            if mode != "delete":
                raise RuntimeError("无法建立数据目录独占锁")
            self.lease.execute("PRAGMA busy_timeout=0")
            self.lease.execute("BEGIN EXCLUSIVE")
        except Exception:
            self.lease.close()
            raise
        self.db = sqlite3.connect(root / "maaverge.sqlite3", check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
            INSERT OR IGNORE INTO migrations VALUES(1);
            CREATE TABLE IF NOT EXISTS objects(
              kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL,
              PRIMARY KEY(kind,id));
            CREATE TABLE IF NOT EXISTS events(
              id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
              message TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
        """)
        self.db.commit()

    @serialized
    def put(self, kind: str, ident: str, value: Any) -> None:
        with self.db:
            self.db.execute(
                "INSERT INTO objects VALUES(?,?,?) ON CONFLICT(kind,id) "
                "DO UPDATE SET value=excluded.value",
                (kind, ident, json.dumps(value, ensure_ascii=False)),
            )

    @serialized
    def get(self, kind: str, ident: str, default: Any = None) -> Any:
        row = self.db.execute(
            "SELECT value FROM objects WHERE kind=? AND id=?", (kind, ident)
        ).fetchone()
        return json.loads(row[0]) if row else default

    @serialized
    def all(self, kind: str) -> list[Any]:
        return [
            json.loads(row[0])
            for row in self.db.execute(
                "SELECT value FROM objects WHERE kind=? ORDER BY rowid", (kind,)
            )
        ]

    @serialized
    def delete(self, kind: str, ident: str) -> None:
        with self.db:
            self.db.execute("DELETE FROM objects WHERE kind=? AND id=?", (kind, ident))

    @serialized
    def event(self, event_type: str, message: str, data: dict | None = None) -> dict:
        timestamp, payload = now(), data or {}
        with self.db:
            cursor = self.db.execute(
                "INSERT INTO events(type,message,created_at,data) VALUES(?,?,?,?)",
                (event_type, message, timestamp, json.dumps(payload, ensure_ascii=False)),
            )
        return {
            "id": cursor.lastrowid,
            "type": event_type,
            "message": message,
            "createdAt": timestamp,
            "data": payload,
        }

    @serialized
    def events(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT id,type,message,created_at,data FROM events ORDER BY id DESC LIMIT 100"
        ).fetchall()
        return [
            {"id": r[0], "type": r[1], "message": r[2], "createdAt": r[3], "data": json.loads(r[4])}
            for r in reversed(rows)
        ]

    @serialized
    def close(self) -> None:
        try:
            self.db.close()
        finally:
            self.lease.close()
