import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchJson } from '../utils/api.js'

const AuthContext = createContext(null)

const API = '/api'

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authConfig, setAuthConfig] = useState({ passwordAuth: false, googleAuth: false })
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    const timeoutMs = 5000
    let done = false
    const timeoutId = setTimeout(() => {
      if (done) return
      done = true
      setLoading(false)
      setIsAuthenticated(true)
      setAuthEnabled(false)
    }, timeoutMs)
    try {
      const data = await fetchJson(`${API}/auth/me`)
      if (done) return
      done = true
      setIsAuthenticated(true)
      setAuthEnabled(data?.authEnabled ?? false)
      setUser(data?.user ?? null)
    } catch {
      if (done) return
      done = true
      setIsAuthenticated(false)
      setAuthEnabled(true)
      setUser(null)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await fetchJson(`${API}/auth/config`)
        setAuthConfig({
          passwordAuth: !!data?.passwordAuth,
          googleAuth: !!data?.googleAuth,
        })
      } catch {
        setAuthConfig({ passwordAuth: false, googleAuth: false })
      }
    }
    loadConfig()
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      setIsAuthenticated(false)
      setUser(null)
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (password) => {
    const data = await fetchJson(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setIsAuthenticated(true)
    setAuthEnabled(data?.authEnabled ?? true)
    setUser(null)
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetchJson(`${API}/auth/logout`, { method: 'POST' })
    } finally {
      setIsAuthenticated(false)
      setUser(null)
    }
  }, [])

  const googleSignInUrl = `${import.meta.env.VITE_API_URL || ''}/api/auth/google`

  return (
    <AuthContext.Provider value={{ isAuthenticated, authEnabled, authConfig, user, loading, login, logout, checkAuth, googleSignInUrl }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
