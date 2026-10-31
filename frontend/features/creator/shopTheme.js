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

var SHOP_THEME_KEYS = ["gloobal", "street", "studio", "market", "night", "chai", "mithai", "boutique", "pharmacy", "dhaba", "kirana", "minimal"];

// The four presets. Each is a whole look in one tap — and every field in it
// is separately overridable afterwards, which is the point of D: a preset is
// a starting position, not a cage.
var SHOP_THEMES = {
  gloobal: {
    name: "GLOOBAL",
    note: "The app's own look",
    color: T.accent,
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
  },
  // ── READY THEMES FOR THE SHOPS GLOOBAL IS FOR ──────────────────────────
  // Each sets every dial at once — including the four added with them:
  // buttons, the name card's style, and the cover drawn when there is no
  // photo — so one tap gives a whole, coherent look.
  chai: {
    name: "Chai Stall", note: "Warm, round, a rangoli cover",
    color: "#C2663A", font: "baloo", corners: "round", cards: "raised", density: "cosy",
    photoShape: "circle", dark: false, layout: "list", buttons: "filled", heroStyle: "gradient",
    coverStyle: "pattern", pattern: "rangoli"
  },
  mithai: {
    name: "Mithai", note: "Festive pink, sweets in a grid",
    color: "#A3327E", font: "rozha", corners: "leaf", cards: "raised", density: "cosy",
    photoShape: "rounded", dark: false, layout: "grid", buttons: "soft", heroStyle: "gradient",
    coverStyle: "pattern", pattern: "dots"
  },
  boutique: {
    name: "Boutique", note: "Quiet, tall photos, outlines",
    color: "#5A4636", font: "fraunces", corners: "sharp", cards: "outline", density: "roomy",
    photoShape: "tall", dark: false, layout: "grid", buttons: "outline", heroStyle: "minimal",
    coverStyle: "pattern", pattern: "stripes"
  },
  pharmacy: {
    name: "Pharmacy", note: "Clean, clear, easy to scan",
    color: "#2F7A74", font: "mukta", corners: "soft", cards: "flat", density: "compact",
    photoShape: "rounded", dark: false, layout: "list", buttons: "filled", heroStyle: "solid",
    coverStyle: "pattern", pattern: "grid"
  },
  dhaba: {
    name: "Night Dhaba", note: "Dark, warm, for late hours",
    color: "#C2663A", font: "yatra", corners: "round", cards: "plain", density: "cosy",
    photoShape: "circle", dark: true, layout: "list", buttons: "soft", heroStyle: "glass",
    coverStyle: "gradient", pattern: "dots"
  },
  kirana: {
    name: "Kirana", note: "Green, dense, everything listed",
    color: "#4F7A46", font: "mukta", corners: "soft", cards: "flat", density: "compact",
    photoShape: "rounded", dark: false, layout: "list", buttons: "filled", heroStyle: "solid",
    coverStyle: "pattern", pattern: "dots"
  },
  minimal: {
    name: "Minimal", note: "Just the name and the things",
    color: "#36414E", font: "hind", corners: "sharp", cards: "plain", density: "roomy",
    photoShape: "wide", dark: false, layout: "list", buttons: "outline", heroStyle: "minimal",
    coverStyle: "photo", pattern: "dots"
  }
};

// The four style dials added with the ready themes. The first value of
// each is what a shop saved before they existed gets, which is exactly
// how such a shop already looked.
var SHOP_BUTTON_STYLES = { filled: { name: "Filled" }, outline: { name: "Outline" }, soft: { name: "Soft" } };
var SHOP_HERO_STYLES = { gradient: { name: "Gradient" }, solid: { name: "Solid" }, glass: { name: "Glass" }, minimal: { name: "Minimal" } };
var SHOP_COVER_STYLES = { photo: { name: "Photo" }, gradient: { name: "Colour" }, pattern: { name: "Pattern" } };
var SHOP_PATTERNS = { dots: { name: "Dots" }, stripes: { name: "Stripes" }, rangoli: { name: "Rangoli" }, grid: { name: "Grid" } };

function shopStyleKey(table, value, fallback) {
  return table[value] ? value : (table[fallback] ? fallback : Object.keys(table)[0]);
}

