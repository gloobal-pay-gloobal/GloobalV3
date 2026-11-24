// tests/project-suppliers.test.mjs
//
// Hooman Projects: what kind of cost each plan line is, where the site is,
// and which GLOOBAL बाज़ार seller GLOOBAL buys a line's materials from
// (server/lib/projectReview.js validatePlan / setSite, server/lib/
// projectSuppliers.js) — run on the real modules with in-memory models.
//
// What is checked: each kind's details, and wages that are exactly
// people × days × a day's pay; the site pin and when it is required; the
// sellers found around the site (listed, public, pinned, in the category,
// the circle widening only when too few are close); everyone connected to
// the applicant left out, with the reason; the ranking and its reason in
// words; a reviewer confirming GLOOBAL's choice with one tap, saying why
// when choosing another or none; and what the applicant sees.
//
//   node --test tests/project-suppliers.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { modelClass, require, mongoose } from "./mem-models.mjs";

const { createProjectReview, validatePlan, validatePlanLine } = require("./lib/projectReview");
const { createProjectSuppliers, matchItem, recordScore } = require("./lib/projectSuppliers");

const SITE = { lat: 27.55, lng: 76.6 };
const KM = 1 / 111.32; // degrees of latitude in a kilometre
const NOW = Date.parse("2026-11-20T10:00:00Z");
const DAY = 86400000;

function world() {
  const Project = modelClass({ status: "draft", plan: [], review: undefined, site: null });
  const User = modelClass();
  const CreatorItem = modelClass({ soldOut: false, note: "" });
  const CreatorReview = modelClass();
  const Complaint = modelClass();
  const CareLink = modelClass();
  const Transaction = modelClass();
  const BankAccount = modelClass();
  const FaceTemplate = modelClass();
  const StaffMember = modelClass();
  const env = { ADMIN_SYMBOL_IDS: "REVIEWER" };
  const review = createProjectReview({ Project, BankAccount, FaceTemplate, Transaction, StaffMember, env, notify: async () => {}, now: () => NOW });
  const suppliers = createProjectSuppliers({ Project, User, CreatorItem, CreatorReview, Complaint, CareLink, Transaction, review, now: () => NOW });
  const owner = { _id: new mongoose.Types.ObjectId(), symbolId: "OWNER", shopOwnerId: null };
  const reviewer = { _id: new mongoose.Types.ObjectId(), symbolId: "REVIEWER" };
  User.rows.push(owner, reviewer);
  const call = async (fn, user, params, body = {}) => {
    let status = 200; let json = null;
    const res = { status(s) { status = s; return res; }, json(b) { json = b; return res; } };
    await fn({ params, authUser: user, body, query: {} }, res);
    return { status, body: json };
  };
  // A shop `km` north of the site.
  let n = 0;
  async function shop({ name, km, category = "building", subcategory = "cement", share = 0, items = [], stars = [], complaints = 0, listed = true, hidden = false, isPublic = true, shopOwnerId = null } = {}) {
    n += 1;
    const u = {
      _id: new mongoose.Types.ObjectId(), symbolId: `SHOP${n}`, shopOwnerId, cashbackRate: share,
      creatorProfile: { handle: name, category, subcategory, listed, hiddenByGloobal: hidden, addressPublic: isPublic, addressParts: { lat: SITE.lat + km * KM, lng: SITE.lng, area: "Station Road", city: "Alwar" } },
    };
    User.rows.push(u);
    for (const [title, price, note = ""] of items) await CreatorItem.create({ ownerSymbolId: u.symbolId, title, price, currency: "INR", note });
    for (const s of stars) await CreatorReview.create({ creatorUserId: u._id, authorUserId: new mongoose.Types.ObjectId(), stars: s });
    for (let i = 0; i < complaints; i++) await Complaint.create({ receiverId: u._id, reporterId: new mongoose.Types.ObjectId(), createdAt: new Date(NOW - 30 * DAY) });
    return u;
  }
  async function project({ state = "submitted", plan, site = SITE } = {}) {
    const p = new Project({
      ownerId: owner._id, ownerSymbolId: owner.symbolId, title: "Village road", goalMinor: 20000000, goalCurrency: "INR",
      plan: plan || [
        { label: "Cement", amountMinor: 15200000, kind: "material", quantity: 400, unit: "bags", quality: "OPC 53", category: "building", subcategory: "cement" },
        { label: "Masons", amountMinor: 4800000, kind: "human", people: 4, days: 20, rateMinor: 60000 },
      ],
      site,
      review: { state, timeline: [], questions: [], milestones: [] },
    });
    await p.save();
    return p;
  }
  return { Project, User, CreatorItem, CareLink, Transaction, review, suppliers, owner, reviewer, call, shop, project };
}

