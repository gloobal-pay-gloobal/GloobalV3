// server/lib/serverErrors.js
//
// ── EVERY FAILED REQUEST, COUNTED (0222) ─────────────────────────────────
//
// Any response with a 5xx status is counted, per route and per minute, so
// the staff site can say "12 server errors in the last hour, most on POST
// /api/transactions/send" and alert Admin and Tech when it happens.
// Routes are named as written (":id"), never with an account's ID or a
// payment reference in them. Rows delete themselves after 7 days.
//
// Counted in memory too, so a burst while the database is the thing failing
// still shows up on the screen.
const mongoose = require('mongoose');

const TallySchema = new mongoose.Schema({
  minute: { type: String, required: true },      // 2026-11-03T14:07 (UTC)
  route: { type: String, required: true },
  count: { type: Number, default: 0 },
  lastStatus: { type: Number, default: 500 },
  lastAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});
TallySchema.index({ minute: 1, route: 1 }, { unique: true });
TallySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
TallySchema.index({ lastAt: -1 });
const ServerErrorTally = mongoose.models.ServerErrorTally || mongoose.model('ServerErrorTally', TallySchema);

const memory = [];   // { at, route, status } for the last 24 h
const routeOf = (req) => {
  const base = req.route && req.route.path ? `${req.baseUrl || ''}${req.route.path}` : String(req.path || '')
    .replace(/[0-9a-f]{24}/gi, ':id')
    .replace(/[−+×=○□●■]{6,}/g, ':symbolId')
    .replace(/\/\d+(?=\/|$)/g, '/:n');
  return `${req.method} ${base}`.slice(0, 160);
};
function record(req, status) {
  const route = routeOf(req);
  const now = new Date();
  memory.push({ at: now.getTime(), route, status });
  while (memory.length && now.getTime() - memory[0].at > 86400000) memory.shift();
  if (memory.length > 20000) memory.splice(0, memory.length - 20000);
  if (mongoose.connection.readyState !== 1) return;
  ServerErrorTally.updateOne(
    { minute: now.toISOString().slice(0, 16), route },
    { $inc: { count: 1 }, $set: { lastStatus: status, lastAt: now }, $setOnInsert: { expiresAt: new Date(now.getTime() + 7 * 86400000) } },
    { upsert: true }
  ).catch(() => {});
}
// Express middleware: first in line, so every route is covered.
function middleware(req, res, next) {
  res.on('finish', () => { if (res.statusCode >= 500) record(req, res.statusCode); });
  next();
}
// The last hour and the last day, with the routes that failed most.
async function summary() {
  const now = Date.now();
  let rows = [];
  try {
    rows = await ServerErrorTally.find({ lastAt: { $gte: new Date(now - 86400000) } }, 'minute route count lastStatus lastAt').lean();
  } catch (e) { rows = []; }
  if (!rows.length && memory.length) rows = memory.map((m) => ({ minute: new Date(m.at).toISOString().slice(0, 16), route: m.route, count: 1, lastStatus: m.status, lastAt: new Date(m.at) }));
  const hourAgo = new Date(now - 3600000).toISOString().slice(0, 16);
  const byRoute = new Map();
  let hour = 0, day = 0;
  for (const r of rows) {
    day += r.count;
    if (r.minute >= hourAgo) hour += r.count;
    const x = byRoute.get(r.route) || { route: r.route, count: 0, lastAt: r.lastAt, lastStatus: r.lastStatus };
    x.count += r.count;
    if (r.lastAt > x.lastAt) { x.lastAt = r.lastAt; x.lastStatus = r.lastStatus; }
    byRoute.set(r.route, x);
  }
  return { lastHour: hour, lastDay: day, top: [...byRoute.values()].sort((a, b) => b.count - a.count).slice(0, 6) };
}

module.exports = { middleware, summary, record };
