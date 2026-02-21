import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function SignUpPage() {
  const { register, authConfig, googleSignInUrl } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError === 'callback_error') setError('Something went wrong during sign-in. Try again or sign up with email.')
    else if (authError) setError('Sign-in was cancelled or invalid. Try again.')
    if (authError) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register(name, email, password)
    } catch (err) {
      setError(err?.message || 'Sign up failed')
    } finally {
      setSubmitting(false)
    }
  }

  const goToLogin = () => {
    window.history.pushState({}, '', '/login')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const showPassword = authConfig.passwordAuth
  const showGoogle = authConfig.googleAuth

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">RouteWatch</h1>
        <p className="auth-subtitle">Create an account</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {showGoogle && (
          <a href={googleSignInUrl} className="btn btn-google auth-google-btn">
            <span className="auth-google-icon" aria-hidden>G</span>
            Sign up with Google
          </a>
        )}
        {showPassword && (
          <>
            {showGoogle && <p className="auth-divider">or</p>}
            <form onSubmit={handleSubmit} className="auth-form">
              <label htmlFor="signup-name" className="auth-label">
                Name
              </label>
              <input
                id="signup-name"
                type="text"
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                autoFocus={!showGoogle}
                disabled={submitting}
              />
              <label htmlFor="signup-email" className="auth-label">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={submitting}
                required
              />
              <label htmlFor="signup-password" className="auth-label">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                minLength={8}
                required
              />
              <p className="auth-hint">At least 8 characters</p>
              <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </>
        )}
        {showPassword && (
          <p className="auth-footer">
            Already have an account?{' '}
            <button type="button" className="auth-link" onClick={goToLogin}>Log in</button>
          </p>
        )}
        {!showPassword && !showGoogle && (
          <p className="auth-error">No sign-in method configured on the server.</p>
        )}
      </div>
    </div>
  )
}
