// tests/coin-receipt.test.mjs
//
// The receipt for buying and selling Gloobal Coin.
//
// ── What there was ───────────────────────────────────────────────────────
//
// A toast. `handleMintCoin` read one field off the server's response —
// `minted` — showed "Bought 12.50 GEU" and discarded the rest: the reference
// id, the fiat that actually left the bank, the currency it left in, and the
// rate it converted at. So the one movement in this app that is literally a
// currency exchange was the only one with no record anybody could open, and
// the Coin Activity row beside it read "Minted from balance · 12.50 GEU",
// which answers neither what it cost nor at what rate.
//
// ── The defect this suite exists to stop ─────────────────────────────────
//
// The two server routes record the rate in OPPOSITE directions under the
// same field name:
//
//   mint    geuRateFor(accountCurrency, reserveCurrency)
//           coinAmount = fiatAmount * geuRate     -> GEU per 1 fiat
//   redeem  geuRateFor(reserveCurrency, accountCurrency)
//           fiatAmount = coinAmount * redeemRate  -> fiat per 1 GEU
//
// Both are correct for the arithmetic they were computed for. Only the name
// is shared. A reader that assumed one meaning would print an inverted rate
// on half of all coin receipts — and it is the half nobody would catch,
// because a rate is the one figure on a receipt no reader recomputes by eye.
//
// The fix is to carry the direction rather than normalise it, and the reason
// is arithmetic: normalising means inverting, and 1/(a rounded rate) does not
// reproduce the two amounts printed beside it on the same receipt.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MODULE = "frontend/features/receipts/coinReceipt.js";
const SERVER = "server/server.js";
const API = "backend/services/api/gloobalApi.js";

// The module is a frontend file in the concatenated bundle, so it is loaded
// the way the rest of this suite loads those: evaluated with the few globals
// it reaches for supplied as stubs.
function loadCoinReceipt() {
  const src = readSource(MODULE);
  const factory = new Function(
    "formatClockTime",
    `${src}; return { coinReceiptFrom, coinReceiptsFrom, coinRateSentence, formatCoinRate, COIN_RESERVE_NAME, COIN_RECEIPT_TITLES };`
  );
  return factory((d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  });
}

const M = loadCoinReceipt();

// Real transaction references: twenty of the eight Gloobal symbols, which is
// what createPrototypeTransactionReference mints for a coin movement exactly
// as it does for a payment. These were briefly written as "GC-MINT-8821" and
// the like, and that was worth correcting rather than leaving as harmless
// filler: a fixture in a shape the system cannot produce teaches the next
// reader the wrong format, and it was the value that appeared in a rendered
// screenshot and made the coin receipt look like it used a scheme of its own.
const MINT_REF = "\u25A0\u25A1\u00D7\u25CF\u2212+\u00D7=\u25CB\u25A1\u25CF\u25A0\u00D7+\u2212=\u25CB\u00D7\u25A1\u25CF";
const REDEEM_REF = "+\u2212\u25CB\u25A0=\u00D7\u25A1\u25CF\u00D7+\u25A0\u25CB\u2212=\u25A1\u00D7\u25CF\u00D7\u25A0+";
const SEND_REF = "\u00D7=\u25CF\u00D7\u25A1\u25CB+\u2212\u25A0\u00D7=\u25CF\u00D7\u25A1\u25CB+\u2212\u25A0\u00D7=";

// A real Gloobal ID is twelve symbols — SYMBOL_ID_LENGTH on the server, which
// rejects anything else outright. These were four, which is the same mistake
// the references above carried: a fixture in a shape the system cannot
// produce, sitting in a screenshot and reading as though the app had shrunk
// somebody's payment address.
const HOLDER_ID = "\u25A0\u25A1\u00D7\u25CF\u2212+=\u25CB\u25A1\u25CF\u00D7\u25A0";
const OTHER_ID = "\u25CF\u00D7\u25A0=\u25CB+\u2212\u25A1\u25CF\u00D7\u25A0\u25CB";

