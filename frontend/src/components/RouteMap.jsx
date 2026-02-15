import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchJson } from '../utils/api.js'

const API = '/api'
const ROUTE_COLORS = ['#58a6ff', '#3fb950', '#d29922']

function FitBounds({ routes }) {
  const map = useMap()
  useEffect(() => {
    const allPoints = routes?.flatMap(r => r.points || []) || []
    if (allPoints.length) {
      const bounds = L.latLngBounds(allPoints.map(([lat, lng]) => [lat, lng]))
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [map, routes])
  return null
}

export default function RouteMap({ origin, destination, travelMode = 'driving', avoidHighways, avoidTolls, additionalRoutes = 0 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
    if (additionalRoutes > 0) params.set('additional_routes', String(additionalRoutes))

    fetchJson(`${API}/route-preview?${params}`)
      .then(res => {
        if (res.error) throw new Error(res.error)
        setData(res)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [origin, destination, travelMode, avoidHighways, avoidTolls, additionalRoutes])

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

  const routes = data?.routes || (data?.points ? [{ ...data, routeIndex: 0 }] : [])
  if (!routes.length || !routes[0]?.points?.length) {
    return <div className="map-placeholder">No route found</div>
  }

  const center = routes[0].start || routes[0].points[0]

  return (
    <div className="route-map-container">
      <MapContainer
        center={center}
        zoom={10}
        style={{ height: '400px', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routes.map((route, i) => (
          <Polyline
            key={i}
            positions={route.points.map(([lat, lng]) => [lat, lng])}
            color={ROUTE_COLORS[i % ROUTE_COLORS.length]}
            weight={4}
            opacity={0.8}
          />
        ))}
        <FitBounds routes={routes} />
      </MapContainer>
      {routes.length > 1 && (
        <div className="route-map-legend">
          {routes.map((r, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
              <span style={{ width: 12, height: 4, background: ROUTE_COLORS[i], borderRadius: 2 }} />
              Route {i + 1}
              {r.durationSeconds && ` (${Math.round(r.durationSeconds / 60)} min)`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
