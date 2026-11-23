// server/lib/exitGuard.js
//
// ── THE EXIT GUARD ───────────────────────────────────────────────────────
//
// The founder's rule: money comes from human hands and goes back to them.
// What goes out of GLOOBAL to outside banks can never be more than the real
// money that came in from outside banks. Essentials, Creator Shares,
// PayLater, growth — everything made inside GLOOBAL — moves freely inside
// it, but none of it can leave as more money than was ever put in.
//
// Per currency, system-wide, on top of each person's own Essentials lock:
//
//      room = everything that came in − everything that went out
//      a transfer out is taken from `room` in the same write as the debit,
//      and only if room covers it. A transfer the bank returns gives it back.
//
// The row is built from the transfers already on record the first time a
// currency is used, so switching this on changes nothing that happened.

const BankFlow = require('../models/BankFlow');
const BankTransfer = require('../models/BankTransfer');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const codeOf = (c) => String(c || '').toUpperCase().trim();

class ExitGuardError extends Error {
  constructor(room, currency) { super('Money going out of GLOOBAL cannot be more than the money that came in.'); this.code = 'exit_guard'; this.room = room; this.currency = currency; }
}

// What is on record, read once per currency to start the row.
async function fromRecord(currency, session) {
  const q = BankTransfer.aggregate([
    { $match: { currency: { $in: [currency, currency.toLowerCase()] }, $or: [{ direction: 'in', status: 'credited' }, { direction: 'out', status: { $in: ['processing', 'credited'] } }] } },
    { $group: { _id: '$direction', t: { $sum: '$amount' } } },
  ]);
  if (session) q.session(session);
  const rows = await q;
  const sum = (d) => round2((rows.find((r) => r._id === d) || {}).t || 0);
  return { in: sum('in'), out: sum('out') };
}
async function ensure(currency, session) {
  const code = codeOf(currency);
  const opt = session ? { session } : {};
  const have = await BankFlow.findOne({ currency: code }, null, opt).lean();
  if (have) return have;
  const r = await fromRecord(code, session);
  try {
    await BankFlow.updateOne({ currency: code }, { $setOnInsert: { currency: code, in: r.in, out: r.out, room: round2(r.in - r.out) } }, { upsert: true, ...opt });
  } catch (error) {
    if (!(error && error.code === 11000)) throw error;
  }
  return BankFlow.findOne({ currency: code }, null, opt).lean();
}

// Real money came in from an outside bank.
async function noteIn(currency, amount, session) {
  const code = codeOf(currency);
  const value = round2(amount);
  if (!(value > 0)) return;
  // A row that did not exist yet is built from the record, which already
  // counts the transfer being written in this same session — so only an
  // existing row is moved.
  const existed = await BankFlow.findOne({ currency: code }, null, session ? { session } : {}).lean();
  if (!existed) { await ensure(code, session); return; }
  await BankFlow.updateOne({ currency: code }, { $inc: { in: value, room: value } }, session ? { session } : {});
}

// Money is going out to an outside bank: only if what came in covers it.
// Call BEFORE the transfer row is written, inside the same session.
async function takeOut(currency, amount, session) {
  const code = codeOf(currency);
  const value = round2(amount);
  await ensure(code, session);
  const took = await BankFlow.findOneAndUpdate(
    { currency: code, room: { $gte: value - 0.005 } },
    { $inc: { out: value, room: -value } },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
  if (!took) {
    const now = await BankFlow.findOne({ currency: code }, null, session ? { session } : {}).lean();
    throw new ExitGuardError(round2(Math.max(0, (now && now.room) || 0)), code);
  }
  return took;
}

// The outside bank sent it back.
async function giveBack(currency, amount, session) {
  const code = codeOf(currency);
  const value = round2(amount);
  if (!(value > 0)) return;
  await ensure(code, session);
  await BankFlow.updateOne({ currency: code }, { $inc: { out: -value, room: value } }, session ? { session } : {});
}

async function standing(currency) {
  const row = await ensure(currency, null);
  return { currency: row.currency, in: round2(row.in), out: round2(row.out), room: round2(row.room) };
}

module.exports = { noteIn, takeOut, giveBack, standing, ensure, ExitGuardError };
