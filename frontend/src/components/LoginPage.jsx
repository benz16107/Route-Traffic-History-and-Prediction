import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const { login, authConfig, googleSignInUrl } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError === 'invalid_callback') setError('Sign-in was cancelled or invalid. Try again.')
    else if (authError === 'token_exchange' || authError === 'userinfo') setError('Google Sign-In failed. Try again or use password.')
    if (authError) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(password)
    } catch (err) {
      setError(err?.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const showPassword = authConfig.passwordAuth
  const showGoogle = authConfig.googleAuth

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">RouteWatch</h1>
        <p className="auth-subtitle">Sign in to continue</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {showGoogle && (
          <a href={googleSignInUrl} className="btn btn-google auth-google-btn">
            <span className="auth-google-icon" aria-hidden>G</span>
            Sign in with Google
          </a>
        )}
        {showPassword && (
          <>
            {showGoogle && <p className="auth-divider">or</p>}
            <form onSubmit={handleSubmit} className="auth-form">
              <label htmlFor="auth-password" className="auth-label">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus={!showGoogle}
                disabled={submitting}
              />
              <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in with password'}
              </button>
            </form>
          </>
        )}
        {!showPassword && !showGoogle && (
          <p className="auth-error">No sign-in method configured. Set AUTH_PASSWORD or Google OAuth in .env.</p>
        )}
      </div>
    </div>
  )
}
