// tests/cross-border-history.test.mjs
//
// A restored history row must be denominated in a currency it is ACTUALLY in.
//
// ── The bug ──────────────────────────────────────────────────────────────
//
// A US account pays an India account. The server stores that payment the way
// it has always stored payments: `amount` and `currency` are the RECEIVER's
// side — ₹478,000, INR — because that is the face value the payment was
// denominated in. It also stores the sender's own side in metadata
// (`debitAmount` $5,000, `senderCurrency` USD), with a comment in server.js
// saying precisely why: "`amount`/`currency` above are the receiver's side."
//
// Two things then went wrong, and they compounded:
//
//   1. GET /api/transactions/:symbolId never projected the sender's side, so
//      the client could not see it even though it was in the database.
//   2. mapServerTransaction took `row.amount` and DROPPED `row.currency`
//      entirely, leaving a bare number that the row then rendered with
//      whatever symbol the viewer's own account uses.
//
// So after a re-login the US sender saw −$478,000.00: the rupee figure wearing
// a dollar sign. A ¥5,000 payment to the UK came back as ¥545 — the pound
// figure wearing a yuan sign. Every cross-border row, both directions, every
// currency pair. Before the reload it looked right, because the locally-held
// row still had the real typed amount; only the restored copy was wrong.
//
// ── The rule these tests hold ────────────────────────────────────────────
//
// A figure is never rendered in a currency it is not in. Concretely: every
// row carries its own `currency`, and the amount beside it is in THAT
// currency — the sender sees what left their account, the receiver sees what
// arrived in theirs. Where the sender's own figure is genuinely unavailable
// (rows written before it was stored), the row keeps the receiver-currency
// amount AND the receiver's currency code, so it is honestly labelled rather
// than silently relabelled.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

// mapServerTransaction lives in frontend/App.jsx, which is not part of the
// harness's module set (that is the backend domain layer only). Rather than
// copy the function into this file — which would test the copy and not the
// app — its real source is sliced out of App.jsx and evaluated with the one
// helper it depends on injected. If the function is renamed or moved, this
// throws rather than quietly passing against a stale duplicate.
function loadMapServerTransaction() {
  const app = readSource("frontend/App.jsx");
  const at = app.indexOf("function mapServerTransaction(");
  assert.ok(at > 0, "mapServerTransaction not found in App.jsx");
  const end = app.indexOf("\n}\n", at);
  assert.ok(end > at, "could not find the end of mapServerTransaction");
  const source = app.slice(at, end + 2);

  const { formatClockTime } = loadDomain(["formatClockTime"]);
  // eslint-disable-next-line no-new-func
  return new Function("formatClockTime", `${source}; return mapServerTransaction;`)(formatClockTime);
}

const mapServerTransaction = loadMapServerTransaction();

// The two corridors from the bug report, as the server actually stores them.
const US_TO_INDIA = {
  id: "t1",
  referenceId: "REF1",
  direction: "sent",
  amount: 478000,        // receiver's side, in rupees
  currency: "INR",
  debitAmount: 5000,     // sender's side, in dollars
  senderCurrency: "USD",
  fxRate: 95.6,
  status: "success",
  createdAt: "2026-08-30T10:00:00.000Z",
  counterparty: { fullName: "Priya", symbolId: "−+×=○□●■−+×=" }
};

const CHINA_TO_UK = {
  id: "t2",
  referenceId: "REF2",
  direction: "sent",
  amount: 545,           // receiver's side, in pounds
  currency: "GBP",
  debitAmount: 5000,     // sender's side, in yuan
  senderCurrency: "CNY",
  fxRate: 0.109,
  status: "success",
  createdAt: "2026-08-30T10:00:00.000Z",
  counterparty: { fullName: "Tom", symbolId: "+×=○□●■−+×=−" }
};

