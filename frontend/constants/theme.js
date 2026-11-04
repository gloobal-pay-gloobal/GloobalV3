// src/constants/theme.js
//
// ── ONE APP, FIVE THEMES, TWO SIDES ─────────────────────────────────────
//
// Every colour the app draws comes through `T`. `T` used to be a plain
// object of fixed values; it is now a set of GETTERS over whichever
// palette is active, so a screen written as `color: T.accent` recolours
// itself the moment the palette changes, with no screen knowing about
// themes at all.
//
// A theme is a PAIR of palettes: one for the Personal side of the account
// and a different one for the Creator side. "Both at different themes, so
// the user will not get confused and during switch they understand." The
// two share paper and type; they differ in ink (accent, gradients, tints),
// in a slightly warmer paper on the Creator side, and in a woven texture
// on the Creator balance card. Green in / red out stays the rule on both.
//
// applyGloobalTheme(themeKey, side) swaps the active palette. App.jsx calls
// it at the top of its render from the saved theme and the active side,
// and again in an effect for the parts React cannot reach (the page
// background behind the app, the browser's theme-color).
var GLOOBAL_THEME_STATIC = {
  radiusXl: 28,
  radiusLg: 22,
  radiusMd: 16,
  radiusSm: 12,
  fontDisplay: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  fontBody: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
  // The GLOOBAL wordmark only. Kept separate from fontDisplay because the
  // wordmark is the one place that needs a genuine 800: Space Grotesk
  // (fontDisplay) tops out at 700, so an 800 asked for there quietly
  // renders as 700. Inter carries a real 800 face and is loaded alongside
  // Space Grotesk in index.html.
  fontWordmark: "Inter, 'Space Grotesk', ui-sans-serif, system-ui, sans-serif"
};

// Shared by every light palette: the two money colours and the soft tints
// behind them. Dark palettes brighten them so they still read on black.
var GLOOBAL_MONEY_LIGHT = { positive: "#0FA372", positiveSoft: "#E3F8EE", negative: "#E23F45", negativeSoft: "#FCEAEA" };
var GLOOBAL_MONEY_DARK = { positive: "#34D399", positiveSoft: "#113A2E", negative: "#FB7185", negativeSoft: "#3F1A24" };

// A palette. `accentRgb` and the other *Rgb fields are the same colours
// as "r,g,b" so a shadow or wash can be written rgba(${T.accentRgb},0.3)
// and follow the theme; the literal rgba(124,58,237,…) that used to sit in
// sixty places was the violet shadow under every button in every theme.
function gloobalPalette(p) {
  const hexRgb = (hex) => {
    const h = String(hex).replace("#", "");
    return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
  };
  return Object.assign({
    lineSoft: p.dark ? "rgba(255,255,255,0.08)" : "rgba(21,19,42,0.06)",
    accentRgb: hexRgb(p.accent),
    accentDeepRgb: hexRgb(p.accentDeep || p.accent),
    inkRgb: hexRgb(p.ink),
    shadowCard: p.dark ? "0 6px 20px rgba(0,0,0,0.35)" : `0 6px 20px rgba(${hexRgb(p.accentDeep || p.accent)},0.07)`,
    shadowRaised: p.dark ? "0 14px 34px rgba(0,0,0,0.5)" : `0 14px 34px rgba(${hexRgb(p.accentDeep || p.accent)},0.16)`,
    shadowFloat: p.dark ? "0 20px 48px rgba(0,0,0,0.6)" : `0 20px 48px rgba(${hexRgb(p.ink)},0.24)`,
    gradButtonDisabled: p.dark ? "linear-gradient(135deg,#2A2748,#34304F)" : "linear-gradient(135deg,#D9D3F3,#E6DFF8)",
    navBg: p.surface,
    // The Creator side's balance card wears a fine diagonal weave; the
    // Personal side's is plain with a soft light in one corner. Drawn as
    // an overlay by the balance card (see Dashboard).
    cardTexture: p.side === "creator"
      ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0 2px, transparent 2px 9px)"
      : "radial-gradient(circle at 85% 20%, rgba(255,255,255,0.18), transparent 32%)",
    dark: false,
    side: "personal"
  }, p.dark ? GLOOBAL_MONEY_DARK : GLOOBAL_MONEY_LIGHT, p);
}

