// tests/qr-session-flow.test.mjs
//
// The QR session state machine, and in particular the one rule the whole
// design was built around:
//
//     "even if 10 people scan same qr who ever verify it first qr belongs
//      to them and rest get a message of alredy used qr scan new"
//
// ── Why there is a fake model in this file ───────────────────────────────
//
// Because the interesting behaviour is a RACE, and a race cannot be tested
// against a live database from a test suite that has no database. What can
// be tested — and is the thing that actually breaks — is whether the flow
// code asks the question and writes the answer in ONE operation, or reads
// first and writes after.
//
// So the fake below is built to catch exactly that distinction:
//
//   - findOne() yields to the microtask queue before answering, the way a
//     real driver's round trip does.
//   - findOneAndUpdate() matches and writes inside one synchronous block,
//     which is Mongo's own guarantee for it.
//
// A read-then-write implementation therefore produces ten winners here, and
// the single conditional update produces one. If someone later "simplifies"
// claimQrSession into a findOne followed by a save, this file fails loudly
// instead of the app quietly letting ten people pay one bill.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { loadDomain, readSource, ROOT } from "./harness.mjs";

// The server is CommonJS; this package is `"type": "module"`, so a .js file
// under server/ cannot be require()d from here in place. Copied out to a
// directory with no package.json above it, exactly as
// tests/share-reference.test.mjs does for merchantShareFlow.js. The flow
// layer requires nothing but `crypto`, so there are no models to stub.
let mintQrSession, resolveQrSession, claimQrSession, consumeQrSession;
let QR_SESSION_HANDLE_SPACE, QR_SESSION_TTL_MS, QR_CLAIM_TTL_MS;
let tmp;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-qr-session-"));
  const copied = path.join(tmp, "qrSessionFlow.js");
  fs.copyFileSync(path.join(ROOT, "server/lib/qrSessionFlow.js"), copied);
  ({
    mintQrSession, resolveQrSession, claimQrSession, consumeQrSession,
    QR_SESSION_HANDLE_SPACE, QR_SESSION_TTL_MS, QR_CLAIM_TTL_MS
  } = createRequire(import.meta.url)(copied));
});

after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

// ── The fake ─────────────────────────────────────────────────────────────

let nextId = 1;

const sameValue = (a, b) => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (typeof a === "object" || typeof b === "object") return String(a) === String(b);
  return a === b;
};

const matches = (doc, filter) =>
  Object.entries(filter).every(([field, want]) => {
    const have = doc[field];
    if (want && typeof want === "object" && !(want instanceof Date)) {
      if ("$gt" in want) return have != null && have > want.$gt;
      if ("$lte" in want) return have != null && have <= want.$lte;
    }
    return sameValue(have, want);
  });

function makeFakeModel() {
  const rows = [];
  const model = {
    rows,
    // Enforces the unique index on `handle`, because the mint retry loop is
    // only correct if a duplicate actually fails.
    async create(doc) {
      await null;
      if (rows.some((r) => r.handle === doc.handle)) {
        const err = new Error("E11000 duplicate key error");
        err.code = 11000;
        throw err;
      }
      const row = { _id: `id-${nextId++}`, claimedBy: null, claimExpiresAt: null, ...doc };
      rows.push(row);
      return row;
    },
    // Yields first, like a real round trip, and hands back a SNAPSHOT.
    //
    // The snapshot is the half that took a second attempt to get right. A
    // fake that returns the live row lets a read-then-write implementation
    // see its own later write through the object it read earlier, so the
    // nine losers correctly lose — for a reason that does not exist in
    // Mongoose, which hydrates a fresh document per query. Copying makes
    // this fake as forgetful as the real thing, and a read-then-write claim
    // then produces ten winners here, which is what the race test is for.
    async findOne(filter) {
      await null;
      const row = rows.find((r) => matches(r, filter));
      return row ? { ...row } : null;
    },
    // One synchronous critical section. Mongo's guarantee, and the reason
    // the flow code is written the way it is.
    findOneAndUpdate(filter, update) {
      const row = rows.find((r) => matches(r, filter));
      if (row) Object.assign(row, update.$set);
      const promise = Promise.resolve(row ? { ...row } : null);
      // The real query object exposes .session() for use inside a
      // transaction; consumeQrSession calls it.
      promise.session = () => promise;
      return promise;
    }
  };
  return model;
}