// The road's cement: three fair sellers near the site, and every way of
// not being one.
async function road(w) {
  const sharma = await w.shop({ name: "Sharma Cement Store", km: 3, share: 0.05, items: [["OPC 53 Cement", 380, "50 kg bag"], ["White cement", 40]], stars: [5, 5, 5, 5, 5] });
  const gupta = await w.shop({ name: "Gupta Traders", km: 8, items: [["Cement OPC 53 grade", 360]], stars: [3, 3], complaints: 1 });
  const royal = await w.shop({ name: "Royal Building Materials", km: 12, subcategory: "steel", items: [["TMT bar 12 mm", 63]] });
  const own = await w.shop({ name: "Owner's Own Cement", km: 1, shopOwnerId: w.owner._id });
  const cousin = await w.shop({ name: "Cousin Cement", km: 2 });
  for (let i = 0; i < 3; i++) await w.Transaction.create({ fromUserId: w.owner._id, toUserId: cousin._id, status: "success", createdAt: new Date(NOW - (10 + i) * DAY) });
  const helper = await w.shop({ name: "Helper's Hardware", km: 4 });
  await w.CareLink.create({ helper: helper._id, dependent: w.owner._id, status: "active" });
  await w.shop({ name: "Hidden Cement", km: 2, hidden: true });
  await w.shop({ name: "Private Cement", km: 2, isPublic: false });
  await w.shop({ name: "Unlisted Cement", km: 2, listed: false });
  await w.shop({ name: "Far Cement", km: 40 });
  await w.shop({ name: "Chai Point", km: 1, category: "food", subcategory: "chai" });
  return { sharma, gupta, royal, own, cousin, helper };
}

// ── the plan's kinds ─────────────────────────────────────────────────────
test("each kind of cost carries its details; wages are exactly people × days × a day's pay", () => {
  const ok = validatePlan([
    { label: "Cement", amountMajor: "1,52,000", kind: "material", quantity: "400", unit: "bags", quality: "OPC 53", category: "building", subcategory: "cement" },
    { label: "Masons", kind: "human", people: "4", days: "20", rateMajor: "600" },
    { label: "Laptop", amountMajor: "40000", kind: "tech", quantity: 1, unit: "piece", category: "electronics", subcategory: "computer" },
    { label: "Permits", amountMajor: "8000", kind: "other" },
    { label: "Old line", amountMajor: "0.5" },
  ], null);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan[0], { label: "Cement", amountMinor: 15200000, kind: "material", quantity: 400, unit: "bags", quality: "OPC 53", category: "building", subcategory: "cement" });
  assert.deepEqual(ok.plan[1], { label: "Masons", amountMinor: 4800000, kind: "human", people: 4, days: 20, rateMinor: 60000 }, "the amount is worked out when not typed");
  assert.deepEqual(ok.plan[3], { label: "Permits", amountMinor: 800000, kind: "other" });
  assert.deepEqual(ok.plan[4], { label: "Old line", amountMinor: 50 }, "a line from before kinds is saved as it always was");

  const bad = (line) => validatePlanLine(line).message;
  assert.equal(bad({ label: "Masons", kind: "human", people: 4, days: 20, rateMajor: 600, amountMajor: 40000 }), '"Masons": 4 people × 20 days × 600.00 a day is 48000.00, not 40000.00.');
  assert.equal(bad({ label: "Masons", kind: "human", people: 0, days: 20, rateMajor: 600 }), '"Masons": how many people?');
  assert.equal(bad({ label: "Masons", kind: "human", people: 4, days: 2.5, rateMajor: 600 }), '"Masons": for how many days?');
  assert.equal(bad({ label: "Masons", kind: "human", people: 4, days: 20 }), `"Masons": what is one person's pay for a day?`);
  assert.equal(bad({ label: "Cement", amountMajor: 100, kind: "material", unit: "bags", category: "building" }), '"Cement": how much is needed?');
  assert.equal(bad({ label: "Cement", amountMajor: 100, kind: "material", quantity: 4, category: "building" }), '"Cement": in what unit — bags, tonnes, pieces…?');
  assert.equal(bad({ label: "Cement", amountMajor: 100, kind: "material", quantity: 4, unit: "bags", category: "other" }), '"Cement": which kind of Bazaar shop sells it?');
  assert.equal(bad({ label: "Cement", amountMajor: 100, kind: "material", quantity: 4, unit: "bags", category: "building", subcategory: "chai" }), '"Cement": pick the shop\'s kind from the list.');
  assert.equal(bad({ label: "Cement", amountMajor: 100, kind: "gift" }), '"Cement": say whether it is material, tech, people or other.');
});

