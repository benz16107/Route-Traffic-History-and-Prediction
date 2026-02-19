import React, { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
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
  const [showActions, setShowActions] = useState(false)
  const [chartRange, setChartRange] = useState('24h')
  const [chartSegment, setChartSegment] = useState('1h')
  const [showAverageLine, setShowAverageLine] = useState(false)

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
    setShowActions(false)
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
    setShowActions(false)
    window.open(`${API}/jobs/${jobId}/export?format=${format}`, '_blank')
  }

  const handleDelete = async () => {
    setShowActions(false)
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
    setShowActions(false)
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

  if (loading || !job) return <div className="card card-loading card-compact"><span className="loading-text">Loading...</span></div>

  const primarySnapshots = snapshots.filter(s => (s.route_index ?? 0) === 0)
  const withDuration = primarySnapshots.filter(s => s.duration_seconds != null)
  const minDuration = withDuration.length ? Math.min(...withDuration.map(s => s.duration_seconds)) : null
  const maxDuration = withDuration.length ? Math.max(...withDuration.map(s => s.duration_seconds)) : null
  const minSnapshotId = minDuration != null ? withDuration.find(s => s.duration_seconds === minDuration)?.id : null
  const maxSnapshotId = maxDuration != null ? withDuration.find(s => s.duration_seconds === maxDuration)?.id : null

  const formatTime = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const CHART_RANGES = [
    { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000, timeOnly: true },
    { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000, timeOnly: false },
    { id: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000, timeOnly: false },
    { id: 'all', label: 'All', ms: null, timeOnly: false },
  ]
  const activeRange = CHART_RANGES.find(r => r.id === chartRange) || CHART_RANGES[0]
  const now = Date.now()
  const cutoff = activeRange.ms == null ? 0 : now - activeRange.ms

  const chartDataRaw = primarySnapshots
    .map(s => ({
      time: s.collected_at,
      ts: new Date(s.collected_at).getTime(),
      duration: s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
    }))
    .filter(d => d.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts)

  const chartData = chartDataRaw.map(d => ({
    ...d,
    formatted: activeRange.timeOnly
      ? new Date(d.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : formatTime(d.time),
  }))

  const SEGMENT_MS = { '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000, '2h': 2 * 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000, '12h': 12 * 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000 }
  const chartSegmentMs = SEGMENT_MS[chartSegment] ?? SEGMENT_MS['1h']
  const chartMinTs = chartData.length > 0 ? chartData[0].ts : now
  const chartMaxTs = chartData.length > 0 ? chartData[chartData.length - 1].ts : now
  const xAxisTicks = (() => {
    if (chartData.length === 0) return []
    const ticks = []
    let t = Math.floor(chartMinTs / chartSegmentMs) * chartSegmentMs
    while (t <= chartMaxTs + 1) {
      ticks.push(t)
      t += chartSegmentMs
    }
    const maxTicks = 12
    if (ticks.length <= maxTicks) return ticks
    const step = (ticks.length - 1) / (maxTicks - 1)
    return Array.from({ length: maxTicks }, (_, i) => ticks[Math.round(i * step)])
  })()
  const formatXTick = (ts) => activeRange.timeOnly
    ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : formatTime(new Date(ts).toISOString())

  // Average over the currently selected range only
  const chartDurations = chartData.map(d => d.duration).filter((v) => v != null)
  const averageDuration = chartDurations.length > 0
    ? chartDurations.reduce((a, b) => a + b, 0) / chartDurations.length
    : null
  const averageLabel = averageDuration != null
    ? `Avg (${activeRange.label}): ${averageDuration.toFixed(1)} min`
    : ''

  const latestSnap = primarySnapshots[primarySnapshots.length - 1]

  const ActionBtn = ({ onClick, children, variant = 'secondary', disabled }) => (
    <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>{children}</button>
  )

  return (
    <div className="job-detail-page">
      <div className="job-detail-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div className="job-detail-title">
          <div className="job-route-line">
            <span className="job-route-text">
              {shortenToStreet(job.start_location)}
              <span className="job-route-arrow">→</span>
              {shortenToStreet(job.end_location)}
            </span>
            <span className={`status-badge status-${job.status}`}>{job.status}</span>
          </div>
          <div className="job-meta-line">
            {(job.cycle_seconds ?? 0) > 0 ? `${job.cycle_seconds}s` : `${job.cycle_minutes ?? 60}m`} cycle
            <span className="job-meta-sep">·</span>
            {job.duration_days} days
            <span className="job-meta-sep">·</span>
            {job.navigation_type}
            {job.avoid_highways && <><span className="job-meta-sep">·</span>Avoid highways</>}
            {job.avoid_tolls && <><span className="job-meta-sep">·</span>Avoid tolls</>}
          </div>
        </div>
        <div className="job-detail-actions">
          {(job.status === 'pending' || job.status === 'completed') && (
            <ActionBtn variant="success" onClick={() => runAction('start')} disabled={!!actionLoading}>
              {actionLoading === 'start' ? '…' : (job.status === 'completed' ? 'Continue' : 'Start')}
            </ActionBtn>
          )}
          {job.status === 'running' && (
            <>
              <ActionBtn variant="warning" onClick={() => runAction('pause')} disabled={!!actionLoading}>{actionLoading === 'pause' ? '…' : 'Pause'}</ActionBtn>
              <ActionBtn variant="danger" onClick={() => runAction('stop')} disabled={!!actionLoading}>{actionLoading === 'stop' ? '…' : 'Stop'}</ActionBtn>
            </>
          )}
          {job.status === 'paused' && (
            <>
              <ActionBtn variant="success" onClick={() => runAction('resume')} disabled={!!actionLoading}>{actionLoading === 'resume' ? '…' : 'Resume'}</ActionBtn>
              <ActionBtn variant="danger" onClick={() => runAction('stop')} disabled={!!actionLoading}>{actionLoading === 'stop' ? '…' : 'Stop'}</ActionBtn>
            </>
          )}
          {job.status !== 'running' && (
            <ActionBtn onClick={() => setEditing(true)}>Edit</ActionBtn>
          )}
          <div className="job-actions-dropdown">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowActions(!showActions)}>⋮</button>
            {showActions && (
              <>
                <div className="job-actions-overlay" onClick={() => setShowActions(false)} />
                <div className="job-actions-menu">
                  <button onClick={handleCreateFlippedJob} disabled={!!actionLoading}>Reverse route</button>
                  <button onClick={() => handleExport('json')}>Export JSON</button>
                  <button onClick={() => handleExport('csv')}>Export CSV</button>
                  <button className="danger" onClick={handleDelete} disabled={!!actionLoading}>{actionLoading === 'delete' ? 'Deleting…' : 'Delete'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <EditJob
          job={job}
          onSaved={(updated) => { setJob(updated); setEditing(false); fetchData() }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Stats row + map side by side */}
      <div className="job-detail-main">
        <div className="job-detail-stats">
          <div className="job-stat-grid">
            <div className="job-stat-cell">
              <span className="job-stat-label">Current</span>
              <span className="job-stat-value">
                {latestSnap?.duration_seconds ? `${Math.round(latestSnap.duration_seconds / 60)} min` : '—'}
              </span>
              {latestSnap?.distance_meters && (
                <span className="job-stat-sub">{(latestSnap.distance_meters / 1000).toFixed(1)} km</span>
              )}
            </div>
            <div className="job-stat-cell">
              <span className="job-stat-label">Total snapshots</span>
              <span className="job-stat-value">{primarySnapshots.length}</span>
            </div>
            <div className="job-stat-cell">
              <span className="job-stat-label">Lowest time</span>
              <span className="job-stat-value job-stat-success">
                {minDuration != null ? `${Math.round(minDuration / 60)} min` : '—'}
              </span>
            </div>
            <div className="job-stat-cell">
              <span className="job-stat-label">Highest time</span>
              <span className="job-stat-value job-stat-warning">
                {maxDuration != null ? `${Math.round(maxDuration / 60)} min` : '—'}
              </span>
            </div>
            {job.status === 'running' && countdown != null && (
              <div className="job-stat-cell">
                <span className="job-stat-label">Next in</span>
                <span className="job-stat-value job-stat-accent">{countdown}s</span>
              </div>
            )}
          </div>
          {snapshots.length === 0 && (
            <p className="job-empty-msg">{job.status === 'running' ? 'Collecting first data...' : 'No data yet. Start the job.'}</p>
          )}
        </div>
        <div className="job-detail-map">
          <RouteMap
            origin={job.start_location}
            destination={job.end_location}
            travelMode={job.navigation_type}
            avoidHighways={!!job.avoid_highways}
            avoidTolls={!!job.avoid_tolls}
            lastSnapshotAt={snapshots.length ? snapshots[snapshots.length - 1].collected_at : null}
          />
        </div>
      </div>

      {/* Chart - only when there is data to plot */}
      {primarySnapshots.length > 0 && (
        <div className="job-detail-card">
          <div className="job-chart-header">
            <h4 className="job-detail-card-title">Travel time (min)</h4>
            <div className="job-chart-controls">
              <div className="job-chart-range">
                <span className="job-chart-control-label">Range:</span>
                {CHART_RANGES.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className={`btn btn-sm ${chartRange === r.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setChartRange(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {chartData.length > 0 && (
                <>
                  <div className="job-chart-range">
                    <span className="job-chart-control-label">Tick:</span>
                    {Object.keys(SEGMENT_MS).map(seg => (
                      <button
                        key={seg}
                        type="button"
                        className={`btn btn-sm ${chartSegment === seg ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setChartSegment(seg)}
                      >
                        {seg}
                      </button>
                    ))}
                  </div>
                  <label className="job-chart-toggle">
                    <input
                      type="checkbox"
                      checked={showAverageLine}
                      onChange={(e) => setShowAverageLine(e.target.checked)}
                    />
                    <span>Show average</span>
                  </label>
                </>
              )}
            </div>
          </div>
          {chartData.length > 0 ? (
            <div className="job-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} key={`${chartRange}-${chartSegment}`}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    dataKey="ts"
                    domain={[chartMinTs, chartMaxTs]}
                    ticks={xAxisTicks}
                    tickFormatter={formatXTick}
                    stroke="var(--text-muted)"
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 9 }} width={28} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                    labelFormatter={(ts) => formatXTick(ts)}
                  />
                  <Line type="monotone" dataKey="duration" name="min" stroke="var(--accent)" dot={false} connectNulls strokeWidth={2} />
                  {showAverageLine && averageDuration != null && (
                    <ReferenceLine
                      y={averageDuration}
                      stroke="var(--warning)"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: averageLabel, position: 'right', fill: 'var(--text-muted)', fontSize: 10 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="job-empty-msg">No data in this range. Try another range or &quot;All&quot;.</p>
          )}
        </div>
      )}

      {/* Data table */}
      <div className="job-detail-card">
        <h4 className="job-detail-card-title">Collected data</h4>
        <p className="job-detail-hint">Click a row to view map and directions</p>
        {snapshots.length === 0 ? (
          <p className="job-empty-msg">No data yet.</p>
        ) : (
          <div className="job-table-wrap">
            <table className="job-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  <th>Collected</th>
                  <th className="num">Duration</th>
                  <th className="num">Distance</th>
                </tr>
              </thead>
              <tbody>
                {primarySnapshots.slice(-40).reverse().map(s => {
                  const isMin = s.id === minSnapshotId
                  const isMax = s.id === maxSnapshotId
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={expandedSnapshotId === s.id ? 'expanded' : ''}
                        onClick={() => setExpandedSnapshotId(prev => prev === s.id ? null : s.id)}
                      >
                        <td className="expand">{expandedSnapshotId === s.id ? '▼' : '▶'}</td>
                        <td>{formatTime(s.collected_at)}</td>
                        <td className="num">
                          {s.duration_seconds ? Math.round(s.duration_seconds / 60) : '—'}
                          {isMin && <span className="duration-badge duration-lowest">L</span>}
                          {isMax && <span className="duration-badge duration-highest">H</span>}
                        </td>
                        <td className="num">{s.distance_meters ? (s.distance_meters / 1000).toFixed(2) : '—'}</td>
                      </tr>
                      {expandedSnapshotId === s.id && (
                        <tr className="detail-row">
                          <td colSpan={4}>
                            <SnapshotDetail snapshot={s} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {primarySnapshots.length > 40 && (
              <p className="job-table-footer">Last 40 of {primarySnapshots.length}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
