import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import RouteMap from './RouteMap'
import EditJob from './EditJob'
import { fetchJson } from '../utils/api.js'

const API = '/api'

export default function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [editing, setEditing] = useState(false)

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

  if (loading || !job) return <div className="card">Loading...</div>

  const groups = snapshots.reduce((acc, s) => {
    const key = s.collected_at
    if (!acc[key]) acc[key] = {}
    acc[key][`route_${s.route_index}`] = s.duration_seconds ? Math.round(s.duration_seconds / 60) : null
    acc[key].time = s.collected_at
    acc[key].formatted = new Date(s.collected_at).toLocaleString()
    return acc
  }, {})
  const chartData = Object.values(groups).sort((a, b) => new Date(a.time) - new Date(b.time))

  const routeCount = Math.max(...snapshots.map(s => s.route_index), 0) + 1
  const colors = ['#58a6ff', '#3fb950', '#d29922']

  return (
    <div>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '1rem' }}>
        ← Back to Jobs
      </button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.5rem 0' }}>
              {job.start_location} → {job.end_location}
            </h2>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Cycle: {job.cycle_minutes} min • Duration: {job.duration_days} days • {job.navigation_type}
              {job.avoid_highways && ' • Avoid highways'}
              {job.avoid_tolls && ' • Avoid tolls'}
            </div>
            <span className={`status-badge status-${job.status}`} style={{ marginTop: '0.5rem', display: 'inline-block' }}>
              {job.status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {job.status === 'pending' && (
              <button
                className="btn btn-success"
                onClick={() => runAction('start')}
                disabled={actionLoading}
              >
                {actionLoading === 'start' ? 'Starting...' : 'Start'}
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
            <button className="btn btn-secondary" onClick={() => handleExport('json')}>
              Export JSON
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
              Export CSV
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
          additionalRoutes={job.additional_routes ?? 0}
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
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Collected at {new Date(snapshots[snapshots.length - 1].collected_at).toLocaleString()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
              {snapshots
                .filter(s => s.collected_at === snapshots[snapshots.length - 1].collected_at)
                .sort((a, b) => a.route_index - b.route_index)
                .map(s => (
                  <div key={s.id} className="current-cycle-route">
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Route {s.route_index + 1}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} min` : '—'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {s.distance_meters ? `${(s.distance_meters / 1000).toFixed(1)} km` : ''}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Collection status */}
      <div className="card">
        <h3 style={{ margin: '0 0 1rem 0' }}>Collection Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total snapshots</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{snapshots.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Routes tracked</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{routeCount}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Last collected</div>
            <div style={{ fontSize: '1rem' }}>
              {snapshots.length
                ? new Date(snapshots[snapshots.length - 1].collected_at).toLocaleString()
                : '—'}
            </div>
          </div>
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
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                <Legend />
                {Array.from({ length: routeCount }).map((_, i) => (
                  <Line
                    key={i}
                    type="monotone"
                    dataKey={`route_${i}`}
                    name={`Route ${i + 1}`}
                    stroke={colors[i % colors.length]}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="card">
        <h3 style={{ margin: '0 0 1rem 0' }}>Collected Data</h3>
        {snapshots.length === 0 ? (
          <div className="empty-state">
            <p>No data collected yet. Start the job to begin collecting.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Collected At</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Route</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Duration (min)</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Distance (km)</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.slice(-50).reverse().map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{new Date(s.collected_at).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>Route {s.route_index + 1}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {s.duration_seconds ? Math.round(s.duration_seconds / 60) : '—'}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {s.distance_meters ? (s.distance_meters / 1000).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshots.length > 50 && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing last 50 of {snapshots.length} snapshots
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
