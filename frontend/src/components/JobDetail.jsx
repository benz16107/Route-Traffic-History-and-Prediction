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
  ReferenceArea,
} from 'recharts'
import RouteMap from './RouteMap'
import EditJob from './EditJob'
import SnapshotDetail from './SnapshotDetail'
import { fetchJson } from '../utils/api.js'
import { formatJobMetaShort, getJobTitle, getJobSubtitle } from '../utils/formatJob.js'

const API = '/api'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const CHART_RANGES = [
  { id: '24h', label: '24 hours', ms: 24 * HOUR_MS, timeOnly: true },
  { id: '7d', label: '7 days', ms: 7 * 24 * HOUR_MS, timeOnly: false },
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
  const [chartRange, setChartRange] = useState('7d')
  const [chartViewportMs, setChartViewportMs] = useState(7 * DAY_MS)
  const [showAverageLine, setShowAverageLine] = useState(true)
  const [minMaxMode, setMinMaxMode] = useState('perDay') // 'off' | 'range' | 'perDay'
  const [showAllSnapshots, setShowAllSnapshots] = useState(false)
  const chartScrollRef = useRef(null)
  const [chartContainerWidth, setChartContainerWidth] = useState(0)
  const [chartTooltip, setChartTooltip] = useState({ point: null, x: 0, y: 0 })
  const [chartTooltipPinned, setChartTooltipPinned] = useState(null)
  const [chartPopupSnapshot, setChartPopupSnapshot] = useState(null)
  const chartHoverPointRef = useRef(null) // avoid setState when same point stays highlighted
  const chartDragRef = useRef({ isDown: false, startX: 0, startScrollLeft: 0, didDrag: false })

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
  const formatDurationMin = (v) => (v % 1 === 0 ? String(v) : v.toFixed(1))

  const activeRange = CHART_RANGES.find(r => r.id === chartRange) || CHART_RANGES[0]

  const totalSpanMs =
    primarySnapshots.length >= 2
      ? Math.max(...primarySnapshots.map((s) => new Date(s.collected_at).getTime())) -
        Math.min(...primarySnapshots.map((s) => new Date(s.collected_at).getTime()))
      : 7 * DAY_MS

  const setChartRangeAndViewport = useCallback(
    (rangeId) => {
      setChartRange(rangeId)
      const range = CHART_RANGES.find((r) => r.id === rangeId) || CHART_RANGES[0]
      setChartViewportMs(range.ms != null ? range.ms : totalSpanMs)
    },
    [totalSpanMs]
  )

  const VIEWPORT_MATCH_TOLERANCE_MS = 2000
  const rangeViewportMatches = useCallback(
    (r) => {
      const presetMs = r.ms != null ? r.ms : totalSpanMs
      return Math.abs(chartViewportMs - presetMs) < VIEWPORT_MATCH_TOLERANCE_MS
    },
    [chartViewportMs, totalSpanMs]
  )

  const chartState = useMemo(() => {
    const now = Date.now()
    const data = primarySnapshots
      .map(s => ({
        ts: new Date(s.collected_at).getTime(),
        duration: s.duration_seconds != null ? Math.round(s.duration_seconds / 60) : null,
      }))
      .sort((a, b) => a.ts - b.ts)
    const scatter = data.filter(d => d.duration != null)
    const minTs = data.length > 0 ? data[0].ts : now
    const maxTs = data.length > 0 ? data[data.length - 1].ts : now
    const totalSpan = maxTs - minTs
    const baseViewport = totalSpan || 24 * HOUR_MS
    const viewportTimeMs = Math.max(24 * HOUR_MS, Math.min(chartViewportMs, baseViewport))
    let ticks = []
    if (data.length > 0) {
      const maxTicks = 80
      let step
      if (chartRange === '7d') {
        step = 6 * HOUR_MS
      } else if (chartRange === '24h') {
        step = HOUR_MS
      } else {
        step = 24 * HOUR_MS
      }
      let t = chartRange === '7d' ? (() => { const d = new Date(minTs); d.setHours(0, 0, 0, 0); return d.getTime() })() : Math.floor(minTs / step) * step
      const rawCount = Math.ceil((maxTs - minTs) / step) + 1
      if (rawCount > maxTicks) step = totalSpan / maxTicks
      while (t <= maxTs + 1) {
        ticks.push(t)
        t += step
      }
    }
    const durations = data.map(d => d.duration).filter(v => v != null)
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null
    const minD = durations.length > 0 ? Math.min(...durations) : null
    const maxD = durations.length > 0 ? Math.max(...durations) : null
    const minPoints = minD != null ? data.filter(d => d.duration === minD) : []
    const maxPoints = maxD != null ? data.filter(d => d.duration === maxD) : []
    const range = minD != null && maxD != null ? maxD - minD : 0
    const padding = range > 0 ? Math.max(range * 0.15, 2) : 5
    const chartYDomain =
      minD != null && maxD != null
        ? [Math.floor(minD - padding), Math.ceil(maxD + padding)]
        : [0, 60]
    return {
      chartData: data,
      scatterData: scatter,
      chartMinTs: minTs,
      chartMaxTs: maxTs,
      viewportTimeMs,
      xAxisTicks: ticks,
      averageDuration: avg,
      minDurationInRange: minD,
      maxDurationInRange: maxD,
      minPoints,
      maxPoints,
      chartYDomain,
    }
  }, [primarySnapshots, chartRange, chartViewportMs])

  const {
    chartData,
    scatterData,
    chartMinTs,
    chartMaxTs,
    viewportTimeMs,
    xAxisTicks,
    averageDuration,
    minDurationInRange,
    maxDurationInRange,
    minPoints,
    maxPoints,
    chartYDomain,
  } = chartState

  const perDayMinMaxPoints = useMemo(() => {
    const getDayStart = (ts) => {
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    const byDay = new Map()
    for (const p of scatterData) {
      const day = getDayStart(p.ts)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push(p)
    }
    let minPts = []
    let maxPts = []
    byDay.forEach((pts) => {
      const mins = pts.filter((p) => p.duration === Math.min(...pts.map((x) => x.duration)))
      const maxs = pts.filter((p) => p.duration === Math.max(...pts.map((x) => x.duration)))
      minPts = minPts.concat(mins)
      maxPts = maxPts.concat(maxs)
    })
    return { minPoints: minPts, maxPoints: maxPts }
  }, [scatterData])

  const displayMinPoints = minMaxMode === 'range' ? minPoints : minMaxMode === 'perDay' ? perDayMinMaxPoints.minPoints : []
  const displayMaxPoints = minMaxMode === 'range' ? maxPoints : minMaxMode === 'perDay' ? perDayMinMaxPoints.maxPoints : []

  const formatXTick = useCallback(
    (ts) =>
      activeRange.timeOnly
        ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : formatTime(new Date(ts).toISOString()),
    [activeRange.timeOnly, formatTime]
  )
  const handleChartZoomIn = useCallback(() => {
    setChartViewportMs((prev) => Math.max(24 * HOUR_MS, prev / 1.25))
  }, [])

  const handleChartZoomOut = useCallback(() => {
    setChartViewportMs((prev) => Math.min(totalSpanMs, prev * 1.25))
  }, [totalSpanMs])

  const formatXAxisTick = useCallback(
    (ts) =>
      chartRange === 'all' ? '' : new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric' }),
    [chartRange]
  )

  const dayBands = useMemo(() => {
    const bands = []
    const d = new Date(chartMinTs)
    d.setHours(0, 0, 0, 0)
    let dayStart = d.getTime()
    if (dayStart > chartMinTs) dayStart -= DAY_MS
    let i = 0
    while (dayStart < chartMaxTs) {
      const dayEnd = dayStart + DAY_MS
      const x1 = Math.max(dayStart, chartMinTs)
      const x2 = Math.min(dayEnd, chartMaxTs)
      if (x2 > x1) {
        bands.push({
          x1,
          x2,
          fill: i % 2 === 0 ? 'var(--chart-day-band-even, rgba(0,0,0,0.06))' : 'var(--chart-day-band-odd, rgba(0,0,0,0.14))',
        })
      }
      dayStart = dayEnd
      i += 1
    }
    return bands
  }, [chartMinTs, chartMaxTs])

  const totalTimeMs = chartMaxTs - chartMinTs
  const chartInnerWidth = useMemo(() => {
    if (chartContainerWidth <= 0 || totalTimeMs <= 0 || viewportTimeMs <= 0) return null
    return Math.max(chartContainerWidth, Math.ceil((chartContainerWidth * totalTimeMs) / viewportTimeMs))
  }, [chartContainerWidth, totalTimeMs, viewportTimeMs])

  useEffect(() => {
    const el = chartScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el) setChartContainerWidth(el.clientWidth)
    })
    ro.observe(el)
    setChartContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [chartData.length])

  useEffect(() => {
    const el = chartScrollRef.current
    if (!el) return
    const scrollToRight = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    scrollToRight()
    const raf1 = requestAnimationFrame(() => {
      scrollToRight()
      requestAnimationFrame(scrollToRight)
    })
    const timeout = setTimeout(scrollToRight, 80)
    return () => {
      cancelAnimationFrame(raf1)
      clearTimeout(timeout)
    }
  }, [job?.id, snapshots.length, chartRange, chartInnerWidth])

  const SCROLLBAR_HIT_PX = 12
  const CHART_HEIGHT = 280
  const CHART_PLOT_TOP = 4
  const CHART_PLOT_BOTTOM = 4
  const CHART_PLOT_LEFT = 28 // YAxis width - plot area starts after this
  const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_PLOT_TOP - CHART_PLOT_BOTTOM
  const HOVER_ON_POINT_RADIUS_PX = 8 // only highlight when cursor is right on the dot (small radius)

  const handleChartMouseMove = useCallback(
    (e) => {
      const el = chartScrollRef.current
      if (!el) return
      const ref = chartDragRef.current
      if (ref.isDown) {
        el.scrollLeft = ref.startScrollLeft + (ref.startX - e.clientX)
        ref.didDrag = true
        return
      }
      if (!scatterData.length) return
      const rect = el.getBoundingClientRect()
      if (e.clientY >= rect.bottom - SCROLLBAR_HIT_PX) {
        if (chartHoverPointRef.current !== null) {
          chartHoverPointRef.current = null
          setChartTooltip({ point: null, x: 0, y: 0 })
        }
        return
      }
      const plotWidth = el.scrollWidth - CHART_MARGIN_RIGHT - CHART_PLOT_LEFT
      if (plotWidth <= 0) return
      const timeRange = chartMaxTs - chartMinTs
      const [yMin, yMax] = chartYDomain
      const durationRange = yMax - yMin
      const cursorX = el.scrollLeft + (e.clientX - rect.left)
      const cursorY = e.clientY - rect.top
      const maxDistSq = HOVER_ON_POINT_RADIUS_PX * HOVER_ON_POINT_RADIUS_PX
      let best = null
      let bestDistSq = maxDistSq + 1
      for (let i = 0; i < scatterData.length; i++) {
        const d = scatterData[i]
        const pointX =
          CHART_PLOT_LEFT +
          (timeRange > 0 ? ((d.ts - chartMinTs) / timeRange) * plotWidth : 0)
        const pointY =
          CHART_PLOT_TOP +
          (durationRange > 0 ? (1 - (d.duration - yMin) / durationRange) * CHART_PLOT_HEIGHT : 0)
        const distSq = (cursorX - pointX) ** 2 + (cursorY - pointY) ** 2
        if (distSq <= maxDistSq && distSq < bestDistSq) {
          bestDistSq = distSq
          best = d
        }
      }
      if (chartHoverPointRef.current?.ts === best?.ts) return
      chartHoverPointRef.current = best ?? null
      setChartTooltip(
        best
          ? { point: best, x: e.clientX - 12, y: e.clientY }
          : { point: null, x: 0, y: 0 }
      )
    },
    [scatterData, chartMinTs, chartMaxTs, chartYDomain]
  )

  const handleChartMouseLeave = useCallback(() => {
    chartDragRef.current.isDown = false
    if (chartHoverPointRef.current !== null) {
      chartHoverPointRef.current = null
      setChartTooltip({ point: null, x: 0, y: 0 })
    }
  }, [])

  const handleChartMouseDown = useCallback((e) => {
    const el = chartScrollRef.current
    if (!el) return
    chartDragRef.current = {
      isDown: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      didDrag: false,
    }
  }, [])

  const handleChartMouseUp = useCallback(() => {
    chartDragRef.current.isDown = false
  }, [])

  const handleChartClick = useCallback(() => {
    if (chartDragRef.current.didDrag) {
      chartDragRef.current.didDrag = false
      return
    }
    if (!chartTooltip.point) {
      setChartTooltipPinned(null)
      return
    }
    setChartTooltipPinned({ point: chartTooltip.point, x: chartTooltip.x, y: chartTooltip.y })
    const snap = primarySnapshots.find(
      (s) => new Date(s.collected_at).getTime() === chartTooltip.point.ts
    )
    if (snap) setChartPopupSnapshot(snap)
  }, [chartTooltip.point, chartTooltip.x, chartTooltip.y, primarySnapshots])

  const latestSnap = primarySnapshots[primarySnapshots.length - 1]

  const getSnapshotForPoint = useCallback(
    (point) => primarySnapshots.find((s) => new Date(s.collected_at).getTime() === point.ts) ?? null,
    [primarySnapshots]
  )

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
    <div className="route-page">
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

      {/* Toolbar: back, title, status, actions */}
      <header className="route-toolbar">
        <div className="route-toolbar-left">
          <button type="button" className="route-back" onClick={onBack} aria-label="Back to routes">
            ← Back
          </button>
          <div className="route-heading">
            <h1 className="route-title">{getJobTitle(job)}</h1>
            {getJobSubtitle(job) && (
              <p className="route-subtitle">{getJobSubtitle(job)}</p>
            )}
            <p className="route-meta">{formatJobMetaShort(job)}</p>
          </div>
          <span className={`route-status status-badge status-${job.status}`}>{job.status}</span>
        </div>
        <div className="route-toolbar-actions">
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
          <ActionBtn onClick={handleCreateFlippedJob} disabled={!!actionLoading}>Reverse</ActionBtn>
          <ActionBtn onClick={() => handleExport('json')}>JSON</ActionBtn>
          <ActionBtn onClick={() => handleExport('csv')}>CSV</ActionBtn>
          <ActionBtn variant="danger" onClick={handleDelete} disabled={!!actionLoading}>{actionLoading === 'delete' ? '…' : 'Delete'}</ActionBtn>
        </div>
      </header>

      {/* Hero: full-width map with live overlay */}
      <section className="route-hero">
        <div className="route-hero-map">
          <RouteMap
            origin={job.start_location}
            destination={job.end_location}
            travelMode={job.navigation_type}
            avoidHighways={!!job.avoid_highways}
            avoidTolls={!!job.avoid_tolls}
            lastSnapshotAt={snapshots.length ? snapshots[snapshots.length - 1].collected_at : null}
          />
        </div>
        <div className="route-hero-live">
          <div className="route-hero-live-item">
            <span className="route-hero-live-label">Current</span>
            <span className="route-hero-live-value">
              {latestSnap?.duration_seconds ? `${Math.round(latestSnap.duration_seconds / 60)} min` : '—'}
            </span>
            {latestSnap?.distance_meters && (
              <span className="route-hero-live-sub">{(latestSnap.distance_meters / 1000).toFixed(1)} km</span>
            )}
          </div>
          {job.status === 'running' && countdown != null && (
            <div className="route-hero-live-item route-hero-live-next">
              <span className="route-hero-live-label">Next in</span>
              <span className="route-hero-live-value">
                {countdown >= 60
                  ? `${Math.floor(countdown / 60)}m ${countdown % 60}s`
                  : `${countdown}s`}
              </span>
            </div>
          )}
        </div>
      </section>

      {snapshots.length === 0 && (
        <p className="route-empty-msg">{job.status === 'running' ? 'Collecting first data…' : 'No data yet. Start the job to collect travel times.'}</p>
      )}

      {/* Metrics strip */}
      {(primarySnapshots.length > 0 || minDuration != null || totalAvgDuration != null) && (
        <section className="route-metrics">
          <div className="route-metric">
            <span className="route-metric-label">Snapshots</span>
            <span className="route-metric-value">{primarySnapshots.length}</span>
          </div>
          <div className="route-metric">
            <span className="route-metric-label">All-time low</span>
            <span className="route-metric-value route-metric-value--success">
              {minDuration != null ? `${Math.round(minDuration / 60)} min` : '—'}
            </span>
          </div>
          <div className="route-metric">
            <span className="route-metric-label">All-time high</span>
            <span className="route-metric-value route-metric-value--warning">
              {maxDuration != null ? `${Math.round(maxDuration / 60)} min` : '—'}
            </span>
          </div>
        </section>
      )}

      {/* Chart */}
      {primarySnapshots.length > 0 && (
        <section className="route-chart">
          <div className="route-chart-head">
            <h2 className="route-section-title">Travel time</h2>
            <div className="job-chart-controls">
              <div className="job-chart-range">
                <span className="job-chart-control-label">Range:</span>
                {CHART_RANGES.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className={`btn btn-sm ${chartRange === r.id && rangeViewportMatches(r) ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setChartRangeAndViewport(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="job-chart-zoom" role="group" aria-label="Chart zoom">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm job-chart-zoom-btn"
                  onClick={handleChartZoomIn}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm job-chart-zoom-btn"
                  onClick={handleChartZoomOut}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  −
                </button>
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
                  <div className="job-chart-segmented" role="group" aria-label="Low/high display">
                    <button
                      type="button"
                      className={`job-chart-segmented-option ${minMaxMode === 'range' ? 'active' : ''}`}
                      onClick={() => setMinMaxMode('range')}
                      title="Show lowest and highest for the whole selected range"
                    >
                      Whole range
                    </button>
                    <button
                      type="button"
                      className={`job-chart-segmented-option ${minMaxMode === 'off' ? 'active' : ''}`}
                      onClick={() => setMinMaxMode('off')}
                      title="Hide lowest and highest"
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      className={`job-chart-segmented-option ${minMaxMode === 'perDay' ? 'active' : ''}`}
                      onClick={() => setMinMaxMode('perDay')}
                      title="Show lowest and highest for each 24-hour day"
                    >
                      Per day
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {chartData.length > 0 ? (
            <div className="job-chart-with-side">
              <div className="job-chart-wrap">
                <div
                  ref={chartScrollRef}
                  className={`job-chart-scroll${(chartTooltip.point || chartTooltipPinned?.point) ? ' job-chart-scroll-clickable' : ''}`}
                  onMouseDown={handleChartMouseDown}
                  onMouseMove={handleChartMouseMove}
                  onMouseUp={handleChartMouseUp}
                  onMouseLeave={handleChartMouseLeave}
                  onClick={handleChartClick}
                >
                  <div
                    className="job-chart-inner"
                    style={{ width: chartInnerWidth ?? '100%', minWidth: '100%' }}
                  >
                    <ResponsiveContainer width={chartInnerWidth ?? '100%'} height={280}>
                      <ScatterChart
                        data={scatterData}
                        margin={{ top: 4, right: CHART_MARGIN_RIGHT, left: 0, bottom: 4 }}
                        key={chartRange}
                        isAnimationActive={false}
                      >
                        {dayBands.map((band, i) => (
                          <ReferenceArea key={`day-${i}`} x1={band.x1} x2={band.x2} fill={band.fill} isAnimationActive={false} />
                        ))}
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
                          domain={chartYDomain}
                          stroke="var(--text-muted)"
                          tick={{ fontSize: 9 }}
                          width={28}
                        />
                        <Tooltip content={() => null} cursor={false} />
                        <Scatter dataKey="duration" fill="var(--accent)" shape={ScatterDot} isAnimationActive={false} />
                        {(chartTooltip.point || chartTooltipPinned?.point) && (
                          <ReferenceDot
                            x={(chartTooltipPinned?.point ?? chartTooltip.point).ts}
                            y={(chartTooltipPinned?.point ?? chartTooltip.point).duration}
                            r={6}
                            fill="transparent"
                            stroke="var(--accent)"
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                        )}
                        {showAverageLine && averageDuration != null && (
                          <ReferenceLine
                            y={averageDuration}
                            stroke="var(--chart-average-line)"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            isAnimationActive={false}
                          />
                        )}
                        {displayMinPoints.map((pt, i) => (
                          <ReferenceDot
                            key={`min-${pt.ts}-${i}`}
                            x={pt.ts}
                            y={pt.duration}
                            r={5}
                            fill="var(--success)"
                            stroke="var(--surface)"
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                        ))}
                        {displayMaxPoints.map((pt, i) => (
                          <ReferenceDot
                            key={`max-${pt.ts}-${i}`}
                            x={pt.ts}
                            y={pt.duration}
                            r={5}
                            fill="var(--warning)"
                            stroke="var(--surface)"
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {chartTooltip.point && (
                  <div
                    className="job-chart-hover-tooltip"
                    style={{
                      position: 'fixed',
                      left: chartTooltip.x + 14,
                      top: chartTooltip.y,
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                  >
                    {new Date(chartTooltip.point.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    <span className="job-chart-hover-tooltip-sep"> · </span>
                    {chartTooltip.point.duration} min
                  </div>
                )}
                {chartTooltipPinned?.point && (
                  <div
                    className="job-chart-custom-tooltip"
                    style={{
                      position: 'fixed',
                      left: chartTooltipPinned.x,
                      top: chartTooltipPinned.y,
                      transform: 'translate(-100%, -50%)',
                      pointerEvents: 'none',
                    }}
                  >
                    <div className="job-chart-custom-tooltip-label">
                      {formatXTick(chartTooltipPinned.point.ts)}
                    </div>
                    <div className="job-chart-custom-tooltip-value">
                      {chartTooltipPinned.point.duration} min
                    </div>
                    <div className="job-chart-custom-tooltip-hint">Click for details</div>
                  </div>
                )}
              </div>
              {chartPopupSnapshot && (
                <div
                  className="modal-overlay"
                  onClick={() => { setChartPopupSnapshot(null); setChartTooltipPinned(null) }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Route details"
                >
                  <div
                    className="modal-content card"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="job-chart-snapshot-popup-head">
                      <h3 className="job-chart-snapshot-popup-title">
                        {formatTime(chartPopupSnapshot.collected_at)}
                      </h3>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setChartPopupSnapshot(null); setChartTooltipPinned(null) }}
                        aria-label="Close"
                      >
                        Close
                      </button>
                    </div>
                    <SnapshotDetail snapshot={chartPopupSnapshot} />
                  </div>
                </div>
              )}
              {(minDurationInRange != null || maxDurationInRange != null || averageDuration != null || displayMinPoints.length > 0 || displayMaxPoints.length > 0) && (
                <div className="job-chart-side-labels">
                  {averageDuration != null && (
                    <div className="job-chart-side-item job-chart-side-avg">
                      <span className="job-chart-side-label">Avg (all)</span>
                      <span className="job-chart-side-value">{averageDuration.toFixed(1)} min</span>
                    </div>
                  )}
                  {minMaxMode !== 'off' && displayMinPoints.length > 0 && (
                    <div className="job-chart-side-item job-chart-side-low">
                      <span className="job-chart-side-label">{minMaxMode === 'perDay' ? 'Low (per day)' : 'Low'}</span>
                      <span className="job-chart-side-value">
                        {minMaxMode === 'perDay' && displayMinPoints.length > 0
                          ? `${formatDurationMin(Math.min(...displayMinPoints.map((p) => p.duration)))} min`
                          : minDurationInRange != null
                            ? `${formatDurationMin(minDurationInRange)} min`
                            : ''}
                      </span>
                      <span className="job-chart-side-time">
                        {displayMinPoints.length === 1
                          ? formatXTick(displayMinPoints[0].ts)
                          : minMaxMode === 'perDay'
                            ? `${displayMinPoints.length} points`
                            : `${displayMinPoints.length} times`}
                      </span>
                      <button
                        type="button"
                        className="job-chart-side-detail-btn"
                        onClick={() => {
                          const snap = getSnapshotForPoint(displayMinPoints[0])
                          if (snap) setChartPopupSnapshot(snap)
                        }}
                      >
                        Route detail
                      </button>
                    </div>
                  )}
                  {minMaxMode !== 'off' && displayMaxPoints.length > 0 && (
                    <div className="job-chart-side-item job-chart-side-high">
                      <span className="job-chart-side-label">{minMaxMode === 'perDay' ? 'High (per day)' : 'High'}</span>
                      <span className="job-chart-side-value">
                        {minMaxMode === 'perDay' && displayMaxPoints.length > 0
                          ? `${formatDurationMin(Math.max(...displayMaxPoints.map((p) => p.duration)))} min`
                          : maxDurationInRange != null
                            ? `${formatDurationMin(maxDurationInRange)} min`
                            : ''}
                      </span>
                      <span className="job-chart-side-time">
                        {displayMaxPoints.length === 1
                          ? formatXTick(displayMaxPoints[0].ts)
                          : minMaxMode === 'perDay'
                            ? `${displayMaxPoints.length} points`
                            : `${displayMaxPoints.length} times`}
                      </span>
                      <button
                        type="button"
                        className="job-chart-side-detail-btn"
                        onClick={() => {
                          const snap = getSnapshotForPoint(displayMaxPoints[0])
                          if (snap) setChartPopupSnapshot(snap)
                        }}
                      >
                        Route detail
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="route-empty-msg">No data in this range. Try another range or &quot;All&quot;.</p>
          )}
        </section>
      )}

      {/* Data table */}
      <section className="route-data">
        <h2 className="route-section-title">Collected data</h2>
        <p className="route-data-hint">Click a row to view map and directions</p>
        {snapshots.length === 0 ? (
          <p className="route-empty-msg">No data yet.</p>
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
                {(showAllSnapshots ? primarySnapshots.slice() : primarySnapshots.slice(-5)).reverse().map(s => {
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
            {primarySnapshots.length > 5 && (
              <div className="job-table-footer">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAllSnapshots(prev => !prev)}
                >
                  {showAllSnapshots ? 'Show last 5' : `Expand to see all (${primarySnapshots.length})`}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