const mint = async (QrSession, over = {}) =>
  (await mintQrSession({
    QrSession,
    payeeId: "payee-1",
    currency: "INR",
    amountCents: 25000,
    ...over
  })).session;

// ── Tests ────────────────────────────────────────────────────────────────

describe("the fake is worth trusting", () => {
  test("findOne yields, so a read-then-write really would race", async () => {
    // If this ever stops being true the race test below becomes decorative,
    // so it is asserted rather than assumed.
    const QrSession = makeFakeModel();
    let resolvedSynchronously = true;
    const p = QrSession.findOne({ handle: 1 }).then(() => {
      resolvedSynchronously = false;
    });
    assert.equal(resolvedSynchronously, true);
    await p;
  });

  test("create enforces the unique handle", async () => {
    const QrSession = makeFakeModel();
    await QrSession.create({ handle: 7 });
    await assert.rejects(() => QrSession.create({ handle: 7 }), (e) => e.code === 11000);
  });
});

describe("the handle space matches the codec exactly", () => {
  test("6^13, in both files", () => {
    // The server cannot require the codec — it is concatenated into the
    // browser bundle and exports nothing — so it restates the number. This
    // is what keeps the copy honest, the same arrangement gloobalQR.js's
    // alphabet already uses.
    const codec = loadDomain(["QR_SESSION_HANDLE_SPACE"]);
    assert.equal(QR_SESSION_HANDLE_SPACE, codec.QR_SESSION_HANDLE_SPACE);
    assert.equal(QR_SESSION_HANDLE_SPACE, Math.pow(6, 13));
  });

  test("every minted handle is one the codec can draw", async () => {
    const { encodeQrSessionCode, decodeQrSessionCode } = loadDomain([
      "encodeQrSessionCode", "decodeQrSessionCode"
    ]);
    const QrSession = makeFakeModel();
    for (let i = 0; i < 200; i++) {
      const session = await mint(QrSession);
      const code = encodeQrSessionCode(session.handle);
      assert.ok(code, `handle ${session.handle} could not be drawn`);
      assert.equal(decodeQrSessionCode(code).value, session.handle);
    }
  });
});

