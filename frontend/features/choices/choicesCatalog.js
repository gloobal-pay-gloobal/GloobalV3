// src/features/choices/choicesCatalog.js
//
// My Choices — the pure half. Palettes, the emoji set, and the small
// derivations the screens share. No React, no network, no state: everything
// here is a function of its arguments, which is what makes it the only part
// of this feature that can be reasoned about without a browser.
//
// ── WHERE A CATEGORY'S FIGURES COME FROM ───────────────────────────────
//
// Two sources, deliberately, and they answer different questions:
//
//   the server's rollup   every payment ever filed under this category,
//                         aggregated from the tag table. Survives history
//                         paging — an account with two years of payments
//                         still gets a true lifetime total.
//
//   the loaded history    the rows the app already holds. Carries the
//                         counterparty, the date and the method, which the
//                         rollup does not, so it is what the list and the
//                         month chart are drawn from.
//
// They are never added together and neither is derived from the other. The
// hero reads the rollup; the list and the chart read history. Where both can
// answer — "spent this month" — the rollup wins, because it is complete.

// The tile tints. Pastel on purpose: a category tile carries an emoji and a
// name, and a saturated ground makes both harder to read.
var CHOICES_TINTS = [
  "#FBD0DC", "#F9C2D1", "#F5BBD0", "#E5DEFB",
  "#E0D4F7", "#C5D9F5", "#A9DCEE", "#A8E6E0",
  "#A8E0B0", "#BBE8C4", "#FBE7A8", "#FBDCC4",
  "#F9B499", "#F7C8C0", "#DBDDE4", "#D6D2E8"
];

// Offered when someone is picking an icon. Not exhaustive and not meant to
// be — a category can hold any emoji the keyboard produces; this is just the
// shortcut.
var CHOICES_EMOJI = [
  "\u{1F354}", "\u{1F476}", "\u{1F3E0}", "\u{1F697}", "\u{1FA7A}",
  "\u{1F4F1}", "\u{1F393}", "\u{1F455}", "\u{1F3AC}", "\u{1F381}",
  "\u{1F484}", "\u{1F9FE}", "✈️", "\u{1F6D2}", "\u{1F43E}",
  "\u{1F4BC}", "\u{1F4BB}", "\u{1F4C8}", "\u{1F3E2}", "\u{1F6E1}️"
];

// The shapes a category's tile can take.
//
// Ten, laid out as two rows of five. The first five are the symmetrical
// family — the same corner everywhere, from nearly square to fully
// round. The second five each break the symmetry in one deliberate way,
// which is what makes a grid of tiles read as a composition rather than
// as a column of identical boxes.
//
// Every one of them is only four numbers, so nothing downstream had to
// change to accept them: the stroke already traces four independent
// radii, and the corner controls already ask each corner how far in
// they have to sit.
//
// ── WHY MULTIPLIERS AND NOT PIXELS ───────────────────────────────────
//
// The same shape is drawn at two very different sizes — a 170px tile in
// the grid and a 56px chip above the Send button. A radius in pixels
// that reads as "soft" on the tile is nearly a circle on the chip. So a
// shape is a multiplier of whatever base radius its surface already
// uses (20px on the tile, 18px on the chip), which keeps the FAMILY
// recognisable at both sizes without either one dictating the other.
//
// Corners run top-left, top-right, bottom-right, bottom-left — the same
// order as the CSS border-radius shorthand, so the two cannot drift.
var CHOICES_SHAPES = [
  { key: "rounded", label: "Rounded", corners: [1, 1, 1, 1] },
  { key: "soft", label: "Soft", corners: [1.75, 1.75, 1.75, 1.75] },
  { key: "sharp", label: "Sharp", corners: [0.25, 0.25, 0.25, 0.25] },
  // Every corner as round as the box allows. Flagged rather than given a
  // huge multiplier because "as round as it goes" depends on the box,
  // and a multiplier large enough for the tile would be meaningless on
  // the chip.
  { key: "pill", label: "Pill", pill: true, corners: [1, 1, 1, 1] },
  // One diagonal round, the other square. The first asymmetric one, and
  // the reason the budget stroke is drawn as a path with four
  // independent radii rather than a rect with a single rx.
  { key: "leaf", label: "Leaf", corners: [1.9, 0.2, 1.9, 0.2] },
  // Leaf's other diagonal. Worth having as its own shape rather than as
  // a rotation: two tiles side by side, one leaf and one petal, lean
  // into each other, and that is the whole reason somebody picks one.
  { key: "petal", label: "Petal", corners: [0.2, 1.9, 0.2, 1.9] },
  // Round across the top, flat along the bottom — a tile that sits on
  // its own base rather than floating.
  { key: "arch", label: "Arch", corners: [1.9, 1.9, 0.3, 0.3] },
  // Arch inverted. Reads as something held rather than something
  // standing, and pairs with arch down a column.
  { key: "cup", label: "Cup", corners: [0.3, 0.3, 1.9, 1.9] },
  // Three corners at the surface's own radius and one squared off, so
  // it reads as a label with a point on it.
  { key: "tag", label: "Tag", corners: [1, 1, 0.15, 1] },
  // Three corners as round as leaf's round pair, one squared. The most
  // lopsided of the ten, and the one a photo looks best in.
  { key: "drop", label: "Drop", corners: [1.9, 1.9, 1.9, 0.15] }
];

