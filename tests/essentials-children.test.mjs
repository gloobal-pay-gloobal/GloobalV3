// tests/essentials-children.test.mjs
//
//   node --test tests/essentials-children.test.mjs
//
// Children's Essentials, through their guardian. A child has no account: the
// guardian adds them and draws the child's own daily amount into the
// guardian's balance. The lock is on the guardian. The guardian's own day
// and each child's are counted apart. One guardian per child, under 18 only.
// The real lib/essentials.js runs on stand-in collections.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../server/package.json", import.meta.url));
const mongoose = require("mongoose");

const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const same = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const get = (d, k) => k.split(".").reduce((o, p) => (o == null ? undefined : o[p]), d);
function match(d, q) {
  return Object.entries(q || {}).every(([k, c]) => {
    if (k === "$or") return c.some((x) => match(d, x));
    const v = get(d, k);
    if (c && typeof c === "object" && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => (op === "$exists" ? (v !== undefined) === x : op === "$gte" ? v >= x : (() => { throw new Error(op); })()));
    }
    return same(v, c);
  });
}
const q = (fn) => { const api = { sort: () => api, lean: () => api, session: () => api, then: (a, b) => Promise.resolve().then(fn).then(a, b) }; return api; };

const kids = [];
stub("./models/EssentialsChild", {
  rows: kids,
  find: (f) => q(() => kids.filter((r) => match(r, f))),
  findOne: (f) => q(() => kids.find((r) => match(r, f)) || null),
  countDocuments: async (f) => kids.filter((r) => match(r, f)).length,
  create: async (d) => { if (kids.some((k) => k.childKey === d.childKey)) { const e = new Error("dup"); e.code = 11000; throw e; } const r = { _id: new mongoose.Types.ObjectId(), endedAt: null, endedReason: null, ...d }; kids.push(r); return r; },
  updateOne: async (f, u) => { const r = kids.find((x) => match(x, f)); if (!r) return { matchedCount: 0 }; Object.assign(r, u.$set || {}); return { matchedCount: 1 }; },
});
const pools = [{ countryIso: "IN", currency: "INR", balance: 1e6 }];
stub("./models/EssentialsPool", {
  findOne: (f) => q(() => pools.find((r) => match(r, { countryIso: f.countryIso })) || null),
  findOneAndUpdate: async (f, u) => { const r = pools.find((x) => x.countryIso === f.countryIso && x.balance >= f.balance.$gte); if (!r) return null; for (const [k, n] of Object.entries(u.$inc)) r[k] = (r[k] || 0) + n; return r; },
  updateOne: async () => ({}),
});
stub("./models/EssentialsPoolAdd", { create: async () => ({}) });
const paid = [];
stub("./models/Disbursement", {
  findOne: (f) => q(() => paid.find((p) => p.idempotencyKey === f.idempotencyKey) || null),
  aggregate: (pipe) => q(() => {
    const rows = paid.filter((p) => match(p, pipe[0].$match));
    if (pipe.length > 2) return [];
    const t = rows.reduce((s, p) => s + p.amount, 0);
    return t ? [{ t }] : [];
  }),
});
stub("./lib/disbursement", { recordDisbursement: async (d) => { paid.push({ userId: d.user._id, amount: d.amount, reason: d.reason, idempotencyKey: d.idempotencyKey, metadata: d.metadata, createdAt: new Date() }); d.user.balance += d.amount; } });

const { createEssentials } = require("./lib/essentials");
const users = new Map();
const mkUser = () => { const u = { _id: new mongoose.Types.ObjectId(), iso: "IN", currency: "INR", balance: 0 }; users.set(String(u._id), u); return u; };
const User = { findById: (id) => q(() => users.get(String(id)) || null) };
const routes = {};
const app = { get: (p, ...h) => { routes["GET " + p] = h.at(-1); }, post: (p, ...h) => { routes["POST " + p] = h.at(-1); }, delete: (p, ...h) => { routes["DELETE " + p] = h.at(-1); } };
const pass = (_q, _s, n) => n && n();
const ess = createEssentials({
  User, requireAuth: pass, writeLimit: pass, lookupLimit: pass,
  withAtomicSession: async (fn) => fn({}), isBankOpen: async () => true,
  accountCountryIso: (u) => u.iso, resolveOwnCurrency: async (u) => u.currency,
});
ess.mount(app);
const call = async (key, req) => { let status = 200, body; const res = { status: (s) => { status = s; return res; }, json: (b) => { body = b; return res; } }; await routes[key]({ params: {}, ...req }, res); return { status, body }; };
const yearsAgo = (n, days = 0) => new Date(Date.now() - (n * 365.25 + days) * 86400000).toISOString().slice(0, 10);

