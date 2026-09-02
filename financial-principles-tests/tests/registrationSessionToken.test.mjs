// financial-principles-tests/tests/registrationSessionToken.test.mjs
//
// The bearer token must survive the first gloobalSessionSave of a brand-new
// account.
//
// ── The bug this file exists for ────────────────────────────────────────────
//
// A registration runs in this order:
//
//   1. POST /api/register-symbol answers with a token
//   2. GloobalApi.register stores it with gloobalAuthTokenSave, which writes
//      a blob of { savedAt, token } and NO user — no session has been saved
//      yet, and it has nothing to save one from
//   3. POST /api/pin/set, using that token
//   4. the biometric step calls GloobalApi.saveSession(user, ...) — the FIRST
//      gloobalSessionSave of this account's life
//
// At step 4 the stored blob had a token but named nobody, so `previousUser`
// was undefined and `sameAccount` was false, and the token line —
//
//     token: (sameAccount && previous.token) || null
//
// — replaced a perfectly good credential with null. The dashboard then sent
// every request with no Authorization header: profile, balance, assets,
// PayLater and transactions all 401'd, which the balance card renders as
// "Unable to load balance" on an account created seconds earlier. The person
// had to sign in again to be given a token they already had.
//
// A first-ever sign-in on a device with empty storage hit the same line for
// the same reason.
//
// ── How this is tested ─────────────────────────────────────────────────────
//
// backend/services/api/sessionStore.js is part of the concatenated bundle
// (see CLAUDE.md) and is not in app_bundle_testonly.mjs, so it is loaded here
// the way build_app.mjs loads it: the real file, evaluated in one shared
// scope, against a fake `window` holding a real in-memory localStorage. No
// fork of the logic, and nothing else in the test bundle changes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, "backend", "services", "api", "sessionStore.js");

// A fresh module scope with its own empty storage, so no test can see
// another's leftovers.
function loadSessionStore() {
  const store = new Map();
  const events = [];
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  // The module constructs events with a bare `new CustomEvent(...)`, so the
  // constructor has to be a global here and not only a property of `window`
  // — otherwise it throws, gloobalNotify* swallows it, and every
  // event assertion below would pass vacuously.
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }
  const win = {
    localStorage,
    dispatchEvent: (e) => { events.push(e); return true; },
    CustomEvent,
  };
  const sandbox = { window: win, CustomEvent, console, Date, JSON, Boolean, Number, String, Object };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync(SOURCE, "utf8"), ctx);

  const call = (expr) => vm.runInContext(expr, ctx);
  return {
    events,
    raw: () => JSON.parse(localStorage.getItem("gloobal.session.v1") || "null"),
    saveAuthToken: (token) => { ctx.__t = token; return call("gloobalAuthTokenSave(__t)"); },
    authToken: () => call("gloobalAuthToken()"),
    clearAuthToken: () => call("gloobalAuthTokenClear()"),
    saveSession: (user, phone, enrolled) => {
      ctx.__u = user; ctx.__p = phone; ctx.__b = enrolled;
      return call("gloobalSessionSave(__u, __p, __b)");
    },
    loadSession: () => call("gloobalSessionLoad()"),
    clearSession: () => call("gloobalSessionClear()"),
  };
}

const ALICE = { symbolId: "−+×=○□●■−+×=", fullName: "Alice", mobileNumber: "+919000000001" };
const BOB = { symbolId: "■●□○=×+−■●□○", fullName: "Bob", mobileNumber: "+14155550002" };

// ── the reported failure, stated as its own test ───────────────────────────

test("a fresh registration keeps the token it was just issued", () => {
  const s = loadSessionStore();

  // Step 2: the token lands before any session exists. This is the exact
  // shape the bug depended on — a blob with a credential and no identity.
  s.saveAuthToken("token-from-register-symbol");
  assert.equal(s.raw().token, "token-from-register-symbol");
  assert.equal(s.raw().user, undefined, "precondition: no user is stored yet");

  // Step 4: the first session save of this account's life.
  s.saveSession(ALICE, "+919000000001", false);

  assert.equal(
    s.authToken(),
    "token-from-register-symbol",
    "the registration token must survive the first session save"
  );
});

test("a fresh registration ends up with an authenticated session, not an anonymous one", () => {
  const s = loadSessionStore();
  s.saveAuthToken("token-from-register-symbol");
  s.saveSession(ALICE, "+919000000001", false);

  const session = s.loadSession();
  assert.ok(session, "a session is restorable");
  assert.equal(session.user.symbolId, ALICE.symbolId);
  assert.equal(session.token, "token-from-register-symbol", "the restored session carries the credential");
});

// The three requests the dashboard makes on mount. httpClient attaches the
// Authorization header only when gloobalAuthToken() returns something, so
// "would this request be authenticated" is exactly "is there a token".
test("the dashboard's first reads after registration would carry a bearer token", () => {
  const s = loadSessionStore();
  s.saveAuthToken("token-from-register-symbol");
  s.saveSession(ALICE, "+919000000001", false);

  for (const request of ["GET /api/profile/:symbolId", "GET /api/transactions/:symbolId", "GET /api/assets/:symbolId"]) {
    assert.equal(
      Boolean(s.authToken()),
      true,
      `${request} would have been sent without an Authorization header`
    );
  }
});

