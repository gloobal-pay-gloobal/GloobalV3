// tests/exit-guard.test.mjs
//
//   node --test tests/exit-guard.test.mjs
//
// The exit guard: what goes out of GLOOBAL to outside banks can never be
// more than the real money that came in from them, per currency. The real
// lib/exitGuard.js runs on stand-in collections.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../server/package.json", import.meta.url));

const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const transfers = [
  { direction: "in", status: "credited", currency: "INR", amount: 1000 },
  { direction: "in", status: "credited", currency: "INR", amount: 500 },
  { direction: "out", status: "credited", currency: "INR", amount: 300 },
  { direction: "out", status: "returned", currency: "INR", amount: 999 },
  { direction: "out", status: "processing", currency: "INR", amount: 200 },
  { direction: "in", status: "credited", currency: "USD", amount: 50 },
];
stub("./models/BankTransfer", {
  aggregate: (pipe) => {
    const m = pipe[0].$match; const cur = m.currency.$in;
    const ok = (t) => cur.includes(t.currency) && ((t.direction === "in" && t.status === "credited") || (t.direction === "out" && ["processing", "credited"].includes(t.status)));
    const by = {}; for (const t of transfers.filter(ok)) by[t.direction] = (by[t.direction] || 0) + t.amount;
    const rows = Object.entries(by).map(([_id, t]) => ({ _id, t }));
    const api = { session: () => api, then: (a, b) => Promise.resolve(rows).then(a, b) }; return api;
  },
});
const flows = [];
const lean = (v) => ({ lean: () => Promise.resolve(v ? { ...v } : null) });
stub("./models/BankFlow", {
  rows: flows,
  findOne: (f) => lean(flows.find((r) => r.currency === f.currency)),
  updateOne: async (f, u, o = {}) => {
    let r = flows.find((x) => x.currency === f.currency);
    if (!r && o.upsert) { r = { ...u.$setOnInsert }; flows.push(r); return; }
    if (!r) return;
    for (const [k, n] of Object.entries(u.$inc || {})) r[k] = Math.round((r[k] + n) * 100) / 100;
  },
  findOneAndUpdate: (f, u) => {
    const r = flows.find((x) => x.currency === f.currency && x.room >= f.room.$gte);
    if (r) for (const [k, n] of Object.entries(u.$inc)) r[k] = Math.round((r[k] + n) * 100) / 100;
    return lean(r);
  },
});
const guard = require("./lib/exitGuard");

test("the first look builds the row from the transfers on record: returned transfers do not count", async () => {
  assert.deepEqual(await guard.standing("INR"), { currency: "INR", in: 1500, out: 500, room: 1000 });
  assert.deepEqual(await guard.standing("usd"), { currency: "USD", in: 50, out: 0, room: 50 });
});

test("out only while what came in covers it; a refusal moves nothing", async () => {
  await guard.takeOut("INR", 999.99, null);
  assert.equal((await guard.standing("INR")).room, 0.01);
  await assert.rejects(() => guard.takeOut("INR", 1, null), (e) => e instanceof guard.ExitGuardError && e.room === 0.01);
  assert.deepEqual(await guard.standing("INR"), { currency: "INR", in: 1500, out: 1499.99, room: 0.01 });
});

test("money coming in makes room; a returned transfer gives its room back", async () => {
  await guard.noteIn("INR", 250, null);
  await guard.takeOut("INR", 250, null);
  await guard.giveBack("INR", 100, null);
  assert.deepEqual(await guard.standing("INR"), { currency: "INR", in: 1750, out: 1649.99, room: 100.01 });
  // Currencies are kept apart.
  await assert.rejects(() => guard.takeOut("USD", 50.01, null), (e) => e.code === "exit_guard");
});

test("wired into the bank routes: in, out (inside the debit's transaction) and returns", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../server/lib/bankTransfers.js", import.meta.url), "utf8");
  assert.equal((src.match(/exitGuard\.noteIn\(currency, /g) || []).length, 2);
  assert.match(src, /const after = round2\(debited\.balance\);[\s\S]{0,200}await exitGuard\.takeOut\(currency, amount, session\);/);
  assert.match(src, /if \(!claimed\) return;\s*await exitGuard\.giveBack\(t\.currency, t\.amount, session\);/);
  assert.match(src, /code: 'exit_guard'/);
});
