// server/lib/currencyDecimals.js
//
// Bug fix (audit finding, see docs/audit-2026-08.md): Currency.decimals
// exists specifically "so an amount is never displayed or stored with more
// precision than the currency actually has — JPY, KRW, VND, the CFA francs
// and a handful of others have no minor unit" (models/Currency.js's own
// header comment), and data/countryCurrencyMap.js populates it correctly
// for every seeded currency. But nothing ever read it: every monetary
// figure in server.js was rounded to a hardcoded 2 decimal places via
// toMinorUnit, regardless of what currency it was actually denominated in.
// For a 2-decimal currency (INR, USD, the large majority of the seeded
// list) this was invisible. For a zero-decimal one it is a real
// correctness bug: a JPY balance could carry values like 1234.56, which
// is not a representable amount of any real unit of that currency.
//
// toMinorUnit is a synchronous helper called ~30 times throughout
// server.js's hot payment path; Currency.decimals only exists in Mongo, an
// async read. Rather than making every call site async (a large, risky
// rewrite of the most heavily-tested file in this codebase, for a change
// that does not touch what money moves, only how it rounds), this module
// keeps a small in-memory cache — currencies are static reference data
// that essentially never change after being seeded — populated once at
// startup and refreshable on demand, so the lookup toMinorUnit needs stays
// synchronous.
const DEFAULT_DECIMALS = 2;

// The bundled precision table, used as the floor under the Mongo cache.
//
// The comment above says data/countryCurrencyMap.js "populates it correctly
// for every seeded currency" — and on the live database nothing was seeded.
// Currency held zero documents, so this cache loaded empty, decimalsFor
// returned DEFAULT_DECIMALS for everything, and the zero-decimal currencies
// this module was written to protect (JPY, KRW, VND, the CFA francs — 16 of
// the 142 supported) were rounded to two places anyway. The bug the module
// fixes was still live, silently, because its data source was empty.
//
// buildCurrencyMaster() is the same function the seed script reads to
// populate that collection, and it ships with the server. Seeding it into the
// cache at require time means the correct precision is available immediately,
// with or without a populated database; a real Currency row still wins, so an
// operator can correct one without a deploy.
const { buildCurrencyMaster } = require('../data/countryCurrencyMap');

function bundledDecimals() {
  const map = new Map();
  for (const row of buildCurrencyMaster()) {
    if (row?.code && Number.isFinite(row.decimals)) map.set(String(row.code).toUpperCase(), row.decimals);
  }
  return map;
}

let cache = bundledDecimals();
let loaded = false;
let loadingPromise = null;

/**
 * Populates the cache from the Currency collection. Safe to call more than
 * once (e.g. a scheduled refresh, or a retry after a startup failure) —
 * concurrent callers share the same in-flight load rather than issuing
 * duplicate queries.
 */
async function loadCurrencyDecimals() {
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Required lazily, not at module load: avoids a require cycle risk if
    // this module is ever imported before models/Currency.js's own
    // mongoose connection is ready, same defensive pattern used elsewhere
    // in this codebase for models pulled into a helper.
    const Currency = require('../models/Currency');
    const rows = await Currency.find({}).select('code decimals').lean();

    // Starts from the bundled table and overlays whatever the collection
    // holds, rather than replacing it. Assigning the query result outright
    // was what made an unseeded database silently lose every zero-decimal
    // currency: `rows` came back empty, the cache became empty with it, and
    // decimalsFor fell through to 2 for all 142 currencies. A real row still
    // wins over the bundled value, which is the point of reading Mongo at all.
    const next = bundledDecimals();
    for (const row of rows) {
      if (row?.code && Number.isFinite(row.decimals)) {
        next.set(String(row.code).toUpperCase(), row.decimals);
      }
    }

    cache = next;
    loaded = true;
    return cache;
  })().finally(() => {
    loadingPromise = null;
  });

  return loadingPromise;
}

/**
 * Decimal places for a currency code, from the cache. Returns
 * DEFAULT_DECIMALS (2) for a code that hasn't been seeded, or before the
 * cache has ever been loaded — the same rounding every call site already
 * used before this fix existed, so an unrecognised or coin-prototype code
 * (e.g. 'GC', which is not a real ISO currency and is never in the
 * Currency collection) behaves exactly as it always has.
 */
function decimalsFor(currencyCode) {
  const code = String(currencyCode || '').trim().toUpperCase();
  if (!code) return DEFAULT_DECIMALS;
  const known = cache.get(code);
  return Number.isFinite(known) ? known : DEFAULT_DECIMALS;
}

function isLoaded() {
  return loaded;
}

module.exports = { loadCurrencyDecimals, decimalsFor, isLoaded, DEFAULT_DECIMALS };
