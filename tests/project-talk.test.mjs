// tests/project-talk.test.mjs
//
// Hooman Projects: understand it first, then apply (server/lib/projectTalk.js,
// server/lib/aiChat.js), run on the real modules with in-memory models — the
// review module too, so applying is the real Submit with its four
// requirements.
//
// What is checked: the nine things to understand, asked about until each is
// clear (the weakest again, never the clear ones); "I don't know yet" kept
// as thin; the bar decided by the server from the nine, never by the AI;
// "clear" only with the applicant's own words as evidence; the plan's sum as
// a hard rule; finish now; the safety and daily limits; Groq with a stubbed
// API, and carrying on without it.
//
//   node --test tests/project-talk.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { modelClass, require, mongoose } from "./mem-models.mjs";

const { createProjectReview } = require("./lib/projectReview");
const talkLib = require("./lib/projectTalk");
const { createProjectTalk, redact, milestonesFromPlan, normaliseUnderstanding, readinessOf, contextOf, blankUnderstanding, supported, ITEMS, MAX_ANSWERS, PERSON_TALKS_PER_DAY } = talkLib;
const { createAiChat, parseJsonReply, GROQ_URL } = require("./lib/aiChat");

const GOOD = {
  problem: "Children in Kheri cannot reach the Rampur school for four months of the monsoon, when the river floods the only crossing.",
  people: "About 340 school children, and the 1,200 people of Kheri who cross daily to the market and the health centre.",
  work: "A steel footbridge, 40 metres long, on concrete piers, because a boat is unsafe in the flood and a road bridge costs ten times more.",
  person: "We surveyed the site with the panchayat engineer, collected two written quotes and cleared the path ourselves last month.",
  money: "Steel and cement are from the written quote by Sharma Fabricators in Alwar; labour is the panchayat's daily rate for 20 days. Nothing else is needed.",
  steps: "Twelve weeks: foundations in the first four, the steel span in the next five, decking and railings in the last three.",
  risks: "An early monsoon could stop the foundation work, so we start in February and store the materials in the school building.",
  after: "The panchayat maintains it from its yearly roads budget, and we will post photos and the school attendance numbers every month.",
};
const keyOf = (topic) => String(topic || "").split(":")[0];

function world({ env = {}, fetchImpl } = {}) {
  const Project = modelClass({ status: "draft", plan: [], review: undefined });
  const ProjectTalk = modelClass({ state: "talking", messages: [], understanding: null, analysis: null, provider: "practice", model: "", fellBack: false, aiCalls: 0, appliedAt: null, appliedAnyway: false });
  const BankAccount = modelClass();
  const FaceTemplate = modelClass();
  const Transaction = modelClass();
  const StaffMember = modelClass();
  const said = [];
  const fullEnv = { ADMIN_SYMBOL_IDS: "REVIEWER", ...env };
  let talk = null;
  const review = createProjectReview({
    Project, BankAccount, FaceTemplate, Transaction, StaffMember, env: fullEnv,
    notify: async (userId, m) => { said.push(m.title); },
    beforeSubmit: (p) => talk.gate(p),
  });
  talk = createProjectTalk({ Project, ProjectTalk, review, env: fullEnv, ai: createAiChat({ env: fullEnv, fetchImpl }) });
  const owner = { _id: new mongoose.Types.ObjectId(), symbolId: "OWNER" };
  const reviewer = { _id: new mongoose.Types.ObjectId(), symbolId: "REVIEWER" };
  const stranger = { _id: new mongoose.Types.ObjectId(), symbolId: "STRANGER" };
  const call = async (fn, user, id, body = {}) => {
    let status = 200; let json = null;
    const res = { status(s) { status = s; return res; }, json(b) { json = b; return res; } };
    await fn({ params: { id: String(id) }, authUser: user, body }, res);
    return { status, body: json };
  };
  let opened = false;
  async function project({ ready = true, plan, title = "River footbridge" } = {}) {
    const p = new Project({
      ownerId: owner._id, ownerSymbolId: owner.symbolId, title, category: "Infrastructure",
      summary: "A steel footbridge between Rampur and Kheri so children reach school in the monsoon.", place: "Rampur", countryIso: "IN",
      goalMinor: 5000000, goalCurrency: "INR", attachment: { filename: "quote.pdf" },
      plan: plan || [{ label: "Steel and cement", amountMinor: 3500000 }, { label: "Labour", amountMinor: 1500000 }],
      review: { state: "draft", timeline: [], questions: [], milestones: [] },
    });
    await p.save();
    if (ready && !opened) {
      opened = true;
      await BankAccount.create({ userId: owner._id, status: "open" });
      await FaceTemplate.create({ userId: owner._id });
    }
    return p;
  }
  const talkOf = (p) => w.ProjectTalk.rows.filter((t) => String(t.projectId) === String(p._id) && t.state !== "left").at(-1);
  const w = { Project, ProjectTalk, BankAccount, FaceTemplate, review, talk, owner, reviewer, stranger, call, project, said, talkOf };
  return w;
}

