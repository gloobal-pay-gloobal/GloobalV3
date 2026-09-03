// src/data/currencies.js
var CURRENCY_SYMBOL = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\xA3",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF ",
  SEK: "kr ",
  NOK: "kr ",
  DKK: "kr ",
  PLN: "z\u0142 ",
  RUB: "\u20BD",
  TRY: "\u20BA",
  UAH: "\u20B4",
  INR: "\u20B9",
  CNY: "\xA5",
  JPY: "\xA5",
  KRW: "\u20A9",
  IDR: "Rp ",
  PHP: "\u20B1",
  VND: "\u20AB",
  THB: "\u0E3F",
  MYR: "RM ",
  SGD: "S$",
  PKR: "\u20A8 ",
  BDT: "\u09F3",
  SAR: "SR ",
  AED: "AED ",
  ILS: "\u20AA",
  EGP: "E\xA3",
  ZAR: "R ",
  NGN: "\u20A6",
  KES: "KSh ",
  BRL: "R$",
  MXN: "Mex$",
  ARS: "AR$",
  CLP: "CL$",
  COP: "CO$",
  PEN: "S/ ",
  NZD: "NZ$",
  ISK: "kr ",
  // Everything below fills the gap this file used to leave open: only the
  // 40 currencies of TOP_COUNTRIES had a symbol, so every one of the ~145
  // REST_COUNTRIES fell back to a bare "$" via CURRENCY_SYMBOL[code] || "$"
  // wherever that fallback pattern is used (GloobalCoverageScreen among
  // others) — a Nigerian or Kazakh user's real currency displayed with a
  // Dollar sign it doesn't have. These symbols are the standard ones in
  // ordinary use for each currency; a handful with no common ASCII/Unicode
  // symbol fall back to "CODE " the same way the backend's
  // countryCurrencyMap.js already does for the same reason.
  AFN: "؋ ", ALL: "L ", AMD: "֏ ", AOA: "Kz ", AZN: "₼ ",
  BAM: "KM ", BBD: "Bds$", BGN: "лв ", BHD: "BD ", BIF: "FBu ",
  BND: "B$", BOB: "Bs ", BSD: "B$", BTN: "Nu. ", BWP: "P ",
  BYN: "Br ", BZD: "BZ$", CDF: "FC ", CRC: "₡", CUP: "$MN ",
  CVE: "$ ", CZK: "Kč ", DJF: "Fdj ", DOP: "RD$", DZD: "DA ",
  ERN: "Nfk ", ETB: "Br ", FJD: "FJ$", GEL: "₾ ", GHS: "₵ ",
  GMD: "D ", GNF: "FG ", GTQ: "Q ", GYD: "G$", HNL: "L ",
  HTG: "G ", HUF: "Ft ", JMD: "J$", JOD: "JD ", KGS: "с ",
  KHR: "៛", KMF: "CF ", KPW: "₩ ", KWD: "KD ", KZT: "₸ ",
  LAK: "₭", LBP: "L£", LKR: "₨ ", LRD: "L$", LSL: "L ",
  LYD: "LD ", MAD: "DH ", MDL: "L ", MGA: "Ar ", MKD: "ден ",
  MMK: "K ", MNT: "₮ ", MRU: "UM ", MUR: "₨ ", MVR: "Rf ",
  MWK: "MK ", MZN: "MT ", NAD: "N$", NIO: "C$", NPR: "₨ ",
  OMR: "OMR ", PAB: "B/.", PGK: "K ", PYG: "₲", QAR: "QR ",
  RON: "lei ", RSD: "дин. ", RWF: "FRw ", SBD: "SI$", SCR: "₨ ",
  SDG: "SDG ", SLE: "Le ", SOS: "Sh ", SRD: "Sr$", SSP: "SSP ",
  STN: "Db ", SYP: "SP ", SZL: "L ", TJS: "SM ", TMT: "m ",
  TND: "DT ", TOP: "T$", TTD: "TT$", TWD: "NT$", TZS: "TSh ",
  UGX: "USh ", UYU: "$U ", UZS: "so'm ", VES: "Bs.", VUV: "VT ",
  WST: "WS$", XAF: "FCFA ", XCD: "EC$", XOF: "CFA ", YER: "﷼ ",
  ZMW: "ZK ", ZWL: "Z$"
};
var CURRENCIES = {
  EUR: { flag: "\u{1F1EA}\u{1F1FA}", label: "EUR" },
  USD: { flag: "\u{1F1FA}\u{1F1F8}", label: "USD" },
  GBP: { flag: "\u{1F1EC}\u{1F1E7}", label: "GBP" },
  CAD: { flag: "\u{1F1E8}\u{1F1E6}", label: "CAD" },
  AUD: { flag: "\u{1F1E6}\u{1F1FA}", label: "AUD" },
  CHF: { flag: "\u{1F1E8}\u{1F1ED}", label: "CHF" },
  SEK: { flag: "\u{1F1F8}\u{1F1EA}", label: "SEK" },
  NOK: { flag: "\u{1F1F3}\u{1F1F4}", label: "NOK" },
  DKK: { flag: "\u{1F1E9}\u{1F1F0}", label: "DKK" },
  PLN: { flag: "\u{1F1F5}\u{1F1F1}", label: "PLN" },
  RUB: { flag: "\u{1F1F7}\u{1F1FA}", label: "RUB" },
  TRY: { flag: "\u{1F1F9}\u{1F1F7}", label: "TRY" },
  UAH: { flag: "\u{1F1FA}\u{1F1E6}", label: "UAH" },
  INR: { flag: "\u{1F1EE}\u{1F1F3}", label: "INR" },
  CNY: { flag: "\u{1F1E8}\u{1F1F3}", label: "CNY" },
  JPY: { flag: "\u{1F1EF}\u{1F1F5}", label: "JPY" },
  KRW: { flag: "\u{1F1F0}\u{1F1F7}", label: "KRW" },
  IDR: { flag: "\u{1F1EE}\u{1F1E9}", label: "IDR" },
  PHP: { flag: "\u{1F1F5}\u{1F1ED}", label: "PHP" },
  VND: { flag: "\u{1F1FB}\u{1F1F3}", label: "VND" },
  THB: { flag: "\u{1F1F9}\u{1F1ED}", label: "THB" },
  MYR: { flag: "\u{1F1F2}\u{1F1FE}", label: "MYR" },
  SGD: { flag: "\u{1F1F8}\u{1F1EC}", label: "SGD" },
  PKR: { flag: "\u{1F1F5}\u{1F1F0}", label: "PKR" },
  BDT: { flag: "\u{1F1E7}\u{1F1E9}", label: "BDT" },
  SAR: { flag: "\u{1F1F8}\u{1F1E6}", label: "SAR" },
  AED: { flag: "\u{1F1E6}\u{1F1EA}", label: "AED" },
  ILS: { flag: "\u{1F1EE}\u{1F1F1}", label: "ILS" },
  EGP: { flag: "\u{1F1EA}\u{1F1EC}", label: "EGP" },
  ZAR: { flag: "\u{1F1FF}\u{1F1E6}", label: "ZAR" },
  NGN: { flag: "\u{1F1F3}\u{1F1EC}", label: "NGN" },
  KES: { flag: "\u{1F1F0}\u{1F1EA}", label: "KES" },
  BRL: { flag: "\u{1F1E7}\u{1F1F7}", label: "BRL" },
  MXN: { flag: "\u{1F1F2}\u{1F1FD}", label: "MXN" },
  ARS: { flag: "\u{1F1E6}\u{1F1F7}", label: "ARS" },
  CLP: { flag: "\u{1F1E8}\u{1F1F1}", label: "CLP" },
  COP: { flag: "\u{1F1E8}\u{1F1F4}", label: "COP" },
  PEN: { flag: "\u{1F1F5}\u{1F1EA}", label: "PEN" },
  NZD: { flag: "\u{1F1F3}\u{1F1FF}", label: "NZD" },
  ISK: { flag: "\u{1F1EE}\u{1F1F8}", label: "ISK" }
};
var RATES = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.86,
  CAD: 1.48,
  AUD: 1.65,
  CHF: 0.94,
  SEK: 11.3,
  NOK: 11.5,
  DKK: 7.46,
  PLN: 4.3,
  RUB: 98,
  TRY: 35,
  UAH: 44,
  INR: 103.03,
  CNY: 7.8,
  JPY: 170.5,
  KRW: 1450,
  IDR: 17e3,
  PHP: 61,
  VND: 26500,
  THB: 39,
  MYR: 5.1,
  SGD: 1.45,
  PKR: 300,
  BDT: 128,
  SAR: 4.05,
  AED: 3.97,
  ILS: 4,
  EGP: 52,
  ZAR: 20,
  NGN: 1650,
  KES: 140,
  BRL: 5.4,
  MXN: 20,
  ARS: 950,
  CLP: 1020,
  COP: 4300,
  PEN: 4.05,
  NZD: 1.78,
  ISK: 150,
  // Same gap this closes as CURRENCY_SYMBOL above, and the same
  // consequence: convert() returns `!RATES[from] || !RATES[to]` -> 0 for
  // any currency missing here, so every REST_COUNTRIES country's real
  // spend silently displayed as 0 instead of its actual converted amount.
  // These are approximate, roughly-current figures for display purposes —
  // this table has always been a static snapshot, not a live feed (see
  // Backend/lib/fxRates.js for the live-rate service the real settlement
  // engine uses; this file is unrelated to and doesn't call it). A few of
  // the most volatile currencies here (VES, SYP, SSP, LBP, ZWL) move fast
  // enough that "approximate" is doing real work in that sentence.
  AFN: 81, ALL: 95, AMD: 420, AOA: 900, AZN: 1.85,
  BAM: 1.96, BBD: 2.17, BGN: 1.96, BHD: 0.41, BIF: 3150,
  BND: 1.45, BOB: 7.5, BSD: 1.08, BTN: 90, BWP: 14.8,
  BYN: 3.5, BZD: 2.17, CDF: 3100, CRC: 560, CUP: 26,
  CVE: 110.27, CZK: 25.2, DJF: 192, DOP: 65, DZD: 146,
  ERN: 16.3, ETB: 130, FJD: 2.45, GEL: 2.95, GHS: 16.5,
  GMD: 75, GNF: 9350, GTQ: 8.4, GYD: 227, HNL: 27,
  HTG: 143, HUF: 395, JMD: 168, JOD: 0.77, KGS: 94,
  KHR: 4400, KMF: 492, KPW: 970, KWD: 0.33, KZT: 490,
  LAK: 23500, LBP: 97000, LKR: 325, LRD: 200, LSL: 20,
  LYD: 5.3, MAD: 10.8, MDL: 19.3, MGA: 4950, MKD: 61.5,
  MMK: 2280, MNT: 3720, MRU: 43, MUR: 50, MVR: 16.7,
  MWK: 1880, MZN: 69, NAD: 20, NIO: 39.7, NPR: 145,
  OMR: 0.42, PAB: 1.08, PGK: 4.1, PYG: 8500, QAR: 3.93,
  RON: 4.98, RSD: 117, RWF: 1480, SBD: 9.1, SCR: 14.6,
  SDG: 650, SLE: 24.5, SOS: 620, SRD: 40, SSP: 4500,
  STN: 24.6, SYP: 14500, SZL: 20, TJS: 11.7, TMT: 3.78,
  TND: 3.36, TOP: 2.6, TTD: 7.35, TWD: 34.8, TZS: 2900,
  UGX: 4000, UYU: 42.5, UZS: 13900, VES: 45, VUV: 129,
  WST: 3.0, XAF: 655.96, XCD: 2.93, XOF: 655.96, YER: 271,
  ZMW: 29, ZWL: 30000
};

