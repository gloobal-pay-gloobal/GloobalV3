// Hooman Projects: applying for GLOOBAL funding (lib/projectReview.js), with
// in-memory stand-ins for the database.
//
//   node --test tests/project-review.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { createProjectReview, givingOpen, effectiveState, validatePlan } = require("../lib/projectReview");

const DAY = 86400000;

function rig({ bank = true, face = true, attachment = true, reviewerIds = ["REVIEWER"], staff = [] } = {}) {
  let clock = Date.parse("2026-11-09T08:00:00Z");
  const owner = { _id: "owner1", symbolId: "OWNER" };
  const reviewer = { _id: "rev1", symbolId: "REVIEWER" };
  const stranger = { _id: "x1", symbolId: "STRANGER" };
  const notes = [];
  const payments = [];
  const doc = {
    _id: "p1", ownerId: "owner1", ownerSymbolId: "OWNER", title: "River footbridge", status: "draft",
    goalMinor: 5000000, goalCurrency: "INR", attachment: attachment ? { filename: "quote.pdf" } : null,
    plan: undefined,
    review: { state: "draft", timeline: [{ at: new Date(clock), state: "draft", by: "applicant", note: "" }], questions: [], milestones: [] },
    async save() { return this; }, markModified() {}, toObject() { return this; },
  };
  const Project = {
    findById: (id) => {
      const found = id === "p1" ? doc : null;
      const p = Promise.resolve(found);
      p.lean = () => Promise.resolve(found);
      return p;
    },
    find: (filter) => ({ sort: () => ({ limit: () => ({ lean: async () => [doc].filter((d) => {
      const want = filter["review.state"];
      return typeof want === "string" ? d.review.state === want : want.$in.includes(d.review.state);
    }) }) }) }),
    aggregate: async () => [{ _id: doc.review.state, n: 1 }],
  };
  const pr = createProjectReview({
    Project,
    BankAccount: { findOne: () => ({ lean: async () => (bank ? { status: "open" } : null) }) },
    FaceTemplate: { findOne: () => ({ lean: async () => (face ? { userId: "owner1" } : null) }) },
    Transaction: { find: (f) => ({ sort: () => ({ limit: () => ({ lean: async () => payments.filter((t) => t.fromUserId === f.fromUserId && t.toUserId === f.toUserId && t.currency === f.currency && t.createdAt >= f.createdAt.$gte) }) }) }) },
    StaffMember: { findOne: (q) => ({ lean: async () => staff.find((s) => s.userId === q.userId && q.role.$in.includes(s.role)) || null }) },
    notify: async (userId, n) => { notes.push({ userId, ...n }); },
    env: { ADMIN_SYMBOL_IDS: reviewerIds.join(",") },
    now: () => clock,
  });
  const call = async (name, user, params = {}, body = {}, query = {}) => {
    let status = 200, json;
    const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; } };
    const req = { authUser: user, params: { id: "p1", ...params }, body, query };
    if (["queue", "start", "ask", "approve", "decline", "pause", "resume", "markPaid"].includes(name)) {
      let passed = false;
      await pr.handlers.requireReviewer(req, res, () => { passed = true; });
      if (!passed) return { status, body: json };
    }
    await pr.handlers[name](req, res);
    return { status, body: json };
  };
  const pay = (amountMajor, currency = "INR") => payments.push({ fromUserId: "rev1", toUserId: "owner1", status: "success", currency, amount: amountMajor, referenceId: `T${payments.length + 1}`, createdAt: new Date(clock) });
  return { pr, doc, owner, reviewer, stranger, notes, call, pay, tick: (ms) => { clock += ms; } };
}

const PLAN = [{ label: "Steel and cement", amountMajor: "30000" }, { label: "Labour", amountMajor: "20000" }];

test("the plan has to add up to the goal", () => {
  assert.equal(validatePlan([{ label: "A", amountMajor: "100" }], 20000).ok, false);
  assert.equal(validatePlan([{ label: "A", amountMajor: "100" }, { label: "B", amountMajor: "100" }], 20000).ok, true);
  assert.equal(validatePlan([], 100).ok, false);
  assert.equal(validatePlan([{ label: "", amountMajor: "1" }], 100).ok, false);
});

