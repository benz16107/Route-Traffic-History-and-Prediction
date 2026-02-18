export default function Sidebar({ view, onNavigate }) {
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
    </aside>
  )
}
