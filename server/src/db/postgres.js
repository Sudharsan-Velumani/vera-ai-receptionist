/**
 * Postgres driver.
 *
 * Uses `pg` against Neon's **pooled** connection string. That matters: a
 * serverless function can be cold-started hundreds of times, and one TCP
 * connection per instance will exhaust a Postgres server quickly. Neon's
 * PgBouncer endpoint (the host containing `-pooler`) absorbs that, so each
 * function keeps a pool of exactly one and lets the proxy do the multiplexing.
 *
 * Because it is plain `pg`, this works unchanged against Supabase, Render,
 * Railway or any other Postgres — not just Neon.
 */

let PoolFactory = null

/**
 * Test seam. `scripts/postgres.test.mjs` injects pg-mem's pg adapter so the
 * whole suite can run against the Postgres dialect without a live server.
 */
export function setPoolFactory(factory) {
  PoolFactory = factory
}

/** SQL is written once with `?`; Postgres wants $1..$n. */
function toDollarPlaceholders(sql) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

export async function createPostgres({ connectionString }) {
  let Pool = PoolFactory
  if (!Pool) {
    const pg = await import('pg')
    Pool = pg.default?.Pool ?? pg.Pool
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Neon and most hosted Postgres require TLS but present a chain Node does
    // not ship a root for. Local Postgres has no TLS at all.
    ...(/localhost|127\.0\.0\.1/.test(connectionString || '')
      ? {}
      : { ssl: { rejectUnauthorized: false } }),
  })

  const query = async (sql, params = []) => pool.query(toDollarPlaceholders(sql), params)

  return {
    dialect: 'postgres',
    async run(sql, params) {
      const res = await query(sql, params)
      return { rows: res.rows, changes: res.rowCount, lastId: res.rows?.[0]?.id }
    },
    async all(sql, params) { return (await query(sql, params)).rows },
    async get(sql, params) { return (await query(sql, params)).rows[0] },
    async exec(sql) { await pool.query(sql) },

    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const scoped = {
          run: async (sql, params = []) => {
            const r = await client.query(toDollarPlaceholders(sql), params)
            return { rows: r.rows, changes: r.rowCount, lastId: r.rows?.[0]?.id }
          },
          all: async (sql, params = []) => (await client.query(toDollarPlaceholders(sql), params)).rows,
          get: async (sql, params = []) => (await client.query(toDollarPlaceholders(sql), params)).rows[0],
        }
        const result = await fn(scoped)
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },

    async columns(table) {
      const rows = await pool.query(
        'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
        [table],
      )
      return rows.rows.map((r) => r.column_name)
    },

    async close() { await pool.end() },
  }
}
