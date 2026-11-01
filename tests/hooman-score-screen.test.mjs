// tests/hooman-score-screen.test.mjs
//
// The Hooman Score screen, now that answers are saved to the account.
//
// ── What was wrong ───────────────────────────────────────────────────────
//
// Every answer lived in the Dashboard component's state and nowhere else, so
// the score reset to nothing on every reload, on every phone. It was also
// called "Gloobal Human Score" — the name is "Hooman Score".
//
// ── What this pins ───────────────────────────────────────────────────────
//
//   - the name, everywhere a person reads it;
//   - a saved score loads when the screen opens;
//   - nothing is saved before the person agrees, once, in the consent sheet;
//   - the app sends the ANSWER, never its points — the server scores it;
//   - "Not now" keeps answers on this phone, and saving can be turned on later;
//   - "Delete my answers" removes everything and turns saving off.
//
// Since 0180 (founder, 1 Nov): the score shows from the first answer, out of
// 100, in gentle words; a daily check-in of one card per pillar, answered
// with five faces; a weekly attention sum that never counts in a pillar;
// Finance asked monthly; days in a row; a support card.
//
// The fake API scores answers with server/lib/hoomanScore.js itself, so these
// run against the real rules rather than a copy of them.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, login, teardown, ACCOUNTS, text } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const ME = ACCOUNTS.india;
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function openScore(options = {}) {
  const opened = await openPage({ account: ME, ...options });
  await login(opened.page, ME);
  await opened.page.getByRole("button", { name: "Profile", exact: true }).click({ timeout: 15000 });
  await opened.page.getByLabel(/^Hooman Score, (no score yet|\d+ out of 100)/).click({ timeout: 15000 });
  await opened.page.getByLabel("Score", { exact: true }).click({ timeout: 10000 });
  await opened.page.getByText("Hooman Score", { exact: true }).waitFor({ timeout: 10000 });
  return opened;
}

