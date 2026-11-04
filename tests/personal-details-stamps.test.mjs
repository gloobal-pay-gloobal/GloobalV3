// tests/personal-details-stamps.test.mjs
//
//   node --test tests/personal-details-stamps.test.mjs
//
// Personal Details, rebuilt as the account's identity page.
//
// It was six label:value rows in a white card with the bottom half of the
// screen empty. Everything on it was true and none of it was worth looking
// at twice.
//
// ── THE STAMPS ARE THE POINT ────────────────────────────────────────────
//
// Gloobal stores the counterparty's country on every payment
// (counterpartyIso, see backend/core/transaction/transactionSnapshot.js),
// so the countries this account's money has reached is a record that
// already exists. No other identity screen in any other app could show
// it, which is the whole reason this screen is worth redesigning rather
// than restyling.
//
// Most of what follows is about the GROUPING, because that is where a
// page like this goes wrong: one mark per payment would be a list with
// rotations on it, and counting a domestic payment as a crossing would
// give every Indian account twenty identical INDIA marks.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const PD = "frontend/features/identity/PersonalDetailsScreen.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const src = readSource(PD);
const dash = strip(readSource(DASH));

// The grouping, sliced out and run — this is arithmetic over data, which
// is worth executing rather than pattern-matching.
// identityCrossings leans on identityRowIso, which sits just above it, so
// the slice starts there — otherwise lifting the one function out gives a
// ReferenceError that says nothing about the behaviour being tested.
const PURE = src.slice(src.indexOf("function identityRowIso"), src.indexOf("function identityStampDate"));
const { identityCrossings } = new Function(`var ALL_COUNTRIES = [
    { iso: "JP", flag: "\u{1F1EF}\u{1F1F5}" },
    { iso: "US", flag: "\u{1F1FA}\u{1F1F8}" },
    { iso: "IN", flag: "\u{1F1EE}\u{1F1F3}" }
  ];
  ${PURE}
  return { identityCrossings };`)();

const row = (iso, when) => ({ counterpartyIso: iso, occurredAt: when });

describe("what counts as a crossing", () => {
  test("a payment inside your own country is not one", () => {
    // Otherwise every Indian account's page is twenty identical INDIA
    // marks, and the page says nothing at all.
    const out = identityCrossings([row("IN", "2026-08-13"), row("IN", "2026-09-01")], "IN");
    assert.equal(out.length, 0);
  });

  test("case does not decide it", () => {
    const out = identityCrossings([row("in", "2026-08-13")], "IN");
    assert.equal(out.length, 0, "a lowercase own-country code was counted as a crossing");
  });

  test("a row with no country at all is skipped, not guessed", () => {
    const out = identityCrossings([row("", "2026-08-13"), { occurredAt: "2026-08-14" }, null], "IN");
    assert.equal(out.length, 0);
  });

  test("countryIso is read when counterpartyIso is absent", () => {
    // Rows rebuilt from the server carry countryIso; rows built on this
    // device at the moment of paying carry counterpartyIso. A page that
    // read only one of them would show stamps for history and none for
    // the payment you just made, or the other way round.
    const out = identityCrossings([{ countryIso: "JP", occurredAt: "2026-09-02" }], "IN");
    assert.equal(out.length, 1);
    assert.equal(out[0].iso, "JP");
  });

  test("it survives rubbish without throwing", () => {
    assert.doesNotThrow(() => identityCrossings(null, "IN"));
    assert.doesNotThrow(() => identityCrossings(undefined, undefined));
    assert.equal(identityCrossings("not an array", "IN").length, 0);
  });
});

describe("one mark per country, not per payment", () => {
  test("three payments to Japan make one Japan stamp", () => {
    const out = identityCrossings([
      row("JP", "2026-09-02"), row("JP", "2026-09-19"), row("JP", "2026-10-01")
    ], "IN");
    assert.equal(out.length, 1);
    assert.equal(out[0].count, 3, "the mark does not know how many times it was crossed");
  });

  test("the date on the mark is the FIRST crossing", () => {
    // A stamp records when you entered, and the later ones do not rewrite
    // it. Fed deliberately out of order, because history arrives newest
    // first and the reducer must not take whatever it saw first.
    const out = identityCrossings([
      row("JP", "2026-10-01"), row("JP", "2026-09-02"), row("JP", "2026-09-19")
    ], "IN");
    assert.equal(out[0].first.toISOString().slice(0, 10), "2026-09-02");
  });

  test("countries come oldest first", () => {
    // So the page fills in the order the crossings happened — which is how
    // a passport fills, and means a new country lands at the end instead
    // of shuffling everything already on the page under somebody's thumb.
    const out = identityCrossings([
      row("US", "2026-10-18"), row("JP", "2026-09-02"), row("GB", "2026-10-01")
    ], "IN");
    assert.deepEqual(out.map((c) => c.iso), ["JP", "GB", "US"]);
  });

  test("an undated row still gets a mark, at the end", () => {
    const out = identityCrossings([row("JP", null), row("GB", "2026-10-01")], "IN");
    assert.deepEqual(out.map((c) => c.iso), ["GB", "JP"]);
  });
});