// Answer GLOBAL's fixed questions from a table keyed by item ("money", or
// "money:again" for the second time it is asked).
async function answerAll(w, p, table) {
  let r = await w.call(w.talk.handlers.start, w.owner, p._id);
  for (let i = 0; i < 40 && r.body.talk.state === "talking"; i++) {
    const topic = w.talkOf(p).messages.filter((m) => m.from === "assistant").at(-1).topic;
    const text = table[topic] != null ? table[topic] : table[keyOf(topic)];
    r = await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: text != null ? text : "ok" });
  }
  return r;
}
const statuses = (t) => Object.fromEntries(t.understanding.map((i) => [i.key, i.status]));

test("fixed questions: one per item, all nine clear, ready, and a yes sends it", async () => {
  const w = world();
  const p = await w.project();
  const first = await w.call(w.talk.handlers.start, w.owner, p._id);
  assert.equal(first.status, 201);
  assert.match(first.body.talk.messages[0].text, /take our time with "River footbridge"/);
  assert.equal(first.body.talk.understood, 0);
  assert.equal(first.body.talk.of, 9);
  const end = await answerAll(w, p, GOOD);
  const t = end.body.talk;
  assert.equal(t.state, "done");
  assert.equal(t.messages.filter((m) => m.from === "applicant").length, 8, "one question per item; It all fits is checked, not asked");
  assert.deepEqual(Object.values(statuses(t)), Array(9).fill("clear"));
  assert.equal(t.analysis.readiness, "ready");
  assert.equal(t.analysis.understood, 9);
  assert.equal(t.analysis.readinessWhy, "All nine are clear, and nothing contradicts.");
  assert.equal(t.analysis.understanding.find((i) => i.key === "money").evidence.slice(0, 20), GOOD.money.slice(0, 20), "the owner's own words are the evidence");
  assert.deepEqual(t.analysis.milestones, [{ label: "Steel and cement", percent: 70 }, { label: "Labour", percent: 30 }]);

  const applied = await w.call(w.talk.handlers.apply, w.owner, p._id);
  assert.equal(applied.status, 200);
  assert.equal(applied.body.review.state, "submitted");
  assert.match(p.review.timeline.at(-1).note, /ready for review \(9 of 9 clear\)/);
  assert.equal((await w.call(w.talk.handlers.start, w.owner, p._id)).body.code, "not_draft");
});

test("it asks again only about what is not yet clear, and an answer can make it clear", async () => {
  const w = world();
  const p = await w.project();
  const end = await answerAll(w, p, {
    ...GOOD, risks: "Rain.", after: "Panchayat.",
    "risks:again": "If the monsoon comes early we stop the foundations, store the steel in the school and finish the span after the rains.",
    "after:again": "The panchayat's roads committee looks after it from the yearly budget; we post photos and attendance every month.",
  });
  const asked = w.talkOf(p).messages.filter((m) => m.from === "assistant" && m.topic).map((m) => m.topic);
  assert.deepEqual(asked.filter((x) => x.endsWith(":again")), ["risks:again", "after:again"], "the clear ones are not asked twice");
  assert.equal(end.body.talk.analysis.readiness, "ready");
});