test("the site: pinned by the owner while the plan can change, never (0, 0), and needed only when GLOOBAL has things to buy", async () => {
  const w = world();
  const p = await w.project({ state: "draft", site: null });
  const set = (user, body) => w.call(w.review.handlers.setSite, user, { id: String(p._id) }, body);
  assert.equal((await set(w.owner, { lat: 0, lng: 0 })).body.message, "That is not a place on the map.");
  assert.equal((await set(w.owner, { lat: 95, lng: 10 })).status, 400);
  assert.equal((await set(w.reviewer, { lat: 27.5, lng: 76.6 })).status, 403);
  const ok = await set(w.owner, { lat: "27.5512345678", lng: 76.6, label: "Kheri turn-off" });
  assert.deepEqual({ ...ok.body.site, setAt: undefined }, { lat: 27.551235, lng: 76.6, label: "Kheri turn-off", setAt: undefined });
  assert.equal((await w.review.requirements(p)).find((r) => r.key === "site").ok, true);
  p.review.state = "under_review";
  assert.equal((await set(w.owner, { lat: 27, lng: 76 })).status, 409, "it cannot move while GLOOBAL is reviewing");
  p.review.state = "draft";
  assert.equal((await set(w.owner, { clear: true })).body.site, null);
});

// ── the sellers ──────────────────────────────────────────────────────────
test("the sellers around the site, ranked, with every connected one left out and why", async () => {
  const w = world();
  const s = await road(w);
  const p = await w.project();
  const r = await w.call(w.suppliers.handlers.sellers, w.reviewer, { id: String(p._id) });
  assert.equal(r.status, 200);
  assert.equal(r.body.lines.length, 1, "only material and tech lines are bought from a seller");
  const line = r.body.lines[0];
  assert.equal(line.radiusKm, 25, "three fair sellers within 25 km: the circle does not widen");
  assert.deepEqual(line.candidates.map((c) => c.name), ["Sharma Cement Store", "Gupta Traders", "Royal Building Materials"]);
  assert.deepEqual(line.excluded.map((e) => [e.name, e.why]).sort(), [
    ["Cousin Cement", "paid or was paid by the applicant 3 times in 90 days"],
    ["Helper's Hardware", "looks after the applicant, or is looked after by them"],
    ["Owner's Own Cement", "one of the applicant's own shops"],
  ]);
  const [first, second, third] = line.candidates;
  assert.equal(first.rank, 1);
  assert.equal(first.reason, "listed price 6% above the lowest · 3 km from the site · 5★ from 5 reviews · no complaints in a year · gives 5% Creator Share · not picked for another project lately");
  assert.deepEqual(first.item, { title: "OPC 53 Cement", note: "50 kg bag", priceMinor: 38000, currency: "INR", exact: true }, "the matching item, not the white cement");
  assert.equal(first.estimateMinor, 38000 * 400);
  assert.equal(second.reason, "lowest listed price of 2 nearby · 8 km from the site · 3★ from 2 reviews · 1 complaint in a year · not picked for another project lately");
  assert.equal(third.reason, "no listed price yet — will quote · 12 km from the site · no reviews yet · no complaints in a year · sells in this category, not this exact kind · not picked for another project lately");
  assert.ok(first.score > second.score && second.score > third.score);
  assert.equal(first.area, "Station Road, Alwar");
  assert.ok(!("lat" in first) && !("cashbackRate" in first), "no coordinates or raw rates leave the server");

  // Nobody reviews their own project's sellers.
  assert.equal((await w.call(w.suppliers.handlers.sellers, w.owner, { id: String(p._id) })).body.code, "own_project");
});

