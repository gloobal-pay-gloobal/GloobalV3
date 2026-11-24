// tests/project-review.test.mjs
//
// Hooman Projects: applying for GLOOBAL funding, through the real screens.
// The fake /api/projects routes here keep one project in memory and follow
// server/lib/projectReview.js's rules; the rules themselves are tested in
// server/tests/project-review.test.mjs.
//
//   1. The applicant: the checklist says what is missing; the plan has to add
//      up, each line saying what kind of cost it is (wages worked out from
//      people × days × a day's pay); a plan with materials needs the site
//      pinned; talking it through with Hooman Intelligence ends in an analysis,
//      and its "Yes, send it" applies; the page shows "Submitted"; giving is
//      closed. (The conversation's own rules: tests/project-talk.test.mjs.)
//   2. GLOOBAL: the desk lists it, with Hooman Intelligence's analysis and
//      the conversation; GLOOBAL's choice of cement seller is confirmed in
//      one tap (and the applicant sees it); a question goes out; the
//      applicant answers;
//      approve with an amount makes milestones; the first is due.
//   3. Paying a milestone: "Pay on Send" opens Send with the amount; Mark
//      paid is refused until the payment exists, then accepted.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, teardown, login, padFill, ACCOUNTS, API_ORIGIN } from "./browser-harness.mjs";

const OWNER = ACCOUNTS.india;
const REVIEWER = ACCOUNTS.india2;
before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

const tap = async (l) => { await l.waitFor({ timeout: 20000 }); await l.evaluate((n) => n.click()); };
const STATE_WORDS = { draft: "Draft", submitted: "Submitted, waiting for review", under_review: "Under review", needs_info: "GLOOBAL asked a question", approved: "Approved", funding: "Being funded", paused: "Paused", completed: "Completed", declined: "Declined", withdrawn: "Withdrawn" };

