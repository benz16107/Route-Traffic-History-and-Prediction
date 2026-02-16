import { useState } from 'react'
import CreateJob from './components/CreateJob'
import JobsList from './components/JobsList'
import JobDetail from './components/JobDetail'
import './App.css'

function App() {
  const [view, setView] = useState('list')
  const [selectedJobId, setSelectedJobId] = useState(null)

  const openJob = (id) => {
    setSelectedJobId(id)
    setView('detail')
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Route Traffic History & Prediction</h1>
        <nav>
          <button onClick={() => setView('list')} className={view === 'list' ? 'active' : ''}>
            Jobs
          </button>
          <button onClick={() => { setView('create'); setSelectedJobId(null); }} className={view === 'create' ? 'active' : ''}>
            New Job
          </button>
        </nav>
      </header>

      <main className="main">
        {view === 'list' && (
          <JobsList onSelectJob={openJob} />
        )}
        {view === 'create' && (
          <CreateJob onCreated={(id) => openJob(id)} onCancel={() => setView('list')} />
        )}
        {view === 'detail' && selectedJobId && (
          <JobDetail
            jobId={selectedJobId}
            onBack={() => setView('list')}
            onFlipRoute={(id) => setSelectedJobId(id)}
          />
        )}
      </main>
    </div>
  )
}

export default App
