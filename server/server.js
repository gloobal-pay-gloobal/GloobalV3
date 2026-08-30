require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const Otp = require('./models/Otp');
const Pin = require('./models/Pin');
const Transaction = require('./models/Transaction');
const LedgerEntry = require('./models/LedgerEntry');
const CoinReserve = require('./models/CoinReserve');
const Referral = require('./models/Referral');
const Interest = require('./models/Interest');
const Product = require('./models/Product');
const ProductService = require('./models/ProductService');
const AssetSeed = require('./models/AssetSeed');
const FaceTemplate = require('./models/FaceTemplate');
const { nationalNumberFrom } = require('./constants/dialCodes');
const faceCrypto = require('./lib/faceCrypto');
const { compareDescriptors, matchThreshold } = require('./lib/faceMatch');
const {
  settleCrossBorderPayment,
  revertCrossBorderSettlement,
  InsufficientPoolLiquidityError,
  UnseededCorridorPoolError,
  UnresolvedCurrencyError,
} = require('./lib/settlementEngine');
const { mintShareLegAndReceipts } = require('./lib/merchantShareFlow');
const Country = require('./models/Country');
const AuditLog = require('./models/AuditLog');
const CountryCurrencyPool = require('./models/CountryCurrencyPool');
const GeuSupply = require('./models/GeuSupply');
const GeuEntryMint = require('./models/GeuEntryMint');
const GeuGrowthEvent = require('./models/GeuGrowthEvent');
const GeuRedemption = require('./models/GeuRedemption');
const { getRate } = require('./lib/fxRates');
const { loadCurrencyDecimals, decimalsFor } = require('./lib/currencyDecimals');

// Audit fix: AuditLog was fully defined (schema, indexes) but never written
// to anywhere in this file — every route that could meaningfully report a
// security- or money-relevant event had nowhere to record it. This helper
// wires it in without touching any economic logic: it is purely an
// observability side-channel. Fire-and-forget and swallow-on-failure by
// design — an audit write must never be able to fail, slow down, or change
// the outcome of the request it's describing. Call sites choose what to log;
// this only guarantees that logging itself is safe to call inline.
function recordAudit({ userId = null, action, status = 'info', message = '', req = null, metadata = {} }) {
  AuditLog.create({
    userId,
    action,
    status,
    message,
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '',
    userAgent: req?.headers?.['user-agent'] || '',
    metadata,
  }).catch((error) => {
    console.error(`AuditLog write failed for action "${action}":`, error.message);
  });
}


// The prototype float every account opens with. Kept here rather than only on
// the schema so accounts written before the field existed read back the same
// number a new one does, instead of undefined.
const DEFAULT_ACCOUNT_BALANCE = 10000;

const accountBalanceOf = (user) => {
  const raw = Number(user?.balance);
  return Number.isFinite(raw) ? raw : DEFAULT_ACCOUNT_BALANCE;
};

// Money is held as a Number, so every derived figure gets rounded to the
// minor unit before it is stored. 1000 * 0.0157 is 15.700000000000001 in
// binary floating point, and a balance carrying that dust would drift a
// little further with every payment.
//
// Bug fix (audit finding): this used to hardcode 2 decimal places for
// every currency, but not every currency has 2 — JPY, KRW, VND, the CFA
// francs and others have none at all (see models/Currency.js's `decimals`
// field, which was already being seeded correctly and simply never read
// anywhere). A JPY balance could end up carrying values like 1234.56,
// which is not a real amount of any unit that currency has. The optional
// `currencyCode` looks up the right precision via lib/currencyDecimals.js
// (a small in-memory cache, since Currency.decimals lives in Mongo and
// this needs to stay synchronous); omitting it keeps the exact previous
// 2-decimal behaviour, which is still correct for the large majority of
// seeded currencies and for non-ISO prototype units like Gloobal Coin
// ('GC') that were never meant to be looked up there.
const toMinorUnit = (value, currencyCode) => {
  const decimals = currencyCode ? decimalsFor(currencyCode) : 2;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

// Which country an account is registered in, and how a country is read off a
// mobile number when none was recorded. Shared with lib/settlementEngine.js
// so the country this API REPORTS for a payee and the country it SETTLES
// them in can never be two different places — see that module's header for
// why the stored field alone is not the answer.
const {
  DEFAULT_COUNTRY_ISO,
  deriveCountryIsoFromMobileNumber,
  accountCountryIso,
} = require('./lib/accountCountry');

// One answer to "what currency does this country transact in", shared with
// lib/settlementEngine.js. Prefers the seeded Country row and falls back to
// the bundled country/currency map, so a database whose reference tables were
// never seeded resolves real currencies instead of defaulting everything to
// rupees — see that module's header for what that default was actually doing
// in production.
const { resolveCountry, localCurrencyFor } = require('./lib/countryCurrency');

// Resolves whatever country ISO a client claims (the country picked on the
// registration phone-code screen) against the seeded Country collection —
// the same source of truth lib/settlementEngine.js reads localCurrency
// from. Never trusts an unseeded/malformed code.
//
// When the client sends nothing usable, this used to write 'IN' outright.
// That is what silently made every account Indian for as long as the
// frontend omitted the field: an unsent country and a country that is not a
// country were treated identically, and the account's own mobile number —
// which says where its owner is in plain digits — was never consulted. It is
// consulted now, and 'IN' is only reached when the number cannot answer
// either.
// Cached across requests. Only ever flips false -> true — seeding adds
// documents and nothing removes them — so a stale `true` cannot happen, and a
// stale `false` self-corrects on the next lookup that misses.
let countryCollectionSeeded = null;

async function resolveRegistrationCountryIso(rawIso, mobileNumber) {
  const fallbackIso = deriveCountryIsoFromMobileNumber(mobileNumber) || DEFAULT_COUNTRY_ISO;
  const candidate = String(rawIso || '').trim().toUpperCase();
  // Was `candidate.length !== 2`, which accepted any two characters. A real
  // ISO 3166-1 alpha-2 code is two letters.
  if (!/^[A-Z]{2}$/.test(candidate)) return fallbackIso;

  const match = await Country.findOne({ iso: candidate }).select('iso').lean();
  if (match) return match.iso;

  // A miss means one of two very different things, and treating them the same
  // is what silently made every account Indian: either the client sent a code
  // that genuinely isn't a country, or the Country collection was never
  // seeded. In production it is the second — the collection holds zero
  // documents, so this lookup could never match anything and every
  // registration on earth fell through to 'IN'. That is not validation, it is
  // data loss with a validation-shaped comment on it.
  //
  // So: keep validating against the collection whenever it has data, and when
  // it is empty accept a well-formed code rather than overwriting the person's
  // actual country with a default. Loudly, because an unseeded collection is
  // a deployment problem worth fixing, not a state to settle into.
  if (countryCollectionSeeded !== true) {
    countryCollectionSeeded = (await Country.estimatedDocumentCount()) > 0;
  }
  if (countryCollectionSeeded) return fallbackIso;

  console.warn(
    `[country] countries collection is empty — accepting "${candidate}" without validation. ` +
    'Run scripts/seed-countries-currencies.mjs to restore the allow-list.'
  );
  return candidate;
}

// Real registered-user count per country, grouped in Mongo (not pulled
// across the wire and counted in JS) so this stays cheap as the user
// collection grows. Every User document carries countryIso (see
// models/User.js — resolveRegistrationCountryIso above is what sets it at
// registration, defaulting to 'IN'), so grouping on that field directly
// gives each country's actual signed-up total, and the values sum to
// exactly User.countDocuments() with no separate bookkeeping to drift.
async function countUsersByCountry() {
  const rows = await User.aggregate([
    { $group: { _id: '$countryIso', count: { $sum: 1 } } }
  ]);
  const byCountry = {};
  for (const row of rows) {
    const iso = String(row._id || 'IN').trim().toUpperCase();
    if (!iso) continue;
    byCountry[iso] = (byCountry[iso] || 0) + row.count;
  }
  return byCountry;
}

const app = express();

// Middleware
//
// A body cap, because express.json() defaults to 100kb and nothing this API
// accepts is anywhere near that — the largest legitimate payload is a face
// descriptor. It bounds what a single request can make the process allocate.
app.use(express.json({ limit: '64kb' }));

// CORS was `cors()` with no argument, which answers every origin with
// `Access-Control-Allow-Origin: *`. That let any page on the internet call this
// API from a visitor's browser. Now an allowlist: the deployed frontends, plus
// localhost for development.
//
// Requests with no Origin at all (curl, server-to-server, the health checker)
// are allowed through — CORS is a browser mechanism and refusing them would
// break non-browser callers without stopping anything, since a program that
// sets no Origin was never subject to it in the first place.
const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS ||
    'https://gloobalv3.netlify.app,http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600
  })
);

// A handful of headers that cost nothing and close off the cheapest attacks.
// Not a replacement for helmet; just the subset that matters for a JSON API
// with no HTML surface of its own.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Frame-Options', 'DENY');
  res.removeHeader('X-Powered-By');
  next();
});

// MongoDB Connection
const mongoURI = process.env.MONGO_URI || 'YOUR_MONGODB_CONNECTION_STRING_HERE';

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

const normalizeText = (value) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Puts a submitted number into E.164, filling in India's calling code for the
// bare national forms this app has always accepted from Indian users.
//
// The '+' guard is load-bearing. Without it, the 10-digit rule below fires on
// any input whose digits happen to total ten — INCLUDING numbers that already
// carried their own country code. Seven of the 194 countries the registration
// picker offers have an E.164 form exactly ten digits long: Belgium (+32),
// Sweden (+46), Norway (+47), Denmark (+45), Singapore (+65), New Zealand
// (+64) and Iceland (+354). A Dane registering +4512345678 had it stored as
// +914512345678 — a different country's calling code stapled onto their real
// number. That corrupts the account's number outright, and with it the only
// remaining signal of where its owner is (see lib/accountCountry.js), so a
// Danish payee resolved as Indian no matter what else was fixed.
//
// A value that already starts with '+' is by definition already carrying a
// country code and is never a bare Indian national number, so it is left
// exactly as submitted.
const normalizeMobileNumber = (value) => {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+')) return raw;

  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;

  return raw;
};

// The shortest national number we'll treat as identifying on its own. Any
// shorter and a suffix match says nothing useful — plenty of unrelated
// numbers share their last few digits.
const MIN_IDENTIFYING_NATIONAL_LENGTH = 7;

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds an account whose stored number carries the same subscriber digits
// as the one submitted, regardless of which country calling code sits in
// front of them. Used to tell "you picked the wrong flag" apart from "this
// number has never been registered", which a plain exact-match lookup
// can't distinguish.
const findUserByNationalNumber = async (mobileNumber) => {
  const national = nationalNumberFrom(mobileNumber);

  if (!national || national.length < MIN_IDENTIFYING_NATIONAL_LENGTH) return null;

  return User.findOne({
    mobileNumber: new RegExp(`^\\+\\d{1,4}${escapeRegExp(national)}$`)
  });
};

// The ID trail, newest first, always including the ID this account started
// with.
//
// Only renames were ever recorded, so an account that has never been
// renamed had an empty history and the original ID — the one the founder
// asked to see dated — appeared nowhere. The original is derivable rather
// than lost: it is the oldest entry's symbolId if there are renames, or the
// current symbolId if there are none, and it came into existence when the
// account did. That derivation runs only when no 'created' entry is
// already stored, so a real recorded one always wins.
const serializeSymbolIdHistory = (user) => {
  const stored = Array.isArray(user.symbolIdHistory) ? user.symbolIdHistory : [];

  const entries = stored.map((entry) => ({
    symbolId: entry.symbolId,
    action: entry.action === 'created' ? 'created' : 'changed',
    createdAt: entry.createdAt || entry.changedAt || null,
    // What this ID was renamed TO. Stored on every 'changed' entry since
    // renames were first recorded, but never serialized — so a client could
    // only reconstruct the succession by assuming entries are contiguous and
    // in order. Sending it makes "this ID became that one" a fact the client
    // reads rather than infers, which is what the Update History screen
    // needs to show a rename as a pair.
    replacedBy: entry.replacedBy || null,
    // Kept in the payload for clients built before createdAt existed.
    changedAt: entry.changedAt || entry.createdAt || null,
    replacedBy: entry.replacedBy || null
  }));

  if (!entries.some((entry) => entry.action === 'created') && user.createdAt) {
    const oldest = entries.length
      ? entries.reduce((a, b) => (new Date(a.createdAt || 0) <= new Date(b.createdAt || 0) ? a : b))
      : null;
    entries.push({
      symbolId: oldest ? oldest.symbolId : user.symbolId,
      action: 'created',
      createdAt: user.createdAt,
      changedAt: user.createdAt,
      replacedBy: null
    });
  }

  return entries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

const publicUserPayload = async (user) => {
  const hasPin = Boolean(await Pin.exists({ userId: user._id }));
  const hasPasskey = Array.isArray(user.passkeys) && user.passkeys.length > 0;
  const joinedDate = user.createdAt || null;

  return {
    fullName: user.fullName,
    email: user.email || '',
    mobileNumber: user.mobileNumber || user.fullName,
    symbolId: user.symbolId,
    // The account's permanent identity — the _id every transaction, ledger
    // entry, receipt and asset seed is actually keyed on.
    //
    // symbolId is NOT an identity: it is a chosen, user-changeable handle, and
    // the client had no other identifier to work with. That is why renaming an
    // ID wiped the local ledger and the Pay Later / Assets history on screen —
    // the account-scoped React tree is keyed on "who is signed in", and with
    // only symbolId available a rename was indistinguishable from a different
    // person signing in, which is exactly the case that key exists to reset.
    //
    // Exposed as a string because it is only ever compared for equality on the
    // client; nothing there should be constructing ObjectIds.
    accountId: String(user._id),
    // The country this account registered from. It was stored from the very
    // first version of this route but never handed back, so the client had
    // no way to learn it and fell back to a hardcoded India on every load —
    // which is why a Kenyan or British account showed an Indian flag on its
    // own dashboard. Every response that carries a user goes through this
    // helper, so returning it here covers login, profile and registration
    // alike.
    //
    // Read through accountCountryIso rather than straight off the document:
    // every account registered before the frontend started sending a country
    // carries the schema's bare 'IN' default whether or not its owner is in
    // India, so the stored value alone would tell a US account it is Indian —
    // and this response is what the client sets its OWN flag and currency
    // from.
    countryIso: accountCountryIso(user),
    referredBy: user.referredBy || null,
    referralCount: user.referralCount || 0,
    cashbackRate: Number(user.cashbackRate) || 0,
    // Accounts created before the balance field existed have no value stored,
    // and `undefined` would render as a blank balance card rather than a
    // number. They open at the same float a new account does.
    balance: Number.isFinite(Number(user.balance)) ? Number(user.balance) : DEFAULT_ACCOUNT_BALANCE,
    symbolIdHistory: serializeSymbolIdHistory(user),
    hasPin,
    hasPasskey,
    createdAt: joinedDate,
    joinedDate
  };
};


// OTP Prototype APIs
const validOtpPurposes = ['registration', 'login', 'pin_reset', 'mobile_change'];

const resolveOtpPurpose = (purpose) => {
  const cleanPurpose = String(purpose || 'registration').trim();

  return validOtpPurposes.includes(cleanPurpose) ? cleanPurpose : 'registration';
};

const REGISTRATION_OTP_WINDOW_MS = 10 * 60 * 1000;

const findVerifiedRegistrationOtp = async (mobileNumber) => {
  const verifiedAfter = new Date(Date.now() - REGISTRATION_OTP_WINDOW_MS);

  return Otp.findOne({
    mobileNumber,
    purpose: 'registration',
    verifiedAt: { $ne: null, $gte: verifiedAfter },
    consumedAt: null
  }).sort({ verifiedAt: -1 });
};

const consumeOtp = async (otpRecord) => {
  otpRecord.consumedAt = new Date();
  await otpRecord.save();
};

const PIN_RESET_OTP_WINDOW_MS = 10 * 60 * 1000;

const findVerifiedPinResetOtp = async (mobileNumber) => {
  const verifiedAfter = new Date(Date.now() - PIN_RESET_OTP_WINDOW_MS);

  return Otp.findOne({
    mobileNumber,
    purpose: 'pin_reset',
    verifiedAt: { $ne: null, $gte: verifiedAfter },
    consumedAt: null
  }).sort({ verifiedAt: -1 });
};

// ─── Authentication ─────────────────────────────────────────────────────────
//
// Until now this API had none. Every route took a `symbolId` out of the body or
// the path and trusted it, which meant a Gloobal ID was simultaneously a public
// address and the only thing standing between a stranger and the account:
// anyone could read a balance and a phone number, overwrite a PIN through
// /api/pin/set, and then spend the balance through /api/transactions/send.
//
// A caller now proves who it is with a bearer token, minted only in exchange
// for a real credential (PIN, or a WebAuthn assertion), and routes that touch
// an account check that the token names THAT account.
//
// The token is an HMAC-signed payload rather than a JWT, deliberately: it needs
// no dependency, and the one algorithm it accepts cannot be talked down to
// "none" by a caller. It is a bearer token, so it is only as safe as the
// transport — which is HTTPS in every deployment of this API.

const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Is this a real deployment, as opposed to somebody's laptop or a test run?
//
// NODE_ENV alone is not enough to answer that here: Render does NOT set
// NODE_ENV for a Node service unless you add it yourself, so keying off it
// would have left the live API permanently classified as "development" — the
// exact reading that let the boot-time random key below survive in production
// for as long as it did. RENDER=true is injected into every Render service's
// environment by the platform, so the two together cover both the conventional
// signal and the one this app is actually deployed behind.
const IS_PRODUCTION_DEPLOY =
  process.env.NODE_ENV === 'production' || String(process.env.RENDER || '') === 'true';

// The bearer-token signing key.
//
// A missing secret must never fall back to a constant: a signing key that ships
// in the source signs tokens anybody can forge, which is indistinguishable from
// having no authentication at all.
//
// It also must not silently fall back to a random per-boot key in production,
// which is what this did. That reads like a safe failure — it works, and the
// only cost is that a restart signs everybody out — but on Render's free tier
// the service sleeps whenever it is idle, so "a restart" is *every few
// minutes of quiet*. The practical effect was that a person who signed in,
// put their phone down, and came back to send money was met with a 401 and
// "sign in to continue" on a session that was never actually invalid. A
// warning in a log nobody reads is not a control; refusing to boot is.
//
// So: production requires the secret and exits if it is absent. Local and
// test runs keep the old per-boot key, where a restart signing you out is
// both expected and harmless.
const AUTH_TOKEN_SECRET_MIN_LENGTH = 32;

const resolveAuthTokenSecret = () => {
  const configured = String(process.env.AUTH_TOKEN_SECRET || '').trim();

  if (configured) {
    // Length-checked rather than trusted: a one-word secret is a forgeable
    // HMAC key, and failing loudly at boot is far cheaper than discovering it
    // from the outside. Generate one with:
    //   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
    if (configured.length < AUTH_TOKEN_SECRET_MIN_LENGTH) {
      console.error(
        `FATAL: AUTH_TOKEN_SECRET is only ${configured.length} characters. ` +
        `It must be at least ${AUTH_TOKEN_SECRET_MIN_LENGTH}. Generate one with: ` +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
      process.exit(1);
    }
    return configured;
  }

  if (IS_PRODUCTION_DEPLOY) {
    console.error(
      'FATAL: AUTH_TOKEN_SECRET is not set. This is a production deploy, and ' +
      'signing tokens with a key generated at boot would invalidate every ' +
      'existing session on every restart — which on Render\'s free tier means ' +
      'every cold start. Set AUTH_TOKEN_SECRET in the service environment ' +
      '(Render dashboard -> Environment) to a stable random value. Generate ' +
      'one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
    process.exit(1);
  }

  console.warn(
    'AUTH_TOKEN_SECRET is not set. Using a random key generated at boot — ' +
    'restarting will sign everybody out. Fine locally; production refuses to ' +
    'start without it.'
  );
  return crypto.randomBytes(48).toString('hex');
};

const AUTH_TOKEN_SECRET = resolveAuthTokenSecret();

const base64url = (input) => Buffer.from(input).toString('base64url');

const signAuthPayload = (encodedPayload) =>
  crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(encodedPayload).digest('base64url');

const issueAuthToken = (user) => {
  const payload = base64url(
    JSON.stringify({
      sub: String(user._id),
      symbolId: user.symbolId,
      iat: Date.now(),
      exp: Date.now() + AUTH_TOKEN_TTL_MS
    })
  );

  return `${payload}.${signAuthPayload(payload)}`;
};

const readAuthToken = (token) => {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;

  const expected = signAuthPayload(payload);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);

  // Constant time, and length-checked first because timingSafeEqual throws on a
  // length mismatch — which would itself be a timing signal.
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims || typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch (error) {
    return null;
  }
};

const bearerFrom = (req) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

// The account behind the token, or null. Used by requireAuth, and directly by
// the routes that accept EITHER a token or a freshly verified OTP.
const authenticatedUser = async (req) => {
  const claims = readAuthToken(bearerFrom(req));
  if (!claims) return null;

  const user = await User.findById(claims.sub);
  if (!user) return null;

  // The token names an ID the account no longer uses — it was renamed through
  // /api/profile/change-symbol-id. The account is still the same document, so
  // the token stays valid; this only stops a stale ID being trusted as the
  // caller's identity further down.
  return user;
};

const requireAuth = async (req, res, next) => {
  const user = await authenticatedUser(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Sign in to continue.'
    });
  }

  req.authUser = user;
  next();
};

// Confirms the authenticated account is the one the route is about. Reads the
// ID from wherever that route carries it — path parameter first, then body,
// then query — and compares against the token's own account.
//
// Comparison is by document id, not by symbolId string, so a rename mid-session
// cannot lock somebody out of their own data.
const requireSelf = (...sources) => async (req, res, next) => {
  const candidates = sources
    .map((source) => req.params?.[source] ?? req.body?.[source] ?? req.query?.[source])
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .filter(Boolean);

  if (candidates.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Gloobal ID is required.'
    });
  }

  for (const candidate of candidates) {
    const decoded = safeDecodeSymbolId(candidate).trim() || candidate;
    if (decoded === req.authUser.symbolId) continue;

    const owner = await User.findOne({ symbolId: decoded }).select('_id').lean();
    if (owner && String(owner._id) === String(req.authUser._id)) continue;

    return res.status(403).json({
      success: false,
      message: 'That account is not yours.'
    });
  }

  next();
};

// ─── Rate limiting ──────────────────────────────────────────────────────────
//
// There was none. The client bundle carries its own throttle (see
// services/api/rateLimiter.js) and says in its first comment that it is not the
// real limit, because it runs in the caller's browser and can be edited out.
// Nothing on this side counted anything, so every credential check and every
// lookup could be driven as fast as the network allowed.
//
// In-process and therefore per-instance: this API runs as one Render service,
// so that is the whole picture today, but it is not a distributed limit and a
// restart forgets every counter. It raises the cost of guessing and scraping;
// it is not a substitute for a shared store once there is more than one
// instance.

const rateBuckets = new Map();

// Trusting an arbitrary X-Forwarded-For would let a caller rotate their own
// limit key by lying, so only the first hop — the one Render itself sets — is
// read, and it is not trusted for anything but bucketing.
const clientKey = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 60 * 1000).unref();

