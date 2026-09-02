// tests/creator-share-ledger.test.mjs
//
// A Creator Share is money. It has to appear in the history of both people
// it moved between.
//
// ── The report ───────────────────────────────────────────────────────────
//
//   "someone pay me 1000 i shared by 2% so that 2% is not debited from my
//    account it just show on receipt not on history or paid side"
//
// ── What was actually happening ──────────────────────────────────────────
//
// The balance arithmetic was right the whole time. performTransfer credits
// the payee `amount - cashback` (980, not 1000) and credits `cashbackCredit`
// (20) back to the payer. Nobody's balance was wrong by a penny.
//
// What was wrong is that you could not SEE it. The payment Transaction stores
// `amount: numericAmount` — the full 1,000 face value — so the payee's history
// row read +1,000 against a balance that had risen by 980. The row that
// accounted for the other 20 (the 'share' leg, minted by
// lib/merchantShareFlow.js) existed in the database and was filtered out of
// every history query by `type: { $ne: 'share' }`.
//
// The exclusion was defended by a true sentence and a false inference. True:
// the share leg performs no balance write of its own. False: therefore no
// money moved. The movement had already happened inside the payment leg's
// writes — which is exactly why leaving the row out broke the arithmetic
// rather than protecting it.
//
// ── The invariant these tests hold ───────────────────────────────────────
//
// For both parties: the rows in your history sum to the change in your
// balance. Nothing else in this file matters as much as that.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const server = readSource("server/server.js");
const shareFlow = readSource("server/lib/merchantShareFlow.js");
const app = readSource("frontend/App.jsx");

// The worked example from the report, in one currency so the share is
// visible without any exchange rate in the way.
const PAYMENT = 1000;
const RATE = 0.02;
const SHARE = PAYMENT * RATE;         // 20
const PAYEE_CREDITED = PAYMENT - SHARE; // 980

