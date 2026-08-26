// src/utils/format.js

// The currencies with no minor unit. Same seventeen codes as the server's
// own source of truth (server/data/countryCurrencyMap.js), which is what
// decides `decimals` on every Currency row and what the settlement engine
// rounds to. Duplicated rather than imported for the reason every other
// shared constant in this project is: Backend and Frontend are separate
// deploys with no module boundary between them.
//
// This matters on screen, not only in the ledger. Printing a yen balance as
// "750,000.00" invents a precision the currency does not have — the money
// column of a Japanese, Korean or Icelandic account is simply wrong, on
// every screen, in a way that reads as a rounding bug in the product.
var GLOOBAL_ZERO_DECIMAL_CURRENCIES = [
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF",
  "UGX", "VND", "VUV", "XAF", "XOF", "XPF", "MGA"
];

// How many decimal places this currency actually has. Unknown or missing
// codes get 2, which is right for the overwhelming majority and is the
// same default the server applies.
function currencyDecimals(currency) {
  return GLOOBAL_ZERO_DECIMAL_CURRENCIES.indexOf(String(currency || "").toUpperCase()) === -1 ? 2 : 0;
}

// `currency` is the ISO code (INR, JPY), NOT the symbol: ¥ is both JPY and
// CNY, and those two disagree about minor units, so a symbol cannot answer
// this question. Omitting it keeps the old two-decimal behaviour, which is
// what every caller that formats a percentage or a coin quantity wants.
function fmt(n, currency) {
  const decimals = currencyDecimals(currency);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
function formatClockTime(d) {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}
function receiptAmountFontSize(text, base) {
  const len = text.length;
  if (len <= 9) return base;
  if (len <= 12) return base - 3;
  if (len <= 15) return base - 6;
  if (len <= 19) return Math.max(base - 9, 12);
  return Math.max(base - 12, 11);
}
function fmtCompact(v) {
  const abs = Math.abs(v);
  if (abs >= 1e3) {
    const kValue = v / 1e3;
    const kRounded = Number.isInteger(kValue) ? kValue.toFixed(0) : kValue.toFixed(1);
    if (Math.abs(parseFloat(kRounded)) >= 1e3) {
      const mValue = v / 1e6;
      return `${Number.isInteger(mValue) ? mValue.toFixed(0) : mValue.toFixed(1)}M`;
    }
    return `${kRounded}K`;
  }
  return v.toFixed(2);
}

