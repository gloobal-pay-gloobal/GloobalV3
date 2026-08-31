// tests/browser-harness.mjs
//
// The rig the browser tests run on: build the real bundle, serve it over
// http, put a controllable fake of the Gloobal API behind it, and hand back
// a page that is already signed in.
//
// Why http rather than the file:// that render.test.mjs uses. That suite
// only asks "did the app boot", and file:// is enough for that. Everything
// here needs an ORIGIN: localStorage is partitioned by it (the session blob
// and the permission flags live there), and Playwright grants permissions
// per origin — `grantPermissions(["geolocation"], { origin })` has nothing
// to attach to when the origin is the literal string "null". So this serves
// the built page from a throwaway localhost server instead.
//
// Why the API is faked. These tests assert what a person SEES, and the
// number on the screen is only meaningful next to the number the server
// said. A fake lets the test state both halves and compare them, and lets
// a corridor be chosen rather than waited for. The real server keeps its
// own exhaustive coverage in server/tests — this is not a substitute for
// it, and never asserts arithmetic the server owns. It also means no test
// run writes a row to the production database, which running these against
// https://gloobal-pay.onrender.com would.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ROOT } from "./harness.mjs";

const PREVIEW = path.join(ROOT, "gloobal-essentials-preview");

// Re-exported so the suites can read repo files (netlify.toml) without
// importing two harnesses.
export const ROOT_DIR = ROOT;
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || "";

// The base the bundle talks to when VITE_API_URL is unset, which is the
// case for an esbuild bundle built outside Vite. Every route below is
// registered against it.
export const API_ORIGIN = "https://gloobal-pay.onrender.com";

let built = null;