var CHOICES_SHAPE_DEFAULT = "rounded";

function choicesShape(key) {
  const want = String(key || "").trim();
  return CHOICES_SHAPES.find((shape) => shape.key === want) || CHOICES_SHAPES[0];
}

// The four corner radii in PIXELS, for a box of this size.
//
// Clamped to half the shorter side, which is the largest radius a corner
// can have before it starts eating its neighbour. The browser does this
// for CSS already; the budget stroke's path has to be told.
function choicesCornerRadii(key, base, width, height) {
  const shape = choicesShape(key);
  const cap = Math.max(0, Math.min(Number(width) || 0, Number(height) || 0) / 2);
  if (shape.pill) return [cap, cap, cap, cap];
  const size = Number(base) > 0 ? Number(base) : 0;
  return shape.corners.map((multiplier) => Math.max(0, Math.min(cap, size * multiplier)));
}

// How far in a corner control — the heart, the Pay pill — has to sit so
// that a rounded corner does not cut it off.
//
// On a circle of radius r, the point where the inner 45-degree diagonal
// meets the arc is r(1 - 1/root 2) from the corner, which is about
// 0.293r. Anything closer than that is outside the curve. The tile clips
// to its own radius, so on the "pill" shape a control at the old flat
// 9px was half outside the visible area.
//
// Floored at the original 9px, so the square-ish shapes are unchanged.
// The same question, asked by something that has MEASURED its box.
//
// ── WHY THE FLAT VERSION WAS NOT ENOUGH ──────────────────────────────
//
// choicesCornerInset below works from the base radius alone, and a
// corner's real radius is not the base times a multiplier — it is that,
// CLAMPED to half the shorter side. The two agree on a roomy tile and
// disagree the moment one is not, which is exactly when a grid is
// resized: on a narrow phone a pill tile's real radius is capped by the
// box, and the flat answer pushed the heart a long way inside a curve
// that had stopped being that round. On a wide one the opposite — the
// real radius grew past what the flat answer allowed for and the heart
// was clipped by a corner it was supposed to clear.
//
// So anything that can read its own width and height asks this instead,
// and gets an inset that tracks the shape it can actually see.
function choicesCornerInsetIn(key, base, corner, width, height) {
  const radii = choicesCornerRadii(key, base, width, height);
  const radius = Number(radii[corner]) || 0;
  return Math.max(9, Math.round(radius * 0.293));
}

function choicesCornerInset(key, base, corner) {
  const shape = choicesShape(key);
  const size = Number(base) > 0 ? Number(base) : 0;
  // A pill's radius is capped by the box rather than by the multiplier,
  // and this helper is not given the box — 3.5 bases is past the cap on
  // every surface that uses it, so it stands in for "as round as it
  // goes".
  const multiplier = shape.pill ? 3.5 : (shape.corners[corner] || 0);
  return Math.max(9, Math.round(size * multiplier * 0.293));
}

