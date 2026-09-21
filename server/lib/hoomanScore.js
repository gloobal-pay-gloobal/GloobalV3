'use strict';

// ── Hooman Score: the rules ─────────────────────────────────────────────────
//
// Kept free of Express and Mongoose on purpose. The routes in server.js are
// thin wrappers around these functions, and the browser tests' fake API loads
// this same file, so the app is tested against the real scoring rules rather
// than a copy of them.
//
// What the score is. Twenty check-ins in four pillars. A good answer ("yes",
// a right sum, a right knowledge answer) is worth 25 points; any other answer
// is worth 10 — you are never scored zero for answering honestly. A pillar's
// score is the share of its possible points earned, and the overall score is
// the average of the pillars you have answered.
//
// What changed when answers moved to the server:
//
//   - EVERY answer is kept as its own record, including one per payment.
//     A check-in's points are the average of its answers from the last
//     HOOMAN_WINDOW_DAYS days. Because it is an average, answering more often
//     never pushes the score higher on its own — it only keeps it current.
//   - Finance check-ins still lock after the first answer, as they always
//     have. So for those the first answer counts, however old it is, and a
//     second one is refused.
//
// What the score never does: touch money. The Creator Share is paid in full
// whatever anybody answers. Nothing here is read by any payment route.

const HOOMAN_WINDOW_DAYS = 30;
const HOOMAN_GOOD_POINTS = 25;
const HOOMAN_OTHER_POINTS = 10;

// Keys and answer types only. The wording of each question lives in the app
// (backend/data/ghScoreCategories.js); tests/hooman-score-catalogue.test.mjs
// fails if the two ever list different check-ins.
const HOOMAN_CATALOGUE = [
  {
    key: 'self',
    items: [
      { key: 'health', type: 'yesno' },
      { key: 'education', type: 'math', alsoAccepts: ['knowledge'] },
      { key: 'food', type: 'yesno' },
      { key: 'mental', type: 'yesno' },
      { key: 'sleep', type: 'yesno' },
    ],
  },
  {
    key: 'community',
    items: [
      { key: 'belonging', type: 'yesno' },
      { key: 'support', type: 'yesno' },
      { key: 'trust', type: 'yesno' },
      { key: 'voice', type: 'math' },
      { key: 'family', type: 'yesno' },
    ],
  },
  {
    key: 'environment',
    items: [
      { key: 'recycling', type: 'yesno' },
      { key: 'energy', type: 'yesno' },
      { key: 'nature', type: 'yesno' },
      { key: 'awareness', type: 'math' },
      { key: 'water', type: 'yesno' },
    ],
  },
  {
    key: 'finance',
    locksAfterAnswer: true,
    items: [
      { key: 'savings', type: 'yesno' },
      { key: 'budgeting', type: 'math' },
      { key: 'debt', type: 'yesno' },
      { key: 'security', type: 'yesno' },
      { key: 'insurance', type: 'yesno' },
    ],
  },
];

const HOOMAN_TOTAL_ITEMS = HOOMAN_CATALOGUE.reduce((sum, pillar) => sum + pillar.items.length, 0);

const findPillar = (key) => HOOMAN_CATALOGUE.find((pillar) => pillar.key === key) || null;
const findItem = (pillarKey, itemKey) => {
  const pillar = findPillar(pillarKey);
  return pillar ? pillar.items.find((item) => item.key === itemKey) || null : null;
};
const pillarLocks = (pillarKey) => Boolean(findPillar(pillarKey) && findPillar(pillarKey).locksAfterAnswer);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (date) => date.toISOString().slice(0, 10);

const isWholeNumber = (value) => {
  if (typeof value === 'number') return Number.isInteger(value);
  if (typeof value === 'string' && /^-?\d{1,6}$/.test(value.trim())) return true;
  return false;
};

// The knowledge question, as the app is allowed to see it: everything except
// which option is right. The answer stays on the server so a correct tap is a
// correct tap, not a claim.
const publicQuestion = (question) => {
  if (!question) return null;
  const { answer, ...rest } = question;
  return rest;
};

