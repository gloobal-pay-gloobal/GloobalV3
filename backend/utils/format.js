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
// ── Money reads amount first, currency after ─────────────────────────────
//
// "+20$", not "+$20". "1,450.25 CHF", not "CHF 1,450.25".
//
// This app is built to be read by someone who reads no English — that is why
// identifiers are symbols and the clock is 24-hour digits. A leading currency
// symbol makes the FIRST thing you meet the part that changes by country,
// and it pushes the digits — the part everyone reads the same way — to second
// place. Amount first, unit after, is also how a person says it out loud:
// twenty dollars, not dollars twenty.
//
// One function, because this was previously spelled out at about seventy
// call sites as a symbol interpolation immediately followed by an fmt() call.
// Seventy chances for one of them to disagree with the others, and no way to
// change the convention without finding every one.
//
// (That sentence originally quoted the old pattern literally. The codemod
// that did this conversion then rewrote the quotation, because a mechanical
// search cannot tell an example of a thing from the thing. Same trap as
// grepping prose to prove code is absent, running the other way.)
//
// ── The space rule ───────────────────────────────────────────────────────
//
// A glyph sits tight against the number; a word does not.
//
//     20.00$   20.00₹   20.00€        one mark, no gap
//     20.00 CHF   20.00 Rp   20.00 C$  contains letters, needs air
//
// "20.00CHF" reads as one token and has to be taken apart by eye. "20.00 $"
// looks like the symbol drifted loose. The rule is what makes both correct
// without a per-currency table.
//
// CURRENCY_SYMBOL entries are stored with a TRAILING space for several
// currencies ("CHF ", "Rp ", "kr ") because they were written for prefix use.
// Trimming here is what stops "20.00 CHF " arriving with a stray gap at the
// end, which is invisible in a diff and visible on a receipt.
function currencySuffix(currency) {
  const symbol = String(CURRENCY_SYMBOL[currency] || currency || "").trim();
  if (!symbol) return "";
  return /[A-Za-z]/.test(symbol) ? ` ${symbol}` : symbol;
}

// The one money formatter. `currency` is the ISO code, never the symbol —
// same contract as fmt, and for the same reason: ¥ is both JPY and CNY and
// they disagree about minor units, so a symbol cannot answer how many
// decimals to show.
function fmtMoney(n, currency) {
  return `${fmt(n, currency)}${currencySuffix(currency)}`;
}

// The ONE clock in the app. HH:MM:SS, 24-hour, zero-padded, always.
//
// Built from the Date's own getters rather than toLocaleTimeString, which is
// what it used to be ("en-GB", { hour12: false }). Three reasons, in order of
// how much they matter:
//
//   1. A clock is not text to be translated. This app is deliberately built
//      to be read by someone who reads no English — that is why the history
//      row uses a middle dot instead of the word "at", and why identifiers
//      are symbols. "2:07:32 PM" fails that test: PM is an English
//      abbreviation of a Latin phrase. 14:07:32 is read the same everywhere
//      digits are read.
//
//   2. toLocaleTimeString answers to the device, not to us. The same instant
//      renders differently on two phones, and a Node build without full ICU
//      falls back to en-US regardless of the locale asked for — so the "safe"
//      en-GB argument was never a guarantee. Receipts and history rows are
//      records; two people comparing the same transaction must see the same
//      string.
//
//   3. `hour12: false` is not the same as a 24-hour clock. Paired with some
//      locales it yields "24:07:32" for the hour after midnight rather than
//      "00:07:32". Explicit padding cannot do that.
//
// Seconds are always included. They used to be trimmed for list rows on the
// reasoning that the third pair of digits is noise under a name — true as
// far as it goes, but it meant the same transaction read 13:52 in the list
// and 13:52:07 on its own receipt, and a timestamp that changes shape
// depending on where you look at it is worse than one that is slightly long.
// One clock, one shape, everywhere.
function formatClockTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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

