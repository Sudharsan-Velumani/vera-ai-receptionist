/**
 * Test harness: boots the real Express app against the Postgres dialect,
 * backed by pg-mem so no database server is needed.
 *
 *   node scripts/serve-postgres.mjs &   then   npm run smoke
 *
 * This is what proves the port at the HTTP level rather than the driver level:
 * the exact same smoke suite that runs against SQLite runs against Postgres.
 */
import { newDb } from 'pg-mem'
import { setPoolFactory } from '../server/src/db/postgres.js'

process.env.DATABASE_URL = 'postgres://pg-mem/vera'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const mem = newDb()
setPoolFactory(mem.adapters.createPg().Pool)

const { createApp } = await import('../server/src/app.js')
const { initDb } = await import('../server/src/db/index.js')

await initDb()

const port = Number(process.env.PORT) || 4000
createApp({ serveStatic: false }).listen(port, () =>
  console.log(`  Vera API on Postgres (pg-mem)  http://localhost:${port}`),
)