const VIEWER = {
  name: "Aisha Rahman",
  symbolId: HOLDER_ID,
  countryName: "Pakistan",
  countryFlag: "🇵🇰"
};

// A buy: 5,000 PKR out, 1,750 GEU in, at 0.35 GEU per rupee.
const BUY = {
  id: "t1",
  referenceId: MINT_REF,
  type: "coin_mint",
  direction: "in",
  coinAmount: 1750,
  coinCurrency: "GEU",
  fiatAmount: 5000,
  fiatCurrency: "PKR",
  geuRate: 0.35,
  geuRateBasis: "coin-per-fiat",
  geuRateSource: "table",
  reserveCurrency: "INR",
  note: "Minted Gloobal Coin",
  createdAt: "2026-09-12T14:07:32.000Z"
};

// A sell: 400 GEU out, 1,142.86 PKR in, at 2.857143 rupees per GEU.
const SELL = {
  id: "t2",
  referenceId: REDEEM_REF,
  type: "coin_redeem",
  direction: "out",
  coinAmount: 400,
  coinCurrency: "GEU",
  fiatAmount: 1142.86,
  fiatCurrency: "PKR",
  geuRate: 2.857143,
  geuRateBasis: "fiat-per-coin",
  geuRateSource: "table",
  reserveCurrency: "INR",
  note: "Redeemed Gloobal Coin",
  createdAt: "2026-09-11T09:02:10.000Z"
};

const SEND_OUT = {
  id: "t3",
  referenceId: SEND_REF,
  type: "coin_send",
  direction: "out",
  coinAmount: 60,
  coinCurrency: "GEU",
  fiatAmount: null,
  fiatCurrency: null,
  geuRate: null,
  geuRateBasis: null,
  note: "For the tools",
  counterpartySymbolId: OTHER_ID,
  counterpartyName: "Bilal Ahmed",
  counterpartyCountryIso: "PK",
  createdAt: "2026-09-10T18:30:00.000Z"
};

describe("the three things asked for are on it", () => {
  test("the holder's name", () => {
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).holderName, "Aisha Rahman");
  });

  test("their Gloobal ID", () => {
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).holderSymbolId, HOLDER_ID);
  });

  test("the country they bought from", () => {
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.holderCountryName, "Pakistan");
    assert.equal(r.holderCountryFlag, "🇵🇰");
  });

  test("and how much they bought, in both units", () => {
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.amount, 1750);
    assert.equal(r.currencyCode, "GEU");
    assert.equal(r.fiatAmount, 5000);
    assert.equal(r.fiatCurrencyCode, "PKR");
  });

  test("these come from the ACCOUNT, because the movement records none of them", () => {
    // The Transaction row has no name, no country and no Gloobal ID of the
    // holder — only ids. A receipt that invented them from the row would have
    // nothing to invent them from.
    const r = M.coinReceiptFrom(BUY, {});
    assert.equal(r.holderName, null);
    assert.equal(r.holderCountryName, null);
  });
});

