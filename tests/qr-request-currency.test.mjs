// tests/qr-request-currency.test.mjs
//
// A Gloobal QR carries no currency, so the currency of a payment to it comes
// from the PAYEE's own registered country — never from the scanner's.
//
// The old failure: a bare figure with no currency attached, labelled with
// whoever happened to be looking at it — a ₹2,596.05 request read as
// $2,596.05 to an American scanning it. The static QR carries no amount at
// all now, but the same rule decides which currency Send Money opens in, so
// it is kept. tests/qr-browser.test.mjs checks it in the browser: an Indian
// account scanning a Japanese account's QR gets an amount box in JPY.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const stripComments = (src) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const app = stripComments(readSource("frontend/App.jsx"));
const send = stripComments(readSource("frontend/screens/SendMoney/SendMoney.jsx"));

function block(src, start) {
  const at = src.indexOf(start);
  assert.ok(at >= 0, `${start} not found`);
  return src.slice(at, src.indexOf("\n  };", at));
}

describe("the QR payload genuinely carries no currency and no amount", () => {
  const { buildGloobalPayUrl, parseGloobalPayPayload } = loadDomain(["buildGloobalPayUrl", "parseGloobalPayPayload"]);

  test("a parsed code exposes an account and nothing else", () => {
    // This is WHY the currency has to come from the account lookup. If a
    // currency or amount is ever added to the payload, this fails and the
    // resolution below should be revisited.
    const parsed = parseGloobalPayPayload(buildGloobalPayUrl("++++++++++++"));
    assert.deepEqual(Object.keys(parsed), ["gloobalId"]);
  });
});

describe("the payee's currency comes from the payee", () => {
  test("the lookup keeps the payee's own registered country", () => {
    const fn = block(app, "const resolveGloobalPayee = async (gloobalId) => {");
    assert.match(fn, /countryIso: user\.countryIso \|\| null/);
  });

  test("Send Money is opened in the currency of that country", () => {
    const fn = block(app, "const openSendToPayee = (payee) => {");
    assert.match(fn, /COUNTRY_BY_ISO\[String\(payee\.countryIso \|\| ""\)\.toUpperCase\(\)\]/);
    assert.match(fn, /currency: COUNTRY_CURRENCY\[payeeCountry\.iso\]/);
    assert.match(fn, /iso: payeeCountry\.iso/);
  });

  test("the scanner's own country is only the fallback for a payee with none", () => {
    // Recorded, not endorsed: a payee account with no countryIso opens in the
    // scanner's currency. Every account the server resolves carries one.
    const fn = block(app, "const openSendToPayee = (payee) => {");
    assert.match(fn, /\] \|\| dialCountry;/);
  });

  test("Send Money takes the handed-in currency as given, not re-derived from the sender", () => {
    const at = send.indexOf("if (!prefillReceiver) return;");
    assert.ok(at > 0, "the prefill effect was not found");
    const effect = send.slice(at, send.indexOf("}, [prefillReceiver]);", at));
    assert.match(effect, /currency: prefillReceiver\.currency \|\| top\.currency/);
    assert.match(effect, /iso: prefillReceiver\.iso/);
  });
});
