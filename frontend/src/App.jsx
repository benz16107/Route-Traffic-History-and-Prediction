import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import JobsList from './components/JobsList'
import RouteWizard from './components/RouteWizard'
import JobDetail from './components/JobDetail'
import './App.css'

export default function App() {
  const [view, setView] = useState('dashboard')
  const [selectedJobId, setSelectedJobId] = useState(null)

  const goTo = (v) => {
    setView(v)
    if (v !== 'detail') setSelectedJobId(null)
  }

  const openRoute = (id) => {
    setSelectedJobId(id)
    setView('detail')
  }

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={goTo} />
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
        {view === 'detail' && selectedJobId && (
          <JobDetail
            jobId={selectedJobId}
            onBack={() => goTo('routes')}
            onFlipRoute={(id) => { setSelectedJobId(id) }}
            onDeleted={() => goTo('routes')}
          />
        )}
      </main>
    </div>
  )
}
