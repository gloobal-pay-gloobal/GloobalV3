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
  await opened.page.getByLabel(/^Hooman Score, \d+ of 400/).click({ timeout: 15000 });
  await opened.page.getByLabel("Score", { exact: true }).click({ timeout: 10000 });
  await opened.page.getByText("Hooman Score", { exact: true }).waitFor({ timeout: 10000 });
  return opened;
}

const answerHealthYes = async (page) => {
  await page.locator("button.v2-row", { hasText: /^Self/ }).click();
  await page.getByRole("button", { name: /Health/ }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
};

const hoomanCalls = (api, method, path) => api.calls.filter((c) => c.method === method && c.path === path);

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

describe("saved answers", () => {
  test("a saved score loads when the screen opens", async () => {
    const { page, context, errors } = await openScore({
      hooman: {
        [ME.symbolId]: {
          consented: true,
          answers: [{ pillar: "self", item: "health", kind: "yesno", value: "yes", points: 25, day: todayKey() }]
        }
      }
    });
    try {
      const selfRow = page.locator("button.v2-row", { hasText: /^Self/ });
      await selfRow.getByText("1/5").waitFor({ timeout: 10000 });
      assert.match(await selfRow.innerText(), /100/);
      await page.getByTestId("hooman-saving").getByText("Saved to your account", { exact: false }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  test("the first answer asks first; agreeing saves the answer, not its points", async () => {
    const { page, context, api, errors } = await openScore();
    try {
      await answerHealthYes(page);
      const sheet = page.getByTestId("hooman-consent");
      await sheet.waitFor({ timeout: 10000 });
      assert.match(await sheet.innerText(), /never changes how much you're paid/);
      assert.equal(hoomanCalls(api, "POST", "/api/hooman/answers").length, 0, "an answer was sent before agreeing");

      await sheet.getByRole("button", { name: "Save my answers" }).click();
      await page.getByText("Your Hooman Score is saved to your account").waitFor({ timeout: 10000 });

      assert.equal(hoomanCalls(api, "POST", "/api/hooman/consent").length, 1);
      const sent = hoomanCalls(api, "POST", "/api/hooman/answers");
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].body, { pillar: "self", item: "health", kind: "yesno", value: "yes", day: todayKey(), source: "score" });
      assert.equal(sent[0].body.points, undefined, "the app sent its own points");
      assert.equal(api.state.hooman[ME.symbolId].answers.length, 1);
      assert.equal(api.state.hooman[ME.symbolId].answers[0].points, 25);
      await page.getByLabel("Back", { exact: true }).first().click();
      await page.getByTestId("hooman-saving").getByText("Saved to your account", { exact: false }).waitFor({ timeout: 10000 });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  test("once agreed, later answers save without asking again", async () => {
    const { page, context, api } = await openScore({ hooman: { [ME.symbolId]: { consented: true, answers: [] } } });
    try {
      await answerHealthYes(page);
      await page.getByRole("button", { name: /Food/ }).waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.getByTestId("hooman-consent").count(), 0);
      assert.equal(hoomanCalls(api, "POST", "/api/hooman/answers").length, 1);
    } finally {
      await context.close();
    }
  });

  test("a sum is sent as the sum — the server checks it", async () => {
    const { page, context, api } = await openScore({ hooman: { [ME.symbolId]: { consented: true, answers: [] } } });
    try {
      await page.locator("button.v2-row", { hasText: /^Self/ }).click();
      await page.getByRole("button", { name: /Education/ }).click();
      await page.getByPlaceholder("Your answer").fill("1");
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await page.getByRole("button", { name: /Health/ }).waitFor();
      await page.waitForTimeout(300);
      const sent = hoomanCalls(api, "POST", "/api/hooman/answers");
      assert.equal(sent.length, 1);
      assert.equal(sent[0].body.kind, "math");
      assert.equal(typeof sent[0].body.a, "number");
      assert.equal(typeof sent[0].body.b, "number");
      assert.equal(sent[0].body.value, "1");
      assert.equal(sent[0].body.correct, undefined);
      assert.equal(api.state.hooman[ME.symbolId].answers[0].correct, false);
      assert.equal(api.state.hooman[ME.symbolId].answers[0].points, 10);
    } finally {
      await context.close();
    }
  });
});

describe("saying no, and deleting", () => {
  test("Not now keeps answers on this phone; saving can be turned on later", async () => {
    const { page, context, api } = await openScore();
    try {
      await answerHealthYes(page);
      await page.getByTestId("hooman-consent").getByRole("button", { name: "Not now" }).click();
      await page.getByRole("button", { name: /Food/ }).waitFor();
      assert.equal(hoomanCalls(api, "POST", "/api/hooman/answers").length, 0);
      assert.equal(hoomanCalls(api, "POST", "/api/hooman/consent").length, 0);

      // The answer still counts here.
      await page.getByRole("button", { name: /Food/ }).click();
      await page.getByRole("button", { name: "Yes", exact: true }).click();
      assert.equal(await page.getByTestId("hooman-consent").count(), 0, "asked again after Not now");

      await page.getByLabel("Back", { exact: true }).first().click();
      await page.getByTestId("hooman-saving").getByText("Answers stay on this phone", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Save to my account" }).click();
      await page.getByTestId("hooman-consent").getByRole("button", { name: "Save my answers" }).click();
      await page.getByTestId("hooman-saving").getByText("Saved to your account", { exact: false }).waitFor({ timeout: 10000 });
      // They are sent one after another once the agreement is recorded; the
      // toast is shown after the last one.
      await page.getByText("Your Hooman Score is saved to your account").waitFor({ timeout: 10000 });
      const items = api.state.hooman[ME.symbolId].answers.map((a) => a.item).sort();
      assert.deepEqual(items, ["food", "health"], "the answers from before agreeing were not saved");
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
      assert.match(await text(page), /0\/20 answered/);
    } finally {
      await context.close();
    }
  });
});