test("submitting needs all four: bank open, goal + plan, a document, the live face check", async () => {
  const r = rig({ bank: false, face: false, attachment: false });
  const out = await r.call("submit", r.owner);
  assert.equal(out.status, 409);
  assert.equal(out.body.code, "requirements");
  assert.deepEqual(out.body.requirements.filter((x) => !x.ok).map((x) => x.key), ["bank", "plan", "document", "face"]);
  assert.equal(r.doc.review.state, "draft", "nothing changed");
});

test("the whole road: submit → review → question → answer → approve → milestones → completed", async () => {
  const r = rig();
  assert.equal((await r.call("setPlan", r.owner, {}, { plan: PLAN })).status, 200);
  const sub = await r.call("submit", r.owner);
  assert.equal(sub.status, 200);
  assert.equal(r.doc.status, "published", "everyone sees it…");
  assert.equal(sub.body.review.state, "submitted");
  assert.equal(givingOpen(r.doc), false, "…but nobody can give until GLOOBAL approves");

  assert.equal((await r.call("start", r.reviewer)).body.review.state, "under_review");
  const asked = await r.call("ask", r.reviewer, {}, { question: "Who owns the land the bridge stands on?" });
  assert.equal(asked.body.review.state, "needs_info");
  assert.match(asked.body.review.nextStep, /Answer/);
  assert.equal((await r.call("approve", r.reviewer, {}, { amountMajor: "10000" })).status, 409, "not while a question is open");

  const qid = r.doc.review.questions[0].id;
  assert.equal((await r.call("answer", r.owner, {}, { questionId: qid, answer: "The panchayat; the letter is attached." })).body.review.state, "under_review");

  const ok = await r.call("approve", r.reviewer, {}, { amountMajor: "10000", currency: "INR" });
  assert.equal(ok.body.review.state, "approved");
  assert.deepEqual(ok.body.review.milestones.map((m) => [m.label, m.amountMinor, m.state]), [["To start", 400000, "due"], ["Halfway", 300000, "waiting"], ["To finish", 300000, "waiting"]]);
  assert.equal(givingOpen(r.doc), true, "approved: giving opens");

  // Marked paid only against a real payment of that amount.
  const early = await r.call("markPaid", r.reviewer, { n: "0" });
  assert.equal(early.body.code, "no_payment");
  assert.deepEqual(early.body.pay, { toSymbolId: "OWNER", amountMajor: "4000.00", currency: "INR" });
  r.pay(3999);
  assert.equal((await r.call("markPaid", r.reviewer, { n: "0" })).body.code, "no_payment", "a different amount does not count");
  r.pay(4000);
  const paid = await r.call("markPaid", r.reviewer, { n: "0" });
  assert.equal(paid.body.review.state, "funding");
  assert.equal(paid.body.reference, "T2");
  assert.equal((await r.call("markPaid", r.reviewer, { n: "1" })).status, 409, "the next one waits for the owner's update");

  assert.equal((await r.call("postUpdate", r.owner, { n: "0" }, { update: "short" })).status, 400);
  await r.call("postUpdate", r.owner, { n: "0" }, { update: "Bought the steel and cement; photos of the delivery attached to the project." });
  assert.equal(r.doc.review.milestones[1].state, "due");
  r.pay(3000); await r.call("markPaid", r.reviewer, { n: "1" });
  assert.equal((await r.call("markPaid", r.reviewer, { n: "1" })).status, 409, "paid once only");
  await r.call("postUpdate", r.owner, { n: "1" }, { update: "Half the deck is laid; the crew is paid to the end of the month." });
  r.pay(3000); await r.call("markPaid", r.reviewer, { n: "2" });
  const done = await r.call("postUpdate", r.owner, { n: "2" }, { update: "The bridge is open. Children crossed it to school this morning." });
  assert.equal(done.body.review.state, "completed");
  assert.ok(r.notes.some((n) => /completed/i.test(n.title)));
  assert.deepEqual(new Set(r.doc.review.milestones.map((m) => m.paidReference)), new Set(["T2", "T3", "T4"]), "each payment used once");
});

