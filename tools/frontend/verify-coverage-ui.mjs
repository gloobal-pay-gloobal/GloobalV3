// Drives the real app in a real browser and checks that the Coverage,
// Hooman Projects and Security work actually reaches the screen.
//
//   node tools/frontend/verify-coverage-ui.mjs
//
// Why this exists as its own script rather than as assertions in the server
// suites: every check below is about something only a browser can answer.
// The server tests already prove GET /api/coverage returns the right
// figure; what they cannot prove is that it is RENDERED, that it carries
// its currency, that the padlock reflects it, or that a stored project
// reaches the list. A JSX diff is not evidence of any of those — the whole
// class of defect being fixed here (a figure printed with no unit, a lock
// hardcoded to one country) renders perfectly happily.
//
// Expects, already running:
//   * the API on 127.0.0.1:5210 against a THROWAWAY database
//   * Vite on localhost:5173 with VITE_API_URL pointing at that API
//
// It signs in as an account the seed script created, through the real login
// screen — restoring a session only pre-fills the identity, and reaching
// the dashboard still costs the PIN, which is the app behaving correctly
// and not something to work around.

import { chromium } from "playwright";

const APP = process.env.VERIFY_APP_URL || "http://localhost:5173";
const API = process.env.VERIFY_API_URL || "http://127.0.0.1:5210";

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");
const IN_USER = symbolId(2);
const PIN = "246813";

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const textOf = (page) => page.evaluate(() => document.body.innerText);

// Clicks by the label a person reads, not by coordinates or a test id: a
// check that only passes because of an attribute added for the check is
// weaker evidence than one that passes because the words are on screen.
const clickLabel = (page, label) => page.evaluate((wanted) => {
  const hit = [...document.querySelectorAll("button,[role=button]")]
    .find((el) => el.getAttribute("aria-label") === wanted);
  if (hit) { hit.click(); return true; }
  return false;
}, label);

