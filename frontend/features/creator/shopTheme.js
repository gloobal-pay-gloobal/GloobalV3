// src/features/creator/shopTheme.js
//
// A SHOP'S OWN LOOK, AND THE LINE IT MAY NOT CROSS.
//
// One creator's page should be able to look like a tea stall and another's
// like a tailor's studio. This module turns the handful of choices an owner
// makes — a theme, then colour, type, corners, cards, density, photo shape —
// into the concrete values CreatorPage draws with.
//
// ── THE RULE THAT MAKES THE REST SAFE ───────────────────────────────────
//
// A theme may change how a shop LOOKS. It may never change how MONEY READS.
//
// Every value this module produces is for chrome: the cover band, the mark,
// the name, the category chips, the add buttons, the badges, the card edges.
// The price, the GEU pair, the cart total and the Pay button are drawn from
// the app's own tokens in every shop, under every theme, and nothing here
// reaches them.
//
// That is not tidiness. A customer walking between two Gloobal shops has to
// be able to read a figure the same way in both, and the one thing a shop
// must not be able to restyle is its own total — a shop that could would be
// a shop that could make 550 read as 55. The tests assert it, and
// shopThemeGuard below is the list they assert against.
//
// Everything degrades to the app's own look: an unknown theme, a malformed
// colour, a profile saved before this feature existed all resolve to
// GLOOBAL_SHOP_THEME, which is the purple the app already is.

var SHOP_THEME_KEYS = ["gloobal", "street", "studio", "market", "night"];

// The four presets. Each is a whole look in one tap — and every field in it
// is separately overridable afterwards, which is the point of D: a preset is
// a starting position, not a cage.
var SHOP_THEMES = {
  gloobal: {
    name: "Gloobal",
    note: "The app's own look",
    color: "#7C3AED",
    font: "grotesk",
    corners: "round",
    cards: "raised",
    density: "cosy",
    photoShape: "rounded",
    dark: false
  },
  street: {
    name: "Street",
    note: "Warm, round, photo-led",
    color: "#C2663A",
    font: "grotesk",
    corners: "round",
    cards: "raised",
    density: "cosy",
    photoShape: "rounded",
    dark: false
  },
  studio: {
    name: "Studio",
    note: "Quiet, sharp, lots of air",
    color: "#36414E",
    font: "fraunces",
    corners: "sharp",
    cards: "outline",
    density: "roomy",
    photoShape: "wide",
    dark: false
  },
  market: {
    name: "Market",
    note: "Bold, dense, high contrast",
    color: "#1F6B4B",
    font: "inter",
    corners: "soft",
    cards: "flat",
    density: "compact",
    photoShape: "rounded",
    dark: false
  },
  night: {
    name: "Night",
    note: "Dark, for late shops",
    color: "#C8A24E",
    font: "mono",
    corners: "round",
    cards: "plain",
    density: "cosy",
    photoShape: "circle",
    dark: true
  }
};

// The twelve a shop may pick from.
//
// A fixed palette rather than a colour wheel, and that is deliberate: every
// one of these has been checked to carry white text at the weights this app
// sets, so no owner can accidentally choose a yellow that makes their own
// Add button unreadable. The freedom worth having is "which of these", not
// "any of sixteen million, including the broken ones".
var SHOP_COLORS = [
  "#C2663A", "#B2473F", "#9A6A2F", "#4F7A46",
  "#2F7A74", "#2E5E9E", "#4A4BA8", "#7C3AED",
  "#A3327E", "#5A4636", "#36414E", "#1F6B4B"
];

