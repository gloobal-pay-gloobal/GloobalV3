// src/utils/currency.js
function convert(amount, from, to) {
  const n = parseFloat(amount);
  if (isNaN(n)) return 0;
  if (!RATES[from] || !RATES[to]) return 0;
  const eur = n / RATES[from];
  const result = eur * RATES[to];
  return Math.round(result * 100) / 100;
}
function countryGlowStyle(active, compact = false) {
  const rgb = active ? "34,197,94" : "239,68,68";
  const borderColor = active ? "#22C55E" : "#EF4444";
  return compact ? { border: `1.5px solid ${borderColor}`, boxShadow: `0 0 6px rgba(${rgb},0.55)` } : { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 2px rgba(${rgb},0.16), 0 0 10px rgba(${rgb},0.5)` };
}
// Does this country answer to what somebody typed?
//
// Name, dialling code, or the two-letter ISO code. The ISO was missing,
// so typing "IN" or "US" — the first thing a lot of people try — matched
// only countries with those letters somewhere in their NAME: "IN" found
// India and Indonesia but also Argentina and Finland, and "US" found
// Belarus and Cyprus but not the United States.
//
// Both field names are accepted because the two country lists in this
// codebase disagree: ALL_COUNTRIES calls it `iso`, the coverage list
// calls it `code`.
function countryMatches(country, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  const iso = String(country.iso || country.code || "").toLowerCase();
  const digits = q.replace(/[^0-9]/g, "");
  if (country.name.toLowerCase().includes(q)) return true;
  if (iso && iso === q) return true;
  if (digits && country.dialCode && country.dialCode.replace(/[^0-9]/g, "").startsWith(digits)) return true;
  return false;
}

// The same question, answered in a useful ORDER.
//
// `includes` alone is a filter, not a search: typing "ind" returned India
// and Indonesia in whatever order the source list happened to hold them,
// and typing "united" buried the United Kingdom under four other
// countries. The rank is the whole value here — a list nobody has to read
// twice.
//
// Ties keep the source list's own order, so results do not reshuffle
// while a word is still being typed.
function countrySearchRank(country, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return 0;
  const name = country.name.toLowerCase();
  const iso = String(country.iso || country.code || "").toLowerCase();
  const digits = q.replace(/[^0-9]/g, "");
  const dial = String(country.dialCode || "").replace(/[^0-9]/g, "");

  if (name === q || (iso && iso === q)) return 0;
  if (digits && dial && dial === digits) return 1;
  if (name.startsWith(q)) return 2;
  if (digits && dial && dial.startsWith(digits)) return 3;
  // A word inside the name — "kingdom" finding the United Kingdom —
  // beats a letter sequence buried mid-word, which is how "in" used to
  // surface Argentina above India.
  if (name.split(/[^a-z]+/).some((word) => word.startsWith(q))) return 4;
  return 5;
}

function countrySearch(list, rawQuery) {
  const rows = Array.isArray(list) ? list : [];
  const q = String(rawQuery || "").trim();
  if (!q) return rows;
  return rows
    .map((country, at) => ({ country, at, rank: countrySearchRank(country, q) }))
    .filter((row) => countryMatches(row.country, q))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.at - b.at))
    .map((row) => row.country);
}
function mobileDigitRange(iso) {
  return MOBILE_DIGIT_RANGE_BY_ISO[iso] || DEFAULT_MOBILE_DIGIT_RANGE;
}
// `realPaylaterDue`, when supplied, replaces the records-summed due
// (which never reflects settlements — see usePaylaterDue) with the
// actual paylaterPayable ledger balance.
function computePaylaterAvailable(assetSeeds, paylaterHistory, realPaylaterDue = null) {
  const totalAssets = assetSeeds.reduce((s, t) => {
    const cashback = t.amountPaid * t.cashbackRate;
    const value = cashback * Math.pow(1 + ASSET_GROWTH_RATE_MONTHLY, t.monthsAccrued);
    return s + value;
  }, 0);
  const paylaterDue = realPaylaterDue !== null ? realPaylaterDue : paylaterHistory.filter((t) => t.direction === "out" && t.status === "pending").reduce((s, t) => s + t.amount, 0);
  return { totalAssets, paylaterLimit: totalAssets, paylaterDue, paylaterAvailable: Math.max(0, totalAssets - paylaterDue) };
}


// A payment amount is valid only when it is a finite number strictly greater
// than zero. Zero and negatives are refused everywhere a payment starts on
// this side — the Send button, completePayment, handleRemoteSend — and the
// server refuses them again on POST /api/transactions/send, which is the
// authority; the Transaction schema refuses a non-positive amount beneath
// every route.
function isPositivePaymentAmount(value) {
  if (value === null || value === void 0 || value === "") return false;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}