describe("mint", () => {
  test("takes the payee and the currency from the caller, not from a payload", async () => {
    // The hole the old payload had by construction: the Gloobal ID and the
    // amount travelled inside the code, so anybody who knew the alphabet
    // could mint a request for any account. Here they are arguments the
    // route fills from its own auth token.
    const src = readSource("server/lib/qrSessionFlow.js")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/req\./.test(src), "the flow layer is reading a request object");
  });

  test("a fresh session is active, with a server-set expiry", async () => {
    const QrSession = makeFakeModel();
    const now = new Date("2026-09-09T10:00:00Z");
    const session = await mint(QrSession, { now });
    assert.equal(session.status, "active");
    assert.equal(session.payee, "payee-1");
    assert.equal(session.currency, "INR");
    assert.equal(session.amountCents, 25000);
    assert.equal(session.expiresAt.getTime(), now.getTime() + QR_SESSION_TTL_MS);
    assert.equal(session.claimedBy, null);
  });

  test("no amount is null, which is not the same as zero", async () => {
    // An identity code — "this is me" — versus a request for nothing. The
    // old payload packed a missing amount as 0 and the two became one code;
    // the screens show different things for each.
    const QrSession = makeFakeModel();
    const identity = await mint(QrSession, { amountCents: null });
    const zero = await mint(QrSession, { amountCents: 0 });
    assert.equal(identity.amountCents, null);
    assert.equal(zero.amountCents, 0);
  });

  test("a string amount is refused, not coerced", async () => {
    const QrSession = makeFakeModel();
    const out = await mintQrSession({
      QrSession, payeeId: "p", currency: "INR", amountCents: "500"
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "invalid-amount");
  });

  test("a negative amount is refused", async () => {
    const QrSession = makeFakeModel();
    const out = await mintQrSession({
      QrSession, payeeId: "p", currency: "INR", amountCents: -1
    });
    assert.equal(out.ok, false);
  });

  test("the currency is stored upper-cased", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession, { currency: "inr" });
    assert.equal(session.currency, "INR");
  });

  test("a collision is retried, not surfaced", async () => {
    // The unique index is what makes this correct: a duplicate is a rejected
    // write, never two sessions answering to one code.
    const QrSession = makeFakeModel();
    const first = await mint(QrSession);
    let served = 0;
    const original = QrSession.create.bind(QrSession);
    QrSession.create = async (doc) =>
      original(served++ === 0 ? { ...doc, handle: first.handle } : doc);
    const out = await mintQrSession({ QrSession, payeeId: "p2", currency: "USD" });
    assert.equal(out.ok, true);
    assert.notEqual(out.session.handle, first.handle);
  });

  test("minting needs a payee and a currency", async () => {
    const QrSession = makeFakeModel();
    await assert.rejects(() => mintQrSession({ QrSession, currency: "INR" }));
    await assert.rejects(() => mintQrSession({ QrSession, payeeId: "p" }));
  });
});

describe("resolve tells you whether it is live, and nothing else", () => {
  test("a live session answers active, and names nobody", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    const out = await resolveQrSession({ QrSession, handle: session.handle });
    assert.deepEqual(out, { state: "active", requiresVerification: true });
    // The assertion that matters: nothing identifying comes back before
    // verification. "we ask verification before showing merchant details".
    assert.ok(!("payee" in out));
    assert.ok(!("amountCents" in out));
    assert.ok(!("currency" in out));
  });

  test("an unknown handle is invalid", async () => {
    const QrSession = makeFakeModel();
    assert.deepEqual(await resolveQrSession({ QrSession, handle: 12345 }), { state: "invalid" });
  });

  test("a non-integer handle is invalid, not looked up", async () => {
    const QrSession = makeFakeModel();
    for (const bad of ["7", null, undefined, 1.5, NaN, {}]) {
      assert.deepEqual(await resolveQrSession({ QrSession, handle: bad }), { state: "invalid" });
    }
  });

  test("past its clock it is expired", async () => {
    const QrSession = makeFakeModel();
    const now = new Date("2026-09-09T10:00:00Z");
    const session = await mint(QrSession, { now });
    const later = new Date(now.getTime() + QR_SESSION_TTL_MS + 1);
    assert.deepEqual(
      await resolveQrSession({ QrSession, handle: session.handle, now: later }),
      { state: "expired" }
    );
  });

  test("a claimed session reads as claimed even after its clock ran out", async () => {
    // Order of checks, and it is deliberate. "Someone got there first" is
    // the true and useful thing to say; "expired" would send the person to
    // ask for a new code when the shopkeeper's screen already shows one.
    const QrSession = makeFakeModel();
    const now = new Date("2026-09-09T10:00:00Z");
    const session = await mint(QrSession, { now });
    await claimQrSession({ QrSession, handle: session.handle, userId: "u1", now });
    const later = new Date(now.getTime() + QR_SESSION_TTL_MS + 1);
    assert.deepEqual(
      await resolveQrSession({ QrSession, handle: session.handle, now: later }),
      { state: "claimed" }
    );
  });
});

