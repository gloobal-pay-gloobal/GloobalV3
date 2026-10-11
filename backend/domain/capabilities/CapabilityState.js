// src/domain/capabilities/CapabilityState.js
// Single source of truth for which services are locked/unlocked.
// Before this, each Account-tab tile carried its own hardcoded
// `locked: false` literal — five independent booleans that happened
// to agree, with nothing stopping them from drifting apart. Now every
// tile's lock state is *derived* here, from one small set of real
// inputs, so a rule like "Essentials needs Bank first" lives in
// exactly one place instead of being re-implemented (or forgotten) at
// every call site that renders a lock icon.
var CAPABILITY_KEY = {
  GLOOBAL_BANK: "gbank",
  GLOOBAL_COIN: "gcoin",
  PAYLATER: "gpaylater",
  MY_ASSETS: "myassets",
  MY_ESSENTIALS: "myessentials"
};
// `locked` and `live` are different questions, and conflating them is what
// let Gloobal Coin be three things at once: unlocked here, "isn't live yet"
// in the two toasts that quietly reroute a Coin payment to Bank, and a
// product with four ticked services on its own screen.
//
//   locked — you cannot open this yet (a gate on the person)
//   live   — this does not work yet (a fact about the product)
//
// Coin is open to look at and not built. That is `locked: false, live:
// false`, which the old shape had no way to say.
function deriveCapabilityStates({ hasOpenedGloobalBank = false } = {}) {
  return {
    [CAPABILITY_KEY.GLOOBAL_BANK]: { locked: false, live: true, reason: null },
    // ── COIN IS NOT A PRODUCT ANY MORE ────────────────────────────────
    //
    // It was live: mintable, holdable, sendable to another Gloobal ID and
    // redeemable, against a reserve the server kept equal to what it had
    // issued. Every balance has been redeemed back to fiat and the routes
    // are deleted, so none of that is true.
    //
    // GEU is a display lens now — a label on the money in Gloobal Bank,
    // 1 GEU = 1 unit of the holder's own tender — so there is no separate
    // product to be live or dead. `live: false` is what says so, and it
    // forces every service row under it back to 'planned'
    // (deriveProductServices), which is the honest state for a table
    // describing something that no longer exists.
    //
    // `payments: false` stays and is now trivially true rather than a
    // distinction: there is no coin to pay with. It existed because "is it
    // live" and "can you pay with it" had different answers while the coin
    // worked — a sheet reading `live` alone would have debited rupees and
    // called the result coin. Keeping the field means a future reader
    // cannot resurrect the collapse that caused.
    [CAPABILITY_KEY.GLOOBAL_COIN]: { locked: false, live: false, payments: false, reason: null },
    [CAPABILITY_KEY.PAYLATER]: { locked: false, live: true, reason: null },
    [CAPABILITY_KEY.MY_ASSETS]: { locked: false, live: true, reason: null },
    // First-time-user gate: Essentials stays locked until the person
    // has opened Gloobal Bank at least once. Everyone else derives
    // their lock state from this same object, so this is the only
    // spot that rule is expressed.
    [CAPABILITY_KEY.MY_ESSENTIALS]: {
      locked: !hasOpenedGloobalBank,
      live: true,
      reason: hasOpenedGloobalBank ? null : "Unlock Gloobal Bank first"
    }
  };
}

// The "Our Services" rows on the Gloobal Bank and Gloobal Coin screens.
//
// Every row on both screens carried a green check, unconditionally. That
// made four promises read as four shipped features — on Coin, for a
// product whose payments get rerouted to Bank, and on Bank for two things
// that genuinely do not exist yet. A list where every row is ticked
// carries no information; it is decoration wearing the costume of status.
//
// Each row now states which of the two it is, and says why in the same
// breath. `status` is the only thing the screen renders differently:
//
//   live    — works today, and this file can point at what does it
//   planned — not built; the note says what is missing
var SERVICE_STATUS = { LIVE: "live", PLANNED: "planned" };
var PRODUCT_SERVICES = {
  [CAPABILITY_KEY.GLOOBAL_BANK]: [
    // Every payment in the app moves digitally end to end — no cash leg
    // anywhere in Send Money, Scan & Pay, or Pay a Business.
    { label: "Cashless", status: SERVICE_STATUS.LIVE, note: "Every transfer settles digitally" },
    // Send Money resolves recipients in any supported country and converts
    // between their currency and yours on the way.
    { label: "Borderless", status: SERVICE_STATUS.LIVE, note: "Send across currencies today" },
    // There is no tax handling anywhere in this codebase — no rate table,
    // no withholding, no reporting. Claiming it is shipped is claiming a
    // feature nobody has written.
    { label: "Taxless", status: SERVICE_STATUS.PLANNED, note: "No tax handling is built yet" },
    // The backend caps a single prototype transaction
    // (PROTOTYPE_TRANSACTION_MAX_AMOUNT). A ceiling and "Limitless" cannot
    // both be true.
    { label: "Limitless", status: SERVICE_STATUS.PLANNED, note: "Transfers are still capped per payment" }
  ],
  // Three of Coin's four became true when the coin shipped, and each points at
  // something in the code rather than at an intention. deriveProductServices
  // still holds the guard below, so if Coin is ever marked not-live again these
  // revert to planned on their own.
  [CAPABILITY_KEY.GLOOBAL_COIN]: [
    // Minted and redeemed 1:1 against the reserve currency, both directions,
    // at the same rate — /api/coin/mint and /api/coin/redeem.
    { label: "Stable", status: SERVICE_STATUS.LIVE, note: "Pegged 1:1 and redeemable from reserve" },
    // A coin transfer commits inside one Mongo transaction. There is no
    // pending state for one to sit in.
    { label: "Instant", status: SERVICE_STATUS.LIVE, note: "Transfers settle immediately" },
    // Still not true, and for a more specific reason than before: the reserve
    // is denominated in a single currency, so coin cannot be minted against or
    // redeemed into another one. Crossing a border is not what is missing.
    { label: "Borderless", status: SERVICE_STATUS.PLANNED, note: "The reserve is single-currency for now" },
    // The reserve holds fiat equal to every coin issued, and /api/coin/supply
    // reports that comparison rather than asserting the result.
    { label: "Backed", status: SERVICE_STATUS.LIVE, note: "Every coin is backed 1:1 in reserve" }
  ]
};

// A service cannot be live inside a product that isn't. This is the guard
// that keeps the table above from drifting back into decoration: mark a
// Coin row `live` by hand and it is still rendered as planned, because the
// product it belongs to does not work.
function deriveProductServices(capabilityKey, capabilities) {
  const rows = PRODUCT_SERVICES[capabilityKey] || [];
  const productLive = Boolean(capabilities && capabilities[capabilityKey] && capabilities[capabilityKey].live);
  if (productLive) return rows;
  return rows.map((row) => ({
    ...row,
    status: SERVICE_STATUS.PLANNED,
    note: row.status === SERVICE_STATUS.LIVE ? "Waiting on this product going live" : row.note
  }));
}

