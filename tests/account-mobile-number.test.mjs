// tests/account-mobile-number.test.mjs
//
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome \
//     node --test tests/account-mobile-number.test.mjs
//
// The number Personal Details shows is the ACCOUNT's, not the one in the
// phone dial pad.
//
// ── The symptom ────────────────────────────────────────────────────────
//
// Reported as "mobile number is not saving properly on personal details".
// Nothing on that screen is editable — it is a read-only list — so nothing
// was failing to save in the sense of a form. What was failing is that the
// screen read
//
//     Mobile      +91
//
// a bare dial code, on an account registered against +91 90000 00001.
//
// ── Two faults, one behind the other ───────────────────────────────────
//
//   1. App.jsx handed Personal Details `fullMobileNumber`, which is
//      assembled out of FORM STATE: the country in the picker plus the
//      digits in the phone dial pad. That is right for registration, where
//      the OTP goes to the number being typed. It is wrong for showing the
//      account's own number, because signing in with a Gloobal ID and a PIN
//      never touches the pad — so the digits half is empty and the assembly
//      produces the dial code alone.
//
//   2. gloobalSessionSave wrote `phoneNumber || ""`, and the caller passes
//      that same form state. So every ID login ALSO overwrote the number
//      the device had remembered from registration, and it never came back:
//      the next save had nothing to write either, and a national number
//      cannot be recovered from a dial code.
//
// The second is the same defect this file's own token and biometric fields
// have each already been fixed for — a save that knows the user but not a
// field must not blank it.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

describe("a session save never blanks the number it already knew", () => {
  const { gloobalSessionSave, gloobalSessionLoad } = loadDomain([
    "gloobalSessionSave",
    "gloobalSessionLoad",
  ]);

  // sessionStore.js reaches for window.localStorage inside its function
  // bodies and nowhere at load time, so a fake is enough to drive it.
  let store;
  const previousWindow = globalThis.window;

  before(() => {
    store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
      dispatchEvent: () => true,
      CustomEvent: function CustomEvent() {},
    };
  });

  after(() => {
    globalThis.window = previousWindow;
  });

  const ASHA = { symbolId: "AAAAAAAAAAAA", mobileNumber: "919000000001", fullName: "Asha Raman" };
  const saved = () => JSON.parse(store.get("gloobal.session.v1") || "{}");

  test("registration stores it", () => {
    store.clear();
    gloobalSessionSave(ASHA, "9000000001");
    assert.equal(saved().phoneNumber, "9000000001");
  });

  test("a Gloobal ID login does not wipe it", () => {
    // THE FAULT. The login handler calls saveSession(result.user,
    // phoneNumber), and on this path phoneNumber is "" because the phone
    // pad was never opened. It used to write that straight through.
    gloobalSessionSave(ASHA, "");
    assert.equal(saved().phoneNumber, "9000000001", "an ID login blanked the stored number");
  });

  test("and it survives the round trip", () => {
    assert.equal(gloobalSessionLoad().phoneNumber, "9000000001");
  });

  test("renaming the Gloobal ID keeps it", () => {
    // An ID rename changes symbolId and nothing else. The same-account test
    // matches on mobileNumber too, precisely so a rename is not mistaken
    // for a different person — a distinction this function already had to
    // learn for the biometric flag.
    gloobalSessionSave({ ...ASHA, symbolId: "BBBBBBBBBBBB" }, "");
    assert.equal(saved().phoneNumber, "9000000001", "an ID rename lost the number");
  });

  test("a DIFFERENT account inherits nothing", () => {
    // The one case where carrying it over would be a real leak: somebody
    // else signing in on this phone must not be shown the last person's
    // number.
    gloobalSessionSave({ symbolId: "CCCCCCCCCCCC", mobileNumber: "447000000003", fullName: "Tom Whitfield" }, "");
    assert.equal(saved().phoneNumber, "", "a second account inherited the first one's number");
  });
});

describe("Personal Details reads the account, not the form", () => {
  const app = readSource("frontend/App.jsx");

  test("the screen is handed the account's number", () => {
    assert.match(app, /mobileNumber=\{accountMobileNumber\}/);
    // And NOT the assembly of country-picker plus dial-pad state, which is
    // what produced a bare "+91".
    assert.ok(
      !/mobileNumber=\{fullMobileNumber\}/.test(app),
      "Personal Details is reading form state again"
    );
  });

  test("a value with no digits in it is not shown as a phone number", () => {
    // publicUserPayload falls back to `user.fullName` when mobileNumber is
    // empty. On an account made before the name step existed those are the
    // same string and the fallback is harmless — on any other it would
    // print somebody's NAME under a label reading Mobile.
    assert.match(app, /\/\\d\/\.test\(storedMobileNumber\)/);
  });

  test("the row is withheld rather than showing a bare dial code", () => {
    // Nothing is better than a wrong thing: the Dashboard only draws the
    // Mobile row when it has been given something, so an account with no
    // recorded number shows no row instead of showing its country's prefix
    // as though that were a phone number.
    assert.match(
      readSource("frontend/screens/Dashboard/Dashboard.jsx"),
      /\.\.\.\(mobileNumber \? \[\["Mobile", mobileNumber\]\] : \[\]\)/
    );
  });
});

describe("the screen, after signing in the way the founder signs in", () => {
  let page;
  let errors;

  before(async () => {
    await buildOnce();
    const opened = await openPage({
      account: ACCOUNTS.india,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 },
    });
    page = opened.page;
    errors = opened.errors;

    // THE STATE UNDER TEST, forced: the device knows the account and holds
    // no phone digits. That is what a Gloobal ID + PIN sign-in leaves
    // behind, and it is what the harness's own seeding does not produce —
    // it pre-fills phoneNumber, so without this the bug is invisible here.
    //
    // Registered as an init script rather than written once, because the
    // harness seeds through one too and the last script to run on a
    // navigation is the one that wins.
    await opened.context.addInitScript(() => {
      try {
        const key = "gloobal.session.v1";
        const session = JSON.parse(window.localStorage.getItem(key) || "{}");
        if (session && session.user) {
          session.phoneNumber = "";
          window.localStorage.setItem(key, JSON.stringify(session));
        }
      } catch (e) { /* storage disabled; the test below will say so */ }
    });
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 15000 });
    await login(page, ACCOUNTS.india);
    await page.waitForTimeout(1500);
  });

  after(async () => {
    await teardown();
  });

  test("the state under test really is the state under test", async () => {
    // Asserted rather than assumed. If the harness ever starts restoring
    // phoneNumber through some other path, this test would otherwise pass
    // for the wrong reason and stop guarding anything.
    const stored = await page.evaluate(
      () => JSON.parse(window.localStorage.getItem("gloobal.session.v1") || "{}").phoneNumber
    );
    assert.equal(stored, "", "the session still holds a phone number, so this proves nothing");
  });

  test("Personal Details shows the real number, not a dial code", async () => {
    await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
    await page.waitForTimeout(1000);
    const row = page.getByRole("button", { name: /^Personal Details$/i }).first();
    await row.waitFor({ state: "visible", timeout: 20000 });
    await row.click({ force: true });
    await page.waitForTimeout(1500);

    const text = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " | "));
    const shown = (text.match(/Mobile \| ([^|]+)\|/) || [])[1];
    assert.ok(shown, `there is no Mobile row at all:\n${text.slice(-400)}`);
    // Measured before the fix: "+91".
    assert.equal(shown.trim(), ACCOUNTS.india.mobileNumber);
  });

  test("nothing threw", async () => {
    assert.deepEqual(errors, []);
  });
});