test("too few close by widens the circle to 50, then 100 km; none at all says what to do", async () => {
  const w = world();
  await w.shop({ name: "Solar Hub", km: 60, category: "building", subcategory: "solar", items: [["Solar panel 330 W", 9000]] });
  const p = await w.project({ plan: [{ label: "Solar panels", amountMinor: 9000000, kind: "tech", quantity: 10, unit: "panels", category: "building", subcategory: "solar" }, { label: "Laptops", amountMinor: 11000000, kind: "tech", quantity: 2, unit: "pieces", category: "electronics", subcategory: "computer" }] });
  const r = await w.call(w.suppliers.handlers.sellers, w.reviewer, { id: String(p._id) });
  assert.equal(r.body.lines[0].radiusKm, 100);
  assert.deepEqual(r.body.lines[0].candidates.map((c) => c.name), ["Solar Hub"]);
  assert.equal(r.body.lines[0].candidates[0].estimateMinor, 900000 * 10);
  assert.equal(r.body.lines[1].candidates.length, 0);
  assert.equal(r.body.lines[1].note, "No seller of this on GLOOBAL बाज़ार within 100 km of the site. Invite one to quote, or pay it against receipts.");
  const noSite = await w.project({ site: null });
  assert.equal((await w.call(w.suppliers.handlers.sellers, w.reviewer, { id: String(noSite._id) })).body.lines[0].note, "The applicant has not pinned the site yet.");
});

test("a reviewer confirms GLOOBAL's choice in one tap; another or none needs a reason; the applicant sees the pick, not the note", async () => {
  const w = world();
  const s = await road(w);
  const p = await w.project();
  const id = String(p._id);
  const pick = (body, n = 0, user = w.reviewer) => w.call(w.suppliers.handlers.pick, user, { id, n: String(n) }, body);

  const one = await pick({ sellerId: String(s.sharma._id) });
  assert.equal(one.status, 200);
  assert.equal(one.body.pick.name, "Sharma Cement Store");
  assert.equal(one.body.pick.rank, 1);
  assert.equal(one.body.pick.estimateMinor, 15200000);
  assert.equal(String(p.plan[0].pick.pickedBy), String(w.reviewer._id));

  assert.equal((await pick({ sellerId: String(s.gupta._id) })).body.code, "note_needed", "not GLOOBAL's first choice: say why");
  const other = await pick({ sellerId: String(s.gupta._id), note: "Sharma is out of stock until March." });
  assert.equal(other.body.pick.rank, 2);
  assert.equal((await pick({ sellerId: String(s.cousin._id), note: "family rate" })).body.code, "not_candidate", "a connected seller cannot be picked at all");
  assert.equal((await pick({ sellerId: String(s.own._id), note: "cheapest" })).body.code, "not_candidate");
  assert.equal((await pick({ sellerId: String(s.sharma._id) }, 1)).status, 409, "wages are not bought from a seller");
  assert.equal((await pick({ other: true })).status, 400);

  // What the applicant reads, and what the reviewer reads.
  const mine = await w.call(w.review.handlers.getReview, w.owner, { id });
  assert.deepEqual(Object.keys(mine.body.plan[0].pick).sort(), ["distanceKm", "estimateCurrency", "estimateMinor", "name", "other", "pickedAt", "reason"]);
  assert.equal(mine.body.plan[0].pick.name, "Gupta Traders");
  const theirs = await w.call(w.review.handlers.getReview, w.reviewer, { id });
  assert.equal(theirs.body.plan[0].pick.note, "Sharma is out of stock until March.");

  const none = await pick({ other: true, note: "Nobody nearby sells OPC 53 in this amount." });
  assert.equal(none.body.pick.other, true);
  assert.equal(none.body.pick.reason, "No suitable seller on GLOOBAL बाज़ार: paid against receipts.");
  assert.equal((await pick({ clear: true })).body.pick, null);

  p.review.state = "declined";
  assert.equal((await pick({ sellerId: String(s.sharma._id) })).status, 409);
});

