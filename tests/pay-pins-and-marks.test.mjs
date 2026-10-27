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
  return { PAY_PINS_VISIBLE, PAY_PIN_STAR, togglePayPin, payPinnedFrom, loadPayPins, savePayPins };`)();

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
    // from, so exactly that many fill the row and the rest are a swipe.
    const at = markSrc.indexOf("function PayPinnedStrip");
    const fn = markSrc.slice(at, markSrc.length);
    assert.match(fn, /overflowX: "auto"/);
    assert.match(fn, /items\.map\(/);
    assert.doesNotMatch(fn, /\.slice\(0, PAY_PINS_VISIBLE\)/,
      "the strip renders only the visible pins, so the rest cannot be reached");
  });

  test("a row holds four whole tiles, not four and a half", () => {
    // The founder's call, and the better one: dividing by 4 - 0.4 cropped
    // a fifth tile to say "there is more" and made all four narrower to
    // pay for it — narrow enough that `रसोई Ghar` clamped to two lines.
    assert.equal(pins.PAY_PINS_VISIBLE, 4);
    // Comments stripped: the note above the line explains what the 0.4
    // used to do, and a test that reads prose would fail on the
    // explanation of its own fix.
    const code = strip(markSrc);
    const line = code.split("\n").find((l) => l.includes("const tile = "));
    assert.ok(line, "the strip no longer derives a tile width at all");
    assert.doesNotMatch(line, /- 0\.4/, "a partial tile is back in the row");
    assert.match(line, /\/ \$\{PAY_PINS_VISIBLE\}\)/,
      "the tile width is no longer an exact division of the row");
  });

  test("and the header count is what says there are more", () => {
    // Half a cropped square used to. Against a pale mark the eight pixels
    // that remain are almost nothing, so the number carries it: "Pinned ·
    // 6" beside four tiles is unambiguous in a way the crop never was.
    const at = markSrc.indexOf("function PayPinnedStrip");
    const fn = markSrc.slice(at);
    assert.match(fn, /"· " \+ items\.length/, "the strip no longer counts its own pins");
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
    // The control moved into PayPinStar, so the claim is checked where it
    // now lives rather than against the markup it used to be spelled in.
    // What has to stay true is that the pin is its OWN button, a sibling
    // of the row's pay button, and that it announces its state.
    assert.match(dash, /<PayPinStar\s/, "the row has no pin control at all");
    assert.match(dash, /onToggle=\{\(\) => togglePin\(b\.key\)\}/);
    const at = markSrc.indexOf("function PayPinStar");
    const fn = markSrc.slice(at, markSrc.indexOf("\n}\n", at));
    assert.match(fn, /aria-label=\{`\$\{pinned \? "Unpin" : "Pin"\} \$\{label\}`\}/);
    assert.match(fn, /aria-pressed=\{Boolean\(pinned\)\}/);
    assert.doesNotMatch(dash, /aria-label=\{`Pay \$\{b\.label\}`\}\s*\n\s*className="v2-row"/,
      "the whole row is a single button again, so the pin is nested inside it");
  });

  test("one way into a business, used by the strip and the row", () => {
    // Async now: a pinned CREATOR tile has to resolve before it can open,
    // and the claim this test makes is about there being ONE way in, not
    // about whether it awaits.
    assert.match(dash, /const openBusiness = async \(b\) => \{/);
    assert.match(dash, /onClick=\{\(\) => openBusiness\(b\)\}/);
    assert.match(dash, /onOpen=\{openBusiness\}/);
  });

  test("a pinned creator survives being pinned", () => {
    // ── THE BUG ──────────────────────────────────────────────────────
    //
    // payPinnedFrom resolves a key against TOP_BUSINESSES and nothing
    // else. Pinning a creator stored their symbolId in the same list,
    // flipped the star on their page, and then showed NOTHING in the
    // strip: the key matched no business and was dropped without a word.
    // The star said yes and the strip disagreed, which is what "ping was
    // not working" was looking at.
    assert.match(dash, /payPinnedTiles\(TOP_BUSINESSES, payPins, pinnedCreators\)/,
      "the strip must resolve creators as well as businesses");
    assert.match(pinsSrc, /function payPinnedTiles\(all, keys, creatorCards\)/);
    // Cached at pin time rather than looked up on every open: a dozen
    // requests to draw a row of shortcuts is not a trade worth making.
    assert.match(pinsSrc, /function pinnedCreatorCard\(creator\)/);
    assert.match(dash, /onTogglePin=\{\(\) => togglePin\(openCreator\.symbolId, openCreator\)\}/,
      "the page's own star must hand the creator over so its card can be cached");
  });

  test("what is cached for a tile is only what a tile draws", () => {
    const fn = pinsSrc.slice(pinsSrc.indexOf("function pinnedCreatorCard"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    // A stale cache should cost an out-of-date name on a shortcut, never
    // an out-of-date price: the page behind it is always fetched fresh.
    for (const banned of ["items", "price", "address", "repeatPayers"]) {
      assert.ok(!new RegExp(`\\b${banned}\\b`).test(body),
        `a pinned tile must not cache ${banned}`);
    }
    assert.match(body, /label:/);
    assert.match(body, /handle:/);
  });

  test("a creator tile opens the shop, not the pay sheet", () => {
    const at = dash.indexOf("const openBusiness = async");
    const fn = dash.slice(at, at + 900);
    assert.match(fn, /if \(b && b\.isCreator\)/, "the tile knows which kind it is");
    assert.match(fn, /resolveCreatorHandle/, "and a creator is resolved fresh before opening");
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


// ── ONE PIN CONTROL, NOT THREE ──────────────────────────────────────────
//
// The same verb was drawn three ways: a pushpin outline on the Pay &
// Services rows, a × badge on the pinned tile, and a gold star on a
// creator's own page. The × was the worst of them — a cross DELETES
// everywhere else in this app, and there it only removed a shortcut.
describe("pinning looks like one thing everywhere", () => {
  test("the control is a star, and the fill is what carries the state", () => {
    const at = markSrc.indexOf("function PayPinStar");
    assert.ok(at >= 0, "there is no shared pin control");
    const fn = markSrc.slice(at, markSrc.indexOf("\n}\n", at));
    assert.match(fn, /<Star4/, "the pin control is not a star");
    // A FILL, not two colours. Red-and-green is invisible to about one
    // man in twelve, which is the same reason the bank badges fill.
    assert.match(fn, /fill=\{pinned \? PAY_PIN_STAR : "none"\}/,
      "the star's state is colour alone, which some people cannot see");
  });

  test("no pushpin is left on the rows", () => {
    assert.doesNotMatch(dash, /<Pin1\b/, "the Pay & Services rows still draw a pushpin");
    assert.doesNotMatch(dash, /Pin as Pin1/, "the pushpin import is still carried");
  });

  test("the pinned tile unpins with a star, not with a cross", () => {
    const at = markSrc.indexOf("function PayPinnedStrip");
    const fn = markSrc.slice(at);
    assert.doesNotMatch(fn, /<X12/, "the tile badge is still a cross, which reads as delete");
    assert.match(fn, /<Star4 size=\{11\} color=\{PAY_PIN_STAR\} fill=\{PAY_PIN_STAR\}/);
    assert.match(fn, /aria-label=\{`Unpin \$\{b\.label\}`\}/);
  });

  test("the gold is one constant, so the three cannot drift", () => {
    assert.equal(pins.PAY_PIN_STAR, "#F2B01E");
    const page = readSource("frontend/features/creator/CreatorPage.jsx");
    assert.match(page, /color=\{pinned \? PAY_PIN_STAR : T\.inkFaint\}/);
    for (const [what, src] of [["the creator page", page], ["the strip", markSrc]]) {
      assert.doesNotMatch(src, /"#F2B01E"/, `${what} writes the gold out by hand again`);
    }
  });
});
