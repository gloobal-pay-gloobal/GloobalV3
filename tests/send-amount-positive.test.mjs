// tests/send-amount-positive.test.mjs
//
// A payment amount must be strictly greater than zero, and the app refuses a
// zero or negative one before it can reach the server, the local ledger,
// History or a receipt. The server refuses it again (see
// server/tests/transaction-amount-positive.test.mjs) — these guards are the
// client's half, not the authority.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const { isPositivePaymentAmount } = loadDomain(["isPositivePaymentAmount"]);

describe("isPositivePaymentAmount", () => {
  test("zero is refused", () => {
    for (const v of [0, -0, "0", "0.00"]) assert.equal(isPositivePaymentAmount(v), false, String(v));
  });
  test("negatives are refused", () => {
    for (const v of [-1, -0.01, "-5"]) assert.equal(isPositivePaymentAmount(v), false, String(v));
  });
  test("non-numbers are refused", () => {
    for (const v of [null, undefined, "", "abc", Number.NaN, Infinity, -Infinity]) {
      assert.equal(isPositivePaymentAmount(v), false, String(v));
    }
  });
  test("positive amounts pass", () => {
    for (const v of [0.01, 1, 500, "10", 1e6]) assert.equal(isPositivePaymentAmount(v), true, String(v));
  });
});

describe("every client entry point checks it", () => {
  const send = readSource("frontend/screens/SendMoney/SendMoney.jsx");
  const app = readSource("frontend/App.jsx");

  test("the Send button refuses before the pay sheet and PIN", () => {
    assert.match(send, /function handleSend\(\) \{[\s\S]{0,400}?if \(!isPositivePaymentAmount\(receiverAmount\) \|\| !isPositivePaymentAmount\(senderAmount\)\) return;/);
  });

  test("completePayment refuses before any send, post, row or receipt", () => {
    const body = send.slice(send.indexOf("async function completePayment()"));
    const guard = body.indexOf("isPositivePaymentAmount(receiverAmount)");
    assert.ok(guard > 0, "completePayment has no amount guard");
    for (const later of ["onRemoteSend(", "onExecuteTransaction(", "buildTransactionSnapshot(", "setReceipt("]) {
      assert.ok(body.indexOf(later) > guard, `${later} runs before the amount guard`);
    }
  });

  test("handleRemoteSend refuses before the network", () => {
    const body = app.slice(app.indexOf("const handleRemoteSend = async"));
    const guard = body.indexOf("isPositivePaymentAmount(typedLegAmount)");
    assert.ok(guard > 0);
    assert.ok(body.indexOf("GloobalApi.sendTransaction(") > guard);
  });
});

describe("in the browser: typing 0 cannot start a payment", () => {
  before(async () => { await buildOnce(); });
  after(async () => { await teardown(); });

  test("India -> India, amount 0: no pay sheet, no PIN, no send", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context, api } = await openPage({
      account: A,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    try {
      await login(page, A);
      await page.getByLabel("Send", { exact: true }).click({ force: true });
      await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
      for (const symbol of B.symbolId) {
        await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
      }
      await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
      const field = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
      await field.waitFor({ timeout: 25000 });
      await field.fill("0");
      await page.waitForTimeout(700);

      const sendButton = page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last();
      if (await sendButton.count()) await sendButton.click({ force: true });
      await page.waitForTimeout(1500);

      assert.equal(await page.getByRole("dialog", { name: "Choose how to pay" }).count(), 0, "the pay sheet opened for a zero amount");
      assert.equal(await page.getByLabel("Digit 1", { exact: true }).count(), 0, "the PIN pad opened for a zero amount");
      assert.equal(api.calls.filter((c) => c.path === "/api/transactions/send").length, 0, "a zero payment reached the server");
      assert.equal(api.state.ledger.length, 0, "a zero payment was recorded");
      assert.equal(await page.getByTestId("receipt-counterparty").count(), 0, "a receipt opened for a zero amount");
    } finally {
      await context.close();
    }
  });
});
