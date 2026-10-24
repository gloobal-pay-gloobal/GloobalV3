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
const PURE = src.slice(src.indexOf("function identityCrossings"), src.indexOf("function identityStampDate"));
const { identityCrossings } = new Function(`${PURE}
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

  test("the slots are fixed, so page two is the same page", () => {
    // A layout that reshuffled itself when the arrow is tapped would read
    // as a different screen rather than the next page of the same one.
    assert.match(strip(src), /slot=\{IDENTITY_STAMP_SLOTS\[i\]\}/,
      "the slot is no longer taken by position, so it can vary per page");
    assert.doesNotMatch(strip(src), /Math\.random/, "the layout has become random");
  });

  test("the page index is clamped, not trusted", () => {
    // A crossing arriving while the last page is open shrinks the count,
    // and an index past the end renders an empty sheet with no way back.
    assert.match(strip(src), /const at = Math\.min\(page, pages - 1\);/);
    assert.match(strip(src), /Math\.max\(1, Math\.ceil\(crossings\.length \/ IDENTITY_STAMPS_PER_PAGE\)\)/);
  });

  test("both arrows exist and neither can run off the end", () => {
    assert.match(strip(src), /\{at > 0 && arrow\("prev"\)\}/);
    assert.match(strip(src), /\{at < pages - 1 && arrow\("next"\)\}/);
    assert.match(strip(src), /Math\.max\(0, Math\.min\(pages - 1, n \+ \(dir === "next" \? 1 : -1\)\)\)/);
  });

  test("the dots appear only when there is more than one page", () => {
    assert.match(strip(src), /\{pages > 1 && <div/);
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
    assert.match(strip(src), /borderRadius: "50%", flexShrink: 0/);
    assert.match(strip(src), /<ProfileAvatar photo=\{profilePhoto\} name=\{myName\} size=\{98\} \/>/,
      "a second photo renderer was hand-rolled instead of reusing ProfileAvatar");
  });

  test("the camera badge rides the circle's edge, not a corner", () => {
    // right/bottom of 0 puts a badge inside a circle, on the face. These
    // are negative for exactly that reason.
    assert.match(strip(src), /right: -1, bottom: -1/);
  });

  test("the title is gone and the flag faces the back arrow", () => {
    assert.match(dash, /profileDetail !== "History" && profileDetail !== "Personal Details" && <span/,
      "the Personal Details title is being rendered again");
    assert.match(dash, /profileDetail === "Personal Details" && <><span style=\{\{ flex: 1 \}\} \/><FlagEmoji/,
      "the flag is not in the header opposite the back arrow");
  });
});

describe("a brand-new account", () => {
  test("gets a sentence, not blank paper", () => {
    // Day one there are no crossings, and an empty sheet is a worse empty
    // state than the space it replaced. It says what would put a mark
    // there, which is the only thing somebody looking at it wants to know.
    assert.match(strip(src), /Pay somebody in another country and the first mark lands here\./);
    assert.match(strip(src), /NO CROSSINGS YET/);
  });

  test("and the count reads in countries, not payments", () => {
    assert.match(strip(src), /crossings\.length === 1 \? "COUNTRY" : "COUNTRIES"/);
  });
});

describe("where it gets its history", () => {
  test("both directions count", () => {
    // A crossing is a payment between two countries; which way the money
    // went does not make it less of one.
    assert.match(dash, /history=\{roleSendHistory\.concat\(receivedRows\)\}/);
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
