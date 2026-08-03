/**
 * Catch-all for every nested API path (/api/auth/login, /api/calls/12, ...).
 *
 * Vercel maps this file to `/api/**` by filesystem convention, and `req.url`
 * arrives with the original path intact — which is what Express needs to route.
 * It re-exports the same handler as index.js, including its path normalisation.
 */
export { default } from './index.js'
