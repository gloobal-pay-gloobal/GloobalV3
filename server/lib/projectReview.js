// server/lib/projectReview.js
//
// ── HOOMAN PROJECTS: APPLYING FOR GLOOBAL FUNDING ───────────────────────
//
// Until this, a project went live the moment it was saved, and the only money
// it could get was people paying its owner. GLOOBAL itself had no way to look
// at a project, ask about it, say yes with an amount, say no with a reason, or
// pay it bit by bit. This is that process.
//
//   draft ──submit──▶ submitted ──start──▶ under_review ──approve──▶ approved
//                                   │  ▲              │                │
//                                 ask │ answer      decline        first milestone
//                                   ▼  │              ▼              paid ▼
//                               needs_info         declined          funding
//                                                (reason, reapply     │   ▲
//                                                 after a date)  pause│   │resume
//                                                                     ▼   │
//   withdrawn: the applicant, any time before completed.          paused
//   completed: every milestone paid and its update posted.
//
// Rules worth knowing before reading the code:
//
//   - A project can only be SUBMITTED once four things are true (the founder's
//     list): the owner's GLOOBAL Bank is open, the project has a goal and a
//     plan that adds up to it, it carries a document or photo, and the owner
//     has done the live face check. requirements() says which are missing.
//   - Everyone sees a submitted project, marked "Under review". Giving opens
//     only once GLOOBAL approves (givingOpen). A project from before the review
//     existed has no `review` at all and keeps giving open, as it always had.
//   - GLOOBAL pays in milestones. Approval sets them; the first is due at
//     once. Each later one becomes due when the owner posts an update on the
//     one before. An update not posted within UPDATE_DUE_DAYS of a payment
//     PAUSES the project, and the reason says which update is overdue.
//   - A milestone is marked paid only against a real payment: a successful
//     transaction from the reviewer to the owner, of that amount and
//     currency, made after approval and not already used. Nothing here moves
//     money; the payment is an ordinary one made on Send.
//   - Reviewers are the admins named on Render (ADMIN_SYMBOL_IDS) and staff
//     with the finance or projects role. Nobody reviews their own project.
//   - Every step is written to the project's timeline, shown to the applicant,
//     and the applicant is notified of every decision.

const crypto = require('crypto');

const UPDATE_DUE_DAYS = 30;
const DEFAULT_REAPPLY_DAYS = 30;
const REVIEWER_STAFF_ROLES = ['finance', 'projects'];
const GIVING_OPEN = ['approved', 'funding', 'paused', 'completed'];
const EDITABLE = ['draft', 'needs_info'];
const DAY = 86400000;

