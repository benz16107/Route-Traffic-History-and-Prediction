const API = '/api'

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) reject(new Error('Location permission denied'))
        else if (err.code === 2) reject(new Error('Location unavailable'))
        else if (err.code === 3) reject(new Error('Location request timed out'))
        else reject(new Error(err.message || 'Could not get location'))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

export async function getCurrentLocationAddress() {
  const { lat, lng } = await getCurrentLocation()
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  const res = await fetch(`${API}/reverse-geocode?${params}`, { credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || `Request failed: ${res.status}`)
  }
  const data = await res.json()
  return data?.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}
