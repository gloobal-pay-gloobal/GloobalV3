// tests/action-tile-motion.test.mjs
//
// The four dashboard action tiles, and the motion that had to mean something.
//
// ── What was already there ───────────────────────────────────────────────
//
// Not stillness. Dashboard.jsx picks ONE of TEN flip-capable buttons every
// 15 seconds and flips it for 1.3s, so any given tile turns about once every
// two and a half minutes. That is why it reads as static: the machinery was
// there and the odds of catching it were not. That flip stays — it is what
// ties these buttons to the dial symbols — and this sits outside it.
//
// ── Why these particular assertions ──────────────────────────────────────
//
// Two of the four tiles, Scan and Receive, carry NO text label. Their meaning
// rests entirely on a glyph, so a movement that restates the meaning is a
// second way to read them. A breath or a sheen would not be: those are alive
// and say nothing, and the send tile would breathe exactly like the bank one.
// So the tests below pin the SPECIFIC motion per tile, not merely that
// something moves.
//
// The rest of the suite is about the two ways this shape fails silently, both
// of which it did fail during the build and neither of which any amount of
// reading caught — they were found by rendering thirty frames and looking:
//
//   1. An animation-delay with the default fill mode shows the element's own
//      resting style until the delay elapses. The scan line had no resting
//      opacity, so it drew a solid bar across its glyph for the first 1.2
//      seconds of every page load.
//   2. A keyframe set that ends somewhere other than where it began pops on
//      every loop. gat-receive opened hoisted above the tile and closed in
//      place, so the icon vanished instantly once per cycle.
//
// Both are also exactly what breaks prefers-reduced-motion, because removing
// the animation leaves whatever the resting state happens to be. This
// codebase has already paid for that once, in the comment about eighteen
// particles parked off-viewport against a blank background.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MOTION = "frontend/components/common/actionTileMotion.jsx";
const FLIP = "frontend/components/common/flipIcons.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const BUILD = "build_app.mjs";

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const code = (p) => strip(readSource(p));

// Pull one @keyframes block out by name, whitespace-collapsed.
function keyframes(name) {
  const src = code(MOTION);
  const at = src.indexOf(`@keyframes ${name} {`);
  assert.ok(at !== -1, `@keyframes ${name} is gone`);
  const close = src.indexOf("\n    }", at);
  assert.ok(close > at, `@keyframes ${name} is unterminated`);
  return src.slice(at, close).replace(/\s+/g, " ");
}

// The same block, read as stops rather than as text.
//
// Parsing rather than pattern-matching, because the two things these tests
// care about — where a set starts, where it settles — are properties of the
// ANIMATION and not of how the CSS happens to be spelled. `26%, 100% { ... }`
// and a separate `24%` stop repeating the 100% values are the same animation,
// and a test that only recognised one spelling would have to be edited every
// time somebody tidied the stylesheet. Returns a map of percent -> declaration
// text, with every value normalised so two stops that look different and
// behave identically compare equal.
function stops(name) {
  const block = keyframes(name);
  const out = new Map();
  const re = /((?:\d+%\s*,\s*)*\d+%)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(block))) {
    const decls = m[2]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .sort()
      .join("; ");
    for (const pct of m[1].split(",")) out.set(Number(pct.trim().replace("%", "")), decls);
  }
  assert.ok(out.size >= 2, `${name} has fewer than two stops`);
  return out;
}

// The earliest percentage from which the animation never changes again — the
// point where it settles and holds for the rest of the cycle.
function settlesAt(name) {
  const s = stops(name);
  const keys = [...s.keys()].sort((a, b) => a - b);
  const final = s.get(100);
  assert.ok(final !== void 0, `${name} has no 100% stop`);
  let earliest = 100;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (s.get(keys[i]) !== final) break;
    earliest = keys[i];
  }
  return earliest;
}