const rateLimit = ({ name, max, windowMs, keyOf }) => (req, res, next) => {
  const scope = keyOf ? keyOf(req) : '';
  const key = `${name}:${clientKey(req)}:${scope}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  bucket.count += 1;

  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      message: `Too many attempts. Try again in ${retryAfter}s.`
    });
  }

  next();
};

// Each limiter gets its own bucket name, so a person registering does not
// spend the budget they will need to log in. Sharing one bucket across every
// credential route would also punish everybody behind a single carrier NAT,
// which in this app's main market is most people.
//
// None of these is the primary defence against PIN guessing — that is the
// per-account five-strike lockout on the Pin record, which no amount of IP
// rotation gets around. These bound how fast the API as a whole can be driven,
// which is what stops the Gloobal ID space being walked.
const WINDOW_MS = 5 * 60 * 1000;

// Sending and verifying codes.
const otpLimit = rateLimit({ name: 'otp', max: 12, windowMs: WINDOW_MS });
// Exchanging a credential for a session: login, PIN verification, passkey
// assertions, setting a PIN.
const credentialLimit = rateLimit({ name: 'credential', max: 30, windowMs: WINDOW_MS });
// Creating accounts.
const registerLimit = rateLimit({ name: 'register', max: 8, windowMs: WINDOW_MS });
// Account lookups. Keyed on the caller only, never on the ID being looked up —
// including the ID would hand an enumerator a fresh bucket for every guess,
// which is the one thing this limit exists to prevent. Generous for normal use,
// far too slow to walk 8^12 with.
const lookupLimit = rateLimit({ name: 'lookup', max: 90, windowMs: WINDOW_MS });
// Everything a signed-in app does in the ordinary course of being used.
const writeLimit = rateLimit({ name: 'write', max: 150, windowMs: WINDOW_MS });

app.post('/api/otp/send', otpLimit, async (req, res) => {
  try {
    const { mobileNumber, purpose } = req.body;
    const cleanMobileNumber = normalizeMobileNumber(mobileNumber);
    const cleanPurpose = resolveOtpPurpose(purpose);

    if (!cleanMobileNumber) {
      return res.status(400).json({
        message: 'Mobile number is required.'
      });
    }

    // Country-code lock. An account is identified by its *full* stored
    // number including the calling code, so the same subscriber digits
    // submitted under a different flag ("+91 8114491364" registered,
    // "+44 8114491364" submitted) must not be treated as the same person.
    // Runs before the OTP is generated, so a mismatched country never gets
    // a code sent to it at all.
    const registeredUser = await User.findOne({ mobileNumber: cleanMobileNumber });

    // Registration must be blocked at step one for a number that already has
    // an account — otherwise the person gets an OTP, picks a Secure ID, and
    // only discovers the number is taken at the referral step. Send back a
    // 409 so the phone screen can stop the flow there and offer login
    // instead. Only applies to registration; login/pin_reset/mobile_change
    // all legitimately require an existing account.
    if (registeredUser && cleanPurpose === 'registration') {
      return res.status(409).json({
        error: 'This number is already registered. Please log in instead.',
        message: 'This number is already registered. Please log in instead.'
      });
    }

    if (!registeredUser) {
      const sameDigitsUser = await findUserByNationalNumber(cleanMobileNumber);

      if (sameDigitsUser) {
        return res.status(400).json({
          error: 'Country code does not match the registered number.',
          message: 'Country code does not match the registered number.'
        });
      }

      // Registration is the one purpose that legitimately has no account
      // yet — a brand-new number has to be allowed through here. Every
      // other purpose (login, PIN reset, mobile change) is only meaningful
      // for a number that already belongs to somebody.
      if (cleanPurpose !== 'registration') {
        return res.status(404).json({
          error: 'No account found for this number.',
          message: 'No account found for this number.'
        });
      }
    }

    const prototypeOtp = process.env.PROTOTYPE_OTP || '123456';
    const otpHash = await bcrypt.hash(prototypeOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.create({
      mobileNumber: cleanMobileNumber,
      otpHash,
      purpose: cleanPurpose,
      expiresAt
    });

    // The code itself is NOT in the response. It used to be, which made the
    // second factor no factor at all: anyone who could reach this route was
    // handed the code for any number they named. There is still no SMS gateway
    // here — the prototype code is a fixed value both sides already know — but
    // an endpoint that returns it is a hole that stays open on the day a real
    // gateway is wired in and the value stops being fixed.
    return res.status(200).json({
      message: 'Prototype OTP sent successfully.',
      mobileNumber: cleanMobileNumber,
      purpose: cleanPurpose
    });
  } catch (error) {
    console.error('OTP send error:', error);

    return res.status(500).json({
      message: 'Server error while sending OTP.'
    });
  }
});

app.post('/api/otp/verify', otpLimit, async (req, res) => {
  try {
    const { mobileNumber, otp, purpose } = req.body;
    const cleanMobileNumber = normalizeMobileNumber(mobileNumber);
    const cleanPurpose = resolveOtpPurpose(purpose);
    const cleanOtp = String(otp || '').trim();

    if (!cleanMobileNumber || !cleanOtp) {
      return res.status(400).json({
        verified: false,
        message: 'Mobile number and OTP are required.'
      });
    }

    const latestOtp = await Otp.findOne({
      mobileNumber: cleanMobileNumber,
      purpose: cleanPurpose,
      verifiedAt: null
    }).sort({ createdAt: -1 });

    if (!latestOtp) {
      return res.status(404).json({
        verified: false,
        message: 'OTP was not requested or already used.'
      });
    }

    if (latestOtp.expiresAt < new Date()) {
      return res.status(400).json({
        verified: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    if (latestOtp.attempts >= latestOtp.maxAttempts) {
      return res.status(429).json({
        verified: false,
        message: 'Too many OTP attempts. Please request a new OTP.'
      });
    }

    const isMatch = await bcrypt.compare(cleanOtp, latestOtp.otpHash);

    if (!isMatch) {
      latestOtp.attempts += 1;
      await latestOtp.save();

      return res.status(401).json({
        verified: false,
        message: 'Invalid OTP.'
      });
    }

    latestOtp.verifiedAt = new Date();
    latestOtp.expiresAt = new Date(Date.now() + REGISTRATION_OTP_WINDOW_MS);
    await latestOtp.save();

    return res.status(200).json({
      verified: true,
      message: 'OTP verified successfully.',
      mobileNumber: cleanMobileNumber,
      purpose: cleanPurpose
    });
  } catch (error) {
    console.error('OTP verify error:', error);

    return res.status(500).json({
      verified: false,
      message: 'Server error while verifying OTP.'
    });
  }
});

// PIN Prototype APIs
const isValidPinFormat = (pin) => /^\d{4,6}$/.test(String(pin || '').trim());

// Sets or replaces an account's PIN.
//
// This was the worst hole in the API. It took { symbolId, pin } and nothing
// else — no OTP, no old PIN, no session — so anyone who knew a Gloobal ID could
// overwrite that account's PIN and then spend its balance through
// /api/transactions/send, which authorises on exactly that PIN. Unauthenticated
// account takeover, with funds movement, in two calls.
//
// It now needs one of two proofs, which between them cover every legitimate
// caller:
//   - a verified registration OTP for the account's own number, which is how a
//     brand-new account sets its first PIN moments after registering; or
//   - a valid session token for the account, which is how somebody who is
//     already signed in changes it.
// Neither is available to a stranger holding only a Gloobal ID.
//
// Changing a PIN you have forgotten is /api/pin/reset, which has required a
// verified pin_reset OTP all along.
app.post('/api/pin/set', credentialLimit, async (req, res) => {
  try {
    const { symbolId, pin } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!cleanSymbolId || !cleanPin) {
      return res.status(400).json({
        message: 'Secure ID and PIN are required.'
      });
    }

    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({
        message: 'PIN must be 4 to 6 digits.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Secure ID not found.'
      });
    }

    const signedInUser = await authenticatedUser(req);
    const isSelf = signedInUser && String(signedInUser._id) === String(user._id);

    // The OTP is looked up against the number the ACCOUNT holds, never a number
    // supplied with the request — otherwise the caller could name a number they
    // control, verify an OTP for it, and use that to set somebody else's PIN.
    const accountMobile = normalizeMobileNumber(user.mobileNumber || user.fullName);
    const registrationOtp = isSelf ? null : await findVerifiedRegistrationOtp(accountMobile);

    if (!isSelf && !registrationOtp) {
      return res.status(403).json({
        message: 'Verify your mobile number, or sign in, before setting a PIN.'
      });
    }

    const pinHash = await bcrypt.hash(cleanPin, 10);

    await Pin.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        pinHash,
        failedAttempts: 0,
        lockedUntil: null,
        changedAt: new Date()
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true
      }
    );

    return res.status(200).json({
      message: 'PIN set successfully.',
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('PIN set error:', error);

    return res.status(500).json({
      message: 'Server error while setting PIN.'
    });
  }
});

app.post('/api/pin/verify', credentialLimit, async (req, res) => {
  try {
    const { symbolId, pin } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!cleanSymbolId || !cleanPin) {
      return res.status(400).json({
        verified: false,
        message: 'Secure ID and PIN are required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        verified: false,
        message: 'Secure ID not found.'
      });
    }

    const pinRecord = await Pin.findOne({ userId: user._id });

    // An account with no PIN on file cannot verify one. This used to accept
    // DEFAULT_LOGIN_PIN — '1234' unless the environment said otherwise — and
    // answer `verified: true` with the full user payload, so any account that
    // had not finished setting a PIN was open to a four-character guess.
    if (!pinRecord) {
      return res.status(404).json({
        verified: false,
        message: 'PIN is not set for this Secure ID.'
      });
    }

    if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
      return res.status(423).json({
        verified: false,
        message: 'PIN is temporarily locked. Please try again later.'
      });
    }

    const isMatch = await bcrypt.compare(cleanPin, pinRecord.pinHash);

    if (!isMatch) {
      pinRecord.failedAttempts += 1;

      if (pinRecord.failedAttempts >= 5) {
        pinRecord.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      }

      await pinRecord.save();

      return res.status(401).json({
        verified: false,
        message: 'Invalid PIN.'
      });
    }

    pinRecord.failedAttempts = 0;
    pinRecord.lockedUntil = null;
    pinRecord.lastVerifiedAt = new Date();
    await pinRecord.save();

    // This route is the primary re-authentication step after a restored
    // session (see Frontend's session.js — a lock screen always costs a
    // PIN or passkey check before reaching the dashboard), so a successful
    // verify has to mint a bearer token here too, not just confirm the PIN
    // was right. Without this, everyone who unlocks via PIN rather than a
    // fresh /api/login would have no token at all, and every requireAuth
    // route after it would 401.
    return res.status(200).json({
      verified: true,
      message: 'PIN verified successfully.',
      user: await publicUserPayload(user),
      token: issueAuthToken(user)
    });
  } catch (error) {
    console.error('PIN verify error:', error);

    return res.status(500).json({
      verified: false,
      message: 'Server error while verifying PIN.'
    });
  }
});


// Reset PIN using verified OTP
app.post('/api/pin/reset', credentialLimit, async (req, res) => {
  try {
    const { symbolId, mobileNumber, pin, newPin } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();
    const cleanMobileNumber = normalizeMobileNumber(mobileNumber);
    const cleanPin = String(newPin || pin || '').trim();

    if (!cleanSymbolId || !cleanMobileNumber || !cleanPin) {
      return res.status(400).json({
        message: 'Secure ID, mobile number, and new PIN are required.'
      });
    }

    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({
        message: 'PIN must be 4 to 6 digits.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Secure ID not found.'
      });
    }

    const userMobile = normalizeMobileNumber(user.mobileNumber || user.fullName);

    if (normalizeText(userMobile) !== normalizeText(cleanMobileNumber)) {
      return res.status(409).json({
        message: 'Mobile number does not match this Secure ID.'
      });
    }

    const verifiedPinResetOtp = await findVerifiedPinResetOtp(cleanMobileNumber);

    if (!verifiedPinResetOtp) {
      return res.status(403).json({
        message: 'Please verify OTP before resetting PIN.'
      });
    }

    const pinHash = await bcrypt.hash(cleanPin, 10);

    await Pin.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        pinHash,
        failedAttempts: 0,
        lockedUntil: null,
        lastVerifiedAt: null,
        changedAt: new Date()
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true
      }
    );

    await consumeOtp(verifiedPinResetOtp);

    return res.status(200).json({
      message: 'PIN reset successfully.',
      // A verified pin_reset OTP for this account's number, plus a new PIN just
      // set: the caller has proved as much as a login proves, so they leave
      // signed in rather than having to immediately log in again.
      token: issueAuthToken(user),
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('PIN reset error:', error);

    return res.status(500).json({
      message: 'Server error while resetting PIN.'
    });
  }
});
// Registration and Multi-Level Referral Engine
app.post('/api/register-symbol', registerLimit, async (req, res) => {
  try {
    const { fullName, mobileNumber, symbolId, referredBy, countryIso } = req.body;

    const cleanMobileNumber = normalizeMobileNumber(mobileNumber || fullName);
    // The name the person actually typed on the profile step, not the phone
    // number. This used to be `cleanFullName = cleanMobileNumber` outright —
    // whatever `fullName` the client sent was read out of req.body above and
    // then never looked at again, so every account this route created was
    // named after its own mobile number regardless of what the registration
    // screen collected. The frontend's PUT /api/profile/:symbolId call right
    // after registration was the only thing that ever fixed it — a second
    // network round trip papering over this route silently discarding the
    // first one, and if that second call failed (a dropped connection, a
    // cold start) the account was stuck with its phone number as its name
    // until the next successful sign-in retried it. Honouring a real name
    // here means the account is correct from the moment it is created.
    // Falls back to the phone number only when no real name was sent at
    // all, which keeps old/other clients that never collected a name
    // working exactly as before.
    const cleanFullNameInput = String(fullName || '').trim();
    const cleanFullName = cleanFullNameInput && cleanFullNameInput !== cleanMobileNumber
      ? cleanFullNameInput
      : cleanMobileNumber;
    const cleanSymbolId = String(symbolId || '').trim();
    const cleanReferrer = String(referredBy || '').trim();
    // The country the person actually picked on the phone-code screen —
    // previously collected on the frontend and then thrown away, which left
    // every account defaulting to 'IN' forever (see the multi-currency
    // settlement code's own comment on that). Resolved against the seeded
    // Country table, never trusted raw, since this is what decides which
    // currency this account's balance — and every cashback it earns — is
    // actually denominated in.
    // The number is passed alongside so an older client that sends no country
    // at all still lands on the right one instead of silently becoming Indian —
    // which is exactly what every registration did until the frontend started
    // sending this field.
    const resolvedCountryIso = await resolveRegistrationCountryIso(countryIso, cleanMobileNumber);

    if (!cleanMobileNumber || !cleanSymbolId) {
      return res.status(400).json({
        message: 'Mobile number and Secure ID are required.'
      });
    }

    if (Array.from(cleanSymbolId).length !== 12) {
      return res.status(400).json({
        message: 'Secure ID must contain exactly 12 symbols.'
      });
    }

    const verifiedRegistrationOtp = await findVerifiedRegistrationOtp(cleanMobileNumber);

    if (!verifiedRegistrationOtp) {
      return res.status(403).json({
        message: 'Please verify OTP before registration.'
      });
    }

    const existingUserBySymbol = await User.findOne({ symbolId: cleanSymbolId });

    if (existingUserBySymbol) {
      const existingMobile = normalizeMobileNumber(
        existingUserBySymbol.mobileNumber || existingUserBySymbol.fullName
      );

      if (normalizeText(existingMobile) !== normalizeText(cleanMobileNumber)) {
        return res.status(409).json({
          message: 'This Secure ID is already registered with a different mobile number.',
          alreadyRegistered: true,
          ownerMismatch: true
        });
      }

      if (!existingUserBySymbol.mobileNumber) {
        existingUserBySymbol.mobileNumber = cleanMobileNumber;
        existingUserBySymbol.fullName = existingUserBySymbol.fullName || cleanFullName;
        await existingUserBySymbol.save();
      }

      await consumeOtp(verifiedRegistrationOtp);

      return res.status(200).json({
        message: 'This Secure ID is already registered. Continue to login.',
        alreadyRegistered: true,
        // A verified registration OTP for this account's own number is proof of
        // control of that number, which is the same proof the first-time path
        // below rests on — so this branch signs the person in too, rather than
        // leaving a returning caller with no token and no way to set a PIN.
        token: issueAuthToken(existingUserBySymbol),
        user: await publicUserPayload(existingUserBySymbol)
      });
    }

    const existingUserByMobile = await User.findOne({
      $or: [
        { mobileNumber: cleanMobileNumber },
        { fullName: cleanMobileNumber }
      ]
    });

    if (existingUserByMobile && existingUserByMobile.symbolId !== cleanSymbolId) {
      return res.status(409).json({
        message: 'This mobile number is already linked with another Secure ID. Please login with that Secure ID.'
      });
    }

    let validReferrerId = null;
    let referralChain = [];
    // Kept around past this block so the Referral edge can be written once
    // the new user actually exists and has an _id to point at.
    let referrerUser = null;

    if (cleanReferrer) {
      referrerUser = await User.findOne({ symbolId: cleanReferrer });

      if (referrerUser) {
        validReferrerId = referrerUser.symbolId;
        referralChain = [
          referrerUser.symbolId,
          ...(Array.isArray(referrerUser.referralChain) ? referrerUser.referralChain : [])
        ].slice(0, 3);
      }
    }

    // The ID trail starts here, not at the first rename. Without this
    // opening entry the history of an account that has never been renamed
    // is empty, and the ID the person actually chose has no recorded
    // moment of creation anywhere.
    const createdAt = new Date();
    const newUser = new User({
      fullName: cleanFullName,
      mobileNumber: cleanMobileNumber,
      symbolId: cleanSymbolId,
      countryIso: resolvedCountryIso,
      referredBy: validReferrerId,
      referralChain,
      symbolIdHistory: [
        { symbolId: cleanSymbolId, action: 'created', createdAt, changedAt: createdAt, replacedBy: null }
      ]
    });

    await newUser.save();

    if (validReferrerId) {
      await User.updateOne(
        { symbolId: validReferrerId },
        { $inc: { referralCount: 1 } }
      );
    }

    // The referral edge itself. Deliberately non-fatal: a referral code
    // that matches nobody, or a write that fails for any reason, must not
    // cost somebody their registration — they simply end up with no
    // referrer. A code that was supplied but matched nothing is logged so
    // the miss is at least visible server-side.
    let referralApplied = false;
    let referralWarning = null;

    if (cleanReferrer) {
      if (referrerUser) {
        try {
          await Referral.create({
            referrerId: referrerUser._id,
            referredId: newUser._id,
            referrerSymbolId: referrerUser.symbolId,
            referredSymbolId: newUser.symbolId,
            status: 'completed'
          });
          referralApplied = true;
        } catch (referralError) {
          console.warn('Referral save skipped:', referralError.message);
          referralWarning = 'Your referral code could not be recorded, but your Gloobal ID was created.';
        }
      } else {
        console.warn(`Referral code did not match any user: ${cleanReferrer}`);
        referralWarning = 'That referral code does not match any Gloobal ID, so no referrer was recorded.';
      }
    }

    await consumeOtp(verifiedRegistrationOtp);

    // referralApplied / referralWarning are reported back rather than kept
    // server-side only. The registration itself still succeeds either way —
    // a bad referral code must not cost somebody their account — but the
    // caller now has something to say about it, instead of the silent drop
    // that made a mistyped code look like it had been accepted.
    return res.status(201).json({
      message: 'Secure ID registered successfully.',
      referralApplied,
      referralWarning,
      // The registration OTP is consumed just above, so this token is the only
      // credential the caller carries out of here — and POST /api/pin/set, the
      // very next step of registration, now requires one.
      token: issueAuthToken(newUser),
      user: await publicUserPayload(newUser)
    });
  } catch (error) {
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'identity';

      return res.status(409).json({
        message:
          duplicateField === 'mobileNumber'
            ? 'This mobile number is already linked with another Secure ID. Please login.'
            : 'This Secure ID is already registered.'
      });
    }

    console.error('Registration Error:', error);

    return res.status(500).json({
      message: 'Server error during registration.'
    });
  }
});
// Secure Login
// Login by Gloobal ID + PIN.
//
// There is deliberately no country-code check here, and adding one would
// be checking nothing: this request carries no country at all. The Gloobal
// ID is globally unique and is itself the credential, so unlike
// /api/otp/send — where the same subscriber digits can legitimately exist
// under two different calling codes and the flag is the only thing telling
// them apart — there is no ambiguity for a country to resolve.
//
// What *was* wrong is presentational and lives on the client: after a
// successful login the app kept whatever flag the person happened to leave
// on the landing screen, so a +91 account could be shown as a UK one. The
// response below carries mobileNumber precisely so the client can derive
// the account's real country instead of guessing.
// Signs in and mints the session token every protected route now needs.
//
// It also accepts a mobile number as the identifier. Logging in by phone used
// to mean calling GET /api/users/resolve first to turn the number into a
// Gloobal ID, which is an unauthenticated oracle mapping phone numbers to
// accounts. The PIN is the credential either way, so the resolution happens
// here, behind it, and that lookup can go back to being a signed-in operation.
app.post('/api/login', credentialLimit, async (req, res) => {
  try {
    const { secureId, symbolId, identifier, mobileNumber, pin } = req.body;
    const loginIdentifier = String(
      secureId || symbolId || identifier || mobileNumber || ''
    ).trim();
    const cleanPin = String(pin || '').trim();

    if (!loginIdentifier || !cleanPin) {
      return res.status(400).json({
        message: 'Secure ID and PIN are required.'
      });
    }

    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({
        message: 'PIN must be 4 to 6 digits.'
      });
    }

    const resolved = await resolveTransactionUserByIdentifier(loginIdentifier);
    const user = resolved?.user || (await User.findOne({ symbolId: loginIdentifier }));

    if (!user) {
      return res.status(404).json({
        message: 'Secure ID not found.'
      });
    }

    const pinRecord = await Pin.findOne({ userId: user._id });

    if (!pinRecord) {
      return res.status(404).json({
        message: 'PIN is not set for this Secure ID. Please set your PIN first.'
      });
    }

    if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
      return res.status(423).json({
        message: 'PIN is temporarily locked. Please try again later.'
      });
    }

    const isMatch = await bcrypt.compare(cleanPin, pinRecord.pinHash);

    if (!isMatch) {
      pinRecord.failedAttempts += 1;

      if (pinRecord.failedAttempts >= 5) {
        pinRecord.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      }

      await pinRecord.save();

      return res.status(401).json({
        message: 'Invalid PIN.'
      });
    }

    pinRecord.failedAttempts = 0;
    pinRecord.lockedUntil = null;
    pinRecord.lastVerifiedAt = new Date();
    await pinRecord.save();

    return res.status(200).json({
      message: 'Login successful.',
      token: issueAuthToken(user),
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('Login Error:', error);

    return res.status(500).json({
      message: 'Server error during login.'
    });
  }
});

// How many accounts exist platform-wide.
//
// Registered BEFORE '/api/profile/:symbolId' deliberately: Express matches
// routes in declaration order, so with the parameterised route first this
// path is read as symbolId === 'count', finds nobody, and answers
// 404 "Profile not found." Order is the whole implementation here — moving
// this below the route beneath it silently breaks it.
//
// No symbolId, and nothing per-account in the response: this is a single
// aggregate the coverage screen prints, not a directory. countDocuments()
// rather than find().length so the count happens in Mongo instead of
// pulling every user document across the wire to measure an array.
app.get('/api/profile/count', async (req, res) => {
  try {
    const [total, byCountry] = await Promise.all([
      User.countDocuments(),
      countUsersByCountry()
    ]);

    return res.status(200).json({
      message: 'User count loaded successfully.',
      total,
      byCountry
    });
  } catch (error) {
    console.error('User Count Error:', error);

    return res.status(500).json({
      message: 'Server error while counting users.'
    });
  }
});

// GET /api/stats — platform-wide figures for the Coverage screen. The same
// count /api/profile/count returns, under the name and key the clients ask
// for, so a caller does not have to know that the only platform statistic
// this server keeps happens to live under the profile prefix. Kept as its own
// route rather than a redirect: this is where a second figure would go.
//
// byCountry is the real per-country breakdown, keyed by the same countryIso
// every user was registered with (see models/User.js). Coverage previously
// had no source for this at all — the per-country "Total users" figure on
// that screen was quietly derived from this device's own Send Money history
// instead (whether *this* account had ever sent to that country), so a
// brand-new registration in India never moved India's number, no matter how
// many people actually signed up from there. This aggregation is the fix:
// it counts real User documents grouped by countryIso, so every country's
// figure is that country's actual registered-user count, and totalUsers
// (a straight countDocuments()) is always exactly the sum of byCountry's
// values, by construction — one field can never drift from the other.
app.get('/api/stats', async (req, res) => {
  try {
    const [totalUsers, byCountry] = await Promise.all([
      User.countDocuments(),
      countUsersByCountry()
    ]);

    return res.status(200).json({ totalUsers, total: totalUsers, byCountry });
  } catch (error) {
    console.error('Stats Error:', error);

    return res.status(500).json({
      message: 'Server error while loading platform statistics.'
    });
  }
});

// Profile Details
app.get('/api/profile/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Secure ID is required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Profile not found.'
      });
    }

    return res.status(200).json({
      message: 'Profile loaded successfully.',
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('Profile Error:', error);

    return res.status(500).json({
      message: 'Server error while loading profile.'
    });
  }
});

// --- Product catalogue --------------------------------------------------
//
// The "Our Services" rows on the Gloobal Bank and Gloobal Coin screens,
// and whether each product is live. Both used to be written into the app
// bundle; changing a status meant a code edit and a deploy. They are rows
// now, so a service goes live by editing one field in Atlas.

// The starting state, seeded once into an empty collection. This is not
// the source of truth after that first write — the database is. Editing
// these constants will not change a deployment whose collection is already
// populated, which is the point: the whole reason this exists is that
// status should stop being a code change.
//
// Every claim here is checked against what the code actually does:
//   Cashless   every transfer settles digitally, no cash leg anywhere
//   Borderless Send Money resolves across countries and converts currency
//   Taxless    there is no tax handling in this codebase at all
//   Limitless  PROTOTYPE_TRANSACTION_MAX_AMOUNT caps every transfer
const DEFAULT_PRODUCTS = [
  { key: 'bank', live: true },
  // Coin became live when /api/coin/{mint,redeem,send} shipped. Before that it
  // was a screen; now it is a currency you can hold, move and cash out, with a
  // reserve behind it that tests/coin-supply-invariant.test.mjs checks.
  { key: 'coin', live: true }
];

const DEFAULT_PRODUCT_SERVICES = [
  { product: 'bank', label: 'Cashless', status: 'live', note: 'Every transfer settles digitally', order: 0 },
  { product: 'bank', label: 'Borderless', status: 'live', note: 'Send across currencies today', order: 1 },
  { product: 'bank', label: 'Taxless', status: 'planned', note: 'No tax handling is built yet', order: 2 },
  { product: 'bank', label: 'Limitless', status: 'planned', note: 'Transfers are still capped per payment', order: 3 },
  // Coin's four, revisited now that the coin exists. Each is either something
  // this codebase does or something it does not, and the three that changed
  // changed because code was written, not because the wording softened:
  //
  //   Stable      pegged 1:1 to the reserve currency and redeemable at that
  //               rate, both directions, by /api/coin/{mint,redeem}
  //   Instant     /api/coin/send commits inside one Mongo transaction; there
  //               is no pending state for a coin transfer to sit in
  //   Backed      CoinReserve holds fiat equal to every coin issued, and
  //               /api/coin/supply reports the comparison rather than a claim
  //   Borderless  still not true: the reserve is denominated in one currency,
  //               so coin cannot yet be minted against or redeemed into
  //               another. Sending across borders is not the missing piece —
  //               a multi-currency reserve is.
  { product: 'coin', label: 'Stable', status: 'live', note: 'Pegged 1:1 and redeemable from reserve', order: 0 },
  { product: 'coin', label: 'Instant', status: 'live', note: 'Transfers settle immediately', order: 1 },
  { product: 'coin', label: 'Borderless', status: 'planned', note: 'The reserve is single-currency for now', order: 2 },
  { product: 'coin', label: 'Backed', status: 'live', note: 'Every coin is backed 1:1 in reserve', order: 3 }
];

// The seed above is insert-only, so it cannot correct a row that already
// exists — which is every coin row on any deployment that has booted before.
// Those rows say the coin has no reserve and no rail, and that is now false.
//
// Narrow on purpose: each update matches the exact stale note as well as the
// label, so a row somebody edited by hand in Atlas does not match and is left
// alone. Once every deployment has run this it becomes a no-op, and it is safe
// to run repeatedly in the meantime.
const COIN_SERVICE_CORRECTIONS = [
  { label: 'Stable', staleNote: 'No peg or reserve exists yet', status: 'live', note: 'Pegged 1:1 and redeemable from reserve' },
  { label: 'Instant', staleNote: 'No settlement rail yet', status: 'live', note: 'Transfers settle immediately' },
  { label: 'Borderless', staleNote: 'No settlement rail yet', status: 'planned', note: 'The reserve is single-currency for now' },
  { label: 'Backed', staleNote: 'No reserve is held yet', status: 'live', note: 'Every coin is backed 1:1 in reserve' }
];

// Runs once at boot. Uses insert-if-absent rather than upsert-with-values
// so it can never overwrite an edit someone made in Atlas — a seed that
// resets your data on every restart is a footgun, not a convenience.
const seedProductCatalogue = async () => {
  try {
    await Promise.all(DEFAULT_PRODUCTS.map((doc) =>
      Product.updateOne({ key: doc.key }, { $setOnInsert: doc }, { upsert: true })
    ));
    await Promise.all(DEFAULT_PRODUCT_SERVICES.map((doc) =>
      ProductService.updateOne({ product: doc.product, label: doc.label }, { $setOnInsert: doc }, { upsert: true })
    ));
    // Correct the coin rows written before the coin existed. Matched on the
    // stale note as well as the label, so only the rows this seed itself wrote
    // are touched. See COIN_SERVICE_CORRECTIONS.
    await Promise.all(COIN_SERVICE_CORRECTIONS.map((row) =>
      ProductService.updateOne(
        { product: 'coin', label: row.label, note: row.staleNote },
        { $set: { status: row.status, note: row.note } }
      )
    ));
    // Same reasoning for the product itself: it was seeded live:false and the
    // insert-only seed cannot revise that. Guarded on the old value so a
    // deliberate takedown (someone setting it false in Atlas to hide a broken
    // coin) is not undone on the next restart... which this cannot distinguish
    // from the stale seed, so it is the one correction here that is not fully
    // safe. It is applied because a coin that works while the catalogue calls
    // it dead is the worse failure, and flipping it back is one Atlas edit.
    await Product.updateOne({ key: 'coin', live: false }, { $set: { live: true } });
  } catch (error) {
    // A failed seed must not stop the server booting. The app carries its
    // own copy of this list as a fallback, so the screens still render.
    console.error('Product catalogue seed error:', error);
  }
};

// readyState 1 is "already connected". Checking it as well as listening
// covers both orderings — this file calls mongoose.connect() above, so the
// connection is normally still opening when this line runs, but a future
// reorder must not silently skip the seed.
if (mongoose.connection.readyState === 1) {
  seedProductCatalogue();
} else {
  mongoose.connection.once('open', seedProductCatalogue);
}

// Populates lib/currencyDecimals.js's cache so toMinorUnit can round each
// currency to its own real precision instead of a hardcoded 2 decimals.
// Currencies are static reference data (142 rows), so one load at boot is
// enough — same reasoning as the product catalogue seed just above not
// needing to re-run. A failed load is not fatal: toMinorUnit already
// falls back to 2 decimals for anything the cache doesn't have, which is
// exactly what every call site did before this fix existed.
const bootCurrencyDecimalsCache = () => {
  loadCurrencyDecimals().catch((error) => {
    console.error('Currency decimals cache load error (falling back to 2dp everywhere):', error);
  });
};

if (mongoose.connection.readyState === 1) {
  bootCurrencyDecimalsCache();
} else {
  mongoose.connection.once('open', bootCurrencyDecimalsCache);
}

// GET /api/products/:product → { product, live, services }
//
// `live` is applied to the rows before they are sent, not left for the
// caller to remember: a service cannot be live inside a product that
// isn't, and enforcing it here means every consumer gets the same answer
// rather than each reimplementing the rule.
app.get('/api/products/:product', async (req, res) => {
  try {
    const product = cleanProduct(req.params.product);

    if (!product) {
      return res.status(400).json({
        message: `Product must be one of: ${INTEREST_PRODUCTS.join(', ')}.`
      });
    }

    const [record, rows] = await Promise.all([
      Product.findOne({ key: product }),
      ProductService.find({ product }).sort({ order: 1, label: 1 })
    ]);

    const live = Boolean(record && record.live);

    return res.status(200).json({
      message: 'Product loaded successfully.',
      product,
      live,
      services: rows.map((row) => ({
        label: row.label,
        status: live && row.status === 'live' ? 'live' : 'planned',
        note: !live && row.status === 'live' ? 'Waiting on this product going live' : row.note
      }))
    });
  } catch (error) {
    console.error('Product read error:', error);

    return res.status(500).json({
      message: 'Server error while loading the product.'
    });
  }
});

// --- Product interest ("I am IN") --------------------------------------
//
// The Gloobal Bank and Gloobal Coin screens ask one question: do you want
// this? Until now the answer lived in React state and was thrown away on
// reload, so the screens gathered nothing. These three routes are what
// make that button a real feature rather than a toggle that lights up.

const INTEREST_PRODUCTS = ['bank', 'coin'];

const cleanProduct = (value) => {
  const product = String(value || '').trim().toLowerCase();

  return INTEREST_PRODUCTS.includes(product) ? product : null;
};

// Registered before '/api/interest/:product' so "status" is never read as
// a product name. Two path segments vs one already keeps them apart, but
// the order is the guarantee, not a coincidence of segment counts.
//
// GET /api/interest/status/:symbolId → which products this account is in
// for. This is what lets "You're on the list" survive a reload, and show
// up on a second device the same person signs in on.
app.get('/api/interest/status/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Gloobal ID is required.'
      });
    }

    const rows = await Interest.find({ symbolId: cleanSymbolId });

    return res.status(200).json({
      message: 'Interest status loaded successfully.',
      symbolId: cleanSymbolId,
      products: rows.map((row) => row.product)
    });
  } catch (error) {
    console.error('Interest status error:', error);

    return res.status(500).json({
      message: 'Server error while loading interest status.'
    });
  }
});

// GET /api/interest/:product → the real count, and the real size of the
// user base it is a fraction of. The app used to print "1 of 1 active
// user" with both numbers hardcoded; both are now counted.
app.get('/api/interest/:product', async (req, res) => {
  try {
    const product = cleanProduct(req.params.product);

    if (!product) {
      return res.status(400).json({
        message: `Product must be one of: ${INTEREST_PRODUCTS.join(', ')}.`
      });
    }

    const [total, totalUsers] = await Promise.all([
      Interest.countDocuments({ product }),
      User.countDocuments()
    ]);

    return res.status(200).json({
      message: 'Interest loaded successfully.',
      product,
      total,
      totalUsers
    });
  } catch (error) {
    console.error('Interest read error:', error);

    return res.status(500).json({
      message: 'Server error while loading interest.'
    });
  }
});

// POST /api/interest — register this account's interest in a product.
//
// Idempotent on purpose: tapping twice, or tapping again from another
// device, must not count the same person twice. The unique index on
// (symbolId, product) enforces that in the database, and the duplicate-key
// error it raises is treated as success — the caller asked for this
// account to be on the list, and it is.
app.post('/api/interest', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, product: rawProduct } = req.body || {};
    const cleanSymbolId = String(symbolId || '').trim();
    const product = cleanProduct(rawProduct);

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Gloobal ID is required.'
      });
    }

    if (!product) {
      return res.status(400).json({
        message: `Product must be one of: ${INTEREST_PRODUCTS.join(', ')}.`
      });
    }

    // Interest is only meaningful from a real account — otherwise the
    // count is just however many times somebody could POST.
    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'No account found for this Gloobal ID.'
      });
    }

    let alreadyRegistered = false;

    try {
      await Interest.create({ userId: user._id, symbolId: cleanSymbolId, product });
    } catch (error) {
      // 11000 is the unique index doing its job.
      if (error && error.code === 11000) {
        alreadyRegistered = true;
      } else {
        throw error;
      }
    }

    const [total, totalUsers] = await Promise.all([
      Interest.countDocuments({ product }),
      User.countDocuments()
    ]);

    return res.status(200).json({
      message: alreadyRegistered ? 'Already on the list.' : 'Interest registered successfully.',
      product,
      registered: true,
      alreadyRegistered,
      total,
      totalUsers
    });
  } catch (error) {
    console.error('Interest register error:', error);

    return res.status(500).json({
      message: 'Server error while registering interest.'
    });
  }
});

// Everyone who registered using this Gloobal ID as their referral code.
// The response carries Gloobal IDs and join dates only — never mobile
// numbers, emails, or internal ObjectIds, since a referrer is not entitled
// to their referrals' contact details.
app.get('/api/referrals/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Gloobal ID is required.'
      });
    }

    const referrer = await User.findOne({ symbolId: cleanSymbolId });

    if (!referrer) {
      return res.status(404).json({
        message: 'No account found for this Gloobal ID.'
      });
    }

    const referrals = await Referral.find({ referrerId: referrer._id }).sort({ createdAt: -1 });

    // Display names for the list, resolved in ONE query rather than one per
    // referral — a referrer with hundreds of invitees would otherwise cost
    // hundreds of round trips to render a single screen.
    //
    // This route still deliberately returns no CONTACT details: no mobile
    // number, no email, nothing that lets the referrer reach these accounts
    // outside Gloobal. A display name is a different thing, and withholding
    // it had a real cost — the referral screen could only show twelve-symbol
    // Gloobal IDs, which is unreadable, so the list was a wall of symbols
    // with no way to tell one person from another.
    //
    // An account that has not set a name yields an empty string. The client
    // renders its own placeholder for that case; it must never be handed the
    // symbolId dressed up as a name.
    const referredSymbolIds = referrals
      .map((referral) => referral.referredSymbolId)
      .filter(Boolean);
    const referredUsers = referredSymbolIds.length > 0
      ? await User.find({ symbolId: { $in: referredSymbolIds } })
          .select('symbolId fullName')
          .lean()
      : [];
    const nameBySymbolId = new Map(
      referredUsers.map((user) => [user.symbolId, user.fullName || ''])
    );

    return res.status(200).json({
      referrals: referrals.map((referral) => ({
        referredSymbolId: referral.referredSymbolId,
        referredName: nameBySymbolId.get(referral.referredSymbolId) || '',
        createdAt: referral.createdAt,
        status: referral.status
      })),
      total: referrals.length
    });
  } catch (error) {
    console.error('Referral list error:', error);

    return res.status(500).json({
      message: 'Server error while loading referrals.'
    });
  }
});

// The eight Gloobal Symbols a Secure ID is built from. Kept here rather
// than imported from the frontend so the server validates against its own
// copy of the alphabet.
const GLOOBAL_SYMBOLS = ['−', '+', '×', '=', '○', '□', '●', '■'];
const SYMBOL_ID_LENGTH = 12;

const isValidSymbolId = (value) => {
  const chars = Array.from(String(value || ''));

  return chars.length === SYMBOL_ID_LENGTH && chars.every((ch) => GLOOBAL_SYMBOLS.includes(ch));
};

// Changing the Gloobal ID someone signed up with. The ID is the identity
// every other route keys off, so the rename has to carry the referral
// graph with it — otherwise a changed ID silently detaches the person from
// everyone they referred and from whoever referred them.
//
// Identity proof here is the *current* symbolId, consistent with every
// other route in this prototype. That is not authentication: anyone who
// knows an ID can rename it. Recorded plainly rather than dressed up —
// this route inherits the codebase-wide missing auth layer and must be put
// behind real session checks along with the rest of them.
// Every collection that stores a Gloobal ID as a plain string, and the field
// holding it. Transactions, ledger entries, receipts, pins and face templates
// all key off ObjectIds and survive a rename untouched — these are the ones
// that do not.
//
// This is a table rather than a hand-written list of update calls because the
// hand-written list was wrong. It covered Referral and User.referredBy while
// asserting in a comment that those were "the only symbolId-valued references
// in the schema". They were not: AssetSeed, Interest, GeuEntryMint,
// GeuGrowthEvent and GeuRedemption all carry one, and every one of them was
// left pointing at an ID its owner no longer held.
//
// Interest is the reference that actually broke a feature rather than merely
// going stale: GET /api/interest/status/:symbolId queries BY symbolId, so a
// rename silently lost the account's "I am IN" record. Its unique index on
// { symbolId, product } also means an orphaned row keeps squatting the freed
// ID, and the next person to claim that ID cannot register interest at all.
//
// Adding a model with a symbolId column means adding a line here. Keep it that
// way: forgetting produces silent orphaned data, never an error.
const SYMBOL_ID_REFERENCE_FIELDS = [
  { model: AssetSeed, field: 'symbolId' },
  { model: Interest, field: 'symbolId' },
  { model: GeuEntryMint, field: 'symbolId' },
  { model: GeuGrowthEvent, field: 'symbolId' },
  { model: GeuRedemption, field: 'symbolId' },
  { model: Referral, field: 'referrerSymbolId' },
  { model: Referral, field: 'referredSymbolId' },
  { model: User, field: 'referredBy' }
];

app.patch('/api/profile/change-symbol-id', writeLimit, requireAuth, requireSelf('currentSymbolId'), async (req, res) => {
  try {
    const currentSymbolId = String(req.body.currentSymbolId || '').trim();
    const newSymbolId = String(req.body.newSymbolId || '').trim();

    if (!currentSymbolId || !newSymbolId) {
      return res.status(400).json({
        error: 'Current and new Gloobal ID are both required.',
        message: 'Current and new Gloobal ID are both required.'
      });
    }

    if (!isValidSymbolId(newSymbolId)) {
      return res.status(400).json({
        error: 'Invalid Gloobal ID format.',
        message: 'Invalid Gloobal ID format.'
      });
    }

    if (newSymbolId === currentSymbolId) {
      return res.status(400).json({
        error: 'That is already your Gloobal ID.',
        message: 'That is already your Gloobal ID.'
      });
    }

    const user = await User.findOne({ symbolId: currentSymbolId });

    if (!user) {
      return res.status(404).json({
        error: 'No account found for this Gloobal ID.',
        message: 'No account found for this Gloobal ID.'
      });
    }

    const taken = await User.findOne({ symbolId: newSymbolId });

    if (taken) {
      return res.status(409).json({
        error: 'This Gloobal ID is already taken. Please choose another.',
        message: 'This Gloobal ID is already taken. Please choose another.'
      });
    }

    // Record which ID this account used to be known by, and when — before
    // the new one is written, so the trail is complete and correctly dated.
    const changedAt = new Date();
    user.symbolIdHistory = [
      ...(Array.isArray(user.symbolIdHistory) ? user.symbolIdHistory : []),
      {
        symbolId: currentSymbolId,
        action: 'changed',
        createdAt: changedAt,
        changedAt,
        replacedBy: newSymbolId
      }
    ];
    user.symbolId = newSymbolId;
    // fullName mirrors the mobile number for these prototype accounts, so
    // it is deliberately left alone — only the ID changes.

    // The rename and every reference rewrite now commit together or not at
    // all. Previously user.save() ran first and the rewrites followed in a
    // separate Promise.all: any failure in between — a dropped connection, a
    // cold-start timeout — left the account renamed while its rows still
    // pointed at an ID it no longer held. And because the old ID is freed for
    // anyone to claim the moment it is released, those orphaned rows could
    // later read as belonging to a different person entirely.
    await withMongoTransaction(async (session) => {
      const opts = session ? { session } : {};

      await user.save(opts);

      for (const ref of SYMBOL_ID_REFERENCE_FIELDS) {
        await ref.model.updateMany(
          { [ref.field]: currentSymbolId },
          { $set: { [ref.field]: newSymbolId } },
          opts
        );
      }

      // referralChain is an array of IDs, so it needs a positional filter
      // rather than a whole-field $set — it is the one reference that cannot
      // be expressed in the table above.
      await User.updateMany(
        { referralChain: currentSymbolId },
        { $set: { 'referralChain.$[entry]': newSymbolId } },
        { arrayFilters: [{ entry: currentSymbolId }], ...opts }
      );

      return true;
    });

    return res.status(200).json({
      message: 'Gloobal ID updated.',
      newSymbolId,
      user: await publicUserPayload(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'This Gloobal ID is already taken. Please choose another.',
        message: 'This Gloobal ID is already taken. Please choose another.'
      });
    }

    console.error('Change Gloobal ID error:', error);

    return res.status(500).json({
      error: 'Server error while updating Gloobal ID.',
      message: 'Server error while updating Gloobal ID.'
    });
  }
});

// The public referral deep link: https://gloobal-pay.onrender.com/r/<encoded Gloobal ID>.
// The frontend builds the path with encodeURIComponent, so a Gloobal ID of
// ■■■■■■■■■■□+ arrives here as %E2%96%A0…%E2%96%A1%2B. Express decodes
// path params itself, but the decode is done again defensively below —
// nothing in the symbol alphabet is a '%', so a second pass over an
// already-decoded ID is a no-op, and the try/catch keeps a malformed
// sequence from throwing a 500 instead of the 404 it deserves.
//
// Bug fix: this used to default to https://gloobal.netlify.app — the
// OLD frontend. Every referral link anyone followed landed them on a
// different, no-longer-actively-used app instead of the one they were
// actually invited to (gloobalv3.netlify.app), which is what "the
// referral link doesn't work" looked like from the outside: it opened
// *something*, just not the right something. Set the APP_BASE_URL env
// var on Render if this ever needs to change without a redeploy; this
// default is what ships until then.
const REFERRAL_APP_BASE_URL = process.env.APP_BASE_URL || 'https://gloobalv3.netlify.app';

const safeDecodeSymbolId = (raw) => {
  const value = String(raw || '');
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

app.get('/r/:symbolId', lookupLimit, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();

    if (!symbolId) {
      return res.status(404).json({
        error: 'Referral link is invalid or expired.'
      });
    }

    const user = await User.findOne({ symbolId });

    if (!user) {
      return res.status(404).json({
        error: 'Referral link is invalid or expired.'
      });
    }

    // Hand the visitor to the app with the referrer pre-filled. Re-encoding
    // is required: the query value goes through the same symbol set, and an
    // unencoded '+' in a query string means a space.
    return res.redirect(`${REFERRAL_APP_BASE_URL}/?ref=${encodeURIComponent(symbolId)}`);
  } catch (error) {
    console.error('Referral link error:', error);

    return res.status(500).json({
      error: 'Server error while resolving referral link.'
    });
  }
});

app.put('/api/profile/:symbolId', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Secure ID is required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Profile not found.'
      });
    }

    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'fullName')) {
      const cleanFullName = String(req.body.fullName || '').trim();

      if (!cleanFullName) {
        return res.status(400).json({
          message: 'Name cannot be empty.'
        });
      }

      if (cleanFullName.length > 80) {
        return res.status(400).json({
          message: 'Name cannot be more than 80 characters.'
        });
      }

      updates.fullName = cleanFullName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const cleanEmail = String(req.body.email || '').trim().toLowerCase();

      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({
          message: 'Please enter a valid email address.'
        });
      }

      if (cleanEmail.length > 120) {
        return res.status(400).json({
          message: 'Email cannot be more than 120 characters.'
        });
      }

      updates.email = cleanEmail;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'No profile changes provided.'
      });
    }

    Object.assign(user, updates);
    await user.save();

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('Profile update error:', error);

    return res.status(500).json({
      message: 'Server error while updating profile.'
    });
  }
});
async function getWebAuthnServer() {
  return await import('@simplewebauthn/server');
}

function getWebAuthnConfig(req) {
  // Fallback only for a caller that sends no Origin header; every real
  // WebAuthn call is a browser request and always carries one. It named
  // gloobal.netlify.app, a site that no longer exists, which would have
  // derived an rpID for a domain nobody can serve.
  const requestOrigin = req.get('origin') || 'https://gloobalv3.netlify.app';
  const parsedOrigin = new URL(requestOrigin);

  return {
    rpName: 'Gloobal Pay',
    rpID: parsedOrigin.hostname,
    origin: requestOrigin
  };
}

// Passkey Status
app.post('/api/passkey/status', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Secure ID is required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Secure ID not found.'
      });
    }

    return res.status(200).json({
      hasPasskey: Array.isArray(user.passkeys) && user.passkeys.length > 0,
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('Passkey status error:', error);

    return res.status(500).json({
      message: 'Could not check device authentication status.'
    });
  }
});

// Device Authentication Prototype - Register Options
app.post('/api/passkey/register/options', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Secure ID is required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Secure ID not found.'
      });
    }

    const existingPasskeys = Array.isArray(user.passkeys) ? user.passkeys : [];

    if (existingPasskeys.length > 0) {
      return res.status(409).json({
        message: 'Device authentication is already registered for this Secure ID. Please verify existing device.'
      });
    }

    const { generateRegistrationOptions } = await getWebAuthnServer();
    const { rpName, rpID } = getWebAuthnConfig(req);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new Uint8Array(Buffer.from(user.symbolId, 'utf8')),
      userName: user.symbolId,
      userDisplayName: user.mobileNumber || user.fullName,
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports || []
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform'
      }
    });

    user.currentChallenge = options.challenge;
    await user.save();

    return res.status(200).json(options);
  } catch (error) {
    console.error('Passkey registration options error:', error);

    return res.status(500).json({
      message: `Could not create passkey registration options: ${error.message}`
    });
  }
});

// Device Authentication Prototype - Register Verify
app.post('/api/passkey/register/verify', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, response } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();

    if (!cleanSymbolId || !response) {
      return res.status(400).json({
        message: 'Secure ID and device response are required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user || !user.currentChallenge) {
      return res.status(400).json({
        message: 'Passkey registration was not started.'
      });
    }

    const passkeys = Array.isArray(user.passkeys) ? user.passkeys : [];

    if (passkeys.length > 0) {
      user.currentChallenge = null;
      await user.save();

      return res.status(409).json({
        verified: false,
        message: 'Device authentication is already registered for this Secure ID. Please verify existing device.'
      });
    }

    const { verifyRegistrationResponse } = await getWebAuthnServer();
    const { rpID, origin } = getWebAuthnConfig(req);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    });

    if (!verification.verified) {
      return res.status(400).json({
        verified: false,
        message: 'Device authentication setup failed.'
      });
    }

    const { registrationInfo } = verification;
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    passkeys.push({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || response.response?.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp
    });

    user.passkeys = passkeys;
    user.currentChallenge = null;
    await user.save();

    return res.status(200).json({
      verified: true,
      message: 'Device authentication enabled.',
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('Passkey registration verify error:', error);

    return res.status(500).json({
      verified: false,
      message: `Could not verify device authentication setup: ${error.message}`
    });
  }
});

// Device Authentication Prototype - Auth Options
app.post('/api/passkey/auth/options', credentialLimit, async (req, res) => {
  try {
    const { symbolId } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({
        message: 'Secure ID is required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user) {
      return res.status(404).json({
        message: 'Secure ID not found.'
      });
    }

    const passkeys = Array.isArray(user.passkeys) ? user.passkeys : [];

    if (passkeys.length === 0) {
      return res.status(404).json({
        message: 'No device authentication is registered yet.'
      });
    }

    const { generateAuthenticationOptions } = await getWebAuthnServer();
    const { rpID } = getWebAuthnConfig(req);

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports || []
      })),
      userVerification: 'preferred'
    });

    user.currentChallenge = options.challenge;
    await user.save();

    return res.status(200).json(options);
  } catch (error) {
    console.error('Passkey authentication options error:', error);

    return res.status(500).json({
      message: `Could not create device authentication options: ${error.message}`
    });
  }
});

// Device Authentication Prototype - Auth Verify
app.post('/api/passkey/auth/verify', credentialLimit, async (req, res) => {
  try {
    const { symbolId, response } = req.body;
    const cleanSymbolId = String(symbolId || '').trim();

    if (!cleanSymbolId || !response) {
      return res.status(400).json({
        message: 'Secure ID and device response are required.'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });

    if (!user || !user.currentChallenge) {
      return res.status(400).json({
        message: 'Device authentication was not started.'
      });
    }

    const passkeys = Array.isArray(user.passkeys) ? user.passkeys : [];
    const passkey = passkeys.find((item) => item.id === response.id);

    if (!passkey) {
      return res.status(404).json({
        message: 'Registered device was not found.'
      });
    }

    const { verifyAuthenticationResponse } = await getWebAuthnServer();
    const { rpID, origin } = getWebAuthnConfig(req);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports || []
      }
    });

    if (!verification.verified) {
      return res.status(400).json({
        verified: false,
        message: 'Device authentication failed.'
      });
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    user.passkeys = passkeys;
    user.currentChallenge = null;
    await user.save();

    return res.status(200).json({
      verified: true,
      message: 'Device authentication successful.',
      // A verified WebAuthn assertion is a stronger credential than the PIN,
      // so it mints a session on the same terms as /api/login. Without this,
      // signing in by fingerprint alone would leave the app with no token and
      // every protected route answering 401.
      token: issueAuthToken(user),
      user: await publicUserPayload(user)
    });
  } catch (error) {
    console.error('Passkey authentication verify error:', error);

    return res.status(500).json({
      verified: false,
      message: `Could not verify device authentication: ${error.message}`
    });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;



// -------------------------
// Transaction Prototype APIs
// -------------------------

function normalizeTransactionPhoneLookup(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  const compact = raw.replace(/[\s\-()]/g, '');

  if (/^\+\d{7,15}$/.test(compact)) {
    return compact;
  }

  const digits = compact.replace(/\D/g, '');

  if (/^\d{10}$/.test(digits)) {
    return `+91${digits}`;
  }

  if (/^91\d{10}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

async function resolveTransactionUserByIdentifier(identifier) {
  const cleanIdentifier = String(identifier || '').trim();

  if (!cleanIdentifier) {
    return null;
  }

  const bySymbolId = await User.findOne({ symbolId: cleanIdentifier });

  if (bySymbolId) {
    return {
      user: bySymbolId,
      matchedBy: 'symbolId',
      normalizedIdentifier: cleanIdentifier,
    };
  }

  const normalizedPhone = normalizeTransactionPhoneLookup(cleanIdentifier);

  if (!normalizedPhone) {
    return null;
  }

  const byMobileNumber = await User.findOne({ mobileNumber: normalizedPhone });

  if (byMobileNumber) {
    return {
      user: byMobileNumber,
      matchedBy: 'mobileNumber',
      normalizedIdentifier: normalizedPhone,
    };
  }

  const byLegacyFullNamePhone = await User.findOne({ fullName: normalizedPhone });

  if (byLegacyFullNamePhone) {
    return {
      user: byLegacyFullNamePhone,
      matchedBy: 'mobileNumber',
      normalizedIdentifier: normalizedPhone,
    };
  }

  return null;
}

function cleanResolvedTransactionUserPayload(resolved) {
  if (!resolved || !resolved.user) {
    return null;
  }

  return {
    fullName: resolved.user.fullName,
    email: resolved.user.email || '',
    mobileNumber: resolved.user.mobileNumber || '',
    symbolId: resolved.user.symbolId,
    // The payee's own Creator Share. A sender has to be told the rate
    // before they pay, and this route is the only lookup they perform, so
    // withholding it here is what made every recipient card read "0.00%"
    // regardless of what the account had actually set.
    cashbackRate: Number(resolved.user.cashbackRate) || 0,
    // The country this account is registered in — the receiving side of a
    // payment, and the only authority on it.
    //
    // This route is the sender's one and only lookup of the person they are
    // paying, and it did not return a country. So the payment screen had
    // nothing to show for the recipient and fell back to the country the
    // SENDER had selected: paying a UK account from India displayed India and
    // ₹ on both halves of the screen. A recipient's country cannot be derived
    // from the payer's — it can only be read off the recipient's own account,
    // which is here.
    //
    // accountCountryIso, not the raw field: returning the raw field fixed
    // nothing in practice, because the raw field is 'IN' on every account
    // that existed before registration began sending a country. The payment
    // screen dutifully showed the country this route reported, and this route
    // reported India for everybody — so an American payee still resolved with
    // an Indian flag and INR, and the FX conversion still used the wrong
    // receiving currency. See accountCountryIso for how a real 'IN' is told
    // apart from the default standing in for one.
    countryIso: accountCountryIso(resolved.user),
    matchedBy: resolved.matchedBy,
    normalizedIdentifier: resolved.normalizedIdentifier,
  };
}

// A transaction reference is written in the same alphabet as a Gloobal ID —
// twenty of the eight symbols, nothing else. It used to be
// `GLOOBAL-TXN-<epoch ms>-<base36>`, which leaked the exact creation time to
// anyone holding a receipt and read as machine output rather than as part of
// this product.
//
// Twenty symbols is 8^20 ≈ 1.15e18 possibilities, drawn from the CSPRNG, so a
// collision against Transaction.referenceId's unique index is not a practical
// concern (and a duplicate key would surface as a rejected write, never as a
// misattributed payment).
const TRANSACTION_REFERENCE_LENGTH = 20;

function createPrototypeTransactionReference() {
  let reference = '';
  for (let i = 0; i < TRANSACTION_REFERENCE_LENGTH; i += 1) {
    reference += GLOOBAL_SYMBOLS[crypto.randomInt(GLOOBAL_SYMBOLS.length)];
  }
  return reference;
}

// The sending client mints a transaction ID before it calls, because its own
// receipt, complaint window and location record are all keyed by it. Honouring
// that ID here is what makes the sender's receipt and the receiver's history
// row name the SAME transaction — otherwise the two parties hold two different
// IDs for one payment and neither can quote the other's.
//
// Only a well-formed value is accepted (twenty of the eight symbols, nothing
// else), and only if it is genuinely unused: referenceId is unique-indexed, so
// a taken one would fail the write. A rejected value is not an error — the
// server just mints its own, exactly as it does for a client that sends none.
// --- Atomic money movement --------------------------------------------------

// Not enough money. Thrown from inside the transfer so it comes back as a 400
// rather than a 500: it is a normal outcome, not a fault. The balance is now
// checked BY the debit itself (the conditional $inc below), so under
// concurrency the only way to learn there was not enough is to attempt it.
class InsufficientBalanceError extends Error {
  constructor(balance) {
    super('Insufficient balance.');
    this.name = 'InsufficientBalanceError';
    this.balance = balance;
  }
}

// Whether this deployment can run multi-document transactions. Atlas is a
// replica set on every tier and can; a plain standalone mongod — which is what
// a local dev box usually runs — cannot, and says so with one of the signatures
// below. Probed on the first transfer and remembered, so a standalone does not
// pay for a doomed startSession on every payment.
//
// null = not yet known, true / false = answered.
let mongoTransactionsSupported = null;

const isNoTransactionSupport = (error) => {
  const message = String((error && error.message) || '');
  return (
    (error && (error.code === 20 || error.codeName === 'IllegalOperation')) ||
    /Transaction numbers are only allowed on a replica set member or mongos/i.test(message) ||
    /transactions? (are|is) not supported/i.test(message)
  );
};

// Runs `work` inside a transaction when the deployment has them, and directly
// when it does not. `work` receives the session (or null) and must pass it to
// every write it makes. It can be called more than once: withTransaction
// retries on a transient commit error, and each retry starts from a rolled-back
// state, so a `work` that only writes through its session stays correct.
//
// Returns { value, atomic } — `atomic` false means the caller is responsible
// for compensating a partial failure itself.
async function withMongoTransaction(work) {
  if (mongoTransactionsSupported === false) {
    return { value: await work(null), atomic: false };
  }

  let session = null;

  try {
    session = await mongoose.startSession();
  } catch (error) {
    if (!isNoTransactionSupport(error)) throw error;
    mongoTransactionsSupported = false;
    return { value: await work(null), atomic: false };
  }

  try {
    let value;
    await session.withTransaction(async () => {
      value = await work(session);
    });
    mongoTransactionsSupported = true;
    return { value, atomic: true };
  } catch (error) {
    if (!isNoTransactionSupport(error)) throw error;
    mongoTransactionsSupported = false;
    return { value: await work(null), atomic: false };
  } finally {
    await session.endSession();
  }
}

// Accounts created before User.balance existed have no such field. The debit
// below matches on `balance: { $gte: amount }`, and a document without one can
// never satisfy that, so the field is materialised first — at the same default
// every read already reports for it (accountBalanceOf). Idempotent, and a no-op
// for every account created since the field was added.
async function materialiseBalance(user) {
  if (Number.isFinite(Number(user.balance))) return;

  await User.updateOne(
    { _id: user._id, balance: { $exists: false } },
    { $set: { balance: DEFAULT_ACCOUNT_BALANCE } }
  );

  user.balance = DEFAULT_ACCOUNT_BALANCE;
}

async function resolveTransactionReference(candidate) {
  const cleaned = String(candidate || '').trim();
  const chars = Array.from(cleaned);
  const wellFormed =
    chars.length === TRANSACTION_REFERENCE_LENGTH &&
    chars.every((ch) => GLOOBAL_SYMBOLS.includes(ch));

  if (wellFormed && !(await Transaction.exists({ referenceId: cleaned }))) {
    return cleaned;
  }

  return createPrototypeTransactionReference();
}

function cleanTransactionUser(user) {
  if (!user) return null;

  return {
    fullName: user.fullName || '',
    symbolId: user.symbolId || '',
  };
}

function cleanTransactionPayload(transaction, sender, receiver) {
  return {
    id: transaction._id,
    referenceId: transaction.referenceId,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    status: transaction.status,
    note: transaction.note || '',
    sender: cleanTransactionUser(sender),
    receiver: cleanTransactionUser(receiver),
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

// Is this Gloobal ID free to claim?
//
// Public, because registration has to ask it before anybody has an account to
// sign in with — but it answers with one boolean and nothing else. The route
// below returns a name, a phone number and a cashback rate, and registration
// was using THAT to check availability, which is why an unauthenticated caller
// could turn a guessed ID into somebody's contact details.
//
// Being able to tell a taken ID from a free one is inherent to letting people
// choose their own: the mitigation is that this is rate limited and leaks
// nothing but the bit itself.
app.get('/api/users/available', lookupLimit, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(String(req.query.symbolId || req.query.identifier || '')).trim();

    if (!symbolId) {
      return res.status(400).json({
        success: false,
        message: 'A Gloobal ID is required.'
      });
    }

    const taken = await User.exists({ symbolId });

    return res.json({ success: true, symbolId, available: !taken, exists: Boolean(taken) });
  } catch (error) {
    console.error('Availability check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not check that Gloobal ID right now.'
    });
  }
});

// Looks up a payee. Signed in only: the response carries a real name, a mobile
// number and a cashback rate, and it accepts a phone number as the identifier —
// so unauthenticated it was both a directory of the platform's users and a
// phone-number-to-account oracle. Availability checks belong on the route above.
app.get('/api/users/resolve', lookupLimit, requireAuth, async (req, res) => {
  try {
    const identifier = String(req.query.identifier || '').trim();

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Secure ID or mobile number is required.',
      });
    }

    const resolved = await resolveTransactionUserByIdentifier(identifier);

    if (!resolved) {
      return res.status(404).json({
        success: false,
        message: 'No registered user found for this Secure ID or mobile number.',
      });
    }

    return res.json({
      success: true,
      user: cleanResolvedTransactionUserPayload(resolved),
    });
  } catch (error) {
    console.error('Resolve user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not resolve user right now.',
    });
  }
});
// --- My Assets --------------------------------------------------------------
// Cashback is real money the moment it is earned — it is credited straight
// into the payer's spendable balance in the same request that plants this
// seed (see performTransfer in POST /api/transactions/send). It does not
// wait, vest, or need to be claimed to be spent.
//
// What DOES need claiming is the bonus on top: a seed's cashback keeps
// earning 1%/month, compounded, for as long as that growth goes unclaimed.
// interestAvailable below is that unclaimed bonus, always derived on read
// from plantedAt and interestClaimed — never stored — so it can never drift.
// POST /api/assets/claim-interest pays it into real balance on request.
const ASSET_GROWTH_RATE_MONTHLY = 0.01; // 1% per month, internal compounding step
const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

function computeSeed(seed) {
  const cashback = Number(seed.cashback) || 0;
  const amountPaid = Number(seed.amountPaid) || 0;
  const plantedAt = seed.plantedAt ? new Date(seed.plantedAt) : new Date();
  const yearsAccrued = Math.max(0, (Date.now() - plantedAt.getTime()) / MS_PER_YEAR);
  const currentValue = cashback * Math.pow(1 + ASSET_GROWTH_RATE_MONTHLY, yearsAccrued * 12);

  // Total bonus interest earned so far (always >= 0 — currentValue never
  // dips below the original cashback), and however much of that is still
  // unclaimed. interestClaimed only ever increases, so this can't go
  // negative except from float noise, which the floor below absorbs.
  const interestAccrued = Math.max(0, currentValue - cashback);
  const interestClaimed = Number(seed.interestClaimed) || 0;
  const interestAvailable = Math.max(0, interestAccrued - interestClaimed);

  return {
    id: String(seed._id || seed.id || ''),
    business: seed.business,
    category: seed.category || 'General',
    amountPaid,
    cashbackRate: Number(seed.cashbackRate) || 0,
    cashback,
    currentValue,
    interestAccrued,
    interestClaimed,
    interestAvailable,
    yearsAccrued,
    plantedAt,
    currency: seed.currency || 'INR',
  };
}

// The ceiling on what a Gloobal Creator can choose to share back. The floor is
// zero — sharing nothing is a valid choice, and simply plants no seed.
const MAX_CREATOR_CASHBACK_RATE = 0.07;

// PATCH /api/creator/cashback-rate — a Creator sets the share of every payment
// they hand back to whoever paid them. Each Creator picks their own rate;
// Gloobal does not set one centrally. Stored as a decimal (1% = 0.01).
app.patch('/api/creator/cashback-rate', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.body?.symbolId || '').trim();
    const rate = Number(req.body?.cashbackRate);

    if (!cleanSymbolId) {
      return res.status(400).json({ message: 'Gloobal ID is required.' });
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_CREATOR_CASHBACK_RATE) {
      return res.status(400).json({
        message: 'cashbackRate must be between 0 and 0.07 (0%–7%).'
      });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) {
      return res.status(404).json({ message: 'No account found for this Gloobal ID.' });
    }

    user.cashbackRate = rate;
    await user.save();

    return res.status(200).json({ cashbackRate: user.cashbackRate });
  } catch (error) {
    console.error('Creator cashback rate error:', error);
    return res.status(500).json({ message: 'Server error while saving your cashback rate.' });
  }
});

// ─── Face verification ──────────────────────────────────────────────────────
//
// An ADDITIONAL factor. It does not replace the passkey or the PIN, and no
// route below will ever sign anyone in on its own.
//
// That is a deliberate limit, not an unfinished one. The descriptor is
// computed in the browser, so a modified client can post a vector it obtained
// some other way — the server cannot tell a real camera from a good liar.
// Scoring server-side (never trusting a client-sent "matched: true") and
// gating on liveness raise the cost of that attack; they do not remove it.
// WebAuthn does remove it, because the private key never leaves the secure
// enclave, which is exactly why the passkey flow stays as the primary factor.
//
// What is stored: an encrypted descriptor. What is never stored, sent, or
// logged: the captured frames.

const FACE_MAX_FAILED_ATTEMPTS = 5;
const FACE_LOCKOUT_MS = 10 * 60 * 1000;
// Guards against a caller posting a 3-float "descriptor" that would match
// almost anything, or a multi-megabyte array as a memory-exhaustion probe.
const FACE_MIN_DIMENSIONS = 64;
const FACE_MAX_DIMENSIONS = 2048;

/** Validates the descriptor payload shared by enrol and verify. */
function readFacePayload(body) {
  const symbolId = String(body?.symbolId || '').trim();
  const descriptor = body?.descriptor;
  const model = String(body?.model || '').trim();

  if (!symbolId) return { error: 'Gloobal ID is required.' };
  if (!model) return { error: 'A model tag is required so templates stay comparable.' };
  if (!Array.isArray(descriptor)) return { error: 'descriptor must be an array of numbers.' };
  if (descriptor.length < FACE_MIN_DIMENSIONS || descriptor.length > FACE_MAX_DIMENSIONS) {
    return { error: `descriptor must have between ${FACE_MIN_DIMENSIONS} and ${FACE_MAX_DIMENSIONS} values.` };
  }
  if (!descriptor.every((n) => Number.isFinite(n))) {
    return { error: 'descriptor must contain only finite numbers.' };
  }
  return { symbolId, descriptor, model, livenessPassed: Boolean(body?.livenessPassed) };
}

/** 503 when no encryption key is configured — never a plaintext fallback. */
function faceUnavailable(res) {
  return res.status(503).json({
    message: 'Face verification is not configured on this server.',
  });
}

// POST /api/face/enroll — records the reference face for an account.
app.post('/api/face/enroll', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    if (!faceCrypto.isConfigured()) return faceUnavailable(res);

    const payload = readFacePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    // An enrolment taken from a photograph becomes the reference every later
    // check is measured against, so the liveness gate is mandatory here even
    // though it is advisory on verify.
    if (!payload.livenessPassed) {
      return res.status(400).json({
        message: 'Enrolment needs a live capture. Blink when prompted and try again.',
      });
    }

    const user = await User.findOne({ symbolId: payload.symbolId });
    if (!user) return res.status(404).json({ message: 'No account found for this Gloobal ID.' });

    const envelope = faceCrypto.encryptDescriptor(payload.descriptor);

    // Re-enrolling replaces the template outright and clears any lockout —
    // the usual reason to re-enrol is that the old one stopped working.
    await FaceTemplate.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        authTag: envelope.authTag,
        dimensions: envelope.dimensions,
        model: payload.model,
        livenessPassed: true,
        failedAttempts: 0,
        lockedUntil: null,
        enrolledAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      enrolled: true,
      model: payload.model,
      dimensions: envelope.dimensions,
    });
  } catch (error) {
    if (error instanceof faceCrypto.FaceCryptoUnavailableError) return faceUnavailable(res);
    console.error('Face enroll error:', error);
    return res.status(500).json({ message: 'Server error while enrolling your face.' });
  }
});

// POST /api/face/verify — scores a fresh capture against the enrolled template.
app.post('/api/face/verify', credentialLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    if (!faceCrypto.isConfigured()) return faceUnavailable(res);

    const payload = readFacePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const user = await User.findOne({ symbolId: payload.symbolId });
    if (!user) return res.status(404).json({ message: 'No account found for this Gloobal ID.' });

    const template = await FaceTemplate.findOne({ userId: user._id });
    if (!template) {
      return res.status(404).json({ message: 'No face is enrolled for this account.' });
    }

    if (template.lockedUntil && template.lockedUntil > new Date()) {
      return res.status(423).json({
        message: 'Face verification is temporarily locked. Use your PIN or passkey.',
        lockedUntil: template.lockedUntil,
      });
    }

    // Descriptors from different models share no coordinate system. Scoring
    // across them would produce a confident number that means nothing, so
    // this is an error rather than a failed match.
    if (template.model !== payload.model) {
      return res.status(409).json({
        message: 'Enrolled face was recorded with a different model. Please enrol again.',
        enrolledModel: template.model,
      });
    }
    if (template.dimensions !== payload.descriptor.length) {
      return res.status(409).json({
        message: 'Enrolled face has a different descriptor size. Please enrol again.',
      });
    }

    const enrolled = faceCrypto.decryptDescriptor({
      ciphertext: template.ciphertext,
      iv: template.iv,
      authTag: template.authTag,
    });

    const result = compareDescriptors(payload.descriptor, enrolled);

    // A spoofed capture is not scored at all. Refusing before comparison
    // means a held-up photo cannot accumulate near-threshold information
    // about the stored template.
    if (!payload.livenessPassed) {
      return res.status(400).json({
        verified: false,
        reason: 'liveness',
        message: 'Could not confirm a live face. Blink when prompted and try again.',
      });
    }

    if (!result.matched) {
      template.failedAttempts += 1;
      if (template.failedAttempts >= FACE_MAX_FAILED_ATTEMPTS) {
        template.lockedUntil = new Date(Date.now() + FACE_LOCKOUT_MS);
      }
      await template.save();

      return res.status(401).json({
        verified: false,
        reason: 'no_match',
        message: 'That face did not match the one enrolled for this account.',
        attemptsRemaining: Math.max(0, FACE_MAX_FAILED_ATTEMPTS - template.failedAttempts),
      });
    }

    template.failedAttempts = 0;
    template.lockedUntil = null;
    template.lastVerifiedAt = new Date();
    await template.save();

    // The score is returned for the client's own telemetry, never the
    // descriptor itself.
    return res.status(200).json({
      verified: true,
      similarity: result.similarity,
      threshold: result.threshold,
    });
  } catch (error) {
    if (error instanceof faceCrypto.FaceCryptoUnavailableError) return faceUnavailable(res);
    console.error('Face verify error:', error);
    return res.status(500).json({ message: 'Server error while verifying your face.' });
  }
});

// GET /api/face/status/:symbolId — is a face enrolled, and is it usable now?
app.get('/api/face/status/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();
    if (!cleanSymbolId) return res.status(400).json({ message: 'Gloobal ID is required.' });

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) return res.status(404).json({ message: 'No account found for this Gloobal ID.' });

    const template = await FaceTemplate.findOne({ userId: user._id });
    const locked = Boolean(template?.lockedUntil && template.lockedUntil > new Date());

    return res.status(200).json({
      enrolled: Boolean(template),
      locked,
      model: template?.model || null,
      enrolledAt: template?.enrolledAt || null,
      lastVerifiedAt: template?.lastVerifiedAt || null,
      configured: faceCrypto.isConfigured(),
      threshold: matchThreshold(),
    });
  } catch (error) {
    console.error('Face status error:', error);
    return res.status(500).json({ message: 'Server error while reading face status.' });
  }
});

// DELETE /api/face/:symbolId — erases the enrolled template.
//
// Biometric data has to be deletable on request. Under India's DPDP Act this
// is not a nice-to-have, and a face cannot be reissued if it leaks, so
// "delete my face" must actually delete it rather than flag it inactive.
app.delete('/api/face/:symbolId', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();
    if (!cleanSymbolId) return res.status(400).json({ message: 'Gloobal ID is required.' });

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) return res.status(404).json({ message: 'No account found for this Gloobal ID.' });

    const removed = await FaceTemplate.findOneAndDelete({ userId: user._id });

    return res.status(200).json({ deleted: Boolean(removed) });
  } catch (error) {
    console.error('Face delete error:', error);
    return res.status(500).json({ message: 'Server error while deleting your face data.' });
  }
});

// GET /api/assets/:symbolId — a user's planted seeds with live-derived values.
app.get('/api/assets/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();
    if (!cleanSymbolId) {
      return res.status(400).json({ message: 'Secure ID is required.' });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) {
      return res.status(404).json({ message: 'Secure ID not found.' });
    }

    const rawSeeds = await AssetSeed.find({ userId: user._id }).sort({ plantedAt: -1 });
    if (rawSeeds.length === 0) {
      return res.status(200).json({
        totalCashbackEarned: 0, totalInterestAccrued: 0, totalInterestAvailable: 0,
        totalInterestClaimed: 0, seeds: [],
      });
    }

    const seeds = rawSeeds.map(computeSeed);
    // totalCashbackEarned is already sitting in the account's real balance —
    // this is a lifetime total for display, not a second spendable figure.
    // Only totalInterestAvailable is money still waiting to be claimed.
    const totalCashbackEarned = seeds.reduce((s, x) => s + x.cashback, 0);
    const totalInterestAccrued = seeds.reduce((s, x) => s + x.interestAccrued, 0);
    const totalInterestAvailable = seeds.reduce((s, x) => s + x.interestAvailable, 0);
    const totalInterestClaimed = seeds.reduce((s, x) => s + x.interestClaimed, 0);

    return res.status(200).json({
      totalCashbackEarned,
      totalInterestAccrued,
      totalInterestAvailable,
      totalInterestClaimed,
      seeds,
    });
  } catch (error) {
    console.error('Assets fetch error:', error);
    return res.status(500).json({ message: 'Server error while fetching assets.' });
  }
});

// POST /api/assets/plant-seed — plant a seed for a cashback-earning payment
// that has no seed yet.
//
// SECURITY/AUDIT FIX: this route used to create an AssetSeed straight from
// client-supplied amountPaid/cashbackRate/cashback, with no link to any
// real Transaction and no upper bound on cashbackRate. A seed's accrued
// interest is real, spendable money once claimed (POST
// /api/assets/claim-interest credits it straight into `balance`), so that
// let any authenticated caller fabricate an arbitrarily large claimable
// balance out of nothing — e.g. { amountPaid: 1, cashbackRate: 1000000 } —
// with no corresponding payment, sender debit, or receiver credit behind
// it anywhere in the ledger. This is exactly the "unexplained money" this
// system's own AssetSeed invariant exists to rule out.
//
// OLD BEHAVIOUR: any finite amountPaid > 0 and any finite cashbackRate > 0
// (no ceiling) were trusted from the request body and written directly
// into a new AssetSeed.
// NEW BEHAVIOUR: the caller supplies only a transactionId. Every actual
// figure (amountPaid, cashbackRate, cashback, currency) is read back off
// that Transaction's own LedgerEntry rows — the same rows performTransfer
// already wrote when the cashback was genuinely credited — never from the
// request body. The route now only fills in a seed for a real payment
// that performTransfer's own inline planting (POST /api/transactions/send)
// didn't already cover (e.g. a seed row lost after the payment somehow),
// and the schema's unique partial index on transactionId makes a duplicate
// seed for the same payment impossible even under a concurrent retry.
//
// WHY THE OLD BEHAVIOUR WAS WRONG: it let the account making the request
// decide, unilaterally and without limit, how much bonus-earning value it
// held — violating ledger integrity invariant A (debits must equal
// credits somewhere) and the account-conservation invariant B, since
// nothing ever debited anything to fund it.
// WHICH INVARIANT THIS PROTECTS: AssetSeed cannot create unexplained
// money (audit section 8), and every seed now has a parent transaction
// reference (audit section 11's receipt-traceability principle, applied
// here to seeds).
app.post('/api/assets/plant-seed', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.body?.symbolId || '').trim();
    const transactionId = String(req.body?.transactionId || '').trim();

    if (!cleanSymbolId) {
      return res.status(400).json({ message: 'Secure ID is required.' });
    }
    if (!transactionId || !mongoose.isValidObjectId(transactionId)) {
      return res.status(400).json({ message: 'A valid transactionId is required — a seed can only be planted for a real payment.' });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) {
      return res.status(404).json({ message: 'Secure ID not found.' });
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'No transaction found for that id.' });
    }
    // Only the payer of that specific payment may plant a seed for it —
    // matches who performTransfer's own inline planting would have
    // credited the cashback to.
    if (String(transaction.fromUserId) !== String(user._id)) {
      return res.status(403).json({ message: 'That transaction was not sent by this account.' });
    }
    if (transaction.status !== 'success' || !['send', 'qr_payment'].includes(transaction.type)) {
      return res.status(400).json({ message: 'Only a completed payment can earn a seed.' });
    }

    const existingSeed = await AssetSeed.findOne({ transactionId: transaction._id });
    if (existingSeed) {
      return res.status(200).json({ seed: computeSeed(existingSeed), duplicate: true });
    }

    // The real, already-credited cashback figures — written by
    // performTransfer at payment time, never recomputed here.
    const [debitLine, cashbackLine] = await Promise.all([
      LedgerEntry.findOne({ transactionId: transaction._id, userId: user._id, entryType: 'debit' }).lean(),
      LedgerEntry.findOne({
        transactionId: transaction._id,
        userId: user._id,
        entryType: 'credit',
        note: 'Cashback credited to balance',
      }).lean(),
    ]);

    if (!debitLine || !cashbackLine) {
      return res.status(400).json({ message: 'That payment carried no cashback to plant a seed for.' });
    }

    const seed = await AssetSeed.create({
      userId: user._id,
      symbolId: user.symbolId,
      business: String(req.body?.business || req.body?.payeeName || 'Payment').trim().slice(0, 80),
      category: String(req.body?.category || 'General').trim().slice(0, 40),
      amountPaid: debitLine.amount,
      cashbackRate: Number(cashbackLine.metadata?.cashbackRate) || 0,
      cashback: cashbackLine.amount,
      currency: debitLine.currency || 'INR',
      transactionId: transaction._id,
    });

    return res.status(201).json({ seed: computeSeed(seed) });
  } catch (error) {
    // A duplicate-key error here means the unique partial index caught a
    // genuine race (two concurrent calls for the same transaction) —
    // report it the same way the pre-existing-seed check above would.
    if (error?.code === 11000) {
      const existingSeed = await AssetSeed.findOne({ transactionId: req.body?.transactionId }).catch(() => null);
      if (existingSeed) {
        return res.status(200).json({ seed: computeSeed(existingSeed), duplicate: true });
      }
    }
    console.error('Plant seed error:', error);
    return res.status(500).json({ message: 'Server error while planting seed.' });
  }
});

// POST /api/assets/claim-interest — pay the bonus interest a user's seeds
// have accrued into real, spendable balance. The cashback itself needs no
// claiming (it was credited at payment time); this only ever pays out the
// growth on top, and only however much is currently accrued.
//
// Each seed is updated with an optimistic-concurrency filter
// (interestClaimed must still match what was just read) so two concurrent
// claims can't both pay out the same growth — a seed that loses the race
// this round simply claims nothing and is picked up cleanly next time.
app.post('/api/assets/claim-interest', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.body?.symbolId || '').trim();
    if (!cleanSymbolId) {
      return res.status(400).json({ message: 'Secure ID is required.' });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) {
      return res.status(404).json({ message: 'Secure ID not found.' });
    }

    const rawSeeds = await AssetSeed.find({ userId: user._id });
    let totalClaimed = 0;
    const claimedSeedIds = [];

    for (const seed of rawSeeds) {
      const { interestAvailable } = computeSeed(seed);
      if (interestAvailable <= 0) continue;

      const priorClaimed = Number(seed.interestClaimed) || 0;
      const updated = await AssetSeed.findOneAndUpdate(
        { _id: seed._id, interestClaimed: priorClaimed },
        { $set: { interestClaimed: priorClaimed + interestAvailable, lastClaimedAt: new Date() } },
        { new: true }
      );

      // A null result means someone else claimed this exact seed in the
      // gap between the read above and this write — skip it this round
      // rather than paying out (or double-paying) a stale figure.
      if (!updated) continue;

      totalClaimed += interestAvailable;
      claimedSeedIds.push(String(seed._id));
    }

    if (totalClaimed <= 0) {
      return res.status(200).json({ claimed: 0, newBalance: Number(user.balance) || 0, seedIds: [] });
    }

    const roundedClaim = toMinorUnit(totalClaimed);
    const credited = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { balance: roundedClaim } },
      { returnDocument: 'after' }
    );

    return res.status(200).json({
      claimed: roundedClaim,
      newBalance: toMinorUnit(credited?.balance ?? user.balance),
      seedIds: claimedSeedIds,
    });
  } catch (error) {
    console.error('Claim interest error:', error);
    return res.status(500).json({ message: 'Server error while claiming interest.' });
  }
});

// GET /api/assets/paylater/:symbolId — PayLater limit is always the live
// total of the user's assets, and the activity list is built from records
// that actually exist: payments the account chose to put on PayLater
// (metadata.payMethod), and the cashback seeds that raised the limit. An
// account that has done neither gets an empty list, not a sample ledger.
app.get('/api/assets/paylater/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const cleanSymbolId = String(req.params.symbolId || '').trim();
    if (!cleanSymbolId) {
      return res.status(400).json({ message: 'Secure ID is required.' });
    }

    const user = await User.findOne({ symbolId: cleanSymbolId });
    if (!user) {
      return res.status(404).json({ message: 'Secure ID not found.' });
    }

    const rawSeeds = await AssetSeed.find({ userId: user._id }).sort({ plantedAt: -1 });
    const seeds = rawSeeds.map(computeSeed);
    const totalAssets = seeds.reduce((s, x) => s + x.currentValue, 0);

    // Charges: successful sends this account paid for with PayLater.
    // Repayments: the reverse leg, once a repayment flow exists to write it.
    const payLaterTxns = await Transaction.find({
      fromUserId: user._id,
      status: 'success',
      'metadata.payMethod': /paylater/i,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('toUserId', 'fullName symbolId')
      .lean();

    const charges = payLaterTxns.map((t) => {
      const repayment = Boolean(t.metadata && t.metadata.payLaterRepayment);
      const payee = t.toUserId?.fullName || t.toUserId?.symbolId || 'Gloobal user';
      return {
        id: String(t._id),
        type: repayment ? 'repayment' : 'charge',
        amount: t.amount,
        description: repayment ? 'Repayment' : `PayLater charge · ${payee}`,
        createdAt: t.createdAt,
      };
    });

    // Credits: cashback that became an asset, which is what a PayLater limit
    // is made of — so the list explains the number above it.
    const credits = seeds.map((s) => ({
      id: String(s._id),
      type: 'credit',
      amount: s.cashback,
      description: `Cashback credited · ${s.business}`,
      createdAt: s.plantedAt,
    }));

    const transactions = [...charges, ...credits]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 50);

    // Nothing repays a charge yet, so every charge is still outstanding.
    const pendingDues = charges
      .filter((c) => c.type === 'charge')
      .reduce((s, c) => s + (Number(c.amount) || 0), 0)
      - charges.filter((c) => c.type === 'repayment').reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const dues = Math.max(0, pendingDues);

    return res.status(200).json({
      limit: totalAssets,
      available: Math.max(0, totalAssets - dues),
      pendingDues: dues,
      transactions,
    });
  } catch (error) {
    console.error('PayLater fetch error:', error);
    return res.status(500).json({ message: 'Server error while fetching PayLater.' });
  }
});

app.post('/api/transactions/send', writeLimit, requireAuth, requireSelf('senderSymbolId', 'fromSymbolId'), async (req, res) => {
  try {
    const {
      senderSymbolId,
      fromSymbolId,
      symbolId,
      receiverSymbolId,
      toSymbolId,
      to,
      // --- the amount, and which side of the corridor it is denominated in ---
      //
      // A single `amount` whose currency depended on context was the source
      // of the worst class of bug this route has had, so the contract now
      // names both sides explicitly and says which one the person typed.
      //
      //   amountBasis: 'source'      sourceAmount is what the SENDER pays,
      //                              in the sender's own currency. This is
      //                              the ordinary Send Money case: someone
      //                              enters 5000 and means 5000 of their own
      //                              money.
      //   amountBasis: 'destination' destinationAmount is what the RECEIVER
      //                              is asking for, in the receiver's own
      //                              currency. This is the payment-request
      //                              case: a QR encodes a figure the payee
      //                              named, and the sender pays whatever that
      //                              converts to.
      //
      // The other side is always computed here, never accepted. Whichever
      // figure the client did not type is advisory only — it is compared
      // against the server's own arithmetic and a disagreement is refused,
      // so a client bug surfaces as a rejected payment rather than as a
      // wrong one.
      amountBasis,
      sourceAmount,
      destinationAmount,
      // Advisory. Both currencies are derived below from each account's own
      // countryIso and never trusted from the client — same rule
      // payeeCashbackRate already followed — but a mismatch is reported,
      // because a client that thinks the corridor is USD->INR while the
      // server resolves GBP->INR has a real bug worth failing on.
      sourceCurrency: claimedSourceCurrency,
      destinationCurrency: claimedDestinationCurrency,
      // Legacy. Before this contract existed, `amount` meant the receiver's
      // face value with no field saying so. It is still accepted, and still
      // means exactly that, so an older client build keeps working against a
      // newer server — but nothing new should send it.
      amount,
      note = '',
      pin,
      idempotencyKey,
      payMethod,
    } = req.body || {};

    const senderIdentifier = String(senderSymbolId || fromSymbolId || symbolId || '').trim();
    const receiverIdentifier = String(receiverSymbolId || toSymbolId || to || '').trim();
    const cleanPin = String(pin || '').trim();
    // Which side the person actually typed. Defaults to 'destination' ONLY
    // when the request carries the legacy `amount` and nothing else, so an
    // older client keeps its old meaning; anything using the new fields is
    // source-denominated unless it says otherwise.
    const rawBasis = String(amountBasis || '').trim().toLowerCase();
    const hasSourceAmount = sourceAmount !== undefined && sourceAmount !== null && sourceAmount !== '';
    const hasDestinationAmount =
      destinationAmount !== undefined && destinationAmount !== null && destinationAmount !== '';
    const basis =
      rawBasis === 'source' || rawBasis === 'destination'
        ? rawBasis
        : hasSourceAmount
          ? 'source'
          : 'destination';
    // The figure the person typed, whichever side it belongs to.
    const typedAmount = Number(
      basis === 'source'
        ? (hasSourceAmount ? sourceAmount : amount)
        : (hasDestinationAmount ? destinationAmount : amount)
    );
    const cleanNote = String(note || '').trim().slice(0, 140);
    const cleanIdempotencyKey = String(idempotencyKey || '').trim().slice(0, 120);
    // How it was paid ("Gloobal Bank", "Gloobal PayLater", ...). Recorded so
    // the PayLater screen can list its own charges instead of inventing them.
    const cleanPayMethod = String(payMethod || '').trim().slice(0, 40);
    // Denominated in the SENDER's own currency (see the check further down).
    // Raised from 5,000 because that ceiling, expressed in the recipient's
    // currency, made the usable limit swing wildly by corridor — about $53
    // for a US account paying into India — and was hit constantly in ordinary
    // testing. The environment variable still overrides it.
    const maxPrototypeAmount = Number(process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT || 5000000);

    if (!senderIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Sender Secure ID or mobile number is required.',
      });
    }

    if (!receiverIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Receiver Secure ID or mobile number is required.',
      });
    }

    if (normalizeText(senderIdentifier) === normalizeText(receiverIdentifier)) {
      return res.status(400).json({
        success: false,
        message: 'Self-transfer is not allowed.',
      });
    }

    if (!Number.isFinite(typedAmount) || typedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount greater than 0 is required.',
      });
    }

    // The prototype cap is enforced further down, once both currencies are
    // known. It is denominated in the SENDER's own currency — the money that
    // actually leaves their balance — and naming that currency in the message
    // means resolving the sender's country first. The check used to live here,
    // pre-PIN, and was expressed in the recipient's currency for exactly that
    // reason; that made the cap mean a different amount of the sender's money
    // in every corridor, which is the "why can't I send more than about $53"
    // report. Moving it below costs nothing in disclosure: the sender is
    // already authenticated by requireAuth/requireSelf, so their own currency
    // is not a secret being handed to a stranger.

    if (!cleanPin) {
      return res.status(400).json({
        success: false,
        message: 'PIN is required before sending transaction.',
      });
    }

    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be 4 to 6 digits.',
      });
    }

    const senderResolved = await resolveTransactionUserByIdentifier(senderIdentifier);
    const receiverResolved = await resolveTransactionUserByIdentifier(receiverIdentifier);

    const sender = senderResolved?.user;
    const receiver = receiverResolved?.user;

    if (!sender) {
      return res.status(404).json({
        success: false,
        message: 'Sender Secure ID or mobile number not found.',
      });
    }

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver Secure ID or mobile number not found.',
      });
    }

    if (String(sender._id) === String(receiver._id) || sender.symbolId === receiver.symbolId) {
      return res.status(400).json({
        success: false,
        message: 'Self-transfer is not allowed.',
      });
    }

    const pinRecord = await Pin.findOne({ userId: sender._id });

    if (!pinRecord) {
      return res.status(404).json({
        success: false,
        message: 'PIN is not set for this Secure ID.',
      });
    }

    if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
      recordAudit({
        userId: sender._id, action: 'transaction.send.blocked', status: 'blocked',
        message: 'PIN locked out', req, metadata: { symbolId: sender.symbolId },
      });
      return res.status(423).json({
        success: false,
        message: 'PIN is temporarily locked. Please try again later.',
      });
    }

    const isPinMatch = await bcrypt.compare(cleanPin, pinRecord.pinHash);

    if (!isPinMatch) {
      pinRecord.failedAttempts = (pinRecord.failedAttempts || 0) + 1;

      if (pinRecord.failedAttempts >= 5) {
        pinRecord.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      }

      await pinRecord.save();

      recordAudit({
        userId: sender._id, action: 'transaction.send.pin_invalid', status: 'failed',
        message: `Invalid PIN (attempt ${pinRecord.failedAttempts}/5)`, req,
        metadata: { symbolId: sender.symbolId, lockedOut: !!pinRecord.lockedUntil },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid PIN.',
      });
    }

    pinRecord.failedAttempts = 0;
    pinRecord.lockedUntil = null;
    pinRecord.lastVerifiedAt = new Date();
    await pinRecord.save();

    // Checked after the PIN, not before it: the answer reveals roughly what
    // the account holds, which is not something to hand out to whoever can
    // guess a Gloobal ID.
    await materialiseBalance(sender);
    await materialiseBalance(receiver);

    // Real per-currency conversion. Each account's own local currency is
    // looked up from its own countryIso (never trusted from the client,
    // same reasoning as payeeCashbackRate below) — sender.countryIso used
    // to always be 'IN' because registration never saved what the person
    // actually picked; now that it does (see POST /api/register-symbol),
    // a genuinely cross-border pair resolves to two different currencies
    // here. The typed `amount` is always the RECEIVER's local-currency face
    // value — the same currency the amount box's flag shows on the sending
    // screen (SendMoneyScreen.jsx's bottom.currency) — so it is exactly
    // what the payee's own cashback share and balance credit are computed
    // in below. fxRate converts 1 unit of that into the sender's own
    // currency, which is what the sender's debit and cashback-credit legs
    // actually move. A same-currency pair (still the overwhelming majority
    // of accounts today) resolves fxRate to exactly 1, so nothing below
    // changes behaviour for them at all.
    //
    // Both sides go through accountCountryIso for the same reason the resolve
    // route does: an account written before registration sent a country holds
    // the bare 'IN' default whatever its owner's number says, and reading the
    // field raw here would settle a US payee in INR while the payer's screen —
    // which asks the resolve route — correctly showed USD. The two must agree,
    // so they read the country the same way.
    // Resolved through lib/countryCurrency.js rather than read straight off
    // Country, and with no fallback currency.
    //
    // This used to be `senderCountry?.localCurrency || 'INR'`. On the live
    // database, Country and Currency both held ZERO documents — the seed
    // script had never been run there — so every lookup missed, every account
    // resolved to INR, both sides always matched, fxRate was always 1, and
    // settlement never fired. A British account paying an American one moved
    // money as a domestic rupee transfer. The fallback made an unseeded
    // reference table indistinguishable from a country that really does use
    // INR, so nothing ever surfaced.
    //
    // The resolver prefers the seeded row and falls back to
    // data/countryCurrencyMap.js — the file the seed script itself copies
    // from, which ships with the server and covers all 194 supported
    // countries. So this no longer depends on the collection having been
    // populated, and it never invents a currency.
    const [senderCountry, receiverCountry] = await Promise.all([
      resolveCountry(accountCountryIso(sender)),
      resolveCountry(accountCountryIso(receiver)),
    ]);

    // Genuinely unsupported ISO — not a missing seed row, which the resolver
    // already handles. Refused rather than defaulted: every figure below
    // (the debit, the FX rate, the split, the settlement) is denominated in
    // these currencies, so guessing one moves the wrong amount of real
    // balance. Same "fail closed, never invent a number" rule lib/fxRates.js
    // applies to a missing rate.
    if (!senderCountry || !receiverCountry) {
      const unknown = !senderCountry ? accountCountryIso(sender) : accountCountryIso(receiver);
      return res.status(400).json({
        success: false,
        message: `Payments are not supported for country ${unknown} yet.`,
      });
    }

    const senderCurrency = senderCountry.localCurrency;
    const destinationCurrency = receiverCountry.localCurrency;

    let fxRate = 1;
    let fxRateSource = 'identity';

    if (senderCurrency !== destinationCurrency) {
      try {
        ({ rate: fxRate, source: fxRateSource } = await getRate(destinationCurrency, senderCurrency));
      } catch (fxError) {
        // Same "fail closed, never invent a number" rule lib/fxRates.js
        // documents for itself — a guessed 1:1 rate here would silently
        // move the wrong amount of real balance, which is a materially
        // worse outcome than the payment not going through this once.
        console.error(`FX rate lookup failed for ${destinationCurrency}->${senderCurrency}:`, fxError);
        return res.status(502).json({
          success: false,
          message: 'Exchange rate is temporarily unavailable. Please try again in a moment.',
        });
      }
    }

    // --- both sides of the corridor, from whichever one was typed ---
    //
    // fxRate above converts 1 unit of the DESTINATION currency into the
    // sender's, which is the direction the settlement engine and the
    // cashback split are built around. Going the other way is its inverse;
    // one lookup, one rate, one `fxRateSource` on the record, and no chance
    // of the two directions disagreeing because they came from separate
    // fetches taken moments apart.
    //
    // Each side is rounded to its OWN currency's precision, so a zero-decimal
    // destination never receives a fractional unit it cannot hold.
    const sourceFaceAmount =
      basis === 'source'
        ? toMinorUnit(typedAmount, senderCurrency)
        : toMinorUnit(toMinorUnit(typedAmount, destinationCurrency) * fxRate, senderCurrency);
    const numericAmount =
      basis === 'source'
        ? toMinorUnit(sourceFaceAmount / fxRate, destinationCurrency)
        : toMinorUnit(typedAmount, destinationCurrency);

    if (!Number.isFinite(sourceFaceAmount) || sourceFaceAmount <= 0 || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      // Reachable when a tiny source amount converts to less than one minor
      // unit of the destination currency — 1 IDR into KWD, say. Refused
      // rather than rounded up to something the sender did not agree to, or
      // down to a zero-value payment that still debits them.
      return res.status(400).json({
        success: false,
        message: "That amount is too small to convert into the recipient's currency.",
      });
    }

    // The client's own view of the corridor, checked but never trusted. A
    // disagreement means the screen the person just confirmed was showing a
    // different pair of currencies than the one about to move their money,
    // and that must not be settled quietly.
    const claimedSource = String(claimedSourceCurrency || '').trim().toUpperCase();
    const claimedDestination = String(claimedDestinationCurrency || '').trim().toUpperCase();
    if (
      (claimedSource && claimedSource !== senderCurrency) ||
      (claimedDestination && claimedDestination !== destinationCurrency)
    ) {
      return res.status(409).json({
        success: false,
        message: 'The currencies on your screen no longer match this account. Please retry the payment.',
        senderCurrency,
        destinationCurrency,
      });
    }

    // The prototype cap, in the SENDER's own currency and named as such.
    // Applied to the gross source amount — the money leaving this account —
    // not to the converted destination figure, so the ceiling means the same
    // thing in every corridor.
    if (
      Number.isFinite(maxPrototypeAmount) &&
      maxPrototypeAmount > 0 &&
      sourceFaceAmount > maxPrototypeAmount
    ) {
      return res.status(400).json({
        success: false,
        message: `Prototype transaction limit is ${maxPrototypeAmount} ${senderCurrency}.`,
        limit: maxPrototypeAmount,
        limitCurrency: senderCurrency,
        limitBasis: 'sender-currency',
      });
    }

    // The payee's own cashback rate splits the payment, entirely in the
    // receiver's own currency — the payee is credited the amount minus
    // their chosen share, and that share is credited straight back to the
    // sender as real, immediately spendable balance (see performTransfer
    // below) — not an off-ledger figure that only shows up on some other
    // screen. So a 1% Creator paid 1,000 (their own currency) receives 990
    // and the payer is net-debited the converted equivalent of 990 too:
    // 1,000 (destination currency) out, 10 (destination currency, converted
    // into the sender's own currency) back. A seed is also planted purely
    // to track a bonus interest rate on that 10 for as long as it goes
    // unclaimed (see computeSeed / POST /api/assets/claim-interest).
    const payeeCashbackRate = Number(receiver.cashbackRate) || 0;
    // Rounded to each leg's own currency precision (audit fix — see
    // toMinorUnit's header comment): cashback/payeeReceives are the
    // receiver-currency face split, debitAmount/cashbackCredit are the
    // sender-currency converted split. A same-currency pair still rounds
    // to the same precision on both sides, so this changes nothing for
    // the common case; it only matters once senderCurrency and
    // destinationCurrency actually differ in decimal places.
    const cashback = toMinorUnit(numericAmount * payeeCashbackRate, destinationCurrency);
    const payeeReceives = toMinorUnit(numericAmount - cashback, destinationCurrency);
    // What actually leaves the sender's own balance, and what actually
    // lands back in it — both converted into the sender's own currency.
    // Equal to numericAmount/cashback whenever fxRate is 1.
    // Exactly the figure resolved above — for a source-denominated payment
    // this IS the number the person typed, to the unit. Recomputing it from
    // the destination amount would re-round a rounded value and could put the
    // debit a minor unit away from the quote they confirmed.
    const debitAmount = sourceFaceAmount;
    const cashbackCredit = toMinorUnit(cashback * fxRate, senderCurrency);

    // A courtesy check, not the authority. It fails fast with a useful figure
    // for the ordinary case of somebody trying to spend more than they have.
    // The check that actually protects the balance is the conditional debit
    // further down — this one reads a value that another request can change
    // before the write lands, which is exactly the race it used to be the only
    // guard against. Compared against debitAmount, not the typed amount —
    // that's what's actually about to leave the sender's own currency balance.
    const senderBalanceBefore = accountBalanceOf(sender);

    if (senderBalanceBefore < debitAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance.',
        balance: senderBalanceBefore,
        currency: senderCurrency,
      });
    }

    if (cleanIdempotencyKey) {
      const existingIdempotentTransaction = await Transaction.findOne({
        fromUserId: sender._id,
        'metadata.idempotencyKey': cleanIdempotencyKey,
      }).sort({ createdAt: -1 });

      if (existingIdempotentTransaction) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Duplicate request ignored. Existing transaction returned.',
          transaction: cleanTransactionPayload(existingIdempotentTransaction, sender, receiver),
        });
      }
    }

    const duplicateWindowStartedAt = new Date(Date.now() - 15 * 1000);

    const recentDuplicate = await Transaction.findOne({
      fromUserId: sender._id,
      toUserId: receiver._id,
      amount: numericAmount,
      currency: destinationCurrency,
      note: cleanNote,
      status: { $in: ['pending', 'success'] },
      createdAt: { $gte: duplicateWindowStartedAt },
    }).sort({ createdAt: -1 });

    if (recentDuplicate) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: 'Duplicate transaction blocked. Please wait before sending the same amount again.',
        transaction: cleanTransactionPayload(recentDuplicate, sender, receiver),
      });
    }

    const transactionReference = await resolveTransactionReference(
      req.body?.referenceId ?? req.body?.transactionId
    );

    const transactionFields = {
      fromUserId: sender._id,
      toUserId: receiver._id,
      amount: numericAmount,
      // The face-value currency this payment was denominated in — the
      // receiver's own currency, not whatever (unauthoritative) `currency`
      // the client sent. cleanCurrency is no longer used for anything
      // money-shaped; it only ever fed this field.
      currency: destinationCurrency,
      type: 'send',
      note: cleanNote,
      referenceId: transactionReference,
      metadata: {
        prototype: true,
        idempotencyKey: cleanIdempotencyKey || null,
        senderMatchedBy: senderResolved.matchedBy,
        receiverMatchedBy: receiverResolved.matchedBy,
        senderInput: senderIdentifier,
        receiverInput: receiverIdentifier,
        maxPrototypeAmount,
        payMethod: cleanPayMethod || null,
        // The sender's own side of this payment, in their own currency —
        // what POST /api/pin/... and the receipt screen need to show "you
        // paid X" correctly for a cross-border send, since `amount`/
        // `currency` above are the receiver's side.
        senderCurrency,
        debitAmount,
        fxRate,
        fxRateSource,
        // The corridor as this payment was actually agreed, both sides named.
        // `amount`/`currency` on the row itself remain the receiver's face
        // value, which is what the payee's statement is denominated in.
        sourceAmount: sourceFaceAmount,
        sourceCurrency: senderCurrency,
        destinationAmount: numericAmount,
        destinationCurrency,
        amountBasis: basis,
      },
    };

    // Everything that moves money, in one place.
    //
    // The debit is a single conditional $inc — the balance is matched and
    // decremented in one indivisible document operation, so two payments racing
    // out of the same account cannot both pass. Previously each request read
    // the balance, compared it in Node, and wrote the whole document back:
    // two concurrent sends of 800 against 1000 both saw 1000, both passed, and
    // both wrote 200 — 1600 leaving a 1000 account, last write winning.
    //
    // No figure here is computed from a value read earlier. Both new balances
    // come back from the updates that produced them, so the ledger records what
    // the database actually did rather than what this request predicted.
    const performTransfer = async (session) => {
      const sessionOpt = session ? { session } : {};

      const debitedSender = await User.findOneAndUpdate(
        { _id: sender._id, balance: { $gte: debitAmount } },
        { $inc: { balance: -debitAmount } },
        { returnDocument: 'after', ...sessionOpt }
      );

      // No match means the balance moved under us between the courtesy check
      // and here. Nothing was written — $inc either matched and applied or did
      // neither — so there is nothing to undo.
      if (!debitedSender) {
        const current = await User.findById(sender._id).select('balance').lean();
        throw new InsufficientBalanceError(accountBalanceOf(current || {}));
      }

      let senderBalanceAfter = toMinorUnit(debitedSender.balance, senderCurrency);
      const senderBalanceAtDebit = toMinorUnit(senderBalanceAfter + debitAmount, senderCurrency);

      let creditedReceiver = null;
      // Tracks how much of `cashback` actually made it back to the sender's
      // balance, so the no-transaction revert path below undoes exactly what
      // happened — not a fixed guess that would over- or under-revert
      // depending on which step failed.
      let cashbackAppliedToSender = 0;
      // Tracks whether the destination pool's release actually landed, for
      // the same reason — the no-transaction revert path below only puts
      // the pool back if this step is the one that moved it.
      let poolSettlementApplied = false;
      let settlement = null;
      // Set once the Transaction row exists, so the no-transaction revert
      // path can mark it 'reversed' rather than leave a 'success' row
      // behind for a payment that didn't actually finish moving money.
      let createdTransactionId = null;

      try {
        // Created before the receiver is credited (not after, as this used
        // to be written): the settlement gate right below needs a real
        // transaction._id to attach its audit row to, and — more
        // importantly — this is inside the same Mongo transaction as
        // everything else here, so creating it first changes nothing about
        // atomicity. Either everything in this block commits together, or
        // none of it does.
        const [transaction] = await Transaction.create(
          [{ ...transactionFields, status: 'success' }],
          session ? { session } : {}
        );
        createdTransactionId = transaction._id;

        // The hard-liquidity gate: a genuinely cross-border payment can
        // only proceed if the receiver's own-country pool actually has the
        // real, available local-currency liquidity to release — the same
        // constraint a correspondent bank has for a corridor it doesn't
        // hold funds in. This throws InsufficientPoolLiquidityError (never
        // silently succeeds with a partial or invented amount) if it
        // can't, which aborts this whole transaction — the sender's debit
        // and the Transaction row just created both roll back with it, so
        // a refused corridor leaves no partial trace behind.
        //
        // Four figures, not two: each pool's own gross movement and its own
        // cashback reversal are separate ledger lines (see
        // settlementEngine.js's own header comment for why) — the gate
        // below checks the destination pool against the full face amount
        // (destinationReleaseAmount), not the net-of-cashback figure, which
        // is the stricter, more realistic liquidity check.
        if (senderCurrency !== destinationCurrency) {
          settlement = await settleCrossBorderPayment({
            session,
            transaction,
            sender,
            receiver,
            senderCurrency,
            destinationCurrency,
            destinationReleaseAmount: numericAmount,
            destinationCashbackReturn: cashback,
            sourceCreditAmount: debitAmount,
            sourceCashbackRelease: cashbackCredit,
            rate: fxRate,
            rateSource: fxRateSource,
          });
          poolSettlementApplied = true;
        }

        creditedReceiver = await User.findOneAndUpdate(
          { _id: receiver._id },
          { $inc: { balance: payeeReceives } },
          { returnDocument: 'after', ...sessionOpt }
        );

        if (!creditedReceiver) throw new Error('Receiver account disappeared mid-transfer.');

        const receiverBalanceAfter = toMinorUnit(creditedReceiver.balance, destinationCurrency);
        const receiverBalanceAtCredit = toMinorUnit(receiverBalanceAfter - payeeReceives, destinationCurrency);

        // The payee's cashback share comes straight back to the sender as
        // real, immediately spendable balance — not an off-ledger figure
        // shown on some other screen. Within a single currency (fxRate 1)
        // this is the same money just routed back rather than paid to the
        // payee: the payee already received amount - cashback above, so
        // crediting the sender `cashbackCredit` here is what makes debit
        // (debitAmount) and the two credits (payeeReceives + cashbackCredit)
        // balance to debitAmount exactly. Across a currency pair the two
        // sides are no longer the same number in the same unit — that's the
        // whole point — but each leg is still internally exact: the sender
        // only ever gains or loses their own currency, the receiver only
        // ever gains or loses theirs.
        let senderBalanceAtCashbackCredit = senderBalanceAfter;

        if (cashbackCredit > 0) {
          const creditedSender = await User.findOneAndUpdate(
            { _id: sender._id },
            { $inc: { balance: cashbackCredit } },
            { returnDocument: 'after', ...sessionOpt }
          );

          if (!creditedSender) throw new Error('Sender account disappeared mid-transfer.');

          senderBalanceAtCashbackCredit = toMinorUnit(senderBalanceAfter, senderCurrency);
          senderBalanceAfter = toMinorUnit(creditedSender.balance, senderCurrency);
          cashbackAppliedToSender = cashbackCredit;
        }

        const ledgerRows = [
          {
            // The sender's own leg, in the sender's own currency — this is
            // what actually left their balance, not the receiver-currency
            // face value shown on the receipt.
            transactionId: transaction._id,
            userId: sender._id,
            entryType: 'debit',
            amount: debitAmount,
            balanceBefore: senderBalanceAtDebit,
            balanceAfter: senderBalanceAtCashbackCredit,
            currency: senderCurrency,
            note: 'Prototype debit entry',
            metadata: {
              prototype: true,
              transactionReferenceId: transaction.referenceId,
              cashback: cashbackCredit,
              cashbackRate: payeeCashbackRate,
              fxRate,
              faceAmount: numericAmount,
              faceCurrency: destinationCurrency,
            },
          },
          {
            // The credit is the amount minus the payee's own cashback share —
            // the difference (cashback) is credited straight back to the
            // sender below, as its own ledger line, rather than vanishing.
            // Stays in the receiver's own currency — this is their leg.
            transactionId: transaction._id,
            userId: receiver._id,
            entryType: 'credit',
            amount: payeeReceives,
            balanceBefore: receiverBalanceAtCredit,
            balanceAfter: receiverBalanceAfter,
            currency: destinationCurrency,
            note: 'Prototype credit entry',
            metadata: {
              prototype: true,
              transactionReferenceId: transaction.referenceId,
              cashback,
              cashbackRate: payeeCashbackRate,
            },
          },
        ];

        if (cashbackCredit > 0) {
          // The sender's own cashback-credit leg: real money landing back in
          // their balance in the same breath as the payment, not a separate
          // asset that only exists on the My Assets screen. In the sender's
          // own currency — cashbackCredit, not the receiver-currency
          // cashback figure the payee's share was actually computed in.
          ledgerRows.push({
            transactionId: transaction._id,
            userId: sender._id,
            entryType: 'credit',
            amount: cashbackCredit,
            balanceBefore: senderBalanceAtCashbackCredit,
            balanceAfter: senderBalanceAfter,
            currency: senderCurrency,
            note: 'Cashback credited to balance',
            metadata: {
              prototype: true,
              transactionReferenceId: transaction.referenceId,
              cashback: cashbackCredit,
              cashbackRate: payeeCashbackRate,
              fxRate,
              faceCashback: cashback,
              faceCurrency: destinationCurrency,
            },
          });
        }

        await LedgerEntry.create(ledgerRows, session ? { session, ordered: true } : {});

        return { transaction, senderBalanceAfter, receiverBalanceAfter, settlement };
      } catch (moveError) {
        // Inside a transaction the abort undoes all of the above, so
        // compensating by hand would double-refund. This branch is only for a
        // deployment without transactions, where the debit really is committed
        // and really does need putting back.
        if (!session) {
          try {
            await User.updateOne(
              { _id: sender._id },
              { $inc: { balance: debitAmount - cashbackAppliedToSender } }
            );
            if (creditedReceiver) {
              await User.updateOne({ _id: receiver._id }, { $inc: { balance: -payeeReceives } });
            }
            if (poolSettlementApplied && settlement) {
              // Reads its own four ledger-line amounts back off the
              // settlement row — nothing to pass or keep in sync here.
              await revertCrossBorderSettlement(settlement);
            }
            if (createdTransactionId) {
              await Transaction.updateOne(
                { _id: createdTransactionId },
                { $set: { status: 'reversed' } }
              );
            }
          } catch (revertError) {
            // Nothing further can be done in-process; this is the one case
            // that needs to be findable in the logs after the fact.
            console.error('CRITICAL: transfer could not be reverted for', sender.symbolId, revertError);
          }
        }

        throw moveError;
      }
    };

    let transferred;

    try {
      ({ value: transferred } = await withMongoTransaction(performTransfer));
    } catch (transferError) {
      if (transferError instanceof InsufficientBalanceError) {
        recordAudit({
          userId: sender._id, action: 'transaction.send.failed', status: 'failed',
          message: 'Insufficient balance at debit time', req,
          metadata: { symbolId: sender.symbolId, receiverSymbolId: receiver.symbolId, debitAmount, balance: transferError.balance },
        });
        return res.status(400).json({
          success: false,
          message: transferError.message,
          balance: transferError.balance,
        });
      }
      // The corridor's own pool couldn't cover the release — a real,
      // hard-liquidity refusal, not a sender-balance problem. Nothing moved:
      // the transaction (or the non-transactional revert path) already
      // undid the sender's debit.
      // A corridor that was never opened, as opposed to one that ran dry.
      // Checked first because UnseededCorridorPoolError is the more specific
      // diagnosis and carries the only action that actually fixes it.
      if (transferError instanceof UnseededCorridorPoolError) {
        recordAudit({
          userId: sender._id, action: 'transaction.send.failed', status: 'failed',
          message: `Unseeded corridor pool (${transferError.countryIso}/${transferError.currency})`, req,
          metadata: {
            symbolId: sender.symbolId, receiverSymbolId: receiver.symbolId,
            countryIso: transferError.countryIso, currency: transferError.currency,
            counterCurrency: transferError.counterCurrency, requested: transferError.requested,
          },
        });
        return res.status(503).json({
          success: false,
          message: `The ${transferError.counterCurrency} to ${transferError.currency} corridor is not open yet, so this payment cannot be settled. Nothing has left your balance. Please contact support — retrying will not help.`,
          corridor: { countryIso: transferError.countryIso, currency: transferError.currency, counterCurrency: transferError.counterCurrency },
        });
      }
      // An account whose currency could not be resolved is a configuration
      // or reference-data fault, never a payer's problem, and never
      // something to express as a liquidity shortage — that is what put
      // "US / undefined" in front of a payer in the first place.
      if (transferError instanceof UnresolvedCurrencyError) {
        recordAudit({
          userId: sender._id, action: 'transaction.send.failed', status: 'failed',
          message: `Unresolved currency (${transferError.side} ${transferError.countryIso})`, req,
          metadata: {
            symbolId: sender.symbolId, receiverSymbolId: receiver.symbolId,
            side: transferError.side, countryIso: transferError.countryIso,
          },
        });
        return res.status(500).json({
          success: false,
          message: `This payment could not be set up because the ${transferError.side} account's country (${transferError.countryIso || 'unknown'}) has no currency configured. Nothing has left your balance. Please contact support.`,
        });
      }
      // The message used to interpolate `transferError.counterCurrency`, a
      // property InsufficientPoolLiquidityError has never carried — it
      // records the released currency as `currency`. The result was the
      // literal string "undefined" on the payer's screen next to a real
      // country code ("US/undefined"), which read as a broken currency
      // lookup and sent a whole investigation after one that was working.
      if (transferError instanceof InsufficientPoolLiquidityError) {
        recordAudit({
          userId: sender._id, action: 'transaction.send.failed', status: 'failed',
          message: `Insufficient pool liquidity (${transferError.countryIso}/${transferError.currency})`, req,
          metadata: {
            symbolId: sender.symbolId, receiverSymbolId: receiver.symbolId,
            countryIso: transferError.countryIso, currency: transferError.currency,
            requested: transferError.requested, available: transferError.available,
          },
        });
        return res.status(503).json({
          success: false,
          message: `This payment corridor (${transferError.countryIso}/${transferError.currency}) doesn't have enough settlement liquidity right now. Please try again later.`,
        });
      }

      // Audit fix: the losing side of the idempotencyKey race the unique
      // index on Transaction (fromUserId + metadata.idempotencyKey) exists
      // to close — see that index's own comment. Both concurrent requests
      // passed the earlier findOne pre-check (nothing existed yet for
      // either of them to find); one of them's Transaction.create then hit
      // the index and aborted. That is not a failure to report to the
      // client — it is exactly the duplicate-request case the pre-check
      // already handles, just caught one step later. The winner's row is
      // looked up and returned the same way the pre-check would have.
      const isIdempotencyKeyCollision =
        cleanIdempotencyKey &&
        (transferError?.code === 11000 || transferError?.writeErrors?.[0]?.code === 11000) &&
        /idempotencyKey/.test(String(transferError?.message || transferError?.writeErrors?.[0]?.errmsg || ''));

      if (isIdempotencyKeyCollision) {
        const winningTransaction = await Transaction.findOne({
          fromUserId: sender._id,
          'metadata.idempotencyKey': cleanIdempotencyKey,
        }).sort({ createdAt: -1 });

        if (winningTransaction) {
          return res.status(200).json({
            success: true,
            duplicate: true,
            message: 'Duplicate request ignored. Existing transaction returned.',
            transaction: cleanTransactionPayload(winningTransaction, sender, receiver),
          });
        }
        // Extremely unlikely (the winner's own transaction should already be
        // committed by the time its index write conflict reaches us here),
        // but if the winning row genuinely can't be found, fall through and
        // surface the original error rather than fabricate a response.
      }

      throw transferError;
    }

    // Past this point the money has moved, the record of it exists, and — for
    // a cross-border payment — the corridor's own pools already settled (see
    // performTransfer's own settleCrossBorderPayment call; that isn't
    // best-effort any more, it's the hard liquidity gate the transfer itself
    // depends on). Nothing below can fail the payment — only the asset seed
    // and the merchant-share receipts are still outstanding, and those stay
    // best-effort by design.
    const completedTransaction = transferred.transaction;
    const senderBalanceAfter = transferred.senderBalanceAfter;
    const settlement = transferred.settlement;

    recordAudit({
      userId: sender._id, action: 'transaction.send.success', status: 'success',
      message: `Sent ${numericAmount} ${senderCurrency !== destinationCurrency ? `(${senderCurrency}->${destinationCurrency})` : destinationCurrency}`,
      req,
      metadata: {
        transactionId: completedTransaction._id, referenceId: completedTransaction.referenceId,
        symbolId: sender.symbolId, receiverSymbolId: receiver.symbolId,
        amount: numericAmount, senderCurrency, destinationCurrency,
        crossBorder: senderCurrency !== destinationCurrency, settlementId: settlement?.settlementId || null,
      },
    });

    // Plant a My Assets seed for cashback-earning payments. The rate is the
    // *payee's* own choice (User.cashbackRate, set via
    // PATCH /api/creator/cashback-rate) — never a figure the paying client
    // supplies, and never a hardcoded one. A plain person-to-person send is
    // simply a payee who never set a rate, so it stays at 0 and plants
    // nothing. Best-effort — a seed failure must never fail an
    // already-successful transaction.
    let plantedSeed = null;

    if (Number.isFinite(payeeCashbackRate) && payeeCashbackRate > 0) {
      try {
        plantedSeed = await AssetSeed.create({
          userId: sender._id,
          symbolId: sender.symbolId,
          business: String(req.body?.business || req.body?.payeeName || receiver.fullName || cleanNote || 'Payment').trim().slice(0, 80),
          category: String(req.body?.category || 'General').trim().slice(0, 40),
          // This seed belongs to the sender and its whole purpose is
          // tracking bonus interest on real balance already sitting in
          // their account (see computeSeed) — so it has to be denominated
          // in the sender's own currency, the same one cashbackCredit was
          // actually credited in, not the receiver-currency face values.
          amountPaid: debitAmount,
          cashbackRate: payeeCashbackRate,
          cashback: cashbackCredit,
          currency: senderCurrency,
          // Audit fix: links this seed back to the payment that earned it
          // (see AssetSeed.js's transactionId comment and the schema's
          // unique partial index — this also guarantees performTransfer
          // itself can never double-plant for the same completedTransaction).
          transactionId: completedTransaction._id,
        });
      } catch (seedError) {
        console.error('Seed planting error (non-fatal):', seedError);
      }
    }

    // The diagrams' "1 vs 2 transaction IDs, 1 vs 4 receipts" structure —
    // best-effort, same reasoning as settlement and seed-planting above.
    // Run after seed planting (not before) specifically so a merchant-share
    // payment's share Transaction can carry plantedSeed's id in its
    // metadata, linking the receipt trail back to the seed it documents.
    let shareTransaction = null;
    let receipts = [];

    try {
      ({ shareTransaction, receipts } = await mintShareLegAndReceipts({
        paymentTransaction: completedTransaction,
        sender,
        receiver,
        amount: numericAmount,
        currency: destinationCurrency,
        // The share leg documents value moving back toward the payer, so
        // it has to carry what the payer actually received — cashbackCredit
        // in their own currency — not the receiver-currency cashback figure
        // the payment leg above is quoted in.
        cashback: cashbackCredit,
        cashbackCurrency: senderCurrency,
        assetSeedId: plantedSeed?._id || null,
      }));
    } catch (receiptError) {
      // mintShareLegAndReceipts already catches and logs internally; this
      // is only a backstop against a bug in that catch itself.
      console.error('Receipt/share-leg step raised unexpectedly (non-fatal):', receiptError);
    }

    return res.status(201).json({
      success: true,
      message: 'Prototype transaction completed successfully.',
      transaction: cleanTransactionPayload(completedTransaction, sender, receiver),
      newBalance: senderBalanceAfter,
      // In the sender's own currency — this is what actually landed back in
      // their balance (see cashbackCredit above), matching the currency
      // their own dashboard/toast already displays amounts in. `payeeReceives`
      // below stays in the receiver's own currency, same as always.
      cashback: cashbackCredit,
      cashbackCurrency: senderCurrency,
      cashbackRate: payeeCashbackRate,
      payeeReceives,
      // What actually left the sender's balance, in their own currency —
      // for a same-currency payment this equals the typed amount exactly.
      debitAmount,
      senderCurrency,
      destinationCurrency,
      fxRate,
      // The explicit contract, so no caller has to infer which currency a
      // bare `amount` is in. sourceAmount is what the sender paid;
      // destinationAmount is what the receiver was credited before their own
      // Creator Share split (payeeReceives above is that split's result).
      sourceAmount: sourceFaceAmount,
      sourceCurrency: senderCurrency,
      destinationAmount: numericAmount,
      amountBasis: basis,
      fxRateSource,
      assetSeed: plantedSeed ? computeSeed(plantedSeed) : null,
      settlement: settlement
        ? {
            settlementId: settlement.settlementId,
            sourceCountryIso: settlement.sourceCountryIso,
            sourceCurrency: settlement.sourceCurrency,
            // The two source-side ledger lines — the sender's full credit
            // in, and the cashback release back out — not just their net.
            //
            // `sourceAmount` IS the full credit in. This projection used to
            // also carry `sourceCreditAmount` and `destinationReleaseAmount`
            // as separate keys, which were aliases of the two gross figures
            // under the names server.js passes them in by. Neither exists on
            // the Settlement schema, so both serialized as undefined. Removed
            // rather than added to the schema: a second name for a figure
            // already on the row is exactly the duplicate-amount-field trap,
            // and nothing ever read them — settlement was always null in
            // production, so this object has never actually been sent.
            sourceAmount: settlement.sourceAmount,
            sourceCashbackRelease: settlement.sourceCashbackRelease,
            destinationCountryIso: settlement.destinationCountryIso,
            destinationCurrency: settlement.destinationCurrency,
            // The two destination-side ledger lines — the full release, and
            // the cashback return.
            destinationAmount: settlement.destinationAmount,
            destinationCashbackReturn: settlement.destinationCashbackReturn,
            rate: settlement.rate,
            rateSource: settlement.rateSource,
            // Carried so a caller can tell a settled corridor from one that
            // was written and later reverted, without a second round trip.
            status: settlement.status,
          }
        : null,
      shareTransaction: shareTransaction
        ? {
            referenceId: shareTransaction.referenceId,
            amount: shareTransaction.amount,
            currency: shareTransaction.currency,
          }
        : null,
      receipts: receipts.map((r) => ({
        receiptId: r.receiptId,
        leg: r.leg,
        role: r.role,
        amount: r.amount,
        currency: r.currency,
      })),
    });
  } catch (error) {
    // No pending row to reconcile any more. A Transaction is now written as
    // part of the same atomic step that moves the balances, so a failure
    // leaves no record at all rather than a 'pending' one stranded over money
    // that had already moved — which is what the block that used to sit here
    // was trying, and failing, to clean up after.
    console.error('Send transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not send prototype transaction right now.',
    });
  }
});