// Start today's check-in and answer the first card with "Mostly" (face 4).
const answerFirstCard = async (page) => {
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByText("Today's check-in", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Mostly", exact: true }).click();
};

// The harness serves a static build without one start-up asset (a 404 the
// audit traced to the harness, not the app); everything else must be clean.
const pageErrors = (errors) => errors.filter((e) => !/Failed to load resource: .*404/.test(e));

const hoomanCalls = (api, method, path) => api.calls.filter((c) => c.method === method && c.path.split("?")[0] === path);

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

describe("the name", () => {
  test("it is Hooman Score, with no Gloobal wordmark in front", () => {
    const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
    assert.ok(!dash.includes("Human Score"), "\"Human Score\" is still in the Dashboard");
    assert.ok(!/GloobalWordmark suffix=" Hooman/.test(dash), "the header still carries the Gloobal wordmark");
    const app = readSource("frontend/App.jsx");
    assert.match(app, /key: "ghscore",[^}]*label: "Hooman Score"/);
  });
});

describe("the overview", () => {
  test("first visit: no score yet, one button, never 0 out of 400", async () => {
    const { page, context, errors } = await openScore();
    try {
      await page.getByText("No score yet").waitFor({ timeout: 10000 });
      const shown = await text(page);
      assert.doesNotMatch(shown, /out of 400/);
      assert.match(shown, /Today's check-in/);
      assert.match(shown, /4 questions/);
      assert.match(shown, /never changes your money or your Creator Share/);
      assert.deepEqual(pageErrors(errors), []);
    } finally {
      await context.close();
    }
  });

  test("a saved score shows from its first answer, out of 100, in words", async () => {
    const { page, context, errors } = await openScore({
      hooman: { [ME.symbolId]: { consented: true, answers: [{ pillar: "self", item: "health", kind: "scale", value: "4", points: 21, day: todayKey() }] } }
    });
    try {
      await page.getByTestId("hooman-overall").waitFor({ timeout: 10000 });
      assert.equal(await page.getByTestId("hooman-overall").innerText(), "84");
      const shown = await text(page);
      assert.match(shown, /out of 100 · Doing well/);
      assert.match(shown, /From 1 of 20 check-ins/);
      assert.doesNotMatch(shown, /Needs Work/);
      await page.getByTestId("hooman-saving").getByText("Saved to your account", { exact: false }).waitFor();
      assert.deepEqual(pageErrors(errors), []);
    } finally {
      await context.close();
    }
  });

  test("a pillar opens to its check-ins, each with its last answer and age", async () => {
    const { page, context } = await openScore({
      hooman: { [ME.symbolId]: { consented: true, answers: [{ pillar: "self", item: "sleep", kind: "scale", value: "2", points: 14, day: todayKey() }] } }
    });
    try {
      await page.getByRole("button", { name: /^Self, / }).click();
      await page.getByText("Each answer counts for 30 days", { exact: false }).waitFor();
      const shown = await text(page);
      assert.match(shown, /Sleep[\s\S]*today/);
      assert.match(shown, /Not answered yet/);
    } finally {
      await context.close();
    }
  });
});

describe("the daily check-in", () => {
  test("the first answer asks first; agreeing saves the face, not its points", async () => {
    const { page, context, api, errors } = await openScore();
    try {
      await answerFirstCard(page);
      const sheet = page.getByTestId("hooman-consent");
      await sheet.waitFor({ timeout: 10000 });
      assert.match(await sheet.innerText(), /never changes how much you're paid/);
      assert.equal(hoomanCalls(api, "POST", "/api/hooman/answers").length, 0, "an answer was sent before agreeing");
      await sheet.getByRole("button", { name: "Save my answers" }).click();
      await page.getByText("Your Hooman Score is saved to your account").waitFor({ timeout: 10000 });
      const sent = hoomanCalls(api, "POST", "/api/hooman/answers");
      assert.equal(sent.length, 1);
      assert.equal(sent[0].body.pillar, "self", "the first card is not the Self pillar");
      assert.equal(sent[0].body.kind, "scale");
      assert.equal(sent[0].body.value, "4");
      assert.equal(sent[0].body.day, todayKey());
      assert.equal(sent[0].body.points, undefined, "the app sent its own points");
      assert.equal(api.state.hooman[ME.symbolId].answers[0].points, 21);
      assert.deepEqual(pageErrors(errors), []);
    } finally {
      await context.close();
    }
  });

  test("four cards, one per pillar, then the weekly sum, then the score and what changed", async () => {
    const { page, context, api, errors } = await openScore({ hooman: { [ME.symbolId]: { consented: true, answers: [] } } });
    try {
      await page.getByRole("button", { name: "Start", exact: true }).click();
      for (let i = 0; i < 4; i += 1) {
        await page.getByText(`${i + 1} of 5`, { exact: true }).waitFor();
        await page.getByRole("button", { name: "Mostly", exact: true }).click();
      }
      // The attention sum: tap the right answer.
      await page.getByText("5 of 5", { exact: true }).waitFor();
      const sum = await page.getByText(/^\d+ \+ \d+ = \?$/).innerText();
      const [a, b] = sum.match(/\d+/g).map(Number);
      await page.getByRole("button", { name: String(a + b), exact: true }).click();
      await page.getByText("Today's check-in done").waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
      const sent = hoomanCalls(api, "POST", "/api/hooman/answers").map((c) => c.body);
      assert.deepEqual(sent.slice(0, 4).map((b2) => b2.pillar), ["self", "community", "environment", "finance"]);
      assert.equal(sent[4].kind, "math");
      const stored = api.state.hooman[ME.symbolId].answers.find((r) => r.kind === "math");
      assert.deepEqual([stored.pillar, stored.points, stored.correct], ["attention", 0, true], "the sum counted toward a pillar");
      const shown = await text(page);
      assert.match(shown, /84/);
      assert.match(shown, /1 day in a row/);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByText("Done for today").waitFor();
      assert.deepEqual(pageErrors(errors), []);
    } finally {
      await context.close();
    }
  });

  test("Finance answered this month is not asked again this month", async () => {
    const month = todayKey();
    const finance = ["savings", "budgeting", "debt", "security", "insurance"].map((item) => ({ pillar: "finance", item, kind: "scale", value: "3", points: 18, day: month }));
    const { page, context } = await openScore({ hooman: { [ME.symbolId]: { consented: true, answers: finance } } });
    try {
      await page.getByText("3 questions", { exact: false }).waitFor({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });
});

describe("support", () => {
  test("the lowest face for how you feel shows a gentle card with India's Tele-MANAS line", async () => {
    const { page, context, errors } = await openScore({
      hooman: { [ME.symbolId]: { consented: true, answers: [{ pillar: "self", item: "mental", kind: "scale", value: "1", points: 10, day: todayKey() }] } }
    });
    try {
      const card = page.getByTestId("hooman-support");
      await card.waitFor({ timeout: 10000 });
      const shown = await card.innerText();
      assert.match(shown, /Tele-MANAS · 14416/);
      assert.match(shown, /local emergency number/);
      assert.equal(await card.getByRole("link").getAttribute("href"), "tel:14416");
      await card.getByRole("button", { name: "Not now" }).click();
      assert.equal(await page.getByTestId("hooman-support").count(), 0);
      assert.deepEqual(pageErrors(errors), []);
    } finally {
      await context.close();
    }
  });
});

describe("saying no, and deleting", () => {
  test("Not now keeps answers on this phone; saving can be turned on later", async () => {
    const { page, context, api } = await openScore();
    try {
      await answerFirstCard(page);
      await page.getByTestId("hooman-consent").getByRole("button", { name: "Not now" }).click();
      await page.getByText("2 of 4", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Mostly", exact: true }).click();
      assert.equal(await page.getByTestId("hooman-consent").count(), 0, "asked again after Not now");
      assert.equal(hoomanCalls(api, "POST", "/api/hooman/answers").length, 0);
      await page.getByLabel("Close the check-in").click();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByTestId("hooman-saving").getByText("Answers stay on this phone", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Save to my account" }).click();
      await page.getByTestId("hooman-consent").getByRole("button", { name: "Save my answers" }).click();
      await page.getByTestId("hooman-saving").getByText("Saved to your account", { exact: false }).waitFor({ timeout: 10000 });
      await page.getByText("Your Hooman Score is saved to your account").waitFor({ timeout: 10000 });
      const pillars = api.state.hooman[ME.symbolId].answers.map((a) => a.pillar).sort();
      assert.deepEqual(pillars, ["community", "self"], "the answers from before agreeing were not saved");
    } finally {
      await context.close();
    }
  });

  test("Delete my answers removes everything and turns saving off", async () => {
    const { page, context, api } = await openScore({
      hooman: {
        [ME.symbolId]: {
          consented: true,
          answers: [
            { pillar: "self", item: "health", kind: "yesno", value: "yes", points: 25, day: todayKey() },
            { pillar: "community", item: "trust", kind: "yesno", value: "no", points: 10, day: todayKey() }
          ]
        }
      }
    });
    try {
      await page.getByRole("button", { name: "Delete my answers" }).click();
      const sheet = page.getByTestId("hooman-delete");
      await sheet.waitFor();
      await sheet.getByRole("button", { name: "Delete my answers" }).click();
      await page.getByTestId("hooman-saving").getByText("Answers stay on this phone", { exact: false }).waitFor({ timeout: 10000 });
      assert.equal(hoomanCalls(api, "DELETE", "/api/hooman").length, 1);
      assert.deepEqual(api.state.hooman[ME.symbolId], { consented: false, answers: [] });
      await page.getByText("No score yet").waitFor();
    } finally {
      await context.close();
    }
  });
});
