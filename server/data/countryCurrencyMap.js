// server/data/countryCurrencyMap.js
//
// ISO 3166-1 alpha-2 country code -> ISO 4217 currency code, for every
// country in the frontend's registration picker (Frontend's
// backend/data/countries.js — 194 entries, TOP_COUNTRIES + REST_COUNTRIES).
// This is the missing link the diagrams assume exists: the frontend list
// has flags and dial codes, not currencies, so a country's own pool (its
// "local currency") had nowhere to come from until this file.
//
// This is standard ISO 3166 / ISO 4217 reference data — stable, not
// something the app derives or guesses. Shared-currency blocs (Eurozone,
// the CFA franc zones, the East Caribbean dollar, currencies pegged to and
// interchangeable with the US or Australian dollar) intentionally map
// several countries to the same currency code, exactly as the pool design
// requires ("EUR Pool" is one pool, not one per Eurozone country).
//
// A handful of these are genuinely unsettled in the real world (Zimbabwe's
// currency history, Palestine's dual-currency reality, North Korea) — this
// picks the most defensible single answer for a prototype rather than
// leaving the field empty, and is called out here so it's easy to correct
// later without re-deriving the whole table.
const COUNTRY_CURRENCY = {
  US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", DE: "EUR", FR: "EUR", IT: "EUR",
  ES: "EUR", NL: "EUR", BE: "EUR", CH: "CHF", AT: "EUR", SE: "SEK", NO: "NOK",
  DK: "DKK", FI: "EUR", IE: "EUR", PT: "EUR", PL: "PLN", GR: "EUR", RU: "RUB",
  TR: "TRY", UA: "UAH", IN: "INR", CN: "CNY", JP: "JPY", KR: "KRW", ID: "IDR",
  PH: "PHP", VN: "VND", TH: "THB", MY: "MYR", SG: "SGD", PK: "PKR", BD: "BDT",
  SA: "SAR", AE: "AED", IL: "ILS", EG: "EGP", ZA: "ZAR", NG: "NGN", KE: "KES",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", NZ: "NZD",
  IS: "ISK",
  AF: "AFN", AL: "ALL", DZ: "DZD", AD: "EUR", AO: "AOA", AG: "XCD", AM: "AMD",
  AZ: "AZN", BS: "BSD", BH: "BHD", BB: "BBD", BY: "BYN", BZ: "BZD", BJ: "XOF",
  BT: "BTN", BO: "BOB", BA: "BAM", BW: "BWP", BN: "BND", BG: "BGN", BF: "XOF",
  BI: "BIF", CV: "CVE", KH: "KHR", CM: "XAF", CF: "XAF", TD: "XAF", KM: "KMF",
  CD: "CDF", CG: "XAF", CR: "CRC", HR: "EUR", CU: "CUP", CY: "EUR", CZ: "CZK",
  DJ: "DJF", DM: "XCD", DO: "DOP", EC: "USD", SV: "USD", GQ: "XAF", ER: "ERN",
  EE: "EUR", SZ: "SZL", ET: "ETB", FJ: "FJD", GA: "XAF", GM: "GMD", GE: "GEL",
  GH: "GHS", GD: "XCD", GT: "GTQ", GN: "GNF", GW: "XOF", GY: "GYD", HT: "HTG",
  HN: "HNL", HU: "HUF", JM: "JMD", JO: "JOD", KZ: "KZT", KI: "AUD", XK: "EUR",
  KW: "KWD", KG: "KGS", LA: "LAK", LV: "EUR", LB: "LBP", LS: "LSL", LR: "LRD",
  LY: "LYD", LI: "CHF", LT: "EUR", LU: "EUR", MG: "MGA", MW: "MWK", MV: "MVR",
  ML: "XOF", MT: "EUR", MH: "USD", MR: "MRU", MU: "MUR", FM: "USD", MD: "MDL",
  MC: "EUR", MN: "MNT", ME: "EUR", MA: "MAD", MZ: "MZN", MM: "MMK", NA: "NAD",
  NR: "AUD", NP: "NPR", NI: "NIO", NE: "XOF", KP: "KPW", MK: "MKD", OM: "OMR",
  PW: "USD", PS: "ILS", PA: "PAB", PG: "PGK", PY: "PYG", QA: "QAR", RO: "RON",
  RW: "RWF", WS: "WST", SM: "EUR", ST: "STN", SN: "XOF", RS: "RSD", SC: "SCR",
  SL: "SLE", SK: "EUR", SI: "EUR", SB: "SBD", SO: "SOS", SS: "SSP", LK: "LKR",
  KN: "XCD", LC: "XCD", VC: "XCD", SD: "SDG", SR: "SRD", SY: "SYP", TW: "TWD",
  TJ: "TJS", TZ: "TZS", TL: "USD", TG: "XOF", TO: "TOP", TT: "TTD", TN: "TND",
  TM: "TMT", TV: "AUD", UG: "UGX", UY: "UYU", UZ: "UZS", VU: "VUV", VA: "EUR",
  VE: "VES", YE: "YER", ZM: "ZMW", ZW: "ZWL",
};