app.get('/api/transactions/history/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const symbolId = String(req.params.symbolId || '').trim();

    if (!symbolId) {
      return res.status(400).json({
        success: false,
        message: 'Secure ID is required.',
      });
    }

    const user = await User.findOne({ symbolId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Secure ID not found.',
      });
    }

    const transactions = await Transaction.find({
      $or: [{ fromUserId: user._id }, { toUserId: user._id }],
      // 'share' legs (lib/merchantShareFlow.js) move no real balance and
      // exist purely as a receipt-trail record of a diversion already
      // reflected in the payer's AssetSeed. Every reader of this endpoint
      // today — GloobalCoverageScreen's spend/transaction-count figures
      // among them — was built assuming every row here is a real send/
      // receive, so a 'share' row would double-count as extra spend and
      // show up as a confusing second "sent" entry for the same purchase.
      // Excluded here, not deleted: the rows still exist for whatever
      // reads Receipt/Transaction directly (e.g. a future Creator Share
      // history view), this endpoint just isn't that view.
      type: { $ne: 'share' },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('fromUserId', 'fullName symbolId')
      .populate('toUserId', 'fullName symbolId')
      .lean();

    const history = transactions.map((transaction) => {
      const senderId = String(transaction.fromUserId?._id || transaction.fromUserId || '');
      const isSender = senderId === String(user._id);
      const counterparty = isSender ? transaction.toUserId : transaction.fromUserId;

      return {
        id: transaction._id,
        referenceId: transaction.referenceId,
        direction: isSender ? 'sent' : 'received',
        // The RECEIVER's side: the face value this payment was denominated
        // in, and the currency it is in. Right for the receiver, and wrong
        // for the sender on any cross-border payment.
        amount: transaction.amount,
        currency: transaction.currency,
        // The SENDER's side, in their own currency.
        //
        // The send route has always stored these in metadata precisely
        // because `amount`/`currency` above are the receiver's — but this
        // projection never passed them on, so a restored history row had no
        // way to tell the two apart. A US sender's $5,000 to India came back
        // as the ₹478,000 the receiver got, rendered with a dollar sign,
        // because the rupee figure was the only one on offer.
        //
        // Null on rows written before these were stored: absent is a fact
        // the client can act on, where a fabricated figure is not.
        senderCurrency: transaction.metadata?.senderCurrency || null,
        debitAmount: Number.isFinite(Number(transaction.metadata?.debitAmount))
          ? Number(transaction.metadata.debitAmount)
          : null,
        fxRate: Number.isFinite(Number(transaction.metadata?.fxRate))
          ? Number(transaction.metadata.fxRate)
          : null,
        status: transaction.status,
        note: transaction.note || '',
        counterparty: cleanTransactionUser(counterparty),
        createdAt: transaction.createdAt,
      };
    });

    return res.json({
      success: true,
      symbolId: user.symbolId,
      count: history.length,
      transactions: history,
    });
  } catch (error) {
    console.error('Transaction history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not load transaction history.',
    });
  }
});

