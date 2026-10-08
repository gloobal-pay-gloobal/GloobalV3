// tests/hooman-projects-search-country.test.mjs
//
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome \
//     node --test tests/hooman-projects-search-country.test.mjs
//
// Three controls on the Hooman Projects screen, driven in a browser: the
// search box, the flag chip, and the category list.
//
// ── Why a browser and not a source-shape test ──────────────────────────
//
// All three of these LOOKED correct in the source. The search box was wired
// to the server and the server honoured `q`. The flag chip called a real
// picker and picking a country really did change the country. The categories
// really did each have an icon. Every one of them was reported as broken
// anyway, and every one of them was:
//
//   · the search always sent the SELECTED CATEGORY alongside the text, so a
//     box at the top of the screen searched an eighth of the data and
//     answered "nothing found" the rest of the time;
//   · the flag chip opened the COVERAGE screen's country list — "All
//     countries", a padlock on every row, "0 unlocked" underneath — which is
//     a screen about where Coverage has gone live, not about where a project
//     can be;
//   · the icons were on the four visible tiles and on the project cards, and
//     missing from the one list where all eight can be reached.
//
// Nothing short of opening the screen distinguishes "wired" from "works".
// This file opens it.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const ME = ACCOUNTS.india;
const NOW = new Date().toISOString();

// Deliberately spread across four categories and two countries, because that
// is the only shape in which the two faults are visible: a search confined to
// one category, and a country filter that cannot be changed from here.
const PROJECTS = [
  { _id: "p1", id: "p1", title: "River footbridge", summary: "Connects two villages across the Bagmati", category: "Infrastructure", countryIso: "IN", status: "published", place: "Pokhara", summaryWordCount: 7, createdAt: NOW },
  { _id: "p2", id: "p2", title: "Night school", summary: "Evening literacy classes for mill workers", category: "Education", countryIso: "IN", status: "published", place: "Surat", summaryWordCount: 6, createdAt: NOW },
  { _id: "p3", id: "p3", title: "Bridge the gap coding camp", summary: "Weekend classes for school leavers", category: "Technology", countryIso: "IN", status: "published", place: "Pune", summaryWordCount: 5, createdAt: NOW },
  { _id: "p4", id: "p4", title: "Lagos market rebuild", summary: "Roof and drainage for four hundred stalls", category: "Infrastructure", countryIso: "NG", status: "published", place: "Lagos", summaryWordCount: 7, createdAt: NOW }
];

const tap = async (locator) => {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.click({ force: true });
};

