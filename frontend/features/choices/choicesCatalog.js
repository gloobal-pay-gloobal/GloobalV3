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
