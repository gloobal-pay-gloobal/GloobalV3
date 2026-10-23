// src/data/essentialsBaseline.js
// ---------------------------------------------------------------------
// MOCK DATA LAYER — placeholder only, not sourced from any verified
// cost-of-living dataset. These numbers exist so the UI has something
// to render; they are NOT real and must not be presented as such.
// Do not extend this table with additional invented countries — add
// real entries only when the real dataset is provided.
//
// Shape contract for every entry (per ISO-3166 alpha-2 country code):
//   { food: number, water: number, shelter: number, creativity: number }
// All four values are USD-per-day. isValidEssentialsBaselineEntry()
// enforces this shape, so a future real dataset can be dropped in and
// any malformed row safely falls back instead of breaking the UI.
// ---------------------------------------------------------------------
var ESSENTIALS_BASELINE_DATA_SOURCE = "mock-local";
var ESSENTIALS_BASELINE_METHODOLOGY_VERSION = "essentials-baseline-mock-v0.1";
var ESSENTIALS_BASELINE_DEFAULT_USD = { food: 6, water: 1.2, shelter: 11, creativity: 1.8 };
var ESSENTIALS_BASELINE_USD_BY_ISO = {
  US: { food: 9, water: 2, shelter: 32, creativity: 4 },
  GB: { food: 8.5, water: 1.9, shelter: 29, creativity: 3.6 },
  CA: { food: 8, water: 1.8, shelter: 27, creativity: 3.4 },
  AU: { food: 8.8, water: 2, shelter: 30, creativity: 3.8 },
  DE: { food: 7.6, water: 1.7, shelter: 24, creativity: 3.2 },
  FR: { food: 7.8, water: 1.7, shelter: 25, creativity: 3.3 },
  IT: { food: 7, water: 1.5, shelter: 22, creativity: 2.9 },
  ES: { food: 6.5, water: 1.4, shelter: 19, creativity: 2.6 },
  NL: { food: 7.9, water: 1.8, shelter: 27, creativity: 3.4 },
  CH: { food: 11, water: 2.4, shelter: 38, creativity: 4.8 },
  SE: { food: 8.2, water: 1.8, shelter: 26, creativity: 3.5 },
  IE: { food: 8.4, water: 1.9, shelter: 28, creativity: 3.6 },
  PL: { food: 5, water: 1, shelter: 13, creativity: 1.9 },
  IN: { food: 2.4, water: 0.4, shelter: 4.5, creativity: 0.8 },
  CN: { food: 4.2, water: 0.8, shelter: 9, creativity: 1.4 },
  JP: { food: 7.2, water: 1.6, shelter: 23, creativity: 3 },
  KR: { food: 6.8, water: 1.5, shelter: 21, creativity: 2.8 },
  ID: { food: 2.8, water: 0.5, shelter: 5, creativity: 0.9 },
  PH: { food: 2.6, water: 0.5, shelter: 4.6, creativity: 0.8 },
  VN: { food: 2.5, water: 0.5, shelter: 4.2, creativity: 0.8 },
  TH: { food: 3.4, water: 0.6, shelter: 6.5, creativity: 1.1 },
  MY: { food: 3.6, water: 0.7, shelter: 7, creativity: 1.2 },
  SG: { food: 7.4, water: 1.7, shelter: 26, creativity: 3.3 },
  PK: { food: 2, water: 0.35, shelter: 3.8, creativity: 0.6 },
  BD: { food: 1.9, water: 0.3, shelter: 3.4, creativity: 0.55 },
  SA: { food: 6.2, water: 1.3, shelter: 18, creativity: 2.4 },
  AE: { food: 7, water: 1.5, shelter: 24, creativity: 3 },
  IL: { food: 7.8, water: 1.7, shelter: 26, creativity: 3.3 },
  EG: { food: 2.1, water: 0.35, shelter: 4, creativity: 0.6 },
  ZA: { food: 3.2, water: 0.6, shelter: 8, creativity: 1.2 },
  NG: { food: 2.2, water: 0.4, shelter: 4.4, creativity: 0.7 },
  KE: { food: 2.4, water: 0.4, shelter: 4.8, creativity: 0.7 },
  BR: { food: 4.4, water: 0.9, shelter: 10, creativity: 1.6 },
  MX: { food: 4.6, water: 0.9, shelter: 11, creativity: 1.7 },
  AR: { food: 3.8, water: 0.7, shelter: 8.5, creativity: 1.3 },
  NZ: { food: 8.6, water: 1.9, shelter: 29, creativity: 3.7 }
};
var ESSENTIALS_BASELINE_REQUIRED_KEYS = ["food", "water", "shelter", "creativity"];
function isValidEssentialsBaselineEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  return ESSENTIALS_BASELINE_REQUIRED_KEYS.every(
    (k) => typeof entry[k] === "number" && Number.isFinite(entry[k]) && entry[k] >= 0
  );
}

