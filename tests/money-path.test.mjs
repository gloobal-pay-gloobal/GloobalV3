// tests/money-path.test.mjs
//
// Regression tests for the payment path.
//
// Every test in this file corresponds to a bug that actually SHIPPED. The
// frontend had no tests at all, and the three worst bugs found in one review
// session were all cases where money moved wrong and nothing caught it:
//
//   * a cross-border payment credited the receiver the SENDER's currency
//     figure — ₹5,000 arriving as ₹378.53 — while under-debiting the sender
//   * PayLater debt reset to zero on every re-login, handing back credit that
//     had already been spent
//   * a seed restored from the server double-counted against one planted
//     locally, inflating the PayLater limit the risk engine spends against
//
// The point of these is not coverage for its own sake. Each one fails on the
// pre-fix code and passes on the fixed code.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const domain = loadDomain([
  "createFinancialCore",
  "convert",
  "RATES",
  "buildTransactionSnapshot",
  "encodeGloobalQR",
  "decodeGloobalQR",
  "computePaylaterAvailable",
  "DIAL_SYMBOLS",
  "QR_ID_LENGTH",
  "QR_MAX_AMOUNT_CENTS"
]);

const INR = "INR";
const round2 = (n) => Math.round(n * 100) / 100;

describe("FX conversion", () => {
  test("converts through the EUR base in both directions", () => {
    // The exact figures from the reported bug: ₹5,000 to a CNY payer.
    assert.equal(domain.convert(5000, "INR", "CNY"), 378.53);
    // Round-tripping lands back within rounding distance of the original.
    const back = domain.convert(378.53, "CNY", "INR");
    assert.ok(Math.abs(back - 5000) < 1, `round trip drifted: ${back}`);
  });

  test("same currency is an exact identity, not an approximation", () => {
    // fxRate must be exactly 1 for a domestic pair — the server relies on
    // this to leave same-currency payments byte-for-byte unchanged.
    assert.equal(domain.convert(1234.56, "INR", "INR"), 1234.56);
  });

  test("returns 0 for a currency with no rate rather than guessing one", () => {
    // Guessing 1:1 for an unknown currency would silently move the wrong
    // amount of money. Returning 0 makes the caller fail visibly instead.
    assert.equal(domain.convert(100, "INR", "ZZZ"), 0);
    assert.equal(domain.convert(100, "ZZZ", "INR"), 0);
  });

  test("non-numeric input is 0, not NaN", () => {
    // NaN propagates silently through arithmetic and lands in a balance.
    assert.equal(domain.convert("", "INR", "CNY"), 0);
    assert.equal(domain.convert("abc", "INR", "CNY"), 0);
  });
});

describe("cross-border send — the amount handed to the server", () => {
  // BUG: SendMoney passed `convertedAmount` (the SENDER-currency figure) to
  // onRemoteSend. The backend documents that field as the RECEIVER's
  // local-currency face value and converts to the sender's currency itself.
  // Feeding it the already-converted number meant both legs were wrong:
  // the payee was credited 378.53 as if it were rupees, and the payer was
  // debited the CNY value of ₹378.53 (~¥28.66) instead of the ¥378.53 they
  // had agreed to.
  //
  // This is a source-shape guard rather than a behavioural one. The decision
  // lives inline in a JSX event handler with no seam to call, so there is
  // nothing to invoke; asserting on the call shape is what is available
  // short of refactoring the component. It is narrow on purpose — it checks
  // the one argument that was wrong, not the formatting around it.
  const src = readSource("frontend/screens/SendMoney/SendMoney.jsx");
  // Slice to the end of the call's own argument object (its first
  // `receiver:` line) rather than a fixed character count — the fixed call
  // carries a long explanatory comment that a fixed window would truncate.
  const callStart = src.indexOf("await onRemoteSend({");
  const remoteSendCall = src.slice(callStart, src.indexOf("receiver: bottom,", callStart));

  test("sends the typed receiver-currency amount, not the converted one", () => {
    assert.ok(
      /amount:\s*parseFloat\(amount\)/.test(remoteSendCall),
      "onRemoteSend must be given the raw typed amount (receiver currency)"
    );
    assert.ok(
      !/amount:\s*convertedAmount/.test(remoteSendCall),
      "onRemoteSend must NOT be given convertedAmount — that is the sender-currency figure"
    );
  });

  test("labels that amount with the receiver's currency", () => {
    assert.ok(
      /currency:\s*bottom\.currency/.test(remoteSendCall),
      "the currency label must match the amount being sent (receiver's)"
    );
  });

  test("the local ledger leg still uses the sender-currency amount", () => {
    // The two legs are deliberately different: the server is told the
    // receiver-currency figure, while the LOCAL ledger debits this device's
    // own balance in the sender's currency. A fix that made both the same
    // would break the other half.
    const execCall = src.slice(
      src.indexOf("onExecuteTransaction\n"),
      src.indexOf("onExecuteTransaction\n") + 600
    );
    assert.ok(
      /amount:\s*convertedAmount/.test(execCall),
      "the local ledger leg must keep convertedAmount (sender currency)"
    );
  });
});