describe("a restored row is denominated in the currency it is actually in", () => {
  test("the US sender sees the dollars that left, not the rupees that arrived", () => {
    const row = mapServerTransaction(US_TO_INDIA, "me");
    assert.equal(row.amount, 5000, "the sender's row must show what left their account");
    assert.equal(row.currency, "USD", "and must be labelled in the sender's own currency");
    assert.notEqual(row.amount, 478000, "this is the reported bug: the rupee figure on the sender's row");
  });

  test("the China sender sees yuan, not the pounds that arrived", () => {
    const row = mapServerTransaction(CHINA_TO_UK, "me");
    assert.equal(row.amount, 5000);
    assert.equal(row.currency, "CNY");
    assert.notEqual(row.amount, 545, "the pound figure must not appear on a yuan row");
  });

  test("the receiver sees what arrived, in their own currency", () => {
    // The mirror image of the same payment, read from the other account.
    const row = mapServerTransaction({ ...US_TO_INDIA, direction: "received" }, "them");
    assert.equal(row.amount, 478000, "the receiver's row must show what landed");
    assert.equal(row.currency, "INR");
  });

  test("a same-currency payment is untouched", () => {
    // The common case must not be disturbed by any of the above: when the
    // two sides agree there is only one figure and one currency.
    const row = mapServerTransaction({
      ...US_TO_INDIA, amount: 250, currency: "USD", debitAmount: 250, senderCurrency: "USD", fxRate: 1
    }, "me");
    assert.equal(row.amount, 250);
    assert.equal(row.currency, "USD");
  });

  test("EVERY row carries a currency — the invariant the bug broke", () => {
    // The defect was not a wrong conversion. It was an amount with no
    // currency attached, which the UI then labelled with the viewer's own.
    // A row without a currency is the bug, whatever number it holds.
    for (const source of [US_TO_INDIA, CHINA_TO_UK, { ...US_TO_INDIA, direction: "received" }]) {
      const row = mapServerTransaction(source, "me");
      assert.ok(row.currency, `row has an amount (${row.amount}) but no currency`);
    }
  });

  test("a legacy row with no sender side is labelled honestly, not relabelled", () => {
    // Rows written before debitAmount was stored cannot say what left the
    // sender's account. The correct answer is to keep the receiver-currency
    // figure AND say so — never to pass that figure off as the viewer's.
    const legacy = { ...US_TO_INDIA };
    delete legacy.debitAmount;
    delete legacy.senderCurrency;
    const row = mapServerTransaction(legacy, "me");
    assert.equal(row.amount, 478000);
    assert.equal(row.currency, "INR", "an unknown sender side must not be relabelled as the viewer's currency");
  });

  test("a malformed sender side falls back rather than showing NaN", () => {
    const row = mapServerTransaction({ ...US_TO_INDIA, debitAmount: "not-a-number" }, "me");
    assert.ok(Number.isFinite(row.amount), `amount must be a real number, got ${row.amount}`);
    assert.ok(row.currency, "and must still carry a currency");
  });
});

describe("the server hands over the sender's own side", () => {
  const server = readSource("server/server.js");
  // The projection the client actually reads (GET /api/transactions/:symbolId).
  const at = server.indexOf("const transactions = records.map((transaction) => {");
  const projection = server.slice(at, server.indexOf("return res.json({", at));

  test("the projection is where this test expects it", () => {
    assert.ok(at > 0, "transaction projection not found in server.js");
    assert.ok(projection.length > 200, "projection slice looks wrong");
  });

  test("it projects debitAmount and senderCurrency", () => {
    // Both are already persisted in metadata by the send route — the bug was
    // that this projection never passed them on, so the client could not tell
    // the sender's side from the receiver's even though the database knew.
    assert.match(projection, /debitAmount/);
    assert.match(projection, /senderCurrency/);
  });

  test("it still projects the receiver's side, which the receiver needs", () => {
    assert.match(projection, /amount: transaction\.amount/);
    assert.match(projection, /currency: transaction\.currency/);
  });
});

describe("the row renders the figure in its own currency", () => {
  const row = readSource("frontend/features/history/TransactionRow.jsx");

  test("the symbol and the code both follow the row, not the viewer", () => {
    // The last place this could go wrong: a correctly-denominated row handed
    // to a component that formats every amount with the logged-in account's
    // symbol would reintroduce the whole bug at the final step.
    assert.match(row, /t\.currency/, "TransactionRow must read the row's own currency");
  });
});

describe("the period total is a single currency", () => {
  // Same approach as mapServerTransaction above: historyUtils.js is a
  // frontend module, so its real source is sliced out and evaluated with
  // `convert` (a backend domain function) injected.
  const { convert } = loadDomain(["convert"]);
  const sumHistoryAmount = (() => {
    const src = readSource("frontend/features/history/historyUtils.js");
    const at = src.indexOf("function sumHistoryAmount(");
    assert.ok(at > 0, "sumHistoryAmount not found in historyUtils.js");
    const end = src.indexOf("\n}\n", at);
    assert.ok(end > at, "could not find the end of sumHistoryAmount");
    // eslint-disable-next-line no-new-func
    return new Function("convert", `${src.slice(at, end + 2)}; return sumHistoryAmount;`)(convert);
  })();

  test("same-currency rows add up exactly as before", () => {
    const rows = [{ amount: 100, currency: "USD" }, { amount: 250.5, currency: "USD" }];
    assert.equal(sumHistoryAmount(rows, "USD"), 350.5);
  });

  test("a foreign row is converted, not added at face value", () => {
    // The bug one line down from the mislabelled row: adding a rupee figure
    // straight into a dollar total is wrong by the whole exchange rate.
    const rows = [{ amount: 100, currency: "USD" }, { amount: 478000, currency: "INR" }];
    const total = sumHistoryAmount(rows, "USD");
    assert.notEqual(total, 478100, "the rupee figure must not be added at face value");
    const expected = Math.round((100 + convert(478000, "INR", "USD")) * 100) / 100;
    assert.equal(total, expected);
  });

  test("a row with no currency is trusted as local, as it always was", () => {
    // Locally-created rows (this session's own payments) carry no currency
    // and are in the account's currency by construction.
    assert.equal(sumHistoryAmount([{ amount: 40 }, { amount: 2 }], "USD"), 42);
  });

  test("called without a target it behaves exactly as before", () => {
    assert.equal(sumHistoryAmount([{ amount: 40, currency: "INR" }, { amount: 2 }]), 42);
  });
});
