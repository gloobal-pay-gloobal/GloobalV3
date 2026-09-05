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
function generateDailySpending(sendHistory, receiveHistory, weekCount = 2) {
  const entries = [
    ...sendHistory.map((t) => ({ date: parseDemoDate(t.date), amount: t.amount, direction: "paid" })),
    ...receiveHistory.map((t) => ({ date: parseDemoDate(t.date), amount: t.amount, direction: "received" }))
  ];
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

