// src/data/coverage.js
//
// Per-country coverage geography. Deliberately carries NO user counts,
// transaction volumes or TPS figures.
//
// It used to: every row had baseUsers/baseVolume/baseTps, invented numbers
// summing to 13,422,000 "users". The registration country picker added them
// up and displayed that total, while the Coverage screen showed the real
// count from this account's own activity — so the app claimed 13.4M users
// on one screen and 1 on another. baseVolume and baseTps were never read by
// anything at all.
//
// There is no backend endpoint that reports a user count (the only route
// under /api/users is /api/users/resolve), so a real total cannot be shown
// yet. Nothing invents one in the meantime.
var COVERAGE_COUNTRIES_RAW = [
  { code: "IN", lat: 20.5937, lng: 78.9629, integrated: "Jan 2023", zoom: 2.2 },
  { code: "US", lat: 39.8283, lng: -98.5795, integrated: "Nov 2022", zoom: 1.8 },
  { code: "GB", lat: 55.3781, lng: -3.436, integrated: "Feb 2023", zoom: 4.5 },
  { code: "PK", lat: 30.3753, lng: 69.3451, integrated: "Mar 2024", zoom: 3 },
  { code: "CA", lat: 56.1304, lng: -106.3468, integrated: "May 2023", zoom: 1.5 },
  { code: "DE", lat: 51.1657, lng: 10.4515, integrated: "Jul 2023", zoom: 4 },
  { code: "BR", lat: -14.235, lng: -51.9253, integrated: "Sep 2023", zoom: 1.7 },
  { code: "AE", lat: 23.4241, lng: 53.8478, integrated: "Apr 2024", zoom: 5.5 },
  { code: "CN", lat: 35.8617, lng: 104.1954, integrated: "Jun 2023", zoom: 1.7 },
  { code: "JP", lat: 36.2048, lng: 138.2529, integrated: "Aug 2023", zoom: 3.8 },
  { code: "FR", lat: 46.6034, lng: 1.8883, integrated: "Oct 2023", zoom: 4 },
  { code: "IT", lat: 41.8719, lng: 12.5674, integrated: "Dec 2023", zoom: 4.2 },
  { code: "RU", lat: 61.524, lng: 105.3188, integrated: "Jan 2024", zoom: 1.2 },
  { code: "KR", lat: 35.9078, lng: 127.7669, integrated: "Feb 2024", zoom: 5 },
  { code: "AU", lat: -25.2744, lng: 133.7751, integrated: "Mar 2024", zoom: 1.8 },
  { code: "ES", lat: 40.4637, lng: -3.7492, integrated: "May 2024", zoom: 4.3 },
  { code: "MX", lat: 23.6345, lng: -102.5528, integrated: "Jun 2024", zoom: 2.8 },
  { code: "ID", lat: -0.7893, lng: 113.9213, integrated: "Jul 2024", zoom: 1.9 },
  { code: "NL", lat: 52.1326, lng: 5.2913, integrated: "Aug 2024", zoom: 5.5 },
  { code: "SA", lat: 23.8859, lng: 45.0792, integrated: "Sep 2024", zoom: 2.8 },
  { code: "CH", lat: 46.8182, lng: 8.2275, integrated: "Oct 2024", zoom: 6 },
  { code: "TR", lat: 38.9637, lng: 35.2433, integrated: "Nov 2024", zoom: 3.5 }
];
var COVERAGE_COUNTRIES = COVERAGE_COUNTRIES_RAW.map((c) => ({
  ...c,
  name: COUNTRY_BY_ISO[c.code]?.name || c.code
}));
var ACTIVE_ISO_SET = new Set(COVERAGE_COUNTRIES_RAW.map((c) => c.code));
var COVERAGE_BY_ISO = Object.fromEntries(COVERAGE_COUNTRIES.map((c) => [c.code, c]));
// `active` used to be set here, from the hardcoded 22-country list above.
// It was a SECOND answer to "is this country active on Gloobal", computed
// on every country and read by nothing — the Coverage screen took its lock
// state from the hardcoded `code === "IN"` test instead, and now takes it
// from GET /api/coverage, which decides it from real registered users.
//
// Removed rather than left dead: a field named `active` sitting on every
// country object is exactly what a future reader would reach for, and it
// would have disagreed with the real answer for every country except the
// 22 listed here. One rule, and it lives in
// server/lib/coverageAggregation.js.
//
// `coverage` stays. It carries this file's actual subject — the geography
// (lat/lng/zoom/integrated date) used to draw a country, which is not a
// status and has no server equivalent.
var COVERAGE_ALL_COUNTRIES = ALL_COUNTRIES.map((c) => {
  const code = c.iso;
  return { ...c, code, coverage: ACTIVE_ISO_SET.has(code) ? COVERAGE_BY_ISO[code] : null };
});

