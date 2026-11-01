// The Hooman Score rules (lib/hoomanScore.js), on their own.
//
//   node --test tests/hooman-score-rules.test.mjs
//
// No database and no server: these are the rules the routes apply, tested
// directly. tests/hooman-score.test.mjs covers the routes against a real
// throwaway database.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const H = require("../lib/hoomanScore.js");
const BANK = require("../data/hoomanQuestionBank.json");

const NOW = new Date("2026-09-21T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const ok = (input) => {
  const r = H.evaluateHoomanAnswer(input, { bank: BANK, now: NOW });
  assert.ok(r.ok, `refused: ${r.code}`);
  return r.record;
};
const refused = (input) => H.evaluateHoomanAnswer(input, { bank: BANK, now: NOW });
const saved = (record, createdAt = NOW) => ({ ...record, createdAt });

describe("what an answer is worth — decided by the server", () => {
  test("yes is 25, no is 10: nobody is scored zero for an honest answer", () => {
    assert.equal(ok({ pillar: "self", item: "health", kind: "yesno", value: "yes" }).points, 25);
    assert.equal(ok({ pillar: "self", item: "health", kind: "yesno", value: "no" }).points, 10);
  });

  test("five faces are worth 10, 14, 18, 21 and 25 — never zero", () => {
    const pts = [1, 2, 3, 4, 5].map((face) => ok({ pillar: "self", item: "sleep", kind: "scale", value: String(face) }).points);
    assert.deepEqual(pts, [10, 14, 18, 21, 25]);
    assert.equal(ok({ pillar: "self", item: "sleep", kind: "scale", value: 4 }).value, "4", "a number face is stored as text");
  });

  test("a sum is an attention check: checked, filed on its own, worth nothing to a pillar", () => {
    const right = ok({ pillar: "self", item: "education", kind: "math", a: 34, b: 35, value: 69 });
    const wrong = ok({ pillar: "self", item: "education", kind: "math", a: 34, b: 35, value: 70 });
    assert.deepEqual([right.pillar, right.item, right.correct, right.points], ["attention", "sum", true, 0]);
    assert.deepEqual([wrong.correct, wrong.points], [false, 0]);
    // From any check-in it was asked beside, even one that no longer has sums.
    assert.equal(ok({ pillar: "finance", item: "budgeting", kind: "math", a: 1, b: 2, value: 3 }).pillar, "attention");
  });

  test("a three-number sum (after a payment) is checked as well", () => {
    const right = ok({ pillar: "self", item: "education", kind: "math", a: 34, b: 35, c: 36, value: 105 });
    const wrong = ok({ pillar: "self", item: "education", kind: "math", a: 34, b: 35, c: 36, value: 107 });
    assert.deepEqual([right.correct, wrong.correct], [true, false]);
    assert.equal(refused({ pillar: "self", item: "education", kind: "math", a: 1, b: 2, c: "x", value: 3 }).code, "hooman_bad_answer");
  });

  test("after a knowledge answer the right option is known, but never stored", () => {
    const q = BANK.questions.find((x) => x.id === "cap-au");
    const r = H.evaluateHoomanAnswer({ pillar: "self", item: "education", kind: "knowledge", questionId: "cap-au", choice: (q.answer + 1) % 4 }, { bank: BANK, now: NOW });
    assert.equal(r.rightChoice, q.answer);
    assert.equal(r.record.rightChoice, undefined);
  });

  test("a knowledge answer is checked against the server's own answer key", () => {
    const q = BANK.questions.find((x) => x.id === "cap-au");
    const right = ok({ pillar: "self", item: "education", kind: "knowledge", questionId: "cap-au", choice: q.answer });
    const wrong = ok({ pillar: "self", item: "education", kind: "knowledge", questionId: "cap-au", choice: (q.answer + 1) % 4 });
    assert.deepEqual([right.correct, right.points], [true, 25]);
    assert.deepEqual([wrong.correct, wrong.points], [false, 10]);
  });

  test("points sent by the app are ignored", () => {
    const r = ok({ pillar: "self", item: "health", kind: "yesno", value: "no", points: 25 });
    assert.equal(r.points, 10, "the client's own points were believed");
  });

  test("the question the app is shown never carries its answer", () => {
    for (const q of BANK.questions) {
      const shown = H.publicQuestion(q);
      assert.equal(shown.answer, undefined, `${q.id} leaked its answer`);
      assert.deepEqual(shown.options, q.options);
    }
  });
});