// The five themes. Each is { key, name, tagline, personal, creator }.
//
// `family` is the theme's own small set of colours (four or five, all
// hex). The tiles, the flip faces and the profile rows used to pick from
// one shared rainbow whatever the theme, so Ocean showed pink and violet
// tiles, Ink showed pastels and Day's shop side mixed mint with gold. They
// pick from the active palette's family now (randomLogoFlipColor and gloobalFamilyColor in backend/utils/color.js), so every
// colour on a screen belongs to the theme it is in. Ink's family is greys:
// on Ink, money (green in, red out) is the only colour left.
var GLOOBAL_THEMES = {
  day: {
    key: "day", name: "Day", tagline: "White paper. Violet for your own money, amber-gold for the shop.",
    personal: gloobalPalette({ side: "personal",
      bg: "#F5F4FB", surface: "#FFFFFF", surfaceAlt: "#F3F1FA", surfaceSunk: "#EEEBF9",
      ink: "#15132A", inkSoft: "#6B6580", inkFaint: "#9C96AF", line: "#EAE6F7",
      accent: "#6D3AE8", accentDeep: "#3B1F9E", accent2: "#3B6EF5", accentSoft: "#F0EBFE",
      gradPrimary: "linear-gradient(135deg,#3B2BB8 0%,#6D3AE8 60%,#8F6BFF 100%)",
      gradWallet: "linear-gradient(150deg,#1E1760 0%,#3B2BB8 42%,#6D3AE8 78%,#9C7BFF 100%)",
      gradButton: "linear-gradient(135deg,#5B34E0 0%,#7A4DF2 100%)",
      family: ["#6D3AE8", "#3B6EF5", "#0891B2", "#A855F7", "#DB2777"]}),
    creator: gloobalPalette({ side: "creator",
      bg: "#FCF8F1", surface: "#FFFFFF", surfaceAlt: "#F7F1E4", surfaceSunk: "#F1E9D8",
      ink: "#22180C", inkSoft: "#746A58", inkFaint: "#A69C88", line: "#F0E8D6",
      accent: "#D98A00", accentDeep: "#7A4300", accent2: "#D7541A", accentSoft: "#FDF1DA",
      gradPrimary: "linear-gradient(135deg,#9A5200 0%,#D98A00 55%,#F4B53A 100%)",
      gradWallet: "linear-gradient(150deg,#4A1F00 0%,#8F4A00 40%,#D98A00 78%,#F6BE3B 100%)",
      gradButton: "linear-gradient(135deg,#C97800 0%,#EFA820 100%)",
      family: ["#D98A00", "#E4572E", "#0F9D8A", "#C2410C", "#B7791F"]})
  },
  // 0233: Lotus replaces Night. The founder: "Remove black theme, try
  // something better." Blush paper; the lotus's pink for your own money
  // and its leaf's green for the shop — one flower, two colours, so the
  // side you are on is plain and it still reads as one app. Anyone whose
  // saved theme was Night opens on Lotus (readGloobalThemePref).
  lotus: {
    key: "lotus", name: "Lotus", tagline: "Blush paper. Lotus pink for your own money, leaf green for the shop.",
    personal: gloobalPalette({ side: "personal",
      bg: "#FBF2F6", surface: "#FFFFFF", surfaceAlt: "#F7E8EF", surfaceSunk: "#F2DFE8",
      ink: "#2A1220", inkSoft: "#7E5F6E", inkFaint: "#AE94A1", line: "#F1DCE6",
      accent: "#C2185B", accentDeep: "#7A0E3A", accent2: "#8E24AA", accentSoft: "#FCE4EE",
      gradPrimary: "linear-gradient(135deg,#7A0E3A 0%,#C2185B 58%,#EC6A9C 100%)",
      gradWallet: "linear-gradient(150deg,#4A0A27 0%,#8E1450 42%,#C2185B 78%,#EC6A9C 100%)",
      gradButton: "linear-gradient(135deg,#B0154F 0%,#E04A85 100%)",
      family: ["#C2185B", "#8E24AA", "#E8590C", "#D6336C", "#7B1FA2"]}),
    creator: gloobalPalette({ side: "creator",
      bg: "#F2F8F1", surface: "#FFFFFF", surfaceAlt: "#E6F1E4", surfaceSunk: "#DCEBD9",
      ink: "#12230F", inkSoft: "#5C7558", inkFaint: "#8FA58B", line: "#DCEAD8",
      accent: "#2E7D32", accentDeep: "#1B4D1F", accent2: "#C2185B", accentSoft: "#E3F2E1",
      gradPrimary: "linear-gradient(135deg,#1B4D1F 0%,#2E7D32 55%,#6CBF5E 100%)",
      gradWallet: "linear-gradient(150deg,#0E2A11 0%,#1B4D1F 42%,#2E7D32 78%,#6CBF5E 100%)",
      gradButton: "linear-gradient(135deg,#276B2B 0%,#43A047 100%)",
      family: ["#2E7D32", "#558B2F", "#00897B", "#827717", "#33691E"]})
  },
  tiranga: {
    key: "tiranga", name: "Tiranga", tagline: "Cream paper. Saffron for you, chakra blue for the shop — the flag's two inks.",
    personal: gloobalPalette({ side: "personal",
      bg: "#FBF6EE", surface: "#FFFFFF", surfaceAlt: "#F6EEE0", surfaceSunk: "#F0E6D4",
      ink: "#241B12", inkSoft: "#7A6A58", inkFaint: "#A89883", line: "#EFE4D2",
      accent: "#E8701E", accentDeep: "#9A3E12", accent2: "#0E8A5F", accentSoft: "#FDEBDD",
      gradPrimary: "linear-gradient(135deg,#B8480F 0%,#E8701E 60%,#F6A54A 100%)",
      gradWallet: "linear-gradient(150deg,#6B2A0A 0%,#B8480F 45%,#E8701E 80%,#F6A54A 100%)",
      gradButton: "linear-gradient(135deg,#D7541A 0%,#F08A2E 100%)",
      family: ["#E8701E", "#138A5E", "#1F4FA3", "#F59E0B", "#0E7490"]}),
    creator: gloobalPalette({ side: "creator",
      bg: "#F1F5FA", surface: "#FFFFFF", surfaceAlt: "#E8EEF6", surfaceSunk: "#DFE7F1",
      ink: "#121C2E", inkSoft: "#5A6680", inkFaint: "#8C97AE", line: "#DEE5F0",
      accent: "#1F4FA3", accentDeep: "#15336F", accent2: "#E2661E", accentSoft: "#E3EBF9",
      gradPrimary: "linear-gradient(135deg,#15336F 0%,#1F4FA3 55%,#3C7BE0 100%)",
      gradWallet: "linear-gradient(150deg,#0B1A3A 0%,#15336F 45%,#1F4FA3 82%,#3C7BE0 100%)",
      gradButton: "linear-gradient(135deg,#1B3F85 0%,#2E63C4 100%)",
      family: ["#1F4FA3", "#138A5E", "#E8701E", "#3C7BE0", "#0E7490"]})
  },
  ocean: {
    key: "ocean", name: "Ocean", tagline: "Sea-glass paper. Deep teal for your own money, coral for the shop.",
    personal: gloobalPalette({ side: "personal",
      bg: "#EFF7F8", surface: "#FFFFFF", surfaceAlt: "#E6F1F3", surfaceSunk: "#DCEAED",
      ink: "#0F2A30", inkSoft: "#5A747A", inkFaint: "#8FA6AB", line: "#DDEAEC",
      accent: "#0E7C86", accentDeep: "#0B4F5C", accent2: "#2563EB", accentSoft: "#DDF1F3",
      gradPrimary: "linear-gradient(135deg,#0B4F5C 0%,#0E7C86 55%,#2BB5B8 100%)",
      gradWallet: "linear-gradient(150deg,#062A33 0%,#0B4F5C 42%,#0E7C86 80%,#2BB5B8 100%)",
      gradButton: "linear-gradient(135deg,#0B6670 0%,#15A0A8 100%)",
      family: ["#0E7C86", "#2563EB", "#0EA5E9", "#14B8A6", "#6366F1"]}),
    creator: gloobalPalette({ side: "creator",
      bg: "#FCF4EE", surface: "#FFFFFF", surfaceAlt: "#F8EBE1", surfaceSunk: "#F3E2D5",
      ink: "#2A1A12", inkSoft: "#7C6558", inkFaint: "#AD988C", line: "#F0E0D4",
      accent: "#E8553F", accentDeep: "#9A2E1C", accent2: "#0E7C86", accentSoft: "#FDE6E0",
      gradPrimary: "linear-gradient(135deg,#9A2E1C 0%,#E8553F 55%,#F7925E 100%)",
      gradWallet: "linear-gradient(150deg,#3D140C 0%,#9A2E1C 42%,#E8553F 80%,#F7925E 100%)",
      gradButton: "linear-gradient(135deg,#D1432F 0%,#F07A4A 100%)",
      family: ["#E8553F", "#F59E0B", "#0E7C86", "#EC4899", "#F97316"]})
  },
  ink: {
    key: "ink", name: "Ink", tagline: "No colour but money's. Black on white for you; graphite on stone for the shop.",
    personal: gloobalPalette({ side: "personal",
      bg: "#F4F4F3", surface: "#FFFFFF", surfaceAlt: "#EDEDEC", surfaceSunk: "#E6E6E6",
      ink: "#111111", inkSoft: "#5C5C5C", inkFaint: "#9A9A9A", line: "#E3E3E1",
      accent: "#111111", accentDeep: "#000000", accent2: "#444444", accentSoft: "#EAEAEA",
      gradPrimary: "linear-gradient(135deg,#000000 0%,#1A1A1A 55%,#333333 100%)",
      gradWallet: "linear-gradient(150deg,#000000 0%,#1A1A1A 55%,#333333 100%)",
      gradButton: "linear-gradient(135deg,#000000 0%,#2A2A2A 100%)",
      family: ["#111111", "#3F3F46", "#57534E", "#27272A"]}),
    // 0233: the shop side was a black page; it is stone-grey paper now,
    // with graphite ink and the creator weave on the card — still no
    // colour but money's, and still plainly the other side.
    creator: gloobalPalette({ side: "creator",
      bg: "#E9E7E2", surface: "#F8F7F4", surfaceAlt: "#E2DFD9", surfaceSunk: "#DAD7D0",
      ink: "#1A1917", inkSoft: "#5E5B56", inkFaint: "#97938C", line: "#D9D6CF",
      accent: "#2A2826", accentDeep: "#0F0E0D", accent2: "#55524D", accentSoft: "#E0DDD7",
      gradPrimary: "linear-gradient(135deg,#1C1B19 0%,#3A3835 55%,#5E5B56 100%)",
      gradWallet: "linear-gradient(150deg,#1C1B19 0%,#3A3835 50%,#6B6762 100%)",
      gradButton: "linear-gradient(135deg,#2A2826 0%,#4A4743 100%)",
      family: ["#1F1F1F", "#4B4B4B", "#6E6A64", "#2E2C2A"]})
  }
};
var GLOOBAL_THEME_ORDER = ["day", "lotus", "tiranga", "ocean", "ink"];
var GLOOBAL_THEME_DEFAULT = "day";
var GLOOBAL_THEME_PREF_KEY = "gloobal.theme.v1";

