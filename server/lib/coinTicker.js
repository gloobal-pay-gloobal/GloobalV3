// server/lib/coinTicker.js
//
// The ticker Gloobal Coin is denominated in, in ONE place.
//
// It used to be declared independently in server.js and again, as a literal,
// in server/scripts/coin-airdrop.mjs. The two drifted: the GC -> GEU rename
// updated server.js and missed the script, so every airdrop run wrote
// `currency: "GC"` onto a Transaction row and a LedgerEntry row while the
// account balances those rows explain were counted as GEU. The guard in
// tests/geu-one-currency.test.mjs did not catch it because that test
// enumerates the files it checks by name and the script was not among them.
//
// A constant that is correct in one file and wrong in another is not a typo,
// it is two sources of truth. This module is the single one. Anything on the
// server that needs to name the coin requires it from here; nothing declares
// its own copy.
//
// WHAT THIS IS NOT. It is not the reserve currency — that lives on the
// CoinReserve document (`reserveCurrency`, default INR) because it is a
// property of the reserve, not of the coin. It is not the GEU growth
// prototype's ticker either: that superseded system holds the SAME string in
// its own constant (GEU_PROTOTYPE_CURRENCY in server.js) and is a different
// economic system with its own balance field and its own supply document.
// The collision of those two strings is why the prototype's routes are
// disabled; see the comment beside GEU_PROTOTYPE_CURRENCY.
//
// The browser-side simulation keeps its own declaration
// (backend/domain/coin/CoinService.js) because `server/` and `backend/` are
// separate programs that share no module. tests/geu-one-currency.test.mjs
// asserts the two agree, which is the only mechanism available across that
// boundary.
const COIN_CURRENCY = 'GEU';

module.exports = { COIN_CURRENCY };