describe("what is refused", () => {
  const cases = [
    [{ pillar: "self", item: "nope", kind: "yesno", value: "yes" }, "hooman_unknown_checkin"],
    [{ pillar: "nope", item: "health", kind: "yesno", value: "yes" }, "hooman_unknown_checkin"],
    [{ pillar: "self", item: "health", kind: "knowledge", questionId: "cap-au", choice: 1 }, "hooman_wrong_kind"],
    [{ pillar: "self", item: "health", kind: "scale", value: "6" }, "hooman_bad_answer"],
    [{ pillar: "self", item: "health", kind: "scale", value: "0" }, "hooman_bad_answer"],
    [{ pillar: "self", item: "health", kind: "scale", value: "happy" }, "hooman_bad_answer"],
    // Knowledge questions count toward Education only.
    [{ pillar: "community", item: "voice", kind: "knowledge", questionId: "cap-au", choice: 1 }, "hooman_wrong_kind"],
    [{ pillar: "self", item: "health", kind: "yesno", value: "maybe" }, "hooman_bad_answer"],
    [{ pillar: "self", item: "education", kind: "math", a: 5000, b: 1, value: 5001 }, "hooman_bad_answer"],
    [{ pillar: "self", item: "education", kind: "math", a: "x", b: 1, value: 2 }, "hooman_bad_answer"],
    [{ pillar: "self", item: "education", kind: "knowledge", questionId: "not-a-question", choice: 0 }, "hooman_unknown_question"],
    [{ pillar: "self", item: "education", kind: "knowledge", questionId: "cap-au", choice: 4 }, "hooman_bad_answer"],
    // Every payment counts once — so an answer after a payment must say which.
    [{ pillar: "self", item: "health", kind: "yesno", value: "yes", source: "payment" }, "hooman_bad_transaction"],
  ];
  for (const [input, code] of cases) {
    test(`${code}: ${JSON.stringify(input)}`, () => {
      const r = refused(input);
      assert.equal(r.ok, false);
      assert.equal(r.code, code);
    });
  }

  test("a malformed day falls back to the server's date instead of being stored", () => {
    assert.equal(ok({ pillar: "self", item: "health", kind: "yesno", value: "yes", day: "21/09/2026" }).day, "2026-09-21");
    assert.equal(ok({ pillar: "self", item: "health", kind: "yesno", value: "yes", day: "2026-09-20" }).day, "2026-09-20");
  });
});

describe("the score", () => {
  const yes = (pillar, item, when) => saved(ok({ pillar, item, kind: "yesno", value: "yes" }), when);
  const no = (pillar, item, when) => saved(ok({ pillar, item, kind: "yesno", value: "no" }), when);

  test("nothing answered is no score, not a score of zero", () => {
    const s = H.computeHoomanScore([], { now: NOW });
    assert.equal(s.overall, null);
    assert.equal(s.answered, 0);
    assert.equal(s.totalItems, 20);
    assert.equal(s.maxTotal, 400);
  });

  test("a check-in's points are the average of its answers", () => {
    const s = H.computeHoomanScore([yes("self", "health"), no("self", "health")], { now: NOW });
    assert.equal(s.items["self.health"].points, 17.5);
    assert.equal(s.items["self.health"].count, 2);
    assert.equal(s.categories.self.score, 70);
    assert.equal(s.overall, 70);
  });

  test("answering more often, with the same answers, does not raise the score", () => {
    // The worry behind "every payment counts": that someone who pays twenty
    // times a day would out-score someone who pays once. An average cannot.
    const once = H.computeHoomanScore([yes("self", "food")], { now: NOW });
    const twenty = H.computeHoomanScore(Array.from({ length: 20 }, () => yes("self", "food")), { now: NOW });
    assert.equal(twenty.overall, once.overall);
    const onceNo = H.computeHoomanScore([no("self", "food")], { now: NOW });
    const twentyNo = H.computeHoomanScore(Array.from({ length: 20 }, () => no("self", "food")), { now: NOW });
    assert.equal(twentyNo.overall, onceNo.overall);
  });

  test("answers older than the window stop counting", () => {
    const s = H.computeHoomanScore([no("self", "sleep", daysAgo(31)), yes("self", "sleep", daysAgo(2))], { now: NOW });
    assert.equal(s.items["self.sleep"].points, 25);
    assert.equal(s.items["self.sleep"].count, 1);
    const gone = H.computeHoomanScore([yes("self", "sleep", daysAgo(31))], { now: NOW });
    assert.equal(gone.items["self.sleep"], undefined);
    assert.equal(gone.overall, null);
  });

  test("Finance counts its LATEST answer for two months (it is asked monthly now)", () => {
    const s = H.computeHoomanScore([no("finance", "savings", daysAgo(40)), yes("finance", "savings", daysAgo(1))], { now: NOW });
    assert.equal(s.items["finance.savings"].points, 25, "the newer monthly answer should count");
    assert.equal(s.items["finance.savings"].count, 1);
    const old = H.computeHoomanScore([yes("finance", "savings", daysAgo(63))], { now: NOW });
    assert.equal(old.items["finance.savings"], undefined, "a Finance answer older than two months still counted");
    assert.equal(H.pillarIsMonthly("finance"), true);
    assert.equal(H.pillarIsMonthly("self"), false);
  });

  test("the latest answer is what the screen shows as the current one", () => {
    const s = H.computeHoomanScore([no("self", "mental", daysAgo(3)), yes("self", "mental", daysAgo(1))], { now: NOW });
    assert.equal(s.items["self.mental"].latest.value, "yes");
  });

  test("pillars average into the overall score, and the profile total out of 400", () => {
    const s = H.computeHoomanScore([
      yes("self", "health"),         // self 100
      no("community", "trust"),      // community 40
    ], { now: NOW });
    assert.equal(s.categories.self.score, 100);
    assert.equal(s.categories.community.score, 40);
    assert.equal(s.categories.environment.score, null);
    assert.equal(s.overall, 70);
    assert.equal(s.rawTotal, 140);
    assert.equal(s.answered, 2);
  });
});

