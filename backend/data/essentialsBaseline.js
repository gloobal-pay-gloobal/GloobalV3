// src/data/essentialsBaseline.js
// ---------------------------------------------------------------------
// ESSENTIALS, PER COUNTRY, IN ITS OWN MONEY
//
// "Essentials are independent from global currency and FX, because we are
// sharing local units with local people from a local pool." So every
// country has its own daily amount in its own currency, and nothing here
// converts money. An amount changes only when GLOOBAL changes this table.
//
//   IN    ₹200 a day, set by the founder (status "set").
//   rest  scaled from India by the World Bank's 2024 PPP conversion factor
//         for private consumption (local money per international $), then
//         rounded. Status "assumed" until checked locally before launch.
//   none  Essentials are not available in that country yet.
//
// The same table is in server/lib/essentials.js, which pays the money;
// tests/essentials-held-0208.test.mjs fails if the two ever differ.
// ---------------------------------------------------------------------
var ESSENTIALS_BASELINE_DATA_SOURCE = "local-table";
var ESSENTIALS_BASELINE_METHODOLOGY_VERSION = "essentials-local-2026-11";
var ESSENTIALS_LOCAL_BY_ISO = {
  IN: { currency: "INR", daily: 200, food: 100, shelter: 70, water: 10, creativity: 20, status: "set" },
  BD: { currency: "BDT", daily: 330, food: 165, shelter: 115.5, water: 16.5, creativity: 33, status: "assumed" },
  BR: { currency: "BRL", daily: 25, food: 12.5, shelter: 8.75, water: 1.25, creativity: 2.5, status: "assumed" },
  CN: { currency: "CNY", daily: 36, food: 18, shelter: 12.6, water: 1.8, creativity: 3.6, status: "assumed" },
  KE: { currency: "KES", daily: 450, food: 225, shelter: 157.5, water: 22.5, creativity: 45, status: "assumed" },
  MY: { currency: "MYR", daily: 14.5, food: 7.25, shelter: 5.07, water: 0.73, creativity: 1.45, status: "assumed" },
  PH: { currency: "PHP", daily: 210, food: 105, shelter: 73.5, water: 10.5, creativity: 21, status: "assumed" },
  PK: { currency: "PKR", daily: 650, food: 325, shelter: 227.5, water: 32.5, creativity: 65, status: "assumed" },
  SA: { currency: "SAR", daily: 19, food: 9.5, shelter: 6.65, water: 0.95, creativity: 1.9, status: "assumed" },
  SG: { currency: "SGD", daily: 10.5, food: 5.25, shelter: 3.68, water: 0.52, creativity: 1.05, status: "assumed" },
  US: { currency: "USD", daily: 10, food: 5, shelter: 3.5, water: 0.5, creativity: 1, status: "assumed" },
  VN: { currency: "VND", daily: 72000, food: 36000, shelter: 25200, water: 3600, creativity: 7200, status: "assumed" },
  ZA: { currency: "ZAR", daily: 77, food: 38.5, shelter: 26.95, water: 3.85, creativity: 7.7, status: "assumed" }
};
var ESSENTIALS_BASELINE_REQUIRED_KEYS = ["food", "water", "shelter", "creativity"];
function isValidEssentialsBaselineEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.currency !== "string" || !(Number(entry.daily) > 0)) return false;
  return ESSENTIALS_BASELINE_REQUIRED_KEYS.every(
    (k) => typeof entry[k] === "number" && Number.isFinite(entry[k]) && entry[k] >= 0
  );
}

// ---------------------------------------------------------------------
// REPOSITORY — the single seam a real data/API layer replaces later.
// ---------------------------------------------------------------------
var EssentialsBaselineRepository = {
  dataSource: ESSENTIALS_BASELINE_DATA_SOURCE,
  getLocal(iso) {
    const entry = ESSENTIALS_LOCAL_BY_ISO[String(iso || "").toUpperCase()];
    return isValidEssentialsBaselineEntry(entry) ? entry : null;
  },
  hasCountry(iso) {
    return Boolean(this.getLocal(iso));
  }
};

// ---------------------------------------------------------------------
// A country's day of essentials, as every screen reads it. No exchange
// rate: the figures are the table's, in the country's own money. Where
// there is no row the day is zero and `available` is false, so a screen
// says "not available yet" instead of inventing a figure.
// ---------------------------------------------------------------------
function computeEssentialsBaseline(iso, repository) {
  const repo = repository || EssentialsBaselineRepository;
  const row = repo.getLocal(iso);
  const available = Boolean(row);
  const currencyCode = row ? row.currency : (COUNTRY_CURRENCY[iso] || "USD");
  const components = {
    food: row ? row.food : 0,
    water: row ? row.water : 0,
    shelter: row ? row.shelter : 0,
    creativity: row ? row.creativity : 0
  };
  const dailyTotal = row ? Math.round(row.daily * 100) / 100 : 0;
  return {
    currencyCode,
    components,
    dailyTotal,
    monthlyTotal: Math.round(dailyTotal * 30 * 100) / 100,
    // Kept for older readers: the whole day IS the amount now.
    fullDailyTotal: dailyTotal,
    share: 1,
    available,
    status: row ? row.status : "none",
    methodologyVersion: ESSENTIALS_BASELINE_METHODOLOGY_VERSION,
    dataSource: repo.dataSource,
    usedFallback: !available
  };
}

