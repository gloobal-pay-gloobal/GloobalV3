// tests/care-layer.test.mjs
//
//   node --test tests/care-layer.test.mjs
//
// People looked after by a helper (server/lib/care.js) and the check layer
// for their document (server/lib/identityChecks.js), run for real on
// in-memory collections. The founder's rules (24 Nov 2026):
//   • anyone can be a helper; the relationship is what the helper says, the
//     person's OWN document is what is checked;
//   • one person, one GLOOBAL ID — not twice by helpers, not beside their
//     own GLOOBAL Bank;
//   • Essentials only after the AUTOMATIC check; nothing approves itself;
//   • the helper opens the account with their own PIN; helpers can do
//     everything there, and it is all written down.
import test from "node:test";
import assert from "node:assert/strict";
import { modelClass, stub, require, mongoose, same } from "./mem-models.mjs";

process.env.AUTH_TOKEN_SECRET = "t".repeat(48);
delete process.env.CARE_TEST_CHECKS;

const User = stub("./models/User", modelClass({ care: { managed: false } }));
const CareLink = stub("./models/CareLink", modelClass({ status: "active", relationshipNote: "", endedAt: null, endedReason: null }));
CareLink.RELATIONSHIPS = ["parent", "sibling", "grandparent", "grandchild", "child", "spouse", "relative", "friend", "caretaker", "other"];
const CareDocument = stub("./models/CareDocument", modelClass({ status: "waiting", reason: "", attempts: 0, lastTriedAt: null, consent: null, relationshipConfirmed: false }));
const CareAction = stub("./models/CareAction", modelClass());
const BankAccount = stub("./models/BankAccount", modelClass());
const Pin = modelClass({ failedAttempts: 0, lockedUntil: null });

const checks = require("./lib/identityChecks");
const { createCare, refusedWhileHelping, ageOn } = require("./lib/care");

const bankOpen = new Set();
const pinOf = new Map();
let ids = 0;
const care = createCare({
  User, CareLink, CareDocument, CareAction, BankAccount,
  requireAuth: () => {}, writeLimit: () => {}, lookupLimit: () => {}, credentialLimit: () => {},
  withAtomicSession: (work) => work({}),
  mintSymbolId: () => `ID${String(++ids).padStart(10, "0")}`,
  issueActingToken: (dep, helper) => `acting:${dep._id}:${helper._id}`,
  isBankOpen: async (userId) => bankOpen.has(String(userId)) || (await care.isVerified(userId)),
  accountCountryIso: (u) => u.countryIso || "IN",
  pin: {
    Pin,
    beginPinAttempt: async () => {},
    pinLockRemainingMs: (p) => (p.lockedUntil && p.lockedUntil > Date.now() ? 1 : 0),
    pinLockoutResponse: () => ({ status: 423, message: "Locked", retryAfterSeconds: 60 }),
    registerPinFailure: async (p) => { p.failedAttempts += 1; return { message: "Wrong PIN", attemptsRemaining: 5 - p.failedAttempts }; },
    registerPinSuccess: async (p) => { p.failedAttempts = 0; },
  },
  bcrypt: { compare: async (typed, hash) => hash === `hash:${typed}` },
});

const person = async (name, { bank = true, pin = "123456", ...extra } = {}) => {
  const u = new User({ fullName: name, symbolId: `S${name}`, countryIso: "IN", ...extra });
  await u.save();
  if (bank) bankOpen.add(String(u._id));
  await Pin.create({ userId: u._id, pinHash: `hash:${pin}` });
  return u;
};
const yearsAgo = (n, days = 0) => new Date(Date.now() - (n * 365.25 + days) * 86400000).toISOString().slice(0, 10);
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code; } };

// ── The check layer ─────────────────────────────────────────────────────

