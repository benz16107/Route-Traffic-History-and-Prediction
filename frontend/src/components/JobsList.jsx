import { useState, useEffect } from 'react'
import { fetchJson } from '../utils/api.js'
import { shortenToStreet } from '../utils/formatAddress.js'

const API = '/api'

export default function JobsList({ onSelectJob }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  const handleDelete = async (e, jobId) => {
    e.stopPropagation()
    if (!window.confirm('Delete this job and all its collected data? This cannot be undone.')) return
    setDeletingId(jobId)
    try {
      await fetchJson(`${API}/jobs/${jobId}`, { method: 'DELETE' })
      fetchJobs()
    } catch (err) {
      alert(err?.message || 'Failed to delete job')
    } finally {
      setDeletingId(null)
    }
  }

  const fetchJobs = async () => {
    try {
      const data = await fetchJson(`${API}/jobs`)
      setJobs(data)
    } catch (e) {
      console.error(e)
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="card card-loading"><span className="loading-text">Loading jobs...</span></div>

  if (jobs.length === 0) {
    return (
      <div className="routes-page">
        <h2>Routes</h2>
        <div className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
          <div className="empty-state">
            <div className="empty-state-icon">📍</div>
            <h3>No routes yet</h3>
            <p>Create a route to start collecting traffic data over time.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="routes-page">
      <h2>Routes</h2>
      <div className="routes-grid">
        {jobs.map(job => (
          <div
            key={job.id}
            className="card job-card route-tile"
            onClick={() => onSelectJob(job.id)}
          >
            <div className="route-tile-route">
              {shortenToStreet(job.start_location)}
              <span className="route-tile-arrow">→</span>
              {shortenToStreet(job.end_location)}
            </div>
            <div className="route-tile-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className={`route-tile-status status-badge status-${job.status}`}>{job.status}</span>
              <span className="route-tile-detail" style={{ flex: 1, minWidth: 0 }}>
                {(job.cycle_seconds ?? 0) > 0 ? `${job.cycle_seconds}s` : `${job.cycle_minutes ?? 60}m`} · {job.navigation_type}
              </span>
              <button
                className="btn btn-danger btn-delete-small"
                onClick={(e) => handleDelete(e, job.id)}
                disabled={deletingId === job.id}
                title="Delete this job"
              >
                {deletingId === job.id ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
