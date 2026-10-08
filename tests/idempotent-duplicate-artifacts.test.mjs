// tests/idempotent-duplicate-artifacts.test.mjs
//
//   node --test tests/idempotent-duplicate-artifacts.test.mjs
//
// A retried payment is described in full, not in half.
//
// ── What this is, and what it is not ───────────────────────────────────
//
// server/tests/idempotent-duplicate-response.test.mjs is the real test of
// this. It registers accounts, sends payments, retries them and compares
// the two responses field by field. It is also unrunnable without
// MONGO_URI, which is why it sat unrun from 2 September to 8 October and
// why the defect below survived five weeks after the test that names it
// was written:
//
//     FAIL  retry 2: receipts identical  — first=[4 receipts] duplicate=undefined
//     FAIL  retry 2: settlement identical — duplicate=undefined
//     FAIL  retry 2: assetSeed recorded half identical — duplicate=null
//
// This file is the half that can run anywhere. It asserts the SHAPE of the
// two responses — that the duplicate branch reads the artifacts back, and
// that both branches describe a settlement through one function. It cannot
// prove the figures match; only the database-backed suite can. It can stop
// the fields being dropped again by somebody who cannot run that suite,
// which is the condition under which they were dropped the first time.
//
// ── Why the omission mattered ──────────────────────────────────────────
//
// A retry happens when the FIRST RESPONSE WAS LOST. The client sends the
// same idempotency key, the server recognises the payment and answers
// "already done" — and that answer carried no receipts. So the one case
// where the client has nothing of its own to fall back on was the case it
// was told least about: a payment with four receipts in the database
// showed none in the app, for the person whose connection was worst.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SERVER = "server/server.js";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const server = strip(readSource(SERVER));

// The two branches that answer "this payment already happened": the
// idempotency-key replay (200) and the same-payment-within-15-seconds guard
// (409). They describe the same thing and must describe it the same way.
const duplicateBranches = () => {
  const out = [];
  for (const marker of ["Duplicate request ignored.", "Duplicate transaction blocked."]) {
    const at = server.indexOf(marker);
    assert.ok(at > 0, `the ${JSON.stringify(marker)} branch is gone`);
    out.push({ marker, body: server.slice(at, server.indexOf("});", at) + 3) });
  }
  return out;
};

describe("a duplicate response carries what the first one did", () => {
  test("both branches read the stored artifacts back", () => {
    for (const { marker, body } of duplicateBranches()) {
      assert.match(
        body,
        /\.\.\.\(await storedPaymentArtifacts\(/,
        `${marker} does not return the receipts, settlement or seed`
      );
    }
  });

  test("they also still carry the facts and the share leg", () => {
    // The two that were already there. Asserted so a future edit cannot
    // trade one omission for another.
    for (const { marker, body } of duplicateBranches()) {
      assert.match(body, /\.\.\.\(await storedPaymentFacts\(/, `${marker} dropped the financial facts`);
      assert.match(body, /shareTransaction: await existingShareLegPayload\(/, `${marker} dropped the share leg`);
    }
  });

  test("the artifacts are READ, never re-minted", () => {
    // A retry must describe the payment that happened. Minting anything
    // here would mean a lost response produced a second set of receipts for
    // one payment — which is the failure mode idempotency exists to prevent,
    // reintroduced by the code that handles it.
    const at = server.indexOf("async function storedPaymentArtifacts");
    assert.ok(at > 0, "storedPaymentArtifacts is gone");
    const fn = server.slice(at, server.indexOf("\n}\n", at));
    for (const forbidden of ["Receipt.create", "Settlement.create", "AssetSeed.create", "issueReceiptPair", "mintShareLegAndReceipts"]) {
      assert.ok(!fn.includes(forbidden), `the duplicate path calls ${forbidden}`);
    }
    assert.match(fn, /Receipt\.find\(/);
    assert.match(fn, /Settlement\.findOne\(/);
    assert.match(fn, /AssetSeed\.findOne\(/);
  });

  test("the receipts come back in the order they were minted", () => {
    // The test compares the two arrays as JSON, so order is part of being
    // identical — and the first response lists the payment's pair before
    // the share's, because that is the order they were written in. _id is
    // monotonic with insertion, so one sort reproduces it.
    const at = server.indexOf("async function storedPaymentArtifacts");
    const fn = server.slice(at, server.indexOf("\n}\n", at));
    assert.match(fn, /\.sort\(\{ _id: 1 \}\)/);
    // Both the payment's receipts and the share leg's — four on a shared
    // payment, and the share's live under the share transaction's id.
    assert.match(fn, /transactionId: \{ \$in: transactionIds \}/);
  });

  test("a failure there cannot fail the response", () => {
    // Best-effort, like reading the share leg: the money has moved and the
    // record exists. An unreadable artifact must not turn "already done"
    // into an error.
    const at = server.indexOf("async function storedPaymentArtifacts");
    const fn = server.slice(at, server.indexOf("\n}\n", at));
    assert.match(fn, /catch \(error\)/);
    assert.match(fn, /return empty;/);
  });
});

describe("one settlement shape, for both responses", () => {
  test("the 201 and the duplicate use the same function", () => {
    // It was an object literal inlined in the 201 response. A second literal
    // in the duplicate branch would be a second shape, and the first time
    // they disagreed would be on a retry — the one response nobody watches,
    // because the person has either already seen the payment succeed or has
    // seen nothing at all, which is why they retried.
    assert.match(server, /function settlementPayload\(settlement\)/);
    const calls = server.match(/settlementPayload\(/g) || [];
    // The declaration, the 201, and inside storedPaymentArtifacts.
    assert.equal(calls.length, 3, `settlementPayload is called ${calls.length - 1} times, expected 2`);
  });

  test("the 201 no longer builds its own", () => {
    assert.match(server, /settlement: settlement \? settlementPayload\(settlement\) : null,/);
    // The giveaway that a literal has come back: these keys appearing
    // anywhere outside the shaper.
    const at = server.indexOf("function settlementPayload");
    const outside = server.slice(0, at) + server.slice(server.indexOf("\n}\n", at));
    assert.ok(
      !/destinationCashbackReturn: settlement\./.test(outside),
      "a settlement is being shaped by hand again"
    );
  });
});