test("a seller picked for other projects lately scores lower, so GLOOBAL's buying is shared out", async () => {
  const w = world();
  const s = await road(w);
  const p = await w.project();
  const before = (await w.call(w.suppliers.handlers.sellers, w.reviewer, { id: String(p._id) })).body.lines[0].candidates;
  for (let i = 0; i < 3; i++) {
    await w.project({ state: "funding", plan: [{ label: "Cement", amountMinor: 100, kind: "material", quantity: 1, unit: "bag", category: "building", pick: { sellerId: s.sharma._id, name: "Sharma Cement Store", pickedAt: new Date(NOW - (5 + i) * DAY) } }] });
  }
  // A pick from long ago does not count.
  await w.project({ state: "completed", plan: [{ label: "Cement", amountMinor: 100, kind: "material", quantity: 1, unit: "bag", category: "building", pick: { sellerId: s.gupta._id, name: "Gupta Traders", pickedAt: new Date(NOW - 200 * DAY) } }] });
  const after = (await w.call(w.suppliers.handlers.sellers, w.reviewer, { id: String(p._id) })).body.lines[0].candidates;
  const sharma = (list) => list.find((c) => c.name === "Sharma Cement Store");
  assert.equal(sharma(after).recentPicks, 3);
  assert.match(sharma(after).reason, /already picked for 3 other projects lately$/);
  assert.ok(sharma(before).score - sharma(after).score >= 7, "three recent picks cost most of the spread's ten points");
  assert.equal(after.find((c) => c.name === "Gupta Traders").recentPicks, 0);
});

test("editing the plan while answering a question keeps a pick for the same purchase, and drops it when the purchase changed", async () => {
  const w = world();
  const s = await road(w);
  const p = await w.project();
  await w.call(w.suppliers.handlers.pick, w.reviewer, { id: String(p._id), n: "0" }, { sellerId: String(s.sharma._id) });
  p.review.state = "needs_info";
  const cement = { label: "Cement", amountMajor: "152000", kind: "material", quantity: 400, unit: "bags", quality: "OPC 53", category: "building", subcategory: "cement" };
  const save = (plan) => w.call(w.review.handlers.setPlan, w.owner, { id: String(p._id) }, { plan });
  await save([{ label: "Masons", kind: "human", people: 4, days: 20, rateMajor: 600 }, cement]);
  assert.equal(p.plan[1].pick.name, "Sharma Cement Store", "the same cement, moved to another line: still picked");
  await save([{ ...cement, quantity: 300, amountMajor: "152000" }, { label: "Masons", kind: "human", people: 4, days: 20, rateMajor: 600 }]);
  assert.equal(p.plan[0].pick, undefined, "a different amount of cement needs choosing again");
});

test("prices are compared only between the same thing: PPC is not the cheapest OPC 53", async () => {
  const w = world();
  await road(w);
  await w.shop({ name: "Yadav Cement Agency", km: 15, items: [["PPC cement", 330, "50 kg bag"]] });
  const p = await w.project();
  const line = (await w.call(w.suppliers.handlers.sellers, w.reviewer, { id: String(p._id) })).body.lines[0];
  const yadav = line.candidates.find((c) => c.name === "Yadav Cement Agency");
  assert.equal(yadav.estimateMinor, null);
  assert.equal(yadav.item.exact, false);
  assert.match(yadav.reason, /^lists PPC cement, not exactly this — will quote · 15 km from the site/);
  assert.match(line.candidates.find((c) => c.name === "Gupta Traders").reason, /^lowest listed price of 2 nearby/, "the cheapest OPC 53 is still the cheapest");
});

test("matching an item and weighing a record", () => {
  const items = [{ title: "White cement", price: 40 }, { title: "Cement OPC 53", price: 380 }, { title: "PPC Cement", price: 350 }];
  assert.equal(matchItem({ label: "Cement", quality: "OPC 53" }, items).title, "Cement OPC 53", "the most words in common first");
  assert.equal(matchItem({ label: "Cement" }, items).title, "White cement", "then the cheapest");
  assert.equal(matchItem({ label: "Bricks" }, items), null);
  assert.equal(matchItem({ label: "Bags for the road" }, items), null, "words that say nothing about what is bought match nothing");
  assert.deepEqual(recordScore([], 0), { avg: null, count: 0, score: 0.7 });
  assert.ok(recordScore([5], 0).score < recordScore([5, 5, 5, 5, 5, 5, 5, 5], 0).score, "one five-star review is not a record");
  assert.ok(recordScore([5, 5, 5], 3).score < recordScore([5, 5, 5], 0).score);
});