test("'I don't know yet' is kept, not guessed: thin, and the bar says almost", async () => {
  const w = world();
  const p = await w.project();
  const end = await answerAll(w, p, { ...GOOD, risks: "I don't know yet.", "risks:again": "Still not sure, honestly." });
  const t = end.body.talk;
  const risks = t.analysis.understanding.find((i) => i.key === "risks");
  assert.equal(risks.status, "thin");
  assert.equal(risks.note, "Doesn't know yet.");
  assert.equal(t.analysis.readiness, "almost");
  assert.equal(t.analysis.readinessWhy, "Thin: The risks.");
  const plain = await w.call(w.talk.handlers.apply, w.owner, p._id);
  assert.equal(plain.status, 409);
  assert.equal(plain.body.code, "not_ready");
  assert.match(plain.body.message, /Almost ready\. Thin: The risks\./);
  const anyway = await w.call(w.talk.handlers.apply, w.owner, p._id, { anyway: true });
  assert.equal(anyway.status, 200);
  assert.match(p.review.timeline.at(-1).note, /almost ready \(8 of 9 clear\) — sent anyway/);
});

test("a plan that doesn't add up is a contradiction, whatever is said", async () => {
  const w = world();
  const p = await w.project({ plan: [{ label: "Steel and cement", amountMinor: 3500000 }, { label: "Labour", amountMinor: 500000 }] });
  const s = await w.call(w.talk.handlers.start, w.owner, p._id);
  assert.equal(statuses(s.body.talk).money, "contradicting", "from the first moment");
  const end = await answerAll(w, p, GOOD);
  const a = end.body.talk.analysis;
  assert.equal(a.readiness, "not_ready");
  assert.equal(a.readinessWhy, "Doesn't fit: The money, It all fits.");
  assert.match(a.contradictions[0], /The money: The plan adds up to 40,000 INR but the goal is 50,000 INR\./);
});

test("finish now: the analysis as things stand, with what is still missing named", async () => {
  const w = world();
  const p = await w.project();
  await w.call(w.talk.handlers.start, w.owner, p._id);
  await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: GOOD.problem });
  const early = await w.call(w.talk.handlers.finishNow, w.owner, p._id);
  assert.equal(early.status, 409);
  assert.equal(early.body.code, "too_early");
  await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: GOOD.people });
  const r = await w.call(w.talk.handlers.finishNow, w.owner, p._id);
  assert.equal(r.status, 200);
  const a = r.body.talk.analysis;
  assert.equal(r.body.talk.state, "done");
  assert.equal(a.readiness, "not_ready");
  assert.equal(a.understood, 3, "the problem, who benefits, and it all fits");
  assert.match(a.readinessWhy, /^Missing: What will be done, Why this person, The money, The steps, The risks, Afterwards\.$/);
});

test("with the conversation on, the plain Submit asks to talk first; switched off, it works as before", async () => {
  const on = world();
  const p = await on.project();
  const r = await on.call(on.review.handlers.submit, on.owner, p._id);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "talk_first");
  const off = world({ env: { PROJECT_TALK: "off" } });
  const q = await off.project();
  assert.equal((await off.call(off.review.handlers.submit, off.owner, q._id)).status, 200);
  assert.equal((await off.call(off.talk.handlers.start, off.owner, q._id)).body.code, "talk_off");
});

test("the four requirements still hold when applying from the conversation", async () => {
  const w = world();
  const p = await w.project({ ready: false });
  await answerAll(w, p, GOOD);
  const r = await w.call(w.talk.handlers.apply, w.owner, p._id);
  assert.equal(r.body.code, "requirements");
  assert.equal(p.review.state, "draft");
  await w.BankAccount.create({ userId: w.owner._id, status: "open" });
  await w.FaceTemplate.create({ userId: w.owner._id });
  assert.equal((await w.call(w.talk.handlers.apply, w.owner, p._id)).status, 200);
});

test("only the owner talks; the owner and GLOOBAL's reviewers read it, nine items and all; nobody else does", async () => {
  const w = world();
  const p = await w.project();
  assert.equal((await w.call(w.talk.handlers.start, w.stranger, p._id)).status, 403);
  assert.equal((await w.call(w.talk.handlers.start, w.reviewer, p._id)).status, 403);
  await answerAll(w, p, GOOD);
  const asReviewer = await w.call(w.talk.handlers.read, w.reviewer, p._id);
  assert.equal(asReviewer.status, 200);
  assert.equal(asReviewer.body.items.length, 9);
  assert.equal(asReviewer.body.talk.analysis.understanding.length, 9);
  assert.equal(asReviewer.body.requirements, undefined);
  assert.equal((await w.call(w.talk.handlers.read, w.stranger, p._id)).status, 403);
});

