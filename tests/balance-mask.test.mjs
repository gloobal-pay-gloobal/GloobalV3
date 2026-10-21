// tests/balance-mask.test.mjs
//
//   node --test tests/balance-mask.test.mjs
//
// What a hidden balance looks like.
//
// It was seven bullets, which is what every banking app shows and the
// reason to change it: a row of dots says "there is a number here and
// you may not see it", in the tone of a redaction. The founder asked
// for something living instead and drew what he meant: a character
// with arms, feet and a face, waving.
//
// Drawn rather than an emoji, and that is a real difference. An emoji
// is a font glyph — a different picture on every phone, sized by the
// text engine, and incapable of moving. This is SVG the app owns.
//
// ── THE TWO PROPERTIES WORTH TESTING ────────────────────────────────────
//
// First: that a mask LEAKS NOTHING. The obvious design is the wrong one.
// A face that reflected the balance — happy when there is plenty, flat
// when it is thin — would be genuinely alive and genuinely useful, and
// would hand anybody looking at the phone the exact thing the eye was
// tapped to hide.
//
// Second: that the ten are TEN. The first attempt was one round body
// recoloured ten times, which the founder rejected on sight — at 40
// pixels the eye reads silhouette long before hue, so ten tints of one
// circle are one character. The tests below check the drawings differ in
// shape, not only in the hex codes they carry.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MASK = "frontend/components/common/balanceMask.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const BANK = "frontend/screens/Banks/GloobalBankScreen.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const source = readSource(MASK);

// The pure half: the list and the picker, with the drawings sliced off so
// there is no JSX to evaluate. `gloobalAuthToken` and `window` arrive as
// parameters because in the app they are a hoisted function declaration
// from backend/services/api/sessionStore.js and a browser global.
const PURE = source.slice(
  source.indexOf("var BALANCE_MASK_CAST"),
  source.indexOf("var BALANCE_MASK_MARKS")
);

function makeLib(token) {
  const store = new Map();
  const window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    }
  };
  let current = token;
  const lib = new Function("gloobalAuthToken", "window", `${PURE}
    return { BALANCE_MASK_CAST, balanceMaskPick, balanceMaskSignature };`)(
    () => current,
    window
  );
  lib.signIn = (next) => { current = next; };
  lib.store = store;
  return lib;
}

// The drawings, one string per character, taken straight out of the source.
function drawings() {
  const body = source.slice(source.indexOf("function BalanceMaskCreature"));
  const out = new Map();
  const re = /if \(kind === "([a-z]+)"\) \{\s*return ([\s\S]*?)\n  \}/g;
  let hit;
  while ((hit = re.exec(body))) out.set(hit[1], hit[2]);
  return out;
}

describe("the mask cannot be read", () => {
  test("it is not a function of anything", () => {
    // The moment it takes the balance, the account or the hour as an
    // argument, it is carrying information about one of them.
    const lib = makeLib("tok-a");
    assert.equal(lib.balanceMaskPick.length, 0, "the picker takes an argument");
    assert.doesNotMatch(strip(source), /balanceMaskPick\s*\([^)]+\)/,
      "something is passing the picker a value");
  });

  test("no drawing mentions money, and none of them has a second face", () => {
    for (const [name, art] of drawings()) {
      assert.doesNotMatch(art, /balance|amount|total|spend|budget|rupee|GEU/i,
        `the ${name} drawing refers to something about the account`);
      // A character drawn two ways — one cheerful, one not — is the leak
      // arriving by the back door. Each branch returns exactly one picture.
      assert.equal((art.match(/\breturn\b/g) || []).length, 0,
        `the ${name} branch has more than one outcome`);
      assert.doesNotMatch(art, /\?|&&/, `the ${name} drawing is conditional`);
    }
  });

  test("the week's own figures are not masked with it", () => {
    // The founder took this back out: "no need to hide weekly chart
    // amount just the balance". The balance is what you have — the
    // number somebody beside you is trying to read. The week is what
    // moved, which is the half you are most often showing on purpose.
    // strip() first: the comment where it used to live still names it,
    // deliberately, because the reason it went is worth keeping.
    assert.doesNotMatch(strip(source), /BALANCE_FIGURE_MASK/,
      "the chart's figure mask is back");
    assert.doesNotMatch(strip(readSource("frontend/components/cards/misc.jsx")), /\bmasked\b/,
      "DailySpendingChart has grown a masked prop again");
  });
});

