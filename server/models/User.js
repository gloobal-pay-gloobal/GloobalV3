const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  mobileNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    default: null
  },
  // ISO 3166-1 alpha-2 of the country picked on the registration dial-code
  // screen (Country.iso). Nothing before the multi-currency pool work read
  // this off a user, so it never had anywhere to live — every account's
  // "local currency" was implicitly INR because the backend only ever spoke
  // one currency. It now decides which CountryCurrencyPool a payment debits
  // or credits from. `default: 'IN'` matches every account created before
  // this field existed, which really were all India-registered.
  countryIso: {
    type: String,
    uppercase: true,
    trim: true,
    default: 'IN'
  },
  symbolId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Every Gloobal ID this account has ever had, with the moment it came in
  // or was replaced. The ID is the identity every other route keys off, so
  // a rename has to leave a dated record rather than silently overwriting
  // the old one — and the *first* ID has to be in that record too, or the
  // trail starts mid-story.
  //
  // `createdAt` is the timestamp field; `changedAt` is its predecessor,
  // written alongside it so documents saved by this version stay readable
  // to a client built before it. Full datetime, not a date — two renames a
  // minute apart are otherwise indistinguishable.
  symbolIdHistory: [{
    symbolId: {
      type: String,
      required: true
    },
    action: {
      type: String,
      enum: ['created', 'changed'],
      default: 'changed'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    replacedBy: {
      type: String,
      default: null
    }
  }],
  // Gloobal Creators choose for themselves what share of an incoming payment
  // they give back to whoever paid them — 0% to 7%, stored as a decimal
  // (1% = 0.01). This is the rate applied to the asset seed planted for the
  // payer; Gloobal does not set it centrally. A plain (non-Creator) account
  // simply leaves it at 0, which plants no seed.
  cashbackRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 0.07
  },
  // The account's Gloobal bank balance. Prototype money: every account opens
  // with the same test float so payment flows can actually be driven end to
  // end, instead of the dashboard showing one hardcoded string that no
  // transaction ever changed. No real money is represented here.
  balance: {
    type: Number,
    default: 10000,
    min: 0
  },
  // ── coinBalance IS GONE ──────────────────────────────────────────────
  //
  // Gloobal Coin was a second balance on this document, backed 1:1 by a
  // CoinReserve. It is closed: scripts/redeem-all-coin.mjs converted every
  // holding back into `balance` and drained the reserve before the routes
  // that could write another one were deleted.
  //
  // GEU is a display lens now — 1 GEU = 1 unit of this account's own
  // tender, a label on `balance` rather than a pot beside it — so there is
  // no second balance for this field to hold.
  //
  // Dropped from the schema, NOT unset on the documents. A zero left in
  // Mongo costs nothing and is a truthful record that the field was there;
  // a mass $unset across every account is a write over real documents to
  // tidy a field nothing reads.
  // The direct person who invited them
  referredBy: {
    type: String,
    default: null
  },
  // NEW: The complete history of who invited who [Parent, Grandparent, Great-Grandparent]
  referralChain: {
    type: Array,
    default: []
  },
  referralCount: {
    type: Number,
    default: 0
  },
  // The short, ASCII-safe code that stands in for this account's Gloobal ID
  // in a shared invite link, and NOWHERE else.
  //
  // The Gloobal ID is twelve characters from the dial-pad symbol alphabet
  // (− + × = ○ □ ● ■). Every one of those is multi-byte UTF-8, so a URL
  // carrying one percent-encodes to nine characters per symbol:
  //
  //   .../r/%E2%96%A0%E2%96%A0%E2%96%A0%E2%96%A1%E2%9C%95…   (108 chars of path)
  //
  // That is what people were pasting into WhatsApp. This field is the fix:
  // a short opaque handle that resolves back to exactly one account.
  //
  // Deliberately NOT a second identity. It is not a payment address, it
  // never appears on a receipt, it is not accepted anywhere a Gloobal ID is
  // accepted, and it is not what the referral itself is recorded against —
  // `referredBy` still stores the referrer's real symbolId, so the account
  // graph is unchanged. It is a URL-shortening detail with a uniqueness
  // guarantee, and it must never grow into more than that.
  //
  // Sparse, because it is minted lazily (see ensureReferralCode in
  // server.js): accounts that predate this field hold no value until their
  // next signed-in response, and a plain unique index would treat every one
  // of those nulls as a collision with every other.
  referralCode: {
    type: String,
    default: null,
    trim: true,
    index: { unique: true, sparse: true }
  },
  passkeys: [{
    id: {
      type: String,
      required: true
    },
    publicKey: {
      type: Buffer,
      required: true
    },
    counter: {
      type: Number,
      default: 0
    },
    transports: {
      type: [String],
      default: []
    },
    deviceType: {
      type: String,
      default: null
    },
    backedUp: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  currentChallenge: {
    type: String,
    default: null
  },
  // When the challenge above stops being acceptable.
  //
  // Audit fix (GLB-25): currentChallenge was a single slot with no expiry,
  // cleared only by a successful verification. A challenge minted weeks ago
  // was still accepted, which is exactly the replay window WebAuthn's
  // challenge exists to close. Both /api/passkey/*/options routes now stamp
  // this, and both /verify routes refuse a challenge past it.
  //
  // Null on every document written before this field existed. A stored
  // challenge with no expiry is treated as expired rather than as valid
  // forever — failing closed on legacy data costs one extra tap through the
  // options route, and failing open costs the property this field exists for.
  currentChallengeExpiresAt: {
    type: Date,
    default: null
  },
  // The moment every token issued BEFORE it stopped being trusted.
  //
  // Auth here is a stateless HMAC with a seven-day TTL and there is no token
  // store, so until now nothing could end a session early — a PIN change
  // left every other signed-in device exactly as signed in as it was, which
  // is the one thing a person changing their PIN is usually trying to stop.
  //
  // This is the revocation, and it is deliberately the smallest possible
  // version of one: authenticatedUser compares the token's own `iat` against
  // this stamp and refuses anything older. It needs no new storage and no
  // lookup that was not already happening — that function already loads the
  // User document — and it is scoped to one account rather than a global
  // key rotation that would sign the whole platform out.
  //
  // null on every account that has never changed a credential, which is what
  // makes this inert for existing sessions: no stamp, nothing to compare,
  // no behaviour change. Only /api/pin/change and /api/pin/reset set it, and
  // both mint a fresh token in the same response so the device that made the
  // change stays signed in.
  credentialsInvalidatedAt: {
    type: Date,
    default: null
  },

  // The Security screen's two switches, stored.
  //
  // They were component-local React state read at exactly one place — the
  // line that drew the switch — so they reset on every remount and gated
  // nothing at all. Stored on the account rather than in browser storage so
  // the setting is the same wherever the person signs in, and so it cannot
  // be flipped by anything that can write to localStorage.
  securitySettings: {
    // Whether this account WANTS the passkey path. It does not create or
    // destroy a passkey — registration and removal are their own routes —
    // it decides whether the app offers biometrics or goes straight to the
    // PIN. Default true, matching the switch's previous default.
    biometricLogin: { type: Boolean, default: true },
    // Whether the app should demand a credential when it is opened, rather
    // than restoring straight to the dashboard.
    appLock: { type: Boolean, default: false }
  },

  // ── THE CREATOR SIDE OF THE SAME ACCOUNT ─────────────────────────────
  //
  // One account, two sides. The Personal side is paid at its Gloobal ID;
  // the Creator side is paid at a handle a person can say out loud —
  // `rasoi.ghar`, `chacha.tea` — which is the whole reason this exists.
  // A twelve-symbol Gloobal ID cannot be shouted across a counter.
  //
  // It is NOT a second account and must never become one. There is no
  // separate balance, no separate ledger and no separate login here: the
  // handle resolves to this same `symbolId`, and every payment to it is a
  // payment to this user. What the fields below hold is how the Creator
  // side PRESENTS itself.
  //
  // Absent on an account that has never flipped to the Creator side, and
  // on one that flipped and skipped the setup — which is a real state, by
  // the founder's choice, so every reader has to handle a creator with no
  // name rather than assuming one.
  creatorProfile: {
    // The two halves as typed, in whatever script they were typed in.
    // Kept separately from `handle` because the display form preserves
    // case and composition and the handle does not, and recovering one
    // from the other is not possible.
    handleFirst: { type: String, trim: true, default: '' },
    handleLast: { type: String, trim: true, default: '' },

    // ── THE PAYABLE FORM ───────────────────────────────────────────────
    //
    // `first.last`, case-folded and NFC-normalised (see normaliseHandle in
    // server.js). This is what somebody types to pay, so it is unique
    // across every account, and it is the field an index is built on.
    //
    // Sparse, for the same reason referralCode is: accounts that have
    // never set one hold no value, and a plain unique index would read
    // every one of those nulls as a collision with every other.
    //
    // NOT re-registerable once released would be the right rule here too —
    // the same argument as GLB-12 for Gloobal IDs, since a handle people
    // have saved would start paying whoever claimed it next. Handles
    // cannot be changed yet, so there is nothing to release; the day an
    // edit route exists it needs a history array like symbolIdHistory and
    // this comment is the reason.
    handle: {
      type: String,
      trim: true,
      default: null,
      index: { unique: true, sparse: true }
    },

    // Free text, in any script. Not parsed, not geocoded, not validated —
    // an address format that is true everywhere does not exist.
    address: { type: String, trim: true, default: '', maxlength: 400 },

    // Whether anybody paying this creator sees the address.
    //
    // FALSE BY DEFAULT, and that default is the point: the app cannot tell
    // a shop's address from the kitchen somebody cooks in, and the cost of
    // guessing wrong falls entirely on the person who typed it. Turning it
    // on is a decision the creator makes on a switch that says plainly who
    // will see it.
    addressPublic: { type: Boolean, default: false },

    // ── A LINE FOR WHOEVER SCANS YOUR CODE ────────────────────────────
    //
    // Shown under the Pay button on the card a payer gets from scanning,
    // and NOWHERE ELSE. Deliberately not the shop's `announceText`: that
    // one is a band across a page somebody is browsing, and this one is
    // read in the two seconds before money moves. "Cash only after 9pm",
    // "Order number on the slip please" — the things a counter says out
    // loud, said by the code instead.
    //
    // Kept short on purpose. A payer is not reading a notice board with
    // their thumb over Pay, and a long message would push that button
    // off a small screen.
    scanNote: { type: String, trim: true, default: '', maxlength: 120 },

    // When the setup screen was last dismissed without being completed.
    // Held so the Creator dashboard can keep offering it without putting
    // the whole screen back in the way on every flip.
    setupSkippedAt: { type: Date, default: null },

    // When a handle was first successfully set. `completedAt` being null
    // with a handle present should be impossible; it is read as "has this
    // creator finished setting up" and the handle is what finishes it.
    completedAt: { type: Date, default: null },

    // ── HOW THE SHOP LOOKS ────────────────────────────────────────────
    //
    // A handful of choices, each a short enumerated string, that
    // frontend/features/creator/shopTheme.js turns into the values the page
    // draws with. Stored on the profile rather than in their own collection
    // because the whole block is under 200 bytes and is read by exactly the
    // request that already loads this document.
    //
    // NONE OF THIS REACHES MONEY. A theme changes the cover, mark, name,
    // chips, cards, badges and add buttons. The price, the GEU pair, the
    // cart total and the Pay button render from the app's own tokens in
    // every shop under every theme — a customer has to read a figure the
    // same way in every shop, and a shop that could restyle its own total
    // could make 550 read as 55. shopTheme.js holds the list; the tests
    // assert against it.
    //
    // Every field is optional and every reader falls back, so a profile
    // written before this existed renders as the app's own look.
    shop: {
      theme: { type: String, enum: ['gloobal', 'street', 'studio', 'market', 'night'], default: 'gloobal' },
      // Validated against the fixed palette on the way in AND on the way
      // out, because this string ends up inside a style attribute.
      color: { type: String, default: '' },
      font: { type: String, enum: ['grotesk', 'fraunces', 'inter', 'mono'], default: 'grotesk' },
      corners: { type: String, enum: ['sharp', 'soft', 'round', 'leaf'], default: 'round' },
      cards: { type: String, enum: ['raised', 'flat', 'outline', 'plain'], default: 'raised' },
      density: { type: String, enum: ['compact', 'cosy', 'roomy'], default: 'cosy' },
      photoShape: { type: String, enum: ['rounded', 'circle', 'wide', 'tall'], default: 'rounded' },
      dark: { type: Boolean, default: false },

      // One line under the name: "Chai since 2015".
      tagline: { type: String, trim: true, maxlength: 60, default: '' },

      // The band across the very top. Blank text is the same as off, and
      // the page refuses to draw a coloured strip with nothing in it.
      announceText: { type: String, trim: true, maxlength: 70, default: '' },
      announceColor: { type: String, default: '' },
      announceOn: { type: Boolean, default: true }
    }
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Audit fix (GLB-12): a Gloobal ID released by a rename must not be
// re-registerable, because saved payees, printed QR codes and referral links
// still carry it and would silently start paying whoever claimed it next.
// Registration and rename both ask "has any account ever held this ID?", and
// that question is answered by scanning symbolIdHistory — so it needs an
// index, or every registration becomes a collection scan.
userSchema.index({ 'symbolIdHistory.symbolId': 1 });

module.exports = mongoose.model('User', userSchema);