// Turns what the app sent into the record to store, or says why not.
//
// Points are always computed HERE. The app never sends a score — it sends the
// answer, and the server decides what it is worth. That is what makes the
// saved score something other than whatever the client wrote down.
function evaluateHoomanAnswer(input, { bank, now = new Date() } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const pillar = String(body.pillar || '');
  const item = String(body.item || '');
  const kind = String(body.kind || '');
  const fail = (code, message) => ({ ok: false, code, message });

  const entry = findItem(pillar, item);
  if (!entry) return fail('hooman_unknown_checkin', 'That check-in does not exist.');

  const accepted = [entry.type, ...(entry.alsoAccepts || [])];
  if (!accepted.includes(kind)) return fail('hooman_wrong_kind', 'That kind of answer does not fit this check-in.');

  const source = body.source === 'payment' ? 'payment' : 'score';
  const transactionId = body.transactionId === undefined || body.transactionId === null
    ? null
    : String(body.transactionId).trim();
  if (transactionId !== null && (transactionId.length === 0 || transactionId.length > 64)) {
    return fail('hooman_bad_transaction', 'That payment reference is not valid.');
  }
  if (source === 'payment' && !transactionId) {
    return fail('hooman_bad_transaction', 'An answer given after a payment has to name the payment.');
  }

  // The day the person answered, as their own phone saw it — the daily
  // questions rotate on the local date, not UTC. Only the shape is checked;
  // the server's own clock decides which answers fall inside the window.
  const day = typeof body.day === 'string' && DAY_PATTERN.test(body.day) ? body.day : utcDay(now);

  let value;
  let correct = null;
  let questionId = null;
  // For a knowledge question: which option was right. Returned to the app
  // AFTER it has answered, so it can show the right one. Never stored.
  let rightChoice = null;

  if (kind === 'yesno') {
    if (body.value !== 'yes' && body.value !== 'no') return fail('hooman_bad_answer', 'Answer yes or no.');
    value = body.value;
  } else if (kind === 'math') {
    // Two numbers on the score screen; three after a payment (34 + 35 + 36).
    // `c` is optional, and absent means a two-number sum.
    const hasC = body.c !== undefined && body.c !== null;
    if (!isWholeNumber(body.a) || !isWholeNumber(body.b) || !isWholeNumber(body.value) || (hasC && !isWholeNumber(body.c))) {
      return fail('hooman_bad_answer', 'That sum is not valid.');
    }
    const a = Number(body.a);
    const b = Number(body.b);
    const c = hasC ? Number(body.c) : 0;
    const given = Number(body.value);
    if (a < 0 || b < 0 || c < 0 || a > 999 || b > 999 || c > 999) return fail('hooman_bad_answer', 'That sum is not valid.');
    value = String(given);
    correct = given === a + b + c;
  } else {
    // knowledge
    const questions = (bank && Array.isArray(bank.questions)) ? bank.questions : [];
    const question = questions.find((q) => q.id === String(body.questionId || ''));
    if (!question) return fail('hooman_unknown_question', 'That question does not exist.');
    if (!isWholeNumber(body.choice)) return fail('hooman_bad_answer', 'Pick one of the answers.');
    const choice = Number(body.choice);
    if (choice < 0 || choice >= question.options.length) return fail('hooman_bad_answer', 'Pick one of the answers.');
    value = String(choice);
    correct = choice === question.answer;
    questionId = question.id;
    rightChoice = question.answer;
  }

  const good = kind === 'yesno' ? value === 'yes' : correct === true;

  return {
    ok: true,
    rightChoice,
    record: {
      pillar,
      item,
      kind,
      value,
      correct,
      points: good ? HOOMAN_GOOD_POINTS : HOOMAN_OTHER_POINTS,
      day,
      source,
      transactionId,
      questionId,
    },
  };
}

// The score, from a person's saved answers.
//
// `answers` is every record that could count: the last HOOMAN_WINDOW_DAYS
// days, plus any Finance answers however old (those lock, so their first
// answer is permanent). Records outside that are ignored here even if passed,
// so the caller's query can be generous without changing the result.
function computeHoomanScore(answers, { now = new Date() } = {}) {
  const cutoff = now.getTime() - HOOMAN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const time = (record) => new Date(record.createdAt || now).getTime();

  const items = {};
  const categories = {};
  let answered = 0;
  let rawTotal = 0;
  const categoryScores = [];

  for (const pillar of HOOMAN_CATALOGUE) {
    let pillarPoints = 0;
    let pillarAnswered = 0;

    for (const entry of pillar.items) {
      const mine = (answers || []).filter((r) => r.pillar === pillar.key && r.item === entry.key);
      let counted;
      if (pillar.locksAfterAnswer) {
        // The first answer is the answer.
        counted = mine.length ? [mine.slice().sort((x, y) => time(x) - time(y))[0]] : [];
      } else {
        counted = mine.filter((r) => time(r) >= cutoff);
      }
      if (!counted.length) continue;

      const newest = counted.slice().sort((x, y) => time(y) - time(x))[0];
      const points = counted.reduce((sum, r) => sum + Number(r.points || 0), 0) / counted.length;

      items[`${pillar.key}.${entry.key}`] = {
        // NOT rounded. The app recomputes each pillar from these with the same
        // formula as below; rounding here would let the screen and the server
        // disagree by a point about the same person's score.
        points,
        count: counted.length,
        latest: {
          kind: newest.kind,
          value: newest.value,
          correct: newest.correct === undefined ? null : newest.correct,
          day: newest.day,
          source: newest.source || 'score',
        },
      };
      pillarPoints += points;
      pillarAnswered += 1;
    }

    const score = pillarAnswered
      ? Math.round((pillarPoints / (pillarAnswered * HOOMAN_GOOD_POINTS)) * 100)
      : null;
    categories[pillar.key] = { score, answered: pillarAnswered, total: pillar.items.length };
    answered += pillarAnswered;
    if (score !== null) {
      categoryScores.push(score);
      rawTotal += score;
    }
  }

  return {
    windowDays: HOOMAN_WINDOW_DAYS,
    overall: categoryScores.length
      ? Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length)
      : null,
    categories,
    items,
    answered,
    totalItems: HOOMAN_TOTAL_ITEMS,
    rawTotal,
    maxTotal: HOOMAN_CATALOGUE.length * 100,
  };
}

module.exports = {
  HOOMAN_WINDOW_DAYS,
  HOOMAN_GOOD_POINTS,
  HOOMAN_OTHER_POINTS,
  HOOMAN_CATALOGUE,
  HOOMAN_TOTAL_ITEMS,
  findItem,
  pillarLocks,
  publicQuestion,
  evaluateHoomanAnswer,
  computeHoomanScore,
};
