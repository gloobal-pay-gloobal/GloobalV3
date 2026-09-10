# The Gloobal QR — session model

*Design, agreed 9 September 2026. No code written yet; this is the thing the
code has to match.*

---

## 1. The one sentence

**A Gloobal QR is not money. It is a pointer to a server-held session, and
possession of it authorises nothing.**

Everything below follows from that. The old code was the opposite — the
payload *was* the instruction, the browser *was* the guard — and every one
of its four weaknesses is a restatement of that single mistake.

Your own words are the design:

> "i feel qr is more like a direction toward a correct destination so it can
> be a short session means we can change the qr after every successful
> payment"

> "when they scan we ask verification before showing merchant details once
> they verify we take that qr as used and refresh the qr"

> "even if 10 people scan same qr who ever verify it first qr belongs to them
> and rest get a message of alredy used qr scan new"

---

## 2. What is wrong with what exists

Four things, all the same thing.

| | Today | Why it matters |
|---|---|---|
| **No server** | `server.js` has no QR route at all. The payload is minted, read and trusted entirely in the two browsers. | There is no authority to ask. Nothing can be revoked, expired, or claimed, because nothing is written down anywhere but a screen. |
| **Unsigned payload** | The 20th character is `qrChecksumOf` — a positional sum, base 8. | It is a **typo guard**, and its own comment says so. Anyone who knows the alphabet can mint a code for any Gloobal ID and any amount up to 20,971.51. |
| **Cosmetic expiry** | `setSecondsLeft((s) => s <= 1 ? 60 : s - 1)` | The counter reaches zero and starts again. Nothing behind it ever expires. A screenshot taken today scans identically next year. |
| **Client-side replay guard** | `usedQrCodes` — a `Set` in `App.jsx:579` | It lives in one tab, in one browser, and it dies on refresh. It also cannot see the *other* nine people scanning the same code, which is precisely the case you asked about. |

None of these is fixed by a better payload. They are fixed by there being a
server record at all.

---

## 3. The lifecycle

Six verbs. The payee's device drives two of them, the payer's device drives
three, and the last one is the payment.

```
                              ┌───────────────────────────┐
   payee's screen             │  QrSession (server)       │
   ──────────────             │                           │
   (1) MINT ─────────────────▶│  status: active           │
                              │  handle: 16 symbols       │
   renders the code           │  expiresAt: now + 60s     │
                              └────────────┬──────────────┘
                                           │
   payer's camera                          │
   ─────────────                           │
   (2) SCAN — offline, local               │
       16 symbols → handle                 │
                                           │
   (3) RESOLVE ────────────────────────────┤  "is this live?"
       ◀── active | expired | consumed     │   NO details returned
                                           │
   (4) CLAIM ──────────────────────────────┤  atomic, first writer wins
       carries a real credential           │   status: active → claimed
       ◀── merchant details, ONLY now      │   claimedBy: this user
                                           │
   (5) PAY  ───────────────────────────────┤  /api/transactions/send
       existing route, + session id        │   status: claimed → consumed
                                           │
   (6) REFRESH ◀───────────────────────────┘  payee re-mints immediately
       new handle on the payee's screen        the moment it leaves `active`
```

### (1) Mint — `POST /api/qr/session`

The payee, authenticated, asks for a session. Body carries an optional
`amountCents` and nothing else — **the payee's identity comes from the token,
never from the request**, which is the hole the old payload had by
construction.

The server writes a `QrSession`, generates a handle, and returns
`{ handle, expiresAt }`. The payee's screen renders the handle and shows a
countdown driven by `expiresAt`, not by a local integer.

### (2) Scan — no network

Camera → computer vision → 16 symbols → checksum → handle. Entirely local,
and entirely without meaning: at this point the payer's device holds a
random-looking string it cannot interpret.

### (3) Resolve — `POST /api/qr/session/resolve`

The only question asked is *"is this session live?"*. The answer is a status
and nothing else — no name, no amount, no country, no Gloobal ID.

This step exists so that a person who scans a dead code is told so **before**
being asked for a fingerprint. Making somebody verify their identity to be
told "this expired" is a small cruelty and a needless credential prompt.

It is deliberately an oracle for handle liveness. That is safe, because the
handle is unguessable (§4), short-lived, and reveals nothing — and it is
rate-limited under `lookupLimit`.

### (4) Claim — `POST /api/qr/session/claim` — **this is the interesting one**

The payer verifies, and the claim carries the *proof*, not a boolean:

- **PIN** — the PIN itself, checked with `bcrypt.compare` against the `Pin`
  record, through the same `beginPinAttempt` / `pinLockRemainingMs` /
  `registerPinFailure` lockout path that `/api/transactions/send` already
  uses. Extract that block into `verifyPinFor(user, pin)` and call it from
  both; it is the same fifteen lines today, copied.
- **Passkey** — an assertion verified through the existing
  `/api/passkey/auth/verify` machinery.
- **Face** — `/api/face/verify`'s descriptor comparison.

> A browser saying "the user verified" is not verification. The old scan flow
> was honest about this in its own comment — the biometric prompt "was a
> 700ms setTimeout that always succeeded". The claim must not repeat it. If
> the server cannot check the credential itself, the credential did not
> happen.

Then, in **one** conditional update:

```js
const claimed = await QrSession.findOneAndUpdate(
  { handle, status: 'active', expiresAt: { $gt: new Date() } },
  { $set: { status: 'claimed', claimedBy: user._id, claimedAt: now,
            claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MS) } },
  { new: true }
);
```

`findOneAndUpdate` on a uniquely-indexed field is atomic in MongoDB. Ten
devices racing produce exactly one document and nine `null`s. **The first to
verify owns it; the rest are told to scan a new one** — which is the rule you
set, expressed as a single line rather than as a lock.

