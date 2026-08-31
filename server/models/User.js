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
  // Gloobal Coin held by this account, in coin units.
  //
  // Deliberately NOT defaulted to a float the way `balance` is: nobody is
  // given coin, they mint it, and every coin in this field was created by
  // moving the same amount of `balance` into the CoinReserve. The sum of this
  // field across all accounts equals CoinReserve.issued and CoinReserve.reserve
  // — see CoinReserve.js for why all three are kept rather than derived.
  //
  // `min: 0` is load-bearing, not decorative. The mint/redeem/transfer updates
  // guard with `coinBalance: { $gte: amount }`, so a debit that would go
  // negative matches no document and writes nothing; this bound is the second
  // line of defence if a future write forgets that guard.
  coinBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  // Gloobal Energy Unit (GEU) balance, in GEU units — 1 GEU = INR1 at the
  // reference layer (see models/GeuSupply.js and server.js's POST
  // /api/geu/* routes). Same reasoning as coinBalance just above: never
  // defaulted to a starting float, since every GEU either enters via a
  // capital-backed entry mint or a bounded growth event, never by simply
  // existing. `min: 0` is the same second line of defence coinBalance's own
  // comment describes — the real guard is each route's conditional $inc,
  // this is the backstop if one is ever missing.
  geuBalance: {
    type: Number,
    default: 0,
    min: 0
  },
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