describe("Hooman Projects: searching, choosing a country, choosing a category", () => {
  let page;
  let errors;
  // Every /api/projects request the screen made, so a test can assert on
  // what was ASKED as well as what came back. The category-scoped search is
  // only visible in the request.
  let calls;

  before(async () => {
    await buildOnce();
    const opened = await openPage({
      account: ME,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    page = opened.page;
    errors = opened.errors;
    calls = [];

    // The projects route, answering the way server.js does: country, then
    // category, then a case-insensitive match on title and summary.
    await opened.context.route("**/api/projects**", async (route) => {
      const url = new URL(route.request().url());
      const category = url.searchParams.get("category");
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const iso = url.searchParams.get("country");
      let rows = PROJECTS;
      if (iso) rows = rows.filter((p) => p.countryIso === iso);
      if (category) rows = rows.filter((p) => p.category === category);
      if (q) rows = rows.filter((p) => `${p.title} ${p.summary}`.toLowerCase().includes(q));
      calls.push({ category, q, iso });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, projects: rows, counts: {}, nextCursor: null })
      });
    });

    await login(page, ME);
    await page.getByRole("button", { name: "Accounts", exact: true }).click({ force: true });
    await page.waitForTimeout(1200);
    await tap(page.getByRole("button", { name: /Gloobal coverage/i }).first());
    await page.waitForTimeout(2200);
    // The row is drawn with the Gloobal wordmark's substituted glyphs
    // ("H●+man Projects"), so it cannot be found by its apparent name.
    await page.evaluate(() => {
      [...document.querySelectorAll('[role="button"],button')]
        .find((e) => /man Projects/.test(e.textContent || ""))?.click();
    });
    await page.waitForTimeout(2200);
  });

  after(async () => {
    await teardown();
  });

  const screen = () => page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " | "));

  test("a search looks in every category, not just the selected one", async () => {
    // THE FAULT. Infrastructure is selected on arrival, and "bridge" matches
    // a project in Infrastructure AND one in Technology. Before this, the
    // request carried `category=Infrastructure` and the Technology one was
    // invisible — with nothing on screen to suggest the search had a scope.
    calls.length = 0;
    await page.getByLabel("Search Hooman Projects").fill("bridge");
    await page.waitForTimeout(1600);

    assert.equal(calls.length, 1, `one request per search, got ${calls.length}: ${JSON.stringify(calls)}`);
    assert.equal(calls[0].category, null, "the search still sends a category, so it only looks in one");
    assert.equal(calls[0].iso, "IN", "the search stopped scoping to the country this screen is about");

    const text = await screen();
    assert.match(text, /River footbridge/, "the Infrastructure match is missing");
    assert.match(text, /Bridge the gap/, "the Technology match is missing — the search is still scoped");
    assert.ok(!/Night school/.test(text), "a non-matching project is in the results");
  });

  test("each result says which category it came from", async () => {
    // A list drawn from all eight categories is unplaceable without this.
    // The coloured glyph on the left is a thing you learn; the name is a
    // thing you read.
    const text = await screen();
    assert.match(text, /Infrastructure · Pokhara/);
    assert.match(text, /Technology · Pune/);
  });

  test("no category tile claims to be selected while searching", async () => {
    // The request drops the category, so a lit tile would be the screen
    // telling two stories about the same rows. `aria-pressed` is only on the
    // category tiles; the All/Live/Drafts chips below use it too, which is
    // why this counts tiles by their names rather than counting pressed
    // elements.
    const lit = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-pressed="true"]')]
        .map((e) => (e.textContent || "").trim())
        .filter((t) => ["Infrastructure", "Startup", "Research", "Education"].includes(t))
    );
    assert.deepEqual(lit, [], `a category tile is lit while the search ignores it: ${lit}`);
  });

  test("clearing the box puts the category back", async () => {
    calls.length = 0;
    await page.getByLabel("Search Hooman Projects").fill("");
    await page.waitForTimeout(1400);
    assert.equal(calls.at(-1).category, "Infrastructure", "the category did not come back after the search was cleared");

    const lit = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-pressed="true"]')]
        .map((e) => (e.textContent || "").trim())
        .filter((t) => ["Infrastructure", "Startup", "Research", "Education"].includes(t))
    );
    assert.deepEqual(lit, ["Infrastructure"]);
  });

  test("all eight categories carry their own icon in the full list", async () => {
    // They were on the four tiles and on every project card, and missing
    // here — which is the one place four of the eight can be reached at all.
    // So Healthcare was a pink heart on one screen and a line of text on the
    // next, and half the categories had no mark until you had already picked
    // one and seen the cards.
    await tap(page.getByRole("button", { name: /^All 8$/ }).first());
    await page.waitForTimeout(1200);

    const rows = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => /Roads, bridges|Early-stage|Clinical trials|Schools, scholar|Clinics, medical|Reforestation|Public murals|Open-source/.test(b.textContent || ""))
        .map((b) => ({ label: (b.textContent || "").slice(0, 20).trim(), icons: b.querySelectorAll("svg").length }))
    );
    assert.equal(rows.length, 8, `expected all eight categories, found ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.icons >= 1, `"${row.label}" has no icon`);
    }
  });

  test("the flag chip opens a picker built for projects, not the Coverage one", async () => {
    // What it used to open: the Coverage screen's "All countries" — a
    // padlock or open padlock on every row and "0 unlocked" beneath, all of
    // it about where Gloobal Coverage has gone live. A project can be filed
    // anywhere on earth, so grading countries by Coverage status answers a
    // question nobody asked, and arriving there from a flag on a project
    // screen reads as being thrown somewhere else.
    await page.goBack();
    await page.waitForTimeout(1200);
    await tap(page.getByRole("button", { name: /Change country/i }).first());
    await page.waitForTimeout(1300);

    const text = await screen();
    assert.match(text, /Choose a country/, "the chip did not open the projects picker");
    assert.match(text, /YOUR COUNTRY|Your country/i, "the account's own country is not pinned");
    assert.ok(!/unlocked/i.test(text), "the Coverage picker's unlock language is on a projects screen");
  });

  test("the pinned country is not listed twice", async () => {
    // It was, with the same tick beside both, which reads as a glitch rather
    // than as a shortcut.
    // Counted by aria-label, not textContent: a row is a flag followed by a
    // name, so its text reads "🇮🇳India" and an equality test on it finds
    // nothing while happily reporting success.
    const indiaRows = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => /^India(,|$)/.test(b.getAttribute("aria-label") || "")).length
    );
    assert.equal(indiaRows, 1, `India appears ${indiaRows} times in the picker`);
  });

  test("picking a country changes the list and stays on the screen", async () => {
    await page.getByLabel("Search countries").fill("Nigeria");
    await page.waitForTimeout(800);
    calls.length = 0;
    await tap(page.getByRole("button", { name: /^Nigeria$/ }).first());
    await page.waitForTimeout(2200);

    assert.equal(calls.at(-1).iso, "NG", "the country did not reach the request");

    const text = await screen();
    assert.ok(!/Choose a country/.test(text), "the picker stayed open");
    // Still on Hooman Projects — not dropped back onto Coverage, which is
    // what the old picker felt like.
    assert.match(text, /Categories/, "the picker navigated away from Hooman Projects");
    assert.match(text, /Raised/);
    assert.match(text, /Lagos market rebuild/, "the list did not follow the country");
    assert.ok(!/River footbridge/.test(text), "a project from the previous country is still listed");
  });

  test("nothing threw while all of that happened", async () => {
    // Last, after the interactions — not after the first render. A hook in
    // the wrong place throws only when its handler RUNS, and this repo has
    // already shipped a screen that rendered perfectly and whose form
    // silently refused to open.
    assert.deepEqual(errors, []);
  });
});
