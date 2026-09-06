// src/hooks/useBiometric.js
//
// The one biometric gate the whole app goes through. Every place that
// needs "prove it's really you" — registration, re-login, changing your
// Gloobal ID, changing My Share, revealing the balance, confirming a
// payment — calls requireBiometric() and acts on the boolean it returns.
// Nothing simulates a scan any more.
//
// What actually runs is WebAuthn against the backend's own passkey
// routes (POST /api/passkey/register/options | register/verify |
// auth/options | auth/verify, plus /api/passkey/status). Those already
// exist server-side and are backed by @simplewebauthn/server, so the
// challenge is server-issued and server-verified — a passkey assertion
// this app can't forge locally. On a phone that means the platform
// authenticator: Face ID, Touch ID, or the fingerprint sensor.
//
// IMPORTANT — this project has no imports between modules; everything
// shares one global scope (see README). So this file declares plain
// functions rather than exporting, and reads the signed-in identity from
// gloobalSessionLoad() instead of taking it as a prop, which is what lets
// screens deep in the tree (SendMoney, the Dashboard sheets) call the
// gate without threading symbolId down to them.
//
// Three-way outcome, deliberately:
//   true   — verified, or the device has no biometric hardware at all and
//            the caller's own PIN step is therefore the whole check.
//   false  — a real rejection: wrong finger/face, cancelled, or a PIN
//            fallback the person got wrong or dismissed.
// Callers must treat false as "abort the action", never as "carry on".

// WebAuthn needs a secure context. It exists on http://localhost too, so
// this is not a plain https check.
function gloobalWebAuthnAvailable() {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined" && Boolean(window.isSecureContext) && Boolean(navigator.credentials);
}

// Is there a platform authenticator (Face ID / Touch ID / fingerprint) as
// opposed to only a roaming key? A device with neither should never be
// shown a biometric prompt it cannot answer.
async function gloobalPlatformAuthenticatorAvailable() {
  if (!gloobalWebAuthnAvailable()) return false;
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) {
    return false;
  }
}

// --- base64url <-> ArrayBuffer -----------------------------------------
//
// The WebAuthn JSON the server sends and expects is base64url-encoded, but
// navigator.credentials wants real ArrayBuffers. @simplewebauthn/browser
// exists to do exactly this conversion; it is inlined here rather than
// added as a dependency because this bundle has no module imports to hang
// one off (see the note at the top).

