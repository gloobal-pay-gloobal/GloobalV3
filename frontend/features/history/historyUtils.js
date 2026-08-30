// src/features/history/historyUtils.js
// Today / This Week / This Month, the three periods the History screen
// filters by. `days` counts back INCLUSIVE of today, so "Today" is a
// single day rather than a day and a bit, and "This Week" is the last
// seven calendar days rather than the calendar week — someone looking at
// their history on a Monday wants the week behind them, not the two days
// since Sunday.
var HISTORY_PERIODS = [
  { key: "today", label: "Today", emptyLabel: "today", days: 1, weekPages: 1 },
  { key: "week", label: "This Week", emptyLabel: "this week", days: 7, weekPages: 2 },
  { key: "month", label: "This Month", emptyLabel: "this month", days: 30, weekPages: 5 }
];
function historyPeriodMeta(period) {
  return HISTORY_PERIODS.find((p) => p.key === period) || HISTORY_PERIODS[1];
}
function historyPeriodStart(period, now) {
  const ref = now || /* @__PURE__ */ new Date();
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  start.setDate(start.getDate() - (historyPeriodMeta(period).days - 1));
  return start;
}
// History rows carry a display date ("Aug 13"), not a timestamp, so the
// comparison goes through parseDemoDate — the same reader the daily
// spending chart already uses, which resolves a month/day into the most
// recent year it can have been. A row whose date won't parse is dropped
// from the filtered view rather than silently counted in every period.
function filterHistoryByPeriod(rows, period, now) {
  if (!Array.isArray(rows)) return [];
  const start = historyPeriodStart(period, now);
  return rows.filter((t) => {
    const parsed = parseDemoDate(t.date);
    return !isNaN(parsed.getTime()) && parsed >= start;
  });
}
// The "when" line that sits under a name in a history row: date and time
// together, e.g. "Aug 30 · 13:52".
//
// Seconds are cut. formatClockTime writes "14:07:32" because a receipt wants
// the exact instant, but a list wants a glanceable one, and the third pair of
// digits is pure noise under a name.
//
// A 24-hour clock on purpose. This half of the line has to survive being read
// by someone who reads no English, and 13:52 does that where "1:52 PM" does
// not. (`t.date` is still "Aug 30", which does not — that comes from the row
// data rather than from here, and is its own thing to fix.)
//
// The separator is a middle dot rather than a comma or the word "at": it
// belongs to no language, and it keeps the two halves legible as two facts.
function historyRowStamp(t) {
  if (!t) return "";
  const date = t.date || "";
  if (!t.time) return date;
  const trimmed = String(t.time).match(/^(\d{1,2}:\d{2})/);
  const clock = trimmed ? trimmed[1] : String(t.time);
  return date ? `${date} · ${clock}` : clock;
}
function sumHistoryAmount(rows) {
  return Math.round(rows.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100) / 100;
}
function buildHistoryReceipt(t, direction, dialCountry, ccy) {
  const localCurrency = COUNTRY_CURRENCY[dialCountry.iso] || "USD";
  const counterpartyCountry = ALL_COUNTRIES.find((c) => c.flag === t.flag);
  const counterpartyCurrency = counterpartyCountry ? COUNTRY_CURRENCY[counterpartyCountry.iso] : null;
  const converted = counterpartyCurrency && counterpartyCurrency !== localCurrency ? convert(t.amount, localCurrency, counterpartyCurrency) : null;
  return {
    direction,
    // 'sent' | 'received'
    name: t.name,
    flag: t.flag,
    // Real captured value when present (every row saved since the
    // receipt-determinism fix); falls back to a fresh one only for
    // "sent" rows that predate it, so old demo data doesn't crash —
    // but a transaction that already has its own shareRate/time/txnId
    // must never have it regenerated, or the same transaction would
    // show different numbers on every reopen. A "received" row (the
    // Creator Share side of some earlier payment) always carries its
    // own real shareRate now — never a random fallback, and never a
    // fabricated 0%, since it isn't a new transaction of its own to
    // guess a rate for; it's the same original payment's Creator
    // Share tab, read from the receiving side.
    shareRate: t.shareRate ?? (direction === "sent" ? randomShareRate() : null),
    amount: t.amount,
    currencySymbol: ccy,
    currencyCode: localCurrency,
    convertedAmount: converted,
    convertedCurrency: converted != null ? counterpartyCurrency : null,
    method: HISTORY_METHOD_META[t.method]?.label,
    date: t.date,
    time: t.time || formatClockTime(/* @__PURE__ */ new Date()),
    status: t.status === "completed" || t.status === "received" ? "completed" : t.status,
    txnId: t.txnId || genTxnId(),
    // Present on rows saved from a real payment (see onSendComplete in
    // Send Money); older/seed-less rows simply won't have these, same
    // as before.
    id: t.id,
    phone: t.phone
  };
}

