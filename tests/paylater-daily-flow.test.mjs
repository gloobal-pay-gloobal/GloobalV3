// tests/paylater-daily-flow.test.mjs
//
//   node --test tests/paylater-daily-flow.test.mjs
//
// PayLater by the day, end to end on stand-in collections (no database):
// use → the days pass → repay → the day closes → holders' growth → claim.
// The real lib/paylaterDaily.js and the real lib/custody.js run; only the
// collections are in memory. The rule checked throughout: no money is made
// and none is lost — people's balances, custody, the bank's part and
// GLOOBAL's part always add up to what there was.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../server/package.json", import.meta.url));
const mongoose = require("mongoose");

const same = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
function match(doc, q) {
  return Object.entries(q || {}).every(([k, c]) => {
    if (k === "$expr") return doc.amount > (doc.claimed || 0);
    const v = k.split(".").reduce((o, part) => (o == null ? undefined : o[part]), doc);
    if (c && typeof c === "object" && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === "$lt") return v < x;
        if (op === "$gt") return v > x;
        if (op === "$gte") return v >= x;
        if (op === "$ne") return !same(v, x);
        throw new Error("op " + op);
      });
    }
    return same(v, c);
  });
}
const val = (doc, e) => {
  if (typeof e === "number") return e;
  if (typeof e === "string") return e.startsWith("$") ? doc[e.slice(1)] : e;
  if (e && e.$subtract) return (val(doc, e.$subtract[0]) || 0) - (val(doc, e.$subtract[1]) || 0);
  if (e && e.$ifNull) { const x = val(doc, e.$ifNull[0]); return x == null ? val(doc, e.$ifNull[1]) : x; }
  throw new Error("expr " + JSON.stringify(e));
};
function model(defaults = {}) {
  const rows = [];
  const wrap = (r) => Object.assign(r, { save: async () => r });
  const q = (list, one) => {
    let out = list;
    const api = {
      select: () => api, lean: () => api, session: () => api,
      sort: (s) => { const [[k, d]] = Object.entries(s); out = [...out].sort((a, b) => (a[k] > b[k] ? d : a[k] < b[k] ? -d : 0)); return api; },
      limit: (n) => { out = out.slice(0, n); return api; },
      then: (a, b) => Promise.resolve(one ? out[0] || null : out).then(a, b),
    };
    return api;
  };
  const apply = (r, u) => { for (const [k, v] of Object.entries(u.$set || {})) r[k] = v; for (const [k, n] of Object.entries(u.$inc || {})) r[k] = Math.round(((r[k] || 0) + n) * 1e6) / 1e6; };
  const m = {
    rows,
    find: (f = {}) => q(rows.filter((r) => match(r, f))),
    findOne: (f = {}) => q(rows.filter((r) => match(r, f)), true),
    findById: (id) => q(rows.filter((r) => same(r._id, id)), true),
    create: async (list) => (Array.isArray(list) ? list : [list]).map((d) => { const r = wrap({ _id: new mongoose.Types.ObjectId(), ...defaults, ...d }); rows.push(r); return r; }),
    updateOne: async (f, u, o = {}) => {
      let r = rows.find((x) => match(x, f));
      if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), ...defaults, ...(u.$setOnInsert || {}) }); rows.push(r); }
      if (!r) return { matchedCount: 0 };
      apply(r, u); return { matchedCount: 1 };
    },
    findOneAndUpdate: async (f, u, o = {}) => {
      const r = rows.find((x) => match(x, f));
      if (!r) return null;
      const before = { ...r }; apply(r, u);
      return o.returnDocument === "before" ? before : r;
    },
    aggregate: (pipe) => {
      const run = async () => {
        let list = rows;
        const out = [];
        for (const st of pipe) {
          if (st.$match) list = list.filter((r) => match(r, st.$match));
          if (st.$group) {
            const groups = new Map();
            for (const r of list) {
              const id = st.$group._id === null ? null : val(r, st.$group._id);
              const key = String(id);
              if (!groups.has(key)) groups.set(key, { _id: id });
              for (const [name, spec] of Object.entries(st.$group)) { if (name === "_id") continue; groups.get(key)[name] = (groups.get(key)[name] || 0) + (val(r, spec.$sum) || 0); }
            }
            out.push(...groups.values());
          }
        }
        return out;
      };
      const api = { session: () => api, then: (a, b) => run().then(a, b) };
      return api;
    },
  };
  return m;
}
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };

