/**
 * Google Maps Directions API client
 * Fetches route data: duration, distance, steps
 */
const DIRECTIONS_API = 'https://maps.googleapis.com/maps/api/directions/json';

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

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  }

  const res = await fetch(`${DIRECTIONS_API}?${params}`);
  const data = await res.json();

  if (data.status !== 'OK') {
    throw new Error(data.error_message || data.status || 'Directions API error');
  }
  if (!data.routes?.[0]) return null;

  const route = data.routes[0];
  const encoded = route.overview_polyline?.points;
  if (!encoded) return null;

  const points = decodePolyline(encoded);
  const leg = route.legs?.[0];
  return {
    points,
    start: leg?.start_location ? [leg.start_location.lat, leg.start_location.lng] : points[0],
    end: leg?.end_location ? [leg.end_location.lat, leg.end_location.lng] : points[points.length - 1],
  };
}

export async function getRoutes(origin, destination, options = {}) {
  const {
    mode = 'driving',
    avoidHighways = false,
    avoidTolls = false,
    alternatives = 0,
  } = options;

  const params = new URLSearchParams({
    origin,
    destination,
    mode: mode === 'transit' ? 'transit' : mode === 'walking' ? 'walking' : 'driving',
    alternatives: alternatives > 0 ? 'true' : 'false',
    key: process.env.GOOGLE_MAPS_API_KEY || '',
  });

  const avoid = [];
  if (avoidHighways) avoid.push('highways');
  if (avoidTolls) avoid.push('tolls');
  if (avoid.length) params.set('avoid', avoid.join('|'));

  const url = `${DIRECTIONS_API}?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status || 'Directions API error');
  }

  if (!data.routes?.length) {
    return [];
  }

  return data.routes.map((route, index) => ({
    routeIndex: index,
    durationSeconds: route.legs?.[0]?.duration?.value ?? null,
    distanceMeters: route.legs?.[0]?.distance?.value ?? null,
    steps: route.legs?.[0]?.steps?.map(s => ({
      instruction: s.html_instructions,
      duration: s.duration?.value,
      distance: s.distance?.value,
    })) ?? [],
    summary: route.summary ?? null,
  }));
}
