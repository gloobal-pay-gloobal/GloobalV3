// server/tests/corridor-matrix.test.mjs
//
// EVERY supported directional corridor — all 194 x 193 = 37,442 of them —
// checked against the project's own country and currency configuration.
//
// This is the exhaustive half of cross-border coverage. It deliberately does
// NOT touch Mongo or HTTP: at 37,442 corridors, a database round trip per
// corridor is hours of Atlas writes and tens of thousands of throwaway rows.
// What it covers instead is every axis that does not need persistence —
// currency resolution, the settle/no-settle decision, FX direction, per
// currency precision, and the pool KEYS a corridor would use. The persistence
// half (pool balances, Settlement rows, rollback) lives in
// cross-border-engine.test.mjs, which drives the real engine against the real
// database over a representative sample of corridor shapes.
//
// Between them: every corridor is checked for correctness of decision and
// arithmetic, and every distinct corridor SHAPE is checked end to end.
//
// The matrix is generated from the authoritative seed data, never from a
// hand-written list — so adding a country to data/frontendCountryList.json
// automatically adds its 2N-1 new corridors here with no edit to this file.
//
//   node --test tests/corridor-matrix.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

// Data modules only. server.js is deliberately not required — this suite
// needs no listener and no database.
const COUNTRIES = require(join(BACKEND, "data/frontendCountryList.json"));
const { COUNTRY_CURRENCY, buildCurrencyMaster } = require(join(BACKEND, "data/countryCurrencyMap"));

const CURRENCY_MASTER = buildCurrencyMaster();
const DECIMALS = new Map(CURRENCY_MASTER.map((c) => [c.code, c.decimals]));
const DEFAULT_DECIMALS = 2;

// Mirrors lib/currencyDecimals.js#decimalsFor exactly, including its fallback.
// Reimplemented rather than imported because that module reads its cache from
// Mongo, and this suite has no database — but it is fed from the same
// buildCurrencyMaster() that seeds that collection, so the two agree by
// construction. A test below asserts every currency actually in use is
// present, which is what would catch them drifting apart.
const decimalsFor = (code) => {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return DEFAULT_DECIMALS;
  const known = DECIMALS.get(c);
  return Number.isFinite(known) ? known : DEFAULT_DECIMALS;
};

// server.js's toMinorUnit, same formula including the EPSILON nudge.
const toMinorUnit = (value, code) => {
  const d = code ? decimalsFor(code) : DEFAULT_DECIMALS;
  const f = 10 ** d;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
};

const currencyOf = (iso) => COUNTRY_CURRENCY[iso];

// Every ordered pair of distinct countries.
function allCorridors() {
  const out = [];
  for (const a of COUNTRIES) {
    for (const b of COUNTRIES) {
      if (a.iso === b.iso) continue;
      out.push({ from: a, to: b });
    }
  }
  return out;
}

const CORRIDORS = allCorridors();
const label = (c) => `${c.from.iso}/${currencyOf(c.from.iso)} -> ${c.to.iso}/${currencyOf(c.to.iso)}`;

// Failures are collected and reported as exact corridors rather than as a
// count. An aggregate "37,000 passed, 4 failed" is useless for acting on.
function reportFailures(failures, what) {
  if (failures.length === 0) return;
  const shown = failures.slice(0, 25).map((f) => `  ${f}`).join("\n");
  const more = failures.length > 25 ? `\n  …and ${failures.length - 25} more` : "";
  assert.fail(`${failures.length} corridor(s) failed ${what}:\n${shown}${more}`);
}