// A cover drawn in the shop's colour, for shops with no photo or that
// chose one. SVG as a data URL, so it costs no request and the CSP's
// img-src data: already allows it.
function shopPatternCss(pattern, color, dark) {
  const ink = encodeURIComponent(dark ? shopHexMix(color, "#FFFFFF", 0.25) : color);
  const tiles = {
    dots: `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='11' cy='11' r='2.4' fill='${ink}' fill-opacity='.35'/></svg>`,
    stripes: `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><path d='M-4 22L22 -4M5 23L23 5' stroke='${ink}' stroke-opacity='.22' stroke-width='3'/></svg>`,
    grid: `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'><path d='M26 0H0V26' fill='none' stroke='${ink}' stroke-opacity='.25' stroke-width='1.4'/><path d='M13 9v8M9 13h8' stroke='${ink}' stroke-opacity='.3' stroke-width='1.6'/></svg>`,
    rangoli: `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52'><g transform='translate(26 26)' fill='${ink}' fill-opacity='.3'>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse rx='3.2' ry='9' transform='rotate(${a}) translate(0 -10)'/>`).join("")}<circle r='3.6'/></g><circle cx='0' cy='0' r='3' fill='${ink}' fill-opacity='.25'/><circle cx='52' cy='0' r='3' fill='${ink}' fill-opacity='.25'/><circle cx='0' cy='52' r='3' fill='${ink}' fill-opacity='.25'/><circle cx='52' cy='52' r='3' fill='${ink}' fill-opacity='.25'/></svg>`
  };
  const tile = tiles[pattern] || tiles.dots;
  const ground = dark ? shopHexMix("#120E0C", color, 0.3) : shopHexMix("#FFFFFF", color, 0.16);
  return `url("data:image/svg+xml,${tile.replace(/#/g, "%23").replace(/"/g, "'")}") ${ground}`;
}

// The Add button and the badge in the shop's chosen style. The PRICE is
// never styled by this — see SHOP_THEME_FORBIDDEN.
function shopButtonStyle(theme) {
  const ink = theme.dark ? theme.color : theme.hero.from;
  if (theme.buttons === "outline") return { background: "transparent", color: ink, boxShadow: `inset 0 0 0 1.5px ${ink}` };
  if (theme.buttons === "soft") return { background: theme.soft, color: ink, boxShadow: "none" };
  return { background: theme.hero.from, color: "#fff", boxShadow: "none" };
}

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
  grotesk: { name: "Space Grotesk", note: "The app's own", stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", weight: 800, family: null },
  fraunces: { name: "Fraunces", note: "Warm, editorial", stack: "'Fraunces', Georgia, serif", weight: 800, family: "Fraunces:wght@800" },
  inter: { name: "Inter", note: "Plain and clear", stack: "Inter, ui-sans-serif, system-ui, sans-serif", weight: 800, family: null },
  mono: { name: "DM Mono", note: "Technical", stack: "'DM Mono', ui-monospace, monospace", weight: 500, family: "DM+Mono:wght@500" },
  // ── FONTS THAT CARRY BOTH SCRIPTS ──────────────────────────────────────
  //
  // The four above are Latin-only: a name like रसोई Ghar set in them drew
  // its Hindi half in whatever the phone had, so the two halves of one
  // name came out in two different typefaces. Every font below draws
  // Devanagari AND Latin from one design, which is what the founder's
  // "Clean / Classic / Bold" suggestions are picked from.
  mukta: { name: "Mukta", note: "Clean", stack: "'Mukta', ui-sans-serif, system-ui, sans-serif", weight: 800, family: "Mukta:wght@800" },
  tiro: { name: "Tiro Devanagari", note: "Classic", stack: "'Tiro Devanagari Hindi', Georgia, serif", weight: 400, family: "Tiro+Devanagari+Hindi" },
  baloo: { name: "Baloo 2", note: "Bold", stack: "'Baloo 2', ui-sans-serif, system-ui, sans-serif", weight: 800, family: "Baloo+2:wght@800" },
  poppins: { name: "Poppins", note: "Round and modern", stack: "'Poppins', ui-sans-serif, system-ui, sans-serif", weight: 700, family: "Poppins:wght@700" },
  hind: { name: "Hind", note: "Plain, newsprint", stack: "'Hind', ui-sans-serif, system-ui, sans-serif", weight: 700, family: "Hind:wght@700" },
  rozha: { name: "Rozha One", note: "Signboard serif", stack: "'Rozha One', Georgia, serif", weight: 400, family: "Rozha+One" },
  yatra: { name: "Yatra One", note: "Festive", stack: "'Yatra One', ui-sans-serif, system-ui, sans-serif", weight: 400, family: "Yatra+One" },
  kalam: { name: "Kalam", note: "Handwritten", stack: "'Kalam', cursive", weight: 700, family: "Kalam:wght@700" },
  teko: { name: "Teko", note: "Tall and tight", stack: "'Teko', ui-sans-serif, system-ui, sans-serif", weight: 600, family: "Teko:wght@600" }
};