describe("each tile moves the way the thing it does moves", () => {
  test("send leaves the tile, and does not fly back onto it", () => {
    // The gap where it is invisible is the point: a plane that returns along
    // its own path reads as a round trip, which is the opposite of sending.
    const k = keyframes("gat-send");
    assert.match(k, /translate\(14px,-14px\); opacity: 0;/);
    assert.match(k, /translate\(-10px,10px\); opacity: 0;/);
  });

  test("receive arrives from above and stays", () => {
    const k = keyframes("gat-receive");
    assert.match(k, /translateY\(-13px\); opacity: 0;/);
    assert.match(k, /100% \{ transform: translateY\(0\); opacity: 1; \}/);
  });

  test("bank settles rather than bounces", () => {
    // It is the one tile of the four that should look like it is not going
    // anywhere, so the displacement is 3px and there is no overshoot below
    // the resting line.
    const k = keyframes("gat-bank");
    assert.match(k, /translateY\(-3px\)/);
    assert.ok(!/translateY\((?!-3px|0\))/.test(k), "the bank tile travels further than a settle");
  });

  test("scan sweeps a line down its own frame", () => {
    const k = keyframes("gat-sweep");
    assert.match(k, /top: 34%/);
    assert.match(k, /top: 66%/);
  });

  test("no two tiles are given the same animation", () => {
    const src = code(MOTION);
    const names = (src.match(/@keyframes (gat-[a-z]+)/g) || []).map((s) => s.split(" ")[1]);
    assert.equal(new Set(names).size, 4, "the four tiles no longer have four distinct motions");
  });
});

describe("the resting state is the state without the animation", () => {
  // This is the invariant behind both of the render bugs above AND behind
  // reduced motion: strip every animation and the tiles must look exactly as
  // they do at rest — icon present, scan line absent.

  test("every icon keyframe set both starts and ends at rest", () => {
    for (const name of ["gat-send", "gat-receive", "gat-bank"]) {
      const s = stops(name);
      // Rest is: no displacement, and fully opaque if opacity is mentioned
      // at all. The bank tile never touches opacity, which is why this reads
      // the declarations rather than demanding a fixed spelling.
      const atRest = (decls) =>
        /transform: translate(?:Y\(0\)|\(0,0\))/.test(decls) &&
        !/opacity: 0/.test(decls);
      assert.ok(
        atRest(s.get(0)),
        `${name} opens somewhere other than the tile's resting state, so it jumps when its delay elapses: ${s.get(0)}`
      );
      assert.ok(
        atRest(s.get(100)),
        `${name} closes somewhere other than the tile's resting state, so it pops on every loop: ${s.get(100)}`
      );
      assert.equal(
        s.get(0), s.get(100),
        `${name} starts and ends in two different places`
      );
    }
  });

  test("the scan line's resting opacity is on the element, not only in the keyframes", () => {
    // The specific regression: with the default fill mode, an animation-delay
    // leaves the element showing its OWN style for the length of the delay.
    // A keyframe opening at opacity 0 does not help — the delay is before the
    // keyframes apply at all.
    const src = code(MOTION);
    const at = src.indexOf("function ActionTileSweep");
    assert.ok(at > 0);
    const body = src.slice(at);
    assert.match(body, /opacity: 0,/, "the scan line is visible while waiting for its delay");
  });

  test("reduced motion removes the movement and not the icon", () => {
    const src = readSource(MOTION);
    assert.match(src, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(src, /\.gat, \.gat-sweep \{ animation: none !important; \}/);
    assert.match(src, /\.gat-sweep \{ opacity: 0 !important; \}/);
    // And nothing may hide the glyph itself under reduced motion.
    const at = src.indexOf("prefers-reduced-motion");
    const block = src.slice(at, src.indexOf("`}</style>", at));
    assert.ok(!/\.gat \{[^}]*opacity: 0/.test(block), "reduced motion removes the icon");
  });
});

describe("it costs almost nothing when nobody is looking", () => {
  test("each animation holds still for most of its cycle", () => {
    // Four tiles moving continuously on a mid-range Android is a battery cost
    // paid all day for an effect nobody is watching after the first minute.
    // Every set must reach its final value well before 100%.
    for (const name of ["gat-send", "gat-receive", "gat-bank", "gat-sweep"]) {
      const at = settlesAt(name);
      assert.ok(at < 100, `${name} has no hold — it moves for the whole cycle`);
      assert.ok(at <= 35, `${name} is still moving at ${at}% of the cycle`);
    }
  });

  test("the cycle is long and the tiles take turns", () => {
    const src = code(MOTION);
    assert.match(src, /var ACTION_TILE_CYCLE_MS = 9000;/);
    const delays = src.match(/ACTION_TILE_DELAYS = \{([^}]*)\}/);
    assert.ok(delays);
    const values = (delays[1].match(/[\d.]+/g) || []).map(Number);
    assert.equal(values.length, 4);
    assert.equal(new Set(values).size, 4, "two tiles move at the same instant");
  });

  test("a tile that is not one of the four is left alone", () => {
    // Returning null rather than a default keeps a tile added later obviously
    // still, instead of silently inheriting somebody else's meaning.
    const src = code(MOTION);
    assert.match(src, /if \(delay === void 0\) return null;/);
  });
});

