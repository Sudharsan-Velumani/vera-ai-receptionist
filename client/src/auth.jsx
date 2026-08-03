import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, setToken, getToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session on boot. A stale token just resolves to signed-out.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(({ user, preferences }) => {
        setUser(user)
        setPreferences(preferences)
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo(
    () => ({
      user,
      preferences,
      loading,
      async login(payload) {
        const { token, user } = await api.login(payload)
        setToken(token)
        setUser(user)
        setPreferences(await api.getPreferences())
        return user
      },
      async signup(payload) {
        const { token, user } = await api.signup(payload)
        setToken(token)
        setUser(user)
        setPreferences(await api.getPreferences())
        return user
      },
      logout() {
        setToken(null)
        setUser(null)
        setPreferences(null)
      },
      setPreferences,
      /** Keeps the credit counter in the sidebar honest after a call or top-up. */
      patchUser: (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
    }),
    [user, preferences, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
