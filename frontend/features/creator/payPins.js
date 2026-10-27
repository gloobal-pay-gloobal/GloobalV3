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
// what the TILE WIDTH is derived from, so roughly this many fit on a
// phone and the next one is half-visible at the edge — which is what
// tells somebody there is more to the right without a label saying so.
var PAY_PINS_VISIBLE = 5;

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
