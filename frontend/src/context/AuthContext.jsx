import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchJson } from '../utils/api.js'

const AuthContext = createContext(null)

const API = '/api'

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
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
    } catch {
      if (done) return
      done = true
      setIsAuthenticated(false)
      setAuthEnabled(true)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    const onUnauthorized = () => setIsAuthenticated(false)
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
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetchJson(`${API}/auth/logout`, { method: 'POST' })
    } finally {
      setIsAuthenticated(false)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ isAuthenticated, authEnabled, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