test("limits: an open conversation is picked up; 3 a day per project; 5 a day per person", async () => {
  const w = world();
  const a = await w.project({ title: "A" });
  const s1 = await w.call(w.talk.handlers.start, w.owner, a._id);
  const s2 = await w.call(w.talk.handlers.start, w.owner, a._id);
  assert.equal(s1.body.talk.id, s2.body.talk.id, "carried on where it was left");
  const close = () => { w.ProjectTalk.rows.at(-1).state = "done"; };
  close();
  for (let i = 0; i < 2; i++) { assert.equal((await w.call(w.talk.handlers.start, w.owner, a._id)).status, 201); close(); }
  assert.equal((await w.call(w.talk.handlers.start, w.owner, a._id)).body.code, "talks_today");
  const b = await w.project({ title: "B" });
  for (let i = 0; i < PERSON_TALKS_PER_DAY - 3; i++) { assert.equal((await w.call(w.talk.handlers.start, w.owner, b._id)).status, 201); close(); }
  const c = await w.project({ title: "C" });
  const sixth = await w.call(w.talk.handlers.start, w.owner, c._id);
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.code, "person_talks_today");
});

// ── with Groq ─────────────────────────────────────────────────────────────

function groq(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const next = answers.shift();
    if (typeof next === "number") return { status: next, json: async () => ({ error: { message: "x" } }) };
    return { status: 200, json: async () => ({ choices: [{ message: { content: typeof next === "string" ? next : JSON.stringify(next) } }] }) };
  };
  return { calls, fetchImpl };
}
const allClear = (ev) => Object.fromEntries(ITEMS.map((i) => [i.key, { status: "clear", note: "", evidence: ev[i.key] || "steel footbridge between Rampur and Kheri" }]));

test("Groq: the nine kept up to date each turn; 'clear' needs the applicant's own words; the server decides ready", async () => {
  const g = groq([
    { say: "Namaste! Who crosses the river today, and how?", done: false, understanding: { problem: { status: "thin", note: "Needs who and how many", evidence: "" } } },
    "```json\n" + JSON.stringify({
      say: "Where do the steel prices come from?", done: false,
      understanding: {
        problem: { status: "clear", note: "", evidence: "Children walk 9 km around" },
        people: { status: "clear", note: "", evidence: "five thousand farmers in the district" },
      },
    }) + "\n```",
    { say: "Thank you — clear and well costed.", done: true, understanding: allClear({ problem: "Children walk 9 km around", money: "A written quote from Sharma Fabricators" }), analysis: { summary: "A footbridge so children reach school through the monsoon.", strengths: ["Two written quotes"], risks: ["Early monsoon"], openQuestions: ["Is a permit needed?"], milestones: [{ label: "Foundations", percent: 40 }, { label: "Span", percent: 35 }, { label: "Decking", percent: 26 }] }, readiness: "not_ready" },
  ]);
  const w = world({ env: { GROQ_API_KEY: "gsk_test" }, fetchImpl: g.fetchImpl });
  const p = await w.project();
  const s = await w.call(w.talk.handlers.start, w.owner, p._id);
  assert.equal(s.body.talk.provider, "groq");
  assert.equal(statuses(s.body.talk).problem, "thin");
  const typed = "Children walk 9 km around. Call me on 98765 43210 or write to rampur.school@gmail.com";
  const second = await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: typed });
  const st = statuses(second.body.talk);
  assert.equal(st.problem, "clear", "evidence found in what the applicant typed");
  assert.equal(st.people, "thin", "'five thousand farmers' was never said: not clear");
  assert.match(second.body.talk.understanding.find((i) => i.key === "people").note, /no words from the applicant back it up/);
  assert.equal(second.body.talk.messages.at(-1).text, "Where do the steel prices come from?", "JSON inside a code fence is still read");

  const end = await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: "A written quote from Sharma Fabricators." });
  const a = end.body.talk.analysis;
  assert.equal(end.body.talk.state, "done");
  assert.equal(a.readiness, "ready", "all nine clear with evidence: ready, whatever the AI's own 'not_ready' said");
  assert.equal(a.by, "groq:openai/gpt-oss-120b");
  assert.deepEqual(a.strengths, ["Two written quotes"]);
  assert.equal(a.milestones.reduce((x, m) => x + m.percent, 0), 100);

  const sys = g.calls[0].body.messages[0];
  assert.equal(g.calls[0].url, GROQ_URL);
  assert.equal(g.calls[0].headers.Authorization, "Bearer gsk_test");
  assert.equal(sys.role, "system");
  for (const item of ITEMS) assert.ok(sys.content.includes(`${item.key} — ${item.label}`), `the prompt names ${item.label}`);
  const sent = JSON.stringify(g.calls[1].body.messages);
  assert.ok(!sent.includes("98765") && !sent.includes("rampur.school@gmail.com"), "the AI never sees the phone number or email");
  assert.equal(w.talkOf(p).messages.find((m) => m.from === "applicant").text, typed, "kept as typed for the owner and reviewers");
});

