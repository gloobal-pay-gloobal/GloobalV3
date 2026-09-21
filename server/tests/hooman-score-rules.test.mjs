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

  test("a sum is checked, not taken on trust", () => {
    const right = ok({ pillar: "self", item: "education", kind: "math", a: 34, b: 35, value: 69 });
    const wrong = ok({ pillar: "self", item: "education", kind: "math", a: 34, b: 35, value: 70 });
    assert.deepEqual([right.correct, right.points], [true, 25]);
    assert.deepEqual([wrong.correct, wrong.points], [false, 10]);
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
    [{ pillar: "self", item: "health", kind: "math", a: 1, b: 2, value: 3 }, "hooman_wrong_kind"],
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

  test("a Finance answer locks: the first one counts, however old", () => {
    const s = H.computeHoomanScore([no("finance", "savings", daysAgo(200)), yes("finance", "savings", daysAgo(1))], { now: NOW });
    assert.equal(s.items["finance.savings"].points, 10, "a later answer replaced the locked one");
    assert.equal(s.items["finance.savings"].count, 1);
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
