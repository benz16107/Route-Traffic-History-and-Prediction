import { useState, useEffect } from 'react'
import { fetchJson } from '../utils/api.js'

const API = '/api'

function toDatetimeLocal(str) {
  if (!str) return ''
  const d = new Date(str)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16)
}

// Read saved custom names from job (same keys as API / formatJob)
function getJobName(job, key) {
  if (!job || typeof job !== 'object') return ''
  const v = job[key] ?? job[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]
  return v != null ? String(v).trim() : ''
}

export default function EditJob({ job, onSaved, onCancel, isRunning = false }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    start_name: '',
    end_name: '',
    name: '',
    end_time: '',
    cycle_value: 60,
    cycle_unit: 'minutes',
  })

  useEffect(() => {
    if (job) {
      const useSeconds = (job.cycle_seconds ?? 0) > 0
      const cycleVal = useSeconds ? (job.cycle_seconds || 60) : (job.cycle_minutes ?? 60)
      setForm({
        start_name: getJobName(job, 'start_name'),
        end_name: getJobName(job, 'end_name'),
        name: getJobName(job, 'name') || getJobName(job, 'routeName'),
        end_time: toDatetimeLocal(job.end_time),
        cycle_value: cycleVal,
        cycle_unit: useSeconds ? 'seconds' : 'minutes',
      })
    }
  }, [job?.id, job?.name, job?.start_name, job?.end_name])

  const cycleMin = form.cycle_unit === 'minutes' ? 1 : 10
  const cycleMax = form.cycle_unit === 'minutes' ? 1440 : 86400

  const getCyclePayload = () => {
    const v = Math.max(cycleMin, Math.min(cycleMax, Number(form.cycle_value) || cycleMin))
    if (form.cycle_unit === 'seconds') {
      return { cycle_minutes: 0, cycle_seconds: v }
    }
    return { cycle_minutes: v, cycle_seconds: 0 }
  }

  const handleCycleValueChange = (e) => {
    const raw = e.target.value
    if (raw === '') {
      setForm(prev => ({ ...prev, cycle_value: '' }))
      return
    }
    const num = Number(raw)
    if (!Number.isNaN(num)) {
      setForm(prev => ({ ...prev, cycle_value: num }))
    }
  }

  const handleCycleUnitChange = (e) => {
    const newUnit = e.target.value
    setForm(prev => {
      const curVal = Number(prev.cycle_value)
      const num = Number.isNaN(curVal) || curVal <= 0 ? (prev.cycle_unit === 'minutes' ? 60 : 60) : curVal
      if (prev.cycle_unit === 'minutes' && newUnit === 'seconds') {
        return { ...prev, cycle_unit: newUnit, cycle_value: Math.max(10, Math.min(86400, num * 60)) }
      }
      if (prev.cycle_unit === 'seconds' && newUnit === 'minutes') {
        return { ...prev, cycle_unit: newUnit, cycle_value: Math.max(1, Math.min(1440, Math.round(num / 60))) }
      }
      return { ...prev, cycle_unit: newUnit }
    })
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const trimOrNull = (v) => (v != null ? (String(v).trim() || null) : null)
      const nameFields = {
        name: trimOrNull(form.name),
        start_name: trimOrNull(form.start_name),
        end_name: trimOrNull(form.end_name),
      }
      const payload = isRunning
        ? nameFields
        : {
            ...nameFields,
            end_time: form.end_time || null,
            ...getCyclePayload(),
          }
      const data = await fetchJson(`${API}/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (data?.error) throw new Error(data.error)
      onSaved(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!job) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content card" onClick={e => e.stopPropagation()}>
        <h2>Edit route</h2>
        {isRunning && (
          <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            While collecting, only start name, end name, and route title can be changed.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Start name (optional)</label>
              <input
                type="text"
                name="start_name"
                value={form.start_name}
                onChange={handleChange}
                placeholder="e.g. Home"
                maxLength={80}
              />
            </div>
            <div className="form-group">
              <label>End name (optional)</label>
              <input
                type="text"
                name="end_name"
                value={form.end_name}
                onChange={handleChange}
                placeholder="e.g. Office"
                maxLength={80}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Route title (optional)</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Overrides start → end as the main title"
              maxLength={120}
            />
          </div>

          {!isRunning && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Cycle time</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      min={cycleMin}
                      max={cycleMax}
                      value={form.cycle_value === '' ? '' : form.cycle_value}
                      onChange={handleCycleValueChange}
                      onBlur={() => {
                        const v = Number(form.cycle_value)
                        if (form.cycle_value === '' || Number.isNaN(v) || v < cycleMin || v > cycleMax) {
                          setForm(prev => ({ ...prev, cycle_value: cycleMin }))
                        }
                      }}
                      style={{ width: '6rem' }}
                      aria-label="Cycle duration"
                    />
                    <select
                      value={form.cycle_unit}
                      onChange={handleCycleUnitChange}
                      aria-label="Cycle unit"
                    >
                      <option value="minutes">minutes</option>
                      <option value="seconds">seconds</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>End date (optional)</label>
                  <input
                    name="end_time"
                    type="datetime-local"
                    value={form.end_time}
                    onChange={handleChange}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    When to stop collecting data. Leave empty for no end date.
                  </p>
                </div>
              </div>
            </>
          )}

          {error && <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
