// tests/personal-profile-card.test.mjs
//
// Personal Details as an ID card: icon-only Copy and Share, two stat tiles
// (no "Member since" — Joined already says it), Hooman Score and the shop
// as links, Joined as a date without seconds, and a passport page that
// does not look empty with one stamp.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const pd = readSource("frontend/features/identity/PersonalDetailsScreen.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");

test("copy and share are icon-only buttons with accessible names", () => {
  assert.match(pd, /cardButton\(PdCopyIcon, "Copy ID", onCopyId, "copy"\)/);
  assert.match(pd, /cardButton\(PdShareIcon, "Share ID", onShareId, "share"\)/);
  assert.match(pd, /aria-label=\{label\}/);
  assert.doesNotMatch(pd, /<Icon size=\{15\} color="#fff" \/>\{label\}/, "labels are back on the buttons");
});

test("no Member since tile — Joined is the one place the date lives", () => {
  assert.doesNotMatch(pd, /Member since/);
  assert.match(pd, /\[PdCalendarIcon, "Joined", joinedLong\]/);
  assert.doesNotMatch(pd, /formatClockTime\(accountCreatedAt\)/, "Joined shows seconds again");
});

test("long values wrap instead of running under the map button", () => {
  assert.match(pd, /overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums"/);
});

test("the dashboard wires score, shop, copy and share", () => {
  for (const prop of ["hoomanScore=", "onOpenHoomanScore=", "shopHandle=", "onOpenShop={openMyShop}", "onCopyId=", "onShareId="]) {
    assert.ok(dash.includes(prop), prop);
  }
  assert.match(dash, /profileDetail === "Personal Details" && !creatorProfile\) loadCreatorProfile\(\)/);
});

test("one or two stamps get a hint instead of empty paper", () => {
  assert.match(pd, /crossings\.length > 0 && crossings\.length < 3 && <div\s+data-pd-passport-hint/);
});
