// tests/creator-share-notification.test.mjs
//
//   node --test tests/creator-share-notification.test.mjs
//
// A Creator Share release, as a notification for both sides.
//
// ── What was missing ───────────────────────────────────────────────────
//
// server/lib/merchantShareFlow.js mints the share leg and its receipt pair,
// and the string "notif" did not appear in it once. Exactly two pieces of
// code on the whole server wrote a notification — recordPaymentNotifications
// and the promotional campaign sender — and neither knew about a share.
//
// So a share was released, money moved on both sides, four receipts were
// written, and nobody was told. The payee learned they had given a cut by
// opening the payment's receipt and finding a second tab; the payer learned
// they had been given one by noticing their balance was higher than the
// figure on the notification they HAD received.
//
// ── What is asserted, and why not through Mongo ────────────────────────
//
// The writer needs a database, and server/tests is where the DB-backed
// suites live (they need MONGO_URI). What is checkable without one is the
// SHAPE of what it writes, and the shape is where this class of bug lives:
// a type missing from the model's enum is not a fallback, it is a rejected
// write; a figure read off the wrong side of the leg is a cross-border
// error that reads correctly in a same-currency test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SERVER = "server/server.js";
const MODEL = "server/models/Notification.js";
const TEXT = "server/lib/notificationText.js";
const FLOW = "server/lib/merchantShareFlow.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (p) => strip(readSource(p));

