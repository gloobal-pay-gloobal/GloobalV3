// src/domain/provenance/LocationResolver.js
// MOCK reverse-geocoding — nearest-city lookup against a small local
// table only. Not a real geocoding service, not network-backed (no
// external APIs). Coarse and approximate by design: good enough to
// show each user their own city/state, not precise enough to imply
// verified addresses. Swap resolveLocationLabel's body for a real
// geocoding call later without touching any caller.
var LOCATION_MOCK_CITIES = [
  { city: "New York", state: "NY", country: "US", lat: 40.7128, lon: -74.006 },
  { city: "Los Angeles", state: "CA", country: "US", lat: 34.0522, lon: -118.2437 },
  { city: "Chicago", state: "IL", country: "US", lat: 41.8781, lon: -87.6298 },
  { city: "Toronto", state: "ON", country: "CA", lat: 43.6532, lon: -79.3832 },
  { city: "London", state: "England", country: "GB", lat: 51.5074, lon: -0.1278 },
  { city: "Paris", state: "\xCEle-de-France", country: "FR", lat: 48.8566, lon: 2.3522 },
  { city: "Berlin", state: "Berlin", country: "DE", lat: 52.52, lon: 13.405 },
  { city: "Madrid", state: "Madrid", country: "ES", lat: 40.4168, lon: -3.7038 },
  { city: "Rome", state: "Lazio", country: "IT", lat: 41.9028, lon: 12.4964 },
  { city: "Dubai", state: "Dubai", country: "AE", lat: 25.2048, lon: 55.2708 },
  { city: "Mumbai", state: "Maharashtra", country: "IN", lat: 19.076, lon: 72.8777 },
  { city: "Delhi", state: "Delhi", country: "IN", lat: 28.6139, lon: 77.209 },
  { city: "Bengaluru", state: "Karnataka", country: "IN", lat: 12.9716, lon: 77.5946 },
  { city: "Singapore", state: "Singapore", country: "SG", lat: 1.3521, lon: 103.8198 },
  { city: "Tokyo", state: "Tokyo", country: "JP", lat: 35.6762, lon: 139.6503 },
  { city: "Seoul", state: "Seoul", country: "KR", lat: 37.5665, lon: 126.978 },
  { city: "Shanghai", state: "Shanghai", country: "CN", lat: 31.2304, lon: 121.4737 },
  { city: "Sydney", state: "NSW", country: "AU", lat: -33.8688, lon: 151.2093 },
  { city: "Sao Paulo", state: "SP", country: "BR", lat: -23.5505, lon: -46.6333 },
  { city: "Mexico City", state: "CDMX", country: "MX", lat: 19.4326, lon: -99.1332 },
  { city: "Lagos", state: "Lagos", country: "NG", lat: 6.5244, lon: 3.3792 },
  { city: "Nairobi", state: "Nairobi", country: "KE", lat: -1.2921, lon: 36.8219 },
  { city: "Cairo", state: "Cairo", country: "EG", lat: 30.0444, lon: 31.2357 },
  { city: "Johannesburg", state: "Gauteng", country: "ZA", lat: -26.2041, lon: 28.0473 }
];
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function resolveLocationLabel(observation) {
  if (!observation || !observation.hasCoordinates()) return null;
  let best = null;
  let bestDistanceKm = Infinity;
  for (const candidate of LOCATION_MOCK_CITIES) {
    const distanceKm = haversineKm(observation.latitude, observation.longitude, candidate.lat, candidate.lon);
    if (distanceKm < bestDistanceKm) {
      bestDistanceKm = distanceKm;
      best = candidate;
    }
  }
  if (!best) return null;
  return {
    city: best.city,
    state: best.state,
    country: best.country,
    approximate: true,
    nearestDistanceKm: Math.round(bestDistanceKm),
    stale: observation.status === LOCATION_STATUS.STALE
  };
}
// Real capture via the browser's native Geolocation API — a device
// capability, not a third-party network call, and not a mock. Always
// resolves a LocationObservation (never rejects, never returns bare
// coordinates or null) so every outcome — granted, denied, absent
// capability, or no answer in time — is represented explicitly rather
// than collapsed into "no location". Nothing here ever invents a
// coordinate: a failure of any kind produces a status, not a guess.
// `highAccuracy` asks for GPS rather than a network fix. Only the creator
// address uses it: placing a shop on the right side of a road needs metres,
// and the person is standing there waiting for it, whereas a payment's
// provenance needs only the city and must not hold up a payment.
function captureBrowserGeo({ timeoutMs = 4000, highAccuracy = false } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(new LocationObservation({ status: LOCATION_STATUS.UNAVAILABLE }));
      return;
    }
    let settled = false;
    const done = (observation) => {
      if (settled) return;
      settled = true;
      resolve(observation);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => done(new LocationObservation({
        status: LOCATION_STATUS.AVAILABLE,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        observedAt: /* @__PURE__ */ new Date()
      })),
      (err) => done(new LocationObservation({ status: err && err.code === 1 ? LOCATION_STATUS.DENIED : err && err.code === 3 ? LOCATION_STATUS.TIMEOUT : LOCATION_STATUS.UNAVAILABLE })),
      { timeout: timeoutMs, maximumAge: 0, enableHighAccuracy: Boolean(highAccuracy) }
    );
    setTimeout(() => done(new LocationObservation({ status: LOCATION_STATUS.TIMEOUT })), timeoutMs + 250);
  });
}

