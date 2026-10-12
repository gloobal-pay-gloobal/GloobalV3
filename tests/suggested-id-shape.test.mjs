// tests/suggested-id-shape.test.mjs
//
//   node --test tests/suggested-id-shape.test.mjs
//
// The Gloobal ID the app OFFERS, and why it has the shape it has.
//
// ── What changed ───────────────────────────────────────────────────────
//
// It was twelve symbols drawn independently. Nobody remembers twelve
// things, so people were tapping refresh until something happened to look
// memorable — a person doing by hand the job the generator should do.
//
// It is now a motif of four, written twice, then four free symbols:
//
//     ■●○×  ■●○×  ○○==
//
// One short motif to learn, and the repetition makes it stick.
//
// ── The part these tests exist to protect ──────────────────────────────
//
// A Gloobal ID is how money finds a person, and the free tail is a SAFETY
// PROPERTY rather than a leftover.
//
// Free-random IDs draw from 8^12 — 68.7 billion — and that size does real
// work: a mistyped ID almost always names nobody, so a payment fails
// rather than reaching a stranger. Pattern the whole ID and that net
// dissolves. Alternating symbols has 56 members in the entire world;
// blocks of four, 512; blocks of three, 4,096. The suggestions run out,
// and — far worse — the ID one symbol away from yours becomes somebody
// else's, so a typo stops failing and starts paying the wrong person.
//
// Half-patterned keeps both: 1,680 motifs against a free tail is 6,583,920
// suggestable IDs, and two people who draw the same motif still differ
// across four independent symbols rather than one keystroke.
//
// So a future change that extends the pattern over the last four symbols
// would look like an improvement and would be a safety regression. That is
// what the counting test below is for.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SOURCE = "backend/utils/idGenerators.js";
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];

// The shipped function, evaluated from its own source. idGenerators.js is
// concatenated into one scope at build time and has no exports of its own.
const src = readSource(SOURCE);
const genSuggestedId = new Function(`
  var DIAL_SYMBOLS = ${JSON.stringify(SYMBOLS)};
  ${src.slice(
    src.indexOf("var GLOOBAL_ID_MOTIF_LENGTH"),
    src.indexOf("\n}\n", src.indexOf("function genSuggestedId(")) + 2
  )}
  return genSuggestedId;
`)();

const DRAWS = 20000;
const sample = Array.from({ length: DRAWS }, () => genSuggestedId(12));

describe("the suggested ID has a shape a person can hold", () => {
  test("every one is twelve of the eight symbols and nothing else", () => {
    for (const id of sample.slice(0, 2000)) {
      assert.equal([...id].length, 12, `${id} is not twelve symbols`);
      for (const ch of id) {
        assert.ok(SYMBOLS.includes(ch), `${id} contains ${JSON.stringify(ch)}`);
      }
    }
  });

  test("the first four are repeated as the second four", () => {
    // The whole memorability claim. Learn four, say them twice.
    for (const id of sample) {
      const a = [...id];
      assert.equal(a.slice(0, 4).join(""), a.slice(4, 8).join(""),
        `${id} does not repeat its motif`);
    }
  });

  test("the motif's four symbols are all different", () => {
    // "circle, square, minus, equals" is four names said once. ●●■○ makes
    // somebody COUNT a repeat, and counting is what makes a symbol string
    // hard to hold.
    for (const id of sample) {
      const motif = [...id].slice(0, 4);
      assert.equal(new Set(motif).size, 4, `${id} has a repeat inside its motif`);
    }
  });

  test("no symbol appears three times in a row, anywhere", () => {
    // ●●● and ●●●● are told apart by counting, and a person reading their
    // own ID off a screen will get it wrong. Two in a row is fine.
    for (const id of sample) {
      const a = [...id];
      for (let i = 0; i + 2 < a.length; i++) {
        assert.ok(!(a[i] === a[i + 1] && a[i + 1] === a[i + 2]),
          `${id} has three of the same symbol in a row`);
      }
    }
  });
});