describe("PayLater due survives a re-login", () => {
  // BUG: the local ledger is rebuilt from empty on every page load, and
  // nothing read the server's PayLater position. So a re-login showed ₹0
  // owed and a full limit — and RiskEngine reads that same balance to decide
  // affordability, so already-spent credit became spendable again.
  const newCore = () =>
    domain.createFinancialCore({
      userId: "t",
      currency: INR,
      openingBankBalance: 10000,
      logLevel: "silent"
    });
  const dueOf = (core) =>
    core.ledgerEngine.getAccountBalance(core.userAccounts.paylaterPayable.id, INR).amount;

  test("a fresh ledger starts owing nothing (this is the trap)", () => {
    assert.equal(dueOf(newCore()), 0);
  });

  test("reconciles to what the server says is owed", () => {
    const core = newCore();
    core.reconcilePaylaterDue(200);
    assert.equal(dueOf(core), 200);
  });

  test("is idempotent — re-running changes nothing", () => {
    const core = newCore();
    core.reconcilePaylaterDue(200);
    assert.equal(core.reconcilePaylaterDue(200), 0, "second call should be a no-op");
    assert.equal(dueOf(core), 200);
  });

  test("follows the server down to zero after a repayment", () => {
    const core = newCore();
    core.reconcilePaylaterDue(200);
    core.reconcilePaylaterDue(0);
    assert.equal(dueOf(core), 0);
  });

  test("a failed read never wipes a real due", () => {
    // Number(null) === 0, so coercing before validating would read "could
    // not fetch" as "owes nothing" and clear the debt.
    const core = newCore();
    core.reconcilePaylaterDue(200);
    for (const bad of [null, undefined, "", NaN, -5, {}, []]) {
      assert.equal(core.reconcilePaylaterDue(bad), 0, `${String(bad)} should be ignored`);
    }
    assert.equal(dueOf(core), 200, "due must be untouched by unreadable input");
  });

  test("does not touch the bank balance", () => {
    const core = newCore();
    const before = core.ledgerEngine.getAccountBalance(core.userAccounts.bank.id, INR).amount;
    core.reconcilePaylaterDue(350);
    assert.equal(core.ledgerEngine.getAccountBalance(core.userAccounts.bank.id, INR).amount, before);
  });
});