test("a guardian adds a child and draws the child's own day, held on the guardian", async () => {
  const mum = mkUser();
  const add = await call("POST /api/essentials/children", { authUser: mum, body: { name: "Riya  Sharma", birthDate: yearsAgo(6) } });
  assert.equal(add.status, 201);
  assert.equal(add.body.children.length, 1);
  assert.deepEqual([add.body.children[0].name, add.body.children[0].age, add.body.children[0].leftToday], ["Riya Sharma", 6, 200]);
  const riya = add.body.children[0].id;

  // Her own ₹200, then Riya's ₹200: two separate days, both into her balance.
  assert.equal((await call("POST /api/essentials/draw", { authUser: mum, body: { amount: 200, idempotencyKey: "own" } })).body.applied, 200);
  const forRiya = await call("POST /api/essentials/draw", { authUser: mum, body: { amount: 250, idempotencyKey: "riya", forChild: riya } });
  assert.equal(forRiya.body.applied, 200, "the child's own daily amount, not more");
  assert.equal(mum.balance, 400);
  // …and the lock is on her: everything used, hers and Riya's, stays in.
  assert.equal(forRiya.body.held, 400);
  assert.equal(forRiya.body.free, 0);
  assert.equal(forRiya.body.leftToday, 0, "her own day is her own");
  assert.equal(forRiya.body.children[0].leftToday, 0);
  assert.equal(forRiya.body.children[0].used, 200);
  const row = paid.find((p) => p.idempotencyKey.endsWith(":riya"));
  assert.ok(same(row.userId, mum._id) && same(row.metadata.heldOnUserId, mum._id) && same(row.metadata.childId, riya));
  // Nothing more today for either.
  assert.equal((await call("POST /api/essentials/draw", { authUser: mum, body: { amount: 10, idempotencyKey: "riya2", forChild: riya } })).body.applied, 0);
});

test("one guardian per child; only the guardian draws; under 18 only", async () => {
  const dad = mkUser();
  const taken = await call("POST /api/essentials/children", { authUser: dad, body: { name: "riya sharma", birthDate: yearsAgo(6) } });
  assert.deepEqual([taken.status, taken.body.code], [409, "has_guardian"]);
  const riya = kids[0];
  const notHis = await call("POST /api/essentials/draw", { authUser: dad, body: { amount: 200, idempotencyKey: "x", forChild: String(riya._id) } });
  assert.deepEqual([notHis.status, notHis.body.code], [404, "child"]);
  const adult = await call("POST /api/essentials/children", { authUser: dad, body: { name: "Arjun", birthDate: yearsAgo(18, 2) } });
  assert.deepEqual([adult.status, adult.body.code], [409, "adult"]);
  const future = await call("POST /api/essentials/children", { authUser: dad, body: { name: "Arjun", birthDate: "2999-01-01" } });
  assert.equal(future.status, 400);
});

test("removing a child stops new draws; what was used stays on the guardian; a child turning 18 ends by itself", async () => {
  const mum = [...users.values()][0];
  const riya = String(kids[0]._id);
  const r = await call("DELETE /api/essentials/children/:id", { authUser: mum, params: { id: riya } });
  assert.equal(r.status, 200);
  assert.equal(r.body.children.length, 0);
  assert.equal(r.body.held, 400, "never undone");
  assert.equal((await call("POST /api/essentials/draw", { authUser: mum, body: { amount: 10, idempotencyKey: "after", forChild: riya } })).status, 404);
  // Added back by the same guardian: the same child, not a new one.
  const back = await call("POST /api/essentials/children", { authUser: mum, body: { name: "Riya Sharma", birthDate: yearsAgo(6) } });
  assert.equal(back.body.id, riya);
  // A child who has turned 18 leaves the list the next time it is read.
  kids[0].birthDate = new Date(yearsAgo(18, 3));
  const me = await call("GET /api/essentials/me", { authUser: mum });
  assert.equal(me.body.children.length, 0);
  assert.equal(kids[0].endedReason, "adult");
});

test("the Essentials screen has the Children card, and the app's calls go to the server", async () => {
  const fs = await import("node:fs");
  const screen = fs.readFileSync(new URL("../frontend/features/essentials/EssentialsScreen.jsx", import.meta.url), "utf8");
  assert.match(screen, /function EssentialsChildrenCard/);
  assert.match(screen, /revealed && summary && summary\.available && <EssentialsChildrenCard/);
  const api = fs.readFileSync(new URL("../backend/services/api/gloobalApi.js", import.meta.url), "utf8");
  assert.match(api, /forChild: childId/);
  assert.match(api, /\/api\/essentials\/children\/\$\{encodeURIComponent\(id\)\}/);
});