describe("the rate is printed in the direction it was recorded", () => {
  test("a buy reads coin-per-fiat", () => {
    assert.equal(M.coinRateSentence(M.coinReceiptFrom(BUY, VIEWER)), "1 PKR = 0.35 GEU");
  });

  test("a sell reads fiat-per-coin", () => {
    assert.equal(M.coinRateSentence(M.coinReceiptFrom(SELL, VIEWER)), "1 GEU = 2.857143 PKR");
  });

  test("neither is inverted to match the other", () => {
    // This is the assertion the whole file is built around. If a future
    // change normalises both into one house direction, the sell's sentence
    // becomes "1 PKR = 0.35 GEU" — a number that does not reproduce 400 GEU
    // -> 1,142.86 PKR, because it is 1/2.857143 rounded.
    const sell = M.coinReceiptFrom(SELL, VIEWER);
    assert.equal(sell.rate, 2.857143, "the sell's recorded rate was altered");
    assert.equal(sell.rateBasis, "fiat-per-coin");
    // And the recorded rate still reconciles the two recorded amounts:
    // 400 GEU at 2.857143 PKR each is the 1,142.86 PKR that arrived.
    assert.ok(
      Math.abs(sell.amount * sell.rate - sell.fiatAmount) < 0.01,
      "the recorded rate no longer reproduces the recorded amounts"
    );
    // Whereas the inverted rate does not, which is the reason not to invert:
    // 400 GEU at 1/0.35 would be 1,142.857…, but 1/2.857143 rounded to six
    // places and multiplied back does not return 5,000 either.
    const inverted = Number((1 / sell.rate).toFixed(6));
    assert.ok(
      Math.abs(sell.amount / inverted - sell.fiatAmount) > 0.0001,
      "the inverted rate happens to reconcile here, so this test proves nothing"
    );
  });

  test("the buy's rate reconciles its own amounts too", () => {
    const buy = M.coinReceiptFrom(BUY, VIEWER);
    assert.ok(Math.abs(5000 * buy.rate - 1750) < 0.01);
  });

  test("a movement with no rate prints no sentence", () => {
    // A send converts nothing. A "1.000000" there would state that an
    // exchange took place.
    assert.equal(M.coinRateSentence(M.coinReceiptFrom(SEND_OUT, VIEWER)), null);
  });

  test("a row written before the basis existed prints nothing rather than a guess", () => {
    const legacy = { ...BUY, geuRateBasis: null };
    assert.equal(M.coinRateSentence(M.coinReceiptFrom(legacy, VIEWER)), null);
  });

  test("a 1:1 peg reads as 1, not 1.000000", () => {
    const peg = { ...BUY, geuRate: 1, fiatCurrency: "INR" };
    assert.equal(M.coinRateSentence(M.coinReceiptFrom(peg, VIEWER)), "1 INR = 1 GEU");
  });

  test("but a small rate keeps the places it needs", () => {
    // Two places would round a GEU rate against IDR or VND to 0.00 — a rate
    // of zero on a receipt whose amounts are plainly not zero.
    assert.equal(M.formatCoinRate(0.000061), "0.000061");
  });
});

describe("the other side of the exchange is named", () => {
  test("a buy and a sell face the reserve", () => {
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).counterpartyName, "Gloobal Reserve");
    assert.equal(M.coinReceiptFrom(SELL, VIEWER).counterpartyName, "Gloobal Reserve");
  });

  test("the reserve carries no flag", () => {
    // Borrowing the holder's would draw their own flag on the far side and
    // read as a payment to themselves.
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).counterpartyCountryIso, null);
  });

  test("a send faces a real account, named by the server", () => {
    const r = M.coinReceiptFrom(SEND_OUT, VIEWER);
    assert.equal(r.counterpartyName, "Bilal Ahmed");
    assert.equal(r.counterpartySymbolId, OTHER_ID);
    assert.equal(r.counterpartyCountryIso, "PK");
  });
});

describe("direction, and which way the money went", () => {
  test("a buy is coin received", () => {
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).direction, "received");
  });

  test("a sell is coin sent", () => {
    assert.equal(M.coinReceiptFrom(SELL, VIEWER).direction, "sent");
  });

  test("the fiat leg runs the other way on each", () => {
    // Stated rather than derived at the point of display: on a buy the money
    // left the bank balance, on a sell it arrived.
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).fiatDirection, "out");
    assert.equal(M.coinReceiptFrom(SELL, VIEWER).fiatDirection, "in");
  });

  test("a send has no fiat leg at all", () => {
    const r = M.coinReceiptFrom(SEND_OUT, VIEWER);
    assert.equal(r.fiatAmount, null, "a send claims a price");
    assert.equal(r.fiatCurrencyCode, null);
    assert.equal(r.fiatDirection, null);
  });

  test("null rather than zero, on every absent figure", () => {
    // 0 would read as "this cost nothing" — a claim about price rather than
    // the absence of one.
    const r = M.coinReceiptFrom(SEND_OUT, VIEWER);
    assert.notEqual(r.fiatAmount, 0);
    assert.equal(r.rate, null);
  });

  test("each kind is titled from the holder's side", () => {
    assert.equal(M.coinReceiptFrom(BUY, VIEWER).title, "Gloobal Coin bought");
    assert.equal(M.coinReceiptFrom(SELL, VIEWER).title, "Gloobal Coin sold");
    assert.equal(M.coinReceiptFrom(SEND_OUT, VIEWER).title, "Gloobal Coin sent");
    assert.equal(
      M.coinReceiptFrom({ ...SEND_OUT, direction: "in" }, VIEWER).title,
      "Gloobal Coin received"
    );
  });
});

