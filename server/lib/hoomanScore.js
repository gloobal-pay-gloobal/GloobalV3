'use strict';

// ── Hooman Score: the rules ─────────────────────────────────────────────────
//
// Kept free of Express and Mongoose on purpose. The routes in server.js are
// thin wrappers around these functions, and the browser tests' fake API loads
// this same file, so the app is tested against the real scoring rules rather
// than a copy of them.
//
// What the score is. Twenty check-ins in four pillars, answered with five
// faces (1 = 😞 … 5 = 😄). A face is worth 10, 14, 18, 21 or 25 points — the
// lowest is still 10, so nobody is scored zero for an honest answer. Older
// Yes/No answers still count as they always did (yes 25, no 10). A pillar's
// score is the share of its possible points earned, and the overall score,
// out of 100, is the average of the pillars you have answered.
//
//   - EVERY answer is kept as its own record, including one per payment.
//     A check-in's points are the average of its answers from the last
//     HOOMAN_WINDOW_DAYS days. Because it is an average, answering more often
//     never pushes the score higher on its own — it only keeps it current.
//   - Finance is asked once a MONTH (it used to lock forever after the first
//     answer, but money situations change). A second Finance answer in the
//     same calendar month is refused, and a Finance check-in counts its
//     latest answer for HOOMAN_FINANCE_DAYS days.
//   - The "7 + 5 = ?" sums no longer count toward any pillar (they measured
//     attention, not Education or Budgeting). A sum is now an ATTENTION
//     check: on a day its answer was wrong, that day's answers count half.
//
// What the score never does: touch money. The Creator Share is paid in full
// whatever anybody answers. Nothing here is read by any payment route.

const HOOMAN_WINDOW_DAYS = 30;
const HOOMAN_FINANCE_DAYS = 62;
const HOOMAN_GOOD_POINTS = 25;
const HOOMAN_OTHER_POINTS = 10;
// Points for faces 1..5.
const HOOMAN_SCALE_POINTS = [10, 14, 18, 21, 25];
// A wrong attention check halves that day's answers.
const HOOMAN_UNSURE_WEIGHT = 0.5;
// How often the daily check-in carries an attention sum.
const HOOMAN_ATTENTION_EVERY_DAYS = 7;

// Keys and answer kinds only. The wording of each question lives in the app
// (backend/data/ghScoreCategories.js); tests/hooman-score-catalogue.test.mjs
// fails if the two ever list different check-ins.
//
// Every check-in is answered with faces ('scale'). 'yesno' is still accepted
// (older apps, and the one-tap question after a payment). 'knowledge' is the
// quiz after a payment, filed under Education.
const SCALE_OR_YESNO = ['scale', 'yesno'];
const HOOMAN_CATALOGUE = [
  {
    key: 'self',
    items: [
      { key: 'health', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'education', type: 'scale', accepts: [...SCALE_OR_YESNO, 'knowledge'] },
      { key: 'food', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'mental', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'sleep', type: 'scale', accepts: SCALE_OR_YESNO },
    ],
  },
  {
    key: 'community',
    items: [
      { key: 'belonging', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'support', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'trust', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'voice', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'family', type: 'scale', accepts: SCALE_OR_YESNO },
    ],
  },
  {
    key: 'environment',
    items: [
      { key: 'recycling', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'energy', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'nature', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'awareness', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'water', type: 'scale', accepts: SCALE_OR_YESNO },
    ],
  },
  {
    key: 'finance',
    monthly: true,
    items: [
      { key: 'savings', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'budgeting', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'debt', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'security', type: 'scale', accepts: SCALE_OR_YESNO },
      { key: 'insurance', type: 'scale', accepts: SCALE_OR_YESNO },
    ],
  },
];

const HOOMAN_TOTAL_ITEMS = HOOMAN_CATALOGUE.reduce((sum, pillar) => sum + pillar.items.length, 0);

const findPillar = (key) => HOOMAN_CATALOGUE.find((pillar) => pillar.key === key) || null;
const findItem = (pillarKey, itemKey) => {
  const pillar = findPillar(pillarKey);
  return pillar ? pillar.items.find((item) => item.key === itemKey) || null : null;
};
const pillarIsMonthly = (pillarKey) => Boolean(findPillar(pillarKey) && findPillar(pillarKey).monthly);
// Kept for older callers: Finance no longer locks for good, it is monthly.
const pillarLocks = () => false;

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

  // A sum is an attention check wherever it was asked from (the daily
  // check-in, or the question after a payment, which still names
  // self.education). It is filed on its own and never counts in a pillar.
  const attention = kind === 'math';
  const entry = attention ? null : findItem(pillar, item);
  if (!attention && !entry) return fail('hooman_unknown_checkin', 'That check-in does not exist.');
  if (!attention && !entry.accepts.includes(kind)) {
    return fail('hooman_wrong_kind', 'That kind of answer does not fit this check-in.');
  }

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
  } else if (kind === 'scale') {
    const face = String(body.value === undefined || body.value === null ? '' : body.value).trim();
    if (!/^[1-5]$/.test(face)) return fail('hooman_bad_answer', 'Pick one of the five faces.');
    value = face;
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

  let points;
  if (attention) points = 0;
  else if (kind === 'scale') points = HOOMAN_SCALE_POINTS[Number(value) - 1];
  else if (kind === 'yesno') points = value === 'yes' ? HOOMAN_GOOD_POINTS : HOOMAN_OTHER_POINTS;
  else points = correct === true ? HOOMAN_GOOD_POINTS : HOOMAN_OTHER_POINTS;

  return {
    ok: true,
    rightChoice,
    record: {
      pillar: attention ? 'attention' : pillar,
      item: attention ? 'sum' : item,
      kind,
      value,
      correct,
      points,
      day,
      source,
      transactionId,
      questionId,
    },
  };
}