Only when `claimed` is non-null does the response carry the merchant: name,
Gloobal ID, country, currency, amount, share rate. Before that moment the
payer's device has been told nothing about who it is looking at.

**Idempotence.** A retry after a dropped response must not read as theft. If
the update returns `null`, look the session up: when `claimedBy` is *this*
user and `claimExpiresAt` is still in the future, return the details again.
Any other case is "already used — scan a new one".

### (5) Pay

`/api/transactions/send`, unchanged in every respect that moves money, plus a
`qrSessionId`. Before posting, the route checks the session is `claimed` by
this sender and not yet `consumed`; inside the same Mongo transaction that
posts the payment, it flips `consumed`. If the payment aborts, so does the
flip — the two cannot disagree, because they are one write.

Creator Share, cross-border settlement, corridor pools, asset seeds,
receipts: none of it changes. The session is a gate in front of the existing
door, not a second door.

### (6) Refresh

The moment a session leaves `active`, the payee's screen mints a new one.
"once they verify we take that qr as used and refresh the qr" — the trigger
is the *claim*, not the payment, so the code on the counter changes while the
payer is still deciding, and the next person in the queue is already looking
at a fresh one.

If the claimer then walks away, nothing needs releasing: the merchant has
already moved on, and the abandoned session expires on its own.

---

## 4. The handle, and the picture

Sixteen cells: four to a side of a square ring, hollow centre — your
reference image.

```
   ▣  ■  ×  =         ▣ = orientation anchor (fixed glyph, filled disc)
   +        ○         13 data cells, base 6
   ×        ■         2  checksum cells, base 6
   □  ●  +  ⌗         hollow centre: the Gloobal mark
```

- **Alphabet: 6 glyphs** — `+ − × = ● ■`. `○` and `□` are dropped from the
  code alphabet: hollow and filled forms of the same shape are the pair a
  camera confuses first, in poor light and at an angle.
- **Anchor** — one cell is never data. Four identical corners give a scanner
  no way to tell which way up the code is; the anchor is the rotation cue,
  and it costs one cell.
- **Payload** — 13 cells, base 6 → 6¹³ = 13,060,694,016 values ≈ **33.6
  bits**, drawn from `crypto.randomInt`. At a 60-second life and any
  plausible transaction rate, the live set is a vanishing fraction of the
  space; a unique index plus a retry handles the birthday case.
- **Checksum** — 2 cells, positionally weighted, mod 36. A misread is caught
  on the device instead of becoming a resolve call for a session that never
  existed. It is **not** integrity, and the code will say so in a comment,
  because the old checksum's comment is the one thing about it people
  remember and it is easy to promote it in one's head to a signature.

### What this cannot do, stated plainly

- **Gloobal scanners only.** This is not a QR and no QR reader will read it.
  You have said that is what you want — "it can be scan by a gloobal user
  with a gloobal id only" — and it is a real cost: no camera app, no bank
  app, no WhatsApp preview.
- **Network required at scan time.** 16 symbols cannot carry a merchant, an
  amount and a signature; they carry a pointer, and a pointer needs
  somewhere to point. Offline scanning is gone. This is the honest trade for
  the whole session model, and it is the trade that makes revocation,
  expiry and first-claim-wins possible at all.
- **New computer vision.** jsQR cannot find this; there are no finder
  patterns. Locating the ring, correcting perspective and classifying six
  glyph shapes is new work, and it is the largest single risk in the plan.
- **Colour is decoration only.** The classifier keys on shape. If colour ever
  carries a bit, the code stops working for colour-blind users and in bad
  light — and `QR_MODULE_COLORS` already re-picks colours for luminance,
  which would silently change data.

---

## 5. States the app must show

| Protocol state | Screen says |
|---|---|
| scanning | camera live, ring outline hint |
| recognised | 16 cells locked, brief confirm |
| invalid | "This isn't a Gloobal code." |
| resolving | spinner — one round trip |
| expired | "This code expired. Ask for a new one." |
| consumed / replay | **"Already used — scan a new one."** |
| auth required | verification sheet: PIN / biometric |
| authorising | verifying, cancellable |
| claimed | **first reveal of merchant details** |
| pending | payment posting |
| verified | receipt |
| failed | server's own message, verbatim |
| network failure | "Couldn't reach Gloobal. Try again." — retry keeps the handle |
| cancelled | back to camera, session left alone |

"Consumed" and "replay" are one message on purpose. The nine people who lost
the race did nothing wrong and are not being accused of anything; they just
need a new code.

---

## 6. The clean break

You chose new format only. That means, in order:

1. **Server first.** `QrSession` model, four routes, tests. Nothing on any
   screen changes. *The code is meaningless without something to point at.*
2. Handle codec (`backend/utils/gloobalQRSession.js`) + its tests — pure,
   no server dependency, testable on its own.
3. Renderer: the 4-per-side ring.
4. Scanner: ring detection, perspective correction, glyph classification.
5. Wire the flow; move verification *before* the reveal.
6. **Delete** `encodeGloobalQR` / `decodeGloobalQR`, the legacy 16-character
   branch, `usedQrCodes`, and the fake countdown — in the same commit as
   their last call site, never before it.

Codes already on a screen at deploy time stop working. They are ephemeral by
nature and this is a prototype with a known user base, so that is acceptable
— but it is a decision, not an oversight, and it is written down here.

## 7. Deferred

- **Static / printed shop codes.** A pointer with a 60-second life cannot be
  printed. A static code would need a different session shape (long-lived
  handle, per-scan child session) and you said: decide after the session
  model works.
- **Amount-in-the-code.** The amount now lives in the session, not the
  payload, which removes the currency ambiguity the old payload had by
  construction — the request is denominated in the payee's own registered
  currency, on the server, once.
