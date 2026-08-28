// tests/pull-to-refresh.test.mjs
//
// The dashboard's pull-to-refresh gesture, tested as a gesture rather than
// as a function call: real touch events, at real coordinates, on the real
// scroll container.
//
// The three rules that make it a pull-to-refresh instead of a nuisance are
// all failure modes people notice immediately, so each gets its own test:
//
//   1. It refreshes when pulled from the top.
//   2. It does NOT refresh when the person is midway down the page — there
//      it is an ordinary scroll, unchanged.
//   3. It does not fire on a short drag that was really a tap or a nudge.
//
// "Did it refresh" is measured the only way that means anything: whether
// the account hydration actually went back to the server. The fake API logs
// every call, so the test counts profile reads before and after.
//
//   node --test tests/pull-to-refresh.test.mjs

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { openPage, teardown, ACCOUNTS } from "./browser-harness.mjs";

const visible = async (page, label) =>
  (await page.getByLabel(label, { exact: true }).count().catch(() => 0)) > 0 &&
  (await page.getByLabel(label, { exact: true }).first().isVisible().catch(() => false));

const tapUntil = async (page, tap, until, budget = 30000) => {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    if (await visible(page, until)) return;
    if (await visible(page, tap)) {
      await page.getByLabel(tap, { exact: true }).first().click({ force: true, timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`never reached "${until}"`);
};

async function firstLogin(page, account) {
  await page.waitForTimeout(1200);
  await tapUntil(page, "Continue", "Flip to log in");
  await tapUntil(page, "Flip to log in", "Symbol −");
  for (const symbol of account.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true, timeout: 8000 });
  }
  await page.getByLabel("Log in", { exact: true }).first().click({ force: true, timeout: 12000 });
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 20000 });
  for (const digit of account.pin) {
    await page.getByLabel(`Digit ${digit}`, { exact: true }).click({ force: true, timeout: 8000 });
  }
  await page.getByLabel("Log in", { exact: true }).first().click({ force: true, timeout: 12000 });
  await page.getByLabel("Send", { exact: true }).waitFor({ timeout: 40000 });
}

// A finger: down, a number of intermediate moves, up. Dispatched as real
// TouchEvents on the scroll container, because that is what the component
// listens to — Playwright's mouse would not exercise any of this.
//
// The moves are stepped rather than jumped so the handler sees the same
// progression a real drag produces, including the point where it decides
// whether the gesture is vertical.
async function drag(page, { fromY, dy, steps = 10, settleMs = 900 }) {
  await page.evaluate(
    async ({ fromY, dy, steps }) => {
      const el = document.querySelector('[data-gloobal-scroll="pull-to-refresh"]');
      if (!el) throw new Error("scroll container not found");
      const x = Math.round(window.innerWidth / 2);
      const touch = (clientY) => new Touch({ identifier: 1, target: el, clientX: x, clientY });
      const fire = (type, clientY) => {
        const t = touch(clientY);
        el.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === "touchend" ? [] : [t],
          targetTouches: type === "touchend" ? [] : [t],
          changedTouches: [t]
        }));
      };
      fire("touchstart", fromY);
      for (let i = 1; i <= steps; i++) {
        fire("touchmove", fromY + (dy * i) / steps);
        await new Promise((r) => setTimeout(r, 16));
      }
      fire("touchend", fromY + dy);
    },
    { fromY, dy, steps }
  );
  await page.waitForTimeout(settleMs);
}

const profileCalls = (api) => api.calls.filter((c) => c.path.startsWith("/api/profile/")).length;
// PayLater is served from under /api/assets/, so the two filters have to be
// written against each other or the assets count silently swallows it.
const paylaterCalls = (api) => api.calls.filter((c) => c.path.startsWith("/api/assets/paylater/")).length;
const assetCalls = (api) =>
  api.calls.filter((c) => c.path.startsWith("/api/assets/") && !c.path.startsWith("/api/assets/paylater/")).length;

async function dashboard() {
  const ctx = await openPage({
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 }
  });
  await firstLogin(ctx.page, ACCOUNTS.india);
  // Let the arrival hydration finish so the counts below measure the
  // gesture and nothing else.
  await ctx.page.waitForTimeout(1500);
  return ctx;
}