describe("whoever verifies first owns it", () => {
  test("ten simultaneous claims produce exactly one winner", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        claimQrSession({ QrSession, handle: session.handle, userId: `user-${i}` })
      )
    );
    const winners = results.filter((r) => r.ok);
    assert.equal(winners.length, 1, `${winners.length} people won the same code`);
    for (const loser of results.filter((r) => !r.ok)) {
      assert.equal(loser.state, "claimed");
    }
  });

  test("the winner is recorded on the session", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        claimQrSession({ QrSession, handle: session.handle, userId: `user-${i}` })
      )
    );
    const winner = results.find((r) => r.ok);
    const stored = await QrSession.findOne({ handle: session.handle });
    assert.equal(stored.status, "claimed");
    assert.equal(stored.claimedBy, winner.session.claimedBy);
  });

  test("the claim is one conditional update, not a read then a write", async () => {
    // The fake's findOne yields and its findOneAndUpdate does not, so this
    // is a behavioural test rather than a source-shape one. It is stated
    // separately from the race test above because it is the REASON that test
    // passes, and a future refactor should fail on the reason.
    const src = readSource("server/lib/qrSessionFlow.js");
    const claim = src.slice(src.indexOf("async function claimQrSession"));
    const body = claim.slice(0, claim.indexOf("\n}\n"));
    const firstWrite = body.indexOf("findOneAndUpdate");
    const firstRead = body.indexOf("findOne(");
    assert.ok(firstWrite !== -1, "the claim no longer uses a conditional update");
    assert.ok(
      firstRead === -1 || firstWrite < firstRead,
      "the claim reads the session before it writes, which loses the race"
    );
    // And the condition is in the FILTER, which is the whole point.
    assert.match(body, /\{ handle, status: 'active', expiresAt: \{ \$gt: now \} \}/);
  });

  test("a second claim by a different account is refused", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    assert.equal((await claimQrSession({ QrSession, handle: session.handle, userId: "u1" })).ok, true);
    const second = await claimQrSession({ QrSession, handle: session.handle, userId: "u2" });
    assert.equal(second.ok, false);
    assert.equal(second.state, "claimed");
  });

  test("the winner retrying gets the same session back, and writes nothing", async () => {
    // The claim succeeds, the reply is lost, the phone retries. Telling the
    // person who legitimately won that somebody beat them to it would be a
    // lie produced by our own network.
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    const first = await claimQrSession({ QrSession, handle: session.handle, userId: "u1" });
    const stored = await QrSession.findOne({ handle: session.handle });
    const claimedAt = stored.claimedAt;

    const retry = await claimQrSession({ QrSession, handle: session.handle, userId: "u1" });
    assert.equal(retry.ok, true);
    assert.equal(retry.replayed, true);
    assert.equal(String(retry.session._id), String(first.session._id));
    assert.equal(
      (await QrSession.findOne({ handle: session.handle })).claimedAt.getTime(),
      claimedAt.getTime(),
      "the retry rewrote the claim"
    );
  });

  test("the winner retrying after their window has closed is refused", async () => {
    const QrSession = makeFakeModel();
    const now = new Date("2026-09-09T10:00:00Z");
    const session = await mint(QrSession, { now });
    await claimQrSession({ QrSession, handle: session.handle, userId: "u1", now });
    const late = new Date(now.getTime() + QR_CLAIM_TTL_MS + 1);
    const retry = await claimQrSession({ QrSession, handle: session.handle, userId: "u1", now: late });
    assert.equal(retry.ok, false);
    assert.equal(retry.state, "claimed");
  });

  test("an expired session cannot be claimed", async () => {
    const QrSession = makeFakeModel();
    const now = new Date("2026-09-09T10:00:00Z");
    const session = await mint(QrSession, { now });
    const late = new Date(now.getTime() + QR_SESSION_TTL_MS + 1);
    const out = await claimQrSession({ QrSession, handle: session.handle, userId: "u1", now: late });
    assert.equal(out.ok, false);
    assert.equal(out.state, "expired");
  });

  test("an unknown handle cannot be claimed", async () => {
    const QrSession = makeFakeModel();
    const out = await claimQrSession({ QrSession, handle: 999, userId: "u1" });
    assert.equal(out.ok, false);
    assert.equal(out.state, "invalid");
  });

  test("claiming needs a user, and will not default one", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    await assert.rejects(() => claimQrSession({ QrSession, handle: session.handle }));
  });
});