describe("asset seeds restored from the server", () => {
  const newCore = () =>
    domain.createFinancialCore({
      userId: "t",
      currency: INR,
      openingBankBalance: 10000,
      logLevel: "silent"
    });
  const serverSeed = (id, over = {}) => ({
    id,
    business: "Jio",
    amountPaid: 1000,
    cashbackRate: 0.02,
    yearsAccrued: 1,
    plantedAt: "2025-08-20T10:00:00Z",
    ...over
  });

  test("restores a seed with its elapsed growth intact", () => {
    const core = newCore();
    assert.equal(core.hydrateGrantsFromServer([serverSeed("a1")]), 1);
    const g = core.essentialsService.listGrants()[0];
    // The server reports YEARS, every local consumer works in MONTHS.
    // Reading one as the other made a year-old seed worth a month's growth.
    assert.equal(g.monthsAccrued, 12, "yearsAccrued must be converted to months");
    assert.equal(g.chip, "CS", "every server seed is Creator Share");
    assert.equal(round2(g.amountPaid * g.cashbackRate), 20);
  });

  test("is idempotent across repeated dashboard entries", () => {
    const core = newCore();
    core.hydrateGrantsFromServer([serverSeed("a1")]);
    assert.equal(core.hydrateGrantsFromServer([serverSeed("a1")]), 0);
    assert.equal(core.essentialsService.listGrants().length, 1);
  });

  test("never double-counts a seed already planted locally", () => {
    // BUG: after a payment plants a seed locally, the balance refresh
    // re-fetched assets and added the SAME seed again under a different key
    // (the server's row id vs the local txnId — computeSeed does not return
    // transactionId, so there is no shared field to match on). ₹20 of
    // cashback became ₹40, and the PayLater limit is the sum of seed values.
    const core = newCore();
    core.essentialsService.addGrant({
      userAccounts: core.userAccounts,
      key: "jio",
      business: "Jio",
      chip: "CS",
      amountPaid: 1000,
      cashbackRate: 0.02,
      creatorName: "Jio",
      time: "10:00",
      currency: INR,
      txnId: "TXN123"
    });
    core.hydrateGrantsFromServer([serverSeed("srvA", { yearsAccrued: 0 })]);
    const grants = core.essentialsService.listGrants();
    assert.equal(grants.length, 1, "must not merge server seeds into a non-empty list");
    assert.equal(
      round2(grants.reduce((s, g) => s + g.amountPaid * g.cashbackRate, 0)),
      20,
      "cashback must not be counted twice"
    );
  });

  test("ignores malformed seeds instead of planting zero-value grants", () => {
    const core = newCore();
    const added = core.hydrateGrantsFromServer([
      serverSeed("bad1", { amountPaid: 0 }),
      serverSeed("bad2", { cashbackRate: 0 }),
      { business: "no id" }
    ]);
    assert.equal(added, 0);
    assert.equal(core.essentialsService.listGrants().length, 0);
  });

  test("handles a null or empty payload without throwing", () => {
    const core = newCore();
    assert.equal(core.hydrateGrantsFromServer(null), 0);
    assert.equal(core.hydrateGrantsFromServer([]), 0);
    assert.equal(core.hydrateGrantsFromServer("nonsense"), 0);
  });
});

describe("PayLater availability", () => {
  test("limit minus what is owed, floored at zero", () => {
    const seeds = [{ amountPaid: 25000, cashbackRate: 0.02, monthsAccrued: 0 }];
    const r = domain.computePaylaterAvailable(seeds, [], 200);
    assert.equal(round2(r.paylaterLimit), 500);
    assert.equal(r.paylaterDue, 200);
    assert.equal(round2(r.paylaterAvailable), 300);
  });

  test("never reports negative headroom", () => {
    const seeds = [{ amountPaid: 5000, cashbackRate: 0.02, monthsAccrued: 0 }];
    const r = domain.computePaylaterAvailable(seeds, [], 9999);
    assert.equal(r.paylaterAvailable, 0);
  });
});