// GET /api/transactions/:symbolId?type=sent|received|all — the same records
// as /history, plus the two totals the dashboard's balance card needs. Kept
// as one call so the PAID figure, the RECEIVED figure and the week's bars
// are always three views of one fetch rather than three that can disagree.
app.get('/api/transactions/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const symbolId = String(req.params.symbolId || '').trim();
    const type = String(req.query.type || 'all').trim().toLowerCase();

    if (!symbolId) {
      return res.status(400).json({ success: false, message: 'Secure ID is required.' });
    }

    if (!['sent', 'received', 'all'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type must be sent, received or all.',
      });
    }

    const user = await User.findOne({ symbolId });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Secure ID not found.' });
    }

    // Totals are computed over every successful transaction, not just the
    // page returned below — a total that only counted the most recent 50
    // would quietly shrink as an account got busier.
    const [totals] = await Transaction.aggregate([
      {
        $match: {
          status: 'success',
          // Same exclusion as /api/transactions/history/:symbolId above —
          // a 'share' leg moves no real balance (lib/merchantShareFlow.js),
          // so counting it here would inflate totalSent/totalReceived by
          // the cashback amount on top of the real payment that already
          // includes it.
          type: { $ne: 'share' },
          $or: [{ fromUserId: user._id }, { toUserId: user._id }],
        },
      },
      {
        $group: {
          _id: null,
          totalSent: {
            $sum: { $cond: [{ $eq: ['$fromUserId', user._id] }, '$amount', 0] },
          },
          totalReceived: {
            $sum: { $cond: [{ $eq: ['$toUserId', user._id] }, '$amount', 0] },
          },
        },
      },
    ]);

    const directionMatch =
      type === 'sent' ? { fromUserId: user._id }
      : type === 'received' ? { toUserId: user._id }
      : { $or: [{ fromUserId: user._id }, { toUserId: user._id }] };

    // Same exclusion as the totals aggregate just above and
    // /api/transactions/history/:symbolId — a 'share' leg is a receipt-
    // trail record, not something this record list (or the dashboard it
    // feeds) was built to display.
    const records = await Transaction.find({ ...directionMatch, type: { $ne: 'share' } })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('fromUserId', 'fullName symbolId')
      .populate('toUserId', 'fullName symbolId')
      .lean();

    const transactions = records.map((transaction) => {
      const senderId = String(transaction.fromUserId?._id || transaction.fromUserId || '');
      const isSender = senderId === String(user._id);
      const counterparty = isSender ? transaction.toUserId : transaction.fromUserId;

      return {
        id: String(transaction._id),
        referenceId: transaction.referenceId,
        direction: isSender ? 'sent' : 'received',
        from: transaction.fromUserId?.symbolId || null,
        to: transaction.toUserId?.symbolId || null,
        // The RECEIVER's side: the face value this payment was denominated
        // in, and the currency it is in. Right for the receiver, wrong for
        // the sender on any cross-border payment.
        amount: transaction.amount,
        cashback: Number(transaction.metadata?.cashback) || 0,
        cashbackRate: Number(transaction.metadata?.cashbackRate) || 0,
        currency: transaction.currency,
        // The SENDER's side, in their own currency — the fields this route
        // is read for. See the matching block on /api/transactions/history
        // for the full reasoning; in short, `amount`/`currency` above are
        // the receiver's, and without these the client had no way to tell
        // the two apart, so a US sender's $5,000 to India came back as the
        // ₹478,000 the receiver got, wearing a dollar sign.
        senderCurrency: transaction.metadata?.senderCurrency || null,
        debitAmount: Number.isFinite(Number(transaction.metadata?.debitAmount))
          ? Number(transaction.metadata.debitAmount)
          : null,
        fxRate: Number.isFinite(Number(transaction.metadata?.fxRate))
          ? Number(transaction.metadata.fxRate)
          : null,
        status: transaction.status,
        note: transaction.note || '',
        counterparty: cleanTransactionUser(counterparty),
        createdAt: transaction.createdAt,
      };
    });

    return res.json({
      success: true,
      symbolId: user.symbolId,
      count: transactions.length,
      totalSent: totals?.totalSent || 0,
      totalReceived: totals?.totalReceived || 0,
      transactions,
    });
  } catch (error) {
    console.error('Transaction summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not load transactions.',
    });
  }
});

