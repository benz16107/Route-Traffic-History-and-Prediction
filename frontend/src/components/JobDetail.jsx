import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import RouteMap from './RouteMap'
import EditJob from './EditJob'
import SnapshotDetail from './SnapshotDetail'
import { fetchJson } from '../utils/api.js'
import { formatJobMetaShort, getJobTitle, getJobSubtitle } from '../utils/formatJob.js'

const API = '/api'
const HOUR_MS = 60 * 60 * 1000
const CHART_RANGES = [
  { id: '24h', label: '24 hours', ms: 24 * HOUR_MS, timeOnly: true },
  { id: '7d', label: '7 days', ms: 7 * 24 * HOUR_MS, timeOnly: false },
  { id: '30d', label: '30 days', ms: 30 * 24 * HOUR_MS, timeOnly: false },
  { id: 'all', label: 'All', ms: null, timeOnly: false },
]

const CHART_MARGIN_RIGHT = 88

function ScatterDot(props) {
  const { cx, cy, fill } = props
  if (cx == null || cy == null) return null
  return <circle cx={cx} cy={cy} r={1} fill={fill} />
}

export default function JobDetail({ jobId, onBack, onFlipRoute, onDeleted }) {
  const [job, setJob] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [editing, setEditing] = useState(false)
  const [expandedSnapshotId, setExpandedSnapshotId] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [chartRange, setChartRange] = useState('24h')
  const [showAverageLine, setShowAverageLine] = useState(true)
  const [showMinMaxLines, setShowMinMaxLines] = useState(true)
  const chartScrollRef = useRef(null)
  const [chartTooltip, setChartTooltip] = useState({ point: null, x: 0, y: 0 })
  const chartTooltipRafRef = useRef(null)
  const chartTooltipPendingRef = useRef(null)

  const fetchData = async () => {
    try {
      const [jobData, snapData] = await Promise.all([
        fetchJson(`${API}/jobs/${jobId}`, { cache: 'no-store' }),
        fetchJson(`${API}/jobs/${jobId}/snapshots`, { cache: 'no-store' }),
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

  useEffect(() => {
    const el = chartScrollRef.current
    if (!el) return
    const scrollToRight = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    scrollToRight()
    const t = requestAnimationFrame(scrollToRight)
    return () => cancelAnimationFrame(t)
  }, [job?.id, snapshots.length, chartRange])

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

  const primarySnapshots = useMemo(
    () => snapshots.filter(s => (s.route_index ?? 0) === 0),
    [snapshots]
  )
  const withDuration = primarySnapshots.filter(s => s.duration_seconds != null)
  const minDuration = withDuration.length ? Math.min(...withDuration.map(s => s.duration_seconds)) : null
  const maxDuration = withDuration.length ? Math.max(...withDuration.map(s => s.duration_seconds)) : null
  const minSnapshotId = minDuration != null ? withDuration.find(s => s.duration_seconds === minDuration)?.id : null
  const maxSnapshotId = maxDuration != null ? withDuration.find(s => s.duration_seconds === maxDuration)?.id : null
  const totalAvgDuration = withDuration.length > 0
    ? withDuration.reduce((sum, s) => sum + s.duration_seconds, 0) / withDuration.length
    : null

  const formatTime = useCallback(
    (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    []
  )

  const activeRange = CHART_RANGES.find(r => r.id === chartRange) || CHART_RANGES[0]
  const chartState = useMemo(() => {
    const now = Date.now()
    const cutoff = activeRange.ms == null ? 0 : now - activeRange.ms
    const data = primarySnapshots
      .filter(s => new Date(s.collected_at).getTime() >= cutoff)
      .map(s => ({
        ts: new Date(s.collected_at).getTime(),
        duration: s.duration_seconds != null ? Math.round(s.duration_seconds / 60) : null,
      }))
      .sort((a, b) => a.ts - b.ts)
    const scatter = data.filter(d => d.duration != null)
    const minTs = data.length > 0 ? data[0].ts : now
    const maxTs = data.length > 0 ? data[data.length - 1].ts : now
    let ticks = []
    if (data.length > 0 && chartRange !== 'all' && chartRange !== '30d') {
      if (chartRange === '7d') {
        const d = new Date(minTs)
        d.setHours(0, 0, 0, 0)
        let t = d.getTime()
        while (t <= maxTs + 1) {
          ticks.push(t)
          t += 12 * HOUR_MS
        }
      } else {
        const start = Math.floor(minTs / HOUR_MS) * HOUR_MS
        let t = start
        while (t <= maxTs + 1) {
          ticks.push(t)
          t += HOUR_MS
        }
      }
    }
    const durations = data.map(d => d.duration).filter(v => v != null)
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null
    const minD = durations.length > 0 ? Math.min(...durations) : null
    const maxD = durations.length > 0 ? Math.max(...durations) : null
    const minPoints = minD != null ? data.filter(d => d.duration === minD) : []
    const maxPoints = maxD != null ? data.filter(d => d.duration === maxD) : []
    return {
      chartData: data,
      scatterData: scatter,
      chartMinTs: minTs,
      chartMaxTs: maxTs,
      xAxisTicks: ticks,
      averageDuration: avg,
      minDurationInRange: minD,
      maxDurationInRange: maxD,
      minPoints,
      maxPoints,
    }
  }, [primarySnapshots, chartRange])

  const {
    chartData,
    scatterData,
    chartMinTs,
    chartMaxTs,
    xAxisTicks,
    averageDuration,
    minDurationInRange,
    maxDurationInRange,
    minPoints,
    maxPoints,
  } = chartState

  const formatXTick = useCallback(
    (ts) =>
      activeRange.timeOnly
        ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : formatTime(new Date(ts).toISOString()),
    [activeRange.timeOnly, formatTime]
  )
  const formatXAxisTick = useCallback(
    (ts) => {
      if (chartRange === '7d') {
        const d = new Date(ts)
        const day = d.toLocaleDateString(undefined, { weekday: 'short' })
        return d.getHours() === 0 ? `${day} 12 AM` : `${day} 12 PM`
      }
      return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric' })
    },
    [chartRange]
  )

  const handleChartMouseMove = useCallback(
    (e) => {
      const el = chartScrollRef.current
      if (!el || !scatterData.length) return
      const rect = el.getBoundingClientRect()
      const plotWidth = el.scrollWidth - CHART_MARGIN_RIGHT
      if (plotWidth <= 0) return
      const plotX = Math.max(0, Math.min(plotWidth, el.scrollLeft + (e.clientX - rect.left)))
      const ratio = plotX / plotWidth
      const cursorTime = chartMinTs + ratio * (chartMaxTs - chartMinTs)
      let point = scatterData[0]
      let minDist = Infinity
      for (let i = 0; i < scatterData.length; i++) {
        const d = scatterData[i]
        const dist = Math.abs(d.ts - cursorTime)
        if (dist < minDist) {
          minDist = dist
          point = d
        }
      }
      const next = { point, x: e.clientX - 12, y: e.clientY }
      chartTooltipPendingRef.current = next
      if (chartTooltipRafRef.current == null) {
        chartTooltipRafRef.current = requestAnimationFrame(() => {
          chartTooltipRafRef.current = null
          if (chartTooltipPendingRef.current) {
            setChartTooltip(chartTooltipPendingRef.current)
          }
        })
      }
    },
    [scatterData, chartMinTs, chartMaxTs]
  )

  const handleChartMouseLeave = useCallback(() => {
    if (chartTooltipRafRef.current != null) {
      cancelAnimationFrame(chartTooltipRafRef.current)
      chartTooltipRafRef.current = null
    }
    chartTooltipPendingRef.current = null
    setChartTooltip({ point: null, x: 0, y: 0 })
  }, [])

  const latestSnap = primarySnapshots[primarySnapshots.length - 1]

  const ActionBtn = ({ onClick, children, variant = 'secondary', disabled }) => (
    <button type="button" className={`btn btn-sm btn-${variant}`} onClick={onClick} disabled={disabled}>{children}</button>
  )

  if (loading || !job) {
    return (
      <div className="card card-loading card-compact">
        <span className="loading-text">Loading...</span>
      </div>
    )
  }

  return (
    <div className="job-detail-page">
      <div className="job-detail-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div className="job-detail-title">
          <div className="job-route-line">
            <span className="job-route-text">
              {getJobTitle(job)}
            </span>
            <span className={`status-badge status-${job.status}`}>{job.status}</span>
          </div>
          {getJobSubtitle(job) && (
            <div className="job-detail-subtitle">{getJobSubtitle(job)}</div>
          )}
          <div className="job-meta-line">
            <span className="job-meta-text">{formatJobMetaShort(job)}</span>
            <div className="job-detail-actions">
              {String(job.status).toLowerCase() === 'running' && (
                <ActionBtn variant="warning" onClick={() => runAction('pause')} disabled={!!actionLoading}>{actionLoading === 'pause' ? '…' : 'Pause'}</ActionBtn>
              )}
              {String(job.status).toLowerCase() === 'paused' && (
                <ActionBtn variant="success" onClick={() => runAction('resume')} disabled={!!actionLoading}>{actionLoading === 'resume' ? '…' : 'Resume'}</ActionBtn>
              )}
              {String(job.status).toLowerCase() !== 'running' && String(job.status).toLowerCase() !== 'paused' && (
                <ActionBtn variant="success" onClick={() => runAction('start')} disabled={!!actionLoading}>{actionLoading === 'start' ? '…' : 'Start'}</ActionBtn>
              )}
              <ActionBtn onClick={() => setEditing(true)}>Edit</ActionBtn>
              <ActionBtn onClick={handleCreateFlippedJob} disabled={!!actionLoading}>Reverse route</ActionBtn>
              <ActionBtn onClick={() => handleExport('json')}>Export JSON</ActionBtn>
              <ActionBtn onClick={() => handleExport('csv')}>Export CSV</ActionBtn>
              <ActionBtn variant="danger" onClick={handleDelete} disabled={!!actionLoading}>{actionLoading === 'delete' ? 'Deleting…' : 'Delete'}</ActionBtn>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <EditJob
          job={job}
          isRunning={String(job.status).toLowerCase() === 'running'}
          onSaved={(updated) => {
            setJob(updated)
            setEditing(false)
            fetchData()
          }}
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
              <span className="job-stat-label">All time low</span>
              <span className="job-stat-value job-stat-success">
                {minDuration != null ? `${Math.round(minDuration / 60)} min` : '—'}
              </span>
            </div>
            <div className="job-stat-cell">
              <span className="job-stat-label">All time high</span>
              <span className="job-stat-value job-stat-warning">
                {maxDuration != null ? `${Math.round(maxDuration / 60)} min` : '—'}
              </span>
            </div>
            <div className="job-stat-cell">
              <span className="job-stat-label">Total average</span>
              <span className="job-stat-value">
                {totalAvgDuration != null ? `${Math.round(totalAvgDuration / 60)} min` : '—'}
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
                  <label className="job-chart-toggle">
                    <input
                      type="checkbox"
                      checked={showAverageLine}
                      onChange={(e) => setShowAverageLine(e.target.checked)}
                    />
                    <span>Show average</span>
                  </label>
                  <label className="job-chart-toggle">
                    <input
                      type="checkbox"
                      checked={showMinMaxLines}
                      onChange={(e) => setShowMinMaxLines(e.target.checked)}
                    />
                    <span>Show lowest & highest</span>
                  </label>
                </>
              )}
            </div>
          </div>
          {chartData.length > 0 ? (
            <div className="job-chart-with-side">
              <div className="job-chart-wrap">
                <div
                  ref={chartScrollRef}
                  className="job-chart-scroll"
                  onMouseMove={handleChartMouseMove}
                  onMouseLeave={handleChartMouseLeave}
                >
                  <div className="job-chart-inner">
                    <ResponsiveContainer width="100%" height={180}>
                      <ScatterChart
                        data={scatterData}
                        margin={{ top: 4, right: CHART_MARGIN_RIGHT, left: 0, bottom: 4 }}
                        key={chartRange}
                      >
                        <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                        <XAxis
                          type="number"
                          dataKey="ts"
                          domain={[chartMinTs, chartMaxTs]}
                          ticks={xAxisTicks}
                          interval={0}
                          tickFormatter={formatXAxisTick}
                          stroke="var(--text-muted)"
                          tick={{ fontSize: 9 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="duration"
                          stroke="var(--text-muted)"
                          tick={{ fontSize: 9 }}
                          width={28}
                        />
                        <Tooltip content={() => null} cursor={false} />
                        <Scatter dataKey="duration" fill="var(--accent)" shape={ScatterDot} />
                        {chartTooltip.point && (
                          <ReferenceDot
                            x={chartTooltip.point.ts}
                            y={chartTooltip.point.duration}
                            r={6}
                            fill="transparent"
                            stroke="var(--accent)"
                            strokeWidth={2}
                          />
                        )}
                        {showAverageLine && averageDuration != null && (
                          <ReferenceLine
                            y={averageDuration}
                            stroke="var(--warning)"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                          />
                        )}
                        {showMinMaxLines && minPoints.map((pt, i) => (
                          <ReferenceDot
                            key={`min-${pt.ts}-${i}`}
                            x={pt.ts}
                            y={pt.duration}
                            r={5}
                            fill="var(--success)"
                            stroke="var(--surface)"
                            strokeWidth={2}
                          />
                        ))}
                        {showMinMaxLines && maxPoints.map((pt, i) => (
                          <ReferenceDot
                            key={`max-${pt.ts}-${i}`}
                            x={pt.ts}
                            y={pt.duration}
                            r={5}
                            fill="var(--warning)"
                            stroke="var(--surface)"
                            strokeWidth={2}
                          />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {chartTooltip.point && (
                  <div
                    className="job-chart-custom-tooltip"
                    style={{
                      position: 'fixed',
                      left: chartTooltip.x,
                      top: chartTooltip.y,
                      transform: 'translate(-100%, -50%)',
                      pointerEvents: 'none',
                    }}
                  >
                    <div className="job-chart-custom-tooltip-label">
                      {formatXTick(chartTooltip.point.ts)}
                    </div>
                    <div className="job-chart-custom-tooltip-value">
                      {chartTooltip.point.duration} min
                    </div>
                  </div>
                )}
              </div>
              {(minDurationInRange != null || maxDurationInRange != null || averageDuration != null) && (
                <div className="job-chart-side-labels">
                  {minDurationInRange != null && minPoints.length > 0 && (
                    <div className="job-chart-side-item job-chart-side-low">
                      <span className="job-chart-side-label">Low</span>
                      <span className="job-chart-side-time">
                        {minPoints.length === 1
                          ? formatXTick(minPoints[0].ts)
                          : `${minPoints.length} times`}
                      </span>
                      <span className="job-chart-side-value">{minDurationInRange.toFixed(1)} min</span>
                    </div>
                  )}
                  {maxDurationInRange != null && maxPoints.length > 0 && (
                    <div className="job-chart-side-item job-chart-side-high">
                      <span className="job-chart-side-label">High</span>
                      <span className="job-chart-side-time">
                        {maxPoints.length === 1
                          ? formatXTick(maxPoints[0].ts)
                          : `${maxPoints.length} times`}
                      </span>
                      <span className="job-chart-side-value">{maxDurationInRange.toFixed(1)} min</span>
                    </div>
                  )}
                  {averageDuration != null && (
                    <div className="job-chart-side-item job-chart-side-avg">
                      <span className="job-chart-side-label">Avg ({activeRange.label})</span>
                      <span className="job-chart-side-value">{averageDuration.toFixed(1)} min</span>
                    </div>
                  )}
                </div>
              )}
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
                  <th></th>
                  <th>Time</th>
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