const list = (raw) => String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const toMinor = (major) => {
  const n = Number(String(major == null ? '' : major).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

const STATE_WORDS = {
  draft: 'Draft',
  submitted: 'Submitted, waiting for review',
  under_review: 'Under review',
  needs_info: 'GLOOBAL asked a question',
  approved: 'Approved',
  funding: 'Being funded',
  paused: 'Paused',
  completed: 'Completed',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

// Giving open? A project with no review is one from before it existed.
function givingOpen(project) {
  if (!project || project.status !== 'published') return false;
  if (!project.review) return true;
  return GIVING_OPEN.includes(effectiveState(project, Date.now()).state);
}

// The state as the applicant should see it now: a funding project whose
// update is overdue is PAUSED, with the reason, even before anyone presses
// anything.
function effectiveState(project, now) {
  const r = project && project.review;
  if (!r) return { state: 'none', reason: '' };
  if (r.state === 'funding') {
    const overdue = overdueMilestone(r, now);
    if (overdue) {
      return {
        state: 'paused',
        reason: `The update on "${overdue.label}" was due by ${new Date(overdue.dueBy).toISOString().slice(0, 10)}. Post it to carry on.`,
        automatic: true,
      };
    }
  }
  return { state: r.state, reason: r.reason || '' };
}

function overdueMilestone(r, now) {
  for (const m of r.milestones || []) {
    if (m.state === 'paid' && m.paidAt && !m.updateAt) {
      const dueBy = new Date(m.paidAt).getTime() + UPDATE_DUE_DAYS * DAY;
      if (now > dueBy) return { label: m.label, dueBy };
    }
  }
  return null;
}

// What is waiting on whom, in one line for the applicant.
function nextStep(project, now) {
  const r = project.review;
  if (!r) return '';
  const eff = effectiveState(project, now);
  switch (eff.state) {
    case 'draft': return 'Finish the checklist and submit it for review.';
    case 'submitted': return 'Waiting for GLOOBAL to start the review.';
    case 'under_review': return 'GLOOBAL is reviewing it.';
    case 'needs_info': return 'Answer GLOOBAL\'s question to continue.';
    case 'approved': return r.fundMinor > 0 ? 'Approved. GLOOBAL will pay the first milestone.' : 'Approved. People can give to it now.';
    case 'funding': {
      const due = (r.milestones || []).find((m) => m.state === 'due');
      if (due) return `GLOOBAL will pay "${due.label}".`;
      const needs = (r.milestones || []).find((m) => m.state === 'paid' && !m.updateAt);
      return needs ? `Post an update on "${needs.label}" within ${UPDATE_DUE_DAYS} days of payment.` : '';
    }
    case 'paused': return eff.reason;
    case 'declined': return r.reapplyAfter ? `You can apply again from ${new Date(r.reapplyAfter).toISOString().slice(0, 10)}.` : '';
    default: return '';
  }
}

// What the applicant, a reviewer and everyone else may see.
function publicReview(project, { isOwner = false, isReviewer = false, now = Date.now() } = {}) {
  const r = project && project.review;
  if (!r) return { state: 'none', label: 'Live', givingOpen: givingOpen(project) };
  const eff = effectiveState(project, now);
  const out = {
    state: eff.state,
    label: STATE_WORDS[eff.state] || eff.state,
    givingOpen: givingOpen(project),
    fund: r.fundMinor > 0 ? { minor: r.fundMinor, currency: r.fundCurrency } : null,
    milestones: (r.milestones || []).map((m) => ({ label: m.label, amountMinor: m.amountMinor, state: m.state, paidAt: m.paidAt, updateAt: m.updateAt, update: m.update })),
  };
  // Why it stopped is public: a declined or paused project says so plainly.
  if (['declined', 'paused', 'withdrawn'].includes(eff.state)) out.reason = eff.reason;
  if (isOwner || isReviewer) {
    out.nextStep = nextStep(project, now);
    out.timeline = (r.timeline || []).map((t) => ({ at: t.at, state: t.state, label: STATE_WORDS[t.state] || t.state, by: t.by, note: t.note }));
    out.questions = (r.questions || []).map((q) => ({ id: q.id, askedAt: q.askedAt, question: q.question, answer: q.answer, answeredAt: q.answeredAt }));
    out.reapplyAfter = r.reapplyAfter;
    out.submittedAt = r.submittedAt;
    out.canEdit = EDITABLE.includes(r.state);
  }
  return out;
}

function validatePlan(rawPlan, goalMinor) {
  if (!Array.isArray(rawPlan) || !rawPlan.length) return { ok: false, message: 'Add at least one line to the plan: what the money is for.' };
  if (rawPlan.length > 12) return { ok: false, message: 'Keep the plan to 12 lines or fewer.' };
  const plan = [];
  for (const line of rawPlan) {
    const label = text(line && line.label, 80);
    const amountMinor = toMinor(line && line.amountMajor);
    if (!label) return { ok: false, message: 'Every plan line needs a name.' };
    if (!amountMinor) return { ok: false, message: `"${label}" needs an amount.` };
    plan.push({ label, amountMinor });
  }
  const sum = plan.reduce((a, l) => a + l.amountMinor, 0);
  if (goalMinor != null && sum !== goalMinor) {
    return { ok: false, message: `The plan adds up to ${(sum / 100).toFixed(2)} but the goal is ${(goalMinor / 100).toFixed(2)}. Make them match.` };
  }
  return { ok: true, plan, sumMinor: sum };
}

function createProjectReview(deps) {
  const { Project, BankAccount, FaceTemplate, Transaction, StaffMember, notify = async () => {}, env = process.env, now = () => Date.now() } = deps;

  async function isReviewer(user) {
    if (!user) return false;
    if (list(env.ADMIN_SYMBOL_IDS).includes(user.symbolId)) return true;
    if (!StaffMember) return false;
    const m = await StaffMember.findOne({ userId: user._id, removedAt: null, role: { $in: REVIEWER_STAFF_ROLES } }).lean();
    return Boolean(m && m.symbolId === user.symbolId);
  }

  async function requirements(project) {
    const ownerId = project.ownerId;
    const [bank, face] = await Promise.all([
      BankAccount.findOne({ userId: ownerId, status: 'open' }).lean(),
      FaceTemplate.findOne({ userId: ownerId }).lean(),
    ]);
    const planSum = (project.plan || []).reduce((a, l) => a + (l.amountMinor || 0), 0);
    const goalOk = project.goalMinor > 0 && Boolean(project.goalCurrency);
    return [
      { key: 'bank', ok: Boolean(bank), label: 'GLOOBAL Bank account open', hint: 'Open it from Accounts → GLOOBAL Bank. Funding is paid into it.' },
      { key: 'plan', ok: goalOk && planSum === project.goalMinor, label: 'Funding goal and a plan that adds up to it', hint: goalOk ? 'Add plan lines that add up to the goal.' : 'Set a funding goal, then the plan.' },
      { key: 'document', ok: Boolean(project.attachment), label: 'A document or photo', hint: 'A quote, a photo of the site, a registration.' },
      { key: 'face', ok: Boolean(face), label: 'Live face check done', hint: 'Profile → your photo → take the live photo.' },
    ];
  }

  const step = (state, by, note = '') => ({ at: new Date(now()), state, by, note: text(note, 600) });

  // Load a project for its OWNER; answers { project } or { status, body }.
  async function ownProject(req) {
    const project = await Project.findById(req.params.id);
    if (!project) return { status: 404, body: { success: false, message: 'Project not found.' } };
    if (String(project.ownerId) !== String(req.authUser._id)) return { status: 403, body: { success: false, message: 'That project is not yours.' } };
    return { project };
  }
  async function reviewedProject(req) {
    const project = await Project.findById(req.params.id);
    if (!project) return { status: 404, body: { success: false, message: 'Project not found.' } };
    if (!project.review) return { status: 409, body: { success: false, message: 'That project was not sent for review.' } };
    if (String(project.ownerId) === String(req.authUser._id)) return { status: 403, body: { success: false, code: 'own_project', message: 'Nobody reviews their own project.' } };
    return { project };
  }
  const reply = (res, project, extra = {}) => res.json({
    success: true,
    review: publicReview(project.toObject ? project.toObject() : project, { isOwner: true, isReviewer: true, now: now() }),
    ...extra,
  });
  const refuse = (res, status, message, code) => res.status(status).json({ success: false, ...(code ? { code } : {}), message });
  const say = (project, title, message) => notify(project.ownerId, { title, message, projectId: String(project._id) }).catch(() => {});
  const inState = (project, states) => states.includes(project.review && project.review.state);

  // ── the applicant ──────────────────────────────────────────────────────

  async function setPlan(req, res) {
    const got = await ownProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (project.review && !inState(project, EDITABLE)) return refuse(res, 409, 'The plan cannot change while GLOOBAL is reviewing or funding it.');
    const checked = validatePlan(req.body && req.body.plan, project.goalMinor != null ? project.goalMinor : null);
    if (!checked.ok) return refuse(res, 400, checked.message);
    project.plan = checked.plan;
    await project.save();
    return res.json({ success: true, plan: project.plan });
  }

  async function getReview(req, res) {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return refuse(res, 404, 'Project not found.');
    const isOwner = String(project.ownerId) === String(req.authUser._id);
    const reviewer = await isReviewer(req.authUser);
    if (!isOwner && !reviewer) return refuse(res, 403, 'Only the owner and GLOOBAL see this.');
    return res.json({
      success: true,
      review: publicReview(project, { isOwner, isReviewer: reviewer, now: now() }),
      plan: project.plan || [],
      requirements: await requirements(project),
      reviewer,
    });
  }

  async function submit(req, res) {
    const got = await ownProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (project.review && !inState(project, ['draft'])) return refuse(res, 409, `It is already ${STATE_WORDS[project.review.state].toLowerCase()}.`);
    const reqs = await requirements(project);
    const missing = reqs.filter((r) => !r.ok);
    if (missing.length) {
      return res.status(409).json({ success: false, code: 'requirements', message: `Before submitting: ${missing.map((m) => m.label.toLowerCase()).join('; ')}.`, requirements: reqs });
    }
    project.status = 'published';
    project.review = project.review || { state: 'draft', timeline: [] };
    project.review.state = 'submitted';
    project.review.submittedAt = new Date(now());
    project.review.reason = '';
    project.review.timeline.push(step('submitted', 'applicant'));
    await project.save();
    say(project, 'Project submitted', `"${project.title}" is waiting for GLOOBAL's review.`);
    return reply(res, project);
  }

  async function answer(req, res) {
    const got = await ownProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['needs_info'])) return refuse(res, 409, 'There is no question waiting for an answer.');
    const q = project.review.questions.find((x) => x.id === String(req.body && req.body.questionId) && !x.answeredAt);
    const said = text(req.body && req.body.answer, 2000);
    if (!q) return refuse(res, 404, 'That question is not open.');
    if (!said) return refuse(res, 400, 'Write your answer.');
    q.answer = said;
    q.answeredAt = new Date(now());
    if (!project.review.questions.some((x) => !x.answeredAt)) {
      project.review.state = 'under_review';
      project.review.timeline.push(step('under_review', 'applicant', 'Answered GLOOBAL\'s question'));
    }
    project.markModified('review');
    await project.save();
    return reply(res, project);
  }

  async function withdraw(req, res) {
    const got = await ownProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!project.review || inState(project, ['completed', 'withdrawn', 'declined'])) return refuse(res, 409, 'This project cannot be withdrawn now.');
    project.review.state = 'withdrawn';
    project.review.reason = text(req.body && req.body.reason, 600) || 'Withdrawn by the applicant.';
    project.review.timeline.push(step('withdrawn', 'applicant', project.review.reason));
    await project.save();
    return reply(res, project);
  }

  async function reapply(req, res) {
    const got = await ownProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['declined', 'withdrawn'])) return refuse(res, 409, 'Only a declined or withdrawn project can be sent again.');
    if (project.review.reapplyAfter && now() < new Date(project.review.reapplyAfter).getTime()) {
      return refuse(res, 409, `You can apply again from ${new Date(project.review.reapplyAfter).toISOString().slice(0, 10)}.`, 'too_soon');
    }
    project.review.state = 'draft';
    project.review.reason = '';
    project.review.timeline.push(step('draft', 'applicant', 'Editing to apply again'));
    project.status = 'draft';
    await project.save();
    return reply(res, project);
  }

  async function postUpdate(req, res) {
    const got = await ownProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    const r = project.review;
    const n = Number(req.params.n);
    const m = r && r.milestones && r.milestones[n];
    if (!m || m.state !== 'paid') return refuse(res, 409, 'Updates are posted on a milestone GLOOBAL has paid.');
    if (m.updateAt) return refuse(res, 409, 'That update is already posted.');
    const said = text(req.body && req.body.update, 2000);
    if (said.length < 20) return refuse(res, 400, 'Say what was done with the money: at least a sentence or two.');
    m.update = said;
    m.updateAt = new Date(now());
    const next = r.milestones[n + 1];
    if (next && next.state === 'waiting') next.state = 'due';
    r.timeline.push(step(r.state, 'applicant', `Update posted on "${m.label}"`));
    if (r.state === 'paused' && r.reason && /update/i.test(r.reason)) { r.state = 'funding'; r.reason = ''; }
    if (r.milestones.every((x) => x.state === 'paid' && x.updateAt)) {
      r.state = 'completed';
      r.timeline.push(step('completed', 'applicant', 'Every milestone paid and reported'));
      say(project, 'Project completed', `"${project.title}" is complete. Thank you for every update.`);
    }
    project.markModified('review');
    await project.save();
    return reply(res, project);
  }

  // ── GLOOBAL ────────────────────────────────────────────────────────────

  const requireReviewer = async (req, res, next) => {
    try {
      if (!(await isReviewer(req.authUser))) return refuse(res, 403, 'Only GLOOBAL reviewers can do that.', 'not_reviewer');
      return next();
    } catch (e) {
      return refuse(res, 500, 'Reviewer check failed.');
    }
  };

  async function queue(req, res) {
    const states = ['submitted', 'under_review', 'needs_info', 'approved', 'funding', 'paused', 'declined', 'completed', 'withdrawn'];
    const want = String(req.query.state || '').trim();
    const filter = want && states.includes(want) ? { 'review.state': want } : { 'review.state': { $in: ['submitted', 'under_review', 'needs_info', 'approved', 'funding', 'paused'] } };
    const rows = await Project.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
    const countRows = await Project.aggregate([{ $match: { 'review.state': { $in: states } } }, { $group: { _id: '$review.state', n: { $sum: 1 } } }]);
    const counts = Object.fromEntries(states.map((s) => [s, 0]));
    for (const c of countRows) counts[c._id] = c.n;
    const t = now();
    return res.json({
      success: true,
      counts,
      projects: rows.map((p) => ({
        id: String(p._id), title: p.title, category: p.category, countryIso: p.countryIso || null, ownerSymbolId: p.ownerSymbolId,
        goal: p.goalMinor ? { minor: p.goalMinor, currency: p.goalCurrency } : null,
        review: publicReview(p, { isReviewer: true, now: t }),
        submittedAt: p.review && p.review.submittedAt, updatedAt: p.updatedAt,
      })),
    });
  }

  async function start(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['submitted'])) return refuse(res, 409, 'Only a submitted project can be started.');
    project.review.state = 'under_review';
    project.review.timeline.push(step('under_review', 'gloobal'));
    await project.save();
    say(project, 'Review started', `GLOOBAL has started reviewing "${project.title}".`);
    return reply(res, project);
  }

  async function ask(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['submitted', 'under_review', 'needs_info'])) return refuse(res, 409, 'Questions are asked during the review.');
    const question = text(req.body && req.body.question, 600);
    if (question.length < 5) return refuse(res, 400, 'Write the question.');
    project.review.questions.push({ id: crypto.randomBytes(6).toString('hex'), askedAt: new Date(now()), question });
    project.review.state = 'needs_info';
    project.review.timeline.push(step('needs_info', 'gloobal', question));
    project.markModified('review');
    await project.save();
    say(project, 'GLOOBAL has a question', `About "${project.title}": ${question}`);
    return reply(res, project);
  }

  async function approve(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['submitted', 'under_review'])) return refuse(res, 409, 'Approve a project that is under review with no open question.');
    const body = req.body || {};
    const fundMinor = body.amountMajor === undefined || body.amountMajor === '' || Number(body.amountMajor) === 0 ? 0 : toMinor(body.amountMajor);
    if (fundMinor === null) return refuse(res, 400, 'The amount GLOOBAL gives must be a number (0 to approve for public giving only).');
    const currency = text(body.currency || project.goalCurrency, 8).toUpperCase();
    let milestones = [];
    if (fundMinor > 0) {
      if (!currency) return refuse(res, 400, 'Which currency?');
      const raw = Array.isArray(body.milestones) && body.milestones.length ? body.milestones : [{ label: 'To start', percent: 40 }, { label: 'Halfway', percent: 30 }, { label: 'To finish', percent: 30 }];
      if (raw.length > 6) return refuse(res, 400, 'Six milestones at most.');
      const total = raw.reduce((a, m) => a + Number(m && m.percent), 0);
      if (Math.round(total) !== 100 || raw.some((m) => !(Number(m.percent) > 0))) return refuse(res, 400, 'The milestones must add up to 100%.');
      let given = 0;
      milestones = raw.map((m, i) => {
        const amountMinor = i === raw.length - 1 ? fundMinor - given : Math.round((fundMinor * Number(m.percent)) / 100);
        given += amountMinor;
        return { label: text(m.label, 80) || `Milestone ${i + 1}`, amountMinor, state: i === 0 ? 'due' : 'waiting' };
      });
    }
    const note = text(body.note, 600);
    Object.assign(project.review, {
      state: 'approved', decidedAt: new Date(now()), decidedBy: req.authUser._id, reason: '',
      fundMinor, fundCurrency: fundMinor > 0 ? currency : '', milestones,
    });
    project.review.timeline.push(step('approved', 'gloobal', note || (fundMinor > 0 ? `GLOOBAL will give ${(fundMinor / 100).toFixed(2)} ${currency} in ${milestones.length} milestones.` : 'Approved for public giving.')));
    project.markModified('review');
    await project.save();
    say(project, 'Project approved', fundMinor > 0 ? `"${project.title}" is approved: GLOOBAL will give ${(fundMinor / 100).toFixed(2)} ${currency}, paid in milestones.` : `"${project.title}" is approved. People can give to it now.`);
    return reply(res, project);
  }

  async function decline(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['submitted', 'under_review', 'needs_info'])) return refuse(res, 409, 'Only a project under review can be declined.');
    const reason = text(req.body && req.body.reason, 600);
    if (reason.length < 10) return refuse(res, 400, 'Say why, so they know what to change.');
    const days = Math.min(365, Math.max(0, Math.trunc(Number(req.body && req.body.reapplyDays != null ? req.body.reapplyDays : DEFAULT_REAPPLY_DAYS))));
    Object.assign(project.review, { state: 'declined', reason, decidedAt: new Date(now()), decidedBy: req.authUser._id, reapplyAfter: new Date(now() + days * DAY) });
    project.review.timeline.push(step('declined', 'gloobal', reason));
    await project.save();
    say(project, 'Project not approved', `"${project.title}": ${reason}`);
    return reply(res, project);
  }

  async function pause(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['approved', 'funding'])) return refuse(res, 409, 'Only an approved or funding project can be paused.');
    const reason = text(req.body && req.body.reason, 600);
    if (reason.length < 10) return refuse(res, 400, 'Say why it is paused and what will restart it.');
    project.review.state = 'paused';
    project.review.reason = reason;
    project.review.timeline.push(step('paused', 'gloobal', reason));
    await project.save();
    say(project, 'Project paused', `"${project.title}": ${reason}`);
    return reply(res, project);
  }

  async function resume(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!inState(project, ['paused'])) return refuse(res, 409, 'It is not paused.');
    const anyPaid = (project.review.milestones || []).some((m) => m.state === 'paid');
    project.review.state = anyPaid ? 'funding' : 'approved';
    project.review.reason = '';
    project.review.timeline.push(step(project.review.state, 'gloobal', 'Resumed'));
    await project.save();
    say(project, 'Project resumed', `"${project.title}" is moving again.`);
    return reply(res, project);
  }

  // Marked paid only against a payment that really happened.
  async function markPaid(req, res) {
    const got = await reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    const r = project.review;
    if (!inState(project, ['approved', 'funding'])) return refuse(res, 409, effectiveState(project.toObject(), now()).state === 'paused' ? 'It is paused. Resume it first.' : 'This project is not being funded.');
    if (effectiveState(project.toObject(), now()).state === 'paused') return refuse(res, 409, 'An update is overdue, so it is paused. Wait for the update.');
    const n = Number(req.params.n);
    const m = r.milestones && r.milestones[n];
    if (!m || m.state !== 'due') return refuse(res, 409, 'That milestone is not due.');
    const used = new Set(r.milestones.map((x) => x.paidReference).filter(Boolean));
    const since = r.decidedAt || r.submittedAt || new Date(0);
    const payments = await Transaction.find({
      fromUserId: req.authUser._id, toUserId: project.ownerId, status: 'success', currency: r.fundCurrency, createdAt: { $gte: since },
    }).sort({ createdAt: -1 }).limit(20).lean();
    const match = payments.find((t) => !used.has(t.referenceId) && Math.round(Number(t.amount) * 100) === m.amountMinor);
    if (!match) {
      return res.status(409).json({ success: false, code: 'no_payment', message: `No payment of ${(m.amountMinor / 100).toFixed(2)} ${r.fundCurrency} from you to the owner since approval. Pay it on Send first, then mark it paid.`, pay: { toSymbolId: project.ownerSymbolId, amountMajor: (m.amountMinor / 100).toFixed(2), currency: r.fundCurrency } });
    }
    m.state = 'paid';
    m.paidAt = new Date(now());
    m.paidReference = match.referenceId;
    r.state = 'funding';
    r.timeline.push(step('funding', 'gloobal', `Paid "${m.label}": ${(m.amountMinor / 100).toFixed(2)} ${r.fundCurrency}`));
    project.markModified('review');
    await project.save();
    say(project, 'GLOOBAL paid a milestone', `"${m.label}" for "${project.title}": ${(m.amountMinor / 100).toFixed(2)} ${r.fundCurrency}. Post an update on it within ${UPDATE_DUE_DAYS} days.`);
    return reply(res, project, { reference: match.referenceId });
  }

  function mount(app, { requireAuth, writeLimit, lookupLimit }) {
    const wrap = (fn) => async (req, res) => {
      try { return await fn(req, res); } catch (e) {
        console.error('project review error:', e);
        return refuse(res, 500, 'Could not do that just now.');
      }
    };
    app.get('/api/projects/:id/review', lookupLimit, requireAuth, wrap(getReview));
    app.put('/api/projects/:id/plan', writeLimit, requireAuth, wrap(setPlan));
    app.post('/api/projects/:id/submit', writeLimit, requireAuth, wrap(submit));
    app.post('/api/projects/:id/answer', writeLimit, requireAuth, wrap(answer));
    app.post('/api/projects/:id/withdraw', writeLimit, requireAuth, wrap(withdraw));
    app.post('/api/projects/:id/reapply', writeLimit, requireAuth, wrap(reapply));
    app.post('/api/projects/:id/milestones/:n/update', writeLimit, requireAuth, wrap(postUpdate));
    app.get('/api/review/me', lookupLimit, requireAuth, wrap(async (req, res) => res.json({ success: true, reviewer: await isReviewer(req.authUser) })));
    app.get('/api/review/projects', lookupLimit, requireAuth, requireReviewer, wrap(queue));
    app.post('/api/review/projects/:id/start', writeLimit, requireAuth, requireReviewer, wrap(start));
    app.post('/api/review/projects/:id/ask', writeLimit, requireAuth, requireReviewer, wrap(ask));
    app.post('/api/review/projects/:id/approve', writeLimit, requireAuth, requireReviewer, wrap(approve));
    app.post('/api/review/projects/:id/decline', writeLimit, requireAuth, requireReviewer, wrap(decline));
    app.post('/api/review/projects/:id/pause', writeLimit, requireAuth, requireReviewer, wrap(pause));
    app.post('/api/review/projects/:id/resume', writeLimit, requireAuth, requireReviewer, wrap(resume));
    app.post('/api/review/projects/:id/milestones/:n/paid', writeLimit, requireAuth, requireReviewer, wrap(markPaid));
  }

  return {
    mount, isReviewer, requirements, publicReview, givingOpen, effectiveState,
    handlers: { getReview, setPlan, submit, answer, withdraw, reapply, postUpdate, queue, start, ask, approve, decline, pause, resume, markPaid, requireReviewer },
  };
}

module.exports = { createProjectReview, publicReview, givingOpen, effectiveState, validatePlan, UPDATE_DUE_DAYS, STATE_WORDS };