// ── Gloobal Coin ────────────────────────────────────────────────────────────
//
// A fully backed prototype currency. Every coin in existence was minted by
// moving the same amount of prototype fiat out of an account and into the
// CoinReserve, and can be redeemed back at the same rate. Nothing here creates
// value: a mint converts, a transfer moves, a redeem converts back, and the
// total supply only changes on the first and the last.
//
// The three properties worth stating, because the tests assert exactly them:
//
//   1. reserve == issued == sum(User.coinBalance), after every operation
//   2. a transfer changes neither reserve nor issued — only who holds
//   3. fiat + coin held by an account is unchanged by mint and redeem
//
// Coin is denominated in GC and fiat in INR, and the two are never added
// together anywhere in this file. They are equal in magnitude by the 1:1 issue
// rate, which is a property of the peg and not licence to treat one as the
// other.
const COIN_CURRENCY = 'GC';

const coinBalanceOf = (user) => {
  const raw = Number(user?.coinBalance);
  return Number.isFinite(raw) ? raw : 0;
};

// The PIN check, as the transfer route performs it, for the one coin operation
// that needs it. Returns null when the PIN is good, or a { status, message }
// to send back when it is not.
//
// Written as its own function rather than by reaching into the transfer route,
// and the transfer route is deliberately left alone: it is the most heavily
// tested path in this file and a refactor of it is not something to smuggle in
// alongside a new feature.
const rejectOnBadPin = async (user, rawPin) => {
  const cleanPin = String(rawPin || '').trim();

  if (!cleanPin) return { status: 400, message: 'PIN is required before sending coin.' };
  if (!isValidPinFormat(cleanPin)) return { status: 400, message: 'PIN must be 4 to 6 digits.' };

  const pinRecord = await Pin.findOne({ userId: user._id });

  if (!pinRecord) return { status: 404, message: 'PIN is not set for this Secure ID.' };

  if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
    return { status: 423, message: 'PIN is temporarily locked. Please try again later.' };
  }

  const matches = await bcrypt.compare(cleanPin, pinRecord.pinHash);

  if (!matches) {
    pinRecord.failedAttempts = (pinRecord.failedAttempts || 0) + 1;
    if (pinRecord.failedAttempts >= 5) {
      pinRecord.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    }
    await pinRecord.save();
    return { status: 401, message: 'Invalid PIN.' };
  }

  pinRecord.failedAttempts = 0;
  pinRecord.lockedUntil = null;
  pinRecord.lastVerifiedAt = new Date();
  await pinRecord.save();

  return null;
};