// Currency master data for every code COUNTRY_CURRENCY points to: display
// name, symbol, and decimal places. Symbols reuse the frontend's own
// Frontend's backend/data/currencies.js table where one already exists
// (so the two stay visually consistent) and fall back to the ISO code
// itself for the ~90 currencies that table never needed for display.
//
// `decimals: 0` is deliberate, not a default left unset — these are the
// ISO 4217 currencies with no minor unit in ordinary use (JPY, KRW, VND,
// the CFA/CFP franc family, ISK, and a handful of others). Storing an
// amount like 1500.5 JPY would be a fabricated precision the currency
// doesn't have.
// The frontend keeps its own copy of this list, in backend/utils/format.js,
// for the same reason the country list is copied rather than imported: the
// browser bundle and this server are separate deploys with no module
// boundary between them. If a code is added or removed here, change it there
// too — a currency whose decimals the two disagree about is a number that
// reads differently on screen than it settles in the ledger.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF",
  "UGX", "VND", "VUV", "XAF", "XOF", "XPF", "MGA",
]);

const KNOWN_SYMBOLS = {
  USD: "$", EUR: "€", GBP: "\xA3", CAD: "C$", AUD: "A$", CHF: "CHF ",
  SEK: "kr ", NOK: "kr ", DKK: "kr ", PLN: "zł ", RUB: "₽",
  TRY: "₺", UAH: "₴", INR: "₹", CNY: "\xA5", JPY: "\xA5",
  KRW: "₩", IDR: "Rp ", PHP: "₱", VND: "₫", THB: "฿",
  MYR: "RM ", SGD: "S$", PKR: "₨ ", BDT: "৳", SAR: "SR ",
  AED: "AED ", ILS: "₪", EGP: "E\xA3", ZAR: "R ", NGN: "₦",
  KES: "KSh ", BRL: "R$", MXN: "Mex$", ARS: "AR$", CLP: "CL$", COP: "CO$",
  PEN: "S/ ", NZD: "NZ$", ISK: "kr ",
};

const CURRENCY_NAMES = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", CAD: "Canadian Dollar",
  AUD: "Australian Dollar", CHF: "Swiss Franc", SEK: "Swedish Krona",
  NOK: "Norwegian Krone", DKK: "Danish Krone", PLN: "Polish Zloty",
  RUB: "Russian Ruble", TRY: "Turkish Lira", UAH: "Ukrainian Hryvnia",
  INR: "Indian Rupee", CNY: "Chinese Yuan", JPY: "Japanese Yen",
  KRW: "South Korean Won", IDR: "Indonesian Rupiah", PHP: "Philippine Peso",
  VND: "Vietnamese Dong", THB: "Thai Baht", MYR: "Malaysian Ringgit",
  SGD: "Singapore Dollar", PKR: "Pakistani Rupee", BDT: "Bangladeshi Taka",
  SAR: "Saudi Riyal", AED: "UAE Dirham", ILS: "Israeli Shekel",
  EGP: "Egyptian Pound", ZAR: "South African Rand", NGN: "Nigerian Naira",
  KES: "Kenyan Shilling", BRL: "Brazilian Real", MXN: "Mexican Peso",
  ARS: "Argentine Peso", CLP: "Chilean Peso", COP: "Colombian Peso",
  PEN: "Peruvian Sol", NZD: "New Zealand Dollar", ISK: "Icelandic Krona",
};

// Everything else derives the master row from the code itself: unknown
// symbols fall back to "CODE ", unknown names fall back to the code.
// Extending KNOWN_SYMBOLS/CURRENCY_NAMES improves display; nothing breaks
// without an entry there.
function buildCurrencyMaster() {
  const codes = new Set(Object.values(COUNTRY_CURRENCY));
  return Array.from(codes).sort().map((code) => ({
    code,
    name: CURRENCY_NAMES[code] || code,
    symbol: KNOWN_SYMBOLS[code] || `${code} `,
    decimals: ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2,
  }));
}

module.exports = { COUNTRY_CURRENCY, buildCurrencyMaster };
