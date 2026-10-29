// tests/open-hours.test.mjs
//
// Opening hours: the shop page's "Open · closes 10 pm" and the server's
// Open now filter come from one shared block of code, in the shop's own
// time zone, with late nights past midnight.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { readSource, ROOT } from "./harness.mjs";

const require = createRequire(import.meta.url);
const srv = require(path.join(ROOT, "server/lib/openHours.js"));
const shared = (src) => src.slice(src.indexOf("// ── SHARED BEGIN ──"), src.indexOf("// ── SHARED END ──"));

function client() {
  const src = readSource("frontend/features/creator/openHours.js");
  const ctx = vm.createContext({ Intl, Date });
  vm.runInContext(src, ctx);
  return ctx;
}

const WEEK = { tz: "Asia/Kolkata", days: [...Array(6)].map(() => ({ open: "09:00", close: "22:00" })).concat([{ closed: true }]) };
const LATE = { tz: "Asia/Kolkata", days: [...Array(7)].map(() => ({ open: "18:00", close: "02:00" })) };

test("the server and the screen run the same code", () => {
  assert.equal(shared(readSource("server/lib/openHours.js")), shared(readSource("frontend/features/creator/openHours.js")));
});

test("open, closing time, and when it opens next", () => {
  const c = client();
  // Thursday 15:30 in India.
  assert.equal(c.openHoursLabel(WEEK, new Date("2026-10-29T10:00:00Z")).text, "Open · closes 10 pm");
  // Thursday 22:30: opens tomorrow.
  assert.equal(c.openHoursLabel(WEEK, new Date("2026-10-29T17:00:00Z")).text, "Closed · opens tomorrow 9 am");
  // Saturday 22:30: Sunday is closed, so Monday.
  assert.equal(c.openHoursLabel(WEEK, new Date("2026-10-31T17:00:00Z")).text, "Closed · opens Mon 9 am");
});

test("a late-night shop is open after midnight, and closes at 2 am", () => {
  const c = client();
  assert.equal(c.openHoursLabel(LATE, new Date("2026-10-29T19:30:00Z")).text, "Open · closes 2 am");
  assert.equal(srv.openHoursStatus(LATE, new Date("2026-10-29T19:30:00Z")).open, true);
  assert.equal(srv.openHoursStatus(LATE, new Date("2026-10-29T23:00:00Z")).open, false, "04:30 is closed");
});

test("no hours is no line, and the server refuses bad hours", () => {
  assert.equal(client().openHoursLabel(null, new Date()).text, "");
  assert.equal(srv.openHoursValidate({ tz: "Mars/Base", days: WEEK.days }).ok, false);
  assert.equal(srv.openHoursValidate({ tz: "Asia/Kolkata", days: WEEK.days.slice(0, 6) }).ok, false);
  assert.equal(srv.openHoursValidate(null).ok, true, "turning hours off is allowed");
});

test("Open now leaves out shops with no hours", () => {
  const s = readSource("server/server.js");
  assert.match(s, /if \(openNow && !openHours\.openHoursStatus\(row\.hours, new Date\(\)\)\.open\) continue;/);
  assert.match(s, /const openNow = req\.query\.open === '1';/);
  assert.match(s, /code: 'invalid_hours'/);
  assert.match(readSource("frontend/features/bazaar/bazaar.jsx"), />Open now<\/button>/);
});
