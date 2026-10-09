// tests/geu-notification.test.mjs
//
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome \
//     node --test tests/geu-notification.test.mjs
//
// A Gloobal Coin movement, as a notification.
//
// ── What was missing ─────────────────────────────────────────────────────
//
// Everything. Grep POST /api/coin/mint, /api/coin/redeem and /api/coin/send
// for "Notification" before this change and it does not appear once. Coin
// was the only kind of money in this app that could move without anybody
// being told: a transfer arrived and the receiving account found out by
// opening the Coin screen and noticing a larger number.
//
// That is the same hole the Creator Share had — see
// tests/creator-share-notification.test.mjs, whose shape this file follows
// deliberately, because it is the same fix.
//
// ── What this pins ───────────────────────────────────────────────────────
//
//   - all three movements write, and the model will accept the type;
//   - a buy and a sell are ONE row, a transfer is TWO;
//   - the figure is the COIN figure on every row, and the fiat leg is a
//     page beneath it;
//   - the rate is carried WITH THE PAIR IT IS A RATE BETWEEN, because the
//     two routes record it in opposite directions and a card told only the
//     number would print one of them backwards;
//   - nothing computes a figure, and a missing one does not become zero;
//   - the words on the card's first page and the words on the lock screen
//     are the same words, from one table on each side of the boundary;
//   - a notification failure cannot fail a movement that has committed.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadNotifCardPages } from "./harness.mjs";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const SERVER = "server/server.js";
const MODEL = "server/models/Notification.js";
const TEXT = "server/lib/notificationText.js";
const CARD = "frontend/components/cards/notificationCard.jsx";
const TICKER = "server/lib/coinTicker.js";

// Comments stripped before asserting on code. Twice this session a test has
// matched the note explaining a thing's removal instead of the thing.
const code = (relPath) => readSource(relPath)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const slice = (src, from, to) => {
  const at = src.indexOf(from);
  assert.ok(at >= 0, `could not find ${from}`);
  const end = to ? src.indexOf(to, at) : src.length;
  assert.ok(end > at, `could not find ${to} after ${from}`);
  return src.slice(at, end);
};