describe("pull-to-refresh", () => {
  test("pulling down from the top re-hydrates the account", async () => {
    const { page, context, api } = await dashboard();
    try {
      const before = profileCalls(api);
      await drag(page, { fromY: 220, dy: 150 });
      const after = profileCalls(api);
      assert.ok(after > before, `a pull from the top must refresh (profile reads ${before} -> ${after})`);
    } finally {
      await context.close();
    }
  });

  test("one gesture refreshes the whole account, not just the balance", async () => {
    // Section 9 of the brief: the gesture reuses the account hydration
    // rather than re-implementing a list of calls in the UI. If it only
    // refreshed the balance, assets and PayLater would stay stale and this
    // would catch it.
    const { page, context, api } = await dashboard();
    try {
      const before = { profile: profileCalls(api), assets: assetCalls(api), paylater: paylaterCalls(api) };
      await drag(page, { fromY: 220, dy: 150 });
      assert.ok(profileCalls(api) > before.profile, "the balance must be re-read");
      assert.ok(assetCalls(api) > before.assets, "My Assets must be re-read");
      assert.ok(paylaterCalls(api) > before.paylater, "PayLater must be re-read");
    } finally {
      await context.close();
    }
  });

  test("a short drag is not a refresh", async () => {
    const { page, context, api } = await dashboard();
    try {
      const before = profileCalls(api);
      // 30px of finger travel is 15px after damping - well under the 64px
      // threshold, and the kind of movement an ordinary tap produces.
      await drag(page, { fromY: 220, dy: 30 });
      assert.equal(profileCalls(api), before, "a short drag must not trigger a refresh");
    } finally {
      await context.close();
    }
  });

  test("it does not hijack scrolling partway down the page", async () => {
    const { page, context, api } = await dashboard();
    try {
      // Against the fake API the dashboard has no history and no assets, so
      // its content is about 708px and fits the 709px container exactly —
      // there is nothing to scroll. The rule under test is "not at the top",
      // so the test has to create that condition: give the content real
      // height, then genuinely scroll away from the top.
      const metrics = await page.evaluate(() => {
        const el = document.querySelector('[data-gloobal-scroll="pull-to-refresh"]');
        const spacer = document.createElement("div");
        spacer.style.height = "1200px";
        el.firstElementChild.appendChild(spacer);
        el.scrollTop = 260;
        return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
      });
      assert.ok(
        metrics.scrollTop > 0,
        `the container must be genuinely scrolled for this test to mean anything (${JSON.stringify(metrics)})`
      );

      const before = profileCalls(api);
      await drag(page, { fromY: 220, dy: 150 });
      assert.equal(
        profileCalls(api), before,
        "a downward drag from mid-page is a scroll, not a refresh"
      );
    } finally {
      await context.close();
    }
  });

  test("the retry on a failed balance uses the same refresh", async () => {
    // Section 10: one refresh function, reachable from more than one place.
    // The retry button and the gesture must both go back to the server.
    const { page, context, api } = await openPage({
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    try {
      let failing = true;
      await context.route("**/api/profile/**", async (route) => {
        // installApi's handler is what records calls, and this one runs
        // first - so without this the log would show no profile reads at
        // all and the assertion below would be measuring nothing.
        api.calls.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, query: "", body: null });
        if (failing) {
          return route.fulfill({
            status: 500, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ message: "boom" })
          });
        }
        const a = ACCOUNTS.india;
        return route.fulfill({
          status: 200, contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ user: {
            symbolId: a.symbolId, fullName: a.fullName, mobileNumber: a.mobileNumber,
            country: a.country, countryIso: a.countryIso, currency: a.currency,
            balance: a.balance, cashbackRate: 0.01, createdAt: "2026-01-01T00:00:00.000Z" } })
        });
      });

      await firstLogin(page, ACCOUNTS.india);
      await page.waitForFunction(
        () => /Unable to load balance/i.test(document.body.innerText),
        undefined,
        { timeout: 20000 }
      );

      failing = false;
      const before = profileCalls(api);
      await page.getByLabel("Retry loading balance", { exact: true }).click({ force: true });
      await page.waitForFunction(
        () => !/Unable to load balance/i.test(document.body.innerText),
        undefined,
        { timeout: 20000 }
      );
      assert.ok(profileCalls(api) > before, "Retry must go back to the server");
    } finally {
      await context.close();
    }
  });
});

after(async () => {
  await teardown();
});
