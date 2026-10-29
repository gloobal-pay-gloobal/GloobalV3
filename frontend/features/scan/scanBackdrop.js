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
// ── THE COLOUR IS ON THE CARD, NOT BEHIND IT ────────────────────────────
//
// First built the other way round: a dark coloured field with the white
// card floating on it. The founder looked at it and inverted it —
// "make background colour light white and make that box of data
// colorful" — and he is right, for a reason worth writing down.
//
// The field is the biggest thing on the screen and the card is the only
// thing anybody is reading. Colouring the field spent all that area
// saying who you are paying, in the place nobody looks, and left the
// card — where the name, the code and the Pay button are — as plain
// white. The colour now sits on the thing it is about.
//
// So each entry carries three values:
//
//   from / to   the card's own gradient, dark enough for white text,
//   tint        the page behind it: white, with a few percent of the
//               same hue mixed in, so the screen is recognisably warm
//               or cool without ever stopping being white.
//
// ── WHY THESE COLOURS ───────────────────────────────────────────────────
//
// Each is dark enough that white text sits on it with real contrast, and
// none of them is Gloobal's own violet: the card is about WHO IS BEING
// PAID, and a row of app-violet cards would say Gloobal rather than
// saying them. Two-stop gradients rather than flats, because a flat fill
// reads as a coloured block while a gradient reads as a surface.
//
// THE TWO STOPS ARE A LONG WAY APART IN VALUE, and a render is why. The
// first set kept each pair close so the colour would stay quiet, and at
// size that is not quiet, it is flat — a wash of one brown with no light
// in it. A dark anchor and a genuinely lighter second stop gives the
// gradient somewhere to travel.
//
// Four of the lighter stops were then pulled back down, because a test
// measured them: the card's text is WHITE, and teal, moss, gold and pine
// had travelled far enough to put white text under 4.5:1. Picked by eye,
// corrected by arithmetic — which is the right way round for a contrast
// ratio, since nobody can see 3.53:1 and know it.
var SCAN_BACKDROPS = [
  { key: "indigo", from: "#16205E", to: "#4A3FC0", ribbon: "#FFC857" },
  { key: "teal", from: "#053C38", to: "#0F8174", ribbon: "#FF8A5B" },
  { key: "plum", from: "#3B0C3B", to: "#92238A", ribbon: "#7CE0C3" },
  { key: "ocean", from: "#052942", to: "#1479B8", ribbon: "#FFB84D" },
  { key: "moss", from: "#123114", to: "#318435", ribbon: "#FFD166" },
  { key: "ember", from: "#4F1208", to: "#BE4E1E", ribbon: "#7FD1FF" },
  { key: "slate", from: "#18222C", to: "#4A6B86", ribbon: "#FFB4A2" },
  { key: "berry", from: "#450822", to: "#B01D5C", ribbon: "#9BE7A3" },
  { key: "gold", from: "#3C2F04", to: "#8B7110", ribbon: "#C7B3FF" },
  { key: "pine", from: "#06302A", to: "#12846D", ribbon: "#FFC0E0" },
  { key: "wine", from: "#3F0A16", to: "#A01F38", ribbon: "#8FE3FF" },
  { key: "cobalt", from: "#0E2470", to: "#2A62D6", ribbon: "#FFE066" }
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

// The CARD's own fill. Diagonal, so the two stops are both visible —
// a vertical gradient puts most of one colour above the middle and most
// of the other below it.
function scanBackdropCss(seed) {
  const pick = scanBackdropFor(seed);
  return `linear-gradient(150deg, ${pick.from} 0%, ${pick.to} 100%)`;
}

// How much of the hue reaches the page behind the card.
//
// Six percent. Low enough that "light white" is still a fair description
// of what somebody sees, high enough that the screen is recognisably
// warm or cool with the card on it. Ten read as a coloured page; three
// was indistinguishable from the app's own ground, which would make the
// whole thing pointless on half the hues.
var SCAN_PAGE_TINT = 0.06;

// White with a trace of the card's hue mixed in, as a hex.
//
// Mixed rather than listed as twelve more literals, so a colour cannot
// be changed in one table and left stale in the other — the page and the
// card it sits behind must always be the same hue or the screen looks
// like two unrelated decisions.
function scanPageTint(seed) {
  const pick = scanBackdropFor(seed);
  const n = parseInt(pick.to.slice(1), 16);
  const mix = (channel) => {
    const value = Math.round(255 + (channel - 255) * SCAN_PAGE_TINT);
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  };
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`.toUpperCase();
}

// ── THE RIBBON UNDER THE CARD ───────────────────────────────────────────
//
// The creator's message hangs off the bottom of the card rather than
// sitting inside it, on a band a little wider than the card so its two
// ends show on either side: "keep them message BELOW that pay box like a
// two side hanging and little flowing".
//
// Two shades, both darker than the card's own darkest stop. The BAR is
// the band itself; the FOLD is the small triangle at each end, which is
// what makes a rectangle read as a ribbon rather than as a second card
// that happens to be wider. A fold is in shadow, so it is darker again.
//
// Derived from the same entry as everything else on this screen, for the
// same reason: three tables would be three things to keep in step.
// ── THE RIBBON IS A DIFFERENT COLOUR FROM THE CARD, ON PURPOSE ──────────
//
// It was two darker shades of the card's own hue, which on a slate or a
// pine card came out near-black: a dark band under a dark card, the
// message in white on both. "can you make that strip of message box in
// different colours."
//
// Each entry now carries a `ribbon`: a light, saturated colour that
// CONTRASTS with the card rather than deepening it — amber under indigo,
// coral under teal, mint under plum. The text on it is ink, not white,
// because a light band wants dark type. The fold stays a darker shade of
// the band itself, so it still reads as the band folded under.
function scanRibbonInk(seed) {
  const pick = scanBackdropFor(seed);
  const base = pick.ribbon || pick.from;
  const shade = (factor) => {
    const n = parseInt(base.slice(1), 16);
    const part = (channel) => {
      const value = Math.round(channel * factor);
      return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
    };
    return `#${part((n >> 16) & 255)}${part((n >> 8) & 255)}${part(n & 255)}`.toUpperCase();
  };
  // 0.82 keeps the band clearly related to the card and clearly behind
  // it; 0.55 puts the fold deep enough in shadow to read as a crease at
  // a glance rather than as a slightly different rectangle.
  return { bar: base, fold: shade(0.62), text: "#1A1033" };
}