// The same shape as a CSS border-radius. Takes no box size because CSS
// clamps on its own, so "pill" can simply ask for more than it can have.
function choicesCornerCss(key, base) {
  const shape = choicesShape(key);
  if (shape.pill) return 999;
  const size = Number(base) > 0 ? Number(base) : 0;
  const [tl, tr, br, bl] = shape.corners.map((multiplier) => Math.round(size * multiplier));
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

var CHOICES_ICON_STYLES = ["line", "duotone", "emoji"];

// The fallback tile colour. A category created before a colour was picked,
// or one whose stored colour failed validation on an older build, still has
// to render as something.
var CHOICES_TINT_FALLBACK = "#E9E5F6";

var CHOICES_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function choicesTint(color) {
  const value = String(color || "").trim();
  return CHOICES_HEX_PATTERN.test(value) ? value : CHOICES_TINT_FALLBACK;
}

// A readable ink for text sitting ON one of those tints.
//
// The hero card prints a label and a caption over the category's own colour,
// and those tints vary enough that one fixed grey is either invisible on the
// pale ones or muddy on the deeper ones. So the tint is darkened toward its
// own hue instead: same colour family, enough contrast to read. Returns
// T.inkSoft's job done per-tile rather than a second palette to maintain.
function choicesInkOn(color) {
  const hex = choicesTint(color).replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  const parts = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  if (parts.some((n) => !Number.isFinite(n))) return "#5B5470";
  // 0.42 lands dark enough to read against every tint in CHOICES_TINTS
  // while staying recognisably the same colour as the tile.
  const dark = parts.map((n) => Math.round(n * 0.42));
  return `#${dark.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// A deeper version of the tint, for the budget bar's fill and the chart's
// highlighted column — the one place a category's colour needs to read as a
// mark rather than a ground.
function choicesMarkOn(color) {
  const hex = choicesTint(color).replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  const parts = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  if (parts.some((n) => !Number.isFinite(n))) return "#7C3AED";
  const mark = parts.map((n) => Math.round(n * 0.62));
  return `#${mark.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// The colours a budget stroke can be.
//
// ── WHY THEY ARE ALL THE SAME WEIGHT ─────────────────────────────────
//
// The first version of this list picked eight colours that looked good
// one at a time, and the grid showed why that is not the same thing.
// Their luminances ran from 0.08 (a plum) to 0.31 (a mustard): on one
// tile the stroke read as a near-black outline and on the tile beside
// it as a faint wash, so a row of tiles looked like a mistake rather
// than like a set. The complaint was that the dark ones broke the UI,
// and the dark ones were only half of it — the SPREAD was the fault.
//
// So these are not chosen, they are solved for. Each one is the most
// saturated colour of its hue that lands on a relative luminance of
// 0.20, which puts every stroke between 2.4:1 and 3.4:1 against every
// tint in CHOICES_TINTS: visible on all sixteen, heavy on none, and —
// the part that matters — indistinguishable from each other in weight.
// Changing one means re-solving it, not nudging it, and the test
// "every colour carries the same weight" is what enforces that.
//
// Slate is the one that looks like an outlier and is not: at a
// saturation of 0.16 it reads as a grey, so its nominal hue sitting
// 11 degrees from Indigo's is a number rather than a resemblance.
//
// ── WHY NONE OF THEM IS RED ──────────────────────────────────────────
//
// Over budget is drawn in #E23F45 and is not configurable, because it
// is the one state worth recognising without reading a figure. A
// stroke the person had set to red themselves would make the two
// indistinguishable, so red is simply not on offer — that is a
// deliberate hole in the palette, not an oversight.
//
// It also costs the warm end, and that is worth being plain about: a
// yellow or an orange bright enough to be worth having is far too
// light to sit at 0.20, and one forced down to 0.20 is a mustard. The
// warm half is covered by lime and fuchsia from either side of it, and
// there is no amber here because every honest amber was either dull or
// too close to the over colour.
var CHOICES_BAR_COLORS = [
  { key: "violet", label: "Violet", value: "#9561DD" },
  { key: "indigo", label: "Indigo", value: "#6969FB" },
  { key: "sky", label: "Sky", value: "#1781CC" },
  { key: "teal", label: "Teal", value: "#238A7C" },
  { key: "green", label: "Green", value: "#238D50" },
  { key: "lime", label: "Lime", value: "#438C10" },
  { key: "fuchsia", label: "Fuchsia", value: "#D618D6" },
  { key: "slate", label: "Slate", value: "#737A99" }
];

// Violet, because it is the app's accent lifted to the weight the rest
// of the list sits at. T.accent itself (#7C3AED) is luminance 0.134 —
// a third of the way down to the plum that started this — so a default
// of the raw accent would have made "never chose a colour" the second
// heaviest state available.
var CHOICES_BAR_DEFAULT = "#9561DD";

// How long a name is, counted the way the person writing it counts.
//
// Mirrors categoryNameLength in server/lib/categoryValidation.js, and
// mirrors it for a reason: the two have to agree or the field says a
// name is fine and the save says it is not.
//
// String#length counts UTF-16 code units. "नमस्ते" is six letters to a
// reader and eight code units to JavaScript, one emoji is two, a flag
// is four — so a cap measured in code units is a shorter cap for
// anybody not writing in Latin script. Intl.Segmenter counts what a
// reader counts; Array.from at least counts code points.
// What a choice is called when its name is being kept to itself.
//
// Eight dots, fixed, rather than one per letter: a mask whose length
// tracks the name tells a reader how long it is, and on a list of four
// that is most of the way to telling them which is which.
var CHOICE_NAME_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

function choicesNameLength(value) {
  const text = String(value || "");
  try {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length;
    }
  } catch (error) {
    // Fall through to code points.
  }
  return Array.from(text).length;
}

function choicesBarColor(color) {
  const value = String(color || "").trim();
  return CHOICES_HEX_PATTERN.test(value) ? value : CHOICES_BAR_DEFAULT;
}

// The server groups a category's totals BY CURRENCY and never sums across
// them — see categoryTotals in server.js for why. This picks the bucket that
// is in the viewer's own money.
//
// Returns zeros rather than null for a category with nothing in it, because
// every caller wants to print a figure and "no payments yet" is 0, not
// absent. `count` is what distinguishes the two where that matters.
function choicesTotalIn(category, ccyCode) {
  const want = String(ccyCode || "").trim().toUpperCase();
  const buckets = Array.isArray(category && category.totals) ? category.totals : [];
  const hit = buckets.find((b) => String(b.currency || "").toUpperCase() === want);
  const empty = { currency: want, total: 0, count: 0, thisMonth: 0, firstAt: null, lastAt: null };
  if (hit) return Object.assign({}, empty, hit);
  // No bucket in the viewer's currency. If there is exactly one bucket in
  // some OTHER currency, it is still that category's only activity and
  // saying "nothing" would be a lie — so it is returned as it stands, in its
  // own currency, and the caller formats it with that currency's symbol.
  // Several buckets in several currencies cannot be collapsed into one
  // figure at all, so that case stays at zero and the count carries the
  // truth.
  if (buckets.length === 1) return Object.assign({}, empty, buckets[0]);
  return empty;
}

// The first instant of the month the PERSON is in, in their own timezone,
// as an ISO string for the server. The server falls back to UTC when this is
// absent or unparseable — see categoryMonthStart — so this is an improvement
// on the default rather than a requirement.
function choicesMonthStartISO(now) {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return new Date(at.getFullYear(), at.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

var CHOICES_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Which of this account's history rows carry a given category's tag.
//
// `tags` is the map the store keeps: reference id -> category id. The join
// key is the payment's reference, which mapServerTransaction already puts on
// every row as `txnId` — so this never has to care how a row was loaded.
function choicesRowsFor(history, tags, categoryId) {
  const want = String(categoryId || "");
  if (!want || !tags) return [];
  const rows = Array.isArray(history) ? history : [];
  return rows.filter((row) => {
    const ref = row && row.txnId;
    return ref ? String(tags[ref] || "") === want : false;
  });
}

// The last `months` calendar months, oldest first, with each row's own
// amount summed into the month it happened in.
//
// Rows whose currency is not the viewer's are LEFT OUT rather than converted
// — this chart has no exchange rate and inventing one would put a made-up
// figure on a bar. `skipped` says how many were dropped so a caller can be
// honest about it rather than silently drawing a short chart.
function choicesMonthSeries(rows, ccyCode, months, now) {
  const span = Number(months) > 0 ? Math.floor(Number(months)) : 6;
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const want = String(ccyCode || "").trim().toUpperCase();

  const buckets = [];
  const index = new Map();
  for (let back = span - 1; back >= 0; back -= 1) {
    const when = new Date(at.getFullYear(), at.getMonth() - back, 1);
    const key = `${when.getFullYear()}-${when.getMonth()}`;
    const bucket = {
      key,
      label: CHOICES_MONTH_LABELS[when.getMonth()],
      year: when.getFullYear(),
      month: when.getMonth(),
      total: 0,
      count: 0,
      current: back === 0
    };
    index.set(key, bucket);
    buckets.push(bucket);
  }

  let skipped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const stamp = row && row.occurredAt ? new Date(row.occurredAt) : null;
    if (!stamp || Number.isNaN(stamp.getTime())) { skipped += 1; continue; }
    const rowCode = String((row && row.currency) || want).toUpperCase();
    if (want && rowCode !== want) { skipped += 1; continue; }
    const bucket = index.get(`${stamp.getFullYear()}-${stamp.getMonth()}`);
    if (!bucket) continue;
    const amount = Math.abs(Number(row.amount) || 0);
    bucket.total += amount;
    bucket.count += 1;
  }

  const peak = buckets.reduce((high, b) => (b.total > high ? b.total : high), 0);
  return { buckets, peak, skipped };
}

// History rows grouped into the month headings the detail screen lists
// under — "OCTOBER 2026", with that month's own total beside it.
//
// The heading's total is in the VIEWER's currency, which is passed in, and
// sums only the rows that are in it. The first version took the currency
// from whichever row happened to sort first and summed everything that
// matched — so a month holding one rupee payment and one euro one showed a
// heading of either 330 or 98 depending on which was newer, and nothing on
// screen said which. A figure whose meaning depends on sort order is worse
// than no figure. Rows in another currency are still LISTED under the
// heading, each with its own symbol; they are counted in `skipped` rather
// than folded into a sum that would be arithmetic across an exchange rate.
function choicesMonthGroups(rows, ccyCode) {
  const want = String(ccyCode || "").trim().toUpperCase();
  const groups = [];
  const index = new Map();
  const sorted = (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const at = a && a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const bt = b && b.occurredAt ? Date.parse(b.occurredAt) : 0;
    return bt - at;
  });

  for (const row of sorted) {
    const stamp = row && row.occurredAt ? new Date(row.occurredAt) : null;
    const valid = stamp && !Number.isNaN(stamp.getTime());
    const key = valid ? `${stamp.getFullYear()}-${stamp.getMonth()}` : "undated";
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        label: valid ? `${CHOICES_MONTH_LABELS[stamp.getMonth()]} ${stamp.getFullYear()}`.toUpperCase() : "EARLIER",
        total: 0,
        currency: want,
        skipped: 0,
        rows: []
      };
      index.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
    const rowCode = String((row && row.currency) || want).toUpperCase();
    if (!want || rowCode === want) group.total += Math.abs(Number(row.amount) || 0);
    else group.skipped += 1;
  }
  return groups;
}

// How much of a budget is gone, as a fraction clamped to [0, 1].
//
// `spent` and `budget` both arrive as numbers that may be 0, and 0 is
// finite — so the guard asks whether the budget is POSITIVE, not whether it
// is truthy. A budget of 0 means "none set", which is not a budget that is
// fully spent.
function choicesBudgetProgress(spent, budget) {
  const limit = Number(budget);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const used = Number(spent);
  const safe = Number.isFinite(used) && used > 0 ? used : 0;
  return {
    limit,
    used: safe,
    left: Math.max(0, limit - safe),
    fraction: Math.max(0, Math.min(1, safe / limit)),
    over: safe > limit
  };
}

// "Pay for Baby care" — the category's own name, verbatim, inside the
// sentence. Nothing title-cases it, truncates it to one word, or appends a
// noun: the person typed what they meant and the button says it back.
function choicesPayLabel(category) {
  const name = String((category && category.name) || "").trim();
  return name ? `Pay for ${name}` : "Pay";
}
