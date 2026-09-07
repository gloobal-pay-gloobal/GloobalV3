// src/constants/theme.js
// The app's background, and the field printed on it.
//
// ── Why the field lives in the TOKEN and not in a layer ──────────────────
//
// The obvious way to put the splash's symbol field behind the whole app is
// one fixed layer at the back. It does not work here. Every full screen in
// this app is an OPAQUE sheet at `position:fixed; inset:0; background:
// T.bg`, and they stack: the Dashboard root at zIndex 100, Recharge at 60,
// the GH menu at 300, ID history at 320. A layer behind them is hidden by
// the first one that mounts, and making them transparent instead would let
// each overlay show the screen underneath it rather than the field — a bug,
// not a style.
//
// Painting the field INTO the token means every one of those sheets carries
// it, overlays included, with no call site changed. The cost is that a
// painted background cannot animate per mark; the Dashboard adds real
// drifting marks on top of this for that (AppSymbolField).
//
// The marks are the same eight dial symbols in the same eight dial-pad
// colours as the splash, at 13-24% opacity — about half the splash's.
//
// This started at 3.5-7.5%, chosen off the contrast arithmetic alone, and
// it was invisible. A background you cannot see is not a safe background,
// it is an absent one, and the whole point was to carry the splash's look
// through the app. So the real constraint is a floor AND a ceiling.
//
// The ceiling: inkFaint (#9C96AF) on the flat colour is already only
// 2.62:1, under the 4.5:1 small text should clear. At the splash's own 46%
// a mark behind a timestamp drops it to 1.28:1 — the same line legible in
// one place and not another, which is worse than uniformly low. At 24% it
// is 1.86:1 for the darkest colour, so the marks are also placed to sit in
// the open rather than tile the screen: 16 of them, none dense enough to
// put a full line of text on top of one.
var BG_FLAT = "#F6F5FC";
var BG_FIELD_URI = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22390%22%20height%3D%22844%22%20viewBox%3D%220%200%20390%20844%22%3E%3Ctext%20x%3D%22348.0%22%20y%3D%2247.7%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2246%22%20fill%3D%22%23F59E0B%22%20fill-opacity%3D%220.218%22%20transform%3D%22rotate%28-3%20348.0%2047.7%29%22%3E%E2%96%A0%3C%2Ftext%3E%3Ctext%20x%3D%2286.4%22%20y%3D%2296.2%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2227%22%20fill%3D%22%23F59E0B%22%20fill-opacity%3D%220.233%22%20transform%3D%22rotate%284%2086.4%2096.2%29%22%3E%E2%97%8B%3C%2Ftext%3E%3Ctext%20x%3D%22207.5%22%20y%3D%22106.6%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2243%22%20fill%3D%22%237C3AED%22%20fill-opacity%3D%220.143%22%20transform%3D%22rotate%28-15%20207.5%20106.6%29%22%3E%E2%88%92%3C%2Ftext%3E%3Ctext%20x%3D%2254.9%22%20y%3D%22179.2%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2227%22%20fill%3D%22%237C3AED%22%20fill-opacity%3D%220.195%22%20transform%3D%22rotate%28-13%2054.9%20179.2%29%22%3E%2B%3C%2Ftext%3E%3Ctext%20x%3D%2269.6%22%20y%3D%22228.9%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2230%22%20fill%3D%22%23F59E0B%22%20fill-opacity%3D%220.165%22%20transform%3D%22rotate%2816%2069.6%20228.9%29%22%3E%E2%96%A0%3C%2Ftext%3E%3Ctext%20x%3D%2294.6%22%20y%3D%22279.2%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2269%22%20fill%3D%22%23EC4899%22%20fill-opacity%3D%220.236%22%20transform%3D%22rotate%28-4%2094.6%20279.2%29%22%3E%3D%3C%2Ftext%3E%3Ctext%20x%3D%22108.7%22%20y%3D%22344.8%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2253%22%20fill%3D%22%23EF4444%22%20fill-opacity%3D%220.201%22%20transform%3D%22rotate%28-11%20108.7%20344.8%29%22%3E%E2%96%A1%3C%2Ftext%3E%3Ctext%20x%3D%22369.7%22%20y%3D%22374.4%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2225%22%20fill%3D%22%237C3AED%22%20fill-opacity%3D%220.179%22%20transform%3D%22rotate%28-14%20369.7%20374.4%29%22%3E%E2%96%A0%3C%2Ftext%3E%3Ctext%20x%3D%22103.2%22%20y%3D%22452.5%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2267%22%20fill%3D%22%23C026D3%22%20fill-opacity%3D%220.143%22%20transform%3D%22rotate%2815%20103.2%20452.5%29%22%3E%E2%96%A1%3C%2Ftext%3E%3Ctext%20x%3D%22200.3%22%20y%3D%22511.9%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2258%22%20fill%3D%22%233B6EF5%22%20fill-opacity%3D%220.180%22%20transform%3D%22rotate%28-10%20200.3%20511.9%29%22%3E%3D%3C%2Ftext%3E%3Ctext%20x%3D%22304.0%22%20y%3D%22578.2%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2272%22%20fill%3D%22%23EF4444%22%20fill-opacity%3D%220.148%22%20transform%3D%22rotate%28-13%20304.0%20578.2%29%22%3E%E2%96%A0%3C%2Ftext%3E%3Ctext%20x%3D%2297.6%22%20y%3D%22611.4%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2237%22%20fill%3D%22%237C3AED%22%20fill-opacity%3D%220.169%22%20transform%3D%22rotate%28-1%2097.6%20611.4%29%22%3E%E2%97%8F%3C%2Ftext%3E%3Ctext%20x%3D%22258.3%22%20y%3D%22659.0%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2256%22%20fill%3D%22%233B6EF5%22%20fill-opacity%3D%220.144%22%20transform%3D%22rotate%284%20258.3%20659.0%29%22%3E%E2%97%8B%3C%2Ftext%3E%3Ctext%20x%3D%22220.8%22%20y%3D%22699.2%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2247%22%20fill%3D%22%230EA5E9%22%20fill-opacity%3D%220.207%22%20transform%3D%22rotate%28-6%20220.8%20699.2%29%22%3E%E2%97%8B%3C%2Ftext%3E%3Ctext%20x%3D%22338.7%22%20y%3D%22767.2%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2220%22%20fill%3D%22%23EC4899%22%20fill-opacity%3D%220.133%22%20transform%3D%22rotate%283%20338.7%20767.2%29%22%3E%2B%3C%2Ftext%3E%3Ctext%20x%3D%22234.5%22%20y%3D%22841.0%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2238%22%20fill%3D%22%237C3AED%22%20fill-opacity%3D%220.207%22%20transform%3D%22rotate%2817%20234.5%20841.0%29%22%3E%2B%3C%2Ftext%3E%3C%2Fsvg%3E";
var T = {
  // The painted field. Every screen and overlay that says `background: T.bg`
  // gets it for free.
  bg: `${BG_FLAT} url("${BG_FIELD_URI}") center / cover no-repeat`,
  // The flat colour with no field, for the two places that must not have
  // one: registration and login (asked for explicitly), and the splash,
  // which already runs its own live field and would otherwise draw two.
  bgPlain: BG_FLAT,
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