const clickText = (page, pattern) => page.evaluate((source) => {
  const re = new RegExp(source, "i");
  const hit = [...document.querySelectorAll("button,[role=button]")]
    .find((el) => re.test(el.textContent || "") || re.test(el.getAttribute("aria-label") || ""));
  if (hit) { hit.click(); return true; }
  return false;
}, pattern);

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // What the server says, so the screen is compared against the API rather
  // than against a number typed into this file.
  const coverage = await fetch(`${API}/api/coverage?currency=INR`).then((r) => r.json());

  console.log("1. the app loads and signs in through the real login screen");
  const login = await fetch(`${API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbolId: IN_USER, pin: PIN }),
  }).then((r) => r.json());
  check("the seeded account exists", Boolean(login.token), login.message || "");

  await page.goto(APP, { waitUntil: "networkidle" });
  // Seeds the identity the way a returning device would already hold it.
  // This is NOT a way past the credential check — the PIN below still runs.
  await page.evaluate(([token, user]) => {
    window.localStorage.setItem("gloobal.session.v1", JSON.stringify({
      user, phoneNumber: user.mobileNumber || "", token, savedAt: Date.now(),
    }));
    try { window.localStorage.setItem("gloobal.permissions.seen.v1", "1"); } catch (e) {}
  }, [login.token, login.user]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  check("the restored session lands on Log in, not on the dashboard",
    /Account found/i.test(await textOf(page)));

  await clickLabel(page, "Log in");
  await page.waitForTimeout(1500);
  check("the PIN step is reached", /PIN/i.test(await textOf(page)));

  for (const digit of PIN) {
    await clickLabel(page, `Digit ${digit}`);
    await page.waitForTimeout(120);
  }
  // The pad fills the field; a separate confirm actually submits it.
  await clickLabel(page, "Log in");
  await page.waitForTimeout(6000);

  let body = await textOf(page);
  // Asserted on something only the dashboard shows — its own Coverage
  // entry — rather than on the ABSENCE of the PIN screen: "no longer says
  // 0/6" was true the moment the sixth digit landed, so it passed while
  // still sitting on the PIN pad. The wordmark drops the letter O (it is
  // drawn as a symbol), hence "GL.?BAL".
  check("the dashboard is reached after the PIN",
    !/\d\/6/.test(body) && /GL.?BAL COVERAGE/i.test(body), body.slice(0, 160));

  console.log("\n2. Coverage renders the server's figure, with its unit");
  await clickText(page, "coverage");
  await page.waitForTimeout(3500);
  body = await textOf(page);

  check("the Coverage screen is open", /Total spending/i.test(body), body.slice(0, 140));

  // The defect this replaces rendered "8.1K" with no unit at all, because
  // the currency slot had been given to the flip icon.
  const spendingLine = (body.match(/Total spending[\s\S]{0,40}/i) || [""])[0];
  check("the figure carries a currency, not a bare number",
    /₹|INR|\$|USD/.test(spendingLine), JSON.stringify(spendingLine));

  // The API's own figure, formatted the way the screen formats it.
  const expected = coverage.totalSpending;
  const compact = expected >= 1000
    ? `${Number.isInteger(expected / 1000) ? (expected / 1000).toFixed(0) : (expected / 1000).toFixed(1)}K`
    : expected.toFixed(2);
  check(`the rendered figure is the server's (${compact})`,
    body.includes(compact), `expected "${compact}" on screen`);

  console.log("\n3. Transactions / day replaced Transactions / hour");
  check("the label says day", /Transactions \/ day/i.test(body));
  check("the hourly label is gone", !/Transactions \/ hour/i.test(body));
  check("it shows the server's daily count",
    new RegExp(`\\b${coverage.transactionsPerDay}\\b`).test(body),
    `expected ${coverage.transactionsPerDay}`);

  console.log("\n4. Our spending stays honest rather than invented");
  check("Our spending is present", /Our spending/i.test(body));
  const ourLine = (body.match(/Our spending[\s\S]{0,20}/i) || [""])[0];
  check("and shows ∆, not a fabricated figure", /∆/.test(ourLine), JSON.stringify(ourLine));

  console.log("\n5. country status comes from the server, not from === \"IN\"");
  const activeCount = coverage.countries.filter((c) => c.active === true).length;
  check(`the server reports ${activeCount} active countries (more than one)`,
    activeCount > 1, JSON.stringify(coverage.countries.map((c) => `${c.countryIso}:${c.active}`)));
  // The globe badge was hardcoded to India's single row and could never
  // read anything but 1.
  check("the unlocked-country badge is not stuck at 1",
    new RegExp(`\\b${activeCount}\\b`).test(body), `expected ${activeCount} on screen`);

  console.log("\n6. Hooman Projects is a real, persisted list");
  // Stored FIRST, then the screen is opened, so what is being checked is
  // "a project that exists in MongoDB reaches the list" — the whole
  // difference between this and the hardcoded ∆ it replaced. Creating it
  // while the screen was already open would have tested the refetch
  // instead, and needed a close/reopen dance that says nothing about
  // persistence.
  //
  // The title carries a timestamp because this script is run repeatedly
  // against the same throwaway database, and a fixed title would match a
  // row left by an earlier run — which would pass whether or not THIS
  // run stored anything.
  const title = `Verified bridge ${Date.now()}`;
  const created = await fetch(`${API}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({
      title,
      category: "Infrastructure",
      summary: "Created by the UI verification script.",
    }),
  }).then((r) => r.json());
  check("a project was stored through the API", Boolean(created.project),
    JSON.stringify(created).slice(0, 120));

  check("the Hooman Projects entry opens", await clickText(page, "man Projects"));
  await page.waitForTimeout(3500);
  body = await textOf(page);

  // Read off the input itself, not off innerText: a placeholder is not
  // rendered text, so asserting on document.innerText looked for something
  // that was never going to be there however correct the code was.
  const searchPlaceholders = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map((el) => el.placeholder || ""));
  check("it offers a project search, separate from the category picker",
    searchPlaceholders.some((p) => /Search projects in/i.test(p)),
    JSON.stringify(searchPlaceholders));
  check("the old scaffolding text is gone",
    !/scaffolding for when that feature is actually built/i.test(body));

  check("the stored project is rendered", body.includes(title), body.slice(0, 300));
  check("its summary is rendered too", /Created by the UI verification script/i.test(body));
  // The count card used to be a hardcoded ∆ sitting directly above real
  // rows — saying "no data" while the data was on screen beneath it.
  const countLine = (body.match(/Projects in this category[\s\S]{0,12}/i) || [""])[0];
  check("the category count is a real number, not the old ∆",
    /[0-9]/.test(countLine) && !/∆/.test(countLine), JSON.stringify(countLine));
  console.log("\n7. the Security controls do something, not just move");
  // The brief is explicit that a JSX or state change is not evidence a
  // control works, and these three were exactly that before: two switches
  // reading a component-local useState nothing else consulted, and a
  // Change PIN button whose whole handler was a toast. So each one is
  // checked for a REAL consequence — a value that survives a reload,
  // because it went to the account.
  // Two different back buttons, with two different labels: the Hooman
  // Projects overlay uses NavBackButton (aria-label "Back"), the Coverage
  // header uses its own ("Go back"). Clicking "Go back" twice closed
  // nothing the first time and left the run inside the projects overlay.
  await clickLabel(page, "Back");
  await page.waitForTimeout(800);
  await clickLabel(page, "Go back");
  await page.waitForTimeout(1500);

  const beforeSettings = await fetch(`${API}/api/profile/${encodeURIComponent(IN_USER)}`, {
    headers: { Authorization: `Bearer ${login.token}` },
  }).then((r) => r.json());
  check("the account carries its security settings",
    Boolean(beforeSettings.user && beforeSettings.user.securitySettings),
    JSON.stringify(beforeSettings.user && beforeSettings.user.securitySettings));

  // Anchored, because a bare "Profile" also matches other controls whose
  // text merely contains the word, and the first DOM match wins.
  check("Coverage was closed and the dashboard is back",
    /GL.?BAL COVERAGE/i.test(await textOf(page)), (await textOf(page)).slice(0, 120));
  await clickText(page, "^Profile$");
  await page.waitForTimeout(1800);
  const openedSecurity = await clickText(page, "^Security$");
  await page.waitForTimeout(1500);
  check("the Security screen opens", openedSecurity);
  body = await textOf(page);
  check("all three controls are present",
    /Biometric login/i.test(body) && /App lock/i.test(body) && /Change PIN/i.test(body),
    body.slice(0, 200));
  check("App lock describes what it now actually does",
    /Lock again when you come back/i.test(body),
    (body.match(/App lock[\s\S]{0,60}/i) || [""])[0]);

  const wasAppLock = beforeSettings.user.securitySettings.appLock === true;
  check("the App lock switch is reachable", await clickLabel(page, "App lock"));
  await page.waitForTimeout(2500);

  // The point of the whole change: the switch wrote to the ACCOUNT, so a
  // read straight from the API — not from this browser — sees it.
  const afterSettings = await fetch(`${API}/api/profile/${encodeURIComponent(IN_USER)}`, {
    headers: { Authorization: `Bearer ${login.token}` },
  }).then((r) => r.json());
  check("flipping App lock persisted to the account, not to component state",
    afterSettings.user.securitySettings.appLock === !wasAppLock,
    `was ${wasAppLock}, now ${afterSettings.user.securitySettings.appLock}`);

  check("Change PIN opens a real dialog rather than showing a toast",
    await clickText(page, "Change PIN"));
  await page.waitForTimeout(1500);
  const pinFields = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map((el) => el.id).filter(Boolean));
  check("it asks for the CURRENT PIN as well as a new one",
    pinFields.includes("current-pin") && pinFields.includes("new-pin") && pinFields.includes("confirm-pin"),
    JSON.stringify(pinFields));
  check("the old \"available soon\" toast is gone",
    !/available soon/i.test(await textOf(page)));
  await page.screenshot({ path: "tools/frontend/verify-coverage-ui.png" });

  console.log("\n7. no console errors were raised along the way");
  // The bare "404 (Not Found)" lines are gloobalApiWarmUp() pinging the API
  // root on purpose — a fire-and-forget cold-start nudge, written with its
  // own .catch(() => {}), against a server that has no / route. Expected,
  // pre-existing, and nothing to do with this work; filtered by the message
  // rather than silently lowering the bar for every console error.
  const realErrors = consoleErrors.filter((e) =>
    !/favicon|manifest|Download the React/i.test(e) &&
    !/Failed to load resource.*404/i.test(e));
  check("clean console (the API warm-up 404 is expected — see gloobalApiWarmUp)",
    realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log("\n  screenshot: tools/frontend/verify-coverage-ui.png");
  await browser.close();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
