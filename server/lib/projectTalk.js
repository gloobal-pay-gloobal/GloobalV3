// server/lib/projectTalk.js
//
// ── HOOMAN PROJECTS: UNDERSTAND IT FIRST, THEN APPLY ─────────────────────
//
// Before a project goes to GLOOBAL's reviewers, its owner talks it over with
// Hooman Intelligence, GLOOBAL's own assistant. The point is to UNDERSTAND
// the project, so the conversation is not a fixed number of questions: it
// works through nine things it must understand, and after every answer it
// asks about the weakest one — a contradiction first.
//
//   1 The problem         who exactly, where, how many, how bad today
//   2 Who benefits        a real group and rough number; what changes for them
//   3 What will be done   what gets built, bought or run, and why this way
//   4 Why this person     what they have done, experience, own effort put in
//   5 The money           every plan line explained — what kind of cost it
//                         is (material, tech, people, other) with its
//                         quantities — where prices come from, nothing missing
//   6 The steps           what is finished at each step, matching the plan
//   7 The risks           what could go wrong and what they would do
//   8 Afterwards          who keeps it running; how results will be shown
//   9 It all fits         answers match the description and plan; believable
//
// Each one is clear, thin, missing or contradicting, with a note and the
// applicant's own words as evidence. "I don't know yet" is a fine answer: it
// is written down (thin, "doesn't know yet") rather than guessed.
//
// THE BAR — decided here, by the server, from those nine (never by the AI's
// say-so):
//   ready      all nine clear, nothing contradicting
//   almost     one or two thin; nothing missing or contradicting
//   not_ready  anything missing or contradicting, or three or more thin
// Only "ready" offers "Shall I send it?". The owner may still send it anyway
// — for now Hooman Intelligence only ADVISES; people at GLOOBAL approve,
// decline, set the amount and pay. The hard rules stay hard rules, checked
// by code: the plan adds up to the goal (or The money and It all fits
// cannot be clear); The money is not clear until every line says what kind
// of cost it is and, when there are materials or tech to buy, the site is
// pinned (GLOOBAL buys those itself, from sellers near it —
// lib/projectSuppliers.js); a document, GLOOBAL Bank open, the face check
// (lib/projectReview).
//
// Taking time: a conversation can pause and carry on over days; the owner
// sees "Understood n of 9" and what is still open, and can "finish now" to
// see where it stands. Safety limits only: 30 answers in one conversation,
// 3 conversations per project and 5 per person a day.
//
// Who talks is lib/aiChat.js: Groq when GROQ_API_KEY is set, otherwise
// GLOOBAL's own questions ("practice": one per item, then once more for
// each that is still thin) — the same screens and the same bar. If the AI
// stops answering part-way, the fixed questions carry on with what is not
// yet clear.
//
// The AI is sent the project's own text, goal and plan, and the
// conversation — never documents, photos, ID, the face check or the
// account; emails and runs of nine or more digits are blanked first. An
// item the AI calls clear must quote words the applicant (or the project
// text) actually used; otherwise it is held at thin.
//
//   PROJECT_TALK=off  Submit works as before, without the conversation.

const { parseJsonReply } = require('./aiChat');

const MAX_ANSWERS = 30;            // a safety limit, not a target
const TALKS_PER_DAY = 3;           // new conversations per project per UTC day
const PERSON_TALKS_PER_DAY = 5;    // new conversations per person per UTC day
const ANSWER_MAX = 1500;
const FINISH_AFTER = 2;            // answers before "finish now" is offered
const DAY = 86400000;
const STATUSES = ['clear', 'thin', 'missing', 'contradicting'];
const STATUS_WORDS = { clear: 'Clear', thin: 'Thin', missing: 'Missing', contradicting: "Doesn't fit" };
const READINESS_WORDS = { ready: 'Ready for review', almost: 'Almost ready', not_ready: 'Not ready yet' };