// The three suggestions shown under the name while it is being typed, in
// the order the founder named them. Everything else is behind "More fonts".
var SHOP_FONT_QUICK = [
  { key: "mukta", label: "Clean" },
  { key: "tiro", label: "Classic" },
  { key: "baloo", label: "Bold" }
];

// Loads a shop font the first time something draws with it.
//
// index.html loads only the app's own two faces. Fraunces and DM Mono were
// offered by the Look screen from the start and never loaded, so picking
// them changed nothing visible on most phones. One <link> per family, added
// once, with display=swap so a slow connection shows the name in the
// fallback rather than not at all.
function ensureShopFont(key) {
  const f = SHOP_FONTS[key];
  if (!f || !f.family || typeof document === "undefined") return;
  const id = `shop-font-${key}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.family}&display=swap`;
  document.head.appendChild(link);
}

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

// How the things a shop sells are laid out. The owner picks under Look:
// a list reads like a price board, a grid like a shop window. List is the
// default because it is what every shop already had.
var SHOP_LAYOUTS = {
  list: { name: "List" },
  grid: { name: "Grid" }
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

// ── THE SHOP'S COLOUR, AS A PAGE ────────────────────────────────────────
//
// "Shop's own colour": the page takes the colour the owner picked rather
// than the app's lavender, so two shops side by side feel like two places.
// Three small pieces of arithmetic, all on #RRGGBB strings that have
// already been through the palette check above.

function shopHexMix(hex, toward, amount) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (shift) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}

function shopLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// The card behind the shop's name carries WHITE text, so its colour is
// darkened until white reads on it at 4.5:1. Every palette colour already
// passes; the Night preset's gold does not, and without this its name sat
// white-on-mustard.
function shopHeroInk(color) {
  let from = color;
  for (let i = 0; i < 12 && (1.05 / (shopLuminance(from) + 0.05)) < 4.5; i++) {
    from = shopHexMix(from, "#000000", 0.08);
  }
  return { from, to: shopHexMix(from, "#000000", 0.3), glow: `${from}55` };
}

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
  const fontKey = SHOP_FONTS[s.font] ? s.font : base.font;
  const font = SHOP_FONTS[fontKey];
  const corners = SHOP_CORNERS[s.corners] || SHOP_CORNERS[base.corners];
  const cards = ["raised", "flat", "outline", "plain"].indexOf(s.cards) >= 0 ? s.cards : base.cards;
  const density = SHOP_DENSITY[s.density] || SHOP_DENSITY[base.density];
  const photo = SHOP_PHOTO_SHAPES[s.photoShape] || SHOP_PHOTO_SHAPES[base.photoShape];
  const dark = typeof s.dark === "boolean" ? s.dark : base.dark;
  const layout = SHOP_LAYOUTS[s.layout] ? s.layout : (SHOP_LAYOUTS[base.layout] ? base.layout : "list");
  const buttons = shopStyleKey(SHOP_BUTTON_STYLES, s.buttons, base.buttons);
  const heroStyle = shopStyleKey(SHOP_HERO_STYLES, s.heroStyle, base.heroStyle);
  const coverStyle = shopStyleKey(SHOP_COVER_STYLES, s.coverStyle, base.coverStyle);
  const pattern = shopStyleKey(SHOP_PATTERNS, s.pattern, base.pattern);

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
    fontKey,
    corners,
    cards,
    density,
    photo,
    layout,
    buttons,
    heroStyle,
    coverStyle,
    pattern,
    hero: shopHeroInk(color),
    // The page's own surfaces under this theme, washed with the shop's
    // colour: a light shop gets a pale tint of it instead of the app's
    // lavender, a dark shop a near-black leaning toward it. Cards stay
    // white on a light page so prices sit on the same ground everywhere.
    page: dark ? shopHexMix("#120E0C", color, 0.09) : shopHexMix("#FFFFFF", color, 0.07),
    surface: dark ? shopHexMix("#221B17", color, 0.08) : T.surface,
    ink: dark ? "#F3EBE1" : T.ink,
    inkSoft: dark ? "#C3B5A5" : T.inkSoft,
    inkFaint: dark ? "#9A8B7B" : T.inkFaint,
    line: dark ? shopHexMix("#2E2620", color, 0.16) : shopHexMix(T.line, color, 0.18)
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