describe("five to a sheet, in the same five places", () => {
  test("there are exactly five slots", () => {
    assert.match(strip(src), /var IDENTITY_STAMPS_PER_PAGE = 5;/);
    const slots = strip(src).slice(strip(src).indexOf("var IDENTITY_STAMP_SLOTS"), strip(src).indexOf("var IDENTITY_STAMP_INKS"));
    assert.equal((slots.match(/\{ x:/g) || []).length, 5);
  });

  // 0243: one stamp per payment, the latest five on the profile and the
  // rest behind the eye — so there are no pages, arrows or dots any more.
  test("the latest five sit in five fixed places; the eye opens the rest", () => {
    assert.match(strip(src), /latestFive\.map\(\(stamp, i\) => <span/);
    assert.match(strip(src), /left: PASSPORT_PROFILE_SLOTS\[i\]\.x, top: PASSPORT_PROFILE_SLOTS\[i\]\.y/);
    assert.match(strip(src), /data-testid="passport-see-all"/);
    assert.doesNotMatch(strip(src), /arrow\("next"\)/, "the paging arrows are back");
    assert.doesNotMatch(strip(src), /Math\.random/, "the layout has become random");
  });

  test("a country always gets the same ink, and neighbours differ", () => {
    const PURE_INK = src.slice(src.indexOf("var IDENTITY_STAMP_INKS"), src.indexOf("// \u2500\u2500 WHICH PAYMENTS"));
    const { identityStampInk } = new Function(`${PURE_INK}
      return { identityStampInk };`)();
    assert.equal(identityStampInk("JP"), identityStampInk("JP"));
    const inks = ["JP", "GB", "US", "AE", "KE"].map(identityStampInk);
    assert.ok(new Set(inks).size >= 4, `five countries drew ${new Set(inks).size} inks`);
  });
});

describe("the four changes asked for", () => {
  test("the dial code row is gone", () => {
    // It was the first three digits of the number on the row above it.
    assert.doesNotMatch(strip(src), /Dial code/);
    assert.doesNotMatch(dash, /\["Dial code", dialCountry\.dialCode\]/,
      "the Dashboard still renders a Dial code row");
  });

  test("the photo is a circle, and uses the app's own avatar", () => {
    assert.match(strip(src), /width: 80, height: 80, borderRadius: "50%", flexShrink: 0/);
    assert.match(strip(src), /<ProfileAvatar photo=\{profilePhoto\} name=\{myName\} size=\{74\} \/>/,
      "a second photo renderer was hand-rolled instead of reusing ProfileAvatar");
  });

  test("the camera badge rides the circle's edge, not a corner", () => {
    // right/bottom of 0 puts a badge inside a circle, on the face. These
    // are negative for exactly that reason.
    assert.match(strip(src), /right: -3, bottom: -3/);
  });

  test("the title is gone, and the flag lives in the ID card (0236)", () => {
    assert.match(dash, /profileDetail !== "History" && profileDetail !== "Personal Details" && <span/,
      "the Personal Details title is being rendered again");
    assert.ok(!/profileDetail === "Personal Details" && <><span style=\{\{ flex: 1 \}\} \/><FlagEmoji/.test(dash), "the flag floats in the header again");
    const pd = readSource("frontend/features/identity/PersonalDetailsScreen.jsx");
    assert.match(pd, /data-pd-country[^>]*>\{dialCountry && dialCountry\.name\}\{dialCountry && dialCountry\.flag \? <FlagEmoji/);
  });
});

describe("a brand-new account", () => {
  test("gets a sentence, not blank paper", () => {
    assert.match(strip(src), /Pay somebody in another country and the first stamp lands here\./);
    assert.match(strip(src), /NO STAMPS YET/);
  });

  test("and the count reads in stamps and countries", () => {
    assert.match(strip(src), /dressedStamps\.length === 1 \? "STAMP" : "STAMPS"/);
    assert.match(strip(src), /countryCount === 1 \? "COUNTRY" : "COUNTRIES"/);
  });
});

describe("where it gets its history", () => {
  test("payments made, both sides of the account (0243)", () => {
    // The founder's pick: money SENT, Personal and Creator. The server's
    // full record replaces this as soon as it answers.
    assert.match(dash, /history=\{sendHistory\}/);
    assert.match(strip(src), /GloobalApi\.getPassport\(me\)/);
  });

  test("it is in the bundle, ahead of the screen that hosts it", () => {
    const build = readSource("build_app.mjs");
    const at = build.indexOf("const FRONTEND_MODULES");
    const modules = build.slice(at, build.indexOf("\n];", at));
    assert.match(modules, /"features\/identity\/PersonalDetailsScreen\.jsx"/);
    assert.ok(
      modules.indexOf("PersonalDetailsScreen.jsx") < modules.indexOf("screens/Dashboard/Dashboard.jsx"),
      "the screen is emitted after the Dashboard that renders it"
    );
  });
});

describe("a crossing is found however the row happens to name it", () => {
  test("a row with only a flag still stamps", () => {
    // ── WHY THIS MATTERS MORE THAN IT LOOKS ──────────────────────────
    //
    // This read counterpartyIso and countryIso only. Both are set by the
    // paths that build a row from a resolved counterparty — but a row
    // that arrived carrying a FLAG and no ISO stamped nothing, silently,
    // and a missing stamp looks exactly like a payment that never
    // crossed a border. Every row on this screen draws a flag, so the
    // flag is the last thing worth asking before giving up.
    const out = identityCrossings([{ flag: "🇯🇵", occurredAt: "2026-09-02" }], "IN");
    assert.equal(out.length, 1);
    assert.equal(out[0].iso, "JP");
  });

  test("your own flag is still not a crossing", () => {
    const out = identityCrossings([{ flag: "🇮🇳", occurredAt: "2026-09-02" }], "IN");
    assert.deepEqual(out, []);
  });

  test("an unknown flag is skipped, not guessed", () => {
    const out = identityCrossings([{ flag: "🏴‍☠️", occurredAt: "2026-09-02" }], "IN");
    assert.deepEqual(out, []);
  });

  test("a row with no timestamp falls back to its display date", () => {
    // occurredAt is what the server records. A row built locally — Pay a
    // Business, and anything written before that field existed — carries
    // only the display date, which is still a date and still better than
    // a stamp with a blank line where one should be.
    const out = identityCrossings([{ countryIso: "JP", date: "2026-09-02" }], "IN");
    assert.equal(out.length, 1);
    assert.ok(out[0].first instanceof Date, "the stamp gets a date to print");
  });
});

describe("the sheet is the size of what is on it", () => {
  const sheet = new Function(`${src.slice(src.indexOf("var IDENTITY_STAMP_SLOTS"), src.indexOf("// The inks a border officer"))}
    ${src.slice(src.indexOf("function identitySheetHeight"), src.indexOf("// The inks a border officer's pad would hold.", src.indexOf("function identitySheetHeight")))}
    return identitySheetHeight;`)();

  test("one stamp does not get a postcard of empty paper", () => {
    // It was a flat 362px — the height five stamps need — whatever was on
    // the page. An account with one crossing got one mark in the corner of
    // an empty beige rectangle, which reads as a page that failed to load
    // rather than as a passport with one stamp in it.
    const one = sheet(1);
    const five = sheet(5);
    assert.ok(one < five, "a page with one stamp is shorter than a page with five");
    assert.ok(one >= 150, "but not so short that the stamp fills it edge to edge");
    assert.ok(five >= 300, "five still get the room they need");
  });

  test("it grows with the stamps, not in steps somebody guessed", () => {
    // Measured from the lowest slot in use, so moving a slot moves the
    // sheet with it and the two cannot drift apart.
    const heights = [1, 2, 3, 4, 5].map(sheet);
    for (let i = 1; i < heights.length; i += 1) {
      assert.ok(heights[i] >= heights[i - 1], "never shrinks as stamps are added");
    }
    assert.ok(heights[4] > heights[0]);
  });

  test("zero is treated as one, so an empty page still looks like paper", () => {
    assert.equal(sheet(0), sheet(1));
  });
});
