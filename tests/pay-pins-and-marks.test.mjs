// tests/pay-pins-and-marks.test.mjs
//
//   node --test tests/pay-pins-and-marks.test.mjs
//
// Pay & Services, rebuilt from the founder's reference.
//
// It was ten businesses in a fixed order that was the same for everybody,
// each wearing a two-letter chip on the same lilac square, under a single
// search box. Most people pay two or three of them and scroll past the
// rest every time.
//
// Three changes: a pinned strip with as many entries as somebody wants,
// a mark per business that is actually that business's own, and the
// search split into the same two boxes a creator's name is typed into.
//
// ── ABOUT REAL BRAND LOGOS ──────────────────────────────────────────────
//
// He asked for them. What is built is the honest version: the PIPELINE
// renders any logo a business or creator has, and everything without one
// gets a colour generated from its own name. Amazon, Walmart and Uber are
// placeholder data, and bundling their trademarked marks into a payment
// app would imply a commercial relationship that does not exist. The test
// at the bottom of this file is what keeps that from being quietly
// reversed later by somebody who does not know it was a decision.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MARK = "frontend/features/creator/businessMark.jsx";
const PINS = "frontend/features/creator/payPins.js";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const markSrc = readSource(MARK);
const pinsSrc = readSource(PINS);
const dash = strip(readSource(DASH));

// Both halves are pure arithmetic over data, so they are run rather than
// pattern-matched: "do these two businesses get different colours" is the
// actual question, and a regex cannot answer it.
const mark = new Function(`${markSrc.slice(markSrc.indexOf("var BUSINESS_MARK_INKS"), markSrc.indexOf("function BusinessMark("))}
  return { BUSINESS_MARK_INKS, businessMarkInk, businessMarkInitials };`)();
const pins = new Function(`${pinsSrc.replace(/^import .*$/gm, "")}
  return { PAY_PINS_VISIBLE, togglePayPin, payPinnedFrom, loadPayPins, savePayPins };`)();

