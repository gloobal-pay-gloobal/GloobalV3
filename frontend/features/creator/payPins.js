// src/features/creator/payPins.js
//
// ── THE BUSINESSES SOMEBODY ACTUALLY PAYS ───────────────────────────────
//
// Pay & Services lists ten businesses in a fixed order that is the same
// for everybody. Most people pay two or three of them, over and over, and
// scroll past the rest every time.
//
// A pin is the fix: tap the pin on a row and it joins a strip at the top
// of the screen. As many as somebody wants — the founder's instruction was
// "keep pins as much as they want" — with about five visible and the rest
// a swipe to the left, so a long list costs no vertical room.
//
// ── WHY THIS IS IN BROWSER STORAGE AND WHAT THAT COSTS ──────────────────
//
// Pins live in localStorage, keyed by the account's Gloobal ID. That is a
// real limitation and it is worth being plain about it: they do not follow
// anybody to a second device, and clearing site data loses them.
//
// It is the right first version anyway. A pin is a shortcut rather than a
// record — losing one costs a scroll, not money or history — and the same
// reasoning already put the floating map button's position here. The day
// it deserves to be account data it wants its own collection and a route,
// not a field smuggled onto User.
//
// Keyed BY ACCOUNT rather than globally, because two people sharing a
// phone is ordinary and one of them inheriting the other's shortcuts on
// the Pay screen would be a small but real leak of what they buy.
//
// Every access is wrapped: localStorage throws outright in Safari's
// private mode and when storage is disabled, and a shortcut list is never
// worth taking a screen down over.
// ── ONE PIN CONTROL, NOT THREE ──────────────────────────────────────────
//
// The same act — pin this, unpin this — was drawn three different ways:
// a pushpin outline on the Pay & Services rows, a × badge on the pinned
// tile, and a gold star on a creator's own page. Three pictures of one
// verb, and the × was the worst of them, because a cross means DELETE
// everywhere else in this app and on the tile it meant "remove the
// shortcut, keep the shop".
//
// The founder's call is the star, everywhere, and it is the right one:
// the star already said "pinned" on the creator page, it fills when on
// and outlines when off, and a FILL is visible to somebody who cannot
// tell gold from grey — which is the same reason the bank badges became
// fills rather than two colours.
var PAY_PIN_STAR = "#F2B01E";

var GLOOBAL_PAY_PINS_KEY_PREFIX = "gloobal.payPins.v1.";

function payPinsKey(symbolId) {
  return GLOOBAL_PAY_PINS_KEY_PREFIX + String(symbolId || "anon");
}

function loadPayPins(symbolId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(payPinsKey(symbolId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    // Strings only, de-duplicated, and capped at something no human
    // reaches. "As many as they want" is not the same as accepting an
    // unbounded array out of storage anything on the device could write.
    const seen = Object.create(null);
    const out = [];
    for (const key of parsed) {
      if (typeof key !== "string" || !key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
      if (out.length >= 200) break;
    }
    return out;
  } catch (e) {
    return [];
  }
}

function savePayPins(symbolId, keys) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(payPinsKey(symbolId), JSON.stringify(keys));
  } catch (e) {
    // No storage — the pins hold for this session and are gone on the
    // next load, which is a repeat rather than a broken screen.
  }
}

// How many of the strip are visible before it has to be swiped.
//
// Not a slice: every pin is rendered and the row scrolls. The number is
// what the TILE WIDTH is derived from, so this many fill a phone's width
// and the rest are a swipe to the left.
//
// FOUR, not five, and the row holds exactly four rather than four and a
// bit. It was five minus 0.4 — four and a half tiles, with the fifth cut
// by the screen edge so the cut tile itself said "there is more". That
// bought the hint at the cost of every tile being narrower than it needed
// to be, and of a name under a 62px mark having about nine characters of
// room before it clamped to two lines. `रसोई Ghar` did not fit.
//
// The hint was not free to lose, so it is paid for twice over and more
// cheaply: the header already counts the pins — PINNED · 7 — and a fade
// over the right-hand edge says the same thing without spending a tile on
// it. Four whole tiles, bigger marks, and names that fit.
var PAY_PINS_VISIBLE = 4;

// Toggle, newest LAST.
//
// Appending rather than prepending matters more than it looks: a strip
// that reorders itself on every pin would move the tile somebody is
// reaching for, and the whole point of a pin is that it stays where it
// was put.
function togglePayPin(keys, key) {
  const list = Array.isArray(keys) ? keys : [];
  return list.indexOf(key) >= 0 ? list.filter((k) => k !== key) : list.concat([key]);
}

// The pinned entries, in pin order, from whatever list they were pinned
// out of. A pin whose business has since gone from the list is dropped
// here rather than cleaned out of storage: the entry may come back, and
// deleting somebody's shortcut because a catalogue changed shape for one
// release would be the wrong trade.
function payPinnedFrom(all, keys) {
  const list = Array.isArray(keys) ? keys : [];
  const byKey = Object.create(null);
  for (const item of all || []) if (item && item.key) byKey[item.key] = item;
  const out = [];
  for (const key of list) if (byKey[key]) out.push(byKey[key]);
  return out;
}

