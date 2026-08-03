import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TTL = '7d'

export const hashPassword = (plain) => bcrypt.hash(plain, 10)
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash)

export const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: TTL })

/**
 * Bearer-token auth.
 *
 * Tokens live in localStorage on the client, which is the pragmatic choice for
 * a demo. For production you'd move to an httpOnly + SameSite=Strict cookie so
 * XSS can't read the token — see the note in the README.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not signed in' })

  try {
    const claims = jwt.verify(token, SECRET)
    const user = await req.db.get(
      'SELECT id, email, name, business_name, role, credits FROM users WHERE id = ?',
      [claims.sub],
    )
    if (!user) return res.status(401).json({ error: 'Account no longer exists' })
    req.user = user
    next()
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired' })
    }
    next(err)
  }
}

/** Route guard for admin-only endpoints. */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Not permitted' })
