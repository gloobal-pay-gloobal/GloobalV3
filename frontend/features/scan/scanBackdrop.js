// src/features/scan/scanBackdrop.js
//
// THE COLOUR BEHIND A SCANNED CODE.
//
// The scan screen is black. That is correct while the camera is running —
// a dark frame is what lets somebody see the picture they are aiming —
// and wrong the moment a code resolves and a white card appears on it.
// A payment confirmation floating on a black field reads as an error
// dialog, which is the one thing it must not read as.
//
// ── NOBODY PICKS IT ─────────────────────────────────────────────────────
//
// Asked for as "make it colourful … change automatically no one
// involvement". So it is not a setting, it is not the shop's own colour
// from its Look editor, and the payer has nothing to choose. It is
// derived from the Gloobal ID that was scanned.
//
// ── AND IT DOES NOT MOVE ────────────────────────────────────────────────
//
// "when you keep background as light blue for example don't change
// colour into something else."
//
// Deriving it from the ID is what guarantees that, and guarantees it by
// construction rather than by remembering to hold a value in state. The
// same code scanned gives the same colour — on the card, behind the
// amount, behind the PIN, on the receipt, and again tomorrow. There is
// no moment at which it could drift, because there is nothing to drift:
// a pure function of a string that does not change.
//
// It buys something nobody asked for and worth having anyway. A person
// who pays the same stall twice a week sees the same colour every time,
// and starts to know the card is right before reading a word of it. A
// WRONG code is then also visibly wrong, at a glance, in the half-second
// before money moves — which is the one moment on this screen that
// matters.
//
// ── WHY THESE COLOURS ───────────────────────────────────────────────────
//
// Each is dark enough that a white card and a white title sit on it with
// real contrast, and none of them is Gloobal's own violet: this field is
// about WHO IS BEING PAID, and a row of app-violet backdrops would say
// Gloobal rather than saying them. Two-stop gradients rather than flats,
// because a flat fill at full screen reads as a coloured error page
// while a gradient reads as a surface.
//
// THE TWO STOPS ARE A LONG WAY APART IN VALUE, and a render is why. The
// first set kept each pair close so the field would stay quiet, and at
// full screen that is not quiet, it is flat — a wash of one brown with
// no light in it. A dark anchor and a genuinely lighter second stop
// gives the field somewhere to travel, which is what makes it read as
// a lit surface behind a card rather than as a filled rectangle.
//
// Four of the lighter stops were then pulled back down, because a test
// measured them: the screen's title is WHITE on this field, and teal,
// moss, gold and pine had travelled far enough to put white text under
// 4.5:1. Picked by eye, corrected by arithmetic — which is the right way
// round for a contrast ratio, since nobody can see 3.53:1 and know it.
var SCAN_BACKDROPS = [
  { key: "indigo", from: "#16205E", to: "#4A3FC0" },
  { key: "teal", from: "#053C38", to: "#0F8174" },
  { key: "plum", from: "#3B0C3B", to: "#92238A" },
  { key: "ocean", from: "#052942", to: "#1479B8" },
  { key: "moss", from: "#123114", to: "#318435" },
  { key: "ember", from: "#4F1208", to: "#BE4E1E" },
  { key: "slate", from: "#18222C", to: "#4A6B86" },
  { key: "berry", from: "#450822", to: "#B01D5C" },
  { key: "gold", from: "#3C2F04", to: "#8B7110" },
  { key: "pine", from: "#06302A", to: "#12846D" },
  { key: "wine", from: "#3F0A16", to: "#A01F38" },
  { key: "cobalt", from: "#0E2470", to: "#2A62D6" }
];

// The same cheap, stable hash businessMarkInk uses. Deliberately the same
// SHAPE and deliberately NOT the same palette: two surfaces that both
// colour themselves from an identifier should not accidentally agree, or
// a pale chip and a dark field would look like one claim about the person
// rather than two unrelated ones.
function scanBackdropFor(seed) {
  const key = String(seed || "");
  if (!key) return SCAN_BACKDROPS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return SCAN_BACKDROPS[hash % SCAN_BACKDROPS.length];
}

// Ready to drop into a `background`. Diagonal, so the two stops are both
// visible on a tall screen — a vertical gradient on a phone puts most of
// one colour above the fold and most of the other below it.
function scanBackdropCss(seed) {
  const pick = scanBackdropFor(seed);
  return `linear-gradient(150deg, ${pick.from} 0%, ${pick.to} 100%)`;
}