function gloobalB64UrlToBuffer(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function gloobalBufferToB64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The server hands back generateRegistrationOptions()/
// generateAuthenticationOptions() output verbatim, so every field named
// below is one of theirs.
function gloobalDecodeCreationOptions(options) {
  return Object.assign({}, options, {
    challenge: gloobalB64UrlToBuffer(options.challenge),
    user: Object.assign({}, options.user, { id: gloobalB64UrlToBuffer(options.user.id) }),
    excludeCredentials: (options.excludeCredentials || []).map((cred) => Object.assign({}, cred, { id: gloobalB64UrlToBuffer(cred.id) }))
  });
}

function gloobalDecodeRequestOptions(options) {
  return Object.assign({}, options, {
    challenge: gloobalB64UrlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((cred) => Object.assign({}, cred, { id: gloobalB64UrlToBuffer(cred.id) }))
  });
}

function gloobalEncodeRegistrationCredential(credential) {
  return {
    id: credential.id,
    rawId: gloobalBufferToB64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    response: {
      clientDataJSON: gloobalBufferToB64Url(credential.response.clientDataJSON),
      attestationObject: gloobalBufferToB64Url(credential.response.attestationObject),
      transports: credential.response.getTransports ? credential.response.getTransports() : []
    }
  };
}

function gloobalEncodeAuthenticationCredential(credential) {
  return {
    id: credential.id,
    rawId: gloobalBufferToB64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    response: {
      clientDataJSON: gloobalBufferToB64Url(credential.response.clientDataJSON),
      authenticatorData: gloobalBufferToB64Url(credential.response.authenticatorData),
      signature: gloobalBufferToB64Url(credential.response.signature),
      userHandle: credential.response.userHandle ? gloobalBufferToB64Url(credential.response.userHandle) : null
    }
  };
}

// --- Whose account is being checked ------------------------------------
//
// Registration sets this explicitly (the session isn't saved until the
// profile step, but the passkey has to be enrolled the moment the account
// exists). Everywhere else falls back to the persisted session, so screens
// that never see symbolId as a prop still gate correctly.
var gloobalBiometricSymbolId = null;

function gloobalSetBiometricSymbolId(symbolId) {
  gloobalBiometricSymbolId = symbolId || null;
}

function gloobalActiveSymbolId() {
  if (gloobalBiometricSymbolId) return gloobalBiometricSymbolId;
  const session = gloobalSessionLoad();
  return (session && session.user && session.user.symbolId) || null;
}

// --- Enrolment ----------------------------------------------------------

// Registers this device's platform authenticator against the account.
// Returns { ok } | { ok: false, reason, alreadyEnrolled }.
//
// The account must already exist server-side: /api/passkey/register/options
// 404s on an unknown Secure ID. That is why registration enrols after
// POST /api/register-symbol has run, not before.
async function gloobalEnrolBiometric(symbolId) {
  const id = symbolId || gloobalActiveSymbolId();
  if (!id) return { ok: false, reason: "No account to enrol against." };
  if (!(await gloobalPlatformAuthenticatorAvailable())) {
    return { ok: false, reason: "This device has no Face ID or fingerprint sensor.", unsupported: true };
  }
  try {
    const options = await GloobalApi.passkeyRegisterOptions(id);
    const credential = await navigator.credentials.create({ publicKey: gloobalDecodeCreationOptions(options) });
    if (!credential) return { ok: false, reason: "Setup was cancelled." };
    await GloobalApi.passkeyRegisterVerify(id, gloobalEncodeRegistrationCredential(credential));
    // The session is the single source of truth for "does this device have
    // a passkey", and every later login reads it to decide whether to
    // verify or offer enrolment.
    gloobalSessionMarkBiometricEnrolled(true);
    return { ok: true };
  } catch (err) {
    // 409 means the server already holds a passkey for this Secure ID —
    // not a failure to report, just nothing left to do here.
    if (err instanceof GloobalApiError && err.status === 409) {
      gloobalSessionMarkBiometricEnrolled(true);
      return { ok: true, alreadyEnrolled: true };
    }
    return { ok: false, reason: gloobalBiometricErrorText(err) };
  }
}

// --- Verification -------------------------------------------------------

// Runs an actual device biometric check against a passkey already
// enrolled for this account. Returns { ok } | { ok: false, reason,
// notEnrolled }.
async function gloobalVerifyBiometric(symbolId) {
  const id = symbolId || gloobalActiveSymbolId();
  if (!id) return { ok: false, reason: "No account to verify against." };
  if (!gloobalWebAuthnAvailable()) return { ok: false, reason: "This device can't do biometric checks.", unsupported: true };
  try {
    const options = await GloobalApi.passkeyAuthOptions(id);
    const credential = await navigator.credentials.get({ publicKey: gloobalDecodeRequestOptions(options) });
    if (!credential) return { ok: false, reason: "Verification was cancelled." };
    const result = await GloobalApi.passkeyAuthVerify(id, gloobalEncodeAuthenticationCredential(credential));
    if (!result || result.verified !== true) return { ok: false, reason: (result && result.message) || "Biometric check failed." };
    return { ok: true };
  } catch (err) {
    // 404 from auth/options is "nothing enrolled yet", which is an offer to
    // enrol rather than a rejection.
    if (err instanceof GloobalApiError && err.status === 404) {
      gloobalSessionMarkBiometricEnrolled(false);
      return { ok: false, reason: "No device authentication is set up yet.", notEnrolled: true };
    }
    return { ok: false, reason: gloobalBiometricErrorText(err) };
  }
}

// Turns the DOMExceptions navigator.credentials throws into something a
// person can act on. NotAllowedError covers both "they cancelled" and
// "the check timed out", which the API deliberately does not separate.
function gloobalBiometricErrorText(err) {
  if (!err) return "Biometric check failed.";
  if (err.name === "NotAllowedError") return "Biometric check was cancelled or timed out.";
  if (err.name === "InvalidStateError") return "This device is already registered for this account.";
  if (err.name === "SecurityError") return "Biometric checks need a secure (https) connection.";
  if (err.name === "AbortError") return "Biometric check was interrupted.";
  return err.message || "Biometric check failed.";
}

// Does the session say this device has a passkey? Cheap, synchronous, and
// good enough to decide whether to *offer* enrolment; the server is still
// the authority and will 404 if the flag is stale.
function gloobalBiometricEnrolled() {
  const session = gloobalSessionLoad();
  return Boolean(session && session.biometricEnrolled);
}

// Server-side truth, for the places worth one extra round trip (login).
// Returns true | false | null, where null means "couldn't tell" — treated
// as "don't block" by callers, same convention as
// GloobalApi.checkSymbolAvailability.
async function gloobalBiometricEnrolledRemote(symbolId) {
  const id = symbolId || gloobalActiveSymbolId();
  if (!id) return null;
  try {
    const result = await GloobalApi.passkeyStatus(id);
    return Boolean(result && result.hasPasskey);
  } catch (e) {
    return null;
  }
}

// --- The gate itself ----------------------------------------------------

// requireBiometric — the single entry point every guarded action calls.
//
//   const ok = await requireBiometric({ onPinFallback });
//   if (!ok) return;            // abort — do not proceed
//
// Order of resolution:
//   1. No WebAuthn / no platform authenticator on this device at all →
//      straight to the PIN (3). This must NOT pass on its own: most of
//      the actions behind this gate — revealing the balance, changing My
//      Share, changing the Gloobal ID, settling to bank — have no PIN
//      step of their own, so this gate is the entire check. Returning
//      true here, as an earlier version did, meant a desktop browser
//      without Windows Hello or Touch ID (and any non-secure context,
//      since that also reports no authenticator) sailed through every one
//      of them unverified.
//   2. A passkey is enrolled → run the real device check. Success is
//      true; an explicit rejection falls through to (3).
//   3. PIN fallback: the modal registered by the app root, which resolves
//      true only once POST /api/pin/verify has confirmed the PIN
//      server-side. This is a real check, not a bypass — and it is what
//      keeps a device with no sensor, or a person who chose "set this up
//      later", able to use their own account.
// The account's "Biometric login" preference, mirrored here from
// User.securitySettings.biometricLogin so the gate can read it.
//
// A module-level variable for the same reason the identity is read from
// gloobalSessionLoad() rather than taken as a prop (see the header): this
// gate is called from screens all over the tree, and threading a setting
// through every one of them means each caller can quietly forget it.
// App.jsx sets it whenever the signed-in account changes.
//
// Defaults to true, which is both the server's default and the safe way
// round: an unset preference offers biometrics, it does not silently
// disable them.
var gloobalBiometricLoginEnabled = true;

function gloobalSetBiometricLoginEnabled(enabled) {
  gloobalBiometricLoginEnabled = enabled !== false;
}

// How long the app may be backgrounded before "App lock" re-locks it.
//
// Not zero, because picking a photo or reading a notification backgrounds
// the tab for a second or two, and a lock screen on every one of those
// would make the app tiring enough that people would switch the setting
// off — which protects them less than a slightly forgiving lock does.
var GLOOBAL_APP_LOCK_GRACE_MS = 30000;

async function requireBiometric(options) {
  const opts = options || {};
  const symbolId = opts.symbolId || gloobalActiveSymbolId();

  // (1) Nothing to prompt with on this device — the PIN is the check.
  if (!(await gloobalPlatformAuthenticatorAvailable())) return gloobalRunPinFallback(opts);

  // (1b) The account has switched biometric login off.
  //
  // This SKIPS the passkey and goes to the PIN — it does not skip the
  // check. That distinction is the whole point: every path out of this
  // function either verifies something or returns false, and turning a
  // switch off in a settings screen must never be a way to turn a gate
  // off. The PIN fallback is a real server-side verification
  // (POST /api/pin/verify), so an account with biometrics disabled is
  // authorised exactly as strictly as one on a device with no sensor.
  if (!gloobalBiometricLoginEnabled) return gloobalRunPinFallback(opts);

  // (2) Enrolled — the real thing.
  if (!symbolId) return gloobalRunPinFallback(opts);
  const enrolled = gloobalBiometricEnrolled() || (await gloobalBiometricEnrolledRemote(symbolId)) === true;
  if (enrolled) {
    const result = await gloobalVerifyBiometric(symbolId);
    if (result.ok) return true;
    // A stale local flag (passkey deleted server-side, or the account was
    // restored onto a new device) is a reason to offer enrolment again,
    // not to hard-fail — but this attempt still has to be authorised, so
    // it goes to the PIN fallback either way.
    if (result.notEnrolled) gloobalSessionMarkBiometricEnrolled(false);
    if (opts.onBiometricError) opts.onBiometricError(result.reason);
    return gloobalRunPinFallback(opts);
  }

  // (3)/(4) Nothing enrolled — PIN carries it.
  return gloobalRunPinFallback(opts);
}

// The PIN fallback, registered once by the app root.
//
// It lives here as a module-level hook rather than as a prop because
// requireBiometric() is called from screens all over the tree — Send
// Money, the Dashboard sheets, Scan & Pay — and threading a modal opener
// through every one of them would mean each caller could quietly forget
// it, which for a gate means silently degrading to "no check at all".
//
// The registered function opens the PIN modal and resolves true only once
// POST /api/pin/verify has confirmed the PIN server-side; false on a wrong
// PIN or a dismissal.
var gloobalPinFallbackHost = null;

function gloobalRegisterPinFallbackHost(host) {
  gloobalPinFallbackHost = typeof host === "function" ? host : null;
}

// Without this, a device that HAS a fingerprint sensor but no enrolled
// passkey — anyone who chose "set this up later" at registration — would
// fail every gate in the app and be locked out of their own balance. The
// PIN is what stands in.
//
// One at a time. The host holds a single pending request, so a second
// concurrent call would overwrite the first and leave its promise
// unresolved forever — the screen that opened it would sit in its
// "verifying" state with no way out. Refusing the second call fails that
// action safely instead of hanging it.
var gloobalPinFallbackPending = false;

async function gloobalRunPinFallback(opts) {
  const host = typeof opts.onPinFallback === "function" ? opts.onPinFallback : gloobalPinFallbackHost;
  if (typeof host !== "function") return false;
  if (gloobalPinFallbackPending) return false;
  gloobalPinFallbackPending = true;
  try {
    return (await host(opts)) === true;
  } catch (e) {
    return false;
  } finally {
    gloobalPinFallbackPending = false;
  }
}
