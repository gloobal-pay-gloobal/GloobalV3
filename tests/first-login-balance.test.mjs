// tests/first-login-balance.test.mjs
//
// The 28 August report: on a FIRST login the dashboard showed the wrong
// balance — "Balance unavailable", or a currency figure that was not the
// account's — and a refresh appeared to fix it.
//
// Reproducing it needed a variable the rest of this suite does not have:
// TIME. The fake API answers in about six milliseconds, so the window
// between arriving at the dashboard and the server balance landing is too
// small to see, and every account passed. Production runs on Render's free
// tier, where the instance sleeps when idle and a cold start is 20-50
// seconds. With that latency injected the bug is immediate and obvious.
//
// What it actually was, in two parts:
//
//   1. `balanceStatus` had three values but the dashboard read one boolean
//      (`=== "unavailable"`), so LOADING and CONFIRMED rendered identically
//      — as a hard currency figure taken from the local ledger. The ledger
//      always holds a number (it opens at a fixed float and is rebuilt from
//      empty on every page load), so a Netherlands account whose real
//      balance was €3,120.55 was shown a confident, correctly formatted
//      €10,000.00 for as long as the read took.
//
//   2. `handleStartOver` reset around twenty-five pieces of identity state
//      and not `balanceStatus`, so the next account to sign in inherited the
//      previous one's verdict.
//
// These tests drive the REAL first-login flow — permissions gate, the flip
// to the login side, twelve Gloobal symbols, the PIN — with no seeded
// session, because a test that starts from a restored session cannot see a
// first login at all.
//
//   node --test tests/first-login-balance.test.mjs

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { openPage, teardown, revealBalance, API_ORIGIN, ACCOUNTS } from "./browser-harness.mjs";

// The founder's own two currencies. Netherlands is not in the shared
// fixture set, and EUR matters here: the report named it specifically.
const NETHERLANDS = {
  symbolId: "□□□□□□□□□□□■",
  fullName: "Sanne de Vries",
  mobileNumber: "319000000008",
  country: "NL",
  countryIso: "NL",
  currency: "EUR",
  balance: 3120.55,
  pin: "778899"
};

const accounts = { ...ACCOUNTS, netherlands: NETHERLANDS };

const visible = async (page, label) =>
  (await control(page, label).count().catch(() => 0)) > 0 &&
  (await control(page, label).first().isVisible().catch(() => false));

// Matches a control by aria-label OR by its visible text.
//
// getByLabel alone stopped working when the permissions explainer's
// circular tick (aria-label="Continue", no text) became the app's shared
// "I am IN" button, whose accessible name is the words on it. Adding an
// aria-label to that button to keep the old selector working would have
// been the wrong fix: an accessible name that differs from the visible
// text breaks voice control, where someone says what they can see.
const control = (page, label) =>
  page.getByLabel(label, { exact: true }).or(page.getByRole("button", { name: label, exact: true }));

// The permissions explainer and the login card both animate. A single timed
// click lands mid-transition often enough to make a suite flaky, so both
// steps poll to a condition and re-tap.
const tapUntil = async (page, tap, until, budget = 30000) => {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    if (await visible(page, until)) return;
    if (await visible(page, tap)) {
      await control(page, tap).first().click({ force: true, timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`never reached "${until}" by tapping "${tap}"`);
};

async function firstLogin(page, account) {
  await page.waitForTimeout(1200);
  await tapUntil(page, "I am IN", "Flip to log in");
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

// What the balance line is saying right now, as one of four things. The
// distinction between "loading" and "error" is the entire point of the fix:
// before it, both of them and a confirmed figure were indistinguishable.
const balanceLine = (page) =>
  page.evaluate(() => {
    const t = document.body.innerText;
    return {
      loading: /Loading balance/i.test(t),
      error: /Unable to load balance/i.test(t),
      oldCopy: t.includes("Balance unavailable"),
      masked: t.includes("•••••")
    };
  });

const shownMoney = (page) =>
  page.evaluate(() => {
    const m = document.body.innerText.match(/(?:[₹¥£$€]|Rs\.?)\s?[\d,]+(?:\.\d{1,2})?/);
    return m ? m[0].replace(/\s+/g, "") : null;
  });

// Serve the profile read on a delay, or fail it, without disturbing the rest
// of the fake API. Registered after installApi so this handler wins.
async function interceptProfile(context, { delayMs = 0, status = 200, account }) {
  await context.route(`${API_ORIGIN}/api/profile/**`, async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (status !== 200) {
      return route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ message: "unavailable" })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        user: {
          symbolId: account.symbolId,
          fullName: account.fullName,
          mobileNumber: account.mobileNumber,
          country: account.country,
          countryIso: account.countryIso,
          currency: account.currency,
          balance: account.balance,
          cashbackRate: 0.01,
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      })
    });
  });
}