describe("it composes with the flip that was already there", () => {
  test("the motion lands on the glyph, never on the face that carries the tint", () => {
    // SyncedFlipIcon's front face IS the tile's tinted background. Animating
    // the wrapper would fly the background away with the plane — and wrapping
    // the icon in a sized-by-content span collapses it, because the icon is
    // width/height 100%.
    const src = code(FLIP);
    assert.match(src, /function SyncedFlipIcon\(\{ Icon, size, flipInfo, frontBackground, radius = T\.radiusLg, iconClassName, iconStyle \}\)/);
    assert.match(src, /\? <span className=\{iconClassName\} style=\{iconStyle\}><Icon size=\{size\} \/><\/span>/);
  });

  test("the icon still renders untouched when no motion is asked for", () => {
    const src = code(FLIP);
    assert.match(src, /\{iconClassName \|\| iconStyle/);
  });

  test("the dashboard mounts the keyframes once, with the tiles that use them", () => {
    // Keyframes travel with what they animate: finDrift lived in App.jsx
    // while its particles lived in a component, and the day that component
    // rendered on a new screen it drew eighteen particles off-viewport.
    const src = code(DASH);
    const styles = src.match(/<ActionTileMotionStyle \/>/g) || [];
    assert.equal(styles.length, 1, `${styles.length} copies of the tile keyframes`);
    assert.ok(
      src.indexOf("<ActionTileMotionStyle />") < src.indexOf("DASHBOARD_ACTIONS.map"),
      "the keyframes are mounted after the tiles that need them"
    );
  });

  test("every action tile is a positioned box, so the scan line has something to sit in", () => {
    const src = code(DASH);
    const at = src.indexOf("DASHBOARD_ACTIONS.map");
    const tile = src.slice(at, src.indexOf("<ActionTileSweep", at));
    assert.match(tile, /position: "relative"/);
  });

  test("the sweep is a sibling of the icon, not a child of it", () => {
    const src = code(DASH);
    assert.match(src, /\/><ActionTileSweep tileKey=\{key\} color=\{actionColor\} \//);
  });
});

describe("the module is actually in the bundle", () => {
  test("build_app.mjs lists it, after the flip icons it depends on", () => {
    // One global scope: a module that reads SyncedFlipIcon's props must be
    // concatenated after it.
    const src = readSource(BUILD);
    const motion = src.indexOf("components/common/actionTileMotion.jsx");
    const flip = src.indexOf("components/common/flipIcons.jsx");
    assert.ok(motion > 0, "actionTileMotion.jsx is not registered in the build");
    assert.ok(flip > 0 && flip < motion, "the tile motion is built before the icons it wraps");
  });

  test("and the dashboard is built after both", () => {
    const src = readSource(BUILD);
    assert.ok(
      src.indexOf("components/common/actionTileMotion.jsx") <
      src.indexOf("screens/Dashboard/Dashboard.jsx")
    );
  });
});
