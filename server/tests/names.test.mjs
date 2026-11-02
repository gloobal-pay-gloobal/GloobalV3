// Buying and selling creator names (0211): list, ask, bargain, accept with
// the shop's next name, pay within 24 hours — the payment, the name moving
// and the seller's credit in one transaction — and a public history.
//
//   node tests/names.test.mjs

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

const TEST_DB = "gloobal_names_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5247";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// One proxy in front, as on a host like Render: the right-most
// X-Forwarded-For entry is the one that proxy wrote, so the tests write
// "<anything the caller forged>, <real address>".
process.env.TRUST_PROXY_HOPS = "1";
process.env.BANK_TEST_SETTLE_MS = "600";
delete process.env.RENDER;

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Notification = require(join(BACKEND, "models/Notification"));
const BankAccount = require(join(BACKEND, "models/BankAccount"));
const BankTransfer = require(join(BACKEND, "models/BankTransfer"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const SYMBOL_SET = new Set(SYMBOLS_FOR_CHECK());
function SYMBOLS_FOR_CHECK() { return ["−", "+", "×", "=", "○", "□", "●", "■"]; }

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

const balance = async (a) => (await User.findOne({ symbolId: a.id }).lean()).balance;
const openBank = async (a) => {
  const user = await User.findOne({ symbolId: a.id });
  await BankAccount.create({ userId: user._id, status: "open", step: 6, openedAt: new Date() });
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));





const NameThread = require(join(BACKEND, "models/NameThread"));
const { computeBooks } = require(join(BACKEND, "lib/coverageView"));
const { hideContacts } = require(join(BACKEND, "lib/names"));
const profile = (who, symbol, patch) => call("PUT", `/api/creator/${encodeURIComponent(symbol)}/profile`, { token: who.token, body: patch });
const handleOf = async (symbolId) => ((await User.findOne({ symbolId }).lean()).creatorProfile || {}).handle || "";

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  const seller = await register(9101, "+919000009101", "Rasoi Ghar");
  const buyer = await register(9102, "+919000009102", "Priya Kitchen");
  const third = await register(9103, "+919000009103", "Mohan Snacks");
  await profile(seller, seller.id, { handleFirst: "Rasoi", handleLast: "Ghar", category: "food" });
  await profile(buyer, buyer.id, { handleFirst: "Priya", handleLast: "Kitchen", category: "food" });

  console.log("0. what a name is");
  const info0 = await call("GET", "/api/names/rasoi.ghar", { token: buyer.token });
  check("taken, not for sale, asking allowed", info0.body?.taken === true && info0.body?.forSale === false && info0.body?.allowAsks === true && info0.body?.holder?.name === "Rasoi Ghar");
  const free = await call("GET", "/api/names/rasoi.mahal", { token: buyer.token });
  check("a free name says so", free.body?.taken === false);
  check("numbers and links stay out of the window", hideContacts("call 98290 12345 or www.rasoi.in") === "call ••• or •••", hideContacts("call 98290 12345 or www.rasoi.in"));

  console.log("\n1. the owner lists it");
  const noNext = await call("PUT", "/api/names/listing", { token: seller.token, body: { forSale: true, price: 5000 } });
  check("a fixed price needs the shop's next name first", noNext.status === 400 && noNext.body?.code === "next_name");
  const listed = await call("PUT", "/api/names/listing", { token: seller.token, body: { forSale: true, price: 5000, floor: 3000, nextFirst: "Rasoi", nextLast: "Alwar" } });
  check("listed at 5,000 with a floor of 3,000", listed.status === 200 && listed.body?.listing?.price === 5000 && listed.body?.listing?.nextHandle === "rasoi.alwar");
  const notMine = await call("PUT", "/api/names/listing", { token: buyer.token, body: { shop: seller.id, forSale: true, price: 1 } });
  check("nobody else can list it", notMine.status === 403);

  console.log("\n2. bargaining");
  const low = await call("POST", "/api/names/rasoi.ghar/threads", { token: third.token, body: { message: "1000?", offer: 1000 } });
  check("an offer under the floor is filed, not shown", low.status === 201 && low.body?.thread?.filed === true);
  const opened = await call("POST", "/api/names/rasoi.ghar/threads", { token: buyer.token, body: { message: "Hi! For my kitchen. 9829012345", offer: 3500 } });
  const id = opened.body?.thread?.id;
  check("Priya's offer opens a window", opened.status === 201 && opened.body?.thread?.lastOffer === 3500 && !opened.body.thread.filed);
  check("with her number hidden", !/9829012345/.test(JSON.stringify(opened.body?.thread?.messages)));
  const sellerList = await call("GET", "/api/names/threads", { token: seller.token });
  check("the seller sees Priya, and one filed offer counted", sellerList.body?.threads?.length === 1 && sellerList.body?.filed === 1);
  const counter = await call("POST", `/api/names/threads/${id}/messages`, { token: seller.token, body: { text: "Can do 4,500.", offer: 4500 } });
  check("the seller counters", counter.body?.thread?.lastOfferBy === "seller" && counter.body?.thread?.lastOffer === 4500);
  const acceptOwnCounter = await call("POST", `/api/names/threads/${id}/accept`, { token: seller.token, body: { nextFirst: "Rasoi", nextLast: "Alwar" } });
  check("accept takes the buyer's latest offer only", acceptOwnCounter.status === 409 && acceptOwnCounter.body?.code === "no_offer");
  await call("POST", `/api/names/threads/${id}/messages`, { token: buyer.token, body: { text: "Meet at 4,200?", offer: 4200 } });
  const buyerAccepts = await call("POST", `/api/names/threads/${id}/accept`, { token: buyer.token, body: {} });
  check("only the owner accepts", buyerAccepts.status === 403);
  const taken = await call("POST", `/api/names/threads/${id}/accept`, { token: seller.token, body: { nextFirst: "Priya", nextLast: "Kitchen" } });
  check("the shop's next name must be free", taken.status === 409 && taken.body?.code === "next_taken");
  const accepted = await call("POST", `/api/names/threads/${id}/accept`, { token: seller.token, body: { nextFirst: "Rasoi", nextLast: "Alwar" } });
  check("accepted at 4,200 — a deal with 24 hours to pay", accepted.body?.thread?.status === "deal" && accepted.body?.thread?.price === 4200 && Math.abs(new Date(accepted.body.thread.payBy) - Date.now() - 86400000) < 60000);

  console.log("\n3. paying: one transaction");
  const sb = await balance(seller), bb = await balance(buyer);
  const wrong = await call("POST", `/api/names/threads/${id}/pay`, { token: buyer.token, body: { pin: "000000", target: buyer.id } });
  check("a wrong PIN moves nothing", wrong.status === 401 && near(await balance(buyer), bb) && (await handleOf(seller.id)) === "rasoi.ghar");
  const paid = await call("POST", `/api/names/threads/${id}/pay`, { token: buyer.token, body: { pin: PIN, target: "new" } });
  check("paid", paid.status === 200 && paid.body?.thread?.status === "paid", `status ${paid.status} ${paid.body?.message || ""}`);
  check("the name is on Priya's new shop", (await handleOf(paid.body?.shop)) === "rasoi.ghar" && (await User.findOne({ symbolId: paid.body?.shop }).lean()).shopOwnerId?.toString() === (await User.findOne({ symbolId: buyer.id }).lean())._id.toString());
  check("the seller's shop carries its next name, everything else kept", (await handleOf(seller.id)) === "rasoi.alwar" && paid.body?.sellerNewHandle === "rasoi.alwar");
  check("the money moved: 4,200 from Priya to the seller, no fee", near(await balance(buyer), bb - 4200) && near(await balance(seller), sb + 4200));
  const again = await call("POST", `/api/names/threads/${id}/pay`, { token: buyer.token, body: { pin: PIN, target: "new" } });
  check("paying again does nothing", again.status === 409 && near(await balance(buyer), bb - 4200));
  const lowNow = await NameThread.findById(low.body.thread.id).lean();
  check("the other window is told it sold", lowNow.status === "closed");

  console.log("\n4. the history is public");
  const info1 = await call("GET", "/api/names/rasoi.ghar", { token: third.token });
  check("dates, shops and the price", info1.body?.history?.length === 1 && info1.body.history[0].price === 4200 && info1.body.history[0].from === "Rasoi Ghar" && info1.body.history[0].to === "Priya Kitchen");
  check("and 'new owner' for 30 days, saying where the old shop went", info1.body?.newOwner?.oldShopNowAt === "rasoi.alwar");
  check("no longer for sale", info1.body?.forSale === false);
  const resolved = await call("GET", "/api/creator/resolve/rasoi.ghar", { token: third.token });
  check("people paying it are told it changed hands", resolved.body?.creator?.newOwner?.oldShopNowAt === "rasoi.alwar");

  console.log("\n5. asking for a name that isn't for sale");
  const ask = await call("POST", "/api/names/priya.kitchen/threads", { token: third.token, body: { message: "Would you sell?" } });
  check("one may ask", ask.status === 201 && ask.body?.thread?.kind === "ask");
  await call("POST", `/api/names/threads/${ask.body.thread.id}/messages`, { token: buyer.token, body: { text: "No, sorry." } });
  await NameThread.updateOne({ _id: ask.body.thread.id }, { $set: { status: "closed" } });
  const again30 = await call("POST", "/api/names/priya.kitchen/threads", { token: third.token, body: { message: "Please?" } });
  check("but once per 30 days", again30.status === 409 && again30.body?.code === "asked");
  await call("PUT", "/api/names/listing", { token: buyer.token, body: { forSale: false, allowAsks: false } });
  const off = await call("POST", "/api/names/priya.kitchen/threads", { token: seller.token, body: { message: "hi" } });
  check("and not at all once the owner switches asking off", off.status === 409 && off.body?.code === "no_asks");

  console.log("\n6. 24 hours");
  await call("PUT", "/api/names/listing", { token: buyer.token, body: { forSale: true, price: null, allowAsks: true } });
  const t2 = await call("POST", "/api/names/priya.kitchen/threads", { token: seller.token, body: { offer: 100 } });
  await call("POST", `/api/names/threads/${t2.body.thread.id}/accept`, { token: buyer.token, body: { nextFirst: "Priya", nextLast: "Rasoi" } });
  await NameThread.updateOne({ _id: t2.body.thread.id }, { $set: { payBy: new Date(Date.now() - 1000) } });
  const lapsed = await call("GET", `/api/names/threads/${t2.body.thread.id}`, { token: seller.token });
  check("an unpaid deal lapses and the window opens again", lapsed.body?.thread?.status === "open" && /ran out/.test(JSON.stringify(lapsed.body.thread.messages)));

  console.log("\n7. the books still add up");
  const books = await computeBooks();
  check("a name sale is money between two people", books.ok === true, JSON.stringify(books.currencies?.map((c) => [c.currency, c.difference])));

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
