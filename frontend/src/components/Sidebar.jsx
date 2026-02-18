import { useTheme } from '../context/ThemeContext'

export default function Sidebar({ view, onNavigate }) {
  const { theme, setTheme } = useTheme()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">◈</span>
        <span className="sidebar-title">Route Tracker</span>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-item ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <span className="sidebar-icon">⌂</span>
          <span>Dashboard</span>
        </button>
        <button
          className={`sidebar-item ${view === 'routes' || view === 'detail' ? 'active' : ''}`}
          onClick={() => onNavigate('routes')}
        >
          <span className="sidebar-icon">≡</span>
          <span>Routes</span>
        </button>
        <button
          className={`sidebar-item sidebar-item-primary ${view === 'new' ? 'active' : ''}`}
          onClick={() => onNavigate('new')}
        >
          <span className="sidebar-icon">+</span>
          <span>New route</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button
            type="button"
            className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
            title="Light mode"
          >
            ☀
          </button>
          <button
            type="button"
            className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
            title="Dark mode"
          >
            ☾
          </button>
        </div>
      </div>
    </aside>
  )
}