const ITEMS = [
  {
    key: 'problem', label: 'The problem', clear: 'Who exactly, where, how many, and how bad it is today',
    ask: (c) => `Let's take our time with "${c.title}", so GLOOBAL understands it properly. First: what problem does it solve — for whom, where, and how bad is it today?`,
    again: 'Can you make the problem more concrete — who exactly, where, and what happens to them today?',
  },
  {
    key: 'people', label: 'Who benefits', clear: 'A real group and rough number, and how they will feel the change',
    ask: () => 'Who will benefit, roughly how many people, and what will change for them?',
    again: 'Roughly how many people, and what exactly changes in their day?',
  },
  {
    key: 'work', label: 'What will be done', clear: 'Exactly what gets built, bought or run, and why this way',
    ask: () => 'What exactly will be built, bought or run — and why this way rather than another?',
    again: 'Describe what will physically exist or happen once it is done, and why you chose it.',
  },
  {
    key: 'person', label: 'Why this person', clear: 'What they have already done, their experience, what they put in themselves',
    ask: () => 'What have you already done towards it yourself, and what experience do you bring?',
    again: 'Is there anything you have already paid for, built, tested or arranged yourself?',
  },
  {
    key: 'money', label: 'The money', clear: 'Every plan line says what kind of cost it is (material, tech, people or other) with its quantities, where each price comes from, nothing missing',
    ask: (c) => (c.planText
      ? `Your plan spends ${c.goalText} on: ${c.planText}. Where does each price come from — a quote, a shop, your own estimate — and is anything missing?${c.unkinded.length ? ` (In the plan, say what kind of cost each line is — material, tech, people's wages or other: ${c.unkinded.join(', ')}.)` : ''}`
      : `How will the ${c.goalText || 'money'} be spent? Name each cost — materials, tech, people's wages — and where its price comes from.`),
    again: 'For each line of the plan: where does the price come from, and is anything left out — transport, tools, permits?',
  },
  {
    key: 'steps', label: 'The steps', clear: 'What is finished at each step, matching the plan lines',
    ask: () => 'What will be finished at each step, and roughly how long will each take?',
    again: 'Which part of the plan does each step spend, and what can people see when that step is done?',
  },
  {
    key: 'risks', label: 'The risks', clear: 'What could go wrong and what they would do',
    ask: () => 'What could go wrong, and what would you do if it did?',
    again: 'Pick the most likely problem — what exactly would you do that day?',
  },
  {
    key: 'after', label: 'Afterwards', clear: 'Who keeps it running and how results will be shown',
    ask: () => 'When the money is spent, who keeps it running, and how will people see that it worked?',
    again: 'Who exactly looks after it after the last milestone, and how is that paid for?',
  },
  {
    key: 'fits', label: 'It all fits', clear: 'Answers match the description and plan, with no contradictions and believable numbers',
    ask: null,
    again: null,
  },
];
const ITEM = Object.fromEntries(ITEMS.map((i) => [i.key, i]));
const ASKED = ITEMS.filter((i) => i.ask);

const clip = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
// "I don't know yet", in English, Hinglish and Hindi. (\b only knows Latin
// letters, so the Devanagari phrases stand without it.)
const DONT_KNOW = /\b(don'?t know|do not know|not sure|no idea|not yet decided|pata nahi|nahi pata|maloom nahi)\b|पता नहीं|मालूम नहीं/i;

// Blank what must never reach an outside AI: emails, and runs of nine or
// more digits (phone, Aadhaar, account and card numbers).
function redact(s) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email removed]')
    .replace(/(?:\d[\s-]?){9,}/g, '[number removed]');
}

function money(minor, currency) {
  const n = Number(minor || 0) / 100;
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
}

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const SELLER_KINDS = ['material', 'tech'];

// One plan line in words, with its kind and details.
function lineText(l, currency) {
  const amount = money(l.amountMinor, currency);
  if (SELLER_KINDS.includes(l.kind)) return `${l.label} — ${l.kind}: ${qty(l.quantity)} ${l.unit || ''}${l.quality ? `, ${l.quality}` : ''} (${amount})`;
  if (l.kind === 'human') return `${l.label} — people's wages: ${l.people} × ${l.days} days × ${money(l.rateMinor, currency)} a day (${amount})`;
  if (l.kind === 'other') return `${l.label} — other (${amount})`;
  return `${l.label} (${amount})`;
}

// What the conversation knows about the project.
function contextOf(project) {
  const plan = (project.plan || []).map((raw) => {
    const l = raw && raw.toObject ? raw.toObject() : (raw || {});
    return {
      label: clip(l.label, 80), amountMinor: Number(l.amountMinor) || 0, kind: l.kind || '',
      quantity: Number(l.quantity) || 0, unit: clip(l.unit, 20), quality: clip(l.quality, 120),
      people: Number(l.people) || 0, days: Number(l.days) || 0, rateMinor: Number(l.rateMinor) || 0,
    };
  });
  const planSum = plan.reduce((a, l) => a + l.amountMinor, 0);
  const goalMinor = Number(project.goalMinor) || 0;
  const needsSite = plan.some((l) => SELLER_KINDS.includes(l.kind));
  return {
    title: clip(project.title, 140),
    category: clip(project.category, 60),
    summary: clip(project.summary, 5000),
    place: clip(project.place, 120),
    countryIso: clip(project.countryIso, 3),
    currency: clip(project.goalCurrency, 8),
    goalMinor,
    goalText: goalMinor ? money(goalMinor, project.goalCurrency) : '',
    plan,
    planSum,
    planText: plan.map((l) => lineText(l, project.goalCurrency)).join('; '),
    planOk: goalMinor > 0 && plan.length > 0 && planSum === goalMinor,
    // Lines that do not yet say what kind of cost they are.
    unkinded: plan.filter((l) => !l.kind).map((l) => l.label),
    needsSite,
    hasSite: Boolean(project.site && Number.isFinite(Number(project.site.lat))),
    hasDocument: Boolean(project.attachment),
  };
}

