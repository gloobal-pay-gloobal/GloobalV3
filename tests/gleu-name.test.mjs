// tests/gleu-name.test.mjs
//
// CEL (Circular Energy Loop) is the name people read; GEU is the code that
// is stored. (The name was GLEU, "said glue", for a day before it.)
//
//   - The stored code is still "GEU" on both sides (the browser bundle and
//     the server), so no row, balance or ledger account changes.
//   - Everything printed says CEL: fmtMoney on a coin row, the lens pair,
//     the server's notification text, the guide's answer.
//   - No screen prints the stored code by hand.
//
//   node --test tests/gleu-name.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { readSource, loadDomain } from "./harness.mjs";

const require = createRequire(import.meta.url);
const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// The browser side's money code, in one scope, as build_app.mjs concatenates it.
const browser = loadDomain(["COIN_CURRENCY", "COIN_TICKER", "COIN_TICKER_LONG", "COIN_TICKER_SAID", "fmtMoney", "currencySuffix"]);

test("one code stored, one name shown, on both sides", () => {
  assert.equal(browser.COIN_CURRENCY, "GEU", "the stored code did not change");
  assert.equal(browser.COIN_TICKER, "CEL");
  assert.equal(browser.COIN_TICKER_LONG, "Circular Energy Loop");
  assert.equal(browser.COIN_TICKER_SAID, "cell");
  const server = require("../server/lib/coinTicker.js");
  assert.equal(server.COIN_CURRENCY, browser.COIN_CURRENCY, "the two programs store the same code");
  assert.equal(server.COIN_TICKER, browser.COIN_TICKER, "and show the same name");
  assert.equal(server.COIN_TICKER_LONG, browser.COIN_TICKER_LONG);
});

test("a coin row prints CEL, never its stored code", () => {
  assert.equal(browser.fmtMoney(250, "GEU"), "250.00 CEL");
  assert.equal(browser.fmtMoney(250, "geu"), "250.00 CEL");
  assert.equal(browser.currencySuffix("INR"), "₹", "other currencies as before");
  const notes = require("../server/lib/notificationText.js");
  assert.equal(notes.formatBannerMoney(1200, "GEU"), "1,200.00 CEL");
  assert.match(notes.formatMoneyPair(250, "INR"), /^250\.00 CEL │ ₹$/);
  assert.match(notes.formatSpokenMoneyPair(250, "INR"), /^250\.00 CEL, ₹$/);
});

test("the guide and Ask GLOOBAL say CEL, and still understand someone asking about GLEU or GEU", () => {
  const guide = src("server/lib/guideCards.js");
  assert.match(guide, /q: "What is CEL\?"/);
  assert.match(guide, /CEL is the Circular Energy Loop: your own money, going round your community/);
  assert.match(guide, /asks: \["CEL", "cel", "what is cel", "circular energy loop", "GLEU", "gleu", "glue", "what is geu"/, "the old names still find the card");
  assert.doesNotMatch(guide, /Gloobal Local Unit|\bGLU\b/);
  assert.doesNotMatch(guide, /Local Energy Unit/);
  assert.doesNotMatch(guide, /"GEU is another name/, "no answer still calls it GEU");
  const ask = src("frontend/features/support/askGloobal.jsx");
  assert.match(ask, /topic_geu: "What is CEL"/);
  assert.doesNotMatch(ask, /topic_geu: "GEU /);
  assert.match(src("frontend/features/support/askEngine.js"), /\["geu", \["cel", "gleu", "glue", "geu", "gue"\]\]/);
});

test("no screen prints the stored code or the old long name by hand", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = fs.readdirSync(new URL("../frontend", import.meta.url), { recursive: true })
    .filter((f) => /\.(jsx?|js)$/.test(String(f)))
    .map((f) => `frontend/${f}`);
  const offenders = [];
  for (const f of files) {
    const code = strip(readSource(f));
    // A quoted "GEU" that is not the coin receipt's stored-code fallback.
    const quoted = code.match(/["'`]GEU["'`]/g) || [];
    if (quoted.length && f !== "frontend/features/receipts/coinReceipt.js") offenders.push(`${f}: ${quoted.length} × "GEU"`);
    if (/Gloobal Energy Unit|>\s*Energy Unit\s*</.test(code)) offenders.push(`${f}: old long name`);
    if (/[>\s`]GEU[\s<`│|,.)]/.test(code) && !/COIN_TICKER/.test(code)) offenders.push(`${f}: GEU in text`);
  }
  assert.deepEqual(offenders, []);
});
