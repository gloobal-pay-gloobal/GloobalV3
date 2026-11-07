// The face check on payments of ₹1 lakh equivalent and above
// (lib/paymentFace.js), with in-memory stand-ins.
//
//   node --test tests/payment-face.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const require = createRequire(import.meta.url);
process.env.FACE_ENCRYPTION_KEY = randomBytes(32).toString("hex");
const faceCrypto = require("../lib/faceCrypto");
const { createPaymentFace } = require("../lib/paymentFace");

const MODEL = "human-faceres@3.3";
const person = (seed) => {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: 1024 }, () => rnd() * 2);
};
const again = (d) => d.map((v, i) => v + Math.sin(i * 7.1) * 0.2);
const RATES = { USD: 83, JPY: 0.55, INR: 1 };

function rig({ enrolled = person(1), rateFails = false } = {}) {
  let clock = Date.parse("2026-11-07T07:00:00Z");
  const env = enrolled ? faceCrypto.encryptDescriptor(enrolled) : null;
  const template = env ? {
    userId: "u1", model: MODEL, dimensions: env.dimensions, ciphertext: env.ciphertext, iv: env.iv, authTag: env.authTag,
    failedAttempts: 0, lockedUntil: null, async save() {}
  } : null;
  const pf = createPaymentFace({
    secret: "test-secret-0123456789-abcdefghijklmnop",
    getRate: async (from) => { if (rateFails) throw new Error("down"); return { rate: RATES[from] }; },
    FaceTemplate: { findOne: async () => template },
    faceCrypto,
    now: () => clock,
  });
  const approve = async (body) => {
    let status = 200, json;
    const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; } };
    await pf.approve({ authUser: { _id: "u1" }, body }, res);
    return { status, body: json };
  };
  return { pf, template, approve, tick: (ms) => { clock += ms; } };
}
const user = { _id: "u1" };
const bind = "send|B|source|100000";

test("the line is ₹1 lakh EQUIVALENT: rupees, dollars and yen are converted first", async () => {
  const { pf } = rig();
  assert.equal(await pf.gate({ user, amount: 99999, currency: "INR", bind }), null);
  assert.equal((await pf.gate({ user, amount: 100000, currency: "INR", bind })).body.code, "face_required");
  assert.equal(await pf.gate({ user, amount: 1200, currency: "USD", bind }), null, "$1,200 ≈ ₹99,600");
  assert.equal((await pf.gate({ user, amount: 1210, currency: "USD", bind })).body.code, "face_required");
  assert.equal(await pf.gate({ user, amount: 100000, currency: "JPY", bind }), null, "¥1 lakh ≈ ₹55,000 is under the line");
});

test("an exchange rate that can't be read counts as large", async () => {
  const { pf } = rig({ rateFails: true });
  assert.equal((await pf.gate({ user, amount: 10, currency: "USD", bind })).body.code, "face_required");
});

test("the right face gets a two-minute approval for exactly this payment", async () => {
  const { pf, approve, tick } = rig();
  const ok = await approve({ bind, descriptor: again(person(1)), model: MODEL, method: "turns" });
  assert.equal(ok.status, 200);
  const token = ok.body.approval;
  assert.equal(await pf.gate({ user, amount: 100000, currency: "INR", bind, approval: token }), null);
  assert.equal((await pf.gate({ user, amount: 100000, currency: "INR", bind: "send|B|source|200000", approval: token })).status, 403, "another amount");
  assert.equal((await pf.gate({ user, amount: 100000, currency: "INR", bind: "send|C|source|100000", approval: token })).status, 403, "another payee");
  assert.equal((await pf.gate({ user: { _id: "u2" }, amount: 100000, currency: "INR", bind, approval: token })).status, 403, "another account");
  assert.equal((await pf.gate({ user, amount: 100000, currency: "INR", bind, approval: token.slice(0, -2) + "xx" })).status, 403, "tampered");
  tick(121000);
  const late = await pf.gate({ user, amount: 100000, currency: "INR", bind, approval: token });
  assert.equal(late.body.code, "face_expired");
});

test("a different face: two more tries, then large payments pause for 10 minutes", async () => {
  const { approve, tick, template } = rig();
  const stranger = { bind, descriptor: person(9), model: MODEL };
  const a = await approve(stranger);
  assert.equal(a.status, 401);
  assert.equal(a.body.attemptsRemaining, 2);
  assert.equal((await approve(stranger)).body.attemptsRemaining, 1);
  const c = await approve(stranger);
  assert.equal(c.status, 423);
  assert.equal(c.body.code, "face_locked");
  assert.equal((await approve({ bind, descriptor: again(person(1)), model: MODEL })).status, 423, "even the owner waits");
  tick(10 * 60 * 1000 + 1000);
  assert.equal((await approve({ bind, descriptor: again(person(1)), model: MODEL })).status, 200);
  assert.equal(template.failedAttempts, 0);
});

test("no live face yet: take the live photo first; no key: blocked, not waved through", async () => {
  const none = rig({ enrolled: null });
  const r = await none.approve({ bind, descriptor: person(1), model: MODEL });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "face_enroll_required");
  const key = process.env.FACE_ENCRYPTION_KEY;
  delete process.env.FACE_ENCRYPTION_KEY;
  try {
    const k = await rig({ enrolled: null }).approve({ bind, descriptor: person(1), model: MODEL });
    assert.equal(k.status, 503);
    assert.equal(k.body.code, "face_unavailable");
  } finally {
    process.env.FACE_ENCRYPTION_KEY = key;
  }
});