// Shared validation for an amount arriving in a coin request body.
const readCoinAmount = (raw) => {
  const amount = toMinorUnit(Number(raw));
  const maxPrototypeAmount = Number(process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT || 5000);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Valid amount greater than 0 is required.' };
  }

  if (Number.isFinite(maxPrototypeAmount) && maxPrototypeAmount > 0 && amount > maxPrototypeAmount) {
    return { error: `Prototype coin limit is ${maxPrototypeAmount} per operation.` };
  }

  return { amount };
};

// Total supply and the reserve behind it.
//
// Public and unauthenticated, like /api/stats: it answers with three aggregate
// numbers and names nobody. It is also the honest version of the claim the
// Gloobal Coin screen makes — a client can show "backed" only because this
// route says the reserve matches what has been issued, rather than because the
// copy on the screen says so.
//
// MUST stay declared above /api/coin/:symbolId. Express matches in declaration
// order, and behind the parameterised route this 404s with
// symbolId === 'supply'.
app.get('/api/coin/supply', async (req, res) => {
  try {
    const reserveDoc = await CoinReserve.load();

    // Summed from the accounts themselves, not read off the reserve document.
    // The whole value of this number is that it was maintained by a different
    // set of writes, so it can disagree.
    const [held] = await User.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$coinBalance', 0] } }, holders: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$coinBalance', 0] }, 0] }, 1, 0] } } } },
    ]);

    const reserve = toMinorUnit(reserveDoc?.reserve || 0);
    const issued = toMinorUnit(reserveDoc?.issued || 0);
    const heldByAccounts = toMinorUnit(held?.total || 0);

    return res.json({
      success: true,
      reserve,
      issued,
      heldByAccounts,
      holders: held?.holders || 0,
      reserveCurrency: reserveDoc?.reserveCurrency || 'INR',
      coinCurrency: COIN_CURRENCY,
      // Not a boast — a comparison of three independently maintained figures.
      // A client that shows "fully backed" is quoting this, and if the numbers
      // ever disagree it says so instead.
      backed: reserve === issued && issued === heldByAccounts,
    });
  } catch (error) {
    console.error('Coin supply error:', error);
    return res.status(500).json({ success: false, message: 'Could not load coin supply.' });
  }
});

