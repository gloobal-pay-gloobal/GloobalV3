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
function countryMatches(country, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return country.name.toLowerCase().includes(q) || !!country.dialCode && country.dialCode.includes(q);
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
