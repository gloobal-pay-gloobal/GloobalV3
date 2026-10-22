// tests/creator-share-custody.test.mjs
//
//   node --test tests/creator-share-custody.test.mjs
//
// A Creator Share is HELD, not spent.
//
// ── What was wrong ───────────────────────────────────────────────────────
//
// performTransfer credited the share straight into the payer's spendable
// balance — `$inc: { balance: cashbackCredit }` — and the Creator Share
// receipt reported it accurately: "Credited to: Gloobal balance."
//
// The rest of the product said something else and always had. The app's own
// explainer: "₹20 comes straight back to you and is planted in My Assets."
// The AssetSeed the same request plants, whose whole purpose is to track
// that share. A figure cannot be both planted and already spent, and the
// half that was wrong was the behaviour.
//
// ── Why this is not just "stop crediting the payer" ──────────────────────
//
// Because the money has to BE somewhere. The payer is debited the full
// amount and the payee is credited that amount MINUS the share. Leaving the
// difference uncredited destroys it: more leaves than arrives, the account
// that funds the eventual claim never receives it, and the claim becomes
// Gloobal paying out money nothing funded — the exact defect
// lib/disbursement.js and PlatformAccount were built to end.
//
// server/tests/transfer-atomicity.test.mjs records this argument in its own
// history. Its conservation check expected 800, was changed to 810 on the
// grounds that "800 + 190 leaves 10 of the original 1000 unaccounted for,
// which is the opposite of conserving" — correct, against a design where
// the seed was a note about money rather than a place money could be. It is
// 800 again now, and conservation is checked across three accounts.
//
// ── What this file pins ──────────────────────────────────────────────────
//
// It reads source, not a database: the server suite needs MONGO_URI and
// cannot run here. So it pins the SHAPE of the money path — that the credit
// goes to custody, that the revert takes it back, that the two generations
// of seed are told apart, and that the principal and the interest come out
// of two different accounts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SERVER = "server/server.js";
const CUSTODY = "server/lib/custody.js";
const DISBURSE = "server/lib/disbursement.js";
const SEED = "server/models/AssetSeed.js";
const PLATFORM = "server/models/PlatformAccount.js";
const SHARE_FLOW = "server/lib/merchantShareFlow.js";

// Comments stripped before asserting on code, so a test cannot match the
// note explaining a thing's removal instead of the thing.
const code = (relPath) => readSource(relPath)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const slice = (src, from, to) => {
  const at = src.indexOf(from);
  assert.ok(at >= 0, `could not find ${from}`);
  const end = to ? src.indexOf(to, at) : src.length;
  assert.ok(end > at, `could not find ${to} after ${from}`);
  return src.slice(at, end);
};