// One account's coin position, plus the supply it sits inside.
app.get('/api/coin/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const user = await User.findOne({ symbolId: String(req.params.symbolId || '').trim() });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Secure ID not found.' });
    }

    const reserveDoc = await CoinReserve.load();

    return res.json({
      success: true,
      symbolId: user.symbolId,
      coinBalance: coinBalanceOf(user),
      balance: accountBalanceOf(user),
      coinCurrency: COIN_CURRENCY,
      reserveCurrency: reserveDoc?.reserveCurrency || 'INR',
      reserve: toMinorUnit(reserveDoc?.reserve || 0),
      issued: toMinorUnit(reserveDoc?.issued || 0),
    });
  } catch (error) {
    console.error('Coin balance error:', error);
    return res.status(500).json({ success: false, message: 'Could not load coin balance.' });
  }
});

// Mint: fiat out of the account, into the reserve; coin issued 1:1.
//
// No PIN. A mint moves value between two things the same person owns and is
// undone in full by a redeem, so there is no counterparty and nothing to lose
// to a mistake — gating it behind a credential would be friction that buys
// nothing. /api/coin/send does require one, because that is irreversible and
// has someone else on the other end.
app.post('/api/coin/mint', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, amount } = req.body || {};
    const { amount: coinAmount, error } = readCoinAmount(amount);

    if (error) return res.status(400).json({ success: false, message: error });

    const user = await User.findOne({ symbolId: String(symbolId || '').trim() });

    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    // Accounts predating the balance field cannot satisfy `balance: { $gte }`.
    // coinBalance needs no equivalent: $inc materialises a missing field on the
    // credit side, and on the debit side a missing field failing the guard is
    // the correct answer — that account holds no coin.
    await materialiseBalance(user);

    const referenceId = await resolveTransactionReference(null);

    const { value, atomic } = await withMongoTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};

      // One update, both fields. Fiat leaving and coin arriving are the same
      // event, and splitting them into two writes would open a window in which
      // the account had neither.
      const converted = await User.findOneAndUpdate(
        { _id: user._id, balance: { $gte: coinAmount } },
        { $inc: { balance: -coinAmount, coinBalance: coinAmount } },
        { returnDocument: 'after', ...sessionOpt }
      );

      if (!converted) {
        const current = await User.findById(user._id).select('balance').lean();
        throw new InsufficientBalanceError(accountBalanceOf(current || {}));
      }

      const reserveDoc = await CoinReserve.findOneAndUpdate(
        { key: 'global' },
        { $inc: { reserve: coinAmount, issued: coinAmount } },
        { upsert: true, returnDocument: 'after', ...sessionOpt }
      );

      const balanceAfter = toMinorUnit(converted.balance);
      const coinAfter = toMinorUnit(converted.coinBalance);

      const [transaction] = await Transaction.create(
        [
          {
            fromUserId: user._id,
            toUserId: null,
            amount: coinAmount,
            currency: COIN_CURRENCY,
            type: 'coin_mint',
            status: 'success',
            note: 'Minted Gloobal Coin',
            referenceId,
            metadata: { prototype: true, reserveCurrency: reserveDoc?.reserveCurrency || 'INR' },
          },
        ],
        session ? { session } : {}
      );

      // Two lines in two currencies. They are not a debit/credit pair of one
      // journal entry — a single entry cannot balance across currencies — but
      // the fiat leg and the coin leg of the same conversion, each recorded
      // against the unit it actually moved in.
      await LedgerEntry.create(
        [
          {
            transactionId: transaction._id,
            userId: user._id,
            entryType: 'debit',
            amount: coinAmount,
            balanceBefore: toMinorUnit(balanceAfter + coinAmount),
            balanceAfter,
            currency: reserveDoc?.reserveCurrency || 'INR',
            note: 'Fiat moved into coin reserve',
            metadata: { prototype: true, coinLeg: 'fiat', transactionReferenceId: transaction.referenceId },
          },
          {
            transactionId: transaction._id,
            userId: user._id,
            entryType: 'credit',
            amount: coinAmount,
            balanceBefore: toMinorUnit(coinAfter - coinAmount),
            balanceAfter: coinAfter,
            currency: COIN_CURRENCY,
            note: 'Gloobal Coin issued',
            metadata: { prototype: true, coinLeg: 'coin', transactionReferenceId: transaction.referenceId },
          },
        ],
        session ? { session, ordered: true } : {}
      );

      return { transaction, balanceAfter, coinAfter, reserveDoc };
    });

    return res.json({
      success: true,
      atomic,
      minted: coinAmount,
      balance: value.balanceAfter,
      coinBalance: value.coinAfter,
      reserve: toMinorUnit(value.reserveDoc?.reserve || 0),
      issued: toMinorUnit(value.reserveDoc?.issued || 0),
      referenceId: value.transaction.referenceId,
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Not enough balance to mint that much.', balance: error.balance });
    }
    console.error('Coin mint error:', error);
    return res.status(500).json({ success: false, message: 'Could not mint Gloobal Coin.' });
  }
});

// Redeem: coin destroyed, fiat returned from the reserve. The exact inverse of
// a mint, including which numbers move.
app.post('/api/coin/redeem', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, amount } = req.body || {};
    const { amount: coinAmount, error } = readCoinAmount(amount);

    if (error) return res.status(400).json({ success: false, message: error });

    const user = await User.findOne({ symbolId: String(symbolId || '').trim() });

    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    await materialiseBalance(user);

    const referenceId = await resolveTransactionReference(null);

    const { value, atomic } = await withMongoTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};

      const converted = await User.findOneAndUpdate(
        { _id: user._id, coinBalance: { $gte: coinAmount } },
        { $inc: { coinBalance: -coinAmount, balance: coinAmount } },
        { returnDocument: 'after', ...sessionOpt }
      );

      if (!converted) {
        const current = await User.findById(user._id).select('coinBalance').lean();
        const held = coinBalanceOf(current || {});
        const shortfall = new Error('Not enough Gloobal Coin to redeem that much.');
        shortfall.name = 'InsufficientCoinError';
        shortfall.coinBalance = held;
        throw shortfall;
      }

      // Guarded, not merely decremented. If the reserve cannot cover this the
      // account is holding coin the reserve never backed, and the right move is
      // to fail loudly rather than to pay out fiat that was never deposited and
      // drive the reserve negative.
      const reserveDoc = await CoinReserve.findOneAndUpdate(
        { key: 'global', reserve: { $gte: coinAmount }, issued: { $gte: coinAmount } },
        { $inc: { reserve: -coinAmount, issued: -coinAmount } },
        { returnDocument: 'after', ...sessionOpt }
      );

      if (!reserveDoc) {
        throw new Error('Coin reserve is short of the amount being redeemed — refusing to pay out unbacked coin.');
      }

      const balanceAfter = toMinorUnit(converted.balance);
      const coinAfter = toMinorUnit(converted.coinBalance);

      const [transaction] = await Transaction.create(
        [
          {
            fromUserId: user._id,
            toUserId: null,
            amount: coinAmount,
            currency: COIN_CURRENCY,
            type: 'coin_redeem',
            status: 'success',
            note: 'Redeemed Gloobal Coin',
            referenceId,
            metadata: { prototype: true, reserveCurrency: reserveDoc.reserveCurrency || 'INR' },
          },
        ],
        session ? { session } : {}
      );

      await LedgerEntry.create(
        [
          {
            transactionId: transaction._id,
            userId: user._id,
            entryType: 'debit',
            amount: coinAmount,
            balanceBefore: toMinorUnit(coinAfter + coinAmount),
            balanceAfter: coinAfter,
            currency: COIN_CURRENCY,
            note: 'Gloobal Coin redeemed',
            metadata: { prototype: true, coinLeg: 'coin', transactionReferenceId: transaction.referenceId },
          },
          {
            transactionId: transaction._id,
            userId: user._id,
            entryType: 'credit',
            amount: coinAmount,
            balanceBefore: toMinorUnit(balanceAfter - coinAmount),
            balanceAfter,
            currency: reserveDoc.reserveCurrency || 'INR',
            note: 'Fiat returned from coin reserve',
            metadata: { prototype: true, coinLeg: 'fiat', transactionReferenceId: transaction.referenceId },
          },
        ],
        session ? { session, ordered: true } : {}
      );

      return { transaction, balanceAfter, coinAfter, reserveDoc };
    });

    return res.json({
      success: true,
      atomic,
      redeemed: coinAmount,
      balance: value.balanceAfter,
      coinBalance: value.coinAfter,
      reserve: toMinorUnit(value.reserveDoc?.reserve || 0),
      issued: toMinorUnit(value.reserveDoc?.issued || 0),
      referenceId: value.transaction.referenceId,
    });
  } catch (error) {
    if (error.name === 'InsufficientCoinError') {
      return res.status(400).json({ success: false, message: error.message, coinBalance: error.coinBalance });
    }
    console.error('Coin redeem error:', error);
    return res.status(500).json({ success: false, message: 'Could not redeem Gloobal Coin.' });
  }
});

// Coin from one account to another.
//
// Supply is untouched: no coin is created or destroyed, and the reserve is not
// read or written. That is the property that makes this a currency rather than
// a balance transfer with extra steps — the backing does not have to move for
// the coin to.
app.post('/api/coin/send', writeLimit, requireAuth, requireSelf('senderSymbolId', 'symbolId'), async (req, res) => {
  try {
    const { senderSymbolId, symbolId, receiverSymbolId, toSymbolId, amount, note = '', pin } = req.body || {};

    const senderIdentifier = String(senderSymbolId || symbolId || '').trim();
    const receiverIdentifier = String(receiverSymbolId || toSymbolId || '').trim();
    const cleanNote = String(note || '').trim().slice(0, 140);
    const { amount: coinAmount, error } = readCoinAmount(amount);

    if (error) return res.status(400).json({ success: false, message: error });
    if (!senderIdentifier) return res.status(400).json({ success: false, message: 'Sender Secure ID is required.' });
    if (!receiverIdentifier) return res.status(400).json({ success: false, message: 'Receiver Secure ID is required.' });

    if (normalizeText(senderIdentifier) === normalizeText(receiverIdentifier)) {
      return res.status(400).json({ success: false, message: 'Self-transfer is not allowed.' });
    }

    const sender = (await resolveTransactionUserByIdentifier(senderIdentifier))?.user;
    const receiver = (await resolveTransactionUserByIdentifier(receiverIdentifier))?.user;

    if (!sender) return res.status(404).json({ success: false, message: 'Sender Secure ID not found.' });
    if (!receiver) return res.status(404).json({ success: false, message: 'Receiver Secure ID not found.' });

    if (String(sender._id) === String(receiver._id)) {
      return res.status(400).json({ success: false, message: 'Self-transfer is not allowed.' });
    }

    // Before the balance is looked at, so a wrong PIN learns nothing about
    // what the account holds.
    const pinFailure = await rejectOnBadPin(sender, pin);
    if (pinFailure) return res.status(pinFailure.status).json({ success: false, message: pinFailure.message });

    const referenceId = await resolveTransactionReference(req.body?.referenceId);

    const { value, atomic } = await withMongoTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};

      const debited = await User.findOneAndUpdate(
        { _id: sender._id, coinBalance: { $gte: coinAmount } },
        { $inc: { coinBalance: -coinAmount } },
        { returnDocument: 'after', ...sessionOpt }
      );

      if (!debited) {
        const current = await User.findById(sender._id).select('coinBalance').lean();
        const shortfall = new Error('Not enough Gloobal Coin to send that much.');
        shortfall.name = 'InsufficientCoinError';
        shortfall.coinBalance = coinBalanceOf(current || {});
        throw shortfall;
      }

      let credited = null;

      try {
        credited = await User.findOneAndUpdate(
          { _id: receiver._id },
          { $inc: { coinBalance: coinAmount } },
          { returnDocument: 'after', ...sessionOpt }
        );

        if (!credited) throw new Error('Receiver account disappeared mid-transfer.');

        const senderCoinAfter = toMinorUnit(debited.coinBalance);
        const receiverCoinAfter = toMinorUnit(credited.coinBalance);

        const [transaction] = await Transaction.create(
          [
            {
              fromUserId: sender._id,
              toUserId: receiver._id,
              amount: coinAmount,
              currency: COIN_CURRENCY,
              type: 'coin_send',
              status: 'success',
              note: cleanNote,
              referenceId,
              metadata: { prototype: true },
            },
          ],
          session ? { session } : {}
        );

        await LedgerEntry.create(
          [
            {
              transactionId: transaction._id,
              userId: sender._id,
              entryType: 'debit',
              amount: coinAmount,
              balanceBefore: toMinorUnit(senderCoinAfter + coinAmount),
              balanceAfter: senderCoinAfter,
              currency: COIN_CURRENCY,
              note: 'Gloobal Coin sent',
              metadata: { prototype: true, coinLeg: 'coin', transactionReferenceId: transaction.referenceId },
            },
            {
              transactionId: transaction._id,
              userId: receiver._id,
              entryType: 'credit',
              amount: coinAmount,
              balanceBefore: toMinorUnit(receiverCoinAfter - coinAmount),
              balanceAfter: receiverCoinAfter,
              currency: COIN_CURRENCY,
              note: 'Gloobal Coin received',
              metadata: { prototype: true, coinLeg: 'coin', transactionReferenceId: transaction.referenceId },
            },
          ],
          session ? { session, ordered: true } : {}
        );

        return { transaction, senderCoinAfter, receiverCoinAfter };
      } catch (moveError) {
        // Only reachable on a deployment without transactions, where the debit
        // above really did commit. Inside a transaction the abort undoes it and
        // compensating here would hand back coin twice.
        if (!session) {
          try {
            await User.updateOne({ _id: sender._id }, { $inc: { coinBalance: coinAmount } });
            if (credited) await User.updateOne({ _id: receiver._id }, { $inc: { coinBalance: -coinAmount } });
          } catch (revertError) {
            console.error('Coin transfer compensation failed:', revertError);
          }
        }
        throw moveError;
      }
    });

    return res.json({
      success: true,
      atomic,
      sent: coinAmount,
      coinBalance: value.senderCoinAfter,
      referenceId: value.transaction.referenceId,
      receiver: cleanTransactionUser(receiver),
    });
  } catch (error) {
    if (error.name === 'InsufficientCoinError') {
      return res.status(400).json({ success: false, message: error.message, coinBalance: error.coinBalance });
    }
    console.error('Coin send error:', error);
    return res.status(500).json({ success: false, message: 'Could not send Gloobal Coin.' });
  }
});

// ===========================================================================
// GEU (Gloobal Energy Unit) — see AUDIT_GEU_REPORT.md for the full design
// rationale, invariant reasoning, and the list of UNRESOLVED GEU POLICY
// QUESTIONS this implementation deliberately does not answer.
//
// Reference relationship (never a price-growth claim): 1 GEU = 1 INR at the
// reference/accounting layer. GEU has exactly two creation reasons —
// ENTRY_MINT (capital-backed, models/GeuEntryMint.js) and GROWTH (bounded,
// models/GeuGrowthEvent.js) — and one destruction reason additional to
// negative growth: REDEMPTION (models/GeuRedemption.js). Every route below
// reuses this codebase's existing primitives (withMongoTransaction,
// toMinorUnit/decimalsFor, getRate, CountryCurrencyPool, AuditLog,
// requireAuth/requireSelf) rather than inventing parallel ones.
// ===========================================================================

const GEU_CURRENCY = 'GEU';
const GEU_REFERENCE_CURRENCY = 'INR';
// THE 0.3% RULE — a maximum, never a rate that is automatically applied.
// See POST /api/geu/growth: this number only ever bounds a caller-supplied
// actualGrowthAmount; nothing in this file multiplies a balance by it on a
// schedule.
const GEU_MAX_POSITIVE_GROWTH_RATE = 0.003;

const GEU_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function createGeuId(prefix, length = 16) {
  let id = prefix;
  for (let i = 0; i < length; i += 1) {
    id += GEU_ID_CHARS[crypto.randomInt(GEU_ID_CHARS.length)];
  }
  return id;
}

const geuBalanceOf = (user) => {
  const raw = Number(user?.geuBalance);
  return Number.isFinite(raw) ? raw : 0;
};

// The growth ceiling (brief section 6/10) is floored, never rounded, to
// GEU's own minor unit — a CEILING must never be nudged upward by rounding.
// toMinorUnit's round-half-up (used everywhere else in this codebase) would
// occasionally let a request through at a hair over the true 0.3%; flooring
// cannot.
const floorToMinorUnit = (value, currencyCode) => {
  const decimals = currencyCode ? decimalsFor(currencyCode) : 2;
  const factor = 10 ** decimals;
  return Math.floor(Number(value) * factor) / factor;
};

// Resolves an account's own currency the same never-trust-the-client way
// every other money-moving route in this file already does (see
// AUDIT_REPORT.md's Bugs Found #6) — GEU entry/redemption currency is
// always the account's own Country.localCurrency, never a client-supplied
// code.
//
// Goes through the shared resolver for the same reason the transfer route
// does. This read `country?.localCurrency || 'INR'` against a Country
// collection that was empty on the live database, so every account's "own
// currency" was rupees. For GEU that is not a cosmetic default: entry
// converts the account's own currency into the INR reference, so an account
// that should have converted at its real rate instead matched the reference
// exactly and minted 1:1. The symptom would have been precisely the founder's
// original report — "$100 should not produce only 100 GEU" — arriving from
// unseeded reference data rather than from the conversion code, which is
// correct.
//
// Returns null for a genuinely unsupported country; callers refuse rather
// than substituting a currency.
async function resolveOwnCurrency(user) {
  return localCurrencyFor(accountCountryIso(user));
}

// GET /api/geu/supply — the GEU analogue of GET /api/coin/supply. MUST stay
// declared above /api/geu/:symbolId for the same reason that route's own
// comment gives: Express matches in declaration order, and behind the
// parameterised route this would 404 with symbolId === 'supply'.
app.get('/api/geu/supply', async (req, res) => {
  try {
    const supplyDoc = await GeuSupply.load();

    const [held] = await User.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$geuBalance', 0] } }, holders: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$geuBalance', 0] }, 0] }, 1, 0] } } } },
    ]);

    const createdFromEntry = toMinorUnit(supplyDoc?.createdFromEntry || 0, GEU_CURRENCY);
    const createdFromGrowth = toMinorUnit(supplyDoc?.createdFromGrowth || 0, GEU_CURRENCY);
    const destroyedFromRedemption = toMinorUnit(supplyDoc?.destroyedFromRedemption || 0, GEU_CURRENCY);
    const destroyedFromNegativeGrowth = toMinorUnit(supplyDoc?.destroyedFromNegativeGrowth || 0, GEU_CURRENCY);
    const circulating = toMinorUnit(GeuSupply.circulating(supplyDoc), GEU_CURRENCY);
    const heldByAccounts = toMinorUnit(held?.total || 0, GEU_CURRENCY);

    return res.json({
      success: true,
      referenceCurrency: supplyDoc?.referenceCurrency || GEU_REFERENCE_CURRENCY,
      capitalBackingReferenceInr: toMinorUnit(supplyDoc?.capitalBackingReferenceInr || 0, GEU_REFERENCE_CURRENCY),
      createdFromEntry,
      createdFromGrowth,
      destroyedFromRedemption,
      destroyedFromNegativeGrowth,
      reserved: toMinorUnit(supplyDoc?.reserved || 0, GEU_CURRENCY),
      pending: toMinorUnit(supplyDoc?.pending || 0, GEU_CURRENCY),
      totalCirculatingGeu: circulating,
      heldByAccounts,
      holders: held?.holders || 0,
      // Independently-maintained reconciliation (Invariant 8), same
      // reasoning as /api/coin/supply's own `backed` field — three numbers
      // that are only equal because every route kept them equal.
      reconciled: circulating === heldByAccounts,
    });
  } catch (error) {
    console.error('GEU supply error:', error);
    return res.status(500).json({ success: false, message: 'Could not load GEU supply.' });
  }
});

// GET /api/geu/ledger/:symbolId — GEU-only ledger history for one account.
// Declared before /api/geu/:symbolId is irrelevant to Express's matching
// here (two path segments vs one — no collision either order), but kept in
// reading order next to it.
app.get('/api/geu/ledger/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const user = await User.findOne({ symbolId: String(req.params.symbolId || '').trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    const entries = await LedgerEntry.find({ userId: user._id, currency: GEU_CURRENCY })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      symbolId: user.symbolId,
      count: entries.length,
      ledger: entries.map((e) => ({
        id: e._id,
        transactionId: e.transactionId,
        entryType: e.entryType,
        amount: e.amount,
        balanceBefore: e.balanceBefore,
        balanceAfter: e.balanceAfter,
        note: e.note,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    console.error('GEU ledger error:', error);
    return res.status(500).json({ success: false, message: 'Could not load GEU ledger.' });
  }
});

// GET /api/geu/:symbolId — one account's GEU position.
app.get('/api/geu/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const user = await User.findOne({ symbolId: String(req.params.symbolId || '').trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    return res.json({
      success: true,
      symbolId: user.symbolId,
      geuBalance: geuBalanceOf(user),
      balance: accountBalanceOf(user),
      geuCurrency: GEU_CURRENCY,
      referenceCurrency: GEU_REFERENCE_CURRENCY,
      // Ceiling for the NEXT growth event this account could post, informational
      // only — GET has no side effect and creates no GeuGrowthEvent.
      maxPositiveGrowthRate: GEU_MAX_POSITIVE_GROWTH_RATE,
      maxPositiveGrowthIfAppliedNow: floorToMinorUnit(geuBalanceOf(user) * GEU_MAX_POSITIVE_GROWTH_RATE, GEU_CURRENCY),
    });
  } catch (error) {
    console.error('GEU balance error:', error);
    return res.status(500).json({ success: false, message: 'Could not load GEU balance.' });
  }
});