describe("the last four stay free, and that is the safety property", () => {
  test("the tail is not the motif a third time", () => {
    // Tidier to look at, and a much smaller shape: motif-times-three is
    // 4,096 IDs against six and a half million. Refused so the suggestion
    // cannot quietly collapse into it.
    for (const id of sample) {
      const a = [...id];
      assert.notEqual(a.slice(8, 12).join(""), a.slice(0, 4).join(""),
        `${id} is the motif three times`);
    }
  });

  test("the tail actually varies when the motif does not", () => {
    // The claim is that two people drawing the same motif are separated by
    // four INDEPENDENT symbols, not by one keystroke. Checked by grouping
    // the sample by motif and counting distinct tails.
    const byMotif = new Map();
    for (const id of sample) {
      const motif = id.slice(0, 4);
      if (!byMotif.has(motif)) byMotif.set(motif, new Set());
      byMotif.get(motif).add(id.slice(8, 12));
    }
    const busiest = [...byMotif.entries()].sort((a, b) => b[1].size - a[1].size)[0];
    assert.ok(busiest && busiest[1].size >= 5,
      `the most-drawn motif produced only ${busiest ? busiest[1].size : 0} distinct tails`);
  });

  test("the tail is NOT constrained to the motif's symbols", () => {
    // A tail drawn only from the motif's four would read as a neater
    // pattern and would cut the space from 6.5 million to 1,680 x 256.
    // Somewhere in a large sample a tail must use a symbol the motif does
    // not contain.
    const escapes = sample.filter((id) => {
      const motif = new Set([...id].slice(0, 4));
      return [...id].slice(8, 12).some((ch) => !motif.has(ch));
    });
    assert.ok(escapes.length > DRAWS * 0.5,
      `only ${escapes.length} of ${DRAWS} tails used a symbol outside the motif — ` +
      `the tail looks constrained to the motif, which collapses the ID space`);
  });

  test("the space is big enough to be worth having", () => {
    // Not a count of the sample — a count of what the rule PERMITS. 1,680
    // ordered motifs of four distinct symbols, against a four-symbol tail,
    // less the tails that would repeat the motif or make a run of three.
    //
    // Asserted as a floor rather than an exact figure so a later tweak to
    // the run rule does not fail a test about the ORDER OF MAGNITUDE,
    // which is the thing that matters.
    const motifs = 8 * 7 * 6 * 5;
    assert.equal(motifs, 1680);
    const atMost = motifs * 8 ** 4;
    assert.ok(atMost > 6_000_000,
      `the shape permits only ${atMost.toLocaleString()} IDs`);
    // And the sample should be nearly all distinct at this size — if it is
    // not, the space is far smaller than the arithmetic claims.
    const distinct = new Set(sample).size;
    assert.ok(distinct > DRAWS * 0.97,
      `${distinct} distinct in ${DRAWS} draws — the real space is smaller than it looks`);
  });
});

describe("what the shape must never become", () => {
  // Each of these is a tidier pattern that somebody could reasonably
  // propose, and each would shrink the space far enough to make a
  // mistyped payment land on a real stranger.
  const FORBIDDEN = [
    ["alternating two symbols", (a) => a.every((ch, i) => ch === a[i % 2]), 56],
    ["six pairs", (a) => [0, 2, 4, 6, 8, 10].every((i) => a[i] === a[i + 1]), 262144],
    ["four blocks of three", (a) => [0, 3, 6, 9].every((i) => a[i] === a[i + 1] && a[i + 1] === a[i + 2]), 4096],
    ["one symbol throughout", (a) => new Set(a).size === 1, 8],
  ];

  for (const [name, matches, size] of FORBIDDEN) {
    test(`no suggestion is ${name} (only ${size.toLocaleString()} of those exist)`, () => {
      const hits = sample.filter((id) => matches([...id]));
      assert.deepEqual(hits, [],
        `${hits.length} suggestion(s) came out as ${name}, e.g. ${hits[0]}`);
    });
  }

  test("a length other than twelve falls back rather than inventing a shape", () => {
    // Nothing asks for one today. The point is that a caller passing 20
    // gets twenty symbols, not a motif shape stretched to fit.
    const odd = genSuggestedId(20);
    assert.equal([...odd].length, 20);
    for (const ch of odd) assert.ok(SYMBOLS.includes(ch));
  });

  test("the generator cannot spin forever", () => {
    // Every candidate is checked and rejected on two rules, so the loop
    // needs a bound — and a bound needs a way out that still returns an ID.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(code, /for \(let attempt = 0; attempt < \d+; attempt\+\+\)/);
    assert.match(code, /return gloobalIdFreeSymbols\(length\)\.join\(""\);[\s\S]*?\n\}/,
      "the bounded loop has no fallback, so an exhausted draw returns nothing");
  });
});

describe("the transaction reference is left alone", () => {
  test("genTxnId is still a free draw", () => {
    // A reference is not read aloud or remembered by anybody; it is
    // compared. Giving it a memorable shape would shrink it for no gain
    // and make two references easier to confuse in a receipt.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // genTxnId's OWN body. Slicing to the next function would now sweep in
    // the motif helpers, which sit between the two in the file — the test
    // would then fail on the mere presence of the new code rather than on
    // the reference using it.
    const at = code.indexOf("function genTxnId()");
    const txn = code.slice(at, code.indexOf("\n}", at) + 2);
    assert.ok(!/MOTIF|gloobalIdMotif/.test(txn),
      "the transaction reference picked up the suggested ID's shape");
    assert.match(txn, /DIAL_SYMBOLS\[Math\.floor\(Math\.random\(\) \* DIAL_SYMBOLS\.length\)\]/);
  });
});