test("Groq: calling a plan that doesn't add up 'clear' changes nothing — it is a contradiction", async () => {
  const g = groq([{ say: "Hello! Tell me about it.", done: false }, { say: "All good.", done: true, understanding: allClear({}), analysis: { summary: "Fine." } }]);
  const w = world({ env: { GROQ_API_KEY: "k" }, fetchImpl: g.fetchImpl });
  const p = await w.project({ plan: [{ label: "Everything", amountMinor: 100 }] });
  await w.call(w.talk.handlers.start, w.owner, p._id);
  const r = await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: "It is a steel footbridge between Rampur and Kheri." });
  const st = statuses(r.body.talk);
  assert.equal(st.money, "contradicting");
  assert.equal(st.fits, "contradicting");
  assert.equal(r.body.talk.analysis.readiness, "not_ready");
  assert.match(g.calls[0].body.messages[0].content, /Plan adds up to the goal: NO/);
});

test("Groq stops answering: GLOOBAL's questions carry on with only what is not yet clear", async () => {
  const g = groq([
    { say: "What problem does it solve?", done: false },
    { say: "And who benefits?", done: false, understanding: { problem: { status: "clear", evidence: GOOD.problem.slice(0, 60) } } },
    429,
  ]);
  const w = world({ env: { GROQ_API_KEY: "k" }, fetchImpl: g.fetchImpl });
  const p = await w.project();
  await w.call(w.talk.handlers.start, w.owner, p._id);
  await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: GOOD.problem });
  const r = await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: GOOD.people });
  const t = r.body.talk;
  assert.equal(t.fellBack, true);
  const last = w.talkOf(p).messages.at(-1);
  assert.match(last.text, /^\(GLOOBAL's assistant is busy/);
  assert.equal(last.topic, "people", "problem is clear already, so it is not asked again");
  const end = await answerAll(w, p, GOOD);
  assert.equal(end.body.talk.analysis.readiness, "ready");
  assert.equal(end.body.talk.analysis.by, "practice");
  assert.equal(g.calls.length, 3);
});

test("Groq: finish now, and the safety limit, both tell it to finish", async () => {
  const g = groq([{ say: "Q1?", done: false }, { say: "Q2?", done: false }, { say: "Q3?", done: false }, { say: "Here is where it stands.", done: true, understanding: { problem: { status: "clear", evidence: "children cannot cross" } }, analysis: { summary: "Early days." } }]);
  const w = world({ env: { GROQ_API_KEY: "k" }, fetchImpl: g.fetchImpl });
  const p = await w.project();
  await w.call(w.talk.handlers.start, w.owner, p._id);
  await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: "The children cannot cross in the monsoon." });
  await w.call(w.talk.handlers.sayTo, w.owner, p._id, { text: "Everyone in Kheri." });
  const r = await w.call(w.talk.handlers.finishNow, w.owner, p._id);
  assert.match(JSON.stringify(g.calls.at(-1).body.messages.at(-1)), /asked to finish now/);
  assert.equal(r.body.talk.state, "done");
  assert.equal(r.body.talk.messages.at(-1).text, "Here is where it stands.");
  assert.equal(r.body.talk.analysis.readiness, "not_ready");

  const many = [];
  for (let i = 0; i < MAX_ANSWERS; i++) many.push({ say: `Question ${i + 2}?`, done: false });
  many[MAX_ANSWERS - 1] = { say: "Done.", done: true, analysis: { summary: "Long talk." } };
  const g2 = groq([{ say: "Question 1?", done: false }, ...many]);
  const w2 = world({ env: { GROQ_API_KEY: "k" }, fetchImpl: g2.fetchImpl });
  const p2 = await w2.project();
  let x = await w2.call(w2.talk.handlers.start, w2.owner, p2._id);
  for (let i = 0; i < MAX_ANSWERS && x.body.talk.state === "talking"; i++) x = await w2.call(w2.talk.handlers.sayTo, w2.owner, p2._id, { text: `answer ${i + 1}` });
  assert.equal(x.body.talk.state, "done");
  assert.match(JSON.stringify(g2.calls.at(-1).body.messages.at(-1)), /that was the last answer allowed/);
});

