import React, { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import RouteMap from './RouteMap'
import EditJob from './EditJob'
import SnapshotDetail from './SnapshotDetail'
import { fetchJson } from '../utils/api.js'
import { shortenToStreet } from '../utils/formatAddress.js'

const API = '/api'

export default function JobDetail({ jobId, onBack, onFlipRoute, onDeleted }) {
  const [job, setJob] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [editing, setEditing] = useState(false)
  const [expandedSnapshotId, setExpandedSnapshotId] = useState(null)
  const [countdown, setCountdown] = useState(null)

  const fetchData = async () => {
    try {
      const [jobData, snapData] = await Promise.all([
        fetchJson(`${API}/jobs/${jobId}`),
        fetchJson(`${API}/jobs/${jobId}/snapshots`),
      ])
      setJob(jobData)
      setSnapshots(Array.isArray(snapData) ? snapData : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const pollMs = job?.status === 'running' ? 1000 : 5000
    const interval = setInterval(fetchData, pollMs)
    return () => clearInterval(interval)
  }, [jobId, job?.status])

  useEffect(() => {
    if (job?.status !== 'running' || !snapshots.length) {
      setCountdown(null)
      return
    }
    const sec = parseInt(job?.cycle_seconds, 10)
    const intervalSeconds = !Number.isNaN(sec) && sec > 0 ? sec : ((parseInt(job?.cycle_minutes, 10) || 60) * 60)
    const lastCollected = new Date(snapshots[snapshots.length - 1].collected_at).getTime()
    const nextAt = lastCollected + intervalSeconds * 1000

    const tick = () => {
      const left = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))
      setCountdown(left)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [job?.status, job?.cycle_seconds, job?.cycle_minutes, snapshots])

  const runAction = async (action) => {
    setActionLoading(action)
    try {
      const data = await fetchJson(`${API}/jobs/${jobId}/${action}`, { method: 'POST' })
      setJob(data)
      fetchData()
    } catch (e) {
      alert(e.message)
    } finally {
      setActionLoading('')
    }
  }

  const handleExport = (format) => {
    window.open(`${API}/jobs/${jobId}/export?format=${format}`, '_blank')
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this job and all its collected data? This cannot be undone.')) return
    setActionLoading('delete')
    try {
      await fetchJson(`${API}/jobs/${jobId}`, { method: 'DELETE' })
      onDeleted?.()
    } catch (e) {
      alert(e?.message || 'Failed to delete job')
    } finally {
      setActionLoading('')
    }
  }

  const handleCreateFlippedJob = async () => {
    if (!job) return
    setActionLoading('flip')
    try {
      const payload = {
        start_location: job.end_location,
        end_location: job.start_location,
        cycle_minutes: job.cycle_minutes ?? 60,
        cycle_seconds: job.cycle_seconds ?? 0,
        duration_days: job.duration_days ?? 7,
        navigation_type: job.navigation_type || 'driving',
        avoid_highways: !!job.avoid_highways,
        avoid_tolls: !!job.avoid_tolls,
      }
      const created = await fetchJson(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (created?.id && onFlipRoute) onFlipRoute(created.id)
    } catch (e) {
      alert(e?.message || 'Failed to create job')
    } finally {
      setActionLoading('')
    }
  }

  if (loading || !job) return <div className="card card-loading"><span className="loading-text">Loading job...</span></div>

  const primarySnapshots = snapshots.filter(s => (s.route_index ?? 0) === 0)
  const withDuration = primarySnapshots.filter(s => s.duration_seconds != null)
  const minDuration = withDuration.length ? Math.min(...withDuration.map(s => s.duration_seconds)) : null
  const maxDuration = withDuration.length ? Math.max(...withDuration.map(s => s.duration_seconds)) : null
  const minSnapshotId = minDuration != null ? withDuration.find(s => s.duration_seconds === minDuration)?.id : null
  const maxSnapshotId = maxDuration != null ? withDuration.find(s => s.duration_seconds === maxDuration)?.id : null

  const chartData = primarySnapshots
    .map(s => ({
      time: s.collected_at,
      formatted: new Date(s.collected_at).toLocaleString(),
      duration: s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time))

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-secondary btn-back" onClick={onBack}>
          ← Back
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                {shortenToStreet(job.start_location)}
                <span style={{ color: 'var(--accent)', margin: '0 0.35rem', fontWeight: 400 }}>→</span>
                {shortenToStreet(job.end_location)}
              </h2>
              <span className={`status-badge status-${job.status}`}>{job.status}</span>
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {(job.cycle_seconds ?? 0) > 0 ? `${job.cycle_seconds} sec` : `${job.cycle_minutes ?? 60} min`} cycle
              <span style={{ margin: '0 0.5rem', opacity: 0.5 }}>·</span>
              {job.duration_days} days
              <span style={{ margin: '0 0.5rem', opacity: 0.5 }}>·</span>
              {job.navigation_type}
              {job.avoid_highways && ' · Avoid highways'}
              {job.avoid_tolls && ' · Avoid tolls'}
            </div>
          </div>
          <div className="action-bar">
            {(job.status === 'pending' || job.status === 'completed') && (
              <button
                className="btn btn-success"
                onClick={() => runAction('start')}
                disabled={actionLoading}
              >
                {actionLoading === 'start'
                  ? (job.status === 'completed' ? 'Continuing...' : 'Starting...')
                  : (job.status === 'completed' ? 'Continue' : 'Start')}
              </button>
            )}
            {job.status === 'running' && (
              <button
                className="btn btn-warning"
                onClick={() => runAction('pause')}
                disabled={actionLoading}
              >
                {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
              </button>
            )}
            {job.status === 'paused' && (
              <>
                <button
                  className="btn btn-success"
                  onClick={() => runAction('resume')}
                  disabled={actionLoading}
                >
                  {actionLoading === 'resume' ? 'Resuming...' : 'Resume'}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => runAction('stop')}
                  disabled={actionLoading}
                >
                  {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
                </button>
              </>
            )}
            {job.status === 'running' && (
              <button
                className="btn btn-danger"
                onClick={() => runAction('stop')}
                disabled={actionLoading}
              >
                {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
              </button>
            )}
            {job.status !== 'running' && (
              <button
                className="btn btn-secondary"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleCreateFlippedJob}
              disabled={actionLoading}
              title="Create a new job with start and destination swapped"
            >
              {actionLoading === 'flip' ? 'Creating...' : 'New job (reverse route)'}
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('json')}>
              Export JSON
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
              Export CSV
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={actionLoading}
              title="Delete this job and all collected data"
            >
              {actionLoading === 'delete' ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <EditJob
          job={job}
          onSaved={(updated) => {
            setJob(updated)
            setEditing(false)
            fetchData()
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Embedded map */}
      <div className="card">
        <h3 style={{ margin: '0 0 1rem 0' }}>Route Map</h3>
        <RouteMap
          origin={job.start_location}
          destination={job.end_location}
          travelMode={job.navigation_type}
          avoidHighways={!!job.avoid_highways}
          avoidTolls={!!job.avoid_tolls}
          lastSnapshotAt={snapshots.length ? snapshots[snapshots.length - 1].collected_at : null}
        />
      </div>

      {/* Current cycle – live data from latest collection */}
      <div className="card current-cycle-card">
        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Current Cycle
          {job.status === 'running' && (
            <span className="live-badge">Live</span>
          )}
        </h3>
        {snapshots.length === 0 ? (
          <div className="empty-state">
            <p>{job.status === 'running' ? 'Collecting first data... Check backend console for errors.' : 'No data yet. Start the job to begin collecting.'}</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <span>Collected at {new Date(snapshots[snapshots.length - 1].collected_at).toLocaleString()}</span>
              {job.status === 'running' && countdown != null && (
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  Next cycle in {countdown}s
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
              {(() => {
                const latest = snapshots.filter(s => s.collected_at === snapshots[snapshots.length - 1].collected_at)
                const s = latest.find(x => (x.route_index ?? 0) === 0) || latest[0]
                return (
                  <div key={s.id} className="current-cycle-route">
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} min` : '—'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {s.distance_meters ? `${(s.distance_meters / 1000).toFixed(1)} km` : ''}
                    </div>
                  </div>
                )
              })()}
            </div>
          </>
        )}
      </div>

      {/* Collection status */}
      <div className="card">
        <h3>Collection Status</h3>
        <div className="stat-grid">
          <div className="stat-item">
            <div className="stat-label">Total snapshots</div>
            <div className="stat-value">{primarySnapshots.length}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Lowest time</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {minDuration != null ? `${Math.round(minDuration / 60)} min` : '—'}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Highest time</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>
              {maxDuration != null ? `${Math.round(maxDuration / 60)} min` : '—'}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Last collected</div>
            <div className="stat-value" style={{ fontSize: '1rem' }}>
              {snapshots.length
                ? new Date(snapshots[snapshots.length - 1].collected_at).toLocaleString()
                : '—'}
            </div>
          </div>
          {job.status === 'running' && countdown != null && (
            <div className="stat-item">
              <div className="stat-label">Next cycle in</div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>{countdown}s</div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline chart */}
        {chartData.length > 0 && (
        <div className="card">
          <h3 style={{ margin: '0 0 1rem 0' }}>Travel Time Over Time (minutes)</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="formatted" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line
                  type="monotone"
                  dataKey="duration"
                  name="Duration"
                  stroke="#539bf5"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="card">
        <h3 style={{ margin: '0 0 1rem 0' }}>Collected Data</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
          Click a row to view route map and turn-by-turn directions
        </p>
        {snapshots.length === 0 ? (
          <div className="empty-state">
            <p>No data collected yet. Start the job to begin collecting.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', width: 40 }} />
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Collected At</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Duration (min)</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Distance (km)</th>
                </tr>
              </thead>
              <tbody>
                {primarySnapshots
                  .slice(-50)
                  .reverse()
                  .map(s => {
                    const isMin = s.id === minSnapshotId
                    const isMax = s.id === maxSnapshotId
                    return (
                    <React.Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedSnapshotId(prev => prev === s.id ? null : s.id)}
                        style={{
                          borderBottom: expandedSnapshotId === s.id ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          background: expandedSnapshotId === s.id ? 'var(--surface)' : undefined,
                        }}
                      >
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ opacity: 0.7 }}>{expandedSnapshotId === s.id ? '▼' : '▶'}</span>
                        </td>
                        <td style={{ padding: '0.5rem' }}>{new Date(s.collected_at).toLocaleString()}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            {s.duration_seconds ? Math.round(s.duration_seconds / 60) : '—'}
                            {isMin && <span className="duration-badge duration-lowest">Lowest</span>}
                            {isMax && <span className="duration-badge duration-highest">Highest</span>}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          {s.distance_meters ? (s.distance_meters / 1000).toFixed(2) : '—'}
                        </td>
                      </tr>
                      {expandedSnapshotId === s.id && (
                        <tr key={`${s.id}-detail`}>
                          <td colSpan={4} style={{ padding: 0, verticalAlign: 'top' }}>
                            <SnapshotDetail snapshot={s} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    )
                  })}
              </tbody>
            </table>
            {primarySnapshots.length > 50 && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing last 50 of {primarySnapshots.length} snapshots
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
