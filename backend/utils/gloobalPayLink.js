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

// ── ONE ACCOUNT, TWO CODES, AND THE CODE SAYS WHICH ─────────────────────
//
// The personal side and the creator side of an account are one Gloobal
// ID — `creatorId = secureId`, after a separate identifier turned out to
// point at no account at all. So the two Receive screens used to draw the
// SAME code, byte for byte, and the card a scanner got could only guess
// which one it had been shown. 0100 guessed "the shop, if the account has
// a creator name", which made both codes show the shop. The founder:
// "when I scan a qr on personal side and when i scan a qr on creator side
// both show creator name".
//
// The guess is replaced by a fact carried in the code itself:
//
//     /p/<digits>   the account, as it has always been written. Every
//                   sticker ever printed is one of these, so it keeps
//                   the old behaviour exactly — the shop where there is
//                   one, the person where there is not — and nothing on
//                   a counter anywhere stops working.
//     /u/<digits>   the PERSON. Drawn by the personal Receive screen
//                   from now on, and shows the person's own name and
//                   ID even when that account also runs a shop.
//     /s/<digits>   the SHOP. Drawn by the creator Receive screen, and
//                   shows the shop even if a lookup for a creator name
//                   were somehow to fail.
//
// Three letters because two is not enough: a code with no side has to
// stay distinguishable from a code that chose one, or the stickers in
// the world would silently become personal codes the day this shipped.
var GLOOBAL_PAY_PATH_RE = /^\/([pus])\/([0-7]{12})\/?$/;
var GLOOBAL_PAY_SIDE_BY_LETTER = { p: "either", u: "person", s: "shop" };
var GLOOBAL_PAY_LETTER_BY_SIDE = { either: "p", person: "u", shop: "s" };

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

// `side` is "person", "shop" or "either". Anything else — including the
// argument simply not being passed, which is every caller that predates
// sides — writes the unmarked /p/ form, so an old caller cannot produce a
// code that claims a side it never chose.
function buildGloobalPayUrl(gloobalId, side) {
  if (!isGloobalPayId(gloobalId)) return null;
  const digits = Array.from(gloobalId).map((c) => GLOOBAL_PAY_SYMBOLS.indexOf(c)).join("");
  const letter = GLOOBAL_PAY_LETTER_BY_SIDE[side] || "p";
  return `${GLOOBAL_PAY_ORIGIN}/${letter}/${digits}`;
}

function gloobalPayDigitsToId(digits) {
  return Array.from(digits).map((d) => GLOOBAL_PAY_SYMBOLS[Number(d)]).join("");
}

function readGloobalPayIdFromPath(pathname) {
  const read = readGloobalPayFromPath(pathname);
  return read ? read.gloobalId : null;
}

// The id AND the side, or null. The side is what the code's author chose
// when they showed it; "either" is a code from before there was a choice.
function readGloobalPayFromPath(pathname) {
  if (typeof pathname !== "string") return null;
  const match = GLOOBAL_PAY_PATH_RE.exec(pathname);
  if (!match) return null;
  return { gloobalId: gloobalPayDigitsToId(match[2]), side: GLOOBAL_PAY_SIDE_BY_LETTER[match[1]] };
}

function parseGloobalPayPayload(text) {
  try {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    // A bare twelve-symbol id has no side either — it is the oldest form
    // there is.
    if (isGloobalPayId(trimmed)) return { gloobalId: trimmed, side: "either" };
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

    return readGloobalPayFromPath(url.pathname);
  } catch {
    return null;
  }
}