describe("consume burns the session with the payment, or not at all", () => {
  const claimed = async (QrSession, userId = "u1", now = new Date()) => {
    const session = await mint(QrSession, { now });
    const out = await claimQrSession({ QrSession, handle: session.handle, userId, now });
    return out.session;
  };

  test("a claimed session is consumed by its claimant", async () => {
    const QrSession = makeFakeModel();
    const session = await claimed(QrSession);
    const out = await consumeQrSession({
      QrSession, sessionId: session._id, userId: "u1", transactionId: "txn-1"
    });
    assert.equal(out.ok, true);
    assert.equal(out.session.status, "consumed");
    assert.equal(out.session.transactionId, "txn-1");
  });

  test("somebody else's claim cannot be spent", async () => {
    // A session id in the wrong request must not be able to burn a code
    // somebody else is holding.
    const QrSession = makeFakeModel();
    const session = await claimed(QrSession, "u1");
    const out = await consumeQrSession({ QrSession, sessionId: session._id, userId: "u2" });
    assert.equal(out.ok, false);
  });

  test("consuming twice does not happen", async () => {
    const QrSession = makeFakeModel();
    const session = await claimed(QrSession);
    await consumeQrSession({ QrSession, sessionId: session._id, userId: "u1" });
    const again = await consumeQrSession({ QrSession, sessionId: session._id, userId: "u1" });
    assert.equal(again.ok, false);
  });

  test("an unclaimed session cannot be consumed", async () => {
    const QrSession = makeFakeModel();
    const session = await mint(QrSession);
    const out = await consumeQrSession({ QrSession, sessionId: session._id, userId: "u1" });
    assert.equal(out.ok, false);
  });

  test("a stale claim cannot be consumed", async () => {
    const QrSession = makeFakeModel();
    const now = new Date("2026-09-09T10:00:00Z");
    const session = await claimed(QrSession, "u1", now);
    const late = new Date(now.getTime() + QR_CLAIM_TTL_MS + 1);
    const out = await consumeQrSession({
      QrSession, sessionId: session._id, userId: "u1", now: late
    });
    assert.equal(out.ok, false);
    assert.equal(out.state, "claim-expired");
  });

  test("it runs inside the caller's transaction when given one", async () => {
    // The burn and the payment have to be one event. A consume that
    // committed on its own could burn a code for a payment that then rolled
    // back — and the person would be told to scan a new code for money that
    // never moved.
    const QrSession = makeFakeModel();
    const session = await claimed(QrSession);
    let sawSession = null;
    const original = QrSession.findOneAndUpdate.bind(QrSession);
    QrSession.findOneAndUpdate = (filter, update) => {
      const p = original(filter, update);
      p.session = (s) => { sawSession = s; return p; };
      return p;
    };
    await consumeQrSession({
      QrSession, sessionId: session._id, userId: "u1", dbSession: "mongo-session"
    });
    assert.equal(sawSession, "mongo-session");
  });
});

describe("the flow layer does not verify anybody", () => {
  test("no credential check lives here", () => {
    // Verification is a bcrypt compare against the Pin record through the
    // lockout path, or a passkey assertion, or a face descriptor — all in
    // server.js, all BEFORE claimQrSession is called. This asserts the
    // separation is real, so that "verified" can never come to mean "the
    // caller said so".
    const src = readSource("server/lib/qrSessionFlow.js")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/bcrypt|pinHash|verified\s*[:=]/.test(src));
  });

  test("and the reason is written down", () => {
    const src = readSource("server/lib/qrSessionFlow.js");
    assert.match(src, /The route does that FIRST and only then calls claimQrSession/);
  });
});
