// tests/session-sliding.test.mjs
//
//   node --test tests/session-sliding.test.mjs
//
// Why people were being asked to sign in again and again.
//
// A bearer token lasts seven days from the credential that minted it, and
// nothing extended it. The only routes that issue one are login,
// registration, PIN change, PIN reset, passkey and PIN verify — there is
// no refresh endpoint — so somebody who opened the app every day was
// signed out on the eighth, having done nothing wrong and with no way to
// have prevented it.
//
// Worse, and this is the part that made it look random: /api/pin/verify
// HAS always returned a fresh token, and the client threw it away.
// `verifyPin` returned a bare `true`. That route backs every PIN gate in
// the app, so anybody without an enrolled passkey passed through it
// constantly and was handed seven fresh days each time, every one of them
// discarded. Passkey users never saw the bug, because their gate
// (`passkeyAuthVerify`) stores its token — as does `login`, with a comment
// either side explaining why. `verifyPin` was the single outlier.
//
// ── WHAT THESE TESTS ARE FOR ────────────────────────────────────────────
//
// Not "does a token refresh" — that needs a clock and a database. They
// guard the two ways this feature dies SILENTLY, with nothing failing and
// nobody noticing until the complaints come back:
//
//   1. The two halves disagree about the header's name.
//   2. The server sets a header the browser is not allowed to read.
//
// Both leave every test green, every request working, and the session
// expiring at seven days exactly as before.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SERVER = "server/server.js";
const HTTP = "backend/services/api/httpClient.js";
const API = "backend/services/api/gloobalApi.js";

const code = (p) => readSource(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the token the PIN gate was throwing away", () => {
  test("verifyPin stores it, like the two functions either side of it", () => {
    const s = code(API);
    const at = s.indexOf("async verifyPin(");
    assert.ok(at > 0, "verifyPin is gone");
    // Bounded by the NEXT function rather than by the first "}," — the
    // argument list itself contains one, which is how the first version of
    // this test passed against a two-line slice holding nothing.
    const end = s.indexOf("async ", at + 10);
    const body = s.slice(at, end > at ? end : at + 1200);
    assert.ok(body.includes("/api/pin/verify"), "the slice missed the function");
    assert.match(body, /gloobalAuthTokenSave\(result\.token\)/,
      "the token /api/pin/verify returns is dropped again");
  });

  test("the server is still minting one there", () => {
    // If this route ever stops returning a token, the line above becomes a
    // no-op and the PIN gate silently stops extending the session again.
    const s = code(SERVER);
    const at = s.indexOf("'/api/pin/verify'");
    assert.ok(at > 0, "the route is gone");
    const route = s.slice(at, at + 4000);
    const verified = route.indexOf("verified: true");
    assert.ok(verified > 0, "the success response is gone");
    assert.match(route.slice(verified, verified + 400), /token: issueAuthToken\(user\)/,
      "/api/pin/verify no longer returns a token");
  });

  test("all three credential paths agree", () => {
    // login, passkeyAuthVerify and verifyPin each receive a token and each
    // must store it. Two of them always did; the odd one out was the bug.
    const s = code(API);
    for (const fn of ["async login(", "async passkeyAuthVerify(", "async verifyPin("]) {
      const at = s.indexOf(fn);
      assert.ok(at > 0, `${fn} is gone`);
      assert.match(s.slice(at, at + 1400), /gloobalAuthTokenSave\(/,
        `${fn} does not store the token it is handed`);
    }
  });
});

