// tests/rent-connected-0232.test.mjs
//
//   node --test tests/rent-connected-0232.test.mjs
//
// 0232: rent starts as a request to connect. The owner sets terms (with
// electricity, water, maintenance, parking, Wi-Fi, gas, notice, lock-in,
// rules and lines of their own); the tenant accepts, and accepts again after
// every edit. The tenant's documents stay with the place. The server side is
// exercised for real in server/tests/rent-links.test.mjs; this reads the
// screens, and runs the terms helpers.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const link = readSource("frontend/features/rent/rentLink.jsx");
const screen = readSource("frontend/features/rent/RentScreen.jsx");

describe("terms, as a draft and back", () => {
  const ctx = vm.createContext({});
  vm.runInContext(
    link.slice(link.indexOf("var RL_EXTRAS"), link.indexOf("// ── Read-only terms")).replace(/Icon: RL\w+, /g, ""),
    ctx
  );
  test("a new draft starts with rent, day and the three usual extras", () => {
    const d = ctx.rlDraftFrom(null, { rent: 12000, dueDay: 5 });
    assert.equal(d.rent, "12000");
    assert.equal(d.dueDay, 5);
    assert.equal(JSON.stringify(d.order), JSON.stringify(["electricity", "water", "maintenance"]));
    assert.equal(d.extras.electricity.mode, "meter");
    assert.equal(d.extras.water.mode, "included");
    assert.equal(d.noticeMonths, 1);
  });
  test("a draft round-trips into the terms the server takes", () => {
    const t = { rent: 12000, dueDay: 5, deposit: 24000, extras: [{ key: "electricity", mode: "meter", amount: 0, rate: 8 }, { key: "maintenance", mode: "fixed", amount: 500, rate: 0 }], noticeMonths: 1, lockInMonths: 6, lateFee: 200, lateAfterDays: 3, yearlyIncreasePct: 5, rules: ["noSmoking"], lines: ["No loud music after 10 pm"] };
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.rlDraftToTerms(ctx.rlDraftFrom(t)))), t);
  });
  test("a late fee or increase that was removed is not sent", () => {
    const d = ctx.rlDraftFrom({ rent: 1, dueDay: 1, lateFee: 200, lateAfterDays: 3, yearlyIncreasePct: 5 });
    d.showLate = false; d.showYearly = false;
    const t = ctx.rlDraftToTerms(d);
    assert.equal(t.lateFee, 0); assert.equal(t.lateAfterDays, 0); assert.equal(t.yearlyIncreasePct, 0);
  });
});

describe("the screens", () => {
  test("a new place is a request: the tenant's sends nothing but a request", () => {
    assert.match(screen, /GloobalApi\.startRentLink\(\{ role: kind,/);
    assert.match(screen, /cta\("Send request", save, !ready, "rent-save"\)/);
    assert.ok(!/GloobalApi\.addRentPlace\(/.test(screen), "no place is saved one-sided any more");
  });
  test("an owner starting one sets the terms first", () => {
    assert.match(screen, /setStep\(3\)/);
    assert.match(screen, /<RentTermsEditor draft=\{termsDraft\} setDraft=\{setTermsDraft\} \/>/);
  });
  test("the bell lists requests that need someone, and a connected place shows its bill", () => {
    assert.match(link, /\(links \|\| \[\]\)\.filter\(rentLinkNeedsShowing\)/);
    assert.match(screen, /data-testid="rent-bill"/);
    assert.match(screen, /\{p\.link \? <RentLinkPanel linkId=\{p\.link\.id\}/);
  });
  test("each extra is included, fixed, by meter or the tenant's own bill; meter only where it makes sense", () => {
    assert.match(link, /var RL_MODES = \{ included: "Included", fixed: "Fixed", meter: "By meter", own: "Own bill" \};/);
    assert.match(link, /filter\(\(\[mode\]\) => mode !== "meter" \|\| m\.meter\)/);
    for (const k of ["electricity", "water", "maintenance", "parking", "wifi", "gas"]) assert.ok(link.includes(`key: "${k}"`), k);
  });
  test("an edit comes back to the tenant, with the changes marked and the old values struck", () => {
    assert.match(link, /changed \$\{n\} term\$\{n === 1 \? "" : "s"\}/);
    assert.match(link, /background: ch \? "#FFF8E6" : "transparent"/);
    assert.match(link, /textDecoration: "line-through"/);
    assert.match(link, /GloobalApi\.acceptRentTerms\(link\.id, link\.terms\.v\)/);
    assert.match(link, /GloobalApi\.askRentTerms\(link\.id, line, note\.trim\(\)\)/);
  });
  test("documents: the four kinds plus their own, shrunk on the phone, view-only for the other side", () => {
    for (const k of ["id", "photo", "police", "work"]) assert.ok(link.includes(`key: "${k}"`), k);
    assert.match(link, /accept="image\/\*,application\/pdf"/);
    assert.match(link, /1600 \/ Math\.max/);
    assert.match(link, /View only, in the app\. Deleted when the connection ends\./);
    assert.ok(!/download=/.test(link), "no download link anywhere");
  });
  test("figures carry GEU, rates included", () => {
    assert.ok(!/rentMoney\(/.test(link), "every figure goes through rentFigure (GeuTwin)");
    assert.match(screen, /\{rentFigure\(l\.amount, place\.currency\)\}/);
  });
  test("the module is in the bundle, before the screen that uses it", () => {
    const b = readSource("build_app.mjs");
    assert.ok(b.indexOf('"features/rent/rentLink.jsx"') > 0 && b.indexOf('"features/rent/rentLink.jsx"') < b.indexOf('"features/rent/RentScreen.jsx"'));
  });
});

describe("the server keeps the documents safe", () => {
  const srv = readSource("server/lib/rentLink.js");
  test("encrypted with AES-256-GCM, and the bytes must be what they claim", () => {
    assert.match(srv, /createCipheriv\('aes-256-gcm'/);
    assert.match(srv, /function sniff\(buf\)/);
  });
  test("the owner reads them only while connected; ending deletes them", () => {
    assert.match(srv, /if \(role === 'owner' && link\.status !== 'connected'\) return fail\(res, 403/);
    assert.match(srv, /await dropDocs\(link\._id\);/);
  });
  test("the upload has its own 3 MB parser, behind sign-in", () => {
    assert.match(readSource("server/server.js"), /if \(req\.method === 'POST' && RENT_DOC_UPLOAD_PATH\.test\(req\.path\)\) return next\(\);/);
    assert.match(srv, /app\.post\('\/api\/rent\/links\/:id\/docs', writeLimit, requireAuth, docBody,/);
  });
});