const User = stub("./models/User", model());
const Transaction = stub("./models/Transaction", model());
const LedgerEntry = stub("./models/LedgerEntry", model());
const AssetSeed = stub("./models/AssetSeed", model({ settledAt: null, principalClaimed: 0 }));
const Use = stub("./models/PayLaterUse", model({ closedAt: null, feeCarried: 0, feePaid: 0 }));
const Day = stub("./models/PayLaterDay", model({ closedAt: null, collected: 0, toHolders: 0, toBank: 0, toGloobal: 0, carried: 0, repayments: 0 }));
const Growth = stub("./models/SeedGrowth", model({ claimed: 0 }));
const Platform = stub("./models/PlatformAccount", model());
Platform.forPurpose = async (purpose, currency) => { let r = Platform.rows.find((x) => x.purpose === purpose && x.currency === currency); if (!r) [r] = await Platform.create({ key: `platform:${purpose}:${currency}`, purpose, currency, balance: 0 }); return r; };
Platform.custodyFor = (c) => Platform.forPurpose("custody", c);
Platform.forCurrency = (c) => Platform.forPurpose("disbursement", c);

const { releaseFromCustody } = require("./lib/custody");
const { createPaylaterDaily } = require("./lib/paylaterDaily");
let refs = 0;
const pl = createPaylaterDaily({
  User, AssetSeed, PlatformAccount: Platform, Transaction, LedgerEntry,
  requireAuth: null, writeLimit: null, lookupLimit: null,
  withAtomicSession: (work) => work({}),
  resolveOwnCurrency: async () => "INR", releaseFromCustody, decimalsFor: () => 2,
  mintReference: () => `REF${++refs}`,
});

const r2 = (n) => Math.round(n * 100) / 100;
const person = async (name, seeds) => {
  const [u] = await User.create({ fullName: name, balance: 0 });
  await AssetSeed.create({ userId: u._id, currency: "INR", cashback: seeds, principalHeld: true });
  const custody = await Platform.custodyFor("INR"); custody.balance = r2(custody.balance + seeds);
  return u;
};
const bal = (purpose) => (Platform.rows.find((x) => x.purpose === purpose) || { balance: 0 }).balance;
const everything = () => r2(User.rows.reduce((s, u) => s + u.balance, 0) + bal("custody") + bal("paylater_bank") + bal("disbursement"));
const daysAgo = (n) => new Date(Date.now() - n * 86400000 + 60000);

test("use, ten days, repay, the day closes, holders grow, growth is claimed — and every rupee is accounted for", async () => {
  const asha = await person("Asha", 1000);
  const ravi = await person("Ravi", 2000);
  assert.equal(everything(), 3000);

  // The limit is her own seeds, 1:1.
  let me = await pl.summary(asha);
  assert.deepEqual([me.seeds, me.limit, me.inUse, me.available, me.factor], [1000, 1000, 0, 1000, 1]);
  await assert.rejects(() => pl.use(asha, 1000.01, "k0"), (e) => e.code === "over_limit");

  // She uses all of it: custody → her balance. Her seeds are still hers.
  assert.deepEqual(await pl.use(asha, 1000, "k1"), { replay: false, used: 1000 });
  assert.deepEqual(await pl.use(asha, 1000, "k1"), { replay: true, used: 1000 }, "the same request twice moves money once");
  assert.equal(User.rows.find((u) => same(u._id, asha._id)).balance, 1000);
  assert.equal(bal("custody"), 2000);
  me = await pl.summary(asha);
  assert.deepEqual([me.seeds, me.inUse, me.available, me.holding], [1000, 1000, 0, 0]);
  await assert.rejects(() => pl.use(asha, 1, "k2"), (e) => e.code === "over_limit");
  assert.equal(await pl.inUseFor(asha._id), 1000, "what the claim and settle routes ask before releasing seeds");
  assert.equal(everything(), 3000);

  // Ten days later it has cost ₹5: 0.05% a day.
  Object.assign(Use.rows[0], { chargedFrom: daysAgo(10), openedAt: daysAgo(10) });
  me = await pl.summary(asha);
  assert.deepEqual([me.costSoFar, me.toRepay, me.costPerDay, me.uses[0].days], [5, 1005, 0.5, 10]);

  // She cannot repay with money she does not have…
  await assert.rejects(() => pl.repay(asha, undefined, "r0"), (e) => e.code === "balance");
});