describe("every coin movement is announced", () => {
  const server = code(SERVER);
  const writer = slice(server, "async function recordCoinNotifications({", "async function announceCoinMovement(");

  test("there is a writer at all, and it is not the payment one", () => {
    // recordPaymentNotifications says in its own header that it is "only
    // ever called for the payment leg". Reusing it for coin would have made
    // a buy a payment from the reserve, which is not what happened.
    assert.match(server, /async function recordCoinNotifications\(\{/);
    assert.match(server, /type: 'coin',/);
  });

  test("all three routes call it, after the movement has committed", () => {
    // AFTER. Each call sits between the withMongoTransaction that moved the
    // coin and the res.json that answers, so a row exists by the time the
    // client's next read of the inbox happens — and a movement that was
    // rolled back never produces a notification about money that did not
    // move.
    for (const movement of ["mint", "redeem", "send"]) {
      assert.match(server, new RegExp(`movement: '${movement}',`),
        `nothing announces a coin ${movement}`);
    }
    const calls = server.match(/await announceCoinMovement\(\{/g) || [];
    assert.equal(calls.length, 3, `${calls.length} coin routes announce, not 3`);

    // Each call is inside its own route and before its own response.
    for (const [route, answer] of [
      ["app.post('/api/coin/mint'", "minted: coinAmount,"],
      ["app.post('/api/coin/redeem'", "redeemed: coinAmount,"],
      ["app.post('/api/coin/send'", "sent: coinAmount,"],
    ]) {
      const body = slice(server, route, answer);
      assert.match(body, /await announceCoinMovement\(\{/,
        `${route} answers without announcing anything`);
    }
  });

  test("the model will accept the type", () => {
    // A value missing from a Mongoose enum does not fall back to the
    // default — the write is rejected outright. Every coin notification
    // would have been silently dropped, and the only sign would have been a
    // line in the server log. That is exactly how the share notification
    // nearly shipped broken.
    assert.match(code(MODEL), /enum: \[[^\]]*'coin'[^\]]*\]/);
  });

  test("a buy and a sell are one row; a transfer is two", () => {
    // A payment and a share have two people and each person's side is a
    // different event to them. A buy and a sell have ONE: the holder,
    // converting their own money from one form into the other. The reserve
    // is the backing, not an account with an inbox.
    assert.match(writer, /const entries = movement === 'send'/);
    const send = slice(writer, "movement === 'send'", "    : [");
    assert.equal((send.match(/userId: /g) || []).length, 2, "a transfer does not notify both sides");
    const solo = slice(writer, "\n    : [", "  for (const entry of entries)");
    assert.equal((solo.match(/userId: /g) || []).length, 1, "a buy or a sell writes more than one row");
  });

  test("the reserve gets no Gloobal ID and no country", () => {
    // Both null, so the card draws no ID page and falls back to the coin
    // mark where a payment shows a flag. Inventing either would give the
    // backing of the currency an account and put it in a country.
    const solo = slice(writer, "\n    : [", "  for (const entry of entries)");
    assert.match(solo, /counterpartySymbolId: null,/);
    assert.match(solo, /counterpartyIso: null,/);
    // And the name it DOES get is the one the coin receipt has always
    // printed for this party, read from the one place it is declared.
    assert.match(solo, /counterpartyName: COIN_RESERVE_NAME,/);
    assert.match(code(TICKER), /const COIN_RESERVE_NAME = 'Gloobal Reserve';/);
    // The browser bundle's copy, which is the string the receipt prints.
    // Separate programs, no module between them — so the only mechanism
    // available is this assertion.
    assert.match(code("frontend/features/receipts/coinReceipt.js"),
      /var COIN_RESERVE_NAME = "Gloobal Reserve";/);
  });

  test("the figure is the COIN figure, on every row", () => {
    // A buy headed by the fiat figure is indistinguishable from a payment.
    // The headline is the thing the notification is ABOUT, and the money
    // that bought it is a page underneath.
    assert.match(writer, /'metadata\.amount': coinAmount,/);
    assert.match(writer, /'metadata\.currency': COIN_CURRENCY,/);
    assert.match(writer, /const coinAmount = Number\(transaction\.amount\);/);
    // And the direction follows the coin, so the sign agrees with the coin
    // balance the person is about to look at.
    assert.match(writer, /direction: movement === 'mint' \? 'received' : 'sent',/);
  });

  test("nothing in it computes a figure", () => {
    // Same rule as the payment and share writers: every number is one the
    // route that moved the money committed. A rate multiplied out here
    // would be a third figure reconciling with neither the receipt nor the
    // ledger.
    const sums = writer.match(/[a-zA-Z)\]] *[*/] *[a-zA-Z(]/g) || [];
    assert.deepEqual(sums, [], `the coin writer is doing arithmetic: ${sums.join(", ")}`);
  });

  test("a missing fiat leg is null, never zero", () => {
    // `Number(null)` is 0 and 0 is finite — the trap this codebase keeps
    // walking into, and the one the coin history shaper hit earlier in the
    // same breath as a comment forbidding it. A transfer genuinely has no
    // fiat leg; it must reach the card as nothing, not as a free conversion
    // at a rate of zero.
    assert.match(writer, /fiatAmount === null \|\| fiatAmount === undefined \|\| !Number\.isFinite\(Number\(fiatAmount\)\)/);
    assert.match(writer, /'metadata\.counterAmount': movement === 'send' \? null : fiat,/);
    assert.match(writer, /'metadata\.counterCurrency': movement === 'send' \? null : fiatUnit,/);
  });

  test("a replay does not buzz a phone twice", () => {
    // Same idempotency key as the payment and share legs: the partial
    // unique index on (userId, metadata.transactionId), and
    // `upsertedCount === 1` as the single permission to push. A second
    // de-duplication mechanism could disagree with the first, and then the
    // inbox and the lock screen would tell different stories.
    assert.match(writer, /\{ userId: entry\.userId, 'metadata\.transactionId': transactionId \}/);
    assert.match(writer, /\$setOnInsert: \{/);
    assert.match(writer, /\{ upsert: true \}/);
    assert.match(writer, /const created = result\.status === 'fulfilled' && result\.value\?\.upsertedCount === 1;/);
    // E11000 is the index refusing a concurrent insert, which is the same
    // outcome as a replay and is not an error.
    assert.match(writer, /result\.reason\?\.code !== 11000/);
  });

  test("a notification failure cannot fail a movement that committed", () => {
    // The coin routes' own catch blocks answer "Could not mint Gloobal
    // Coin." Reached from a notification throw that would be a lie about
    // money that had already moved — so the announcement carries its own
    // two catches, one per effect, the way the payment route does.
    const announce = slice(server, "async function announceCoinMovement(", "async function sendPaymentPushes(");
    assert.match(announce, /catch \(notificationError\)/);
    assert.match(announce, /catch \(pushError\)/);
    assert.match(announce, /console\.error\('Coin notification error \(non-fatal\)/);
    assert.match(announce, /console\.error\('Coin push error \(non-fatal\)/);
    // Two effects, two catches: folding them together logs a push failure
    // as an inbox failure.
    assert.ok(announce.indexOf("catch (notificationError)") < announce.indexOf("catch (pushError)"));
    // And it reuses the ONE pusher, which is the only place the tag, the
    // disc and the ?txn= link are decided.
    assert.match(announce, /await sendPaymentPushes\(legs, input\.transaction\);/);
  });
});

// ── The rate, and the direction it was recorded in ───────────────────────
//
// The two routes store reciprocals and both call it a rate:
//
//   mint     coinAmount = fiatAmount * geuRate     GEU per unit of fiat
//   redeem   fiatAmount = coinAmount * redeemRate  fiat per unit of GEU
//
// A card told only the number has to assume a direction, and whichever it
// assumed would be wrong for one of the two. For an Indian account at a peg
// of 1 the error is invisible, which is what makes it worth a test: for a US
// account it states the peg eighty-five times out, on a notification for a
// purchase that went through correctly.
describe("the coin rate carries its own direction", () => {
  const server = code(SERVER);

  test("the server records the pair, not just the number", () => {
    assert.match(server, /'metadata\.geuRate': movement === 'send' \? null : rate,/);
    assert.match(server, /'metadata\.geuRateBase': /);
    assert.match(server, /'metadata\.geuRateQuote': /);
  });

  test("the two routes name the pair in opposite orders", () => {
    const mint = slice(server, "app.post('/api/coin/mint'", "minted: coinAmount,");
    const redeem = slice(server, "app.post('/api/coin/redeem'", "redeemed: coinAmount,");
    // A buy: GEU per unit of the account's own currency.
    assert.match(mint, /geuRateBase: accountCurrency,\s*\n\s*geuRateQuote: COIN_CURRENCY,/);
    // A sell: the reciprocal, named the other way round.
    assert.match(redeem, /geuRateBase: COIN_CURRENCY,\s*\n\s*geuRateQuote: accountCurrency,/);
    // And each passes the rate its own route computed with, not the other's.
    assert.match(mint, /geuRate,/);
    assert.match(redeem, /geuRate: redeemRate,/);
  });

  test("it is its own field, never fxRate", () => {
    // fxRate holds a payment's rate under a different convention entirely —
    // one unit of the receiver's currency in the sender's. Two different
    // quantities in one field is how a card prints a confident wrong number.
    const writer = slice(server, "async function recordCoinNotifications({", "async function announceCoinMovement(");
    assert.ok(!/fxRate/.test(writer), "the coin writer is storing its rate as fxRate");
  });

  test("a transfer has no rate at all, and no pair either", () => {
    const writer = slice(server, "async function recordCoinNotifications({", "async function announceCoinMovement(");
    for (const field of ["geuRate", "geuRateBase", "geuRateQuote"]) {
      assert.match(writer, new RegExp(`'metadata\\.${field}': movement === 'send'`),
        `${field} is not withheld on a transfer`);
    }
  });
});

// ── What the card does with it ───────────────────────────────────────────
describe("the card reads a coin row", () => {
  const card = code(CARD);
  const pagesOf = loadNotifCardPages();

  const MINT = {
    direction: "received", coinMovement: "mint", amount: 1200, currency: "GEU",
    counterAmount: 1200, counterCurrency: "INR",
    geuRate: 1, geuRateBase: "INR", geuRateQuote: "GEU",
    counterpartyName: "Gloobal Reserve"
  };
  // The same buy from a US account, where a peg stated backwards is visible.
  const MINT_US = {
    ...MINT, amount: 8500, counterAmount: 100, counterCurrency: "USD",
    geuRate: 85, geuRateBase: "USD", geuRateQuote: "GEU"
  };
  const REDEEM = {
    direction: "sent", coinMovement: "redeem", amount: 300, currency: "GEU",
    counterAmount: 300, counterCurrency: "INR",
    geuRate: 1, geuRateBase: "GEU", geuRateQuote: "INR",
    counterpartyName: "Gloobal Reserve"
  };
  const SEND = {
    direction: "received", coinMovement: "send", amount: 50, currency: "GEU",
    counterpartyName: "Rajeev Menon", counterpartySymbolId: "GLB-RAJEEV-01", counterpartyIso: "IN"
  };

  const keysOf = (meta) => pagesOf(meta, "9 Oct 2026 · 14:07:02", { type: "coin" }).map((p) => p.key);
  const pageOf = (meta, key) => pagesOf(meta, "9 Oct 2026 · 14:07:02", { type: "coin" }).find((p) => p.key === key) || {};

  test("a coin movement is money, so it gets the money pages", () => {
    assert.match(card, /var GLOOBAL_NOTIF_MONEY_TYPES = \["payment", "share", "coin"\]/);
    assert.deepEqual(keysOf(MINT), ["who", "currency", "money", "when"]);
    assert.deepEqual(keysOf(REDEEM), ["who", "currency", "money", "when"]);
    // A transfer is coin to coin, one unit on both sides: no conversion
    // page, and a real person's Gloobal ID where the reserve has none.
    assert.deepEqual(keysOf(SEND), ["who", "currency", "id", "when"]);
  });

  test("a buy says Bought and a sell says Sold", () => {
    // Through paymentBannerText a buy would read "+1,200.00 GEU / From
    // Gloobal Reserve", which says somebody sent it — to a person who had
    // just spent their own money on it.
    assert.equal(pageOf(MINT, "who").label, "Bought from");
    assert.equal(pageOf(MINT, "who").text, "Gloobal Reserve");
    assert.equal(pageOf(REDEEM, "who").label, "Sold to");
    // A transfer IS a payment, so it keeps the payment's words.
    assert.equal(pageOf(SEND, "who").label, "From");
    assert.equal(pageOf({ ...SEND, direction: "sent" }, "who").label, "To");
  });

  test("the unit is written out, and GEU is not asked of the platform", () => {
    // GEU is not an ISO currency and never will be, so Intl has no name for
    // it; the app's own constant answers before the platform is asked.
    assert.equal(pageOf(MINT, "currency").text, "Gloobal Energy Unit · GEU");
    assert.equal(pageOf(SEND, "currency").text, "Gloobal Energy Unit · GEU");
    assert.match(card, /COIN_TICKER_LONG/);
  });

  test("the fiat leg is labelled for what it was, not for a sender", () => {
    assert.equal(pageOf(MINT, "money").label, "Paid with");
    assert.equal(pageOf(REDEEM, "money").label, "Paid out");
    assert.match(String(pageOf(MINT, "money").text), /1,200\.00/);
    assert.match(String(pageOf(REDEEM, "money").text), /300\.00/);
  });

  test("the rate prints in the direction it was recorded", () => {
    assert.equal(pageOf(MINT, "money").note, "1 INR = 1.000000 GEU");
    assert.equal(pageOf(REDEEM, "money").note, "1 GEU = 1.000000 INR");
    // THE ONE THAT WOULD HAVE BEEN WRONG. A buy from a US account, where
    // the payment convention would have derived "1 GEU = 85.000000 USD" —
    // one coin buying eighty-five dollars, against a peg of one.
    assert.equal(pageOf(MINT_US, "money").note, "1 USD = 85.000000 GEU");
    assert.ok(!/1 GEU = 85/.test(String(pageOf(MINT_US, "money").note)));
  });

  test("a rate with no pair states nothing, rather than guessing", () => {
    const orphan = { ...MINT, geuRateBase: null, geuRateQuote: null };
    assert.equal(pageOf(orphan, "money").note, null);
    // The figures above it are still true, so the page is still drawn.
    assert.match(String(pageOf(orphan, "money").text), /1,200\.00/);
  });

  test("a transfer states no rate and no conversion", () => {
    assert.equal(pageOf(SEND, "money").note, undefined);
    assert.equal(pagesOf(SEND, "", { type: "coin" }).find((p) => p.key === "money"), undefined);
  });
});

describe("the coin banner and the coin card say the same thing", () => {
  const pagesOf = loadNotifCardPages();

  test("the server composes coin wording in the one shared file", () => {
    assert.match(code(TEXT), /function coinBannerText\(\{/);
    assert.match(code(TEXT), /function coinWhoLabel\(\{/);
    // And server.js uses it rather than writing its own two strings.
    assert.match(code(SERVER), /const banner = coinBannerText\(\{/);
  });

  test("the lock screen and the card's first page use the same words", async () => {
    const { coinBannerText } = await import("../server/lib/notificationText.js");
    const labelOf = (meta) => (pagesOf(meta, "", { type: "coin" }).find((p) => p.key === "who") || {}).label;
    const cases = [
      { movement: "mint", direction: "received" },
      { movement: "redeem", direction: "sent" },
      { movement: "send", direction: "sent" },
      { movement: "send", direction: "received" },
    ];
    for (const c of cases) {
      const name = "Gloobal Reserve";
      const banner = coinBannerText({ ...c, amount: 100, currency: "GEU", counterpartyName: name });
      const label = labelOf({ direction: c.direction, coinMovement: c.movement, counterpartyName: name, currency: "GEU" });
      assert.equal(banner.body, `${label} ${name}`,
        `the lock screen says "${banner.body}" and the card says "${label} ${name}"`);
    }
  });

  test("a movement with no figure says what happened, not plus zero", async () => {
    // `Number(null)` is 0 and 0 is finite, which is how "+0.00" with no
    // unit reaches a lock screen as a statement of fact about somebody's
    // money.
    const { coinBannerText } = await import("../server/lib/notificationText.js");
    assert.equal(coinBannerText({ movement: "mint", direction: "received" }).title, "Gloobal Coin bought");
    assert.equal(coinBannerText({ movement: "redeem", direction: "sent" }).title, "Gloobal Coin sold");
    assert.equal(coinBannerText({ movement: "send", direction: "sent" }).title, "Gloobal Coin sent");
    assert.equal(coinBannerText({ movement: "send", direction: "received" }).title, "Gloobal Coin received");
  });

  test("the sign is a minus, not a hyphen, and it follows the coin", async () => {
    const { coinBannerText } = await import("../server/lib/notificationText.js");
    const buy = coinBannerText({ movement: "mint", direction: "received", amount: 1200, currency: "GEU" });
    const sell = coinBannerText({ movement: "redeem", direction: "sent", amount: 300, currency: "GEU" });
    assert.equal(buy.title, "+1,200.00 GEU");
    assert.equal(sell.title, "−300.00 GEU");
  });

  test("a coin row has a mark for the slot a flag would fill", () => {
    // The card closes its head with the counterparty's flag, and a buy has
    // no counterparty with a country. Without an entry here it fell through
    // to the generic info disc, which says nothing about money.
    assert.match(code("frontend/components/dialogs/NotificationsSheet.jsx"),
      /if \(type === "coin"\) return \{ Icon: CoinsNotifSheet/);
    assert.match(readSource("frontend/components/dialogs/NotificationsSheet.jsx"),
      /Coins as CoinsNotifSheet/);
  });
});

describe("on screen", () => {
  let page;
  let errors;

  const ME = ACCOUNTS.india;
  const FRIEND = ACCOUNTS.britain;

  before(async () => {
    await buildOnce();
    const opened = await openPage({
      account: ME,
      notifications: [
        {
          userSymbolId: ME.symbolId,
          type: "coin",
          title: "Gloobal Coin bought",
          message: "You bought 1,200.00 GEU for 1,200.00 INR",
          metadata: {
            transactionId: "coin-buy-1",
            referenceId: "GLB-BUY-0001",
            occurredAt: "2031-03-14T09:26:53.000Z",
            direction: "received",
            coinMovement: "mint",
            amount: 1200,
            currency: "GEU",
            counterAmount: 1200,
            counterCurrency: "INR",
            geuRate: 1,
            geuRateBase: "INR",
            geuRateQuote: "GEU",
            counterpartyName: "Gloobal Reserve",
            counterpartySymbolId: null,
            counterpartyIso: null
          }
        },
        {
          userSymbolId: ME.symbolId,
          type: "coin",
          title: "Gloobal Coin received",
          message: `You received 50.00 GEU from ${FRIEND.fullName}`,
          metadata: {
            transactionId: "coin-send-1",
            referenceId: "GLB-COIN-0007",
            occurredAt: "2031-03-14T10:02:11.000Z",
            direction: "received",
            coinMovement: "send",
            amount: 50,
            currency: "GEU",
            counterAmount: null,
            counterCurrency: null,
            geuRate: null,
            counterpartyName: FRIEND.fullName,
            counterpartySymbolId: FRIEND.symbolId,
            counterpartyIso: "GB"
          }
        }
      ]
    });
    page = opened.page;
    errors = opened.errors;
    await login(page, ME);
  });

  after(async () => {
    await teardown();
  });

  const openSheet = async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("gloobal:openNotifications")));
    await page.waitForTimeout(2500);
  };

  // The card for one movement, found by what it SAYS rather than by its
  // position: the order of two rows in the sheet is the sheet's business,
  // and a test that pinned it would fail the day that sort changed for a
  // reason with nothing to do with coin.
  const cardSaying = async (text) => {
    const cards = await page.$$('[data-testid="notification-card"]');
    for (const card of cards) {
      if ((await card.innerText()).includes(text)) return card;
    }
    const seen = [];
    for (const card of cards) seen.push((await card.innerText()).replace(/\s+/g, " "));
    assert.fail(`no card saying "${text}". On screen: ${JSON.stringify(seen)}`);
  };

  // Four pages, read in order, the chevron turning each one.
  const turnThrough = async (card, count) => {
    const seen = [];
    for (let i = 0; i < count; i += 1) {
      const panel = await card.$('[data-testid="notification-card-page"]');
      seen.push((await panel.innerText()).replace(/\s+/g, " ").trim());
      await (await card.$('button[aria-label="Next detail"]')).click();
      await page.waitForTimeout(320);
    }
    return seen;
  };

  test("a buy draws as a card, and turns through its pages", async () => {
    await openSheet();
    const cards = await page.$$('[data-testid="notification-card"]');
    assert.ok(cards.length >= 2, `only ${cards.length} cards drawn`);

    const buy = await cardSaying("Bought from");
    const head = (await buy.innerText()).replace(/\s+/g, " ");
    assert.match(head, /\+1,200\.00 GEU/, `the head does not carry the coin figure: ${head}`);

    const seen = await turnThrough(buy, 4);
    assert.match(seen[0], /^Bought from Gloobal Reserve$/, `page 1: ${seen[0]}`);
    assert.match(seen[1], /^Currency Gloobal Energy Unit · GEU$/, `page 2: ${seen[1]}`);
    assert.match(seen[2], /^Paid with 1,200\.00/, `page 3: ${seen[2]}`);
    assert.match(seen[2], /1 INR = 1\.000000 GEU/, `the rate is not the recorded one: ${seen[2]}`);
    assert.match(seen[3], /Date and time/);
    assert.match(seen[3], /Mar 14, 2031/, `the card is not showing the movement's own time: ${seen[3]}`);
    // NO REFERENCE PAGE. Not on a coin row either.
    assert.ok(!seen.some((s) => /GLB-BUY/.test(s)), "a transaction reference is on the card");
    // And it came back round to the first page.
    const back = await buy.$('[data-testid="notification-card-page"]');
    assert.match((await back.innerText()).replace(/\s+/g, " ").trim(), /^Bought from/);
  });

  test("a transfer shows the person and their Gloobal ID, and no conversion", async () => {
    const transfer = await cardSaying(FRIEND.fullName);
    const head = (await transfer.innerText()).replace(/\s+/g, " ");
    assert.match(head, /\+50\.00 GEU/, `the head does not carry the coin figure: ${head}`);

    const seen = await turnThrough(transfer, 4);
    assert.match(seen[0], new RegExp(`^From ${FRIEND.fullName}$`), `page 1: ${seen[0]}`);
    assert.match(seen[1], /^Currency Gloobal Energy Unit · GEU$/, `page 2: ${seen[1]}`);
    // Their Gloobal ID, drawn as the coloured symbols every other screen
    // draws one with.
    assert.equal((seen[2].match(/[−+×=○□●■]/g) || []).length, FRIEND.symbolId.length,
      `page 3 is not a Gloobal ID: ${seen[2]}`);
    assert.match(seen[3], /Date and time/);
    // Coin to coin: nothing was converted, so nothing is stated about a rate.
    assert.ok(!seen.some((s) => /Paid with|Paid out|1 GEU =/.test(s)),
      "a transfer is claiming a conversion");
  });

  test("nothing threw", async () => {
    assert.deepEqual(errors, []);
  });
});
