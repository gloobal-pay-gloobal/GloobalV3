// src/services/api/httpClient.js
//
// HTTP client for the real Gloobal backend (Express + MongoDB Atlas,
// deployed to Render). Ported from the original Gloobal frontend's
// services/httpClient.js — same backend, same contract, restyled for this
// project's module system.
//
// IMPORTANT — this project has no imports between modules; everything
// shares one global scope (see README). So this file declares plain
// functions and one namespace object, `GloobalApi`, rather than exporting.
//
// The browser NEVER talks to MongoDB directly. The Atlas connection string
// lives in Backend/.env on the server and must stay there — every read and
// write goes through the REST API below. There is no database driver, no
// connection string, and no credential of any kind in this bundle.
//
// The backend has no auth middleware, no JWT and no session cookies: every
// call passes symbolId directly in its own body/query. That is why there is
// no token store and no `credentials: "include"` here. Don't add either
// without a matching backend change.

// Every call gets the cold-start allowance, not just the ones that happen
// to run during sign-in.
//
// This was 15 seconds, against a backend that sleeps when idle and takes
// 20-50s to wake (see below). The split was made on the theory that only
// registration and login could be "the first call of a session", so those
// were given 45s and everything else kept 15s. That theory does not hold:
// the app can sit on the dashboard for fifteen minutes, Render puts the
// backend to sleep, and then whatever the person taps next IS the first
// call — verifying a PIN, sending a payment, loading a balance. Those all
// aborted at 15s while the server was still booting, and surfaced as
// "couldn't reach the server" on a backend that was fine.
//
// There is no call where failing at 15s beats waiting: a timeout is a
// failure either way, and giving up on a server that is merely starting is
// strictly worse. Payments are the sharpest case — POST
// /api/transactions/send carries an idempotencyKey and the backend runs
// its own 15-second identical-resend guard, so waiting is safe while
// timing out early risks a retry the person did not intend.
var GLOOBAL_API_DEFAULT_TIMEOUT_MS = 45e3;

// Render's free tier spins the backend down when idle and takes 20-50s to
// wake up — measured at ~23s on a cold hit. That is the number the
// default above is sized against.
//
// Kept as its own name, and deliberately equal to the default, because the
// call sites that pass it explicitly are the ones documenting "this one is
// very likely to be the first request after a sleep". If the default ever
// drops again, those keep their allowance. Same value today: no call
// should get less.
var GLOOBAL_API_COLD_START_TIMEOUT_MS = 45e3;

var GLOOBAL_API_FALLBACK_BASE = "https://gloobal-pay.onrender.com";

// A build env can hand us VITE_API_URL set to something relative or empty
// (e.g. a leftover "/api" from a proxy config), which silently turns every
// call into a same-origin request that 404s. Only an absolute http(s) URL
// is trusted; anything else falls back to the real Render backend.
//
// Written as a literal `import.meta.env.X` read because Vite substitutes
// that statically at build time. The try/catch is for non-Vite contexts
// (the SSR probes in gloobal-essentials-preview/tools), where import.meta
// may not exist at all.
var GLOOBAL_API_ENV_BASE = "";
try {
  GLOOBAL_API_ENV_BASE =
    (import.meta && import.meta.env && (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)) || "";
} catch (e) {
  GLOOBAL_API_ENV_BASE = "";
}