// The palette in force. Starts on Day · Personal so the first paint, before
// App has read the saved choice, is the look the app has always had.
var GLOOBAL_THEME_ACTIVE = { key: GLOOBAL_THEME_DEFAULT, side: "personal" };
var GLOOBAL_PALETTE_ACTIVE = Object.assign({}, GLOOBAL_THEME_STATIC, GLOOBAL_THEMES.day.personal);

// `T`: every key of a palette, as a getter over the active one.
var T = {};
(function buildT() {
  const keys = new Set(Object.keys(GLOOBAL_THEME_STATIC));
  for (const theme of Object.values(GLOOBAL_THEMES)) {
    for (const k of Object.keys(theme.personal)) keys.add(k);
    for (const k of Object.keys(theme.creator)) keys.add(k);
  }
  for (const k of keys) {
    Object.defineProperty(T, k, { enumerable: true, get() { return GLOOBAL_PALETTE_ACTIVE[k]; } });
  }
  // Money direction, one rule for the whole app: green in, red out — see
  // TXN_IN_COLOR below. Exposed here too so a palette change reaches them.
  Object.defineProperty(T, "txnIn", { enumerable: true, get() { return GLOOBAL_PALETTE_ACTIVE.positive; } });
  Object.defineProperty(T, "txnOut", { enumerable: true, get() { return GLOOBAL_PALETTE_ACTIVE.negative; } });
  Object.defineProperty(T, "txnInSoft", { enumerable: true, get() { return GLOOBAL_PALETTE_ACTIVE.positiveSoft; } });
  Object.defineProperty(T, "txnOutSoft", { enumerable: true, get() { return GLOOBAL_PALETTE_ACTIVE.negativeSoft; } });
  Object.defineProperty(T, "themeKey", { enumerable: true, get() { return GLOOBAL_THEME_ACTIVE.key; } });
})();