test("documents: each number in its own shape, hashed as GLOOBAL Bank hashes it, sealed and never shown", () => {
  assert.equal(checks.readNumber("IN", "voter_id", "abc 1234567"), "ABC1234567");
  assert.equal(checks.readNumber("IN", "voter_id", "AB1234567"), null);
  assert.equal(checks.readNumber("IN", "birth_certificate", "B-2019/00123"), "B2019/00123");
  assert.equal(checks.readNumber("AE", "voter_id", "ABC1234567"), null, "a document the country does not take");
  const bank = require("./lib/bank");
  assert.equal(checks.hashOf("IN", "aadhaar", "234567890124"), bank.idHash("aadhaar", "234567890124"));
  assert.equal(checks.hashOf("IN", "passport", "Z1234567"), bank.idHash("passport", "IN:Z1234567"));
  const sealed = checks.seal("ABC1234567");
  assert.ok(!JSON.stringify(sealed).includes("ABC1234567"));
  assert.equal(checks.open(sealed), "ABC1234567");
  assert.equal(checks.shownOf("ABC1234567"), "••4567");
});

test("a document with no check connected waits — it is never approved by default", async () => {
  const [doc] = await CareDocument.create({ userId: new mongoose.Types.ObjectId(), country: "IN", kind: "voter_id", sealed: checks.seal("ABC1234567"), nameGiven: "A", birthDate: new Date("1950-01-01") });
  const r = await checks.runChecks({ CareDocument });
  assert.equal(r.checked, 0);
  assert.deepEqual([doc.status, doc.reason], ["waiting", "not_connected"]);
  assert.equal(checks.testChecksOn(), false);
  CareDocument.rows.length = 0;
});

test("the test check cannot be switched on where real money is", () => {
  const was = { ...process.env };
  try {
    process.env.CARE_TEST_CHECKS = "on";
    process.env.RENDER = "true";
    assert.equal(checks.testChecksOn(), false);
    delete process.env.RENDER; process.env.NODE_ENV = "production";
    assert.equal(checks.testChecksOn(), false);
    process.env.NODE_ENV = "development";
    assert.equal(checks.testChecksOn(), true);
  } finally {
    for (const k of ["CARE_TEST_CHECKS", "RENDER", "NODE_ENV"]) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; }
  }
});

// ── Adding a person ─────────────────────────────────────────────────────

test("a big sister adds her brother: his own GLOOBAL ID, his own account, waiting for the check", async () => {
  const meera = await person("Meera");
  const p = await care.addPerson(meera, { name: "Arjun  Sharma", birthDate: yearsAgo(9), relationship: "sibling", document: { kind: "birth_certificate", number: "B-2017/4471" } });
  assert.equal(p.name, "Arjun Sharma");
  assert.equal(p.age, 9);
  assert.equal(p.relationship, "sibling");
  assert.equal(p.role, "first");
  assert.equal(p.document.status, "waiting");
  assert.equal(p.document.shown, "••4471");
  assert.equal(p.essentialsReady, false, "Essentials wait for the check");
  const arjun = User.rows.find((u) => u.fullName === "Arjun Sharma");
  assert.ok(arjun.care.managed && arjun.symbolId && arjun.mobileNumber === undefined, "an account of his own, no phone");
  assert.equal(await care.isVerified(arjun._id), false);
  const stored = CareDocument.rows.find((d) => same(d.userId, arjun._id));
  assert.ok(!JSON.stringify(stored).includes("4471/") && !JSON.stringify(stored).includes("B2017/4471"), "the number is never stored in the clear");
});

test("one person, one GLOOBAL ID: not twice by two helpers, and not beside their own GLOOBAL Bank", async () => {
  const ravi = await person("Ravi");
  assert.equal(await code(care.addPerson(ravi, { name: "Arjun Sharma", birthDate: yearsAgo(9), relationship: "parent", document: { kind: "birth_certificate", number: "B2017/4471" } })), "already_looked_after");
  // Someone who opened their own GLOOBAL Bank with this Aadhaar.
  await BankAccount.create({ userId: new mongoose.Types.ObjectId(), status: "open", identity: { docs: [], aadhaarHash: checks.hashOf("IN", "aadhaar", "234567890124") } });
  assert.equal(await code(care.addPerson(ravi, { name: "Old Man", birthDate: yearsAgo(80), relationship: "grandparent", consent: "said_yes", document: { kind: "aadhaar", number: "2345 6789 0124" } })), "has_own_account");
});