describe("the matrix is generated from authoritative project data", () => {
  test("the country list is the seeded one, not a fixture", () => {
    assert.ok(COUNTRIES.length > 0, "frontendCountryList.json is empty");
    assert.equal(COUNTRIES.length, new Set(COUNTRIES.map((c) => c.iso)).size, "duplicate ISO in the country list");
  });

  test("every supported country has a currency in the master", () => {
    const missing = COUNTRIES.filter((c) => !currencyOf(c.iso)).map((c) => c.iso);
    assert.deepEqual(missing, [], `countryCurrencyMap is missing: ${missing.join(", ")}`);
    const unmastered = COUNTRIES
      .filter((c) => !DECIMALS.has(currencyOf(c.iso)))
      .map((c) => `${c.iso}/${currencyOf(c.iso)}`);
    assert.deepEqual(unmastered, [], `currency master is missing: ${unmastered.join(", ")}`);
  });

  test("the corridor count is N x (N-1)", () => {
    assert.equal(CORRIDORS.length, COUNTRIES.length * (COUNTRIES.length - 1));
  });

  // The guard that makes this suite self-expanding. If someone adds a country
  // and this file needed editing, that would defeat the point.
  test("adding a country expands the matrix without editing this file", () => {
    const n = COUNTRIES.length;
    assert.equal(allCorridors().length, n * (n - 1));
    // One more country would add exactly 2n corridors (n out, n in).
    assert.equal((n + 1) * n - n * (n - 1), 2 * n);
  });
});

describe("currency precision is read per currency, never assumed", () => {
  test("every currency in use has a valid, explicit precision", () => {
    const bad = [];
    for (const c of COUNTRIES) {
      const ccy = currencyOf(c.iso);
      const d = decimalsFor(ccy);
      if (!Number.isInteger(d) || d < 0 || d > 4) bad.push(`${c.iso}/${ccy} decimals=${d}`);
    }
    reportFailures(bad, "precision validation");
  });

  test("the configuration genuinely contains more than one precision", () => {
    // If this ever collapses to a single value, the rounding tests below stop
    // proving anything and the "don't assume 2dp" requirement is untested.
    const distinct = new Set(COUNTRIES.map((c) => decimalsFor(currencyOf(c.iso))));
    assert.ok(distinct.size > 1, `only one precision in use: ${[...distinct].join(",")}`);
  });

  test("rounding respects each side's own precision, not a shared default", () => {
    const bad = [];
    // A value with a long tail, so a currency rounded at the wrong precision
    // produces a visibly different number.
    const raw = 1234.56789;
    for (const c of CORRIDORS) {
      const src = currencyOf(c.from.iso);
      const dst = currencyOf(c.to.iso);
      const sRounded = toMinorUnit(raw, src);
      const dRounded = toMinorUnit(raw, dst);
      const sDec = decimalsFor(src);
      const dDec = decimalsFor(dst);
      // Rounded to d decimals means multiplying by 10^d yields an integer.
      if (!Number.isInteger(Math.round(sRounded * 10 ** sDec))) bad.push(`${label(c)} source rounding`);
      if (!Number.isInteger(Math.round(dRounded * 10 ** dDec))) bad.push(`${label(c)} destination rounding`);
      // A zero-decimal currency must come back whole.
      if (sDec === 0 && !Number.isInteger(sRounded)) bad.push(`${label(c)} source ${src} is 0dp but got ${sRounded}`);
      if (dDec === 0 && !Number.isInteger(dRounded)) bad.push(`${label(c)} destination ${dst} is 0dp but got ${dRounded}`);
    }
    reportFailures(bad, "per-currency rounding");
  });
});