// POST /api/geu/entry — capital entry -> GEU entry mint (brief sections 3/4).
//
// Mapped from Coin's mint route (see AUDIT_GEU_REPORT.md's Phase 2/3
// mapping): the closest existing precedent for "fiat becomes a different
// unit, 1:1 against a captured reference value" is exactly what
// POST /api/coin/mint already does, so the qualifying capital this route
// mints against is the account's own existing Gloobal balance (User.balance,
// in the account's own currency) — the same "one update, both fields"
// atomic swap Coin mint uses, not a new external capital-intake mechanism
// this prototype has no real payment rail to support. This is a documented
// mapping decision, not an assumption made silently — see UNRESOLVED GEU
// POLICY QUESTIONS for the real-world alternative (genuinely external
// capital, with no corresponding internal debit) this does NOT implement.
app.post('/api/geu/entry', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, amount, idempotencyKey } = req.body || {};
    const sourceAmount = toMinorUnit(Number(amount));
    const cleanIdempotencyKey = String(idempotencyKey || '').trim().slice(0, 120);
    const maxPrototypeAmount = Number(process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT || 5000);

    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount greater than 0 is required.' });
    }
    if (Number.isFinite(maxPrototypeAmount) && maxPrototypeAmount > 0 && sourceAmount > maxPrototypeAmount) {
      return res.status(400).json({ success: false, message: `Prototype GEU entry limit is ${maxPrototypeAmount} per operation.` });
    }
    if (!cleanIdempotencyKey) {
      return res.status(400).json({ success: false, message: 'idempotencyKey is required for a GEU entry.' });
    }

    const user = await User.findOne({ symbolId: String(symbolId || '').trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    await materialiseBalance(user);

    // Pre-check, same shape as /api/transactions/send's — the unique index
    // on GeuEntryMint(userId, idempotencyKey) is what actually guarantees
    // this under a race (see the E11000 handling below), this is only the
    // fast, non-racing path.
    const existingEntry = await GeuEntryMint.findOne({ userId: user._id, idempotencyKey: cleanIdempotencyKey });
    if (existingEntry) {
      return res.status(200).json({ success: true, duplicate: true, entry: existingEntry });
    }

    const sourceCurrency = await resolveOwnCurrency(user);
    // Refused rather than defaulted: the whole entry is denominated in this
    // currency, so guessing one mints the wrong amount of GEU.
    if (!sourceCurrency) {
      return res.status(400).json({ success: false, message: 'GEU entry is not supported for your country yet.' });
    }
    let exchangeRate = 1;
    let rateSource = 'identity';
    const rateTimestamp = new Date();

    if (sourceCurrency !== GEU_REFERENCE_CURRENCY) {
      try {
        ({ rate: exchangeRate, source: rateSource } = await getRate(sourceCurrency, GEU_REFERENCE_CURRENCY));
      } catch (fxError) {
        console.error(`GEU entry FX lookup failed for ${sourceCurrency}->${GEU_REFERENCE_CURRENCY}:`, fxError);
        return res.status(502).json({ success: false, message: 'Exchange rate is temporarily unavailable. Please try again in a moment.' });
      }
    }

    const referenceAmount = toMinorUnit(sourceAmount * exchangeRate, GEU_REFERENCE_CURRENCY);
    const geuAmount = toMinorUnit(referenceAmount, GEU_CURRENCY);
    const entryId = createGeuId('GLOOBAL-GEU-ENTRY-');
    const referenceId = await resolveTransactionReference(null);

    let value;
    let atomic;
    try {
      ({ value, atomic } = await withMongoTransaction(async (session) => {
        const sessionOpt = session ? { session } : {};

        // One update, both fields — the same "fiat leaving and GEU arriving
        // are the same event" reasoning Coin mint's own comment gives.
        const converted = await User.findOneAndUpdate(
          { _id: user._id, balance: { $gte: sourceAmount } },
          { $inc: { balance: -sourceAmount, geuBalance: geuAmount } },
          { returnDocument: 'after', ...sessionOpt }
        );

        if (!converted) {
          const current = await User.findById(user._id).select('balance').lean();
          throw new InsufficientBalanceError(accountBalanceOf(current || {}));
        }

        await GeuSupply.findOneAndUpdate(
          { key: 'global' },
          { $inc: { capitalBackingReferenceInr: referenceAmount, createdFromEntry: geuAmount } },
          { upsert: true, ...sessionOpt }
        );

        const balanceAfter = toMinorUnit(converted.balance, sourceCurrency);
        const geuAfter = toMinorUnit(converted.geuBalance, GEU_CURRENCY);

        const [transaction] = await Transaction.create(
          [
            {
              fromUserId: user._id,
              toUserId: null,
              amount: geuAmount,
              currency: GEU_CURRENCY,
              type: 'geu_entry_mint',
              status: 'success',
              note: 'GEU entry mint',
              referenceId,
              metadata: { prototype: true, entryId, sourceCurrency, sourceAmount, referenceAmount, exchangeRate, rateSource },
            },
          ],
          session ? { session } : {}
        );

        const [entry] = await GeuEntryMint.create(
          [
            {
              entryId,
              userId: user._id,
              symbolId: user.symbolId,
              sourceCurrency,
              sourceAmount,
              referenceCurrency: GEU_REFERENCE_CURRENCY,
              referenceAmount,
              exchangeRate,
              rateSource,
              rateTimestamp,
              geuAmount,
              transactionId: transaction._id,
              idempotencyKey: cleanIdempotencyKey,
              status: 'completed',
            },
          ],
          session ? { session } : {}
        );

        await LedgerEntry.create(
          [
            {
              transactionId: transaction._id,
              userId: user._id,
              entryType: 'debit',
              amount: sourceAmount,
              balanceBefore: toMinorUnit(balanceAfter + sourceAmount, sourceCurrency),
              balanceAfter,
              currency: sourceCurrency,
              note: 'Capital moved into GEU entry mint',
              metadata: { prototype: true, geuLeg: 'capital', entryId, transactionReferenceId: transaction.referenceId },
            },
            {
              transactionId: transaction._id,
              userId: user._id,
              entryType: 'credit',
              amount: geuAmount,
              balanceBefore: toMinorUnit(geuAfter - geuAmount, GEU_CURRENCY),
              balanceAfter: geuAfter,
              currency: GEU_CURRENCY,
              note: 'GEU entry-minted',
              metadata: { prototype: true, geuLeg: 'geu', entryId, transactionReferenceId: transaction.referenceId },
            },
          ],
          session ? { session, ordered: true } : {}
        );

        return { transaction, entry, balanceAfter, geuAfter };
      }));
    } catch (transferError) {
      const isEntryCollision =
        (transferError?.code === 11000 || transferError?.writeErrors?.[0]?.code === 11000) &&
        /idempotencyKey/.test(String(transferError?.message || transferError?.writeErrors?.[0]?.errmsg || ''));

      if (isEntryCollision) {
        const winner = await GeuEntryMint.findOne({ userId: user._id, idempotencyKey: cleanIdempotencyKey });
        if (winner) return res.status(200).json({ success: true, duplicate: true, entry: winner });
      }
      throw transferError;
    }

    recordAudit({
      userId: user._id, action: 'geu.entry_mint', status: 'success', req,
      metadata: { symbolId: user.symbolId, entryId, sourceCurrency, sourceAmount, referenceAmount, geuAmount, exchangeRate },
    });

    return res.status(201).json({
      success: true,
      entryId,
      sourceCurrency,
      sourceAmount,
      referenceCurrency: GEU_REFERENCE_CURRENCY,
      referenceAmount,
      exchangeRate,
      rateSource,
      geuMinted: geuAmount,
      balance: value.balanceAfter,
      geuBalance: value.geuAfter,
      referenceId: value.transaction.referenceId,
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Not enough balance to enter that much capital.', balance: error.balance });
    }
    console.error('GEU entry error:', error);
    return res.status(500).json({ success: false, message: 'Could not process GEU entry.' });
  }
});

// POST /api/geu/growth — a bounded growth event (brief sections 6/7/10/11).
//
// UNRESOLVED GEU POLICY QUESTION, implemented around rather than guessed at
// (see AUDIT_GEU_REPORT.md): nothing in the brief defines what determines
// the actual growth amount for a period, or who/what is authorized to
// apply one. This route enforces the one thing that IS mathematically
// unambiguous — actualGrowthAmount can never exceed
// opening_balance * 0.003, is idempotent per (account, period), and is
// never automatic — and requires the caller to supply
// requestedGrowthAmount explicitly rather than computing one from an
// undefined rule. Gated behind the same requireAuth + requireSelf every
// other account-owner action in this file uses, because no admin/system-role
// concept exists anywhere in this codebase to gate it behind instead — this
// means an account holder can currently request growth for their own
// account up to the ceiling, which is almost certainly NOT the intended
// real-world authorization model (the brief explicitly says 0.3% must never
// function as guaranteed income, and a user who can always claim their own
// maximum every period has effectively been given exactly that). Flagged
// here, in the route's own response via `policyNote`, and in the final
// report — not silently implemented as if it were settled.
app.post('/api/geu/growth', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, growthPeriod, requestedGrowthAmount } = req.body || {};
    const cleanPeriod = String(growthPeriod || '').trim().slice(0, 40);
    const requested = toMinorUnit(Number(requestedGrowthAmount), GEU_CURRENCY);

    if (!cleanPeriod) {
      return res.status(400).json({ success: false, message: 'growthPeriod is required (e.g. an ISO date identifying the period this event is for).' });
    }
    if (!Number.isFinite(requested)) {
      return res.status(400).json({ success: false, message: 'requestedGrowthAmount must be a finite number.' });
    }

    const user = await User.findOne({ symbolId: String(symbolId || '').trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    // Idempotency pre-check (brief sections 10/18/Invariant 9) — the unique
    // index on GeuGrowthEvent(accountId, growthPeriod) is the real
    // guarantee under a race; see the E11000 handling below.
    const existingEvent = await GeuGrowthEvent.findOne({ accountId: user._id, growthPeriod: cleanPeriod });
    if (existingEvent) {
      return res.status(200).json({ success: true, duplicate: true, growthEvent: existingEvent });
    }

    const openingBalance = geuBalanceOf(user);
    // Floored ceiling — never computed from a balance that already includes
    // this same growth event (openingBalance is read fresh, before any
    // write below, and the atomic $inc guard further down re-checks it
    // against the actual document at write time).
    const maxPositiveGrowth = floorToMinorUnit(openingBalance * GEU_MAX_POSITIVE_GROWTH_RATE, GEU_CURRENCY);

    if (requested > maxPositiveGrowth) {
      return res.status(400).json({
        success: false,
        message: `Requested growth ${requested} exceeds the maximum positive growth (${maxPositiveGrowth}) for this balance.`,
        openingBalance,
        maxPositiveGrowth,
      });
    }

    const closingBalance = toMinorUnit(openingBalance + requested, GEU_CURRENCY);
    if (closingBalance < 0) {
      return res.status(400).json({
        success: false,
        message: 'Requested negative adjustment would take the GEU balance below zero.',
        openingBalance,
      });
    }

    const reason = requested > 0 ? 'POSITIVE_ADJUSTMENT' : requested === 0 ? 'ZERO_ADJUSTMENT' : 'NEGATIVE_ADJUSTMENT';
    const growthEventId = createGeuId('GLOOBAL-GEU-GROWTH-');
    const referenceId = await resolveTransactionReference(null);

    let value;
    let atomic;
    try {
      ({ value, atomic } = await withMongoTransaction(async (session) => {
        const sessionOpt = session ? { session } : {};

        // Exact-match optimistic guard on geuBalance, not just an existence
        // check: this is what makes the ceiling computed above actually
        // apply to the balance being written, not a balance that changed
        // (e.g. via a concurrent redemption) between the read above and
        // this write. A mismatch means the account moved since
        // openingBalance was read — the whole request is refused rather
        // than silently applied against a stale ceiling.
        const applied = await User.findOneAndUpdate(
          { _id: user._id, geuBalance: openingBalance },
          { $inc: { geuBalance: requested } },
          { returnDocument: 'after', ...sessionOpt }
        );

        if (!applied) {
          const raceError = new Error('GEU balance changed since this growth event was evaluated — please retry.');
          raceError.name = 'GeuBalanceRaceError';
          throw raceError;
        }

        if (requested > 0) {
          await GeuSupply.findOneAndUpdate({ key: 'global' }, { $inc: { createdFromGrowth: requested } }, { upsert: true, ...sessionOpt });
        } else if (requested < 0) {
          await GeuSupply.findOneAndUpdate({ key: 'global' }, { $inc: { destroyedFromNegativeGrowth: -requested } }, { upsert: true, ...sessionOpt });
        }

        const [transaction] = await Transaction.create(
          [
            {
              fromUserId: requested < 0 ? user._id : null,
              toUserId: requested < 0 ? null : user._id,
              amount: Math.abs(requested),
              currency: GEU_CURRENCY,
              type: 'geu_growth',
              status: 'success',
              note: `GEU growth event (${reason})`,
              referenceId,
              metadata: { prototype: true, growthEventId, growthPeriod: cleanPeriod, openingBalance, maxPositiveGrowth, requested, reason },
            },
          ],
          session ? { session } : {}
        );

        const [growthEvent] = await GeuGrowthEvent.create(
          [
            {
              growthEventId,
              accountId: user._id,
              symbolId: user.symbolId,
              growthPeriod: cleanPeriod,
              openingBalance,
              maxPositiveGrowth,
              requestedGrowthAmount: requested,
              actualGrowthAmount: requested,
              closingBalance,
              actualGrowthRate: openingBalance > 0 ? requested / openingBalance : 0,
              reason,
              status: 'applied',
              transactionId: transaction._id,
            },
          ],
          session ? { session } : {}
        );

        if (requested !== 0) {
          await LedgerEntry.create(
            [
              {
                transactionId: transaction._id,
                userId: user._id,
                entryType: requested > 0 ? 'credit' : 'debit',
                amount: Math.abs(requested),
                balanceBefore: openingBalance,
                balanceAfter: closingBalance,
                currency: GEU_CURRENCY,
                note: `GEU growth (${reason})`,
                metadata: { prototype: true, growthEventId, transactionReferenceId: transaction.referenceId },
              },
            ],
            session ? { session } : {}
          );
        }

        return { transaction, growthEvent };
      }));
    } catch (growthError) {
      if (growthError?.name === 'GeuBalanceRaceError') {
        return res.status(409).json({ success: false, message: growthError.message });
      }
      const isGrowthCollision =
        (growthError?.code === 11000 || growthError?.writeErrors?.[0]?.code === 11000) &&
        /growthPeriod/.test(String(growthError?.message || growthError?.writeErrors?.[0]?.errmsg || ''));

      if (isGrowthCollision) {
        const winner = await GeuGrowthEvent.findOne({ accountId: user._id, growthPeriod: cleanPeriod });
        if (winner) return res.status(200).json({ success: true, duplicate: true, growthEvent: winner });
      }
      throw growthError;
    }

    recordAudit({
      userId: user._id, action: 'geu.growth', status: 'success', req,
      metadata: { symbolId: user.symbolId, growthEventId, growthPeriod: cleanPeriod, openingBalance, maxPositiveGrowth, actualGrowthAmount: requested, reason },
    });

    return res.status(201).json({
      success: true,
      growthEventId,
      growthPeriod: cleanPeriod,
      openingBalance,
      maxPositiveGrowthRate: GEU_MAX_POSITIVE_GROWTH_RATE,
      maxPositiveGrowth,
      requestedGrowthAmount: requested,
      actualGrowthAmount: requested,
      closingBalance,
      reason,
      referenceId: value.transaction.referenceId,
      policyNote: 'UNRESOLVED GEU POLICY QUESTION: this endpoint currently trusts the account owner\'s own request for the actual growth amount (subject to the 0.3% ceiling) because no admin/system-authorization concept exists in this codebase yet. See AUDIT_GEU_REPORT.md.',
    });
  } catch (error) {
    console.error('GEU growth error:', error);
    return res.status(500).json({ success: false, message: 'Could not process GEU growth event.' });
  }
});

// POST /api/geu/redeem — GEU exit, same-currency or cross-border (brief
// sections 14/15/16).
app.post('/api/geu/redeem', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const { symbolId, amount, idempotencyKey } = req.body || {};
    const geuAmount = toMinorUnit(Number(amount), GEU_CURRENCY);
    const cleanIdempotencyKey = String(idempotencyKey || '').trim().slice(0, 120);

    if (!Number.isFinite(geuAmount) || geuAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid GEU amount greater than 0 is required.' });
    }
    if (!cleanIdempotencyKey) {
      return res.status(400).json({ success: false, message: 'idempotencyKey is required for a GEU redemption.' });
    }

    const user = await User.findOne({ symbolId: String(symbolId || '').trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Secure ID not found.' });

    const existingRedemption = await GeuRedemption.findOne({ userId: user._id, idempotencyKey: cleanIdempotencyKey });
    if (existingRedemption) {
      return res.status(200).json({ success: true, duplicate: true, redemption: existingRedemption });
    }

    await materialiseBalance(user);

    const destinationCurrency = await resolveOwnCurrency(user);
    if (!destinationCurrency) {
      return res.status(400).json({ success: false, message: 'GEU redemption is not supported for your country yet.' });
    }
    const referenceAmount = toMinorUnit(geuAmount, GEU_REFERENCE_CURRENCY);
    let exchangeRate = 1;
    let rateSource = 'identity';
    const rateTimestamp = new Date();
    let localCurrencyAmount = referenceAmount;
    const crossBorder = destinationCurrency !== GEU_REFERENCE_CURRENCY;

    if (crossBorder) {
      try {
        ({ rate: exchangeRate, source: rateSource } = await getRate(GEU_REFERENCE_CURRENCY, destinationCurrency));
      } catch (fxError) {
        console.error(`GEU redemption FX lookup failed for ${GEU_REFERENCE_CURRENCY}->${destinationCurrency}:`, fxError);
        return res.status(502).json({ success: false, message: 'Exchange rate is temporarily unavailable. Please try again in a moment.' });
      }
      localCurrencyAmount = toMinorUnit(referenceAmount * exchangeRate, destinationCurrency);
    }

    const redemptionId = createGeuId('GLOOBAL-GEU-REDEEM-');
    const referenceId = await resolveTransactionReference(null);

    let value;
    let atomic;
    try {
      ({ value, atomic } = await withMongoTransaction(async (session) => {
        const sessionOpt = session ? { session } : {};

        const debited = await User.findOneAndUpdate(
          { _id: user._id, geuBalance: { $gte: geuAmount } },
          { $inc: { geuBalance: -geuAmount } },
          { returnDocument: 'after', ...sessionOpt }
        );

        if (!debited) {
          const current = await User.findById(user._id).select('geuBalance').lean();
          const shortfall = new Error('Not enough GEU to redeem that much.');
          shortfall.name = 'InsufficientGeuError';
          shortfall.geuBalance = geuBalanceOf(current || {});
          throw shortfall;
        }

        let pool = null;

        if (crossBorder) {
          // Reuses the SAME model and the SAME atomic conditional-release
          // liquidity gate lib/settlementEngine.js's destination leg already
          // uses for a real cross-border payment (brief section 16) — not a
          // second reserve system, the account's own-country pool for the
          // reference-currency (INR) corridor. One-sided by construction: a
          // redemption has no "sender" whose fiat enters a mirror pool the
          // way a payment's source side does — the value already existed as
          // GEU backing (GeuSupply.capitalBackingReferenceInr) before this
          // redemption started.
          pool = await CountryCurrencyPool.loadOrCreate(accountCountryIso(user), GEU_REFERENCE_CURRENCY, destinationCurrency, session);

          // Same never-opened-versus-ran-dry distinction the payment path
          // draws. loadOrCreate seeds a NEW row, but cannot touch one that
          // already exists at zero from before it did, and the conditional
          // release below cannot tell those two cases apart.
          if (!pool.seededAt && pool.totalBalance === 0 && pool.availableBalance === 0 && (pool.reservedBalance || 0) === 0) {
            throw new UnseededCorridorPoolError({
              countryIso: pool.countryIso,
              currency: pool.localCurrency,
              counterCurrency: pool.counterCurrency,
              requested: localCurrencyAmount,
            });
          }

          const releasedPool = await CountryCurrencyPool.findOneAndUpdate(
            { _id: pool._id, availableBalance: { $gte: localCurrencyAmount } },
            { $inc: { availableBalance: -localCurrencyAmount, totalBalance: -localCurrencyAmount } },
            { returnDocument: 'after', ...sessionOpt }
          );

          if (!releasedPool) {
            // Constructed with an object, not four positional arguments.
            // The constructor destructures its single parameter, so the
            // positional form passed a string where an object was expected
            // and every field — countryIso, currency, requested, available
            // — came out undefined, including in the message this error
            // exists to produce. The released amount is denominated in the
            // pool's own local currency, which is what the payer sees.
            throw new InsufficientPoolLiquidityError({
              countryIso: pool.countryIso,
              currency: pool.localCurrency,
              requested: localCurrencyAmount,
              available: pool.availableBalance,
            });
          }
          pool = releasedPool;
        }

        const credited = await User.findOneAndUpdate(
          { _id: user._id },
          { $inc: { balance: localCurrencyAmount } },
          { returnDocument: 'after', ...sessionOpt }
        );

        await GeuSupply.findOneAndUpdate(
          { key: 'global' },
          { $inc: { destroyedFromRedemption: geuAmount, capitalBackingReferenceInr: -referenceAmount } },
          { upsert: true, ...sessionOpt }
        );

        const geuAfter = toMinorUnit(debited.geuBalance, GEU_CURRENCY);
        const balanceAfter = toMinorUnit(credited.balance, destinationCurrency);

        const [transaction] = await Transaction.create(
          [
            {
              fromUserId: user._id,
              toUserId: null,
              amount: geuAmount,
              currency: GEU_CURRENCY,
              type: 'geu_redeem',
              status: 'success',
              note: 'GEU redeemed',
              referenceId,
              metadata: { prototype: true, redemptionId, destinationCurrency, referenceAmount, localCurrencyAmount, exchangeRate, rateSource, crossBorder },
            },
          ],
          session ? { session } : {}
        );

        const [redemption] = await GeuRedemption.create(
          [
            {
              redemptionId,
              userId: user._id,
              symbolId: user.symbolId,
              geuAmountRedeemed: geuAmount,
              referenceCurrency: GEU_REFERENCE_CURRENCY,
              referenceAmount,
              destinationCurrency,
              localCurrencyAmount,
              exchangeRate,
              rateSource,
              rateTimestamp,
              poolId: pool?._id || null,
              status: 'settled',
              idempotencyKey: cleanIdempotencyKey,
              transactionId: transaction._id,
            },
          ],
          session ? { session } : {}
        );

        await LedgerEntry.create(
          [
            {
              transactionId: transaction._id,
              userId: user._id,
              entryType: 'debit',
              amount: geuAmount,
              balanceBefore: toMinorUnit(geuAfter + geuAmount, GEU_CURRENCY),
              balanceAfter: geuAfter,
              currency: GEU_CURRENCY,
              note: 'GEU redeemed',
              metadata: { prototype: true, geuLeg: 'geu', redemptionId, transactionReferenceId: transaction.referenceId },
            },
            {
              transactionId: transaction._id,
              userId: user._id,
              entryType: 'credit',
              amount: localCurrencyAmount,
              balanceBefore: toMinorUnit(balanceAfter - localCurrencyAmount, destinationCurrency),
              balanceAfter,
              currency: destinationCurrency,
              note: 'Local currency settled from GEU redemption',
              metadata: { prototype: true, geuLeg: 'capital', redemptionId, transactionReferenceId: transaction.referenceId },
            },
          ],
          session ? { session, ordered: true } : {}
        );

        return { transaction, redemption, geuAfter, balanceAfter };
      }));
    } catch (redeemError) {
      if (redeemError instanceof InsufficientPoolLiquidityError) throw redeemError;
      if (redeemError instanceof UnseededCorridorPoolError) throw redeemError;
      if (redeemError?.name === 'InsufficientGeuError') throw redeemError;

      const isRedeemCollision =
        (redeemError?.code === 11000 || redeemError?.writeErrors?.[0]?.code === 11000) &&
        /idempotencyKey/.test(String(redeemError?.message || redeemError?.writeErrors?.[0]?.errmsg || ''));

      if (isRedeemCollision) {
        const winner = await GeuRedemption.findOne({ userId: user._id, idempotencyKey: cleanIdempotencyKey });
        if (winner) return res.status(200).json({ success: true, duplicate: true, redemption: winner });
      }
      throw redeemError;
    }

    recordAudit({
      userId: user._id, action: 'geu.redeem', status: 'success', req,
      metadata: { symbolId: user.symbolId, redemptionId, geuAmount, destinationCurrency, localCurrencyAmount, exchangeRate, crossBorder },
    });

    return res.status(201).json({
      success: true,
      redemptionId,
      geuRedeemed: geuAmount,
      referenceCurrency: GEU_REFERENCE_CURRENCY,
      referenceAmount,
      destinationCurrency,
      localCurrencyAmount,
      exchangeRate,
      rateSource,
      geuBalance: value.geuAfter,
      balance: value.balanceAfter,
      referenceId: value.transaction.referenceId,
    });
  } catch (error) {
    if (error?.name === 'InsufficientGeuError') {
      return res.status(400).json({ success: false, message: error.message, geuBalance: error.geuBalance });
    }
    if (error instanceof UnseededCorridorPoolError) {
      return res.status(503).json({
        success: false,
        message: `The ${error.countryIso} redemption corridor is not open yet, so this redemption cannot be settled. Nothing has been redeemed. Please contact support — retrying will not help.`,
      });
    }
    if (error instanceof InsufficientPoolLiquidityError) {
      return res.status(503).json({
        success: false,
        message: `This redemption corridor (${error.countryIso}/${error.currency}) doesn't have enough settlement liquidity right now. Please try again later.`,
      });
    }
    console.error('GEU redeem error:', error);
    return res.status(500).json({ success: false, message: 'Could not process GEU redemption.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
