/**
 * Google Maps API client with caching to reduce cost.
 * - Geocoding & reverse geocode: cached 24h (addresses don't change).
 * - Route polyline (preview): cached 5 min to avoid repeat calls when viewing maps.
 * - Directions for collection (getRoutes): not cached (need fresh traffic).
 */
const DIRECTIONS_API = 'https://maps.googleapis.com/maps/api/directions/json';
const GEOCODE_API = 'https://maps.googleapis.com/maps/api/geocode/json';

const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;   // 24h
const ROUTE_PREVIEW_TTL_MS = 5 * 60 * 1000;   // 5 min

const geocodeCache = new Map();
const reverseGeocodeCache = new Map();
const routePreviewCache = new Map();

function cacheGet(map, key, ttlMs) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > ttlMs) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}
function cacheSet(map, key, value, ttlMs) {
  map.set(key, { value, at: Date.now() });
  if (map.size > 500) {
    const cutoff = Date.now() - ttlMs;
    for (const [k, v] of map.entries()) {
      if (v.at < cutoff) map.delete(k);
    }
  }
}

function isLatLng(str) {
  return /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(String(str || '').trim());
}

async function geocodeAddressUncached(addr) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !addr?.trim()) return null;
  const params = new URLSearchParams({ address: addr.trim(), key: apiKey });
  const res = await fetch(`${GEOCODE_API}?${params}`);
  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  return loc ? `${loc.lat},${loc.lng}` : null;
}

async function geocodeAddress(addr) {
  const key = String(addr || '').trim().toLowerCase();
  if (!key) return null;
  const cached = cacheGet(geocodeCache, key, GEOCODE_TTL_MS);
  if (cached !== undefined) return cached;
  try {
    const result = await geocodeAddressUncached(addr);
    if (result) cacheSet(geocodeCache, key, result, GEOCODE_TTL_MS);
    return result;
  } catch (_) {}
  return null;
}

/** Reverse geocode lat,lng to address (cached 24h). */
export async function reverseGeocode(lat, lng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  }
  const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  const cached = cacheGet(reverseGeocodeCache, key, GEOCODE_TTL_MS);
  if (cached !== undefined) return cached;
  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: apiKey });
  const res = await fetch(`${GEOCODE_API}?${params}`);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error(data.error_message || data.status || 'No address found');
  }
  const address = data.results[0].formatted_address;
  cacheSet(reverseGeocodeCache, key, address, GEOCODE_TTL_MS);
  return address;
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export async function getRoutePolyline(origin, destination, options = {}) {
  const { mode = 'driving', avoidHighways = false, avoidTolls = false } = options;
  const cacheKey = [origin, destination, mode, avoidHighways, avoidTolls].join('|');
  const cached = cacheGet(routePreviewCache, cacheKey, ROUTE_PREVIEW_TTL_MS);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    origin,
    destination,
    mode: mode === 'transit' ? 'transit' : mode === 'walking' ? 'walking' : 'driving',
    alternatives: 'false',
    key: process.env.GOOGLE_MAPS_API_KEY || '',
  });
  const avoid = [];
  if (avoidHighways) avoid.push('highways');
  if (avoidTolls) avoid.push('tolls');
  if (avoid.length) params.set('avoid', avoid.join('|'));
  if (mode === 'driving') {
    params.set('departure_time', 'now');
    params.set('traffic_model', 'best_guess');
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  }

  const res = await fetch(`${DIRECTIONS_API}?${params}`);
  const data = await res.json();

  if (data.status === 'ZERO_RESULTS' || !data.routes?.[0]) {
    if (!isLatLng(origin) || !isLatLng(destination)) {
      const [o, d] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);
      if (o && d) return getRoutePolyline(o, d, options);
    }
    return null;
  }
  if (data.status !== 'OK') {
    throw new Error(data.error_message || data.status || 'Directions API error');
  }

  const route = data.routes[0];
  const encoded = route.overview_polyline?.points;
  if (!encoded) return null;

  const points = decodePolyline(encoded);
  const leg = route.legs?.[0];
  const result = {
    points,
    start: leg?.start_location ? [leg.start_location.lat, leg.start_location.lng] : points[0],
    end: leg?.end_location ? [leg.end_location.lat, leg.end_location.lng] : points[points.length - 1],
  };
  cacheSet(routePreviewCache, cacheKey, result, ROUTE_PREVIEW_TTL_MS);
  return result;
}

async function fetchDirections(origin, destination, { mode, avoidHighways, avoidTolls, alternatives, departureTime }) {
  const resolvedMode = mode === 'transit' ? 'transit' : mode === 'walking' ? 'walking' : 'driving';
  const params = new URLSearchParams({
    origin,
    destination,
    mode: resolvedMode,
    alternatives: alternatives ? 'true' : 'false',
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  // avoid (highways, tolls) only applies to driving - omit for walking/transit to avoid wrong results
  if (resolvedMode === 'driving') {
    const avoid = [];
    if (avoidHighways) avoid.push('highways');
    if (avoidTolls) avoid.push('tolls');
    if (avoid.length) params.set('avoid', avoid.join('|'));
  }
  if (resolvedMode === 'driving' && departureTime) {
    params.set('departure_time', departureTime);
    params.set('traffic_model', 'best_guess');
  }
  if (resolvedMode === 'transit') {
    params.set('departure_time', 'now');
  }

  const res = await fetch(`${DIRECTIONS_API}?${params}`);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status || 'Directions API error');
  }
  return data.routes || [];
}

export async function getRoutes(origin, destination, options = {}) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  }
  const { mode = 'driving', avoidHighways = false, avoidTolls = false } = options;

  let primary = await fetchDirections(origin, destination, {
    mode,
    avoidHighways,
    avoidTolls,
    alternatives: false,
    departureTime: mode === 'driving' ? 'now' : undefined,
  });
  if (!primary[0] && (!isLatLng(origin) || !isLatLng(destination))) {
    const o = isLatLng(origin) ? origin : await geocodeAddress(origin);
    const d = isLatLng(destination) ? destination : await geocodeAddress(destination);
    if (o && d) return getRoutes(o, d, options);
  }
  if (!primary[0]) return [];

  const r = primary[0];
  const leg = r.legs?.[0];
  const durationSeconds = mode === 'driving' && leg?.duration_in_traffic?.value != null
    ? leg.duration_in_traffic.value
    : leg?.duration?.value ?? null;

  const overviewEncoded = r.overview_polyline?.points;
  const points = overviewEncoded ? decodePolyline(overviewEncoded) : [];
  const start = leg?.start_location ? [leg.start_location.lat, leg.start_location.lng] : (points[0] || null);
  const end = leg?.end_location ? [leg.end_location.lat, leg.end_location.lng] : (points[points.length - 1] || null);

  const steps = (leg?.steps ?? []).map(s => ({
    instruction: s.html_instructions,
    duration: s.duration?.value,
    distance: s.distance?.value,
    distanceText: s.distance?.text,
    durationText: s.duration?.text,
    startLocation: s.start_location ? [s.start_location.lat, s.start_location.lng] : null,
    endLocation: s.end_location ? [s.end_location.lat, s.end_location.lng] : null,
    polylinePoints: s.polyline?.points ? decodePolyline(s.polyline.points) : [],
  }));

  return [{
    routeIndex: 0,
    durationSeconds,
    distanceMeters: leg?.distance?.value ?? null,
    points,
    start,
    end,
    steps,
    summary: r.summary ?? null,
  }];
}
