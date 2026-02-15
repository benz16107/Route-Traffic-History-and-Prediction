import { useState } from 'react'
import PlaceAutocomplete from './PlaceAutocomplete'
import { fetchJson } from '../utils/api.js'

const API = '/api'

export default function CreateJob({ onCreated, onCancel }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    start_location: '',
    end_location: '',
    start_time: '',
    end_time: '',
    cycle_minutes: 60,
    duration_days: 7,
    navigation_type: 'driving',
    avoid_highways: false,
    avoid_tolls: false,
    additional_routes: 1,
  })

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
      const data = await fetchJson(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
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

  return (
    <div className="card">
      <h2>Create New Collection Job</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Start Location</label>
          <PlaceAutocomplete
            value={form.start_location}
            onChange={(v) => setForm(prev => ({ ...prev, start_location: v }))}
            placeholder="e.g. San Francisco, CA"
            id="start_location"
            required
          />
        </div>
        <div className="form-group">
          <label>Destination Location</label>
          <PlaceAutocomplete
            value={form.end_location}
            onChange={(v) => setForm(prev => ({ ...prev, end_location: v }))}
            placeholder="e.g. Oakland, CA"
            id="end_location"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Data Start Time (optional)</label>
            <input
              name="start_time"
              type="datetime-local"
              value={form.start_time}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Data End Time (optional)</label>
            <input
              name="end_time"
              type="datetime-local"
              value={form.end_time}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Cycle Duration (minutes)</label>
            <input
              name="cycle_minutes"
              type="number"
              min={1}
              max={1440}
              value={form.cycle_minutes}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Duration (days)</label>
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
          <label>Navigation Type</label>
          <select name="navigation_type" value={form.navigation_type} onChange={handleChange}>
            <option value="driving">Driving</option>
            <option value="walking">Walking</option>
            <option value="transit">Transit</option>
          </select>
        </div>

        <div className="form-group">
          <label>Route Preferences</label>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" name="avoid_highways" checked={form.avoid_highways} onChange={handleChange} />
              Avoid highways
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" name="avoid_tolls" checked={form.avoid_tolls} onChange={handleChange} />
              Avoid tolls
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>Additional Routes (0–2)</label>
          <input
            name="additional_routes"
            type="number"
            min={0}
            max={2}
            value={form.additional_routes}
            onChange={handleChange}
          />
          <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Collect alternative routes for comparison
          </small>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Job'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