// One project, shared by both browsers, with the server's rules.
function fakeReview() {
  const p = {
    id: "p1", title: "River footbridge", category: "Infrastructure", summary: "Connects two villages so children can reach school in the monsoon.", summaryWordCount: 11,
    countryIso: "IN", status: "draft", ownerSymbolId: OWNER.symbolId, place: "Pokhara", goal: { minor: 5000000, currency: "INR" }, attachment: { filename: "quote.pdf" },
    plan: [], site: null, review: { state: "draft", timeline: [{ at: new Date().toISOString(), state: "draft", by: "applicant", note: "" }], questions: [], milestones: [], fundMinor: 0, fundCurrency: "" },
    createdAt: new Date().toISOString(), raised: 0, backers: 0,
  };
  const reqs = { bank: true, face: true };
  const payments = [];
  const requirements = () => {
    const sum = p.plan.reduce((a, l) => a + l.amountMinor, 0);
    return [
      { key: "bank", ok: reqs.bank, label: "GLOOBAL Bank account open", hint: "Open it from Accounts." },
      { key: "plan", ok: sum === p.goal.minor && p.plan.length > 0, label: "Funding goal and a plan that adds up to it", hint: "Add plan lines that add up to the goal." },
      ...(p.plan.some((l) => l.kind === "material" || l.kind === "tech") ? [{ key: "site", ok: Boolean(p.site), label: "Project site pinned on the map", hint: "Pin it under the plan." }] : []),
      { key: "document", ok: Boolean(p.attachment), label: "A document or photo", hint: "A quote or a photo." },
      { key: "face", ok: reqs.face, label: "Live face check done", hint: "Take the live photo." },
    ];
  };
  const givingOpen = () => ["approved", "funding", "paused", "completed"].includes(p.review.state);
  const pub = (viewer) => {
    const r = p.review;
    const owner = viewer === OWNER.symbolId;
    const out = { state: r.state, label: STATE_WORDS[r.state], givingOpen: givingOpen(), fund: r.fundMinor ? { minor: r.fundMinor, currency: r.fundCurrency } : null, milestones: r.milestones, reason: r.reason || undefined };
    if (owner || viewer === REVIEWER.symbolId) Object.assign(out, { timeline: r.timeline.map((t) => ({ ...t, label: STATE_WORDS[t.state] })), questions: r.questions, canEdit: ["draft", "needs_info"].includes(r.state), nextStep: r.state === "needs_info" ? "Answer GLOOBAL's question to continue." : r.state === "submitted" ? "Waiting for GLOOBAL to start the review." : "" });
    return out;
  };
  const project = (viewer) => ({ ...p, isOwner: viewer === OWNER.symbolId, review: pub(viewer) });
  const step = (state, by, note = "") => p.review.timeline.push({ at: new Date().toISOString(), state, by, note });
  // The conversation with Hooman Intelligence, as GLOOBAL's fixed questions
  // would run it: two questions, then an analysis that says ready.
  const talkWorld = { talk: null };
  const QUESTIONS = ['Let\'s talk "River footbridge" through before it goes to GLOOBAL. What problem does it solve, and for whom?', "Where do the prices in your plan come from?"];
  // The nine things Hooman Intelligence must understand (server/lib/projectTalk.js).
  const NINE = [["problem", "The problem"], ["people", "Who benefits"], ["work", "What will be done"], ["person", "Why this person"], ["money", "The money"], ["steps", "The steps"], ["risks", "The risks"], ["after", "Afterwards"], ["fits", "It all fits"]];
  const nine = (clearUpTo) => NINE.map(([key, label], i) => ({ key, label, clear: "", status: i < clearUpTo ? "clear" : "missing", note: "", evidence: i < clearUpTo ? "Children cannot reach the school" : "" }));
  const ANALYSIS = { summary: "River footbridge (Pokhara): children cannot reach school across the river in the monsoon.", understanding: nine(9), understood: 9, of: 9, strengths: ["The plan adds up to the goal."], gaps: [], contradictions: [], risks: [], openQuestions: [], readiness: "ready", readinessLabel: "Ready for review", readinessWhy: "All nine are clear, and nothing contradicts.", milestones: [{ label: "Steel and cement", percent: 60 }, { label: "Labour", percent: 40 }], by: "practice" };
  return { p, reqs, payments, requirements, pub, project, step, givingOpen, talkWorld, QUESTIONS, ANALYSIS, nine };
}

