// src/services/api/sessionStore.js
//
// Client-side session persistence. Ported from the original Gloobal
// frontend's services/session.js.
//
// Holds two different things, and the difference matters.
//
// `user` is the identity to re-enter as on the next load — a refresh, a PWA
// relaunch, or the OS restoring a backgrounded tab would otherwise drop the
// person back at the phone screen, which reads as "it logged me out by
// itself". That part is not a credential: anyone can read or edit it in
// devtools, and reaching the dashboard from a restored session still costs a
// PIN or a biometric check.
//
// `token` IS a credential. The backend used to issue none — every route took a
// symbolId out of the request and trusted it — so a Gloobal ID was both a
// public address and the only thing protecting the account. The API now mints
// a signed bearer token in exchange for a real credential (PIN at /api/login,
// a verified OTP at registration, or a WebAuthn assertion), and every route
// that touches an account requires it.
//
// Treat it as a password: it is what an attacker with devtools access to this
// origin would take. It is scoped to this origin by localStorage, cleared on
// sign-out, and expires server-side after seven days.

var GLOOBAL_SESSION_KEY = "gloobal.session.v1";

// A restored session stops being honoured after this long. Someone who has
// not opened the app in a month re-enters through the full phone → OTP flow
// rather than seeing a lock screen for an account they may no longer use.
var GLOOBAL_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1e3;

