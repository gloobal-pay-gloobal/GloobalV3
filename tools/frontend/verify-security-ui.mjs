// Drives the real app in a real browser and checks that the Security
// screen's three controls DO something, rather than only look like they do.
//
//   node tools/frontend/verify-security-ui.mjs
//
// Why this exists alongside server/tests/security-controls.test.mjs: that
// suite proves the API stores the switches, verifies the current PIN and
// revokes the other sessions. None of that can prove the switch on the
// screen reaches the API, that the account's "Biometric login" preference
// changes what the login screen does, that App lock actually re-locks, or
// that a mistyped current PIN leaves the person signed in. Every one of
// those defects lives on the client and renders perfectly happily.
//
// Expects, already running:
//   * the API on 127.0.0.1:5213 against a THROWAWAY database
//       TEST_API_PORT=5213 TEST_API_DB=gloobal_security_ui_check \
//         node tools/frontend/start-test-api.mjs
//   * Vite on localhost:5173 with VITE_API_URL pointing at that API
//       cd gloobal-essentials-preview && \
//         VITE_API_URL=http://127.0.0.1:5213 npx vite --port 5173
//
// Two things are simulated, and only these two:
//
//   * A platform authenticator, through Chrome DevTools Protocol's virtual
//     WebAuthn device. Headless Chromium reports no fingerprint sensor, and
//     every biometric path in this app branches on exactly that. The virtual
//     device runs the real ceremony against the real server routes — the
//     challenge is still issued and verified by @simplewebauthn — so "the
//     biometric was actually invoked" is measured by asking the authenticator
//     how many credentials it now holds, not by trusting a screen.
//
//   * The passage of time, by offsetting Date.now inside the page. App lock
//     deliberately forgives a backgrounding shorter than its grace period,
//     and waiting that out in real seconds on every run buys nothing.
//
// Nothing else is stubbed. Every PIN is checked by the server, every setting
// is read back off the account document, and the app is driven by clicking
// what a person would click.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// The account document itself, read straight from the throwaway database the
// test API is running against.
//
// The first version of this suite asked GET /api/profile instead, and spent
// the lookup rate limit the APP is also spending. Six sign-ins into a run the
// reads meant to prove "the setting persisted" started coming back 429, and
// the suite reported a rate limit as a persistence failure. The document is
// the better oracle regardless: it is what "stored on the account" means, and
// it cannot be satisfied by a route that merely echoes the request.
//
// Same throwaway-database rule as every other suite here, and the same
// refusal: the name is REPLACED before mongoose connects, so nothing below can
// reach a real collection even if MONGO_URI points at the live cluster.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "server");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set - this needs server/.env.");
  process.exit(1);
}

