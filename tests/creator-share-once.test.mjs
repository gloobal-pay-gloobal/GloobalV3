// tests/creator-share-once.test.mjs
//
// A Creator Share is ONE event. It must appear once, and it must not be
// spendable twice.
//
// ── The duplicate ────────────────────────────────────────────────────────
//
// Pay 500 at 10% and the dashboard showed two +50.00 rows with the same
// timestamp. Two sources, one event:
//
//   - the Dashboard synthesised a row from the local asset seed, and
//   - receivedHistory already held the server's share leg — a real
//     transaction minted by merchantShareFlow with type "share", direction
//     "received", and metadata.assetSeedId naming the very seed the other
//     row was built from.
//
// The server added that `type` field FOR this: its own comment says a client
// that cannot tell a share from a payment "cannot keep it out of a payments
// count". mapServerTransaction reads it into `kind`. Nothing filtered on it.
//
// The server's row is the one that survives, and not only because it is the
// server's: the synthesised figure was `amountPaid * cashbackRate`, and
// amountPaid is the amount handed to executeTransaction — the RECEIVER's
// face value on a cross-border payment. A $5,000 payment to India would have
// taken its share from ₹478,000 and printed it with a dollar sign, which is
// the same defect App.jsx already fixed for history rows by preferring
// debitAmount.
//
// ── The double-spend ─────────────────────────────────────────────────────
//
// The creator's "Today's Collection" card carried Bank and Coin buttons that
// settled the day's share straight into the Gloobal Bank balance. But the
// seed a share plants IS the PayLater pool — computeAvailable returns
// `paylaterLimit: totalAssets` — so settling it to the bank spends the same
// amount twice: once as PayLater headroom, once as cash. Settling a share
// belongs in My Assets, where the seeds live.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const dash = () => readSource("frontend/screens/Dashboard/Dashboard.jsx");
const app = () => readSource("frontend/App.jsx");
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("a share appears exactly once in Recent Activity", () => {
  test("the received list is the server's rows, nothing concatenated", () => {
    const src = code(dash());
    assert.match(
      src,
      /const merged = Array\.isArray\(receivedHistory\) \? receivedHistory\.slice\(\) : \[\];/,
      "the received list is being built from more than one source again"
    );
    assert.ok(
      !/creatorShareRows\.concat/.test(src),
      "the synthesised Creator Share rows are being merged in again"
    );
  });

  test("the synthesiser is gone, not just unwired", () => {
    // Dead code that recomputes a wrong figure is what gets re-wired by
    // accident six months later.
    assert.ok(
      !/const creatorShareRows = /.test(code(dash())),
      "the synthesiser is still here waiting to be plugged back in"
    );
  });

  test("the server's share leg is still labelled as a share", () => {
    // Deduping by dropping the label would be worse than the duplicate: the
    // row would come back as a second, unexplained payment from the same
    // person on the same day.
    const src = code(app());
    assert.match(src, /kind: row\.type === "share" \? "share" : "payment"/);
    assert.match(src, /method: row\.type === "share" \? "share" : "bank"/);
  });

  test("and it still carries the rate the receipt needs", () => {
    // The synthesised row carried shareRate. If the surviving row does not,
    // the receipt's Creator Share tab goes blank — which is the bug this
    // field was added to fix in the first place.
    assert.match(code(app()), /shareRate/);
  });
});

describe("Today's Collection is money collected, not share received", () => {
  test("it sums received rows, and leaves the share legs out", () => {
    // It used to read the asset seeds — the shares this account earned as a
    // PAYER of someone else — and print them on the creator side as though
    // they were the day's takings.
    const src = code(dash());
    assert.match(
      src,
      /\.filter\(\(t\) => t\.kind !== "share" && t\.date === todaysDateLabel\)/,
      "Today's Collection is counting share legs, or is back on the asset seeds"
    );
    assert.ok(
      !/assetSeeds\.filter\(\(t\) => t\.chip === "CS" && t\.date === todaysDateLabel\)/.test(src),
      "Today's Collection is reading Creator Share seeds again"
    );
  });

  test("Today's Collection has no settle action", () => {
    const src = code(dash());
    assert.ok(
      !/if \(todaysCollection <= 0\) return;/.test(src),
      "the settle handler is back on the creator card"
    );
    assert.ok(
      !/setSettlePendingAmount\(todaysCollection\)/.test(src),
      "the day's Creator Share is being armed for settlement again"
    );
  });

  test("it says where the money actually went instead", () => {
    // Removing a button without saying why leaves a figure with no
    // explanation, which reads as broken rather than deliberate.
    const src = dash();
    assert.match(src, /Creator Share is not counted here/);
  });

  test("My Assets keeps its own settle, which is the one that is allowed", () => {
    const assets = code(readSource("frontend/features/assets/AssetsScreen.jsx"));
    assert.match(assets, /onClick=\{onRequestSettle\}/);
    assert.match(assets, /Settle \{fmtMoney\(totalAssets, ccyCode\)\} to Gloobal Bank/);
  });
});

describe("the seed a share plants IS the PayLater pool", () => {
  test("the limit is the asset total, so a share already raises it", () => {
    // This is the whole reason settling a share to the bank is a
    // double-spend rather than a preference: the same figure is already
    // doing a job.
    const { PayLaterService } = loadDomain(["PayLaterService"]);
    const svc = new PayLaterService(
      { getAccountBalance: () => ({ amount: 0 }) },
      { totalAccruedValue: () => 250 },
      { hasSufficientLiquidity: () => true },
      null
    );
    const available = svc.computeAvailable("INR", null);
    assert.equal(available.totalAssets, 250);
    assert.equal(available.paylaterLimit, 250, "the PayLater limit is no longer the asset total");
    assert.equal(available.paylaterAvailable, 250);
  });

  test("an outstanding due is taken out of what is available", () => {
    const { PayLaterService } = loadDomain(["PayLaterService"]);
    const svc = new PayLaterService(
      { getAccountBalance: () => ({ amount: 90 }) },
      { totalAccruedValue: () => 250 },
      { hasSufficientLiquidity: () => true },
      null
    );
    const available = svc.computeAvailable("INR", { paylaterPayable: { id: "x" } });
    assert.equal(available.paylaterDue, 90);
    assert.equal(available.paylaterAvailable, 160);
  });
});
