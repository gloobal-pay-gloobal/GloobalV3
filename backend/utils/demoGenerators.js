// src/utils/demoGenerators.js
import {
  History as History4
} from "lucide-react";


// src/utils/demoGenerators.js
function randomName() {
  const first = DEMO_FIRST_NAMES[Math.floor(Math.random() * DEMO_FIRST_NAMES.length)];
  const last = DEMO_LAST_NAMES[Math.floor(Math.random() * DEMO_LAST_NAMES.length)];
  return `${first} ${last}`;
}
function randomLocalPhone(iso) {
  const [minLen, maxLen] = mobileDigitRange(iso);
  const len = minLen === maxLen ? minLen : minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
  let digits = "";
  for (let i = 0; i < len; i++) digits += Math.floor(Math.random() * 10);
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ");
}
function generateReferralNetwork() {
  return [];
}
// `weekCount` is how many swipeable week pages the chart gets. It stays
// at 2 for the Dashboard wallet card, which is what it has always shown;
// History passes its own number so the chart covers the period being
// filtered to (one page for Today, five for This Month) instead of
// cutting a thirty-day view off after a fortnight.
// `currencyCode` is the currency the CHART IS LABELLED IN, and rows in any
// other currency are left out of it.
//
// ── Why ────────────────────────────────────────────────────────────────
//
// This summed `t.amount` and never read `t.currency` — the same defect the
// note below describes being removed from computeRealCountrySpend, which
// "added rupees to dollars as bare numbers", still alive in this function.
// Every bar and every total on the wallet card and the History chart is
// printed with ONE currency symbol, so a row in another currency was being
// added in as though it were that one.
//
// A Gloobal Coin purchase is what made it unmissable: buying 1,200 GEU put
// "+1,200.00₹" on the balance card of an account whose rupee balance had
// gone DOWN by 1,200. Cross-border payments had the same problem all along
// and were quieter about it — a restored row keeps the RECEIVER's figure
// where the sender's side was never recorded (see mapServerTransaction), so
// a £20 payment from India could land here as 20 and be drawn as ₹20.
//
// Excluded rather than converted. Converting needs a rate, and the rate that
// applied on the day of each row is not something this function has or should
// go looking for — a chart built on today's rate would restate last week's
// spending every morning. Excluded rather than added, because a bar that
// leaves a figure out is incomplete, and a bar that adds GEU to rupees is
// false. The rows themselves still appear in every list, in their own
// currency, which is where they are readable.
//
// A row with no currency recorded at all is INCLUDED: those predate the
// field, they are domestic by the only evidence available, and dropping them
// would empty the chart for every long-standing account.
function generateDailySpending(sendHistory, receiveHistory, weekCount = 2, currencyCode = null) {
  // Each row AS A FIGURE IN THE CHART'S CURRENCY, through historyAmountIn —
  // the same function the period totals printed beside this chart already
  // use. It prefers the side the server recorded, then the rate the payment
  // itself settled at, and only then a live conversion, reporting `missing`
  // when nothing connects the row to this currency at all. A missing row is
  // left out instead of counted as the zero it used to be counted as.
  //
  // (historyAmountIn lives in frontend/features/history/historyUtils.js. In
  // the concatenated bundle that is the same scope as this file — see
  // build_app.mjs — and it is a hoisted function declaration, so the module
  // order does not matter. Nothing evaluates it at load time.)
  const amountIn = (t) => {
    // A COIN MOVEMENT CANNOT GO ON A ONE-CURRENCY BAR.
    //
    // A buy has two legs in two units running opposite ways — ₹1,200 out of
    // the bank, 1,200 GEU in — and the row carries the COIN leg, because
    // that is what the coin balance moved by. So neither figure can be drawn
    // here honestly: the coin amount is not rupees, and the fiat amount
    // belongs on the other side of the chart from the row it came from.
    // Buying 1,200 GEU drew "+1,200.00₹" on the balance card of an account
    // whose rupee balance had just gone DOWN by 1,200.
    //
    // Left out, in both directions. The movement is still in every list and
    // on its own receipt, in its own units, which is where it reads
    // correctly.
    if (t && (t.kind === "coin" || String(t.currency || "").toUpperCase() === COIN_TICKER)) return null;
    if (typeof historyAmountIn !== "function") return Number(t.amount) || 0;
    const part = historyAmountIn(t, currencyCode || null);
    return part.missing ? null : part.amount;
  };
  const priced = (rows, direction) => rows
    .map((t) => ({ date: parseDemoDate(t.date), amount: amountIn(t), direction }))
    .filter((e) => e.amount !== null);
  const entries = [...priced(sendHistory, "paid"), ...priced(receiveHistory, "received")];
  const anchor = entries.length ? entries.reduce((max, t) => t.date > max ? t.date : max, entries[0].date) : /* @__PURE__ */ new Date();
  const thisWeekStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const weeks = Array.from({ length: Math.max(1, weekCount) }, (_, weekOffset) => {
    const weekStart = new Date(thisWeekStart);
    weekStart.setDate(weekStart.getDate() - weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dayEntries = entries.filter(
        (t) => t.date.getFullYear() === day.getFullYear() && t.date.getMonth() === day.getMonth() && t.date.getDate() === day.getDate()
      );
      const paid = dayEntries.filter((t) => t.direction === "paid").reduce((s, t) => s + t.amount, 0);
      const received = dayEntries.filter((t) => t.direction === "received").reduce((s, t) => s + t.amount, 0);
      return { paid: Math.round(paid * 100) / 100, received: Math.round(received * 100) / 100 };
    });
  });
  const totals = weeks.map((week) => ({
    paid: Math.round(week.reduce((s, d) => s + d.paid, 0) * 100) / 100,
    received: Math.round(week.reduce((s, d) => s + d.received, 0) * 100) / 100
  }));
  return { weeks, totals };
}
// computeRealCountrySpend and computeRealTxnsLastHour used to live here.
//
// Both were removed rather than left beside the server figures they were
// replaced by, because a second way to compute a number is a second answer
// waiting to disagree with the first — and these two were exactly the wrong
// answer. GloobalCoverageScreen now reads every spending figure from
// GET /api/coverage; see server/lib/coverageAggregation.js.
//
// What they did, for anyone looking for them in the history:
//
//   computeRealCountrySpend  grouped this ONE account's sent payments by
//     matching each row's flag EMOJI against ALL_COUNTRIES, and summed
//     `t.amount` without reading `t.currency`. So it added rupees to dollars
//     as bare numbers, filed each payment under the counterparty's country
//     rather than the spender's, dropped every row whose flag did not match
//     (which was every Scan & Pay, since those rows carry no flag), counted
//     Creator Share legs as spending, and could only ever see the newest 100
//     rows the history route returns.
//
//   computeRealTxnsLastHour  rebuilt a Date from each row's DISPLAY strings
//     — `new Date("Sep 5" + the current year + "14:33:07")` — because the
//     real createdAt was discarded when the row was mapped. It stamped the
//     present year onto every payment, so anything from a previous year was
//     silently mis-dated.
//
// dedupeByTxnId went with them; it existed only to serve these two.
function buildGloobalBank(country) {
  return {
    id: "gloobal-bank",
    name: "Gloobal Bank",
    initials: "GB",
    color: "linear-gradient(135deg,#3b6ef5,#7b5bf0)",
    logo: null,
    isGloobal: true,
    phone: `${country.dialCode} \u2022\u2022\u2022\u2022 \u2022\u2022 01`
  };
}
function computeRealActiveUsers(sendHistory, iso, isFullyRegistered) {
  if (!iso) return isFullyRegistered ? 1 : 0;
  if (!isFullyRegistered) return 0;
  return sendHistory.some((t) => ALL_COUNTRIES.find((c) => c.flag === t.flag)?.iso === iso) ? 1 : 0;
}

