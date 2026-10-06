// tests/geu-history.test.mjs
//
//   node --test tests/geu-history.test.mjs
//
// A Gloobal Coin movement, from the server's record to the receipt it opens.
//
// ── The defect this exists for ──────────────────────────────────────────
//
// frontend/App.jsx carried one line:
//
//     method: row.type === "share" ? "share" : "bank",
//
// Binary. Every row that was not a Creator Share leg was stamped "bank",
// including all three coin movements. Two things followed, both of which
// shipped and neither of which any test could see:
//
//   1. The History screen's Coin chip filters on `t.method === "coin"`.
//      No server row has ever carried that value. The chip has been a
//      button that produces an empty list, for every account, since the day
//      it was added.
//
//   2. A buy or a sell opened the payment receipt — "Bank" as the method,
//      "Gloobal User" as the counterparty, and not one of the exchange's own
//      facts: no fiat cost, no rate, no reserve. The single movement in this
//      app that is literally a currency exchange had a receipt describing a
//      bank transfer that never happened.
//
// Nothing caught it because no test read `method` and no test read the
// filter. Both are read below.
//
// ── Why the assertions are about MAPPING and not about rendering ────────
//
// The chip and the receipt are both downstream of two pure decisions —
// historyRowShape (which chip, which receipt) and the server's coin shaper
// (what the exchange was) — and those are the two things that were wrong.
// Pinning the rendered DOM instead would pass against a correct screen
// fed the wrong row, which is exactly the state this repo was in.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSource, loadDomain, loadMapServerTransaction } from "./harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "server", "server.js"));

// ── The server's shaper, required directly ──────────────────────────────
//
// server/lib/ is ordinary CommonJS, unlike the concatenated frontend, so
// there is nothing to reconstruct here.
const {
  coinHistoryRow,
  coinPaymentDirectionFor,
  coinDirectionFor,
  isCoinTransaction
} = require(join(ROOT, "server/lib/coinHistoryRow"));