describe("the share goes into custody, not into a balance", () => {
  const server = code(SERVER);

  test("the payer is no longer credited their own share", () => {
    // The line this whole change exists to remove. It is written as an
    // absence rather than as "the new line is present" because the defect
    // was not a missing feature — it was this statement, doing exactly what
    // it said, in the middle of a payment.
    //
    // Scoped to the block that places the share, and to USER writes: the
    // custody write in that same block increments a balance by the same
    // variable, so a bare search for the increment finds the fix and calls
    // it the bug.
    const held = slice(server, "if (cashbackCredit > 0) {", "const ledgerRows = [");
    assert.ok(!/User\./.test(held),
      "the Creator Share is touching a user's balance again");
    assert.ok(!/\$inc: \{ balance: cashbackCredit \} \}[\s\S]{0,120}sender\._id/.test(server),
      "the payer is being credited their own share again");
  });

  test("it is placed in the custody account instead", () => {
    const transfer = slice(server, "let cashbackHeldInCustody = 0;", "const ledgerRows = [");
    assert.match(transfer, /PlatformAccount\.custodyFor\(senderCurrency/);
    assert.match(transfer, /\$inc:\s*\{\s*balance:\s*cashbackCredit\s*\}/);
    assert.match(transfer, /cashbackHeldInCustody = cashbackCredit;/);
  });

  test("a share that cannot be placed takes the whole payment down", () => {
    // The half that makes the books balance. If the custody write did not
    // apply, the share has been taken out of the payer and put nowhere —
    // so this throws and the surrounding transaction reverses the payment,
    // rather than completing one that destroyed money.
    const transfer = slice(server, "let cashbackHeldInCustody = 0;", "const ledgerRows = [");
    assert.match(transfer, /throw new Error\('Creator Share could not be placed in custody/);
  });

  test("custody is a separate account from the one Gloobal spends out of", () => {
    // Mixing them would add every claimed share to disbursedTotal, which is
    // the figure "Our spending" is built from — a fabricated number behind
    // an audited label.
    assert.match(code(PLATFORM), /enum: \['disbursement', 'custody'\]/);
    assert.match(code(PLATFORM), /PlatformAccount\.custodyFor = /);
    assert.match(code(PLATFORM), /forPurpose\('custody', currency, session\)/);
  });

  test("a reversed payment does not leave the share behind", () => {
    const revert = slice(server, "if (!session) {", "if (poolSettlementApplied && settlement)");
    // The FULL debit goes back, because none of it came back to this
    // balance on the way out. It used to be `debitAmount -
    // cashbackAppliedToSender`, which was right only while the share had
    // been credited into this same balance moments earlier.
    assert.match(revert, /\$inc:\s*\{\s*balance:\s*debitAmount\s*\}/);
    assert.ok(!/debitAmount - cashbackAppliedToSender/.test(server),
      "the revert is still deducting a share that never reached the balance");
    // And the custody side is undone too, only if this run is what moved it.
    assert.match(revert, /if \(cashbackHeldInCustody > 0\)/);
    assert.match(revert, /\$inc:\s*\{\s*balance:\s*-cashbackHeldInCustody\s*\}/);
  });

  test("the ledger line stops claiming a balance that did not move", () => {
    const rows = slice(server, "const ledgerRows = [", "await LedgerEntry.create(ledgerRows");
    // Both sides of the hold are the balance after the debit — the same
    // figure twice, which is the true answer to what this account was worth
    // either side of this line.
    assert.match(rows, /balanceBefore: senderBalanceAfterDebit,\s*\n\s*balanceAfter: senderBalanceAfterDebit,/);
    assert.match(rows, /note: 'Creator Share held in My Assets',/);
    // The flag anything reading these rows keys on, and the account named.
    assert.match(rows, /heldInCustody: true,/);
    assert.match(rows, /custodyKey: `platform:custody:/);
  });

  test("the payment response does not report the share as balance", () => {
    const response = slice(server, "message: 'Prototype transaction completed successfully.',", "assetSeed: plantedSeed");
    assert.match(response, /newBalance: senderBalanceAfter,/);
    assert.match(response, /cashbackDestination: cashbackCredit > 0 \? 'assets' : null,/);
  });
});

describe("two generations of seed, told apart by what happened", () => {
  const server = code(SERVER);
  const seedModel = code(SEED);

  test("the flag defaults to false, so an old row reads as already credited", () => {
    // The direction of the default is the whole safety property. Read as
    // held when it was not, every seed planted before this change pays its
    // principal a second time out of custody that never received it.
    assert.match(seedModel, /principalHeld:\s*\{ type: Boolean, default: false \}/);
    assert.match(seedModel, /principalClaimed: \{ type: Number, default: 0 \}/);
  });

  test("performTransfer's own seed is marked held", () => {
    const planting = slice(server, "plantedSeed = await AssetSeed.create({", "});");
    assert.match(planting, /principalHeld: true,/);
  });

  test("the backfill route reads the flag off the payment, never off the clock", () => {
    // A seed backfilled today for a payment made last month, where the
    // share went into a balance, would otherwise hand its owner that share
    // again.
    const plant = slice(server, "const [debitLine, cashbackLine] = await Promise.all([", "return res.status(201)");
    assert.match(plant, /principalHeld: cashbackLine\.metadata\?\.heldInCustody === true,/);
    // And it still finds the line under either wording, so it can backfill
    // payments from both generations.
    assert.match(plant, /note: \{ \$in: \['Cashback credited to balance', 'Creator Share held in My Assets'\] \}/);
  });

  test("computeSeed pays nothing on a seed that was never held", () => {
    const compute = slice(server, "function computeSeed(seed) {", "\n}\n");
    assert.match(compute, /const principalHeld = seed\.principalHeld === true;/);
    assert.match(compute, /const principalAvailable = principalHeld \? Math\.max\(0, cashback - principalClaimed\) : 0;/);
    // One figure for a Claim control, so the screen and the route cannot
    // arrive at different answers to "how much will this pay me".
    assert.match(compute, /claimable: principalAvailable \+ interestAvailable,/);
  });

  test("the receipt names the destination recorded at the time", () => {
    // A receipt is a record. The share leg carries where the share went,
    // and its absence means the payment predates holding — so an old
    // receipt keeps saying "Gloobal balance", which is what happened to it.
    assert.match(code(SHARE_FLOW), /cashbackDestination: 'assets',/);
    const card = code("frontend/components/dialogs/ReceiptModal.jsx");
    assert.match(card, /receipt\.shareDestination === "assets"\s*\n?\s*\? "My Assets"\s*\n?\s*: "Gloobal balance"/);
    // And nothing names the balance unconditionally any more.
    assert.ok(!/label=\{shareIsCredit \? "Credited to" : "Taken from"\} value="Gloobal balance"/.test(card),
      "the receipt is hardcoding the destination again");
  });
});

describe("a claim pays two things out of two accounts", () => {
  const server = code(SERVER);
  const claim = slice(server, "app.post('/api/assets/claim-interest'", "app.get('/api/assets/paylater/");

  test("the principal comes out of custody, not out of the expense account", () => {
    // Running it through recordDisbursement would add every claimed share
    // to disbursedTotal and inflate "Our spending" by money that was never
    // Gloobal's.
    assert.match(claim, /await releaseFromCustody\(\{/);
    assert.match(claim, /reason: 'creator_share_principal',/);
    const release = slice(claim, "if (totalPrincipal > 0) {", "if (totalInterest > 0) {");
    assert.ok(!/recordDisbursement/.test(release), "the principal is being paid as a disbursement");
  });

  test("the interest is still a real disbursement", () => {
    assert.match(claim, /await recordDisbursement\(\{/);
    assert.match(claim, /amount: totalInterest,/);
    assert.match(claim, /reason: 'seed_interest',/);
  });

  test("the two totals are never summed before they are paid", () => {
    // Summing them early is exactly how the principal would end up leaving
    // the wrong account.
    assert.match(claim, /let totalInterest = 0;/);
    assert.match(claim, /let totalPrincipal = 0;/);
    assert.match(claim, /amount: totalPrincipal,/);
    assert.match(claim, /amount: totalInterest,/);
  });

  test("one seed cannot be claimed twice, on either half", () => {
    // Both counters are in the compare-and-swap filter. Marking only the
    // interest would let two concurrent claims each release the principal.
    assert.match(claim, /\{ _id: seed\._id, interestClaimed: priorInterest, principalClaimed: priorPrincipal \}/);
    assert.match(claim, /principalClaimed: priorPrincipal \+ principalAvailable,/);
  });

  test("the response breaks the two halves out", () => {
    assert.match(claim, /principal: payout\.principal,/);
    assert.match(claim, /interest: payout\.interest,/);
    assert.match(claim, /claimed: payout\.claimed,/);
  });

  test("custody short of what a seed promises is refused, not paid", () => {
    assert.match(claim, /error\.code === 'custody_short'/);
    assert.match(claim, /return res\.status\(409\)/);
  });
});

describe("the custody module keeps the disbursement module's guarantees", () => {
  const custody = code(CUSTODY);

  test("atomic or refuse", () => {
    // The two writes are "custody is lighter" and "the person is richer".
    // A half-applied pair is money created or destroyed.
    assert.match(custody, /if \(!session\) \{/);
    assert.match(custody, /'session_required'/);
    assert.match(code(DISBURSE), /'session_required'/);
  });

  test("it will not pay out money it is not holding", () => {
    // A custody account is not an expense account and must never go
    // negative: a release it cannot cover means the share was never placed,
    // and paying anyway would be inventing it.
    assert.match(custody, /balance: \{ \$gte: released \}/);
    assert.match(custody, /'custody_short'/);
  });

  test("it rounds once, and both legs use that figure", () => {
    assert.match(custody, /const released = toMinorUnit\(amount, code\);/);
    assert.match(custody, /\$inc: \{ balance: -released \}/);
    assert.match(custody, /\$inc: \{ balance: released \}/);
  });

  test("it never guesses a currency", () => {
    assert.match(custody, /'currency_required'/);
  });

  test("its transaction type is its own, so spending does not pick it up", () => {
    // coverageAggregation's SPENDING_TRANSACTION_TYPES is ['send'], and
    // disbursedTotal is what "Our spending" reports. A release is neither.
    assert.match(custody, /type: 'custody_release',/);
    assert.match(code("server/models/Transaction.js"), /'custody_release',/);
    assert.ok(!/disbursedTotal/.test(custody), "a custody release is touching the spending total");
  });

  test("both halves are written down", () => {
    assert.match(custody, /await Transaction\.create\(/);
    assert.match(custody, /await LedgerEntry\.create\(/);
    assert.match(custody, /entryType: 'credit',/);
  });
});

describe("the app stops telling people the share is spendable", () => {
  test("the unlock screen says where it actually is", () => {
    // Comments stripped: the note explaining the old line quotes it, and a
    // raw search would match the explanation and call it the defect. That
    // mistake has been made twice in this repo's tests already.
    const unlock = code("frontend/components/dialogs/PaymentUnlock.jsx");
    assert.ok(!/It's in your Gloobal balance already/.test(unlock),
      "the unlock screen still says the share is in the balance");
    // Case-insensitive: the line was resplit so that where the share went
    // comes first, which made "Planted in My Assets" the start of its own
    // sentence. What this guards is that the screen still names the place,
    // not where the capital letter falls.
    assert.match(unlock, /planted in My Assets/i);
  });

  test("the help sheet already said this, and still does", () => {
    // This one was right the whole time. It is asserted so a later edit
    // cannot quietly bring the two back out of step in the other direction.
    assert.match(readSource("frontend/components/dialogs/helpSheets.jsx"),
      /comes straight back to you and is planted in My Assets/);
  });

  test("the assets read carries what is actually waiting", () => {
    const api = code("backend/services/api/gloobalApi.js");
    for (const field of ["totalPrincipalHeld", "totalPrincipalAvailable", "totalPrincipalClaimed", "totalClaimable"]) {
      assert.match(api, new RegExp(`${field}: Number\\(result\\.${field}\\) \\|\\| 0`), `${field} is not read`);
    }
  });
});