describe("the sliding window", () => {
  test("the two halves name the same header", () => {
    // The whole feature is one string agreed between two files in two
    // different runtimes. Mistype either and nothing fails: the server
    // sets a header nobody reads, every request still works, and the
    // session still dies at seven days.
    const server = code(SERVER).match(/AUTH_TOKEN_REFRESH_HEADER = '([^']+)'/);
    const client = code(HTTP).match(/GLOOBAL_API_TOKEN_REFRESH_HEADER = "([^"]+)"/);
    assert.ok(server, "the server declares no refresh header");
    assert.ok(client, "the client declares no refresh header");
    assert.equal(server[1], client[1],
      `the server sends ${server[1]} and the client reads ${client[1]}`);
  });

  test("CORS lets the browser read it", () => {
    // The frontend is on Netlify and this API is on Render, so every
    // request the app makes is cross-origin — and a cross-origin
    // response's headers are hidden from script unless they are named in
    // exposedHeaders. Omit it and the refresh arrives and is unreadable.
    const s = code(SERVER);
    const at = s.indexOf("cors({");
    assert.ok(at > 0, "the CORS block is gone");
    assert.match(s.slice(at, at + 700), /exposedHeaders: \[AUTH_TOKEN_REFRESH_HEADER\]/,
      "the refreshed token is sent to a browser that cannot read it");
  });

  test("the header is declared before the CORS block that uses it", () => {
    // Both are evaluated at module load, in source order. Declared after,
    // the constant is in its temporal dead zone when cors() reads it and
    // the server dies on boot — which this repo has done to itself before.
    const s = code(SERVER);
    assert.ok(
      s.indexOf("const AUTH_TOKEN_REFRESH_HEADER") < s.indexOf("cors({"),
      "the header constant is declared after the CORS block reads it"
    );
  });

  test("requireAuth offers the refresh, and only after the user is known", () => {
    const s = code(SERVER);
    const at = s.indexOf("const requireAuth = async");
    assert.ok(at > 0);
    const body = s.slice(at, s.indexOf("\n};", at));
    assert.match(body, /maybeRefreshAuthToken\(req, res, user\)/,
      "nothing extends the session on an authenticated request");
    assert.ok(
      body.indexOf("if (!user)") < body.indexOf("maybeRefreshAuthToken"),
      "a token is minted before the caller has been authenticated"
    );
  });

  test("a failed refresh never fails the request", () => {
    // A session that could not be extended still works for as long as it
    // had left. Throwing here would turn "your session nearly expired"
    // into a 500 on a route that was about to succeed.
    const s = code(SERVER);
    const at = s.indexOf("const maybeRefreshAuthToken");
    assert.ok(at > 0, "the refresh helper is gone");
    const body = s.slice(at, s.indexOf("\n};", at));
    assert.match(body, /try \{/);
    assert.match(body, /catch \(error\)/);
    assert.doesNotMatch(body, /throw /, "the refresh can fail the request it rode in on");
  });

  test("it refreshes at half the window, not on every request", () => {
    // Re-minting on every call writes to storage on every tap for no gain.
    // Half is the point that guarantees anybody active within the last
    // half-window carries a token good for at least another half.
    const s = code(SERVER);
    const at = s.indexOf("const maybeRefreshAuthToken");
    const body = s.slice(at, s.indexOf("\n};", at));
    assert.match(body, /claims\.exp - Date\.now\(\) > AUTH_TOKEN_TTL_MS \/ 2/,
      "the refresh threshold is not half the token's life");

    // And the threshold behaves: fresh token quiet, old token refreshed.
    const TTL = 7 * 24 * 60 * 60 * 1000;
    const wouldRefresh = (exp) => !(exp - Date.now() > TTL / 2);
    assert.equal(wouldRefresh(Date.now() + TTL), false, "a brand new token is re-minted");
    assert.equal(wouldRefresh(Date.now() + TTL * 0.51), false, "a token just past minting is re-minted");
    assert.equal(wouldRefresh(Date.now() + TTL * 0.49), true, "a half-spent token is not extended");
    assert.equal(wouldRefresh(Date.now() + 60000), true, "a token an hour from death is not extended");
  });
});

describe("the client only accepts a refresh it asked for", () => {
  test("it stores the header, and before the response's own status is judged", () => {
    // A refreshed token on a request that failed for an unrelated reason
    // is still a good token, and the next call should carry it.
    const s = code(HTTP);
    const read = s.indexOf("GLOOBAL_API_TOKEN_REFRESH_HEADER)");
    const notOk = s.indexOf("if (!res.ok)");
    assert.ok(read > 0, "the refresh header is never read");
    assert.ok(notOk > 0);
    assert.ok(read < notOk, "the refresh is only taken from successful responses");
  });

  test("never from a request that carried no credential", () => {
    // A token accepted on an anonymous call would be a session minted by a
    // response. The server should never send one there; the client must
    // not rely on that.
    const s = code(HTTP);
    const at = s.indexOf("const refreshed = res.headers.get");
    assert.ok(at > 0);
    const guard = s.slice(Math.max(0, at - 200), at);
    assert.match(guard, /authToken && !opts\.anonymous/,
      "an anonymous request would accept a token from the response");
  });

  test("it ignores a header that repeats the token already held", () => {
    const s = code(HTTP);
    assert.match(s, /refreshed !== authToken/,
      "an unchanged token is written to storage on every request");
  });
});