// Build once per process. Six suites each re-running esbuild and
// build_app.mjs would triple the runtime for an identical artifact.
export async function buildOnce() {
  if (built) return built;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-browser-"));
  execFileSync(process.execPath, [path.join(ROOT, "build_app.mjs")], { cwd: ROOT });

  const entry = path.join(PREVIEW, "src", "__browser_entry.jsx");
  fs.writeFileSync(
    entry,
    `import React from "react";
     import ReactDOM from "react-dom/client";
     import GloobalArtifactRoot from "./GloobalApp.jsx";
     ReactDOM.createRoot(document.getElementById("root")).render(<GloobalArtifactRoot />);`
  );
  try {
    const esbuildEntry = createRequire(path.join(PREVIEW, "package.json")).resolve("esbuild");
    const esbuild = (await import(pathToFileURL(esbuildEntry).href)).default;
    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      jsx: "automatic",
      outfile: path.join(tmp, "app.js"),
      absWorkingDir: PREVIEW,
      define: { "process.env.NODE_ENV": '"development"' }
    });
  } finally {
    fs.rmSync(entry, { force: true });
  }

  // No StrictMode here, unlike render.test.mjs. StrictMode double-invokes
  // effects in development, which for this app means every mount-time fetch
  // fires twice — harmless for "did it boot", but it doubles the request
  // log these tests assert on.
  fs.writeFileSync(
    path.join(tmp, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>Gloobal</title></head>' +
      '<body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>'
  );

  const server = http.createServer((req, res) => {
    const file = req.url === "/" || req.url.startsWith("/?") ? "index.html" : req.url.replace(/^\//, "").split("?")[0];
    const full = path.join(tmp, file);
    if (!full.startsWith(tmp) || !fs.existsSync(full)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8"
    });
    res.end(fs.readFileSync(full));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  } catch (err) {
    throw new Error(
      "Could not launch Chromium. On a fresh checkout run:  npx playwright install chromium. " +
        "Original error: " + (err && err.message)
    );
  }

  built = { tmp, server, origin, browser };
  return built;
}

export async function teardown() {
  if (!built) return;
  await built.browser.close();
  await new Promise((resolve) => built.server.close(resolve));
  fs.rmSync(built.tmp, { recursive: true, force: true });
  built = null;
}

// ---------------------------------------------------------------------------
// The fake backend
// ---------------------------------------------------------------------------

// Two accounts in different currencies, so nothing can pass by assuming
// India. Balances differ enough that one showing where the other belongs is
// unmissable.
export const ACCOUNTS = {
  india: {
    symbolId: "−−−−−−−−−−−−",
    fullName: "Asha Raman",
    mobileNumber: "919000000001",
    country: "IN",
    countryIso: "IN",
    currency: "INR",
    balance: 10000,
    pin: "123456"
  },
  japan: {
    symbolId: "○○○○○○○○○○○○",
    fullName: "Kenji Sato",
    mobileNumber: "819000000002",
    country: "JP",
    countryIso: "JP",
    currency: "JPY",
    balance: 750000,
    pin: "432156"
  },
  britain: {
    symbolId: "■■■■■■■■■■■■",
    fullName: "Tom Whitfield",
    mobileNumber: "449000000003",
    country: "GB",
    countryIso: "GB",
    currency: "GBP",
    balance: 4200,
    pin: "111222"
  },
  // A second Indian account, so a same-currency payment can be walked
  // without any FX in the way. That matters for the founder's "sent 5000,
  // received 1000" report: with sender and receiver both in INR the
  // conversion is exactly 1, so any discrepancy has nowhere to hide.
  india2: {
    symbolId: "++++++++++++",
    fullName: "Ravi Menon",
    mobileNumber: "919000000005",
    country: "IN",
    countryIso: "IN",
    currency: "INR",
    balance: 2500,
    pin: "345678"
  },
  america: {
    symbolId: "●●●●●●●●●●●●",
    fullName: "Dana Brooks",
    mobileNumber: "19000000006",
    country: "US",
    countryIso: "US",
    currency: "USD",
    balance: 900,
    pin: "456789"
  },
  // Balance headroom for the ceiling tests: the cap is 5,000,000 of the
  // sender's own currency, so proving it needs an account that could
  // otherwise afford the payment.
  treasury: {
    symbolId: "□□□□□□□□□□□□",
    fullName: "Meera Iyer",
    mobileNumber: "919000000007",
    country: "IN",
    countryIso: "IN",
    currency: "INR",
    balance: 20000000,
    pin: "567890"
  },
  mexico: {
    symbolId: "××××××××××××",
    fullName: "Lucia Ortiz",
    mobileNumber: "529000000004",
    country: "MX",
    countryIso: "MX",
    currency: "MXN",
    balance: 25000,
    pin: "222333"
  }
};

// Deliberately round, made-up rates. The point of a test rate is that the
// expected number can be written down, not that it matches a market.
const RATE = {
  // Around the real corridor, and the one the founder's worked example uses:
  // 5,000 INR should land as roughly 52-54 USD.
  "INR:USD": 1 / 95,
  "USD:INR": 95,
  "USD:JPY": 155,
  "JPY:USD": 1 / 155,
  "GBP:USD": 1.27,
  "USD:GBP": 1 / 1.27,
  "MXN:USD": 0.05,
  "USD:MXN": 20,
  "INR:JPY": 1.8,
  "JPY:INR": 0.5556,
  "INR:GBP": 0.0095,
  "GBP:INR": 105.26,
  "INR:MXN": 0.2,
  "MXN:INR": 5,
  "GBP:JPY": 189.5,
  "JPY:GBP": 0.00528,
  "MXN:JPY": 9,
  "JPY:MXN": 0.1111,
  "GBP:MXN": 22,
  "MXN:GBP": 0.0455,
  "INR:INR": 1
};

// The sixteen zero-decimal currencies matter here for one reason: a UI that
// prints ¥1,234.00 has misunderstood the money it is showing.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF", "XPF", "BIF", "DJF", "GNF", "KMF", "MGA", "PYG", "RWF", "UGX", "VUV"]);

export function fxRate(from, to) {
  if (from === to) return 1;
  const rate = RATE[`${from}:${to}`];
  if (!rate) throw new Error(`test fixture has no rate for ${from} -> ${to}`);
  return rate;
}

export function convert(amount, from, to) {
  const raw = amount * fxRate(from, to);
  return ZERO_DECIMAL.has(to) ? Math.round(raw) : Number(raw.toFixed(2));
}

// Install the fake API on a context. Returns a log every test can read:
// what the app actually asked the server, in order, with bodies.
export async function installApi(context, options = {}) {
  const accounts = options.accounts || ACCOUNTS;
  const calls = [];
  // `ledger` is every payment this fake has accepted, in the shape the real
  // server stores one: both parties snapshotted at the time, the two sides of
  // the corridor kept apart, and the Creator Share recorded alongside. The
  // history routes below project it per viewer, exactly as server.js does.
  //
  // It used to be absent entirely — both history routes answered with an empty
  // array — which meant no browser test could reach "reopen this payment from
  // history", or "log in as the payee and look at what arrived". Those are the
  // two places the receipt's counterparty identity was actually being lost, so
  // the gap in the fake was also the gap in the coverage.
  const state = { balances: {}, failNextSend: null, ledger: [] };
  for (const account of Object.values(accounts)) state.balances[account.symbolId] = account.balance;

  const byId = (id) => Object.values(accounts).find((a) => a.symbolId === id);
  const byIdentifier = (id) =>
    Object.values(accounts).find((a) => a.symbolId === id || a.mobileNumber === id);

  const publicUser = (account) => ({
    symbolId: account.symbolId,
    fullName: account.fullName,
    mobileNumber: account.mobileNumber,
    country: account.country,
    countryIso: account.countryIso,
    currency: account.currency,
    balance: state.balances[account.symbolId],
    cashbackRate: 0.01,
    createdAt: "2026-01-01T00:00:00.000Z"
  });

  await context.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    let body = null;
    try {
      body = request.postData() ? JSON.parse(request.postData()) : null;
    } catch (e) {
      body = request.postData();
    }
    calls.push({ method: request.method(), path: pathname, query: url.search, body });

    const json = (status, payload) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(payload)
      });

    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        }
      });
    }

    // --- auth ---
    if (pathname === "/api/login") {
      const account = byIdentifier(body && (body.identifier || body.symbolId));
      if (!account || (body && body.pin) !== account.pin) return json(401, { message: "Invalid credentials" });
      // ASCII only, like the real one. The production token is an HMAC over a
      // base64url payload, so it is Latin-1 by construction — and it has to
      // be: `fetch` refuses outright to build a Request whose header value
      // carries a code point above 255. A first draft of this fake minted
      // `test-token-${symbolId}`, which is twelve Gloobal symbols, and every
      // authenticated call in the app died with "String contains non
      // ISO-8859-1 code point" before it reached the network.
      return json(200, { token: `test-token-${account.mobileNumber}`, user: publicUser(account) });
    }
    if (pathname === "/api/pin/verify") {
      // `verified`, not `valid` — GloobalApi.verifyPin throws on anything
      // whose `verified` is falsy, so a fake answering the wrong key leaves
      // every PIN fallback stuck on "Verifying...".
      const account = byIdentifier(body && body.symbolId);
      const verified = Boolean(account && body.pin === account.pin);
      if (!verified) return json(401, { verified: false, message: "That PIN wasn't recognized." });
      return json(200, { verified: true });
    }
    if (pathname.startsWith("/api/passkey/")) return json(200, { registered: false, enrolled: false, credentials: [] });
    if (pathname.startsWith("/api/face/")) return json(200, { enrolled: false });

    // --- identity ---
    if (pathname.startsWith("/api/profile/")) {
      const id = decodeURIComponent(pathname.replace("/api/profile/", ""));
      if (id === "count") return json(200, { count: 85 });
      const account = byId(id);
      if (!account) return json(404, { message: "Not found" });
      return json(200, { user: publicUser(account) });
    }
    if (pathname === "/api/users/resolve") {
      const account = byIdentifier(url.searchParams.get("identifier"));
      if (!account) return json(404, { message: "No user found." });
      return json(200, { user: publicUser(account) });
    }
    // An ID that belongs to somebody is by definition NOT available. Getting
    // this backwards makes the login screen answer "No account found for this
    // Gloobal ID" for an account that exists — which is exactly what it did
    // the first time this fake was written.
    if (pathname === "/api/users/available") {
      const wanted = url.searchParams.get("symbolId") || url.searchParams.get("identifier");
      return json(200, { available: !byIdentifier(wanted) });
    }
    if (pathname === "/api/stats") return json(200, { totalUsers: 85, byCountry: { IN: 61, JP: 4, GB: 3, MX: 1 } });

    // --- money ---
    if (pathname === "/api/transactions/send") {
      if (state.failNextSend) {
        const reason = state.failNextSend;
        state.failNextSend = null;
        return json(400, { message: reason });
      }
      const sender = byId(body.senderSymbolId || body.fromSymbolId);
      const receiver = byIdentifier(body.receiverSymbolId || body.toSymbolId || body.recipient);
      if (!sender || !receiver) return json(404, { message: "Account not found" });

      // Mirrors the real contract: the request names both sides and says
      // which one the person typed, and the server computes the other from
      // its own rates. A fake that guessed the basis would prove nothing.
      const basis =
        body.amountBasis === "destination" || body.amountBasis === "source"
          ? body.amountBasis
          : body.sourceAmount !== undefined
            ? "source"
            : "destination";
      const sourceAmount =
        basis === "source"
          ? Number(body.sourceAmount !== undefined ? body.sourceAmount : body.amount)
          : convert(Number(body.destinationAmount !== undefined ? body.destinationAmount : body.amount), receiver.currency, sender.currency);
      const destinationAmount =
        basis === "source"
          ? convert(sourceAmount, sender.currency, receiver.currency)
          : Number(body.destinationAmount !== undefined ? body.destinationAmount : body.amount);

      // The cap, in the sender's own currency, exactly as the server applies
      // it — so the browser tests can prove the ceiling means the same thing
      // in every corridor.
      const maxPrototypeAmount = options.maxPrototypeAmount || 5000000;
      if (sourceAmount > maxPrototypeAmount) {
        return json(400, {
          success: false,
          message: `Prototype transaction limit is ${maxPrototypeAmount} ${sender.currency}.`,
          limit: maxPrototypeAmount,
          limitCurrency: sender.currency,
          limitBasis: "sender-currency"
        });
      }
      state.balances[sender.symbolId] = Number((state.balances[sender.symbolId] - sourceAmount).toFixed(2));
      state.balances[receiver.symbolId] = Number(
        (state.balances[receiver.symbolId] + destinationAmount).toFixed(2)
      );
      const reference = "■×□×+○●=○○□+−−=−+□□×";
      // Recorded before the response is built, so the very next call to a
      // history route sees it — the same ordering the real server has, where
      // the row is committed inside the payment's own transaction.
      const cashbackRate = receiver.cashbackRate ?? 0.01;
      const cashback = Number((destinationAmount * cashbackRate).toFixed(2));
      const cashbackCredit = Number(convert(cashback, receiver.currency, sender.currency).toFixed(2));
      state.ledger.push({
        id: `txn-${state.ledger.length + 1}`,
        referenceId: reference,
        // Both parties as they stood at payment time — the snapshot
        // metadata.parties holds on the real row.
        sender: {
          symbolId: sender.symbolId,
          fullName: sender.fullName,
          countryIso: sender.countryIso,
          currency: sender.currency
        },
        receiver: {
          symbolId: receiver.symbolId,
          fullName: receiver.fullName,
          countryIso: receiver.countryIso,
          currency: receiver.currency
        },
        sourceAmount,
        sourceCurrency: sender.currency,
        destinationAmount,
        destinationCurrency: receiver.currency,
        rate: fxRate(sender.currency, receiver.currency),
        cashbackRate,
        cashback,
        cashbackCredit,
        // A payee with a share rate produces a share leg, with its own
        // reference — the thing the receipt's Creator Share tab names.
        shareReferenceId: cashbackRate > 0 ? `SHARE-${state.ledger.length + 1}` : null,
        note: body.note || "",
        createdAt: new Date().toISOString()
      });
      return json(200, {
        success: true,
        amountBasis: basis,
        sourceAmount,
        sourceCurrency: sender.currency,
        destinationAmount,
        destinationCurrency: receiver.currency,
        transaction: {
          referenceId: reference,
          transactionId: reference,
          amount: destinationAmount,
          currency: receiver.currency,
          sourceAmount,
          sourceCurrency: sender.currency,
          destinationAmount,
          destinationCurrency: receiver.currency,
          exchangeRate: fxRate(sender.currency, receiver.currency),
          status: "success",
          createdAt: new Date().toISOString()
        },
        shareTransaction: null,
        senderBalance: state.balances[sender.symbolId],
        receiverBalance: state.balances[receiver.symbolId]
      });
    }
    // Projects the ledger for ONE viewer, the way server.js's history route
    // does: direction from whose id is on the `from` side, and the
    // counterparty being whichever party the viewer is not. Getting this
    // backwards is the exact bug the tests exist to catch, so it is written
    // here the same way it is written in the server — from the row's own
    // sender id, never from anything the caller passes.
    const projectFor = (viewer) =>
      state.ledger
        .filter((row) => row.sender.symbolId === viewer.symbolId || row.receiver.symbolId === viewer.symbolId)
        .map((row) => {
          const isSender = row.sender.symbolId === viewer.symbolId;
          const other = isSender ? row.receiver : row.sender;
          return {
            id: row.id,
            referenceId: row.referenceId,
            direction: isSender ? "sent" : "received",
            amount: row.destinationAmount,
            currency: row.destinationCurrency,
            senderCurrency: row.sourceCurrency,
            debitAmount: row.sourceAmount,
            fxRate: row.rate,
            status: "success",
            note: row.note || "",
            counterparty: {
              fullName: other.fullName,
              symbolId: other.symbolId,
              // The field whose absence was the whole problem: without a
              // country there is no flag to put on a receipt.
              countryIso: other.countryIso,
              currency: other.currency,
              fromSnapshot: true
            },
            cashbackRate: row.cashbackRate,
            cashback: row.cashback,
            cashbackCredit: row.cashbackCredit,
            shareReferenceId: row.shareReferenceId,
            createdAt: row.createdAt
          };
        })
        .reverse();

    if (pathname.startsWith("/api/transactions/history/")) {
      const viewer = byId(decodeURIComponent(pathname.replace("/api/transactions/history/", "")));
      if (!viewer) return json(404, { message: "Not found" });
      const rows = projectFor(viewer);
      return json(200, { success: true, symbolId: viewer.symbolId, count: rows.length, transactions: rows });
    }
    if (pathname.startsWith("/api/transactions/")) {
      const viewer = byId(decodeURIComponent(pathname.replace("/api/transactions/", "").split("?")[0]));
      if (!viewer) return json(200, { transactions: [], totalSent: 0, totalReceived: 0 });
      const rows = projectFor(viewer);
      return json(200, {
        success: true,
        transactions: rows,
        totalSent: rows.filter((r) => r.direction === "sent").reduce((n, r) => n + r.amount, 0),
        totalReceived: rows.filter((r) => r.direction === "received").reduce((n, r) => n + r.amount, 0)
      });
    }

    // --- everything else the dashboard touches on arrival ---
    if (pathname.startsWith("/api/assets/")) return json(200, { seeds: [], assets: [] });
    if (pathname.startsWith("/api/referrals/")) return json(200, { referrals: [] });
    if (pathname.startsWith("/api/interest")) return json(200, { interested: false, count: 0 });
    if (pathname.startsWith("/api/products/")) return json(200, { product: { waitlist: 0 } });
    if (pathname.startsWith("/api/coin/supply")) {
      return json(200, { success: true, reserve: 0, issued: 0, heldByAccounts: 0, holders: 0, reserveCurrency: "INR", coinCurrency: "GC", backed: true });
    }
    if (pathname.startsWith("/api/coin/")) return json(200, { success: true, balance: 0, coin: 0 });
    if (pathname.startsWith("/api/creator/")) return json(200, { cashbackRate: 0.01 });

    return json(200, {});
  });

  return { calls, state };
}