function readGloobalThemePref() {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(GLOOBAL_THEME_PREF_KEY) : null;
    // 0233: Night was retired; whoever chose it opens on Lotus.
    const saved = raw === "night" ? "lotus" : raw;
    return saved && GLOOBAL_THEMES[saved] ? saved : GLOOBAL_THEME_DEFAULT;
  } catch (e) {
    return GLOOBAL_THEME_DEFAULT;
  }
}
function saveGloobalThemePref(key) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(GLOOBAL_THEME_PREF_KEY, key); } catch (e) { /* private mode */ }
}

// Swap the active palette. Idempotent and cheap, so App may call it on
// every render. Returns true when something actually changed.
function applyGloobalTheme(themeKey, side) {
  const key = GLOOBAL_THEMES[themeKey] ? themeKey : GLOOBAL_THEME_DEFAULT;
  const which = side === "creator" ? "creator" : "personal";
  if (GLOOBAL_THEME_ACTIVE.key === key && GLOOBAL_THEME_ACTIVE.side === which) return false;
  GLOOBAL_THEME_ACTIVE = { key, side: which };
  GLOOBAL_PALETTE_ACTIVE = Object.assign({}, GLOOBAL_THEME_STATIC, GLOOBAL_THEMES[key][which]);
  return true;
}
// The parts of the page React does not own: the ground behind the app
// (what shows past the edges and during overscroll), the browser's own
// bar colour, and the colour-scheme hint for native controls.
function paintGloobalThemeChrome() {
  if (typeof document === "undefined") return;
  const p = GLOOBAL_PALETTE_ACTIVE;
  document.documentElement.style.background = p.bg;
  document.body.style.background = p.bg;
  document.body.style.color = p.ink;
  document.documentElement.style.colorScheme = p.dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.dark ? p.bg : p.accent);
}

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
// These were plain `var`s copied from T at load, which a theme change
// could never reach. Every use now reads T.txnIn / T.txnOut (getters);
// the names are kept as a one-line reminder of where the rule lives.
var TXN_RULE = "green in, red out — read T.txnIn / T.txnOut";

