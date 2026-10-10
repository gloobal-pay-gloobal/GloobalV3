# Superseded — GEU is a display lens, not a balance

Everything in this folder describes a **growth-bearing GEU**: an instrument
with its own balance field, its own supply document, capital-backed entry
mints, bounded growth events and redemptions. Its routes lived at
`/api/geu/*` behind the `GEU_GROWTH_PROTOTYPE` flag, were never enabled, and
were deleted in October 2026.

**None of it describes how Gloobal works now.** Read it as history.

## What replaced it

GEU is not an asset, a token, a stablecoin or a currency. It is a display
lens over money somebody already holds:

- `1 GEU = 1 unit of the viewer's own legal tender`, permanently. India
  1 GEU = ₹1, USA 1 GEU = $1, Japan 1 GEU = ¥1.
- Toggling `[ LOCAL | GEU ]` executes no trade, charges no fee, causes no
  slippage and creates no taxable event. It changes the label on a number.
- Nothing is bought, sold or backed, because nothing is held.

A GEU figure is meaningless without the currency it was quoted in — "2 GEU"
is ₹2 in Mumbai and $2 in New York — so GEU never appears anywhere money
moves. The toggle is for reading, never for sending.

## Why these files were kept

The question these documents were deferring — whether GEU should bear growth
— has been answered, and answered differently: there is nothing for a growth
model to apply to. But the monetary reasoning, the invariant work and the
audit findings took real effort and someone will eventually ask why GEU is
not a balance. This is the long answer.

## What is NOT superseded

The *Gloobal Coin* half of this reasoning produced machinery that is still
live and still correct, and it is not in this folder:

- the cross-border settlement engine and the country currency pools, which
  are how a payment settles domestically on both sides without money
  crossing a border;
- the exact-integer ledger primitives and `withAtomicSession`, which refuses
  to write half of a pair that means "this account is poorer" and "that
  account is richer".