// ── A PINNED CREATOR IS NOT A PINNED BUSINESS ───────────────────────────
//
// payPinnedFrom resolves a pin KEY against TOP_BUSINESSES. That is the only
// thing it has ever been able to resolve, so pinning a creator stored their
// symbolId in the same list, flipped the star on their page, and then showed
// NOTHING in the Pinned strip — the key matched no business and was silently
// dropped. The founder's "ping was not working" is exactly that: the star
// said yes and the strip disagreed.
//
// A creator is not in any local catalogue, so there is nothing to resolve
// them against. The options were a lookup per pinned creator every time Pay
// & Services opens — a dozen requests to draw a row of shortcuts — or
// keeping the little that a tile needs at the moment it is pinned. This is
// the second.
//
// WHAT IS CACHED IS WHAT A TILE DRAWS, and nothing else: the name, the
// handle, the mark and the shop's colour. No prices, no items, no address.
// A stale cache therefore costs an out-of-date name on a shortcut, and the
// page behind it is always fetched fresh.
var GLOOBAL_PAY_PIN_CREATORS_PREFIX = "gloobal.payPinCreators.v1.";

function payPinCreatorsKey(symbolId) {
  return `${GLOOBAL_PAY_PIN_CREATORS_PREFIX}${symbolId || "anon"}`;
}

function loadPinnedCreators(symbolId) {
  try {
    const raw = window.localStorage.getItem(payPinCreatorsKey(symbolId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    // A corrupt or unreadable store costs a row of shortcuts, never the
    // screen: every caller treats {} as "none pinned yet".
    return {};
  }
}

function savePinnedCreators(symbolId, map) {
  try {
    window.localStorage.setItem(payPinCreatorsKey(symbolId), JSON.stringify(map || {}));
  } catch (e) {
    // Out of quota, or private browsing. The pin itself still lives in
    // payPins; only the shortcut's label is lost.
  }
}

// The handful of fields a tile needs, taken off a resolved creator.
function pinnedCreatorCard(creator) {
  if (!creator || !creator.symbolId) return null;
  return {
    key: creator.symbolId,
    label: typeof creatorDisplayName === "function" ? creatorDisplayName(creator) : (creator.handle || ""),
    handle: creator.handle || "",
    logo: creator.logo || null,
    color: (creator.shop && creator.shop.color) || "",
    isCreator: true
  };
}

// Pins, in the order they were pinned, as tiles — businesses resolved from
// the catalogue and creators from the cache, so one strip can hold both.
//
// A key that resolves to neither is skipped rather than drawn as a gap: it
// is a business that has left the catalogue, or a creator pinned on another
// device whose card this one has never seen.
function payPinnedTiles(all, keys, creatorCards) {
  const list = Array.isArray(keys) ? keys : [];
  const byKey = Object.create(null);
  for (const item of all || []) if (item && item.key) byKey[item.key] = item;
  const cards = creatorCards && typeof creatorCards === "object" ? creatorCards : {};
  const out = [];
  for (const key of list) {
    if (byKey[key]) out.push(byKey[key]);
    else if (cards[key]) out.push(cards[key]);
  }
  return out;
}

// ── SMART ORDER (0184) ──────────────────────────────────────────────────
//
// "Pay again orders itself": the chai shop paid at 8 am leads in the
// morning, the shop paid most often leads otherwise. Worked out on THIS
// phone from when each pin was used — nothing is sent anywhere. Only the
// ORDER changes; the pins themselves are still the ones their owner chose.
//
// A use is opening a pin or a shop to pay it. Kept as [key, time] pairs,
// newest last, 300 at most, 90 days at most.
var GLOOBAL_PAY_USE_PREFIX = "gloobal.payUse.v1.";
var PAY_USE_MAX = 300;
var PAY_USE_DAYS = 90;

function payUseKey(symbolId) {
  return GLOOBAL_PAY_USE_PREFIX + String(symbolId || "anon");
}

function loadPayUses(symbolId) {
  try {
    const raw = JSON.parse(localStorage.getItem(payUseKey(symbolId)) || "[]");
    return Array.isArray(raw) ? raw.filter((u) => Array.isArray(u) && typeof u[0] === "string" && Number.isFinite(u[1])) : [];
  } catch (e) {
    return [];
  }
}

function recordPayUse(symbolId, key, now = Date.now()) {
  if (!key) return [];
  const cutoff = now - PAY_USE_DAYS * 86400000;
  const next = loadPayUses(symbolId).filter((u) => u[1] >= cutoff).concat([[String(key), now]]).slice(-PAY_USE_MAX);
  try { localStorage.setItem(payUseKey(symbolId), JSON.stringify(next)); } catch (e) { /* a convenience, not data */ }
  return next;
}

// Minutes between two times of day, the short way round midnight.
function payUseClockGap(a, b) {
  const da = new Date(a), db = new Date(b);
  const ma = da.getHours() * 60 + da.getMinutes();
  const mb = db.getHours() * 60 + db.getMinutes();
  const d = Math.abs(ma - mb);
  return Math.min(d, 1440 - d);
}

// Each use scores 1, or 3 when it happened within 90 minutes of this time
// of day; uses fade over the 90 days. Ties keep pin order, so with no
// history the strip is exactly the order things were pinned in.
function smartPinOrder(tiles, uses, now = Date.now()) {
  const list = Array.isArray(tiles) ? tiles : [];
  const score = Object.create(null);
  for (const [key, at] of uses || []) {
    const age = Math.max(0, (now - at) / 86400000);
    if (age > PAY_USE_DAYS) continue;
    const near = payUseClockGap(at, now) <= 90 ? 3 : 1;
    score[key] = (score[key] || 0) + near * (1 - age / (PAY_USE_DAYS * 1.5));
  }
  return list
    .map((t, i) => ({ t, i, s: score[t.key] || 0 }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.t);
}