// ── the nine ─────────────────────────────────────────────────────────────

function blankUnderstanding() {
  return Object.fromEntries(ITEMS.map((i) => [i.key, { status: 'missing', note: '', evidence: '' }]));
}

// The hard rule the code checks, whatever anyone says: a plan that does not
// add up to the goal is a contradiction in The money and in It all fits.
//
// And The money is not clear — thin at best — until every line says what
// kind of cost it is, and, when GLOOBAL has materials or tech to buy, the
// site is pinned so it can find sellers near it.
function applyHardRules(u, ctx) {
  if (!ctx.planOk) {
    const why = ctx.plan.length
      ? `The plan adds up to ${money(ctx.planSum, ctx.currency)} but the goal is ${ctx.goalText || 'not set'}.`
      : 'There is no plan yet: what the money is for, line by line.';
    for (const key of ['money', 'fits']) {
      u[key] = { ...u[key], status: 'contradicting', note: why };
    }
    return u;
  }
  const short = [];
  if (ctx.unkinded && ctx.unkinded.length) short.push(`Say in the plan what kind of cost each line is — material, tech, people or other: ${ctx.unkinded.join(', ')}.`);
  if (ctx.needsSite && !ctx.hasSite) short.push('Pin the project site under the plan: GLOOBAL buys the materials itself, from sellers near it.');
  if (short.length && u.money && u.money.status === 'clear') {
    u.money = { ...u.money, status: 'thin', note: clip(short.join(' '), 240) };
  }
  return u;
}

