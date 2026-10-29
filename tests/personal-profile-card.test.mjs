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

test("copy only — inside the ID box, on its right; share is gone", () => {
  const box = pd.slice(pd.indexOf("data-pd-id"), pd.indexOf("data-pd-stats"));
  assert.match(box, /onClick=\{onCopyId\}/);
  assert.match(box, /aria-label="Copy ID"/);
  assert.ok(box.indexOf("ColoredGloobalId") < box.indexOf("onCopyId"), "copy sits after the ID");
  assert.match(box.slice(0, 260), /width: "100%"/);
  assert.doesNotMatch(pd, /Share ID|onShareId|PdShareIcon/);
  assert.doesNotMatch(dash, /onShareId=/);
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
  for (const prop of ["hoomanScore=", "onOpenHoomanScore=", "shopHandle=", "onOpenShop={openMyShop}", "onCopyId="]) {
    assert.ok(dash.includes(prop), prop);
  }
  assert.match(dash, /profileDetail === "Personal Details" && !creatorProfile\) loadCreatorProfile\(\)/);
});

test("one or two stamps get a hint instead of empty paper", () => {
  assert.match(pd, /crossings\.length > 0 && crossings\.length < 3 && <div\s+data-pd-passport-hint/);
});

test("photo on the left, name and ID on the right, copy inside the ID box", () => {
  const row = pd.slice(pd.indexOf("data-pd-row"));
  assert.match(row.slice(0, 200), /display: "flex", alignItems: "center", gap: 14/);
  const photo = row.indexOf("<ProfileAvatar"), name = row.indexOf("myName && myName.trim()"), id = row.indexOf("data-pd-id"), copy = row.indexOf("onClick={onCopyId}");
  assert.ok(photo > 0 && photo < name && name < id && id < copy, "order is photo, name, ID, copy");
});
