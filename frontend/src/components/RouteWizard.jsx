import { useState } from 'react'
import PlaceAutocomplete from './PlaceAutocomplete'
import { fetchJson } from '../utils/api.js'
import { getCurrentLocationAddress } from '../utils/geolocation.js'

const API = '/api'

const STEPS = ['Locations', 'Schedule', 'Review']

export default function RouteWizard({ onCreated, onCancel }) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [form, setForm] = useState({
    start_location: '',
    end_location: '',
    start_time: '',
    end_time: '',
    cycle_value: 60,
    cycle_unit: 'minutes',
    duration_days: 7,
    navigation_type: 'driving',
    avoid_highways: false,
    avoid_tolls: false,
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value),
    }))
  }

  const cycleMin = form.cycle_unit === 'minutes' ? 1 : 10
  const cycleMax = form.cycle_unit === 'minutes' ? 1440 : 86400

  const getCyclePayload = () => {
    const v = Math.max(cycleMin, Math.min(cycleMax, Number(form.cycle_value) || cycleMin))
    if (form.cycle_unit === 'seconds') return { cycle_minutes: 0, cycle_seconds: v }
    return { cycle_minutes: v, cycle_seconds: 0 }
  }

  const canProceed = () => {
    if (step === 0) return form.start_location.trim() && form.end_location.trim()
    if (step === 1) return form.cycle_value > 0 && form.duration_days > 0
    return true
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (step < 2) {
      setStep(s => s + 1)
      setError('')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await fetchJson(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          ...getCyclePayload(),
        }),
      })
      if (data?.error) throw new Error(data.error)
      onCreated(data.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUseCurrentLocation = async () => {
    setLocationLoading(true)
    setError('')
    try {
      const address = await getCurrentLocationAddress()
      setForm(prev => ({ ...prev, start_location: address }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLocationLoading(false)
    }
  }

  const handleCycleValueChange = (e) => {
    const raw = e.target.value
    if (raw === '') {
      setForm(prev => ({ ...prev, cycle_value: '' }))
      return
    }
    const num = Number(raw)
    if (!Number.isNaN(num)) setForm(prev => ({ ...prev, cycle_value: num }))
  }

  const handleCycleUnitChange = (e) => {
    const newUnit = e.target.value
    setForm(prev => {
      const curVal = Number(prev.cycle_value)
      const num = Number.isNaN(curVal) || curVal <= 0 ? 60 : curVal
      if (prev.cycle_unit === 'minutes' && newUnit === 'seconds') {
        return { ...prev, cycle_unit: newUnit, cycle_value: Math.max(10, Math.min(86400, num * 60)) }
      }
      if (prev.cycle_unit === 'seconds' && newUnit === 'minutes') {
        return { ...prev, cycle_unit: newUnit, cycle_value: Math.max(1, Math.min(1440, Math.round(num / 60))) }
      }
      return { ...prev, cycle_unit: newUnit }
    })
  }

  return (
    <div className="wizard">
      <div className="wizard-header">
        <button type="button" className="wizard-close" onClick={onCancel} aria-label="Close">
          ×
        </button>
        <div className="wizard-steps">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            >
              <span className="wizard-step-num">{i < step ? '✓' : i + 1}</span>
              <span className="wizard-step-label">{label}</span>
              {i < STEPS.length - 1 && <span className="wizard-step-line" />}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="wizard-body">
        {step === 0 && (
          <div className="wizard-panel">
            <h2>Where do you want to track?</h2>
            <p className="wizard-desc">Enter the start and end of the route.</p>
            <div className="form-group">
              <label>From</label>
              <div className="input-with-action">
                <PlaceAutocomplete
                  value={form.start_location}
                  onChange={(v) => setForm(prev => ({ ...prev, start_location: v }))}
                  placeholder="Start address"
                  id="wiz_start"
                  required
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleUseCurrentLocation}
                  disabled={locationLoading}
                  title="Use current location"
                >
                  {locationLoading ? '…' : '📍'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>To</label>
              <PlaceAutocomplete
                value={form.end_location}
                onChange={(v) => setForm(prev => ({ ...prev, end_location: v }))}
                placeholder="Destination address"
                id="wiz_end"
                required
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-panel">
            <h2>How often should we check?</h2>
            <p className="wizard-desc">Set the collection interval and duration.</p>
            <div className="form-row">
              <div className="form-group">
                <label>Check every</label>
                <div className="input-group">
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
                  />
                  <select value={form.cycle_unit} onChange={handleCycleUnitChange}>
                    <option value="minutes">min</option>
                    <option value="seconds">sec</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>For (days)</label>
                <input
                  name="duration_days"
                  type="number"
                  min={1}
                  max={365}
                  value={form.duration_days}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Mode</label>
              <select name="navigation_type" value={form.navigation_type} onChange={handleChange}>
                <option value="driving">Driving</option>
                <option value="walking">Walking</option>
                <option value="transit">Transit</option>
              </select>
            </div>
            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" name="avoid_highways" checked={form.avoid_highways} onChange={handleChange} />
                Avoid highways
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="avoid_tolls" checked={form.avoid_tolls} onChange={handleChange} />
                Avoid tolls
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel">
            <h2>Ready to track</h2>
            <p className="wizard-desc">Review and start collecting.</p>
            <div className="review-card">
              <div className="review-route">
                {form.start_location || '—'} → {form.end_location || '—'}
              </div>
              <div className="review-meta">
                Every {form.cycle_unit === 'seconds' ? `${form.cycle_value} sec` : `${form.cycle_value} min`} · {form.duration_days} days · {form.navigation_type}
              </div>
            </div>
          </div>
        )}

        {error && <div className="wizard-error">{error}</div>}

        <div className="wizard-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canProceed() || loading}
          >
            {step < 2 ? 'Next' : loading ? 'Creating…' : 'Start tracking'}
          </button>
        </div>
      </form>
    </div>
  )
}