describe("first login shows the account's real balance", () => {
  // Four countries, four currencies, four decimal conventions. Each signs in
  // for the first time on a device that has never held a session.
  const cases = [
    ["US", ACCOUNTS.america, "$900.00"],
    ["Netherlands", NETHERLANDS, "€3,120.55"],
    ["India", ACCOUNTS.india, "₹10,000.00"],
    ["Britain", ACCOUNTS.britain, "£4,200.00"],
    // Zero-decimal: a yen balance printed with cents has misunderstood the
    // money it is showing.
    ["Japan", ACCOUNTS.japan, "¥750,000"]
  ];

  for (const [name, account, expected] of cases) {
    test(`${name} (${account.currency}) sees its own balance, never a placeholder`, async () => {
      const { page, context } = await openPage({
        accounts,
        permissions: ["geolocation"],
        geolocation: { latitude: 52.37, longitude: 4.9 }
      });
      try {
        await firstLogin(page, account);

        const line = await balanceLine(page);
        assert.equal(line.oldCopy, false, `${name}: the old "Balance unavailable" copy must be gone`);

        await revealBalance(page, account);
        const shown = await shownMoney(page);
        assert.equal(shown, expected, `${name}: expected ${expected} on a first login, saw ${shown}`);
      } finally {
        await context.close();
      }
    });
  }
});

describe("a slow server is a loading state, not a wrong number", () => {
  // The exact production condition: Render cold-starts, the profile read
  // takes twelve seconds, and it eventually succeeds.
  test("a 12s cold start never shows a figure the account does not have", async () => {
    const { page, context } = await openPage({
      accounts,
      permissions: ["geolocation"],
      geolocation: { latitude: 52.37, longitude: 4.9 }
    });
    try {
      await interceptProfile(context, { delayMs: 12000, account: NETHERLANDS });
      await firstLogin(page, NETHERLANDS);
      await revealBalance(page, NETHERLANDS);

      // While the read is in flight the line must SAY it is loading. Before
      // the fix it showed €10,000.00 here - the local ledger's opening
      // float, in the account's own currency, at full size.
      const during = await balanceLine(page);
      const figureDuring = await shownMoney(page);
      assert.equal(during.loading, true, "a pending read must show a loading state");
      assert.notEqual(
        figureDuring, "€10,000.00",
        "the local ledger's opening float must never be presented as the balance"
      );

      // And when it lands, the real figure.
      await page.waitForFunction(
        () => /€3,120\.55/.test(document.body.innerText),
        undefined,
        { timeout: 30000 }
      );
      const after = await balanceLine(page);
      assert.equal(after.loading, false, "the loading state must clear once the balance is confirmed");
      assert.equal(await shownMoney(page), "€3,120.55");
    } finally {
      await context.close();
    }
  });
});

describe("a failed read says so, and offers a way out", () => {
  test("a 500 shows an error and a retry, not a zero", async () => {
    const { page, context } = await openPage({
      accounts,
      permissions: ["geolocation"],
      geolocation: { latitude: 52.37, longitude: 4.9 }
    });
    try {
      await interceptProfile(context, { status: 500, account: ACCOUNTS.america });
      await firstLogin(page, ACCOUNTS.america);

      await page.waitForFunction(
        () => /Unable to load balance/i.test(document.body.innerText),
        undefined,
        { timeout: 20000 }
      );

      const line = await balanceLine(page);
      assert.equal(line.error, true, "a failed read must be reported as a failure");
      assert.equal(line.oldCopy, false, 'the old "Balance unavailable" copy must be gone');

      // The retry is the whole difference between an error state and a dead
      // end, and it must be reachable by assistive technology too.
      assert.equal(
        await page.getByLabel("Retry loading balance", { exact: true }).count(), 1,
        "a failed balance read must offer a labelled retry"
      );
    } finally {
      await context.close();
    }
  });
});

describe("one account's balance never lands on another", () => {
  test("signing out of a failed account does not carry its verdict into the next", async () => {
    const { page, context } = await openPage({
      accounts,
      permissions: ["geolocation"],
      geolocation: { latitude: 52.37, longitude: 4.9 }
    });
    try {
      // A's read fails; B's succeeds. B must be given its own clean cycle.
      let failing = true;
      await context.route(`${API_ORIGIN}/api/profile/**`, async (route) => {
        const id = decodeURIComponent(new URL(route.request().url()).pathname.replace("/api/profile/", ""));
        const account = Object.values(accounts).find((a) => a.symbolId === id);
        if (failing || !account) {
          return route.fulfill({
            status: 500, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ message: "boom" })
          });
        }
        return route.fulfill({
          status: 200, contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ user: {
            symbolId: account.symbolId, fullName: account.fullName, mobileNumber: account.mobileNumber,
            country: account.country, countryIso: account.countryIso, currency: account.currency,
            balance: account.balance, cashbackRate: 0.01, createdAt: "2026-01-01T00:00:00.000Z" } })
        });
      });

      await firstLogin(page, ACCOUNTS.america);
      await page.waitForFunction(
        () => /Unable to load balance/i.test(document.body.innerText),
        undefined,
        { timeout: 20000 }
      );
      assert.equal((await balanceLine(page)).error, true, "account A must be in the error state");

      // Sign out. The bottom nav tabs are text buttons, not labelled controls.
      await page.getByText("Profile", { exact: true }).first().click({ force: true });
      await page.getByText("Exit", { exact: true }).first().click({ force: true, timeout: 15000 });
      await page.waitForTimeout(2000);

      failing = false;
      await firstLogin(page, NETHERLANDS);

      // B must never be shown A's verdict.
      const line = await balanceLine(page);
      assert.equal(line.error, false, "account B inherited account A's failed verdict");

      await revealBalance(page, NETHERLANDS);
      const shown = await shownMoney(page);
      assert.equal(shown, "€3,120.55", `account B must show its own balance, saw ${shown}`);
      assert.ok(!/\$/.test(shown || ""), "account B must not be shown account A's currency");
    } finally {
      await context.close();
    }
  });
});

after(async () => {
  await teardown();
});
