import { createSqlite } from './sqlite.js'
import { createPostgres } from './postgres.js'
import { schemaSql, MIGRATIONS } from './schema.js'

/**
 * The single seam between the application and its database.
 *
 *   DATABASE_URL set    ->  Postgres   (Vercel, Neon, Supabase, anywhere)
 *   DATABASE_URL unset  ->  SQLite     (local dev, no setup at all)
 *
 * Route handlers only ever call `db.get` / `db.all` / `db.run` / `db.tx`, so
 * they are identical across both. SQL is written with `?` placeholders and the
 * Postgres driver rewrites them to $1..$n.
 */

let db = null
let ready = null

export const nowIso = () => new Date().toISOString()

/** Which driver *would* be used, without connecting. Handy for logging. */
export const targetDialect = () => (process.env.DATABASE_URL ? 'postgres' : 'sqlite')

/**
 * A health-check warning when the configuration cannot work.
 * Surfaced by GET /api/health so the problem is visible before a user hits it.
 */
export function configWarning() {
  if (!process.env.DATABASE_URL && isServerlessEnv()) {
    return 'DATABASE_URL is not set. Serverless filesystems are ephemeral, so SQLite will fail. Attach a Postgres database and redeploy.'
  }
  if (!process.env.JWT_SECRET) {
    return 'JWT_SECRET is not set — sessions are signed with a default development key. Set it before anyone real uses this.'
  }
  return null
}

const isServerlessEnv = () =>
  !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY)

/** True on Vercel, AWS Lambda, Netlify — anywhere the filesystem is ephemeral. */
const isServerless = () =>
  !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY)

async function connect() {
  const url = process.env.DATABASE_URL

  // Fail loudly rather than quietly writing to a disk that is read-only and
  // would vanish anyway. Silently "working" on ephemeral storage is a far
  // worse outcome than a clear error on the first request.
  if (!url && isServerless()) {
    throw new Error(
      'DATABASE_URL is not set. This is running on a serverless platform, where ' +
      'the filesystem is read-only outside /tmp and is wiped between invocations, ' +
      'so SQLite cannot be used. Add a Postgres database (on Vercel: Storage -> ' +
      'Create Database -> Neon, which injects DATABASE_URL for you), make sure it ' +
      'is connected to the Production environment, then redeploy.',
    )
  }

  const driver = url
    ? await createPostgres({ connectionString: url })
    : await createSqlite({ file: process.env.DB_PATH || './data/vera.db' })

  for (const statement of schemaSql(driver.dialect)) {
    await driver.exec(statement)
  }

  for (const { table, column, ddl } of MIGRATIONS) {
    const cols = await driver.columns(table)
    if (!cols.includes(column)) {
      await driver.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
      console.log(`[db] migrated: ${table}.${column}`)
    }
  }

  return driver
}

/**
 * Idempotent and safe to call on every request.
 *
 * On Vercel a function instance is reused across invocations while it stays
 * warm, so caching the promise means one connection per instance rather than
 * one per request.
 */
export function initDb() {
  if (!ready) {
    ready = connect().then((driver) => {
      db = driver
      return driver
    }).catch((err) => {
      ready = null // let the next request retry rather than wedging forever
      throw err
    })
  }
  return ready
}

/** Awaits the connection, then hands back the driver. */
export async function getDb() {
  return db || initDb()
}

/**
 * Express middleware: guarantees `req.db` exists before any handler runs.
 * This is what lets the route files stay ignorant of which driver is live.
 */
export async function withDb(req, _res, next) {
  try {
    req.db = await getDb()
    next()
  } catch (err) {
    next(err)
  }
}

/** Adjusts a balance and writes the ledger row atomically. */
export async function adjustCredits(driver, userId, delta, reason) {
  return driver.tx(async (t) => {
    const user = await t.get('SELECT credits FROM users WHERE id = ?', [userId])
    if (!user) throw new Error('no such user')
    const balance = Math.max(0, user.credits + delta)
    await t.run('UPDATE users SET credits = ? WHERE id = ?', [balance, userId])
    await t.run(
      'INSERT INTO credit_ledger (user_id, delta, reason, balance_after, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, delta, reason, balance, nowIso()],
    )
    return balance
  })
}

export async function closeDb() {
  if (db) await db.close()
  db = null
  ready = null
}
