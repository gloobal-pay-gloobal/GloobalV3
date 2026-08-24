// server/lib/countryCurrency.js
//
// One answer to "what currency does this country transact in", used by every
// part of the payment path that needs it.
//
// ── Why this exists (24 August 2026) ─────────────────────────────────────
//
// The payment route resolved a country's currency like this:
//
//     const senderCurrency = senderCountry?.localCurrency || 'INR';
//     const destinationCurrency = receiverCountry?.localCurrency || 'INR';
//
// reading Country straight from Mongo, with a hardcoded rupee fallback for a
// missing row. The Country collection is populated by
// scripts/seed-countries-currencies.mjs — and on the live database that
// script had never been run. Country and Currency both held zero documents,
// while real accounts existed in nine countries (CN, GB, GR, IL, IN, PH, PK,
// SE, US).
//
// So in production every lookup missed, every account resolved to INR, both
// sides of every payment matched, the FX rate was always 1, and settlement
// never fired. A payment from a British account to an American one was
// carried out as a domestic rupee transfer. Nothing logged, nothing failed —
// the fallback made a missing reference table look exactly like a country
// that genuinely uses INR.
//
// The fix is not to fail closed on a missing row, which would have refused
// every payment on that same database. It is to notice that the row was never
// the only source: Country is a COPY of data/countryCurrencyMap.js, written
// by the seed script from that very file, and that file ships inside the
// server. The map is authoritative and always present; the collection is a
// cache of it that may or may not have been populated yet.
//
// So: prefer the seeded row (it is what an operator can correct without a
// deploy), fall back to the bundled map, and return null only for an ISO that
// is genuinely not a supported country. No currency is ever invented.
const Country = require('../models/Country');
const { COUNTRY_CURRENCY } = require('../data/countryCurrencyMap');

// iso -> Country doc, refreshed on the same cadence the settlement engine
// used for its own copy of this cache. Seed data changes about as often as a
// country is added to the registration picker.
const cache = new Map();
let loadedAt = 0;
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;

async function refresh() {
  if (Date.now() - loadedAt <= CACHE_MAX_AGE_MS) return;
  try {
    const rows = await Country.find({}).lean();
    cache.clear();
    for (const row of rows) cache.set(row.iso, row);
  } catch (error) {
    // A failed read must not take a payment down: the bundled map below can
    // answer every supported ISO on its own. Leaving the cache as-is means a
    // transient Mongo blip falls through to the map rather than to an error.
    console.error('countryCurrency: Country lookup failed, using the bundled map:', error.message);
  }
  loadedAt = Date.now();
}

const normalise = (iso) => String(iso || '').trim().toUpperCase();

/**
 * The country record for an ISO, or null if it is not a supported country.
 *
 * Shape matches what callers used to get from Country.findOne: at minimum
 * `{ iso, localCurrency }`. `source` says where the answer came from, purely
 * so a caller can log the difference; nothing branches on it.
 */
async function resolveCountry(iso) {
  const code = normalise(iso);
  if (!/^[A-Z]{2}$/.test(code)) return null;

  await refresh();

  const row = cache.get(code);
  if (row && row.localCurrency) {
    return { iso: code, localCurrency: String(row.localCurrency).toUpperCase(), source: 'seeded' };
  }

  const mapped = COUNTRY_CURRENCY[code];
  if (mapped) {
    return { iso: code, localCurrency: String(mapped).toUpperCase(), source: 'bundled' };
  }

  return null;
}

/**
 * Just the currency, or null for an unsupported ISO.
 *
 * Callers must handle null rather than substituting a default — that
 * substitution is the whole bug this module exists to remove.
 */
async function localCurrencyFor(iso) {
  const country = await resolveCountry(iso);
  return country ? country.localCurrency : null;
}

/**
 * Synchronous, map-only. For paths that already know the ISO is supported and
 * cannot await — never used to decide the currency of a real payment.
 */
function bundledCurrencyFor(iso) {
  return COUNTRY_CURRENCY[normalise(iso)] || null;
}

// Test seam: the cache is process-wide and 10 minutes long, which is right in
// production and wrong in a suite that seeds Country between cases.
function resetCache() {
  cache.clear();
  loadedAt = 0;
}

module.exports = { resolveCountry, localCurrencyFor, bundledCurrencyFor, resetCache };
