// Regression tests for the low-risk hardening pass (audit findings
// GLB-12, 13, 14, 15, 17, 18, 19, 20, 22, 25).
//
//   node --test tests/hardening-fixes.test.mjs
//
// Same arrangement as transfer-atomicity.test.mjs and auth-and-access.test.mjs:
// the real server.js against a throwaway database on the cluster MONGO_URI
// points at, dropped when the run ends, refusing to start if it finds itself
// anywhere else.
//
// Every check here is written as the thing that used to be possible, so a
// regression reads as "the attack works again" rather than "a field changed".

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_hardening_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5199";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "5000000";
process.env.ALLOWED_ORIGINS = "https://gloobalv3.netlify.app";

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const Settlement = require(join(BACKEND, "models/Settlement"));
const CoinReserve = require(join(BACKEND, "models/CoinReserve"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");

// Every request carries its own X-Forwarded-For.
//
// The rate limiter buckets on that header's first hop (see clientKey in
// server.js), so a distinct value per logical caller keeps this file's ~60
// requests from spending the register/otp/credential budgets on each other.
// That is deliberate and is NOT a hole being exercised: limiter behaviour has
// its own coverage in auth-and-access.test.mjs, and nothing here is about
// throttling. Without it, registerLimit (8 per 5 minutes) alone would fail
// this file on request nine regardless of whether the code is correct.
let callSeq = 0;
const call = async (method, path, { body, token, origin, client } = {}) => {
  const headers = { "X-Forwarded-For": client || `198.51.100.${(callSeq++ % 250) + 1}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, body: parsed, headers: response.headers };
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const PIN = "246813";

// Builds an account straight in the database, then signs it in for a real
// token. Used wherever the test needs an ACCOUNT rather than a REGISTRATION —
// going through the OTP flow for each of these would spend the OTP budget on
// setup rather than on the thing under test, and registration itself is
// covered explicitly in section 1.
async function seedAccount({ seed, mobileNumber, countryIso = "IN", balance = 100000, coinBalance = 0, fullName }) {
  const id = symbolId(seed);
  const user = await User.create({
    fullName: fullName || `User ${seed}`,
    mobileNumber,
    symbolId: id,
    countryIso,
    balance,
    coinBalance,
    symbolIdHistory: [{ symbolId: id, action: "created", createdAt: new Date(), changedAt: new Date(), replacedBy: null }]
  });
  await Pin.create({ userId: user._id, pinHash: await bcrypt.hash(PIN, 10) });
  const signedIn = await call("POST", "/api/login", { body: { symbolId: id, pin: PIN } });
  if (signedIn.status !== 200) throw new Error(`seedAccount could not sign in ${seed}: ${signedIn.status}`);
  return { id, mobileNumber, user, token: signedIn.body.token };
}

// Registration through the real flow, for the checks that are about
// registration.
async function registerThroughFlow({ seed, mobileNumber, overrideSymbolId }) {
  const id = overrideSymbolId ?? symbolId(seed);
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName: `User ${seed}`, mobileNumber, symbolId: id }
  });
  return { id, mobileNumber, registered, token: registered.body?.token };
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({}),
    Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
    ExchangeRate.deleteMany({}), CountryCurrencyPool.deleteMany({}),
    Settlement.deleteMany({}), CoinReserve.deleteMany({})
  ]);
  // The unique index on symbolIdHistory.symbolId lookups and the partial one
  // on idempotency keys only exist once Mongoose has built them.
  await User.syncIndexes();

  // ──────────────────────────────────────────────────────────────────────
  console.log("GLB-13. a Gloobal ID is validated against its alphabet, not just its length");

  const twelveLatin = "ABCDEFGHIJKL";
  const twelveDigits = "123456789012";
  // Twelve characters, and every one of them is a Unicode lookalike of a real
  // Gloobal symbol: a hyphen for the minus sign, a lowercase x for the
  // multiplication sign, a white circle for the black one. This is the
  // dangerous case — an ID that reads as somebody else's on a receipt.
  const twelveLookalikes = "-+x=ooo•••■■";

  for (const [label, candidate] of [
    ["latin letters", twelveLatin],
    ["digits", twelveDigits],
    ["Unicode lookalikes of the real symbols", twelveLookalikes]
  ]) {
    const attempt = await call("POST", "/api/register-symbol", {
      body: { fullName: "Impostor", mobileNumber: "+919000000901", symbolId: candidate }
    });
    check(`registration refuses ${label} (was: any 12 characters accepted)`,
      attempt.status === 400, `status=${attempt.status} ${attempt.body?.message || ""}`);
  }

  for (const [label, candidate] of [
    ["too short", SYMBOLS.slice(0, 4).join("")],
    ["too long", symbolId(5) + SYMBOLS[0]]
  ]) {
    const attempt = await call("POST", "/api/register-symbol", {
      body: { fullName: "Impostor", mobileNumber: "+919000000901", symbolId: candidate }
    });
    check(`registration refuses an ID that is ${label}`,
      attempt.status === 400, `status=${attempt.status}`);
  }

  const legit = await registerThroughFlow({ seed: 1, mobileNumber: "+919000000101" });
  check("a well-formed ID still registers", legit.registered.status === 201,
    `status=${legit.registered.status} ${legit.registered.body?.message || ""}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-20. a registration OTP is single-use");

  // legit's OTP was verified and then spent by the registration above. A
  // second registration riding the same code must not work.
  const otpReuse = await call("POST", "/api/register-symbol", {
    body: { fullName: "Second", mobileNumber: legit.mobileNumber, symbolId: symbolId(2) }
  });
  check("the same verified OTP cannot register a second account",
    otpReuse.status === 403 || otpReuse.status === 409,
    `status=${otpReuse.status} ${otpReuse.body?.message || ""}`);

  const spentOtps = await Otp.find({ mobileNumber: legit.mobileNumber, purpose: "registration" }).lean();
  check("the OTP row is marked consumed",
    spentOtps.length > 0 && spentOtps.every((row) => row.consumedAt),
    `rows=${spentOtps.length} consumed=${spentOtps.filter((r) => r.consumedAt).length}`);

  // And the PIN-set path spends its own OTP rather than leaving it live.
  // (The account is fresh, so the registration OTP above is already gone —
  // this proves the route still works via the token, which is the path that
  // matters, and that nothing was left behind for a replay.)
  const pinSet = await call("POST", "/api/pin/set", {
    body: { symbolId: legit.id, pin: PIN }, token: legit.token
  });
  check("PIN set still works with a session token", pinSet.status === 200, `status=${pinSet.status}`);
  const stillUnconsumed = await Otp.countDocuments({
    mobileNumber: legit.mobileNumber, purpose: "registration", verifiedAt: { $ne: null }, consumedAt: null
  });
  check("no verified-but-unconsumed registration OTP is left behind", stillUnconsumed === 0,
    `left=${stillUnconsumed}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-12. a released Gloobal ID is never reissued");

  const renamer = await seedAccount({ seed: 10, mobileNumber: "+919000000110" });
  const oldId = renamer.id;
  const newId = symbolId(11);

  const renamed = await call("PATCH", "/api/profile/change-symbol-id", {
    token: renamer.token,
    body: { currentSymbolId: oldId, newSymbolId: newId }
  });
  check("the rename itself still works", renamed.status === 200,
    `status=${renamed.status} ${renamed.body?.message || ""}`);

  const claimOld = await call("POST", "/api/register-symbol", {
    body: { fullName: "Squatter", mobileNumber: "+919000000111", symbolId: oldId }
  });
  check("a stranger cannot register the released ID (was: free to claim, inheriting every old QR code)",
    claimOld.status === 409 && claimOld.body?.retired === true,
    `status=${claimOld.status} ${claimOld.body?.message || ""}`);

  const availability = await call("GET", `/api/users/available?symbolId=${encodeURIComponent(oldId)}`);
  check("and the availability check says so, instead of inviting somebody to pick it",
    availability.status === 200 && availability.body?.available === false,
    `available=${availability.body?.available}`);

  const resolveOld = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(oldId)}`, {
    token: renamer.token
  });
  check("an old QR code resolves to nobody — a visible 404, not a silent stranger",
    resolveOld.status === 404, `status=${resolveOld.status}`);

  // Another account must not be able to rename INTO a stranger's retired ID.
  const otherAccount = await seedAccount({ seed: 12, mobileNumber: "+919000000112" });
  const stealByRename = await call("PATCH", "/api/profile/change-symbol-id", {
    token: otherAccount.token,
    body: { currentSymbolId: otherAccount.id, newSymbolId: oldId }
  });
  check("nor rename into it", stealByRename.status === 409 && stealByRename.body?.retired === true,
    `status=${stealByRename.status}`);

  // But the account that released it may take its own ID back — every
  // reference that ID ever had pointed here to begin with.
  const undoRename = await call("PATCH", "/api/profile/change-symbol-id", {
    token: renamer.token,
    body: { currentSymbolId: newId, newSymbolId: oldId }
  });
  check("the original owner CAN undo their own rename", undoRename.status === 200,
    `status=${undoRename.status} ${undoRename.body?.message || ""}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-14. five wrong PINs cost ten minutes, not the account");

  const lockable = await seedAccount({ seed: 20, mobileNumber: "+919000000120" });
  const LOCK_CLIENT = "198.51.100.240";

  let lastFailure = null;
  for (let i = 0; i < 5; i++) {
    lastFailure = await call("POST", "/api/login", {
      client: LOCK_CLIENT, body: { symbolId: lockable.id, pin: "111111" }
    });
  }
  check("the fifth wrong PIN reports the lockout rather than a bare 'Invalid PIN.'",
    lastFailure.status === 401 && /locked/i.test(lastFailure.body?.message || ""),
    `status=${lastFailure.status} ${lastFailure.body?.message || ""}`);

  const whileLocked = await call("POST", "/api/login", {
    client: LOCK_CLIENT, body: { symbolId: lockable.id, pin: PIN }
  });
  check("the correct PIN is refused while the lockout stands", whileLocked.status === 423,
    `status=${whileLocked.status}`);
  check("and the response says how long to wait, in the body and in Retry-After",
    Number(whileLocked.body?.retryAfterSeconds) > 0 && Number(whileLocked.headers.get("retry-after")) > 0,
    `retryAfterSeconds=${whileLocked.body?.retryAfterSeconds} header=${whileLocked.headers.get("retry-after")}`);

  // Wind the lockout back into the past — the ten minutes have now elapsed.
  await Pin.updateOne({ userId: lockable.user._id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });

  // THE REGRESSION. failedAttempts was never reset when a lockout expired,
  // so this sixth wrong attempt took the counter to 6, which is still >= 5,
  // and re-locked the account for another ten minutes. One mistyped digit per
  // window, indefinitely: a short burst of wrong guesses became permanent.
  const afterExpiry = await call("POST", "/api/login", {
    client: LOCK_CLIENT, body: { symbolId: lockable.id, pin: "111111" }
  });
  check("after the lockout elapses, one more wrong PIN does NOT immediately re-lock (was: permanent lockout)",
    afterExpiry.status === 401 && afterExpiry.body?.attemptsRemaining === 4,
    `status=${afterExpiry.status} attemptsRemaining=${afterExpiry.body?.attemptsRemaining}`);

  const reopened = await Pin.findOne({ userId: lockable.user._id }).lean();
  check("the attempt counter restarted rather than continuing past five",
    reopened.failedAttempts === 1 && !reopened.lockedUntil,
    `failedAttempts=${reopened.failedAttempts} lockedUntil=${reopened.lockedUntil}`);

  const recovered = await call("POST", "/api/login", {
    client: LOCK_CLIENT, body: { symbolId: lockable.id, pin: PIN }
  });
  check("and the right PIN now signs in", recovered.status === 200, `status=${recovered.status}`);

  // The five-strike rule itself is unchanged — nothing was weakened.
  for (let i = 0; i < 5; i++) {
    await call("POST", "/api/login", { client: LOCK_CLIENT, body: { symbolId: lockable.id, pin: "111111" } });
  }
  const relocked = await call("POST", "/api/login", {
    client: LOCK_CLIENT, body: { symbolId: lockable.id, pin: PIN }
  });
  check("five fresh wrong attempts still lock the account", relocked.status === 423, `status=${relocked.status}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-17. the lookup routes disclose the minimum");

  const payee = await seedAccount({
    seed: 30, mobileNumber: "+919000000130", fullName: "Real Name"
  });
  const payer = await seedAccount({ seed: 31, mobileNumber: "+919000000131" });
  await User.updateOne({ _id: payee.user._id }, { $set: { email: "payee@example.com" } });

  const anonResolve = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(payee.id)}`);
  check("resolve refuses an unauthenticated caller", anonResolve.status === 401, `status=${anonResolve.status}`);

  const authedResolve = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(payee.id)}`, {
    token: payer.token
  });
  const resolved = authedResolve.body?.user || {};
  check("an authorized lookup still finds the payee", authedResolve.status === 200 && resolved.symbolId === payee.id,
    `status=${authedResolve.status}`);
  check("the payee's email is not disclosed (was: returned in full)",
    resolved.email === undefined, `email=${JSON.stringify(resolved.email)}`);
  check("the payee's mobile number is masked (was: returned in full)",
    typeof resolved.mobileNumber === "string" &&
    resolved.mobileNumber.includes("•") &&
    !resolved.mobileNumber.includes("9000000130"),
    `mobileNumber=${resolved.mobileNumber}`);
  check("the mask keeps the dial code, so the recipient's country can still be read off it",
    String(resolved.mobileNumber).startsWith("+91"), `mobileNumber=${resolved.mobileNumber}`);
  check("normalizedIdentifier is gone — it echoed the full number back",
    resolved.normalizedIdentifier === undefined);
  check("nameIsMobile answers the question the client used the raw number for",
    resolved.nameIsMobile === false, `nameIsMobile=${resolved.nameIsMobile}`);
  check("the fields a payment actually needs are all still there",
    resolved.fullName === "Real Name" && typeof resolved.countryIso === "string" &&
    typeof resolved.cashbackRate === "number",
    JSON.stringify({ fullName: resolved.fullName, countryIso: resolved.countryIso }));

  const numberNamed = await seedAccount({
    seed: 32, mobileNumber: "+919000000132", fullName: "+919000000132"
  });
  const numberNamedResolve = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(numberNamed.id)}`, {
    token: payer.token
  });
  check("nameIsMobile is true for an account whose name is just its number",
    numberNamedResolve.body?.user?.nameIsMobile === true,
    `nameIsMobile=${numberNamedResolve.body?.user?.nameIsMobile}`);

  const resolveMissing = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(symbolId(999))}`, {
    token: payer.token
  });
  check("a non-existent ID resolves to a plain 404", resolveMissing.status === 404, `status=${resolveMissing.status}`);

  const availableExisting = await call("GET", `/api/users/available?symbolId=${encodeURIComponent(payee.id)}`);
  check("availability of an existing ID: available=false", availableExisting.body?.available === false);
  check("and it no longer carries `exists` as a second name for the same fact",
    availableExisting.body?.exists === undefined);

  const availableFree = await call("GET", `/api/users/available?symbolId=${encodeURIComponent(symbolId(998))}`);
  check("availability of an unclaimed ID: available=true", availableFree.body?.available === true);

  const availableJunk = await call("GET", `/api/users/available?symbolId=${encodeURIComponent("not-an-id")}`);
  check("and it refuses to answer about anything that is not a Gloobal ID (was: a general existence oracle)",
    availableJunk.status === 400, `status=${availableJunk.status}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-18. the transaction reference is minted by the server");

  const forgedReference = SYMBOLS.map((s) => s).join("").repeat(3).slice(0, 20);
  const sender = await seedAccount({ seed: 40, mobileNumber: "+919000000140", balance: 50000 });
  const receiver = await seedAccount({ seed: 41, mobileNumber: "+919000000141", balance: 0 });

  const forged = await call("POST", "/api/transactions/send", {
    token: sender.token,
    body: {
      senderSymbolId: sender.id, receiverSymbolId: receiver.id,
      amount: 100, pin: PIN, note: "first",
      referenceId: forgedReference, transactionId: forgedReference
    }
  });
  check("the payment goes through", forged.status === 201, `status=${forged.status} ${forged.body?.message || ""}`);
  check("but the reference the client asked for is not the one it got (was: client-chosen identity)",
    forged.body?.transaction?.referenceId !== forgedReference,
    `asked=${forgedReference} got=${forged.body?.transaction?.referenceId}`);

  const secondForged = await call("POST", "/api/transactions/send", {
    token: sender.token,
    body: {
      senderSymbolId: sender.id, receiverSymbolId: receiver.id,
      amount: 100, pin: PIN, note: "second",
      referenceId: forged.body?.transaction?.referenceId
    }
  });
  check("and replaying a reference that already exists cannot collide the payment",
    secondForged.status === 201 &&
    secondForged.body?.transaction?.referenceId !== forged.body?.transaction?.referenceId,
    `status=${secondForged.status}`);

  // Idempotency — the mechanism that legitimately deduplicates a retry — is
  // untouched by that change.
  const idemKey = "hardening-test-idem-1";
  const first = await call("POST", "/api/transactions/send", {
    token: sender.token,
    body: { senderSymbolId: sender.id, receiverSymbolId: receiver.id, amount: 50, pin: PIN, note: "idem", idempotencyKey: idemKey }
  });
  const retry = await call("POST", "/api/transactions/send", {
    token: sender.token,
    body: { senderSymbolId: sender.id, receiverSymbolId: receiver.id, amount: 50, pin: PIN, note: "idem", idempotencyKey: idemKey }
  });
  check("a retried payment with the same idempotencyKey is still deduplicated",
    first.status === 201 && retry.status === 200 && retry.body?.duplicate === true &&
    retry.body?.transaction?.referenceId === first.body?.transaction?.referenceId,
    `first=${first.status} retry=${retry.status} duplicate=${retry.body?.duplicate}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-19. zero-decimal currencies never receive a fraction");

  const zeroDecimal = [
    { seed: 50, iso: "JP", currency: "JPY", mobile: "+819000000150" },
    { seed: 51, iso: "KR", currency: "KRW", mobile: "+829000000151" },
    { seed: 52, iso: "VN", currency: "VND", mobile: "+849000000152" },
    { seed: 53, iso: "CL", currency: "CLP", mobile: "+569000000153" }
  ];

  for (const { seed, iso, currency, mobile } of zeroDecimal) {
    const account = await seedAccount({ seed, mobileNumber: mobile, countryIso: iso, balance: 100000 });

    const fractional = await call("POST", "/api/coin/mint", {
      token: account.token, body: { symbolId: account.id, amount: 100.55 }
    });
    check(`${currency}: minting 100.55 is refused, not silently rounded (was: 100.55 ${currency} debited)`,
      fractional.status === 400 && /decimal/i.test(fractional.body?.message || ""),
      `status=${fractional.status} ${fractional.body?.message || ""}`);

    const whole = await call("POST", "/api/coin/mint", {
      token: account.token, body: { symbolId: account.id, amount: 100 }
    });
    check(`${currency}: a whole amount still mints`, whole.status === 200,
      `status=${whole.status} ${whole.body?.message || ""}`);
    check(`${currency}: the resulting balance is a whole number`,
      Number.isInteger(whole.body?.balance), `balance=${whole.body?.balance}`);

    const redeemFraction = await call("POST", "/api/coin/redeem", {
      token: account.token, body: { symbolId: account.id, amount: 10.25 }
    });
    check(`${currency}: redeeming a fraction is refused too`,
      redeemFraction.status === 400 && /decimal/i.test(redeemFraction.body?.message || ""),
      `status=${redeemFraction.status}`);

    const geuFraction = await call("POST", "/api/geu/entry", {
      token: account.token,
      body: { symbolId: account.id, amount: 100.55, idempotencyKey: `geu-${currency}-frac` }
    });
    check(`${currency}: a fractional GEU entry is refused`,
      geuFraction.status === 400 && /decimal/i.test(geuFraction.body?.message || ""),
      `status=${geuFraction.status} ${geuFraction.body?.message || ""}`);

    // Note on what is NOT asserted here: the coin routes still LABEL their
    // fiat leg with CoinReserve.reserveCurrency, which is hardcoded 'INR'
    // regardless of whose balance actually moved. That mislabelling is
    // GLB-04 and is deliberately untouched by this pass — so these lines are
    // searched by account, not by currency code. What this pass fixed is the
    // PRECISION, and that is what is checked: nothing this account holds or
    // records carries a fraction its currency cannot express.
    const lines = await LedgerEntry.find({ userId: account.user._id }).lean();
    check(`${currency}: every ledger line for this account is a whole number`,
      lines.length > 0 && lines.every((line) =>
        Number.isInteger(line.amount) && Number.isInteger(line.balanceBefore) && Number.isInteger(line.balanceAfter)),
      `lines=${lines.length} ${JSON.stringify(lines.map((l) => [l.currency, l.amount, l.balanceAfter]))}`);

    const stored = await User.findById(account.user._id).select("balance coinBalance").lean();
    check(`${currency}: the stored balance carries no fraction of a unit that does not exist`,
      Number.isInteger(stored.balance), `balance=${stored.balance}`);
  }

  // A two-decimal currency is completely unaffected by all of that.
  const inrAccount = await seedAccount({ seed: 59, mobileNumber: "+919000000159", balance: 100000 });
  const inrMint = await call("POST", "/api/coin/mint", {
    token: inrAccount.token, body: { symbolId: inrAccount.id, amount: 100.55 }
  });
  check("INR: 100.55 still mints exactly as before — nothing was tightened for two-decimal currencies",
    inrMint.status === 200 && inrMint.body?.minted === 100.55,
    `status=${inrMint.status} minted=${inrMint.body?.minted}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-22. a pool cannot be opened under a currency pair that means nothing");

  const badPairs = [
    ["a pool settling a currency with itself", () => CountryCurrencyPool.loadOrCreate("IN", "INR", "INR")],
    ["an unresolved (undefined) counter currency", () => CountryCurrencyPool.loadOrCreate("IN", undefined, "INR")],
    ["an empty local currency", () => CountryCurrencyPool.loadOrCreate("IN", "USD", "")],
    ["a country code that is not a country", () => CountryCurrencyPool.loadOrCreate("XXX", "USD", "INR")]
  ];

  for (const [label, attempt] of badPairs) {
    let threw = false;
    try { await attempt(); } catch { threw = true; }
    check(`refuses to seed ${label} (was: five million units of an invented denomination)`, threw);
  }

  const beforeBadPools = await CountryCurrencyPool.countDocuments({});
  const goodPool = await CountryCurrencyPool.loadOrCreate("IN", "USD", "INR");
  check("a real pair still opens, with its documented prototype float",
    goodPool.availableBalance === CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE,
    `available=${goodPool.availableBalance}`);
  check("and no row was created by any of the refused pairs",
    (await CountryCurrencyPool.countDocuments({})) === beforeBadPools + 1);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-15. two concurrent settlements cannot overdraw a corridor");

  await CountryCurrencyPool.deleteMany({});
  await ExchangeRate.deleteMany({});

  const USD_IN_INR = 85;
  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: USD_IN_INR, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: 1 / USD_IN_INR, source: "test-seed", fetchedAt: new Date() }
  ]);

  const usSender = await seedAccount({ seed: 60, mobileNumber: "+19000000160", countryIso: "US", balance: 100000 });
  const inPayee = await seedAccount({ seed: 61, mobileNumber: "+919000000161", countryIso: "IN", balance: 0 });

  // Each payment releases 8,500 INR (100 USD). The corridor is given enough
  // for exactly one of them.
  const releasePerPayment = 100 * USD_IN_INR;
  await CountryCurrencyPool.loadOrCreate("IN", "USD", "INR");
  await CountryCurrencyPool.loadOrCreate("US", "INR", "USD");
  await CountryCurrencyPool.updateOne(
    { countryIso: "IN", counterCurrency: "USD" },
    { $set: { availableBalance: releasePerPayment, totalBalance: releasePerPayment } }
  );

  const sendCrossBorder = (note) => call("POST", "/api/transactions/send", {
    token: usSender.token,
    body: {
      senderSymbolId: usSender.id, receiverSymbolId: inPayee.id,
      amountBasis: "source", sourceAmount: 100, pin: PIN, note
    }
  });

  const [raceA, raceB] = await Promise.all([sendCrossBorder("race-a"), sendCrossBorder("race-b")]);
  const succeeded = [raceA, raceB].filter((r) => r.status === 201).length;

  const drained = await CountryCurrencyPool.findOne({ countryIso: "IN", counterCurrency: "USD" }).lean();
  check("the corridor is never driven negative (was: read-then-write, both sides passed)",
    drained.availableBalance >= 0 && drained.totalBalance >= 0,
    `available=${drained.availableBalance} total=${drained.totalBalance}`);
  check("only the payments the corridor could actually fund went through",
    succeeded === 1, `succeeded=${succeeded} a=${raceA.status} b=${raceB.status}`);
  check("the refused one is reported as a liquidity problem, and moved no money",
    [raceA, raceB].some((r) => r.status === 503),
    `a=${raceA.status} b=${raceB.status}`);

  const senderNow = await User.findById(usSender.user._id).select("balance").lean();
  check("the refused payment left the sender's balance alone",
    senderNow.balance === 100000 - 100, `balance=${senderNow.balance}`);

  const settlements = await Settlement.countDocuments({ status: "settled" });
  check("exactly one settlement was written", settlements === 1, `settlements=${settlements}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-25. a WebAuthn challenge expires and is single-use");

  const passkeyUser = await seedAccount({ seed: 70, mobileNumber: "+919000000170" });

  const options = await call("POST", "/api/passkey/register/options", {
    token: passkeyUser.token, body: { symbolId: passkeyUser.id }, origin: "https://gloobalv3.netlify.app"
  });
  check("registration options are issued", options.status === 200 && Boolean(options.body?.challenge),
    `status=${options.status}`);

  const stamped = await User.findById(passkeyUser.user._id).select("currentChallenge currentChallengeExpiresAt").lean();
  const ttlMs = stamped.currentChallengeExpiresAt
    ? new Date(stamped.currentChallengeExpiresAt).getTime() - Date.now()
    : 0;
  check("the challenge is stored with an expiry a few minutes out (was: no expiry at all)",
    ttlMs > 60_000 && ttlMs <= 5 * 60_000, `ttlMs=${ttlMs}`);

  // A LIVE challenge is handed to the WebAuthn library. The garbage response
  // below cannot verify, of course — the point is that it fails for that
  // reason and NOT with challengeExpired, which is what proves a fresh
  // challenge is still accepted.
  const garbageResponse = { id: "nope", rawId: "nope", type: "public-key", response: {}, clientExtensionResults: {} };
  const liveAttempt = await call("POST", "/api/passkey/register/verify", {
    token: passkeyUser.token, body: { symbolId: passkeyUser.id, response: garbageResponse },
    origin: "https://gloobalv3.netlify.app"
  });
  check("a live challenge reaches verification rather than being rejected as expired",
    liveAttempt.body?.challengeExpired !== true,
    `status=${liveAttempt.status} ${liveAttempt.body?.message || ""}`);

  // REUSE. That attempt consumed the challenge, pass or fail.
  const reuse = await call("POST", "/api/passkey/register/verify", {
    token: passkeyUser.token, body: { symbolId: passkeyUser.id, response: garbageResponse },
    origin: "https://gloobalv3.netlify.app"
  });
  check("the same challenge cannot be presented twice (was: reusable until a success)",
    reuse.status === 400, `status=${reuse.status} ${reuse.body?.message || ""}`);
  const afterReuse = await User.findById(passkeyUser.user._id).select("currentChallenge").lean();
  check("and nothing is left stored to replay against", afterReuse.currentChallenge === null,
    `currentChallenge=${afterReuse.currentChallenge}`);

  // EXPIRY.
  const reissued = await call("POST", "/api/passkey/register/options", {
    token: passkeyUser.token, body: { symbolId: passkeyUser.id }, origin: "https://gloobalv3.netlify.app"
  });
  check("a fresh ceremony can be started", reissued.status === 200);
  await User.updateOne(
    { _id: passkeyUser.user._id },
    { $set: { currentChallengeExpiresAt: new Date(Date.now() - 1000) } }
  );
  const expired = await call("POST", "/api/passkey/register/verify", {
    token: passkeyUser.token, body: { symbolId: passkeyUser.id, response: garbageResponse },
    origin: "https://gloobalv3.netlify.app"
  });
  check("an expired challenge is refused as expired (was: valid forever)",
    expired.status === 400 && expired.body?.challengeExpired === true,
    `status=${expired.status} ${expired.body?.message || ""}`);

  // The same rules on the authentication side.
  await User.updateOne(
    { _id: passkeyUser.user._id },
    { $set: { passkeys: [{ id: "test-credential", publicKey: Buffer.from("x"), counter: 0, transports: [] }] } }
  );
  const authOptions = await call("POST", "/api/passkey/auth/options", {
    body: { symbolId: passkeyUser.id }, origin: "https://gloobalv3.netlify.app"
  });
  check("authentication options are issued", authOptions.status === 200, `status=${authOptions.status}`);
  await User.updateOne(
    { _id: passkeyUser.user._id },
    { $set: { currentChallengeExpiresAt: new Date(Date.now() - 1000) } }
  );
  const expiredAuth = await call("POST", "/api/passkey/auth/verify", {
    body: { symbolId: passkeyUser.id, response: { ...garbageResponse, id: "test-credential" } },
    origin: "https://gloobalv3.netlify.app"
  });
  check("an expired sign-in challenge is refused too",
    expiredAuth.status === 400 && expiredAuth.body?.challengeExpired === true,
    `status=${expiredAuth.status} ${expiredAuth.body?.message || ""}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log("\nGLB-21. the API sends the headers a JSON-only surface should");

  const headerProbe = await call("GET", "/api/stats");
  check("Content-Security-Policy is set and allows nothing",
    /default-src 'none'/.test(headerProbe.headers.get("content-security-policy") || ""),
    headerProbe.headers.get("content-security-policy") || "(absent)");
  check("Permissions-Policy denies the powerful features outright",
    /camera=\(\)/.test(headerProbe.headers.get("permissions-policy") || ""),
    headerProbe.headers.get("permissions-policy") || "(absent)");
  check("X-Powered-By is not advertised", headerProbe.headers.get("x-powered-by") === null);

  // ──────────────────────────────────────────────────────────────────────
  console.log("RECEIPT. a transaction records who its two parties were");

  const rcPayer = await seedAccount({ seed: 80, mobileNumber: "+919000000180", countryIso: "IN", balance: 50000, fullName: "Payer Person" });
  const rcPayee = await seedAccount({ seed: 81, mobileNumber: "+449000000181", countryIso: "GB", balance: 0, fullName: "Payee Person" });
  await User.updateOne({ _id: rcPayee.user._id }, { $set: { cashbackRate: 0.01 } });
  await ExchangeRate.deleteMany({});
  await ExchangeRate.create([
    { fromCurrency: "GBP", toCurrency: "INR", rate: 105, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "GBP", rate: 1 / 105, source: "test-seed", fetchedAt: new Date() }
  ]);
  await CountryCurrencyPool.deleteMany({});

  const rcPaid = await call("POST", "/api/transactions/send", {
    token: rcPayer.token,
    body: {
      senderSymbolId: rcPayer.id, receiverSymbolId: rcPayee.id,
      amountBasis: "destination", destinationAmount: 100, pin: PIN, note: "receipt-parties"
    }
  });
  check("the cross-border payment goes through", rcPaid.status === 201,
    `status=${rcPaid.status} ${rcPaid.body?.message || ""}`);

  const rcStored = await Transaction.findOne({ referenceId: rcPaid.body?.transaction?.referenceId }).lean();
  const rcParties = rcStored?.metadata?.parties;
  check("the row records BOTH parties, not just their account ids",
    Boolean(rcParties?.sender?.symbolId && rcParties?.receiver?.symbolId),
    JSON.stringify(rcParties));
  check("each side carries the country a flag is drawn from (was: absent entirely)",
    rcParties?.sender?.countryIso === "IN" && rcParties?.receiver?.countryIso === "GB",
    `sender=${rcParties?.sender?.countryIso} receiver=${rcParties?.receiver?.countryIso}`);
  check("and the Creator Share the receipt's share tab is built from",
    Number(rcStored?.metadata?.cashbackRate) === 0.01 && Number(rcStored?.metadata?.cashback) > 0,
    `rate=${rcStored?.metadata?.cashbackRate} cashback=${rcStored?.metadata?.cashback}`);

  // The projection, from each side. This is the assertion that fails if the
  // two are ever reversed.
  const payerHistory = await call("GET", `/api/transactions/history/${encodeURIComponent(rcPayer.id)}`, { token: rcPayer.token });
  const payerRow = (payerHistory.body?.transactions || [])[0];
  check("the PAYER's row is 'sent' and its counterparty is the rcPayee",
    payerRow?.direction === "sent" &&
    payerRow?.counterparty?.symbolId === rcPayee.id &&
    payerRow?.counterparty?.countryIso === "GB",
    JSON.stringify(payerRow?.counterparty));

  const payeeHistory = await call("GET", `/api/transactions/history/${encodeURIComponent(rcPayee.id)}`, { token: rcPayee.token });
  const payeeRow = (payeeHistory.body?.transactions || [])[0];
  check("the PAYEE's row is 'received' and its counterparty is the rcPayer",
    payeeRow?.direction === "received" &&
    payeeRow?.counterparty?.symbolId === rcPayer.id &&
    payeeRow?.counterparty?.countryIso === "IN",
    JSON.stringify(payeeRow?.counterparty));
  check("neither side is ever handed its own identity as the counterparty",
    payerRow?.counterparty?.symbolId !== rcPayer.id && payeeRow?.counterparty?.symbolId !== rcPayee.id);
  check("the share leg's own reference reaches the receipt's share tab",
    typeof payerRow?.shareReferenceId === "string" && payerRow.shareReferenceId.length > 0,
    `shareReferenceId=${payerRow?.shareReferenceId}`);

  // IMMUTABILITY. The rcPayee renames, and the historical receipt must not move.
  const rcRenamedTo = symbolId(82);
  const rcRenamed = await call("PATCH", "/api/profile/change-symbol-id", {
    token: rcPayee.token, body: { currentSymbolId: rcPayee.id, newSymbolId: rcRenamedTo }
  });
  check("the payee can rename", rcRenamed.status === 200, `status=${rcRenamed.status}`);

  const rcAfterRename = await call("GET", `/api/transactions/history/${encodeURIComponent(rcPayer.id)}`, { token: rcPayer.token });
  const rcFrozenRow = (rcAfterRename.body?.transactions || [])[0];
  check("the old receipt still names the payee as they were AT THE TIME (was: rewritten by a live join)",
    rcFrozenRow?.counterparty?.symbolId === rcPayee.id,
    `now=${rcFrozenRow?.counterparty?.symbolId} then=${rcPayee.id}`);
  check("and marks that identity as a recorded snapshot, not a live read",
    rcFrozenRow?.counterparty?.fromSnapshot === true);


  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error);
} finally {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error("cleanup error:", error.message);
  }
  process.exit(exitCode);
}
