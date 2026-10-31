// src/services/api/gloobalApi.js
//
// The real Gloobal backend surface, as one namespace object. Ported from
// the original Gloobal frontend's services/api/authApi.js — same endpoints,
// same request/response shapes, verified against Backend/server.js.
//
// Everything the app persists lives in MongoDB Atlas behind these routes.
// The browser holds no database credential and opens no database
// connection; `Backend/.env` (MONGO_URI) stays server-side on Render.
//
// Every response is read for its actual shape (`{ user }`, `{ message }`,
// `{ transactions }`) rather than assumed, because this backend returns
// slightly different envelopes per route.
//
// Compatibility with this project's UI, checked against Backend/server.js:
//   Secure ID  12 symbols from  − + × = ○ □ ● ■   (identical alphabet/order)
//   OTP        6 digits (PROTOTYPE_OTP)
//   PIN        4-6 digits, so this project's 6 is valid
//   Mobile     10-digit numbers stored as +91XXXXXXXXXX server-side

var GLOOBAL_API_WAKING_MESSAGE =
  "Couldn't reach the server — it may still be waking up. Please try again in a few seconds.";

// A number, or null where the server genuinely sent one.
//
// `Number(x) || 0` is the usual shorthand in this file and it is wrong for
// any figure that can legitimately be unavailable: it turns null into 0, and
// 0 is a claim ("nobody spent anything") where null is an admission ("this
// could not be computed"). Coverage renders those two differently — a real
// figure versus ∆ — so the difference has to survive the boundary. Also
// keeps a real 0 as 0, which the `||` form silently agrees with by accident.
function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Cold-start retry.
//
// The backend runs on a Render FREE instance, which spins down after about
// fifteen minutes without traffic. Its logs show this plainly: four separate
// instance ids started on one day, with multi-hour gaps between them. A
// spin-up takes tens of seconds, and during it a request either hangs or
// comes back as an unreachable failure.
//
// That lands hardest on exactly the calls this app makes FIRST — the balance
// and profile read on arriving at the dashboard — because opening the app
// after a while is precisely when the server is coldest. One failed call was
// enough to paint "balance unavailable" and leave it there until the person
// found the retry themselves. That is the "sometimes it fails to load
// balance on first login" report, and it is not intermittent at all: it is
// deterministic, and it tracks how long the app went unused.
//
// The delays climb rather than repeating, because a cold start is not a
// dropped packet — it is a container booting, and hammering it every second
// does not make it boot faster. Roughly 37 seconds of total patience, which
// covers a normal Render spin-up.
var GLOOBAL_API_WAKE_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];

