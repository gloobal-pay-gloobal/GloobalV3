// tests/essentials-pay-method.test.mjs
//
//   node --test tests/essentials-pay-method.test.mjs
//
// Paying with Gloobal Essentials.
//
// ── IT WAS DEAD CODE ────────────────────────────────────────────────────
//
// applyEssentialsPoolSubsidy has existed on the orchestrator for a long
// time, is exported by useTransactionActions, and is destructured in
// App.jsx. The orchestrator's own comment says "a caller (currently Scan
// & Pay) applies this once, before the real payment".
//
// There was no such caller. The destructure was the only reference in the
// whole frontend, so the Essentials baseline was computed, displayed,
// masked and given its own category without ever being spendable. The
// first describe block below is the one that fails if it goes back to
// being unreachable.
//
// ── ONE DEDUCTION, NOT TWO ──────────────────────────────────────────────
//
// The founder first asked for Essentials to be a fourth account money is
// deducted from, then — once it was clear both designs put the same split
// on screen — chose the one that keeps a single source of funds.
//
// That distinction is the thing worth guarding. Essentials tops the
// account's own bank balance up BEFORE the payment, and the payment that
// follows is an ordinary payment from an ordinary balance through
// /api/transactions/send. Nothing about the send route, the ledger or the
// corridor arithmetic had to learn about a split, which is why this
// feature did not touch any of them.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const APP = "frontend/App.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const STORE = "frontend/features/choices/choicesStore.js";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const app = readSource(APP);
const send = readSource(SEND);