describe("receipt — payment and Creator Share are separate transactions", () => {
  // BUG: one resolvedTxnId was stamped on the payment receipt AND the share.
  // Paying Jio and receiving Jio's share back carried the same reference, so
  // neither could be looked up unambiguously.
  const sender = { name: "Me", currency: INR, flag: "IN", id: "ME" };
  const receiver = { name: "Jio", currency: INR, flag: "IN", id: "JIO", phone: "" };
  const now = new Date("2026-08-21T10:00:00Z");
  const build = (over = {}) =>
    domain.buildTransactionSnapshot({
      sender,
      receiver,
      amount: "1000",
      convertedAmount: 1000,
      payMethod: "Gloobal Bank",
      now,
      shareRatePercent: 2,
      ledgerRecordId: "L1",
      txnId: "PAYMENT-AAA",
      ...over
    });

  test("the share carries its own id, not the payment's", () => {
    const { receipt } = build({ shareTxnId: "SHARE-BBB", shareAmount: 20 });
    assert.equal(receipt.txnId, "PAYMENT-AAA");
    assert.equal(receipt.shareTxnId, "SHARE-BBB");
    assert.notEqual(receipt.txnId, receipt.shareTxnId);
  });

  test("the share links back to the payment it came from", () => {
    const { receipt } = build({ shareTxnId: "SHARE-BBB", shareAmount: 20 });
    assert.equal(receipt.shareSourceTxnId, "PAYMENT-AAA");
  });

  test("a 0%-share payee produces no share reference at all", () => {
    // A blank is correct here; inventing one would imply a transaction that
    // was never minted.
    const { receipt } = build({ shareRatePercent: 0 });
    assert.equal(receipt.shareTxnId, "");
    assert.equal(receipt.shareSourceTxnId, "");
  });

  test("history carries the share reference too", () => {
    const { historyEntry } = build({ shareTxnId: "SHARE-BBB", shareAmount: 20 });
    assert.equal(historyEntry.shareTxnId, "SHARE-BBB");
    assert.equal(historyEntry.txnId, "PAYMENT-AAA");
  });

  test("receipt states both sides of a cross-border amount", () => {
    const cnySender = { ...sender, currency: "CNY" };
    const { receipt } = domain.buildTransactionSnapshot({
      sender: cnySender,
      receiver,
      amount: "5000",
      convertedAmount: 378.53,
      payMethod: "Gloobal Bank",
      now,
      shareRatePercent: 0,
      ledgerRecordId: "L2",
      txnId: "X"
    });
    assert.equal(receipt.amount, 378.53, "'you send' is in the sender's currency");
    assert.equal(receipt.currencyCode, "CNY");
    assert.equal(receipt.convertedAmount, 5000, "'they receive' is in the receiver's currency");
    assert.equal(receipt.convertedCurrency, INR);
  });
});

describe("QR payload", () => {
  // A Gloobal ID is drawn from the dial-pad alphabet, not from letters and
  // digits — the encoder pads and validates against DIAL_SYMBOLS, so an
  // alphanumeric string is not a valid payload and will not round-trip.
  const validId = Array.from(
    { length: domain.QR_ID_LENGTH },
    (_, i) => domain.DIAL_SYMBOLS[i % domain.DIAL_SYMBOLS.length]
  ).join("");
  test("carries the Gloobal ID through unchanged", () => {
    const decoded = domain.decodeGloobalQR(
      domain.encodeGloobalQR({ gloobalId: validId, amountCents: 0 })
    );
    assert.equal(decoded.gloobalId, validId);
  });

  // This test was `todo` when it was written, against a 3-digit amount
  // field in a 4-symbol alphabet: the range was 4^3-1 = 63 minor units,
  // and anything larger was silently CLAMPED, so a request for 500.00
  // produced a code for 0.63. That is fixed (gloobalQR.js, 24 Aug 2026) —
  // the amount is now 7 digits in the full 8-symbol DIAL_SYMBOLS base,
  // giving 8^7-1 = 2,097,151, and an amount still out of range is
  // rejected rather than altered. The `todo` marker is removed because
  // the test passes now; the history stays here because the failure mode
  // it guards against is the one worth never repeating.
  test("carries the requested amount through unchanged", () => {
    const decoded = domain.decodeGloobalQR(
      domain.encodeGloobalQR({ gloobalId: validId, amountCents: 12345 })
    );
    assert.equal(decoded.amountCents, 12345);
  });

  test("amounts within the encodable range do round-trip", () => {
    // Guards the arithmetic itself at both ends of the range, including a
    // figure above PROTOTYPE_TRANSACTION_MAX_AMOUNT (5,000 units) so the
    // encodable range is verified to cover every amount the app will
    // actually let someone request.
    for (const cents of [0, 1, 42, 500000, domain.QR_MAX_AMOUNT_CENTS]) {
      const decoded = domain.decodeGloobalQR(
        domain.encodeGloobalQR({ gloobalId: validId, amountCents: cents })
      );
      assert.equal(decoded.amountCents, cents, `failed at ${cents} cents`);
    }
  });

  test("the encodable range covers every amount the app can request", () => {
    // The point of the widening. If PROTOTYPE_TRANSACTION_MAX_AMOUNT is
    // ever raised past what a code can carry, this fails before anyone
    // discovers it by generating an unusable request.
    assert.ok(
      domain.QR_MAX_AMOUNT_CENTS >= 5000 * 100,
      `range is ${domain.QR_MAX_AMOUNT_CENTS} minor units, below the 5,000-unit transaction cap`
    );
  });

  test("an over-range amount is rejected, never altered", () => {
    // A payment instrument may not quietly change the number it was given.
    // Refusing to produce a code is the only acceptable outcome here —
    // clamping (the old behaviour) and wrapping would both hand the payer
    // a code for an amount nobody asked for.
    const code = domain.encodeGloobalQR({
      gloobalId: validId,
      amountCents: domain.QR_MAX_AMOUNT_CENTS + 1
    });
    assert.equal(code, null, "an unrepresentable amount must not produce a code");
  });

  test("a zero-amount code is an identity request, not a payment", () => {
    const decoded = domain.decodeGloobalQR(
      domain.encodeGloobalQR({ gloobalId: validId, amountCents: 0 })
    );
    assert.equal(decoded.amountCents, 0);
  });

  test("rejects anything that is not a Gloobal code", () => {
    // Scanning a random QR from the world must not resolve to a payee.
    for (const junk of ["", "https://example.com", "GLB|", "nonsense"]) {
      assert.equal(domain.decodeGloobalQR(junk), null, `should reject: ${junk}`);
    }
  });
});