describe("ten characters, not one in ten colours", () => {
  test("the cast is ten, named once each, and all of them are drawn", () => {
    const lib = makeLib("tok-a");
    assert.equal(lib.BALANCE_MASK_CAST.length, 10);
    assert.equal(new Set(lib.BALANCE_MASK_CAST).size, 10, "a character is listed twice");
    const drawn = drawings();
    for (const name of lib.BALANCE_MASK_CAST) {
      assert.ok(drawn.has(name), `${name} is in the cast with nothing drawn for it`);
    }
    assert.equal(drawn.size, 10, "there is a drawing for somebody not in the cast");
  });

  test("they differ in shape, not only in colour", () => {
    // This is the test that would have caught the rejected first set: strip
    // every hex code out and the ten geometries must still be ten.
    const bare = [...drawings()].map(([name, art]) => [
      name,
      art.replace(/#[0-9A-Fa-f]{3,8}/g, "").replace(/\s+/g, " ")
    ]);
    const seen = new Map();
    for (const [name, shape] of bare) {
      const twin = seen.get(shape);
      assert.equal(twin, undefined, `${name} is ${twin} in a different colour`);
      seen.set(shape, name);
    }
    // And more than a swapped hat: the path data itself has to differ.
    const paths = bare.map(([name, shape]) => [name, (shape.match(/ d="[^"]+"/g) || []).join("")]);
    for (let i = 0; i < paths.length; i += 1) {
      for (let j = i + 1; j < paths.length; j += 1) {
        assert.notEqual(paths[i][1], paths[j][1],
          `${paths[i][0]} and ${paths[j][0]} are drawn from the same outlines`);
      }
    }
  });

  test("every one of them waves", () => {
    for (const [name, art] of drawings()) {
      assert.match(art, /className="bm-wave"/, `${name} has no waving arm`);
      assert.equal((art.match(/className="bm-wave"/g) || []).length, 1,
        `${name} waves with more than one limb`);
    }
  });

  test("each carries its own gradient, under its own id", () => {
    const ids = [];
    for (const [name, art] of drawings()) {
      const own = art.match(/id="(bmG[A-Za-z]+)"/g) || [];
      assert.ok(own.length >= 1, `${name} has no gradient of its own`);
      for (const id of own) {
        assert.equal(ids.includes(id), false, `${name} reuses the gradient id ${id}`);
        ids.push(id);
        assert.match(art, new RegExp(`url\\(#${id.slice(4, -1)}\\)`),
          `${name} defines ${id} and never paints with it`);
      }
    }
  });
});

describe("one character per sign-in", () => {
  test("the same session keeps the same character", () => {
    const lib = makeLib("token-one");
    const first = lib.balanceMaskPick();
    for (let i = 0; i < 50; i += 1) {
      assert.equal(lib.balanceMaskPick(), first,
        "the character changed without a new sign-in");
    }
  });

  test("signing in again brings a different one", () => {
    const lib = makeLib("token-one");
    let last = lib.balanceMaskPick();
    for (let round = 0; round < 60; round += 1) {
      lib.signIn(`token-${round}-${Math.random()}`);
      const next = lib.balanceMaskPick();
      assert.notEqual(next, last, "two sign-ins in a row drew the same character");
      last = next;
    }
  });

  test("all ten are reachable", () => {
    const lib = makeLib("token-one");
    const seen = new Set();
    for (let round = 0; round < 600; round += 1) {
      lib.signIn(`token-${round}`);
      seen.add(lib.balanceMaskPick());
    }
    assert.equal(seen.size, 10, `only ${seen.size} of the ten ever appear`);
  });

  test("the signature stored is not the token", () => {
    const token = "aVeryRealLookingBearerToken.withASignaturePart";
    const lib = makeLib(token);
    lib.balanceMaskPick();
    const held = lib.store.get("gloobal:balanceMaskSeen");
    assert.ok(held, "nothing was remembered");
    assert.doesNotMatch(held, /aVeryRealLooking|withASignature/,
      "part of the bearer token was written to storage");
    // Short enough that it cannot be carrying the credential: a 32-bit
    // fold in base 36 is at most seven characters.
    const sig = JSON.parse(held).sig;
    assert.ok(sig.length <= 7, `the signature is ${sig.length} characters long`);
    assert.notEqual(sig, token.slice(0, sig.length));
  });

  test("a phone with storage blocked still holds one character", () => {
    const lib = new Function("gloobalAuthToken", "window", `${PURE}
      return { balanceMaskPick };`)(
      () => "token-one",
      { localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } }
    );
    const first = lib.balanceMaskPick();
    assert.ok(first, "it gave up and returned nothing");
    for (let i = 0; i < 20; i += 1) {
      assert.equal(lib.balanceMaskPick(), first,
        "with no storage it re-picks on every hide");
    }
  });

  test("a signed-out page does not crash looking for a token", () => {
    const lib = makeLib(null);
    assert.ok(lib.BALANCE_MASK_CAST.includes(lib.balanceMaskPick()));
    assert.equal(lib.balanceMaskSignature(), "");
  });
});

describe("it breathes, unless asked not to", () => {
  test("the picking happens once per mount, not in the render body", () => {
    assert.match(strip(source), /const \[kind\] = useState47\(balanceMaskPick\);/,
      "the character is not pinned for the life of the mount");
  });

  test("it stops for anybody whose phone asks for less motion", () => {
    assert.match(source, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,160}animation: none/);
  });

  test("a screen reader is told what it is", () => {
    assert.match(source, /role="img"/);
    assert.match(source, /aria-label=\{label\}/);
    assert.match(source, /label = "Balance hidden"/);
    // The drawing itself is hidden from the reader, so it is announced once.
    assert.match(source, /aria-hidden="true"/);
  });

  test("both call sites still ask for it by the card's own font size", () => {
    assert.match(strip(readSource(DASH)), /<BalanceMaskFace size=\{balanceFontSize\} \/>/);
    assert.match(strip(readSource(BANK)), /<BalanceMaskFace size=\{29\} \/>/);
  });
});