test("no second sign-in is needed: the token is present before the dashboard is reached", () => {
  const s = loadSessionStore();
  // The whole registration, in order, with nothing in between.
  s.saveAuthToken("token-from-register-symbol");   // register
  s.saveSession(ALICE, "+919000000001", false);    // biometric step -> dashboard
  assert.equal(s.authToken(), "token-from-register-symbol");
  // And it is still there on the next page load, which is what makes the
  // balance card work rather than showing its retry.
  assert.equal(s.loadSession().token, "token-from-register-symbol");
});

// ── the same line, on the sign-in path ─────────────────────────────────────

test("a first-ever sign-in on a device with empty storage keeps its token", () => {
  const s = loadSessionStore();
  // GloobalApi.login stores the token, then App.jsx saves the session.
  s.saveAuthToken("token-from-login");
  s.saveSession(ALICE, "+919000000001");
  assert.equal(s.authToken(), "token-from-login");
});

// ── behaviour that must NOT change ─────────────────────────────────────────

test("a returning account's token is still carried across a save that does not know it", () => {
  const s = loadSessionStore();
  s.saveAuthToken("token-a");
  s.saveSession(ALICE, "+919000000001", false);
  // The post-passkey-check re-save, and the profile-update save: same user,
  // no new token minted.
  s.saveSession(ALICE, "+919000000001", true);
  s.saveSession(ALICE, "+919000000001");
  assert.equal(s.authToken(), "token-a");
  assert.equal(s.loadSession().biometricEnrolled, true, "the enrolment flag survives a save that omits it");
});

test("an ID rename keeps the session and its token", () => {
  const s = loadSessionStore();
  s.saveAuthToken("token-a");
  s.saveSession(ALICE, "+919000000001", true);
  const renamed = Object.assign({}, ALICE, { symbolId: "○○○○○○○○○○○○" });
  s.saveSession(renamed, "+919000000001");
  assert.equal(s.authToken(), "token-a", "a rename is the same account, matched on mobileNumber");
  assert.equal(s.loadSession().user.symbolId, "○○○○○○○○○○○○");
});

test("signing out clears the token", () => {
  const s = loadSessionStore();
  s.saveAuthToken("token-a");
  s.saveSession(ALICE, "+919000000001", true);
  assert.equal(s.authToken(), "token-a");

  s.clearSession();
  assert.equal(s.authToken(), null, "sign-out leaves no credential behind");
  assert.equal(s.loadSession(), null, "and no session");
  assert.equal(s.raw(), null, "the whole blob is gone, not just half of it");
});

test("clearAuthToken drops the credential and keeps the identity", () => {
  const s = loadSessionStore();
  s.saveAuthToken("token-a");
  s.saveSession(ALICE, "+919000000001", true);
  s.clearAuthToken();
  assert.equal(s.authToken(), null);
  assert.equal(s.raw().user.symbolId, ALICE.symbolId, "the 401 path clears the token, not the identity");
});

// ── the leak this guard exists to prevent ──────────────────────────────────

test("a different account signing in on this device inherits nothing", () => {
  const s = loadSessionStore();
  s.saveAuthToken("alice-token");
  s.saveSession(ALICE, "+919000000001", true);

  // Bob's session saved with no token of his own — the case the guard was
  // written for. He must not get Alice's.
  s.saveSession(BOB, "+14155550002", false);
  assert.equal(s.authToken(), null, "Bob must not inherit Alice's credential");
  assert.equal(s.loadSession().user.symbolId, BOB.symbolId);
  assert.equal(s.loadSession().biometricEnrolled, false, "nor Alice's enrolment flag");
});

test("the normal sign-out then sign-in of a second account is clean", () => {
  const s = loadSessionStore();
  s.saveAuthToken("alice-token");
  s.saveSession(ALICE, "+919000000001", true);

  s.clearSession();                     // Alice signs out — whole blob removed
  s.saveAuthToken("bob-token");         // Bob logs in
  s.saveSession(BOB, "+14155550002");

  assert.equal(s.authToken(), "bob-token", "Bob keeps his own token");
  assert.equal(s.loadSession().user.symbolId, BOB.symbolId);
  assert.equal(s.loadSession().biometricEnrolled, false, "Bob starts with no enrolment claim");
});

test("an account switch still announces itself, and a first registration still does not", () => {
  const fresh = loadSessionStore();
  fresh.saveAuthToken("token-a");
  fresh.saveSession(ALICE, "+919000000001", false);
  assert.equal(
    fresh.events.filter((e) => e.type === "gloobal:accountSwitched").length,
    0,
    "a brand-new account in a tab that had nobody must not force-remount the app mid-registration"
  );

  const switched = loadSessionStore();
  switched.saveAuthToken("alice-token");
  switched.saveSession(ALICE, "+919000000001", false);
  switched.saveSession(BOB, "+14155550002", false);
  assert.equal(
    switched.events.filter((e) => e.type === "gloobal:accountSwitched").length,
    1,
    "a genuine switch still resets the local ledger"
  );
});

test("no stored session at all still saves cleanly", () => {
  const s = loadSessionStore();
  s.saveSession(ALICE, "+919000000001", false);
  assert.equal(s.authToken(), null, "nothing to carry, and nothing invented");
  assert.equal(s.loadSession().user.symbolId, ALICE.symbolId);
});
