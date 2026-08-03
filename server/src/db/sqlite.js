import fs from 'node:fs'
import path from 'node:path'

/**
 * SQLite driver.
 *
 * Synchronous underneath, wrapped in the same async interface as Postgres so
 * route handlers are written once. This is what makes `git clone && npm run
 * dev` work with no database to install and no connection string to find.
 */
export async function createSqlite({ file }) {
  const { default: Database } = await import('better-sqlite3')

  const dir = path.dirname(file)
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true })

  const conn = new Database(file)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')

  const exec = (sql, params = []) => {
    const stmt = conn.prepare(sql)
    // better-sqlite3 refuses .run() on anything that returns rows, which
    // includes INSERT ... RETURNING. `reader` tells us which to call.
    if (stmt.reader) return { rows: stmt.all(...params) }
    const info = stmt.run(...params)
    return { rows: [], changes: info.changes, lastId: Number(info.lastInsertRowid) }
  }

  return {
    dialect: 'sqlite',
    async run(sql, params) { return exec(sql, params) },
    async all(sql, params) { return exec(sql, params).rows },
    async get(sql, params) { return exec(sql, params).rows[0] },
    async exec(sql) { conn.exec(sql) },

    /**
     * SQLite work is synchronous, so a plain BEGIN/COMMIT pair is safe here.
     * Nothing genuinely asynchronous may happen inside the callback.
     */
    async tx(fn) {
      conn.exec('BEGIN')
      try {
        const result = await fn({
          run: async (sql, params) => exec(sql, params),
          all: async (sql, params) => exec(sql, params).rows,
          get: async (sql, params) => exec(sql, params).rows[0],
        })
        conn.exec('COMMIT')
        return result
      } catch (err) {
        conn.exec('ROLLBACK')
        throw err
      }
    },

    async columns(table) {
      return conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
    },

    async close() { conn.close() },
  }
}
