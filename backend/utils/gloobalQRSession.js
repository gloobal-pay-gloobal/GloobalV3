// src/utils/gloobalQRSession.js
//
// The Gloobal QR handle: sixteen glyphs that name a server-held session.
//
// ── What this file is NOT ────────────────────────────────────────────────
//
// It is not gloobalQR.js's replacement in kind. The old payload CARRIED the
// payment — a Gloobal ID, an amount, and a checksum that its own comment
// admits is a typo guard. Anyone who knew the alphabet could mint a code for
// any account and any amount up to 20,971.51, and the only thing standing in
// front of that was a `Set` in one browser tab.
//
// This carries none of those things. It carries a random number. The number
// means nothing until the server is asked about it, and asking is not the
// same as being told: the server answers "live" or "dead" to anybody, and
// answers WHO and HOW MUCH only to somebody who has verified themselves and
// won the claim. See docs/gloobal-qr-session.md.
//
// So the security properties of this file are deliberately thin, and saying
// so out loud is part of its job:
//
//   - The handle is UNGUESSABLE, not unforgeable. 33.6 bits and a 60-second
//     life is what makes guessing pointless; nothing here signs anything.
//   - The checksum is a MISREAD guard. It stops a camera's mistake becoming
//     a network call. It is not integrity and it is not authentication.
//
// The old file's checksum comment is the one thing people remember about it,
// and memory promotes "checksum" to "signature" without anyone deciding to.
// Both sentences above exist so that promotion has to be argued for.
//
// ── The picture ──────────────────────────────────────────────────────────
//
// Sixteen cells, four to a side, with the Gloobal mark in the middle:
//
//        0   1   2   3        Reading order is ROW-MAJOR — left to right,
//        4   5 ( ) 6   7      top to bottom — the order a person reads.
//        8   9     10  11
//       12  13  14  15        The white disc sits on the crossing of the
//                             four centre cells, in the gap between them.
//                             It is the brand mark and a second, coarse
//                             orientation cue; it covers no glyph.
//
//   cell  0      the ANCHOR. Never data.
//   cells 1-13   the handle, base 6, most significant first.
//   cells 14-15  the checksum.
//
// The anchor costs a cell and buys orientation. Four identical corners give
// a scanner no way to tell which way up a code is, and a code read upside
// down decodes to a different, perfectly valid-looking handle — which would
// resolve to "no such session" and read to the person holding the phone as
// "this shop's code is broken". One cell is a cheap way not to lie.
//
// ── The alphabet is six, not eight ───────────────────────────────────────
//
// DIAL_SYMBOLS has eight. This drops the two hollow forms:
//
//     dropped:  ○  □        kept:  −  +  ×  =  ●  ■
//
// ○/● and □/■ are the same shape at two fill levels. They are the first pair
// a camera confuses — under a shop's overhead light, at an angle, on a
// screen with the brightness down, or when the glyph is small enough that
// antialiasing closes the hollow. Every other pair in the set differs in
// stroke topology, which survives all of that.
//
// Six costs 5.5 bits against eight's 6, over 13 cells: 33.6 bits instead of
// 39. Both are far more than a 60-second session needs.
//
// ── Why this module owns its alphabet ────────────────────────────────────
//
// Same reason gloobalQR.js does, and it is not theoretical there either.
// build_app.mjs concatenates these files into one scope; `var` hoists the
// declaration but not the initialiser, so a module that reads another
// module's `var` at TOP LEVEL reads `undefined`. gloobalQR.js once did
// `new Set(DIAL_SYMBOLS)` and got an empty set — legal, silent, and it made
// decode return null for every code ever scanned.
//
// So: nothing here evaluates anything from another module at load time.
// tests/qr-session-handle.test.mjs asserts these six glyphs stay a subset of
// DIAL_SYMBOLS, which keeps the copy honest without the ordering dependency.
var QR_SESSION_SYMBOLS = ["−", "+", "\xD7", "=", "●", "■"];
var QR_SESSION_BASE = QR_SESSION_SYMBOLS.length;
var QR_SESSION_SYMBOL_TO_DIGIT = Object.fromEntries(
  QR_SESSION_SYMBOLS.map((s, i) => [s, i])
);

// The filled square, drawn inside a filled disc so the eye and the
// classifier both find it before anything else. It is a member of the
// alphabet, which is fine: it is excluded from the data range by POSITION,
// never by which character it is.
var QR_SESSION_ANCHOR = "■";

var QR_SESSION_LENGTH = 16;
var QR_SESSION_ANCHOR_INDEX = 0;
var QR_SESSION_DATA_START = 1;
var QR_SESSION_DATA_CELLS = 13;
var QR_SESSION_CHECKSUM_CELLS = 2;

// 6^13 = 13,060,694,016. Above 2^32 and comfortably below 2^53, so every
// handle is an exact JavaScript integer and no BigInt is needed.
var QR_SESSION_HANDLE_SPACE = Math.pow(QR_SESSION_BASE, QR_SESSION_DATA_CELLS);
var QR_SESSION_MAX_HANDLE = QR_SESSION_HANDLE_SPACE - 1;

