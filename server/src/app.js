import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { providers } from './ai/index.js'
import { withDb, targetDialect, configWarning } from './db/index.js'
import authRoutes from './routes/auth.js'
import prefsRoutes from './routes/prefs.js'
import callRoutes from './routes/calls.js'
import apptRoutes from './routes/appointments.js'
import billingRoutes from './routes/billing.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Builds the Express app without starting a listener.
 *
 * Kept separate from index.js so the same app can be exported as a Vercel
 * serverless function (`api/index.js`) or listened on directly for local dev.
 */
export function createApp({ serveStatic = true } = {}) {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  // Health check doubles as introspection — the client reads this to show
  // "running offline" vs "Groq connected", and it names the live database.
  app.get('/api/health', (_req, res) => {
    const warning = configWarning()
    res.json({
      ok: !warning,
      providers: providers(),
      database: targetDialect(),
      ...(warning ? { warning } : {}),
      time: new Date().toISOString(),
    })
  })

  // Connects (or reuses) the database before any route handler runs.
  app.use('/api', withDb)

  app.use('/api/auth', authRoutes)
  app.use('/api/preferences', prefsRoutes)
  app.use('/api/calls', callRoutes)
  app.use('/api/appointments', apptRoutes)
  app.use('/api/billing', billingRoutes)

  // On Vercel the static client is served by the CDN, not by this function.
  // Locally, `npm run build && npm start` gives one process serving both.
  const dist = path.resolve(__dirname, '../../client/dist')
  if (serveStatic && fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }))

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[error]', err)
    res.status(err.status || 500).json({ error: err.message || 'Something went wrong' })
  })

  return app
}

export default createApp
