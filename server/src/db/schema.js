/**
 * Dialect-aware DDL.
 *
 * Only three things actually differ between SQLite and Postgres here:
 * auto-increment syntax, the `IF NOT EXISTS` support on indexes (both have it),
 * and how you ask a table what columns it has.
 *
 * Timestamps are TEXT holding ISO-8601 UTC strings in both dialects, and are
 * always supplied by the application rather than a database default. That
 * removes `datetime('now')` vs `now()` from the picture entirely, keeps the
 * value byte-identical across drivers, and means the client never has to guess
 * at a timezone.
 */

export function schemaSql(dialect) {
  const id = dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'

  return [
    `CREATE TABLE IF NOT EXISTS users (
      id            ${id},
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      business_name TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL DEFAULT 'owner',
      credits       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS preferences (
      user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      voice_name     TEXT    NOT NULL DEFAULT '',
      language       TEXT    NOT NULL DEFAULT 'en-US',
      accent         TEXT    NOT NULL DEFAULT 'en-US',
      tone           TEXT    NOT NULL DEFAULT 'warm',
      rate           REAL    NOT NULL DEFAULT 1.0,
      pitch          REAL    NOT NULL DEFAULT 1.0,
      greeting       TEXT    NOT NULL DEFAULT '',
      business_hours TEXT    NOT NULL DEFAULT 'Mon-Fri 9am-6pm',
      services       TEXT    NOT NULL DEFAULT '[]',
      escalate_to    TEXT    NOT NULL DEFAULT '',
      barge_in       INTEGER NOT NULL DEFAULT 0,
      updated_at     TEXT    NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS calls (
      id           ${id},
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      caller_name  TEXT    NOT NULL DEFAULT 'Unknown caller',
      caller_phone TEXT    NOT NULL DEFAULT '',
      transport    TEXT    NOT NULL DEFAULT 'browser',
      direction    TEXT    NOT NULL DEFAULT 'inbound',
      status       TEXT    NOT NULL DEFAULT 'live',
      intent       TEXT    NOT NULL DEFAULT '',
      sentiment    TEXT    NOT NULL DEFAULT '',
      summary      TEXT    NOT NULL DEFAULT '',
      action_items TEXT    NOT NULL DEFAULT '[]',
      duration_ms  INTEGER NOT NULL DEFAULT 0,
      credits_used INTEGER NOT NULL DEFAULT 0,
      provider     TEXT    NOT NULL DEFAULT '',
      started_at   TEXT    NOT NULL,
      ended_at     TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_calls_user ON calls (user_id, started_at)`,

    `CREATE TABLE IF NOT EXISTS turns (
      id         ${id},
      call_id    INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      role       TEXT    NOT NULL,
      text       TEXT    NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_turns_call ON turns (call_id, id)`,

    `CREATE TABLE IF NOT EXISTS appointments (
      id            ${id},
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      call_id       INTEGER REFERENCES calls(id) ON DELETE SET NULL,
      title         TEXT    NOT NULL,
      customer_name TEXT    NOT NULL DEFAULT '',
      starts_at     TEXT    NOT NULL,
      duration_min  INTEGER NOT NULL DEFAULT 30,
      status        TEXT    NOT NULL DEFAULT 'confirmed',
      notes         TEXT    NOT NULL DEFAULT '',
      created_at    TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_appt_user ON appointments (user_id, starts_at)`,

    `CREATE TABLE IF NOT EXISTS credit_ledger (
      id            ${id},
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta         INTEGER NOT NULL,
      reason        TEXT    NOT NULL,
      balance_after INTEGER NOT NULL,
      created_at    TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger (user_id, id)`,
  ]
}

/**
 * Additive migrations for databases created before a column existed.
 * Idempotent, so it is safe to run on every cold start.
 */
export const MIGRATIONS = [
  { table: 'preferences', column: 'barge_in', ddl: 'INTEGER NOT NULL DEFAULT 0' },
]
