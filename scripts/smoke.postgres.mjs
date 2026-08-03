/**
 * Runs the full end-to-end smoke suite against the Postgres dialect.
 *
 *   npm run smoke:postgres
 *
 * Boots the real Express app backed by pg-mem in this process, then shells out
 * to the same smoke script used for SQLite. If both pass, the dialect port is
 * genuinely done — not just the driver, the whole HTTP surface.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { newDb } from 'pg-mem'
import { setPoolFactory } from '../server/src/db/postgres.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 4321

process.env.DATABASE_URL = 'postgres://pg-mem/vera'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const mem = newDb()
setPoolFactory(mem.adapters.createPg().Pool)

const { createApp } = await import('../server/src/app.js')
const { initDb } = await import('../server/src/db/index.js')

await initDb()

const server = createApp({ serveStatic: false }).listen(PORT, () => {
  console.log(`\n  \x1b[90mExpress on the Postgres dialect (pg-mem), port ${PORT}\x1b[0m`)

  const child = spawn(process.execPath, [path.join(here, 'smoke.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, API: `http://localhost:${PORT}/api` },
  })

  child.on('exit', (code) => {
    server.close()
    process.exit(code ?? 1)
  })
})
