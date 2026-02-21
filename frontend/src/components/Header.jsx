import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

export default function Header({ view, onNavigate }) {
  const { theme, setTheme } = useTheme()
  const { authEnabled, logout } = useAuth()

  return (
    <header className="site-header">
      <div className="header-inner">
        <a href="/" className="header-brand" onClick={(e) => { e.preventDefault(); onNavigate('dashboard') }} aria-label="RouteWatch home">
          <span className="header-logo" aria-hidden>◇</span>
          <span className="header-title">RouteWatch</span>
        </a>
        <nav className="header-nav" aria-label="Main">
          <button
            type="button"
            className={`header-link ${view === 'dashboard' ? 'is-active' : ''}`}
            onClick={() => onNavigate('dashboard')}
          >
            Home
          </button>
          <button
            type="button"
            className={`header-link ${view === 'routes' || view === 'detail' ? 'is-active' : ''}`}
            onClick={() => onNavigate('routes')}
          >
            Routes
          </button>
          <button
            type="button"
            className={`header-link header-link-cta ${view === 'new' ? 'is-active' : ''}`}
            onClick={() => onNavigate('new')}
          >
            New route
          </button>
        </nav>
        <div className="header-actions">
          {authEnabled && (
            <button type="button" className="header-link header-link-logout" onClick={logout}>
              Sign out
            </button>
          )}
          <div className="theme-toggle" role="group" aria-label="Theme">
            <button
              type="button"
              className={`theme-btn ${theme === 'light' ? 'is-active' : ''}`}
              onClick={() => setTheme('light')}
              title="Light"
              aria-pressed={theme === 'light'}
            >
              <span aria-hidden>☀</span>
            </button>
            <button
              type="button"
              className={`theme-btn ${theme === 'dark' ? 'is-active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Dark"
              aria-pressed={theme === 'dark'}
            >
              <span aria-hidden>☾</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
