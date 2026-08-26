// src/constants/theme.js
var T = {
  bg: "#F6F5FC",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F1FA",
  surfaceSunk: "#EEEBF9",
  ink: "#15132A",
  inkSoft: "#6B6580",
  inkFaint: "#9C96AF",
  line: "#EAE6F7",
  lineSoft: "rgba(21,19,42,0.06)",
  accent: "#7C3AED",
  accentDeep: "#4C1D95",
  accent2: "#3B6EF5",
  accentSoft: "#F1ECFC",
  gradPrimary: "linear-gradient(135deg,#4338CA 0%,#7C3AED 55%,#C026D3 100%)",
  gradWallet: "linear-gradient(150deg,#1E1B4B 0%,#3E2E8E 42%,#7C3AED 80%,#C026D3 100%)",
  gradButton: "linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)",
  gradButtonDisabled: "linear-gradient(135deg,#D9D3F3,#E6DFF8)",
  positive: "#0FA372",
  positiveSoft: "#E3F8EE",
  negative: "#E23F45",
  negativeSoft: "#FCEAEA",
  radiusXl: 28,
  radiusLg: 22,
  radiusMd: 16,
  radiusSm: 12,
  shadowCard: "0 6px 20px rgba(76,29,149,0.07)",
  shadowRaised: "0 14px 34px rgba(76,29,149,0.16)",
  shadowFloat: "0 20px 48px rgba(30,20,70,0.24)",
  fontDisplay: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  fontBody: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
  // The GLOOBAL wordmark only. Kept separate from fontDisplay because the
  // wordmark is the one place that needs a genuine 800: Space Grotesk
  // (fontDisplay) tops out at 700, so an 800 asked for there quietly
  // renders as 700. Inter carries a real 800 face and is loaded alongside
  // Space Grotesk in index.html.
  fontWordmark: "Inter, 'Space Grotesk', ui-sans-serif, system-ui, sans-serif"
};
// Money direction, one rule for the whole app: green in, red out.
//
// These existed as an ad-hoc ternary at every list that shows an amount,
// and the ternaries had drifted apart — History coloured a payment out in
// the app's violet accent, the Recent Activity card and Gloobal Bank used
// plain ink, PayLater used ink too, Send Money's recents used a hardcoded
// #14122B. So "money left your account" looked like four different things
// depending on which screen you were on, and on three of them looked like
// ordinary text rather than a debit. Read from here, never re-derived.
//
// TXN_OUT_COLOR is deliberately T.negative rather than the brand accent:
// the accent is used for interactive, positive-intent things all over the
// app (buttons, links, the active tab), so spending it on debits made
// debits read as taps.
var TXN_IN_COLOR = T.positive;
var TXN_OUT_COLOR = T.negative;
// The soft tints that pair with them, for pills, tiles and chips.
var TXN_IN_SOFT = T.positiveSoft;
var TXN_OUT_SOFT = T.negativeSoft;

var C = {
  bgSoft: "#F8F7FC",
  surface: "#FFFFFF",
  ink: "#1A1A2E",
  inkSoft: "#6B7280",
  inkFaint: "#9A94AD",
  accent: "#7C3AED",
  accentDeep: "#4C1D95",
  accentSoft: "#F4F2FB",
  positive: "#159A67",
  positiveSoft: "#E2F6EC",
  negative: "#D8483E",
  negativeSoft: "#FCEAE8",
  line: "#ECE7FB",
  dot: "#D8D2EE",
  // Premium dark map surface: navy/charcoal with a subtle blue gradient,
  // instead of the flat violet block used before.
  mapBg: "linear-gradient(160deg, #0A0E1C 0%, #0E1A2E 45%, #101826 100%)",
  mapLand: "rgba(148,163,184,0.28)",
  mapLandFaint: "rgba(148,163,184,0.12)"
};
var POSITION_COLORS = [
  "#7C3AED",
  // violet (app accent)
  "#EC4899",
  // pink
  "#3B82F6",
  // blue
  "#10B981",
  // green
  "#F59E0B",
  // amber
  "#EF4444",
  // red
  "#06B6D4",
  // cyan
  "#F97316",
  // orange
  "#8B5CF6",
  // purple
  "#14B8A6",
  // teal
  "#D946EF",
  // fuchsia
  "#84CC16"
  // lime
];
var LOGO_FLIP_COLORS = ["#7C3AED", "#DB2777", "#2563EB", "#059669", "#EA580C", "#0891B2", "#DC2626", "#9333EA"];
var DIAL_SYMBOLS = ["\u2212", "+", "\xD7", "=", "\u25CB", "\u25A1", "\u25CF", "\u25A0"];
var DIAL_PAD_SYMBOLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "\u2212", "+", "\xD7", "=", "\u25CB", "\u25A1", "\u25CF", "\u25A0"];
var DIAL_PAD_COLORS = ["#7C3AED", "#3B6EF5", "#C026D3", "#F59E0B", "#10B981", "#EF4444", "#EC4899", "#0EA5E9"];
var BAR_THICKNESS = 34;
var LO = 50 - BAR_THICKNESS / 2;
var HI = 50 + BAR_THICKNESS / 2;
var PLUS_CLIP = `polygon(${LO}% 0%, ${HI}% 0%, ${HI}% ${LO}%, 100% ${LO}%, 100% ${HI}%, ${HI}% ${HI}%, ${HI}% 100%, ${LO}% 100%, ${LO}% ${HI}%, 0% ${HI}%, 0% ${LO}%, ${LO}% ${LO}%)`;
var EQUALS_CLIP = `polygon(0% 15%, 100% 15%, 100% 35%, 0% 35%, 0% 65%, 100% 65%, 100% 85%, 0% 85%)`;
var DIAL_SEGMENTS = ["\u25CB", "\u25CF", "\u25A1", "\u25A0", "*", "\u2212", "\xD7", "=", "DEL"];
var DIAL_SEGMENT_ANGLE = 360 / DIAL_SEGMENTS.length;
var SIGN_TYPES = ["+", "-", "\xD7", "=", "circle", "square"];
var MAX_PARTICLES = 20;
var BOX_SIZES = [14, 18, 24, 32, 40, 52];
var GROWTH_START_SCALE = 1 / 10;
var FIN_SYMBOLS = ["+", "\u2212", "\xD7", "\xF7", "=", "\u20B9", "$", "\u20AC", "\xA3", "\xA5", "%", "#"];
var FIN_NEUTRAL_COLORS = ["#2A2A38", "#1F2333", "#14131F", "#3A3A48", "#20263D"];
var FIN_BRAND_COLORS = [T.accent, T.accent2, "#C026D3"];
var FIN_GEO_SHAPES = [
  { id: 0, type: "circle", x: 10, y: 16, size: 130, duration: 46, color: "#20263D" },
  { id: 1, type: "square", x: 86, y: 24, size: 80, duration: 58, color: "#2A2A38" },
  { id: 2, type: "circle", x: 78, y: 78, size: 100, duration: 40, color: "#1F2333" },
  { id: 3, type: "square", x: 16, y: 82, size: 70, duration: 64, color: "#3A3A48" }
];