const TEST_DB = process.env.VERIFY_API_DB || "gloobal_security_ui_check";
const [beforeQuery, queryString] = process.env.MONGO_URI.split("?");
const TEST_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${queryString ? "?" + queryString : ""}`;

const mongoose = require("mongoose");
const User = require(join(BACKEND, "models/User"));

const APP = process.env.VERIFY_APP_URL || "http://localhost:5173";
const API = process.env.VERIFY_API_URL || "http://127.0.0.1:5213";

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];

// A fresh account per run. The throwaway database is only emptied when the
// test API starts, and this suite changes a PIN and enrols a passkey — both
// of which a second run against the same account would inherit, so the second
// run would be testing a state the first one left rather than the one it set
// up. Cheaper and clearer than deleting rows afterwards.
const RUN = Date.now() % 100000000;
const ALICE = Array.from({ length: 12 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]).join("");
const OLD_PIN = "246813";
const NEW_PIN = "975310";
const MOBILE = `+9190${String(RUN).padStart(8, "0").slice(-8)}`;

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const call = (method, path, body, token) =>
  fetch(`${API}${path}`, {
    method,
    headers: Object.assign(
      body === undefined ? {} : { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const post = (p, b, t) => call("POST", p, b, t);
const get = (p, t) => call("GET", p, undefined, t);

// The same GET, but waiting out the lookup rate limit rather than reporting
// it as a result.
//
// This suite signs in through the real screen six times, and every sign-in
// costs the app a handful of account reads - profile, balance, assets, and
// the rest. Those come from the same address as this script's own reads and
// share one 90-per-five-minutes bucket, so a long run exhausts it partway
// through and every later read answers 429. Read as an answer, that turns
// "the other device's session was revoked" (which expects 401) into a
// failure about something the run never got to test.
//
// Raising the limit for the test would be testing a server nobody deploys,
// so the suite waits instead. Five minutes is the window; the poll gives it
// six before giving up and letting the 429 be reported honestly.
const getPatiently = async (path, token) => {
  const deadline = Date.now() + 6 * 60 * 1000;
  for (;;) {
    const answer = await get(path, token);
    if (answer.status !== 429 || Date.now() > deadline) return answer;
    console.log("  (waiting out the lookup rate limit)");
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
};

const textOf = (page) => page.evaluate(() => document.body.innerText);

const clickLabel = (page, label) => page.evaluate((wanted) => {
  const hit = [...document.querySelectorAll("button,[role=button],[role=switch]")]
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

// A switch is read by the state it advertises to assistive technology, which
// is also the state the component derives from the account.
const switchState = (page, label) => page.evaluate((wanted) => {
  const el = [...document.querySelectorAll("[role=switch]")]
    .find((node) => node.getAttribute("aria-label") === wanted);
  return el ? el.getAttribute("aria-checked") : null;
}, label);

// What the ACCOUNT holds. The only authority here: the screen is what is
// being tested, so it cannot also be the evidence.
const storedSettings = async () => {
  const account = await User.findOne({ symbolId: ALICE }).lean();
  return account?.securitySettings || null;
};

const tokenInStorage = (page) => page.evaluate(() => {
  try {
    return Boolean(JSON.parse(window.localStorage.getItem("gloobal.session.v1") || "{}").token);
  } catch (e) {
    return false;
  }
});

const sessionUser = (page) => page.evaluate(() => {
  try {
    return JSON.parse(window.localStorage.getItem("gloobal.session.v1") || "{}").user || null;
  } catch (e) {
    return null;
  }
});

// Backgrounding the app for longer than the lock's grace period, then coming
// back. visibilitychange is what the app listens to; the Date.now offset is
// what makes the gap long enough to count.
const leaveAndReturn = async (page, seconds) => {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  await page.evaluate((gap) => {
    window.__gloobalClockOffset = gap * 1000;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, seconds);
  await page.waitForTimeout(1200);
};

// Which screen is showing. Asked by structure rather than by copy: the
// Profile tab exists only on the dashboard, and the login screen is the only
// place with a "Log in" action. Reading body text instead would depend on
// wording that changes for reasons that have nothing to do with security.
const hasLabel = (page, label) => page.evaluate((wanted) =>
  [...document.querySelectorAll("[aria-label]")].some((el) => el.getAttribute("aria-label") === wanted), label);

const onDashboard = (page) =>
  page.evaluate(() => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Profile"));

const onPinScreen = async (page) => !(await onDashboard(page)) && (await hasLabel(page, "Log in"));

const onBiometricScreen = (page) => hasLabel(page, "Verify with fingerprint and Face ID");

// A short, stable description of where the app is, for a failure message.
const whereAmI = async (page) =>
  (await onDashboard(page)) ? "dashboard"
    : (await onBiometricScreen(page)) ? "biometric screen"
      : (await hasLabel(page, "Log in")) ? "login/PIN screen"
        : "unknown";

async function signInThroughTheScreen(page, pin) {
  await clickLabel(page, "Log in");
  await page.waitForTimeout(1200);
  for (const digit of pin) {
    await clickLabel(page, `Digit ${digit}`);
    await page.waitForTimeout(110);
  }
  await clickLabel(page, "Log in");
  await page.waitForTimeout(4000);
}

async function openSecurityScreen(page) {
  // Already there — and worth checking, because the Security screen is a
  // full-screen detail view that covers the Profile tab it was opened from,
  // so navigating to it again would mean clicking a button underneath it.
  if ((await switchState(page, "Biometric login")) !== null) return;
  await page.locator("button", { hasText: /^Profile$/ }).first().click({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await clickText(page, "^Security$");
  await page.waitForTimeout(1200);
}

async function run() {
  console.log(`app: ${APP}\napi: ${API}`);

  await mongoose.connect(TEST_URI);
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" - expected ${TEST_DB}`);
  }
  console.log(`db:  ${mongoose.connection.name}\n`);

  console.log("0. seed one account through the real routes");
  await post("/api/otp/send", { mobileNumber: MOBILE, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber: MOBILE, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: "Security Alice", mobileNumber: MOBILE, symbolId: ALICE });
  const seedToken = registered.body?.token;
  await post("/api/pin/set", { symbolId: ALICE, pin: OLD_PIN }, seedToken);
  check("the account registered and has a PIN", Boolean(seedToken), `status=${registered.status}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();
  // Uncaught exceptions are the signal worth failing on. Console "Failed to
  // load resource" lines are not: the app warms Render's cold start by
  // fetching a path it knows 404s, and the passkey routes answer 404 for an
  // account with no passkey enrolled, which is an answer rather than a fault.
  // Those are collected by URL instead, so an unexpected one is still named.
  const pageErrors = [];
  const consoleErrors = [];
  const notFound = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource/i.test(m.text())) return;
    consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() !== 404) return;
    const url = r.url();
    if (url === `${API}/` || url.startsWith(`${API}/api/passkey/`)) return;
    notFound.push(url);
  });

  // The clock the app reads. Offset starts at zero and is only moved by
  // leaveAndReturn, so nothing else in the run sees an unusual time.
  await page.addInitScript(() => {
    const realNow = Date.now;
    window.__gloobalClockOffset = 0;
    Date.now = () => realNow() + (window.__gloobalClockOffset || 0);
  });

  // A platform authenticator this device does not really have. Without it,
  // headless Chromium answers "no fingerprint sensor" and every biometric
  // branch takes its no-sensor path, which is the one case that proves
  // nothing about the setting.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const credentialCount = async () => {
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    return credentials.length;
  };

  console.log("\n1. sign in through the real login screen");
  const login = await post("/api/login", { symbolId: ALICE, pin: OLD_PIN });
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.evaluate(([token, user]) => {
    window.localStorage.setItem("gloobal.session.v1", JSON.stringify({
      user, phoneNumber: user.mobileNumber || "", token, savedAt: Date.now(),
    }));
    try { window.localStorage.setItem("gloobal.permissions.seen.v1", "1"); } catch (e) {}
  }, [login.body.token, login.body.user]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await signInThroughTheScreen(page, OLD_PIN);

  // A sensor-equipped device with biometric login ON: the app asks, and the
  // answer is a real ceremony against the server's own passkey routes.
  check("a device with a sensor is asked to verify at login",
    await onBiometricScreen(page), await whereAmI(page));
  check("nothing is enrolled on this authenticator yet", (await credentialCount()) === 0);
  await clickLabel(page, "Verify with fingerprint and Face ID");
  await page.waitForTimeout(4000);
  check("the biometric was really invoked — a passkey now exists on the device",
    (await credentialCount()) === 1, `credentials=${await credentialCount()}`);
  check("the dashboard is reached", !(await onPinScreen(page)), await whereAmI(page));

  // ── 2 ────────────────────────────────────────────────────────────────────
  console.log("\n2. Biometric login: the switch persists and changes the login");
  await openSecurityScreen(page);
  check("the Security screen is open", (await switchState(page, "Biometric login")) !== null);
  check("the switch reads the account's default (on)",
    (await switchState(page, "Biometric login")) === "true");

  await clickLabel(page, "Biometric login");
  await page.waitForTimeout(2500);
  check("the switch moved to off", (await switchState(page, "Biometric login")) === "false");
  let account = await storedSettings();
  check("and the ACCOUNT now says off (this is what persists means)",
    account?.biometricLogin === false, JSON.stringify(account));
  check("the stored session was updated too, so a reload cannot disagree",
    (await sessionUser(page))?.securitySettings?.biometricLogin === false,
    JSON.stringify((await sessionUser(page))?.securitySettings));

  console.log("\n   …and it survives a full reload and sign-in");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const beforeLoginCreds = await credentialCount();
  await signInThroughTheScreen(page, OLD_PIN);
  check("with biometric login off, the login does NOT ask for a biometric",
    !(await onBiometricScreen(page)), await whereAmI(page));
  check("no extra ceremony ran", (await credentialCount()) === beforeLoginCreds);
  check("the PIN still got the person in", !(await onPinScreen(page)), await whereAmI(page));

  await openSecurityScreen(page);
  check("after the reload the switch still reads off",
    (await switchState(page, "Biometric login")) === "false");

  console.log("\n   …and switching it back on persists too");
  await clickLabel(page, "Biometric login");
  await page.waitForTimeout(2500);
  check("the switch moved back to on", (await switchState(page, "Biometric login")) === "true");
  account = await storedSettings();
  check("and so did the account", account?.biometricLogin === true, JSON.stringify(account));

  // ── 3 ────────────────────────────────────────────────────────────────────
  console.log("\n3. App lock: the switch persists, and the lock is real");
  check("it starts off, as the account says", (await switchState(page, "App lock")) === "false");

  console.log("\n   …with it OFF, leaving and coming back must NOT lock");
  await leaveAndReturn(page, 120);
  check("still on the dashboard after two minutes away", !(await onPinScreen(page)),
    await whereAmI(page));

  await clickLabel(page, "App lock");
  await page.waitForTimeout(2500);
  check("the switch moved to on", (await switchState(page, "App lock")) === "true");
  account = await storedSettings();
  check("and the account says so", account?.appLock === true, JSON.stringify(account));

  console.log("\n   …a brief backgrounding stays inside the grace period");
  await leaveAndReturn(page, 5);
  check("five seconds away does not lock", !(await onPinScreen(page)), await whereAmI(page));

  console.log("\n   …a real absence locks, and costs the PIN to get back in");
  await leaveAndReturn(page, 120);
  check("the app re-locked to the PIN screen", await onPinScreen(page), await whereAmI(page));
  check("and it is a real lock — the session token was NOT thrown away",
    await tokenInStorage(page));

  await signInThroughTheScreen(page, OLD_PIN);
  if (await onBiometricScreen(page)) {
    await clickLabel(page, "Verify with fingerprint and Face ID");
    await page.waitForTimeout(4000);
  }
  check("the PIN unlocks it again", !(await onPinScreen(page)), await whereAmI(page));

  await openSecurityScreen(page);
  check("App lock survived the relock and sign-in", (await switchState(page, "App lock")) === "true");

  console.log("\n   …switching it off stops the locking");
  await clickLabel(page, "App lock");
  await page.waitForTimeout(2500);
  check("the switch moved to off", (await switchState(page, "App lock")) === "false");
  account = await storedSettings();
  check("and the account agrees", account?.appLock === false, JSON.stringify(account));
  await leaveAndReturn(page, 300);
  check("five minutes away no longer locks anything", !(await onPinScreen(page)),
    await whereAmI(page));

  // ── 4 ────────────────────────────────────────────────────────────────────
  console.log("\n4. Change PIN");
  await openSecurityScreen(page);
  await clickText(page, "^Change PIN$");
  await page.waitForTimeout(900);
  check("the Change PIN screen is open", (await page.locator("#current-pin").count()) === 1);

  // Submit by finding the button INSIDE the Change PIN overlay. Matching on
  // the words alone would find the Security screen's own "Change PIN" row,
  // which is still in the DOM underneath and comes first in document order —
  // clicking that re-opens the dialog instead of submitting it, and every
  // check after it then fails for a reason that has nothing to do with the
  // app.
  const typePins = async (current, next, confirm) => {
    await page.fill("#current-pin", current);
    await page.fill("#new-pin", next);
    await page.fill("#confirm-pin", confirm);
    const submitted = await page.evaluate(() => {
      const field = document.querySelector("#current-pin");
      if (!field) return false;
      let root = field;
      while (root && root.parentElement && !/Changing|Change PIN/.test(
        [...root.querySelectorAll("button")].map((b) => b.textContent || "").join("|")
      )) root = root.parentElement;
      const hit = [...(root ? root.querySelectorAll("button") : [])]
        .find((b) => /^(Change PIN|Changing)/.test((b.textContent || "").trim()));
      if (!hit || hit.disabled) return false;
      hit.click();
      return true;
    });
    await page.waitForTimeout(3500);
    return submitted;
  };
  const alertText = () => page.evaluate(() => {
    const el = document.querySelector("[role=alert]");
    return el ? el.textContent || "" : "";
  });

  console.log("\n   …a wrong current PIN is refused, and does not sign anybody out");
  const submittedWrong = await typePins("000000", NEW_PIN, NEW_PIN);
  check("the wrong-PIN attempt was actually submitted", submittedWrong);
  const wrongMessage = await alertText();
  check("the screen says the PIN was wrong", /invalid pin|attempts? left/i.test(wrongMessage), wrongMessage);
  check("it reports the remaining attempts rather than a generic error",
    /attempts? left/i.test(wrongMessage), wrongMessage);
  check("the person is STILL signed in — the session token survived a typo",
    await tokenInStorage(page));
  check("and still on the Change PIN screen, not bounced to Login",
    (await page.locator("#current-pin").count()) === 1, await whereAmI(page));
  check("the server never changed the PIN",
    (await post("/api/pin/verify", { symbolId: ALICE, pin: OLD_PIN })).body?.verified === true);

  console.log("\n   …a new PIN that is too short, or does not match, is refused");
  await typePins(OLD_PIN, "12", "12");
  check("a two-digit new PIN is refused", /4 to 6 digits/i.test(await alertText()), await alertText());
  await typePins(OLD_PIN, NEW_PIN, "111111");
  check("a mismatched confirmation is refused", /don't match/i.test(await alertText()), await alertText());
  await typePins(OLD_PIN, OLD_PIN, OLD_PIN);
  check("reusing the current PIN is refused", /different/i.test(await alertText()), await alertText());

  console.log("\n   …the real change, with a second device signed in");
  const secondDevice = await post("/api/login", { symbolId: ALICE, pin: OLD_PIN });
  const secondToken = secondDevice.body?.token;
  const secondUsable = await getPatiently(`/api/profile/${encodeURIComponent(ALICE)}`, secondToken);
  check("a second device is signed in", secondUsable.status === 200,
    `login=${secondDevice.status} profile=${secondUsable.status}`);

  await typePins(OLD_PIN, NEW_PIN, NEW_PIN);
  check("the dialog closed, so the change was accepted",
    (await page.locator("#current-pin").count()) === 0, (await alertText()) || await whereAmI(page));
  check("the old PIN no longer verifies",
    (await post("/api/pin/verify", { symbolId: ALICE, pin: OLD_PIN })).body?.verified !== true);
  check("the new PIN verifies",
    (await post("/api/pin/verify", { symbolId: ALICE, pin: NEW_PIN })).body?.verified === true);
  const secondAfter = await getPatiently(`/api/profile/${encodeURIComponent(ALICE)}`, secondToken);
  check("the OTHER device's session was revoked", secondAfter.status === 401,
    `status=${secondAfter.status}`);
  check("THIS device kept working — it holds the replacement token",
    await tokenInStorage(page));
  check("and it is not the token it had before the change",
    (await page.evaluate(() => JSON.parse(window.localStorage.getItem("gloobal.session.v1")).token)) !== login.body.token);

  console.log("\n   …and the new PIN is the one that works after a reload");
  // The two sign-ins below are the app's, not this script's, and they need the
  // same budget. Waiting here means a 429 cannot masquerade as "the new PIN
  // does not work".
  await getPatiently(`/api/profile/${encodeURIComponent(ALICE)}`, secondToken);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await signInThroughTheScreen(page, OLD_PIN);
  check("the old PIN is rejected at the login screen", await onPinScreen(page),
    await whereAmI(page));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await signInThroughTheScreen(page, NEW_PIN);
  if (await onBiometricScreen(page)) {
    await clickLabel(page, "Verify with fingerprint and Face ID");
    await page.waitForTimeout(4000);
  }
  check("the new PIN signs in", !(await onPinScreen(page)), await whereAmI(page));

  await openSecurityScreen(page);
  check("both switches survived the PIN change and the re-login",
    (await switchState(page, "Biometric login")) === "true" &&
    (await switchState(page, "App lock")) === "false",
    `biometric=${await switchState(page, "Biometric login")} appLock=${await switchState(page, "App lock")}`);

  const realErrors = consoleErrors.filter((t) => !/favicon|manifest|Download the React DevTools/i.test(t));
  check("no uncaught exceptions along the way", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  check("no console errors along the way", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  check("nothing the app asked for was missing",
    notFound.length === 0, [...new Set(notFound)].slice(0, 3).join(" | "));

  await browser.close();
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