function installReview(context, world, viewer) {
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  return context.route(`${API_ORIGIN}/api/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const body = req.postDataJSON ? (() => { try { return req.postDataJSON(); } catch (e) { return {}; } })() : {};
    const { p, world: w } = { p: world.p, world };
    if (path === "/api/projects" && req.method() === "GET") {
      const mine = url.searchParams.get("mine") === "1";
      const rows = mine ? [p] : p.status === "published" ? [p] : [];
      return json(route, 200, { success: true, projects: rows.map(() => w.project(viewer)), counts: { Infrastructure: rows.length }, nextCursor: null });
    }
    if (path === "/api/projects/p1/review") return json(route, 200, { success: true, review: w.pub(viewer), plan: p.plan, site: p.site, requirements: w.requirements(), reviewer: viewer === REVIEWER.symbolId });
    if (path === "/api/projects/p1/site") {
      p.site = { lat: body.lat, lng: body.lng, label: body.label || "" };
      return json(route, 200, { success: true, site: p.site });
    }
    if (path === "/api/projects/p1/plan") {
      // As server/lib/projectReview.js validatePlan: wages are people × days × a day's pay.
      const plan = (body.plan || []).map((l) => (l.kind === "human"
        ? { label: l.label, kind: l.kind, people: Number(l.people), days: Number(l.days), rateMinor: Math.round(Number(l.rateMajor) * 100), amountMinor: Number(l.people) * Number(l.days) * Math.round(Number(l.rateMajor) * 100) }
        : { label: l.label, kind: l.kind || "", amountMinor: Math.round(Number(l.amountMajor) * 100), ...(l.kind === "material" ? { quantity: Number(l.quantity), unit: l.unit, quality: l.quality, category: l.category, subcategory: l.subcategory } : {}) }));
      const sum = plan.reduce((a, l) => a + l.amountMinor, 0);
      if (sum !== p.goal.minor) return json(route, 400, { success: false, message: `The plan adds up to ${(sum / 100).toFixed(2)} but the goal is ${(p.goal.minor / 100).toFixed(2)}. Make them match.` });
      p.plan = plan;
      return json(route, 200, { success: true, plan });
    }
    if (path === "/api/projects/p1/submit") {
      const missing = w.requirements().filter((r) => !r.ok);
      if (missing.length) return json(route, 409, { success: false, code: "requirements", message: `Before submitting: ${missing.map((m) => m.label.toLowerCase()).join("; ")}.`, requirements: w.requirements() });
      p.status = "published"; p.review.state = "submitted"; w.step("submitted", "applicant");
      return json(route, 200, { success: true, review: w.pub(viewer) });
    }
    if (path === "/api/projects/p1/answer") {
      const q = p.review.questions.find((x) => x.id === body.questionId);
      q.answer = body.answer; q.answeredAt = new Date().toISOString();
      p.review.state = "under_review"; w.step("under_review", "applicant", "Answered GLOOBAL's question");
      return json(route, 200, { success: true, review: w.pub(viewer) });
    }
    if (path === "/api/projects/p1/contributions" && req.method() === "GET") return json(route, 200, { success: true, contributions: [], nextCursor: null });
    if (path === "/api/review/me") return json(route, 200, { success: true, reviewer: viewer === REVIEWER.symbolId });
    if (path === "/api/projects/p1/talk" && req.method() === "GET") {
      const t = w.talkWorld.talk;
      return json(route, 200, { success: true, switchedOn: true, mode: "practice", talk: t, canStart: viewer === OWNER.symbolId && p.review.state === "draft" && !(t && t.state === "talking"), requirements: viewer === OWNER.symbolId ? w.requirements() : undefined });
    }
    if (path === "/api/projects/p1/talk" && req.method() === "POST") {
      w.talkWorld.talk = { id: "t1", state: "talking", messages: [{ from: "assistant", text: w.QUESTIONS[0], at: new Date().toISOString() }], understanding: w.nine(0), understood: 0, of: 9, analysis: null, provider: "practice", answers: 0, answersLeft: 30, canFinish: false, appliedAnyway: false };
      return json(route, 201, { success: true, talk: w.talkWorld.talk });
    }
    if (path === "/api/projects/p1/talk/say") {
      const t = w.talkWorld.talk;
      t.messages.push({ from: "applicant", text: body.text, at: new Date().toISOString() });
      const answered = t.messages.filter((m) => m.from === "applicant").length;
      Object.assign(t, { understanding: w.nine(answered), understood: answered, answers: answered, canFinish: answered >= 2 });
      if (answered < w.QUESTIONS.length) t.messages.push({ from: "assistant", text: w.QUESTIONS[answered], at: new Date().toISOString() });
      else { t.messages.push({ from: "assistant", text: "Thank you — that gives a clear picture.", at: new Date().toISOString() }); t.state = "done"; t.analysis = w.ANALYSIS; }
      return json(route, 200, { success: true, talk: t });
    }
    if (path === "/api/projects/p1/talk/apply") {
      const missing = w.requirements().filter((r) => !r.ok);
      if (missing.length) return json(route, 409, { success: false, code: "requirements", message: "Before submitting: " + missing.map((m) => m.label.toLowerCase()).join("; ") + ".", requirements: w.requirements() });
      p.status = "published"; p.review.state = "submitted"; w.step("submitted", "applicant", "Talked it through with Hooman Intelligence: ready for review");
      w.talkWorld.talk.state = "applied";
      return json(route, 200, { success: true, review: w.pub(viewer), talk: w.talkWorld.talk });
    }
    // GLOOBAL's ranked sellers for the material line (server/lib/projectSuppliers.js).
    if (path === "/api/review/projects/p1/sellers") {
      const lines = p.plan.map((l, index) => ({ ...l, index })).filter((l) => l.kind === "material").map((l) => ({
        index: l.index, label: l.label, kind: l.kind, amountMinor: l.amountMinor, quantity: l.quantity, unit: l.unit, quality: l.quality, category: l.category, subcategory: l.subcategory,
        pick: l.pick || null, radiusKm: 25, more: 0, note: "",
        excluded: [{ name: "Owner's Own Steel", why: "one of the applicant's own shops" }],
        candidates: [
          { sellerId: "s1", symbolId: "SHOP1", name: "Sharma Steel & Cement", area: "Station Road, Pokhara", distanceKm: 3.2, item: null, estimateMinor: null, currency: "INR", rating: { avg: 4.8, count: 21 }, complaints: 0, sharePct: 5, recentPicks: 0, score: 86, rank: 1, reason: "no listed price yet — will quote · 3.2 km from the site · 4.8★ from 21 reviews · no complaints in a year · gives 5% Creator Share · not picked for another project lately" },
          { sellerId: "s2", symbolId: "SHOP2", name: "Gupta Traders", area: "Lakeside", distanceKm: 7.9, item: null, estimateMinor: null, currency: "INR", rating: { avg: 3.9, count: 6 }, complaints: 1, sharePct: 0, recentPicks: 1, score: 61, rank: 2, reason: "no listed price yet — will quote · 7.9 km from the site · 3.9★ from 6 reviews · 1 complaint in a year · already picked for 1 other project lately" },
        ],
      }));
      return json(route, 200, { success: true, site: p.site, currency: "INR", canPick: ["submitted", "under_review", "needs_info", "approved", "funding", "paused"].includes(p.review.state), lines });
    }
    const picked = path.match(/^\/api\/review\/projects\/p1\/plan\/(\d+)\/pick$/);
    if (picked) {
      const line = p.plan[Number(picked[1])];
      line.pick = body.sellerId === "s1" ? { other: false, sellerId: "s1", name: "Sharma Steel & Cement", distanceKm: 3.2, reason: "", rank: 1, note: "" } : null;
      return json(route, 200, { success: true, index: Number(picked[1]), pick: line.pick });
    }
    if (path === "/api/review/projects") {
      const want = url.searchParams.get("state");
      const rows = p.review.state !== "draft" && (!want || want === p.review.state) ? [p] : [];
      return json(route, 200, { success: true, counts: { [p.review.state]: 1 }, projects: rows.map(() => ({ id: p.id, title: p.title, category: p.category, countryIso: p.countryIso, ownerSymbolId: p.ownerSymbolId, goal: p.goal, review: w.pub(REVIEWER.symbolId) })) });
    }
    const m = path.match(/^\/api\/review\/projects\/p1\/(start|ask|approve|decline|pause|resume)$/);
    if (m) {
      const a = m[1];
      if (a === "start") { p.review.state = "under_review"; w.step("under_review", "gloobal"); }
      if (a === "ask") { p.review.questions.push({ id: "q1", askedAt: new Date().toISOString(), question: body.question, answer: "", answeredAt: null }); p.review.state = "needs_info"; w.step("needs_info", "gloobal", body.question); }
      if (a === "approve") {
        const fund = Math.round(Number(body.amountMajor) * 100);
        let given = 0;
        p.review.fundMinor = fund; p.review.fundCurrency = body.currency;
        p.review.milestones = (body.milestones || []).map((ms, i, arr) => { const amt = i === arr.length - 1 ? fund - given : Math.round((fund * ms.percent) / 100); given += amt; return { label: ms.label, amountMinor: amt, state: i === 0 ? "due" : "waiting", paidAt: null, updateAt: null, update: "" }; });
        p.review.state = "approved"; w.step("approved", "gloobal", `GLOOBAL will give ${(fund / 100).toFixed(2)} ${body.currency}.`);
      }
      return json(route, 200, { success: true, review: w.pub(viewer) });
    }
    const paid = path.match(/^\/api\/review\/projects\/p1\/milestones\/(\d+)\/paid$/);
    if (paid) {
      const ms = p.review.milestones[Number(paid[1])];
      const match = w.payments.find((t) => t.amountMinor === ms.amountMinor && !t.used);
      if (!match) return json(route, 409, { success: false, code: "no_payment", message: `No payment of ${(ms.amountMinor / 100).toFixed(2)} ${p.review.fundCurrency} from you to the owner since approval. Pay it on Send first, then mark it paid.` });
      match.used = true; ms.state = "paid"; ms.paidAt = new Date().toISOString(); p.review.state = "funding"; w.step("funding", "gloobal", `Paid "${ms.label}"`);
      return json(route, 200, { success: true, review: w.pub(viewer), reference: "T1" });
    }
    return route.fallback();
  });
}

async function openProjects(page) {
  await page.getByRole("button", { name: "Accounts", exact: true }).click({ force: true });
  await page.waitForTimeout(1000);
  await tap(page.getByRole("button", { name: /Gloobal coverage/i }).first());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { [...document.querySelectorAll('[role="button"],button')].find((e) => /man Projects/.test(e.textContent || ""))?.click(); });
  await page.waitForTimeout(1500);
}
const openProject = async (page) => {
  // The owner's draft is not in the public list; Drafts shows it.
  if (!(await page.getByText("River footbridge").count())) await tap(page.getByRole("button", { name: "Drafts", exact: true }));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((e) => /River footbridge/.test(e.textContent || ""))?.click(); });
  await page.getByTestId("project-status").first().waitFor({ timeout: 10000 });
};

test("the whole road: checklist, plan, submit, review, question, answer, approve, pay a milestone", async () => {
  const world = fakeReview();
  world.reqs.bank = false;

  // ── the applicant ──
  const A = await openPage({ account: OWNER, permissions: ["geolocation"], geolocation: { latitude: 19.07, longitude: 72.87 } });
  await installReview(A.context, world, OWNER.symbolId);
  await login(A.page, OWNER);
  await openProjects(A.page);
  await openProject(A.page);
  const panel = A.page.getByTestId("project-applicant-panel");
  await panel.waitFor({ timeout: 10000 });
  await A.page.waitForFunction(() => document.querySelectorAll("[data-testid=project-requirement]").length === 4, null, { timeout: 10000 });
  let reqs = await A.page.evaluate(() => [...document.querySelectorAll("[data-testid=project-requirement]")].map((e) => e.dataset.ok));
  assert.deepEqual(reqs, ["0", "0", "1", "1"], "bank and plan missing");
  assert.ok(await A.page.getByTestId("project-giving-closed").count(), "nobody can give yet");
  assert.equal(await A.page.getByTestId("project-submit").count(), 0, "applying goes through the conversation");
  assert.match(await A.page.getByTestId("project-talk-open").innerText(), /Talk it through and apply/);

  // The plan: two lines that add up to the goal of 50,000, each saying what
  // kind of cost it is. Wages are worked out, never typed.
  world.reqs.bank = true;
  await tap(A.page.getByRole("button", { name: "Add line" }));
  await tap(A.page.getByRole("button", { name: "Add line" }));
  await A.page.getByLabel("Plan line 1", { exact: true }).fill("Steel and cement");
  await tap(A.page.getByTestId("plan-kind-0-material"));
  await padFill(A.page, A.page.getByLabel("Plan line 1 quantity", { exact: true }), "1");
  await A.page.getByLabel("Plan line 1 unit", { exact: true }).fill("lot");
  assert.equal(await A.page.getByLabel("Plan line 1 sold by", { exact: true }).inputValue(), "building|", "a material line starts at Building materials");
  await A.page.getByLabel("Plan line 1 sold by", { exact: true }).selectOption("building|steel");
  await padFill(A.page, A.page.getByLabel("Plan line 1 amount", { exact: true }), "30000");
  await A.page.getByLabel("Plan line 2", { exact: true }).fill("Labour");
  await tap(A.page.getByTestId("plan-kind-1-human"));
  await padFill(A.page, A.page.getByLabel("Plan line 2 people", { exact: true }), "5");
  await padFill(A.page, A.page.getByLabel("Plan line 2 days", { exact: true }), "20");
  await padFill(A.page, A.page.getByLabel("Plan line 2 day's pay", { exact: true }), "150");
  assert.match(await A.page.getByTestId("plan-line-wages").innerText(), /= 15,000\.00 INR/);
  await tap(A.page.getByTestId("project-plan-save"));
  await A.page.getByTestId("project-review-error").waitFor({ timeout: 10000 });
  assert.match(await A.page.getByTestId("project-review-error").innerText(), /adds up to 45000\.00 but the goal is 50000\.00/);
  await padFill(A.page, A.page.getByLabel("Plan line 2 day's pay", { exact: true }), "200");
  await tap(A.page.getByTestId("project-plan-save"));
  // Steel to buy: GLOOBAL needs the site, to find sellers near it.
  await A.page.waitForFunction(() => document.querySelectorAll("[data-testid=project-requirement]").length === 5, null, { timeout: 10000 });
  assert.equal(await A.page.evaluate(() => [...document.querySelectorAll("[data-testid=project-requirement]")].map((e) => e.dataset.ok).join("")), "11011", "only the site is left");
  await A.page.getByTestId("site-paste").fill("https://www.google.com/maps/place/Kheri/@28.2096,83.9856,15z");
  await tap(A.page.getByTestId("site-paste-go"));
  await tap(A.page.getByTestId("site-save"));
  await A.page.getByTestId("site-pinned").waitFor({ timeout: 10000 });
  assert.deepEqual({ lat: world.p.site.lat, lng: world.p.site.lng }, { lat: 28.2096, lng: 83.9856 });
  await A.page.waitForFunction(() => [...document.querySelectorAll("[data-testid=project-requirement]")].every((e) => e.dataset.ok === "1"), null, { timeout: 10000 });
  // Talk it through: one question at a time, then the analysis, then a yes.
  await tap(A.page.getByTestId("project-talk-open"));
  const talk = A.page.getByTestId("project-talk");
  await talk.waitFor({ timeout: 10000 });
  const said = (from) => A.page.evaluate((f) => document.querySelectorAll(`[data-testid=talk-message][data-from=${f}]`).length, from);
  await A.page.waitForFunction(() => document.querySelectorAll("[data-testid=talk-message][data-from=assistant]").length === 1, null, { timeout: 10000 });
  assert.match(await talk.innerText(), /What problem does it solve/);
  assert.match(await A.page.getByTestId("talk-progress").innerText(), /Understood 0 of 9/);
  for (const [i, answer] of ["Children cannot reach the school across the river in the monsoon.", "Two written quotes from local fabricators; labour at the panchayat's rate."].entries()) {
    await A.page.getByTestId("talk-input").fill(answer);
    await tap(A.page.getByTestId("talk-send"));
    await A.page.waitForFunction((n) => document.querySelectorAll("[data-testid=talk-message][data-from=applicant]").length === n, i + 1, { timeout: 10000 });
    if (i === 0) {
      await A.page.waitForFunction(() => document.querySelector("[data-testid=talk-progress]")?.dataset.understood === "1", null, { timeout: 10000 });
      assert.equal(await A.page.getByTestId("talk-finish").count(), 0, "finish now comes after two answers");
    }
  }
  await A.page.getByTestId("talk-analysis").waitFor({ timeout: 10000 });
  assert.equal(await said("assistant"), 3);
  assert.equal(await A.page.evaluate(() => document.querySelectorAll("[data-testid=talk-analysis] [data-testid=talk-item][data-status=clear]").length), 9, "the nine, each with where it stands");
  assert.match(await A.page.getByTestId("talk-understood").innerText(), /Understood 9 of 9/);
  assert.equal(await A.page.getByTestId("talk-analysis").getAttribute("data-readiness"), "ready");
  assert.match(await talk.innerText(), /Shall I send it to GLOOBAL for review\?/);
  await tap(A.page.getByTestId("talk-apply"));
  await A.page.getByTestId("talk-applied").waitFor({ timeout: 10000 });
  await tap(talk.getByRole("button", { name: "Back" }).first());
  await A.page.waitForFunction(() => document.querySelector("[data-testid=project-applicant-panel] [data-testid=project-status]")?.dataset.state === "submitted", null, { timeout: 10000 });
  assert.equal(await A.page.getByTestId("project-talk-view").count(), 1, "the conversation stays readable");
  assert.match(await A.page.getByTestId("project-next-step").innerText(), /Waiting for GLOOBAL/);

  // ── GLOOBAL ──
  const R = await openPage({ account: REVIEWER, permissions: ["geolocation"], geolocation: { latitude: 19.07, longitude: 72.87 } });
  await installReview(R.context, world, REVIEWER.symbolId);
  await login(R.page, REVIEWER);
  await openProjects(R.page);
  await tap(R.page.getByTestId("open-review-desk"));
  await tap(R.page.getByTestId("desk-row").first());
  // The reviewer reads what the assistant found, and the conversation.
  await R.page.getByTestId("desk-talk").waitFor({ timeout: 10000 });
  assert.equal(await R.page.getByTestId("desk-talk").getByTestId("talk-analysis").getAttribute("data-readiness"), "ready");
  assert.equal(await R.page.getByTestId("desk-use-milestones").count(), 1);
  await tap(R.page.getByTestId("desk-talk-thread"));
  assert.equal(await R.page.evaluate(() => document.querySelectorAll("[data-testid=desk-talk] [data-testid=talk-message]").length), 5);
  await tap(R.page.getByTestId("desk-start"));
  // Wait for Start to finish: its answer clears the question box, so a
  // question typed before it lands would be wiped (this used to flake).
  await R.page.waitForFunction(() => document.querySelector("[data-testid=project-review-desk] [data-testid=project-status]")?.dataset.state === "under_review", null, { timeout: 10000 });
  // Who GLOOBAL buys the steel from: its first choice, confirmed in one tap.
  const seller = R.page.getByTestId("desk-seller-line");
  await seller.waitFor({ timeout: 10000 });
  assert.match(await seller.innerText(), /GLOOBAL WOULD BUY FROM[\s\S]*Sharma Steel & Cement[\s\S]*3\.2 km from the site/);
  assert.match(await R.page.getByTestId("desk-seller-excluded").innerText(), /Owner's Own Steel \(one of the applicant's own shops\)/);
  await tap(R.page.getByTestId("desk-seller-confirm"));
  await R.page.getByTestId("desk-seller-picked").waitFor({ timeout: 10000 });
  assert.match(await R.page.getByTestId("desk-seller-picked").innerText(), /Buying from Sharma Steel & Cement[\s\S]*GLOOBAL's choice/);
  await R.page.getByTestId("desk-question").fill("Who owns the land the bridge stands on?");
  await tap(R.page.getByTestId("desk-ask"));
  await R.page.waitForFunction(() => document.querySelector("[data-testid=project-review-desk] [data-testid=project-status]")?.dataset.state === "needs_info", null, { timeout: 10000 });

  // The applicant answers.
  await A.page.reload();
  await login(A.page, OWNER);
  await openProjects(A.page);
  await openProject(A.page);
  await A.page.getByTestId("project-question").waitFor({ timeout: 10000 });
  // The applicant sees which seller GLOOBAL picked, and cannot change it.
  assert.match(await A.page.getByTestId("plan-view-pick").innerText(), /GLOOBAL buys this from Sharma Steel & Cement · 3\.2 km from the site/);
  assert.equal(await A.page.getByTestId("desk-seller-confirm").count(), 0);
  await A.page.getByTestId("project-answer").fill("The panchayat; the letter is attached.");
  await tap(A.page.getByTestId("project-answer-send"));
  await A.page.waitForFunction(() => document.querySelector("[data-testid=project-applicant-panel] [data-testid=project-status]")?.dataset.state === "under_review", null, { timeout: 10000 });

  // Approve with 10,000 in the default three milestones.
  await R.page.reload();
  await login(R.page, REVIEWER);
  await openProjects(R.page);
  await tap(R.page.getByTestId("open-review-desk"));
  await tap(R.page.getByTestId("desk-row").first());
  await padFill(R.page, R.page.getByTestId("desk-amount"), "10000");
  await tap(R.page.getByTestId("desk-approve"));
  await R.page.waitForFunction(() => document.querySelectorAll("[data-testid=project-milestone]").length === 3, null, { timeout: 10000 });
  assert.deepEqual(await R.page.evaluate(() => [...document.querySelectorAll("[data-testid=project-milestone]")].map((e) => e.dataset.state)), ["due", "waiting", "waiting"]);

  // Mark paid without a payment: refused in the server's words.
  await tap(R.page.getByTestId("desk-mark-paid"));
  await R.page.getByTestId("desk-error").waitFor({ timeout: 10000 });
  assert.match(await R.page.getByTestId("desk-error").innerText(), /No payment of 4000\.00 INR/);
  // Pay on Send opens Send with the amount filled in.
  await tap(R.page.getByTestId("desk-pay"));
  await R.page.waitForFunction(() => /4,?000\.00/.test(document.body.innerText) && [...document.querySelectorAll("button")].some((b) => /^(Send|Simulate)\s/.test(b.textContent.trim())), null, { timeout: 20000 });
  // The payment exists now (made on Send); back at the desk, Mark paid works.
  world.payments.push({ amountMinor: 400000 });
  await R.page.reload();
  await login(R.page, REVIEWER);
  await openProjects(R.page);
  await tap(R.page.getByTestId("open-review-desk"));
  await tap(R.page.getByTestId("desk-row").first());
  await tap(R.page.getByTestId("desk-mark-paid"));
  await R.page.waitForFunction(() => document.querySelector("[data-testid=project-review-desk] [data-testid=project-status]")?.dataset.state === "funding", null, { timeout: 10000 });

  // The applicant sees it and is asked for the update.
  await A.page.reload();
  await login(A.page, OWNER);
  await openProjects(A.page);
  await openProject(A.page);
  await A.page.getByTestId("milestone-update").waitFor({ timeout: 10000 });
  assert.ok(!(await A.page.getByTestId("project-giving-closed").count()), "approved: people can give now");
  if (process.env.SHOT) {
    await A.page.screenshot({ path: process.env.SHOT + "-applicant.png" });
    await R.page.screenshot({ path: process.env.SHOT + "-desk.png" });
  }
  // The one 400 was asked for: the plan that did not add up. The 409 on
  // Mark paid before the payment is the same kind of answer.
  const unexpected = (list) => list.filter((e) => !/status of (400|409)/.test(e));
  assert.deepEqual(unexpected(A.errors), []);
  assert.deepEqual(unexpected(R.errors), []);
  await A.context.close();
  await R.context.close();
});