test("what is checked before anything is saved", async () => {
  const asha = await person("Asha");
  const add = (b) => code(care.addPerson(asha, { name: "Dev", birthDate: yearsAgo(70), relationship: "parent", consent: "said_yes", document: { kind: "voter_id", number: "XYZ7654321" }, ...b }));
  assert.equal(await add({ name: "D" }), "name");
  assert.equal(await add({ birthDate: "2999-01-01" }), "birth_date");
  assert.equal(await add({ relationship: "boss" }), "relationship");
  assert.equal(await add({ relationship: "other" }), "relationship", "'other' needs a few words");
  assert.equal(await add({ document: { kind: "voter_id", number: "123" } }), "document_number");
  assert.equal(await add({ consent: undefined }), "consent", "an adult has to agree");
  assert.equal(await add({ consent: "guardianship" }), "guardianship", "or a guardianship order is given");
  assert.equal(await add({ birthDate: yearsAgo(10), consent: undefined }), "document", "a child has no voter ID");
  const noBank = await person("NoBank", { bank: false });
  assert.equal(await code(care.addPerson(noBank, { name: "Kid", birthDate: yearsAgo(5), relationship: "parent", document: { kind: "birth_certificate", number: "KID55555" } })), "bank_closed");
  const shop = await person("Shop", { shopOwnerId: asha._id });
  assert.equal(await code(care.addPerson(shop, { name: "Kid", birthDate: yearsAgo(5), relationship: "parent", document: { kind: "birth_certificate", number: "KID55556" } })), "shop");
  // An adult who cannot say yes, with a guardianship order: two documents.
  const p = await care.addPerson(asha, { name: "Dev Kumar", birthDate: yearsAgo(70), relationship: "parent", consent: "guardianship", guardianship: { number: "LLC/2024/77" }, document: { kind: "udid", number: "MH0123456789012345" } });
  assert.equal(p.consent, "guardianship");
  assert.equal(p.guardianship.status, "waiting");
});

// ── The check, and Essentials ───────────────────────────────────────────

test("Essentials start only when the automatic check passes — both documents, when there is a guardianship order", async () => {
  const meera = User.rows.find((u) => u.fullName === "Meera");
  const arjun = User.rows.find((u) => u.fullName === "Arjun Sharma");
  checks.registerChecker("IN", "birth_certificate", "civil-registration", async ({ number }) => (number === "B2017/4471" ? { ok: true, parents: ["Sunita Sharma"] } : { ok: false, reason: "did_not_match" }));
  await checks.runChecks({ CareDocument });
  assert.equal(await care.isVerified(arjun._id), true);
  const listed = (await care.peopleOf(meera._id)).people.find((p) => p.name === "Arjun Sharma");
  assert.deepEqual([listed.document.status, listed.document.statusText, listed.essentialsReady], ["verified", "Checked", true]);

  const dev = User.rows.find((u) => u.fullName === "Dev Kumar");
  checks.registerChecker("IN", "udid", "udid", async () => ({ ok: true }));
  await checks.runChecks({ CareDocument });
  assert.equal(await care.isVerified(dev._id), false, "the guardianship order is not checked yet");
  checks.registerChecker("IN", "guardianship_order", "orders", async () => ({ ok: true }));
  CareDocument.rows.forEach((d) => { d.lastTriedAt = null; });
  await checks.runChecks({ CareDocument });
  assert.equal(await care.isVerified(dev._id), true);
});