test("an update not posted within 30 days pauses it, with the reason, until it is posted", async () => {
  const r = rig();
  await r.call("setPlan", r.owner, {}, { plan: PLAN });
  await r.call("submit", r.owner);
  await r.call("approve", r.reviewer, {}, { amountMajor: "1000", milestones: [{ label: "Start", percent: 50 }, { label: "End", percent: 50 }] });
  r.pay(500); await r.call("markPaid", r.reviewer, { n: "0" });
  r.tick(31 * DAY);
  const eff = effectiveState(r.doc, Date.parse("2026-11-09T08:00:00Z") + 31 * DAY);
  assert.equal(eff.state, "paused");
  assert.match(eff.reason, /update on "Start"/);
  assert.equal(givingOpen(r.doc), true, "public giving stays open while paused");
  r.pay(500);
  assert.equal((await r.call("markPaid", r.reviewer, { n: "1" })).status, 409, "and GLOOBAL's next payment waits");
  await r.call("postUpdate", r.owner, { n: "0" }, { update: "Late, sorry: the first span is up, photos attached." });
  assert.equal(effectiveState(r.doc, Date.parse("2026-11-09T08:00:00Z") + 31 * DAY).state, "funding");
});

test("declined: the reason is public, and they can apply again after the date", async () => {
  const r = rig();
  await r.call("setPlan", r.owner, {}, { plan: PLAN });
  await r.call("submit", r.owner);
  assert.equal((await r.call("decline", r.reviewer, {}, { reason: "short" })).status, 400, "a reason they can act on");
  const d = await r.call("decline", r.reviewer, {}, { reason: "The quote is for a different site than the one described.", reapplyDays: 14 });
  assert.equal(d.body.review.state, "declined");
  const seen = r.pr.publicReview(r.doc, {});
  assert.equal(seen.reason, "The quote is for a different site than the one described.");
  assert.equal(seen.timeline, undefined, "the timeline is the applicant's and GLOOBAL's only");
  assert.equal((await r.call("reapply", r.owner)).body.code, "too_soon");
  r.tick(15 * DAY);
  assert.equal((await r.call("reapply", r.owner)).body.review.state, "draft");
  assert.equal(r.doc.status, "draft");
});

test("who can review: admins on Render and finance/projects staff, never the owner, never a stranger", async () => {
  const r = rig({ staff: [{ userId: "s1", symbolId: "STAFF", role: "projects" }, { userId: "s2", symbolId: "SUPPORT", role: "support" }] });
  await r.call("setPlan", r.owner, {}, { plan: PLAN });
  await r.call("submit", r.owner);
  assert.equal((await r.call("start", r.stranger)).body.code, "not_reviewer");
  assert.equal((await r.call("start", { _id: "s2", symbolId: "SUPPORT" })).body.code, "not_reviewer", "support is not a reviewer");
  assert.equal((await r.call("start", { _id: "s1", symbolId: "STAFF" })).status, 200, "projects staff can");
  const own = rig({ reviewerIds: ["OWNER"] });
  await own.call("setPlan", own.owner, {}, { plan: PLAN });
  await own.call("submit", own.owner);
  assert.equal((await own.call("start", own.owner)).body.code, "own_project");
});

test("withdraw, and the queue a reviewer sees", async () => {
  const r = rig();
  await r.call("setPlan", r.owner, {}, { plan: PLAN });
  await r.call("submit", r.owner);
  const q = await r.call("queue", r.reviewer);
  assert.equal(q.body.projects.length, 1);
  assert.equal(q.body.projects[0].review.state, "submitted");
  assert.ok(Array.isArray(q.body.projects[0].review.timeline), "reviewers see the timeline");
  assert.equal((await r.call("withdraw", r.owner)).body.review.state, "withdrawn");
  assert.equal(givingOpen(r.doc), false);
});

test("server.js: new projects start as drafts, giving waits for approval, edits stop during review", () => {
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /status: 'draft',\n\s+review: \{ state: 'draft'/);
  assert.match(src, /if \(!projectGivingOpen\(project\)\)/);
  assert.match(src, /if \(!\['draft', 'needs_info'\]\.includes\(existing\.review\.state\)\)/);
  assert.match(src, /projectReview\.mount\(app, \{ requireAuth, writeLimit, lookupLimit \}\)/);
  assert.match(fs.readFileSync(new URL("../models/StaffMember.js", import.meta.url), "utf8"), /'projects'\]/);
});
