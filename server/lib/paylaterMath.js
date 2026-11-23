// server/lib/paylaterMath.js
//
// ── PAYLATER, BY THE DAY: THE ARITHMETIC ─────────────────────────────────
//
// The founder's rule (23 Nov 2026): "when they use we take 1.5% a month and
// when they hold we share them 1% a month … if we keep sharing profit daily
// it will give the user a reason to hold … they can't have less than what
// they had yesterday … the more they use it the more it grows."
//
// So:
//
//   USING   costs 1.5% a month, counted by the day: 0.05% a day on what is
//           in use. Three days cost three days.
//   HOLDING earns a share of what was collected that day. No fixed rate and
//           nothing made up by GLOOBAL: holders get what users paid. Seeds
//           that are in use do not earn that day.
//   SPLIT   of every rupee collected: 1 to holders, 0.25 to the partner
//           bank, 0.25 to GLOOBAL — two thirds, one sixth, one sixth.
//   LIMIT   is the person's own seeds times their own factor. The factor is
//           1 for everybody today; it rises with milestones later. Nobody
//           takes what the collective shows, only what their account shows.
//
// Everything here is a plain function of its inputs, so it is tested
// without a database (tests/paylater-daily.test.mjs). lib/paylaterDaily.js
// is the part that reads and writes.

const DAY_MS = 86400000;
// 1.5% a month over a 30-day month.
const USE_RATE_PER_DAY = 0.015 / 30;
// How long a use runs before it is late. Paying inside half of it is early.
const TERM_DAYS = 30;
// Of what is collected: holders, the partner bank, GLOOBAL.
const SPLIT = { holders: 1, bank: 0.25, gloobal: 0.25 };
const MAX_FACTOR = 1.2;

const decimalsOf = (currency, decimalsFor) => (typeof decimalsFor === 'function' ? decimalsFor(currency) : 2);
function toMinor(value, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
}

// Whole days a use has run: the day it was taken counts, so taking and
// repaying on the same day is one day, and "after three days" is three.
function daysInUse(from, now = new Date()) {
  const ms = new Date(now).getTime() - new Date(from).getTime();
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

// What using `amount` for `days` costs.
function useFee(amount, days, decimals = 2) {
  if (!(amount > 0) || !(days > 0)) return 0;
  return toMinor(Number(amount) * USE_RATE_PER_DAY * days, decimals);
}

// The limit is the person's own seeds times their own factor (1 today).
function limitFor(seeds, factor = 1, decimals = 2) {
  const f = Math.min(MAX_FACTOR, Math.max(1, Number(factor) || 1));
  return toMinor(Math.max(0, Number(seeds) || 0) * f, decimals);
}
function availableFor(seeds, inUse, factor = 1, decimals = 2) {
  return toMinor(Math.max(0, limitFor(seeds, factor, decimals) - Math.max(0, Number(inUse) || 0)), decimals);
}

// A repayment pays what the use has cost first, then the amount in use.
// Returns how `paying` falls, and what is left of each.
function applyRepayment({ outstanding, feeDue, paying }, decimals = 2) {
  const pay = toMinor(Math.max(0, paying), decimals);
  const fee = toMinor(Math.min(pay, Math.max(0, feeDue)), decimals);
  const principal = toMinor(Math.min(toMinor(pay - fee, decimals), Math.max(0, outstanding)), decimals);
  return {
    fee,
    principal,
    used: toMinor(fee + principal, decimals),
    feeLeft: toMinor(Math.max(0, feeDue - fee), decimals),
    outstandingLeft: toMinor(Math.max(0, outstanding - principal), decimals),
  };
}

// What was collected, split three ways. Holders and the bank are rounded;
// GLOOBAL takes what is left, so the three always add up to `collected`.
function splitCollected(collected, decimals = 2) {
  const total = toMinor(Math.max(0, collected), decimals);
  const whole = SPLIT.holders + SPLIT.bank + SPLIT.gloobal;
  const holders = toMinor(total * (SPLIT.holders / whole), decimals);
  const bank = toMinor(total * (SPLIT.bank / whole), decimals);
  const gloobal = toMinor(total - holders - bank, decimals);
  return { collected: total, holders, bank, gloobal };
}

// A day's share for holders, each in proportion to what they held. Rounded
// DOWN to the minor unit for everyone, and the few minor units left over go
// one each to the largest remainders — so the parts add up exactly to
// `amount`, and nobody is ever given a negative or a fraction.
function shareAmongHolders(amount, holders, decimals = 2) {
  const f = 10 ** decimals;
  const units = Math.round(toMinor(Math.max(0, amount), decimals) * f);
  const list = (holders || []).map((h) => ({ id: String(h.id), held: Math.max(0, Number(h.held) || 0) })).filter((h) => h.held > 0);
  const totalHeld = list.reduce((s, h) => s + h.held, 0);
  if (!(units > 0) || !(totalHeld > 0)) return { shares: [], totalHeld, shared: 0, perUnit: 0 };
  const raw = list.map((h) => { const exact = (units * h.held) / totalHeld; return { id: h.id, held: h.held, base: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = units - raw.reduce((s, r) => s + r.base, 0);
  const order = raw.map((r, i) => i).sort((a, b) => raw[b].rest - raw[a].rest || raw[b].held - raw[a].held || (raw[a].id < raw[b].id ? -1 : 1));
  for (const i of order) { if (left <= 0) break; raw[i].base += 1; left -= 1; }
  const shares = raw.filter((r) => r.base > 0).map((r) => ({ id: r.id, held: r.held, amount: r.base / f }));
  return { shares, totalHeld, shared: units / f, perUnit: units / f / totalHeld };
}

// Early, on time or late — the record milestones are read from.
function repaymentTiming(openedAt, repaidAt, termDays = TERM_DAYS) {
  const days = (new Date(repaidAt).getTime() - new Date(openedAt).getTime()) / DAY_MS;
  if (days <= termDays / 2) return 'early';
  if (days <= termDays) return 'on_time';
  return 'late';
}

// How much of the pool is in use, 0–1.
function usedShare(inUse, held) {
  const whole = Math.max(0, Number(inUse) || 0) + Math.max(0, Number(held) || 0);
  return whole > 0 ? Math.max(0, Number(inUse) || 0) / whole : 0;
}

const dayKey = (d = new Date()) => new Date(d).toISOString().slice(0, 10);

module.exports = {
  DAY_MS, USE_RATE_PER_DAY, TERM_DAYS, SPLIT, MAX_FACTOR,
  toMinor, decimalsOf, daysInUse, useFee, limitFor, availableFor, applyRepayment,
  splitCollected, shareAmongHolders, repaymentTiming, usedShare, dayKey,
};
