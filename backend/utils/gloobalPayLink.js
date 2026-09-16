// src/utils/gloobalPayLink.js
//
// The static "Your Gloobal QR": a plain pay link, UPI-style. No amount, no
// session, no expiry — the code names an account and nothing else; the payer
// types the amount in Send Money.
//
//     https://gloobalv3.netlify.app/p/<12 digits>
//
// Each digit is the INDEX of one Gloobal ID symbol in GLOOBAL_PAY_SYMBOLS
// (the server's canonical order, server/server.js). Digits rather than the
// symbols themselves because every symbol is multi-byte UTF-8: percent-encoded
// the link is 122 bytes (QR version 11 at level H), while this one is 44
// bytes (version 5, 37x37). The short "/p/" path is what keeps it at version
// 5; "/pay/" was 46 bytes and version 6.
//
// KNOWN LIMITATION: the link carries the account's CURRENT Gloobal ID. If the
// owner later renames their ID, a printed or saved QR stops resolving — the
// server answers 404 ("No Gloobal account uses this QR."), because retired
// IDs are never matched or reissued. It fails closed, never to someone else,
// but the owner has to reprint. Not solved in this iteration.
//
// A real URL (rather than a bare ID) means a phone's own camera app opens
// the app on the pay screen; the in-app scanner parses the same link.
//
// Parsing is strict on purpose: a scanner that accepts "anything that looks
// roughly like a pay link" is a scanner a printed sticker can redirect.
var GLOOBAL_PAY_ORIGIN = "https://gloobalv3.netlify.app";
var GLOOBAL_PAY_HOST = "gloobalv3.netlify.app";
var GLOOBAL_PAY_ID_LENGTH = 12;

// U+2212 minus first — NOT the ASCII hyphen. Kept local rather than reusing
// the frontend's DIAL_SYMBOLS, which is not yet defined when backend modules
// load.
var GLOOBAL_PAY_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];

var GLOOBAL_PAY_PATH_RE = /^\/p\/([0-7]{12})\/?$/;

// Side of the white logo square in the middle of the QR, as a fraction of
// the symbol's side in modules. 0.26² ≈ 6.8% of the area — inside what
// error-correction level H (30%) absorbs with a wide margin. Shared by the
// card and its round-trip test so both measure the same square.
var GLOOBAL_QR_LOGO_FRACTION = 0.26;

function isGloobalPayId(value) {
  if (typeof value !== "string") return false;
  const chars = Array.from(value);
  if (chars.length !== GLOOBAL_PAY_ID_LENGTH) return false;
  return chars.every((c) => GLOOBAL_PAY_SYMBOLS.indexOf(c) !== -1);
}

function buildGloobalPayUrl(gloobalId) {
  if (!isGloobalPayId(gloobalId)) return null;
  const digits = Array.from(gloobalId).map((c) => GLOOBAL_PAY_SYMBOLS.indexOf(c)).join("");
  return `${GLOOBAL_PAY_ORIGIN}/p/${digits}`;
}

function gloobalPayDigitsToId(digits) {
  return Array.from(digits).map((d) => GLOOBAL_PAY_SYMBOLS[Number(d)]).join("");
}

function readGloobalPayIdFromPath(pathname) {
  if (typeof pathname !== "string") return null;
  const match = GLOOBAL_PAY_PATH_RE.exec(pathname);
  return match ? gloobalPayDigitsToId(match[1]) : null;
}

function parseGloobalPayPayload(text) {
  try {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (isGloobalPayId(trimmed)) return { gloobalId: trimmed };
    if (typeof URL === "undefined") return null;

    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }

    const isProduction = url.protocol === "https:" && url.hostname === GLOOBAL_PAY_HOST;
    // Local dev and tests only. Neither name can be registered publicly.
    const isLocal =
      (url.protocol === "https:" || url.protocol === "http:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (!isProduction && !isLocal) return null;
    if (url.username || url.password) return null;
    if (isProduction && url.port) return null;
    if (url.search || url.hash) return null;
    // "…/p/x?" and "…/p/x#" parse to an empty search/hash, and the URL
    // parser silently drops tabs and newlines mid-string; refuse all three.
    if (/[?#\s]/.test(trimmed)) return null;

    const gloobalId = readGloobalPayIdFromPath(url.pathname);
    return gloobalId ? { gloobalId } : null;
  } catch {
    return null;
  }
}
