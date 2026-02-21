import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchJson } from '../utils/api.js'

const API = '/api'

export default function ProfilePage({ onBack }) {
  const { user, checkAuth, setUserFromResponse } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setError('')
    setMessage(null)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      const data = await fetchJson(`${API}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })
      setMessage('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      if (data?.user) setUserFromResponse(data.user)
      else await checkAuth()
    } catch (err) {
      setError(err?.message || 'Failed to change password.')
    } finally {
      setSubmitting(false)
    }
  }

  const displayName = user?.name?.trim() || user?.email || '—'
  const displayEmail = user?.email || '—'
  const canChangePassword = user?.hasPassword === true

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1 className="profile-title">Profile</h1>
        {onBack && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>
            ← Back
          </button>
        )}
      </div>

      <div className="card profile-card">
        <section className="profile-section">
          <h2 className="profile-section-title">Account</h2>
          <dl className="profile-dl">
            <dt className="profile-dt">Name</dt>
            <dd className="profile-dd">{displayName}</dd>
            <dt className="profile-dt">Email</dt>
            <dd className="profile-dd">{displayEmail}</dd>
          </dl>
        </section>

        {canChangePassword && (
          <section className="profile-section profile-section-password">
            <h2 className="profile-section-title">Change password</h2>
            <div className="profile-password-box">
              {message && <p className="profile-message" role="status">{message}</p>}
              {error && <p className="profile-error" role="alert">{error}</p>}
              <form onSubmit={handleChangePassword} className="profile-form">
                <div className="profile-form-group">
                  <label htmlFor="profile-current-password" className="auth-label">
                    Current password
                  </label>
                  <input
                    id="profile-current-password"
                    type="password"
                    className="auth-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="profile-form-group">
                  <label htmlFor="profile-new-password" className="auth-label">
                    New password
                  </label>
                  <input
                    id="profile-new-password"
                    type="password"
                    className="auth-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={submitting}
                    minLength={8}
                    required
                  />
                  <p className="auth-hint">At least 8 characters</p>
                </div>
                <div className="profile-form-group">
                  <label htmlFor="profile-confirm-password" className="auth-label">
                    Confirm new password
                  </label>
                  <input
                    id="profile-confirm-password"
                    type="password"
                    className="auth-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={submitting}
                    minLength={8}
                    required
                  />
                </div>
                <div className="profile-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {!canChangePassword && user?.email && (
          <section className="profile-section">
            <p className="profile-google-only">This account uses Google sign-in. Password cannot be changed here.</p>
          </section>
        )}
      </div>
    </div>
  )
}