describe("the subsidy is reachable at last", () => {
  test("something actually calls it", () => {
    // The test that would have caught the original fault: a count of
    // references that are not the definition and not the destructure.
    const body = strip(app);
    const calls = (body.match(/applyEssentialsPoolSubsidy\(\{/g) || []).length;
    assert.ok(calls >= 1, "applyEssentialsPoolSubsidy is unreachable again");
  });

  test("the caller is wired to the Send screen", () => {
    assert.match(strip(app), /onDrawEssentials=\{drawEssentialsForPayment\}/);
    assert.match(strip(app), /essentialsDailyLimit=\{computeEssentialsBaseline\(dialCountry\.iso\)\.dailyTotal\}/);
  });

  test("it never draws more than the payment", () => {
    // A subsidy larger than what is being paid for is a standing top-up,
    // which is a different product.
    const at = strip(app).indexOf("const drawEssentialsForPayment");
    const fn = strip(app).slice(at, strip(app).indexOf("\n  };", at));
    assert.match(fn, /requestedAmount: typed/);
    assert.doesNotMatch(fn, /requestedAmount: *(baseline|dailyLimit)/,
      "the draw is sized by the daily limit rather than by the payment");
  });

  test("a refused or failed draw does not fail the payment", () => {
    const at = strip(app).indexOf("const drawEssentialsForPayment");
    const fn = strip(app).slice(at, strip(app).indexOf("\n  };", at));
    assert.match(fn, /catch \(err\)/);
    assert.match(fn, /applied: 0/);
    assert.doesNotMatch(fn, /throw/,
      "a failed subsidy now throws, which would take the payment down with it");
  });

  test("a non-positive amount draws nothing", () => {
    const at = strip(app).indexOf("const drawEssentialsForPayment");
    const fn = strip(app).slice(at, strip(app).indexOf("\n  };", at));
    assert.match(fn, /!Number\.isFinite\(typed\) \|\| typed <= 0/);
  });
});

describe("one source of funds, not two", () => {
  test("nothing in the send route learned about a split", () => {
    // The whole point of the design the founder settled on. If this fails,
    // the money path has grown a second deduction and every guarantee
    // /api/transactions/send makes has to be re-argued.
    const server = readSource("server/server.js");
    const at = server.indexOf("app.post('/api/transactions/send'");
    const route = strip(server.slice(at, at + 20000));
    assert.doesNotMatch(route, /essentials/i,
      "the send route now knows about Essentials, so there are two sources of funds");
  });

  test("the draw happens before the PIN, not after", () => {
    // The top-up has to be real bank balance by the time the payment's own
    // risk check runs. Applying it after the PIN would mean the risk check
    // saw a balance that did not yet include it.
    const body = strip(send);
    const at = body.indexOf("async function choosePayMethod");
    assert.ok(at > 0, "choosePayMethod is gone or no longer async");
    const fn = body.slice(at, body.indexOf("\n  }", at));
    const drawAt = fn.indexOf("onDrawEssentials(senderAmount)");
    const pinAt = fn.indexOf("setPinOpen(true)");
    assert.ok(drawAt > 0 && pinAt > drawAt, "the PIN opens before Essentials is drawn");
  });

  test("only the Essentials method draws anything", () => {
    const body = strip(send);
    const at = body.indexOf("async function choosePayMethod");
    const fn = body.slice(at, body.indexOf("\n  }", at));
    assert.match(fn, /label === ESSENTIALS_PAY_METHOD/);
    // Every other method resets the figure, so a previous Essentials
    // payment cannot leave a stale amount attached to a bank one.
    assert.match(fn, /essentialsAppliedRef\.current = 0;/);
  });

  test("the method's label is one constant, not three literals", () => {
    // A payMethod that disagrees with itself by one character is a
    // payment that silently falls through to the bank.
    assert.match(strip(send), /var ESSENTIALS_PAY_METHOD = "Gloobal Essentials";/);
    const literals = (strip(send).match(/"Gloobal Essentials"/g) || []).length;
    assert.equal(literals, 1, `the label is written out ${literals} times`);
  });
});

describe("the row says enough and no more", () => {
  const body = strip(send);

  test("it prints no figure", () => {
    // The same figure the category screen masks behind a check. A sheet
    // that opens mid-payment, in the one moment the phone is most likely
    // to be visible to somebody else, is the worst place to print it.
    const at = body.indexOf('key: "gessentials"');
    const row = body.slice(at, body.indexOf("},", at));
    assert.doesNotMatch(row, /essentialsLeft\s*\)|fmt\(|fmtMoney|ChoiceMoney/,
      "the remaining Essentials figure is printed in the Pay-with sheet");
    assert.match(row, /note: essentialsLeft > 0 \? "Covers what it can today" : "Nothing left today"/);
  });

  test("it is unavailable when the pool is empty", () => {
    const at = body.indexOf('key: "gessentials"');
    const row = body.slice(at, body.indexOf("},", at));
    assert.match(row, /disabled: !\(essentialsLeft > 0\)/);
    assert.match(body, /onClick=\{\(\) => \{ if \(!disabled\) choosePayMethod\(label\); \}\}/,
      "a disabled row still starts a payment");
  });

  test("the remaining amount is read reactively", () => {
    // So drawing on the pool anywhere updates this row without a reload.
    assert.match(body, /const essentialsLeft = useEssentialsPoolRemaining\(Number\(essentialsDailyLimit\) \|\| 0\);/);
  });
});

describe("what it pays for is filed where it came from", () => {
  const body = strip(send);

  test("an Essentials-funded payment lands in My Essentials", () => {
    assert.match(body, /essentialsAppliedRef\.current > 0 \? choicesSystemCategoryId\(choicesState, "essentials"\) : null/);
  });

  test("but an explicit choice still wins", () => {
    // Somebody who picked Food meant Food. Overriding that would be the
    // app arguing with them about their own record.
    assert.match(body, /const filedUnder = choiceId\s*\n?\s*\|\| \(essentialsAppliedRef/,
      "the automatic filing overrides a choice the person made");
  });

  test("the category is found by key, never by name", () => {
    // The name is the one thing about it the owner is free to change.
    // Somebody who renamed theirs would otherwise stop having anything
    // filed.
    const store = strip(readSource(STORE));
    const at = store.indexOf("function choicesSystemCategoryId");
    assert.ok(at > 0, "the lookup is gone");
    const fn = store.slice(at, store.indexOf("\n}", at));
    assert.match(fn, /String\(row\.systemKey \|\| ""\) === want/);
    assert.doesNotMatch(fn, /row\.name/, "the system category is being matched on its name");
  });

  test("categories not yet loaded means filed nowhere, not a crash", () => {
    const store = strip(readSource(STORE));
    const at = store.indexOf("function choicesSystemCategoryId");
    const fn = store.slice(at, store.indexOf("\n}", at));
    assert.match(fn, /Array\.isArray\(state\.categories\) \? state\.categories : \[\]/);
    assert.match(fn, /found \? found\.id : null/);
  });
});