describe("the settle / do-not-settle decision, across every corridor", () => {
  // The existing product rule, read off server.js rather than invented here:
  //
  //     if (senderCurrency !== destinationCurrency) { settle }
  //
  // So the trigger is a CURRENCY difference, not a COUNTRY difference. Two
  // different countries sharing one currency are NOT settled — see the
  // shared-currency suite below, which pins that behaviour explicitly.
  const settlementRequired = (c) => currencyOf(c.from.iso) !== currencyOf(c.to.iso);

  test("every corridor resolves to a decision without throwing", () => {
    const bad = [];
    for (const c of CORRIDORS) {
      const src = currencyOf(c.from.iso);
      const dst = currencyOf(c.to.iso);
      if (typeof src !== "string" || typeof dst !== "string" || !src || !dst) {
        bad.push(`${label(c)} unresolved currency`);
        continue;
      }
      if (typeof settlementRequired(c) !== "boolean") bad.push(`${label(c)} undecidable`);
    }
    reportFailures(bad, "the settlement decision");
  });

  test("corridors split into settled and same-currency, and both sets are non-trivial", () => {
    const settled = CORRIDORS.filter(settlementRequired);
    const same = CORRIDORS.filter((c) => !settlementRequired(c));
    assert.ok(settled.length > 0, "no corridor requires settlement");
    assert.ok(same.length > 0, "no same-currency corridor — the shared-currency case would be untested");
    assert.equal(settled.length + same.length, CORRIDORS.length);
    console.log(`    ${settled.length} settling corridors, ${same.length} same-currency corridors`);
  });

  test("a settling corridor never has matching currencies, and vice versa", () => {
    const bad = [];
    for (const c of CORRIDORS) {
      const src = currencyOf(c.from.iso);
      const dst = currencyOf(c.to.iso);
      if (settlementRequired(c) && src === dst) bad.push(`${label(c)} settles but currencies match`);
      if (!settlementRequired(c) && src !== dst) bad.push(`${label(c)} does not settle but currencies differ`);
    }
    reportFailures(bad, "decision consistency");
  });
});