describe("the money itself was never wrong", () => {
  test("the payee is credited the payment minus their share", () => {
    // Stated as a test because it is the fact that makes the history gap a
    // display bug rather than a theft. If this ever stops being true the
    // whole diagnosis below is wrong.
    assert.match(
      server,
      /const payeeReceives = toMinorUnit\(numericAmount - cashback, destinationCurrency\)/
    );
    assert.match(server, /\{ \$inc: \{ balance: payeeReceives \} \}/);
    assert.equal(PAYEE_CREDITED, 980);
  });

  test("the share goes back to the payer as real balance", () => {
    assert.match(server, /if \(cashbackCredit > 0\) \{[\s\S]{0,400}\$inc: \{ balance: cashbackCredit \}/);
  });

  test("the payment row still records the full face value", () => {
    // Which is correct — 1,000 is what the payment was for — and is also
    // precisely why the share row is needed to reconcile it.
    assert.match(server, /amount: numericAmount,/);
  });
});

describe("a share leg reaches history", () => {
  test("the record query no longer excludes share rows", () => {
    const at = server.indexOf("const records = await Transaction.find(");
    assert.ok(at > 0, "the transaction record query was not found");
    const query = server.slice(at, server.indexOf("\n", at));
    assert.ok(
      !/\$ne: 'share'/.test(query),
      "share legs must appear in the list the History screen is built from"
    );
  });

  test("nor do the totals", () => {
    // totalSent/totalReceived have to move with the rows, or the summary at
    // the top of the screen disagrees with the list underneath it.
    const at = server.indexOf("const [totals] = await Transaction.aggregate([");
    assert.ok(at > 0, "totals aggregate not found");
    const aggregate = server.slice(at, at + 1600);
    assert.ok(!/\$ne: 'share'/.test(aggregate), "share legs must be counted in the totals");
  });

  test("the row says which kind it is", () => {
    // Without this the client sees two rows for one payment, to the same
    // person, on the same day, and cannot tell you what the second one is.
    assert.match(server, /type: transaction\.type \|\| 'payment',/);
    assert.match(app, /kind: row\.type === "share" \? "share" : "payment",/);
  });

  test("it lands on the payee's SENT side, which is what was asked for", () => {
    // The leg runs opposite to its payment: fromUserId is the payee. The
    // direction logic already keys off fromUserId, so this needs no
    // special-casing — but it is the whole point of the fix, so it is
    // asserted rather than assumed.
    assert.match(shareFlow, /fromUserId: receiver\._id,\s*\n\s*toUserId: sender\._id,/);
    assert.match(server, /direction: isSender \? 'sent' : 'received',/);
  });
});

describe("each side of the share is denominated in its own currency", () => {
  // Same rule the payment rows already follow, and the same failure mode if
  // it is broken: a figure rendered under the wrong currency's symbol.
  test("the row's amount/currency are the receiving side's — the payer's", () => {
    assert.match(shareFlow, /amount: cashback,\s*\n\s*currency: cashbackCurrency \|\| currency,/);
  });

  test("the paying side — the payee's — is carried separately", () => {
    assert.match(shareFlow, /debitAmount: Number\.isFinite\(payeeCashback\) \? payeeCashback : cashback,/);
    assert.match(shareFlow, /senderCurrency: payeeCurrency \|\| currency,/);
  });

  test("the server passes both sides in", () => {
    assert.match(server, /payeeCashback: cashback,/);
    assert.match(server, /payeeCurrency: destinationCurrency,/);
  });

  test("the client reads the sender side for a row it shows as sent", () => {
    // mapServerTransaction's existing contract, which the share row now
    // satisfies — so the payee's outgoing share row shows THEIR figure.
    assert.match(app, /const senderSideKnown = !isReceived && Number\.isFinite\(debit\) && row\.senderCurrency;/);
  });
});

describe("the row can name itself and its counterparty", () => {
  test("the party snapshot is swapped for the reversed leg", () => {
    // counterpartyFor reads parties.receiver for a viewer who is the row's
    // sender. This leg's sender is the payment's receiver, so an unswapped
    // snapshot would name each party as themselves.
    assert.match(shareFlow, /sender: paymentParties\.receiver, receiver: paymentParties\.sender/);
  });

  test("the method has a label, so the receipt line is not blank", () => {
    const mock = readSource("backend/data/mockData.js");
    assert.match(mock, /share: \{ label: "Creator Share"/);
  });

  test("it is not offered as a way to pay", () => {
    // The History screen's method chips are a fixed list. A Creator Share is
    // not an alternative to a bank transfer and must not read as one.
    const screen = readSource("frontend/features/history/TransactionHistoryScreen.jsx");
    assert.match(screen, /\["all", "bank", "paylater", "coin"\]/);
  });
});

describe("the misleading flag that caused this is gone", () => {
  test("the share leg no longer claims no balance moved", () => {
    // `noBalanceMovement: true` was true about the record and false about
    // the money, and three separate queries acted on the wrong reading.
    //
    // Comments stripped before the absence check. The metadata block's own
    // comment quotes the old flag name to explain what was wrong with it,
    // and grepping that prose as if it were code makes the explanation of
    // the bug look like the bug. Fourth time in this project — strip
    // comments before asserting a thing is ABSENT, every time.
    const code = shareFlow
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/noBalanceMovement/.test(code),
      "the flag that three history queries misread must not come back"
    );
    assert.match(code, /balanceMovedWithPaymentLeg: true,/);
  });
});

describe("the arithmetic the user can now do on screen", () => {
  test("payee: +1,000 received and -20 shared nets to the 980 they were credited", () => {
    const historyRows = [
      { direction: "received", amount: PAYMENT },
      { direction: "sent", amount: SHARE }
    ];
    const net = historyRows.reduce(
      (sum, r) => sum + (r.direction === "received" ? r.amount : -r.amount),
      0
    );
    assert.equal(net, PAYEE_CREDITED, "the payee's history must sum to their balance change");
  });

  test("payer: -1,000 paid and +20 back nets to the 980 they were debited", () => {
    const historyRows = [
      { direction: "sent", amount: PAYMENT },
      { direction: "received", amount: SHARE }
    ];
    const net = historyRows.reduce(
      (sum, r) => sum + (r.direction === "received" ? r.amount : -r.amount),
      0
    );
    assert.equal(net, -PAYEE_CREDITED, "the payer's history must sum to their balance change");
  });

  test("a payment with no share is still one row", () => {
    // The common case must not grow a spurious zero row.
    assert.match(shareFlow, /const hasShare = Number\.isFinite\(cashback\) && cashback > 0;/);
    assert.match(shareFlow, /if \(!hasShare\) \{/);
  });
});