// CURRENCIES (flag + label, used by the currency pickers on Dashboard and
// SendMoney) only ever had the same ~40 entries as the tables above —
// SendMoney reads CURRENCIES[code].label with no guard, so a REST_COUNTRIES
// currency reaching that line threw outright rather than displaying wrong.
// Filled in here instead of by hand for all 102: a shared currency (EUR,
// the CFA francs, XCD, the various dollar pegs) doesn't have one "true"
// flag, so this picks a stable, deterministic representative — the first
// country in COUNTRY_CURRENCY (loaded before this file — see
// build_app.mjs's module order) that actually uses the currency — rather
// than leaving the picker without one or guessing per-code by hand.
(function fillMissingCurrencyEntries() {
  var seen = {};
  for (var iso in COUNTRY_CURRENCY) {
    var code = COUNTRY_CURRENCY[iso];
    if (!CURRENCIES[code] && !seen[code]) {
      seen[code] = true;
      CURRENCIES[code] = { flag: isoToFlag(iso), label: code };
    }
  }
})();


// ── The coin's ticker ────────────────────────────────────────────────────
//
// GEU, "Gloobal Energy Unit". One definition, used by every screen that
// prints it, so the ticker cannot say one thing in one place and something
// else in another.
//
// This now matches what is STORED. It briefly did not: the screens said GEU
// while the server stamped 'GC' onto every coin row, because server.js also
// defined a second, different currency called GEU — a growth-bearing
// prototype with its own balance field and supply document. Two designs were
// wearing one name.
//
// That is resolved. Gloobal Coin IS the Gloobal Energy Unit: pegged, 1 GEU =
// ₹1 in both directions, backed 1:1, no growth. The other prototype is
// disabled behind GEU_GROWTH_PROTOTYPE and its reasoning is kept in
// docs/GEU_GROWTH_DESIGN.md, because growth is deferred rather than
// rejected — and when it arrives it belongs to THIS unit, not to a second
// one alongside it.
var COIN_TICKER = "GEU";
var COIN_TICKER_LONG = "Gloobal Energy Unit";

// What one GEU is worth, and in what.
//
// One GEU is one unit of the reserve currency — that is the peg, and it is
// the same peg for every account. What differs is what a person pays with:
// an account in India pays ₹1 for 1 GEU, an account in the United States
// pays $1 and receives about 85, because $1 IS about ₹85.
//
// This constant is the DEFAULT only. The server owns the real value
// (CoinReserve.reserveCurrency) and sends it with every coin read; screens
// take that when it is present and fall back to this when the server has not
// answered yet. If the two ever disagree, the server is right — this exists
// so a screen has something to render before the first response lands, not
// as a second opinion.
var COIN_PEG_CURRENCY = "INR";