test("a check that fails says so; a service that is down is tried again later", async () => {
  const kiran = await person("Kiran");
  await care.addPerson(kiran, { name: "Tara", birthDate: yearsAgo(4), relationship: "relative", document: { kind: "birth_certificate", number: "WRONG001" } });
  await checks.runChecks({ CareDocument });
  const doc = CareDocument.rows.find((d) => d.nameGiven === "Tara");
  assert.deepEqual([doc.status, checks.statusText(doc)], ["rejected", "Did not match the record"]);

  await care.addPerson(kiran, { name: "Om", birthDate: yearsAgo(80), relationship: "grandparent", consent: "said_yes", document: { kind: "pan", number: "ABCPK1234L" } });
  checks.registerChecker("IN", "pan", "pan", async () => { throw new Error("down"); });
  await checks.runChecks({ CareDocument });
  const om = CareDocument.rows.find((d) => d.nameGiven === "Om");
  assert.deepEqual([om.status, om.reason], ["waiting", "check_unavailable"]);
  const again = await checks.runChecks({ CareDocument });
  assert.equal(again.tried, 0, "not again within the hour");
});

test("a birth certificate that names the helper as a parent confirms what they said", async () => {
  const sunita = await person("Sunita Sharma");
  checks.registerChecker("IN", "birth_certificate", "civil-registration", async () => ({ ok: true, parents: ["sunita  sharma", "Rakesh Sharma"] }));
  await care.addPerson(sunita, { name: "Riya Sharma", birthDate: yearsAgo(6), relationship: "parent", document: { kind: "birth_certificate", number: "RIYA2019" } });
  await care.runChecksNow();
  const p = (await care.peopleOf(sunita._id)).people[0];
  assert.equal(p.relationshipConfirmed, true);
});

// ── Helpers ─────────────────────────────────────────────────────────────

test("a second helper: invited by ID, accepts, sees everything; never more than two", async () => {
  const meera = User.rows.find((u) => u.fullName === "Meera");
  const arjun = User.rows.find((u) => u.fullName === "Arjun Sharma");
  const uncle = await person("Uncle");
  await care.invite(meera, arjun._id, { symbolId: "SUncle", relationship: "relative" });
  const inv = (await care.peopleOf(uncle._id)).invitations;
  assert.equal(inv.length, 1);
  await care.answer(uncle, inv[0].linkId, true);
  const seen = (await care.peopleOf(uncle._id)).people[0];
  assert.deepEqual([seen.name, seen.role, seen.helpers.length], ["Arjun Sharma", "second", 2]);
  const third = await person("Third");
  assert.equal(await code(care.invite(meera, arjun._id, { symbolId: "SThird", relationship: "friend" })), "helpers_full");
  assert.equal(await code(care.invite(third, arjun._id, { symbolId: "SThird", relationship: "friend" })), "not_helper");
  // Only the first helper removes the second; the second can only step back.
  const uncleLink = CareLink.rows.find((l) => same(l.helper, uncle._id));
  assert.equal(await code(care.removeSecond(uncle, arjun._id, String(uncleLink._id))), "not_first");
  await care.removeSecond(meera, arjun._id, String(uncleLink._id));
  assert.equal((await care.peopleOf(uncle._id)).people.length, 0);
});

test("a helper steps back and nobody is left: the next helper takes over the same account, history and all", async () => {
  const kiran = User.rows.find((u) => u.fullName === "Kiran");
  const om = User.rows.find((u) => u.fullName === "Om");
  await care.leave(kiran, om._id);
  const neighbour = await person("Neighbour");
  const p = await care.addPerson(neighbour, { name: "Om", birthDate: yearsAgo(80), relationship: "friend", consent: "said_yes", document: { kind: "pan", number: "ABCPK1234L" } });
  assert.equal(p.id, String(om._id), "the same account, not a second one");
});

// ── The helper's session ────────────────────────────────────────────────

test("opening their account takes the helper's own PIN, and only a helper's", async () => {
  const meera = User.rows.find((u) => u.fullName === "Meera");
  const arjun = User.rows.find((u) => u.fullName === "Arjun Sharma");
  assert.equal(await code(care.openFor(meera, arjun._id, "000000")), "pin_wrong");
  const opened = await care.openFor(meera, arjun._id, "123456");
  assert.equal(opened.token, `acting:${arjun._id}:${meera._id}`);
  assert.equal(opened.person.name, "Arjun Sharma");
  const stranger = await person("Stranger");
  assert.equal(await code(care.openFor(stranger, arjun._id, "123456")), "not_helper");
});