// localStorage throws in Safari private mode and when storage is disabled,
// so every access is guarded — a storage failure degrades to "no persisted
// session", never a crash.
function gloobalSessionReadRaw() {
  try {
    const raw = window.localStorage.getItem(GLOOBAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function gloobalSessionSave(user, phoneNumber, biometricEnrolled) {
  if (!user || !user.symbolId) return;
  const previous = gloobalSessionReadRaw();
  const previousUser = previous && previous.user;
  // Only inherit from a session belonging to the SAME account. The flag
  // says "this device has a passkey for this account", so carrying it
  // across a change of account is simply wrong: account A enrolling and
  // then account B signing in on the same phone left B claiming an
  // enrolment it does not have, which strands B on a mandatory biometric
  // screen (no skip is offered for an enrolled account) whenever the
  // server check that would correct it is unreachable.
  //
  // Bug fix: "same account" used to mean only "same symbolId" — which
  // breaks the instant the account's OWN Gloobal ID changes (Update
  // Gloobal ID, handleGloobalIdChanged in App.jsx). Going from the old ID
  // to the new one looked, from here, identical to a completely different
  // person signing in: same symptom (symbolId no longer matches), totally
  // different cause. Matching on mobileNumber too — which an ID rename
  // never touches — tells the two apart. See the account-switch notice
  // below for what this distinction actually protects.
  const sameAccount = Boolean(
    previousUser && (
      (previousUser.symbolId && previousUser.symbolId === user.symbolId) ||
      (previousUser.mobileNumber && user.mobileNumber && previousUser.mobileNumber === user.mobileNumber)
    )
  );
  // Was there an ACCOUNT here before this save, as opposed to no account at
  // all? Not the same question as `previous` being non-null: the very first
  // thing a registration or a sign-in writes is the bearer token
  // (gloobalAuthTokenSave, below), which creates a blob holding a token and
  // nothing else. At the moment the session itself is first saved, that blob
  // exists but names nobody.
  //
  // Hoisted up here from the account-switch notice at the end of this
  // function, which has always drawn exactly this distinction and states the
  // reasoning in full. The token now uses the same answer, because the two
  // questions are the same question.
  const hadPreviousAccount = Boolean(previousUser && previousUser.symbolId);
  // undefined keeps whatever was already stored, so a save on every render
  // can't wipe a flag the enrolment step just set.
  const enrolled = biometricEnrolled === void 0 ? Boolean(sameAccount && previous.biometricEnrolled) : Boolean(biometricEnrolled);
  try {
    window.localStorage.setItem(
      GLOOBAL_SESSION_KEY,
      JSON.stringify({
        user,
        phoneNumber: phoneNumber || "",
        // Carried across a save for the SAME account — this function is called
        // at several points that know the user but not the token, and dropping
        // it there would sign the person out mid-flow. A DIFFERENT account
        // signing in on this device gets no token until it earns its own,
        // which is the one case where inheriting would be a real leak.
        //
        // ── Why `!hadPreviousAccount` is here (2 September 2026) ──────────
        //
        // This was `(sameAccount && previous.token) || null`, and it threw
        // away the token of every brand-new registration.
        //
        // The order of a registration is: POST /api/register-symbol returns a
        // token, GloobalApi.register stores it with gloobalAuthTokenSave —
        // which writes a blob of `{ savedAt, token }` and NO user, because no
        // session has been saved yet — and only later, at the biometric step,
        // does the flow call this function for the first time. At that point
        // `previousUser` is undefined, so `sameAccount` was false, so the
        // token the account had just been issued was overwritten with null.
        //
        // The account was registered, the PIN was set, and the dashboard then
        // sent every request with no Authorization header at all: profile,
        // balance, assets, PayLater and transactions each came back 401, which
        // surfaced as "Unable to load balance" on a freshly created account.
        // The person had to go back and sign in to get a token that had
        // already been minted for them minutes earlier. The same thing
        // happened to a first-ever sign-in on a device with empty storage,
        // for the same reason and at the same line.
        //
        // The guard itself is right; it was asking the wrong question. It
        // exists so account A's credential is not inherited by account B, and
        // that danger requires an account A. A blob with a token and no user
        // has no A to leak from: gloobalSessionClear removes the whole key on
        // sign-out (token and identity together), and gloobalAuthTokenSave is
        // only ever called by registration, login and passkey sign-in — each
        // for the account being saved here, moments earlier. So a token
        // sitting next to no identity is, by construction, this account's own.
        //
        // Unchanged: a stored session that names a DIFFERENT account still
        // yields no token. That case keeps the old behaviour exactly.
        token: (((sameAccount || !hadPreviousAccount) && previous && previous.token) || null),
        savedAt: Date.now(),
        // Same account-scoping as the flag below: a new account signing in
        // on this device starts its own "logged in at", not the previous
        // occupant's.
        loggedInAt: (sameAccount && previous.loggedInAt) || new Date().toISOString(),
        biometricEnrolled: enrolled
      })
    );
  } catch (e) {
    // Storage unavailable — the app still works this session, it just won't
    // survive the next reload. Nothing to recover from.
  }
  // Two different notifications, for two different audiences — conflating
  // them is what caused both bugs described below.
  //
  // 1. GLOOBAL_SYMBOL_ID_EVENT (broad): "the ID this account answers to may
  // have changed." Every screen that just displays the current Gloobal ID
  // (Receive QR, the share card, Personal Details, the referral link —
  // see useCurrentSymbolId) listens for this so a rename lands on all of
  // them at once instead of only the screen that performed it. Fired
  // whenever the stored symbolId actually changes, rename or switch alike.
  const idChanged = Boolean(!previousUser || previousUser.symbolId !== user.symbolId);
  if (idChanged) gloobalNotifySymbolIdChanged(user.symbolId);
  // 2. GLOOBAL_ACCOUNT_SWITCH_EVENT (narrow): "a DIFFERENT account is now
  // signed in on this device." GloobalArtifactRoot (src/__artifactEntry.jsx)
  // keys its <LedgerProvider> — with GloobalId (the whole app, registration
  // flow included) nested INSIDE it — off this one, specifically so a new
  // account gets a clean local ledger and clean transaction history instead
  // of inheriting whatever the PREVIOUS account (same tab, same page load)
  // had accumulated.
  //
  // Bug fix: this used to fire on any symbolId change at all, same as the
  // broad event above — which is wrong on two different counts.
  //
  // First, it must not fire on the very first save of a brand new account
  // in a tab that had nothing signed in before (`previous` is null). That
  // happens the instant a fresh registration finishes (the first
  // gloobalSessionSave call for the new account, at the biometric step) —
  // there is no earlier account's ledger in this tab to leak from. But
  // because GloobalId sits inside the keyed <LedgerProvider>, firing this
  // anyway force-unmounts the entire app mid-registration — including the
  // in-flight flipTo("dashboard") transition — and the remounted app's own
  // mount-time session-restore effect then finds the session just written
  // and treats it like a returning user, landing on the login screen
  // instead of the dashboard just registered into.
  //
  // Second, and separately, it must not fire when the CURRENT account
  // renames its own ID (handleGloobalIdChanged, via gloobalSessionSetSymbolId
  // right after this same call) — that is exactly what `sameAccount`'s
  // mobileNumber match above now catches. Without it, an ID rename looked
  // identical to a fresh sign-in of a different person: same
  // force-remount, same wiped local ledger (My Essentials / PayLater
  // history both live only in that ledger — see
  // frontend/adapters/ledger/useLedgerProjections.js — with nothing on the
  // backend to recover them from), same reset "joined" date (App.jsx's
  // accountCreatedAt), and the Update Gloobal ID screen's own change log
  // (Dashboard.jsx's idUpdateHistory) never survived long enough to be
  // seen, since it is local state on the very component instance that had
  // just unmounted.
  // hadPreviousAccount is computed at the top of this function now — the
  // token carried above asks the same question and must get the same answer.
  if (!sameAccount && hadPreviousAccount) gloobalNotifyAccountSwitched(user.symbolId);
}

// Returns { user, phoneNumber, biometricEnrolled } for a valid, unexpired
// session, else null. Anything partial or corrupt counts as no session.
function gloobalSessionLoad() {
  const parsed = gloobalSessionReadRaw();
  if (parsed && parsed.user && parsed.user.symbolId) {
    // savedAt is absent on blobs written before it existed; those are
    // treated as fresh rather than expired — dropping someone mid-use over
    // a field they never had is the worse failure.
    const age = parsed.savedAt ? Date.now() - parsed.savedAt : 0;
    if (age > GLOOBAL_SESSION_MAX_AGE_MS) {
      gloobalSessionClear();
      return null;
    }
    return {
      user: parsed.user,
      phoneNumber: parsed.phoneNumber || "",
      biometricEnrolled: Boolean(parsed.biometricEnrolled),
      token: parsed.token || null
    };
  }
  if (parsed) gloobalSessionClear();
  return null;
}

// --- The bearer token --------------------------------------------------
//
// Read on every request by gloobalApiRequest (httpClient.js, emitted above
// this file — these are function declarations, which hoist across the whole
// concatenated scope, so the earlier module can call them).
//
// Deliberately read from storage rather than cached in a variable: the token
// changes on login, on registration, on a PIN reset and on a passkey sign-in,
// and a stale copy in a module-level variable would send the previous
// account's credential after a switch.

// Stored inside the session blob rather than under a key of its own, so
// signing out cannot clear one and leave the other behind.
function gloobalAuthTokenSave(token) {
  const parsed = gloobalSessionReadRaw();
  try {
    window.localStorage.setItem(
      GLOOBAL_SESSION_KEY,
      JSON.stringify(Object.assign({ savedAt: Date.now() }, parsed || {}, { token: token || null }))
    );
  } catch (e) {
    // No storage. The app still works for this page view — gloobalApiRequest
    // reads the token per call and will simply find none after a reload,
    // which surfaces as being asked to sign in again.
  }
}

function gloobalAuthToken() {
  const parsed = gloobalSessionReadRaw();
  return (parsed && parsed.token) || null;
}

function gloobalAuthTokenClear() {
  gloobalAuthTokenSave(null);
}

// Flip the biometric-enrolment flag on its own, without needing the user
// object to hand. The enrolment and verification paths both learn the
// truth at moments where they only know the symbolId (see
// frontend/hooks/useBiometric.js), and a no-op when there is no stored
// session is correct: with nothing persisted there is nothing to correct,
// and the next gloobalSessionSave writes the flag from scratch.
function gloobalSessionMarkBiometricEnrolled(enrolled) {
  const parsed = gloobalSessionReadRaw();
  if (!parsed || !parsed.user) return;
  try {
    window.localStorage.setItem(
      GLOOBAL_SESSION_KEY,
      JSON.stringify(Object.assign({}, parsed, { biometricEnrolled: Boolean(enrolled) }))
    );
  } catch (e) {
    // Same reasoning as gloobalSessionSave — a storage failure costs this
    // device its shortcut, not its ability to sign in.
  }
}

// --- The current Gloobal ID: one source of truth -----------------------
//
// Every screen that shows "your Gloobal ID" reads it from here. Before
// this, each one reached for whatever it happened to have: the Receive QR
// and the share card used the Dashboard's local `gloobalIdOverride`, while
// Personal Details and the profile header used the `myGloobalId` prop
// threaded down from App — so the moment somebody changed their ID, the
// same account showed two different IDs on two different screens.
//
// The stored session is that source rather than a new dedicated key. It is
// already where the signed-in identity lives, already written on
// registration, login and ID change, and already the thing the biometric
// gate and every API call key off. A second key holding the same value
// would just be a second thing to keep in sync — which is the bug, not
// the fix.
function gloobalCurrentSymbolId() {
  const session = gloobalSessionLoad();
  return (session && session.user && session.user.symbolId) || null;
}

// Fired whenever the stored ID changes, so screens already on screen
// update without a reload. Listeners: useCurrentSymbolId (see
// frontend/hooks/useCurrentSymbolId.js).
var GLOOBAL_SYMBOL_ID_EVENT = "gloobal:symbolIdChanged";

// Fired only when the signed-in ACCOUNT changes — a fresh login, an
// account switch, or a sign-out — never for that same account renaming
// its own Gloobal ID. Deliberately a separate event from
// GLOOBAL_SYMBOL_ID_EVENT above: the two used to be the same event, which
// meant every consumer had to react to it the same way, and the one
// consumer that keys a full remount off it (GloobalArtifactRoot's
// <LedgerProvider>, in src/__artifactEntry.jsx) can't tell "you're signed
// in as someone else now, reset everything local" apart from "same
// person, new label" without its own signal. See gloobalSessionSave's
// account-switch notice for what conflating them broke.
var GLOOBAL_ACCOUNT_SWITCH_EVENT = "gloobal:accountSwitched";

function gloobalSessionSetSymbolId(newSymbolId) {
  if (!newSymbolId) return;
  const parsed = gloobalSessionReadRaw();
  if (!parsed || !parsed.user) return;
  if (parsed.user.symbolId === newSymbolId) return;
  try {
    window.localStorage.setItem(
      GLOOBAL_SESSION_KEY,
      JSON.stringify(
        Object.assign({}, parsed, {
          user: Object.assign({}, parsed.user, { symbolId: newSymbolId }),
          savedAt: Date.now()
        })
      )
    );
  } catch (e) {
    // Storage unavailable. The in-memory React state still carries the new
    // ID for this session; only persistence across a reload is lost.
  }
  gloobalNotifySymbolIdChanged(newSymbolId);
}

function gloobalNotifySymbolIdChanged(newSymbolId) {
  try {
    window.dispatchEvent(new CustomEvent(GLOOBAL_SYMBOL_ID_EVENT, { detail: { symbolId: newSymbolId } }));
  } catch (e) {
    // No window (SSR probes) or no CustomEvent — nothing is listening
    // there either, so there is nothing to fall back to.
  }
}

function gloobalNotifyAccountSwitched(newSymbolId) {
  try {
    window.dispatchEvent(new CustomEvent(GLOOBAL_ACCOUNT_SWITCH_EVENT, { detail: { symbolId: newSymbolId } }));
  } catch (e) {
    // No window (SSR probes) or no CustomEvent — nothing is listening
    // there either, so there is nothing to fall back to.
  }
}

function gloobalSessionClear() {
  try {
    window.localStorage.removeItem(GLOOBAL_SESSION_KEY);
  } catch (e) {
    // A stale blob is harmless — gloobalSessionLoad re-validates shape on
    // every read.
  }
  // Signing out is a real account-identity change too — to "no account" —
  // so both notices fire: the broad one so any screen still showing an ID
  // clears it, and the account-switch one so the local ledger resets and
  // the NEXT sign-in on this page doesn't inherit whoever just signed
  // out's balance/history.
  gloobalNotifySymbolIdChanged(null);
  gloobalNotifyAccountSwitched(null);
}