describe("a mark that is the business's own", () => {
  test("neighbours in the list get different colours", () => {
    // The fault as it stood: ten rows, one lilac square, and the only
    // thing telling them apart was the word beside it.
    const names = ["Amazon", "Walmart", "Uber", "Uber Eats", "Starbucks", "McDonald's", "Target", "IKEA", "Zara", "Apple Store"];
    const inks = names.map((n) => mark.businessMarkInk(n).bg);
    assert.ok(new Set(inks).size >= 7, `ten businesses drew ${new Set(inks).size} colours: ${inks.join(" ")}`);
  });

  test("and the same business is the same colour every time", () => {
    // Unsalted, unlike the balance mask's hash. That one is salted per
    // sign-in precisely so the pairing CANNOT be learned; this one wants
    // the opposite — somebody who has paid Uber twice should find the
    // same colour on the third visit, on any device.
    for (let i = 0; i < 50; i += 1) {
      assert.deepEqual(mark.businessMarkInk("Uber Eats"), mark.businessMarkInk("Uber Eats"));
    }
    const fn = markSrc.slice(markSrc.indexOf("function businessMarkInk"), markSrc.indexOf("function businessMarkInitials"));
    assert.doesNotMatch(fn, /Signature|fingerprint|Date|random/i,
      "the colour is being derived from something that changes");
  });

  test("it is never the app's own accent", () => {
    // A row of Gloobal-violet squares would read as a row of Gloobal
    // products rather than as other people's businesses.
    for (const ink of mark.BUSINESS_MARK_INKS) {
      assert.notEqual(ink.fg.toUpperCase(), "#7C3AED");
      assert.notEqual(ink.bg.toUpperCase(), "#7C3AED");
    }
  });

  test("two words give initials, one word gives two letters", () => {
    assert.equal(mark.businessMarkInitials("Uber Eats"), "UE");
    assert.equal(mark.businessMarkInitials("Apple Store"), "AS");
    assert.equal(mark.businessMarkInitials("Amazon"), "AM");
    assert.equal(mark.businessMarkInitials("IKEA"), "IK");
  });

  test("and a name outside the BMP is not cut in half", () => {
    // slice(0, 2) on a surrogate pair returns half a character and
    // renders as a replacement glyph. Taken with the spread operator for
    // exactly that reason.
    const astral = "\u{1D4D0}\u{1D4D1}\u{1D4D2}";
    const out = mark.businessMarkInitials(astral);
    assert.equal([...out].length, 2, `${astral} produced ${out}`);
    assert.ok(!out.includes("�"));
  });

  test("rubbish in does not throw", () => {
    for (const bad of [null, undefined, "", "   ", 42]) {
      assert.doesNotThrow(() => mark.businessMarkInitials(bad), `${bad} threw`);
      assert.doesNotThrow(() => mark.businessMarkInk(bad), `${bad} threw`);
    }
    assert.equal(mark.businessMarkInitials(""), "?");
  });

  test("a logo wins where there is one", () => {
    // This is the whole answer to "real brand logos": the pipeline
    // exists, and any business or creator that HAS a mark shows it. It
    // is the same field the creator setup screen writes.
    const at = markSrc.indexOf("function BusinessMark");
    const fn = markSrc.slice(at, markSrc.indexOf("\n}", at));
    assert.match(fn, /if \(logo\) \{/);
    assert.match(fn, /objectFit: "cover"/);
  });

  test("and no trademarked image is bundled", () => {
    // The placeholders are Amazon, Walmart and Uber. A base64 image
    // appearing in this file, or a logo field appearing on them in the
    // mock data, means somebody has shipped a brand's mark into a
    // payment app without a licence.
    assert.doesNotMatch(markSrc, /data:image\//,
      "an image has been embedded in the mark component");
    const mock = readSource("backend/data/mockData.js");
    const at = mock.indexOf("var TOP_BUSINESSES");
    const list = mock.slice(at, mock.indexOf("];", at));
    assert.doesNotMatch(list, /logo:/,
      "the placeholder businesses have been given logos");
  });
});

describe("as many pins as somebody wants", () => {
  test("pinning appends, so nothing already pinned moves", () => {
    // A strip that reordered itself on every pin would move the tile
    // somebody is reaching for, which is the one thing a pin exists to
    // prevent.
    let keys = [];
    keys = pins.togglePayPin(keys, "amazon");
    keys = pins.togglePayPin(keys, "uber");
    keys = pins.togglePayPin(keys, "zara");
    assert.deepEqual(keys, ["amazon", "uber", "zara"]);
  });

  test("and pinning again unpins", () => {
    const keys = pins.togglePayPin(["amazon", "uber"], "amazon");
    assert.deepEqual(keys, ["uber"]);
  });

  test("there is no cap a person could reach", () => {
    // "Keep pins as much as they want", in his words.
    let keys = [];
    for (let i = 0; i < 40; i += 1) keys = pins.togglePayPin(keys, `b${i}`);
    assert.equal(keys.length, 40);
  });

  test("but storage is not trusted to be sane", () => {
    // Anything on the device can write to localStorage. A 50,000-entry
    // array out of it would be rendered.
    const fn = pinsSrc.slice(pinsSrc.indexOf("function loadPayPins"), pinsSrc.indexOf("function savePayPins"));
    assert.match(fn, /out\.length >= 200/);
    assert.match(fn, /typeof key !== "string"/);
    assert.match(fn, /seen\[key\]/, "a duplicated key would be rendered twice with the same React key");
  });

  test("and a throwing localStorage is survived", () => {
    // It throws outright in Safari's private mode and when storage is
    // disabled. A shortcut list is never worth taking a screen down for.
    const thrower = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
    const lib = new Function("window", `${pinsSrc}
      return { loadPayPins, savePayPins };`)({ localStorage: thrower });
    assert.deepEqual(lib.loadPayPins("x"), []);
    assert.doesNotThrow(() => lib.savePayPins("x", ["a"]));
  });

  test("pins are keyed by account, not by device", () => {
    // Two people sharing a phone is ordinary, and one of them inheriting
    // the other's shortcuts on the Pay screen is a small but real leak
    // of what they buy.
    assert.match(pinsSrc, /function payPinsKey\(symbolId\) \{\s*\n\s*return GLOOBAL_PAY_PINS_KEY_PREFIX \+ String\(symbolId \|\| "anon"\);/);
    assert.match(dash, /loadPayPins\(myGloobalId\)/);
    assert.match(dash, /savePayPins\(myGloobalId, next\)/);
  });

  test("a pin whose business has gone is dropped, not cleaned out", () => {
    // The entry may come back. Deleting somebody's shortcut because a
    // catalogue changed shape for one release would be the wrong trade.
    const all = [{ key: "a", label: "A" }, { key: "c", label: "C" }];
    assert.deepEqual(pins.payPinnedFrom(all, ["a", "b", "c"]).map((x) => x.key), ["a", "c"]);
    assert.doesNotMatch(pinsSrc, /removeItem/, "a missing business is being deleted from storage");
  });

  test("pinned order is pin order, not list order", () => {
    const all = [{ key: "a" }, { key: "b" }, { key: "c" }];
    assert.deepEqual(pins.payPinnedFrom(all, ["c", "a"]).map((x) => x.key), ["c", "a"]);
  });

  test("rubbish out of storage is ignored rather than rendered", () => {
    for (const bad of ['{"not":"an array"}', "null", "[1,2,3]", "oops"]) {
      const lib = new Function("window", `${pinsSrc}
        return { loadPayPins };`)({ localStorage: { getItem: () => bad, setItem() {} } });
      assert.deepEqual(lib.loadPayPins("x"), [], `${bad} got through`);
    }
  });
});

describe("the strip itself", () => {
  test("every pin is rendered and the row scrolls", () => {
    // Not a slice. PAY_PINS_VISIBLE is what the TILE WIDTH is derived
    // from, so roughly that many fit and the next one breaks the edge —
    // which is what says "there is more" without a label.
    assert.equal(pins.PAY_PINS_VISIBLE, 5);
    const at = markSrc.indexOf("function PayPinnedStrip");
    const fn = markSrc.slice(at, markSrc.length);
    assert.match(fn, /overflowX: "auto"/);
    assert.match(fn, /items\.map\(/);
    assert.doesNotMatch(fn, /\.slice\(0, PAY_PINS_VISIBLE\)/,
      "the strip renders only the visible pins, so the rest cannot be reached");
    assert.match(fn, /PAY_PINS_VISIBLE - 0\.4/,
      "the tile width no longer leaves a partial tile at the edge");
  });

  test("the tiles reach the screen edge, so the cut one reads as more", () => {
    const at = markSrc.indexOf("function PayPinnedStrip");
    const fn = markSrc.slice(at);
    assert.match(fn, /margin: "0 -18px"/);
    assert.match(fn, /padding: "2px 18px 6px"/,
      "the first tile sits under the screen edge instead of in the gutter");
  });

  test("and it does not snap", () => {
    // "Proximity" snapping adds nothing a thumb wanted, and leaves the
    // row resting half-way between two tiles after anything scrolls it
    // programmatically — which a render showed, with the first tile
    // clipped by the screen edge.
    const at = markSrc.indexOf("function PayPinnedStrip");
    assert.doesNotMatch(markSrc.slice(at), /scrollSnap/,
      "scroll snapping is back on the pinned strip");
  });

  test("the strip hides while searching rather than filtering", () => {
    // It is a set of shortcuts, not a section of the catalogue.
    // Watching your own pins disappear as you type reads as losing them.
    assert.match(dash, /\{!q && pinnedBusinesses\.length > 0 && <PayPinnedStrip/);
  });

  test("the row is not one button any more", () => {
    // A pin control inside the row's own <button> would be a button
    // inside a button: invalid, inconsistent across browsers, and a tap
    // on the pin would also open the payment underneath it.
    assert.match(dash, /aria-label=\{isPinned \? `Unpin \$\{b\.label\}` : `Pin \$\{b\.label\}`\}/);
    assert.match(dash, /aria-pressed=\{isPinned\}/);
    assert.doesNotMatch(dash, /aria-label=\{`Pay \$\{b\.label\}`\}\s*\n\s*className="v2-row"/,
      "the whole row is a single button again, so the pin is nested inside it");
  });

  test("one way into a business, used by the strip and the row", () => {
    assert.match(dash, /const openBusiness = \(b\) => \{/);
    assert.match(dash, /onClick=\{\(\) => openBusiness\(b\)\}/);
    assert.match(dash, /onOpen=\{openBusiness\}/);
  });
});

describe("the search is shaped like a creator's name", () => {
  test("two boxes with a divider between them", () => {
    assert.match(dash, /placeholder="First name"/);
    assert.match(dash, /placeholder="Last name"/);
    assert.doesNotMatch(dash, /placeholder="Search businesses & services"/,
      "the single search box is back");
  });

  test("both boxes feed one query", () => {
    // A second box that only worked for creators would be dead space on
    // a screen that is mostly businesses.
    assert.match(dash, /const q = flatten\(`\$\{moreQuery\} \$\{moreQueryLast\}`\);/);
    assert.match(dash, /flatten\(b\.label\)\.includes\(q\)/);
  });

  test("and dots and spaces are flattened on both sides", () => {
    // So `rasoi` + `ghar` finds rasoi.ghar whichever way it is written.
    const at = dash.indexOf("const flatten =");
    const fn = dash.slice(at, dash.indexOf(";", at) + 1);
    assert.match(fn, /replace\(\/\[\.\\s\]\+\/g, " "\)/);
    assert.match(fn, /toLowerCase\(\)/);
  });

  test("clearing clears both", () => {
    assert.match(dash, /onClick=\{\(\) => \{ setMoreQuery\(""\); setMoreQueryLast\(""\); \}\}/);
    assert.match(dash, /\{\(moreQuery \|\| moreQueryLast\) && <button/,
      "the clear button only appears for one of the two boxes");
  });

  test("neither box autocapitalises", () => {
    // A phone keyboard capitalising `rasoi` produces a name that does
    // not match what everybody else types.
    const at = dash.indexOf('placeholder="First name"');
    const block = dash.slice(at - 400, at + 400);
    assert.match(block, /autoCapitalize="none"/);
  });
});
