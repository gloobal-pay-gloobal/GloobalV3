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

// 0236: the founder picked the "passport page" layout (A of three). It
// brings back a Share shortcut and a "Member since" line inside the card,
// and moves the flag into the card; these tests follow that choice.
test("copy inside the ID box, on its right; the ID is one line", () => {
  const box = pd.slice(pd.indexOf("data-pd-id\n"), pd.indexOf("data-pd-actions"));
  assert.match(box, /onClick=\{onCopyId\}/);
  assert.match(box, /aria-label="Copy ID"/);
  assert.ok(box.indexOf("PdIdLine") < box.indexOf("onCopyId"), "copy sits after the ID");
  assert.match(box, /whiteSpace: "nowrap"/);
  assert.match(pd, /marginLeft: i > 0 && i % 4 === 0 \? 7 : 0/, "three groups of four");
});

test("the shortcuts under the card: Share ID, My QR, Update ID, Hooman", () => {
  for (const s of ['action(PdShareIcon, "Share ID", onShareId, "share")', 'action(PdQrIcon, "My QR", onOpenQr, "qr")', 'action(PdUpdateIcon, "Update ID", onUpdateId, "update")', 'action(PdScoreIcon, "Hooman", onOpenHoomanScore, "hooman")']) assert.ok(pd.includes(s), s);
  assert.match(dash, /onShareId=\{\(\) => gloobalShareLink\(/);
  assert.match(dash, /onOpenQr=\{\(\) => setShowReceive\(true\)\}/);
  assert.match(dash, /onUpdateId=\{\(\) => setProfileOverlay\("updateId"\)\}/);
});

test("the date shows once: Joined, never a second Member since (0237)", () => {
  assert.doesNotMatch(pd, /Member since \{/);
  assert.match(pd, /factRow\(PdCalendarIcon, "Joined", joinedLong/);
  assert.doesNotMatch(pd, /formatClockTime\(accountCreatedAt\)/, "Joined shows seconds again");
});

test("the mobile number is hidden until the eye is tapped, and hides again", () => {
  assert.match(pd, /\$\{rest\.slice\(0, 2\)\}••• ••\$\{rest\.slice\(-3\)\}/);
  assert.match(pd, /data-pd-action="reveal-mobile"/);
  assert.match(pd, /setTimeout\(\(\) => setShowMobile\(false\), 8000\)/);
});

test("the dashboard wires score, shop, copy and share", () => {
  for (const prop of ["hoomanScore=", "onOpenHoomanScore=", "shopHandle=", "onOpenShop={openMyShop}", "onCopyId="]) {
    assert.ok(dash.includes(prop), prop);
  }
  assert.match(dash, /profileDetail === "Personal Details" && !creatorProfile\) loadCreatorProfile\(\)/);
});

test("one or two stamps get a hint instead of empty paper", () => {
  assert.match(pd, /dressedStamps\.length > 0 && dressedStamps\.length < 3 && <div\s+data-pd-passport-hint/);
});

test("photo on the left, name and ID on the right, copy inside the ID box", () => {
  const row = pd.slice(pd.indexOf("data-pd-row"));
  assert.match(row.slice(0, 200), /display: "flex", alignItems: "center", gap: 14/);
  const photo = row.indexOf("<ProfileAvatar"), name = row.indexOf("myName && myName.trim()"), id = row.indexOf("data-pd-id"), copy = row.indexOf("onClick={onCopyId}");
  assert.ok(photo > 0 && photo < name && name < id && id < copy, "order is photo, name, ID, copy");
});

test("the country and its flag appear once — in the card — with no Country row (0236)", () => {
  assert.equal((pd.match(/<FlagEmoji/g) || []).length, 1);
  assert.doesNotMatch(pd, /"Country", \(dialCountry && dialCountry\.name\)/);
});

test("from the profile, Update ID, Hooman and My QR slide up as sheets over it (0237)", () => {
  assert.match(dash, /const pdSheet = profileDetail === "Personal Details";/);
  for (const k of ["qr", "hooman", "update"]) assert.ok(dash.includes(`data-pd-sheet={pdSheet ? "${k}" : undefined}`), k);
  assert.match(dash, /\{showReceive && pdSheetBackdrop\(requestCloseReceive, "pd-sheet-dim-qr"\)\}/);
  assert.match(dash, /\{profileOverlay === "ghscore" && pdSheetBackdrop\(requestCloseGhScore, "pd-sheet-dim-hooman"\)\}/);
  assert.match(pd, /data-pd-stat=\{i === 2 \? "hooman" : undefined\}/, "the Hooman count opens it too");
  assert.match(dash, /Copied — paste it in any chat to share your GLOOBAL ID/);
});