// Is this answer a low one? A face of 1 or 2, or an old "no".
const isLow = (record) => (record.kind === 'scale' ? Number(record.value) <= 2 : record.kind === 'yesno' && record.value === 'no');

const shiftDay = (day, by) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return utcDay(d);
};

// The score, from a person's saved answers.
//
// `answers` is every record that could count: the last HOOMAN_FINANCE_DAYS
// days. Records outside each rule's own window are ignored here even if
// passed, so the caller's query can be generous without changing the result.
// `today` is the person's own date (their phone's), for the streak.
function computeHoomanScore(answers, { now = new Date(), today = null } = {}) {
  const cutoff = now.getTime() - HOOMAN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const financeCutoff = now.getTime() - HOOMAN_FINANCE_DAYS * 24 * 60 * 60 * 1000;
  const time = (record) => new Date(record.createdAt || now).getTime();
  const all = Array.isArray(answers) ? answers : [];

  // Days whose attention check was answered wrongly: answers that day count half.
  const attention = all.filter((r) => r.pillar === 'attention');
  const unsureDays = new Set(attention.filter((r) => r.correct === false).map((r) => r.day));
  const weightOf = (r) => (unsureDays.has(r.day) ? HOOMAN_UNSURE_WEIGHT : 1);

  const items = {};
  const categories = {};
  let answered = 0;
  let rawTotal = 0;
  const categoryScores = [];

  for (const pillar of HOOMAN_CATALOGUE) {
    let pillarPoints = 0;
    let pillarAnswered = 0;

    for (const entry of pillar.items) {
      const mine = all.filter((r) => r.pillar === pillar.key && r.item === entry.key);
      let counted;
      if (pillar.monthly) {
        // The latest answer, while it is under two months old.
        const newestFirst = mine.filter((r) => time(r) >= financeCutoff).sort((x, y) => time(y) - time(x));
        counted = newestFirst.length ? [newestFirst[0]] : [];
      } else {
        counted = mine.filter((r) => time(r) >= cutoff);
      }
      if (!counted.length) continue;

      const newest = counted.slice().sort((x, y) => time(y) - time(x))[0];
      const weight = counted.reduce((sum, r) => sum + weightOf(r), 0);
      const points = counted.reduce((sum, r) => sum + Number(r.points || 0) * weightOf(r), 0) / weight;

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

  // Days in a row with at least one answer, ending today or yesterday.
  const answerDays = new Set(all.filter((r) => r.pillar !== 'attention').map((r) => r.day));
  const anchor = typeof today === 'string' && DAY_PATTERN.test(today) ? today : utcDay(now);
  let streak = 0;
  let day = answerDays.has(anchor) ? anchor : shiftDay(anchor, -1);
  while (answerDays.has(day)) {
    streak += 1;
    day = shiftDay(day, -1);
  }

  // A gentle support card: the latest "how are you feeling" answer was the
  // lowest face, or the last two were both low (within three weeks).
  const supportCutoff = now.getTime() - 21 * 24 * 60 * 60 * 1000;
  const mental = all
    .filter((r) => r.pillar === 'self' && r.item === 'mental' && time(r) >= supportCutoff)
    .sort((x, y) => time(y) - time(x));
  const support = Boolean(
    mental.length
    && ((mental[0].kind === 'scale' && mental[0].value === '1') || (mental.length >= 2 && isLow(mental[0]) && isLow(mental[1])))
  );

  // Is an attention sum due? Once a week.
  const attentionCutoff = now.getTime() - HOOMAN_ATTENTION_EVERY_DAYS * 24 * 60 * 60 * 1000;
  const attentionDue = !attention.some((r) => time(r) >= attentionCutoff);

  const overall = categoryScores.length
    ? Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length)
    : null;

  return {
    windowDays: HOOMAN_WINDOW_DAYS,
    overall,
    // Out of 100, the overall score in gentle words.
    words: hoomanWords(overall),
    categories,
    items,
    answered,
    totalItems: HOOMAN_TOTAL_ITEMS,
    streak,
    support,
    attentionDue,
    // Kept for older apps, which showed four pillar scores added together.
    rawTotal,
    maxTotal: HOOMAN_CATALOGUE.length * 100,
  };
}

// The score in words. Never a grade: how things are going, not a verdict.
function hoomanWords(overall) {
  if (overall === null || overall === undefined) return null;
  if (overall >= 70) return 'Doing well';
  if (overall >= 50) return 'Steady';
  return 'Could be easier';
}

module.exports = {
  HOOMAN_WINDOW_DAYS,
  HOOMAN_FINANCE_DAYS,
  HOOMAN_SCALE_POINTS,
  HOOMAN_UNSURE_WEIGHT,
  pillarIsMonthly,
  hoomanWords,
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
