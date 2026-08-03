/**
 * Where the API lives.
 *
 * Relative by default — the client and API are one Vercel project, so `/api`
 * hits the serverless function on the same origin.
 *
 * Set VITE_API_URL to point at a separate backend (e.g. an Express server on
 * Render) if you would rather not run the API as a serverless function. The
 * server already sends permissive CORS headers.
 */
const BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '') + '/api'

// Guarded so the module can be imported outside a browser — prerendering,
// SSR, or a render test — without blowing up at import time.
const storage = typeof localStorage === 'undefined' ? null : localStorage

let token = storage?.getItem('vera.token') || null

export const setToken = (t) => {
  token = t
  if (!storage) return
  if (t) storage.setItem('vera.token', t)
  else storage.removeItem('vera.token')
}
export const getToken = () => token

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Getting HTML back from an /api path almost always means the API never
    // deployed and the SPA fallback served index.html instead. Say so, rather
    // than making the next person guess.
    const looksLikeHtml = text.trimStart().startsWith('<')
    throw new ApiError(
      looksLikeHtml
        ? `No API at ${BASE}${path} — the server returned an HTML page (HTTP ${res.status}). ` +
          `On Vercel this usually means the project's Root Directory points at a subfolder, ` +
          `so api/ was never deployed. Check /api/health.`
        : `Unexpected response from the server (HTTP ${res.status})`,
      res.status,
    )
  }

  if (!res.ok) {
    if (res.status === 401 && token) setToken(null)
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status)
  }
  return data
}

export const api = {
  health: () => request('/health'),

  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),

  getPreferences: () => request('/preferences'),
  savePreferences: (payload) => request('/preferences', { method: 'PUT', body: payload }),

  startCall: (payload) => request('/calls', { method: 'POST', body: payload }),
  sendTurn: (id, text) => request(`/calls/${id}/turn`, { method: 'POST', body: { text } }),
  endCall: (id, durationMs) => request(`/calls/${id}/end`, { method: 'POST', body: { durationMs } }),
  listCalls: () => request('/calls'),
  getCall: (id) => request(`/calls/${id}`),
  stats: () => request('/calls/stats'),

  appointments: (scope = 'upcoming') => request(`/appointments?scope=${scope}`),
  updateAppointment: (id, payload) => request(`/appointments/${id}`, { method: 'PATCH', body: payload }),

  packs: () => request('/billing/packs'),
  ledger: () => request('/billing/ledger'),
  purchase: (packId) => request('/billing/purchase', { method: 'POST', body: { packId } }),
}
