// financial-principles-tests/tests/sessionPersistOnReopen.test.mjs
//
// Closing Gloobal and opening it again must not sign the person out.
//
// ── The bug this file exists for ────────────────────────────────────────────
//
// The session (identity + bearer token) was always persisted in localStorage
// and nothing deleted it on close — no pagehide/beforeunload/unload handler
// touches it. But App.jsx's mount-time restore effect sent EVERY restored
// session to the PIN stage ("secureId"), even with a live token in hand. To
// the person that is indistinguishable from being logged out, and it made a
// tap on a closed-app notification open onto Login.
//
// The fix resumes into the dashboard when the stored token is still inside
// its lifetime (gloobalAuthTokenLooksLive) and App lock is off. The server
// remains the authority: a revoked or expired token 401s on the first
// dashboard read and GLOOBAL_SESSION_EXPIRED_EVENT routes to Login.
//
// ── How this is tested ─────────────────────────────────────────────────────
//
// Same approach as registrationSessionToken.test.mjs: the real
// sessionStore.js evaluated in a vm context. A "reopen" is a brand-new
// context sharing only the storage Map — exactly what survives a closed tab.
// The App.jsx restore decision is checked against its source, since App.jsx
// cannot be evaluated outside the concatenated bundle.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, "backend", "services", "api", "sessionStore.js");
const APP = join(ROOT, "frontend", "App.jsx");

// One page load. Pass the previous load's `store` to simulate a reopen.
function openApp(store = new Map()) {
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }
  const win = { localStorage, dispatchEvent: () => true, CustomEvent };
  const sandbox = { window: win, CustomEvent, console, Date, JSON, Boolean, Number, String, Object, atob };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync(SOURCE, "utf8"), ctx);
  const call = (expr) => vm.runInContext(expr, ctx);
  return {
    store,
    saveAuthToken: (t) => { ctx.__t = t; return call("gloobalAuthTokenSave(__t)"); },
    clearAuthToken: () => call("gloobalAuthTokenClear()"),
    saveSession: (u, p, b) => { ctx.__u = u; ctx.__p = p; ctx.__b = b; return call("gloobalSessionSave(__u, __p, __b)"); },
    loadSession: () => call("gloobalSessionLoad()"),
    clearSession: () => call("gloobalSessionClear()"),
    looksLive: (t) => { ctx.__t = t; return call("gloobalAuthTokenLooksLive(__t)"); },
  };
}

// Same shape as server/server.js issueAuthToken; the signature is opaque to
// the client, so any string stands in for it.
function token(expOffsetMs) {
  const payload = Buffer.from(JSON.stringify({
    sub: "abc", symbolId: "X", iat: Date.now(), exp: Date.now() + expOffsetMs,
  })).toString("base64url");
  return `${payload}.sig`;
}

const DAY = 24 * 60 * 60 * 1000;
const ALICE = { symbolId: "−+×=○□●■−+×=", fullName: "Alice", mobileNumber: "+919000000001" };

// Mirrors the condition in App.jsx's restore effect (asserted against the
// source below, so the two cannot drift silently).
function resumeStage(restored) {
  if (!restored) return "phone";
  const appLock = Boolean(restored.user.securitySettings && restored.user.securitySettings.appLock === true);
  return restored.user.symbolId && app.looksLive(restored.token) && !appLock ? "dashboard" : "secureId";
}
const app = openApp();

test("login → close → reopen: session and token survive, resumes to dashboard", () => {
  const first = openApp();
  first.saveAuthToken(token(7 * DAY));
  first.saveSession(ALICE, "9000000001", false);

  const reopened = openApp(first.store);
  const restored = reopened.loadSession();
  assert.ok(restored, "session must be rehydrated after reopen");
  assert.equal(restored.user.symbolId, ALICE.symbolId);
  assert.ok(restored.token, "token must survive the close");
  assert.equal(resumeStage(restored), "dashboard");
});

test("background → return: nothing in the store changes, still signed in", () => {
  const s = openApp();
  s.saveAuthToken(token(7 * DAY));
  s.saveSession(ALICE, "9000000001", false);
  const before = s.store.get("gloobal.session.v1");
  // No lifecycle handler writes the session; re-reading is all a return does.
  assert.equal(s.store.get("gloobal.session.v1"), before);
  assert.equal(resumeStage(s.loadSession()), "dashboard");
});

test("explicit logout → reopen: login required", () => {
  const s = openApp();
  s.saveAuthToken(token(7 * DAY));
  s.saveSession(ALICE, "9000000001", false);
  s.clearSession();
  const reopened = openApp(s.store);
  assert.equal(reopened.loadSession(), null);
  assert.equal(resumeStage(reopened.loadSession()), "phone");
});

test("expired token → PIN stage, not the dashboard", () => {
  const s = openApp();
  s.saveAuthToken(token(-1000));
  s.saveSession(ALICE, "9000000001", false);
  const restored = openApp(s.store).loadSession();
  assert.ok(restored, "identity is kept so the ID is pre-filled");
  assert.equal(resumeStage(restored), "secureId");
});

test("token dropped by a 401 (gloobalAuthTokenClear) → PIN stage on reopen", () => {
  const s = openApp();
  s.saveAuthToken(token(7 * DAY));
  s.saveSession(ALICE, "9000000001", false);
  s.clearAuthToken(); // what httpClient.js does on a rejected token
  const restored = openApp(s.store).loadSession();
  assert.equal(restored.token, null);
  assert.equal(resumeStage(restored), "secureId");
});

test("App lock on → cold reopen still asks for the PIN", () => {
  const s = openApp();
  s.saveAuthToken(token(7 * DAY));
  s.saveSession({ ...ALICE, securitySettings: { appLock: true } }, "9000000001", false);
  assert.equal(resumeStage(openApp(s.store).loadSession()), "secureId");
});

test("gloobalAuthTokenLooksLive rejects anything malformed", () => {
  for (const bad of [null, undefined, "", "garbage", "!!!.sig", `${Buffer.from("{}").toString("base64url")}.sig`,
    `${Buffer.from('{"exp":"soon"}').toString("base64url")}.sig`]) {
    assert.equal(app.looksLive(bad), false, `should reject ${bad}`);
  }
  assert.equal(app.looksLive(token(60_000)), true);
});

test("App.jsx restore effect gates the dashboard on a live token and App lock", () => {
  const src = readFileSync(APP, "utf8");
  const start = src.indexOf("const restored = GloobalApi.loadSession();");
  assert.ok(start > 0, "restore effect not found");
  const body = src.slice(start, src.indexOf("}, []);", start));
  assert.match(body, /gloobalAuthTokenLooksLive\(restored\.token\)/);
  assert.match(body, /securitySettings\.appLock === true/);
  assert.match(body, /setStage\("dashboard"\)/);
  assert.match(body, /setStage\("secureId"\)/);
});

test("no page lifecycle handler clears the session", () => {
  for (const file of [APP, SOURCE]) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /addEventListener\(\s*["'](pagehide|beforeunload|unload)["']/,
      `${file} must not hook page teardown`);
  }
});
