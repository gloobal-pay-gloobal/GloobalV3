// tests/profile-one-place-0247.test.mjs
//
// 0247: Update ID, Hooman and the photo lived twice — in Personal Details
// and in a menu behind the Profile card's circle and ID row. The menu is
// gone; both open Personal Details. Update History opens in front of the
// Update ID sheet (it opened behind it). The four shortcuts turn over
// slowly, one at a time, to a dial symbol in a random colour. All of it
// ran in a browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const d = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const pd = readSource("frontend/features/identity/PersonalDetailsScreen.jsx");

test("no second menu: the Profile card opens Personal Details", () => {
  assert.ok(!/showGhCircleMenu/.test(d), "the ID / Score / Photo menu is back");
  assert.equal((d.match(/onClick=\{openPersonalDetails\}/g) || []).length, 2);
  assert.match(d, /const openPersonalDetails = \(\) => setProfileDetail\("Personal Details"\);/);
});

test("Update History sits above the Update ID sheet", () => {
  assert.match(d, /data-testid="id-update-history" style=\{\{ position: "fixed", inset: 0, zIndex: 340/);
  assert.match(d, /zIndex: 330, background: T\.bg/, "the sheet is at 330");
});

test("the shortcuts flip one at a time, never the same twice running", () => {
  assert.match(pd, /const pool = keys\.filter\(\(k\) => k !== last\);/);
  assert.match(pd, /const keys = \["share", "qr", "update", "hooman"\];/);
  assert.match(pd, /DIAL_SYMBOLS\[Math\.floor\(Math\.random\(\) \* DIAL_SYMBOLS\.length\)\]/);
  assert.match(pd, /prefers-reduced-motion: reduce/);
});
