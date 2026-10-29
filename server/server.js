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
const Referral = require('./models/Referral');
const Interest = require('./models/Interest');
const Product = require('./models/Product');
const ProductService = require('./models/ProductService');
const AssetSeed = require('./models/AssetSeed');
// Where a Creator Share waits between being earned and being claimed, and
// the account lib/disbursement.js pays Gloobal's own money out of. Two
// purposes, one model — see its header for why holding a user's money and
// spending Gloobal's must not share a row.
const PlatformAccount = require('./models/PlatformAccount');
// Read back on a duplicate response, so a retry describes the whole payment
// rather than half of it — see storedPaymentArtifacts.
const Receipt = require('./models/Receipt');
const Settlement = require('./models/Settlement');
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
const { getRate } = require('./lib/fxRates');
const bazaar = require('./lib/bazaar');
const reservedBrands = require('./lib/reservedBrands');
const searchKey = require('./lib/searchKey');
const openHours = require('./lib/openHours');
const { loadCurrencyDecimals, decimalsFor } = require('./lib/currencyDecimals');
// A coin movement, normalised. Required up here rather than down in the
// Gloobal Coin section because THREE routes need it and the earliest of them
// — /api/transactions/:symbolId — sits a few hundred lines above that
// section. See lib/coinHistoryRow.js for what the other two were getting
// wrong without it.
const {
  isCoinTransaction,
  coinPaymentDirectionFor,
  coinHistoryRow,
  resolveCoinCounterparties,
  coinCounterpartyOf,
} = require('./lib/coinHistoryRow');
// What a payment banner says and what it is drawn with, so a push and the
// card in the app are the same notification rather than two about one
// payment. See that file's header for why the wording is duplicated here
// instead of imported from the frontend.
const { paymentBannerText, shareBannerText, notifDiscIcon } = require('./lib/notificationText');

// Audit fix: AuditLog was fully defined (schema, indexes) but never written
// to anywhere in this file — every route that could meaningfully report a
// security- or money-relevant event had nowhere to record it. This wires it
// in without touching any economic logic: it is purely an observability
// side-channel. Fire-and-forget by design — an audit write must never be
// able to fail, slow down, or change the outcome of the request it's
// describing. Call sites choose what to log; this only guarantees that
// logging itself is safe to call inline.
//
// Audit fix (GLB-24): the implementation used to live here as a one-liner
// whose `.catch` only covered ASYNCHRONOUS failure, so a synchronous throw
// from AuditLog.create — a metadata value Mongoose rejects while casting,
// say — escaped into the calling route and, at the call sites inside the
// money-moving Mongo transaction, would have aborted the payment it was
// merely describing. It also counted nothing, so audit logging could be
// broken indefinitely without anything noticing. Both are fixed in
// lib/auditTrail.js, which is where this now lives so it can be tested
// directly rather than only through a live HTTP request.
const { createAuditRecorder } = require('./lib/auditTrail');
// auditHealth() is the counter side of that fix — kept on the recorder rather
// than exposed as a route, since it names no account and nothing in the app
// consumes it yet. tests/audit-trail.test.mjs asserts against it directly.
const { recordAudit } = createAuditRecorder(AuditLog);


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

// Every figure on the Gloobal Coverage screen, computed in one place.
// Coverage previously had no backend at all and reduced its numbers in the
// browser from the current account's own last-100 payments; see that
// module's header for the seven defects that produced and how each maps to
// the founder's definitions.
const {
  buildCoverage,
  resolveAccountCountries,
  tallyUsersByCountry,
} = require('./lib/coverageAggregation');

// Hooman Projects. The Coverage screen's project area had no persistence of
// any kind before these — see models/Project.js for what a project is and
// models/ProjectAttachment.js for why its file lives in MongoDB.
const Project = require('./models/Project');
const ProjectAttachment = require('./models/ProjectAttachment');
// What people have given to a project. NOT a money record — an attribution
// of a payment that already happened through /api/transactions/send. The
// whole reasoning is in models/Contribution.js and is worth reading before
// touching either of the two routes near the end of the project block.
const Contribution = require('./models/Contribution');

// Profile photos (one server-side copy per account, never stamped onto a
// payment — see models/ProfilePhoto.js) and the in-app payment notifications
// POST /api/transactions/send writes once a transfer has committed.
const ProfilePhoto = require('./models/ProfilePhoto');
// The Creator side's own mark. A different picture of a different thing
// from the profile photo above — see models/CreatorLogo.js.
const CreatorLogo = require('./models/CreatorLogo');
const CreatorItem = require('./models/CreatorItem');
const CreatorSupplier = require('./models/CreatorSupplier');
const CreatorPurchase = require('./models/CreatorPurchase');
const CreatorCover = require('./models/CreatorCover');
const CreatorReview = require('./models/CreatorReview');
const CreatorStat = require('./models/CreatorStat');
const Notification = require('./models/Notification');
// Web Push. The model holds one row per subscribed browser; the service is the
// only thing that talks to a push service and is inert when VAPID is unset.
const PushSubscription = require('./models/PushSubscription');
const pushService = require('./services/pushService');
const HoomanAnswer = require('./models/HoomanAnswer');
const HoomanProfile = require('./models/HoomanProfile');
// My Choices — the labels an account puts on its own payments. The model
// holds the label and nothing financial; every figure the category screens
// show is aggregated from transactions that carry its id. See
// models/Category.js for why no total is cached on the row.
const Category = require('./models/Category');
// One account's label on one payment. A separate model from Transaction on
// purpose — a payment has two parties and each may file it differently, and
// a label must never be written inside the atomic money path. Its header
// has the full argument.
const TransactionTag = require('./models/TransactionTag');
const CategoryLink = require('./models/CategoryLink');
const Complaint = require('./models/Complaint');
// A picture chosen instead of an icon, for one category. Its own
// collection for the same reason ProfilePhoto is: the category list is a
// constant read and an image on every row would cost all of it.
const CategoryPhoto = require('./models/CategoryPhoto');
const {
  DEFAULT_CATEGORIES,
  ESSENTIALS_SYSTEM_KEY,
  ESSENTIALS_DEFAULT_CATEGORY,
  validateCategoryInput,
  publicCategory,
  categoryNameNormalised,
  categoryNameLength,
  CATEGORY_NAME_MAX_LENGTH,
} = require('./lib/categoryValidation');
const {
  HOOMAN_WINDOW_DAYS,
  pillarLocks: hoomanPillarLocks,
  publicQuestion: hoomanPublicQuestion,
  evaluateHoomanAnswer,
  computeHoomanScore,
} = require('./lib/hoomanScore');
const HOOMAN_QUESTION_BANK = require('./data/hoomanQuestionBank.json');
const {
  PROJECT_CATEGORIES,
  PROJECT_ATTACHMENT_MAX_BYTES,
  PROJECT_ATTACHMENT_TYPES,
  validateProjectInput,
  sanitiseFilename,
} = require('./lib/projectValidation');

// One answer to "what currency does this country transact in", shared with
// lib/settlementEngine.js. Prefers the seeded Country row and falls back to
// the bundled country/currency map, so a database whose reference tables were
// never seeded resolves real currencies instead of defaulting everything to
// rupees — see that module's header for what that default was actually doing
// in production.
const { resolveCountry, localCurrencyFor } = require('./lib/countryCurrency');

// An account's own currency: the tender of the country it belongs to.
//
// ── Why this is back, and why it is up here now ─────────────────────────
//
// It used to be declared at the bottom of the GEU growth prototype, and was
// deleted along with it. That removed the definition out from under
// POST /api/assets/claim-interest — a route that survives the removal and
// calls this on every claim.
//
// Nothing caught it at build time, and nothing could have: function
// declarations hoist, so the call site compiled exactly as before. The gap
// only existed at request time, where it surfaced as
//
//   ReferenceError: resolveOwnCurrency is not defined
//
// a 500 to the caller, and a claim that paid nothing while reporting
// undefined. It is declared beside the module it delegates to now, so the
// next deletion somewhere else in this file cannot take it along.
//
// ── Why it returns null rather than a fallback ──────────────────────────
//
// Never guess a currency for a payout. The empty Country collection on the
// live database already taught this once: every account's "own currency"
// came back as rupees, and a conversion that should have used a real rate
// matched the reference exactly instead. A genuinely unsupported country
// returns null and the caller refuses the payout — which is what
// claim-interest's own comment says it does.
//
// The shape is checked rather than the truthiness. An ISO 4217 code is three
// capital letters; an object, a promise, an empty string and "inr" are all
// things that pass `if (value)` and none of them is a currency.
async function resolveOwnCurrency(user) {
  const code = await localCurrencyFor(accountCountryIso(user));
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : null;
}

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

// Real registered-user count per country.
//
// This used to group on the raw `$countryIso` field in Mongo. That was the
// reason active American users were invisible on the Coverage screen: the
// field defaults to 'IN' (models/User.js) and the registration screen did
// not send a country until recently, so every account created before that
// fix is STORED as India no matter where its owner actually is. The count
// was real; it was filed under the wrong country.
//
// accountCountryIso (lib/accountCountry.js) is the resolver that already
// solves this everywhere it matters — the send route, /api/users/resolve
// and the settlement engine all go through it — and it was the one thing
// the country statistics did not use. It treats a bare stored 'IN' as
// "never recorded" and reads the country off the account's E.164 mobile
// number instead, while any other stored value is a real choice and is
// returned untouched.
//
// The grouping therefore moves out of Mongo and into JS, because the rule
// is a dial-code prefix match against a 194-row table that an aggregation
// pipeline cannot express. That trades a pipeline for one projection of
// (countryIso, mobileNumber) per account — acceptable at this system's
// size, and it stops mattering entirely once
// scripts/backfill-country-iso.mjs has run and the stored field is already
// correct. The values still sum to exactly User.countDocuments(), which is
// the property /api/stats depends on.
async function countUsersByCountry() {
  const accountCountries = await resolveAccountCountries();
  return tallyUsersByCountry(accountCountries);
}

const app = express();

// Middleware
//
// A body cap, because express.json() defaults to 100kb and nothing this API
// accepts is anywhere near that — the largest legitimate payload is a face
// descriptor. It bounds what a single request can make the process allocate.
//
// One exception, skipped here rather than raised globally: the profile photo
// upload (PUT /api/profile/:symbolId/photo) carries up to 200 KB of image as
// base64, and parses its own body with its own 300kb cap. It has to be
// skipped rather than simply given a bigger parser on the route, because a
// global parser runs first — it would refuse the upload with 413 before the
// route's parser ever saw it. Skipping also means the photo body is only read
// AFTER requireAuth/requireSelf, so a stranger cannot make the process
// allocate 300 KB at all.
const PROFILE_PHOTO_UPLOAD_PATH = /^\/api\/profile\/[^/]+\/photo\/?$/i;
// POST /api/projects/:id/attachment, which declares its own 3 MB parser for
// the same reason the photo route does.
//
// It had to be added here, and its absence is audit finding F6. A route can
// mount its own body parser, but it cannot mount one EARLIER than this — so
// the 64 KB limit ran first and rejected the request before the 3 MB parser
// was ever reached. Base64 inflates by 4/3, which put the real ceiling at
// about 48 KB against a frontend that offers 2 MB: the feature looked
// implemented, was tested in isolation, and failed for every file anybody
// would actually attach.
//
// The GLOBAL limit is unchanged at 64 KB and must stay there. This is a hole
// cut for one route that asked for one, not a raised ceiling: every other
// path on this API still gets 64 KB, which is what stops an unauthenticated
// caller making the process allocate megabytes.
const PROJECT_ATTACHMENT_PATH = /^\/api\/projects\/[^/]+\/attachment\/?$/i;
// PUT /api/creator/:symbolId/items carries a shop's pictures — up to four
// per thing, each under 200 KB — and declares its own parser for the same
// reason. It did not, and that is the founder's "could not save" on every
// item with a photo: a single picture is three times this cap, so the
// global parser refused the body here before the route ever saw it
// (PayloadTooLargeError at this line, in the Render logs).
const CREATOR_ITEMS_PATH = /^\/api\/creator\/[^/]+\/items\/?$/i;
const globalJsonParser = express.json({ limit: '64kb' });
app.use((req, res, next) => {
  if (req.method === 'PUT' && PROFILE_PHOTO_UPLOAD_PATH.test(req.path)) return next();
  if (req.method === 'PUT' && CREATOR_ITEMS_PATH.test(req.path)) return next();
  // POST only: the GET on the same path returns the bytes and carries no
  // body, so it has nothing to parse and no reason to skip anything.
  if (req.method === 'POST' && PROJECT_ATTACHMENT_PATH.test(req.path)) return next();
  return globalJsonParser(req, res, next);
});

// CORS was `cors()` with no argument, which answers every origin with
// `Access-Control-Allow-Origin: *`. That let any page on the internet call this
// API from a visitor's browser. Now an allowlist: the deployed frontends, plus
// localhost for development.
//
// Requests with no Origin at all (curl, server-to-server, the health checker)
// are allowed through — CORS is a browser mechanism and refusing them would
// break non-browser callers without stopping anything, since a program that
// sets no Origin was never subject to it in the first place.
// ── THE SLIDING SESSION ─────────────────────────────────────────────────
//
// Declared up here because the CORS block below needs it and that block
// runs at module load, long before the auth section further down.
//
// A bearer token lasts seven days from the credential that minted it, and
// nothing used to extend it: the only routes that issue one are login,
// registration, PIN change, PIN reset, passkey and PIN verify. So somebody
// who used the app every single day was signed out on the eighth, with no
// warning and nothing they could have done differently.
//
// requireAuth now hands back a fresh token, in this header, once the one
// it was given is more than halfway through its life. The client stores it
// and the window slides. What that preserves is the property worth having:
// seven days of INACTIVITY still ends a session, so a phone left in a
// drawer expires exactly as before.
//
// A header rather than the body, because this has to apply to every
// authenticated route at once and not one of them has a response shape
// with room for it.
const AUTH_TOKEN_REFRESH_HEADER = 'X-Gloobal-Token';

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
    // Without this the browser receives the refreshed token and refuses to
    // let the page read it. A cross-origin response's headers are hidden
    // from script unless they are named here, and the frontend is served
    // from Netlify while this API is on Render — every request the app
    // makes is cross-origin. Omit it and the sliding session silently does
    // nothing, which is the failure this whole change exists to end.
    exposedHeaders: [AUTH_TOKEN_REFRESH_HEADER],
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
  // Audit fix (GLB-21). This API serves JSON and nothing else — no HTML, no
  // script, no stylesheet, no image. `default-src 'none'` says exactly that,
  // so any response that somehow ends up being rendered as a document (a
  // reflected error page, a content-type confusion) can load nothing and run
  // nothing. `frame-ancestors 'none'` is the modern spelling of the
  // X-Frame-Options line above; both are sent because older browsers only
  // honour the older header.
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  // Nothing here needs a camera, a microphone or a location, and the browser
  // should refuse on this origin's behalf rather than trust that no future
  // response asks.
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  // Only on a real deploy. Sending HSTS from a local http:// server would
  // pin the developer's browser to https for localhost, which breaks the
  // next person to run this on port 5000.
  if (IS_PRODUCTION_DEPLOY) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
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

// Hides the subscriber digits of a number belonging to somebody OTHER than
// the caller (audit finding GLB-17 — see cleanResolvedTransactionUserPayload).
//
// Keeps the calling code and the last two digits: enough for a payer to
// recognise the person they meant to pay, not enough to be a phone number.
// Anything too short to mask meaningfully is dropped entirely rather than
// returned with a token mask over it.
const maskMobileNumberForLookup = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = /^(\+\d{1,4})(\d+)$/.exec(raw.replace(/[\s\-()]/g, ''));
  if (!match) return '';

  const [, dialCode, national] = match;
  if (national.length < 4) return '';

  return `${dialCode}${'•'.repeat(Math.max(2, national.length - 2))}${national.slice(-2)}`;
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

// ─── The short referral code ────────────────────────────────────────────────
//
// What it is for, precisely: a shared invite link used to carry the account's
// Gloobal ID in its path. The ID is twelve symbols from the dial-pad alphabet
// and every one of them is multi-byte UTF-8, so the link people were actually
// pasting into WhatsApp looked like this:
//
//   https://gloobal-pay.onrender.com/r/%E2%96%A0%E2%96%A0%E2%96%A0%E2%96%A1…
//
// 108 characters of percent-encoding for twelve characters of ID. This is the
// short handle that replaces it in the URL, and only in the URL.
//
// The alphabet is Crockford-style: digits and uppercase letters with I, L, O
// and U removed. I/1 and O/0 are the pairs people mis-transcribe when reading
// a code aloud or off a screen, and U is dropped because excluding it is what
// keeps an accidental obscenity out of a random string. Case is not
// meaningful — lookup upper-cases first — so a link retyped in lower case
// still resolves.
const REFERRAL_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Ten characters of a 32-symbol alphabet is 32^10, about 1.1 x 10^15. At the
// scale this system will plausibly reach, the chance of any collision at all
// stays negligible — and a collision is not trusted to be impossible anyway:
// the unique index refuses the write and ensureReferralCode simply tries again.
const REFERRAL_CODE_LENGTH = 10;

// crypto.randomInt, not Math.random. The requirement is that a code is not
// guessable from another code — someone holding their own invite link must
// not be able to walk to anybody else's — and that rules out both a sequence
// and a seeded PRNG.
const createReferralCode = () => {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_CODE_ALPHABET[crypto.randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
};

const REFERRAL_CODE_PATTERN = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

// Gives an account its code if it does not have one, and returns it.
//
// Minted LAZILY rather than by a migration, because every account that
// existed before this field must get one and there is no deploy step in this
// project that would run a backfill. Every route that hands back a user goes
// through publicUserPayload, so an account acquires its code the first time
// its owner signs in or loads their profile, once, and never again.
//
// Written with a filter that requires the code still to be absent, so two
// concurrent requests for the same fresh account cannot both mint: the loser
// matches nothing, re-reads, and adopts the winner's code. A duplicate-key
// error means the random value collided with another account's — vanishingly
// rare, and answered by trying a different one rather than by failing the
// request that happened to be passing through.
//
// Never throws. A code that cannot be minted right now means the invite link
// falls back to the long form for this one response, which is the behaviour
// that shipped before this existed — not an error worth failing a login over.
const ensureReferralCode = async (user) => {
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = createReferralCode();

    try {
      const claimed = await User.findOneAndUpdate(
        { _id: user._id, $or: [{ referralCode: null }, { referralCode: { $exists: false } }] },
        { $set: { referralCode: candidate } },
        { returnDocument: 'after' }
      );

      if (claimed) {
        // Keep the in-memory document in step, so a caller that goes on to
        // read user.referralCode sees what was just stored.
        user.referralCode = claimed.referralCode;
        return claimed.referralCode;
      }

      // No match: another request minted one first. Adopt theirs.
      const current = await User.findById(user._id).select('referralCode').lean();
      if (current?.referralCode) {
        user.referralCode = current.referralCode;
        return current.referralCode;
      }
      return null;
    } catch (error) {
      // 11000 is the unique index refusing a collision — try another value.
      // Anything else is not something a different random string would fix.
      if (error?.code !== 11000) {
        console.error('Referral code mint failed:', error);
        return null;
      }
    }
  }

  console.error(`Referral code mint gave up after 5 collisions for ${user.symbolId}`);
  return null;
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
    // The Security screen's switches. Read back here rather than from a
    // route of their own so the client learns them from the same response it
    // already uses to learn everything else about the account — a separate
    // fetch is a separate chance for the screen to render the wrong state.
    // Defaults spelled out for accounts written before the field existed,
    // where the subdocument is simply absent.
    securitySettings: {
      biometricLogin: user.securitySettings?.biometricLogin !== false,
      appLock: user.securitySettings?.appLock === true,
    },
    referredBy: user.referredBy || null,
    referralCount: user.referralCount || 0,
    // The short handle the invite link uses in place of this account's
    // Gloobal ID. Carried on every response that already carries a user, so
    // the client never needs a fetch of its own to build a share link — and
    // so an account that predates the field acquires one simply by signing
    // in. Null only when minting failed, which the client treats as "fall
    // back to the long link" rather than as an error.
    referralCode: await ensureReferralCode(user),
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

  // Token revocation, for the one case that needs it: a credential change.
  //
  // These tokens are stateless HMACs with a seven-day TTL and there is no
  // token store, so nothing could previously end a session early. That made
  // "change your PIN" a change that left every other signed-in device
  // untouched — which is precisely what somebody changing a PIN because it
  // may be known is trying to prevent.
  //
  // Comparing the token's own `iat` against a per-account stamp is the whole
  // mechanism. It costs no extra lookup (this function already has the User
  // document), it is inert for every account that has never changed a
  // credential (the stamp is null), and it revokes one account's sessions
  // rather than everyone's.
  //
  // Strictly-less-than matters: /api/pin/change stamps the account and then
  // immediately mints a replacement token, and those two can land in the
  // same millisecond. `<` keeps that fresh token valid; `<=` would sign the
  // person out of the device they just used to change their PIN.
  if (user.credentialsInvalidatedAt && typeof claims.iat === 'number') {
    if (claims.iat < new Date(user.credentialsInvalidatedAt).getTime()) return null;
  }

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
      // Names the reason for the 401, because status alone cannot carry it.
      // POST /api/pin/verify, /api/pin/change and /api/login all answer 401
      // for a wrong PIN in the BODY while the bearer token in the header is
      // perfectly good, and the client could not tell the two apart: it
      // dropped the token on every 401 and signed people out for a typo.
      // This code is the only 401 that means "the token itself is no use" —
      // see the credentialCheck branch in backend/services/api/httpClient.js.
      code: 'auth_token_invalid',
      message: 'Sign in to continue.'
    });
  }

  req.authUser = user;
  maybeRefreshAuthToken(req, res, user);
  next();
};

// Hand back a fresh token once the one in hand is past half its life.
//
// HALF, not "every request": re-minting on all of them would write to
// localStorage on every tap for no gain, and would mean a token's lifetime
// could never be reasoned about from the token itself. Half a window is
// the standard point — it guarantees that anybody active at any time in
// the last 3.5 days carries a token good for at least another 3.5.
//
// Deliberately NOT a route, and deliberately not an error. A refresh
// endpoint is one more thing to call, one more thing to forget to call,
// and one more 401 to mishandle; this rides on requests the app is
// already making. If the header never reaches the client — CORS
// misconfigured, an old build, a proxy stripping it — nothing breaks:
// the session simply expires at seven days as it always did.
//
// The claims are re-read rather than threaded out of authenticatedUser,
// which several routes call directly for their own reasons. One HMAC on a
// request that has already done one is not worth widening that signature
// for.
const maybeRefreshAuthToken = (req, res, user) => {
  try {
    const claims = readAuthToken(bearerFrom(req));
    if (!claims || typeof claims.exp !== 'number') return;
    if (claims.exp - Date.now() > AUTH_TOKEN_TTL_MS / 2) return;
    res.set(AUTH_TOKEN_REFRESH_HEADER, issueAuthToken(user));
  } catch (error) {
    // A session that could not be extended is a session that still works
    // for as long as it had left. Never fail a request over this.
    console.error('Token refresh error:', error);
  }
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

// ── What this limiter is, precisely (audit finding GLB-16) ──────────────────
//
// PROCESS-LOCAL AND VOLATILE. Every counter below lives in this Node process
// and nowhere else. That means, concretely:
//
//   - Two instances = two independent budgets, so the effective limit is
//     `max` x instance count. This API runs as ONE Render instance today,
//     which is the only reason the numbers below mean what they say.
//   - A restart forgets every counter. On Render's free tier the service
//     sleeps when idle, so an attacker who can trigger a cold start — or
//     simply wait one out — gets a fresh budget. This is not a theoretical
//     gap; it is the normal operating pattern of this deployment.
//
// So this raises the cost of guessing and scraping. It is NOT a security
// boundary, and nothing else in this file may be designed on the assumption
// that it is. The per-account five-strike PIN lockout is the control that
// actually bounds credential guessing, because it lives in Mongo and no
// amount of IP rotation or process churn gets around it.
//
// Replacing this with a shared store (Redis, or a Mongo-backed counter) is
// the real fix and is deliberately NOT done here: it introduces an
// infrastructure dependency, which is a larger change than this pass is for.
const rateBuckets = new Map();

// A hard ceiling on how many distinct buckets may be held at once.
//
// The sweep below runs once a minute, which bounds memory in the ordinary
// case — but "ordinary" is doing a lot of work there. Every distinct client
// key creates an entry, the key is derived from a header an attacker
// partially controls, and a flood can mint far more entries in sixty seconds
// than the sweep will remove in one pass. Unbounded Map growth in the
// request path is a memory-exhaustion vector in a process with a 512MB free
// tier behind it, so the ceiling is enforced at insertion time rather than
// left to the timer.
const RATE_BUCKET_MAX = 20000;

// Removes every bucket whose window has already closed. Returns how many are
// left, so the caller can decide whether a sweep was enough.
const sweepExpiredRateBuckets = (now = Date.now()) => {
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  return rateBuckets.size;
};

// Trusting an arbitrary X-Forwarded-For would let a caller rotate their own
// limit key by lying, so only the first hop — the one Render itself sets — is
// read, and it is not trusted for anything but bucketing.
const clientKey = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
};

setInterval(() => sweepExpiredRateBuckets(), 60 * 1000).unref();

const rateLimit = ({ name, max, windowMs, keyOf }) => (req, res, next) => {
  const scope = keyOf ? keyOf(req) : '';
  const key = `${name}:${clientKey(req)}:${scope}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Enforced here, not only on the timer: a flood mints new keys far
    // faster than a once-a-minute sweep retires them.
    if (rateBuckets.size >= RATE_BUCKET_MAX && sweepExpiredRateBuckets(now) >= RATE_BUCKET_MAX) {
      // Still over the ceiling with nothing expired to drop. Evict the
      // entries closest to expiring anyway — they are the ones with the
      // least budget left to protect, so dropping them costs the least. A
      // Map iterates in insertion order and every window is the same
      // length per limiter, so the oldest inserted are also the soonest to
      // reset; taking them from the front is that order, without a sort.
      const evictions = Math.max(1, Math.ceil(RATE_BUCKET_MAX * 0.1));
      let dropped = 0;
      for (const staleKey of rateBuckets.keys()) {
        rateBuckets.delete(staleKey);
        if (++dropped >= evictions) break;
      }
      console.warn(
        `[ratelimit] bucket ceiling (${RATE_BUCKET_MAX}) reached — evicted ${dropped} of the ` +
        'soonest-to-expire counters. Limits are still applied, but a flood is in progress.'
      );
    }

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

// ── PIN attempt accounting (audit finding GLB-14) ───────────────────────────
//
// The rule is meant to be: five wrong PINs in a row locks the account for ten
// minutes, then you get another five. What was actually implemented locked it
// forever.
//
// Four routes (/api/login, /api/pin/verify, /api/transactions/send and
// one for coin, now deleted with the coin write paths) each carried their
// own copy of:
//
//     if (lockedUntil && lockedUntil > now) -> 423
//     ... on mismatch: failedAttempts += 1; if (failedAttempts >= 5) lock
//
// Nothing ever reset failedAttempts when a lockout EXPIRED — only a
// successful PIN did. So once the counter reached 5, it stayed at or above 5
// for as long as the PIN was never entered correctly. Ten minutes later the
// lock had lapsed, the next attempt was allowed through, and a single wrong
// digit took the counter to 6, which is still `>= 5`, so it re-locked for
// another ten minutes. One mistyped PIN per window, indefinitely: a short
// burst of wrong guesses became a permanent lockout, and the only escape was
// the OTP-backed PIN reset.
//
// The fix is to treat an elapsed lockout as the end of that attempt run,
// which is what "five attempts, then a cool-off, then five more" always
// meant. Nothing is weakened: the same five strikes still cost the same ten
// minutes, and a caller who keeps guessing still spends ten minutes per five
// guesses — a rate that makes brute force useless while letting a real person
// who fat-fingered their PIN back in.
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 10 * 60 * 1000;

// Milliseconds left on an active lockout, or 0 if there is none.
const pinLockRemainingMs = (pinRecord) => {
  const until = pinRecord?.lockedUntil ? new Date(pinRecord.lockedUntil).getTime() : 0;
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
};

// Opens a fresh attempt run if the previous lockout has elapsed.
//
// Called before the bcrypt compare on every PIN-checking route. Mutates the
// in-memory record only — the reset is persisted by whichever of the two
// outcomes below follows, so a read that leads nowhere writes nothing.
const beginPinAttempt = (pinRecord) => {
  if (pinRecord.lockedUntil && pinLockRemainingMs(pinRecord) === 0) {
    pinRecord.lockedUntil = null;
    pinRecord.failedAttempts = 0;
  }
  return pinRecord;
};

// The 423 body every locked-out route answers with. One shape, one wording,
// and — unlike the four hand-written copies it replaces — it actually tells
// the person how long to wait instead of "please try again later".
const pinLockoutResponse = (pinRecord) => {
  const retryAfterSeconds = Math.ceil(pinLockRemainingMs(pinRecord) / 1000);
  const minutes = Math.ceil(retryAfterSeconds / 60);

  return {
    status: 423,
    retryAfterSeconds,
    lockedUntil: pinRecord.lockedUntil,
    message:
      `Too many incorrect PIN attempts. This account is locked for ` +
      `${minutes} more minute${minutes === 1 ? '' : 's'}. ` +
      `You can reset your PIN with a verified OTP instead of waiting.`,
  };
};

// Records one wrong PIN and locks the account if that was the fifth in this
// run. Persists, and returns what the caller should tell the person.
const registerPinFailure = async (pinRecord) => {
  pinRecord.failedAttempts = (pinRecord.failedAttempts || 0) + 1;

  const lockedNow = pinRecord.failedAttempts >= PIN_MAX_ATTEMPTS;
  if (lockedNow) {
    pinRecord.lockedUntil = new Date(Date.now() + PIN_LOCKOUT_MS);
  }

  await pinRecord.save();

  const attemptsRemaining = Math.max(0, PIN_MAX_ATTEMPTS - pinRecord.failedAttempts);

  return {
    lockedNow,
    attemptsRemaining,
    retryAfterSeconds: lockedNow ? Math.ceil(PIN_LOCKOUT_MS / 1000) : 0,
    // The count is stated because a silent "Invalid PIN." five times over is
    // how somebody walks into a lockout without ever being warned.
    message: lockedNow
      ? `Invalid PIN. That was ${PIN_MAX_ATTEMPTS} incorrect attempts, so this account is ` +
        `locked for ${Math.round(PIN_LOCKOUT_MS / 60000)} minutes.`
      : `Invalid PIN. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} left ` +
        `before this account is locked for ${Math.round(PIN_LOCKOUT_MS / 60000)} minutes.`,
  };
};

// Clears the attempt run after a correct PIN.
const registerPinSuccess = async (pinRecord) => {
  pinRecord.failedAttempts = 0;
  pinRecord.lockedUntil = null;
  pinRecord.lastVerifiedAt = new Date();
  await pinRecord.save();
};


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

    // Audit fix (GLB-20): the OTP was looked up and honoured, then left
    // unconsumed. Every other route that spends an OTP marks it —
    // /api/register-symbol and /api/pin/reset both call consumeOtp — and this
    // one did not, so a single verified registration OTP stayed good for
    // repeated PIN sets until its ten-minute window closed. Same account
    // either way, so the blast radius was small, but "one code, one use" is
    // the property an OTP has or does not have; it cannot be mostly true.
    //
    // Only on the OTP path. A caller who proved themselves with a session
    // token never looked at an OTP and has nothing to consume.
    if (registrationOtp) await consumeOtp(registrationOtp);

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

    beginPinAttempt(pinRecord);

    if (pinLockRemainingMs(pinRecord) > 0) {
      const locked = pinLockoutResponse(pinRecord);
      res.set('Retry-After', String(locked.retryAfterSeconds));
      return res.status(locked.status).json({
        verified: false,
        message: locked.message,
        retryAfterSeconds: locked.retryAfterSeconds,
        lockedUntil: locked.lockedUntil
      });
    }

    const isMatch = await bcrypt.compare(cleanPin, pinRecord.pinHash);

    if (!isMatch) {
      const failure = await registerPinFailure(pinRecord);

      if (failure.lockedNow) res.set('Retry-After', String(failure.retryAfterSeconds));

      return res.status(401).json({
        verified: false,
        message: failure.message,
        attemptsRemaining: failure.attemptsRemaining,
        lockedUntil: pinRecord.lockedUntil
      });
    }

    await registerPinSuccess(pinRecord);

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
// POST /api/pin/change — the Security screen's "Change PIN".
//
// Distinct from /api/pin/reset, and deliberately not a wrapper around it.
// Reset is account RECOVERY: it is unauthenticated, proves nothing about
// who is holding the phone beyond an OTP to the account's number, and
// exists for somebody who has forgotten their PIN. This is a change made by
// somebody already signed in, and the thing it has to prove is different —
// that whoever is holding this unlocked session also knows the CURRENT PIN.
// Wiring the Security button to the reset route would have meant an
// unlocked phone could set a new PIN with an SMS code instead of the PIN it
// is replacing.
//
// So: a valid token for this account, AND the current PIN, AND the same
// lockout rules every other PIN check obeys — a wrong current PIN here
// counts against the same attempt budget as a wrong PIN at login, because
// otherwise this route is an oracle for guessing it without the lockout.
app.post(
  '/api/pin/change',
  credentialLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const currentPin = String(req.body?.currentPin || '').trim();
      const newPin = String(req.body?.newPin || '').trim();

      if (!currentPin || !newPin) {
        return res.status(400).json({
          success: false,
          message: 'Your current PIN and a new PIN are both required.',
        });
      }

      if (!isValidPinFormat(newPin)) {
        return res.status(400).json({ success: false, message: 'PIN must be 4 to 6 digits.' });
      }

      if (currentPin === newPin) {
        return res.status(400).json({
          success: false,
          message: 'The new PIN must be different from your current one.',
        });
      }

      const user = req.authUser;
      const pinRecord = await Pin.findOne({ userId: user._id });

      // No PIN on file is not a case to be helpful about. Setting one here
      // would let a session that never had a PIN create one without proving
      // anything — /api/pin/set is the route for that, and it is OTP-gated.
      if (!pinRecord) {
        return res.status(404).json({ success: false, message: 'PIN is not set for this account.' });
      }

      beginPinAttempt(pinRecord);

      if (pinLockRemainingMs(pinRecord) > 0) {
        const locked = pinLockoutResponse(pinRecord);
        res.set('Retry-After', String(locked.retryAfterSeconds));
        return res.status(locked.status).json({
          success: false,
          message: locked.message,
          retryAfterSeconds: locked.retryAfterSeconds,
          lockedUntil: locked.lockedUntil,
        });
      }

      const isMatch = await bcrypt.compare(currentPin, pinRecord.pinHash);

      if (!isMatch) {
        const failure = await registerPinFailure(pinRecord);
        if (failure.lockedNow) res.set('Retry-After', String(failure.retryAfterSeconds));
        recordAudit({
          userId: user._id, action: 'pin.change.failed', status: 'failed',
          message: 'Wrong current PIN', req, metadata: { symbolId: user.symbolId },
        });
        return res.status(401).json({
          success: false,
          message: failure.message,
          attemptsRemaining: failure.attemptsRemaining,
          lockedUntil: pinRecord.lockedUntil,
        });
      }

      await registerPinSuccess(pinRecord);

      const pinHash = await bcrypt.hash(newPin, 10);
      await Pin.findOneAndUpdate(
        { userId: user._id },
        {
          pinHash,
          // The old PIN was correct, so the attempt budget resets — the same
          // thing registerPinSuccess just did, restated here because this
          // write would otherwise carry the pre-success document forward.
          failedAttempts: 0,
          lockedUntil: null,
          lastVerifiedAt: null,
          changedAt: new Date(),
        },
        { returnDocument: 'after' }
      );

      // Every OTHER session for this account stops here. See
      // credentialsInvalidatedAt in models/User.js and the check in
      // authenticatedUser: a PIN change that leaves the old sessions signed
      // in is not much of a PIN change.
      //
      // Stamped BEFORE the replacement token is minted, so the new token's
      // iat cannot be older than the stamp.
      const invalidatedAt = new Date();
      await User.updateOne({ _id: user._id }, { $set: { credentialsInvalidatedAt: invalidatedAt } });

      recordAudit({
        userId: user._id, action: 'pin.change', status: 'success',
        message: 'PIN changed; other sessions revoked', req,
        metadata: { symbolId: user.symbolId },
      });

      const refreshed = await User.findById(user._id);

      return res.status(200).json({
        success: true,
        message: 'PIN changed. You have been signed out on your other devices.',
        // The caller just proved both a session AND the current PIN, so they
        // keep working rather than being bounced to the login screen by the
        // revocation they themselves triggered.
        token: issueAuthToken(refreshed),
        user: await publicUserPayload(refreshed),
      });
    } catch (error) {
      console.error('PIN change error:', error);
      return res.status(500).json({ success: false, message: 'Server error while changing your PIN.' });
    }
  }
);

// PATCH /api/profile/security/:symbolId — the Security screen's switches.
//
// Stored on the account rather than in browser storage: the setting should
// be the same wherever somebody signs in, and it should not be flippable by
// anything that can write to localStorage. Both are read back through
// publicUserPayload, so every response that already carries a user carries
// these too and the client never needs a separate fetch to know them.
app.patch(
  '/api/profile/security/:symbolId',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const update = {};

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'biometricLogin')) {
        if (typeof req.body.biometricLogin !== 'boolean') {
          return res.status(400).json({ success: false, message: 'biometricLogin must be true or false.' });
        }
        update['securitySettings.biometricLogin'] = req.body.biometricLogin;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'appLock')) {
        if (typeof req.body.appLock !== 'boolean') {
          return res.status(400).json({ success: false, message: 'appLock must be true or false.' });
        }
        update['securitySettings.appLock'] = req.body.appLock;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ success: false, message: 'Nothing to update.' });
      }

      const updated = await User.findOneAndUpdate(
        { _id: req.authUser._id },
        { $set: update },
        { returnDocument: 'after' }
      );

      recordAudit({
        userId: req.authUser._id, action: 'security.settings.update', status: 'success',
        message: 'Security settings changed', req,
        metadata: { symbolId: req.authUser.symbolId, changed: Object.keys(update) },
      });

      return res.status(200).json({ success: true, user: await publicUserPayload(updated) });
    } catch (error) {
      console.error('Security settings error:', error);
      return res.status(500).json({ success: false, message: 'Could not save that setting.' });
    }
  }
);

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

    // Every OTHER session for this account stops here — the same mechanism
    // /api/pin/change uses, not a second one. See credentialsInvalidatedAt
    // in models/User.js and the check in authenticatedUser.
    //
    // It was missing, and the gap was the shape of the problem rather than
    // the size of it: PIN CHANGE revoked, PIN RESET did not. Those are the
    // same act performed by two people — one who knows their PIN and one who
    // does not — and only the second is ever performed under duress. Somebody
    // who resets a PIN is, nine times out of ten, somebody who has just
    // realised they have lost control of the account; leaving every existing
    // session signed in is leaving the intruder signed in through the one
    // action the victim would take to remove them.
    //
    // Stamped BEFORE the replacement token is minted, so the new token's iat
    // cannot be older than the stamp and the caller is not signed out by
    // their own reset. authenticatedUser compares with a strict `<`, so a
    // token minted in the same millisecond survives.
    const invalidatedAt = new Date();
    await User.updateOne({ _id: user._id }, { $set: { credentialsInvalidatedAt: invalidatedAt } });

    recordAudit({
      userId: user._id, action: 'pin.reset', status: 'success',
      message: 'PIN reset; other sessions revoked', req,
      metadata: { symbolId: user.symbolId },
    });

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

    // Audit fix (GLB-13): this used to be a bare length check —
    // `Array.from(cleanSymbolId).length !== 12` — which accepted any twelve
    // characters at all. The Gloobal ID is a payment address rendered in a
    // deliberately unambiguous eight-symbol alphabet, and accepting anything
    // else meant an ID could be registered in Latin letters, digits, or
    // Unicode lookalikes of the real symbols. In an app where the ID *is*
    // where the money goes, a registerable near-copy of a merchant's ID is a
    // misdirected-payment problem, not a cosmetic one.
    //
    // isValidSymbolId is the check change-symbol-id has always used; the two
    // entry points into the ID space now agree. The alphabet itself is
    // unchanged.
    if (!isValidSymbolId(cleanSymbolId)) {
      return res.status(400).json({
        message: `Secure ID must be exactly ${SYMBOL_ID_LENGTH} Gloobal symbols (${GLOOBAL_SYMBOLS.join(' ')}).`
      });
    }

    // Audit fix (GLB-12): an ID released by a rename is never re-issued —
    // see symbolIdWasRetired. Checked before the "already registered"
    // branches below, because a retired ID has no current owner and would
    // otherwise fall through to the free-to-claim path.
    if (await symbolIdWasRetired(cleanSymbolId)) {
      return res.status(409).json({
        message: 'This Secure ID was previously used by another account and cannot be reissued. Please choose another.',
        retired: true
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

    beginPinAttempt(pinRecord);

    if (pinLockRemainingMs(pinRecord) > 0) {
      const locked = pinLockoutResponse(pinRecord);
      res.set('Retry-After', String(locked.retryAfterSeconds));
      return res.status(locked.status).json({
        message: locked.message,
        retryAfterSeconds: locked.retryAfterSeconds,
        lockedUntil: locked.lockedUntil
      });
    }

    const isMatch = await bcrypt.compare(cleanPin, pinRecord.pinHash);

    if (!isMatch) {
      const failure = await registerPinFailure(pinRecord);

      if (failure.lockedNow) res.set('Retry-After', String(failure.retryAfterSeconds));

      return res.status(401).json({
        message: failure.message,
        attemptsRemaining: failure.attemptsRemaining,
        lockedUntil: pinRecord.lockedUntil
      });
    }

    await registerPinSuccess(pinRecord);

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
// How the whole platform has set its Creator Share.
//
// The overview screen used to derive its bars from the viewer's OWN rate
// alone — 100% in whichever bucket they sat in, 0% everywhere else — and
// said so plainly underneath ("1 user, 1 rate"). Honest, but it answered a
// question nobody asked: what people generally choose is the only reason to
// look at a distribution.
//
// COUNTS ONLY. The response carries a total and a per-bucket tally and
// nothing else: no ids, no names, no per-user rates. A distribution is
// exactly the shape of data that is safe to publish and easy to leak
// through, so the aggregation is done in the database and only the tallies
// come back.
//
// cashbackRate is stored as a FRACTION (0.0211 = 2.11%), which is what the
// send route multiplies by. The buckets are whole percentage points, so it
// is scaled by 100 here and floored — a rate of exactly 7% lands in the last
// bucket rather than falling off the end.
app.get('/api/creator-share/distribution', lookupLimit, async (req, res) => {
  try {
    const BUCKETS = 7;
    const rows = await User.aggregate([
      {
        $project: {
          bucket: {
            $min: [
              BUCKETS - 1,
              { $floor: { $multiply: [{ $ifNull: ['$cashbackRate', 0] }, 100] } }
            ]
          }
        }
      },
      // A negative or absurd stored rate is not counted rather than being
      // folded into bucket 0, where it would quietly inflate a real figure.
      { $match: { bucket: { $gte: 0, $lte: BUCKETS - 1 } } },
      { $group: { _id: '$bucket', users: { $sum: 1 } } }
    ]);

    const counts = new Array(BUCKETS).fill(0);
    for (const row of rows) {
      const i = Number(row._id);
      if (Number.isInteger(i) && i >= 0 && i < BUCKETS) counts[i] = Number(row.users) || 0;
    }
    // The total is the sum of what was actually bucketed, NOT
    // User.countDocuments(). Percentages have to add up to 100 against the
    // population they describe; dividing by a larger total would show seven
    // bars summing to less than 100 with no explanation on screen.
    const totalUsers = counts.reduce((sum, n) => sum + n, 0);

    return res.json({
      success: true,
      totalUsers,
      buckets: counts.map((users, i) => ({
        from: i,
        to: i + 1,
        users,
        pct: totalUsers > 0 ? Math.round((users / totalUsers) * 1000) / 10 : 0
      }))
    });
  } catch (error) {
    console.error('Creator Share distribution error:', error);

    return res.status(500).json({ success: false, message: 'Could not load the Creator Share distribution.' });
  }
});

// GET /api/coverage — the whole Gloobal Coverage screen, in one response.
//
// Everything this returns is PLATFORM-WIDE. That is the correction at the
// heart of this route: Coverage's spending figures used to be derived per
// account, in the browser, from that account's own payment history, so two
// people looking at "Total spending" saw two different numbers (21.82 and
// 8.1K were the reported pair) and neither was the number the screen claims
// to show. The founder's definition — "Global Total Spending = sum of
// accumulated spending of all countries" — describes one figure that every
// account must see identically, in the same way Total users already does.
//
// Unauthenticated, like /api/stats and /api/coin/supply beside it, and for
// the same reason: there is nothing per-account in the response. It carries
// aggregates and country totals only — no ids, no names, no per-user
// amounts — which is the shape of data that is safe to publish. It is rate
// limited because it is the most expensive read on this server.
//
// ?currency= picks the unit everything is denominated in (default INR, this
// system's reference unit). Conversion happens HERE, against lib/fxRates.js,
// preferring each payment's own transaction-time rate where it applies —
// the app used to convert with a static rate table compiled into the bundle,
// whose convert() returns 0 for an unknown currency rather than failing.
app.get('/api/coverage', lookupLimit, async (req, res) => {
  try {
    const requested = String(req.query.currency || '').trim().toUpperCase();
    const currency = /^[A-Z]{3}$/.test(requested) ? requested : undefined;

    const coverage = await buildCoverage({ currency });

    return res.status(200).json({ success: true, ...coverage });
  } catch (error) {
    console.error('Coverage aggregation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Could not load Gloobal Coverage figures.',
    });
  }
});

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
  // Coin became live when /api/coin/{mint,redeem,send} shipped, and is live
  // no longer: those routes are deleted and every balance was redeemed back
  // to fiat. GEU is a display lens over money somebody already holds, not a
  // currency they hold separately, so there is no coin product to be live.
  //
  // Left in the list as `false` rather than removed, because the key is
  // stored on rows that already exist and a missing key reads as unknown
  // where `false` reads as answered.
  { key: 'coin', live: false }
];

const DEFAULT_PRODUCT_SERVICES = [
  { product: 'bank', label: 'Cashless', status: 'live', note: 'Every transfer settles digitally', order: 0 },
  { product: 'bank', label: 'Borderless', status: 'live', note: 'Send across currencies today', order: 1 },
  { product: 'bank', label: 'Taxless', status: 'planned', note: 'No tax handling is built yet', order: 2 },
  { product: 'bank', label: 'Limitless', status: 'planned', note: 'Transfers are still capped per payment', order: 3 },
  // ── GEU's four, rewritten for what GEU now IS ────────────────────────
  //
  // These described Gloobal Coin: a held balance, pegged to a reserve,
  // minted and redeemed. Every one of those claims was true of code that
  // existed, and none of them is true now — the coin is closed and GEU is a
  // display lens over money somebody already holds, 1 GEU = 1 unit of their
  // own tender.
  //
  // The claims are rewritten rather than softened, and two of them get
  // STRONGER by being honest about a lens instead of a currency:
  //
  //   Stable      not "pegged and redeemable" — identical. There is no rate
  //               between a number and the same number wearing a different
  //               label, so there is nothing to break the peg.
  //   Instant     toggling executes no trade, so there is nothing to settle
  //   Borderless  was 'planned' and blocked on a multi-currency reserve.
  //               There is no reserve now: GEU reads in whatever tender the
  //               viewer's own account is in, which is every currency the
  //               app supports.
  //   Backed      was 'live' on the strength of a reserve that no longer
  //               exists. It is not downgraded, it is RETIRED: backing is a
  //               question about a held asset, and a label on your own money
  //               has nothing to back. Replaced by the claim that actually
  //               matters to somebody reading it — that their funds never
  //               left their own account.
  { product: 'coin', label: 'Stable', status: 'live', note: '1 GEU is 1 unit of your own currency, always', order: 0 },
  { product: 'coin', label: 'Instant', status: 'live', note: 'Switching the view moves no money', order: 1 },
  { product: 'coin', label: 'Borderless', status: 'live', note: 'Reads in every currency Gloobal supports', order: 2 },
  { product: 'coin', label: 'Yours', status: 'live', note: 'Your funds never leave your own account', order: 3 }
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

// ── Retired Gloobal IDs (audit finding GLB-12) ──────────────────────────────
//
// A Gloobal ID is a payment address. It is printed on QR codes, pasted into
// referral links, and saved in other people's payee lists. Renaming an
// account (PATCH /api/profile/change-symbol-id) correctly repoints every
// stored reference — but it also dropped the old ID straight back into the
// pool for anyone to register.
//
// That is the dangerous half. Every artefact already in the world still
// carries the old ID, and a payer using one has no way to tell that the
// account behind it changed hands: the ID resolves, a name comes back, the
// payment goes through, and the money lands with whoever claimed it next.
// No error is raised at any point, on either side.
//
// The smallest fix that closes it is to stop recycling. An ID that has ever
// been released stays released, so an old QR code or saved payee resolves to
// nobody — a clean 404 the payer can see — instead of silently resolving to
// a stranger. The trail is already recorded: change-symbol-id writes the
// outgoing ID into symbolIdHistory with action 'changed', and models/User.js
// indexes symbolIdHistory.symbolId so this stays a keyed lookup.
//
// `exceptUserId` exists for one case: an account returning to an ID it used
// to hold itself. Those old references pointed at this same account, so
// honouring them is correct rather than dangerous, and there is no reason to
// block somebody from undoing their own rename.
const symbolIdWasRetired = async (symbolId, exceptUserId = null) => {
  const query = {
    symbolIdHistory: { $elemMatch: { symbolId, action: 'changed' } }
  };

  if (exceptUserId) query._id = { $ne: exceptUserId };

  return Boolean(await User.exists(query));
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
// in the schema". They were not: AssetSeed and Interest both carry one, and
// so did the three collections of the GEU growth prototype — every one of
// them left pointing at an ID its owner no longer held.
//
// Those three (GeuEntryMint, GeuGrowthEvent, GeuRedemption) came off this
// table when the prototype was deleted. scripts/redeem-all-coin.mjs checks
// the collections are empty before the removal deploys, for exactly the
// reason this table exists: a row left behind with a symbolId in it is a
// Gloobal ID that silently stops being maintained.
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

    // Audit fix (GLB-12): and neither may it be an ID some OTHER account
    // released. Renaming into a stranger's retired ID would inherit every
    // QR code and saved payee still pointing at it. Returning to one's own
    // former ID is allowed — those references pointed here to begin with.
    if (await symbolIdWasRetired(newSymbolId, user._id)) {
      return res.status(409).json({
        error: 'This Gloobal ID was previously used by another account and cannot be reissued.',
        message: 'This Gloobal ID was previously used by another account and cannot be reissued.',
        retired: true
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

// Two shapes of link arrive here, and both must resolve to the same account:
//
//   /r/K7M2QX9BTZ                 a short code minted by ensureReferralCode.
//                                 What every new share produces.
//   /r/%E2%96%A0%E2%96%A0…        the account's Gloobal ID, percent-encoded.
//                                 What every link shared before this existed
//                                 still looks like, on paper, in WhatsApp
//                                 history and in anybody's saved messages.
//
// The short code is tried first because it is now the common case, and
// because the two spaces cannot overlap: a Gloobal ID is twelve dial-pad
// symbols and a referral code is ten characters of ASCII digits and capitals,
// so no string is a valid member of both. REFERRAL_CODE_PATTERN is what makes
// that guarantee explicit rather than incidental — a value that is not
// code-shaped never reaches the code lookup at all.
//
// Whichever way the visitor got here, the redirect is unchanged: the app is
// handed the referrer's real symbolId in ?ref=, because that is what the
// registration referral dial pad expects to be pre-filled with and what
// POST /api/register-symbol resolves `referredBy` against. The short code is
// a URL detail; it never becomes the identity the referral is recorded under.
app.get('/r/:symbolId', lookupLimit, async (req, res) => {
  try {
    const raw = safeDecodeSymbolId(req.params.symbolId).trim();

    if (!raw) {
      return res.status(404).json({
        error: 'Referral link is invalid or expired.'
      });
    }

    // Upper-cased for the lookup only: codes are minted in capitals, and a
    // link retyped in lower case off a screen should still find its account.
    const candidateCode = raw.toUpperCase();

    const user = REFERRAL_CODE_PATTERN.test(candidateCode)
      ? await User.findOne({ referralCode: candidateCode })
      : await User.findOne({ symbolId: raw });

    if (!user) {
      return res.status(404).json({
        error: 'Referral link is invalid or expired.'
      });
    }

    // Hand the visitor to the app with the referrer pre-filled. Re-encoding
    // is required: the query value goes through the same symbol set, and an
    // unencoded '+' in a query string means a space.
    return res.redirect(`${REFERRAL_APP_BASE_URL}/?ref=${encodeURIComponent(user.symbolId)}`);
  } catch (error) {
    console.error('Referral link error:', error);

    return res.status(500).json({
      error: 'Server error while resolving referral link.'
    });
  }
});

// ── The short receipt-share code ────────────────────────────────────────────
//
// The same fix REFERRAL_CODE_ALPHABET made for the invite link, applied to
// the one other place a Gloobal identifier was doing duty as a URL path.
//
// A receipt link used to carry the transaction's own reference:
//
//   https://gloobal-pay.onrender.com/t/%E2%96%A1%E2%96%A0%3D%E2%97%8B…
//
// Twenty symbols of the dial-pad alphabet, every one multi-byte UTF-8, so the
// path a person actually pasted into WhatsApp ran to about 180 characters and
// looked like a decoding error. It now reads /t/A7K9M2QX8P.
//
// Its own constant rather than a reference to the referral one: these are two
// independent handles on two different kinds of record, and a change to how
// invite codes are written must not silently change how receipt links are.
// The alphabet is the same Crockford-style set for the same reason — digits
// and capitals with I, L, O and U removed, so a code read off a screen cannot
// be mis-transcribed and a random string cannot spell anything unfortunate.
const RECEIPT_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Ten characters of a 32-symbol alphabet — 32^10, about 1.1 x 10^15. Long
// enough that receipt codes cannot be walked (a link is forwarded through
// WhatsApp, so guessing neighbours must not be a way to find other people's
// receipts), short enough to read. A collision is not assumed impossible
// anyway: the unique index refuses the write and the mint retries.
const RECEIPT_CODE_LENGTH = 10;

// crypto.randomInt, not Math.random and not a counter. The requirement is
// that no receipt code is reachable from another one.
const createReceiptCode = () => {
  let code = '';
  for (let i = 0; i < RECEIPT_CODE_LENGTH; i += 1) {
    code += RECEIPT_CODE_ALPHABET[crypto.randomInt(RECEIPT_CODE_ALPHABET.length)];
  }
  return code;
};

const RECEIPT_CODE_PATTERN = new RegExp(`^[${RECEIPT_CODE_ALPHABET}]{${RECEIPT_CODE_LENGTH}}$`);

// Gives a transaction its receipt code if it does not have one, and returns
// it. Structured exactly like ensureReferralCode, for the same reasons.
//
// Minted LAZILY — wherever a reference is projected to the client that could
// end up being shared — rather than at Transaction.create. Two reasons, both
// the same reason: every row written before this field existed has to acquire
// one somehow and there is no backfill step in this project, and minting at
// the point of projection covers a freshly-created row and a five-month-old
// one through one mechanism instead of two.
//
// Written under a filter that requires the code still to be absent, so two
// concurrent projections of the same row cannot both mint: the loser matches
// nothing, re-reads, and adopts the winner's code.
//
// Never throws, and never fails the response it is passing through. A code
// that cannot be minted right now means this one receipt falls back to the
// long link for this one response — which is the behaviour that shipped
// before this existed, and which still resolves.
const ensureReceiptCode = async (transaction) => {
  if (!transaction || !transaction._id) return null;
  if (transaction.receiptCode) return transaction.receiptCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = createReceiptCode();

    try {
      const claimed = await Transaction.findOneAndUpdate(
        { _id: transaction._id, $or: [{ receiptCode: null }, { receiptCode: { $exists: false } }] },
        { $set: { receiptCode: candidate } },
        // timestamps: false because `updatedAt` on a transaction means the
        // PAYMENT record changed. Giving a row a link handle is not a change
        // to the payment, and letting it move the timestamp made a retried
        // send come back with a different updatedAt than the original
        // response reported for the same transaction — an idempotent retry
        // that looks like it edited something.
        { returnDocument: 'after', timestamps: false }
      );

      if (claimed) {
        // Keep whatever the caller is holding in step, so a projection built
        // from it afterwards sees the code that was just stored.
        transaction.receiptCode = claimed.receiptCode;
        return claimed.receiptCode;
      }

      // No match: another request minted one first. Adopt theirs.
      const current = await Transaction.findById(transaction._id).select('receiptCode').lean();
      if (current?.receiptCode) {
        transaction.receiptCode = current.receiptCode;
        return current.receiptCode;
      }
      return null;
    } catch (error) {
      // 11000 is the unique index refusing a collision — try another value.
      // Anything else is not something a different random string would fix.
      if (error?.code !== 11000) {
        console.error('Receipt code mint failed:', error);
        return null;
      }
    }
  }

  console.error(`Receipt code mint gave up after 5 collisions for ${transaction.referenceId}`);
  return null;
};

// The same thing for a page of rows: every row that already has a code costs
// nothing, and only the ones that predate the field are written. Returns a map
// from row id to code, so a projection can look each one up without another
// round trip.
const ensureReceiptCodes = async (transactions) => {
  const rows = (transactions || []).filter((t) => t && t._id);
  const codes = await Promise.all(rows.map((t) => ensureReceiptCode(t)));
  return new Map(rows.map((t, i) => [String(t._id), codes[i] || null]));
};

// A shared receipt link.
//
// Its only job is to check the reference names a real payment and hand the
// visitor to the app with it attached - exactly what /r/:symbolId does for a
// referral.
//
// It deliberately returns NOTHING about the transaction: no amount, no
// parties, no currency. A receipt link travels through WhatsApp and gets
// forwarded, and a route that described the payment would let anyone holding
// a forwarded link read a stranger's money movement. The app on the other
// side shows the receipt only if the visitor's OWN history contains it. That
// is unchanged by the short code below — the code shortens the path, it does
// not unlock anything, and this route answers the same single question it
// always did: does this handle name a real row, yes or no.
//
// Two shapes of link arrive here, and each must resolve to the row it names:
//
//   /t/A7K9M2QX8P             a receipt code minted by ensureReceiptCode.
//                             What every new share produces.
//   /t/%E2%96%A1%E2%96%A0…    the transaction's own 20-symbol reference,
//                             percent-encoded. What every receipt shared
//                             before this existed still looks like, in
//                             WhatsApp history and in anybody's saved chats.
//
// The code is tried first because it is now the common case, and the two
// spaces cannot overlap: a reference is twenty dial-pad symbols and a code is
// ten ASCII digits and capitals, so no string is a valid member of both.
// RECEIPT_CODE_PATTERN is what makes that guarantee explicit rather than
// incidental — a value that is not code-shaped never reaches the code lookup.
//
// Either way the redirect is unchanged: the app is handed the row's REAL
// referenceId in ?txn=, because that is what App.jsx matches against the
// viewer's own history rows. The short code is a URL detail; it is never what
// the receipt is identified by on the other side.
app.get('/t/:referenceId', lookupLimit, async (req, res) => {
  try {
    const raw = safeDecodeSymbolId(req.params.referenceId).trim();

    if (!raw) {
      return res.status(404).json({ error: 'Receipt link is invalid or expired.' });
    }

    // Upper-cased for the lookup only: codes are minted in capitals, and a
    // link retyped in lower case off a screen should still find its receipt.
    const candidateCode = raw.toUpperCase();

    // The projection is deliberately empty of anything worth leaking: the
    // reference this link resolves to, and nothing else. No amount, no
    // parties, no currency, no note.
    const found = RECEIPT_CODE_PATTERN.test(candidateCode)
      ? await Transaction.findOne({ receiptCode: candidateCode }).select('referenceId').lean()
      : await Transaction.findOne({ referenceId: raw }).select('referenceId').lean();

    if (!found) {
      return res.status(404).json({ error: 'Receipt link is invalid or expired.' });
    }

    // Re-encoding is required for the same reason as the referral link: the
    // reference is drawn from the Gloobal symbol set, and an unencoded '+' in
    // a query string means a space.
    return res.redirect(`${REFERRAL_APP_BASE_URL}/?txn=${encodeURIComponent(found.referenceId)}`);
  } catch (error) {
    console.error('Receipt link error:', error);

    return res.status(500).json({ error: 'Server error while resolving receipt link.' });
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

// ─── Profile photo ──────────────────────────────────────────────────────────
//
// One copy per account, in ProfilePhoto (see that model for why it is not a
// User field and why it is never copied onto a payment).
//
// Accepted only as a JPEG or PNG data URL. Those are the two formats a phone
// camera or a canvas produces, and neither can carry script — SVG is refused
// for exactly that reason, as it is for project attachments. The declared
// type is checked against the decoded file's own magic bytes, so a data URL
// that says image/png but holds something else is refused rather than stored
// and handed to every account that looks this person up.
const PROFILE_PHOTO_MAX_BYTES = 200000;
const PROFILE_PHOTO_DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const PROFILE_PHOTO_MAGIC = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
};

// 200 KB of image is ~267 KB of base64; 300kb leaves room for the JSON
// around it. Wrapped so a body the parser itself refuses (too large, or not
// JSON) answers in this API's own error shape rather than Express's default
// HTML error page.
const profilePhotoJsonParser = express.json({ limit: '300kb' });
const parseProfilePhotoBody = (req, res, next) => {
  profilePhotoJsonParser(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        code: 'photo_too_large',
        message: 'That photo is too large. Please choose a smaller one.',
      });
    }
    return res.status(400).json({
      success: false,
      code: 'invalid_photo',
      message: 'That photo could not be read.',
    });
  });
};

// Returns { ok: true, dataUrl, mimeType, bytes } or { ok: false, status, code, message }.
function validateProfilePhoto(photo) {
  const invalid = {
    ok: false, status: 400, code: 'invalid_photo',
    message: 'Photos must be a JPEG or PNG image.',
  };
  if (typeof photo !== 'string') return invalid;

  const match = PROFILE_PHOTO_DATA_URL.exec(photo);
  if (!match) return invalid;

  const kind = match[1];
  const base64 = photo.slice(photo.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;

  // Sized from the string before anything is decoded, so an oversized upload
  // is refused without allocating its bytes.
  if (Math.floor((base64.length * 3) / 4) - padding > PROFILE_PHOTO_MAX_BYTES) {
    return {
      ok: false, status: 413, code: 'photo_too_large',
      message: 'That photo is too large. Please choose a smaller one.',
    };
  }

  const bytes = Buffer.from(base64, 'base64');
  const magic = PROFILE_PHOTO_MAGIC[kind];
  if (bytes.length < magic.length || !magic.every((b, i) => bytes[i] === b)) return invalid;

  return { ok: true, dataUrl: photo, mimeType: `image/${kind}`, bytes: bytes.length };
}

// PUT /api/profile/:symbolId/photo — the owner sets or removes their photo.
// `{ photo: null }` removes it; a missing `photo` is a malformed request, not
// a removal, so a client bug cannot silently wipe somebody's picture.
app.put(
  '/api/profile/:symbolId/photo',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  parseProfilePhotoBody,
  async (req, res) => {
    try {
      // Keyed by the token's own account, which requireSelf has just proved
      // is the account the path names (including across a symbolId rename).
      const userId = req.authUser._id;
      const photo = req.body ? req.body.photo : undefined;

      if (photo === null) {
        await ProfilePhoto.deleteOne({ userId });
        return res.json({ success: true, hasPhoto: false });
      }

      const validated = validateProfilePhoto(photo);
      if (!validated.ok) {
        return res.status(validated.status).json({
          success: false, code: validated.code, message: validated.message,
        });
      }

      const fields = { dataUrl: validated.dataUrl, mimeType: validated.mimeType, bytes: validated.bytes };
      try {
        await ProfilePhoto.updateOne({ userId }, { $set: fields }, { upsert: true });
      } catch (writeError) {
        // Two uploads racing for an account with no row yet can both try the
        // insert; the unique userId index refuses the second. The row exists
        // by then, so a plain update is the retry.
        if (writeError?.code !== 11000) throw writeError;
        await ProfilePhoto.updateOne({ userId }, { $set: fields });
      }

      return res.json({ success: true, hasPhoto: true });
    } catch (error) {
      console.error('Profile photo update error:', error);
      return res.status(500).json({ success: false, message: 'Could not save that photo right now.' });
    }
  }
);

// GET /api/users/:symbolId/photo — any signed-in account; this is how a payer
// sees who they are paying, and how a receipt shows the other party.
//
// Looked up by the account's CURRENT symbolId only — not by mobile number or
// email, so this cannot be used to turn a phone number into a face. An ID
// retired by a rename no longer resolves either.
app.get('/api/users/:symbolId/photo', lookupLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const user = symbolId ? await User.findOne({ symbolId }).select('_id symbolId').lean() : null;

    if (!user) {
      return res.status(404).json({
        success: false, code: 'user_not_found', message: 'No account found for that Gloobal ID.',
      });
    }

    const stored = await ProfilePhoto.findOne({ userId: user._id }).select('dataUrl').lean();

    // Private: the response is only for the signed-in viewer. Five minutes is
    // short enough that a changed photo shows up soon, long enough that a
    // history list does not refetch the same face on every render.
    res.set('Cache-Control', 'private, max-age=300');
    return res.json({ success: true, symbolId: user.symbolId, photo: stored?.dataUrl || null });
  } catch (error) {
    console.error('Profile photo read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load that photo right now.' });
  }
});

// ── THE CREATOR HANDLE ──────────────────────────────────────────────────
//
// `first.last` — the Creator side's payable address, and the reason the
// setup screen asks for two boxes rather than one. A person can say
// "rasoi.ghar" across a counter; nobody can say a twelve-symbol Gloobal ID.
//
// ── ANY SCRIPT, DELIBERATELY ────────────────────────────────────────────
//
// The founder's requirement was that a name can be saved "in any language",
// so this does NOT restrict to ASCII. What it refuses is only what would
// break a handle rather than what looks unfamiliar:
//
//   * the dot, because the dot is the separator;
//   * whitespace, because a handle is said and typed as one word;
//   * control characters and the Unicode direction overrides, which can
//     make a handle render as something other than what is stored;
//   * the empty string.
//
// ── NORMALISATION ───────────────────────────────────────────────────────
//
// NFC first, then case-folded. NFC matters more than case here: "é" can be
// one code point or two, the two forms are visually identical, and without
// normalising them a second creator could register a handle nobody could
// tell apart from the first.
//
// ── WHAT THIS DOES NOT SOLVE ────────────────────────────────────────────
//
// Confusables. Cyrillic "а" and Latin "a" are different code points that
// NFC will not merge and no amount of case-folding will, so `rasoi.ghar`
// and `rаsoi.ghar` can both exist. That is a real risk for an address
// people pay, and the honest fix is a confusable-skeleton index
// (UTS #39), which is a job of its own rather than a line here. Written
// down so it is a known gap rather than an assumption.
const CREATOR_HANDLE_PART_MAX = 24;
const CREATOR_HANDLE_FORBIDDEN = /[\s.\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/;

function normaliseHandlePart(value) {
  if (typeof value !== 'string') return '';
  let out = value.trim();
  try {
    out = out.normalize('NFC');
  } catch (e) {
    // An engine without full NFC still gets the trim and the fold; the
    // uniqueness guarantee is weaker on that engine, not absent.
  }
  return out.toLowerCase();
}

// ── ONE ALPHABET PER HALF ───────────────────────────────────────────────
//
// The founder's rule is that a name is taken once in exactly its own form,
// and that rasoi.ghar and रसोई.घर are two different names. Both of those
// are right and both already worked.
//
// What also worked, and should not have, is this:
//
//     rasoi.ghar      ← Latin
//     rаsoi.ghar      ← the same, with ONE Cyrillic а
//
// Two different strings, so both can be registered, and no eye on earth
// can tell them apart. On an address people type to send money that is
// not a cosmetic problem: it is how handle impersonation is done
// everywhere it has ever been done.
//
// The rule that closes it without touching his: each half of the name has
// to be written in ONE alphabet. Devanagari stays Devanagari, Latin stays
// Latin, and a Latin word with a Cyrillic letter hidden in it is refused
// at the box rather than silently becoming somebody else's shopfront.
//
// ── WHAT COUNTS AS ONE ALPHABET ─────────────────────────────────────────
//
// Digits and anything script-neutral (Common, Inherited — which is where
// combining marks live) belong to whatever is around them and are ignored.
//
// Two real writing systems legitimately use more than one script at once,
// and refusing those would be refusing ordinary names rather than attacks:
//
//   * Japanese mixes Han with Hiragana and Katakana — ラーメン屋;
//   * Korean mixes Hangul with Han.
//
// Those are listed below as sets rather than hard-coded exceptions, which
// is the same shape UTS #39 gives them.
//
// ── WHAT THIS STILL DOES NOT SOLVE ──────────────────────────────────────
//
// A name written ENTIRELY in one confusable script. `раѕоі` is all
// Cyrillic, passes this rule, and looks like `rasoi`. Closing that needs
// the Unicode confusables table and a second uniqueness index on the
// skeleton — and it has a real cost, because it would stop a Russian shop
// using a name whose letters happen to look Latin. That is a decision,
// not an oversight, and it is the founder's to make.
const CREATOR_SCRIPT_NAMES = [
  'Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Armenian', 'Georgian',
  'Thai', 'Lao', 'Khmer', 'Myanmar', 'Devanagari', 'Bengali', 'Gurmukhi',
  'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala',
  'Han', 'Hiragana', 'Katakana', 'Hangul', 'Thaana', 'Ethiopic'
];

// Built once. A runtime without Unicode property escapes, or without one
// of these script names, drops that entry rather than throwing — and a
// character no listed script claims is counted as its own alphabet, so
// the check fails closed.
const CREATOR_SCRIPT_TESTS = CREATOR_SCRIPT_NAMES.map((name) => {
  try {
    return [name, new RegExp(`\\p{Script=${name}}`, 'u')];
  } catch (e) {
    return null;
  }
}).filter(Boolean);

let CREATOR_SCRIPT_NEUTRAL = null;
try {
  CREATOR_SCRIPT_NEUTRAL = /[\p{Script=Common}\p{Script=Inherited}]/u;
} catch (e) {
  // No property escapes at all: every character then reads as neutral
  // below and the rule does nothing, which is the previous behaviour
  // rather than a refusal of every name.
  CREATOR_SCRIPT_NEUTRAL = /[\s\S]/;
}

const CREATOR_SCRIPT_SETS = [
  ['Han', 'Hiragana', 'Katakana'],
  ['Han', 'Hangul']
];

function creatorScriptsIn(value) {
  const found = new Set();
  for (const ch of String(value || '')) {
    if (CREATOR_SCRIPT_NEUTRAL.test(ch)) continue;
    let hit = null;
    for (const [name, re] of CREATOR_SCRIPT_TESTS) {
      if (re.test(ch)) { hit = name; break; }
    }
    found.add(hit || `Unknown:${ch}`);
  }
  return found;
}

// ── ANY MIX, EXCEPT LOOKALIKES ──────────────────────────────────────────
// The founder asked for र and R together in one word, so a part may now
// mix alphabets — रR, Rघर, अmazon. What stays refused is the mix the rule
// above was written against: Latin with Cyrillic, Greek or Armenian, whose
// letters are drawn identically (а/a, ο/o, օ/o). A character no listed
// script claims still fails closed when anything else is beside it.
const CREATOR_SCRIPT_LOOKALIKES = ['Latin', 'Cyrillic', 'Greek', 'Armenian'];

function creatorScriptsAgree(found) {
  if (found.size <= 1) return true;
  const all = Array.from(found);
  if (all.some((s) => s.startsWith('Unknown:'))) return false;
  return all.filter((s) => CREATOR_SCRIPT_LOOKALIKES.indexOf(s) >= 0).length <= 1;
}


// ── NAMES NOBODY GETS ───────────────────────────────────────────────────
//
// A one-word name is a far more contested thing than `first.last`, and it
// is exactly what somebody takes to collect payments meant for a brand.
// This list is not an answer to that in general — it is the subset where
// the damage happens INSIDE Gloobal's own app, which is the part we can
// actually control:
//
//   * `gloobal` and its near relatives, because a code reading "gloobal"
//     on a screen made by Gloobal is indistinguishable from the company;
//   * the words a person would read as the app talking to them — support,
//     help, security, official — which is how a refund scam opens;
//   * the operational words a route or a screen might one day want.
//
// Brand squatting in general is NOT solved by this. Somebody can still
// take `netflix`. The honest fix for that is a dispute process and a
// verified badge, which is a product decision rather than a list.
const CREATOR_RESERVED = new Set([
  'gloobal', 'gloobl', 'globaal', 'gloobalpay', 'gloobalbank', 'geu', 'hooman',
  'admin', 'administrator', 'root', 'system', 'official', 'verified', 'staff', 'team',
  'support', 'help', 'helpdesk', 'security', 'safety', 'legal', 'privacy', 'terms',
  'pay', 'payment', 'payments', 'bank', 'banking', 'wallet', 'money', 'refund', 'refunds',
  'account', 'accounts', 'settings', 'billing', 'invoice',
  'api', 'www', 'mail', 'email', 'info', 'contact', 'news', 'app', 'web',
  'null', 'undefined', 'none', 'test', 'me', 'my'
]);


// ── THE MINIMUM IS NOT TWO EVERYWHERE ───────────────────────────────────
//
// A two-character floor stops somebody taking `a` because it is short.
// Applied to every script it also refuses \u5bb6 and \u5c4b, which are whole words
// — a one-character floor for Han, kana and Hangul is not a loophole, it
// is the difference between a rule about length and a rule that says
// "write your name the way English is written".
//
// Found by a test: the suite's own Japanese fixture broke the moment the
// floor went in, which is exactly what that fixture is for.
function creatorMinLength(part) {
  const scripts = creatorScriptsIn(part);
  if (!scripts.size) return 2;
  const dense = ['Han', 'Hiragana', 'Katakana', 'Hangul'];
  return Array.from(scripts).every((s) => dense.indexOf(s) >= 0) ? 1 : 2;
}

// Returns { ok: true, handle, first, last } or { ok: false, code, message }.
// The eight strip shapes a creator's scan message can hang in. Kept in
// step with SCAN_NOTE_STYLES in frontend/features/scan/scanNoteStrip.jsx
// by tests/scan-card.test.mjs.
const CREATOR_SCAN_NOTE_STYLES = ['ribbon', 'tag', 'ticker', 'bubble', 'slip', 'note', 'pill', 'bunting'];

function buildCreatorHandle(firstRaw, lastRaw) {
  const first = typeof firstRaw === 'string' ? firstRaw.trim() : '';
  const last = typeof lastRaw === 'string' ? lastRaw.trim() : '';
  const bad = (message) => ({ ok: false, code: 'invalid_handle', message });

  // ── ONE WORD IS A NAME TOO ───────────────────────────────────────────
  //
  // Asked for: a creator whose name is one word — amazon, netflix,
  // chacha — should be able to hold just that word, with no dot.
  //
  // The FIRST box is the required one and the second is optional, so
  // leaving the last name empty gives a one-word handle. The other way
  // round is a mistake rather than a one-word name: somebody has typed
  // into the wrong box, and silently reordering it for them would mean
  // the name they end up with is not the one they typed.
  if (!first) return bad('A creator name needs a first part.');

  const parts = last ? [first, last] : [first];
  for (const part of parts) {
    if ([...part].length > CREATOR_HANDLE_PART_MAX) {
      // Counted in code points rather than UTF-16 units, so a name in a
      // script outside the Basic Multilingual Plane is not charged double
      // for characters a person would count as one.
      return bad(`Each part can be up to ${CREATOR_HANDLE_PART_MAX} characters.`);
    }
    if ([...part].length < creatorMinLength(part)) {
      // A single Latin character is not a name anybody says; it is a
      // thing somebody takes because it is short. Two is the floor
      // there — but NOT everywhere, see creatorMinLength.
      return bad('Each part needs at least two characters.');
    }
    if (CREATOR_HANDLE_FORBIDDEN.test(part)) {
      return bad('A creator name cannot contain spaces or dots.');
    }
    // Each part on its own, not the two together: `rasoi.घर` is two
    // alphabets but it is not a lookalike of anything, and refusing it
    // would be refusing an ordinary name rather than an attack.
    if (!creatorScriptsAgree(creatorScriptsIn(part))) {
      return {
        ok: false,
        code: 'mixed_scripts',
        message: "English letters can't be mixed with Russian, Greek or Armenian ones in one part. They look the same."
      };
    }
  }

  const head = normaliseHandlePart(first);
  const tail = last ? normaliseHandlePart(last) : '';
  const handle = tail ? `${head}.${tail}` : head;

  // ── THE RESERVED LIST ────────────────────────────────────────────────
  //
  // Checked against the WHOLE one-word handle, and separately against the
  // first part of a two-word one. `gloobal` alone is refused because a
  // code reading "gloobal" inside Gloobal's own app is indistinguishable
  // from the company; `gloobal.cafe` is refused for the same reason, and
  // a café really called Gloobal is a problem worth having rather than
  // the one this prevents.
  //
  // `support.chacha` IS refused, and that is the point of checking the
  // head rather than the whole string: somebody reading it at a counter
  // reads "support" first and can take the rest for a department.
  // `chacha.support` is allowed — the reserved word is not what the name
  // leads with, and refusing every name containing one of these words
  // would take `tea.help` off a real tea shop.
  if (CREATOR_RESERVED.has(head)) {
    return {
      ok: false,
      code: 'reserved_name',
      message: 'That name is kept for Gloobal. Try another.'
    };
  }

  return { ok: true, handle, first, last: last || '', single: !tail };
}

// ── BIG BRANDS ───────────────────────────────────────────────────────────
// Netflix, Amazon, Tata, Jio and the rest (lib/reservedBrands.js), as
// EITHER part — netflix, netflix.india and india.netflix — and in a Hindi
// spelling. Only for TAKING a name (the availability check and the save):
// looking a name up must still find a shop that held it before the list,
// and that shop keeps it when it saves its profile again.
function creatorBrandRefusal(built, currentHandle) {
  if (!built || !built.ok) return null;
  if (currentHandle && built.handle === currentHandle) return null;
  const parts = built.handle.split('.');
  for (const part of parts) {
    const brand = reservedBrands.reservedBrandFor(part);
    if (brand) {
      return {
        ok: false,
        code: 'reserved_brand',
        message: `"${part}" is kept for the brand ${brand.charAt(0).toUpperCase()}${brand.slice(1)}. If this is your brand, write to GLOOBAL to claim it.`
      };
    }
  }
  return null;
}

// Is this handle free? Free means no OTHER account holds it.
async function creatorHandleTaken(handle, exceptUserId) {
  const owner = await User.findOne({ 'creatorProfile.handle': handle }).select('_id').lean();
  if (!owner) return false;
  return !exceptUserId || String(owner._id) !== String(exceptUserId);
}

// What a creator looks like to SOMEBODY ELSE.
//
// The address is the field that decides itself: it is only ever included
// when its owner has turned addressPublic on. Everything else here is
// already public by the act of being a creator — you cannot be paid at a
// name nobody is allowed to read.
function publicCreator(user, logoDataUrl) {
  const profile = (user && user.creatorProfile) || {};
  return {
    symbolId: user.symbolId,
    // The country the account lives in, so a page opened from search can
    // hand the Send flow a receiver without a second lookup. Not personal
    // detail: it is which money their prices are in, which anybody paying
    // them needs and the price list already implies.
    countryIso: user.countryIso || '',
    handle: profile.handle || null,
    handleFirst: profile.handleFirst || '',
    handleLast: profile.handleLast || '',
    logo: logoDataUrl || null,
    // How this shop looks. Sent to everybody, because it is what the page
    // is drawn with — there is nothing private in a colour. Resolved on the
    // client by shopTheme.js, which falls back field by field, so an older
    // profile with no `shop` block renders as the app's own look.
    shop: creatorShopOut(profile.shop),
    address: profile.addressPublic ? (profile.address || '') : '',
    // The parts, and with them the map point, under exactly the same rule
    // as the text: public or nothing.
    addressParts: profile.addressPublic ? creatorAddressPartsOut(profile.addressParts) : null,
    addressPublic: Boolean(profile.addressPublic),
    // Sent to everybody, unlike the address: a message written FOR the
    // person scanning is of no use if only its author can read it.
    scanNote: profile.scanNote || '',
    category: bazaar.BAZAAR_CATEGORIES.includes(profile.category) ? profile.category : '',
    category2: bazaar.BAZAAR_CATEGORIES.includes(profile.category2) ? profile.category2 : '',
    subcategory: bazaar.bazaarSubcategoryValid(profile.category, profile.subcategory) ? profile.subcategory : '',
    listed: profile.listed !== false,
    // Public: opening hours are for the people coming to the shop.
    hours: profile.hours && Array.isArray(profile.hours.days) && profile.hours.days.length === 7 ? { tz: profile.hours.tz, days: profile.hours.days } : null,
    about: profile.about || '',
    contacts: creatorContactsOut(profile.contacts),
    scanNoteStyle: CREATOR_SCAN_NOTE_STYLES.includes(profile.scanNoteStyle) ? profile.scanNoteStyle : 'ribbon'
  };
}

// ── HOW TO REACH A SHOP ─────────────────────────────────────────────────
//
// WhatsApp and phone are a + and 7–15 digits (spaces and dashes typed are
// dropped); Instagram is the handle without the @. Each is optional. These
// become links on the shop page (wa.me/…, tel:…, instagram.com/…), so the
// shape is checked here — a value that reaches an href must be exactly the
// thing it claims to be.
function creatorContactsOut(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    whatsapp: typeof c.whatsapp === 'string' ? c.whatsapp : '',
    phone: typeof c.phone === 'string' ? c.phone : '',
    instagram: typeof c.instagram === 'string' ? c.instagram : ''
  };
}

function creatorContactsIn(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Those contact details could not be read.' };
  const num = (v, what) => {
    const t = String(v == null ? '' : v).replace(/[\s()-]/g, '');
    if (!t) return { ok: true, value: '' };
    if (!/^\+?[0-9]{7,15}$/.test(t)) return { ok: false, message: `That ${what} number does not look right.` };
    return { ok: true, value: t };
  };
  const wa = num(raw.whatsapp, 'WhatsApp');
  if (!wa.ok) return wa;
  const ph = num(raw.phone, 'phone');
  if (!ph.ok) return ph;
  const ig = String(raw.instagram == null ? '' : raw.instagram).trim().replace(/^@/, '');
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) return { ok: false, message: 'That Instagram name does not look right.' };
  return { ok: true, value: { whatsapp: wa.value, phone: ph.value, instagram: ig } };
}

// ── A CREATOR'S ADDRESS, IN PARTS ───────────────────────────────────────

var CREATOR_ADDRESS_LIMITS = { line1: 120, area: 120, landmark: 100, pin: 10, city: 60, state: 60 };

function creatorAddressPartsOut(raw) {
  const p = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const k of Object.keys(CREATOR_ADDRESS_LIMITS)) out[k] = typeof p[k] === 'string' ? p[k] : '';
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const has = p.lat != null && p.lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  out.lat = has ? lat : null;
  out.lng = has ? lng : null;
  return out;
}

// Validated field by field. Any script is fine in the text — an address in
// Hindi is still an address — but each part has a length, a PIN is letters,
// digits, spaces and dashes (so a UK or Canadian postcode fits too), and a
// map point is a real latitude/longitude pair or nothing at all.
function creatorAddressPartsIn(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'invalid_address', message: 'That address could not be read.' };
  const value = {};
  for (const [k, max] of Object.entries(CREATOR_ADDRESS_LIMITS)) {
    const v = raw[k] == null ? '' : raw[k];
    if (typeof v !== 'string') return { ok: false, code: 'invalid_address', message: 'That address could not be read.' };
    const t = v.trim().replace(/\s+/g, ' ');
    if (t.length > max) return { ok: false, code: 'invalid_address', message: 'Part of that address is too long.' };
    value[k] = t;
  }
  if (value.pin && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(value.pin)) {
    return { ok: false, code: 'invalid_pin', message: 'That PIN code does not look right.' };
  }
  const hasPoint = raw.lat != null && raw.lng != null;
  if (hasPoint) {
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { ok: false, code: 'invalid_location', message: 'That map point is not a real place.' };
    }
    // Six decimals is about 11cm. More is noise, and noise is still a
    // more precise picture of where somebody stands than anyone needs.
    value.lat = Math.round(lat * 1e6) / 1e6;
    value.lng = Math.round(lng * 1e6) / 1e6;
  } else {
    value.lat = null;
    value.lng = null;
  }
  return { ok: true, value };
}

// "C-482, Surya Nagar, Near Hanuman Mandir, Alwar, Rajasthan 301001".
function creatorAddressCompose(p) {
  const tail = [p.state, p.pin].filter(Boolean).join(' ');
  return [p.line1, p.area, p.landmark ? `Near ${p.landmark}` : '', p.city, tail]
    .filter(Boolean).join(', ').slice(0, 400);
}

// ── FINDING AN ADDRESS: GPS → ADDRESS, AND PIN → CITY ───────────────────
//
// Both go through this server rather than from the phone straight to the
// lookup service. The site's Content-Security-Policy only lets the app talk
// to its own API, which is the right policy; OpenStreetMap's Nominatim
// asks every caller to identify itself and stay under one request a second;
// and caching here means a PIN looked up by a thousand shops in one town is
// fetched once. Neither lookup is stored against anybody's account — they
// answer, and the person decides what to keep.
var GEO_USER_AGENT = 'GloobalPay/1.0 (+https://gloobalv3.netlify.app)';
var GEO_CACHE = new Map();
var GEO_CACHE_MAX = 2000;
var GEO_TIMEOUT_MS = 6000;

function geoCacheGet(key) {
  const hit = GEO_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > 24 * 3600 * 1000) { GEO_CACHE.delete(key); return null; }
  return hit.value;
}

function geoCacheSet(key, value) {
  if (GEO_CACHE.size >= GEO_CACHE_MAX) GEO_CACHE.delete(GEO_CACHE.keys().next().value);
  GEO_CACHE.set(key, { at: Date.now(), value });
}

async function geoFetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEO_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': GEO_USER_AGENT, Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Nominatim's address block, folded into our six parts.
function geoPartsFromNominatim(a) {
  const x = (a && typeof a === 'object') ? a : {};
  // The road is the STREET, not the shop: it goes with the area, and the
  // first box gets only a house number when the map has one. A render put
  // "Kala Kuan Road" in "Shop / house no.", which is where the creator then
  // has to type their shop number over it.
  const line1 = String(x.house_number || '');
  const area = [x.road, x.neighbourhood || x.quarter, x.suburb || x.city_district].filter(Boolean)
    .filter((v, i, all) => all.indexOf(v) === i).join(', ');
  return {
    line1: line1.slice(0, 120),
    area: area.slice(0, 120),
    city: String(x.city || x.town || x.village || x.municipality || x.state_district || x.county || '').slice(0, 60),
    state: String(x.state || '').slice(0, 60),
    pin: String(x.postcode || '').replace(/[^A-Za-z0-9 -]/g, '').slice(0, 10),
    countryIso: String(x.country_code || '').toUpperCase()
  };
}

// GET /api/geo/reverse?lat=..&lng=..&lang=hi — a point, as address parts.
app.get('/api/geo/reverse', lookupLimit, requireAuth, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ success: false, code: 'invalid_location', message: 'That is not a real place.' });
  }
  const lang = /^[a-z]{2}$/.test(String(req.query.lang || '')) ? String(req.query.lang) : 'en';
  // Rounded to ~11m for the cache key and the request: the street does not
  // change within that, and the exact point never leaves this server.
  const rl = Math.round(lat * 1e4) / 1e4;
  const rn = Math.round(lng * 1e4) / 1e4;
  const key = `rev:${rl},${rn}:${lang}`;
  let parts = geoCacheGet(key);
  if (!parts) {
    const data = await geoFetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${rl}&lon=${rn}&accept-language=${lang}`);
    if (!data || !data.address) {
      return res.status(502).json({ success: false, code: 'geo_unavailable', message: 'Could not read an address for this spot. You can type it in.' });
    }
    parts = geoPartsFromNominatim(data.address);
    geoCacheSet(key, parts);
  }
  return res.json({ success: true, parts });
});

// GET /api/geo/pin/301001 — an Indian PIN, as its city, state and areas.
app.get('/api/geo/pin/:pin', lookupLimit, requireAuth, async (req, res) => {
  const pin = String(req.params.pin || '').trim();
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    return res.status(400).json({ success: false, code: 'invalid_pin', message: 'An Indian PIN code is six digits.' });
  }
  const key = `pin:${pin}`;
  let found = geoCacheGet(key);
  if (!found) {
    const data = await geoFetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return res.status(502).json({ success: false, code: 'geo_unavailable', message: 'Could not look that PIN up right now.' });
    }
    const offices = Array.isArray(row.PostOffice) ? row.PostOffice : [];
    if (row.Status !== 'Success' || !offices.length) {
      return res.status(404).json({ success: false, code: 'pin_not_found', message: 'No place uses that PIN code.' });
    }
    found = {
      pin,
      city: String(offices[0].District || '').slice(0, 60),
      state: String(offices[0].State || '').slice(0, 60),
      // The post offices under this PIN, which are the area names people
      // actually say ("Surya Nagar", "Scheme No 2") — offered as picks.
      areas: offices.map((o) => String(o.Name || '')).filter(Boolean).slice(0, 12)
    };
    geoCacheSet(key, found);
  }
  return res.json({ success: true, ...found });
});

// ── OWNER INSIGHTS ──────────────────────────────────────────────────────
//
// Page views, code scans and item taps, counted per shop per day
// (models/CreatorStat.js), shown only to the shop's owner.
//
// Counting is deliberately conservative: the owner's own visits are not
// counted, and a view or a scan is counted once per person per shop per
// day (an in-memory set, so a restart can count somebody twice — an
// undercount is the error worth avoiding, not this one). Item taps count
// every tap: "which thing do people look at most" is the question.

var CREATOR_STAT_SEEN = new Map();
var CREATOR_STAT_SEEN_MAX = 50000;

function creatorStatDay(d) {
  return (d || new Date()).toISOString().slice(0, 10);
}

function creatorStatOnce(key) {
  const day = creatorStatDay();
  if (CREATOR_STAT_SEEN.get(key) === day) return false;
  if (CREATOR_STAT_SEEN.size >= CREATOR_STAT_SEEN_MAX) CREATOR_STAT_SEEN.clear();
  CREATOR_STAT_SEEN.set(key, day);
  return true;
}

// POST /api/creator/:symbolId/events  { type: 'view'|'scan'|'item', itemId? }
app.post('/api/creator/:symbolId/events', lookupLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const type = String(body.type || '');
    if (!['view', 'scan', 'item'].includes(type)) {
      return res.status(400).json({ success: false, code: 'invalid_event', message: 'Unknown event.' });
    }
    // Your own shop does not count.
    if (symbolId && symbolId === req.authUser.symbolId) return res.json({ success: true, counted: false });
    const owner = symbolId ? await User.exists({ symbolId, 'creatorProfile.handle': { $type: 'string', $ne: '' } }) : null;
    if (!owner) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No shop found.' });
    const day = creatorStatDay();
    const inc = {};
    if (type === 'item') {
      const itemId = String(body.itemId || '');
      if (!/^[a-f0-9]{24}$/.test(itemId)) return res.status(400).json({ success: false, code: 'invalid_item', message: 'Unknown item.' });
      inc[`items.${itemId}`] = 1;
    } else {
      if (!creatorStatOnce(`${type}|${req.authUser._id}|${symbolId}`)) return res.json({ success: true, counted: false });
      inc[type === 'view' ? 'views' : 'scans'] = 1;
    }
    await CreatorStat.updateOne({ ownerSymbolId: symbolId, day }, { $inc: inc }, { upsert: true });
    return res.json({ success: true, counted: true });
  } catch (error) {
    // Counting is never worth an error the person can see.
    return res.json({ success: true, counted: false });
  }
});

// GET /api/creator/:symbolId/insights — the owner's last 7 days, and the
// 7 before for comparison.
app.get('/api/creator/:symbolId/insights', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const today = new Date();
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(creatorStatDay(new Date(today.getTime() - i * 86400000)));
    const rows = await CreatorStat.find({ ownerSymbolId: symbolId, day: { $in: days } }).lean();
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const week = days.slice(7).map((d) => ({ day: d, views: (byDay.get(d) || {}).views || 0, scans: (byDay.get(d) || {}).scans || 0 }));
    const prev = days.slice(0, 7).reduce((acc, d) => {
      const r = byDay.get(d) || {};
      acc.views += r.views || 0;
      acc.scans += r.scans || 0;
      return acc;
    }, { views: 0, scans: 0 });
    const taps = new Map();
    for (const d of days.slice(7)) {
      const items = (byDay.get(d) || {}).items || {};
      for (const [id, n] of Object.entries(items)) taps.set(id, (taps.get(id) || 0) + (Number(n) || 0));
    }
    const ids = Array.from(taps.keys()).filter((id) => /^[a-f0-9]{24}$/.test(id));
    const titles = ids.length ? await CreatorItem.find({ _id: { $in: ids }, ownerSymbolId: symbolId }).select('_id title').lean() : [];
    const topItems = titles.map((t) => ({ id: String(t._id), title: t.title, taps: taps.get(String(t._id)) || 0 }))
      .sort((a, b) => b.taps - a.taps).slice(0, 5);
    // People who paid this week — this account's own payments, counted.
    const user = await User.findOne({ symbolId }).select('_id').lean();
    const payers = user ? await Transaction.distinct('fromUserId', {
      toUserId: user._id, status: 'success', createdAt: { $gte: new Date(today.getTime() - 7 * 86400000) }
    }) : [];
    return res.json({
      success: true,
      week,
      totals: { views: week.reduce((n, d) => n + d.views, 0), scans: week.reduce((n, d) => n + d.scans, 0), payers: payers.length },
      previous: prev,
      topItems
    });
  } catch (error) {
    console.error('Creator insights error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your insights right now.' });
  }
});

// ── GLOOBAL बाज़ार ────────────────────────────────────────────────────────
//
// Search by the start of a name in any script, by category, and Near me
// within a chosen radius — ranked by what each shop was paid in the last
// 24 hours, 7 days as the tiebreak. The rules and the arithmetic are in
// lib/bazaar.js; this is the querying.

var BAZAAR_USD_RATE_CACHE = new Map();

// 1 unit of `currency` in USD, cached for an hour. Only used to put shops
// paid in different currencies on one scale for ORDERING; a currency whose
// rate cannot be had counts as zero volume rather than as a guess, so the
// shop still appears, just not ranked above anyone on an invented number.
async function bazaarUsdRate(currency) {
  const cur = String(currency || '').toUpperCase();
  if (!cur) return 0;
  if (cur === 'USD') return 1;
  const hit = BAZAAR_USD_RATE_CACHE.get(cur);
  if (hit && Date.now() - hit.at < 3600 * 1000) return hit.rate;
  try {
    const { rate } = await getRate(cur, 'USD');
    const r = Number(rate) > 0 ? Number(rate) : 0;
    BAZAAR_USD_RATE_CACHE.set(cur, { at: Date.now(), rate: r });
    return r;
  } catch (error) {
    return 0;
  }
}

// What each of these shops was paid, 24h and 7d, in USD. Never sent out.
async function bazaarVolumes(userIds) {
  const volume = new Map();
  if (!userIds.length) return volume;
  const now = Date.now();
  const since7 = new Date(now - 7 * 86400000);
  const since1 = new Date(now - 86400000);
  const rows = await Transaction.aggregate([
    // 'success', the status the send route writes. This said 'completed',
    // which no Transaction ever has, so every shop ranked at zero (0143).
    { $match: { toUserId: { $in: userIds }, status: 'success', type: 'send', createdAt: { $gte: since7 } } },
    { $group: {
      _id: { to: '$toUserId', currency: '$currency' },
      d7: { $sum: '$amount' },
      d1: { $sum: { $cond: [{ $gte: ['$createdAt', since1] }, '$amount', 0] } }
    } }
  ]);
  for (const r of rows) {
    const rate = await bazaarUsdRate(r._id.currency);
    const key = String(r._id.to);
    const v = volume.get(key) || { d1: 0, d7: 0 };
    v.d1 += (Number(r.d1) || 0) * rate;
    v.d7 += (Number(r.d7) || 0) * rate;
    volume.set(key, v);
  }
  return volume;
}

// The shops a request could match, before ranking.
// ── KEYS FOR SHOPS SAVED BEFORE THERE WERE KEYS ─────────────────────────
// Names and items get their search key when saved. Ones saved before this
// existed are given theirs the first time anybody searches, once per
// server start, in bulk — so "rasoi" finds रसोई Ghar from the first day
// rather than only after its owner next edits something.
var BAZAAR_KEYS_READY = null;
function bazaarEnsureKeys() {
  if (BAZAAR_KEYS_READY) return BAZAAR_KEYS_READY;
  BAZAAR_KEYS_READY = (async () => {
    try {
      const users = await User.find({
        'creatorProfile.handle': { $type: 'string', $ne: '' },
        'creatorProfile.searchKey': { $in: [null, ''] }
      }).select('_id creatorProfile.handleFirst creatorProfile.handleLast').limit(5000).lean();
      if (users.length) {
        await User.bulkWrite(users.map((u) => ({ updateOne: {
          filter: { _id: u._id },
          update: { $set: { 'creatorProfile.searchKey': searchKey.searchKeyOf(`${(u.creatorProfile || {}).handleFirst || ''} ${(u.creatorProfile || {}).handleLast || ''}`) } }
        } })));
      }
      const items = await CreatorItem.find({ searchKey: { $in: [null, ''] } }).select('_id title category').limit(20000).lean();
      if (items.length) {
        await CreatorItem.bulkWrite(items.map((it) => ({ updateOne: {
          filter: { _id: it._id },
          update: { $set: { searchKey: searchKey.searchKeyOf(`${it.title || ''} ${it.category || ''}`) } }
        } })));
      }
    } catch (error) {
      // Search still works on names as typed; the keys are an addition.
      console.error('Bazaar key backfill error:', error);
      BAZAAR_KEYS_READY = null;
    }
  })();
  return BAZAAR_KEYS_READY;
}

// ── FUZZY: WHO NEARLY MATCHES ────────────────────────────────────────────
// The typo-proof pass (0141). Run only when the exact search found nobody:
// a capped sample of listed shops' names and of items is read as loose
// keys, and any word that nearly matches a typed word (bazaarNearlyMatches)
// brings its shop in. "smosa", "samsa" and "समोसा" all find samosa.
async function bazaarFuzzyOwners(rawQ, countryIso) {
  const typed = searchKey.searchKeyQuery(rawQ).filter((w) => w.length >= 3);
  if (!typed.length) return { owners: new Set(), itemHit: new Map() };
  const shopMatch = { 'creatorProfile.handle': { $type: 'string', $ne: '' }, 'creatorProfile.listed': { $ne: false } };
  if (countryIso) shopMatch.countryIso = countryIso;
  const shops = await User.find(shopMatch).select('symbolId creatorProfile.searchKey').limit(3000).lean();
  const owners = new Set();
  for (const u of shops) {
    const words = String((u.creatorProfile || {}).searchKey || '').split(' ').filter(Boolean);
    if (typed.every((t) => words.some((w) => bazaarNearlyMatchesWord(t, w)))) owners.add(u.symbolId);
  }
  const itemHit = new Map();
  const items = await CreatorItem.find({ searchKey: { $type: 'string', $ne: '' } }).select('ownerSymbolId title searchKey price').limit(6000).lean();
  for (const it of items) {
    const words = String(it.searchKey || '').split(' ').filter(Boolean);
    if (typed.every((t) => words.some((w) => bazaarNearlyMatchesWord(t, w)))) {
      owners.add(it.ownerSymbolId);
      if (!itemHit.has(it.ownerSymbolId)) itemHit.set(it.ownerSymbolId, it.title);
    }
  }
  return { owners, itemHit };
}

function bazaarNearlyMatchesWord(typed, stored) {
  return stored.startsWith(typed) || bazaar.bazaarNearlyMatches(typed, stored);
}

// Average stars and how many, for these shops, in one query.
async function bazaarRatings(userIds) {
  if (!userIds.length) return new Map();
  const rows = await CreatorReview.aggregate([
    { $match: { creatorUserId: { $in: userIds } } },
    { $group: { _id: '$creatorUserId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), { avg: Math.round(r.avg * 10) / 10, count: r.count }]));
}

async function bazaarCandidates({ q = '', rawQ = '', category = '', cats = [], sub = '', near = null, needCategory = false, countryIso = '', openNow = false, maxPrice = 0, newOnly = false, fuzzyOwners = null }) {
  const match = {
    'creatorProfile.handle': { $type: 'string', $ne: '' },
    'creatorProfile.listed': { $ne: false }
  };
  const and = [];
  // Without Near me, a list is the searcher's own country: "most famous"
  // means famous where you are, and a rupee shop topping a dollar list on
  // exchange-rate arithmetic would help nobody. Near me ignores it — a
  // circle on a border is a circle.
  if (countryIso && !near) match.countryIso = countryIso;
  // What the query found among ITEMS: owner → the first matching title,
  // so a shop found for "samosa" can say "Sells Samosa" on its row.
  let itemHit = new Map();
  if (fuzzyOwners) {
    // The typo-proof pass: the owners it found, nothing else.
    itemHit = fuzzyOwners.itemHit;
    and.push({ symbolId: { $in: Array.from(fuzzyOwners.owners) } });
  } else if (q) {
    const re = new RegExp(`^${bazaar.bazaarEscapeRegex(q)}`, 'i');
    const keyRe = searchKey.searchKeyRegex(searchKey.searchKeyQuery(rawQ || q));
    const or = [
      { 'creatorProfile.handle': re },
      { 'creatorProfile.handleFirst': re },
      { 'creatorProfile.handleLast': re }
    ];
    // Any spelling: "rasoi" finds रसोई, "रसोई" finds Rasoi.
    if (keyRe) or.push({ 'creatorProfile.searchKey': keyRe });
    // Shops by what they SELL, in any spelling, and in its own script for
    // alphabets the key does not cover.
    const words = String(rawQ || q).trim().split(/[\s.]+/).filter(Boolean).map(bazaar.bazaarEscapeRegex);
    const titleRe = words.length ? new RegExp(`(^|\\s)${words.join('.*')}`, 'i') : null;
    const itemOr = [];
    if (keyRe) itemOr.push({ searchKey: keyRe });
    if (titleRe) itemOr.push({ title: titleRe });
    if (itemOr.length) {
      const itemQuery = { $or: itemOr };
      // "Under ₹100": only items at or below the price, in the shop's own
      // money (prices are stored in it).
      if (maxPrice > 0) itemQuery.price = { $lte: maxPrice };
      const items = await CreatorItem.find(itemQuery).select('ownerSymbolId title').limit(1500).lean();
      for (const it of items) if (!itemHit.has(it.ownerSymbolId)) itemHit.set(it.ownerSymbolId, it.title);
      if (itemHit.size) or.push({ symbolId: { $in: Array.from(itemHit.keys()) } });
    }
    // And by category: "tailor", "pharmacy", "मिठाई".
    const qCats = bazaar.bazaarCategoriesForQuery(rawQ || q, searchKey.looseKey);
    if (qCats.length) or.push({ 'creatorProfile.category': { $in: qCats } });
    // A price filter is about items: only shops selling the thing at that
    // price, not every shop whose name starts the same.
    and.push(maxPrice > 0 ? { symbolId: { $in: Array.from(itemHit.keys()) } } : { $or: or });
  }
  // A shop is in its own category and its second one.
  const wanted = category ? [category] : cats;
  if (wanted.length) {
    and.push({ $or: [{ 'creatorProfile.category': { $in: wanted } }, { 'creatorProfile.category2': { $in: wanted } }] });
  } else if (needCategory) {
    match['creatorProfile.category'] = { $in: bazaar.BAZAAR_CATEGORIES };
  }
  if (category && sub) match['creatorProfile.subcategory'] = sub;
  if (newOnly) match['creatorProfile.joinedAt'] = { $gte: new Date(Date.now() - bazaar.BAZAAR_NEW_DAYS * 86400000) };
  if (near) {
    const box = bazaar.bazaarBoundingBox(near.lat, near.lng, near.radiusKm);
    match['creatorProfile.addressPublic'] = true;
    match['creatorProfile.addressParts.lat'] = { $gte: box.minLat, $lte: box.maxLat };
    match['creatorProfile.addressParts.lng'] = { $gte: box.minLng, $lte: box.maxLng };
  }
  if (and.length) match.$and = and;
  const users = await User.find(match)
    .select('_id symbolId countryIso creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast creatorProfile.category creatorProfile.category2 creatorProfile.subcategory creatorProfile.joinedAt creatorProfile.shop creatorProfile.hours creatorProfile.addressParts.lat creatorProfile.addressParts.lng')
    .limit(bazaar.BAZAAR_CANDIDATE_CAP)
    .lean();
  const rows = [];
  for (const u of users) {
    const p = u.creatorProfile || {};
    const row = {
      _id: u._id,
      symbolId: u.symbolId,
      countryIso: u.countryIso || '',
      handle: p.handle,
      handleFirst: p.handleFirst || '',
      handleLast: p.handleLast || '',
      category: bazaar.BAZAAR_CATEGORIES.includes(p.category) ? p.category : '',
      category2: bazaar.BAZAAR_CATEGORIES.includes(p.category2) ? p.category2 : '',
      subcategory: bazaar.bazaarSubcategoryValid(p.category, p.subcategory) ? p.subcategory : '',
      joinedAt: p.joinedAt || null,
      color: creatorShopOut(p.shop).color,
      matchedItem: itemHit.get(u.symbolId) || '',
      hours: p.hours && Array.isArray(p.hours.days) && p.hours.days.length === 7 ? { tz: p.hours.tz, days: p.hours.days } : null
    };
    // Open now: only shops whose hours say so. A shop with no hours set
    // is left out rather than assumed open.
    if (openNow && !openHours.openHoursStatus(row.hours, new Date()).open) continue;
    if (near) {
      const a = p.addressParts || {};
      const d = bazaar.bazaarDistanceM(near.lat, near.lng, Number(a.lat), Number(a.lng));
      // The box is a square around the circle; its corners are not inside.
      if (!(d <= near.radiusKm * 1000)) continue;
      row.distanceM = d;
      // For the map. Only shops with a PUBLIC, pinned address reach this
      // branch, and their point is already on their own page; it is
      // rounded to ~11 m all the same.
      row.lat = Math.round(Number(a.lat) * 1e4) / 1e4;
      row.lng = Math.round(Number(a.lng) * 1e4) / 1e4;
    }
    rows.push(row);
  }
  return rows;
}

// GET /api/bazaar?q=ras&category=food&sub=chai&cats=sweets,events
//   &sort=paid|week|rating|new|near&minRating=4&maxPrice=100
//   &lat=..&lng=..&radiusKm=2&open=1&country=IN
app.get('/api/bazaar', lookupLimit, requireAuth, async (req, res) => {
  try {
    const q = bazaar.bazaarQuery(req.query.q);
    const category = bazaar.BAZAAR_CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const sub = category && bazaar.bazaarSubcategoryValid(category, String(req.query.sub || '')) ? String(req.query.sub) : '';
    const cats = String(req.query.cats || '').split(',').filter((c) => bazaar.BAZAAR_CATEGORIES.includes(c)).slice(0, 6);
    const near = bazaar.bazaarNear(req.query);
    if ((req.query.lat !== undefined || req.query.radiusKm !== undefined) && !near) {
      return res.status(400).json({ success: false, code: 'invalid_near', message: 'Pick a distance from the list.' });
    }
    const sortRaw = String(req.query.sort || 'paid');
    const sort = bazaar.BAZAAR_SORTS.includes(sortRaw) ? (sortRaw === 'near' && !near ? 'paid' : sortRaw) : 'paid';
    const minRating = Number(req.query.minRating) === 4 ? 4 : 0;
    const maxPrice = Number(req.query.maxPrice);
    const priceCap = q && Number.isFinite(maxPrice) && maxPrice > 0 && maxPrice <= 1e6 ? maxPrice : 0;
    const countryIso = /^[A-Z]{2}$/.test(String(req.query.country || '')) ? String(req.query.country) : '';
    if (q) await bazaarEnsureKeys();
    const rawQ = String(req.query.q || '').trim().slice(0, 40);
    const openNow = req.query.open === '1';
    const base = { q, rawQ, category, cats, sub, near, countryIso, openNow, maxPrice: priceCap, newOnly: sort === 'new' };
    let rows = await bazaarCandidates(base);
    // Typo-proof: nobody spelled like that, so try near spellings.
    let fuzzy = false;
    if (q && !rows.length && !priceCap) {
      const fuzzyOwners = await bazaarFuzzyOwners(rawQ, near ? '' : countryIso);
      if (fuzzyOwners.owners.size) {
        rows = await bazaarCandidates({ ...base, fuzzyOwners });
        fuzzy = rows.length > 0;
      }
    }
    const ratings = (sort === 'rating' || minRating) ? await bazaarRatings(rows.map((r) => r._id)) : new Map();
    for (const r of rows) r.rating = ratings.get(String(r._id)) || null;
    if (minRating) rows = rows.filter((r) => r.rating && r.rating.count && r.rating.avg >= minRating);
    const volume = await bazaarVolumes(rows.map((r) => r._id));
    const top = bazaar.bazaarRank(rows, volume, { q, near, sort });
    // Ratings for the ten shown, when the order did not already need them.
    const shownRatings = ratings.size ? ratings : await bazaarRatings(top.map((r) => r._id));
    // Logos for the ten that are shown, not the four hundred considered.
    const logos = await CreatorLogo.find({ userId: { $in: top.map((r) => r._id) } }).select('userId dataUrl').lean();
    const logoBy = new Map(logos.map((l) => [String(l.userId), l.dataUrl]));
    const shops = top.map((r) => ({
      symbolId: r.symbolId,
      countryIso: r.countryIso,
      handle: r.handle,
      handleFirst: r.handleFirst,
      handleLast: r.handleLast,
      category: r.category,
      category2: r.category2,
      subcategory: r.subcategory,
      isNew: Boolean(r.joinedAt && Date.now() - new Date(r.joinedAt).getTime() < bazaar.BAZAAR_NEW_DAYS * 86400000),
      rating: shownRatings.get(String(r._id)) || null,
      color: r.color,
      logo: logoBy.get(String(r._id)) || null,
      distanceM: near ? bazaar.bazaarRoundDistance(r.distanceM) : null,
      lat: near ? r.lat : null,
      lng: near ? r.lng : null,
      // "Sells Samosa", when the shop was found by what it sells rather
      // than by its name.
      matchedItem: r.matchedItem || '',
      hours: r.hours
      // No volume, no count of payments, nothing about money. The order
      // is the only trace the ranking leaves.
    }));
    return res.json({ success: true, shops, fuzzy });
  } catch (error) {
    console.error('Bazaar search error:', error);
    return res.status(500).json({ success: false, message: 'Could not search right now.' });
  }
});

// GET /api/bazaar/suggest?q=sam&country=IN
// What to offer while somebody types: up to four shops, five item names
// and the categories the words mean. Names only — no money, no order.
app.get('/api/bazaar/suggest', lookupLimit, requireAuth, async (req, res) => {
  try {
    const q = bazaar.bazaarQuery(req.query.q);
    const rawQ = String(req.query.q || '').trim().slice(0, 40);
    if (!q || [...q].length < 2) return res.json({ success: true, shops: [], items: [], categories: [] });
    await bazaarEnsureKeys();
    const countryIso = /^[A-Z]{2}$/.test(String(req.query.country || '')) ? String(req.query.country) : '';
    const re = new RegExp(`^${bazaar.bazaarEscapeRegex(q)}`, 'i');
    const keyRe = searchKey.searchKeyRegex(searchKey.searchKeyQuery(rawQ));
    const shopOr = [{ 'creatorProfile.handle': re }, { 'creatorProfile.handleFirst': re }];
    if (keyRe) shopOr.push({ 'creatorProfile.searchKey': keyRe });
    const shopMatch = { 'creatorProfile.handle': { $type: 'string', $ne: '' }, 'creatorProfile.listed': { $ne: false }, $or: shopOr };
    if (countryIso) shopMatch.countryIso = countryIso;
    const shopRows = await User.find(shopMatch)
      .select('symbolId countryIso creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast creatorProfile.category')
      .limit(4).lean();
    const titleRe = new RegExp(`(^|\\s)${bazaar.bazaarEscapeRegex(rawQ)}`, 'i');
    const itemOr = [{ title: titleRe }];
    if (keyRe) itemOr.push({ searchKey: keyRe });
    const itemRows = await CreatorItem.find({ $or: itemOr }).select('title').limit(60).lean();
    const seen = new Set();
    const items = [];
    for (const it of itemRows) {
      const t = String(it.title || '').trim();
      const k = t.toLowerCase();
      if (!t || seen.has(k)) continue;
      seen.add(k);
      items.push(t);
      if (items.length >= 5) break;
    }
    return res.json({
      success: true,
      shops: shopRows.map((u) => ({
        symbolId: u.symbolId,
        countryIso: u.countryIso || '',
        handle: (u.creatorProfile || {}).handle,
        handleFirst: (u.creatorProfile || {}).handleFirst || '',
        handleLast: (u.creatorProfile || {}).handleLast || '',
        category: bazaar.BAZAAR_CATEGORIES.includes((u.creatorProfile || {}).category) ? u.creatorProfile.category : ''
      })),
      items,
      categories: bazaar.bazaarCategoriesForQuery(rawQ, searchKey.looseKey).slice(0, 3)
    });
  } catch (error) {
    console.error('Bazaar suggest error:', error);
    return res.status(500).json({ success: false, message: 'Could not suggest right now.' });
  }
});

// GET /api/bazaar/categories?lat=..&lng=..&radiusKm=2
app.get('/api/bazaar/categories', lookupLimit, requireAuth, async (req, res) => {
  try {
    const near = bazaar.bazaarNear(req.query);
    const countryIso = /^[A-Z]{2}$/.test(String(req.query.country || '')) ? String(req.query.country) : '';
    const rows = await bazaarCandidates({ near, needCategory: true, countryIso });
    const volume = await bazaarVolumes(rows.map((r) => r._id));
    return res.json({ success: true, categories: bazaar.bazaarCategoryOrder(rows, volume) });
  } catch (error) {
    console.error('Bazaar categories error:', error);
    return res.status(500).json({ success: false, message: 'Could not load categories right now.' });
  }
});

// GET /api/creator/handle-available?first=…&last=… — live, as somebody types.
//
// Deliberately NOT a reservation: answering "free" here does not hold the
// handle, and two creators typing the same name at the same moment will
// both be told it is free. The unique index on creatorProfile.handle is
// what actually decides, and the save route below turns its refusal into
// the same message. This route exists so the common case is answered while
// the person is still looking at the box, not so it can be trusted.
app.get('/api/creator/handle-available', lookupLimit, requireAuth, async (req, res) => {
  try {
    const built = buildCreatorHandle(req.query.first, req.query.last);
    if (!built.ok) {
      return res.json({ success: true, available: false, code: built.code, message: built.message });
    }
    const brandNo = creatorBrandRefusal(built, ((req.authUser && req.authUser.creatorProfile) || {}).handle);
    if (brandNo) {
      return res.json({ success: true, available: false, code: brandNo.code, message: brandNo.message });
    }
    const taken = await creatorHandleTaken(built.handle, req.authUser._id);
    return res.json({
      success: true,
      handle: built.handle,
      available: !taken,
      message: taken ? 'That name is already taken.' : ''
    });
  } catch (error) {
    console.error('Creator handle availability error:', error);
    return res.status(500).json({ success: false, message: 'Could not check that name right now.' });
  }
});

// GET /api/creator/:symbolId/profile — the creator as others see them.
//
// The owner reading their own gets the address back whether or not it is
// public, because it is theirs; anybody else gets it only if they published
// it. That single branch is the whole privacy rule.
app.get('/api/creator/:symbolId/profile', lookupLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const user = symbolId ? await User.findOne({ symbolId }).select('_id symbolId creatorProfile countryIso').lean() : null;
    if (!user) {
      return res.status(404).json({
        success: false, code: 'user_not_found', message: 'No account found for that Gloobal ID.'
      });
    }
    const logo = await CreatorLogo.findOne({ userId: user._id }).select('dataUrl').lean();
    const isOwner = String(user._id) === String(req.authUser._id);
    const out = publicCreator(user, logo?.dataUrl);
    if (isOwner) {
      const profile = user.creatorProfile || {};
      out.address = profile.address || '';
      out.addressParts = creatorAddressPartsOut(profile.addressParts);
      out.setupSkippedAt = profile.setupSkippedAt || null;
      out.completedAt = profile.completedAt || null;
    }
    const [items, repeatPayers, cover, reviews] = await Promise.all([
      creatorItemsFor(user.symbolId),
      creatorRepeatPayers(user._id),
      CreatorCover.findOne({ userId: user._id }).select('dataUrl focusY').lean(),
      creatorReviewSummary(user._id)
    ]);
    out.items = items;
    out.repeatPayers = repeatPayers;
    out.reviews = reviews;
    out.cover = cover ? { photo: cover.dataUrl, focusY: cover.focusY } : null;
    res.set('Cache-Control', 'private, max-age=60');
    return res.json({ success: true, creator: out, isOwner });
  } catch (error) {
    console.error('Creator profile read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load that creator right now.' });
  }
});

// PUT /api/creator/:symbolId/profile — the owner saves their creator side.
//
// Every field is optional on its own, but the handle is all-or-nothing: a
// request carrying one half and not the other is a bug, not a half-save,
// and is refused rather than stored as `rasoi.`.
app.put(
  '/api/creator/:symbolId/profile',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  parseProfilePhotoBody,
  async (req, res) => {
    try {
      const userId = req.authUser._id;
      const body = req.body || {};
      const set = {};

      const wantsHandle = body.handleFirst !== undefined || body.handleLast !== undefined;
      if (wantsHandle) {
        const built = buildCreatorHandle(body.handleFirst, body.handleLast);
        if (!built.ok) {
          return res.status(400).json({ success: false, code: built.code, message: built.message });
        }
        const brandNo = creatorBrandRefusal(built, ((req.authUser && req.authUser.creatorProfile) || {}).handle);
        if (brandNo) {
          return res.status(400).json({ success: false, code: brandNo.code, message: brandNo.message });
        }
        if (await creatorHandleTaken(built.handle, userId)) {
          return res.status(409).json({
            success: false, code: 'handle_taken', message: 'That name is already taken.'
          });
        }
        set['creatorProfile.handleFirst'] = built.first;
        set['creatorProfile.handleLast'] = built.last;
        set['creatorProfile.searchKey'] = searchKey.searchKeyOf(`${built.first} ${built.last || ''}`);
        set['creatorProfile.handle'] = built.handle;
        set['creatorProfile.completedAt'] = new Date();
        // Finishing clears the "they skipped it" mark, so the Creator
        // dashboard stops offering a screen that has been dealt with.
        set['creatorProfile.setupSkippedAt'] = null;
      }

      if (body.address !== undefined) {
        if (typeof body.address !== 'string' || body.address.length > 400) {
          return res.status(400).json({
            success: false, code: 'invalid_address', message: 'That address is too long.'
          });
        }
        set['creatorProfile.address'] = body.address.trim();
      }
      // The address in its parts. When these arrive, `address` is composed
      // from them here — one place decides how the lines join, so the shop
      // page, the profile card and anything older that reads `address`
      // all say the same thing.
      if (body.addressParts !== undefined) {
        const parts = creatorAddressPartsIn(body.addressParts);
        if (!parts.ok) {
          return res.status(400).json({ success: false, code: parts.code, message: parts.message });
        }
        set['creatorProfile.addressParts'] = parts.value;
        set['creatorProfile.address'] = creatorAddressCompose(parts.value);
      }
      if (body.scanNote !== undefined) {
        if (typeof body.scanNote !== 'string' || body.scanNote.length > 120) {
          return res.status(400).json({
            success: false, code: 'invalid_scan_note', message: 'That message is too long.'
          });
        }
        set['creatorProfile.scanNote'] = body.scanNote.trim();
      }
      if (body.scanNoteStyle !== undefined) {
        if (!CREATOR_SCAN_NOTE_STYLES.includes(body.scanNoteStyle)) {
          return res.status(400).json({
            success: false, code: 'invalid_scan_note_style', message: 'That is not a strip style.'
          });
        }
        set['creatorProfile.scanNoteStyle'] = body.scanNoteStyle;
      }
      if (body.addressPublic !== undefined) {
        set['creatorProfile.addressPublic'] = Boolean(body.addressPublic);
      }
      if (body.category !== undefined) {
        if (body.category !== '' && !bazaar.BAZAAR_CATEGORIES.includes(body.category)) {
          return res.status(400).json({ success: false, code: 'invalid_category', message: 'That is not a category.' });
        }
        set['creatorProfile.category'] = body.category;
      }
      // A second category and a sub-category of the first (0141). The
      // sub-category must belong to the category it is saved with.
      if (body.category2 !== undefined) {
        if (body.category2 !== '' && !bazaar.BAZAAR_CATEGORIES.includes(body.category2)) {
          return res.status(400).json({ success: false, code: 'invalid_category', message: 'That is not a category.' });
        }
        set['creatorProfile.category2'] = body.category2;
      }
      if (body.subcategory !== undefined) {
        const cat = body.category !== undefined ? body.category : ((req.authUser.creatorProfile || {}).category || '');
        if (body.subcategory !== '' && !bazaar.bazaarSubcategoryValid(cat, String(body.subcategory))) {
          return res.status(400).json({ success: false, code: 'invalid_subcategory', message: 'That is not part of the category.' });
        }
        set['creatorProfile.subcategory'] = String(body.subcategory || '');
      }
      // When the shop first set itself up, for "New on GLOOBAL". Once.
      if (!((req.authUser.creatorProfile || {}).joinedAt) && (body.category !== undefined || wantsHandle)) {
        set['creatorProfile.joinedAt'] = new Date();
      }
      if (body.listed !== undefined) {
        set['creatorProfile.listed'] = Boolean(body.listed);
      }
      if (body.about !== undefined) {
        if (typeof body.about !== 'string' || body.about.length > 280) {
          return res.status(400).json({ success: false, code: 'invalid_about', message: 'Keep the About line under 280 characters.' });
        }
        set['creatorProfile.about'] = body.about.trim();
      }
      if (body.contacts !== undefined) {
        const checked = creatorContactsIn(body.contacts);
        if (!checked.ok) return res.status(400).json({ success: false, code: 'invalid_contact', message: checked.message });
        set['creatorProfile.contacts'] = checked.value;
      }
      if (body.hours !== undefined) {
        const checked = openHours.openHoursValidate(body.hours);
        if (!checked.ok) {
          return res.status(400).json({ success: false, code: 'invalid_hours', message: checked.message });
        }
        set['creatorProfile.hours'] = checked.value;
      }
      // Sent when somebody dismisses the setup screen without finishing.
      // Never clears `completedAt` — skipping after finishing is not a way
      // to un-finish.
      if (body.skipped === true && !wantsHandle) {
        set['creatorProfile.setupSkippedAt'] = new Date();
      }

      if (body.logo !== undefined) {
        if (body.logo === null) {
          await CreatorLogo.deleteOne({ userId });
        } else {
          // The same validator the profile photo uses: JPEG or PNG only,
          // magic bytes checked against the declared type, 200 KB cap.
          const validated = validateProfilePhoto(body.logo);
          if (!validated.ok) {
            return res.status(validated.status).json({
              success: false, code: validated.code, message: validated.message
            });
          }
          const fields = { dataUrl: validated.dataUrl, mimeType: validated.mimeType, bytes: validated.bytes };
          try {
            await CreatorLogo.updateOne({ userId }, { $set: fields }, { upsert: true });
          } catch (writeError) {
            // Two uploads racing for an account with no row yet can both
            // try the insert; the unique userId index refuses the second.
            if (writeError?.code !== 11000) throw writeError;
            await CreatorLogo.updateOne({ userId }, { $set: fields });
          }
        }
      }

      if (Object.keys(set).length) {
        try {
          await User.updateOne({ _id: userId }, { $set: set });
        } catch (writeError) {
          // The index is the real decision, not the availability check
          // above: two creators can be told the same name is free and only
          // one of them can have it.
          if (writeError?.code === 11000) {
            return res.status(409).json({
              success: false, code: 'handle_taken', message: 'That name was just taken.'
            });
          }
          throw writeError;
        }
      }

      const fresh = await User.findById(userId).select('_id symbolId creatorProfile countryIso').lean();
      const logo = await CreatorLogo.findOne({ userId }).select('dataUrl').lean();
      const out = publicCreator(fresh, logo?.dataUrl);
      out.address = (fresh.creatorProfile || {}).address || '';
      out.addressParts = creatorAddressPartsOut((fresh.creatorProfile || {}).addressParts);
      out.setupSkippedAt = (fresh.creatorProfile || {}).setupSkippedAt || null;
      out.completedAt = (fresh.creatorProfile || {}).completedAt || null;
      return res.json({ success: true, creator: out });
    } catch (error) {
      console.error('Creator profile update error:', error);
      return res.status(500).json({ success: false, message: 'Could not save that right now.' });
    }
  }
);

// GET /api/creator/resolve/:handle — a handle, turned into an account.
//
// This is the route that makes the handle a payment address rather than a
// label: the Send flow hands it `rasoi.ghar` and gets back the symbolId it
// already knows how to pay. The handle is normalised the same way it was
// stored, so somebody typing it with different capitalisation still lands.
app.get('/api/creator/resolve/:handle', lookupLimit, requireAuth, async (req, res) => {
  try {
    const raw = typeof req.params.handle === 'string' ? decodeURIComponent(req.params.handle) : '';
    // A name may be one word or two. Split on the FIRST dot only — a
    // second dot is not a third part, it is a character this never
    // allowed inside a part, and buildCreatorHandle refuses it below.
    const at = raw.indexOf('.');
    const built = at < 0
      ? buildCreatorHandle(raw, '')
      : buildCreatorHandle(raw.slice(0, at), raw.slice(at + 1));
    if (!built.ok) {
      return res.status(400).json({ success: false, code: built.code, message: built.message });
    }
    const user = await User.findOne({ 'creatorProfile.handle': built.handle })
      .select('_id symbolId fullName creatorProfile countryIso').lean();
    if (!user) {
      return res.status(404).json({
        success: false, code: 'creator_not_found', message: 'No creator found with that name.'
      });
    }
    const logo = await CreatorLogo.findOne({ userId: user._id }).select('dataUrl').lean();
    // The whole page in one call. A creator page opened from search draws
    // the mark, the name, the repeat-payer count and the price list at
    // once; three round trips would show it assembling itself in pieces on
    // a phone connection.
    const [items, repeatPayers, cover, reviews] = await Promise.all([
      creatorItemsFor(user.symbolId),
      creatorRepeatPayers(user._id),
      CreatorCover.findOne({ userId: user._id }).select('dataUrl focusY').lean(),
      creatorReviewSummary(user._id)
    ]);
    const creator = publicCreator(user, logo?.dataUrl);
    creator.items = items;
    creator.repeatPayers = repeatPayers;
    creator.reviews = reviews;
    creator.cover = cover ? { photo: cover.dataUrl, focusY: cover.focusY } : null;
    return res.json({ success: true, creator });
  } catch (error) {
    console.error('Creator resolve error:', error);
    return res.status(500).json({ success: false, message: 'Could not look that name up right now.' });
  }
});

// ── A SHOP'S LOOK, ON THE WAY OUT ───────────────────────────────────────
//
// The colour is checked against the palette HERE as well as on the way in.
// Validating once, at write time, would be enough if nothing else ever wrote
// to this document — but a value that reaches a style attribute is worth
// refusing twice, and the cost is a loop over twelve strings.
var CREATOR_SHOP_COLORS = [
  '#C2663A', '#B2473F', '#9A6A2F', '#4F7A46',
  '#2F7A74', '#2E5E9E', '#4A4BA8', '#7C3AED',
  '#A3327E', '#5A4636', '#36414E', '#1F6B4B'
];
var CREATOR_SHOP_ENUMS = {
  theme: ['gloobal', 'street', 'studio', 'market', 'night', 'chai', 'mithai', 'boutique', 'pharmacy', 'dhaba', 'kirana', 'minimal'],
  font: ['grotesk', 'fraunces', 'inter', 'mono', 'mukta', 'tiro', 'baloo', 'poppins', 'hind', 'rozha', 'yatra', 'kalam', 'teko'],
  corners: ['sharp', 'soft', 'round', 'leaf'],
  cards: ['raised', 'flat', 'outline', 'plain'],
  density: ['compact', 'cosy', 'roomy'],
  photoShape: ['rounded', 'circle', 'wide', 'tall'],
  layout: ['list', 'grid'],
  buttons: ['filled', 'outline', 'soft'],
  heroStyle: ['gradient', 'solid', 'glass', 'minimal'],
  coverStyle: ['photo', 'gradient', 'pattern'],
  pattern: ['dots', 'stripes', 'rangoli', 'grid']
};

function creatorShopColor(value) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  for (const c of CREATOR_SHOP_COLORS) if (c === raw) return c;
  return '';
}

function creatorShopOut(shop) {
  const s = (shop && typeof shop === 'object') ? shop : {};
  const pick = (field) => (CREATOR_SHOP_ENUMS[field].indexOf(s[field]) >= 0 ? s[field] : CREATOR_SHOP_ENUMS[field][0]);
  return {
    theme: pick('theme'),
    color: creatorShopColor(s.color),
    font: pick('font'),
    corners: pick('corners'),
    cards: pick('cards'),
    density: pick('density'),
    photoShape: pick('photoShape'),
    layout: pick('layout'),
    buttons: pick('buttons'),
    heroStyle: pick('heroStyle'),
    coverStyle: pick('coverStyle'),
    pattern: pick('pattern'),
    dark: Boolean(s.dark),
    tagline: typeof s.tagline === 'string' ? s.tagline : '',
    announceText: typeof s.announceText === 'string' ? s.announceText : '',
    announceColor: creatorShopColor(s.announceColor),
    announceOn: s.announceOn !== false
  };
}

// PUT /api/creator/:symbolId/shop — the owner saves how their shop looks.
//
// Separate from the profile route because these are different things changed
// at different moments: the profile is an identity (name, address) and this
// is a look. Keeping them apart means saving a colour cannot touch a handle,
// which is the field with a unique index and real consequences.
app.put(
  '/api/creator/:symbolId/shop',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const user = await User.findOne({ symbolId }).select('_id creatorProfile').lean();
      if (!user) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No account found.' });

      // Merged over what is stored, so a screen that saves only the colour
      // does not blank the tagline somebody typed on a different screen.
      const next = creatorShopOut(Object.assign({}, (user.creatorProfile || {}).shop || {}, body));
      // Enums and the palette are handled by creatorShopOut; the two free
      // strings are the ones to bound here.
      next.tagline = String(next.tagline || '').trim().slice(0, 60);
      next.announceText = String(next.announceText || '').trim().slice(0, 70);

      await User.updateOne({ _id: user._id }, { $set: { 'creatorProfile.shop': next } });
      return res.json({ success: true, shop: next });
    } catch (error) {
      console.error('Creator shop write error:', error);
      return res.status(500).json({ success: false, message: 'Could not save how your shop looks right now.' });
    }
  }
);

// PUT /api/creator/:symbolId/cover — the photo across the top, and its crop.
//
// `focusY` alone is a valid request: nudging the crop must not make the
// client re-upload 200 KB it already sent, and re-encoding a photo every
// time somebody drags it would lose quality on each drag.
app.put(
  '/api/creator/:symbolId/cover',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  parseProfilePhotoBody,
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const user = await User.findOne({ symbolId }).select('_id').lean();
      if (!user) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No account found.' });
      const body = (req.body && typeof req.body === 'object') ? req.body : {};

      if (body.remove === true) {
        await CreatorCover.deleteOne({ userId: user._id });
        return res.json({ success: true, cover: null });
      }

      const focusY = Number.isFinite(Number(body.focusY))
        ? Math.min(100, Math.max(0, Number(body.focusY)))
        : null;

      if (typeof body.photo === 'string' && body.photo) {
        // Same validator as the profile photo and the shop's mark: JPEG or
        // PNG only, magic bytes checked, 200 KB, SVG refused — and it
        // matters most on this one, which is the first thing a stranger
        // loads when they open a shop they found by searching a name.
        const verdict = validateProfilePhoto(body.photo);
        if (!verdict.ok) return res.status(400).json({ success: false, message: verdict.message });
        await CreatorCover.updateOne(
          { userId: user._id },
          { $set: { dataUrl: body.photo, mimeType: verdict.mimeType, bytes: verdict.bytes, focusY: focusY == null ? 50 : focusY } },
          { upsert: true }
        );
      } else if (focusY != null) {
        const existing = await CreatorCover.findOne({ userId: user._id }).select('_id').lean();
        if (!existing) return res.status(400).json({ success: false, message: 'There is no cover photo to move yet.' });
        await CreatorCover.updateOne({ userId: user._id }, { $set: { focusY } });
      } else {
        return res.status(400).json({ success: false, message: 'Send a photo, a crop position, or remove.' });
      }

      const saved = await CreatorCover.findOne({ userId: user._id }).select('dataUrl focusY').lean();
      return res.json({ success: true, cover: saved ? { photo: saved.dataUrl, focusY: saved.focusY } : null });
    } catch (error) {
      console.error('Creator cover write error:', error);
      return res.status(500).json({ success: false, message: 'Could not save that cover right now.' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════
// A CREATOR'S TWO LISTS
//
// What I sell, which anybody can read, and who I buy from, which only I
// can. Both hang off a creator page; only the first is part of a creator's
// public face. The reasoning for the split lives in models/CreatorSupplier.js.
// ════════════════════════════════════════════════════════════════════════

// How many DIFFERENT people have paid this creator more than once.
//
// This replaced a count of pins. A pin is a tap, so a pin count is a number
// its own subject can run up from throwaway accounts, and it was being shown
// in the position a reader takes as reputation. This one cannot be typed: it
// is a by-product of payments that already settled, and inflating it costs
// real money moved between real accounts twice.
//
// Deliberately not "total payments" — one devoted customer paying daily
// would read as a crowd. Distinct payers, each counted once, who came back.
async function creatorRepeatPayers(userId) {
  try {
    const rows = await Transaction.aggregate([
      { $match: { toUserId: new mongoose.Types.ObjectId(String(userId)), status: 'success' } },
      { $group: { _id: '$fromUserId', n: { $sum: 1 } } },
      { $match: { n: { $gte: 2 } } },
      { $count: 'people' }
    ]);
    return rows.length ? rows[0].people : 0;
  } catch (error) {
    // A count is decoration on a page whose job is payment. If the
    // aggregation fails the page still has to open, so this answers zero
    // rather than taking the screen down with it.
    console.error('Creator repeat-payer count error:', error);
    return 0;
  }
}

// ── REVIEWS ─────────────────────────────────────────────────────────────
//
// Public stars and a line of text, anonymous to every reader, and only from
// people who have paid the shop. See models/CreatorReview.js for why those
// three rules are the ones that make the other choices safe.

var CREATOR_REVIEW_TEXT_MAX = 280;

async function creatorReviewSummary(userId) {
  try {
    const rows = await CreatorReview.aggregate([
      { $match: { creatorUserId: new mongoose.Types.ObjectId(String(userId)) } },
      { $group: { _id: '$stars', n: { $sum: 1 } } }
    ]);
    const byStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let count = 0;
    let sum = 0;
    for (const r of rows) {
      const k = Number(r._id);
      if (k >= 1 && k <= 5) { byStars[k] = r.n; count += r.n; sum += k * r.n; }
    }
    return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, byStars };
  } catch (error) {
    // Like the repeat-payer count: decoration on a page whose job is
    // payment. A failed aggregation must not take the page down.
    console.error('Creator review summary error:', error);
    return { count: 0, average: 0, byStars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }
}

async function creatorReviewHasPaid(authorId, shopUserId) {
  // 'success' is what the send route writes (Transaction's status enum has
  // no 'completed'), so asking for 'completed' meant no payer could ever
  // leave a review.
  const found = await Transaction.exists({ fromUserId: authorId, toUserId: shopUserId, status: 'success' });
  return Boolean(found);
}

// What a reader sees. No author, ever — `mine` is the only trace, and it
// is computed against the reader, so it tells nobody anything about anyone
// else.
function publicCreatorReview(row, readerId) {
  return {
    id: String(row._id),
    stars: row.stars,
    text: row.text || '',
    at: row.updatedAt || row.createdAt,
    mine: String(row.authorUserId) === String(readerId)
  };
}

async function creatorReviewsPayload(creator, reader) {
  const isOwner = String(creator._id) === String(reader._id);
  const [summary, rows, mineRow, paid] = await Promise.all([
    creatorReviewSummary(creator._id),
    CreatorReview.find({ creatorUserId: creator._id }).sort({ updatedAt: -1 }).limit(60).lean(),
    isOwner ? null : CreatorReview.findOne({ creatorUserId: creator._id, authorUserId: reader._id }).lean(),
    isOwner ? false : creatorReviewHasPaid(reader._id, creator._id)
  ]);
  return {
    summary,
    reviews: rows.map((r) => publicCreatorReview(r, reader._id)),
    mine: mineRow ? publicCreatorReview(mineRow, reader._id) : null,
    isOwner,
    // Why the form is or is not offered, so the client says the right
    // sentence rather than guessing.
    canReview: !isOwner && paid,
    reason: isOwner ? 'own_shop' : (paid ? '' : 'not_a_customer')
  };
}

// GET /api/creator/:symbolId/reviews — anybody signed in may read them.
app.get('/api/creator/:symbolId/reviews', lookupLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const creator = symbolId ? await User.findOne({ symbolId }).select('_id').lean() : null;
    if (!creator) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No shop found.' });
    const payload = await creatorReviewsPayload(creator, req.authUser);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Creator reviews read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load reviews right now.' });
  }
});

// PUT /api/creator/:symbolId/reviews — write or replace YOUR review.
//
// PUT, not POST: there is one review per person per shop, and sending it
// again replaces it. The unique index is what makes that true under a
// double tap, not the findOne.
app.put('/api/creator/:symbolId/reviews', writeLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const creator = symbolId ? await User.findOne({ symbolId }).select('_id').lean() : null;
    if (!creator) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No shop found.' });
    if (String(creator._id) === String(req.authUser._id)) {
      return res.status(403).json({ success: false, code: 'own_shop', message: 'You cannot review your own shop.' });
    }
    if (!(await creatorReviewHasPaid(req.authUser._id, creator._id))) {
      return res.status(403).json({
        success: false, code: 'not_a_customer',
        message: 'Reviews come from people who have paid this shop. Pay once, then you can rate it.'
      });
    }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const stars = Number(body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, code: 'invalid_stars', message: 'Pick from 1 to 5 stars.' });
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length > CREATOR_REVIEW_TEXT_MAX) {
      return res.status(400).json({ success: false, code: 'invalid_review_text', message: `Keep it under ${CREATOR_REVIEW_TEXT_MAX} characters.` });
    }
    await CreatorReview.updateOne(
      { creatorUserId: creator._id, authorUserId: req.authUser._id },
      { $set: { stars, text } },
      { upsert: true, runValidators: true }
    );
    const payload = await creatorReviewsPayload(creator, req.authUser);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Creator review write error:', error);
    return res.status(500).json({ success: false, message: 'Could not save your review right now.' });
  }
});

// DELETE /api/creator/:symbolId/reviews/mine — take your own review down.
// Only ever your own: there is no route by which an owner removes a
// review, because an owner who could would keep only the good ones.
app.delete('/api/creator/:symbolId/reviews/mine', writeLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    const creator = symbolId ? await User.findOne({ symbolId }).select('_id').lean() : null;
    if (!creator) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No shop found.' });
    await CreatorReview.deleteOne({ creatorUserId: creator._id, authorUserId: req.authUser._id });
    const payload = await creatorReviewsPayload(creator, req.authUser);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Creator review delete error:', error);
    return res.status(500).json({ success: false, message: 'Could not remove your review right now.' });
  }
});

var CREATOR_ITEMS_MAX = 60;

// Four pictures per thing. These are data URLs living on the item document,
// so a shop with sixty products and four photos each is the difference
// between a list that loads on a phone and one that does not.
var CREATOR_ITEM_PHOTOS_MAX = 4;

function publicCreatorItem(row) {
  return {
    id: String(row._id),
    title: row.title,
    price: row.price,
    currency: row.currency,
    note: row.note || '',
    category: row.category || '',
    badge: row.badge || '',
    photo: row.photo || '',
    photos: Array.isArray(row.photos) && row.photos.length ? row.photos : (row.photo ? [row.photo] : []),
    soldOut: Boolean(row.soldOut),
    special: Boolean(row.special),
    order: Number(row.order) || 0
  };
}

async function creatorItemsFor(symbolId) {
  const rows = await CreatorItem.find({ ownerSymbolId: symbolId })
    .sort({ order: 1, createdAt: 1 }).limit(CREATOR_ITEMS_MAX).lean();
  // ── THE LISTS SAVED IN DOLLARS BY MISTAKE ─────────────────────────────
  // Until 0143 every list was stamped USD whatever the shop's country (see
  // the PUT below). A non-US shop whose rows say USD is that bug, not a
  // choice: the numbers were typed in the shop's own money. They are
  // re-stamped in the shop's currency here, once, and saved, so the fix
  // reaches lists nobody edits again.
  if (rows.some((r) => r.currency === 'USD')) {
    const owner = await User.findOne({ symbolId }).select('countryIso mobileNumber').lean();
    const own = owner ? await resolveOwnCurrency(owner) : null;
    if (own && own !== 'USD') {
      await CreatorItem.updateMany({ ownerSymbolId: symbolId, currency: 'USD' }, { $set: { currency: own } });
      for (const r of rows) if (r.currency === 'USD') r.currency = own;
    }
  }
  return rows.map(publicCreatorItem);
}

// GET /api/creator/:symbolId/items — the price list, readable by anybody.
app.get('/api/creator/:symbolId/items', lookupLimit, requireAuth, async (req, res) => {
  try {
    const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
    if (!symbolId) return res.status(400).json({ success: false, message: 'A Gloobal ID is needed.' });
    const items = await creatorItemsFor(symbolId);
    res.set('Cache-Control', 'private, max-age=30');
    return res.json({ success: true, items });
  } catch (error) {
    console.error('Creator items read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load that list right now.' });
  }
});

// PUT /api/creator/:symbolId/items — the owner replaces their whole list.
//
// Replace rather than per-item CRUD, because the client already holds the
// whole list to draw it and reordering is the common edit. One request that
// states the final shape cannot leave the order half-applied the way a
// sequence of per-item PATCHes can when the third one fails.
//
// ── PICTURES ALREADY ON THE SERVER ARE NOT SENT AGAIN ──────────────────
//
// Because the list is replaced whole, every save used to carry every
// picture of every thing — at four 200 KB photos a thing, a list of
// fifteen is 12 MB on a phone connection to change one price. A photo the
// server already holds is sent as a reference instead:
//
//     "ref:<item id>:<index>"
//
// naming the stored row and which of its pictures. The route resolves the
// reference against the owner's CURRENT rows before replacing them, so a
// body is ordinarily a few KB plus whatever pictures are actually new.
// The parser's 3 MB is therefore room for the new pictures of one save
// (four, at most, each under 200 KB before base64), not for the list.
const creatorItemsJsonParser = express.json({ limit: '3mb' });
const parseCreatorItemsBody = (req, res, next) => {
  creatorItemsJsonParser(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        code: 'items_too_large',
        message: 'Those photos are too large to send together. Save this item with fewer new photos.',
      });
    }
    return res.status(400).json({ success: false, code: 'invalid_items', message: 'That list could not be read.' });
  });
};
const CREATOR_ITEM_PHOTO_REF = /^ref:([a-f0-9]{24}):([0-3])$/i;

app.put(
  '/api/creator/:symbolId/items',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  parseCreatorItemsBody,
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const incoming = Array.isArray(req.body && req.body.items) ? req.body.items : null;
      if (!incoming) {
        return res.status(400).json({ success: false, message: 'A list of items is needed.' });
      }
      if (incoming.length > CREATOR_ITEMS_MAX) {
        return res.status(400).json({
          success: false,
          message: `A creator can list up to ${CREATOR_ITEMS_MAX} things.`
        });
      }

      // The currency is the ACCOUNT'S, read from the server rather than
      // taken from the body. A price is a claim about money, and the client
      // does not get to say which money.
      //
      // From the account's COUNTRY (resolveOwnCurrency), the same source a
      // payment's currency comes from. This read `owner.currency` — a field
      // the User model does not have — so every list was saved in USD and an
      // Indian shop's ₹50 chai showed as $50 (the founder's report, 0143).
      const owner = await User.findOne({ symbolId }).select('_id countryIso mobileNumber').lean();
      if (!owner) return res.status(404).json({ success: false, code: 'user_not_found', message: 'No account found.' });
      const currency = await resolveOwnCurrency(owner);
      if (!currency) {
        return res.status(400).json({ success: false, message: 'Prices are not supported for this country yet.' });
      }

      // The pictures this shop already holds, for the references above.
      const existing = await CreatorItem.find({ ownerSymbolId: symbolId }).select('_id photo photos').lean();
      const storedPhoto = (ref) => {
        const m = CREATOR_ITEM_PHOTO_REF.exec(ref);
        if (!m) return null;
        const row = existing.find((r) => String(r._id) === m[1].toLowerCase());
        if (!row) return null;
        const list = Array.isArray(row.photos) && row.photos.length ? row.photos : (row.photo ? [row.photo] : []);
        return list[Number(m[2])] || null;
      };

      const clean = [];
      // Three specials at most; past the third, the flag is dropped rather
      // than the save refused — the list itself is still good.
      let specials = 0;
      for (let i = 0; i < incoming.length; i += 1) {
        const raw = incoming[i] || {};
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        const price = Number(raw.price);
        if (!title) return res.status(400).json({ success: false, message: 'Every item needs a name.' });
        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).json({ success: false, message: `"${title}" needs a price.` });
        }
        // ── EVERY PICTURE OF THIS THING, COVER FIRST ──────────────────
        //
        // A client may send `photos` (the new shape) or `photo` alone (what
        // the first version of this screen sent). Both are accepted and the
        // two are kept in step here, so nothing downstream has to work out
        // which one is authoritative: photo IS photos[0], always.
        const sent = Array.isArray(raw.photos)
          ? raw.photos
          : (typeof raw.photo === 'string' && raw.photo ? [raw.photo] : []);
        const photos = [];
        for (const candidate of sent) {
          if (typeof candidate !== 'string' || !candidate) continue;
          if (photos.length >= CREATOR_ITEM_PHOTOS_MAX) break;
          // A picture the server already holds, named rather than re-sent.
          // One that names nothing — a row removed from another phone —
          // is a real disagreement about what the shop holds, and is
          // refused rather than silently dropped.
          if (candidate.startsWith('ref:')) {
            const kept = storedPhoto(candidate);
            if (!kept) {
              return res.status(409).json({ success: false, code: 'photo_ref_stale', message: `"${title}": one of its photos has changed elsewhere. Reload your shop and try again.` });
            }
            photos.push(kept);
            continue;
          }
          // Same validator as a profile photo: JPEG or PNG data URLs only,
          // magic bytes checked, 200 KB cap, SVG refused because it can
          // carry script and these are shown to strangers.
          const verdict = validateProfilePhoto(candidate);
          if (!verdict.ok) {
            return res.status(400).json({ success: false, message: `"${title}": ${verdict.message}` });
          }
          photos.push(candidate);
        }
        const photo = photos[0] || '';
        clean.push({
          ownerSymbolId: symbolId,
          title: title.slice(0, 80),
          price,
          currency,
          note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 140) : '',
          category: typeof raw.category === 'string' ? raw.category.trim().slice(0, 40) : '',
          badge: typeof raw.badge === 'string' ? raw.badge.trim().slice(0, 24) : '',
          photo,
          photos,
          soldOut: Boolean(raw.soldOut),
          special: Boolean(raw.special) && (specials += 1) <= 3,
          order: i,
          searchKey: searchKey.searchKeyOf(`${title} ${typeof raw.category === 'string' ? raw.category : ''}`)
        });
      }

      await CreatorItem.deleteMany({ ownerSymbolId: symbolId });
      if (clean.length) await CreatorItem.insertMany(clean);
      return res.json({ success: true, items: await creatorItemsFor(symbolId) });
    } catch (error) {
      console.error('Creator items write error:', error);
      return res.status(500).json({ success: false, message: 'Could not save that list right now.' });
    }
  }
);

// GET /api/creator/:symbolId/suppliers — OWNER ONLY. See the model for why.
app.get(
  '/api/creator/:symbolId/suppliers',
  lookupLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const rows = await CreatorSupplier.find({ ownerSymbolId: symbolId })
        .sort({ lastOrderAt: -1, createdAt: -1 }).limit(100).lean();

      // ── A SUPPLIER'S OWN MARK ───────────────────────────────────────
      //
      // The rows carry a symbolId and a cached handle, so the list drew
      // initials for shops that have a logo sitting one collection away.
      // Two queries for the whole list rather than one per row: the ids
      // first, then every logo in a single `$in`.
      const ids = rows.map((r) => r.supplierSymbolId).filter(Boolean);
      const logoBySymbol = Object.create(null);
      if (ids.length) {
        const users = await User.find({ symbolId: { $in: ids } }).select('_id symbolId').lean();
        const byId = Object.create(null);
        for (const u of users) byId[String(u._id)] = u.symbolId;
        const logos = await CreatorLogo.find({ userId: { $in: users.map((u) => u._id) } })
          .select('userId dataUrl').lean();
        for (const l of logos) {
          const sym = byId[String(l.userId)];
          if (sym) logoBySymbol[sym] = l.dataUrl;
        }
      }

      return res.json({
        success: true,
        suppliers: rows.map((r) => ({
          symbolId: r.supplierSymbolId,
          handle: r.supplierHandle || '',
          logo: logoBySymbol[r.supplierSymbolId] || null,
          lastOrderAt: r.lastOrderAt || null
        }))
      });
    } catch (error) {
      console.error('Creator suppliers read error:', error);
      return res.status(500).json({ success: false, message: 'Could not load your suppliers right now.' });
    }
  }
);

// POST /api/creator/:symbolId/suppliers — add one BY THEIR CREATOR NAME.
//
// By name and not by Gloobal ID, because the point of a supplier row is the
// list behind it, and only a creator has one. Resolving here also means a
// typo is refused at the moment it is made rather than stored as a row that
// opens onto nothing.
app.post(
  '/api/creator/:symbolId/suppliers',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const raw = typeof (req.body && req.body.handle) === 'string' ? req.body.handle.trim() : '';
      const at = raw.indexOf('.');
      const built = at < 0 ? buildCreatorHandle(raw, '') : buildCreatorHandle(raw.slice(0, at), raw.slice(at + 1));
      if (!built.ok) return res.status(400).json({ success: false, code: built.code, message: built.message });

      const supplier = await User.findOne({ 'creatorProfile.handle': built.handle })
        .select('symbolId').lean();
      if (!supplier) {
        return res.status(404).json({
          success: false, code: 'creator_not_found', message: 'No creator found with that name.'
        });
      }
      if (supplier.symbolId === symbolId) {
        return res.status(400).json({ success: false, message: 'That is you.' });
      }

      // Already there is not an error. Somebody adding a supplier twice
      // means the same thing both times.
      await CreatorSupplier.updateOne(
        { ownerSymbolId: symbolId, supplierSymbolId: supplier.symbolId },
        { $set: { supplierHandle: built.handle } },
        { upsert: true }
      );
      return res.json({ success: true, supplier: { symbolId: supplier.symbolId, handle: built.handle } });
    } catch (error) {
      console.error('Creator supplier add error:', error);
      return res.status(500).json({ success: false, message: 'Could not add that supplier right now.' });
    }
  }
);

app.delete(
  '/api/creator/:symbolId/suppliers/:supplierSymbolId',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const supplierSymbolId = safeDecodeSymbolId(req.params.supplierSymbolId).trim();
      await CreatorSupplier.deleteOne({ ownerSymbolId: symbolId, supplierSymbolId });
      return res.json({ success: true });
    } catch (error) {
      console.error('Creator supplier remove error:', error);
      return res.status(500).json({ success: false, message: 'Could not remove that supplier right now.' });
    }
  }
);

// GET /api/creator/:symbolId/purchases — what this merchant bought. Owner only.
app.get(
  '/api/creator/:symbolId/purchases',
  lookupLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const rows = await CreatorPurchase.find({ buyerSymbolId: symbolId })
        .sort({ paidAt: -1 }).limit(100).lean();
      return res.json({
        success: true,
        purchases: rows.map((r) => ({
          id: String(r._id),
          supplierSymbolId: r.supplierSymbolId,
          supplierHandle: r.supplierHandle || '',
          title: r.title,
          quantity: r.quantity,
          amount: r.amount,
          currency: r.currency,
          paidAt: r.paidAt
        }))
      });
    } catch (error) {
      console.error('Creator purchases read error:', error);
      return res.status(500).json({ success: false, message: 'Could not load what you bought right now.' });
    }
  }
);

// POST /api/creator/:symbolId/purchases — write the lines AFTER a payment.
//
// The client calls this once the send has succeeded, with the basket it
// just paid for. It records intent, not entitlement: nothing downstream
// reads these, the supplier never sees them, and no money is moved here.
app.post(
  '/api/creator/:symbolId/purchases',
  writeLimit,
  requireAuth,
  requireSelf('symbolId'),
  async (req, res) => {
    try {
      const symbolId = safeDecodeSymbolId(req.params.symbolId).trim();
      const body = req.body || {};
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const supplierSymbolId = typeof body.supplierSymbolId === 'string' ? body.supplierSymbolId.trim() : '';
      if (!supplierSymbolId || !lines.length) {
        return res.status(400).json({ success: false, message: 'A supplier and at least one line are needed.' });
      }
      if (lines.length > CREATOR_ITEMS_MAX) {
        return res.status(400).json({ success: false, message: 'Too many lines in one purchase.' });
      }
      const supplierHandle = typeof body.supplierHandle === 'string' ? body.supplierHandle.trim() : '';
      const transactionRef = typeof body.transactionRef === 'string' ? body.transactionRef.trim().slice(0, 64) : '';

      const docs = [];
      for (const raw of lines) {
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        const quantity = Math.max(1, Math.round(Number(raw.quantity) || 1));
        const amount = Number(raw.amount);
        const currency = String(raw.currency || '').toUpperCase();
        if (!title || !Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) continue;
        docs.push({
          buyerSymbolId: symbolId,
          supplierSymbolId,
          supplierHandle,
          title: title.slice(0, 80),
          quantity,
          amount,
          currency,
          transactionRef,
          paidAt: new Date()
        });
      }
      if (!docs.length) {
        return res.status(400).json({ success: false, message: 'No usable lines in that purchase.' });
      }
      await CreatorPurchase.insertMany(docs);
      // The supplier list sorts by who you actually deal with.
      await CreatorSupplier.updateOne(
        { ownerSymbolId: symbolId, supplierSymbolId },
        { $set: { lastOrderAt: new Date(), supplierHandle } },
        { upsert: true }
      );
      return res.json({ success: true, written: docs.length });
    } catch (error) {
      console.error('Creator purchase write error:', error);
      return res.status(500).json({ success: false, message: 'Could not record that purchase right now.' });
    }
  }
);

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

// ── WebAuthn challenge lifetime (audit finding GLB-25) ──────────────────────
//
// A challenge is the only thing making a WebAuthn assertion answer THIS
// ceremony rather than any earlier one. It was stored in a single slot on the
// user document with no expiry and no single-use rule: cleared only by a
// successful verification, so one issued weeks ago was still accepted, and a
// failed verification left it sitting there to be tried against again.
//
// Two properties are restored here, both narrow:
//
//   1. It expires. Five minutes — comfortably longer than the 60-second
//      timeout the options themselves carry, so a slow phone or a person
//      hunting for their fingerprint reader is never cut off, and short
//      enough that a leaked challenge is worthless by the time anyone could
//      use it. A challenge with no stored expiry (every document written
//      before this field existed) counts as expired: failing closed costs one
//      extra trip through the options route, failing open costs the property.
//
//   2. It is single-use. Reading it consumes it, pass or fail, so the same
//      challenge cannot be replayed against a second attempt. A genuine retry
//      starts a new ceremony, which is what a retry is.
//
// This deliberately does NOT touch how origin/rpID are derived — that is a
// separate finding with a separate fix.
const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const stashWebAuthnChallenge = async (user, challenge) => {
  user.currentChallenge = challenge;
  user.currentChallengeExpiresAt = new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS);
  await user.save();
};

const clearWebAuthnChallenge = async (user) => {
  user.currentChallenge = null;
  user.currentChallengeExpiresAt = null;
  await user.save();
};

// Returns the challenge if it is still live, or null — and clears it either
// way, which is what makes it single-use.
const consumeWebAuthnChallenge = async (user) => {
  const stored = user?.currentChallenge || null;
  const expiresAt = user?.currentChallengeExpiresAt
    ? new Date(user.currentChallengeExpiresAt).getTime()
    : 0;

  if (!stored) return null;

  await clearWebAuthnChallenge(user);

  if (!expiresAt || expiresAt <= Date.now()) return null;

  return stored;
};

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

    await stashWebAuthnChallenge(user, options.challenge);

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
      await clearWebAuthnChallenge(user);

      return res.status(409).json({
        verified: false,
        message: 'Device authentication is already registered for this Secure ID. Please verify existing device.'
      });
    }

    // Audit fix (GLB-25): reading consumes. An expired or already-used
    // challenge comes back null and the ceremony has to be restarted.
    const challenge = await consumeWebAuthnChallenge(user);

    if (!challenge) {
      return res.status(400).json({
        verified: false,
        message: 'This passkey registration has expired. Please start again.',
        challengeExpired: true
      });
    }

    const { verifyRegistrationResponse } = await getWebAuthnServer();
    const { rpID, origin } = getWebAuthnConfig(req);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
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
    // The challenge was already cleared by consumeWebAuthnChallenge above.
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

    await stashWebAuthnChallenge(user, options.challenge);

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

    // Audit fix (GLB-25): reading consumes, so the same challenge cannot be
    // presented twice and one older than WEBAUTHN_CHALLENGE_TTL_MS is refused.
    const challenge = await consumeWebAuthnChallenge(user);

    if (!challenge) {
      return res.status(400).json({
        verified: false,
        message: 'This sign-in attempt has expired. Please try again.',
        challengeExpired: true
      });
    }

    const { verifyAuthenticationResponse } = await getWebAuthnServer();
    const { rpID, origin } = getWebAuthnConfig(req);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
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
    // The challenge was already cleared by consumeWebAuthnChallenge above.
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

  const mobileNumber = resolved.user.mobileNumber || '';

  return {
    fullName: resolved.user.fullName,
    // Audit fix (GLB-17). This is a lookup of SOMEBODY ELSE, performed by
    // whoever is about to pay them, and it used to hand back that person's
    // email address and their mobile number in full. Neither is needed to
    // send money, and together they turn every signed-in account into a
    // directory: one Gloobal ID in, a name, an email and a phone number out.
    //
    // `email` is gone outright — nothing on the paying side ever read it.
    //
    // `mobileNumber` is masked rather than removed, because the payment
    // screen shows it to confirm "yes, this is the right person" — and it was
    // ALREADY being masked there, client-side, by SendMoney's own
    // maskMobileNumber. Masking on this side means the full number never
    // leaves the server in the first place, which is where the decision
    // belongs; the screen renders what it is given.
    //
    // The dial code survives the mask so the recipient's country can still be
    // derived from it. In practice `countryIso` below is the authority and
    // this is only its fallback, but a fallback that has been quietly
    // hollowed out is worse than one that works.
    mobileNumber: maskMobileNumberForLookup(mobileNumber),
    // Accounts created before the name step existed carry their own phone
    // number as `fullName`, and a name that is just the number is not a name
    // worth showing. The clients used to work that out by comparing fullName
    // against mobileNumber — which they can no longer do now that the number
    // arrives masked, and which was never their comparison to make. The
    // server knows both values; it answers the question directly.
    nameIsMobile: Boolean(
      resolved.user.fullName &&
      normalizeText(resolved.user.fullName) === normalizeText(mobileNumber)
    ),
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
    // `normalizedIdentifier` was here and is gone (GLB-17): nothing on the
    // client read it, and for a phone-number lookup it echoed the full
    // E.164 number straight back — undoing, in the field below the masked
    // one, exactly what the mask above is for.
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

// The canonical reference this payment will be known by, on both parties'
// receipts and in every support conversation about it.
//
// ── Audit fix (GLB-13/GLB-18) ────────────────────────────────────────────
//
// This used to take a `candidate` off the request body
// (`req.body.referenceId ?? req.body.transactionId`), check it was
// well-formed, check no transaction already used it, and — if both held —
// adopt it as the payment's identity. Three things were wrong with that:
//
//  1. The identity of a financial record was chosen by one of its two
//     parties. The payee's copy of the receipt carries a reference the payer
//     picked, which is precisely backwards for an identifier whose job is to
//     be an independent handle on the transaction.
//  2. `exists()` then `create()` is a check-then-act across two round trips.
//     The unique index on Transaction.referenceId rescues correctness, but
//     only by turning a losing race into a 500.
//  3. Nothing legitimate needed it. Retry-safety is `idempotencyKey`, which
//     is a separate field with its own unique partial index and is
//     deliberately left untouched here — a client that retries a timed-out
//     payment still gets the original transaction back, exactly as before.
//
// So the reference is now always minted server-side. Collisions are
// astronomically unlikely (20 symbols from an 8-symbol alphabet is 8^20, or
// 60 bits, from crypto.randomInt) but retried anyway rather than left to
// surface as a failed payment.
const TRANSACTION_REFERENCE_ATTEMPTS = 5;

async function resolveTransactionReference() {
  for (let attempt = 0; attempt < TRANSACTION_REFERENCE_ATTEMPTS; attempt += 1) {
    const reference = createPrototypeTransactionReference();
    if (!(await Transaction.exists({ referenceId: reference }))) return reference;
  }

  // Five collisions in a row against a 60-bit space is not luck, it is a
  // broken random source. Fail loudly rather than hand back a reference that
  // is about to violate the unique index.
  throw new Error('Could not mint a unique transaction reference after 5 attempts.');
}

function cleanTransactionUser(user) {
  if (!user) return null;

  return {
    fullName: user.fullName || '',
    symbolId: user.symbolId || '',
    // The country this account belongs to, so a receipt can show whose flag
    // it is. Read through accountCountryIso rather than off the raw field —
    // every other country read in this file does the same, and the raw field
    // is the schema default on any account registered before a country was
    // recorded.
    //
    // Only reached as a FALLBACK now: rows written since the parties snapshot
    // exists answer from the snapshot instead (see counterpartyFor). Kept
    // because rows written before it have no snapshot to read, and a receipt
    // with a live-joined flag is better than one with no flag at all.
    countryIso: accountCountryIso(user),
  };
}

// Who the OTHER party to this transaction was, as of when it happened.
//
// Prefers metadata.parties — the snapshot POST /api/transactions/send writes
// at payment time (see that route for why). Falls back to the populated
// User document for rows written before the snapshot existed.
//
// `viewerIsSender` decides which of the two snapshotted sides is the
// counterparty, and it is derived from the transaction's own fromUserId, never
// from anything the caller supplies — reversing it is the one mistake that
// would put the payer's own name and flag on their own receipt under "To".
function counterpartyFor(transaction, viewerIsSender, populatedCounterparty) {
  const parties = transaction?.metadata?.parties;
  const snapshot = parties && (viewerIsSender ? parties.receiver : parties.sender);

  if (snapshot && (snapshot.symbolId || snapshot.fullName)) {
    return {
      fullName: snapshot.fullName || '',
      symbolId: snapshot.symbolId || '',
      countryIso: String(snapshot.countryIso || '').toUpperCase() || null,
      currency: snapshot.currency || null,
      // Tells the client whether it is looking at a recorded fact or at a
      // live join that may since have drifted. Nothing renders differently
      // on it today; it exists so a stale-looking receipt can be explained
      // rather than guessed at.
      fromSnapshot: true,
    };
  }

  const live = cleanTransactionUser(populatedCounterparty);
  return live ? { ...live, currency: null, fromSnapshot: false } : null;
}

// Async because of `receiptCode`, which is minted on first projection rather
// than at creation (see ensureReceiptCode). Every caller is already inside an
// async route handler.
async function cleanTransactionPayload(transaction, sender, receiver) {
  return {
    id: transaction._id,
    referenceId: transaction.referenceId,
    // The short handle this payment's receipt link is addressed by — NOT a
    // second reference for the payment. `referenceId` above stays the one
    // identity the transaction is known by, on the receipt and everywhere
    // else; this is only what goes in the path of /t/.
    receiptCode: await ensureReceiptCode(transaction),
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

// The share leg already minted for a payment, in the same shape the fresh
// send response returns it (see the `shareTransaction` block in POST
// /api/transactions/send).
//
// Why a duplicate response needs it. A retried send returns the ORIGINAL
// payment — that is what idempotency means and it does not change here — but
// it used to return the payment alone. The client then had a receipt with a
// payment reference and no share reference, and the Creator Share tab fell
// back to the payment's id, so a retry turned two distinct references into
// one repeated one. The share leg was there the whole time; nothing asked
// for it.
//
// Reads only. No transaction, receipt, ledger entry or FX conversion is
// created by this lookup, and a payment with no share leg answers null,
// which is the honest answer for a payee who shares nothing.
// The PAYEE's side of a Creator Share leg, as mintShareLegAndReceipts stored
// it: what was withheld from their credit, in their own currency. The leg's
// amount/currency are the payer's side; these are the other half.
//
// Returned beside amount/currency so the receipt shown straight after paying
// can state both sides of the share, the way the same receipt reopened from
// history already does (the history projection reads these same two fields).
// Read off the stored leg, never worked out: null when the leg predates them.
function shareLegPayeeSide(shareTransaction) {
  const payeeAmount = Number(shareTransaction?.metadata?.debitAmount);
  return {
    payeeAmount: shareTransaction?.metadata?.debitAmount != null && Number.isFinite(payeeAmount)
      ? payeeAmount
      : null,
    payeeCurrency: shareTransaction?.metadata?.senderCurrency || null,
  };
}

// The financial facts a DUPLICATE response has to carry, read back off the
// stored payment rather than recomputed.
//
// A retry is answered from the record. But the three duplicate branches below
// returned only `transaction` and `shareTransaction` — none of the top-level
// figures the first response carried: debitAmount, sourceAmount,
// senderCurrency, fxRate and the rest. A client that reads those off the
// response got them on the original and `undefined` on the retry, which is
// precisely the gap that lets the sender's side be taken for the receiver's:
// with no `debitAmount` and no `senderCurrency`, the only amount left in the
// payload is the receiver-currency face value.
//
// Every value here comes from the row's own metadata, written when the
// payment settled. Nothing is recomputed and nothing is read from a live
// rate, so a retry a day later answers with the figures that governed the
// payment, not today's.
//
// `newBalance` is the one that cannot come from metadata, because it is not
// stored there. It is read off the sender's LAST ledger line for this
// transaction — the recorded balance after the payment completed — rather
// than from the account's balance now, which is a different fact and would
// drift the moment anything else moved.
async function storedPaymentFacts(paymentTransaction, sender) {
  const meta = paymentTransaction?.metadata || {};
  const num = (value) => (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

  let newBalance = null;
  try {
    if (paymentTransaction?._id && sender?._id) {
      // The cashback-credit line lands after the debit, so it carries the
      // final figure; a payment with no share has only the debit line.
      const lines = await LedgerEntry.find({ transactionId: paymentTransaction._id, userId: sender._id })
        .select('entryType note balanceAfter createdAt')
        .sort({ createdAt: 1 })
        .lean();
      const last = lines.length ? lines[lines.length - 1] : null;
      newBalance = num(last?.balanceAfter);
    }
  } catch (error) {
    // A missing ledger line is not a reason to refuse a retry. The figure
    // stays null, which reads as "not recorded" rather than as a number.
    console.error('Duplicate response balance lookup failed:', error);
  }

  return {
    sourceAmount: num(meta.sourceAmount),
    sourceCurrency: meta.sourceCurrency || null,
    destinationAmount: num(meta.destinationAmount),
    destinationCurrency: meta.destinationCurrency || null,
    debitAmount: num(meta.debitAmount),
    senderCurrency: meta.senderCurrency || null,
    fxRate: num(meta.fxRate),
    fxRateSource: meta.fxRateSource || null,
    amountBasis: meta.amountBasis || null,
    cashback: num(meta.cashbackCredit),
    cashbackCurrency: meta.senderCurrency || null,
    cashbackRate: num(meta.cashbackRate),
    payeeReceives: num(meta.destinationAmount) != null && num(meta.cashback) != null
      ? toMinorUnit(num(meta.destinationAmount) - num(meta.cashback), meta.destinationCurrency)
      : null,
    newBalance,
  };
}

async function existingShareLegPayload(paymentTransaction) {
  if (!paymentTransaction?._id) return null;

  try {
    const shareTransaction = await Transaction.findOne({
      type: 'share',
      'metadata.paymentTransactionId': paymentTransaction._id,
    })
      .select('referenceId receiptCode amount currency metadata.debitAmount metadata.senderCurrency')
      .lean();

    if (!shareTransaction) return null;

    return {
      referenceId: shareTransaction.referenceId,
      // The share leg's OWN receipt code. A Creator Share is a separate
      // movement with a separate reference, so it gets a separate short
      // link — /t/ on the share tab must not lead to the payment.
      receiptCode: await ensureReceiptCode(shareTransaction),
      amount: shareTransaction.amount,
      currency: shareTransaction.currency,
      ...shareLegPayeeSide(shareTransaction),
    };
  } catch (error) {
    // Best-effort, exactly as minting the leg is: a payment's duplicate
    // response must never fail because its share leg could not be read.
    console.error('Could not read the share leg for a duplicate response:', error);
    return null;
  }
}

// ── The rest of what the original response carried ──────────────────────
//
// A duplicate response used to say the payment happened and then describe
// only half of it. It carried the financial facts (storedPaymentFacts) and
// the share leg (above), and silently omitted three fields the first
// response had: `receipts`, `settlement` and `assetSeed`.
//
// server/tests/idempotent-duplicate-response.test.mjs has asserted all three
// since 2 September and reported
//
//     FAIL  retry 2: receipts identical  — first=[4 receipts] duplicate=undefined
//     FAIL  retry 2: settlement identical — duplicate=undefined
//     FAIL  retry 2: assetSeed recorded half identical — duplicate=null
//
// the first time the suite was run against a database, which was not until
// 8 October: it needs MONGO_URI, so it had never run.
//
// ── Why the omission matters, beyond a red test ────────────────────────
//
// A retry happens when the FIRST RESPONSE WAS LOST — the network dropped,
// the phone slept mid-request. The client sends the same idempotency key,
// the server correctly recognises the payment and answers "already done" —
// and that answer had no receipts in it. So the one case where the client
// has nothing of its own to fall back on is the exact case it was told
// least. A payment with four receipts in the database showed none in the
// app, for the person whose connection was worst.
//
// Everything below is READ BACK off the stored records. Nothing is
// re-minted, recomputed or inferred: the same discipline storedPaymentFacts
// follows, for the same reason — a retry must describe the payment that
// happened, not a fresh opinion about it.
// A settlement, as the API describes one.
//
// Extracted from the 201 response, where it was an inline object literal,
// because the DUPLICATE response has to describe the same settlement the
// same way. Two literals would be two shapes, and the first time they
// disagreed would be on a retry — the one response nobody is watching,
// because by definition the person has already seen the payment go through
// (or has seen nothing at all, which is why they retried).
//
// `sourceAmount` IS the full credit in. This projection used to also carry
// `sourceCreditAmount` and `destinationReleaseAmount` as separate keys,
// which were aliases of the two gross figures under the names server.js
// passes them in by. Neither exists on the Settlement schema, so both
// serialized as undefined. Removed rather than added to the schema: a
// second name for a figure already on the row is exactly the
// duplicate-amount-field trap, and nothing ever read them.
function settlementPayload(settlement) {
  return {
    settlementId: settlement.settlementId,
    sourceCountryIso: settlement.sourceCountryIso,
    sourceCurrency: settlement.sourceCurrency,
    // The two source-side ledger lines — the sender's full credit in, and
    // the cashback release back out — not just their net.
    sourceAmount: settlement.sourceAmount,
    sourceCashbackRelease: settlement.sourceCashbackRelease,
    destinationCountryIso: settlement.destinationCountryIso,
    destinationCurrency: settlement.destinationCurrency,
    // The two destination-side ledger lines — the full release, and the
    // cashback return.
    destinationAmount: settlement.destinationAmount,
    destinationCashbackReturn: settlement.destinationCashbackReturn,
    rate: settlement.rate,
    rateSource: settlement.rateSource,
    // Carried so a caller can tell a settled corridor from one that was
    // written and later reverted, without a second round trip.
    status: settlement.status,
  };
}

// ── `awaitMint`, and the one branch that needs it ──────────────────────
//
// The two pre-check branches answer a retry that arrives LATER, by which
// time the original request finished long ago and every artifact is on
// disk. One read is enough there.
//
// The RACE branch is different. Two requests with one idempotency key
// arrive together, both pass the pre-check (neither row exists yet), and
// one of them loses the unique index inside performTransfer. That
// collision surfaces while the winner is still working: the order in the
// route is transfer, then seed, then share leg and receipts, then respond.
// So the loser can be composing its answer while the winner has not minted
// a receipt yet — and it would truthfully report none, for a payment that
// acquires four a moment later. The test sees exactly that:
//
//     FAIL  concurrent retry: receipts identical — duplicate=undefined
//     FAIL  concurrent retry: shareTransaction identical — duplicate=null
//
// So the loser waits, briefly, for a write that is already in flight. Every
// payment mints at least one receipt — issueSharedReceipt when the payee
// shares nothing, issueReceiptPair when they do — so their appearance is a
// sound signal that the winner has got that far.
//
// Bounded, and it returns whatever exists when the bound expires. Minting
// is best-effort and catches its own failures, so a winner that never mints
// must not hang the loser; two seconds on a path that only fires when two
// identical requests collide is a cost worth paying to stop a retry
// reporting a payment with no receipt.
const DUPLICATE_ARTIFACT_WAIT_MS = 2000;
const DUPLICATE_ARTIFACT_POLL_MS = 75;

async function storedPaymentArtifacts(paymentTransaction, { awaitMint = false } = {}) {
  const empty = { receipts: [], settlement: null, assetSeed: null };
  if (!paymentTransaction?._id) return empty;

  // HOW MANY RECEIPTS THIS PAYMENT WILL END UP WITH.
  //
  // The completion signal for the wait below, and it has to be the right
  // number rather than "at least one". mintShareLegAndReceipts writes in
  // this order:
  //
  //   payee shares nothing   issueSharedReceipt            -> 1 on the payment
  //   payee shares           issueReceiptPair(payment)     -> 2 on the payment
  //                          Transaction.create(share leg)
  //                          issueReceiptPair(share)       -> 2 on the leg
  //
  // So the payment's own receipts appear BEFORE the share leg exists.
  // Waiting for "any receipt" would release the loser in the gap between
  // them, and it would report two receipts and a null shareTransaction for
  // a payment that ends up with four and a leg.
  //
  // Read off the winner's stored metadata, not recomputed: the send route
  // wrote `cashback` there when it decided the split.
  const expectsShare = Number(paymentTransaction.metadata?.cashback) > 0;
  const expectedReceipts = expectsShare ? 4 : 1;

  try {
    const read = async () => {
      // The share leg, so its receipt pair can be found. Looked up here
      // rather than taken from existingShareLegPayload's result: that
      // function returns a client payload with no _id on it, and widening it
      // to carry one so this could reuse it would make a public shape serve
      // a private purpose.
      const shareTransaction = await Transaction.findOne({
        type: 'share',
        'metadata.paymentTransactionId': paymentTransaction._id,
      }).select('_id').lean();

      const transactionIds = [paymentTransaction._id];
      if (shareTransaction) transactionIds.push(shareTransaction._id);

      return Promise.all([
        // Sorted by _id, which is monotonic with insertion — so the
        // payment's pair comes back before the share's, in the order they
        // were minted, which is the order the first response listed them in.
        // The test compares the two arrays as JSON, so order is part of
        // being identical.
        Receipt.find({ transactionId: { $in: transactionIds } })
          .select('receiptId leg role amount currency')
          .sort({ _id: 1 })
          .lean(),
        Settlement.findOne({ transactionId: paymentTransaction._id }).lean(),
        AssetSeed.findOne({ transactionId: paymentTransaction._id }).lean(),
      ]);
    };

    let [receiptRows, settlement, seed] = await read();

    if (awaitMint) {
      const deadline = Date.now() + DUPLICATE_ARTIFACT_WAIT_MS;
      while (receiptRows.length < expectedReceipts && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, DUPLICATE_ARTIFACT_POLL_MS));
        [receiptRows, settlement, seed] = await read();
      }
    }

    return {
      receipts: receiptRows.map((r) => ({
        receiptId: r.receiptId,
        leg: r.leg,
        role: r.role,
        amount: r.amount,
        currency: r.currency,
      })),
      settlement: settlement ? settlementPayload(settlement) : null,
      // computeSeed derives interestAccrued/interestAvailable from elapsed
      // time on every read, by design, so a seed re-read a second later
      // legitimately reports a fractionally larger unclaimed bonus. Its
      // RECORDED half is what must match, which is what the test compares.
      assetSeed: seed ? computeSeed(seed) : null,
    };
  } catch (error) {
    // Best-effort, like the share leg above: a duplicate response must never
    // fail because an artifact could not be read. Empty is honest here in a
    // way a guess would not be — the client sees the same shape it sees for
    // a payment that genuinely had no settlement.
    console.error('Could not read the stored artifacts for a duplicate response:', error);
    return empty;
  }
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

    // Audit fix (GLB-17), part one. This route has to stay unauthenticated —
    // it runs during registration, before anybody has a token — so it will
    // always answer "is this ID free". What it must not do is answer that
    // question about arbitrary input.
    //
    // Requiring a well-formed ID first means a prober can only ask about the
    // 8^12 addresses that could actually exist, rather than using this as a
    // general-purpose existence oracle for anything they can type. Combined
    // with lookupLimit (90 per five minutes, keyed on the caller and
    // deliberately NOT on the ID being asked about), walking the space is not
    // a thing this route can be used for.
    if (!isValidSymbolId(symbolId)) {
      return res.status(400).json({
        success: false,
        message: `A Gloobal ID is exactly ${SYMBOL_ID_LENGTH} Gloobal symbols.`
      });
    }

    // Audit fix (GLB-17), part two: `exists` was `!available` under a second
    // name. Two fields carrying one fact is two chances to read the wrong
    // one, and the client only ever reads `available`. One answer, one field.
    //
    // Audit fix (GLB-12): a retired ID is not available either, and saying so
    // here keeps the registration screen honest instead of letting somebody
    // pick an ID that POST /api/register-symbol will then refuse.
    const taken =
      Boolean(await User.exists({ symbolId })) || (await symbolIdWasRetired(symbolId));

    return res.json({ success: true, symbolId, available: !taken });
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

// One answer for every way of not finding them, so the route cannot be used
// to tell "no such ID" from "an ID you have never dealt with" — which is the
// distinction a rename tracker would be built out of.
const payeeNotFound = (res) => res.status(404).json({
  success: false,
  code: 'payee_not_found',
  message: 'That Gloobal ID has changed and we could not find where it went. Ask them for their current one.',
});

// GET /api/payees/current — "is this still their Gloobal ID?"
//
// ── The problem ─────────────────────────────────────────────────────────
//
// Pay again, at the foot of a receipt, used the ID printed ON that receipt.
// A receipt is a record of what was true when the money moved, and a
// Gloobal ID is not permanent — PATCH /api/profile/change-symbol-id exists
// and people use it. So the older the receipt, the likelier its ID names
// nobody.
//
// What it does NOT do is name the wrong person, and that is worth being
// precise about, because it is the difference between a bug and a disaster.
// An ID that has been renamed away is retired for good (symbolIdWasRetired,
// above): it never returns to the pool, so it cannot be claimed by a
// stranger, so an old receipt cannot quietly route money to one. The
// failure is a dead end, not a misdelivery. This route turns the dead end
// back into the person.
//
// ── How it finds them ───────────────────────────────────────────────────
//
// In order, and the order is the whole design:
//
//   1. The ID still resolves. Nothing changed; answer `changed: false`.
//   2. The rename trail. change-symbol-id records the outgoing ID in
//      symbolIdHistory with action 'changed', and User indexes
//      symbolIdHistory.symbolId, so ONE keyed lookup finds the account that
//      used to hold it — and that account's current symbolId is the answer.
//      This is an exact, recorded link between two IDs: not a guess, not a
//      match on anything that could belong to somebody else. It also
//      survives repeated renames for free, because the trail is on the
//      account and the account's current ID is read live.
//   3. The mobile number, and only if there is no trail. This is the weaker
//      leg and it is deliberately last: mobile numbers get recycled, so
//      "whoever holds that number today" is not certainly the same person.
//      It exists for receipts written before the trail did.
//
// A name is never matched, at any step. Names are not unique, and a route
// that took one would turn every signed-in account into a name-to-account
// directory. The name on the receipt is for the PAYER to recognise, which
// is a different job from finding the account, and it stays that.
//
// ── Why it asks who is calling ──────────────────────────────────────────
//
// Step 2 is new exposure and the check below is what pays for it. Without
// it, any signed-in account could walk any old ID to its owner's new one —
// a rename tracker, aimed at exactly the people who renamed to stop being
// reachable. So the caller must have a real transaction with that account.
// Pay again is only ever offered from the receipt of a payment that
// happened, so this costs the feature nothing and closes the route to
// everyone else. The phone leg is not new exposure — /api/users/resolve
// already answers a mobile number — but it is held to the same rule, since
// there is no reason for it to be looser.
app.get('/api/payees/current', lookupLimit, requireAuth, async (req, res) => {
  try {
    const gloobalId = String(req.query.gloobalId || '').trim();
    const mobileNumber = String(req.query.mobileNumber || '').trim();

    if (!gloobalId) {
      return res.status(400).json({ success: false, message: 'A Gloobal ID is required.' });
    }

    const me = req.authUser._id;
    // Have I ever moved money with this account, either way? Cheap: both
    // directions are covered by the indexes on fromUserId and toUserId.
    const dealtWith = (userId) => Transaction.exists({
      $or: [
        { fromUserId: me, toUserId: userId },
        { fromUserId: userId, toUserId: me },
      ],
    });

    const current = await User.findOne({ symbolId: gloobalId }).lean();
    if (current) {
      // Still theirs. No trail to follow and nothing to warn anybody about,
      // so this answers without the transaction check — it is exactly what
      // /api/users/resolve would already say for the same input.
      return res.json({
        success: true,
        changed: false,
        matchedBy: 'symbolId',
        user: cleanResolvedTransactionUserPayload({ user: current, matchedBy: 'symbolId' }),
      });
    }

    // The trail. One indexed lookup; the answer is the account's CURRENT id,
    // read now, so a chain of renames resolves in one hop rather than being
    // walked entry by entry.
    const renamed = await User.findOne({
      symbolIdHistory: { $elemMatch: { symbolId: gloobalId, action: 'changed' } },
    }).lean();

    if (renamed) {
      if (!(await dealtWith(renamed._id))) return payeeNotFound(res);
      return res.json({
        success: true,
        changed: true,
        matchedBy: 'renameTrail',
        previousGloobalId: gloobalId,
        user: cleanResolvedTransactionUserPayload({ user: renamed, matchedBy: 'symbolId' }),
      });
    }

    // No trail. The number, if the caller has one — for receipts written
    // before the trail existed.
    const normalizedPhone = mobileNumber ? normalizeTransactionPhoneLookup(mobileNumber) : null;
    if (!normalizedPhone) return payeeNotFound(res);

    const byPhone = await User.findOne({ mobileNumber: normalizedPhone }).lean();
    if (!byPhone) return payeeNotFound(res);
    if (!(await dealtWith(byPhone._id))) return payeeNotFound(res);
    // A number that now belongs to somebody else would have failed the check
    // above — they would not be a person this caller has paid. It is still
    // reported as `changed`, so the payer is shown the new ID and agrees to
    // it rather than being moved onto it quietly.
    return res.json({
      success: true,
      changed: byPhone.symbolId !== gloobalId,
      matchedBy: 'mobileNumber',
      previousGloobalId: gloobalId,
      user: cleanResolvedTransactionUserPayload({ user: byPhone, matchedBy: 'symbolId' }),
    });
  } catch (error) {
    console.error('Payee resolve error:', error);
    return res.status(500).json({ success: false, message: 'Could not check that Gloobal ID right now.' });
  }
});


// --- My Assets --------------------------------------------------------------
// A Creator Share is real money the moment it is earned, and it is HELD
// rather than spent: performTransfer places it in the platform custody
// account for the payer's currency in the same request that plants this
// seed, and the seed is what entitles them to it.
//
// This paragraph used to say the opposite — "credited straight into the
// payer's spendable balance… It does not wait, vest, or need to be claimed
// to be spent" — and that was an accurate description of the behaviour and
// of the receipt that reported it. It contradicted the product everywhere
// else: the app's own explainer has always said the share "comes straight
// back to you and is planted in My Assets", and a figure cannot be both
// planted and already spent.
//
// So two things are claimable now, and claiming them is one action:
//
//   the principal   the share itself, waiting in custody. Claimable in
//                   full, at any time, and never lost by waiting.
//   the interest    the bonus on top. A seed's principal keeps earning
//                   1%/month, compounded, for as long as the growth goes
//                   unclaimed. This is Gloobal's own money and is paid
//                   through lib/disbursement.js; the principal is not,
//                   because handing somebody back their own held share is
//                   not Gloobal spending anything.
//
// Both figures are always derived on read — from plantedAt, interestClaimed
// and principalClaimed, never stored as a total — so neither can drift.
// POST /api/assets/claim-interest pays them into real balance on request.
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

  // ── THE PRINCIPAL, AND THE TWO GENERATIONS OF SEED ──────────────────
  //
  // `principalHeld` says the share is sitting in the custody account with
  // this seed as the claim on it. A seed planted before that behaviour
  // existed has no such field: its principal was credited to the owner's
  // spendable balance at payment time and is already theirs, so there is
  // nothing here to pay out and `principalAvailable` is zero.
  //
  // Getting this backwards in either direction loses somebody money. Read
  // as held when it was not, every old seed pays its principal a second
  // time out of custody that never received it. Read as credited when it
  // is held, the share is stuck in custody and its owner can never reach
  // it. The flag defaults to false precisely so the absent case lands on
  // the first reading being impossible rather than the second.
  const principalHeld = seed.principalHeld === true;
  const principalClaimed = Number(seed.principalClaimed) || 0;
  const principalAvailable = principalHeld ? Math.max(0, cashback - principalClaimed) : 0;

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
    principalHeld,
    principalClaimed,
    principalAvailable,
    // Everything this seed would pay out if claimed right now. One figure
    // for the screen, so it never has to add two and get a different
    // answer from the one the claim route arrives at.
    claimable: principalAvailable + interestAvailable,
    yearsAccrued,
    plantedAt,
    currency: seed.currency || 'INR',
    // THE PAYMENT THIS SEED CAME OUT OF.
    //
    // AssetSeed has carried `transactionId` since it was written and this
    // projection never sent it, so the link existed in the database and
    // nowhere a person could follow it. "Where did this figure come from"
    // was a question the app could not answer about its own number.
    //
    // Both forms are sent on purpose. `paymentReference` is what a receipt
    // is opened by, and `paymentTransactionId` is what identifies the row
    // when a reference was never minted — an old seed, or one whose
    // transaction predates referenceId. Null on a seed planted before the
    // link was recorded, and the screen then shows no way through rather
    // than a dead tap.
    paymentTransactionId: seed.transactionId ? String(seed.transactionId._id || seed.transactionId) : null,
    paymentReference: seed.transactionId && seed.transactionId.referenceId
      ? String(seed.transactionId.referenceId)
      : null,
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

    // `transactionId` is populated rather than left as an ObjectId so each
    // seed can carry the payment's REFERENCE, which is what the receipt is
    // opened by. Two fields selected and nothing else: this route answers
    // about seeds, and pulling whole transactions through it would make a
    // list of twelve seeds a list of twelve payments as well.
    const rawSeeds = await AssetSeed.find({ userId: user._id })
      .sort({ plantedAt: -1 })
      .populate('transactionId', 'referenceId');
    if (rawSeeds.length === 0) {
      return res.status(200).json({
        totalCashbackEarned: 0, totalInterestAccrued: 0, totalInterestAvailable: 0,
        totalInterestClaimed: 0, seeds: [],
      });
    }

    const seeds = rawSeeds.map(computeSeed);
    // totalCashbackEarned is a LIFETIME total across both generations of
    // seed, and it is not spendable in itself: part of it is held in
    // custody waiting to be claimed, and part of it (every seed planted
    // before shares were held) is already sitting in the account's real
    // balance. totalPrincipalAvailable is the half that is actually
    // waiting, and totalClaimable is what a claim right now would pay.
    const totalCashbackEarned = seeds.reduce((s, x) => s + x.cashback, 0);
    const totalInterestAccrued = seeds.reduce((s, x) => s + x.interestAccrued, 0);
    const totalInterestAvailable = seeds.reduce((s, x) => s + x.interestAvailable, 0);
    const totalInterestClaimed = seeds.reduce((s, x) => s + x.interestClaimed, 0);
    const totalPrincipalHeld = seeds.reduce((s, x) => s + (x.principalHeld ? x.cashback : 0), 0);
    const totalPrincipalAvailable = seeds.reduce((s, x) => s + x.principalAvailable, 0);
    const totalPrincipalClaimed = seeds.reduce((s, x) => s + x.principalClaimed, 0);

    return res.status(200).json({
      totalCashbackEarned,
      totalInterestAccrued,
      totalInterestAvailable,
      totalInterestClaimed,
      totalPrincipalHeld,
      totalPrincipalAvailable,
      totalPrincipalClaimed,
      // The one figure a Claim button should read, so the screen and the
      // route can never arrive at two different answers to "how much will
      // this pay me".
      totalClaimable: totalPrincipalAvailable + totalInterestAvailable,
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
      // BOTH NOTES, because this route has to backfill payments made under
      // either behaviour. The line used to read "Cashback credited to
      // balance" and now reads "Creator Share held in My Assets" — same
      // position in the same transaction, same figure, different
      // destination. Matching only the current wording would refuse to
      // backfill every payment made before this change, and matching only
      // the old one would refuse every payment made after it.
      LedgerEntry.findOne({
        transactionId: transaction._id,
        userId: user._id,
        entryType: 'credit',
        note: { $in: ['Cashback credited to balance', 'Creator Share held in My Assets'] },
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
      // READ OFF THE PAYMENT, NEVER ASSUMED FROM TODAY'S BEHAVIOUR.
      //
      // This flag decides whether the seed's principal is claimable, so
      // getting it from the clock rather than from the record would be the
      // one mistake that pays money out twice: a seed backfilled today for
      // a payment made last month, where the share went into a balance,
      // would hand its owner the same share again out of custody.
      //
      // performTransfer stamps `heldInCustody` on the line at the moment it
      // places the share. An older line does not carry it, reads as false,
      // and produces a seed that correctly claims nothing.
      principalHeld: cashbackLine.metadata?.heldInCustody === true,
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

// POST /api/assets/claim-interest — move what a user's seeds are holding
// into their real, spendable balance.
//
// ── Two figures, two funding sources, one request ──────────────────────
//
// The route kept its name because the app calls it and a rename would be a
// breaking change for nothing, but it now pays out both halves of a seed:
//
//   the PRINCIPAL   the Creator Share itself, held in the platform custody
//                   account since the payment that earned it. Returning it
//                   is a transfer out of custody, NOT a disbursement:
//                   Gloobal is handing back money it was holding for
//                   somebody, and running it through lib/disbursement.js
//                   would add it to disbursedTotal and inflate "Our
//                   spending" by every claim ever made.
//
//   the INTEREST    the 1%/month bonus on top. This genuinely is Gloobal's
//                   money, it is created rather than held, and it goes
//                   through recordDisbursement exactly as before — debiting
//                   the account that funds it in the same write.
//
// A seed planted before the share was held has no principal to pay: its
// `principalHeld` is absent, computeSeed reports principalAvailable as
// zero, and the claim behaves exactly as it always did for that row. Both
// generations are claimed by the same request without either knowing about
// the other.
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

    // ── One transaction, or none ──────────────────────────────────────
    //
    // This used to mark each seed claimed with a compare-and-swap and THEN
    // credit the balance in a separate write. Two failure modes lived in
    // that gap, and both lose a person's money: a crash after the seeds were
    // marked paid the user nothing while recording that they had been paid,
    // and there was no way to tell afterwards which seeds those were.
    //
    // It also credited the balance and debited nothing, which is why
    // lib/coverageAggregation.js refused to call this spending. Both halves
    // are fixed together because they are the same fix: the payout is now a
    // movement between two accounts, and a movement either happens or does
    // not.
    const claimCurrency = await resolveOwnCurrency(user);
    if (!claimCurrency) {
      // Never guess a currency for a payout. Defaulting would pay a Japanese
      // account in rupees, and the figure would be wrong by the rate.
      return res.status(409).json({
        message: 'Your account currency could not be resolved, so interest cannot be paid out yet.'
      });
    }
    const claimCountry = accountCountryIso(user);
    if (!claimCountry) {
      // Recorded at payout time and never re-resolved, so a figure cannot
      // move between countries later when somebody travels. Without it the
      // payout cannot be attributed, so it does not happen.
      return res.status(409).json({
        message: 'Your account country could not be resolved, so interest cannot be paid out yet.'
      });
    }

    let payout;
    try {
      payout = await withAtomicSession(async (session) => {
        const rawSeeds = await AssetSeed.find({ userId: user._id }).session(session);
        // Kept apart all the way through, because they are funded by two
        // different accounts and summing them early is how the principal
        // would end up being paid out of the expense account.
        let totalInterest = 0;
        let totalPrincipal = 0;
        const claimedSeedIds = [];

        for (const seed of rawSeeds) {
          const { interestAvailable, principalAvailable } = computeSeed(seed);
          if (interestAvailable <= 0 && principalAvailable <= 0) continue;
          const priorInterest = Number(seed.interestClaimed) || 0;
          const priorPrincipal = Number(seed.principalClaimed) || 0;
          // Both counters are in the filter, so this seed is claimed once
          // whichever half another request got to first. Marking only the
          // interest would let two concurrent claims each release the
          // principal.
          const updated = await AssetSeed.findOneAndUpdate(
            { _id: seed._id, interestClaimed: priorInterest, principalClaimed: priorPrincipal },
            {
              $set: {
                interestClaimed: priorInterest + interestAvailable,
                principalClaimed: priorPrincipal + principalAvailable,
                lastClaimedAt: new Date(),
              },
            },
            { returnDocument: 'after', session }
          );
          // A null result means someone else claimed this exact seed in the
          // gap between the read above and this write — skip it this round
          // rather than paying out (or double-paying) a stale figure.
          if (!updated) continue;
          totalInterest += interestAvailable;
          totalPrincipal += principalAvailable;
          claimedSeedIds.push(String(seed._id));
        }

        const totalClaimed = toMinorUnit(totalPrincipal + totalInterest, claimCurrency);

        if (totalClaimed <= 0) {
          return { claimed: 0, principal: 0, interest: 0, claimedSeedIds: [], balanceAfter: null };
        }

        // ── Two movements, in this order, out of two accounts ───────────
        //
        // The principal first. It is the holder's own money coming back out
        // of custody, and it is NOT a disbursement — see lib/custody.js on
        // why routing it through recordDisbursement would inflate "Our
        // spending" by every share ever claimed.
        let balanceAfter = null;
        let principalPaid = 0;

        if (totalPrincipal > 0) {
          const release = await releaseFromCustody({
            user,
            amount: totalPrincipal,
            currency: claimCurrency,
            reason: 'creator_share_principal',
            metadata: { seedIds: claimedSeedIds },
            session,
          });
          principalPaid = release.amount;
          balanceAfter = release.balanceAfter;
        }

        // Then the interest, which genuinely is Gloobal's money and goes
        // out of the account that funds it, exactly as it always has.
        //
        // The idempotency key is the SEEDS this claim consumed, not a clock
        // or a random value: the same set of seeds can only be claimed once,
        // and a retry of this exact request names the same set. A timestamp
        // would make every retry look like a new payout.
        let interestPaid = 0;

        if (totalInterest > 0) {
          const idempotencyKey = `seed_interest:${user._id}:${claimedSeedIds.slice().sort().join(',')}`;
          const result = await recordDisbursement({
            user,
            amount: totalInterest,
            currency: claimCurrency,
            countryIso: claimCountry,
            reason: 'seed_interest',
            idempotencyKey,
            metadata: { seedIds: claimedSeedIds },
            session,
          });
          interestPaid = result.amount;
          // Read after BOTH movements, so it is the balance the person
          // actually ends with rather than the one they had halfway
          // through the claim.
          balanceAfter = result.balanceAfter;
        }

        return {
          claimed: toMinorUnit(principalPaid + interestPaid, claimCurrency),
          principal: principalPaid,
          interest: interestPaid,
          claimedSeedIds,
          balanceAfter,
        };
      });
    } catch (error) {
      if (error?.code === 'not_atomic') {
        console.error('Claim interest refused — no transaction support:', error.message);
        return res.status(503).json({
          message: 'Interest cannot be paid out right now. Nothing was claimed or charged.'
        });
      }
      throw error;
    }

    if (payout.claimed <= 0) {
      return res.status(200).json({
        claimed: 0,
        principal: 0,
        interest: 0,
        newBalance: toMinorUnit(Number(user.balance) || 0, claimCurrency),
        currency: claimCurrency,
        seedIds: [],
      });
    }

    // `claimed` is the total, and it is what the screen shows. The two
    // halves are broken out beside it because they came out of two
    // different accounts and mean two different things: `principal` is the
    // Creator Share itself coming back from My Assets, `interest` is the
    // bonus Gloobal paid on top. A caller that wants to say "₹20 released,
    // ₹1.42 earned" can; one that only wants the total need not know.
    return res.status(200).json({
      claimed: payout.claimed,
      principal: payout.principal,
      interest: payout.interest,
      newBalance: payout.balanceAfter,
      currency: claimCurrency,
      seedIds: payout.claimedSeedIds,
    });
  } catch (error) {
    // A custody account short of what a seed says it is holding is not a
    // generic failure: it means a share was promised and never placed, or
    // was placed somewhere else, and it needs finding rather than retrying.
    if (error?.name === 'CustodyError' && error.code === 'custody_short') {
      console.error('Claim refused — custody short of a held Creator Share:', error.message);
      return res.status(409).json({
        message: 'Your Creator Share cannot be released right now. Nothing was claimed or charged.'
      });
    }
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

    // `transactionId` is populated rather than left as an ObjectId so each
    // seed can carry the payment's REFERENCE, which is what the receipt is
    // opened by. Two fields selected and nothing else: this route answers
    // about seeds, and pulling whole transactions through it would make a
    // list of twelve seeds a list of twelve payments as well.
    const rawSeeds = await AssetSeed.find({ userId: user._id })
      .sort({ plantedAt: -1 })
      .populate('transactionId', 'referenceId');
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

// ─── Hooman Projects ────────────────────────────────────────────────────────
//
// The Coverage screen has shown a "Hooman Projects" area for a while with
// nothing behind it: eight category names in a hardcoded frontend array,
// "Real projects in this category" rendered as a literal ∆, and no way to
// add one. These routes are the backend that area never had.
//
// Visibility, in one sentence, because every route below depends on it: a
// PUBLISHED project is readable by anyone, a DRAFT is readable only by its
// owner, and only the owner may ever change or delete either. Ownership is
// compared by document id (never by symbolId), the same rule requireSelf
// uses, so renaming a Gloobal ID cannot hand somebody else's project away
// or lock an owner out of their own.
//
// Search text is escaped through escapeRegExp, already defined near the top
// of this file for the mobile-number lookup. Reused rather than redefined:
// a search box wired straight to a regex engine is a syntax error the first
// time somebody types "(" and a match-everything query the first time they
// type ".*".

// The project as the API presents it. Never spreads the raw document: that
// is how an internal field becomes a public one by accident, and the
// attachment sub-document in particular must never carry its bytes here.
// What a set of projects has raised, counted from the contributions
// themselves rather than from a running total on the project.
//
// A `raised` field on Project, incremented on every gift, would be one
// number maintained in two places — and the first time an attribution is
// written and the increment is not, or is written twice, the figure on the
// screen stops being the sum of the list under it. There is no way to
// notice that, and no way to repair it afterwards without the very
// aggregate this function performs. So the aggregate IS the figure, always,
// and the list and the total cannot disagree.
//
// Takes a set of ids and answers for all of them in one round trip, because
// the listing renders up to a page of projects and a per-project query
// there would be a page of queries.
async function projectTotals(projectIds) {
  const ids = (projectIds || [])
    .map((id) => String(id || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const totals = new Map();
  if (ids.length === 0) return totals;
  const rows = await Contribution.aggregate([
    { $match: { projectId: { $in: ids } } },
    {
      $group: {
        _id: '$projectId',
        // What ARRIVED, in the owner's currency — the only figure
        // comparable with the goal. See the note on the two amounts in
        // models/Contribution.js.
        raised: { $sum: '$amount' },
        // DISTINCT people, not a row count. Somebody who gives three times
        // is one backer, and counting rows would let a project look
        // thirty-backed by one enthusiast.
        backerIds: { $addToSet: '$backerId' },
        currency: { $last: '$currency' },
      },
    },
  ]);
  for (const row of rows) {
    totals.set(String(row._id), {
      raised: Number(row.raised) || 0,
      backers: (row.backerIds || []).length,
      currency: row.currency || '',
    });
  }
  return totals;
}

const publicProject = (project, viewerId, totals) => ({
  id: String(project._id),
  title: project.title,
  category: project.category,
  summary: project.summary,
  summaryWordCount: project.summaryWordCount,
  countryIso: project.countryIso || null,
  link: project.link || '',
  status: project.status,
  ownerSymbolId: project.ownerSymbolId,
  // The richer project page. Empty string rather than null for the text
  // fields, so a client never has to handle two kinds of absent.
  place: project.place || '',
  website: project.website || '',
  email: project.email || '',
  address: project.address || '',
  // The target. Both halves travel together, or neither does: a goal
  // figure with no currency beside it is a number with no unit.
  goal: project.goalMinor != null && project.goalCurrency
    ? { minor: project.goalMinor, currency: project.goalCurrency }
    : null,
  // And what has actually come in. These used to be deliberately absent,
  // with a line on the screen explaining that a zero here would mean
  // "nobody can give" rather than "nobody has". Contributions exist now, so
  // the zero means the ordinary thing again.
  //
  // Computed, never stored — see projectTotals above for why. A caller that
  // did not ask for totals gets zeroes rather than nothing: the project
  // page would otherwise have to tell "no gifts" apart from "this endpoint
  // did not count", and every one of them would have got that wrong at
  // least once.
  raised: totals ? totals.raised : 0,
  backers: totals ? totals.backers : 0,
  // So a client can render edit/delete affordances without having to know
  // the ownership rule or compare ids itself.
  isOwner: Boolean(viewerId) && String(project.ownerId) === String(viewerId),
  attachment: project.attachment
    ? {
        filename: project.attachment.filename,
        contentType: project.attachment.contentType,
        byteSize: project.attachment.byteSize,
        // Where to fetch the bytes. A path, not a signed URL, because the
        // bytes are served by this API and authorised per request.
        url: '/api/projects/' + String(project._id) + '/attachment',
      }
    : null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

// Loads a project and decides whether this viewer may see it at all.
// Returns { project, isOwner } or { status, message } — never a partially
// authorised result the caller has to remember to check.
async function loadVisibleProject(id, viewerId) {
  if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
    return { status: 404, message: 'Project not found.' };
  }
  const project = await Project.findById(id).lean();
  if (!project) return { status: 404, message: 'Project not found.' };
  const isOwner = viewerId && String(project.ownerId) === String(viewerId);
  // A draft answers 404 rather than 403 to a stranger: 403 would confirm
  // that a project with this id exists, which is itself something the owner
  // has not published.
  if (project.status === 'draft' && !isOwner) {
    return { status: 404, message: 'Project not found.' };
  }
  return { project, isOwner };
}

// GET /api/projects — the project listing, and the project search.
//
// This is project/infrastructure/product search, and it is deliberately NOT
// the same thing as the category picker's search box on the Coverage
// screen. That one filters eight fixed category NAMES in the browser and
// should keep doing exactly that; this one queries stored project records.
// Merging them would have produced a single box that pretended to search
// products while actually filtering a hardcoded list.
//
// ?q=              free text over title and summary
// ?category=       one of the eight categories ("Infrastructure" included)
// ?country=        ISO code
// ?mine=1          this account's own projects, drafts included (needs a token)
// ?limit=&cursor=  paging
app.get('/api/projects', lookupLimit, async (req, res) => {
  try {
    const viewer = await authenticatedUser(req);
    const mine = String(req.query.mine || '') === '1';

    if (mine && !viewer) {
      return res.status(401).json({ success: false, message: 'Sign in to see your own projects.' });
    }

    const filter = mine
      ? { ownerId: viewer._id }
      // Everyone else sees published rows only. Drafts are excluded HERE, in
      // the query, rather than filtered out afterwards — a filter after the
      // fact is one refactor away from being forgotten.
      : { status: 'published' };

    const q = String(req.query.q || '').trim();
    if (q) {
      const pattern = new RegExp(escapeRegExp(q), 'i');
      // Regex rather than a $text index because this backs a
      // search-as-you-type box, and $text only matches whole words — typing
      // "infra" would find nothing until "infrastructure" was complete. The
      // collection is small enough that this is the right trade today; a
      // text index is the upgrade when it is not, and the API shape does not
      // change when that happens.
      filter.$or = [{ title: pattern }, { summary: pattern }];
    }

    const category = String(req.query.category || '').trim();
    if (category) {
      if (!PROJECT_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, message: 'Unknown category.' });
      }
      filter.category = category;
    }

    const country = String(req.query.country || '').trim().toUpperCase();
    if (country) {
      if (!/^[A-Z]{2}$/.test(country)) {
        return res.status(400).json({ success: false, message: 'country must be a two-letter ISO code.' });
      }
      filter.countryIso = country;
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
      : 20;

    // Keyset paging on _id, which is monotonic with insertion time. Skip/
    // offset paging would drift as projects are added underneath a reader.
    const cursor = String(req.query.cursor || '').trim();
    if (cursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        return res.status(400).json({ success: false, message: 'Bad cursor.' });
      }
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    // One extra row, to answer "is there another page" without a count.
    const rows = await Project.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? String(page[page.length - 1]._id) : null;

    // Per-category counts over the SAME filter as the listing, so the number
    // on a category card and the list behind it can never disagree. Counted
    // in Mongo rather than from the page above, which is one page of one
    // category and could not answer this.
    //
    // Everything except `category` and `_id` carries over, and which of those
    // is dropped matters:
    //
    //   category  dropped because this IS the per-category breakdown. Keeping
    //             it would return one number — the selected category's — and
    //             zero for the other seven.
    //   _id       the paging cursor. Keeping it would make the count shrink
    //             as the reader paged down, which is a count of the rows
    //             below this point rather than a count of anything.
    //
    // `country` and `q` used to be dropped here too, and that was a bug of
    // exactly the kind the comment above promises cannot happen: the card
    // read "Projects in this category: 12" while the list under it showed
    // two, because the count was over every published project on the platform
    // and the list was one country's, filtered by a search term. It was
    // invisible for as long as the client sent neither.
    const countFilter = mine ? { ownerId: viewer._id } : { status: 'published' };
    if (filter.countryIso) countFilter.countryIso = filter.countryIso;
    if (filter.$or) countFilter.$or = filter.$or;
    const countRows = await Project.aggregate([
      { $match: countFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(PROJECT_CATEGORIES.map((name) => [name, 0]));
    for (const row of countRows) {
      if (Object.prototype.hasOwnProperty.call(counts, row._id)) counts[row._id] = row.count;
    }

    // One aggregate for the whole page, not one per project.
    const totals = await projectTotals(page.map((project) => project._id));

    return res.json({
      success: true,
      projects: page.map((project) => publicProject(project, viewer && viewer._id, totals.get(String(project._id)))),
      nextCursor,
      counts,
      categories: PROJECT_CATEGORIES,
    });
  } catch (error) {
    console.error('Project list error:', error);
    return res.status(500).json({ success: false, message: 'Could not load projects.' });
  }
});

// GET /api/projects/:id
app.get('/api/projects/:id', lookupLimit, async (req, res) => {
  try {
    const viewer = await authenticatedUser(req);
    const found = await loadVisibleProject(req.params.id, viewer && viewer._id);
    if (!found.project) return res.status(found.status).json({ success: false, message: found.message });
    const totals = await projectTotals([found.project._id]);
    return res.json({
      success: true,
      project: publicProject(found.project, viewer && viewer._id, totals.get(String(found.project._id))),
    });
  } catch (error) {
    console.error('Project read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load that project.' });
  }
});

// POST /api/projects — create.
//
// The owner is taken from the TOKEN, never from the body. A symbolId in the
// payload would be a field a client could set to somebody else's account,
// and there is no reason to accept one: the token already names exactly one
// account and that is whose project this is.
app.post('/api/projects', writeLimit, requireAuth, async (req, res) => {
  try {
    const validated = validateProjectInput(req.body || {});
    if (!validated.ok) return res.status(400).json({ success: false, message: validated.message });

    // Same resolver every country figure on the Coverage screen goes
    // through, so a project's country and its creator's can never disagree —
    // and a legacy account stored as the bare 'IN' default still files its
    // projects under the country its mobile number actually says.
    const countryIso = accountCountryIso(req.authUser);

    const project = await Project.create(Object.assign({}, validated.value, {
      ownerId: req.authUser._id,
      ownerSymbolId: req.authUser.symbolId,
      countryIso,
    }));

    recordAudit({
      userId: req.authUser._id, action: 'project.create', status: 'success',
      message: 'Hooman Project created', req,
      metadata: {
        projectId: String(project._id),
        symbolId: req.authUser.symbolId,
        category: project.category,
      },
    });

    return res.status(201).json({
      success: true,
      project: publicProject(project.toObject(), req.authUser._id),
    });
  } catch (error) {
    console.error('Project create error:', error);
    return res.status(500).json({ success: false, message: 'Could not save that project.' });
  }
});

// PATCH /api/projects/:id — owner only, partial update.
app.patch('/api/projects/:id', writeLimit, requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ''))) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    const existing = await Project.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Project not found.' });
    if (String(existing.ownerId) !== String(req.authUser._id)) {
      return res.status(403).json({ success: false, message: 'That project is not yours.' });
    }

    const validated = validateProjectInput(req.body || {}, { partial: true });
    if (!validated.ok) return res.status(400).json({ success: false, message: validated.message });

    const updated = await Project.findOneAndUpdate(
      // ownerId in the filter as well as in the check above: the read and
      // the write are two round trips, and this is what makes the write
      // itself refuse to touch a row that is not this account's.
      { _id: existing._id, ownerId: req.authUser._id },
      { $set: validated.value },
      { returnDocument: 'after' }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, message: 'Project not found.' });
    // Counted here too: an owner editing a project that has already been
    // backed gets the real figures back, not the zeroes a default would
    // paint over them with until the next reload.
    const editedTotals = await projectTotals([updated._id]);
    return res.json({
      success: true,
      project: publicProject(updated, req.authUser._id, editedTotals.get(String(updated._id))),
    });
  } catch (error) {
    console.error('Project update error:', error);
    return res.status(500).json({ success: false, message: 'Could not update that project.' });
  }
});

// DELETE /api/projects/:id — owner only. Takes the attachment with it, so a
// deleted project cannot leave its file behind as an unreferenced blob.
app.delete('/api/projects/:id', writeLimit, requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ''))) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    const deleted = await Project.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.authUser._id,
    }).lean();
    if (!deleted) {
      // Either it does not exist or it is not theirs. Same answer for both,
      // for the same reason a draft 404s: distinguishing them tells a
      // stranger that somebody else's project has this id.
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    await ProjectAttachment.deleteMany({ projectId: deleted._id });
    recordAudit({
      userId: req.authUser._id, action: 'project.delete', status: 'success',
      message: 'Hooman Project deleted', req,
      metadata: { projectId: String(deleted._id), symbolId: req.authUser.symbolId },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Project delete error:', error);
    return res.status(500).json({ success: false, message: 'Could not delete that project.' });
  }
});

// POST /api/projects/:id/attachment — owner only.
//
// The file arrives base64-encoded in JSON rather than as multipart, because
// that needs no new dependency and this server parses JSON already. The body
// limit is raised for THIS ROUTE ONLY: the global cap is 64kb (nothing else
// this API accepts is near it) and raising it globally would let every other
// route allocate megabytes per request.
//
// base64 inflates by 4/3, so a 2 MB file needs about 2.67 MB of body; 3mb
// leaves room for the surrounding JSON.
app.post(
  '/api/projects/:id/attachment',
  writeLimit,
  requireAuth,
  express.json({ limit: '3mb' }),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ''))) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      const project = await Project.findOne({ _id: req.params.id, ownerId: req.authUser._id });
      if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

      const claimedType = String((req.body && req.body.contentType) || '').trim().toLowerCase();
      const extension = PROJECT_ATTACHMENT_TYPES[claimedType];
      if (!extension) {
        return res.status(415).json({
          success: false,
          message: 'That file type is not accepted. Allowed: '
            + Object.keys(PROJECT_ATTACHMENT_TYPES).join(', ') + '.',
        });
      }

      const base64 = String((req.body && req.body.data) || '');
      if (!base64) return res.status(400).json({ success: false, message: 'No file was sent.' });

      let buffer = null;
      try {
        buffer = Buffer.from(base64, 'base64');
      } catch (e) {
        buffer = null;
      }
      // Buffer.from silently DROPS characters that are not valid base64
      // rather than throwing, so a corrupt upload arrives as a short buffer
      // instead of as an error. An empty result is the case worth refusing.
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, message: 'That file could not be read.' });
      }
      if (buffer.length > PROJECT_ATTACHMENT_MAX_BYTES) {
        return res.status(413).json({
          success: false,
          message: 'Files can be at most '
            + Math.round(PROJECT_ATTACHMENT_MAX_BYTES / (1024 * 1024)) + ' MB.',
        });
      }

      const filename = sanitiseFilename(req.body && req.body.filename, extension);

      // One attachment per project: replacing means the old bytes go. Left
      // behind, they would be unreachable (nothing references them) and
      // permanent, which is how a database fills with files nobody can find.
      await ProjectAttachment.deleteMany({ projectId: project._id });

      const stored = await ProjectAttachment.create({
        projectId: project._id,
        ownerId: req.authUser._id,
        filename,
        // The allow-listed type, NOT the raw string the client sent.
        contentType: claimedType,
        byteSize: buffer.length,
        data: buffer,
      });

      project.attachment = {
        attachmentId: stored._id,
        filename,
        contentType: claimedType,
        byteSize: buffer.length,
        uploadedAt: new Date(),
      };
      await project.save();

      const attachedTotals = await projectTotals([project._id]);
      return res.status(201).json({
        success: true,
        project: publicProject(project.toObject(), req.authUser._id, attachedTotals.get(String(project._id))),
      });
    } catch (error) {
      console.error('Project attachment upload error:', error);
      return res.status(500).json({ success: false, message: 'Could not store that file.' });
    }
  }
);

// GET /api/projects/:id/attachment — the bytes.
//
// Visibility follows the PROJECT, not the attachment: if you can see the
// project you can fetch its file, and a draft's file is as private as the
// draft. Served with the allow-listed content type and an attachment
// disposition, so nothing here is rendered inline by a browser on this
// origin.
app.get('/api/projects/:id/attachment', lookupLimit, async (req, res) => {
  try {
    const viewer = await authenticatedUser(req);
    const found = await loadVisibleProject(req.params.id, viewer && viewer._id);
    if (!found.project) return res.status(found.status).json({ success: false, message: found.message });
    if (!found.project.attachment) {
      return res.status(404).json({ success: false, message: 'That project has no file.' });
    }

    const stored = await ProjectAttachment.findById(found.project.attachment.attachmentId).lean();
    if (!stored) return res.status(404).json({ success: false, message: 'That file is no longer stored.' });

    // .lean() hands back the RAW BSON value, and for a Buffer field that is
    // a mongodb Binary rather than a Node Buffer. res.send() does not
    // recognise a Binary as bytes, so it fell through to the JSON branch and
    // served `{"buffer":{...}}` — a 27-byte PDF arrived as 38 bytes of JSON
    // and would not open. Normalising here is what makes the download be the
    // file that was uploaded.
    const bytes = Buffer.isBuffer(stored.data)
      ? stored.data
      : Buffer.from(stored.data?.buffer ?? stored.data ?? []);

    res.setHeader('Content-Type', stored.contentType);
    // Length from the buffer actually being written, NOT from the stored
    // byteSize. The two agreeing is exactly the assumption that just broke,
    // and a Content-Length that disagrees with the body truncates the
    // download or hangs the connection.
    res.setHeader('Content-Length', String(bytes.length));
    // Always an attachment, never inline: the filename is user-supplied and
    // the safest thing a browser can do with any of these types is save it.
    res.setHeader('Content-Disposition', 'attachment; filename="' + stored.filename + '"');
    // Belt and braces against a browser sniffing its own type out of the
    // bytes and ignoring the one above.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(bytes);
  } catch (error) {
    console.error('Project attachment read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load that file.' });
  }
});

// ── CONTRIBUTIONS ───────────────────────────────────────────────────────
//
// Read models/Contribution.js first. The short version: these routes do not
// move money. The backer's app pays the project's owner through
// /api/transactions/send — the ordinary payment path, with its PIN gate and
// its ledger and its idempotency — and then calls POST here to say which
// project that payment was for. This route's whole job is to check that the
// claim is true before recording it.

// How a contribution is presented. The backer's real name appears only
// where it is allowed to; see the `showName` note in the model.
const publicContribution = (row, { viewerIsOwner = false, viewerId = null } = {}) => {
  const viewerIsBacker = viewerId && String(row.backerId) === String(viewerId);
  // Three people may see the name: the backer who gave it, the owner of the
  // project it was given to, and — only when the backer allowed it —
  // everybody. The first two are not a courtesy: a backer who cannot see
  // their own gift in the list cannot tell whether it registered, and an
  // owner who cannot see who gave cannot thank them or send it back.
  const maySeeName = viewerIsOwner || viewerIsBacker || row.showName;
  return {
    id: String(row._id),
    // The payment itself, so the backer's app can open the receipt it
    // already has. Nobody else is told it: a referenceId is how a payment
    // is addressed, and a stranger holding one of somebody else's is a
    // handle on a transaction that is not theirs.
    referenceId: viewerIsOwner || viewerIsBacker ? row.referenceId : null,
    name: maySeeName ? (row.backerName || '') : '',
    // Whether the blank above is a withheld name or a person with no name
    // set. A client rendering "Someone" for both would be right by luck.
    anonymous: !maySeeName,
    // Shown to the owner and the backer only, for the same reason as the
    // referenceId: it identifies an account.
    symbolId: viewerIsOwner || viewerIsBacker ? row.backerSymbolId : null,
    isMine: Boolean(viewerIsBacker),
    amount: row.amount,
    currency: row.currency,
    // What the BACKER paid, returned only to the backer. To anyone else it
    // is noise at best — the project counts what arrived — and to the owner
    // it would be a detail of somebody else's account.
    sourceAmount: viewerIsBacker ? row.sourceAmount : null,
    sourceCurrency: viewerIsBacker ? (row.sourceCurrency || '') : '',
    note: row.note || '',
    paidAt: row.paidAt,
  };
};

// POST /api/projects/:id/contributions — attribute a payment to a project.
//
// Body: { referenceId, showName?, note? }
//
// Everything about the MONEY is read from the stored Transaction, never
// from this body. The body says which payment; the server says what it was.
app.post('/api/projects/:id/contributions', writeLimit, requireAuth, async (req, res) => {
  try {
    const { referenceId, showName } = req.body || {};
    const cleanReference = String(referenceId || '').trim();
    if (!cleanReference) {
      return res.status(400).json({ success: false, message: 'Which payment was this?' });
    }

    const found = await loadVisibleProject(req.params.id, req.authUser._id);
    if (!found.project) {
      return res.status(found.status).json({ success: false, message: found.message });
    }
    const project = found.project;

    // A draft has not been published, so there is nothing to back yet. Its
    // owner is the only person who can see it at all, and the check below
    // would stop them anyway, but this is the clearer refusal.
    if (project.status !== 'published') {
      return res.status(409).json({ success: false, message: 'That project is not live yet.' });
    }

    // An owner cannot back their own project.
    //
    // Not a moral rule — a structural one. The payment would have to be a
    // self-transfer, which /api/transactions/send refuses everywhere else,
    // so any row that got here claiming to be one is a row built from
    // something other than a real payment. It is also the cheapest way to
    // fake a total.
    if (String(project.ownerId) === String(req.authUser._id)) {
      return res.status(409).json({ success: false, message: 'You cannot back your own project.' });
    }

    const payment = await Transaction.findOne({ referenceId: cleanReference }).lean();
    if (!payment) {
      return res.status(404).json({ success: false, message: 'That payment could not be found.' });
    }

    // ── THE FOUR CHECKS THAT MAKE THE CLAIM TRUE ────────────────────────
    //
    // Each one closes a way of putting a number on a project's page that
    // nobody actually gave it.

    // 1. It is this account's own payment. Without this, anybody could
    //    attribute anybody's payment to anything.
    if (String(payment.fromUserId || '') !== String(req.authUser._id)) {
      return res.status(403).json({ success: false, message: 'That payment is not yours.' });
    }

    // 2. It went to this project's owner. Without this, a payment to a
    //    friend could be hung on a stranger's project.
    if (String(payment.toUserId || '') !== String(project.ownerId)) {
      return res.status(409).json({
        success: false,
        message: 'That payment did not go to this project.',
      });
    }

    // 3. It is an ordinary money transfer that SUCCEEDED. A failed payment
    //    is not a gift; neither is a coin movement, a mint or a redeem,
    //    whose amounts are not in the project's currency at all.
    if (payment.status !== 'success') {
      return res.status(409).json({ success: false, message: 'That payment did not go through.' });
    }
    if (!['send', 'qr_payment'].includes(String(payment.type || ''))) {
      return res.status(409).json({ success: false, message: 'That is not a payment that can be given.' });
    }

    // 4. It is recent. A contribution is made in the moment of giving; an
    //    old payment being attributed weeks later is either a mistake or
    //    somebody mining their own history for something to point at a
    //    project. One day is generous for a flow whose two calls are a
    //    second apart, and short enough that nothing old qualifies.
    const paidAt = payment.createdAt ? new Date(payment.createdAt) : null;
    if (!paidAt || Number.isNaN(paidAt.getTime())) {
      return res.status(409).json({ success: false, message: 'That payment cannot be dated.' });
    }
    if (Date.now() - paidAt.getTime() > 24 * 60 * 60 * 1000) {
      return res.status(409).json({
        success: false,
        message: 'That payment is too old to be given to a project.',
      });
    }

    // What arrived, and what was paid. Both out of the stored payment.
    //
    // `amount` on a Transaction is the RECEIVER's face value — what landed
    // in the owner's account, in the owner's currency — which is exactly
    // the figure a goal is measured against. The sender's side, when the
    // corridor crossed a currency, is in the metadata the send route wrote.
    const meta = payment.metadata || {};
    const sourceAmount = Number(meta.sourceAmount);
    const sourceCurrency = String(meta.sourceCurrency || '').trim().toUpperCase();

    const row = {
      projectId: project._id,
      projectOwnerId: project.ownerId,
      backerId: req.authUser._id,
      backerSymbolId: req.authUser.symbolId,
      backerName: String(req.authUser.fullName || '').trim().slice(0, 120),
      showName: showName === true || String(showName) === 'true',
      referenceId: cleanReference,
      amount: Number(payment.amount) || 0,
      currency: String(payment.currency || '').trim().toUpperCase(),
      sourceAmount: Number.isFinite(sourceAmount) && sourceAmount > 0 ? sourceAmount : null,
      sourceCurrency: sourceCurrency || '',
      // The backer's own words, taken from the payment they already wrote
      // rather than asked for twice.
      note: String(payment.note || '').trim().slice(0, 140),
      paidAt,
    };

    let stored;
    try {
      stored = await Contribution.create(row);
    } catch (error) {
      // The unique index on referenceId firing is the RETRY case, not an
      // error: the client's first call succeeded and its reply was lost.
      // Answering with the row that already exists is what makes the retry
      // safe, and is why the client may repeat this call forever.
      if (error && error.code === 11000) {
        const existing = await Contribution.findOne({ referenceId: cleanReference }).lean();
        if (existing) {
          return res.json({
            success: true,
            alreadyRecorded: true,
            contribution: publicContribution(existing, { viewerId: req.authUser._id }),
          });
        }
      }
      throw error;
    }

    const totals = await projectTotals([project._id]);
    return res.status(201).json({
      success: true,
      contribution: publicContribution(stored.toObject(), { viewerId: req.authUser._id }),
      project: publicProject(project, req.authUser._id, totals.get(String(project._id))),
    });
  } catch (error) {
    console.error('Project contribution error:', error);
    return res.status(500).json({ success: false, message: 'Could not record that contribution.' });
  }
});

// GET /api/projects/:id/contributions — who has given, newest first.
//
// Visibility follows the project, exactly as the attachment route does: see
// the project, see its gifts. What each viewer is told about each giver is
// decided by publicContribution above.
app.get('/api/projects/:id/contributions', lookupLimit, async (req, res) => {
  try {
    const viewer = await authenticatedUser(req);
    const found = await loadVisibleProject(req.params.id, viewer && viewer._id);
    if (!found.project) {
      return res.status(found.status).json({ success: false, message: found.message });
    }

    // Keyset paging on (paidAt, _id), the same shape /api/projects and the
    // history routes use: an offset drifts as rows arrive, and rows arrive
    // here exactly while somebody is reading the list.
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const filter = { projectId: found.project._id };
    const cursor = String(req.query.cursor || '').trim();
    if (cursor) {
      const at = new Date(cursor);
      if (!Number.isNaN(at.getTime())) filter.paidAt = { $lt: at };
    }

    const rows = await Contribution.find(filter)
      .sort({ paidAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit && page.length
      ? new Date(page[page.length - 1].paidAt).toISOString()
      : null;

    const totals = await projectTotals([found.project._id]);
    const summary = totals.get(String(found.project._id)) || { raised: 0, backers: 0, currency: '' };

    return res.json({
      success: true,
      contributions: page.map((row) => publicContribution(row, {
        viewerIsOwner: Boolean(found.isOwner),
        viewerId: viewer && viewer._id,
      })),
      nextCursor,
      // The totals travel with the list so the page's figures and the rows
      // under them come from one read and cannot disagree on screen.
      raised: summary.raised,
      backers: summary.backers,
      currency: summary.currency,
    });
  } catch (error) {
    console.error('Project contribution list error:', error);
    return res.status(500).json({ success: false, message: 'Could not load contributions.' });
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
      // Paid at the receiver's shop (their creator name) rather than at
      // them as a person. Only honoured when the receiver really has one.
      toCreator,
      // Sending a complaint's money back. Only ever closes the case when
      // this payment is its receiver paying its reporter — see
      // closeComplaintByReturn. Anything else about it is ignored.
      complaintId,
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

    beginPinAttempt(pinRecord);

    if (pinLockRemainingMs(pinRecord) > 0) {
      const locked = pinLockoutResponse(pinRecord);
      recordAudit({
        userId: sender._id, action: 'transaction.send.blocked', status: 'blocked',
        message: 'PIN locked out', req, metadata: { symbolId: sender.symbolId },
      });
      res.set('Retry-After', String(locked.retryAfterSeconds));
      return res.status(locked.status).json({
        success: false,
        message: locked.message,
        retryAfterSeconds: locked.retryAfterSeconds,
        lockedUntil: locked.lockedUntil,
      });
    }

    const isPinMatch = await bcrypt.compare(cleanPin, pinRecord.pinHash);

    if (!isPinMatch) {
      const failure = await registerPinFailure(pinRecord);

      recordAudit({
        userId: sender._id, action: 'transaction.send.pin_invalid', status: 'failed',
        message: `Invalid PIN (attempt ${pinRecord.failedAttempts}/${PIN_MAX_ATTEMPTS})`, req,
        metadata: { symbolId: sender.symbolId, lockedOut: failure.lockedNow },
      });

      if (failure.lockedNow) res.set('Retry-After', String(failure.retryAfterSeconds));

      return res.status(401).json({
        success: false,
        message: failure.message,
        attemptsRemaining: failure.attemptsRemaining,
        lockedUntil: pinRecord.lockedUntil,
      });
    }

    await registerPinSuccess(pinRecord);


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

    // ── ASKED-AND-ANSWERED COMES FIRST ──────────────────────────────────
    //
    // This block used to sit BELOW the balance check, and that order was a
    // bug with a specific, nasty shape (audit finding F5):
    //
    //   balance 1,000, send 800 → succeeds, balance is now 200
    //   the response is lost on the way back
    //   the client retries with the same idempotency key
    //   the balance check sees 200 < 800 and answers "Insufficient balance"
    //
    // The money moved. The answer said it did not. A person told their
    // payment failed does the one thing that makes it worse — they send it
    // again — and the second attempt carries a fresh key, so nothing stops
    // it. The ordering turned a lost response into a double payment.
    //
    // "Have I already done this?" is not a question about the current
    // balance, so it must not be asked after one. It is asked here, before
    // anything about the account's present state is consulted.
    if (cleanIdempotencyKey) {
      const existingIdempotentTransaction = await Transaction.findOne({
        fromUserId: sender._id,
        'metadata.idempotencyKey': cleanIdempotencyKey,
      }).sort({ createdAt: -1 });

      if (existingIdempotentTransaction) {
        // ── Is this the SAME request, or a key being reused? ────────────
        //
        // An idempotency key promises "this is the request I already sent".
        // Returning the original for a request that is NOT that one is the
        // other half of the hazard: a client that reuses a key for a
        // different payment is told it succeeded, and the payment it
        // actually asked for never happens.
        //
        // WHAT IS COMPARED, AND WHY ONLY THIS. The comparison is on what the
        // CALLER ASKED FOR — the payee, which side the amount was
        // denominated in, and that amount — and deliberately not on the
        // derived figures. `debitAmount` depends on the rate, and the rate
        // moves between an original and its retry as a matter of course. A
        // comparison that included it would reject honest retries during
        // ordinary rate movement, which is a worse failure than the one
        // being fixed here and would be blamed on the network.
        const stored = existingIdempotentTransaction.metadata || {};
        const storedBasis = stored.amountBasis || null;
        const storedAmount = storedBasis === 'source' ? stored.sourceAmount : stored.destinationAmount;
        const storedCurrency = storedBasis === 'source' ? stored.sourceCurrency : stored.destinationCurrency;
        const askedAmount = basis === 'source' ? sourceFaceAmount : numericAmount;
        const askedCurrency = basis === 'source' ? senderCurrency : destinationCurrency;

        // A row written before amountBasis was recorded cannot be compared.
        // Those are returned rather than refused: refusing a legitimate retry
        // of an older payment is the worse error, and the set of such rows
        // only shrinks.
        const comparable = storedBasis !== null && Number.isFinite(Number(storedAmount)) && Boolean(storedCurrency);
        const sameRequest =
          String(existingIdempotentTransaction.toUserId) === String(receiver._id) &&
          storedBasis === basis &&
          storedCurrency === askedCurrency &&
          Number(storedAmount) === Number(askedAmount);

        if (comparable && !sameRequest) {
          return res.status(409).json({
            success: false,
            code: 'idempotency_key_reused',
            message:
              'That request key was already used for a different payment. Start a new payment rather than retrying this one.',
          });
        }

        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Duplicate request ignored. Existing transaction returned.',
          // The same financial facts the original response carried, read back
          // off the stored row (see storedPaymentFacts).
          ...(await storedPaymentFacts(existingIdempotentTransaction, sender)),
          transaction: await cleanTransactionPayload(existingIdempotentTransaction, sender, receiver),
          // The share leg that was minted for that original payment, if it
          // had one. Same reference the first response carried, read back
          // rather than re-minted.
          shareTransaction: await existingShareLegPayload(existingIdempotentTransaction),
          // And the three the first response carried that this one did not:
          // the receipts, the settlement and the asset seed. See
          // storedPaymentArtifacts — a retry is the case where the client
          // has nothing of its own, and it was being told the least.
          ...(await storedPaymentArtifacts(existingIdempotentTransaction)),
        });
      }
    }

    // A courtesy check, not the authority. It fails fast with a useful figure
    // for the ordinary case of somebody trying to spend more than they have.
    // The check that actually protects the balance is the conditional debit
    // further down — this one reads a value that another request can change
    // before the write lands, which is exactly the race it used to be the only
    // guard against. Compared against debitAmount, not the typed amount —
    // that's what's actually about to leave the sender's own currency balance.
    //
    // Runs only for a genuinely new payment: a retry of one already made was
    // answered above, from the record, without consulting a balance that the
    // original payment itself has already changed.
    const senderBalanceBefore = accountBalanceOf(sender);

    if (senderBalanceBefore < debitAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance.',
        balance: senderBalanceBefore,
        currency: senderCurrency,
      });
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
        // Named here too: this response points at an existing payment, and a
        // client that shows it should show that payment's own figures rather
        // than fall back to the request it just sent.
        ...(await storedPaymentFacts(recentDuplicate, sender)),
        transaction: await cleanTransactionPayload(recentDuplicate, sender, receiver),
        // Same reasoning as the idempotency-key branch above: this response
        // names an existing payment, so it names that payment's existing
        // share leg too rather than leaving the client to guess.
        shareTransaction: await existingShareLegPayload(recentDuplicate),
        // And its receipts, settlement and seed, for the same reason. This
        // branch is not what the test drives — it fires on a resend without
        // an idempotency key — but it answers the same question about the
        // same payment, and answering it two different ways is how the two
        // drift.
        ...(await storedPaymentArtifacts(recentDuplicate)),
      });
    }

    // Audit fix (GLB-18): minted here, never adopted from the request. A
    // client that sends `referenceId` or `transactionId` has them ignored —
    // retry-safety is `idempotencyKey`, checked above, and that is unchanged.
    const transactionReference = await resolveTransactionReference();

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
        // ── Who the two parties WERE, at the moment this payment happened ──
        //
        // A receipt is a record of a past event, so the identities on it have
        // to be the identities as they stood then. Every projection of this
        // row used to resolve the counterparty by joining live to the User
        // collection — `.populate('fromUserId', 'fullName symbolId')` — which
        // means a receipt quietly rewrote itself whenever the other party
        // renamed their Gloobal ID, changed their display name, or moved
        // country. Reopening a six-month-old payment showed somebody who did
        // not exist under that name when it was made.
        //
        // Worse, the join could not answer the question at all for the flag:
        // it selected two fields and countryIso was not one of them, so no
        // reader downstream had a country to derive a flag from. That is why
        // a restored receipt had no flag on it — not a rendering bug, a field
        // that was never sent.
        //
        // So both sides are snapshotted here, once, and the projections read
        // this in preference to the join. countryIso goes through
        // accountCountryIso for the same reason every other country read in
        // this route does: an account written before registration recorded a
        // country carries the bare schema default, and the raw field would
        // stamp the wrong flag on the receipt permanently.
        //
        // Deliberately NOT authoritative for money. Nothing here is read back
        // to settle, refund or reconcile anything; it exists so a receipt can
        // name its two parties without a join. The amounts, currencies and
        // account ids above remain the only financial record.
        parties: {
          sender: {
            symbolId: sender.symbolId,
            fullName: sender.fullName || '',
            countryIso: accountCountryIso(sender),
            currency: senderCurrency,
          },
          receiver: {
            symbolId: receiver.symbolId,
            fullName: receiver.fullName || '',
            countryIso: accountCountryIso(receiver),
            currency: destinationCurrency,
            // The shop's creator name as it stood when it was paid — only
            // when the payer paid the SHOP and the receiver has one. History
            // lists the payment under it and the receipt opens its store.
            creatorHandle: toCreator === true && receiver.creatorProfile && receiver.creatorProfile.handle
              ? String(receiver.creatorProfile.handle)
              : null,
          },
        },
        // The Creator Share this payment carried, in the receiver's own
        // currency (`cashback`) and the sender's (`cashbackCredit`), with the
        // rate that produced them.
        //
        // GET /api/transactions/:symbolId has always projected
        // `metadata.cashback` and `metadata.cashbackRate` — and nothing ever
        // wrote them, so every restored row reported a 0% share on a payment
        // that really had one. The receipt's Creator Share tab is driven by
        // the same figures, which is why it vanished the moment a payment was
        // reopened from history rather than shown fresh.
        cashback,
        cashbackCredit,
        cashbackRate: payeeCashbackRate,
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
      // Tracks how much of the Creator Share actually reached the custody
      // account, so the no-transaction revert path below undoes exactly what
      // happened — not a fixed guess that would over- or under-revert
      // depending on which step failed.
      //
      // This was `cashbackAppliedToSender`, and it tracked the share landing
      // back in the SENDER'S BALANCE, which is the behaviour this no longer
      // is. The rename is not cosmetic: the revert maths below is different
      // in each case, and a variable still named for the old destination
      // would make the wrong version of it look right.
      let cashbackHeldInCustody = 0;
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

        // ── THE CREATOR SHARE IS HELD, NOT SPENT ─────────────────────────
        //
        // This used to be `$inc: { balance: cashbackCredit }` on the
        // sender: the share landed back in their spendable balance in the
        // same breath as the payment. The receipt said so — "Credited to:
        // Gloobal balance" — and it was telling the truth about a
        // behaviour that contradicted the product. The app's own explainer
        // has always said the share "comes straight back to you and is
        // planted in My Assets", and a figure cannot be both planted and
        // already spent.
        //
        // So the share now goes into the platform CUSTODY account for the
        // sender's currency, and the AssetSeed planted moments later
        // (principalHeld: true) is what entitles them to it. They claim it
        // into balance whenever they choose, along with the interest it
        // has grown — see POST /api/assets/claim-interest.
        //
        // ── Why custody and not simply "do not credit anybody" ──────────
        //
        // Because the money has to BE somewhere. The sender is debited
        // `debitAmount` and the payee is credited `payeeReceives`, which is
        // less by exactly the share. Leaving that difference uncredited
        // would destroy it: the ledger would show more leaving than
        // arriving, the account that funds the eventual claim would never
        // have received it, and the claim would then be Gloobal paying out
        // money nothing funded — the precise defect lib/disbursement.js and
        // PlatformAccount were created to end.
        //
        // ── Why not the disbursement account ────────────────────────────
        //
        // Custody holds money that belongs to a USER. The disbursement
        // account is an expense account whose monotonic `disbursedTotal` is
        // what "Our spending" is built from, and handing somebody back
        // their own held share is not Gloobal spending anything. Running
        // the principal through it would inflate that figure by every claim
        // ever made.
        //
        // The sender's balance after the debit, and it stays that way:
        // nothing below moves it again. It was called
        // `senderBalanceAfterDebit` when a credit followed, and the
        // name is now simply what it is — the figure both the debit line
        // and the hold line below are measured against.
        const senderBalanceAfterDebit = senderBalanceAfter;

        if (cashbackCredit > 0) {
          const custody = await PlatformAccount.custodyFor(senderCurrency, session || null);
          const heldAfter = await PlatformAccount.updateOne(
            { _id: custody._id },
            { $inc: { balance: cashbackCredit } },
            sessionOpt
          );

          // The custody write is the half of this pair that makes the
          // books balance. If it did not apply, the share has been taken
          // out of the sender and put nowhere — so this throws rather than
          // continuing, and the surrounding transaction takes the whole
          // payment back out.
          if (!heldAfter?.matchedCount && !heldAfter?.modifiedCount) {
            throw new Error('Creator Share could not be placed in custody — refusing to debit a share that lands nowhere.');
          }

          cashbackHeldInCustody = cashbackCredit;
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
            balanceAfter: senderBalanceAfterDebit,
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
          // ── THE SHARE'S OWN LINE, AND IT IS NO LONGER A BALANCE LINE ──
          //
          // This used to be a credit to the sender for cashbackCredit, with
          // balanceBefore/balanceAfter straddling the moment their balance
          // rose. Their balance does not rise any more, so a line claiming
          // it did would be the one thing a ledger may never be: a record
          // of something that did not happen.
          //
          // The movement is still real and still recorded. It is a HOLD:
          // the share left the sender's balance as part of the debit above
          // and came to rest in the custody account, where the AssetSeed
          // planted moments later entitles them to it.
          //
          // balanceBefore and balanceAfter are both the balance after the
          // debit — the same figure twice, deliberately, because that is
          // the true answer to "what was this account worth either side of
          // this line". `heldInCustody` in the metadata is what makes this
          // line findable as a hold rather than read as a zero-value
          // credit, and `custodyKey` names the account the money is in.
          ledgerRows.push({
            transactionId: transaction._id,
            userId: sender._id,
            entryType: 'credit',
            amount: cashbackCredit,
            balanceBefore: senderBalanceAfterDebit,
            balanceAfter: senderBalanceAfterDebit,
            currency: senderCurrency,
            note: 'Creator Share held in My Assets',
            metadata: {
              prototype: true,
              transactionReferenceId: transaction.referenceId,
              cashback: cashbackCredit,
              cashbackRate: payeeCashbackRate,
              fxRate,
              faceCashback: cashback,
              faceCurrency: destinationCurrency,
              // The two fields that say this is a hold. Anything reading
              // these rows to answer "what did this account receive" must
              // skip a line carrying heldInCustody — it is owed, not held
              // by them, until they claim it.
              heldInCustody: true,
              custodyKey: `platform:custody:${String(senderCurrency || '').toUpperCase()}`,
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
            // THE WHOLE DEBIT GOES BACK. It used to be
            // `debitAmount - cashbackAppliedToSender`, because the share had
            // been credited into this same balance moments earlier and
            // refunding the gross would have refunded that twice. The share
            // no longer touches this balance at all, so the sender is owed
            // every unit that left it.
            await User.updateOne(
              { _id: sender._id },
              { $inc: { balance: debitAmount } }
            );
            if (creditedReceiver) {
              await User.updateOne({ _id: receiver._id }, { $inc: { balance: -payeeReceives } });
            }
            // And the held share comes back out of custody, for the same
            // reason the payee's credit does: this payment did not happen,
            // so nothing it placed anywhere may be left behind. Only if
            // this step is the one that moved it — hence the counter rather
            // than a fixed figure.
            if (cashbackHeldInCustody > 0) {
              try {
                const custody = await PlatformAccount.custodyFor(senderCurrency);
                await PlatformAccount.updateOne(
                  { _id: custody._id },
                  { $inc: { balance: -cashbackHeldInCustody } }
                );
              } catch (custodyRevertError) {
                // Logged rather than swallowed into the outer catch: a
                // share left in custody for a reversed payment is money
                // held against a seed that will never exist, and it has to
                // be findable afterwards.
                console.error('Custody revert failed — a reversed payment left a share held:', custodyRevertError);
              }
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
          message:
            `Insufficient pool liquidity (${transferError.countryIso}/${transferError.currency} ` +
            `settling with ${transferError.counterCurrency || 'unknown'})`,
          req,
          metadata: {
            symbolId: sender.symbolId, receiverSymbolId: receiver.symbolId,
            countryIso: transferError.countryIso, currency: transferError.currency,
            // Which of the country's corridors ran short. A country holds one
            // pool per counterpart currency, so without this the audit row
            // names ten corridors at once and identifies none of them.
            counterCurrency: transferError.counterCurrency || null,
            requested: transferError.requested, available: transferError.available,
          },
        });
        // What this message has to get right, and used to get wrong.
        //
        // It named the corridor as "IN/INR", which is ten different corridors
        // on the live database — one per counterpart currency — and it told
        // the payer to try again later. For a corridor drained by real
        // settlement, later is not a thing that helps: a pool regains
        // liquidity only when payments run the other way through that same
        // pair, and nothing else replenishes it. That is the identical defect
        // UnseededCorridorPoolError was introduced to fix for the closed-
        // corridor case, on the drained-corridor case.
        //
        // So it now names the pair, and offers the one thing the payer can
        // actually do: send less. The figures stay in the audit row rather
        // than on the payer's screen — how much liquidity a corridor holds is
        // the network's business, not the counterparty's.
        const shortCorridor = transferError.counterCurrency
          ? `${transferError.countryIso}/${transferError.currency} settling with ${transferError.counterCurrency}`
          : `${transferError.countryIso}/${transferError.currency}`;
        return res.status(503).json({
          success: false,
          message:
            `This payment corridor (${shortCorridor}) does not have enough settlement liquidity ` +
            'for a payment this size. Nothing has left your balance. A smaller payment may still ' +
            'go through; a payment this size needs the corridor to be topped up first.',
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
            // Same facts as the pre-check branch: the loser of the race is a
            // retry and must be answered with the winner's recorded figures.
            ...(await storedPaymentFacts(winningTransaction, sender)),
            transaction: await cleanTransactionPayload(winningTransaction, sender, receiver),
            // The winner's share leg, for the same reason the pre-check
            // branch carries it: the loser of the race is a retry, and a
            // retry that comes back without the share reference leaves its
            // receipt printing the payment's id under the share's label.
            //
            // Read AFTER the artifacts below, not before: storedPaymentArtifacts
            // is what waits for the winner to finish minting, and asking for
            // the leg first would ask before it exists. Object spread
            // evaluates in source order, so the await on the line below has
            // already resolved by the time this one runs.
            ...(await storedPaymentArtifacts(winningTransaction, { awaitMint: true })),
            shareTransaction: await existingShareLegPayload(winningTransaction),
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

    // One notification each for the payer and the payee. Awaited so the
    // payee's inbox already holds it by the time the payer sees "sent", but
    // best-effort: the money has moved and the record exists, so nothing
    // about a notification can be allowed to turn this into an error. Both
    // idempotent-replay answers above return before reaching here, and the
    // unique index on (userId, metadata.transactionId) covers any retry that
    // somehow does not.
    let notificationLegs = [];
    try {
      notificationLegs = await recordPaymentNotifications({
        transaction: completedTransaction,
        sender,
        receiver,
        debitAmount,
        senderCurrency,
        destinationCurrency,
      }) || [];
    } catch (notificationError) {
      console.error('Payment notification error (non-fatal):', notificationError);
    }

    // A payment that sends a complaint's money back closes that case.
    // Never throws; the payment has already happened.
    if (complaintId) {
      await closeComplaintByReturn({ complaintId, transaction: completedTransaction, sender, receiver });
    }

    // Web Push, in its OWN try/catch on purpose. Folding it into the block
    // above would mean a push failure was logged as a notification failure,
    // and — worse — that a throw from the notification write skipped nothing
    // while a throw from the push looked like the inbox row had failed too.
    // Two effects, two catches, two log prefixes.
    //
    // Only the legs just created are pushed; see recordPaymentNotifications.
    try {
      await sendPaymentPushes(notificationLegs, completedTransaction);
    } catch (pushError) {
      console.error('Payment push error (non-fatal):', pushError);
    }

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
          // THE PRINCIPAL IS HELD, AND THIS SEED IS WHAT ENTITLES THEM TO
          // IT. performTransfer put cashbackCredit into the custody account
          // for this currency rather than into the sender's balance; this
          // flag is the claim on it.
          //
          // Every seed planted before this existed has no such field, reads
          // as false, and is correctly understood as "already credited to
          // balance, nothing here to claim" — see the model's header on why
          // there is no backfill and must not be one.
          principalHeld: true,
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
        // The same diversion from the PAYEE's side: what was withheld from
        // their credit, in their own currency. The share row is an outgoing
        // row in their history, so this is the figure it has to show — and
        // on a cross-border payment it is not cashbackCredit.
        payeeCashback: cashback,
        payeeCurrency: destinationCurrency,
        cashbackRate: payeeCashbackRate,
        assetSeedId: plantedSeed?._id || null,
      }));
    } catch (receiptError) {
      // mintShareLegAndReceipts already catches and logs internally; this
      // is only a backstop against a bug in that catch itself.
      console.error('Receipt/share-leg step raised unexpectedly (non-fatal):', receiptError);
    }

    // Tell both people the share happened.
    //
    // Only when there IS one: mintShareLegAndReceipts returns a null
    // shareTransaction for a payment whose payee shares nothing, and
    // recordShareNotifications returns immediately on that — a notification
    // saying somebody shared 0.00 is a statement about money that did not
    // move.
    //
    // Runs AFTER the share leg exists, which is why it is here rather than
    // beside the payment notifications two hundred lines up: it needs the
    // leg's own reference and its own createdAt, so the row it writes points
    // at the Creator Share receipt rather than at the payment.
    //
    // Best-effort in its own try/catch, like every other step after the
    // money moved. The transfer is committed and the receipts are written;
    // nothing about a notification may turn that into an error.
    if (shareTransaction) {
      try {
        const shareLegs = await recordShareNotifications({
          shareTransaction,
          paymentTransaction: completedTransaction,
          sender,
          receiver,
        });
        // The same push path a payment uses. Handed the SHARE transaction,
        // so the tag, the timestamp and the `?txn=` link are the share's —
        // tapping the banner opens the Creator Share receipt, and the two
        // banners for one payment collapse separately rather than one
        // replacing the other.
        await sendPaymentPushes(shareLegs, shareTransaction);
      } catch (shareNotifyError) {
        console.error('Share notification error (non-fatal):', shareNotifyError);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Prototype transaction completed successfully.',
      transaction: await cleanTransactionPayload(completedTransaction, sender, receiver),
      newBalance: senderBalanceAfter,
      // The Creator Share this payment earned, in the sender's own
      // currency, matching the currency their dashboard and toast already
      // display amounts in. `payeeReceives` below stays in the receiver's
      // own currency, same as always.
      //
      // IT IS NOT IN `newBalance`. This comment used to say the figure was
      // "what actually landed back in their balance"; it no longer lands
      // there at all. The share is held in custody against the AssetSeed in
      // `assetSeed` below, and `cashbackDestination` says so out loud
      // rather than leaving every caller to infer it — the success screen,
      // the toast and the receipt all have to say where it went, and a
      // field they can read is better than three places guessing.
      cashback: cashbackCredit,
      cashbackDestination: cashbackCredit > 0 ? 'assets' : null,
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
      settlement: settlement ? settlementPayload(settlement) : null,
      shareTransaction: shareTransaction
        ? {
            referenceId: shareTransaction.referenceId,
            // Its own short receipt-link handle, for the same reason the
            // payment above has one and distinct from it.
            receiptCode: await ensureReceiptCode(shareTransaction),
            amount: shareTransaction.amount,
            currency: shareTransaction.currency,
            ...shareLegPayeeSide(shareTransaction),
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

// ─── Notifications ──────────────────────────────────────────────────────────
//
// Payment notifications, written by POST /api/transactions/send once the
// transfer has committed. Every figure is the server's own: the payer is told
// what actually left their balance (debitAmount, in their own currency), the
// payee what was actually credited to theirs (payeeReceives, in theirs) —
// never a client-side conversion, which on a cross-border payment would
// disagree with both balances.

// A display name that is safe to show the OTHER party. Accounts from before
// the name step carry their own phone number as fullName, and putting that in
// a counterparty's inbox would hand out the full number the resolve route
// deliberately masks (GLB-17). Such an account is named by its Gloobal ID.
function notificationDisplayName(partySnapshot, user) {
  const name = String(partySnapshot?.fullName || user?.fullName || '').trim();
  const symbolId = partySnapshot?.symbolId || user?.symbolId || '';
  const looksLikePhone = /^\+?[\d\s()-]{6,}$/.test(name);
  const isOwnMobile = Boolean(user?.mobileNumber) && normalizeText(name) === normalizeText(user.mobileNumber);
  if (!name || looksLikePhone || isOwnMobile) return symbolId;
  return name.slice(0, 80);
}

// In the currency's own precision — a zero-decimal currency never reads "500.00".
function formatNotificationAmount(amount, currency) {
  const places = decimalsFor(currency);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(Number(amount) || 0);
}

// Writes the payer's and the payee's notification for one payment. Upserted
// under $setOnInsert on (userId, transactionId), so a repeat is a no-op
// rather than a second row or an overwrite of one already read; a concurrent
// insert losing to the unique index (E11000) is the same outcome and is not
// an error. Only ever called for the payment leg — share legs are not money
// the payee sent or the payer received, and are not announced.
// `payeeReceives` used to be a parameter here and is deliberately gone.
//
// It is numericAmount minus the Creator Share, and passing it in is what
// let the payee's notification be the NET while the payer's was the GROSS —
// so one payment was two different sizes depending on whose phone it
// reached, and the share notification beside it then counted the deduction
// a second time. The face value is read off `transaction.amount`, which is
// the figure History and the receipt both use.
async function recordPaymentNotifications({
  transaction,
  sender,
  receiver,
  debitAmount,
  senderCurrency,
  destinationCurrency,
}) {
  const transactionId = String(transaction._id);
  const parties = transaction.metadata?.parties || {};
  const senderName = notificationDisplayName(parties.sender, sender);
  const receiverName = notificationDisplayName(parties.receiver, receiver);
  // Never throws; null just means the notification links by referenceId.
  const receiptCode = (await ensureReceiptCode(transaction)) || null;

  // The rate this payment settled at, in the direction it is stored: 1 unit
  // of the RECEIVER's currency into the SENDER's. Carried as recorded, never
  // inverted — the receipt states the same figure, and two rates for one
  // payment is how a record stops reconciling.
  const fxRate = Number(transaction.metadata?.fxRate);
  const storedRate = Number.isFinite(fxRate) && fxRate > 0 ? fxRate : null;

  const entries = [
    {
      userId: sender._id,
      title: 'Money sent',
      message: `You sent ${formatNotificationAmount(debitAmount, senderCurrency)} ${senderCurrency} to ${receiverName}`,
      direction: 'sent',
      amount: debitAmount,
      currency: senderCurrency,
      // The OTHER side of the same payment. A notification used to carry one
      // figure, which is the viewer's own — fine for a line of text, not
      // enough for a card that shows what was paid and what arrived. Both
      // sides are the server's own numbers here; nothing is multiplied out.
      // The face value too, for the same reason — and so the payer's card
      // and the payee's card quote the same number for one payment. This
      // was `payeeReceives`, which told the payer their counterparty got
      // 990 while the payee's own receipt and History said 1,000.
      counterAmount: transaction.amount,
      counterCurrency: destinationCurrency,
      counterpartyName: receiverName,
      counterpartySymbolId: receiver.symbolId,
      counterpartyIso: parties.receiver?.countryIso || accountCountryIso(receiver) || null,
      pushType: 'payment.sent',
    },
    {
      // ── THE FACE VALUE, NOT WHAT WAS LEFT AFTER THE SHARE ────────────
      //
      // This was `payeeReceives` — numericAmount minus the Creator Share —
      // and that made the two sides of one payment disagree about its size.
      // The payer's leg above carries `debitAmount`, the GROSS that left
      // their balance, and the share comes back to them as its own,
      // separate notification. The payee's leg carried the NET, and the
      // share then went out as its own notification too. So on a 1,000 at
      // 1%:
      //
      //   payer   −1,000  then  +10     net −990   correct
      //   payee     +990  then  −10     net  980   wrong by the share
      //
      // The payee's balance rose by 990. Reported this way it reads as 980,
      // because the deduction was counted twice: once inside the figure and
      // once as the share notification beside it.
      //
      // Gross is also what the rest of the app says about this payment. The
      // History row is `transaction.amount` (see the history projections)
      // and the receipt prints the same face value; the share is a separate
      // row in both. The notification was the only surface netting it, and
      // the only one that had no share row to balance it against — until
      // this branch grew one.
      //
      // Read off the stored transaction rather than recomputed, so it is
      // the same number History reads.
      userId: receiver._id,
      title: 'Money received',
      message: `You received ${formatNotificationAmount(transaction.amount, destinationCurrency)} ${destinationCurrency} from ${senderName}`,
      direction: 'received',
      amount: transaction.amount,
      currency: destinationCurrency,
      counterAmount: debitAmount,
      counterCurrency: senderCurrency,
      counterpartyName: senderName,
      counterpartySymbolId: sender.symbolId,
      counterpartyIso: parties.sender?.countryIso || accountCountryIso(sender) || null,
      pushType: 'payment.received',
    },
  ];

  // What the DEVICE is shown, which is not what the inbox row says. The
  // inbox is a list and reads in the first person ("You received 2,000.00
  // INR from Rajeev"); a banner is one line on a lock screen and reads as a
  // headline — "+2,000.00₹ received", "From Rajeev".
  //
  // Composed from the same four fields the card in the app reads, by a
  // function written to produce the same two strings as the card's own
  // (paymentBannerText, lib/notificationText.js). It used to say "Payment
  // Received" over "2000.00 INR received from Rajeev", which was a third
  // wording for an event that already had two.
  for (const entry of entries) {
    const banner = paymentBannerText({
      direction: entry.direction,
      amount: entry.amount,
      currency: entry.currency,
      counterpartyName: entry.counterpartyName,
    });
    entry.pushTitle = banner.title;
    entry.pushBody = banner.body;
  }

  const results = await Promise.allSettled(
    entries.map((entry) =>
      Notification.updateOne(
        { userId: entry.userId, 'metadata.transactionId': transactionId },
        {
          // Dotted paths, not a whole `metadata` object: the filter already
          // seeds metadata.transactionId into the inserted document, and
          // replacing `metadata` wholesale would conflict with it.
          $setOnInsert: {
            type: 'payment',
            title: entry.title,
            message: entry.message,
            readAt: null,
            'metadata.referenceId': transaction.referenceId || null,
            'metadata.receiptCode': receiptCode,
            'metadata.direction': entry.direction,
            'metadata.amount': entry.amount,
            'metadata.currency': entry.currency,
            'metadata.counterpartyName': entry.counterpartyName,
            'metadata.counterpartySymbolId': entry.counterpartySymbolId,
            // The counterparty's country, so the card can show their flag
            // without asking a second route who they are; and the payment's
            // other side with the rate between them, so it can show what was
            // paid against what arrived. All four are null on a domestic
            // payment or an older row, and the card simply draws fewer pages.
            'metadata.counterpartyIso': entry.counterpartyIso,
            'metadata.counterAmount': entry.counterAmount,
            'metadata.counterCurrency': entry.counterCurrency,
            'metadata.fxRate': storedRate,
            // WHEN THE MONEY MOVED, which is not when this row was written.
            //
            // They are usually milliseconds apart, and that is exactly why
            // it was easy to leave out: the card printed the notification's
            // own createdAt and looked right. But a notification is a
            // pointer at a payment, and the time on it should be the
            // payment's — the same instant the receipt prints, the same one
            // History sorts by. A row re-written after a retry, or backfilled,
            // would otherwise date the payment to whenever the inbox caught
            // up with it.
            'metadata.occurredAt': transaction.createdAt || null,
          },
        },
        { upsert: true }
      )
    )
  );

  // Both inboxes trimmed to the cap, after the writes and before anything is
  // pushed. Sequential rather than parallel: the two legs are two different
  // accounts, and a prune that fails for one must not abandon the other.
  for (const entry of entries) await pruneNotifications(entry.userId);

  // Which legs this call actually created, in the same order as `entries`.
  //
  // THIS IS THE IDEMPOTENCY KEY FOR PUSH. `upsertedCount === 1` is Mongo
  // telling us the row did not exist until this write — so this call, and no
  // other, is the one allowed to buzz that person's phone. A replay, a race
  // that lost, or a rejection with E11000 all mean the row was already there
  // and the device has already been told. Reusing the unique index this way is
  // deliberate: a second de-duplication mechanism could disagree with the
  // first, and then the inbox and the lock screen would tell different stories.
  const legs = [];

  results.forEach((result, index) => {
    const entry = entries[index];
    if (result.status === 'rejected' && result.reason?.code !== 11000) {
      console.error(`Payment notification write failed for ${transaction.referenceId}:`, result.reason);
    }

    const created = result.status === 'fulfilled' && result.value?.upsertedCount === 1;

    legs.push({
      userId: entry.userId,
      direction: entry.direction,
      created,
      notificationId: created && result.value?.upsertedId ? String(result.value.upsertedId._id || result.value.upsertedId) : null,
      type: entry.pushType,
      title: entry.pushTitle,
      body: entry.pushBody,
    });
  });

  return legs;
}

// ── A Creator Share, as a notification for both sides ───────────────────
//
// ── What was missing ──────────────────────────────────────────────────
//
// lib/merchantShareFlow.js mints the share leg and its receipt pair, and
// the string "notif" does not appear in it. So a share was released, money
// moved on both sides, four receipts were written — and neither party was
// told anything. The payee learned they had given a cut only by opening the
// payment's receipt and finding a second tab; the payer learned they had
// been given one by noticing their balance was higher than the figure on
// the notification they HAD received, which said they sent the full amount.
//
// ── Why it is two notifications and not one ───────────────────────────
//
// A share has two sides and they are different events to the two people.
// The payee GAVE something, out of money they were being paid. The payer
// GOT something back, after a payment they had already been told about.
// One shared row would have to pick a direction, and the one it picked
// would be wrong for somebody.
//
// ── Which figure goes on which ────────────────────────────────────────
//
// The share leg stores both sides, in their own currencies, and they are
// not the same number across a corridor:
//
//   shareTransaction.amount / .currency     the PAYER's credit, the
//                                           payer's currency
//   metadata.debitAmount / .senderCurrency  the PAYEE's withholding, the
//                                           payee's currency
//
// Each person is shown THEIR side as the figure and the other as the
// counter-figure, which is exactly the contract recordPaymentNotifications
// follows. Nothing here multiplies, divides or converts: both figures were
// recorded by the flow that moved the money.
//
// No fxRate. The payment's rate is stored on the payment, not on this leg,
// and a rate derived by dividing one of these by the other is a third
// number that reconciles with neither. The card draws the conversion page
// without a rate note when there is none.
async function recordShareNotifications({ shareTransaction, paymentTransaction, sender, receiver }) {
  if (!shareTransaction) return [];

  const shareId = String(shareTransaction._id);
  const meta = shareTransaction.metadata || {};
  // The PAYMENT's party snapshot, read the way the payment's own
  // notification reads it. The share leg carries a SWAPPED copy (see
  // merchantShareFlow), and reading that one here would name each person as
  // themselves — the same mistake that snapshot exists to prevent.
  const parties = paymentTransaction?.metadata?.parties || {};
  const payerName = notificationDisplayName(parties.sender, sender);
  const payeeName = notificationDisplayName(parties.receiver, receiver);
  const receiptCode = (await ensureReceiptCode(shareTransaction)) || null;

  // The payer's side: what came back, in the payer's own currency.
  const payerAmount = Number(shareTransaction.amount);
  const payerCurrency = shareTransaction.currency || null;
  // The payee's side: what was withheld, in theirs.
  const payeeAmount = Number.isFinite(Number(meta.debitAmount)) ? Number(meta.debitAmount) : payerAmount;
  const payeeCurrency = meta.senderCurrency || payerCurrency;

  const reference = paymentTransaction?.referenceId || '';
  const onPayment = reference ? ` on ${reference}` : '';

  const entries = [
    {
      // The payee, who gave it. `fromUserId` on the share leg is theirs.
      userId: receiver._id,
      title: 'Creator Share sent',
      message: `You shared ${formatNotificationAmount(payeeAmount, payeeCurrency)} ${payeeCurrency} with ${payerName}${onPayment}`,
      direction: 'sent',
      amount: payeeAmount,
      currency: payeeCurrency,
      counterAmount: payerAmount,
      counterCurrency: payerCurrency,
      counterpartyName: payerName,
      counterpartySymbolId: sender.symbolId,
      counterpartyIso: parties.sender?.countryIso || accountCountryIso(sender) || null,
      pushType: 'share.sent',
    },
    {
      // The payer, who got it back.
      userId: sender._id,
      title: 'Creator Share received',
      message: `You earned ${formatNotificationAmount(payerAmount, payerCurrency)} ${payerCurrency} back from ${payeeName}${onPayment}`,
      direction: 'received',
      amount: payerAmount,
      currency: payerCurrency,
      counterAmount: payeeAmount,
      counterCurrency: payeeCurrency,
      counterpartyName: payeeName,
      counterpartySymbolId: receiver.symbolId,
      counterpartyIso: parties.receiver?.countryIso || accountCountryIso(receiver) || null,
      pushType: 'share.received',
    },
  ];

  // The lock screen's two lines, from lib/notificationText.js — the same
  // file the payment banner is composed in, for the same reason: the card
  // in the app, the page's own banner and this push must not invent three
  // wordings for one event. A share says "Creator Share from Rajeev Menon"
  // under its figure, where a payment says "From Rajeev Menon", so the two
  // are told apart on a lock screen where they land seconds apart.
  for (const entry of entries) {
    const banner = shareBannerText({
      direction: entry.direction,
      amount: entry.amount,
      currency: entry.currency,
      counterpartyName: entry.counterpartyName,
    });
    entry.pushTitle = banner.title;
    entry.pushBody = banner.body;
  }

  const results = await Promise.allSettled(
    entries.map((entry) =>
      Notification.updateOne(
        // Keyed on the SHARE leg's id, not the payment's. The unique index
        // is (userId, metadata.transactionId), so a share and the payment
        // that produced it are two different rows for the same person and
        // neither is refused as a duplicate of the other — while a replay of
        // either is still refused as a duplicate of itself.
        { userId: entry.userId, 'metadata.transactionId': shareId },
        {
          $setOnInsert: {
            type: 'share',
            title: entry.title,
            message: entry.message,
            readAt: null,
            // The SHARE's own reference, so tapping opens the Creator Share
            // receipt rather than the payment's. The payment's reference is
            // carried separately, because the share's receipt describes the
            // payment it came from and the card can say which one.
            'metadata.referenceId': shareTransaction.referenceId || null,
            'metadata.paymentReferenceId': reference || null,
            'metadata.receiptCode': receiptCode,
            'metadata.direction': entry.direction,
            'metadata.amount': entry.amount,
            'metadata.currency': entry.currency,
            'metadata.counterpartyName': entry.counterpartyName,
            'metadata.counterpartySymbolId': entry.counterpartySymbolId,
            'metadata.counterpartyIso': entry.counterpartyIso,
            'metadata.counterAmount': entry.counterAmount,
            'metadata.counterCurrency': entry.counterCurrency,
            'metadata.occurredAt': shareTransaction.createdAt || null,
          },
        },
        { upsert: true }
      )
    )
  );

  for (const entry of entries) await pruneNotifications(entry.userId);

  // Same idempotency key as the payment legs: `upsertedCount === 1` is the
  // one write that created the row, and only that one may buzz a phone.
  const legs = [];
  results.forEach((result, index) => {
    const entry = entries[index];
    if (result.status === 'rejected' && result.reason?.code !== 11000) {
      console.error(`Share notification write failed for ${shareTransaction.referenceId}:`, result.reason);
    }
    const created = result.status === 'fulfilled' && result.value?.upsertedCount === 1;
    legs.push({
      userId: entry.userId,
      direction: entry.direction,
      created,
      notificationId: created && result.value?.upsertedId ? String(result.value.upsertedId._id || result.value.upsertedId) : null,
      type: entry.pushType,
      title: entry.pushTitle,
      body: entry.pushBody,
    });
  });

  return legs;
}


// ── Web Push for a payment ──────────────────────────────────────────────────
//
// Fires only for legs recordPaymentNotifications says it just created, so a
// retried or duplicated payment event produces no second banner. Best-effort
// and silent on failure: the money has moved and the inbox row exists either
// way, and pushService itself never throws.
async function sendPaymentPushes(legs, transaction) {
  const created = (Array.isArray(legs) ? legs : []).filter((leg) => leg.created);
  if (created.length === 0) return { sent: 0, removed: 0, failed: 0, skipped: 0 };
  if (!pushService.isPushEnabled()) return { sent: 0, removed: 0, failed: 0, skipped: created.length };

  // The payment's referenceId, not its Mongo _id. `?txn=` and the worker's
  // push-click message are both matched against the history row's txnId,
  // which is the referenceId (see mapServerTransaction in App.jsx and the
  // /t/:referenceId redirect above). Sending the _id meant tapping a
  // notification found no row, and the link was dropped without opening
  // any receipt. _id stays as a fallback for a row minted without one.
  const transactionId = String(transaction.referenceId || transaction._id);
  // The instant the platform PRINTS on the notification, and it is the
  // payment's own — the same one the card's Date and time page shows and
  // the receipt prints. It was Date.now(), the moment this function ran,
  // which is the same thing on a normal send and is not on a retry, a
  // backfill, or a device that was offline when the money moved: the
  // notification would then be stamped with when it was finally pushed
  // rather than when it happened.
  const occurredAt = transaction.createdAt ? new Date(transaction.createdAt).getTime() : NaN;
  const timestamp = Number.isFinite(occurredAt) ? occurredAt : Date.now();
  const totals = { sent: 0, removed: 0, failed: 0, skipped: 0 };

  // The coloured disc this payment is drawn with in the app, as a path the
  // worker can hand straight to showNotification. Seeded on the referenceId
  // and ONLY on the referenceId: the card seeds on metadata.referenceId too,
  // so the two agree, and a payment minted without one gets no disc rather
  // than a disc picked from a different string — which would be the wrong
  // colour seven times in eight. Without it the worker shows the app icon,
  // which is what every notification showed before these existed.
  const icon = transaction.referenceId ? notifDiscIcon(String(transaction.referenceId)) : null;

  for (const leg of created) {
    const result = await pushService.sendPushToUser(
      leg.userId,
      {
        v: 1,
        category: 'transactional',
        type: leg.type,
        notificationId: leg.notificationId,
        transactionId,
        title: leg.title,
        body: leg.body,
        icon,
        // The app already reads ?txn= and opens that receipt, so tapping the
        // banner lands on the payment it is about rather than the home screen.
        url: `/?txn=${transactionId}`,
        // One tag per payment, so the payer's and payee's devices each collapse
        // a duplicate rather than stacking two identical banners. The open
        // app's own arrival banner (notifyPaymentReceived) uses this same
        // tag, so a push and a foreground poll for one payment collapse
        // into a single tray entry instead of two.
        tag: `gloobal-txn-${transactionId}`,
        timestamp,
      },
      { category: 'transactional' }
    );
    totals.sent += result.sent;
    totals.removed += result.removed;
    totals.failed += result.failed;
    totals.skipped += result.skipped;
  }

  return totals;
}

const isoOrNull = (value) => (value ? new Date(value).toISOString() : null);

function publicNotification(doc) {
  const metadata = doc.metadata || {};
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    readAt: isoOrNull(doc.readAt),
    createdAt: isoOrNull(doc.createdAt),
    metadata: {
      transactionId: metadata.transactionId ?? null,
      referenceId: metadata.referenceId ?? null,
      receiptCode: metadata.receiptCode ?? null,
      direction: metadata.direction ?? null,
      amount: typeof metadata.amount === 'number' ? metadata.amount : null,
      currency: metadata.currency ?? null,
      counterpartyName: metadata.counterpartyName ?? null,
      counterpartySymbolId: metadata.counterpartySymbolId ?? null,
      // The counterparty's country and the payment's other side, for the card
      // the inbox draws. Null on a domestic payment, and null on every row
      // written before these were recorded — the card reads them as absent
      // and draws one page fewer rather than guessing at a conversion.
      counterpartyIso: metadata.counterpartyIso ?? null,
      counterAmount: typeof metadata.counterAmount === 'number' ? metadata.counterAmount : null,
      counterCurrency: metadata.counterCurrency ?? null,
      fxRate: typeof metadata.fxRate === 'number' ? metadata.fxRate : null,
      // When the money moved, as an instant. Null on every row written
      // before this was recorded, and the card falls back to its own
      // createdAt there — honest rather than absent, since for those rows
      // the two really were written together.
      occurredAt: isoOrNull(metadata.occurredAt),
      // THE PAYMENT A CREATOR SHARE CAME FROM.
      //
      // `referenceId` above is the SHARE leg's own, because that is what
      // the notification points at — tapping it opens the Creator Share
      // receipt. But a share is only meaningful next to the payment that
      // produced it ("20.00₹ back on GLB-PAY-9001"), and without this the
      // card could name the share and not the thing it was a share OF.
      //
      // Null on every other type, which have no payment above them.
      paymentReferenceId: metadata.paymentReferenceId ?? null,
    },
  };
}

// Every notification route is scoped by the token's own account id and by
// nothing the request names, so there is no way to ask about somebody else's
// inbox — and a row that is not yours answers exactly like a row that does
// not exist, for the same reason a stranger's draft project 404s.
const unreadNotificationCount = (userId) => Notification.countDocuments({ userId, readAt: null });

// How many notifications an account keeps. The inbox is a nudge, not a
// ledger: every payment it announces is in History with its receipt, and the
// receipt is the record. Five is what fits a glance, and keeping five means
// the collection cannot grow without bound for somebody who pays five times a
// day.
//
// It was ten, briefly. Ten is not a glance — the sheet opens on five and the
// rest are a scroll, which is the shape of a list you are meant to work
// through rather than notice. Anything older than the newest few is already
// better answered by History, which is sorted, searchable and complete.
const NOTIFICATION_KEEP = 5;

// Drop everything past the newest NOTIFICATION_KEEP for one account.
//
// Called after a write rather than on a schedule, so the cap holds the moment
// it is exceeded and there is nothing to run separately. Best-effort: a failure
// here must never fail the payment that triggered it — the row is written, the
// device is told, and the worst case is an inbox one item longer than intended
// until the next write trims it.
async function pruneNotifications(userId) {
  try {
    const keep = await Notification.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(NOTIFICATION_KEEP)
      .select('_id')
      .lean();
    if (keep.length < NOTIFICATION_KEEP) return 0;
    const { deletedCount } = await Notification.deleteMany({
      userId,
      _id: { $nin: keep.map((row) => row._id) },
    });
    return deletedCount || 0;
  } catch (error) {
    console.error('Notification prune failed:', error.message);
    return 0;
  }
}

const notificationNotFound = (res) =>
  res.status(404).json({ success: false, code: 'notification_not_found', message: 'Notification not found.' });

// GET /api/notifications?limit=10&before=<ISO date> — newest first.
app.get('/api/notifications', lookupLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const requested = Number.parseInt(String(req.query.limit ?? ''), 10);
    // Capped at what an account keeps: asking for fifty when ten exist only
    // ever returned ten, and a limit that promises more than the inbox holds
    // invites a caller to page for rows that were pruned.
    const limit = Number.isFinite(requested)
      ? Math.min(NOTIFICATION_KEEP, Math.max(1, requested))
      : NOTIFICATION_KEEP;

    const filter = { userId };
    // `before` pages backwards by creation time. An unparseable value is
    // ignored rather than refused, so a bad cursor shows the first page.
    if (req.query.before !== undefined) {
      const before = new Date(String(req.query.before));
      if (!Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    }

    const [rows, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
      unreadNotificationCount(userId),
    ]);

    return res.json({ success: true, notifications: rows.map(publicNotification), unreadCount });
  } catch (error) {
    console.error('Notification list error:', error);
    return res.status(500).json({ success: false, message: 'Could not load notifications right now.' });
  }
});

// GET /api/notifications/unread-count — the badge, without the list.
app.get('/api/notifications/unread-count', lookupLimit, requireAuth, async (req, res) => {
  try {
    return res.json({ success: true, unreadCount: await unreadNotificationCount(req.authUser._id) });
  } catch (error) {
    console.error('Notification count error:', error);
    return res.status(500).json({ success: false, message: 'Could not load notifications right now.' });
  }
});

// PATCH /api/notifications/:id/read — idempotent. Only an unread row is
// stamped, so marking one read twice keeps the time it was first read.
app.patch('/api/notifications/:id/read', writeLimit, requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) return notificationNotFound(res);

    const userId = req.authUser._id;
    await Notification.updateOne({ _id: id, userId, readAt: null }, { $set: { readAt: new Date() } });

    const [row, unreadCount] = await Promise.all([
      Notification.findOne({ _id: id, userId }).lean(),
      unreadNotificationCount(userId),
    ]);
    if (!row) return notificationNotFound(res);

    return res.json({ success: true, notification: publicNotification(row), unreadCount });
  } catch (error) {
    console.error('Notification read error:', error);
    return res.status(500).json({ success: false, message: 'Could not update that notification right now.' });
  }
});

// POST /api/notifications/read-all
app.post('/api/notifications/read-all', writeLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const result = await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
    return res.json({
      success: true,
      updated: result.modifiedCount || 0,
      unreadCount: await unreadNotificationCount(userId),
    });
  } catch (error) {
    console.error('Notification read-all error:', error);
    return res.status(500).json({ success: false, message: 'Could not update notifications right now.' });
  }
});

// ─── Web Push ───────────────────────────────────────────────────────────────
//
// The device half of the notifications above: the same payment writes an inbox
// row and, for whichever legs it actually created, a banner on the phone.
//
// Every route here except the admin broadcast is scoped by req.authUser._id and
// by nothing the request names. In particular /api/push/subscribe $sets the
// userId from the token — a body that supplies one is ignored, because letting
// a caller name the owner of a subscription would let them point somebody
// else's payment notifications at their own browser.
//
// A foreign endpoint is answered as "nothing to remove" rather than 403, for
// the same reason a stranger's notification 404s: a 403 would confirm that the
// endpoint exists and belongs to someone.

const pushDisabled = (res) =>
  res.status(503).json({
    success: false,
    code: 'push_disabled',
    message: 'Push notifications are not configured on this server.',
  });

// A tap target has to be a path inside this app. An absolute URL — or the
// protocol-relative '//evil.example' that looks like a path and is not — would
// turn a notification into an open redirect away from Gloobal.
const safeNotificationPath = (value, fallback = '/') => {
  const path = typeof value === 'string' ? value.trim() : '';
  if (!path) return fallback;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (path.length > 500) return fallback;
  return path;
};

// GET /api/push/public-key — what the browser needs to call
// pushManager.subscribe(). The PRIVATE key never leaves pushService.
app.get('/api/push/public-key', lookupLimit, requireAuth, (req, res) => {
  const enabled = pushService.isPushEnabled();
  return res.json({ success: true, enabled, publicKey: enabled ? pushService.getVapidPublicKey() : null });
});

// POST /api/push/subscribe — upserted on the endpoint alone.
//
// On { endpoint }, not on { endpoint, userId }: an endpoint identifies one
// browser profile, and signing a second account in on the same phone must
// MOVE the subscription, not add a second row that would deliver both
// accounts' payments to the same lock screen. See models/PushSubscription.js.
app.post('/api/push/subscribe', writeLimit, requireAuth, async (req, res) => {
  try {
    if (!pushService.isPushEnabled()) return pushDisabled(res);

    const validated = pushService.validateSubscriptionInput(req.body);
    if (!validated.ok) {
      return res.status(400).json({
        success: false,
        code: 'push_subscription_invalid',
        message: validated.error,
      });
    }

    const { endpoint, keys } = validated.value;
    const userAgent = String(req.body?.userAgent || req.get('user-agent') || '').slice(0, 255);

    const update = {
      $set: {
        userId: req.authUser._id,
        'keys.p256dh': keys.p256dh,
        'keys.auth': keys.auth,
        userAgent,
        lastSeenAt: new Date(),
        // A browser that has just handed us a fresh subscription is reachable
        // again, whatever the old row's failure history said.
        failureCount: 0,
      },
    };

    // Only an explicit boolean changes the marketing choice. A client that
    // simply re-subscribes on every page load must not silently reset a
    // preference the person set in the UI, and a brand-new row is not opted in.
    if (typeof req.body?.promotional === 'boolean') {
      update.$set.promotionalOptIn = req.body.promotional;
    } else {
      update.$setOnInsert = { promotionalOptIn: false };
    }

    try {
      await PushSubscription.updateOne({ endpoint }, update, { upsert: true });
    } catch (error) {
      // Two subscribes racing on the same endpoint: the loser is told the row
      // already exists, which is exactly the row it wanted. Apply the same
      // update to it without upserting.
      if (error?.code !== 11000) throw error;
      await PushSubscription.updateOne({ endpoint }, { $set: update.$set });
    }

    const row = await PushSubscription.findOne({ endpoint }).select('_id promotionalOptIn').lean();

    return res.json({
      success: true,
      ok: true,
      subscriptionId: row ? String(row._id) : null,
      promotional: Boolean(row?.promotionalOptIn),
    });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ success: false, message: 'Could not save that subscription right now.' });
  }
});

// POST /api/push/unsubscribe — only ever your own row.
app.post('/api/push/unsubscribe', writeLimit, requireAuth, async (req, res) => {
  try {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    if (!endpoint || endpoint.length > 2000) {
      return res.status(400).json({
        success: false,
        code: 'push_subscription_invalid',
        message: 'endpoint is required.',
      });
    }

    const result = await PushSubscription.deleteOne({ endpoint, userId: req.authUser._id });
    return res.json({ success: true, ok: true, removed: result.deletedCount || 0 });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return res.status(500).json({ success: false, message: 'Could not remove that subscription right now.' });
  }
});

// PATCH /api/push/preferences — the marketing opt-in, across every browser this
// account has subscribed from. Turning it off on the phone turns it off on the
// laptop, because it is a choice about being marketed to, not about a device.
app.patch('/api/push/preferences', writeLimit, requireAuth, async (req, res) => {
  try {
    if (typeof req.body?.promotional !== 'boolean') {
      return res.status(400).json({
        success: false,
        code: 'push_preference_invalid',
        message: 'promotional must be true or false.',
      });
    }

    const promotional = req.body.promotional;
    const result = await PushSubscription.updateMany(
      { userId: req.authUser._id },
      { $set: { promotionalOptIn: promotional } }
    );

    return res.json({ success: true, ok: true, promotional, updated: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Push preferences error:', error);
    return res.status(500).json({ success: false, message: 'Could not update that preference right now.' });
  }
});

// GET /api/push/status — what the settings screen renders.
app.get('/api/push/status', lookupLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const [subscriptions, optedIn] = await Promise.all([
      PushSubscription.countDocuments({ userId }),
      PushSubscription.countDocuments({ userId, promotionalOptIn: true }),
    ]);

    return res.json({
      success: true,
      enabled: pushService.isPushEnabled(),
      subscriptions,
      promotional: optedIn > 0,
    });
  } catch (error) {
    console.error('Push status error:', error);
    return res.status(500).json({ success: false, message: 'Could not load push status right now.' });
  }
});

// POST /api/push/test — "did that actually work?", to the caller's own devices
// and no one else's.
app.post('/api/push/test', writeLimit, requireAuth, async (req, res) => {
  try {
    if (!pushService.isPushEnabled()) return pushDisabled(res);

    const timestamp = Date.now();
    const result = await pushService.sendPushToUser(
      req.authUser._id,
      {
        v: 1,
        category: 'transactional',
        type: 'system',
        notificationId: null,
        transactionId: null,
        title: 'Gloobal',
        body: 'Push notifications are working on this device.',
        // Every push carries the same keys, so a worker reading one never
        // has to ask which kind it is before reading a field. Only a
        // payment has a disc; this and a campaign send null and the worker
        // falls back to the app icon.
        icon: null,
        url: '/',
        tag: `gloobal-system-${timestamp}`,
        timestamp,
      },
      { category: 'transactional' }
    );

    return res.json({ success: true, ok: true, ...result });
  } catch (error) {
    console.error('Push test error:', error);
    return res.status(500).json({ success: false, message: 'Could not send a test push right now.' });
  }
});

// POST /api/push/promotional — the admin broadcast.
//
// NOT a user route, so no requireAuth: there is no signed-in account behind it.
// It is gated by a shared secret in x-push-admin-token instead, compared in
// constant time. With PUSH_ADMIN_TOKEN unset there is no admin channel at all
// and the route answers 404 — an unconfigured door should not advertise itself
// as a locked one.
const PROMOTIONAL_RECIPIENT_CAP = 500;

const adminTokenMatches = (supplied) => {
  const expected = String(process.env.PUSH_ADMIN_TOKEN || '');
  if (!expected) return false;
  const a = Buffer.from(String(supplied || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first — that leaks the length of the token and nothing else.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

app.post('/api/push/promotional', writeLimit, async (req, res) => {
  try {
    if (!String(process.env.PUSH_ADMIN_TOKEN || '')) {
      return res.status(404).json({ success: false, code: 'not_found', message: 'Not found.' });
    }
    if (!adminTokenMatches(req.get('x-push-admin-token'))) {
      return res.status(403).json({ success: false, code: 'forbidden', message: 'Not allowed.' });
    }
    if (!pushService.isPushEnabled()) return pushDisabled(res);

    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        code: 'push_promotional_invalid',
        message: 'title and body are required.',
      });
    }
    const url = safeNotificationPath(req.body?.url, '/');

    // Recipients may be named either way; both are resolved to account ids
    // here and capped, so one call can never fan out across the whole database.
    const symbolIds = Array.isArray(req.body?.symbolIds) ? req.body.symbolIds : [];
    const rawUserIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];

    const ids = new Set();
    for (const value of rawUserIds) {
      const id = String(value || '').trim();
      if (mongoose.Types.ObjectId.isValid(id)) ids.add(id);
    }
    for (const value of symbolIds.slice(0, PROMOTIONAL_RECIPIENT_CAP)) {
      const raw = String(value || '').trim();
      if (!raw) continue;
      const decoded = safeDecodeSymbolId(raw).trim() || raw;
      const owner = await User.findOne({ symbolId: decoded }).select('_id').lean();
      if (owner) ids.add(String(owner._id));
    }

    const recipients = [...ids].slice(0, PROMOTIONAL_RECIPIENT_CAP);
    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'push_promotional_invalid',
        message: 'No recipients resolved from symbolIds or userIds.',
      });
    }

    const totals = { sent: 0, removed: 0, failed: 0, skipped: 0 };
    let notified = 0;
    const timestamp = Date.now();

    for (const userId of recipients) {
      // The inbox row first, so the banner's notificationId names something
      // that already exists when the device taps through. No
      // metadata.transactionId, so these sit outside the payment unique index
      // entirely and a second campaign is not refused as a duplicate.
      let notification = null;
      try {
        notification = await Notification.create({
          userId,
          type: 'offer',
          title: title.slice(0, 100),
          message: body.slice(0, 500),
          metadata: { url, campaign: 'promotional' },
        });
        notified += 1;
        await pruneNotifications(userId);
      } catch (error) {
        console.error('Promotional notification write failed:', error.message);
      }

      const notificationId = notification ? String(notification._id) : null;
      const result = await pushService.sendPushToUser(
        userId,
        {
          v: 1,
          category: 'promotional',
          type: 'promo',
          notificationId,
          transactionId: null,
          title: title.slice(0, 100),
          body: body.slice(0, 500),
          icon: null,
          url,
          tag: `gloobal-promo-${notificationId}`,
          timestamp,
        },
        { category: 'promotional' }
      );
      totals.sent += result.sent;
      totals.removed += result.removed;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
    }

    return res.json({ success: true, ok: true, recipients: recipients.length, notified, ...totals });
  } catch (error) {
    console.error('Push promotional error:', error);
    return res.status(500).json({ success: false, message: 'Could not send that broadcast right now.' });
  }
});

// ─── My Choices ─────────────────────────────────────────────────────────────
//
// Per account, scoped by the bearer token like notifications, so none of
// these takes a Gloobal ID.
//
// Nothing in this section is on the money path. A category is a label; a tag
// is one account's label on one payment. POST /api/transactions/send is not
// touched by any of it, and the client writes a tag AFTER a payment has
// committed — a failed tag leaves a correct, untagged payment, which is the
// only acceptable way for a label to fail.
//
// Every figure these routes return is aggregated at read time. There is no
// stored total anywhere in this feature, and there must not be one: see the
// header of models/Category.js.

const categoryNotFound = (res) =>
  res.status(404).json({ success: false, message: 'That choice is not one of yours.' });

// Live categories for an account, seeding the starting set on the first read.
//
// Seeded here rather than at registration so that accounts which existed
// before this feature get them too, with no backfill script and no migration.
// `ordered: false` plus a swallowed error is the race handling: two requests
// arriving together both find nothing, both insert, and the loser's duplicate
// rows are rejected individually while the rest land. The re-read below is
// then the single source of truth for what either caller is told.
const categoriesForAccount = async (userId) => {
  const sort = { side: 1, kind: 1, sortIndex: 1, name: 1 };
  const existing = await Category.find({ userId }).sort(sort).lean();

  // ── TWO DIFFERENT JOBS, WHICH IS WHY THIS IS NOT ONE BRANCH ───────
  //
  // The suggestions are seeded ONCE, on an account that has nothing:
  // re-adding them later would push 'Baby' and 'Beauty' back into the
  // grid of somebody who deliberately deleted them.
  //
  // The Essentials row is different — every account has one, by
  // definition — so it is ensured on EVERY read. Without that, the only
  // accounts that would ever get it are ones registering after this
  // deploy, and every account that exists today would be missing the one
  // category the product says everybody has. This is the backfill, and it
  // costs one upsert per categories read.
  const needsSuggestions = existing.length === 0;

  try {
    await Category.updateOne(
      { userId, systemKey: ESSENTIALS_SYSTEM_KEY },
      { $setOnInsert: Object.assign({}, ESSENTIALS_DEFAULT_CATEGORY, { userId }) },
      { upsert: true }
    );
  } catch (error) {
    // A duplicate key here is two requests racing, and the loser has
    // nothing to do: the winner wrote exactly the row it was going to.
    if (error && error.code !== 11000) console.error('Essentials category error:', error.message);
  }

  if (!needsSuggestions) {
    return Category.find({ userId }).sort(sort).lean();
  }

  try {
    await Category.insertMany(
      DEFAULT_CATEGORIES.map((entry) => Object.assign({}, entry, { userId })),
      { ordered: false }
    );
  } catch (error) {
    console.error('Category seed error:', error.message);
  }

  return Category.find({ userId }).sort(sort).lean();
};

// What an account has actually spent or received under each category.
//
// Grouped by CURRENCY as well as category, and that is not defensive
// padding. Transaction.amount is the RECEIVING side's own money — the
// contract every row in this system follows — so for a payment this account
// made, the figure that answers "what did this cost me" is
// metadata.sourceAmount in metadata.sourceCurrency, and only for a domestic
// payment are those the same number. Summing `amount` across a cross-border
// payment would quietly total the payee's money. Grouping by currency means
// two currencies can never be added together even if an account somehow
// holds both; the client reads the bucket matching its own.
const categoryTotals = async (userId, monthStart) => {
  // Mixed metadata is not schema-checked, so a figure read out of it is
  // whatever was written. Converted with onError/onNull so one malformed row
  // cannot turn a whole account's totals into null.
  const asMoney = (expr) => ({ $convert: { input: expr, to: 'double', onError: 0, onNull: 0 } });
  const paid = { $eq: ['$txn.fromUserId', userId] };

  const rows = await TransactionTag.aggregate([
    { $match: { userId } },
    {
      $lookup: {
        from: 'transactions',
        localField: 'transactionId',
        foreignField: '_id',
        as: 'txn',
      },
    },
    { $unwind: '$txn' },
    { $match: { 'txn.status': 'success' } },
    {
      $project: {
        categoryId: 1,
        at: '$txn.createdAt',
        amount: {
          $cond: [paid, asMoney({ $ifNull: ['$txn.metadata.sourceAmount', '$txn.amount'] }), asMoney('$txn.amount')],
        },
        currency: {
          $cond: [paid, { $ifNull: ['$txn.metadata.sourceCurrency', '$txn.currency'] }, '$txn.currency'],
        },
      },
    },
    {
      $group: {
        _id: { categoryId: '$categoryId', currency: { $toUpper: { $ifNull: ['$currency', ''] } } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        firstAt: { $min: '$at' },
        lastAt: { $max: '$at' },
        thisMonth: { $sum: { $cond: [{ $gte: ['$at', monthStart] }, '$amount', 0] } },
      },
    },
  ]);

  const byCategory = new Map();
  for (const row of rows) {
    const key = String(row._id.categoryId);
    const bucket = byCategory.get(key) || [];
    bucket.push({
      currency: row._id.currency || '',
      total: Number(row.total) || 0,
      count: Number(row.count) || 0,
      thisMonth: Number(row.thisMonth) || 0,
      firstAt: row.firstAt,
      lastAt: row.lastAt,
    });
    byCategory.set(key, bucket);
  }
  return byCategory;
};

// The start of the month the PERSON is in, which is not reliably the start
// of the month the server is in. A client that knows its own boundary sends
// it; anything unparseable, in the future, or absurdly old falls back to UTC
// rather than being refused, because a bad clock should not make the screen
// unreadable.
const categoryMonthStart = (raw) => {
  const now = new Date();
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (raw === undefined || raw === null || raw === '') return utcStart;

  const asked = new Date(String(raw));
  if (Number.isNaN(asked.getTime())) return utcStart;
  if (asked.getTime() > now.getTime() + 36 * 60 * 60 * 1000) return utcStart;
  if (now.getTime() - asked.getTime() > 400 * 24 * 60 * 60 * 1000) return utcStart;
  return asked;
};

// GET /api/categories?monthStart=<ISO> — every choice this account has,
// each with its own totals. One call, because the grid cannot draw a tile
// without both halves and two calls would let them disagree.
app.get('/api/categories', lookupLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const monthStart = categoryMonthStart(req.query.monthStart);
    const [rows, totals, photos] = await Promise.all([
      categoriesForAccount(userId),
      categoryTotals(userId, monthStart),
      // One query for every photo this account has, not one per tile. The
      // client downscales before uploading and the route caps what it
      // stores, which is what makes sending them inline cheaper than a
      // request per category — see models/CategoryPhoto.js.
      CategoryPhoto.find({ userId }).select('categoryId dataUrl').lean(),
    ]);

    const photoFor = new Map(photos.map((row) => [String(row.categoryId), row.dataUrl]));

    return res.json({
      success: true,
      monthStart: monthStart.toISOString(),
      categories: rows.map((row) =>
        Object.assign({}, publicCategory(row), {
          totals: totals.get(String(row._id)) || [],
          photo: photoFor.get(String(row._id)) || null,
        })
      ),
    });
  } catch (error) {
    console.error('Category list error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your choices right now.' });
  }
});

// GET /api/categories/tags?limit=500 — which payments this account has
// filed, keyed by the payment reference the app already holds.
//
// Deliberately NOT a per-category transaction list. The app's history
// projection is per viewer and already correct; a second one here would be
// a second place that decides what a row says, and the two would drift. So
// this returns the labels only, and the client badges rows it already has.
app.get('/api/categories/tags', lookupLimit, requireAuth, async (req, res) => {
  try {
    const requested = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(requested) ? Math.min(2000, Math.max(1, requested)) : 500;

    const rows = await TransactionTag.find({ userId: req.authUser._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select('referenceId categoryId categoryName')
      .lean();

    return res.json({
      success: true,
      tags: rows.map((row) => ({
        referenceId: row.referenceId,
        categoryId: String(row.categoryId),
        categoryName: row.categoryName || '',
      })),
    });
  } catch (error) {
    console.error('Category tag list error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your tags right now.' });
  }
});

// POST /api/categories — create.
//
// The owner is taken from the TOKEN, never from the body, for the same
// reason POST /api/projects does it: a symbolId in the payload would be a
// field a client could point at somebody else's account.
app.post('/api/categories', writeLimit, requireAuth, async (req, res) => {
  try {
    const validated = validateCategoryInput(req.body || {});
    if (!validated.ok) return res.status(400).json({ success: false, message: validated.message });

    const userId = req.authUser._id;
    const kind = validated.value.kind || 'expense';
    // Per BOOK, not per account. "Vegetables" on the creator side is the
    // stall's stock and "Vegetables" on the personal side is dinner;
    // refusing the second because the first exists would be refusing a
    // distinction this field was added to make.
    const side = validated.value.side || 'personal';
    const clash = await Category.findOne({
      userId,
      kind,
      side,
      archivedAt: null,
      name: new RegExp(`^${escapeRegExp(validated.value.name)}$`, 'i'),
    })
      .select('_id')
      .lean();
    if (clash) {
      return res.status(400).json({ success: false, message: `You already have a choice called ${validated.value.name}.` });
    }

    const category = await Category.create(Object.assign({}, validated.value, { userId, kind, side }));
    return res.status(201).json({
      success: true,
      category: Object.assign({}, publicCategory(category.toObject()), { totals: [], photo: null }),
    });
  } catch (error) {
    console.error('Category create error:', error);
    return res.status(500).json({ success: false, message: 'Could not save that choice.' });
  }
});

// PATCH /api/categories/:id — rename, re-icon, recolour, or set a budget.
// Any subset; a body naming only monthlyBudget is a budget edit.
app.patch('/api/categories/:id', writeLimit, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryNotFound(res);

    const userId = req.authUser._id;
    const existing = await Category.findOne({ _id: id, userId });
    if (!existing) return categoryNotFound(res);

    const validated = validateCategoryInput(req.body || {}, { strict: false });
    if (!validated.ok) return res.status(400).json({ success: false, message: validated.message });

    // Kind is not editable. Moving a category between expense and income
    // would leave every payment already filed under it on the wrong side of
    // the split, and there is no honest way to reinterpret those rows.
    delete validated.value.kind;
    // Nor is the book, and for the same reason doubled: moving a category
    // from personal to creator would move every payment ever filed under
    // it, silently, into a total somebody keeps for a different purpose.
    // Make a second category and retire the first.
    delete validated.value.side;

    if (validated.value.name && validated.value.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await Category.findOne({
        userId,
        kind: existing.kind,
        side: existing.side || 'personal',
        archivedAt: null,
        _id: { $ne: existing._id },
        name: new RegExp(`^${escapeRegExp(validated.value.name)}$`, 'i'),
      })
        .select('_id')
        .lean();
      if (clash) {
        return res.status(400).json({ success: false, message: `You already have a choice called ${validated.value.name}.` });
      }
    }

    Object.assign(existing, validated.value);
    await existing.save();

    const [totals, photo] = await Promise.all([
      categoryTotals(userId, categoryMonthStart(req.query.monthStart)),
      // Returned with the row because the client REPLACES its copy with
      // whatever comes back. Leaving it out would make a picture vanish
      // from the grid the moment somebody renamed the category.
      CategoryPhoto.findOne({ categoryId: existing._id, userId }).select('dataUrl').lean(),
    ]);
    return res.json({
      success: true,
      category: Object.assign({}, publicCategory(existing.toObject()), {
        totals: totals.get(String(existing._id)) || [],
        photo: photo ? photo.dataUrl : null,
      }),
    });
  } catch (error) {
    console.error('Category update error:', error);
    return res.status(500).json({ success: false, message: 'Could not change that choice.' });
  }
});

// DELETE /api/categories/:id — retire it.
//
// A category that has never been used is removed outright. One that has is
// ARCHIVED, because its name is the only thing that makes the payments filed
// under it readable, and deleting the row to leave those payments pointing at
// nothing would be destroying a record to tidy a list. Archived categories
// leave the grid and the pickers; the payments keep their label.
app.delete('/api/categories/:id', writeLimit, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryNotFound(res);

    const userId = req.authUser._id;
    const existing = await Category.findOne({ _id: id, userId });
    if (!existing) return categoryNotFound(res);

    // ── THE ONE CATEGORY THAT DOES NOT GO ────────────────────────────
    //
    // My Essentials is not a suggestion, it is part of what an account
    // IS: every account has one and the app looks it up by key. Deleting
    // it would leave the Essentials baseline with nowhere to hang.
    //
    // Refused here as well as hidden in the client, because a control the
    // client happens not to draw is not a rule — the route is the rule,
    // and anything else is a rule that holds until somebody writes their
    // own request. Renaming, re-iconing and recolouring all still work;
    // this blocks removal only, which is why the message says so.
    if (existing.systemKey) {
      return res.status(409).json({
        success: false,
        message: 'This one stays — but you can rename it, or change how it looks.',
      });
    }

    const used = await TransactionTag.countDocuments({ userId, categoryId: existing._id });
    if (used > 0) {
      existing.archivedAt = new Date();
      await existing.save();
      return res.json({ success: true, archived: true, tagged: used, category: publicCategory(existing.toObject()) });
    }

    await Category.deleteOne({ _id: existing._id, userId });
    // The picture goes with it. An archived category keeps its own,
    // because it is still shown on the payments filed under it; a deleted
    // one has nothing left to illustrate.
    await CategoryPhoto.deleteOne({ categoryId: existing._id, userId });
    return res.json({ success: true, archived: false, tagged: 0 });
  } catch (error) {
    console.error('Category delete error:', error);
    return res.status(500).json({ success: false, message: 'Could not remove that choice.' });
  }
});

// A category tile is 54 pixels. This cap is a fraction of the profile
// photo's because nothing here is ever shown larger, and because a grid
// returns a screenful of them at once — see models/CategoryPhoto.js. The
// client downscales before it uploads; this is the backstop, not the
// mechanism.
const CATEGORY_PHOTO_MAX_BYTES = 60000;

// PUT /api/categories/:id/photo — use a picture instead of an icon.
//
// Validated by validateProfilePhoto, deliberately: JPEG or PNG only, the
// declared type checked against the decoded file's own magic bytes, SVG
// refused because it can carry script. Reusing that function rather than
// writing a second one means these two uploads cannot drift apart in what
// they accept, which for the one that decides whether a file is safe is
// the only arrangement worth having.
app.put('/api/categories/:id/photo', writeLimit, requireAuth, parseProfilePhotoBody, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryNotFound(res);

    const userId = req.authUser._id;
    const category = await Category.findOne({ _id: id, userId }).select('_id').lean();
    if (!category) return categoryNotFound(res);

    const checked = validateProfilePhoto(req.body && req.body.photo);
    if (!checked.ok) {
      return res.status(checked.status).json({ success: false, code: checked.code, message: checked.message });
    }
    if (checked.bytes > CATEGORY_PHOTO_MAX_BYTES) {
      return res.status(413).json({
        success: false,
        code: 'photo_too_large',
        message: 'That picture is too large for a category icon.',
      });
    }

    await CategoryPhoto.findOneAndUpdate(
      { categoryId: category._id },
      { $set: { userId, categoryId: category._id, dataUrl: checked.dataUrl, mimeType: checked.mimeType, bytes: checked.bytes } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, photo: checked.dataUrl });
  } catch (error) {
    console.error('Category photo error:', error);
    return res.status(500).json({ success: false, message: 'Could not save that picture.' });
  }
});

// DELETE /api/categories/:id/photo — go back to an icon. The category
// keeps whatever icon it had underneath, so removing a picture restores
// rather than blanks it.
app.delete('/api/categories/:id/photo', writeLimit, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryNotFound(res);

    const result = await CategoryPhoto.deleteOne({ categoryId: id, userId: req.authUser._id });
    return res.json({ success: true, removed: result.deletedCount > 0 });
  } catch (error) {
    console.error('Category photo remove error:', error);
    return res.status(500).json({ success: false, message: 'Could not remove that picture.' });
  }
});

// ── CONNECTED CATEGORIES ────────────────────────────────────────────────
//
// A merchant pays Ramu his wages and files it under "Staff salary". Ramu
// needs the same payment on his own books, as income, under a name he
// chose. Both of those records already exist in this system — TransactionTag
// is per viewer precisely so two parties can label one payment differently
// — but until now the second one had to be typed by hand, and the person
// who forgets is always the one being paid.
//
// A link is the standing agreement that writes it for him. See
// models/CategoryLink.js for what a link is and, more importantly, what it
// is not: no money, no shared sight of anybody's totals, and nothing that
// unfiles a payment already filed.

const categoryLinkNotFound = (res) =>
  res.status(404).json({ success: false, message: 'That connection is not one of yours.' });

// What a link looks like from one side or the other.
//
// `role` rather than two shapes, because every screen that shows these
// shows both: the categories you have invited people onto and the ones you
// have been invited onto are one list to the person reading it, and a
// client that has to merge two differently-shaped arrays will eventually
// merge them wrong.
const publicCategoryLink = (row, viewerId, names) => {
  const mine = String(row.ownerId) === String(viewerId);
  return {
    id: String(row._id),
    role: mine ? 'owner' : 'member',
    status: row.status,
    // The category on the READER's side of the link, whichever side that
    // is. Never the other person's: a member has no business knowing which
    // of the owner's categories they sit under, and the owner's own screen
    // already knows, because it asked about that category.
    categoryId: mine ? String(row.ownerCategoryId) : (row.memberCategoryId ? String(row.memberCategoryId) : null),
    // Who is on the other end, by Gloobal ID and name only. No figures, no
    // category, nothing about what else they do.
    withSymbolId: mine ? (row.invitedSymbolId || '') : (names.ownerSymbolId || ''),
    withName: mine ? (names.memberName || '') : (names.ownerName || ''),
    // What the owner calls their side. Sent to the MEMBER only, and only
    // while the invitation is pending, so somebody deciding whether to
    // accept can see what they are being asked to join. Once accepted
    // their own name is the only one that matters to them.
    invitedTo: !mine && row.status === 'pending' ? (names.ownerCategoryName || '') : '',
    invitedAt: row.createdAt,
    respondedAt: row.respondedAt,
    endedAt: row.endedAt,
    endedBy: row.endedBy || null,
  };
};

// Fills in the names publicCategoryLink needs, for a page of links at once.
// One query per collection rather than one per row: a merchant with twenty
// people on payroll would otherwise make sixty round trips to draw a list.
const decorateCategoryLinks = async (rows, viewerId) => {
  if (!rows.length) return [];
  const userIds = new Set();
  const categoryIds = new Set();
  for (const row of rows) {
    userIds.add(String(row.ownerId));
    userIds.add(String(row.memberId));
    categoryIds.add(String(row.ownerCategoryId));
  }
  const [users, categories] = await Promise.all([
    User.find({ _id: { $in: [...userIds] } }).select('_id symbolId fullName').lean(),
    Category.find({ _id: { $in: [...categoryIds] } }).select('_id name').lean(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));
  return rows.map((row) => {
    const owner = userById.get(String(row.ownerId));
    const member = userById.get(String(row.memberId));
    const ownerCategory = categoryById.get(String(row.ownerCategoryId));
    return publicCategoryLink(row, viewerId, {
      ownerSymbolId: owner ? owner.symbolId : '',
      ownerName: owner ? owner.fullName : '',
      memberName: member ? member.fullName : '',
      ownerCategoryName: ownerCategory ? ownerCategory.name : '',
    });
  });
};

// POST /api/categories/:id/links — invite a Gloobal ID onto one of my
// categories.
//
// Nothing is created on their side here. The invitation is a row with
// memberCategoryId still null, and their category comes into existence when
// they accept it and name it — putting an unasked-for row on somebody's
// grid is exactly the kind of thing a handshake exists to prevent.
app.post('/api/categories/:id/links', writeLimit, requireAuth, async (req, res) => {
  try {
    const ownerId = req.authUser._id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryNotFound(res);

    const category = await Category.findOne({ _id: id, userId: ownerId }).lean();
    if (!category) return categoryNotFound(res);
    if (category.archivedAt) {
      return res.status(400).json({ success: false, message: 'That choice has been retired.' });
    }

    const symbolId = String(req.body?.symbolId || '').trim();
    if (!symbolId) return res.status(400).json({ success: false, message: 'Whose Gloobal ID?' });

    const member = await User.findOne({ symbolId }).select('_id symbolId').lean();
    if (!member) {
      return res.status(404).json({ success: false, message: 'No account with that Gloobal ID.' });
    }
    if (String(member._id) === String(ownerId)) {
      return res.status(400).json({ success: false, message: 'You cannot connect a choice to yourself.' });
    }

    const existing = await CategoryLink.findOne({ ownerCategoryId: category._id, memberId: member._id }).lean();
    if (existing) {
      // Three different "already" cases, and they are not the same answer.
      // Re-inviting somebody who said no is the one worth refusing outright:
      // a declined invitation that can be sent again is a way to pester
      // somebody through an app they trust.
      if (existing.status === 'pending') {
        return res.status(409).json({ success: false, message: 'They have already been asked.' });
      }
      if (existing.status === 'active') {
        return res.status(409).json({ success: false, message: 'They are already connected to this choice.' });
      }
      if (existing.status === 'declined') {
        return res.status(409).json({ success: false, message: 'They turned this down.' });
      }
      // 'ended' is the one case that may be re-opened: an arrangement that
      // existed and stopped can start again, and reusing the row keeps the
      // unique index honest.
      await CategoryLink.updateOne(
        { _id: existing._id },
        { $set: { status: 'pending', memberCategoryId: null, respondedAt: null, endedAt: null, endedBy: null, invitedSymbolId: symbolId } }
      );
    } else {
      await CategoryLink.create({
        ownerId,
        ownerCategoryId: category._id,
        memberId: member._id,
        invitedSymbolId: symbolId,
        status: 'pending',
      });
    }

    const link = await CategoryLink.findOne({ ownerCategoryId: category._id, memberId: member._id }).lean();

    // The invitation has to be SEEN, and a row on a screen nobody opens is
    // not seen. Best-effort and outside any transaction, like every other
    // notification here: a failure to notify must not undo an invitation
    // that was made.
    try {
      await Notification.create({
        userId: member._id,
        type: 'link',
        title: 'A choice wants to connect',
        message: `${req.authUser.fullName || 'Someone'} would like payments for "${category.name}" to file themselves under a choice of yours.`,
        metadata: { linkId: String(link._id), categoryName: category.name },
      });
      await pruneNotifications(member._id);
    } catch (error) {
      console.error('Category link notification failed:', error.message);
    }

    const [decorated] = await decorateCategoryLinks([link], ownerId);
    return res.status(201).json({ success: true, link: decorated });
  } catch (error) {
    console.error('Category link invite error:', error);
    return res.status(500).json({ success: false, message: 'Could not send that invitation.' });
  }
});

// ─── Complaints: a wrong payment, between the two people it concerns ────
//
// The receipt's old Report button opened a case on the payer's phone only;
// the person who was paid never heard about it. These routes are the case
// both of them can see, with a chat on it, and a way out: the receiver
// sends the money back (an ordinary payment carrying the case's id — see
// closeComplaintByReturn), the reporter marks it solved, or after 48 hours
// without a fix the reporter hands it to GLOOBAL support.
//
// No route here moves money. Every route requires a token and answers only
// to the case's two parties.

const COMPLAINT_ESCALATE_AFTER_MS = 48 * 60 * 60 * 1000;
// How long after a payment it can still be complained about.
const COMPLAINT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const COMPLAINT_REASON_LABELS = {
  wrong_person: 'Sent to the wrong person',
  wrong_amount: 'Wrong amount',
  paid_twice: 'Paid twice',
  not_received: "Didn't get the item or service",
  not_me: "I didn't make this payment",
  other: 'Something else',
};
const COMPLAINT_OPEN_STATUSES = ['open', 'replied', 'escalated'];

function complaintRefCandidate() {
  return `GC-${crypto.randomInt(1000, 1000000)}`;
}

// What one side of the case is shown. Never the other person's balance,
// mobile number or anything beyond the name the payment already carried.
function publicComplaint(doc, viewerId, txn, people) {
  const viewer = String(viewerId);
  const isReporter = String(doc.reporterId) === viewer;
  const parties = (txn && txn.metadata && txn.metadata.parties) || {};
  const reporter = people.get(String(doc.reporterId)) || null;
  const receiver = people.get(String(doc.receiverId)) || null;
  const receiverName = (parties.receiver && parties.receiver.creatorHandle)
    || notificationDisplayName(parties.receiver, receiver);
  const reporterName = notificationDisplayName(parties.sender, reporter);
  // Each side sees the payment in their OWN currency: the payer what left
  // their balance, the payee what arrived in theirs.
  const meta = (txn && txn.metadata) || {};
  const amount = isReporter ? Number(meta.debitAmount ?? txn?.amount) : Number(txn?.amount);
  const currency = isReporter ? (meta.sourceCurrency || txn?.currency) : txn?.currency;
  const readAt = isReporter ? doc.reporterReadAt : doc.receiverReadAt;
  const messages = (doc.messages || []).map((m) => ({
    id: String(m._id),
    from: m.from ? (String(m.from) === viewer ? 'me' : 'them') : 'system',
    text: m.text,
    at: m.at ? new Date(m.at).toISOString() : null,
  }));
  const lastOther = [...(doc.messages || [])].reverse().find((m) => !m.from || String(m.from) !== viewer);
  return {
    id: String(doc._id),
    ref: doc.ref,
    txnId: doc.referenceId,
    myRole: isReporter ? 'reporter' : 'receiver',
    otherName: isReporter ? receiverName : reporterName,
    otherSymbolId: isReporter ? (receiver && receiver.symbolId) || '' : (reporter && reporter.symbolId) || '',
    otherCountryIso: isReporter
      ? (parties.receiver && parties.receiver.countryIso) || (receiver ? accountCountryIso(receiver) : null)
      : (parties.sender && parties.sender.countryIso) || (reporter ? accountCountryIso(reporter) : null),
    amount: Number.isFinite(amount) ? amount : 0,
    currency: currency || '',
    // What sending it back costs the receiver to put right: the payer's own
    // figure, in the payer's currency, which is the destination side of the
    // return payment.
    returnAmount: Number(meta.debitAmount ?? txn?.amount) || 0,
    returnCurrency: meta.sourceCurrency || txn?.currency || '',
    paidAt: txn && txn.createdAt ? new Date(txn.createdAt).toISOString() : null,
    reason: doc.reason,
    note: doc.note || '',
    status: doc.status,
    openedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    escalatedAt: doc.escalatedAt ? new Date(doc.escalatedAt).toISOString() : null,
    closedAt: doc.closedAt ? new Date(doc.closedAt).toISOString() : null,
    canEscalateAt: doc.createdAt ? new Date(new Date(doc.createdAt).getTime() + COMPLAINT_ESCALATE_AFTER_MS).toISOString() : null,
    unread: Boolean(lastOther && (!readAt || new Date(lastOther.at) > new Date(readAt))),
    messages,
  };
}

async function decorateComplaints(docs, viewerId) {
  const txnIds = [...new Set(docs.map((d) => String(d.transactionId)))];
  const userIds = [...new Set(docs.flatMap((d) => [String(d.reporterId), String(d.receiverId)]))];
  const [txns, users] = await Promise.all([
    Transaction.find({ _id: { $in: txnIds } }).select('amount currency metadata createdAt referenceId').lean(),
    User.find({ _id: { $in: userIds } }).select('fullName symbolId mobileNumber countryIso dialCode').lean(),
  ]);
  const txnById = new Map(txns.map((t) => [String(t._id), t]));
  const people = new Map(users.map((u) => [String(u._id), u]));
  return docs.map((d) => publicComplaint(d, viewerId, txnById.get(String(d.transactionId)), people));
}

// Tell the other side, in the inbox and on their phone. Best-effort: a
// failed notification must never fail the action it is about.
async function notifyComplaintParty(userId, { title, message, complaint }) {
  try {
    const row = await Notification.create({
      userId,
      type: 'system',
      title: title.slice(0, 100),
      message: message.slice(0, 500),
      metadata: { complaintId: String(complaint._id), complaintRef: complaint.ref },
    });
    await pruneNotifications(userId);
    if (pushService.isPushEnabled()) {
      await pushService.sendPushToUser(
        userId,
        {
          v: 1,
          category: 'transactional',
          type: 'complaint',
          complaintId: String(complaint._id),
          notificationId: String(row._id),
          title: title.slice(0, 100),
          body: message.slice(0, 200),
          url: `/?complaint=${encodeURIComponent(String(complaint._id))}`,
          tag: `gloobal-complaint-${String(complaint._id)}`,
          timestamp: Date.now(),
        },
        { category: 'transactional' }
      );
    }
  } catch (error) {
    console.error('Complaint notification failed (non-fatal):', error.message);
  }
}

function capComplaintMessages(doc) {
  const cap = Complaint.COMPLAINT_MESSAGE_CAP;
  if (doc.messages.length > cap) doc.messages.splice(0, doc.messages.length - cap);
}

async function loadComplaintFor(req, res) {
  const id = String(req.params.id || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Complaint not found.' });
    return null;
  }
  const doc = await Complaint.findById(id);
  const me = String(req.authUser._id);
  if (!doc || (String(doc.reporterId) !== me && String(doc.receiverId) !== me)) {
    res.status(404).json({ success: false, message: 'Complaint not found.' });
    return null;
  }
  return doc;
}

// POST /api/complaints — the payer raises a case about one of their payments.
app.post('/api/complaints', writeLimit, requireAuth, async (req, res) => {
  try {
    const referenceId = String(req.body?.txnId || '').trim();
    const reason = String(req.body?.reason || '');
    const note = String(req.body?.note || '').trim().slice(0, 280);
    if (!referenceId) return res.status(400).json({ success: false, message: 'Which payment is this about?' });
    if (!Complaint.COMPLAINT_REASONS.includes(reason)) return res.status(400).json({ success: false, message: 'Pick a reason.' });
    if (reason === 'other' && note.length < 3) return res.status(400).json({ success: false, message: 'Tell them what went wrong.' });

    const txn = await Transaction.findOne({ referenceId }).lean();
    // Only the PAYER of a real, completed payment between two people.
    if (!txn || String(txn.fromUserId) !== String(req.authUser._id) || !txn.toUserId) {
      return res.status(404).json({ success: false, message: 'That payment was not found on your account.' });
    }
    if (txn.status !== 'success' || !['send', 'qr_payment'].includes(txn.type)) {
      return res.status(400).json({ success: false, message: 'Only completed payments can be complained about.' });
    }
    if (Date.now() - new Date(txn.createdAt).getTime() > COMPLAINT_WINDOW_MS) {
      return res.status(400).json({ success: false, message: 'Complaints can be raised up to 30 days after a payment.' });
    }

    const existing = await Complaint.findOne({ transactionId: txn._id });
    if (existing) {
      const [shown] = await decorateComplaints([existing.toObject()], req.authUser._id);
      return res.status(200).json({ success: true, existing: true, complaint: shown });
    }

    let doc = null;
    for (let attempt = 0; attempt < 5 && !doc; attempt += 1) {
      try {
        doc = await Complaint.create({
          ref: complaintRefCandidate(),
          transactionId: txn._id,
          referenceId: txn.referenceId,
          reporterId: req.authUser._id,
          receiverId: txn.toUserId,
          reason,
          note,
          reporterReadAt: new Date(),
          messages: [{ from: null, text: `Complaint raised · ${COMPLAINT_REASON_LABELS[reason]}` }]
            .concat(note ? [{ from: req.authUser._id, text: note }] : []),
        });
      } catch (error) {
        // A ref collision retries with a new one; a second complaint about
        // the same payment racing this one answers with that one.
        if (error && error.code === 11000 && /transactionId/.test(String(error.message))) {
          const raced = await Complaint.findOne({ transactionId: txn._id });
          const [shown] = await decorateComplaints([raced.toObject()], req.authUser._id);
          return res.status(200).json({ success: true, existing: true, complaint: shown });
        }
        if (!(error && error.code === 11000)) throw error;
      }
    }
    if (!doc) return res.status(503).json({ success: false, message: 'Could not raise the complaint just now. Try again.' });

    recordAudit({
      userId: req.authUser._id, action: 'complaint.raise', status: 'success',
      message: `Complaint ${doc.ref} on ${txn.referenceId}`, req,
      metadata: { complaintId: doc._id, transactionId: txn._id, reason },
    });

    const payerName = notificationDisplayName(txn.metadata?.parties?.sender, req.authUser);
    await notifyComplaintParty(txn.toUserId, {
      title: 'A payment to you was reported',
      message: `${payerName} says their payment was a mistake: ${COMPLAINT_REASON_LABELS[reason]}. Open the case to reply.`,
      complaint: doc,
    });

    const [shown] = await decorateComplaints([doc.toObject()], req.authUser._id);
    return res.status(201).json({ success: true, complaint: shown });
  } catch (error) {
    console.error('Complaint raise error:', error);
    return res.status(500).json({ success: false, message: 'Could not raise the complaint just now. Try again.' });
  }
});

// GET /api/complaints — every case I am either side of.
app.get('/api/complaints', lookupLimit, requireAuth, async (req, res) => {
  try {
    const me = req.authUser._id;
    const docs = await Complaint.find({ $or: [{ reporterId: me }, { receiverId: me }] })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, complaints: await decorateComplaints(docs, me) });
  } catch (error) {
    console.error('Complaints read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your complaints.' });
  }
});

// GET /api/complaints/:id — one case. Opening it marks it read for me.
app.get('/api/complaints/:id', lookupLimit, requireAuth, async (req, res) => {
  try {
    const doc = await loadComplaintFor(req, res);
    if (!doc) return undefined;
    const isReporter = String(doc.reporterId) === String(req.authUser._id);
    await Complaint.updateOne({ _id: doc._id }, { $set: { [isReporter ? 'reporterReadAt' : 'receiverReadAt']: new Date() } }, { timestamps: false });
    doc[isReporter ? 'reporterReadAt' : 'receiverReadAt'] = new Date();
    const [shown] = await decorateComplaints([doc.toObject()], req.authUser._id);
    return res.json({ success: true, complaint: shown });
  } catch (error) {
    console.error('Complaint read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load that complaint.' });
  }
});

// POST /api/complaints/:id/messages — say something in the case's chat.
app.post('/api/complaints/:id/messages', writeLimit, requireAuth, async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ success: false, message: 'Type a message first.' });
    const doc = await loadComplaintFor(req, res);
    if (!doc) return undefined;
    if (!COMPLAINT_OPEN_STATUSES.includes(doc.status)) {
      return res.status(400).json({ success: false, message: 'This case is closed.' });
    }
    const me = req.authUser._id;
    const isReporter = String(doc.reporterId) === String(me);
    doc.messages.push({ from: me, text });
    capComplaintMessages(doc);
    if (!isReporter && doc.status === 'open') doc.status = 'replied';
    doc[isReporter ? 'reporterReadAt' : 'receiverReadAt'] = new Date();
    await doc.save();
    await notifyComplaintParty(isReporter ? doc.receiverId : doc.reporterId, {
      title: `New message · ${doc.ref}`,
      message: `${req.authUser.fullName || 'They'}: ${text}`,
      complaint: doc,
    });
    const [shown] = await decorateComplaints([doc.toObject()], me);
    return res.json({ success: true, complaint: shown });
  } catch (error) {
    console.error('Complaint message error:', error);
    return res.status(500).json({ success: false, message: 'Could not send that message.' });
  }
});

// POST /api/complaints/:id/solve — the person who raised it says it's fixed.
app.post('/api/complaints/:id/solve', writeLimit, requireAuth, async (req, res) => {
  try {
    const doc = await loadComplaintFor(req, res);
    if (!doc) return undefined;
    if (String(doc.reporterId) !== String(req.authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the person who raised it can mark it solved.' });
    }
    if (!COMPLAINT_OPEN_STATUSES.includes(doc.status)) {
      return res.status(400).json({ success: false, message: 'This case is already closed.' });
    }
    doc.status = 'solved';
    doc.closedAt = new Date();
    doc.messages.push({ from: null, text: 'Marked solved' });
    capComplaintMessages(doc);
    await doc.save();
    await notifyComplaintParty(doc.receiverId, {
      title: `Complaint solved · ${doc.ref}`,
      message: `${req.authUser.fullName || 'They'} marked the complaint solved.`,
      complaint: doc,
    });
    const [shown] = await decorateComplaints([doc.toObject()], req.authUser._id);
    return res.json({ success: true, complaint: shown });
  } catch (error) {
    console.error('Complaint solve error:', error);
    return res.status(500).json({ success: false, message: 'Could not update that complaint.' });
  }
});

// POST /api/complaints/:id/escalate — hand it to GLOOBAL support, after 48h.
app.post('/api/complaints/:id/escalate', writeLimit, requireAuth, async (req, res) => {
  try {
    const doc = await loadComplaintFor(req, res);
    if (!doc) return undefined;
    if (String(doc.reporterId) !== String(req.authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the person who raised it can ask support.' });
    }
    if (!['open', 'replied'].includes(doc.status)) {
      return res.status(400).json({ success: false, message: 'This case can no longer be escalated.' });
    }
    if (Date.now() - new Date(doc.createdAt).getTime() < COMPLAINT_ESCALATE_AFTER_MS) {
      return res.status(400).json({ success: false, message: 'Support can step in 48 hours after the complaint was raised.' });
    }
    doc.status = 'escalated';
    doc.escalatedAt = new Date();
    doc.messages.push({ from: null, text: 'Escalated to GLOOBAL support. Support can now read this chat.' });
    capComplaintMessages(doc);
    await doc.save();
    recordAudit({
      userId: req.authUser._id, action: 'complaint.escalate', status: 'success',
      message: `Complaint ${doc.ref} escalated`, req,
      metadata: { complaintId: doc._id, transactionId: doc.transactionId },
    });
    await notifyComplaintParty(doc.receiverId, {
      title: `Complaint escalated · ${doc.ref}`,
      message: 'GLOOBAL support is now looking at this complaint.',
      complaint: doc,
    });
    const [shown] = await decorateComplaints([doc.toObject()], req.authUser._id);
    return res.json({ success: true, complaint: shown });
  } catch (error) {
    console.error('Complaint escalate error:', error);
    return res.status(500).json({ success: false, message: 'Could not update that complaint.' });
  }
});

// Called by POST /api/transactions/send after a payment commits, when the
// payment says it is sending a complaint's money back. Closes the case only
// when the payment really is the RECEIVER paying the REPORTER back, and
// only in full; a smaller amount is recorded in the chat and leaves it open.
// Never throws — the money has already moved.
async function closeComplaintByReturn({ complaintId, transaction, sender, receiver }) {
  try {
    if (!complaintId || !mongoose.Types.ObjectId.isValid(String(complaintId))) return null;
    const doc = await Complaint.findById(String(complaintId));
    if (!doc || !COMPLAINT_OPEN_STATUSES.includes(doc.status)) return null;
    if (String(doc.receiverId) !== String(sender._id) || String(doc.reporterId) !== String(receiver._id)) return null;
    const original = await Transaction.findById(doc.transactionId).select('amount currency metadata').lean();
    const owed = Number(original?.metadata?.debitAmount ?? original?.amount) || 0;
    const owedCurrency = original?.metadata?.sourceCurrency || original?.currency || '';
    const paid = Number(transaction.amount) || 0;
    const full = owedCurrency && String(transaction.currency).toUpperCase() === String(owedCurrency).toUpperCase()
      ? paid >= owed * 0.99
      : true;
    const amountText = `${formatNotificationAmount(paid, transaction.currency)} ${transaction.currency}`;
    doc.messages.push({ from: null, text: `${notificationDisplayName(null, sender)} sent back ${amountText}` });
    if (full) {
      doc.status = 'returned';
      doc.closedAt = new Date();
      doc.returnTransactionId = transaction._id;
    }
    capComplaintMessages(doc);
    await doc.save();
    await notifyComplaintParty(doc.reporterId, {
      title: full ? `Money sent back · ${doc.ref}` : `Part sent back · ${doc.ref}`,
      message: `${notificationDisplayName(null, sender)} sent back ${amountText}.`,
      complaint: doc,
    });
    return doc;
  } catch (error) {
    console.error('Complaint return close error (non-fatal):', error);
    return null;
  }
}

// GET /api/category-links — every link I am either side of.
app.get('/api/category-links', requireAuth, async (req, res) => {
  try {
    const viewerId = req.authUser._id;
    const rows = await CategoryLink.find({
      $or: [{ ownerId: viewerId }, { memberId: viewerId }],
      status: { $in: ['pending', 'active'] },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, links: await decorateCategoryLinks(rows, viewerId) });
  } catch (error) {
    console.error('Category links read error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your connections.' });
  }
});

// POST /api/category-links/:id/accept — take the invitation, under a name
// of my own.
//
// The category is created HERE, by the member, with the member as its
// owner. It is an ordinary category in every respect: it appears on their
// grid, they can rename it, give it a colour, set a budget on it, and
// delete it. Nothing about it is special except that a link points at it.
app.post('/api/category-links/:id/accept', writeLimit, requireAuth, async (req, res) => {
  try {
    const memberId = req.authUser._id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryLinkNotFound(res);

    const link = await CategoryLink.findOne({ _id: id, memberId }).lean();
    if (!link) return categoryLinkNotFound(res);
    if (link.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'That invitation has already been answered.' });
    }

    const name = categoryNameNormalised(req.body?.name);
    if (!name) return res.status(400).json({ success: false, message: 'What will you call it?' });
    if (categoryNameLength(name) > CATEGORY_NAME_MAX_LENGTH) {
      return res.status(400).json({ success: false, message: `Keep it under ${CATEGORY_NAME_MAX_LENGTH} characters.` });
    }

    // Income, and on the creator side. Both are forced rather than offered:
    // the money arriving through a link is money this person earned, and
    // filing earnings as an expense on the personal side would put them in
    // the wrong half of every total they have.
    const category = await Category.create({
      userId: memberId,
      name,
      kind: 'income',
      side: 'creator',
      icon: String(req.body?.icon || '').trim().slice(0, 16),
    });

    await CategoryLink.updateOne(
      { _id: link._id },
      { $set: { status: 'active', memberCategoryId: category._id, respondedAt: new Date() } }
    );

    const updated = await CategoryLink.findById(link._id).lean();
    const [decorated] = await decorateCategoryLinks([updated], memberId);
    return res.json({
      success: true,
      link: decorated,
      category: Object.assign({}, publicCategory(category.toObject()), { totals: [], photo: null }),
    });
  } catch (error) {
    console.error('Category link accept error:', error);
    return res.status(500).json({ success: false, message: 'Could not accept that invitation.' });
  }
});

// POST /api/category-links/:id/decline — no thank you.
//
// Recorded rather than deleted, which is what makes the refusal stick: the
// invite route refuses to re-send to a link in this state, so saying no
// once is saying no.
app.post('/api/category-links/:id/decline', writeLimit, requireAuth, async (req, res) => {
  try {
    const memberId = req.authUser._id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryLinkNotFound(res);

    const result = await CategoryLink.updateOne(
      { _id: id, memberId, status: 'pending' },
      { $set: { status: 'declined', respondedAt: new Date() } }
    );
    if (!result.matchedCount) return categoryLinkNotFound(res);
    return res.json({ success: true });
  } catch (error) {
    console.error('Category link decline error:', error);
    return res.status(500).json({ success: false, message: 'Could not decline that invitation.' });
  }
});

// DELETE /api/category-links/:id — stop it, from either side.
//
// Either party may end it and neither needs the other's agreement: a
// merchant who has let somebody go and a worker who has left are the same
// act from two directions, and an arrangement that one side cannot leave is
// not an arrangement.
//
// Payments already filed are untouched. The label on them is the record of
// what happened, and tidying a connection must not rewrite history — the
// same rule DELETE /api/categories already follows.
app.delete('/api/category-links/:id', writeLimit, requireAuth, async (req, res) => {
  try {
    const viewerId = req.authUser._id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return categoryLinkNotFound(res);

    const link = await CategoryLink.findOne({
      _id: id,
      $or: [{ ownerId: viewerId }, { memberId: viewerId }],
      status: { $in: ['pending', 'active'] },
    }).lean();
    if (!link) return categoryLinkNotFound(res);

    await CategoryLink.updateOne(
      { _id: link._id },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
          endedBy: String(link.ownerId) === String(viewerId) ? 'owner' : 'member',
        },
      }
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Category link end error:', error);
    return res.status(500).json({ success: false, message: 'Could not end that connection.' });
  }
});

// PUT /api/transactions/:referenceId/tag — file a payment under a choice.
//
// Idempotent by construction: the unique index on { userId, transactionId }
// means a retry, or two requests racing, update one row rather than writing
// two. A client that tags the same payment twice with different categories
// gets the second one, which is what re-filing means.
app.put('/api/transactions/:referenceId/tag', writeLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const referenceId = String(req.params.referenceId || '').trim();
    if (!referenceId) return res.status(400).json({ success: false, message: 'Which payment?' });

    const categoryId = String(req.body?.categoryId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(categoryId)) return categoryNotFound(res);

    const category = await Category.findOne({ _id: categoryId, userId }).lean();
    if (!category) return categoryNotFound(res);

    // The caller must be a party to the payment. Checked against the
    // transaction rather than taken on trust from the body, because a
    // reference id is not a secret — it appears on a receipt that can be
    // shared — and an account filing a stranger's payment under its own
    // category would put that payment's figures into its own totals.
    const transaction = await Transaction.findOne({ referenceId })
      .select('_id fromUserId toUserId')
      .lean();
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'No payment with that reference.' });
    }
    const isParty =
      String(transaction.fromUserId || '') === String(userId) ||
      String(transaction.toUserId || '') === String(userId);
    if (!isParty) {
      return res.status(403).json({ success: false, message: 'That payment is not yours.' });
    }

    const tag = await TransactionTag.findOneAndUpdate(
      { userId, transactionId: transaction._id },
      { $set: { categoryId: category._id, categoryName: category.name, referenceId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // ── AND THE OTHER SIDE, IF THEY ASKED FOR IT ────────────────────────
    //
    // This is the whole point of a connected category. The merchant files a
    // wage payment under "Staff salary"; Ramu's copy of the same payment
    // files itself under whatever he called his side of it, without him
    // touching anything.
    //
    // Three conditions, all of them load-bearing:
    //
    //   The link must be ACTIVE. Pending means he has not agreed; declined
    //   and ended mean he has agreed to stop.
    //
    //   The link's member must be the OTHER PARTY to this very payment.
    //   A merchant with Ramu and Sita both on one category files a payment
    //   to Sita, and only Sita's copy may be written — writing Ramu's would
    //   put money he never received into his earnings.
    //
    //   And it only fires when the person tagging is the link's OWNER. The
    //   member tagging their own copy is them re-filing it by hand, which
    //   is allowed and must not reach back across and relabel the merchant's
    //   books.
    //
    // Best-effort, after the caller's own tag and outside any transaction,
    // exactly as the comment at the top of models/TransactionTag.js argues
    // for: a label that fails to write leaves a payment untagged, and that
    // is a smaller wrong than a failed request on a payment that happened.
    let alsoFiled = null;
    try {
      if (String(transaction.fromUserId || '') === String(userId)) {
        const otherPartyId = transaction.toUserId;
        if (otherPartyId) {
          const link = await CategoryLink.findOne({
            ownerCategoryId: category._id,
            memberId: otherPartyId,
            status: 'active',
          }).lean();
          if (link && link.memberCategoryId) {
            // Read rather than trusted: the member may have renamed or
            // deleted their side since accepting, and a name copied at
            // accept time would go stale the first time they edited it.
            const theirs = await Category.findOne({
              _id: link.memberCategoryId,
              userId: otherPartyId,
            }).select('_id name archivedAt').lean();
            if (theirs && !theirs.archivedAt) {
              await TransactionTag.updateOne(
                { userId: otherPartyId, transactionId: transaction._id },
                { $set: { categoryId: theirs._id, categoryName: theirs.name, referenceId } },
                // upsert, not update: their copy has no tag yet. And
                // $set over an existing one is deliberate — a connected
                // category is a standing instruction, so a later payment
                // on the same link re-files the same way.
                { upsert: true, setDefaultsOnInsert: true }
              );
              alsoFiled = { categoryName: theirs.name };
            }
          }
        }
      }
    } catch (error) {
      console.error('Linked category tag failed:', error.message);
    }

    return res.json({
      success: true,
      tag: { referenceId: tag.referenceId, categoryId: String(tag.categoryId), categoryName: tag.categoryName || '' },
      // So the payer can be told it reached the other side's books too,
      // which is the only visible evidence that connecting did anything.
      alsoFiled,
    });
  } catch (error) {
    console.error('Transaction tag error:', error);
    return res.status(500).json({ success: false, message: 'Could not file that payment.' });
  }
});

// DELETE /api/transactions/:referenceId/tag — unfile it. Removing a label
// has never changed a payment and does not now; the row simply stops
// appearing under a category.
app.delete('/api/transactions/:referenceId/tag', writeLimit, requireAuth, async (req, res) => {
  try {
    const referenceId = String(req.params.referenceId || '').trim();
    if (!referenceId) return res.status(400).json({ success: false, message: 'Which payment?' });

    const result = await TransactionTag.deleteOne({ userId: req.authUser._id, referenceId });
    return res.json({ success: true, removed: result.deletedCount > 0 });
  } catch (error) {
    console.error('Transaction untag error:', error);
    return res.status(500).json({ success: false, message: 'Could not unfile that payment.' });
  }
});

// ── Hooman Score ────────────────────────────────────────────────────────────
//
// Per account, scoped by the bearer token like notifications, so none of these
// takes a Gloobal ID. The rules — what an answer is worth, how the score is
// averaged — live in lib/hoomanScore.js; these routes only store and fetch.
//
// Nothing is saved until the person agrees (POST /api/hooman/consent), and
// DELETE /api/hooman removes every answer and the agreement with it.
//
// The score never affects money. No payment route reads anything here.

const hoomanAnswersFor = (userId, now = new Date()) => {
  const cutoff = new Date(now.getTime() - HOOMAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // The window, plus Finance answers of any age: those lock after the first
  // answer, so the first one counts for good.
  return HoomanAnswer.find({ userId, $or: [{ createdAt: { $gte: cutoff } }, { pillar: 'finance' }] })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
};

const hoomanHasConsent = async (userId) => Boolean(await HoomanProfile.exists({ userId }));

// GET /api/hooman — the score, and whether answers are being saved at all.
app.get('/api/hooman', lookupLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const [consented, answers] = await Promise.all([hoomanHasConsent(userId), hoomanAnswersFor(userId)]);
    return res.json({ success: true, consented, score: computeHoomanScore(answers) });
  } catch (error) {
    console.error('Hooman score error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your Hooman Score right now.' });
  }
});

// GET /api/hooman/question — one knowledge question, WITHOUT its answer.
// `exclude` is a comma-separated list of ids recently shown, so the same
// question does not come up twice in a row.
app.get('/api/hooman/question', lookupLimit, requireAuth, async (req, res) => {
  const recent = new Set(String(req.query.exclude || '').split(',').map((id) => id.trim()).filter(Boolean));
  const pool = HOOMAN_QUESTION_BANK.questions.filter((q) => !recent.has(q.id));
  const from = pool.length ? pool : HOOMAN_QUESTION_BANK.questions;
  const question = from[Math.floor(Math.random() * from.length)];
  return res.json({ success: true, question: hoomanPublicQuestion(question) });
});

// POST /api/hooman/consent — { accept: true } records the agreement.
app.post('/api/hooman/consent', writeLimit, requireAuth, async (req, res) => {
  try {
    if (!req.body || req.body.accept !== true) {
      return res.status(400).json({ success: false, code: 'hooman_consent_not_given', message: 'Nothing was agreed to.' });
    }
    const userId = req.authUser._id;
    await HoomanProfile.updateOne(
      { userId },
      { $setOnInsert: { userId, consentedAt: new Date(), consentVersion: 1 } },
      { upsert: true }
    );
    return res.json({ success: true, consented: true });
  } catch (error) {
    console.error('Hooman consent error:', error);
    return res.status(500).json({ success: false, message: 'Could not save that right now.' });
  }
});

// POST /api/hooman/answers — one answer. The body carries the ANSWER, never
// the points: the server works out what it is worth.
app.post('/api/hooman/answers', writeLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    if (!(await hoomanHasConsent(userId))) {
      return res.status(403).json({
        success: false,
        code: 'hooman_consent_required',
        message: 'Agree to saving your Hooman Score first.',
      });
    }

    const evaluated = evaluateHoomanAnswer(req.body, { bank: HOOMAN_QUESTION_BANK });
    if (!evaluated.ok) return res.status(400).json({ success: false, code: evaluated.code, message: evaluated.message });
    const record = evaluated.record;

    // An answer given after a payment must name a payment this person made.
    // Every payment counts once — so the payment has to be real, and theirs.
    if (record.source === 'payment'
      && !(await Transaction.exists({ referenceId: record.transactionId, fromUserId: userId }))) {
      return res.status(400).json({
        success: false,
        code: 'hooman_bad_transaction',
        message: 'That payment was not found on your account.',
      });
    }

    if (hoomanPillarLocks(record.pillar)
      && await HoomanAnswer.exists({ userId, pillar: record.pillar, item: record.item })) {
      return res.status(409).json({
        success: false,
        code: 'hooman_answer_locked',
        message: 'Finance answers lock after your first response.',
      });
    }

    if (record.source === 'score') {
      // A second answer to the same check-in on the same day corrects the
      // first. The unique index on (user, check-in, day) backs this up if two
      // requests race; the loser simply retries as an update.
      const filter = { userId, pillar: record.pillar, item: record.item, day: record.day, source: 'score' };
      const update = { $set: { ...record, userId } };
      try {
        await HoomanAnswer.updateOne(filter, update, { upsert: true });
      } catch (error) {
        if (error && error.code === 11000) await HoomanAnswer.updateOne(filter, update);
        else throw error;
      }
    } else {
      // After a payment: every payment counts, each payment once. A retried
      // save of the same payment's answer returns what was already stored.
      try {
        await HoomanAnswer.create({ ...record, userId });
      } catch (error) {
        if (!(error && error.code === 11000)) throw error;
      }
    }

    return res.json({
      success: true,
      answer: { points: record.points, correct: record.correct, rightChoice: evaluated.rightChoice },
      score: computeHoomanScore(await hoomanAnswersFor(userId)),
    });
  } catch (error) {
    console.error('Hooman answer error:', error);
    return res.status(500).json({ success: false, message: 'Could not save that answer right now.' });
  }
});

// DELETE /api/hooman — every answer, and the agreement. After this nothing is
// saved again until the person agrees again.
app.delete('/api/hooman', writeLimit, requireAuth, async (req, res) => {
  try {
    const userId = req.authUser._id;
    const [answers] = await Promise.all([
      HoomanAnswer.deleteMany({ userId }),
      HoomanProfile.deleteOne({ userId }),
    ]);
    return res.json({ success: true, deleted: answers.deletedCount || 0, consented: false });
  } catch (error) {
    console.error('Hooman delete error:', error);
    return res.status(500).json({ success: false, message: 'Could not delete your answers right now.' });
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
      // countryIso is selected so the pre-snapshot FALLBACK in
      // counterpartyFor can still produce a flag for rows written before
      // metadata.parties existed. Rows carrying the snapshot never reach it.
      .populate('fromUserId', 'fullName symbolId countryIso')
      .populate('toUserId', 'fullName symbolId countryIso')
      .lean();

    // The Creator Share legs belonging to this page of payments.
    //
    // A 'share' row is excluded from the list itself (see the query above —
    // it moves no balance and would double-count as spend), but the receipt
    // for a payment shows the share as its own tab, with its own reference.
    // Without this the tab disappeared the moment a payment was reopened from
    // history instead of shown fresh: the data existed in Mongo and nothing
    // carried it across.
    //
    // One extra query for the whole page, not one per row.
    const shareLegs = await Transaction.find({
      type: 'share',
      'metadata.paymentTransactionId': { $in: transactions.map((t) => t._id) },
    })
      .select('referenceId receiptCode metadata.paymentTransactionId')
      .lean();
    const shareByPayment = new Map(
      shareLegs.map((leg) => [String(leg.metadata?.paymentTransactionId), leg])
    );

    // Give every row on this page its short receipt-link handle, minting one
    // for any row that predates the field. Rows that already have one cost
    // nothing, so this is a write only on the first read of an old row. Both
    // lists are covered: a payment's receipt and its Creator Share tab are
    // two different movements and each shares its own link.
    await ensureReceiptCodes([...transactions, ...shareLegs]);

    const coinOtherById = await resolveCoinCounterparties(transactions, user._id, User);

    const history = transactions.map((transaction) => {
      const senderId = String(transaction.fromUserId?._id || transaction.fromUserId || '');
      const isSender = senderId === String(user._id);
      const counterparty = isSender ? transaction.toUserId : transaction.fromUserId;
      const isCoin = isCoinTransaction(transaction.type);

      return {
        id: transaction._id,
        referenceId: transaction.referenceId,
        // The short handle this row's receipt link is addressed by. Null on a
        // row whose code could not be minted this time round, which the
        // client reads as "fall back to the long link".
        receiptCode: transaction.receiptCode || null,
        // What kind of movement this is.
        //
        // This projection never carried it. The sibling route
        // /api/transactions/:symbolId does, and the app reads that one — so
        // this endpoint handed out rows that a caller could not classify at
        // all: a coin purchase and a payment arrived identical apart from
        // their currency, and currency is not the discriminator (Gloobal Coin
        // and the GEU growth prototype are both denominated 'GEU').
        type: transaction.type || 'payment',
        // Coin direction comes from `type`, not fromUserId — see the long
        // note on the same line of /api/transactions/:symbolId. A mint and a
        // redeem both write fromUserId = the holder, so `isSender` cannot
        // tell a buy from a sell and reported both as 'sent'.
        direction: isCoin
          ? coinPaymentDirectionFor(transaction, user._id)
          : isSender ? 'sent' : 'received',
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
        // As of when the payment happened, not as of now — see
        // counterpartyFor. This carries countryIso, which is what a receipt
        // derives its flag from and which this projection previously had no
        // way to supply at all.
        counterparty: counterpartyFor(transaction, isSender, counterparty),
        // The shop this payment was made to, when it was paid at a creator
        // name (see the send route's parties.receiver.creatorHandle).
        creatorHandle: transaction.metadata?.parties?.receiver?.creatorHandle || null,
        // The Creator Share this payment carried. Written into metadata by
        // the send route; null on rows that predate it, which the client
        // treats as "no share" rather than inventing one.
        cashbackRate: Number.isFinite(Number(transaction.metadata?.cashbackRate))
          ? Number(transaction.metadata.cashbackRate)
          : null,
        // Each side in its own currency: `cashback` is the receiver-currency
        // figure withheld from the payee, `cashbackCredit` the sender-currency
        // figure handed back to the payer.
        cashback: Number.isFinite(Number(transaction.metadata?.cashback))
          ? Number(transaction.metadata.cashback)
          : null,
        cashbackCredit: Number.isFinite(Number(transaction.metadata?.cashbackCredit))
          ? Number(transaction.metadata.cashbackCredit)
          : null,
        // The share leg's own reference. A payment whose payee shares nothing
        // has no share leg and keeps this null.
        shareReferenceId: shareByPayment.get(String(transaction._id))?.referenceId || null,
        // And the share leg's own short link handle, distinct from the
        // payment's — sharing the Creator Share tab must not hand somebody a
        // link to the payment it came from.
        shareReceiptCode: shareByPayment.get(String(transaction._id))?.receiptCode || null,
        // WHERE THE PAYER'S SHARE WENT, as recorded at the time.
        //
        // 'assets' means it was placed in custody against an AssetSeed and
        // has to be claimed. Null means this payment predates that — the
        // share was credited straight into the payer's spendable balance,
        // which is what every share leg written before the change
        // documents. The receipt reads this rather than deciding from
        // today's behaviour, because a receipt is a record of what
        // happened to THAT payment.
        //
        // On a SHARE LEG the same fact is on its own metadata, read
        // directly below.
        cashbackDestination: transaction.type === 'share'
          ? (transaction.metadata?.cashbackDestination || null)
          : (shareByPayment.get(String(transaction._id))?.metadata?.cashbackDestination || null),
        // And the other direction: on a SHARE LEG, the reference of the
        // payment that produced it.
        //
        // mintShareLegAndReceipts has written this into the leg's metadata
        // since it was built — `paymentReferenceId`, right beside the note
        // that reads "Share on <ref>" — but neither projection surfaced it,
        // so a share leg arrived on the client with no way back to its
        // payment. The Creator Share receipt needs it: its Payment tab
        // describes the payment the share came from, and a receipt may not
        // reconstruct that figure by dividing the share by its rate (9.99 at
        // 2% reads back as 499.50, and a 0% share divides by zero).
        //
        // Null on a payment, which has no payment above it.
        paymentReferenceId: transaction.metadata?.paymentReferenceId || null,
        // A coin movement's own facts — the fiat leg, the rate, the rate's
        // direction. Null on a payment. Same shaper as the other two routes
        // that send coin rows; see the matching block on
        // /api/transactions/:symbolId.
        coin: isCoin
          ? coinHistoryRow(transaction, {
            viewerUserId: user._id,
            counterparty: coinCounterpartyOf(transaction, user._id, coinOtherById),
          })
          : null,
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
          // 'share' legs are COUNTED here, and the exclusion that used to
          // sit on this line was wrong for the same reason it was wrong on
          // the record query below.
          //
          // The old comment said counting a share would "inflate
          // totalSent/totalReceived by the cashback amount on top of the
          // real payment that already includes it". The payment row does
          // include it — `amount` is the full face value, 1,000 — but the
          // balance movement does not: the payee was credited 980. So the
          // share row is not a duplicate of anything, it is the other half
          // of the movement, and leaving it out is what made the totals
          // disagree with the balance rather than what kept them honest.
          //
          // With it counted, a 1,000 payment at 2% gives the payee
          // totalReceived 1,000 and totalSent 20 — net 980, which is
          // exactly what their balance did.
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

    // 'share' legs are INCLUDED. This is the list the app's History screen
    // and both dashboard lists are built from, and a Creator Share is a
    // movement the account holder has to be able to see.
    //
    // The reported symptom: "someone pays me 1000, I share back 2%, that 2%
    // is not on my paid side — it only shows on the receipt." Exactly right.
    // The payee's history row read +1,000 (the payment's face value) while
    // their balance rose by 980, and the row accounting for the other 20 was
    // filtered out one line up from here. Same gap on the payer's side, in
    // the other direction: they saw -1,000 having been net-debited 980.
    //
    // Both close now. A share leg runs opposite to its payment — fromUserId
    // is the payee — so it lands on the payee's sent side and the payer's
    // received side without any special-casing of direction here.
    const records = await Transaction.find(directionMatch)
      .sort({ createdAt: -1 })
      .limit(100)
      // countryIso is selected so the pre-snapshot FALLBACK in
      // counterpartyFor can still produce a flag for rows written before
      // metadata.parties existed. Rows carrying the snapshot never reach it.
      .populate('fromUserId', 'fullName symbolId countryIso')
      .populate('toUserId', 'fullName symbolId countryIso')
      .lean();

    // The share leg that belongs to each payment on this page, by its own
    // reference.
    //
    // This is the list the app actually restores its history from
    // (getTransactionSummary -> mapServerTransaction), and it was the only
    // one of the two history projections that never carried this field. So
    // a reopened receipt reached ReceiptModal with no share reference at
    // all, its Creator Share tab fell back to the PAYMENT's id, and the two
    // legs of one payment became indistinguishable the moment the receipt
    // was closed and opened again — even though both references had existed,
    // distinct and persisted, since the payment was made.
    //
    // Same one-query-per-page shape as /api/transactions/history above, and
    // the same relationship: metadata.paymentTransactionId on the share row.
    // Nothing is minted here; this only reads what mintShareLegAndReceipts
    // already wrote.
    const shareLegs = await Transaction.find({
      type: 'share',
      'metadata.paymentTransactionId': { $in: records.map((t) => t._id) },
    })
      .select('referenceId receiptCode metadata.paymentTransactionId')
      .lean();
    const shareByPayment = new Map(
      shareLegs.map((leg) => [String(leg.metadata?.paymentTransactionId), leg])
    );

    // Same lazy mint as /api/transactions/history — see the note there. This
    // is the list the app actually restores its history from, so it is the
    // one that decides whether a reopened receipt shares a short link or the
    // long one.
    await ensureReceiptCodes([...records, ...shareLegs]);

    // The other account on each coin SEND on this page, in one query. Mint
    // and redeem have no other account — their counterparty is the reserve.
    const coinOtherById = await resolveCoinCounterparties(records, user._id, User);

    const transactions = records.map((transaction) => {
      const senderId = String(transaction.fromUserId?._id || transaction.fromUserId || '');
      const isSender = senderId === String(user._id);
      const counterparty = isSender ? transaction.toUserId : transaction.fromUserId;
      const isCoin = isCoinTransaction(transaction.type);

      return {
        id: String(transaction._id),
        referenceId: transaction.referenceId,
        // The short handle this row's receipt link is addressed by — a URL
        // detail, never the reference the row is identified by.
        receiptCode: transaction.receiptCode || null,
        // WHICH WAY THE MONEY WENT — and on a coin row, fromUserId does not
        // answer that.
        //
        // A mint and a redeem both write fromUserId = the holder and
        // toUserId = null, because both are the holder transacting with the
        // reserve. So `isSender` is true for both, and this line reported a
        // BUY as "sent": App.jsx filed it on the Paid side and drew
        // −12.50 GEU against an account that had just gained 12.50 GEU. The
        // sign was inverted on every purchase ever made, in every list built
        // from this route.
        //
        // coinPaymentDirectionFor reads `type` for mint and redeem and the
        // viewer's position for a send, which is the only way to tell the
        // first two apart. See lib/coinHistoryRow.js.
        direction: isCoin
          ? coinPaymentDirectionFor(transaction, user._id)
          : isSender ? 'sent' : 'received',
        // 'payment' or 'share'. Projected now that share legs appear in this
        // list: the two rows of a shared payment are the same money seen
        // from two sides, and a client that cannot tell them apart cannot
        // label the second one or keep it out of a "payments" count.
        type: transaction.type || 'payment',
        from: transaction.fromUserId?.symbolId || null,
        to: transaction.toUserId?.symbolId || null,
        // The RECEIVER's side: the face value this payment was denominated
        // in, and the currency it is in. Right for the receiver, wrong for
        // the sender on any cross-border payment.
        amount: transaction.amount,
        cashback: Number(transaction.metadata?.cashback) || 0,
        // The payer's own side of the share, in the payer's currency.
        //
        // `cashback` above is the payee-currency figure. mapServerTransaction
        // wants the payer's for a row it shows as 'sent', and with this field
        // absent it fell back to the payee's — the same one-side-under-the-
        // other-side's-symbol defect the debitAmount block below exists to
        // prevent, on the share figure rather than the payment figure.
        cashbackCredit: Number.isFinite(Number(transaction.metadata?.cashbackCredit))
          ? Number(transaction.metadata.cashbackCredit)
          : null,
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
        // Same snapshot-first rule as /api/transactions/history — see
        // counterpartyFor. Carries countryIso so this route can feed a
        // receipt too, not only a list row.
        counterparty: counterpartyFor(transaction, isSender, counterparty),
        // The shop this payment was made to, when it was paid at a creator
        // name (see the send route's parties.receiver.creatorHandle).
        creatorHandle: transaction.metadata?.parties?.receiver?.creatorHandle || null,
        // The share leg's OWN reference, so a receipt rebuilt from this row
        // can name the share by its own id instead of the payment's. Null on
        // a payment whose payee shares nothing — there is no second leg, and
        // the receipt is expected to show no share reference rather than
        // inventing one.
        shareReferenceId: shareByPayment.get(String(transaction._id))?.referenceId || null,
        // The share leg's own short link handle, distinct from the payment's.
        shareReceiptCode: shareByPayment.get(String(transaction._id))?.receiptCode || null,
        // WHERE THE PAYER'S SHARE WENT, as recorded at the time.
        //
        // 'assets' means it was placed in custody against an AssetSeed and
        // has to be claimed. Null means this payment predates that — the
        // share was credited straight into the payer's spendable balance,
        // which is what every share leg written before the change
        // documents. The receipt reads this rather than deciding from
        // today's behaviour, because a receipt is a record of what
        // happened to THAT payment.
        //
        // On a SHARE LEG the same fact is on its own metadata, read
        // directly below.
        cashbackDestination: transaction.type === 'share'
          ? (transaction.metadata?.cashbackDestination || null)
          : (shareByPayment.get(String(transaction._id))?.metadata?.cashbackDestination || null),
        // And the other direction: on a SHARE LEG, the reference of the
        // payment that produced it.
        //
        // mintShareLegAndReceipts has written this into the leg's metadata
        // since it was built — `paymentReferenceId`, right beside the note
        // that reads "Share on <ref>" — but neither projection surfaced it,
        // so a share leg arrived on the client with no way back to its
        // payment. The Creator Share receipt needs it: its Payment tab
        // describes the payment the share came from, and a receipt may not
        // reconstruct that figure by dividing the share by its rate (9.99 at
        // 2% reads back as 499.50, and a 0% share divides by zero).
        //
        // Null on a payment, which has no payment above it.
        paymentReferenceId: transaction.metadata?.paymentReferenceId || null,
        // A COIN MOVEMENT'S OWN FACTS — the fiat it cost or paid out, the
        // rate it converted at, and which way that rate points.
        //
        // Null on a payment, and the only block on this projection that is
        // null for most rows. It is here because a buy or a sell is the one
        // movement in this app that is literally a currency exchange, and
        // without these fields a history row for one has nothing to open: it
        // reached the client as a bare GEU figure with no cost, no rate and
        // no second leg, so the receipt behind it described a bank payment
        // that never happened.
        //
        // Same shaper as GET /api/coin/:symbolId/history, so the Coin
        // screen's ledger and the History screen cannot disagree about one
        // purchase.
        coin: isCoin
          ? coinHistoryRow(transaction, {
            viewerUserId: user._id,
            counterparty: coinCounterpartyOf(transaction, user._id, coinOtherById),
          })
          : null,
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

// ── Gloobal Coin, as a closed record ────────────────────────────────────
//
// It was a fully backed prototype currency: every coin was minted by moving
// prototype fiat out of an account into CoinReserve, could be transferred,
// and could be redeemed back at the same rate. Three invariants held after
// every operation — reserve == issued == sum(User.coinBalance); a transfer
// changed neither reserve nor issued; fiat plus coin held by an account was
// unchanged by a mint or a redeem.
//
// It is closed. Every balance was redeemed back to spendable fiat by
// scripts/redeem-all-coin.mjs, the reserve was drained, and the routes that
// could write another coin are deleted. What is left below is the read
// side: the history of what happened while it was open.
//
// The ticker still matters because those rows are denominated in it, and it
// still comes from lib/coinTicker.js rather than a literal here — the GC ->
// GEU rename updated this file and missed scripts/coin-airdrop.mjs, and two
// copies of a constant is how that happens.
const { COIN_CURRENCY } = require('./lib/coinTicker');
// Gloobal paying a person — the one write path for it, and the atomic-or-
// refuse primitive it shares with the GEU ledger.
const { recordDisbursement } = require('./lib/disbursement');
// The other half of a seed claim: the Creator Share itself, coming back out
// of the custody account that has been holding it. Its own module because a
// release is not a payout — see that file's header.
const { releaseFromCustody } = require('./lib/custody');
const { withAtomicSession } = require('./lib/atomicSession');

// ── THE COIN WRITE PATHS ARE GONE ───────────────────────────────────────
//
// mint, redeem, send, supply, holders and the account's coin position lived
// here, with their helpers. Gloobal Coin was a second balance — real money
// in User.coinBalance, backed 1:1 by CoinReserve — and all of it has been
// redeemed back into spendable fiat by scripts/redeem-all-coin.mjs before
// this deployed.
//
// GEU is a display lens now: 1 GEU = 1 unit of the viewer's own tender, a
// label on money they already hold. Nothing is bought, sold or backed,
// because nothing is held, so there is nothing for these routes to do.
//
// ── WHAT DELIBERATELY SURVIVES, AND WHY ────────────────────────────────
//
// GET /api/coin/:symbolId/history, below, and lib/coinHistoryRow.js with
// it. Those rows are not a feature — they are the record of money that
// really moved: every buy somebody made, every transfer they received, and
// the redemption that converted it all back. Deleting the only thing that
// renders them would erase a person's financial history to tidy up a
// codebase, which is not a trade this project gets to make.
//
// So the coin_mint, coin_redeem and coin_send Transaction types stay in the
// enum, the history route stays, and the coin receipt stays. They are
// read-only now: nothing in the system can write another one.

app.get('/api/coin/:symbolId/history', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
  try {
    const user = await User.findOne({ symbolId: String(req.params.symbolId || '').trim() });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Secure ID not found.' });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 25;

    // Every coin movement this account was a party to. A send appears for
    // BOTH sides — the sender by fromUserId and the receiver by toUserId —
    // which is why this is an $or rather than a match on fromUserId alone.
    const filter = {
      type: { $in: ['coin_mint', 'coin_redeem', 'coin_send'] },
      status: 'success',
      $or: [{ fromUserId: user._id }, { toUserId: user._id }],
    };

    // Keyset paging on _id, monotonic with insertion time — the same shape
    // /api/projects uses, and for the same reason: skip/offset drifts as rows
    // are added underneath a reader.
    const cursor = String(req.query.cursor || '').trim();
    if (cursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        return res.status(400).json({ success: false, message: 'Bad cursor.' });
      }
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const rows = await Transaction.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? String(page[page.length - 1]._id) : null;

    // The counterparty on a send, so a receipt can name who it went to or
    // came from. Looked up in ONE query for the whole page rather than per
    // row — a page of 25 sends would otherwise be 25 round trips.
    const otherById = await resolveCoinCounterparties(page, user._id, User);

    return res.json({
      success: true,
      // Every field a coin row and its receipt need, from the one shaper
      // lib/coinHistoryRow.js holds. This block used to live here inline,
      // and it was the only place in the server that understood a coin
      // movement — the two /api/transactions projections dropped the fiat
      // leg and the rate, and read a BUY as coin going out. See that
      // module's header.
      rows: page.map((row) => coinHistoryRow(row, {
        viewerUserId: user._id,
        counterparty: coinCounterpartyOf(row, user._id, otherById),
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('Coin history error:', error);
    return res.status(500).json({ success: false, message: 'Could not load coin history.' });
  }
});

// One account's coin position, plus the supply it sits inside.

// ── THE GEU GROWTH PROTOTYPE IS GONE ────────────────────────────────────
//
// ~950 lines of a growth-bearing GEU lived here: /api/geu/{supply,ledger,
// entry,growth,redeem}, behind GEU_GROWTH_PROTOTYPE, disabled, writing
// nothing. It was kept because growth was deferred rather than rejected and
// the reasoning was worth having.
//
// It is deleted now because the question it was deferring has been answered
// differently. GEU is not a growth-bearing instrument and is not an
// instrument at all: it is a display lens over the money somebody already
// holds, pegged 1 GEU = 1 unit of their own tender. There is nothing for a
// growth model to apply to.
//
// The reasoning is kept, not lost — AUDIT_GEU_REPORT.md, GEU_GROWTH_DESIGN.md
// and the two architecture notes are under archive/legacy/, each headed as
// superseded. Someone will ask in a year why GEU is not a balance, and that
// is where the long answer lives.


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
