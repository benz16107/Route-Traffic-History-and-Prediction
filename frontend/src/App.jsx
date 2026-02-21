import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import JobsList from './components/JobsList'
import RouteWizard from './components/RouteWizard'
import JobDetail from './components/JobDetail'
import LoginPage from './components/LoginPage'
import { useAuth } from './context/AuthContext'
import './App.css'

function pathToState(pathname) {
  if (pathname === '/routes') return { view: 'routes', selectedJobId: null }
  if (pathname === '/new') return { view: 'new', selectedJobId: null }
  const jobMatch = pathname.match(/^\/job\/([^/]+)$/)
  if (jobMatch) return { view: 'detail', selectedJobId: jobMatch[1] }
  return { view: 'dashboard', selectedJobId: null }
}

function AppContent() {
  const [view, setView] = useState(() => pathToState(window.location.pathname).view)
  const [selectedJobId, setSelectedJobId] = useState(() => pathToState(window.location.pathname).selectedJobId)

  useEffect(() => {
    const onPop = () => {
      const { view: v, selectedJobId: id } = pathToState(window.location.pathname)
      setView(v)
      setSelectedJobId(id ?? null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goTo = (v) => {
    setView(v)
    if (v !== 'detail') setSelectedJobId(null)
    const path = v === 'dashboard' ? '/' : v === 'routes' ? '/routes' : v === 'new' ? '/new' : ''
    if (path !== '') window.history.pushState({}, '', path)
  }

  const openRoute = (id) => {
    setSelectedJobId(id)
    setView('detail')
    window.history.pushState({}, '', `/job/${id}`)
  }

  return (
    <>
      <Header view={view} onNavigate={goTo} />
      <main className="main">
        {view === 'dashboard' && (
          <Dashboard
            onSelectRoute={openRoute}
            onNewRoute={() => goTo('new')}
            onViewAllRoutes={() => goTo('routes')}
          />
        )}
        {view === 'routes' && (
          <JobsList onSelectJob={openRoute} />
        )}
        {view === 'new' && (
          <RouteWizard
            onCreated={(id) => openRoute(id)}
            onCancel={() => goTo('dashboard')}
          />
        )}
        {view === 'detail' && selectedJobId != null && (
          <JobDetail
            jobId={selectedJobId}
            onBack={() => goTo('routes')}
            onFlipRoute={(id) => { setSelectedJobId(id) }}
            onDeleted={() => goTo('routes')}
          />
        )}
        {view === 'detail' && selectedJobId == null && (
          <div className="card card-compact">
            <p className="job-empty-msg">No route selected.</p>
            <button className="btn btn-primary" onClick={() => goTo('routes')}>View routes</button>
          </div>
        )}
      </main>
    </>
  )
}

class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(err) { return { hasError: true, error: err } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app" style={{ padding: '2rem' }}>
          <p style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Something went wrong.</p>
          <pre style={{ fontSize: '0.875rem', overflow: 'auto', maxHeight: '200px' }}>{this.state.error?.message}</pre>
          <button className="btn btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="app auth-loading">
        <span className="loading-text">Loading…</span>
      </div>
    )
  }
  if (!isAuthenticated) {
    return (
      <div className="app">
        <LoginPage />
      </div>
    )
  }
  return (
    <div className="app">
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </div>
  )
}