// Words of `evidence` that appear in what was actually said or written.
function supported(evidence, corpus) {
  const tokens = String(evidence || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  if (!tokens.length) return false;
  const hay = String(corpus || '').toLowerCase();
  return tokens.filter((t) => hay.includes(t)).length / tokens.length >= 0.6;
}

// The AI's view of the nine, checked: known statuses only, short notes, and
// "clear" only with evidence found in the applicant's words or the project.
function normaliseUnderstanding(raw, previous, corpus, ctx) {
  const out = {};
  for (const item of ITEMS) {
    const prev = (previous && previous[item.key]) || { status: 'missing', note: '', evidence: '' };
    const got = raw && typeof raw === 'object' ? raw[item.key] : null;
    let status = got && STATUSES.includes(got.status) ? got.status : prev.status;
    let note = got ? clip(got.note, 200) : prev.note;
    const evidence = got ? clip(got.evidence, 200) : prev.evidence;
    if (status === 'clear' && !supported(evidence, corpus)) {
      status = 'thin';
      note = clip(`${note ? `${note} ` : ''}(Not marked clear: no words from the applicant back it up.)`, 240);
    }
    out[item.key] = { status, note, evidence };
  }
  return applyHardRules(out, ctx);
}

// The bar.
function readinessOf(u) {
  const st = ITEMS.map((i) => (u[i.key] || {}).status || 'missing');
  if (st.some((s) => s === 'missing' || s === 'contradicting')) return 'not_ready';
  const thin = st.filter((s) => s === 'thin').length;
  return thin === 0 ? 'ready' : thin <= 2 ? 'almost' : 'not_ready';
}
function readinessWhyOf(u) {
  const named = (status) => ITEMS.filter((i) => (u[i.key] || {}).status === status).map((i) => i.label);
  const parts = [];
  const contra = named('contradicting');
  const missing = named('missing');
  const thin = named('thin');
  if (contra.length) parts.push(`Doesn't fit: ${contra.join(', ')}.`);
  if (missing.length) parts.push(`Missing: ${missing.join(', ')}.`);
  if (thin.length) parts.push(`Thin: ${thin.join(', ')}.`);
  return parts.length ? parts.join(' ') : 'All nine are clear, and nothing contradicts.';
}
function understandingList(u) {
  return ITEMS.map((i) => ({ key: i.key, label: i.label, clear: i.clear, status: (u && u[i.key] && u[i.key].status) || 'missing', note: (u && u[i.key] && u[i.key].note) || '', evidence: (u && u[i.key] && u[i.key].evidence) || '' }));
}

// Milestones that follow the plan: one per line when there are few, the
// lines grouped into three steps when there are many. Percent, adding to 100.
function milestonesFromPlan(plan) {
  const lines = (plan || []).filter((l) => l.amountMinor > 0);
  const total = lines.reduce((a, l) => a + l.amountMinor, 0);
  if (!lines.length || !total) return [{ label: 'To start', percent: 40 }, { label: 'Halfway', percent: 30 }, { label: 'To finish', percent: 30 }];
  let groups;
  if (lines.length <= 4) groups = lines.map((l) => [l]);
  else {
    groups = [[], [], []];
    let run = 0;
    for (const l of lines) {
      const at = Math.min(2, Math.floor((run / total) * 3));
      groups[at].push(l);
      run += l.amountMinor;
    }
    groups = groups.filter((g) => g.length);
  }
  const out = groups.map((g) => ({
    label: clip(g.map((l) => l.label).join(', '), 80),
    percent: Math.max(1, Math.round((g.reduce((a, l) => a + l.amountMinor, 0) / total) * 100)),
  }));
  fixTo100(out);
  return out;
}
function fixTo100(list) {
  const sum = list.reduce((a, m) => a + m.percent, 0);
  if (sum !== 100 && list.length) {
    const big = list.reduce((b, m, i) => (m.percent > list[b].percent ? i : b), 0);
    list[big].percent += 100 - sum;
  }
  return list;
}

// The analysis the applicant and the reviewers read. Readiness and the
// checklist are the server's; the AI (when there is one) adds the summary,
// strengths, risks, questions and milestones.
function buildAnalysis(u, ctx, extra, by) {
  const x = extra && typeof extra === 'object' ? extra : {};
  const list = (v) => (Array.isArray(v) ? v : []).map((s) => clip(s, 240)).filter(Boolean).slice(0, 6);
  let milestones = (Array.isArray(x.milestones) ? x.milestones : [])
    .map((m) => ({ label: clip(m && m.label, 80), percent: Math.round(Number(m && m.percent)) }))
    .filter((m) => m.label && m.percent > 0)
    .slice(0, 6);
  const sum = milestones.reduce((a, m) => a + m.percent, 0);
  if (milestones.length < 2 || sum < 95 || sum > 105) milestones = milestonesFromPlan(ctx.plan);
  else fixTo100(milestones);
  const items = understandingList(u);
  const readiness = readinessOf(u);
  const open = items.filter((i) => i.status !== 'clear');
  const strengths = list(x.strengths);
  if (!strengths.length) {
    if (ctx.planOk) strengths.push('The plan adds up to the goal.');
    if (ctx.plan.length >= 2) strengths.push(`The money is split into ${ctx.plan.length} clear lines.`);
    if (u.person && u.person.status === 'clear') strengths.push('Work has already started.');
    if (ctx.hasDocument) strengths.push('A document or photo is attached.');
  }
  const risks = list(x.risks);
  if (!risks.length && u.risks && u.risks.evidence && u.risks.status === 'clear') risks.push(clip(`Named by the owner: ${u.risks.evidence}`, 240));
  return {
    summary: clip(x.summary, 700) || clip(`${ctx.title}${ctx.place ? ` (${ctx.place})` : ''}: ${(u.problem && u.problem.evidence) || ctx.summary.split(/(?<=[.!?।])\s/)[0] || ''}`, 700),
    understanding: items,
    understood: items.filter((i) => i.status === 'clear').length,
    of: items.length,
    readiness,
    readinessLabel: READINESS_WORDS[readiness],
    readinessWhy: readinessWhyOf(u),
    strengths,
    gaps: open.filter((i) => i.status !== 'contradicting').map((i) => `${i.label}: ${i.note || (i.status === 'missing' ? 'not covered yet' : 'needs more')}`),
    contradictions: open.filter((i) => i.status === 'contradicting').map((i) => `${i.label}: ${i.note}`),
    risks,
    openQuestions: list(x.openQuestions).length ? list(x.openQuestions) : open.filter((i) => ITEM[i.key].again).map((i) => ITEM[i.key].again),
    milestones,
    by,
  };
}

// Fixed-question judgement of one item from what was answered to it.
function judgeAnswer(key, text, ctx) {
  const said = String(text || '').trim();
  const evidence = clip(said, 200);
  if (!said) return { status: 'missing', note: 'Not answered.', evidence: '' };
  if (DONT_KNOW.test(said) && words(said) < 25) return { status: 'thin', note: "Doesn't know yet.", evidence };
  if (key === 'money' && !ctx.planOk) return { status: 'contradicting', note: '', evidence };
  if (words(said) >= 12) return { status: 'clear', note: '', evidence };
  return { status: 'thin', note: 'Short answer; needs more.', evidence };
}

function systemPrompt(ctx) {
  const plan = ctx.plan.length ? ctx.plan.map((l) => `- ${redact(lineText(l, ctx.currency))}`).join('\n') : '(no plan lines yet)';
  return [
    "You are Hooman Intelligence, GLOOBAL's own project assistant. GLOOBAL funds Hooman Projects — work that helps people — and pays in milestones. You are talking with the person who wants funding for the project below, BEFORE it goes to GLOOBAL's human reviewers. Take your time: your job is to UNDERSTAND the project, honestly, not to get through questions.",
    '',
    'How GLOOBAL pays, so you understand the plan: every plan line is one kind of cost. "material" (cement, steel, bricks) and "tech" (laptops, solar panels) are bought by GLOOBAL itself from sellers on GLOOBAL Bazaar near the project site — GLOOBAL chooses the seller, never the applicant, so do not ask them which shop. "people" lines are wages: people × days × a day\'s pay, paid to each worker\'s GLOOBAL ID. "other" is paid against receipts. Check that quantities are believable for the work (how much cement for that length of road, how many workers for how many days).',
    '',
    'You must understand these nine things. Keep a status for each — "clear", "thin", "missing" or "contradicting" — with a short note and, as evidence, the applicant\'s own words (or words from the project text) that show it:',
    ...ITEMS.map((i, n) => `${n + 1}. ${i.key} — ${i.label}: clear means ${i.clear.toLowerCase()}.`),
    '',
    'Rules:',
    '- After every answer, update all nine, then ask ONE short question (at most two sentences) about the weakest item. A contradiction comes first (for example "20 workers" when the labour line pays for 5).',
    '- Plain, warm, simple words. Reply in the language the person writes in. Do not ask what the project text already makes clear.',
    '- "I don\'t know yet" is a good, honest answer: mark that item "thin" with the note "doesn\'t know yet: <what>", and move on. Never guess for them.',
    '- Mark an item "clear" only when the person\'s own words (or the project text) really show it, and put those words in "evidence".',
    '- You do not decide funding; people at GLOOBAL do. Never promise money, amounts or approval. Never ask for ID numbers, bank or card details, passwords, OTPs or document numbers.',
    '- Finish ("done": true) when all nine are clear, or when nothing more can be learned now.',
    '',
    'Answer ONLY with one JSON object, no other text:',
    '{"say": "<your next question, or when done 2-3 sentences on what you found>", "understanding": {"problem": {"status": "...", "note": "...", "evidence": "..."}, ... all nine keys ...}, "done": false}',
    'When done also add: "analysis": {"summary": "<the project in plain words, 2-3 sentences>", "strengths": ["..."], "risks": ["..."], "openQuestions": ["<what a reviewer should still ask>"], "milestones": [{"label": "<a step of the work>", "percent": 40}]} — 2 to 5 milestones that follow the plan, percents adding up to 100.',
    '',
    'THE PROJECT (written by the applicant):',
    `Title: ${redact(ctx.title)}`,
    `Category: ${ctx.category}`,
    ctx.place ? `Place: ${redact(ctx.place)}${ctx.countryIso ? `, ${ctx.countryIso}` : ''}` : ctx.countryIso ? `Country: ${ctx.countryIso}` : '',
    `Funding goal: ${ctx.goalText || '(not set yet)'}`,
    `Plan:\n${plan}`,
    `Plan adds up to the goal: ${ctx.planOk ? 'yes' : 'NO — that is a contradiction to raise'}`,
    ctx.unkinded.length ? `Lines that do not say their kind yet (ask them to set it in the plan): ${ctx.unkinded.map((l) => redact(l)).join(', ')}` : '',
    ctx.needsSite ? `Project site pinned on the map: ${ctx.hasSite ? 'yes' : 'NO — ask them to pin it under the plan, so GLOOBAL can find sellers near it'}` : '',
    `Document or photo attached: ${ctx.hasDocument ? 'yes' : 'no'}`,
    `Description:\n${redact(ctx.summary)}`,
  ].filter((l) => l !== '').join('\n');
}

function createProjectTalk(deps) {
  const { Project, ProjectTalk, ai, review, env = process.env, now = () => Date.now() } = deps;
  const switchedOn = () => String(env.PROJECT_TALK || '').trim().toLowerCase() !== 'off';

  const refuse = (res, status, message, code) => res.status(status).json({ success: false, ...(code ? { code } : {}), message });
  const isDraft = (project) => !project.review || project.review.state === 'draft';
  const latest = (projectId) => ProjectTalk.findOne({ projectId, state: { $ne: 'left' } }).sort({ createdAt: -1 });
  const answersIn = (talk) => (talk.messages || []).filter((m) => m.from === 'applicant').length;
  const today = () => new Date(Math.floor(now() / DAY) * DAY);

  function out(talk) {
    if (!talk) return null;
    const t = talk.toObject ? talk.toObject() : talk;
    const items = understandingList(t.understanding || blankUnderstanding());
    const answers = answersIn(t);
    return {
      id: String(t._id),
      state: t.state,
      messages: (t.messages || []).map((m) => ({ from: m.from, text: m.text, at: m.at })),
      understanding: items,
      understood: items.filter((i) => i.status === 'clear').length,
      of: items.length,
      analysis: t.analysis || null,
      provider: t.provider,
      model: t.model || '',
      fellBack: Boolean(t.fellBack),
      startedAt: t.createdAt,
      appliedAt: t.appliedAt,
      appliedAnyway: Boolean(t.appliedAnyway),
      answers,
      answersLeft: Math.max(0, MAX_ANSWERS - answers),
      canFinish: t.state === 'talking' && answers >= FINISH_AFTER,
    };
  }

  // Everything the applicant said, plus the project's own text: what
  // evidence has to be found in.
  const corpusOf = (talk, ctx) => [ctx.title, ctx.summary, ctx.place, ctx.planText, ...(talk.messages || []).filter((m) => m.from === 'applicant').map((m) => m.text)].join('\n');

  function finish(talk, ctx, closing, extra, by) {
    const u = applyHardRules({ ...blankUnderstanding(), ...(talk.understanding || {}) }, ctx);
    talk.understanding = u;
    talk.analysis = buildAnalysis(u, ctx, extra, by);
    const closingWords = talk.analysis.readiness === 'ready'
      ? 'I understand it well now: all nine are clear. It reads ready for GLOOBAL\'s reviewers.'
      : talk.analysis.readiness === 'almost'
        ? `I understand most of it. ${talk.analysis.readinessWhy} A reviewer will probably ask about those.`
        : `There's more to understand before a reviewer can judge it. ${talk.analysis.readinessWhy}`;
    talk.messages.push({ from: 'assistant', text: clip(closing, 4000) || closingWords, at: new Date(now()) });
    talk.state = 'done';
    talk.markModified('understanding');
    talk.markModified('analysis');
  }

  // GLOOBAL's own questions: each item once, then once more for each that is
  // still not clear; an answer is judged against the item it answered.
  function practiceTurn(talk, ctx, { mustFinish = false, finishNow = false } = {}) {
    const u = { ...blankUnderstanding(), ...(talk.understanding || {}) };
    const msgs = talk.messages || [];
    const lastAsk = [...msgs].reverse().find((m) => m.from === 'assistant');
    const lastSaid = msgs.length && msgs[msgs.length - 1].from === 'applicant' ? msgs[msgs.length - 1].text : null;
    if (lastAsk && lastAsk.topic && lastSaid != null) {
      const key = lastAsk.topic.split(':')[0];
      if (ITEM[key]) {
        // Judge on everything said to this item so far.
        const said = msgs.filter((m, i) => m.from === 'applicant' && msgs[i - 1] && msgs[i - 1].from === 'assistant' && (msgs[i - 1].topic || '').split(':')[0] === key).map((m) => m.text).join(' ');
        // Judged on all of it; the evidence shown is the latest answer.
        u[key] = { ...judgeAnswer(key, said, ctx), evidence: clip(lastSaid, 200) };
      }
    }
    applyHardRules(u, ctx);
    talk.understanding = u;
    talk.markModified('understanding');
    const asked = new Set(msgs.filter((m) => m.from === 'assistant' && m.topic).map((m) => m.topic));
    const first = ASKED.find((i) => u[i.key].status !== 'clear' && !asked.has(i.key));
    const again = ASKED.find((i) => u[i.key].status !== 'clear' && asked.has(i.key) && !asked.has(`${i.key}:again`));
    const next = first || again;
    if (!next || mustFinish || finishNow) {
      // It all fits, as far as fixed questions can tell: the plan's sum, once
      // the answers are in. (The AI judges it from what was said.)
      if (ctx.planOk && u.fits.status !== 'clear' && (talk.provider !== 'groq' || talk.fellBack)) {
        u.fits = { status: 'clear', note: "Checked: the plan adds up to the goal. (GLOOBAL's fixed questions cannot test more than that.)", evidence: ctx.planText };
      }
      finish(talk, ctx, '', null, 'practice');
      return;
    }
    const BUSY = "(Hooman Intelligence is busy, so GLOOBAL's own questions carry on.) ";
    const lead = talk.fellBack && !msgs.some((m) => m.from === 'assistant' && m.text.startsWith(BUSY)) ? BUSY : '';
    const text = first ? next.ask(ctx) : next.again;
    talk.messages.push({ from: 'assistant', text: lead + text, topic: first ? next.key : `${next.key}:again`, at: new Date(now()) });
  }

  async function aiTurn(talk, ctx, { mustFinish = false, finishNow = false } = {}) {
    const system = systemPrompt(ctx);
    const history = (talk.messages || []).map((m) => ({ role: m.from === 'assistant' ? 'assistant' : 'user', content: m.from === 'assistant' ? m.text : redact(m.text) }));
    if (!history.length) history.push({ role: 'user', content: '(The applicant has opened the conversation. Greet them in one short sentence and ask your first question.)' });
    if (finishNow) history.push({ role: 'user', content: '(GLOOBAL: the applicant asked to finish now. Finish: done=true, with all nine and the analysis.)' });
    else if (mustFinish) history.push({ role: 'user', content: '(GLOOBAL: that was the last answer allowed. Finish now: done=true, with all nine and the analysis.)' });
    const r = await ai.complete({ system, messages: history, maxTokens: 1400 });
    talk.aiCalls += 1;
    if (!r.ok) return false;
    const j = parseJsonReply(r.text);
    if (!j || typeof j.say !== 'string' || !j.say.trim()) return false;
    const corpus = corpusOf(talk, ctx);
    talk.understanding = normaliseUnderstanding(j.understanding, talk.understanding || blankUnderstanding(), corpus, ctx);
    talk.markModified('understanding');
    if (j.done || mustFinish || finishNow) {
      let extra = j.analysis && typeof j.analysis === 'object' ? j.analysis : null;
      if (!extra) {
        const againR = await ai.complete({ system, messages: [...history, { role: 'assistant', content: r.text }, { role: 'user', content: '(GLOOBAL: write the analysis now, as the JSON described, with done=true.)' }], maxTokens: 1400 });
        talk.aiCalls += 1;
        const j2 = againR.ok ? parseJsonReply(againR.text) : null;
        if (j2 && j2.understanding) talk.understanding = normaliseUnderstanding(j2.understanding, talk.understanding, corpus, ctx);
        extra = j2 && j2.analysis && typeof j2.analysis === 'object' ? j2.analysis : null;
      }
      finish(talk, ctx, j.say, extra, extra ? `groq:${ai.model}` : 'practice');
      return true;
    }
    talk.messages.push({ from: 'assistant', text: clip(j.say, 4000), at: new Date(now()) });
    return true;
  }

  async function turn(talk, project, opts = {}) {
    const ctx = contextOf(project);
    const mustFinish = answersIn(talk) >= MAX_ANSWERS;
    if (talk.provider === 'groq' && !talk.fellBack) {
      if (await aiTurn(talk, ctx, { ...opts, mustFinish })) return;
      talk.fellBack = true;
    }
    practiceTurn(talk, ctx, { ...opts, mustFinish });
  }

  async function ownDraft(req) {
    const project = await Project.findById(req.params.id);
    if (!project) return { status: 404, body: { success: false, message: 'Project not found.' } };
    if (String(project.ownerId) !== String(req.authUser._id)) return { status: 403, body: { success: false, message: 'That project is not yours.' } };
    return { project };
  }

  // ── routes ─────────────────────────────────────────────────────────────

  async function read(req, res) {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return refuse(res, 404, 'Project not found.');
    const isOwner = String(project.ownerId) === String(req.authUser._id);
    if (!isOwner && !(await review.isReviewer(req.authUser))) return refuse(res, 403, 'Only the owner and GLOOBAL see this.');
    const talk = await latest(project._id);
    return res.json({
      success: true,
      switchedOn: switchedOn(),
      mode: ai.provider,
      items: ITEMS.map((i) => ({ key: i.key, label: i.label, clear: i.clear })),
      talk: out(talk),
      canStart: isOwner && switchedOn() && isDraft(project) && !(talk && talk.state === 'talking'),
      requirements: isOwner ? await review.requirements(project) : undefined,
    });
  }

  async function start(req, res) {
    if (!switchedOn()) return refuse(res, 409, 'The project conversation is switched off. Submit it directly.', 'talk_off');
    const got = await ownDraft(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!isDraft(project)) return refuse(res, 409, 'It has already been sent to GLOOBAL.', 'not_draft');
    const current = await latest(project._id);
    // An open conversation is picked up where it was left, however long ago.
    if (current && current.state === 'talking') return res.json({ success: true, talk: out(current) });
    const forProject = await ProjectTalk.countDocuments({ projectId: project._id, createdAt: { $gte: today() } });
    if (forProject >= TALKS_PER_DAY) return refuse(res, 429, `You can start a conversation about one project ${TALKS_PER_DAY} times a day. Try again tomorrow.`, 'talks_today');
    const forPerson = await ProjectTalk.countDocuments({ ownerId: project.ownerId, createdAt: { $gte: today() } });
    if (forPerson >= PERSON_TALKS_PER_DAY) return refuse(res, 429, `You can start ${PERSON_TALKS_PER_DAY} project conversations a day. Try again tomorrow.`, 'person_talks_today');
    if (current) { current.state = 'left'; await current.save(); }
    const talk = new ProjectTalk({
      projectId: project._id,
      ownerId: project.ownerId,
      provider: ai.provider === 'groq' ? 'groq' : 'practice',
      model: ai.provider === 'groq' ? ai.model : '',
      messages: [],
      understanding: applyHardRules(blankUnderstanding(), contextOf(project)),
      createdAt: new Date(now()),
    });
    await turn(talk, project);
    await talk.save();
    return res.status(201).json({ success: true, talk: out(talk) });
  }

  async function sayTo(req, res) {
    const got = await ownDraft(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    const talk = await latest(project._id);
    if (!talk || talk.state !== 'talking') return refuse(res, 409, 'Start the conversation first.', 'no_talk');
    const said = clip(req.body && req.body.text, ANSWER_MAX);
    if (!said) return refuse(res, 400, 'Write your answer.');
    talk.messages.push({ from: 'applicant', text: said, at: new Date(now()) });
    await turn(talk, project);
    await talk.save();
    return res.json({ success: true, talk: out(talk) });
  }

  // "Finish now": the analysis as things stand, whatever is still open.
  async function finishNow(req, res) {
    const got = await ownDraft(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    const talk = await latest(project._id);
    if (!talk || talk.state !== 'talking') return refuse(res, 409, 'There is no conversation under way.', 'no_talk');
    if (answersIn(talk) < FINISH_AFTER) return refuse(res, 409, `Answer at least ${FINISH_AFTER} questions first.`, 'too_early');
    await turn(talk, project, { finishNow: true });
    await talk.save();
    return res.json({ success: true, talk: out(talk) });
  }

  async function apply(req, res) {
    const got = await ownDraft(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    const talk = await latest(project._id);
    if (!talk || talk.state !== 'done' || !talk.analysis) return refuse(res, 409, 'Finish the conversation first.', 'no_talk');
    const anyway = Boolean(req.body && req.body.anyway);
    const readiness = talk.analysis.readiness;
    if (readiness !== 'ready' && !anyway) {
      return refuse(res, 409, `${READINESS_WORDS[readiness] || readiness}. ${talk.analysis.readinessWhy || ''} Improve it and talk again, or send it anyway.`.trim(), 'not_ready');
    }
    const note = readiness === 'ready'
      ? `Talked it through with Hooman Intelligence: ready for review (${talk.analysis.understood} of ${talk.analysis.of} clear)`
      : `Talked it through with Hooman Intelligence: ${(READINESS_WORDS[readiness] || readiness).toLowerCase()} (${talk.analysis.understood} of ${talk.analysis.of} clear) — sent anyway`;
    const sent = await review.sendForReview(project, note);
    if (!sent.ok) return res.status(sent.status).json(sent.body);
    talk.state = 'applied';
    talk.appliedAt = new Date(now());
    talk.appliedAnyway = readiness !== 'ready';
    await talk.save();
    return review.reply(res, project, { talk: out(talk) });
  }

  // Asked by Submit (lib/projectReview.js): with the conversation on,
  // applying goes through it.
  async function gate() {
    if (!switchedOn()) return null;
    return { status: 409, body: { success: false, code: 'talk_first', message: "Talk it through with Hooman Intelligence first — it sends the project on for you." } };
  }

  function mount(app, { requireAuth, writeLimit, lookupLimit }) {
    const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
    app.get('/api/projects/:id/talk', lookupLimit, requireAuth, wrap(read));
    app.post('/api/projects/:id/talk', writeLimit, requireAuth, wrap(start));
    app.post('/api/projects/:id/talk/say', writeLimit, requireAuth, wrap(sayTo));
    app.post('/api/projects/:id/talk/finish', writeLimit, requireAuth, wrap(finishNow));
    app.post('/api/projects/:id/talk/apply', writeLimit, requireAuth, wrap(apply));
  }

  return { mount, gate, switchedOn, handlers: { read, start, sayTo, finishNow, apply } };
}

module.exports = {
  createProjectTalk, redact, contextOf, milestonesFromPlan, normaliseUnderstanding, readinessOf, readinessWhyOf, buildAnalysis,
  judgeAnswer, applyHardRules, blankUnderstanding, supported, systemPrompt, lineText,
  ITEMS, MAX_ANSWERS, TALKS_PER_DAY, PERSON_TALKS_PER_DAY, FINISH_AFTER, READINESS_WORDS, STATUS_WORDS,
};