test("server.js gates app payments and bank payouts after the PIN", () => {
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const send = src.slice(src.indexOf("app.post('/api/transactions/send'"));
  const pinAt = send.indexOf("registerPinSuccess(pinRecord)");
  const gateAt = send.indexOf("paymentFace.authorize({");
  assert.ok(pinAt > 0 && gateAt > pinAt, "decided after the PIN");
  assert.match(send.slice(gateAt, gateAt + 400), /bind: `send\|\$\{receiver\.symbolId\}\|\$\{basis\}\|\$\{typedAmount\}`/);
  assert.match(src, /faceGate: \(args\) => paymentFace\.gate\(args\)/);
  const bank = fs.readFileSync(new URL("../lib/bankTransfers.js", import.meta.url), "utf8");
  assert.match(bank, /await faceGate\(\{ user, amount, currency, bind: `bank\|\$\{String\(account\._id\)\}\|\$\{amount\}`/);
});

// ── Paying without a PIN (0253): the account's own choice ─────────────────
const B2 = "send|B|destination|5000";
const withChoice = (paymentCheck) => ({ _id: "u1", securitySettings: { paymentCheck } });
const spent = (n) => async () => n;

test("an account on the PIN still needs it: no PIN, no payment", async () => {
  const { pf } = rig();
  const r = await pf.authorize({ user: withChoice("pin"), pinVerified: false, amount: 500, currency: "INR", bind: B2, faceSpentToday: spent(0) });
  assert.equal(r.refusal.status, 400);
  assert.equal(r.refusal.body.code, "pin_required");
  const ok = await pf.authorize({ user: withChoice("pin"), pinVerified: true, amount: 500, currency: "INR", bind: B2, faceSpentToday: spent(0) });
  assert.equal(ok.method, "pin");
});

test("fingerprint / Face ID: asked for, then accepted only for this payment", async () => {
  const { pf } = rig();
  const u = withChoice("device");
  const ask = await pf.authorize({ user: u, pinVerified: false, amount: 90000, currency: "INR", bind: B2, faceSpentToday: spent(0) });
  assert.equal(ask.refusal.body.code, "check_required");
  assert.equal(ask.refusal.body.method, "device");
  assert.equal(ask.refusal.body.bind, B2);
  const token = pf.sign("u1", `device|${B2}`);
  const ok = await pf.authorize({ user: u, pinVerified: false, amount: 90000, currency: "INR", bind: B2, paymentApproval: token, faceSpentToday: spent(0) });
  assert.equal(ok.method, "device");
  assert.equal(ok.inr, 90000);
  const other = await pf.authorize({ user: u, pinVerified: false, amount: 90000, currency: "INR", bind: "send|C|destination|5000", paymentApproval: token, faceSpentToday: spent(0) });
  assert.equal(other.refusal.body.code, "check_required", "another payee");
  const faceTokenAsDevice = await pf.authorize({ user: u, pinVerified: false, amount: 900, currency: "INR", bind: B2, paymentApproval: pf.sign("u1", B2), faceSpentToday: spent(0) });
  assert.ok(faceTokenAsDevice.refusal, "a face approval is not a fingerprint");
});

test("GLOOBAL face instead of PIN: up to ₹10,000 each and ₹25,000 a day", async () => {
  const { pf } = rig();
  const u = withChoice("face");
  const token = pf.sign("u1", B2);
  assert.equal((await pf.authorize({ user: u, pinVerified: false, amount: 10000, currency: "INR", bind: B2, paymentApproval: token, faceSpentToday: spent(0) })).method, "face");
  const over = await pf.authorize({ user: u, pinVerified: false, amount: 10001, currency: "INR", bind: B2, paymentApproval: token, faceSpentToday: spent(0) });
  assert.equal(over.refusal.body.code, "pin_required");
  assert.match(over.refusal.body.message, /up to ₹10,000/);
  const day = await pf.authorize({ user: u, pinVerified: false, amount: 6000, currency: "INR", bind: B2, paymentApproval: token, faceSpentToday: spent(20000) });
  assert.equal(day.refusal.body.code, "pin_required");
  assert.match(day.refusal.body.message, /₹20,000 .* the limit is ₹25,000/);
  assert.equal((await pf.authorize({ user: u, pinVerified: false, amount: 120, currency: "USD", bind: B2, paymentApproval: token, faceSpentToday: spent(0) })).method, "face", "$120 ≈ ₹9,960");
  assert.equal((await pf.authorize({ user: u, pinVerified: false, amount: 121, currency: "USD", bind: B2, paymentApproval: token, faceSpentToday: spent(0) })).refusal.body.code, "pin_required", "$121 ≈ ₹10,043");
});

test("₹1 lakh and above: PIN and face, whatever the account chose", async () => {
  const { pf } = rig();
  for (const c of ["device", "face"]) {
    const r = await pf.authorize({ user: withChoice(c), pinVerified: false, amount: 100000, currency: "INR", bind: B2, paymentApproval: pf.sign("u1", `device|${B2}`), faceSpentToday: spent(0) });
    assert.equal(r.refusal.body.code, "pin_required", c);
  }
  const needsFace = await pf.authorize({ user: withChoice("device"), pinVerified: true, amount: 100000, currency: "INR", bind: B2, faceSpentToday: spent(0) });
  assert.equal(needsFace.refusal.body.code, "face_required");
});

test("server.js: the setting is validated, recorded on each payment, and the device check requires the sensor", () => {
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /if \(!\['pin', 'device', 'face'\]\.includes\(choice\)\)/);
  assert.match(src, /code: 'passkey_required'/);
  assert.match(src, /code: 'face_setup_required'/);
  assert.match(src, /authMethod: paymentAuth\.method,/);
  assert.match(src, /userVerification: 'required'/);
  assert.match(src, /requireUserVerification: true/);
  assert.match(src, /authMethod: 'face', status: 'success', createdAt: \{ \$gte: since \}/);
});