describe("a coin receipt cannot grow a Creator Share", () => {
  test("it states zero rather than leaving the fields undefined", () => {
    // ReceiptModal offers the Creator Share tab when it sees a non-zero rate.
    // Leaving these undefined lets a receipt opened after a payment inherit
    // the previous one's — the shape of a defect that file has produced
    // before, where a share receipt computed a second share of 49.00 that
    // existed in no transaction, ledger entry or balance.
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.shareRate, 0);
    assert.equal(r.shareAmount, 0);
    assert.equal(r.shareTxnId, null);
  });
});

describe("the stamp is the server's, not this device's clock", () => {
  test("date and time come off createdAt", () => {
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.date, "Sep 12");
    assert.equal(r.time, "14:07:32");
  });

  test("an unparseable stamp yields nothing rather than now", () => {
    // A fabricated "now" would date somebody's purchase to whenever they
    // happened to open the receipt.
    const r = M.coinReceiptFrom({ ...BUY, createdAt: "not a date" }, VIEWER);
    assert.equal(r.date, "");
    assert.equal(r.time, "");
  });

  test("and a missing one does the same", () => {
    const r = M.coinReceiptFrom({ ...BUY, createdAt: null }, VIEWER);
    assert.equal(r.date, "");
  });
});

describe("provenance", () => {
  test("the server's reference id is what identifies the movement", () => {
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.referenceId, MINT_REF);
    assert.equal(r.txnId, MINT_REF);
  });

  test("a list maps through the same function as a single receipt", () => {
    // One mapping, so the row and the receipt behind it cannot disagree.
    const list = M.coinReceiptsFrom([BUY, SELL, SEND_OUT], VIEWER);
    assert.equal(list.length, 3);
    assert.deepEqual(list[0], M.coinReceiptFrom(BUY, VIEWER));
  });

  test("a null row is dropped rather than becoming an empty receipt", () => {
    assert.equal(M.coinReceiptsFrom([BUY, null], VIEWER).length, 1);
    assert.equal(M.coinReceiptFrom(null, VIEWER), null);
  });
});

