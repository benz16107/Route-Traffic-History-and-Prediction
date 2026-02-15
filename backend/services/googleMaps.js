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

async function fetchDirections(origin, destination, { mode, avoidHighways, avoidTolls, alternatives }) {
  const params = new URLSearchParams({
    origin,
    destination,
    mode: mode === 'transit' ? 'transit' : mode === 'walking' ? 'walking' : 'driving',
    alternatives: alternatives ? 'true' : 'false',
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  const avoid = [];
  if (avoidHighways) avoid.push('highways');
  if (avoidTolls) avoid.push('tolls');
  if (avoid.length) params.set('avoid', avoid.join('|'));

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
  const {
    mode = 'driving',
    avoidHighways = false,
    avoidTolls = false,
    alternatives = 0,
  } = options;

  const routesToFetch = 1 + (alternatives > 0 ? Math.min(alternatives, 2) : 0);
  const allRoutes = [];

  // Call 1: Primary route (user's preferences, with alternatives if requested)
  const primary = await fetchDirections(origin, destination, {
    mode,
    avoidHighways,
    avoidTolls,
    alternatives: alternatives > 0,
  });
  let routeIndex = 0;
  for (const r of primary) {
    if (routeIndex >= routesToFetch) break;
    allRoutes.push({
      routeIndex: routeIndex++,
      durationSeconds: r.legs?.[0]?.duration?.value ?? null,
      distanceMeters: r.legs?.[0]?.distance?.value ?? null,
      steps: r.legs?.[0]?.steps?.map(s => ({
        instruction: s.html_instructions,
        duration: s.duration?.value,
        distance: s.distance?.value,
      })) ?? [],
      summary: r.summary ?? null,
    });
  }

  // Call 2 & 3: Get different routes by varying avoid params (when we need more)
  const isDifferent = (existing, newRoute) => {
    const newDur = newRoute.legs?.[0]?.duration?.value;
    const newDist = newRoute.legs?.[0]?.distance?.value;
    return !existing.some(r =>
      Math.abs((r.durationSeconds || 0) - (newDur || 0)) < 30 &&
      Math.abs((r.distanceMeters || 0) - (newDist || 0)) < 500
    );
  };
  if (routeIndex < routesToFetch && !avoidHighways) {
    const alt = await fetchDirections(origin, destination, {
      mode,
      avoidHighways: true,
      avoidTolls,
      alternatives: false,
    });
    if (alt[0] && isDifferent(allRoutes, alt[0])) {
      allRoutes.push({
        routeIndex: routeIndex++,
        durationSeconds: alt[0].legs?.[0]?.duration?.value ?? null,
        distanceMeters: alt[0].legs?.[0]?.distance?.value ?? null,
        steps: alt[0].legs?.[0]?.steps?.map(s => ({
          instruction: s.html_instructions,
          duration: s.duration?.value,
          distance: s.distance?.value,
        })) ?? [],
        summary: alt[0].summary ?? null,
      });
    }
  }
  if (routeIndex < routesToFetch && !avoidTolls) {
    const alt = await fetchDirections(origin, destination, {
      mode,
      avoidHighways,
      avoidTolls: true,
      alternatives: false,
    });
    if (alt[0] && isDifferent(allRoutes, alt[0])) {
      allRoutes.push({
        routeIndex: routeIndex++,
        durationSeconds: alt[0].legs?.[0]?.duration?.value ?? null,
        distanceMeters: alt[0].legs?.[0]?.distance?.value ?? null,
        steps: alt[0].legs?.[0]?.steps?.map(s => ({
          instruction: s.html_instructions,
          duration: s.duration?.value,
          distance: s.distance?.value,
        })) ?? [],
        summary: alt[0].summary ?? null,
      });
    }
  }

  return allRoutes;
}

/** Get multiple routes with polylines for map display */
export async function getRoutePolylines(origin, destination, options = {}) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  }
  const { mode = 'driving', avoidHighways = false, avoidTolls = false, additionalRoutes = 0 } = options;
  const routesToFetch = 1 + Math.min(additionalRoutes || 0, 2);

  const fetchAndDecode = async (opts) => {
    const raw = await fetchDirections(origin, destination, opts);
    return raw.map(r => {
      const encoded = r.overview_polyline?.points;
      const points = encoded ? decodePolyline(encoded) : [];
      const leg = r.legs?.[0];
      return {
        points,
        start: leg?.start_location ? [leg.start_location.lat, leg.start_location.lng] : points[0],
        end: leg?.end_location ? [leg.end_location.lat, leg.end_location.lng] : points[points.length - 1],
        durationSeconds: leg?.duration?.value ?? null,
        distanceMeters: leg?.distance?.value ?? null,
      };
    });
  };

  const result = [];
  const primary = await fetchAndDecode({ mode, avoidHighways, avoidTolls, alternatives: routesToFetch > 1 });
  let idx = 0;
  for (const r of primary) {
    if (idx >= routesToFetch) break;
    result.push({ ...r, routeIndex: idx++ });
  }

  const isDifferent = (existing, newR) =>
    !existing.some(r =>
      Math.abs((r.durationSeconds || 0) - (newR.durationSeconds || 0)) < 30 &&
      Math.abs((r.distanceMeters || 0) - (newR.distanceMeters || 0)) < 500
    );

  if (idx < routesToFetch && !avoidHighways) {
    const alt = await fetchAndDecode({ mode, avoidHighways: true, avoidTolls, alternatives: false });
    if (alt[0] && isDifferent(result, alt[0])) {
      result.push({ ...alt[0], routeIndex: idx++ });
    }
  }
  if (idx < routesToFetch && !avoidTolls) {
    const alt = await fetchAndDecode({ mode, avoidHighways, avoidTolls: true, alternatives: false });
    if (alt[0] && isDifferent(result, alt[0])) {
      result.push({ ...alt[0], routeIndex: idx++ });
    }
  }

  return result;
}
