// tests/accounts-tab.test.mjs
//
// The Accounts tab, and the padlock that meant the opposite of what it drew.
//
// ── The bug ──────────────────────────────────────────────────────────────
//
// ServiceLock rendered a CLOSED padlock in both states and changed only
// its colour: red for locked, green for unlocked. A closed padlock means
// "locked" to anyone who has ever seen one, so the shape said locked while
// the colour said open — and the colour was the only thing carrying the
// meaning. On this tab that put green padlocks on the three services that
// were actually available, which reads as exactly the opposite of the
// truth, and a green padlock on About Us, which is an information page and
// cannot be locked at all.
//
// It is also the one signal distinguishing the two states, and it was
// red-against-green: the pair a large minority of people cannot separate.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (f) => readSource(f)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the padlock agrees with itself", () => {
  const misc = () => code("frontend/components/common/misc.jsx");

  test("unlocked draws an OPEN padlock, not a green closed one", () => {
    assert.match(misc(), /const Glyph = locked \? Lock2 : Unlock3;/);
    assert.match(misc(), /<Glyph/);
  });

  test("and the colour still agrees with the shape", () => {
    assert.match(misc(), /color=\{locked \? T\.negative : T\.positive\}/);
  });

  test("the import alias is unique across the bundle", () => {
    // build_app.mjs concatenates every module into ONE scope and
    // consolidates the imports, so two files aliasing the same lucide
    // export to the same name is a duplicate declaration and the whole
    // bundle fails to parse. Unlock2 was already taken by the Coverage
    // screen; esbuild caught it, but only after the build.
    const takenElsewhere = code("frontend/screens/Coverage/GloobalCoverageScreen.jsx");
    assert.match(takenElsewhere, /Unlock as Unlock2/);
    assert.match(misc(), /Unlock as Unlock3/);
  });
});

describe("Gloobal Bank is not a peer of the other five", () => {
  const dash = () => code("frontend/screens/Dashboard/Dashboard.jsx");

  test("it gets the full width and a sentence", () => {
    // Six identical squares said the six things were the same kind of
    // thing. Bank is the account the rest unlock from.
    const src = dash();
    assert.match(src, /background: T\.gradButton, boxShadow: "0 14px 30px rgba\(76,29,149,0\.28\)"/);
    assert.match(src, /the account everything else here unlocks from/);
  });

  test("and it is no longer in the tile list", () => {
    const src = dash();
    const at = src.indexOf('{ key: "gcoin", label: "Gloobal Coin"');
    assert.ok(at > 0, "the tile list is gone");
    const list = src.slice(at, src.indexOf("].map", at));
    assert.ok(!/key: "gbank"/.test(list), "Bank is still a tile as well as a card");
  });
});

describe("the tiles say what they are and what state they are in", () => {
  const dash = () => code("frontend/screens/Dashboard/Dashboard.jsx");

  test("the label is inside the tile", () => {
    // It used to sit outside and below, which left a coloured square with
    // nothing in it and put each name closer to the tile on the next row
    // than to its own.
    assert.match(dash(), /<span style=\{\{ display: "block", fontSize: 13, fontWeight: 800, color: T\.ink, lineHeight: 1\.25 \}\}>\{displayLabel \|\| label\}<\/span>/);
  });

  test("locked is said in words, not in a colour", () => {
    assert.match(dash(), /<ServiceLock locked size=\{11\} \/>Locked/);
  });

  test("every tile reserves the badge's height", () => {
    // Otherwise a locked tile stands taller than its neighbours and the
    // row breaks around it — a layout bug that only appears on the
    // accounts where something is actually locked.
    assert.match(dash(), /marginTop: 7, minHeight: 17/);
  });

  test("the tiles set box-sizing, or the two-up row does not form", () => {
    // calc(50% - 6px) with a 12px gap comes to exactly 100% only under
    // border-box, and this app has no global reset. The About screen's
    // grid failed this way first.
    const src = dash();
    const at = src.indexOf('width: "calc(50% - 6px)"');
    assert.ok(at > 0, "the tile width is gone");
    assert.match(src.slice(at, at + 80), /boxSizing: "border-box"/);
  });
});