describe("the question bank", () => {
  test("every question has four distinct options and a valid answer", () => {
    assert.ok(BANK.questions.length >= 30, `only ${BANK.questions.length} questions`);
    const ids = new Set();
    for (const q of BANK.questions) {
      assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
      ids.add(q.id);
      assert.equal(q.options.length, 4, q.id);
      assert.equal(new Set(q.options).size, 4, `${q.id} repeats an option`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${q.id} answer`);
    }
  });

  test("the continents question is not in it — the answer depends on which school you went to", () => {
    assert.equal(BANK.questions.find((q) => q.id === "geo-continents"), undefined);
  });
});

describe("0180: words, days in a row, attention, support", () => {
  const face = (pillar, item, value, when = NOW, day) => saved(ok({ pillar, item, kind: "scale", value: String(value), day: day || when.toISOString().slice(0, 10) }), when);
  const sum = (correct, when = NOW, day) => saved(ok({ pillar: "self", item: "education", kind: "math", a: 3, b: 4, value: correct ? 7 : 8, day: day || when.toISOString().slice(0, 10) }), when);

  test("the score comes with gentle words, never a grade", () => {
    assert.equal(H.hoomanWords(null), null);
    assert.equal(H.hoomanWords(85), "Doing well");
    assert.equal(H.hoomanWords(70), "Doing well");
    assert.equal(H.hoomanWords(55), "Steady");
    assert.equal(H.hoomanWords(30), "Could be easier");
    assert.equal(H.computeHoomanScore([face("self", "sleep", 5)], { now: NOW }).words, "Doing well");
  });

  test("the score shows from the very first answer", () => {
    const s = H.computeHoomanScore([face("self", "sleep", 3)], { now: NOW });
    assert.equal(s.overall, 72);
    assert.equal(s.answered, 1);
  });

  test("days in a row count back from today, or from yesterday", () => {
    const answers = [0, 1, 2].map((n) => face("self", "sleep", 4, daysAgo(n)));
    assert.equal(H.computeHoomanScore(answers, { now: NOW, today: "2026-09-21" }).streak, 3);
    assert.equal(H.computeHoomanScore(answers.slice(1), { now: NOW, today: "2026-09-21" }).streak, 2, "not answered yet today still keeps yesterday's run");
    assert.equal(H.computeHoomanScore([face("self", "sleep", 4, daysAgo(3))], { now: NOW, today: "2026-09-21" }).streak, 0);
  });

  test("a wrong attention sum halves that day's answers, and is due weekly", () => {
    const good = H.computeHoomanScore([face("self", "sleep", 5, daysAgo(1)), face("self", "sleep", 1)], { now: NOW });
    assert.equal(good.items["self.sleep"].points, 17.5);
    const unsure = H.computeHoomanScore([face("self", "sleep", 5, daysAgo(1)), face("self", "sleep", 1), sum(false)], { now: NOW });
    assert.equal(unsure.items["self.sleep"].points, (25 + 10 * 0.5) / 1.5, "today's answer should count half");
    assert.equal(unsure.categories.attention, undefined, "an attention sum became a pillar");
    assert.equal(good.attentionDue, true);
    assert.equal(unsure.attentionDue, false);
    assert.equal(H.computeHoomanScore([sum(true, daysAgo(8))], { now: NOW }).attentionDue, true);
  });

  test("support: the lowest face, or two low answers in a row, about how you feel", () => {
    assert.equal(H.computeHoomanScore([face("self", "mental", 1)], { now: NOW }).support, true);
    assert.equal(H.computeHoomanScore([face("self", "mental", 2)], { now: NOW }).support, false, "one low answer is not a pattern");
    assert.equal(H.computeHoomanScore([face("self", "mental", 2, daysAgo(4)), face("self", "mental", 2)], { now: NOW }).support, true);
    assert.equal(H.computeHoomanScore([face("self", "mental", 2, daysAgo(4)), face("self", "mental", 4)], { now: NOW }).support, false, "feeling better clears it");
    assert.equal(H.computeHoomanScore([face("self", "mental", 1, daysAgo(25))], { now: NOW }).support, false, "three weeks on, it no longer shows");
  });
});
