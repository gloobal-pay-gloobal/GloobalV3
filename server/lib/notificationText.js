// server/lib/notificationText.js
//
// What a payment notification SAYS and what it is DRAWN WITH, for the one
// case the app cannot answer for itself: the app is closed, the server is
// pushing, and the operating system will draw the banner.
//
// ── Why this file exists at all ─────────────────────────────────────────
//
// One payment can reach a phone three ways. Open, it is the card in the
// notifications sheet. Open but backgrounded, the page puts a banner in the
// tray itself. Closed, this server pushes one and the service worker shows
// it. Those three used to say three different things about one event:
//
//     card     −250.00₹ sent        To Chdg
//     page     250.00₹ sent         To Chdg
//     push     Payment Sent         250.00 INR sent to Chdg
//
// Which one you saw depended on where your thumb had been half a minute
// earlier, and the sign — the part that says which way the money went — was
// in exactly one of them. So the first two now share gloobalNotifHeadline
// and gloobalNotifSubline (frontend/components/cards/notificationCard.jsx)
// and this composes the same two strings for the third.
//
// It is a deliberate, tested duplication, not an oversight. `backend/` is
// concatenated into the browser bundle and `server/` is a separate npm
// package deployed from its own root directory; there is no module boundary
// between them to import across, which is the same reason
// GLOOBAL_ZERO_DECIMAL_CURRENCIES exists twice. What keeps the copies
// honest is tests/notification-card.test.mjs, which reads both files and
// fails if the two ever disagree about the sign, the word, or the order.
//
// ── The money format ────────────────────────────────────────────────────
//
// Amount first, unit after: "250.00₹", "1,450.25 CHF". A glyph sits tight
// against the number, a symbol containing letters gets a space. That rule,
// the decimal places, and the symbols themselves are all the same sources
// the app uses — countryCurrencyMap's currency master ships the symbols
// with the same trailing-space convention the frontend's table has, and
// decimalsFor is already this server's answer to how many places a currency
// has.
const { buildCurrencyMaster } = require('../data/countryCurrencyMap');
const { decimalsFor } = require('./currencyDecimals');

// code -> symbol, built once. Static reference data; it cannot change
// without a deploy, and a deploy restarts the process.
const SYMBOLS = (() => {
  const map = new Map();
  for (const row of buildCurrencyMaster()) {
    if (row && row.code && row.symbol) map.set(String(row.code).toUpperCase(), String(row.symbol));
  }
  return map;
})();

// The unit as it is written after the amount. Symbols are stored with a
// TRAILING space for the several currencies whose symbol is letters ("CHF ",
// "Rp ", "kr ") because that table was written for prefix use; trimming here
// is what stops "250.00 CHF " arriving with a stray gap on the end.
function currencySuffix(currency) {
  const code = String(currency || '').toUpperCase();
  const symbol = String(SYMBOLS.get(code) || code || '').trim();
  if (!symbol) return '';
  return /[A-Za-z]/.test(symbol) ? ` ${symbol}` : symbol;
}

// The one money formatter for a banner. Mirrors fmtMoney in
// backend/utils/format.js: en-US grouping, the currency's own number of
// decimal places, unit after.
function formatBannerMoney(amount, currency) {
  const places = currency ? decimalsFor(String(currency).toUpperCase()) : 2;
  const digits = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(Number(amount) || 0);
  return `${digits}${currencySuffix(currency)}`;
}

// ── The disc ────────────────────────────────────────────────────────────
//
// In the app the Gloobal mark sits on a coloured circle, and the colour is
// picked from the payment's referenceId so each row keeps its own. The
// operating system will draw an image and nothing else, so the eight
// possible discs are pre-drawn as PNGs (tools/icons/build-notif-discs.mjs)
// and this picks the same one the card would.
//
// The hash is flipSeedHash from frontend/components/common/flipIcons.jsx,
// character for character — plain djb2, coerced to unsigned at every step.
// It only has to spread short ids evenly across eight buckets, but it has
// to do it IDENTICALLY here and in the browser or the lock screen and the
// card show one payment in two colours.
const NOTIF_DISC_COUNT = 8;

function notifDiscIndex(seed) {
  let hash = 5381;
  const text = String(seed || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  }
  return hash % NOTIF_DISC_COUNT;
}

function notifDiscIcon(seed) {
  return `/icons/notif/disc-${notifDiscIndex(seed)}.png`;
}

// The two lines of one payment's banner.
//
// `direction` is 'sent' or 'received' — the viewer's own side, the same
// field the notification row stores. `counterpartyName` is the other party;
// without one the subline says something true rather than "To undefined".
function paymentBannerText({ direction, amount, currency, counterpartyName }) {
  const sent = direction === 'sent';
  return {
    title: `${sent ? '−' : '+'}${formatBannerMoney(amount, currency)} ${sent ? 'sent' : 'received'}`,
    body: counterpartyName
      ? `${sent ? 'To' : 'From'} ${counterpartyName}`
      : (sent ? 'Your Gloobal payment went through.' : 'Money has landed in your Gloobal account.'),
  };
}

module.exports = {
  NOTIF_DISC_COUNT,
  currencySuffix,
  formatBannerMoney,
  notifDiscIndex,
  notifDiscIcon,
  paymentBannerText,
};
