// tests/qr-panel-and-identity.test.mjs
//
// One identity behind every Gloobal QR, and one component that draws it.
//
// ── The Creator ID ───────────────────────────────────────────────────────
//
// It was `genSuggestedId(12)` — twelve random symbols minted in the browser
// on every load, stored nowhere and registered with nothing. The string
// "creatorId" does not appear in server.js at all. So the code shown in
// Creator mode resolved to no account, and the identifier was different
// again next time the app opened.
//
// The split was never needed. Creator Share is a property of the PAYEE'S
// ACCOUNT — the send route reads `receiver.cashbackRate` — so it applies to
// any payment made to that person whichever code was scanned.
//
// ── The QR ───────────────────────────────────────────────────────────────
//
// The static receive QR is drawn by GloobalReceiveQrCard, once, on the
// Receive sheet. The Scan screen's My Code tab and the shared panel with its
// countdown are gone; tests/qr-browser.test.mjs checks the rendered result.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const stripComments = (src) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const app = readSource("frontend/App.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const card = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
const server = readSource("server/server.js");

describe("one identity, both roles", () => {
  test("the Creator ID is the account's own Gloobal ID", () => {
    assert.match(app, /const creatorId = secureId;/);
  });

  test("it is no longer randomly minted in the browser", () => {
    const code = stripComments(app);
    assert.ok(
      !/const \[creatorId\] = useState\d+\(\(\) => genSuggestedId\(12\)\)/.test(code),
      "the Creator ID must not be a random client-side value"
    );
  });

  test("the server has never known about a creatorId — which is why it could not be paid", () => {
    // If a real server-side creator identity is ever introduced, this fails
    // and the merge above should be revisited rather than silently kept.
    assert.equal(server.includes("creatorId"), false, "server.js now references creatorId — revisit this");
  });

  test("Creator Share still works, because it lives on the payee's account", () => {
    assert.match(server, /const payeeCashbackRate = Number\(receiver\.cashbackRate\) \|\| 0;/);
  });

  test("both roles share and display the same id", () => {
    assert.match(dash, /const activeCreatorId = personalGloobalId;/);
    assert.match(dash, /const shareableGloobalId = personalGloobalId;/);
  });

  test("a rename cannot reintroduce a second identity", () => {
    const code = stripComments(dash);
    assert.ok(!/creatorIdOverride \|\|/.test(code), "nothing may read creatorIdOverride");
    assert.ok(!/if \(isCreatorRename\) setCreatorIdOverride/.test(code), "a creator rename must not stash a separate id");
  });

  test("the Receive QR is built from that same id", () => {
    assert.match(dash, /<GloobalReceiveQrCard gloobalId=\{gloobalIdTag\}/);
    assert.match(dash, /const gloobalIdTag = shareableGloobalId;/);
    assert.match(card, /const payload = buildGloobalPayUrl\(gloobalId\);/);
  });
});

describe("every Gloobal QR is drawn by one component", () => {
  test("the Receive sheet is the only place a QR is rendered", () => {
    assert.match(stripComments(dash), /<GloobalReceiveQrCard\b/);
    assert.doesNotMatch(stripComments(app), /<GloobalReceiveQrCard\b|<GloobalQrSvg\b/, "App.jsx must not draw a QR of its own");
  });

  test("the retired panel, countdown and My Code tab are gone from both screens", () => {
    for (const [name, src] of [["App.jsx", app], ["Dashboard.jsx", dash]]) {
      const code = stripComments(src);
      assert.doesNotMatch(code, /GloobalQrPanel|GloobalQRCode|encodeGloobalQR/, `${name} still uses the old QR`);
      assert.doesNotMatch(code, /onSecondsLeftChange|receiveQrSecondsLeft/, `${name} still carries the countdown`);
      assert.doesNotMatch(code, /scanScreenTab === "myCode"/, `${name} still has a My Code tab`);
    }
  });

  test("the card draws a plain, high-recovery symbol with a quiet zone", () => {
    assert.match(card, /uqrEncode\(text, \{ ecc: "H", border: 0 \}\)/);
    assert.match(card, /var GLOOBAL_QR_QUIET_ZONE = 4;/);
    assert.match(card, /aria-label="Gloobal QR code"/);
  });

  test("nothing on the Receive sheet is positioned over the QR", () => {
    // The Creator Share badge used to straddle the QR panel's top edge. It
    // now sits in its own row under the card, so no overlay can cover a
    // module.
    const code = stripComments(dash);
    const at = code.indexOf("<GloobalReceiveQrCard");
    assert.ok(at > 0, "the card was not found");
    const next = code.slice(at, code.indexOf("My Share", at));
    assert.doesNotMatch(next, /position: "absolute"/, "something is absolutely positioned between the card and My Share");
  });
});