// ---------------------------------------------------------------------
// REPOSITORY — the single seam a real data/API layer replaces later.
// Every consumer reads baseline data through this object, never
// through ESSENTIALS_BASELINE_USD_BY_ISO directly, so swapping
// getBaselineUSD's body (e.g. for an async fetch + cache) is a local
// change here and requires no change to computeEssentialsBaseline or
// any UI component.
// ---------------------------------------------------------------------
var EssentialsBaselineRepository = {
  dataSource: ESSENTIALS_BASELINE_DATA_SOURCE,
  getBaselineUSD(iso) {
    const entry = ESSENTIALS_BASELINE_USD_BY_ISO[iso];
    return isValidEssentialsBaselineEntry(entry) ? entry : ESSENTIALS_BASELINE_DEFAULT_USD;
  },
  hasCountry(iso) {
    return isValidEssentialsBaselineEntry(ESSENTIALS_BASELINE_USD_BY_ISO[iso]);
  }
};

// ---------------------------------------------------------------------
// DOMAIN LAYER — currency conversion + totals. Takes an optional
// repository so tests (and, later, a real data layer) can inject a
// substitute without touching this function.
// ---------------------------------------------------------------------
// ── GLOOBAL'S SHARE OF A DAY ─────────────────────────────────────────
//
// The table above estimates what a day of food, water, shelter and
// creativity costs. This is the fraction of that day Gloobal carries.
//
// A quarter, asked for in those words: "daily total 75% less then what we
// have". It is applied HERE, in the one function both the Essentials
// screen and the My Essentials category read, because the alternative is
// two screens quoting different daily totals for the same thing — a
// disagreement nobody reports and everybody notices.
//
// What the number is NOT is a cost of living. A quarter of an estimated
// day is a quarter of an estimated day, and every screen that shows it
// says "a quarter of" rather than letting the figure stand as the whole.
// The full estimate stays reachable in `fullDailyTotal` below so the two
// can be shown together without either being recomputed somewhere else
// and drifting.
var ESSENTIALS_GLOOBAL_SHARE = 0.25;

function computeEssentialsBaseline(iso, repository) {
  const repo = repository || EssentialsBaselineRepository;
  const currencyCode = COUNTRY_CURRENCY[iso] || "USD";
  const usedFallback = !repo.hasCountry(iso);
  const usd = repo.getBaselineUSD(iso);
  const toLocal = (v) => currencyCode === "USD" ? v : convert(v, "USD", currencyCode);
  // Scaled per component rather than only on the total, so the four bars
  // and the headline are the same arithmetic. Scaling the total alone
  // would leave four components that no longer add up to it.
  const share = (v) => toLocal(v) * ESSENTIALS_GLOOBAL_SHARE;
  const components = {
    food: share(usd.food),
    water: share(usd.water),
    shelter: share(usd.shelter),
    creativity: share(usd.creativity)
  };
  const fullDaily = toLocal(usd.food + usd.water + usd.shelter + usd.creativity);
  const dailyTotal = Math.round((components.food + components.water + components.shelter + components.creativity) * 100) / 100;
  return {
    currencyCode,
    components,
    dailyTotal,
    monthlyTotal: Math.round(dailyTotal * 30 * 100) / 100,
    // The whole estimated day, before Gloobal's share is taken. Carried so
    // a screen can say what the quarter is a quarter OF without working it
    // back out from the share and arriving at a different rounding.
    fullDailyTotal: Math.round(fullDaily * 100) / 100,
    share: ESSENTIALS_GLOOBAL_SHARE,
    methodologyVersion: ESSENTIALS_BASELINE_METHODOLOGY_VERSION,
    dataSource: repo.dataSource,
    usedFallback
  };
}

