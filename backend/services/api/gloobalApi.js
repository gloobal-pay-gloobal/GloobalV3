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

  // POST /api/pin/verify — confirms a PIN without logging in.
  async verifyPin(symbolId, pin) {
    const result = await gloobalApiClient.post("/api/pin/verify", { symbolId, pin });
    if (!result || !result.verified) throw new Error((result && result.message) || "That PIN wasn't recognized.");
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
        { timeoutMs: GLOOBAL_API_COLD_START_TIMEOUT_MS }
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
        totalInterestClaimed: Number(result.totalInterestClaimed) || 0
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

  // GET /api/transactions/:symbolId — the same projection plus lifetime
  // totals, in one call, so the balance card's PAID and RECEIVED figures
  // can never be built from three different reads of the ledger.
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
      coinCurrency: result.coinCurrency || "GC",
      reserveCurrency: result.reserveCurrency || "INR"
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
        coinCurrency: result.coinCurrency || "GC",
        reserveCurrency: result.reserveCurrency || "INR"
      };
    } catch (err) {
      return null;
    }
  },

  // POST /api/coin/mint — fiat out of the bank balance, coin in.
  async coinMint(symbolId, amount) {
    const result = await gloobalApiClient.post("/api/coin/mint", { symbolId, amount });
    return {
      minted: Number(result.minted) || 0,
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