var SHOP_FONTS = {
  grotesk: { name: "Space Grotesk", note: "The app's own", stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", weight: 800 },
  fraunces: { name: "Fraunces", note: "Warm, editorial", stack: "'Fraunces', Georgia, serif", weight: 800 },
  inter: { name: "Inter", note: "Plain and clear", stack: "Inter, ui-sans-serif, system-ui, sans-serif", weight: 800 },
  mono: { name: "DM Mono", note: "Technical", stack: "'DM Mono', ui-monospace, monospace", weight: 500 }
};

// Corner radii, in px. "leaf" is the one asymmetric option — three rounded
// corners and one square — which reads as a deliberate mark rather than as a
// rounding mistake, and costs nothing to support because it is still one
// borderRadius string.
var SHOP_CORNERS = {
  sharp: { name: "Sharp", card: "2px", pill: "4px", mark: "4px", photo: "2px" },
  soft: { name: "Soft", card: "9px", pill: "9px", mark: "10px", photo: "8px" },
  round: { name: "Round", card: "18px", pill: "12px", mark: "20px", photo: "15px" },
  leaf: { name: "Leaf", card: "20px 20px 20px 4px", pill: "12px", mark: "22px 22px 22px 5px", photo: "16px 16px 16px 4px" }
};

var SHOP_DENSITY = {
  compact: { name: "Compact", rowPad: "7px 10px", gap: 6, thumb: 46, sectionGap: 13 },
  cosy: { name: "Cosy", rowPad: "10px 12px", gap: 9, thumb: 54, sectionGap: 18 },
  roomy: { name: "Roomy", rowPad: "15px 16px", gap: 13, thumb: 60, sectionGap: 24 }
};

var SHOP_PHOTO_SHAPES = {
  rounded: { name: "Rounded", ratio: 1, radius: null },
  circle: { name: "Circle", ratio: 1, radius: "50%" },
  wide: { name: "Wide", ratio: 1.45, radius: null },
  tall: { name: "Tall", ratio: 0.74, radius: null }
};

// ── THE GUARD ───────────────────────────────────────────────────────────
//
// The names of every surface a theme is allowed to touch. Anything a shop
// can restyle must appear here; anything to do with money must not. It
// exists so the rule at the top of this file is a list a test can read
// rather than a sentence somebody has to remember.
var SHOP_THEME_SURFACES = [
  "cover", "mark", "name", "tagline", "chip", "sectionHeading",
  "card", "cardEdge", "thumb", "addButton", "badge", "announce"
];

// And the ones it must never reach, for the same reason.
var SHOP_THEME_FORBIDDEN = ["price", "geuPair", "cartTotal", "payButton"];

function shopThemeBase(key) {
  return SHOP_THEMES[key] || SHOP_THEMES.gloobal;
}

// A stored colour is only honoured if it is one of ours.
//
// Not fussiness: this string is interpolated into a style attribute, and the
// palette is the whole validation. An arbitrary value out of the database
// would be a place for something that is not a colour to end up in CSS.
function shopThemeColor(value, fallback) {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  for (const c of SHOP_COLORS) if (c.toUpperCase() === raw) return c;
  return fallback;
}

// Everything a shop stored, resolved into values a component can use.
//
// Each field falls back to its preset, and the preset falls back to Gloobal,
// so a half-written settings object from an older version of the app renders
// as the app's own look rather than as a hole.
function resolveShopTheme(shop) {
  const s = shop && typeof shop === "object" ? shop : {};
  const key = SHOP_THEME_KEYS.indexOf(s.theme) >= 0 ? s.theme : "gloobal";
  const base = shopThemeBase(key);

  const color = shopThemeColor(s.color, base.color);
  const font = SHOP_FONTS[s.font] || SHOP_FONTS[base.font];
  const corners = SHOP_CORNERS[s.corners] || SHOP_CORNERS[base.corners];
  const cards = ["raised", "flat", "outline", "plain"].indexOf(s.cards) >= 0 ? s.cards : base.cards;
  const density = SHOP_DENSITY[s.density] || SHOP_DENSITY[base.density];
  const photo = SHOP_PHOTO_SHAPES[s.photoShape] || SHOP_PHOTO_SHAPES[base.photoShape];
  const dark = typeof s.dark === "boolean" ? s.dark : base.dark;

  // A soft wash of the shop's colour, for chip and badge backgrounds. Mixed
  // against the page rather than stored, so one stored colour is enough and a
  // dark shop gets a dark wash rather than a pale one that would glare.
  const soft = dark ? `${color}2E` : `${color}1A`;

  return {
    key,
    name: base.name,
    note: base.note,
    color,
    soft,
    dark,
    font,
    corners,
    cards,
    density,
    photo,
    // The page's own surfaces under this theme. A dark shop is the only
    // thing that moves these; everything else inherits the app's palette so
    // a themed shop still sits inside Gloobal rather than replacing it.
    page: dark ? "#17120F" : T.bg,
    surface: dark ? "#241D18" : T.surface,
    ink: dark ? "#F3EBE1" : T.ink,
    inkSoft: dark ? "#C3B5A5" : T.inkSoft,
    inkFaint: dark ? "#9A8B7B" : T.inkFaint,
    line: dark ? "#352B23" : T.line
  };
}

// The edge treatment, as a style fragment. Four looks from one switch, so a
// card cannot end up raised AND outlined by two settings disagreeing.
function shopCardStyle(theme) {
  const base = { borderRadius: theme.corners.card, background: theme.surface };
  if (theme.cards === "raised") return { ...base, boxShadow: theme.dark ? "0 2px 10px rgba(0,0,0,.35)" : T.shadowCard };
  if (theme.cards === "outline") return { ...base, background: "none", border: `1.5px solid ${theme.line}` };
  if (theme.cards === "flat") return { ...base, background: theme.dark ? "#2C241E" : T.surfaceAlt };
  // plain: no fill, no edge — just the row, separated by space
  return { borderRadius: theme.corners.card, background: "none" };
}

// The thumbnail's box for a given photo shape. Width is the density's thumb
// size; height follows the shape's ratio, so "wide" is wider than it is tall
// and the row's height follows rather than the photo being squashed into a
// square it was not framed for.
function shopThumbBox(theme) {
  const w = theme.density.thumb;
  const h = Math.round(w / (theme.photo.ratio || 1));
  return {
    width: theme.photo.ratio >= 1 ? Math.round(h * theme.photo.ratio) : w,
    height: theme.photo.ratio >= 1 ? h : Math.round(w / theme.photo.ratio),
    borderRadius: theme.photo.radius || theme.corners.photo
  };
}

// Is this announcement worth drawing? Blank text means the owner cleared it,
// which is the same as switching it off and must not leave a coloured band
// with nothing in it.
function shopAnnouncement(shop) {
  const s = shop && typeof shop === "object" ? shop : {};
  const text = typeof s.announceText === "string" ? s.announceText.trim() : "";
  if (!text || s.announceOn === false) return null;
  return { text, color: shopThemeColor(s.announceColor, resolveShopTheme(s).color) };
}
