// Security fixes from the 31 October audit (patch 0176), against a real
// throwaway database.
//
//   node tests/security-0176.test.mjs
//
// Each section is one audit finding turned round: the audit proved the attack
// worked; these prove it no longer does, and that the normal path still works.
//
//   F-02  a payment cannot name a different payer from the signed-in account
//   F-05  parallel wrong PINs cannot all be checked; the lock holds
//   F-06  per-account limits hold whatever X-Forwarded-For says
//   F-07  a session token alone cannot replace an existing PIN
//   F-30  changing the GLOOBAL ID needs a PIN or device check just made
//   reset at most 3 PIN resets a day, and every reset leaves an alert
//
// The one-time code stays the fixed test value 123456 on purpose: these
// fixes do not depend on a real SMS provider.

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

const TEST_DB = "gloobal_security_0176_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5236";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// One proxy in front, as on a host like Render: the right-most
// X-Forwarded-For entry is the one that proxy wrote, so the tests write
// "<anything the caller forged>, <real address>".
process.env.TRUST_PROXY_HOPS = "1";
delete process.env.RENDER;

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Notification = require(join(BACKEND, "models/Notification"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "246813";

let currentIp = "198.51.100.1";
const call = async (method, path, { body, token, headers: extra, ip } = {}) => {
  const headers = { "X-Forwarded-For": ip || currentIp, ...(extra || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
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

async function register(seed, mobileNumber, fullName) {
  const id = symbolId(seed);
  // Each test person on their own address, as real people are.
  currentIp = `198.51.${Math.floor(seed / 250) % 250}.${(seed % 250) + 1}`;
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName, mobileNumber, symbolId: id },
  });
  const token = registered.body?.token;
  if (!token) throw new Error(`could not register ${fullName}: ${JSON.stringify(registered.body)}`);
  const set = await call("POST", "/api/pin/set", { body: { symbolId: id, pin: PIN }, token });
  if (set.status !== 200) throw new Error(`could not set PIN for ${fullName}: ${set.status}`);
  return { id, mobileNumber, token };
}

const balanceOf = async (account) => (await User.findOne({ symbolId: account.id }).lean()).balance;

async function resetPin(account, newPin) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: account.mobileNumber, purpose: "pin_reset" } });
  await call("POST", "/api/otp/verify", {
    body: { mobileNumber: account.mobileNumber, otp: "123456", purpose: "pin_reset" },
  });
  return call("POST", "/api/pin/reset", {
    body: { symbolId: account.id, mobileNumber: account.mobileNumber, newPin },
  });
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  // ── F-02 ────────────────────────────────────────────────────────────────
  console.log("F-02 · the payer is always the signed-in account");
  {
    const attacker = await register(2001, "+919000002001", "Attacker One");
    const victim = await register(2002, "+919000002002", "Victim One");
    const before = await balanceOf(victim);

    // The audit's exact request: own ID in the query, victim's in the body.
    const forged = await call(
      "POST",
      `/api/transactions/send?senderSymbolId=${encodeURIComponent(attacker.id)}`,
      {
        token: attacker.token,
        body: { symbolId: victim.id, receiverSymbolId: attacker.id, amount: 77, pin: PIN },
      }
    );
    check("own ID in the query, victim's in the body → refused", forged.status === 403, `status ${forged.status}`);

    const viaBody = await call("POST", "/api/transactions/send", {
      token: attacker.token,
      body: { senderSymbolId: attacker.id, symbolId: victim.id, receiverSymbolId: attacker.id, amount: 77, pin: PIN },
    });
    check("two different payers in one body → refused", viaBody.status === 403, `status ${viaBody.status}`);
    check("the victim's balance did not move", (await balanceOf(victim)) === before);

    const honest = await call("POST", "/api/transactions/send", {
      token: attacker.token,
      body: { senderSymbolId: attacker.id, receiverSymbolId: victim.id, amount: 50, pin: PIN, idempotencyKey: "f02-honest-1" },
    });
    check("an ordinary payment from your own account still works", honest.status === 201, `status ${honest.status}`);
  }

  // ── F-05 ────────────────────────────────────────────────────────────────
  console.log("\nF-05 · parallel wrong PINs");
  {
    const target = await register(2101, "+919000002101", "Target Lock");
    const guesses = Array.from({ length: 12 }, (_, i) => String(100000 + i));
    const results = await Promise.all(
      guesses.map((pin) => call("POST", "/api/pin/verify", { body: { symbolId: target.id, pin } }))
    );
    const checked = results.filter((r) => r.status === 401).length;
    const locked = results.filter((r) => r.status === 423).length;
    check("at most 5 of 12 parallel guesses were checked", checked <= 5, `${checked} checked, ${locked} locked`);
    check("the rest were refused as locked", locked === 12 - checked, `${locked} locked`);

    const right = await call("POST", "/api/pin/verify", { body: { symbolId: target.id, pin: PIN } });
    check("even the right PIN waits out the lock", right.status === 423, `status ${right.status}`);

    // Back to normal once the lock has passed.
    await Pin.updateOne(
      { userId: (await User.findOne({ symbolId: target.id }))._id },
      { $set: { lockedUntil: new Date(Date.now() - 1000) } }
    );
    const after = await call("POST", "/api/pin/verify", { body: { symbolId: target.id, pin: PIN } });
    check("after the lock, the right PIN works", after.status === 200, `status ${after.status}`);
    const record = await Pin.findOne({ userId: (await User.findOne({ symbolId: target.id }))._id }).lean();
    check("and the attempt count is back to 0", record.failedAttempts === 0, String(record.failedAttempts));

    const one = await call("POST", "/api/pin/verify", { body: { symbolId: target.id, pin: "999999" } });
    check("one wrong PIN says 4 attempts left", one.body?.attemptsRemaining === 4, JSON.stringify(one.body?.attemptsRemaining));
  }

  // ── F-06 ────────────────────────────────────────────────────────────────
  console.log("\nF-06 · limits count the real address, and each account");
  {
    // Forging the left of the header, from one real address, with a new
    // number each time: the per-address limit (12 in 5 minutes) still bites.
    const forged = [];
    for (let i = 0; i < 14; i += 1) {
      const r = await call("POST", "/api/otp/send", {
        body: { mobileNumber: `+9190000031${String(i).padStart(2, "0")}`, purpose: "registration" },
        ip: `203.0.113.${i + 1}, 192.0.2.50`,
      });
      forged.push(r.status);
    }
    const firstForged = forged.indexOf(429);
    check("a forged X-Forwarded-For does not reset the per-address limit",
      firstForged === 12, `first 429 at request ${firstForged + 1}`);

    // Many REAL addresses at one number (a botnet): the per-account limit
    // (10 in 5 minutes) still bites.
    const spread = [];
    for (let i = 0; i < 13; i += 1) {
      const r = await call("POST", "/api/otp/send", {
        body: { mobileNumber: "+919000002201", purpose: "registration" },
        ip: `192.0.2.${100 + i}`,
      });
      spread.push(r.status);
    }
    const firstSpread = spread.indexOf(429);
    check("many addresses at one account still hit the per-account limit",
      firstSpread === 10, `first 429 at request ${firstSpread + 1}`);
  }

  // ── F-07 ────────────────────────────────────────────────────────────────
  console.log("\nF-07 · a session token alone cannot replace a PIN");
  {
    const owner = await register(2301, "+919000002301", "Owner Seven");
    const second = await call("POST", "/api/login", { body: { symbolId: owner.id, pin: PIN } });
    const other = second.body?.token;

    const overwrite = await call("POST", "/api/pin/set", { token: owner.token, body: { symbolId: owner.id, pin: "111222" } });
    check("pin/set on an account that has a PIN → refused", overwrite.status === 409, `status ${overwrite.status}`);

    const oldStillWorks = await call("POST", "/api/login", { body: { symbolId: owner.id, pin: PIN } });
    check("the original PIN still logs in", oldStillWorks.status === 200, `status ${oldStillWorks.status}`);
    const alive = await call("GET", `/api/profile/${encodeURIComponent(owner.id)}`, { token: other });
    check("and nothing was signed out", alive.status === 200, `status ${alive.status}`);
  }

  // ── F-30 ────────────────────────────────────────────────────────────────
  console.log("\nF-30 · changing the GLOOBAL ID needs a check just made");
  {
    const renamer = await register(2401, "+919000002401", "Renamer Thirty");
    const userId = (await User.findOne({ symbolId: renamer.id }))._id;
    await Pin.updateOne({ userId }, { $set: { lastVerifiedAt: new Date(Date.now() - 60 * 60 * 1000) } });

    const newId = symbolId(2402);
    const stale = await call("PATCH", "/api/profile/change-symbol-id", {
      token: renamer.token,
      body: { currentSymbolId: renamer.id, newSymbolId: newId },
    });
    check("with no recent PIN or device check → refused", stale.status === 403 && stale.body?.code === "recent_check_required",
      `status ${stale.status}`);

    const verified = await call("POST", "/api/pin/verify", { body: { symbolId: renamer.id, pin: PIN } });
    check("the PIN check the app shows first succeeds", verified.status === 200, `status ${verified.status}`);
    const fresh = await call("PATCH", "/api/profile/change-symbol-id", {
      token: verified.body?.token || renamer.token,
      body: { currentSymbolId: renamer.id, newSymbolId: newId },
    });
    check("right after it, the change goes through", fresh.status === 200, `status ${fresh.status}`);
  }

  // ── PIN reset: 3 a day, with an alert ──────────────────────────────────
  console.log("\nPIN reset · at most 3 a day, each one announced");
  {
    const person = await register(2501, "+919000002501", "Reset Person");
    const codes = [];
    for (const pin of ["135791", "246802", "357913", "468024"]) {
      codes.push((await resetPin(person, pin)).status);
    }
    check("the first three resets succeed", codes.slice(0, 3).every((s) => s === 200), codes.join(","));
    check("the fourth in 24 hours is refused", codes[3] === 429, codes.join(","));

    const userId = (await User.findOne({ symbolId: person.id }))._id;
    const login = await call("POST", "/api/login", { body: { symbolId: person.id, pin: "357913" } });
    check("the PIN from the third reset is the one that works", login.status === 200, `status ${login.status}`);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const alerts = await Notification.countDocuments({ userId, type: "security", "metadata.event": "pin_reset" });
    check("each successful reset left a security alert", alerts === 3, `${alerts} alerts`);

    // A day later the oldest has aged out and a reset is allowed again.
    const user = await User.findById(userId).lean();
    const aged = user.pinResetTimes.map((t, i) => (i === 2 ? new Date(Date.now() - 25 * 60 * 60 * 1000) : t));
    await User.updateOne({ _id: userId }, { $set: { pinResetTimes: aged } });
    const later = await resetPin(person, "579135");
    check("once the oldest reset is a day old, a reset works again", later.status === 200, `status ${later.status}`);
  }

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
}

run()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
        await mongoose.connection.db.dropDatabase();
      }
      await mongoose.disconnect();
    } catch {
      /* best effort */
    }
    process.exit(failures === 0 ? 0 : 1);
  });