test("a repayment that fails changes nothing; one that succeeds splits the cost 1 : 0.25 : 0.25", async () => {
  const asha = User.rows.find((u) => u.fullName === "Asha");
  // (stand-in collections have no rollback: put the use back as it was)
  Object.assign(Use.rows[0], { outstanding: 1000, feeCarried: 0, feePaid: 0, closedAt: null, timing: undefined, chargedFrom: daysAgo(10), openedAt: daysAgo(10) });
  asha.balance = 1005; // she earned ₹5 since
  const r = await pl.repay(asha, undefined, "r1");
  assert.deepEqual([r.paid, r.cost, r.principal, r.closed], [1005, 5, 1000, ["early"]]);
  assert.deepEqual(r.split, { collected: 5, holders: 3.33, bank: 0.83, gloobal: 0.84 });
  assert.equal((await pl.repay(asha, undefined, "r1")).replay, true);
  assert.equal(asha.balance, 0);
  assert.equal(bal("custody"), 3003.33, "what was in use is back, with the holders' part of the cost");
  assert.equal(bal("paylater_bank"), 0.83);
  assert.equal(bal("disbursement"), 0.84);
  assert.equal(everything(), 3005, "3000 of seeds + the 5 she earned: nothing made, nothing lost");
  const me = await pl.summary(asha);
  assert.deepEqual([me.inUse, me.available, me.record], [0, 1000, { early: 1, onTime: 0, late: 0 }]);
  assert.equal(Transaction.rows.filter((t) => t.type === "paylater_repay").length, 1);
});

test("the day closes: holders share what was collected, in proportion, and never have less than yesterday", async () => {
  const [asha, ravi] = ["Asha", "Ravi"].map((n) => User.rows.find((u) => u.fullName === n));
  const before = [(await pl.summary(asha)).seeds, (await pl.summary(ravi)).seeds];
  assert.equal(await pl.closeDays("INR"), 0, "today is not over");
  Day.rows[0].day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(await pl.closeDays("INR"), 1);
  assert.equal(await pl.closeDays("INR"), 0, "a day is shared once");
  const after = [await pl.summary(asha), await pl.summary(ravi)];
  assert.deepEqual([after[0].growth, after[1].growth], [1.11, 2.22], "₹3.33 between 1,000 and 2,000");
  assert.ok(after[0].seeds >= before[0] && after[1].seeds >= before[1]);
  assert.deepEqual([after[0].limit, after[1].limit], [1001.11, 2002.22], "growth raises the limit");
  const pool = await pl.pool("INR");
  assert.equal(pool.days.length, 1);
  assert.equal(pool.days[0].growthPer1000, 1.11);
  assert.equal(pool.days[0].usedShare, 0);

  // Ravi claims his growth: real money, out of custody.
  assert.deepEqual(await pl.claimGrowth(ravi, "g1"), { replay: false, claimed: 2.22 });
  assert.equal(ravi.balance, 2.22);
  assert.equal(bal("custody"), 3001.11);
  await assert.rejects(() => pl.claimGrowth(ravi, "g2"), (e) => e.code === "nothing_to_claim");
  assert.equal(everything(), 3005);
});

test("part repayments: the cost is paid first, the rest carries; late is recorded as late", async () => {
  const ravi = User.rows.find((u) => u.fullName === "Ravi");
  await pl.use(ravi, 2000, "k10");
  const use = Use.rows.find((u) => same(u.userId, ravi._id) && !u.closedAt);
  Object.assign(use, { chargedFrom: daysAgo(40), openedAt: daysAgo(40) });
  // 40 days on 2,000 = ₹40. He pays ₹1,040: all of the cost, half of what is in use.
  let r = await pl.repay(ravi, 1040, "r10");
  assert.deepEqual([r.paid, r.cost, r.principal, r.closed], [1040, 40, 1000, []]);
  let me = await pl.summary(ravi);
  assert.deepEqual([me.inUse, me.costSoFar], [1000, 0.5], "the cost so far is settled; a new day has begun on what is left");
  // The rest.
  ravi.balance = r2(ravi.balance + 100);
  r = await pl.repay(ravi, undefined, "r11");
  assert.deepEqual([r.principal, r.cost, r.closed], [1000, 0.5, ["late"]]);
  me = await pl.summary(ravi);
  assert.deepEqual([me.inUse, me.record.late], [0, 1]);
  assert.equal(everything(), r2(3005 + 100));
});