// ── the pieces ────────────────────────────────────────────────────────────

test("aiChat: off without a key, a daily cap, and a retry without JSON mode for a model that refuses it", async () => {
  const off = createAiChat({ env: {} });
  assert.equal(off.provider, "practice");
  assert.deepEqual(await off.complete({ system: "x", messages: [] }), { ok: false, code: "off", message: "No AI is connected." });
  assert.equal(createAiChat({ env: { GROQ_API_KEY: "k", PROJECT_AI: "practice" } }).provider, "practice");
  const g = groq([400, { say: "hi" }, { say: "two" }]);
  const ai = createAiChat({ env: { GROQ_API_KEY: "k", AI_DAILY_CALLS: "2", GROQ_MODEL: "openai/gpt-oss-20b" }, fetchImpl: g.fetchImpl });
  assert.equal((await ai.complete({ system: "s", messages: [{ role: "user", content: "u" }] })).ok, true);
  assert.ok(g.calls[0].body.response_format && !g.calls[1].body.response_format);
  assert.equal(g.calls[1].body.model, "openai/gpt-oss-20b");
  assert.equal((await ai.complete({ system: "s", messages: [] })).ok, true);
  assert.equal((await ai.complete({ system: "s", messages: [] })).code, "daily_budget");
  const down = createAiChat({ env: { GROQ_API_KEY: "k" }, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal((await down.complete({ system: "s", messages: [] })).code, "unavailable");
  assert.deepEqual(parseJsonReply('Sure! {"say":"a","done":false} hope that helps'), { say: "a", done: false });
  assert.equal(parseJsonReply("nothing"), null);
});

test("the bar, the evidence check, blanking and milestones", () => {
  const u = (map) => ({ ...Object.fromEntries(ITEMS.map((i) => [i.key, { status: "clear" }])), ...map });
  assert.equal(readinessOf(u({})), "ready");
  assert.equal(readinessOf(u({ risks: { status: "thin" }, after: { status: "thin" } })), "almost");
  assert.equal(readinessOf(u({ risks: { status: "thin" }, after: { status: "thin" }, steps: { status: "thin" } })), "not_ready", "three thin is too many");
  assert.equal(readinessOf(u({ person: { status: "missing" } })), "not_ready");
  assert.equal(readinessOf(u({ fits: { status: "contradicting" } })), "not_ready");
  assert.equal(readinessOf(blankUnderstanding()), "not_ready");

  assert.equal(supported("two written quotes", "We have two written quotes from Alwar"), true);
  assert.equal(supported("five thousand farmers", "We have two written quotes"), false);
  assert.equal(supported("", "anything"), false);
  const ctx = contextOf({ title: "T", plan: [{ label: "A", amountMinor: 100 }], goalMinor: 100, goalCurrency: "INR" });
  const n = normaliseUnderstanding({ problem: { status: "clear", evidence: "made up words entirely" }, people: { status: "great" } }, blankUnderstanding(), "the real answer", ctx);
  assert.equal(n.problem.status, "thin");
  assert.equal(n.people.status, "missing", "an unknown status keeps what was there");

  assert.equal(redact("Aadhaar 1234 5678 9012, phone +91-98765-43210, goal 50,000"), "Aadhaar [number removed], phone +[number removed], goal 50,000");
  assert.equal(redact("mail me: a.b+c@x.co.in"), "mail me: [email removed]");
  const many = milestonesFromPlan([10, 20, 30, 15, 25, 50].map((x, i) => ({ label: `L${i + 1}`, amountMinor: x * 100 })));
  assert.equal(many.length, 3);
  assert.equal(many.reduce((a, m) => a + m.percent, 0), 100);
  assert.deepEqual(milestonesFromPlan([]).map((m) => m.percent), [40, 30, 30]);
  assert.equal(talkLib.judgeAnswer("risks", "मुझे अभी पता नहीं", ctx).note, "Doesn't know yet.");
});
