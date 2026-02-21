import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const { login, authConfig, googleSignInUrl } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError === 'invalid_callback') setError('Sign-in was cancelled or invalid. Try again.')
    else if (authError === 'token_exchange' || authError === 'userinfo') setError('Google Sign-In failed. Try again or use email and password.')
    else if (authError === 'callback_error') setError('Something went wrong during sign-in. Try again or use email and password.')
    if (authError) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
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
        <p className="auth-subtitle">Log in to access your routes</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {showGoogle && (
          <a href={googleSignInUrl} className="btn btn-google auth-google-btn">
            <span className="auth-google-icon" aria-hidden>G</span>
            Log in with Google
          </a>
        )}
        {showPassword && (
          <>
            {showGoogle && <p className="auth-divider">or</p>}
            <form onSubmit={handleSubmit} className="auth-form">
              <label htmlFor="auth-email" className="auth-label">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus={!showGoogle}
                disabled={submitting}
                required
              />
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
                disabled={submitting}
                required
              />
              <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
                {submitting ? 'Logging in…' : 'Log in'}
              </button>
            </form>
          </>
        )}
        {showPassword && (
          <p className="auth-footer">
            Don&apos;t have an account?{' '}
            <button type="button" className="auth-link" onClick={() => { window.history.pushState({}, '', '/signup'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Sign up</button>
          </p>
        )}
        {!showPassword && !showGoogle && (
          <p className="auth-error">No sign-in method configured on the server. Set Google OAuth (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET) in your deployment environment variables.</p>
        )}
      </div>
    </div>
  )
}
