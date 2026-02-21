import { useState, useEffect, useRef } from 'react'

const API = '/api'

/** Derive country code from browser locale (e.g. en-US → us, en-GB → gb) or env override */
function getDefaultCountry() {
  const env = import.meta.env?.VITE_PLACES_COUNTRY || ''
  if (env && env.length === 2) return env.toLowerCase()
  const lang = typeof navigator !== 'undefined' ? navigator.language : ''
  const parts = lang.split('-')
  const region = parts[parts.length - 1]
  if (region && region.length === 2) return region.toLowerCase()
  return ''
}

export default function PlaceAutocomplete({ value, onChange, placeholder, id, required, countryCode }) {
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef(null)

  const country = countryCode ?? getDefaultCountry()

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!value || value.length < 3) {
      setSuggestions([])
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ input: value.trim() })
        if (country) params.set('country', country)
        const res = await fetch(`${API}/place-autocomplete?${params}`, { credentials: 'include' })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Autocomplete failed')
        setSuggestions(data.predictions || [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [value, country])

  const selectSuggestion = (item) => {
    const addr = item.description || ''
    if (addr) onChange(addr)
    setSuggestions([])
    setShowDropdown(false)
  }

  return (
    <div ref={wrapperRef} className="place-autocomplete-wrapper" style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowDropdown(true)
        }}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        className="place-input"
        required={!!required}
        autoComplete="off"
      />
      {loading && (
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Searching...
        </span>
      )}
      {showDropdown && suggestions.length > 0 && (
        <ul
          className="place-autocomplete-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            margin: 0,
            padding: 0,
            listStyle: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 1000,
          }}
        >
          {suggestions.map((item, i) => (
            <li
              key={item.place_id || i}
              onClick={() => selectSuggestion(item)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {item.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