describe("the server sends what all of this reads", () => {
  test("the history route exists and is declared before /api/coin/:symbolId", () => {
    // Express matches in declaration order — the rule this file states three
    // times already, for supply, holders and holders/:countryIso.
    const src = readSource(SERVER);
    const history = src.indexOf("app.get('/api/coin/:symbolId/history'");
    const position = src.indexOf("app.get('/api/coin/:symbolId'");
    assert.ok(history > 0, "the coin history route is gone");
    assert.ok(history < position, "the history route is shadowed by /api/coin/:symbolId");
  });

  test("it is the account's own history, and only theirs", () => {
    const src = readSource(SERVER);
    const at = src.indexOf("app.get('/api/coin/:symbolId/history'");
    assert.match(src.slice(at, at + 200), /requireAuth, requireSelf\('symbolId'\)/);
  });

  test("it carries the rate basis, not just the rate", () => {
    const src = readSource(SERVER);
    assert.match(src, /geuRateBasis: isMint \? 'coin-per-fiat' : isRedeem \? 'fiat-per-coin' : null,/);
  });

  test("and the API client passes the basis through without normalising it", () => {
    const src = readSource(API);
    assert.match(src, /geuRateBasis: r\.geuRateBasis === "coin-per-fiat" \|\| r\.geuRateBasis === "fiat-per-coin"/);
    // The specific thing that must never appear: an inversion.
    const at = src.indexOf("async getCoinHistory");
    const body = src.slice(at, src.indexOf("async coinMint", at));
    assert.ok(!/1 \/ /.test(body), "the API client is inverting a recorded rate");
  });

  test("a send appears for both sides of it", () => {
    const src = readSource(SERVER);
    const at = src.indexOf("app.get('/api/coin/:symbolId/history'");
    const body = src.slice(at, at + 3000);
    assert.match(body, /\$or: \[\{ fromUserId: user\._id \}, \{ toUserId: user\._id \}\]/);
  });

  test("the counterparty is resolved in one query, not one per row", () => {
    const src = readSource(SERVER);
    const at = src.indexOf("app.get('/api/coin/:symbolId/history'");
    const body = src.slice(at, at + 4000);
    assert.match(body, /User\.find\(\{ _id: \{ \$in: otherIds \} \}/);
  });
});

describe("the receipt is not labelled as a payment", () => {
  const MODAL = "frontend/components/dialogs/ReceiptModal.jsx";
  const modal = () => readSource(MODAL)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("the hero line names the exchange, not a direction", () => {
    // "Money received" on a buy is false twice over: money did not arrive,
    // it LEFT, and what arrived was coin. The hero figure below is the coin,
    // so the line above it has to name the exchange.
    assert.match(modal(), /isCoinReceipt\s*\?[\s\S]{0,40}receipt\.title \|\| "Gloobal Coin"/);
  });

  test("the tab chip does not say Payment", () => {
    assert.match(modal(), /receipt\.kind === "coin" \? \(receipt\.title \|\| "Gloobal Coin"\) : "Payment"/);
  });

  test("and there is no tab row at all on a coin receipt", () => {
    // One tab is not a toggle. It is a button that does nothing, restating
    // the line already above it.
    //
    // The condition widened rather than changed: it was `!isCoinReceipt`, and
    // the same reasoning turned out to apply to a PAYMENT that carried no
    // Creator Share — also one tab, also drawing a full-width pill that does
    // nothing. Both now fall out of one rule, so this asserts the rule and
    // then asserts the coin case still satisfies it.
    const m = modal();
    assert.match(m, /const showReceiptTabs = !isCoinReceipt && hasShareEvent;/);
    assert.match(m, /\{showReceiptTabs && <div style=\{\{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 999/);
  });

  test("the coin block is drawn only for a coin receipt", () => {
    assert.match(modal(), /\{isCoinReceipt && <div\s*\n?\s*data-testid="receipt-coin"/);
  });

  test("the Payment method row is dropped rather than mislabelling the buy", () => {
    // ReceiptRow renders nothing for a falsy value, so a null method removes
    // the row. On a buy the "method" was the bank balance and on a sell the
    // coin — both already stated above, with their amounts.
    const M2 = loadCoinReceipt();
    assert.equal(M2.coinReceiptFrom(BUY, VIEWER).method, null);
  });
});

describe("the screen builds the receipt from the server's answer", () => {
  const SCREEN = "frontend/screens/Coin/GloobalCoinScreen.jsx";
  const screen = () => readSource(SCREEN)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("not from the typed amount and the screen's displayed rate", () => {
    // Those are what was ASKED for and what was last displayed. A receipt is
    // a record of what happened, and on a cross-rate the two differ.
    const src = screen();
    const at = src.indexOf("setCoinReceipt(coinReceiptFrom({");
    assert.ok(at > 0, "the screen no longer builds a receipt after a purchase");
    const body = src.slice(at, src.indexOf("}, coinReceiptViewer));", at));
    assert.match(body, /coinAmount: minted \? result\.minted : result\.redeemed/);
    assert.match(body, /fiatAmount: minted \? result\.paid : result\.received/);
    assert.match(body, /geuRate: result\.geuRate/);
    assert.ok(!/numericAmount/.test(body), "the receipt is built from the typed amount");
    // Every mention of a rate in here must be the SERVER's. Strip the two
    // legitimate forms — `result.geuRate` and the `geuRate:`/`geuRateBasis:`
    // keys — and nothing may be left, which is what catches a bare `geuRate`
    // reaching for the screen's own prop.
    const rateMentions = body
      .replace(/result\.geuRate/g, "")
      .replace(/geuRateBasis:/g, "")
      .replace(/geuRate:/g, "");
    assert.ok(
      !/geuRate/.test(rateMentions),
      "the receipt is built from the screen's displayed rate rather than the server's"
    );
  });

  test("nothing opens without a server reference", () => {
    assert.match(screen(), /if \(!result \|\| !result\.referenceId\) return;/);
  });

  test("the rate basis matches what the history route sends for the same movement", () => {
    assert.match(screen(), /geuRateBasis: minted \? "coin-per-fiat" : "fiat-per-coin"/);
  });

  test("the list prefers the durable history over the in-memory ledger", () => {
    const src = screen();
    assert.match(src, /const coinActivityRows = serverCoinHistory/);
    // And the empty state reads the same list, so "no coin activity yet"
    // cannot appear above rows or vice versa.
    assert.match(src, /\{!coinActivityRows\.length \?/);
  });

  test("one viewer object feeds both ways of opening a receipt", () => {
    // So the receipt seen at the till and the one reopened a week later
    // cannot describe the holder differently.
    const src = screen();
    assert.match(src, /const coinReceiptViewer = \{/);
    assert.equal((src.match(/coinReceiptViewer/g) || []).length, 3);
  });
});

describe("the holder's details come from the account", () => {
  const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
  const dash = () => readSource(DASH)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("name, Gloobal ID and flag are passed to the Coin screen", () => {
    // A Transaction row records ids, not a person's name, ID string or
    // country — so these come from the account or the receipt cannot show
    // them, which is the whole of what was asked for.
    const src = dash();
    assert.match(src, /holderName=\{myName\}/);
    assert.match(src, /holderSymbolId=\{currentSymbolId\}/);
    assert.match(src, /holderCountryFlag=\{dialCountry\.flag\}/);
  });

  test("the mint and redeem handlers return the whole result", () => {
    // They returned `true`, which is why the reference id, the fiat paid,
    // its currency and the rate were all discarded one line after arriving.
    const src = dash();
    assert.ok(!/showToast2\(`Bought \$\{result\.minted/.test(src), "the toast still stands in for a receipt");
    const at = src.indexOf("const handleMintCoin");
    const body = src.slice(at, src.indexOf("const handleRedeemCoin", at));
    assert.match(body, /return result;/);
    assert.ok(!/return true;/.test(body));
  });

  test("history is refreshed after a purchase, so the new row is there to reopen", () => {
    const src = dash();
    assert.match(src, /const refreshCoinLedger = async \(\) => \{/);
    assert.equal((src.match(/await refreshCoinLedger\(\);/g) || []).length, 3);
  });

  test("a failed history read leaves the last answer standing", () => {
    // null means the server could not answer, which is not "you have never
    // bought any" — and blanking a list because one request failed is the
    // defect this codebase already names elsewhere.
    assert.match(dash(), /if \(history\) setServerCoinHistory\(history\.rows\);/);
  });
});

describe("a coin reference is a transaction reference, in the same format as any other", () => {
  const server = () => readSource(SERVER)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("mint and redeem mint theirs through the shared resolver", () => {
    // Not a scheme of their own. `resolveTransactionReference` is what every
    // payment, share and settlement reference comes from, so a coin movement
    // and a payment are indistinguishable by their id — which is the point:
    // a person quoting a reference to support should not have to say which
    // kind of movement it was for it to be looked up.
    const src = server();
    for (const route of ["'/api/coin/mint'", "'/api/coin/redeem'"]) {
      const at = src.indexOf(`app.post(${route}`);
      assert.ok(at > 0, `${route} is gone`);
      const body = src.slice(at, at + 9000);
      assert.match(
        body,
        /const referenceId = await resolveTransactionReference\(\);/,
        `${route} no longer uses the shared reference generator`
      );
    }
  });

  test("and that resolver mints twenty Gloobal symbols", () => {
    const src = server();
    assert.match(src, /const TRANSACTION_REFERENCE_LENGTH = 20;/);
    assert.match(
      src,
      /reference \+= GLOOBAL_SYMBOLS\[crypto\.randomInt\(GLOOBAL_SYMBOLS\.length\)\];/
    );
    assert.match(src, /const GLOOBAL_SYMBOLS = \['−', '\+', '×', '=', '○', '□', '●', '■'\];/);
  });

  test("the client-side generator agrees on length and alphabet", () => {
    // A locally-minted id and a server-minted one have to be
    // indistinguishable in a receipt, which is only true while these two
    // agree.
    const gen = readSource("backend/utils/idGenerators.js");
    assert.match(gen, /var TXN_ID_LENGTH = 20;/);
    assert.match(gen, /DIAL_SYMBOLS\[Math\.floor\(Math\.random\(\) \* DIAL_SYMBOLS\.length\)\]/);
  });

  test("the coin receipt passes the reference through untouched", () => {
    // No prefix, no formatting, no grouping spaces. Grouping is a display
    // concern and this codebase already paid for putting it in the value —
    // an id copied from one screen did not match the same id typed into
    // another, and every consumer had to know to strip the spaces.
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.referenceId, MINT_REF);
    assert.equal(r.txnId, MINT_REF);
    assert.equal(r.txnId.length, 20);
    assert.ok(!/[-_ ]/.test(r.txnId), "the coin reference carries separators the others do not");
  });

  test("every symbol in it is from the shared alphabet", () => {
    const ALPHABET = new Set(["−", "+", "×", "=", "○", "□", "●", "■"]);
    for (const ref of [MINT_REF, REDEEM_REF, SEND_REF]) {
      assert.equal(ref.length, 20, `a fixture reference is not 20 symbols: ${ref}`);
      for (const ch of ref) {
        assert.ok(ALPHABET.has(ch), `a fixture reference uses a symbol outside the alphabet: ${ch}`);
      }
    }
  });
});

describe("a Gloobal ID on the receipt is a whole Gloobal ID", () => {
  test("the server accepts exactly twelve symbols and nothing shorter", () => {
    // Worth pinning next to the reference tests, because the two are the
    // same kind of value and were got wrong the same way in the same
    // fixtures. The length check here used to be a bare
    // `Array.from(id).length !== 12`, which accepted twelve of ANY character
    // — including Unicode lookalikes of the real symbols. In an app where
    // the ID is where the money goes, a registerable near-copy of a
    // merchant's ID is a misdirected-payment problem.
    const src = readSource(SERVER);
    assert.match(src, /const SYMBOL_ID_LENGTH = 12;/);
    assert.match(src, /if \(!isValidSymbolId\(cleanSymbolId\)\) \{/);
  });

  test("the fixtures here are twelve symbols of the real alphabet", () => {
    const ALPHABET = new Set(["−", "+", "×", "=", "○", "□", "●", "■"]);
    for (const id of [HOLDER_ID, OTHER_ID]) {
      assert.equal(
        Array.from(id).length, 12,
        `a fixture Gloobal ID is not 12 symbols: ${id}`
      );
      for (const ch of id) {
        assert.ok(ALPHABET.has(ch), `a fixture Gloobal ID uses a symbol outside the alphabet: ${ch}`);
      }
    }
  });

  test("the receipt shows it whole, without truncating or grouping it", () => {
    // ColoredGloobalId renders each symbol; the receipt hands it the value
    // unaltered. A shortened ID on a receipt is not a display choice — it is
    // an address nobody can pay back to.
    const r = M.coinReceiptFrom(BUY, VIEWER);
    assert.equal(r.holderSymbolId, HOLDER_ID);
    assert.equal(Array.from(r.holderSymbolId).length, 12);
  });
});