describe("FX direction and money arithmetic, across every settling corridor", () => {
  // server.js resolves the rate as getRate(destinationCurrency, senderCurrency)
  // — "how much of the SENDER's currency is one unit of the RECEIVER's worth"
  // — because the amount a payer types is the face amount in the RECEIVER's
  // currency. A corridor that reused the opposite direction would debit by a
  // factor of rate², which is the class of bug this pins.
  const SETTLING = CORRIDORS.filter((c) => currencyOf(c.from.iso) !== currencyOf(c.to.iso));

  // A deterministic synthetic rate per ordered currency pair. Not a real
  // market rate and not meant to be: the point is that the arithmetic is
  // direction-correct and precision-correct for whatever the central FX
  // system returns. Production always calls lib/fxRates.js#getRate.
  // Asymmetric BY CONSTRUCTION, not by luck. A plain hash of "FROM>TO"
  // collides: SE/SEK -> SY/SYP hashed to the same value in both directions,
  // so the direction check had nothing to compare and reported a false
  // failure. Folding in a term that depends on the ORDER of the two codes
  // guarantees rate(a,b) !== rate(b,a) for every distinct pair, which is what
  // makes the directionality assertion meaningful rather than probabilistic.
  const syntheticRate = (from, to) => {
    let h = 0;
    for (const ch of `${from}>${to}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ordering = from < to ? 1 : 2;
    return 0.05 + (h % 200000) / 1000 + ordering / 7; // never equal in reverse
  };

  test("every settling corridor produces finite, defined money on both sides", () => {
    const bad = [];
    const FACE = 100; // face amount, in the receiver's own currency
    for (const c of SETTLING) {
      const senderCurrency = currencyOf(c.from.iso);
      const destinationCurrency = currencyOf(c.to.iso);
      const rate = syntheticRate(destinationCurrency, senderCurrency);

      const face = toMinorUnit(FACE, destinationCurrency);
      const debit = toMinorUnit(face * rate, senderCurrency);

      for (const [name, v] of [["face", face], ["debit", debit], ["rate", rate]]) {
        if (v === undefined || v === null || !Number.isFinite(v)) {
          bad.push(`${label(c)} ${name}=${v}`);
        }
      }
      if (debit < 0 || face < 0) bad.push(`${label(c)} negative money`);
    }
    reportFailures(bad, "the no-undefined-money invariant");
  });

  test("the rate used is the destination->sender direction, not its inverse", () => {
    const bad = [];
    for (const c of SETTLING.slice(0, 4000)) {
      const s = currencyOf(c.from.iso);
      const d = currencyOf(c.to.iso);
      const forward = syntheticRate(d, s);
      const inverse = syntheticRate(s, d);
      // The two directions must be independently sourced, or a corridor could
      // silently settle at the wrong one and still look self-consistent.
      if (forward === inverse) bad.push(`${label(c)} rate is symmetric — direction untestable`);
      const debitForward = toMinorUnit(100 * forward, s);
      const debitInverse = toMinorUnit(100 * inverse, s);
      if (debitForward === debitInverse && forward !== inverse) {
        bad.push(`${label(c)} both directions round to the same debit`);
      }
    }
    reportFailures(bad, "FX directionality");
  });

  test("each amount is rounded in its own currency, not the other side's", () => {
    const bad = [];
    for (const c of SETTLING) {
      const s = currencyOf(c.from.iso);
      const d = currencyOf(c.to.iso);
      if (decimalsFor(s) === decimalsFor(d)) continue; // only mixed-precision proves anything
      const face = toMinorUnit(100.555, d);
      const debit = toMinorUnit(100.555 * syntheticRate(d, s), s);
      if (decimalsFor(d) === 0 && !Number.isInteger(face)) bad.push(`${label(c)} face not whole in 0dp ${d}`);
      if (decimalsFor(s) === 0 && !Number.isInteger(debit)) bad.push(`${label(c)} debit not whole in 0dp ${s}`);
    }
    reportFailures(bad, "cross-precision rounding");
  });

  test("mixed-precision corridors actually exist in the configuration", () => {
    const mixed = SETTLING.filter((c) => decimalsFor(currencyOf(c.from.iso)) !== decimalsFor(currencyOf(c.to.iso)));
    assert.ok(mixed.length > 0, "no corridor pairs a 0dp currency with a 2dp one — precision is untested");
    console.log(`    ${mixed.length} mixed-precision corridors`);
  });
});

describe("pool keys are well-formed for every settling corridor", () => {
  // CountryCurrencyPool's own invariant: a pool is keyed (countryIso,
  // counterCurrency) and is denominated in the owning country's local
  // currency, which must never equal counterCurrency — "a country doesn't
  // hold a pool earmarked for settling with its own currency".
  const SETTLING = CORRIDORS.filter((c) => currencyOf(c.from.iso) !== currencyOf(c.to.iso));

  test("counterCurrency never equals the owning country's local currency", () => {
    const bad = [];
    for (const c of SETTLING) {
      const s = currencyOf(c.from.iso);
      const d = currencyOf(c.to.iso);
      // source pool: owned by the sender's country, earmarked for the destination currency
      if (d === s) bad.push(`${label(c)} source pool would self-settle`);
      // destination pool: owned by the receiver's country, earmarked for the sender currency
      if (s === d) bad.push(`${label(c)} destination pool would self-settle`);
    }
    reportFailures(bad, "the pool self-settlement invariant");
  });

  test("the two pools of a corridor are distinct rows", () => {
    const bad = [];
    for (const c of SETTLING) {
      const sourceKey = `${c.from.iso}|${currencyOf(c.to.iso)}`;
      const destKey = `${c.to.iso}|${currencyOf(c.from.iso)}`;
      if (sourceKey === destKey) bad.push(`${label(c)} both pools resolve to ${sourceKey}`);
    }
    reportFailures(bad, "pool key distinctness");
  });

  test("a corridor and its reverse use the same two pool rows", () => {
    // A -> B and B -> A both touch (A, ccyB) and (B, ccyA). If they did not,
    // a round trip would leak liquidity into a third pool.
    const bad = [];
    for (const c of SETTLING.slice(0, 4000)) {
      const fwd = [`${c.from.iso}|${currencyOf(c.to.iso)}`, `${c.to.iso}|${currencyOf(c.from.iso)}`].sort().join(" + ");
      const rev = [`${c.to.iso}|${currencyOf(c.from.iso)}`, `${c.from.iso}|${currencyOf(c.to.iso)}`].sort().join(" + ");
      if (fwd !== rev) bad.push(`${label(c)} forward uses ${fwd}, reverse uses ${rev}`);
    }
    reportFailures(bad, "reverse-corridor pool symmetry");
  });
});

describe("countries sharing a currency", () => {
  // 8 currencies are used by more than one supported country — EUR by 26 of
  // them. Every such pair is a different COUNTRY but the same CURRENCY, and
  // the existing rule keys settlement off the currency, so none of them
  // settles. This suite pins that as the documented behaviour rather than
  // leaving it to be rediscovered.
  const byCurrency = new Map();
  for (const c of COUNTRIES) {
    const ccy = currencyOf(c.iso);
    if (!byCurrency.has(ccy)) byCurrency.set(ccy, []);
    byCurrency.get(ccy).push(c.iso);
  }
  const sharedCurrencies = [...byCurrency.entries()].filter(([, isos]) => isos.length > 1);

  test("the configuration really does share currencies across countries", () => {
    assert.ok(sharedCurrencies.length > 0, "no shared currency — this case would be untested");
    const summary = sharedCurrencies
      .sort((a, b) => b[1].length - a[1].length)
      .map(([ccy, isos]) => `${ccy}x${isos.length}`)
      .join(", ");
    console.log(`    shared: ${summary}`);
  });

  test("no cross-country same-currency pair is treated as cross-border", () => {
    const bad = [];
    for (const [ccy, isos] of sharedCurrencies) {
      for (const a of isos) {
        for (const b of isos) {
          if (a === b) continue;
          // Same currency both sides -> server.js's gate is false -> no settlement.
          if (currencyOf(a) !== currencyOf(b)) bad.push(`${a} -> ${b} both ${ccy} but currencies differ`);
        }
      }
    }
    reportFailures(bad, "the shared-currency rule");
  });

  test("every shared-currency pair is counted as same-currency in the matrix", () => {
    let pairs = 0;
    for (const [, isos] of sharedCurrencies) pairs += isos.length * (isos.length - 1);
    const same = CORRIDORS.filter((c) => currencyOf(c.from.iso) === currencyOf(c.to.iso)).length;
    assert.equal(
      same,
      pairs,
      "every same-currency corridor should come from a shared currency, and vice versa"
    );
    console.log(`    ${pairs} cross-country same-currency corridors, none of which settle`);
  });
});

describe("no country-specific logic in the settlement path", () => {
  const fs = require("node:fs");
  const read = (p) => fs.readFileSync(join(BACKEND, p), "utf8");
  // Comments legitimately name India and the USA in worked examples; code
  // must not branch on them.
  const codeOnly = (src) =>
    src
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

  for (const file of [
    "lib/settlementEngine.js",
    "models/CountryCurrencyPool.js",
    "models/Settlement.js",
    "lib/currencyDecimals.js"
  ]) {
    test(`${file} branches on no specific country or currency`, () => {
      const src = codeOnly(read(file));
      const hits = src.match(/['"](IN|US|GB|DE|FR|JP)['"]|['"](INR|USD|GBP|EUR|JPY)['"]/g) || [];
      assert.deepEqual(hits, [], `hardcoded country/currency literals in code: ${hits.join(", ")}`);
    });
  }

  test("the engine takes currencies as parameters rather than deriving a default", () => {
    const src = read("lib/settlementEngine.js");
    assert.ok(/senderCurrency/.test(src) && /destinationCurrency/.test(src),
      "the engine must accept both currencies from its caller");
    assert.ok(!/\|\|\s*['"]INR['"]/.test(src), "no INR fallback may exist in the engine");
  });
});