// Seed the device as if this account had signed in here before, and mark the
// permissions explainer as already read. Both are plain localStorage writes
// the app itself makes; doing them here is the difference between a test
// about paying and a test about the registration wizard.
export async function seedSession(context, account, { permissionsGateSeen = true } = {}) {
  const built_ = await buildOnce();
  await context.addInitScript(
    ({ account, gateSeen, origin }) => {
      if (window.location.origin !== origin) return;
      window.localStorage.setItem(
        "gloobal.session.v1",
        JSON.stringify({
          user: {
            symbolId: account.symbolId,
            fullName: account.fullName,
            mobileNumber: account.mobileNumber,
            country: account.country,
            countryIso: account.countryIso,
            currency: account.currency
          },
          phoneNumber: account.mobileNumber,
          token: null,
          savedAt: Date.now(),
          loggedInAt: new Date().toISOString(),
          biometricEnrolled: false
        })
      );
      if (gateSeen) window.localStorage.setItem("gloobal.permissionsGateSeen.v1", "1");
      window.localStorage.setItem("gloobal.hasRegistered.v1", "1");
    },
    { account, gateSeen: permissionsGateSeen, origin: built_.origin }
  );
}

// A page that records everything worth asserting on later: JS faults,
// console errors, and the fake API's call log.
export async function openPage(options = {}) {
  const { origin, browser } = await buildOnce();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: options.permissions || [],
    geolocation: options.geolocation,
    locale: "en-GB"
  });
  const api = await installApi(context, options);
  if (options.account) await seedSession(context, options.account, options);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(origin + "/");
  await page.waitForSelector("#root *", { timeout: 15000 });
  return { page, context, errors, api, origin };
}