describe("transaction history rows always have an icon", () => {
  // The row icon used to be a tinted square rendering the counterparty's
  // country flag. Creator Share grants and rows restored from the server
  // carry no flag, so that square rendered EMPTY — a blank box on every
  // line, which reads as a broken avatar rather than a design choice.
  const src = readSource("frontend/features/history/TransactionRow.jsx");

  test("uses the shared flip-symbol mark, not a bare flag", () => {
    assert.ok(
      src.includes("<FlipSymbolCircle"),
      "the row icon must be the same mark My Assets and Referral Network use"
    );
    assert.ok(
      !src.includes(">{t.flag}<"),
      "the row must not render t.flag as its icon — most rows have none"
    );
  });
});

describe("the referral list can actually overflow its scroller", () => {
  // A regression guard for a scroll bug that took three attempts to find.
  //
  // The referral overlay's scroll column is `display: flex; flexDirection:
  // column; overflowY: auto`, so every card in it is a flex ITEM. A flex
  // item's automatic minimum size (min-height: auto) normally stops it
  // being compressed below its content — but per the flexbox spec that
  // protection only applies while the item's `overflow` is `visible`. The
  // referral list card sets `overflow: hidden` to clip its rows to the
  // card's rounded corners, which resolves its min-height to 0 and lets
  // the layout squash it.
  //
  // Measured: 38 rows needing 2622px were rendered at 554px and clipped.
  // The scroll column's content then fit exactly — scrollHeight ===
  // clientHeight — so there was nothing to scroll and the swipe did
  // nothing. With no referrals the empty-state card sets no `overflow` at
  // all, is therefore protected, and the screen scrolled fine, which is
  // exactly the "works empty, breaks once referrals exist" report.
  const source = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  const card = source.slice(
    source.indexOf("referralNetwork.length === 0"),
    source.indexOf("[...referralNetwork]")
  );

  test("the list card opts out of flex shrinking", () => {
    assert.match(
      card,
      /flexShrink: 0/,
      "the referral list card must set flexShrink: 0, or its rows get squashed and the screen has nothing to scroll"
    );
  });

  test("it still clips its rows to the card's rounded corners", () => {
    // The fix must not be "drop overflow: hidden" — that would un-round
    // the first and last rows instead of fixing the scroll.
    assert.match(card, /overflow: "hidden"/);
  });
});