describe("a share release is recorded for both people", () => {
  const server = code(SERVER);
  const writer = server.slice(
    server.indexOf("async function recordShareNotifications"),
    server.indexOf("async function sendPaymentPushes")
  );

  test("there is a writer at all", () => {
    assert.ok(writer.length > 200, "recordShareNotifications is missing");
    // And the payment route calls it.
    assert.match(server, /await recordShareNotifications\(\{/);
  });

  test("it runs only when a share actually happened", () => {
    // mintShareLegAndReceipts returns a null shareTransaction for a payment
    // whose payee shares nothing. A notification saying somebody shared
    // 0.00 is a statement about money that did not move.
    assert.match(server, /if \(shareTransaction\) \{/);
    assert.match(writer, /if \(!shareTransaction\) return \[\];/);
  });

  test("the model will accept the type", () => {
    // A value missing from a Mongoose enum does not fall back to the
    // default — the write is rejected outright. Every share notification
    // would have been silently dropped, and the only sign would have been a
    // line in the server log.
    assert.match(code(MODEL), /enum: \['login', 'payment', 'share', 'security', 'referral', 'system', 'offer'\]/);
    assert.match(writer, /type: 'share',/);
  });

  test("each person is shown their OWN side of the share", () => {
    // The leg stores both, in their own currencies, and across a corridor
    // they are different numbers:
    //
    //   shareTransaction.amount / .currency     the payer's credit
    //   metadata.debitAmount / .senderCurrency  the payee's withholding
    //
    // Showing one person the other's figure under their own symbol is the
    // defect that put ₹478,000 on a dollar row, and this file's siblings
    // have had to fix it three times in three places.
    assert.match(writer, /const payerAmount = Number\(shareTransaction\.amount\);/);
    assert.match(writer, /meta\.debitAmount/);
    assert.match(writer, /meta\.senderCurrency/);

    // The payee leg carries the payee figure, the payer leg the payer's,
    // and each carries the other as the counter-figure.
    const payee = writer.slice(writer.indexOf("userId: receiver._id"), writer.indexOf("userId: sender._id"));
    assert.match(payee, /direction: 'sent'/);
    assert.match(payee, /amount: payeeAmount/);
    assert.match(payee, /counterAmount: payerAmount/);

    const payer = writer.slice(writer.indexOf("userId: sender._id"));
    assert.match(payer, /direction: 'received'/);
    assert.match(payer, /amount: payerAmount/);
    assert.match(payer, /counterAmount: payeeAmount/);
  });

  test("nothing in it computes a figure", () => {
    // Both numbers were recorded by the flow that moved the money. A rate
    // derived by dividing one by the other would be a third number that
    // reconciles with neither — which is why no fxRate is written here.
    assert.ok(!/\bfxRate\b/.test(writer), "the share notification invented a rate");
    const sums = writer.match(/[^/*\s][*/]\s*(payerAmount|payeeAmount|meta\.)/g) || [];
    assert.deepEqual(sums, [], `the writer is doing arithmetic on money: ${sums}`);
  });

  test("it reads the PAYMENT's party snapshot, not the share leg's", () => {
    // merchantShareFlow stores a SWAPPED copy on the share leg, because
    // counterpartyFor resolves it from the viewer's side and the leg runs
    // opposite to its payment. Reading that swapped copy here would name
    // each person as themselves — the exact mistake the snapshot exists to
    // prevent.
    assert.match(writer, /paymentTransaction\?\.metadata\?\.parties \|\| \{\}/);
    assert.ok(
      !/shareTransaction\.metadata\?\.parties|meta\.parties/.test(writer),
      "the writer reads the share leg's swapped snapshot"
    );
  });

  test("the row points at the share's receipt and names the payment above it", () => {
    // Tapping opens the Creator Share receipt, which already exists —
    // issueReceiptPair writes it. And the card can say which payment the
    // share came from, which is the one question a 20.00 arriving seconds
    // after a 1,000.00 actually raises.
    assert.match(writer, /'metadata\.referenceId': shareTransaction\.referenceId/);
    assert.match(writer, /'metadata\.paymentReferenceId': reference/);
    // And the projection hands that second field to the client.
    assert.match(server, /paymentReferenceId: metadata\.paymentReferenceId \?\? null,/);
  });

  test("a replay does not buzz a phone twice", () => {
    // Same idempotency key the payment legs use: the unique index on
    // (userId, metadata.transactionId), and `upsertedCount === 1` as the
    // proof that THIS call created the row. Keyed on the SHARE leg's id, so
    // a share and the payment that produced it are two rows for one person
    // and neither is refused as a duplicate of the other.
    assert.match(writer, /'metadata\.transactionId': shareId/);
    assert.match(writer, /upsertedCount === 1/);
  });

  test("a notification failure cannot fail the payment", () => {
    // The money has moved and the receipts exist by the time this runs.
    // Searched FORWARD from the block, not from the top of the file: there
    // is an earlier `return res.status(201)` in server.js, and slicing to
    // the first one produced an empty string that matched nothing.
    const at = server.indexOf("if (shareTransaction) {");
    assert.ok(at > 0, "the share notification call site is gone");
    const callSite = server.slice(at, server.indexOf("return res.status(201)", at));
    assert.match(callSite, /try \{/);
    assert.match(callSite, /catch \(shareNotifyError\)/);
  });
});

describe("the share banner and the share card say the same thing", () => {
  test("the server composes share wording in the one shared file", () => {
    // The arrangement this file's header describes: a payment says the same
    // thing in the card, in the page's own banner and in the server's push,
    // because the wording lives in one place. A share composed at the push
    // site would be a fourth wording for a third event.
    const text = code(TEXT);
    assert.match(text, /function shareBannerText\(/);
    assert.match(code(SERVER), /shareBannerText\(\{/);
  });

  test("a share banner is told apart from a payment banner", () => {
    // They land seconds apart, from the same person. With the payment's own
    // wording the lock screen would read
    //
    //     +2,000.00₹   From Rajeev Menon
    //     +20.00₹      From Rajeev Menon
    //
    // which is one payment duplicated at the wrong amount.
    const text = code(TEXT);
    assert.match(text, /Creator Share \$\{sent \? 'to' : 'from'\}/);
    // And the card's first page uses the same words.
    assert.match(
      code("frontend/components/cards/notificationCard.jsx"),
      /share \? \(sent \? "Creator Share to" : "Creator Share from"\)/
    );
  });

  test("the figure keeps the payment's shape, through one function", () => {
    // The sign is the sentence, everywhere. Both banners route through
    // bannerAmountTitle rather than each formatting its own, so a change to
    // how a figure reads cannot reach one and miss the other.
    const text = code(TEXT);
    assert.match(text, /function bannerAmountTitle\(/);
    // `title: bannerAmountTitle({`, so the declaration is not counted as a
    // third caller.
    const calls = text.match(/title: bannerAmountTitle\(\{/g) || [];
    assert.equal(calls.length, 2, "one of the two banners formats its own figure");
  });

  test("a share with no figure says what happened, not plus zero", async () => {
    // `Number(null)` is 0 and 0 is finite, which is how "+0.00" with no unit
    // reaches a lock screen as a statement of fact.
    const { shareBannerText } = await import("../server/lib/notificationText.js");
    assert.equal(shareBannerText({ direction: "sent" }).title, "Creator Share sent");
    assert.equal(shareBannerText({ direction: "received" }).title, "Creator Share received");
    assert.equal(shareBannerText({ direction: "received", amount: 20, currency: "INR" }).title, "+20.00₹");
    assert.equal(shareBannerText({ direction: "sent", amount: 20, currency: "INR" }).title, "−20.00₹");
  });

  test("the sign is a minus, not a hyphen", async () => {
    // U+2212. The same character the card and the payment banner use; a
    // hyphen beside a figure reads as a dash.
    const { shareBannerText } = await import("../server/lib/notificationText.js");
    const title = shareBannerText({ direction: "sent", amount: 20, currency: "INR" }).title;
    assert.ok(title.startsWith("−"), `the sign is ${JSON.stringify(title[0])}`);
  });
});

describe("the flow that mints the share stays out of the notification business", () => {
  test("merchantShareFlow still only mints rows", () => {
    // The writer lives in server.js, beside the payment one and the push
    // machinery it reuses. Putting it in the flow would pull Notification,
    // pruneNotifications, the banner composer and pushService into a file
    // whose whole job is writing a Transaction and four receipts.
    const flow = code(FLOW);
    assert.ok(!/Notification|pushService/.test(flow), "merchantShareFlow grew a notification dependency");
    // And it still hands back the leg the writer needs.
    assert.match(flow, /return \{ shareTransaction, receipts: \[\.\.\.paymentReceipts, \.\.\.shareReceipts\] \};/);
  });
});
