import { useState, useEffect } from 'react'
import { fetchJson } from '../utils/api.js'
import { shortenToStreet } from '../utils/formatAddress.js'

const API = '/api'

export default function Dashboard({ onSelectRoute, onNewRoute, onViewAllRoutes }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson(`${API}/jobs`)
        setJobs(Array.isArray(data) ? data : [])
      } catch {
        setJobs([])
      } finally {
        setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const totalSnapshots = jobs.reduce((sum, j) => {
    // We'd need snapshot count per job - approximate from job data if available
    return sum
  }, 0)

  const recentJobs = jobs.slice(0, 6)
  const runningCount = jobs.filter(j => j.status === 'running').length

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-hero skeleton" />
        <div className="dashboard-stats skeleton" style={{ height: 80 }} />
        <div className="dashboard-grid skeleton" style={{ minHeight: 200 }} />
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1>Track how traffic changes over time</h1>
        <p>Set a route, choose how often to check, and watch travel times build a history.</p>
        <button className="btn btn-hero" onClick={onNewRoute}>
          <span className="btn-hero-icon">+</span>
          Track a new route
        </button>
      </div>

      {jobs.length > 0 && (
        <div className="dashboard-stats">
          <div className="stat-pill">
            <span className="stat-pill-value">{jobs.length}</span>
            <span className="stat-pill-label">Routes</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-value">{runningCount}</span>
            <span className="stat-pill-label">Collecting now</span>
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>{jobs.length === 0 ? 'Get started' : 'Your routes'}</h2>
          {jobs.length > 6 && onViewAllRoutes && (
            <button type="button" className="btn btn-ghost" onClick={onViewAllRoutes}>
              View all {jobs.length} →
            </button>
          )}
        </div>
        {jobs.length === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-visual">
              <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 40 L50 20 L90 40 L110 60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
                <circle cx="10" cy="40" r="4" fill="currentColor" opacity="0.6"/>
                <circle cx="50" cy="20" r="4" fill="currentColor" opacity="0.4"/>
                <circle cx="90" cy="40" r="4" fill="currentColor" opacity="0.4"/>
                <circle cx="110" cy="60" r="6" fill="currentColor" opacity="0.8"/>
              </svg>
            </div>
            <p>No routes yet. Track your first route to see how traffic varies.</p>
            <button className="btn btn-primary" onClick={onNewRoute}>
              Track your first route
            </button>
          </div>
        ) : (
          <div className="dashboard-grid">
            {recentJobs.map(job => (
              <div
                key={job.id}
                className="route-tile"
                onClick={() => onSelectRoute(job.id)}
              >
                <div className="route-tile-route">
                  {shortenToStreet(job.start_location)}
                  <span className="route-tile-arrow">→</span>
                  {shortenToStreet(job.end_location)}
                </div>
                <div className="route-tile-meta">
                  <span className={`route-tile-status status-${job.status}`}>{job.status}</span>
                  <span className="route-tile-detail">
                    {(job.cycle_seconds ?? 0) > 0 ? `${job.cycle_seconds}s` : `${job.cycle_minutes ?? 60}m`} · {job.navigation_type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