var GLOOBAL_API_BASE = (/^https?:\/\//i.test(GLOOBAL_API_ENV_BASE) ? GLOOBAL_API_ENV_BASE : GLOOBAL_API_FALLBACK_BASE)
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

function gloobalApiUrl(path) {
  return `${GLOOBAL_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

class GloobalApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "GloobalApiError";
    this.status = status;
    this.body = body;
  }
}

// Fired the moment a call discovers its bearer token no longer works (see
// the 401 branch in gloobalApiRequest below) — a dead Render backend
// restart regenerating AUTH_TOKEN_SECRET, a genuine expiry, whatever the
// cause. Before this, that 401 just cleared the token and surfaced as
// whatever inline error text the calling screen happened to show (e.g.
// Send Money's search field silently printing "Sign in to continue" and
// leaving a disabled Search button, with no way back to an actual sign-in
// screen). App.jsx listens for this at the top level and redirects to
// Login instead, since a cleared token is never something a single screen
// can recover from on its own — the whole app is signed out at that point,
// whether or not any particular screen realizes it yet.
var GLOOBAL_SESSION_EXPIRED_EVENT = "gloobal:sessionExpired";

// status 0 means the request never got an answer at all — a timeout, an
// offline moment, or a cold start still booting. Callers treat that very
// differently from a real rejection: it must not burn an attempts budget
// and must not be reported as "wrong PIN".
function gloobalApiIsUnreachable(err) {
  return err instanceof GloobalApiError && err.status === 0;
}

async function gloobalApiRequest(method, path, body, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || GLOOBAL_API_DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort());

  // The bearer token the backend now requires on every route that touches an
  // account. Read per request rather than captured once: it changes on login,
  // registration, PIN reset and passkey sign-in, and a cached copy would send
  // the previous account's credential after a switch.
  //
  // Sent when there is one, omitted when there is not, so the pre-sign-in
  // routes (OTP, registration, login, availability) are unaffected.
  const headers = { "Content-Type": "application/json" };
  const authToken = typeof gloobalAuthToken === "function" ? gloobalAuthToken() : null;
  if (authToken && !opts.anonymous) headers.Authorization = `Bearer ${authToken}`;

  try {
    const res = await fetch(gloobalApiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const contentType = res.headers.get("content-type") || "";
    const parsed = contentType.includes("application/json") ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      // 401 usually means this token is gone — expired, or signed by a key the
      // server no longer has (AUTH_TOKEN_SECRET is regenerated at boot when the
      // environment does not set one, so a restart invalidates every token).
      // Dropping it here stops every subsequent call re-sending a credential
      // that is known not to work, and lets the app fall back to its sign-in
      // flow instead of looping on failures it cannot explain.
      //
      // ── Why `credentialCheck` is here (11 September 2026) ────────────────
      //
      // "Usually" is doing real work in that first sentence, and treating it
      // as "always" signed people out for typing a digit wrong.
      //
      // Three routes answer 401 for a reason that has nothing to do with the
      // bearer token: POST /api/pin/verify, POST /api/pin/change and
      // POST /api/login all return 401 when the PIN carried IN THE BODY is
      // wrong. The token on those requests is valid — the server went on
      // using it, and a GET /api/profile with the same token immediately
      // afterwards still answered 200. This branch threw it away anyway,
      // fired GLOOBAL_SESSION_EXPIRED_EVENT, and App.jsx redirected to Login.
      //
      // So one mistyped digit in Change PIN (or in the PIN fallback that
      // backs every biometric gate in the app) signed the person out of a
      // session the server had not revoked, and did it BEFORE the dialog
      // could show the server's own "4 attempts left" message — which is the
      // one thing that tells somebody how close they are to a ten-minute
      // lockout. It also made the lockout budget unusable: each wrong try
      // cost a full sign-in.
      //
      // gloobalApiIsUnreachable's note applies in spirit: a rejection of the
      // credential in the body says nothing about the validity of the token
      // in the header, and conflating the two signs people out for a typo.
      //
      // The callers that submit a credential in the body pass
      // `credentialCheck: true` and keep their session. A dead token on one
      // of those routes still ends the session, because the server marks that
      // case explicitly (`code: "auth_token_invalid"` from requireAuth) — so
      // this stays a narrowing of the rule, not a hole in it.
      const tokenRejected =
        res.status === 401 &&
        (!opts.credentialCheck || (parsed && parsed.code === "auth_token_invalid"));
      if (tokenRejected && authToken && typeof gloobalAuthTokenClear === "function") {
        gloobalAuthTokenClear();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(GLOOBAL_SESSION_EXPIRED_EVENT));
        }
      }
      const message = (parsed && parsed.message) || `Request to ${path} failed with ${res.status}`;
      throw new GloobalApiError(message, res.status, parsed);
    }
    return parsed;
  } catch (err) {
    if (err instanceof GloobalApiError) throw err;
    if (err && err.name === "AbortError") {
      throw new GloobalApiError(`Request to ${path} timed out after ${timeoutMs}ms`, 0, null);
    }
    throw new GloobalApiError(`Network error calling ${path}: ${err.message}`, 0, null);
  } finally {
    clearTimeout(timeoutId);
  }
}

var gloobalApiClient = {
  get: (path, options) => gloobalApiRequest("GET", path, undefined, options),
  post: (path, body, options) => gloobalApiRequest("POST", path, body, options),
  put: (path, body, options) => gloobalApiRequest("PUT", path, body, options),
  patch: (path, body, options) => gloobalApiRequest("PATCH", path, body, options),
  delete: (path, options) => gloobalApiRequest("DELETE", path, undefined, options)
};

// Fire-and-forget wake-up for Render's cold start. Any request is enough to
// make the proxy spin the sleeping backend up — even one that 404s, since
// there is no dedicated health route. Called once at app mount so the
// backend has a head start while the person is still picking a country and
// typing their number. Never awaited, never surfaces an error: a failed
// warm-up just means no head start.
function gloobalApiWarmUp() {
  try {
    fetch(gloobalApiUrl("/"), { method: "GET" }).catch(() => {});
  } catch (e) {
    /* no-op */
  }
}