// Runs `attempt` and retries ONLY while the failure is "unreachable"
// (status 0 — a timeout, an offline moment, or a cold start still booting).
//
// A 401, a 404 or a 500 is a real answer from a server that is awake, and
// retrying it would be pointless at best: it would delay a legitimate error
// by half a minute and, on a route with side effects, risk repeating them.
// gloobalApiIsUnreachable is the same predicate login already uses to tell
// "still waking" apart from "wrong PIN".
//
// Returns { ok, value } or { ok: false, error, cancelled } — never throws —
// so a caller inside a React effect cannot turn a wake-up into an unhandled
// rejection.
async function gloobalApiWithWakeRetry(attempt, options) {
  const opts = options || {};
  let lastError = null;
  for (let i = 0; i <= GLOOBAL_API_WAKE_RETRY_DELAYS_MS.length; i += 1) {
    // Checked before every attempt AND after every wait: the screen can be
    // left, or the account switched, part-way through a 37-second window.
    if (opts.isCancelled && opts.isCancelled()) return { ok: false, cancelled: true };
    try {
      return { ok: true, value: await attempt() };
    } catch (err) {
      lastError = err;
      if (!gloobalApiIsUnreachable(err)) return { ok: false, error: err };
      const delay = GLOOBAL_API_WAKE_RETRY_DELAYS_MS[i];
      if (delay === undefined) break;
      // Tells the caller this is a wake-up rather than a failure, so the UI
      // can say "still waking" instead of accusing the server of being down
      // while it is in fact starting normally.
      if (opts.onWaking) opts.onWaking(i + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return { ok: false, error: lastError };
}

// Replaces photos the server already holds with references to them.
function creatorItemsWithRefs(items, current) {
  const known = new Map();
  for (const row of Array.isArray(current) ? current : []) {
    if (!row || !row.id) continue;
    const list = Array.isArray(row.photos) && row.photos.length ? row.photos : (row.photo ? [row.photo] : []);
    list.forEach((p, n) => { if (typeof p === "string" && p && !known.has(p)) known.set(p, `ref:${row.id}:${n}`); });
  }
  return items.map((it) => {
    const list = Array.isArray(it.photos) ? it.photos : (it.photo ? [it.photo] : []);
    return { ...it, photos: list.map((p) => (typeof p === "string" && known.has(p) ? known.get(p) : p)) };
  });
}

var GloobalApi = {
  baseUrl: GLOOBAL_API_BASE,
  isUnreachable: gloobalApiIsUnreachable,
  warmUp: gloobalApiWarmUp,

  // --- OTP -----------------------------------------------------------

  // POST /api/otp/send — purpose is one of registration | login |
  // pin_reset | mobile_change.
  async sendOtp(mobileNumber, purpose) {
    try {
      await gloobalApiClient.post(
        "/api/otp/send",
        { mobileNumber, purpose: purpose || "registration" },
        { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
      );
    } catch (err) {
      if (gloobalApiIsUnreachable(err)) throw new Error(GLOOBAL_API_WAKING_MESSAGE);
      throw err;
    }
  },

  // POST /api/otp/verify
  async verifyOtp(mobileNumber, otp, purpose) {
    const key = `verify-otp:${mobileNumber}`;
    gloobalRateCheck(key);
    try {
      await gloobalApiClient.post(
        "/api/otp/verify",
        { mobileNumber, otp, purpose: purpose || "registration" },
        { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
      );
      gloobalRateClear(key);
    } catch (err) {
      // A request that never got an answer means the backend never judged
      // the OTP — don't spend the person's attempts budget on a cold start
      // that wasn't their mistake.
      if (gloobalApiIsUnreachable(err)) {
        gloobalRateClear(key);
        throw new Error(GLOOBAL_API_WAKING_MESSAGE);
      }
      throw err;
    }
  },

  // --- Registration and login -----------------------------------------

  // POST /api/register-symbol — called once, after the referral step
  // (including when it was skipped), with everything collected across the
  // phone / secureId / referral stages. OTP-gated server-side: the backend
  // rejects this with 403 unless a verified registration OTP exists for
  // the number.
  async register(payload) {
    const result = await gloobalApiClient.post("/api/register-symbol", payload, {
      timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
    });
    // The account exists from this moment, and the registration OTP that
    // authorised it has been consumed server-side — so this token is the only
    // credential the flow carries forward. POST /api/pin/set, the very next
    // step, requires it.
    if (result && result.token) gloobalAuthTokenSave(result.token);
    return {
      user: result.user || {
        symbolId: payload.symbolId,
        fullName: payload.fullName,
        mobileNumber: payload.mobileNumber
      },
      alreadyRegistered: result.alreadyRegistered,
      // Whether a referral code, if one was sent, actually landed. The
      // backend never fails a registration over a bad code, so this is the
      // only way the caller can tell.
      referralApplied: result.referralApplied,
      referralWarning: result.referralWarning || null
    };
  },

  // POST /api/pin/set
  async setPin(symbolId, pin) {
    await gloobalApiClient.post("/api/pin/set", { symbolId, secureId: symbolId, pin });
  },

  // POST /api/pin/change — the Security screen's Change PIN.
  //
  // NOT /api/pin/reset. Reset is account recovery: unauthenticated, proving
  // only an OTP to the account's number. This is a change made by somebody
  // already signed in, and it requires the CURRENT PIN as well as the
  // session — otherwise an unlocked phone could set a new PIN with an SMS
  // code instead of the PIN it is replacing.
  //
  // The server revokes this account's OTHER sessions on success and hands
  // back a replacement token for this one. Saving it is what stops the
  // device that made the change from being signed out by its own change.
  //
  // credentialCheck: a wrong CURRENT PIN comes back 401, and without this
  // the client read that as "your token is dead", cleared it and bounced to
  // Login — so a typo signed the person out instead of showing them the
  // server's "4 attempts left". See the 401 branch in httpClient.js.
  async changePin(symbolId, currentPin, newPin) {
    const result = await gloobalApiClient.post(
      '/api/pin/change',
      { symbolId, currentPin, newPin },
      { credentialCheck: true }
    );
    if (result && result.token) gloobalAuthTokenSave(result.token);
    return { user: result && result.user, message: result && result.message };
  },

  // PATCH /api/profile/security/:symbolId — the Security screen's switches.
  //
  // Server-side rather than browser storage, so the setting is the same
  // wherever this person signs in and cannot be flipped by anything that
  // can write to localStorage. Returns the updated user, which is what the
  // caller stores — the switches are read back off registeredUser, never
  // held as their own separate copy that could drift from the account.
  async updateSecuritySettings(symbolId, settings) {
    const result = await gloobalApiClient.patch(
      `/api/profile/security/${encodeURIComponent(symbolId)}`,
      settings
    );
    return (result && result.user) || null;
  },

  // POST /api/pin/verify — confirms a PIN without logging in.
  //
  // credentialCheck, for the same reason as changePin above and with wider
  // blast radius: this is the PIN fallback behind EVERY biometric gate in
  // the app (requireBiometric, frontend/hooks/useBiometric.js). One wrong
  // digit at a payment confirmation used to end the session outright.
  async verifyPin(symbolId, pin) {
    const result = await gloobalApiClient.post(
      "/api/pin/verify",
      { symbolId, pin },
      { credentialCheck: true }
    );
    if (!result || !result.verified) throw new Error((result && result.message) || "That PIN wasn't recognized.");
    // ── THE TOKEN THIS ROUTE HAS ALWAYS RETURNED, AND THIS LINE DROPPED ──
    //
    // /api/pin/verify mints a bearer token on success and says in its own
    // comment why: it is the re-authentication step behind a restored
    // session, so a verify has to leave the person holding a token. The
    // two functions either side of this one — login and passkeyAuthVerify —
    // both store it. This one returned a bare `true` and threw it away.
    //
    // What that cost: this route backs EVERY PIN gate in the app — the
    // biometric fallback, the payment confirmation, Send. Anybody without
    // an enrolled passkey (choose "set this up later" at registration, or
    // own a phone with no sensor) goes through it constantly, and each time
    // the server handed back a fresh seven days that was discarded. Their
    // token's clock therefore never moved from their last full sign-in, so
    // they were signed out on the seventh day no matter how much they had
    // used the app in between — the "asks me to log in again and again"
    // the founder reported twice.
    //
    // Passkey users never saw it, because their gate stores its token. That
    // asymmetry is why it looked random.
    if (result.token && typeof gloobalAuthTokenSave === "function") gloobalAuthTokenSave(result.token);
    return true;
  },

  // POST /api/login — Secure ID + PIN.
  //
  // `identifier` is a Gloobal ID or a full mobile number — the backend resolves
  // either, behind the PIN. Logging in by phone used to mean calling
  // GET /api/users/resolve first to turn the number into a Gloobal ID, which is
  // an unauthenticated phone-number-to-account oracle; that lookup is now a
  // signed-in operation and this route does the resolution itself.
  async login(identifier, pin) {
    gloobalRateCheck("login");
    try {
      const result = await gloobalApiClient.post(
        "/api/login",
        { symbolId: identifier, secureId: identifier, identifier, pin },
        // credentialCheck: a wrong PIN here is a 401 about the PIN, not about
        // any token this device is still holding. Signing in on a device that
        // already had a live session must not destroy that session because
        // the first attempt was mistyped.
        { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS, credentialCheck: true }
      );
      gloobalRateClear("login");
      // Every protected route needs this. Stored before the caller sees the
      // user, so nothing that runs on a successful login can race it.
      if (result && result.token) gloobalAuthTokenSave(result.token);
      return { user: result.user || { symbolId: identifier } };
    } catch (err) {
      // Unreachable is a cold backend, not a wrong Secure ID or PIN. It
      // must not burn the local throttle, or one slow cold start locks
      // someone out of their next, perfectly correct, attempt.
      if (gloobalApiIsUnreachable(err)) {
        gloobalRateClear("login");
        throw new Error(GLOOBAL_API_WAKING_MESSAGE);
      }
      throw err;
    }
  },

  // --- Lookup ----------------------------------------------------------

  // GET /api/users/resolve?identifier=... — by symbolId or mobile number.
  async resolveUser(identifier) {
    try {
      const result = await gloobalApiClient.get(`/api/users/resolve?identifier=${encodeURIComponent(identifier)}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result.user) throw new Error("No user found.");
      return result.user;
    } catch (err) {
      if (gloobalApiIsUnreachable(err)) throw new Error(GLOOBAL_API_WAKING_MESSAGE);
      throw err;
    }
  },

  // GET /api/payees/current — "is this still their Gloobal ID?"
  //
  // Asked before Pay again opens the payment screen on somebody, because the
  // ID it would open on came off a receipt, and a receipt records what was
  // true when the money moved. See the route for how it finds them: the
  // rename trail first, which is an exact recorded link between two IDs, and
  // the mobile number only where there is no trail.
  //
  // Answers { changed, user, previousGloobalId, matchedBy }. `changed: true`
  // means the payment screen must not simply open — the payer is shown the
  // old ID and the new one and taps to agree before anything is prefilled.
  //
  // Throws on 404 with the route's own message: the ID has gone and the
  // person has to be asked for their current one. Every other failure is
  // rethrown as-is, and the caller treats an unreachable server as "could
  // not check" rather than as "gone" — a cold start is not an answer.
  async resolveCurrentPayee({ gloobalId, mobileNumber } = {}) {
    const query = [`gloobalId=${encodeURIComponent(String(gloobalId || ""))}`];
    if (mobileNumber) query.push(`mobileNumber=${encodeURIComponent(String(mobileNumber))}`);
    try {
      return await gloobalApiClient.get(`/api/payees/current?${query.join("&")}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
    } catch (err) {
      if (gloobalApiIsUnreachable(err)) throw new Error(GLOOBAL_API_WAKING_MESSAGE);
      throw err;
    }
  },

  // Is this Gloobal ID still free to claim?
  //
  // GET /api/users/available, which answers with one boolean. This used to be
  // built on /api/users/resolve — an ID that resolves to somebody is by
  // definition taken — but that route returns a name, a mobile number and a
  // cashback rate, and registration has to run before anybody is signed in. So
  // the availability check was an unauthenticated way to turn a guessed ID into
  // somebody's contact details. Resolve is now signed-in only.
  //
  // Returns available: true | false |
  // null, where null means "couldn't tell" — a cold start or 5xx is not an
  // answer, and returning true there would show a confident "Available ✓"
  // over an ID that might well be taken. Registration stays permissive and
  // lets POST /api/register-symbol be the real uniqueness authority; any
  // screen that *displays* availability must not claim one on null.
  async checkSymbolAvailability(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/users/available?symbolId=${encodeURIComponent(symbolId)}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || typeof result.available !== "boolean") return { available: null, user: null };
      return { available: result.available, user: null };
    } catch (err) {
      // Every failure is "couldn't tell", 404 included. This route answers 200
      // for an unknown ID — that is the whole point of it — so a 404 can only
      // mean the server does not have the route at all, which is true of any
      // backend deployed before it existed. Reading that as "free to claim"
      // would tell somebody their own Gloobal ID does not exist and block them
      // at their own login screen.
      return { available: null, user: null };
    }
  },

  // The mirror image of the above, and deliberately separate: that one
  // treats an unclear answer as "free to claim" so a flaky lookup can never
  // block a registration. Here the safe fallback is the opposite way round
  // — an unclear answer must not reject a referral code that is probably
  // genuine — so only an explicit 404 counts as "no such ID".
  // Returns true | false | null.
  async referralCodeExists(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/users/available?symbolId=${encodeURIComponent(symbolId)}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || typeof result.available !== "boolean") return null;
      return !result.available;
    } catch (err) {
      // Same reasoning as above: a 404 here is a missing route, not a missing
      // account, and rejecting a genuine referral code over one would be worse
      // than carrying it forward — which the backend tolerates anyway.
      return null;
    }
  },

  // --- Profile and referrals -------------------------------------------

  // GET /api/profile/:symbolId
  async getProfile(symbolId) {
    const result = await gloobalApiClient.get(`/api/profile/${encodeURIComponent(symbolId)}`);
    return result.user || { symbolId };
  },

  // PATCH /api/profile/change-symbol-id — the current ID is the identity
  // proof, matching how every other route in this backend works.
  async changeSymbolId(currentSymbolId, newSymbolId) {
    const result = await gloobalApiClient.patch("/api/profile/change-symbol-id", { currentSymbolId, newSymbolId });
    return { newSymbolId: result.newSymbolId || newSymbolId, user: result.user || null };
  },

  // PUT /api/profile/:symbolId — name (and email) only. Deliberately not a
  // photo route: the backend accepts exactly `fullName` and `email` and
  // rejects a body with neither, so the profile picture stays a local
  // asset (see GLOOBAL_PROFILE_KEY_PREFIX in App.jsx) until the backend
  // grows somewhere to put it.
  async updateProfile(symbolId, updates) {
    const result = await gloobalApiClient.put(`/api/profile/${encodeURIComponent(symbolId)}`, updates);
    return result.user || null;
  },

  // --- Creator Share ------------------------------------------------------

  // PATCH /api/creator/cashback-rate — the share of every payment this
  // account hands back to whoever paid it. Sent as a decimal (1% = 0.01),
  // which is how the backend stores it and how GET /api/profile/:symbolId
  // and GET /api/users/resolve both return it; the UI works in percent and
  // converts at this boundary rather than letting two units travel together.
  //
  // The backend caps it at 0.07 and answers 400 above that, 404 for an
  // unknown ID. Neither is swallowed: My Share is a promise to every future
  // payer, so "saved" must mean the server agreed.
  async setCreatorCashbackRate(symbolId, cashbackRate) {
    const result = await gloobalApiClient.patch("/api/creator/cashback-rate", {
      symbolId,
      cashbackRate
    });
    const saved = Number(result && result.cashbackRate);
    return Number.isFinite(saved) ? saved : cashbackRate;
  },

  // --- Device authentication (WebAuthn passkeys) ------------------------
  //
  // Thin passthroughs: the option payloads are @simplewebauthn/server
  // output and are handed to navigator.credentials verbatim (after the
  // base64url decoding in frontend/hooks/useBiometric.js), so rewriting
  // their shape here would only be a chance to get it wrong.
  //
  // These deliberately do NOT swallow their errors. The caller needs to
  // tell a 404 ("nothing enrolled") and a 409 ("already enrolled") apart
  // from a genuine failure, which it does by reading GloobalApiError.status.

  // POST /api/passkey/status → { hasPasskey, user }
  async passkeyStatus(symbolId) {
    return gloobalApiClient.post("/api/passkey/status", { symbolId });
  },

  // POST /api/passkey/register/options → PublicKeyCredentialCreationOptions
  async passkeyRegisterOptions(symbolId) {
    return gloobalApiClient.post("/api/passkey/register/options", { symbolId }, { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS });
  },

  // POST /api/passkey/register/verify → { verified, user }
  async passkeyRegisterVerify(symbolId, response) {
    return gloobalApiClient.post("/api/passkey/register/verify", { symbolId, response });
  },

  // POST /api/passkey/auth/options → PublicKeyCredentialRequestOptions
  async passkeyAuthOptions(symbolId) {
    return gloobalApiClient.post("/api/passkey/auth/options", { symbolId }, { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS });
  },

  // POST /api/passkey/auth/verify → { verified, user }
  async passkeyAuthVerify(symbolId, response) {
    const result = await gloobalApiClient.post("/api/passkey/auth/verify", { symbolId, response });
    // Signing in by fingerprint alone has to produce a session too, or the
    // dashboard loads with no token and every protected read answers 401.
    if (result && result.token) gloobalAuthTokenSave(result.token);
    return result;
  },

  // --- Server-side face templates ---------------------------------------
  //
  // NOT what the biometric gate uses. The gate is WebAuthn (the passkey
  // routes above), which on a phone is the device's own Face ID / Touch ID
  // / fingerprint — a real hardware check, and the only one this bundle can
  // actually perform.
  //
  // These two are the separate server-side face-template feature. They are
  // wired but unused, because /api/face/enroll wants a numeric face
  // descriptor (`{ symbolId, descriptor: number[], model, livenessPassed }`)
  // and this app has no capture pipeline to produce one — there is no
  // camera access and no embedding model in the bundle. Calling enroll
  // without a real descriptor would be inventing biometric data, so it is
  // left to the caller that can supply one.
  //
  // Both return 503 ("Face verification is not configured on this server.")
  // until FACE_ENCRYPTION_KEY is set in the Render environment: the backend
  // refuses to store a template it cannot encrypt at rest, which is the
  // right call. Treat 503 as "offer this later", never as a reason to fail
  // a registration.
  async faceEnroll(symbolId, descriptor, model, livenessPassed) {
    return gloobalApiClient.post("/api/face/enroll", { symbolId, descriptor, model, livenessPassed });
  },

  // GET /api/face/status/:symbolId — false on 503 as well as on "no
  // template", since neither is a state the caller can do anything with.
  async faceStatus(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/face/status/${encodeURIComponent(symbolId)}`);
      return Boolean(result && result.enrolled);
    } catch (e) {
      return false;
    }
  },

  // GET /api/stats, falling back to GET /api/profile/count — how many
  // accounts are registered platform-wide, AND the same figure broken down
  // by countryIso (byCountry), which is what a country's own "Total users"
  // on the Coverage screen should read from. Before this, no route on the
  // client exposed the breakdown at all, so the per-country figure was
  // quietly computed from this device's own Send Money history instead
  // (see computeRealActiveUsers) — a brand-new registration in India never
  // moved India's number, no matter how many people actually signed up.
  //
  // Returns null, never 0, when the answer can't be had: this route is
  // newer than the rest of the surface and is not deployed on every
  // Backend/server.js, so a 404 means "this server can't tell us" and a
  // cold start means "not yet". Coverage falls back to what it can count
  // locally in that case. Printing 0 for either would be inventing a
  // figure, which is the exact bug the invented 13,422,000 was.
  //
  // Server side this is `User.countDocuments()` plus a `$group` on
  // countryIso (see countUsersByCountry() in server.js):
  //   app.get('/api/profile/count', async (req, res) =>
  //     res.json({ total: await User.countDocuments(), byCountry }));
  // Both `total` and `totalUsers` are read because the route has been
  // written both ways. byCountry sums to exactly `total` by construction —
  // same query, grouped — so the Gloobal-wide figure and every country's
  // own figure can never drift apart.
  //
  // Two routes are tried because they are the same figure under two names and
  // neither is on every deploy: /api/stats is the newer one, /api/profile/count
  // the one that shipped first. The fallback runs ONLY on a 404 — "this server
  // does not have that route" — never on an unreachable or a 5xx, so a cold
  // start costs one 45s wait rather than two.
  async _fetchPlatformStats() {
    const readStats = async (path) => {
      const result = await gloobalApiClient.get(path, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result) return null;
      const total = Number(result.totalUsers ?? result.total ?? result.count);
      if (!Number.isFinite(total) || total < 0) return null;
      const byCountry = {};
      if (result.byCountry && typeof result.byCountry === "object") {
        for (const [iso, count] of Object.entries(result.byCountry)) {
          const n = Number(count);
          if (iso && Number.isFinite(n) && n >= 0) byCountry[String(iso).toUpperCase()] = n;
        }
      }
      return { total, byCountry };
    };
    try {
      const stats = await readStats("/api/stats");
      if (stats) return stats;
    } catch (err) {
      if (!(err instanceof GloobalApiError && err.status === 404)) return null;
    }
    try {
      return await readStats("/api/profile/count");
    } catch (e) {
      return null;
    }
  },

  // GET /api/coverage — every figure on the Gloobal Coverage screen, from
  // the one server-side aggregation that owns them.
  //
  // Coverage used to compute its own spending in the browser, by reducing
  // `sendHistory` — the CURRENT ACCOUNT's outgoing payments, hydrated from a
  // route capped at 100 rows, summed without reading each row's currency.
  // So the "global" total was per-account, per-device, currency-blind and
  // silently truncated: two people saw 21.82 and 8.1K for a figure that is
  // defined as one platform-wide number. This call replaces that entirely.
  // There is deliberately no second path to any of these values.
  //
  // `currency` is the unit the caller wants everything denominated in. The
  // conversion happens on the server against real rates — the bundled RATES
  // table in this app must never be used for these figures, since its
  // convert() answers 0 for a currency it does not know rather than failing.
  //
  // Returns null when the server cannot answer (cold start, offline, a
  // deploy without this route). The screen renders ∆ for that, which is the
  // same thing it already does for a figure it does not have — an honest
  // "no data" rather than a fabricated 0 or a stale client-side guess.
  async getCoverage(currency) {
    try {
      const query = /^[A-Za-z]{3}$/.test(String(currency || ""))
        ? `?currency=${encodeURIComponent(String(currency).toUpperCase())}`
        : "";
      const result = await gloobalApiClient.get(`/api/coverage${query}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || !result.success) return null;

      const countries = Array.isArray(result.countries) ? result.countries : [];
      return {
        currency: String(result.currency || "INR").toUpperCase(),
        // null is a real answer here and must survive: it means the figure
        // could not be produced (an unconvertible currency), which is not
        // the same fact as 0. `Number(x) || 0` would erase that difference.
        totalSpending: numberOrNull(result.totalSpending),
        totalSpendingByCountry: result.totalSpendingByCountry && typeof result.totalSpendingByCountry === "object"
          ? result.totalSpendingByCountry
          : {},
        transactionsPerDay: Number(result.transactionsPerDay) || 0,
        transactionsTotal: Number(result.transactionsTotal) || 0,
        countries: countries.map((row) => ({
          countryIso: String(row.countryIso || "").toUpperCase(),
          users: Number(row.users) || 0,
          transactions: Number(row.transactions) || 0,
          transactionsToday: Number(row.transactionsToday) || 0,
          totalSpending: numberOrNull(row.totalSpending),
          // Tri-state on purpose. true/false are the server's answer under
          // the configured rule; null means the rule in force cannot be
          // evaluated yet (admin_enabled, with no field to read). The screen
          // must not collapse null into "locked".
          active: row.active === true ? true : row.active === false ? false : null
        })).filter((row) => /^[A-Z]{2}$/.test(row.countryIso)),
        activeCountryRule: result.activeCountryRule || null,
        // Carried through untouched, INCLUDING byCountry — the screen reads
        // that to show a country's own figure when a flag is tapped, and
        // reshaping it here would mean two places deciding what a payout
        // means.
        //
        // `available` is false until the first disbursement exists, and the
        // screen renders ∆ for it. That ∆ now means "nothing has been paid
        // yet" rather than "this cannot be known": models/Disbursement.js is
        // the record the server's probe used to name as missing. The fallback
        // below keeps `available: false` rather than inventing a zero, so a
        // request that failed and a platform that has paid nothing stay
        // distinguishable.
        ourSpending: result.ourSpending || { total: null, available: false }
      };
    } catch (e) {
      return null;
    }
  },

  // --- Hooman Projects ---------------------------------------------------
  //
  // The Coverage screen's project area had no persistence at all before
  // these: eight category names in a hardcoded array and a ∆ where a count
  // should be. Every call here goes to a real stored record.

  // GET /api/projects — the listing AND the project search.
  //
  // Distinct from the category picker's own search box on that screen,
  // which filters eight fixed NAMES in the browser and should keep doing
  // exactly that. This one queries stored projects; merging the two would
  // give one box that pretended to search products while filtering a list.
  async listProjects(options) {
    const opts = options || {};
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.category) params.set("category", opts.category);
    if (opts.country) params.set("country", opts.country);
    if (opts.mine) params.set("mine", "1");
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    const query = params.toString();
    try {
      const result = await gloobalApiClient.get(`/api/projects${query ? `?${query}` : ""}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || !result.success) return null;
      return {
        projects: Array.isArray(result.projects) ? result.projects : [],
        nextCursor: result.nextCursor || null,
        counts: result.counts || {},
        categories: Array.isArray(result.categories) ? result.categories : []
      };
    } catch (e) {
      // null, not an empty list: "the server did not answer" and "there are
      // no projects" are different facts, and the screen shows ∆ for the
      // first and a real zero for the second.
      return null;
    }
  },

  // POST /api/projects. Throws on a rejection so the form can show the
  // server's own message — the 1000-word limit in particular is enforced
  // there, and its message names the actual count.
  async createProject(project) {
    const result = await gloobalApiClient.post("/api/projects", project, {
      timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
    });
    return (result && result.project) || null;
  },

  async deleteProject(id) {
    await gloobalApiClient.delete(`/api/projects/${encodeURIComponent(id)}`);
  },

  // POST /api/projects/:id/attachment — base64 in JSON, because that needs
  // no multipart dependency and the server raises its body limit for this
  // one route. The caller reads the File itself; this only ships the bytes.
  async uploadProjectAttachment(id, { filename, contentType, base64 }) {
    const result = await gloobalApiClient.post(
      `/api/projects/${encodeURIComponent(id)}/attachment`,
      { filename, contentType, data: base64 },
      { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
    );
    return (result && result.project) || null;
  },

  // --- Contributions ----------------------------------------------------
  //
  // GIVING IS TWO CALLS, and the order matters.
  //
  //   1. sendTransaction() — the ordinary payment to the project's owner,
  //      through the route every other payment in this app goes through.
  //      This is where the money moves, where the PIN is checked and where
  //      the receipt comes from.
  //   2. attributeContribution() — tells the project which payment that
  //      was.
  //
  // The second call can fail after the first succeeded, and that is the
  // honest trade for not having a second path to the ledger (the whole
  // reasoning is in server/models/Contribution.js). When it does, the money
  // has still reached the owner, and this call is safe to repeat with the
  // same referenceId forever: the server's unique index turns a retry into
  // a read of the row that is already there, and answers `alreadyRecorded`.
  async attributeContribution(projectId, { referenceId, showName = false }) {
    const result = await gloobalApiClient.post(
      `/api/projects/${encodeURIComponent(projectId)}/contributions`,
      { referenceId, showName: Boolean(showName) },
      { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
    );
    return {
      contribution: (result && result.contribution) || null,
      project: (result && result.project) || null,
      alreadyRecorded: Boolean(result && result.alreadyRecorded)
    };
  },

  // GET /api/projects/:id/contributions. Returns null on failure rather
  // than throwing, the same way getProjects does: "could not reach the
  // server" and "nobody has given" are different facts, and a project page
  // that renders an empty list for the first one tells the owner a lie
  // about their own project.
  async getProjectContributions(projectId, { cursor = "", limit = 20 } = {}) {
    try {
      const query = new URLSearchParams();
      if (cursor) query.set("cursor", cursor);
      if (limit) query.set("limit", String(limit));
      const suffix = query.toString() ? `?${query}` : "";
      const result = await gloobalApiClient.get(
        `/api/projects/${encodeURIComponent(projectId)}/contributions${suffix}`,
        { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
      );
      return {
        contributions: Array.isArray(result.contributions) ? result.contributions : [],
        nextCursor: result.nextCursor || null,
        raised: Number(result.raised) || 0,
        backers: Number(result.backers) || 0,
        currency: result.currency || ""
      };
    } catch (e) {
      return null;
    }
  },

  async getPlatformUserCount() {
    const stats = await this._fetchPlatformStats();
    return stats ? stats.total : null;
  },

  // iso is a Country.iso code (e.g. "IN"). Returns null when the platform
  // total itself couldn't be fetched (server unreachable/cold), and 0 when
  // the server answered but genuinely has nobody registered from that
  // country yet — those are different facts and the caller (Coverage)
  // treats them differently.
  async getPlatformUserCountByCountry(iso) {
    const stats = await this._fetchPlatformStats();
    if (!stats) return null;
    const code = String(iso || "").toUpperCase();
    return stats.byCountry[code] ?? 0;
  },

  // --- Product catalogue -------------------------------------------------

  // GET /api/products/:product → { live, services } — the "Our Services"
  // rows and whether the product works at all, both editable in the
  // database rather than shipped in this bundle.
  //
  // Returns null when the server can't answer. The caller falls back to
  // the bundled table (see PRODUCT_SERVICES in CapabilityState.js): Render
  // sleeps and takes 20-50s to wake, and a services list that renders
  // nothing during that is worse than one showing a slightly stale status.
  // The rows come back already downgraded for a product that isn't live,
  // so the fallback path and this one agree without the screen re-deriving
  // anything.
  async getProduct(product) {
    try {
      const result = await gloobalApiClient.get(`/api/products/${encodeURIComponent(product)}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || !Array.isArray(result.services) || result.services.length === 0) return null;
      return {
        live: Boolean(result.live),
        services: result.services.map((row) => ({
          label: String(row.label || ""),
          status: row.status === "live" ? "live" : "planned",
          note: String(row.note || "")
        })).filter((row) => row.label)
      };
    } catch (e) {
      return null;
    }
  },

  // --- Product interest ("I am IN") -------------------------------------
  //
  // What the Gloobal Bank and Gloobal Coin screens are for. `product` is
  // "bank" | "coin".

  // POST /api/interest — idempotent server-side, so the caller does not
  // have to check first. Returns the fresh counts, which is why the screen
  // can update its own figure without a second read.
  async registerInterest(symbolId, product) {
    const result = await gloobalApiClient.post(
      "/api/interest",
      { symbolId, product },
      { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
    );
    return {
      registered: Boolean(result && result.registered),
      alreadyRegistered: Boolean(result && result.alreadyRegistered),
      total: Number(result && result.total) || 0,
      totalUsers: Number(result && result.totalUsers) || 0
    };
  },

  // GET /api/interest/:product → { total, totalUsers }, both counted.
  // Returns null rather than zeroes when the answer can't be had: a cold
  // start is not evidence that nobody is interested, and printing 0 for it
  // would be the same class of invention as the hardcoded figures this
  // replaced.
  async getInterest(product) {
    try {
      const result = await gloobalApiClient.get(`/api/interest/${encodeURIComponent(product)}`, {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result) return null;
      const total = Number(result.total);
      const totalUsers = Number(result.totalUsers);
      if (!Number.isFinite(total) || !Number.isFinite(totalUsers)) return null;
      return { total, totalUsers };
    } catch (e) {
      return null;
    }
  },

  // GET /api/interest/status/:symbolId → ["bank", "coin"]. Read on reaching
  // the dashboard so "You're on the list" is restored from the server
  // rather than forgotten every reload. An empty array on failure, because
  // the screens treat it as "not yet on the list", which is the state a
  // person can act on — the POST is idempotent, so a wrongly-offered
  // button costs nothing.
  async getInterestStatus(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/interest/status/${encodeURIComponent(symbolId)}`);
      return Array.isArray(result && result.products) ? result.products : [];
    } catch (e) {
      return [];
    }
  },

  // GET /api/referrals/:symbolId — Gloobal IDs and join dates only; the
  // backend deliberately returns no contact details.
  async getReferrals(symbolId) {
    const result = await gloobalApiClient.get(`/api/referrals/${encodeURIComponent(symbolId)}`);
    return Array.isArray(result.referrals) ? result.referrals : [];
  },

  // The whole referral picture: the people (with what each has brought in),
  // how big the network is three levels deep, and the earnings totals —
  // { referrals, network: { level1, level2, level3 }, earnings: { currency,
  // total, today, held, byLevel, rates } }.
  async getReferralNetwork(symbolId) {
    const result = await gloobalApiClient.get(`/api/referrals/${encodeURIComponent(symbolId)}`);
    return {
      referrals: Array.isArray(result && result.referrals) ? result.referrals : [],
      network: (result && result.network) || { level1: 0, level2: 0, level3: 0 },
      earnings: (result && result.earnings) || null
    };
  },

  // POST /api/referrals/settle — pays every held referral reward into the
  // balance. Throws with the server's sentence on a refusal.
  async settleReferrals(symbolId) {
    return gloobalApiClient.post("/api/referrals/settle", { symbolId });
  },

  // A short invite code (from a /r/<code> link) → the inviter's Gloobal ID.
  async resolveReferralCode(code) {
    try {
      const result = await gloobalApiClient.get(`/api/referrals/code/${encodeURIComponent(code)}`, { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS });
      return (result && result.symbolId) || null;
    } catch (e) {
      return null;
    }
  },

  // During sign-up, once the number's OTP has passed: the name behind a
  // referral Gloobal ID. { exists, name } or null when it cannot tell.
  async previewReferrer(mobileNumber, symbolId) {
    try {
      return await gloobalApiClient.post("/api/referrals/preview", { mobileNumber, symbolId }, { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS });
    } catch (err) {
      if (err && err.status === 404) return { exists: false, name: "" };
      return null;
    }
  },

  // --- My Assets and PayLater -------------------------------------------
  //
  // Both of these routes have existed on the backend the whole time and
  // nothing in this client ever called them. That is the entire reason My
  // Assets and PayLater history "reset on every re-login": the screens are
  // projections of the LOCAL in-memory ledger (see useEssentialsGrants /
  // usePaylaterHistory), which is rebuilt from nothing on every page load,
  // and no read ever restored what the server already holds. Nothing was
  // being lost — it was simply never being fetched.
  //
  // Both fail soft, the same way getInterestStatus does: a null return means
  // "could not read", which callers must treat differently from a genuinely
  // empty account. Returning zeroes on a failed read here would be the same
  // class of invention as the local opening float that made the dashboard
  // show a balance the server did not share.

  // GET /api/assets/:symbolId — every seed this account holds, plus the four
  // lifetime totals. `seeds` carries computeSeed's shape: { id, business,
  // category, amountPaid, cashbackRate, cashback, currentValue,
  // interestAccrued, interestClaimed, interestAvailable, yearsAccrued,
  // plantedAt, currency }.
  //
  // Note for whoever maps these into the local ledger: the server reports
  // `yearsAccrued`, while the local EssentialsGrant entity and
  // computePaylaterAvailable both work in `monthsAccrued`. They are the same
  // quantity in different units and must be converted at the boundary, not
  // read across as though they were interchangeable.
  async getAssets(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/assets/${encodeURIComponent(symbolId)}`);
      if (!result) return null;
      return {
        seeds: Array.isArray(result.seeds) ? result.seeds : [],
        totalCashbackEarned: Number(result.totalCashbackEarned) || 0,
        totalInterestAccrued: Number(result.totalInterestAccrued) || 0,
        totalInterestAvailable: Number(result.totalInterestAvailable) || 0,
        totalInterestClaimed: Number(result.totalInterestClaimed) || 0,
        // ── WHAT IS ACTUALLY WAITING HERE ────────────────────────────
        //
        // totalCashbackEarned above is a LIFETIME figure across both
        // generations of seed and is not spendable in itself: part of it
        // sits in custody waiting to be claimed, and part of it — every
        // seed planted before Creator Shares were held — is already in the
        // account's real balance.
        //
        // These three say which is which, so a screen never has to guess.
        // `totalClaimable` is the one a Claim control should read: the
        // server computes it from the same seeds the claim route pays out,
        // so the button and the payout cannot disagree.
        totalPrincipalHeld: Number(result.totalPrincipalHeld) || 0,
        totalPrincipalAvailable: Number(result.totalPrincipalAvailable) || 0,
        totalPrincipalClaimed: Number(result.totalPrincipalClaimed) || 0,
        totalClaimable: Number(result.totalClaimable) || 0
      };
    } catch (e) {
      return null;
    }
  },

  // GET /api/assets/paylater/:symbolId — the account's real PayLater
  // position, computed server-side from its seeds and its actual PayLater
  // transactions, plus up to 50 recent rows.
  //
  // `transactions` rows are { id, type: "charge" | "repayment" | "credit",
  // amount, description, createdAt } — NOT the local history shape, which
  // uses { direction: "out" | "in", status: "pending" | ..., amount }. A
  // mapper has to translate; the two are not the same records seen twice.
  //
  // `pendingDues` is the figure computePaylaterAvailable already accepts as
  // its `realPaylaterDue` override, which exists precisely so the server's
  // number can replace the records-summed one that never saw settlements.
  async getPaylater(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/assets/paylater/${encodeURIComponent(symbolId)}`);
      if (!result) return null;
      return {
        limit: Number(result.limit) || 0,
        available: Number(result.available) || 0,
        pendingDues: Number(result.pendingDues) || 0,
        transactions: Array.isArray(result.transactions) ? result.transactions : []
      };
    } catch (e) {
      return null;
    }
  },

  // POST /api/assets/settle — "Settle to GLOOBAL Bank": pays out what the
  // open seeds hold, closes them, and records the settlement. My Assets
  // starts again from zero. Throws with the server's own sentence on a
  // refusal so the screen can show it; nothing moves on a failure.
  async settleAssets(symbolId) {
    const result = await gloobalApiClient.post("/api/assets/settle", { symbolId });
    return {
      settlement: (result && result.settlement) || null,
      newBalance: result && Number.isFinite(Number(result.newBalance)) ? Number(result.newBalance) : null
    };
  },

  // GET /api/assets/settlements/:symbolId — every settlement, newest first:
  // { id, amount, principal, interest, currency, seedCount, spent, from,
  // to, at }. Null on a failed read, [] on none.
  // --- GLOOBAL Bank: opening the account (server/lib/bank.js) ------------
  //
  // The account number is the GLOOBAL ID, so none of these hands one back
  // that is anything else. `getBank` answers null when the server could not
  // be asked — a different thing from status "none", which is a real answer.
  async getBank(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/bank/${encodeURIComponent(symbolId)}`);
      return (result && result.bank) || null;
    } catch (e) {
      return null;
    }
  },
  async saveBankDraft(symbolId, patch) {
    const result = await gloobalApiClient.put("/api/bank/draft", { symbolId, ...patch });
    return (result && result.bank) || null;
  },
  async submitBankId(symbolId, payload) {
    return gloobalApiClient.post("/api/bank/id", { symbolId, ...payload });
  },
  async verifyBankOtp(symbolId, otp) {
    return gloobalApiClient.post("/api/bank/id/verify", { symbolId, otp });
  },
  async saveBankSelfie(symbolId, skipped = false) {
    const result = await gloobalApiClient.post("/api/bank/selfie", { symbolId, skipped });
    return (result && result.bank) || null;
  },
  async openBank(symbolId, pin, declarations) {
    const result = await gloobalApiClient.post("/api/bank/open", { symbolId, pin, declarations });
    return (result && result.bank) || null;
  },

  async getAssetSettlements(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/assets/settlements/${encodeURIComponent(symbolId)}`);
      return Array.isArray(result && result.settlements) ? result.settlements : [];
    } catch (e) {
      return null;
    }
  },

  // --- Transactions -----------------------------------------------------

  // POST /api/transactions/send — PIN-verified server-side. The whole
  // receipt comes back, not just the record: the sender's new balance, the
  // cashback withheld and any seed planted sit alongside `transaction`.
  async sendTransaction(payload) {
    const key = `send:${payload.senderSymbolId}`;
    gloobalRateCheck(key);
    const result = await gloobalApiClient.post("/api/transactions/send", payload);
    gloobalRateClear(key);
    // shareTransaction is the SECOND leg the server mints for the Creator
    // Share — its own Transaction row, with its own unique referenceId, and
    // metadata.paymentReferenceId pointing back at the payment (see
    // mintShareLegAndReceipts in lib/merchantShareFlow.js). The server has
    // been returning it all along and this client discarded it, which is
    // exactly why the share receipt showed the PAYMENT's id: nothing here
    // ever read the share's own.
    //
    // Normalised to null rather than {} when absent — a payee with a 0%
    // share rate legitimately has no share leg, and an empty object would
    // read as "there is one, with no id".
    return Object.assign({}, result, {
      transaction: result.transaction || {},
      shareTransaction: result.shareTransaction || null
    });
  },

  // GET /api/transactions/history/:symbolId — a per-viewer projection:
  // `direction` and `counterparty` are computed relative to the symbolId
  // requested.
  async getHistory(symbolId) {
    const result = await gloobalApiClient.get(`/api/transactions/history/${encodeURIComponent(symbolId)}`);
    return Array.isArray(result.transactions) ? result.transactions : [];
  },

  // --- My Choices -------------------------------------------------------
  //
  // All six are scoped by the bearer token, so none of them takes a Gloobal
  // ID. None is on the money path: a category is a label and a tag is one
  // account's label on one payment, written AFTER a payment has committed.
  // A failed call here leaves a correct, untagged payment.

  // GET /api/categories — every choice plus its own totals, in one call.
  // `monthStart` is the viewer's own month boundary; the server falls back
  // to UTC without it, which is a day out for half the world near the turn
  // of a month.
  async getCategories(monthStart) {
    const query = monthStart ? `?monthStart=${encodeURIComponent(monthStart)}` : "";
    const result = await gloobalApiClient.get(`/api/categories${query}`);
    return {
      categories: Array.isArray(result.categories) ? result.categories : [],
      monthStart: result.monthStart || null
    };
  },

  // GET /api/categories/tags — reference id -> category, for the rows the
  // app has already loaded. Not a transaction list: the history projection
  // is per viewer and already correct, and a second one here would drift.
  async getCategoryTags(limit) {
    const query = Number(limit) > 0 ? `?limit=${Math.floor(Number(limit))}` : "";
    const result = await gloobalApiClient.get(`/api/categories/tags${query}`);
    return Array.isArray(result.tags) ? result.tags : [];
  },

  async createCategory(payload) {
    const result = await gloobalApiClient.post("/api/categories", payload || {});
    return result.category || null;
  },

  async updateCategory(id, payload) {
    const result = await gloobalApiClient.patch(`/api/categories/${encodeURIComponent(id)}`, payload || {});
    return result.category || null;
  },

  // Archives rather than deletes when the category has ever been used —
  // the response says which happened, because "removed" and "retired" are
  // different things to tell somebody.
  async removeCategory(id) {
    const result = await gloobalApiClient.delete(`/api/categories/${encodeURIComponent(id)}`);
    return { archived: Boolean(result.archived), tagged: Number(result.tagged) || 0 };
  },

  // PUT, not POST: filing the same payment twice is one row updated, not
  // two rows written, and the server's unique index on
  // { userId, transactionId } is what guarantees that under a retry.
  //
  // `alsoFiled` is the other side of a connected category: when the
  // category this was filed under is linked to the person who was paid,
  // the server writes their copy too and says so. Returned rather than
  // swallowed because it is the only visible evidence that connecting did
  // anything — without it, the feature works and looks like it did not.
  async tagTransaction(referenceId, categoryId) {
    const result = await gloobalApiClient.put(
      `/api/transactions/${encodeURIComponent(referenceId)}/tag`,
      { categoryId }
    );
    if (!result || !result.tag) return null;
    return Object.assign({}, result.tag, { alsoFiled: result.alsoFiled || null });
  },

  // ── CONNECTED CATEGORIES ──────────────────────────────────────────────
  //
  // See server/models/CategoryLink.js. A link is a standing agreement that
  // a payment filed under one person's category also files itself under
  // another person's, each side named by its own owner.

  // POST /api/categories/:id/links — invite a Gloobal ID onto my category.
  async connectCategory(categoryId, symbolId) {
    const result = await gloobalApiClient.post(
      `/api/categories/${encodeURIComponent(categoryId)}/links`,
      { symbolId }
    );
    return result.link || null;
  },

  // ── Complaints (a wrong payment, between the two people it concerns) ──
  //
  // Every call answers { complaint } / [complaints] or { error } with the
  // server's own words, so a screen can say exactly why it was refused.
  async raiseComplaint({ txnId, reason, note }) {
    try {
      const result = await gloobalApiClient.post("/api/complaints", { txnId, reason, note: note || "" });
      return (result && result.complaint) || { error: "Couldn't raise the complaint just now. Try again." };
    } catch (err) {
      return { error: err && err.status > 0 && err.message ? err.message : "Couldn't raise the complaint just now. Try again." };
    }
  },
  async getComplaints() {
    const result = await gloobalApiClient.get("/api/complaints");
    return Array.isArray(result && result.complaints) ? result.complaints : [];
  },
  async getComplaint(id) {
    const result = await gloobalApiClient.get(`/api/complaints/${encodeURIComponent(id)}`);
    return (result && result.complaint) || null;
  },
  async complaintAction(id, action, body) {
    try {
      const path = action === "message" ? "messages" : action;
      const result = await gloobalApiClient.post(`/api/complaints/${encodeURIComponent(id)}/${path}`, body || {});
      return (result && result.complaint) || { error: "Couldn't update the complaint just now." };
    } catch (err) {
      return { error: err && err.status > 0 && err.message ? err.message : "Couldn't reach GLOOBAL just now. Try again." };
    }
  },

  // GET /api/category-links — every connection I am either side of, as
  // one list. `role` says which side I am on; nothing in a row carries
  // the other person's figures.
  async getCategoryLinks() {
    const result = await gloobalApiClient.get("/api/category-links");
    return Array.isArray(result.links) ? result.links : [];
  },

  // POST /api/category-links/:id/accept — take it, under a name of my own.
  // The category comes into existence here, owned by me.
  async acceptCategoryLink(id, name, icon) {
    const result = await gloobalApiClient.post(
      `/api/category-links/${encodeURIComponent(id)}/accept`,
      { name, icon: icon || "" }
    );
    return { link: result.link || null, category: result.category || null };
  },

  async declineCategoryLink(id) {
    await gloobalApiClient.post(`/api/category-links/${encodeURIComponent(id)}/decline`, {});
    return true;
  },

  // Either side may end it, and neither needs the other's agreement.
  // Payments already filed keep their labels.
  async endCategoryLink(id) {
    await gloobalApiClient.delete(`/api/category-links/${encodeURIComponent(id)}`);
    return true;
  },

  // A picture instead of an icon. The client downscales and re-encodes to
  // JPEG before this is called — the server accepts only JPEG or PNG and
  // caps what it stores, so sending a phone photo straight from the
  // camera would simply be refused.
  async setCategoryPhoto(id, dataUrl) {
    const result = await gloobalApiClient.put(`/api/categories/${encodeURIComponent(id)}/photo`, { photo: dataUrl });
    return result.photo || null;
  },

  async removeCategoryPhoto(id) {
    const result = await gloobalApiClient.delete(`/api/categories/${encodeURIComponent(id)}/photo`);
    return Boolean(result.removed);
  },

  async untagTransaction(referenceId) {
    const result = await gloobalApiClient.delete(`/api/transactions/${encodeURIComponent(referenceId)}/tag`);
    return Boolean(result.removed);
  },

  // GET /api/transactions/:symbolId — the same projection plus lifetime
  // totals, in one call, so the balance card's PAID and RECEIVED figures
  // can never be built from three different reads of the ledger.
  // Platform-wide Creator Share distribution — counts per bucket, nothing
  // else. Returns null when the server cannot be reached, so the caller can
  // fall back to the single-account view rather than draw invented bars.
  async getCreatorShareDistribution() {
    try {
      const result = await gloobalApiClient.get("/api/creator-share/distribution");
      if (!result || !Array.isArray(result.buckets)) return null;
      return {
        totalUsers: Number(result.totalUsers) || 0,
        buckets: result.buckets.map((b) => ({
          from: Number(b.from) || 0,
          to: Number(b.to) || 0,
          users: Number(b.users) || 0,
          pct: Number(b.pct) || 0
        }))
      };
    } catch (e) {
      return null;
    }
  },

  async getTransactionSummary(symbolId, type) {
    const result = await gloobalApiClient.get(
      `/api/transactions/${encodeURIComponent(symbolId)}?type=${encodeURIComponent(type || "all")}`
    );
    return {
      transactions: Array.isArray(result.transactions) ? result.transactions : [],
      totalSent: Number(result.totalSent) || 0,
      totalReceived: Number(result.totalReceived) || 0
    };
  },

  // --- Gloobal Coin -----------------------------------------------------
  //
  // Fully backed: a coin exists only because the same amount of prototype fiat
  // was moved into the reserve, and redeeming hands it back. The server holds
  // the balances and the reserve; these are the four calls that move them.
  //
  // Every one of them returns the account's post-operation figures, which is
  // what lets the caller reconcile the local ledger from the response instead
  // of issuing a second read that could disagree with what just happened.

  // GET /api/coin/:symbolId — this account's coin position and the supply it
  // sits inside.
  async getCoin(symbolId) {
    const result = await gloobalApiClient.get(`/api/coin/${encodeURIComponent(symbolId)}`);
    return {
      coinBalance: Number(result.coinBalance) || 0,
      balance: Number(result.balance) || 0,
      reserve: Number(result.reserve) || 0,
      issued: Number(result.issued) || 0,
      coinCurrency: result.coinCurrency || COIN_CURRENCY,
      reserveCurrency: result.reserveCurrency || "INR",
      accountCurrency: result.accountCurrency || null,
      // How many coin one unit of this account's own currency buys. NOT
      // `Number(x) || 0` and NOT defaulted to 1: the server sends null when
      // it could not get a rate, 1 is the specific wrong answer that reads as
      // a right one, and the screen renders null as ∆.
      geuPerAccountUnit: result.geuPerAccountUnit === null || result.geuPerAccountUnit === undefined
        ? null
        : Number(result.geuPerAccountUnit),
      geuRateSource: result.geuRateSource || null
    };
  },

  // GET /api/coin/supply — public, and the only honest source for the claim
  // that the coin is backed. `backed` is the server comparing three
  // independently maintained figures, not a constant.
  //
  // Returns null rather than a zeroed object when the read fails: 0 issued
  // against 0 reserve is a real and valid state (nobody has minted yet), so a
  // failure that rendered as one would be indistinguishable from the truth.
  async getCoinSupply() {
    try {
      const result = await gloobalApiClient.get("/api/coin/supply", {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || typeof result.backed !== "boolean") return null;
      return {
        reserve: Number(result.reserve) || 0,
        issued: Number(result.issued) || 0,
        heldByAccounts: Number(result.heldByAccounts) || 0,
        holders: Number(result.holders) || 0,
        backed: result.backed === true,
        coinCurrency: result.coinCurrency || COIN_CURRENCY,
        reserveCurrency: result.reserveCurrency || "INR"
      };
    } catch (err) {
      return null;
    }
  },

  // GET /api/coin/holders — the coin's holders grouped by country, each
  // country's holding converted into that country's own currency.
  //
  // Returns null on failure for the same reason getCoinSupply does: an empty
  // country list is a real state (nobody holds coin yet), so a failure that
  // rendered as one would be indistinguishable from the truth.
  //
  // `held` and `localHeld` are each null-or-number by design — the server
  // withholds a single holder's amount, and reports a country whose exchange
  // rate it could not fetch as ∆ rather than as zero. `Number(x) || 0` would
  // flatten both of those into a confident 0, so neither is coerced here.
  async getCoinHolders() {
    try {
      const result = await gloobalApiClient.get("/api/coin/holders", {
        timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS
      });
      if (!result || !Array.isArray(result.countries)) return null;
      const num = (v) => (v === null || v === undefined ? null : Number(v));
      return {
        reserveCurrency: result.reserveCurrency || "INR",
        totalHolders: Number(result.totalHolders) || 0,
        heldByAccounts: Number(result.heldByAccounts) || 0,
        issued: Number(result.issued) || 0,
        withheld: Number(result.withheld) || 0,
        withheldCountries: Number(result.withheldCountries) || 0,
        minHoldersForAmount: Number(result.minHoldersForAmount) || 0,
        countries: result.countries.map((c) => ({
          countryIso: c.countryIso || null,
          holders: Number(c.holders) || 0,
          held: num(c.held),
          localCurrency: c.localCurrency || null,
          localHeld: num(c.localHeld)
        }))
      };
    } catch (err) {
      return null;
    }
  },

  // GET /api/coin/holders/:countryIso — the individual holders in one country.
  //
  // Signed-in only, unlike the country totals: an aggregate is safe to hand
  // to anyone, a list of who holds what is not something to leave open to
  // unauthenticated scraping even when each row is publishable on its own.
  //
  // null on failure, for the same reason every other coin read here returns
  // null: an empty holder list is a real state and a failure must not be
  // able to imitate it.
  async getCountryHolders(countryIso) {
    try {
      const result = await gloobalApiClient.get(
        `/api/coin/holders/${encodeURIComponent(String(countryIso || "").toUpperCase())}`
      );
      if (!result || !Array.isArray(result.rows)) return null;
      return {
        countryIso: result.countryIso || null,
        reserveCurrency: result.reserveCurrency || "INR",
        localCurrency: result.localCurrency || null,
        holders: Number(result.holders) || 0,
        held: Number(result.held) || 0,
        truncated: result.truncated === true,
        rows: result.rows.map((r) => ({
          symbolId: r.symbolId || null,
          held: Number(r.held) || 0,
          // null means "no rate", which is not zero — see getCoinHolders.
          localHeld: r.localHeld === null || r.localHeld === undefined ? null : Number(r.localHeld)
        }))
      };
    } catch (err) {
      return null;
    }
  },

  // GET /api/coin/:symbolId/history — coin movements that survive a reload.
  //
  // The in-browser ledger this replaces is an array in memory, so Coin
  // Activity emptied itself every time the tab was refreshed. That was
  // tolerable for a list and not tolerable for a receipt: a receipt you
  // cannot reopen tomorrow is a confirmation message.
  //
  // null, not [], when the server cannot answer — the same distinction every
  // other reader in this file keeps, because "we could not ask" and "there
  // is nothing" render differently and only one of them is a fact about the
  // account.
  async getCoinHistory(symbolId, options) {
    const opts = options || {};
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.cursor) params.set("cursor", opts.cursor);
    const query = params.toString();
    try {
      const result = await gloobalApiClient.get(
        `/api/coin/${encodeURIComponent(symbolId)}/history${query ? `?${query}` : ""}`,
        { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
      );
      if (!result || !result.success || !Array.isArray(result.rows)) return null;
      return {
        rows: result.rows.map((r) => ({
          id: r.id || null,
          referenceId: r.referenceId || null,
          type: r.type || null,
          direction: r.direction === "in" ? "in" : "out",
          coinAmount: Number(r.coinAmount) || 0,
          coinCurrency: r.coinCurrency || COIN_CURRENCY,
          // null rather than 0 throughout: a send moves no fiat, and 0 would
          // read as "it cost nothing" rather than "no money was involved".
          fiatAmount: Number.isFinite(Number(r.fiatAmount)) ? Number(r.fiatAmount) : null,
          fiatCurrency: r.fiatCurrency || null,
          // The rate this movement converted at. Never today's rate — see the
          // note in historyUtils about a receipt that recomputed its own FX
          // and so showed next year's rate against last year's payment.
          geuRate: Number.isFinite(Number(r.geuRate)) ? Number(r.geuRate) : null,
          geuRateSource: r.geuRateSource || null,
          // "coin-per-fiat" on a buy, "fiat-per-coin" on a sell — the two
          // routes record opposite directions under the same `geuRate` name.
          // Carried through rather than normalised, because normalising means
          // inverting a rounded rate, and the inverse of a rounded rate does
          // not reproduce the amounts sitting beside it on the receipt.
          geuRateBasis: r.geuRateBasis === "coin-per-fiat" || r.geuRateBasis === "fiat-per-coin"
            ? r.geuRateBasis
            : null,
          reserveCurrency: r.reserveCurrency || null,
          note: r.note || "",
          counterpartySymbolId: r.counterpartySymbolId || null,
          counterpartyName: r.counterpartyName || null,
          counterpartyCountryIso: r.counterpartyCountryIso || null,
          createdAt: r.createdAt || null
        })),
        nextCursor: result.nextCursor || null
      };
    } catch (e) {
      return null;
    }
  },

  // POST /api/coin/mint — fiat out of the bank balance, coin in.
  async coinMint(symbolId, amount) {
    const result = await gloobalApiClient.post("/api/coin/mint", { symbolId, amount });
    return {
      minted: Number(result.minted) || 0,
      // What actually left the bank, in this account's currency. Left
      // undefined rather than zeroed when absent, so CoinService falls back
      // to its documented same-currency default instead of posting a fiat
      // leg of 0 against a real coin leg — an unbalanced entry that the
      // journal would reject at the worst possible moment.
      paid: Number.isFinite(Number(result.paid)) ? Number(result.paid) : void 0,
      paidCurrency: result.paidCurrency || null,
      geuRate: Number.isFinite(Number(result.geuRate)) ? Number(result.geuRate) : null,
      balance: Number(result.balance) || 0,
      coinBalance: Number(result.coinBalance) || 0,
      reserve: Number(result.reserve) || 0,
      issued: Number(result.issued) || 0,
      referenceId: result.referenceId || null
    };
  },

  // POST /api/coin/redeem — the exact inverse.
  async coinRedeem(symbolId, amount) {
    const result = await gloobalApiClient.post("/api/coin/redeem", { symbolId, amount });
    return {
      redeemed: Number(result.redeemed) || 0,
      // The fiat that arrived, in this account's currency — the mirror of
      // `paid` on the mint above, and left undefined rather than zeroed for
      // the same reason.
      received: Number.isFinite(Number(result.received)) ? Number(result.received) : void 0,
      receivedCurrency: result.receivedCurrency || null,
      geuRate: Number.isFinite(Number(result.geuRate)) ? Number(result.geuRate) : null,
      balance: Number(result.balance) || 0,
      coinBalance: Number(result.coinBalance) || 0,
      reserve: Number(result.reserve) || 0,
      issued: Number(result.issued) || 0,
      referenceId: result.referenceId || null
    };
  },

  // POST /api/coin/send — coin to another Gloobal ID. PIN-gated, because
  // unlike mint and redeem this one has a counterparty and cannot be undone
  // from this side.
  async coinSend(senderSymbolId, receiverSymbolId, amount, pin, note) {
    const key = `coin-send:${senderSymbolId}`;
    gloobalRateCheck(key);
    const result = await gloobalApiClient.post("/api/coin/send", {
      senderSymbolId,
      receiverSymbolId,
      amount,
      pin,
      note: note || ""
    });
    gloobalRateClear(key);
    return {
      sent: Number(result.sent) || 0,
      coinBalance: Number(result.coinBalance) || 0,
      referenceId: result.referenceId || null,
      receiver: result.receiver || null
    };
  },

  // --- Profile photos ---------------------------------------------------
  //
  // One copy per account, held on the server (ProfilePhoto). Nothing about a
  // photo is ever copied onto a transaction, receipt or notification — the
  // receipt and the scan card read the counterparty's photo through
  // getUserPhoto at the moment they draw it. Face-verification data is a
  // different thing entirely and is not reachable from here.

  // GET /api/users/:symbolId/photo → the account's photo as a data URL, or
  // null when it has none. A 404 (no account under that CURRENT Gloobal ID)
  // is also null: "no photo to show" is the only thing a caller can do with
  // it. Every other failure throws, so a caller that caches can tell "this
  // person has no photo" from "the server could not be asked".
  async getUserPhoto(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/users/${encodeURIComponent(symbolId)}/photo`);
      const photo = result && result.photo;
      return typeof photo === "string" && photo.startsWith("data:image/") ? photo : null;
    } catch (err) {
      if (err instanceof GloobalApiError && err.status === 404) return null;
      throw err;
    }
  },

  // PUT /api/profile/:symbolId/photo — a JPEG/PNG data URL, or null to
  // remove the photo. Only the account itself may set it; the server checks.
  async setProfilePhoto(symbolId, photoDataUrlOrNull) {
    const result = await gloobalApiClient.put(`/api/profile/${encodeURIComponent(symbolId)}/photo`, {
      photo: photoDataUrlOrNull || null
    });
    return { hasPhoto: Boolean(result && result.hasPhoto) };
  },

  // --- The Creator side -------------------------------------------------
  //
  // One account, two sides. These four routes are about how the Creator
  // side presents itself — its mark, its name, its address — and about
  // turning that name back into the account it belongs to.
  //
  // The name is `first.last`, in any script, and it is a PAYMENT ADDRESS:
  // unique across every account, which is why there is an availability
  // check separate from the save.

  // GET /api/creator/handle-available — answered while somebody types.
  //
  // Never trusted as a reservation. "Available" here means "no account
  // held it a moment ago", and two creators typing the same name at the
  // same time are both told yes; the save below is what decides. Any
  // network failure answers "don't know" rather than throwing, because
  // this runs on every keystroke and a dead connection must not make the
  // box turn red.
  // A GPS point, as address parts (line1, area, city, state, pin). Through
  // our own server, which caches and identifies itself to OpenStreetMap —
  // the app's CSP does not let the phone call the lookup directly. Returns
  // null when nothing could be read, so the screen says "type it in".
  // Gloobal बाज़ार: up to ten shops, by the start of a name, a category,
  // and/or Near me ({ lat, lng, radiusKm } — radiusKm one of 0.5/1/2/5/10).
  // Ranked on the server by recent payments; no amounts come back.
  // Returns the shops as an array; `.fuzzy` on it says they were found by
  // a near spelling ("smosa" → samosa) rather than the words typed.
  async bazaarSearch({ q = "", category = "", near = null, country = "", openNow = false, sub = "", cats = [], sort = "", minRating = 0, maxPrice = 0 } = {}) {
    const p = new URLSearchParams();
    if (openNow) p.set("open", "1");
    if (country) p.set("country", country);
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (category && sub) p.set("sub", sub);
    if (!category && Array.isArray(cats) && cats.length) p.set("cats", cats.join(","));
    if (sort && sort !== "paid") p.set("sort", sort);
    if (minRating) p.set("minRating", String(minRating));
    if (q && maxPrice > 0) p.set("maxPrice", String(maxPrice));
    if (near) { p.set("lat", String(near.lat)); p.set("lng", String(near.lng)); p.set("radiusKm", String(near.radiusKm)); }
    const result = await gloobalApiClient.get(`/api/bazaar?${p.toString()}`);
    const shops = Array.isArray(result && result.shops) ? result.shops : [];
    shops.fuzzy = Boolean(result && result.fuzzy);
    return shops;
  },

  // What to offer while somebody types: shops, item names, categories.
  async bazaarSuggest(q, country = "") {
    const p = new URLSearchParams();
    p.set("q", q);
    if (country) p.set("country", country);
    try {
      const r = await gloobalApiClient.get(`/api/bazaar/suggest?${p.toString()}`);
      return {
        shops: Array.isArray(r && r.shops) ? r.shops : [],
        items: Array.isArray(r && r.items) ? r.items : [],
        categories: Array.isArray(r && r.categories) ? r.categories : []
      };
    } catch (e) {
      return { shops: [], items: [], categories: [] };
    }
  },

  async bazaarCategories(near = null, country = "") {
    const p = new URLSearchParams();
    if (country) p.set("country", country);
    if (near) { p.set("lat", String(near.lat)); p.set("lng", String(near.lng)); p.set("radiusKm", String(near.radiusKm)); }
    const result = await gloobalApiClient.get(`/api/bazaar/categories?${p.toString()}`);
    return Array.isArray(result && result.categories) ? result.categories : [];
  },

  // Counts a view, a scan or an item tap for the shop's owner. Fire and
  // forget: a count that does not land is never worth an error.
  creatorEvent(symbolId, type, itemId) {
    if (!symbolId) return;
    gloobalApiClient.post(`/api/creator/${encodeURIComponent(symbolId)}/events`, itemId ? { type, itemId } : { type }).catch(() => {});
  },

  // The owner's own last seven days. Only the owner can read it.
  async getCreatorInsights(symbolId) {
    return gloobalApiClient.get(`/api/creator/${encodeURIComponent(symbolId)}/insights`);
  },

  async geoReverse(lat, lng) {
    try {
      const result = await gloobalApiClient.get(`/api/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      return (result && result.parts) || null;
    } catch (e) {
      return null;
    }
  },

  // An Indian PIN, as { city, state, areas }. null for an unknown PIN or a
  // failed lookup — the boxes stay as typed either way.
  async geoPin(pin) {
    try {
      const result = await gloobalApiClient.get(`/api/geo/pin/${encodeURIComponent(pin)}`);
      return result && result.city !== undefined ? result : null;
    } catch (e) {
      return null;
    }
  },

  async creatorHandleAvailable(first, last) {
    try {
      const result = await gloobalApiClient.get(
        `/api/creator/handle-available?first=${encodeURIComponent(first || "")}&last=${encodeURIComponent(last || "")}`
      );
      // ── AN ANSWER THAT IS NOT AN ANSWER IS "DON'T KNOW" ────────────
      //
      // `available` has to be a real boolean. Reading it as
      // Boolean(result && result.available) turned every reply that did
      // not carry the field — an old server, a proxy's own 200, a
      // route that is not deployed yet — into `false`, which the setup
      // screen paints as "That name is taken."
      //
      // Found by rendering: the test harness's fake API answers unknown
      // routes with a bare success, and the screen told me `rasoi.ghar`
      // was taken on a server with no creators on it at all. Telling
      // somebody their name is taken when the truth is that nobody
      // asked is the worst of the three states to guess at.
      if (!result || typeof result.available !== "boolean") {
        return { known: false, handle: "", available: false, message: "" };
      }
      return {
        known: true,
        handle: typeof result.handle === "string" ? result.handle : "",
        available: result.available,
        // "Taken" and "not a usable name" are different answers and the
        // box has to say which. The route sends a `code` for the second
        // (invalid_handle, mixed_scripts) and none for the first, so a
        // name refused for mixing alphabets does not read as one
        // somebody else already holds.
        code: typeof result.code === "string" ? result.code : "",
        message: typeof result.message === "string" ? result.message : ""
      };
    } catch (err) {
      return { known: false, handle: "", available: false, message: "" };
    }
  },

  // GET /api/creator/:symbolId/profile — the creator as the viewer may see
  // them. The owner gets their own address back whether or not it is
  // public; anybody else gets it only if they published it.
  async getCreatorProfile(symbolId) {
    try {
      const result = await gloobalApiClient.get(`/api/creator/${encodeURIComponent(symbolId)}/profile`);
      return (result && result.creator) || null;
    } catch (err) {
      if (err instanceof GloobalApiError && err.status === 404) return null;
      throw err;
    }
  },

  // PUT /api/creator/:symbolId/profile — save any subset.
  //
  // The handle is all-or-nothing: send both halves or neither. `skipped:
  // true` records that the setup screen was dismissed unfinished, which is
  // what lets the Creator dashboard keep offering it without putting the
  // whole screen back in the way every time.
  async saveCreatorProfile(symbolId, patch) {
    const result = await gloobalApiClient.put(
      `/api/creator/${encodeURIComponent(symbolId)}/profile`,
      patch || {}
    );
    return (result && result.creator) || null;
  },

  // GET /api/creator/resolve/:handle — a name, turned into an account.
  // This is what makes the handle a payment address rather than a label.
  async resolveCreatorHandle(handle) {
    try {
      const result = await gloobalApiClient.get(`/api/creator/resolve/${encodeURIComponent(handle)}`);
      return (result && result.creator) || null;
    } catch (err) {
      if (err instanceof GloobalApiError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  },

  // --- A creator's two lists --------------------------------------------
  //
  // What they sell, which anybody may read, and who they buy from, which
  // only they may. The server enforces that split; these are the calls.

  async getCreatorItems(symbolId) {
    const result = await gloobalApiClient.get(`/api/creator/${encodeURIComponent(symbolId)}/items`);
    return Array.isArray(result && result.items) ? result.items : [];
  },

  // The whole list in one request. The client already holds every item to
  // draw them, and reordering is the common edit — one call that states the
  // final shape cannot leave the order half-applied.
  // `current` is the list as last read from the server. Any photo in
  // `items` that is byte-for-byte one of those is sent as "ref:<id>:<n>"
  // rather than uploaded again, so a save carries only what is new — see
  // the route for why that matters on a phone.
  async saveCreatorItems(symbolId, items, current) {
    const result = await gloobalApiClient.put(
      `/api/creator/${encodeURIComponent(symbolId)}/items`,
      { items: creatorItemsWithRefs(Array.isArray(items) ? items : [], current) }
    );
    return Array.isArray(result && result.items) ? result.items : [];
  },

  async getCreatorSuppliers(symbolId) {
    const result = await gloobalApiClient.get(`/api/creator/${encodeURIComponent(symbolId)}/suppliers`);
    return Array.isArray(result && result.suppliers) ? result.suppliers : [];
  },

  // Added by NAME, because the point of a supplier is the list behind them
  // and only a creator has one. Returns null when the name resolves to
  // nobody, so the caller can say so rather than storing a dead row.
  async addCreatorSupplier(symbolId, handle) {
    try {
      const result = await gloobalApiClient.post(
        `/api/creator/${encodeURIComponent(symbolId)}/suppliers`,
        { handle }
      );
      return (result && result.supplier) || null;
    } catch (err) {
      if (err instanceof GloobalApiError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  },

  async removeCreatorSupplier(symbolId, supplierSymbolId) {
    await gloobalApiClient.delete(
      `/api/creator/${encodeURIComponent(symbolId)}/suppliers/${encodeURIComponent(supplierSymbolId)}`
    );
    return true;
  },

  async getCreatorPurchases(symbolId) {
    const result = await gloobalApiClient.get(`/api/creator/${encodeURIComponent(symbolId)}/purchases`);
    return Array.isArray(result && result.purchases) ? result.purchases : [];
  },

  // Written AFTER the payment succeeds, never before: a line must not exist
  // for money that did not move. A failure here costs a book-keeping row,
  // not the payment, so callers log it and carry on.
  async recordCreatorPurchase(symbolId, { supplierSymbolId, supplierHandle, lines, transactionRef }) {
    const result = await gloobalApiClient.post(
      `/api/creator/${encodeURIComponent(symbolId)}/purchases`,
      { supplierSymbolId, supplierHandle, lines, transactionRef }
    );
    return Number(result && result.written) || 0;
  },

  // --- How a shop looks -------------------------------------------------
  //
  // Theme, colour, type, corners, cards, density, photo shape, tagline and
  // the announcement bar. Merged server-side over what is stored, so a
  // screen that saves one field cannot blank another.

  // A shop's public reviews: the summary, the newest sixty, your own if
  // you wrote one, and whether you may write one (only people who have
  // paid the shop can). Anonymous to every reader, the owner included.
  async getCreatorReviews(symbolId) {
    return gloobalApiClient.get(`/api/creator/${encodeURIComponent(symbolId)}/reviews`);
  },

  // Writes or replaces YOUR review of this shop — one per person.
  async saveCreatorReview(symbolId, { stars, text }) {
    return gloobalApiClient.put(`/api/creator/${encodeURIComponent(symbolId)}/reviews`, { stars, text });
  },

  async deleteMyCreatorReview(symbolId) {
    return gloobalApiClient.delete(`/api/creator/${encodeURIComponent(symbolId)}/reviews/mine`);
  },

  async saveCreatorShop(symbolId, shop) {
    const result = await gloobalApiClient.put(
      `/api/creator/${encodeURIComponent(symbolId)}/shop`,
      shop && typeof shop === "object" ? shop : {}
    );
    return (result && result.shop) || null;
  },

  // A photo, a crop position, or a removal. `focusY` alone is valid and is
  // the cheap path: nudging the crop must not re-upload the photo.
  async saveCreatorCover(symbolId, { photo, focusY, remove } = {}) {
    const body = {};
    if (remove) body.remove = true;
    if (typeof photo === "string" && photo) body.photo = photo;
    if (Number.isFinite(Number(focusY))) body.focusY = Number(focusY);
    const result = await gloobalApiClient.put(
      `/api/creator/${encodeURIComponent(symbolId)}/cover`,
      body
    );
    return (result && result.cover) || null;
  },

  // --- Notifications ----------------------------------------------------
  //
  // Server-held, per account, created by the payment route after a transfer
  // commits. Every one of these is scoped by the bearer token, so none of
  // them takes a Gloobal ID.

  // GET /api/notifications?limit=&before= — newest first.
  async getNotifications({ limit, before } = {}) {
    const params = [];
    if (limit !== undefined && limit !== null) params.push(`limit=${encodeURIComponent(limit)}`);
    if (before) params.push(`before=${encodeURIComponent(before instanceof Date ? before.toISOString() : before)}`);
    const result = await gloobalApiClient.get(`/api/notifications${params.length ? `?${params.join("&")}` : ""}`);
    return {
      notifications: Array.isArray(result && result.notifications) ? result.notifications : [],
      unreadCount: Number(result && result.unreadCount) || 0
    };
  },

  // GET /api/notifications/unread-count → number.
  async getUnreadNotificationCount() {
    const result = await gloobalApiClient.get("/api/notifications/unread-count");
    return Number(result && result.unreadCount) || 0;
  },

  // PATCH /api/notifications/:id/read — idempotent.
  async markNotificationRead(id) {
    const result = await gloobalApiClient.patch(`/api/notifications/${encodeURIComponent(id)}/read`, {});
    return {
      notification: (result && result.notification) || null,
      unreadCount: Number(result && result.unreadCount) || 0
    };
  },

  // POST /api/notifications/read-all.
  async markAllNotificationsRead() {
    const result = await gloobalApiClient.post("/api/notifications/read-all", {});
    return {
      updated: Number(result && result.updated) || 0,
      unreadCount: Number(result && result.unreadCount) || 0
    };
  },

  // --- Web Push ---------------------------------------------------------
  //
  // The same notifications as above, delivered to a device whose app is
  // closed. A PushSubscription belongs to a browser profile, not to a
  // person, so every one of these is scoped by the bearer token and the
  // server stores the row against whichever account that token names —
  // which is why signing out has to unsubscribe before the token dies, and
  // switching accounts has to re-subscribe.
  //
  // `enabled: false` from the server is the normal answer on a deployment
  // with no VAPID keys configured, not an error. Callers treat it as "push
  // is off here" and carry on.

  // GET /api/push/public-key → { enabled, publicKey }.
  async getPushPublicKey() {
    const result = await gloobalApiClient.get("/api/push/public-key");
    return {
      enabled: Boolean(result && result.enabled),
      publicKey: (result && result.publicKey) || null
    };
  },

  // POST /api/push/subscribe — the browser's own subscription JSON
  // ({ endpoint, keys: { p256dh, auth } }), plus whether this device also
  // wants promotional pushes. The user agent is sent so a person can
  // recognise their own devices in a future settings list.
  async savePushSubscription(subscriptionJson, { promotional } = {}) {
    const sub = subscriptionJson || {};
    const body = {
      endpoint: sub.endpoint,
      keys: sub.keys || {},
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : ""
    };
    // `promotional` is sent ONLY when the caller actually expressed a choice.
    //
    // The route treats any boolean as an explicit one and $sets
    // promotionalOptIn from it; only an ABSENT key leaves an existing
    // preference alone (it falls back to $setOnInsert, so a brand-new row is
    // still created opted out). Sending Boolean(promotional) unconditionally
    // therefore sent `false` on every start-up reconcile —
    // gloobalPushSyncOnStart() passes no argument — and silently wiped an
    // opt-in the person had set through the UI, which is exactly what the
    // route's own comment says must not happen.
    if (typeof promotional === "boolean") body.promotional = promotional;
    const result = await gloobalApiClient.post("/api/push/subscribe", body);
    return {
      subscriptionId: (result && result.subscriptionId) || null,
      promotional: Boolean(result && result.promotional)
    };
  },

  // POST /api/push/unsubscribe — drops the server's row for this endpoint.
  async deletePushSubscription(endpoint) {
    const result = await gloobalApiClient.post("/api/push/unsubscribe", { endpoint: endpoint || "" });
    return { removed: Number(result && result.removed) || 0 };
  },

  // PATCH /api/push/preferences — transactional pushes are not optional
  // (they are the receipt of money moving); only the promotional flag is.
  async setPushPreferences(promotional) {
    const result = await gloobalApiClient.patch("/api/push/preferences", { promotional: Boolean(promotional) });
    return {
      promotional: Boolean(result && result.promotional),
      updated: Number(result && result.updated) || 0
    };
  },

  // GET /api/push/status → { enabled, subscriptions, promotional }.
  async getPushStatus() {
    const result = await gloobalApiClient.get("/api/push/status");
    return {
      enabled: Boolean(result && result.enabled),
      subscriptions: Number(result && result.subscriptions) || 0,
      promotional: Boolean(result && result.promotional)
    };
  },

  // POST /api/push/test — sends a push to the caller's own devices and
  // nobody else's. `removed` counts subscriptions the push service
  // rejected as gone, which the server prunes as it sends.
  async sendTestPush() {
    const result = await gloobalApiClient.post("/api/push/test", {});
    return {
      sent: Number(result && result.sent) || 0,
      removed: Number(result && result.removed) || 0,
      failed: Number(result && result.failed) || 0
    };
  },

  // --- Hooman Score -----------------------------------------------------
  //
  // Per account, scoped by the bearer token. Nothing is saved until the
  // person agrees (setHoomanConsent), and deleteHoomanData removes every
  // answer and the agreement. The score never affects any payment.

  // GET /api/hooman → { consented, score }.
  async getHoomanScore() {
    const result = await gloobalApiClient.get("/api/hooman");
    return { consented: Boolean(result && result.consented), score: (result && result.score) || null };
  },

  // POST /api/hooman/consent — only an explicit yes is sent.
  async setHoomanConsent() {
    const result = await gloobalApiClient.post("/api/hooman/consent", { accept: true });
    return Boolean(result && result.consented);
  },

  // POST /api/hooman/answers — the ANSWER, never its points: the server
  // decides what an answer is worth. → { answer: { points, correct }, score }.
  async saveHoomanAnswer(answer) {
    const result = await gloobalApiClient.post("/api/hooman/answers", answer || {});
    return { answer: (result && result.answer) || null, score: (result && result.score) || null };
  },

  // GET /api/hooman/question — a knowledge question without its answer.
  async getHoomanQuestion(exclude = []) {
    const list = Array.isArray(exclude) ? exclude.filter(Boolean) : [];
    const result = await gloobalApiClient.get(`/api/hooman/question${list.length ? `?exclude=${encodeURIComponent(list.join(","))}` : ""}`);
    return (result && result.question) || null;
  },

  // DELETE /api/hooman — every answer, and the agreement.
  async deleteHoomanData() {
    const result = await gloobalApiClient.delete("/api/hooman");
    return { deleted: Number(result && result.deleted) || 0 };
  },

  // --- Session (local, not server-issued) -------------------------------

  saveSession: gloobalSessionSave,
  loadSession: gloobalSessionLoad,
  clearSession: gloobalSessionClear,
  authToken: gloobalAuthToken,
  saveAuthToken: gloobalAuthTokenSave,
  clearAuthToken: gloobalAuthTokenClear,
  // Whether this device currently holds a credential the backend will accept.
  // Not proof it is still valid — only the server can say that — but enough to
  // tell "never signed in" from "signed in, token may have expired".
  hasAuthToken() {
    return Boolean(gloobalAuthToken());
  }
};