test("in a helper's session: who the account IS stays the person's own; everything else is open, and written down", async () => {
  for (const p of ["/api/pin/set", "/api/pin/reset", "/api/passkey/register/options", "/api/face/enroll", "/api/bank/open", "/api/profile/change-symbol-id", "/api/profile/S1/live-photo", "/api/care/people", "/api/admin/x"]) {
    assert.equal(refusedWhileHelping("POST", p), true, p);
  }
  for (const p of ["/api/transactions/send", "/api/essentials/draw", "/api/paylater/use", "/api/bank-transfers/out", "/api/pin/verify"]) {
    assert.equal(refusedWhileHelping("POST", p), false, p);
  }
  assert.equal(refusedWhileHelping("GET", "/api/care/acting"), false);

  const meera = User.rows.find((u) => u.fullName === "Meera");
  const arjun = User.rows.find((u) => u.fullName === "Arjun Sharma");
  care.recordAction({ dependentId: arjun._id, helperId: meera._id, method: "POST", path: "/api/transactions/send", status: 201, body: { sourceAmount: 120, receiverSymbolId: "SHOP1", pin: "123456" } });
  await new Promise((r) => setTimeout(r, 5));
  const log = await care.actionsOf(meera, arjun._id);
  assert.deepEqual([log[0].what, log[0].by, log[0].amount, log[0].to, log[0].ok], ["Paid", "Meera", 120, "SHOP1", true]);
  assert.ok(!JSON.stringify(CareAction.rows).includes("123456"), "never a PIN in the log");
});

test("ages are whole years, counted on the birthday", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  assert.equal(ageOn(new Date("2008-11-24T00:00:00Z"), now), 18);
  assert.equal(ageOn(new Date("2008-11-25T00:00:00Z"), now), 17);
});

// ── Wired into the server ───────────────────────────────────────────────

test("server.js: the helper's session is checked on every request, PIN checks go to the helper, and a looked-after account never signs in alone", async () => {
  const fs = await import("node:fs");
  const s = fs.readFileSync(new URL("../server/server.js", import.meta.url), "utf8");
  assert.match(s, /if \(claims\.act\) \{[\s\S]{0,700}CareLink\.exists\(\{ helper: claims\.act, dependent: user\._id, status: 'active' \}\)/);
  assert.match(s, /\} else if \(user\.care && user\.care\.managed\) \{\s*\/\/[^\n]*\n\s*return null;/);
  assert.match(s, /careLib\.refusedWhileHelping\(req\.method, path\)/);
  assert.match(s, /return runActing\(\{ dependentId: user\._id, helperId: req\.actingHelperId \}, \(\) => next\(\)\);/);
  assert.match(s, /alsoOpen: \(userId\) => \(care \? care\.isVerified\(userId\) : false\)/);
  const pin = fs.readFileSync(new URL("../server/models/Pin.js", import.meta.url), "utf8");
  assert.match(pin, /pinSchema\.pre\(op, helperInstead\)/);
  const ess = fs.readFileSync(new URL("../server/lib/essentials.js", import.meta.url), "utf8");
  assert.match(ess, /code: 'waiting_for_check'/);
  assert.doesNotMatch(ess, /forChild/, "update 20's children-under-the-parent is gone");
});

test("the PIN asked for in a helper's session is the helper's", async () => {
  const RealPin = require("./models/Pin");
  const { runActing } = require("./lib/actingContext");
  const dep = new mongoose.Types.ObjectId();
  const hel = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const filterIn = async (userId) => {
    const q = RealPin.findOne({ userId });
    await RealPin.schema.s.hooks.execPre("findOne", q, []);
    return String(q.getFilter().userId);
  };
  assert.equal(await filterIn(dep), String(dep), "outside a helper's session, nothing changes");
  await runActing({ dependentId: dep, helperId: hel }, async () => {
    assert.equal(await filterIn(dep), String(hel));
    assert.equal(await filterIn(other), String(other), "only the account being helped");
  });
});
