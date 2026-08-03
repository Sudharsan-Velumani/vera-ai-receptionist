/**
 * Vercel serverless entry.
 *
 * Vercel can reach this function two different ways, and they disagree about
 * what `req.url` contains:
 *
 *   - filesystem routing via `api/[...path].js` -> the full original path,
 *     e.g. "/api/auth/signup"
 *   - a rewrite in vercel.json                  -> may arrive already stripped
 *     of the "/api" prefix, e.g. "/auth/signup"
 *
 * Express mounts its routers under "/api", so the second form 404s. Rather
 * than depend on which mechanism the platform picks, normalise the path here.
 * Cheap, and it removes an entire class of "works locally, 404s in prod".
 */
import { createApp } from '../server/src/app.js'

// The client is served as static files from Vercel's CDN, not by this function.
const app = createApp({ serveStatic: false })

export default function handler(req, res) {
  const url = req.url || '/'

  if (!url.startsWith('/api')) {
    req.url = url === '/' ? '/api' : `/api${url.startsWith('/') ? '' : '/'}${url}`
  }

  return app(req, res)
}