// ── The frontend's table and mapper, sliced out of the bundle sources ───
//
// See tests/receipt-currency.test.mjs for why this is a slice and not an
// import: no module in frontend/ exports anything.
function sliceFunction(file, name) {
  const src = readSource(file);
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found in ${file}`);
  const end = src.indexOf("\n}\n", at);
  assert.ok(end > at, `could not find the end of ${name}`);
  return src.slice(at, end + 2);
}

function sliceVar(file, name) {
  const src = readSource(file);
  const at = src.indexOf(`var ${name} = {`);
  assert.ok(at >= 0, `${name} not found in ${file}`);
  const end = src.indexOf("\n};\n", at);
  assert.ok(end > at, `could not find the end of ${name}`);
  return src.slice(at, end + 3);
}

const APP = "frontend/App.jsx";
const SHAPE_SRC = [
  sliceVar(APP, "HISTORY_ROW_SHAPE_BY_TYPE"),
  readSource(APP).match(/var HISTORY_ROW_SHAPE_DEFAULT = \{[^}]*\};/)[0],
  sliceFunction(APP, "historyRowShape")
].join("\n");

const historyRowShape = new Function(`${SHAPE_SRC}; return historyRowShape;`)();

// Loaded through the harness, which owns the list of things the mapper leans
// on — formatClockTime, historyRowShape, coinPartyName and the reserve's name.
const mapServerTransaction = loadMapServerTransaction();

// ── Rows, as the server actually stores them ────────────────────────────
//
// Not invented shapes: these are the fields the mint route (server.js
// 'coin_mint'), the redeem route and the transfer route write, with
// fromUserId/toUserId set the way each of them sets it. The mint and redeem
// writing toUserId: null is the whole reason direction cannot come from
// fromUserId, so getting that detail right is the test.
const ME = "u-me";
const THEM = "u-them";

const storedMint = {
  _id: "t1",
  referenceId: "GLB-MINT-1",
  type: "coin_mint",
  amount: 1200,
  currency: "GEU",
  status: "success",
  note: "Minted Gloobal Coin",
  fromUserId: ME,
  toUserId: null,
  createdAt: new Date("2026-08-14T09:30:00Z"),
  metadata: {
    prototype: true,
    reserveCurrency: "INR",
    paidAmount: 1200,
    paidCurrency: "INR",
    geuRate: 1,
    geuRateSource: "peg"
  }
};

const storedRedeem = {
  ...storedMint,
  _id: "t2",
  referenceId: "GLB-REDEEM-1",
  type: "coin_redeem",
  note: "Redeemed Gloobal Coin",
  metadata: {
    prototype: true,
    reserveCurrency: "INR",
    paidOutAmount: 1200,
    paidOutCurrency: "INR",
    geuRate: 1,
    geuRateSource: "peg"
  }
};

const storedSend = {
  ...storedMint,
  _id: "t3",
  referenceId: "GLB-SEND-1",
  type: "coin_send",
  amount: 50,
  note: "Sent Gloobal Coin",
  fromUserId: ME,
  toUserId: THEM,
  metadata: { prototype: true }
};

describe("a buy is not money going out", () => {
  test("direction comes from the type, not from fromUserId", () => {
    // THE SIGN BUG. A mint and a redeem both write fromUserId = the holder
    // and toUserId = null, because both are the holder transacting with the
    // reserve. So `isSender` — which is what both /api/transactions
    // projections used — is true for BOTH, and reported a buy as "sent".
    //
    // On the screen: App.jsx files a 'sent' row on the Paid side, and
    // TransactionRow draws it with a minus. A person who had just bought
    // 1,200 GEU saw −1,200 GEU against a coin balance that had gone UP by
    // 1,200. Inverted on every purchase anybody has ever made.
    assert.equal(coinPaymentDirectionFor(storedMint, ME), "received");
    assert.equal(coinPaymentDirectionFor(storedRedeem, ME), "sent");
  });

  test("a transfer still reads from whose side you are on", () => {
    // Unlike mint and redeem, a send has two real accounts, and the viewer's
    // position is the only thing that can answer this.
    assert.equal(coinPaymentDirectionFor(storedSend, ME), "sent");
    assert.equal(coinPaymentDirectionFor(storedSend, THEM), "received");
  });

  test("the two vocabularies agree about one row", () => {
    // 'in'/'out' is what a coin receipt reads; 'received'/'sent' is what
    // every payment list reads. Two names for one fact, which is a thing
    // that drifts if it is stated twice.
    for (const row of [storedMint, storedRedeem, storedSend]) {
      const coin = coinDirectionFor(row, ME);
      const payment = coinPaymentDirectionFor(row, ME);
      assert.equal(payment, coin === "in" ? "received" : "sent", row.type);
    }
  });
});

describe("the exchange is reported, not recomputed", () => {
  test("a buy carries what it cost and the rate it converted at", () => {
    const shaped = coinHistoryRow(storedMint, { viewerUserId: ME });
    assert.equal(shaped.coinAmount, 1200);
    assert.equal(shaped.coinCurrency, "GEU");
    assert.equal(shaped.fiatAmount, 1200);
    assert.equal(shaped.fiatCurrency, "INR");
    assert.equal(shaped.reserveCurrency, "INR");
    assert.equal(shaped.referenceId, "GLB-MINT-1");
  });

  test("the rate keeps the direction it was recorded in", () => {
    // The two routes store OPPOSITE directions under the same field name:
    // a mint's rate is GEU per 1 fiat, a redeem's is fiat per 1 GEU. Both
    // are right for the arithmetic they were computed for, and normalising
    // them into one house style means inverting a rounded number — which
    // produces a third figure that reconciles with neither amount printed
    // beside it on the same receipt.
    assert.equal(coinHistoryRow(storedMint, { viewerUserId: ME }).geuRateBasis, "coin-per-fiat");
    assert.equal(coinHistoryRow(storedRedeem, { viewerUserId: ME }).geuRateBasis, "fiat-per-coin");
    assert.equal(coinHistoryRow(storedSend, { viewerUserId: ME }).geuRateBasis, null);
  });

  test("a transfer reports NO fiat leg, not a fiat leg of zero", () => {
    // The version of this block that lived inline in server.js ran
    //
    //     Number.isFinite(Number(fiatAmount)) ? Number(fiatAmount) : null
    //
    // and Number(null) is 0, which is finite. So every coin send has been
    // reporting that it cost 0 — "this was free" — directly underneath a
    // comment forbidding exactly that reading. It was invisible only because
    // coinReceiptFrom guards its fiat block on `!isSend` and never looked.
    const shaped = coinHistoryRow(storedSend, { viewerUserId: ME });
    assert.equal(shaped.fiatAmount, null, "a transfer was given a price");
    assert.equal(shaped.fiatCurrency, null);
    assert.equal(shaped.geuRate, null);
  });

  test("a genuine zero is still a zero", () => {
    // The guard above must distinguish "the record does not say" from "the
    // record says nothing moved". Turning a recorded 0 into null would be
    // the same class of error pointing the other way.
    const free = { ...storedMint, metadata: { ...storedMint.metadata, paidAmount: 0 } };
    assert.equal(coinHistoryRow(free, { viewerUserId: ME }).fiatAmount, 0);
  });

  test("a transfer names the other account; a buy does not", () => {
    // A buy's counterparty is the reserve, which is not an account and has
    // no Gloobal ID or country. Borrowing the holder's would draw the
    // person's own flag on the far side of their own receipt.
    const other = { symbolId: "GLB-THEM", fullName: "Amara Osei", countryIso: "GH" };
    const send = coinHistoryRow(storedSend, { viewerUserId: ME, counterparty: other });
    assert.equal(send.counterpartyName, "Amara Osei");
    assert.equal(send.counterpartyCountryIso, "GH");

    const buy = coinHistoryRow(storedMint, { viewerUserId: ME, counterparty: other });
    assert.equal(buy.counterpartyName, null, "a buy was given a person as its counterparty");
    assert.equal(buy.counterpartySymbolId, null);
  });
});

describe("which chip, and which receipt", () => {
  test("a buy and a sell file under Bank and open the coin receipt", () => {
    // The founder's own split: the fiat side of a buy or a sell moved
    // through the bank balance, so that is the history it belongs in — while
    // the document behind it has to be the exchange receipt, because a
    // payment receipt has nowhere to put a rate or a reserve.
    for (const type of ["coin_mint", "coin_redeem"]) {
      assert.deepEqual(historyRowShape(type), { kind: "coin", method: "bank" }, type);
    }
  });

  test("a transfer files under Coin and opens the PAYMENT receipt", () => {
    // Deliberately the other way round from a buy. A GEU transfer is one
    // person paying another, so it should open exactly the receipt a rupee
    // payment opens — a counterparty, a flag, a reference — while sitting
    // with the Coin screen's own ledger in the chips.
    assert.deepEqual(historyRowShape("coin_send"), { kind: "payment", method: "coin" });
  });

  test("a Creator Share leg is unchanged", () => {
    assert.deepEqual(historyRowShape("share"), { kind: "share", method: "share" });
  });

  test("an unknown type is a payment, never a coin row", () => {
    // The safe default. A new transaction type arriving from the server and
    // read as a payment shows a name, a figure and a receipt built from
    // fields every row has. Read as a coin row it would reach
    // coinReceiptFrom with no fiat leg and no rate, and draw an exchange
    // that never took place.
    for (const type of ["payment", "disbursement", "", null, undefined, "geu_issue"]) {
      assert.deepEqual(historyRowShape(type), { kind: "payment", method: "bank" }, String(type));
    }
  });

  test("the table is not keyed on currency", () => {
    // Gloobal Coin and the GEU growth prototype are BOTH denominated "GEU"
    // (COIN_CURRENCY and GEU_PROTOTYPE_CURRENCY are the same string), so
    // currency cannot tell a coin movement from a prototype one. `type` can.
    // A reader that reached for currency here would file every prototype
    // movement under the Coin chip the day that flag is turned on.
    const src = readSource(APP);
    const table = src.slice(
      src.indexOf("var HISTORY_ROW_SHAPE_BY_TYPE"),
      src.indexOf("function mapServerTransaction(")
    );
    assert.ok(!/\bcurrency\b\s*[=:]/.test(table), "the shape table started reading currency");
  });
});

describe("what the mapper hands the history screen", () => {
  // A row as /api/transactions/:symbolId now sends it, coin block included.
  const projected = (type, extra = {}) => ({
    id: "t1",
    referenceId: `GLB-${type}`,
    type,
    direction: type === "coin_mint" ? "received" : "sent",
    amount: 1200,
    currency: "GEU",
    status: "success",
    createdAt: "2026-08-14T09:30:00.000Z",
    counterparty: null,
    coin: coinHistoryRow({ ...storedMint, type }, { viewerUserId: ME }),
    ...extra
  });

  test("a coin row arrives with its exchange attached", () => {
    const row = mapServerTransaction(projected("coin_mint"), "GLB-ME");
    assert.equal(row.kind, "coin");
    assert.equal(row.method, "bank");
    assert.equal(row.txnType, "coin_mint");
    assert.ok(row.coin, "the coin block was dropped at the mapping boundary");
    assert.equal(row.coin.fiatAmount, 1200);
    assert.equal(row.coin.geuRateBasis, "coin-per-fiat");
  });

  test("a transfer is the only row that reaches the Coin chip", () => {
    // And it does reach it. Before this, NOTHING did — which is the whole
    // reason the chip was dead.
    assert.equal(mapServerTransaction(projected("coin_send"), "GLB-ME").method, "coin");
    for (const type of ["coin_mint", "coin_redeem", "payment", "share"]) {
      assert.notEqual(mapServerTransaction(projected(type), "GLB-ME").method, "coin", type);
    }
  });

  test("a buy row is with the reserve, not with 'Gloobal User'", () => {
    // A mint writes toUserId: null — the other side of it is the reserve
    // that backs the coin, which is not an account — so the server resolves
    // no counterparty and the fallback filled the gap with the placeholder
    // every unnamed payment gets:
    //
    //     Gloobal User        +1,200.00 GEU
    //
    // naming nobody, and reading as money from a stranger rather than as a
    // purchase. coinReceipt.js has called this party "Gloobal Reserve" since
    // the coin receipt was built, and the receipt the row opens says "From
    // Gloobal Reserve" on this exact movement — so the row was contradicting
    // the document behind it.
    assert.equal(mapServerTransaction(projected("coin_mint"), "GLB-ME").name, "Gloobal Reserve");
    assert.equal(mapServerTransaction(projected("coin_redeem"), "GLB-ME").name, "Gloobal Reserve");
  });

  test("a transfer with no name is still 'Gloobal User'", () => {
    // Only mint and redeem get the reserve. A coin SEND has a real person on
    // the other end, so if a name is missing the truthful answer is that the
    // app does not know it — not that the transfer was with the reserve,
    // which it was not.
    assert.equal(mapServerTransaction(projected("coin_send"), "GLB-ME").name, "Gloobal User");
    const named = { ...projected("coin_send"), counterparty: { fullName: "Tom Whitfield", symbolId: "GLB-TOM" } };
    assert.equal(mapServerTransaction(named, "GLB-ME").name, "Tom Whitfield");
  });

  test("a payment is untouched", () => {
    // The regression that would matter most: this mapper feeds every list in
    // the app, and the overwhelming majority of rows through it are ordinary
    // payments.
    const row = mapServerTransaction({ ...projected("payment"), coin: null, currency: "INR" }, "GLB-ME");
    assert.equal(row.kind, "payment");
    assert.equal(row.method, "bank");
    assert.equal(row.coin, null);
  });

  test("every method a row can carry is a chip, or is Creator Share", () => {
    // THE DEAD-CHIP TEST, from the other direction. The History screen's
    // chips are a hardcoded list and the filter is string equality on
    // `t.method`, so a method the chips do not name is a row no filter can
    // reach, and a chip no method produces is a button that always yields an
    // empty list. Both happened.
    //
    // 'share' is the one intended exception and is asserted as such: a
    // Creator Share is not an alternative way of paying, and offering it as
    // a chip would suggest it could be chosen.
    const screen = readSource("frontend/features/history/TransactionHistoryScreen.jsx");
    const chips = screen.match(/\[\s*"all",\s*"bank",\s*"paylater",\s*"coin"\s*\]/);
    assert.ok(chips, "the chip list changed shape — this test needs rereading, not deleting");

    const named = new Set(["bank", "paylater", "coin"]);
    const produced = new Set(
      ["payment", "share", "coin_mint", "coin_redeem", "coin_send", "disbursement", "mystery"]
        .map((type) => historyRowShape(type).method)
    );
    for (const method of produced) {
      assert.ok(
        named.has(method) || method === "share",
        `rows are stamped method "${method}" and no chip selects it`
      );
    }
    for (const chip of named) {
      assert.ok([...produced].includes(chip) || chip === "paylater",
        `the "${chip}" chip filters for a method no row ever carries`);
    }
  });
});

describe("a coin figure never poses as the account's own money", () => {
  // generateDailySpending feeds the balance card's week chart and the
  // History screen's trend, and every bar and total on both is printed with
  // ONE currency symbol.
  const { generateDailySpending } = loadDomain(["generateDailySpending"]);

  const row = (amount, currency) => ({
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    amount,
    currency,
    kind: currency === "GEU" ? "coin" : "payment"
  });
  const total = (sent, received) => {
    const { totals } = generateDailySpending(sent, received, 1, "INR");
    return totals[0];
  };

  test("buying coin does not appear as rupees received", () => {
    // THE FIGURE ON THE CARD. generateDailySpending summed `t.amount` and
    // never read `t.currency` — the same defect the comment beneath it
    // describes being removed from computeRealCountrySpend, which "added
    // rupees to dollars as bare numbers", still alive in that function.
    //
    // Buying 1,200 GEU put "+1,200.00₹" on the balance card of an account
    // whose rupee balance had just gone DOWN by 1,200. Measured in a browser
    // before and after; see tests/geu-receipt-browser.test.mjs for the rest
    // of that screen.
    assert.equal(total([], [row(1200, "GEU")]).received, 0);
  });

  test("selling coin does not appear as rupees paid", () => {
    // Both directions, because a coin movement's two legs run opposite ways:
    // the row carries the COIN leg (what the coin balance moved by) and the
    // fiat leg belongs on the other side of the chart from it. Neither
    // figure can be drawn on a one-currency bar honestly.
    assert.equal(total([row(300, "GEU")], []).paid, 0);
  });

  test("the account's own money still counts", () => {
    // The thing that must not break: this chart is the balance card's main
    // feature and nearly every row through it is an ordinary domestic
    // payment.
    const t = total([row(500, "INR")], [row(900, "INR")]);
    assert.equal(t.paid, 500);
    assert.equal(t.received, 900);
  });

  test("a row with no currency recorded is still counted", () => {
    // Rows predating the currency field are domestic on the only evidence
    // available, and dropping them would empty the chart for every
    // long-standing account — turning missing data into a zero, from the
    // other end.
    assert.equal(total([], [row(250, undefined)]).received, 250);
  });
});

describe("the three routes that send a coin row share one shaper", () => {
  const SERVER = readSource("server/server.js");

  test("none of them shapes a coin row inline", () => {
    // The coin history route used to hold this block inline, and it was the
    // only place on the server that understood a coin movement. Copying it
    // into the two /api/transactions projections is how the Gloobal Bank row
    // drifted twice before it was made to share a component.
    const inlineShapers = SERVER.match(/const fiatAmount = isMint \?/g) || [];
    assert.equal(inlineShapers.length, 0, "a route went back to shaping coin rows by hand");
  });

  test("both transaction projections carry the coin block and the coin direction", () => {
    const calls = SERVER.match(/coin: isCoin$/gm) || [];
    assert.equal(calls.length, 2, "one of the two transaction projections is not sending `coin`");
    const directions = SERVER.match(/coinPaymentDirectionFor\(transaction, user\._id\)/g) || [];
    assert.equal(directions.length, 2, "a projection is still deriving coin direction from fromUserId");
  });

  test("isCoinTransaction names exactly the three coin types", () => {
    for (const type of ["coin_mint", "coin_redeem", "coin_send"]) {
      assert.equal(isCoinTransaction(type), true, type);
    }
    for (const type of ["payment", "share", "disbursement", "geu_issue", "", null]) {
      assert.equal(isCoinTransaction(type), false, String(type));
    }
  });
});
