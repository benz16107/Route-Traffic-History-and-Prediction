import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchJson } from '../utils/api.js'
import { useTheme } from '../context/ThemeContext.jsx'

const API = '/api'

function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points?.length) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]))
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [map, points])
  return null
}

function RecenterButton({ points }) {
  const map = useMap()
  if (!points?.length) return null
  const handleClick = () => {
    const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]))
    map.fitBounds(bounds, { padding: [30, 30] })
  }
  return (
    <div className="route-map-recenter">
      <button
        type="button"
        className="route-map-recenter-btn"
        onClick={handleClick}
        aria-label="Recenter map on route"
        title="Recenter map"
      >
        ⌂
      </button>
    </div>
  )
}

const OSM_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}
const DARK_TILES = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}

export default function RouteMap({ origin, destination, travelMode = 'driving', avoidHighways, avoidTolls, lastSnapshotAt }) {
  const { theme } = useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const isDark = theme === 'dark'
  const tiles = isDark ? DARK_TILES : OSM_TILES
  const routeColor = isDark ? '#7dd3fc' : '#58a6ff'

  useEffect(() => {
    if (!origin || !destination) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      origin,
      destination,
      mode: travelMode,
    })
    if (avoidHighways) params.set('avoid_highways', '1')
    if (avoidTolls) params.set('avoid_tolls', '1')

    fetchJson(`${API}/route-preview?${params}`)
      .then(res => {
        if (res.error) throw new Error(res.error)
        setData(res)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [origin, destination, travelMode, avoidHighways, avoidTolls, lastSnapshotAt])

  if (!origin || !destination) {
    return (
      <div className="map-placeholder">
        Set start and destination to view route
      </div>
    )
  }

  if (loading) {
    return <div className="map-placeholder">Loading route...</div>
  }

  if (error) {
    const mapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`
    return (
      <div className="map-placeholder map-error">
        <strong>Could not load route</strong>
        <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>{error}</p>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          View on Google Maps →
        </a>
      </div>
    )
  }

  const points = data?.points
  if (!points?.length) {
    return <div className="map-placeholder">No route found</div>
  }

  const center = data?.start || points[0]

  return (
    <div className="route-map-container">
      <MapContainer
        center={center}
        zoom={10}
        style={{ height: '180px', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={true}
      >
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        <Polyline
          positions={points.map(([lat, lng]) => [lat, lng])}
          color={routeColor}
          weight={4}
          opacity={0.8}
        />
        <FitBounds points={points} />
        <RecenterButton points={points} />
      </MapContainer>
    </div>
  )
}
