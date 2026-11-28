import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const res = await authApi.me()
      setUser(res.data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  /* Solange jemand angemeldet ist, das Zugangs-Cookie (15 min) rechtzeitig erneuern.
     Sonst laeden <img>-Cover nach einer Pause mit 401 - Bilder laufen nicht durch den
     axios-Interceptor. Beim Zurueckkehren in den Tab sofort, wenn es faellig ist. */
  useEffect(() => {
    if (!user) return undefined
    let zuletzt = Date.now()
    const erneuern = () => {
      zuletzt = Date.now()
      authApi.refresh().catch(() => {})
    }
    const takt = setInterval(erneuern, 10 * 60 * 1000)
    const sichtbar = () => {
      if (document.visibilityState === 'visible' && Date.now() - zuletzt > 5 * 60 * 1000) erneuern()
    }
    document.addEventListener('visibilitychange', sichtbar)
    return () => {
      clearInterval(takt)
      document.removeEventListener('visibilitychange', sichtbar)
    }
  }, [user])

  const login = async (username, password) => {
    const res = await authApi.login({ username, password })
    setUser(res.data)
    return res.data
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }

  const refreshUser = fetchMe

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