// Drive the real login UI: the PIN pad, the login button, and the wait for
// the dashboard. Deliberately not a shortcut past the screen — a test that
// skips the login cannot notice the login breaking.
export async function login(page, account) {
  // The restored session lands on the Gloobal ID screen with the ID already
  // filled in, so the ID step is one tap. Then the six-digit PIN, then the
  // same button again. Deliberately the real screens rather than a shortcut
  // that writes a token straight into storage: a test that skips the login
  // cannot notice the login breaking.
  await page.getByLabel("Log in", { exact: true }).click({ timeout: 15000 });
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 15000 });
  for (const digit of account.pin) {
    await page.getByLabel(`Digit ${digit}`, { exact: true }).click({ timeout: 10000 });
  }
  await page.getByLabel("Log in", { exact: true }).click({ timeout: 15000 });
  // The dashboard's own Send button, not a word in the copy: the balance
  // line reads "Balance unavailable" when the server read fails and a
  // currency figure when it works, so waiting on text would go green on the
  // failure this suite exists to catch.
  await page.getByLabel("Send", { exact: true }).waitFor({ timeout: 30000 });
}


// Reveal the masked balance. The dashboard hides it behind the same
// biometric gate every guarded action uses; in a headless browser there is
// no platform authenticator, so the gate falls back to the account PIN,
// which is the path this drives.
//
// force: true throughout because the dashboard's drifting currency marks
// sit above the controls in the stacking order and Playwright refuses a
// click it thinks something else would receive. They are decorative and
// pointer-events-none in effect; the tap does reach the button.
export async function revealBalance(page, account) {
  await page.getByLabel("Show balance", { exact: true }).click({ force: true });
  await page.getByLabel("Verify with fingerprint and Face ID", { exact: true }).click({ force: true });
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 15000 });
  for (const digit of account.pin) {
    await page.getByLabel(`Digit ${digit}`, { exact: true }).click({ force: true });
  }
  // The fallback sheet reuses the login pad, submit button and all, so the
  // six digits are entered but not sent until this is pressed.
  await page.getByLabel("Log in", { exact: true }).last().click({ force: true });
  // Wait on the masking dots disappearing rather than on the sheet's copy:
  // the copy contains a typographic apostrophe, and matching it from a test
  // is a trap that fails silently the day someone rewrites the sentence.
  await page.waitForFunction(
    () => !document.body.innerText.includes("•••••"),
    undefined,
    { timeout: 25000 }
  );
}

// The balance as a person reads it, currency symbol and all.
export async function shownBalance(page) {
  return page.evaluate(() => {
    const match = document.body.innerText.match(/(?:[₹¥£$€]|Rs\.?)\s?[\d,]+(?:\.\d+)?/);
    return match ? match[0].replace(/\s+/g, "") : null;
  });
}

export const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