var C = {
  dot: "#D8D2EE",
  // Premium dark map surface: navy/charcoal with a subtle blue gradient,
  // instead of the flat violet block used before. The map is one place
  // that stays its own colour in every theme — a map is a map.
  mapBg: "linear-gradient(160deg, #0A0E1C 0%, #0E1A2E 45%, #101826 100%)",
  mapLand: "rgba(148,163,184,0.28)",
  mapLandFaint: "rgba(148,163,184,0.12)"
};
// Coverage's own palette used to be a second copy of the app's with its
// own slightly different greys. It reads the theme now.
(function bindC() {
  const map = { bgSoft: "surfaceAlt", surface: "surface", ink: "ink", inkSoft: "inkSoft", inkFaint: "inkFaint", accent: "accent", accentDeep: "accentDeep", accentSoft: "accentSoft", positive: "positive", positiveSoft: "positiveSoft", negative: "negative", negativeSoft: "negativeSoft", line: "line" };
  for (const [k, tk] of Object.entries(map)) Object.defineProperty(C, k, { enumerable: true, get() { return T[tk]; } });
})();
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
// How much slower every flip in the app turns and waits than it was
// built at. The founder asked for slower flips everywhere; one number so
// the marks keep turning in step with each other.
var FLIP_SLOW = 1.6;
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