// ── Cell order ───────────────────────────────────────────────────────────
//
// [row, col] on a 4x4 grid, row-major. All sixteen cells carry a glyph; the
// brand disc sits on the crossing between the four centre cells and covers
// none of them, which is what lets a 4x4 hold sixteen symbols rather than
// the twelve a hollow ring would.
//
// Built once, from one loop, and exported: the renderer places cells from
// this list and the scanner reads them from this list. Two components that
// each separately "know" the order is a bug waiting for the day one of them
// is changed — and its symptom would be handles that decode to real-looking
// numbers naming sessions that never existed.
var QR_SESSION_GRID = 4;
var QR_SESSION_CELL_ORDER = (function buildCellOrder() {
  const cells = [];
  for (let r = 0; r < QR_SESSION_GRID; r++) {
    for (let c = 0; c < QR_SESSION_GRID; c++) cells.push([r, c]);
  }
  return cells;
})();

// ── Checksum ─────────────────────────────────────────────────────────────
//
// Two digits, not one mod-36 digit, and the two catch different things:
//
//   c1 = (sum of the data digits) mod 6
//        Catches EVERY single-glyph misread outright: one digit changing by
//        d in [-5,5]\{0} can never be a multiple of 6. Single-glyph misreads
//        are the dominant camera error, so this is the one that earns its
//        cell.
//
//   c2 = (sum of (position x digit)) mod 6
//        Position-weighted, so it moves when two digits swap and c1 does
//        not.
//
// A single mod-36 digit split across two cells would have given a strictly
// weaker guarantee: with weights up to 13 and digit deltas up to 5, a change
// of exactly 3 at position 12 leaves a mod-36 sum untouched, so some single
// misreads would pass. Two independent mod-6 digits do not have that hole.
//
// Residual: a random 16-cell corruption still passes 1 time in 36. That is
// what the resolve call is for — a bad handle that gets past this is told
// "no such session" by the server, which is the correct answer for it.
function qrSessionChecksumDigits(dataDigits) {
  let c1 = 0;
  let c2 = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    c1 = (c1 + dataDigits[i]) % QR_SESSION_BASE;
    c2 = (c2 + (i + 1) * dataDigits[i]) % QR_SESSION_BASE;
  }
  return [c1, c2];
}

// True only for a whole, finite, non-negative number this code can carry.
//
// Strictly a number, exactly as qrCanEncodeAmount is, and for the same
// reason: Number("") and Number(null) are both 0, so a coercing check turns
// a missing handle into a perfectly valid code for session zero.
function qrCanEncodeSessionHandle(value) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= QR_SESSION_MAX_HANDLE
  );
}

// Handle value -> the 16 glyphs, or NULL if it cannot be represented.
//
// Null rather than a clamped code, for the reason the old encoder learned
// the hard way: a payment instrument may never quietly change the number it
// was given. Callers are render paths and must handle null.
function encodeQrSessionCode(value) {
  if (!qrCanEncodeSessionHandle(value)) return null;

  const dataDigits = new Array(QR_SESSION_DATA_CELLS);
  let remaining = value;
  // Most significant cell first, so the glyphs read in the same direction a
  // person reads the number when debugging.
  for (let i = QR_SESSION_DATA_CELLS - 1; i >= 0; i--) {
    dataDigits[i] = remaining % QR_SESSION_BASE;
    remaining = Math.floor(remaining / QR_SESSION_BASE);
  }

  const checksum = qrSessionChecksumDigits(dataDigits);
  return (
    QR_SESSION_ANCHOR +
    dataDigits.map((d) => QR_SESSION_SYMBOLS[d]).join("") +
    checksum.map((d) => QR_SESSION_SYMBOLS[d]).join("")
  );
}

// The cheap shape test, for a scanner deciding whether it is even looking at
// one of these. Says nothing about whether the handle is live.
function isQrSessionCode(code) {
  if (typeof code !== "string" || code.length !== QR_SESSION_LENGTH) return false;
  if (code[QR_SESSION_ANCHOR_INDEX] !== QR_SESSION_ANCHOR) return false;
  return code.split("").every((c) => c in QR_SESSION_SYMBOL_TO_DIGIT);
}

// The 16 glyphs -> { value }, or NULL.
//
// Null covers every reason: wrong length, a glyph outside the alphabet, a
// missing anchor (which is usually a code read at the wrong rotation), a
// failed checksum. The caller has nothing useful to do differently between
// those cases, and a scanner that distinguishes them on screen is telling
// the person about our internals rather than about their code.
function decodeQrSessionCode(code) {
  if (!isQrSessionCode(code)) return null;

  const digits = code.split("").map((c) => QR_SESSION_SYMBOL_TO_DIGIT[c]);
  const dataDigits = digits.slice(
    QR_SESSION_DATA_START,
    QR_SESSION_DATA_START + QR_SESSION_DATA_CELLS
  );
  const given = digits.slice(QR_SESSION_DATA_START + QR_SESSION_DATA_CELLS);
  const want = qrSessionChecksumDigits(dataDigits);
  if (given[0] !== want[0] || given[1] !== want[1]) return null;

  let value = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    value = value * QR_SESSION_BASE + dataDigits[i];
  }
  return { value, format: "session-v1" };
}

// ── Why there is no mint function here ───────────────────────────────────
//
// Encoding is not minting. Minting is CHOOSING the number; encoding is
// drawing one that has already been chosen. This file only draws.
//
// The distinction is the whole design. A mint function living here would be
// callable from the browser bundle — this file is concatenated into it —
// and a handle the client chose is a handle the client can choose again.
// The server mints, with crypto.randomInt over QR_SESSION_HANDLE_SPACE, and
// is the only thing that ever does.
//
// So the payee's device receives a NUMBER from the server and encodes it for
// the screen; the payer's device decodes what its camera saw back to a
// number and sends that number to resolve and claim. The wire carries
// integers in both directions and the glyph alphabet never leaves the
// device — which is also why changing the alphabet later is a client
// release, not a protocol change.
