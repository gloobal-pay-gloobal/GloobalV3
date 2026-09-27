// tests/notification-card.test.mjs
//
// A payment notification, as a card you can page through.
//
// The row it replaced said "You received 2,000.00 INR from Rajeev" and left
// the rest to the receipt. The card says the figure in its head and turns
// through the rest of the payment: who, the other side with its rate, their
// Gloobal ID, the transaction's own reference, and when.
//
// What this pins:
//   - the card is drawn for a payment and never for anything else;
//   - every page reads a field the SERVER recorded — nothing on it is worked
//     out here, and a page whose fields are missing is not drawn at all;
//   - the pages are the five asked for, in order;
//   - the head carries the direction, in the direction's colour, and tapping
//     it opens the payment; the chevron turns the page instead;
//   - the server records both sides of the payment and the counterparty's
//     country on the notification, so the card has them to read.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";
import { buildOnce, openPage, login, teardown, ACCOUNTS } from "./browser-harness.mjs";

const CARD = "frontend/components/cards/notificationCard.jsx";
const SHEET = "frontend/components/dialogs/NotificationsSheet.jsx";
const SERVER = "server/server.js";

describe("the card is built from what the server recorded", () => {
  const card = readSource(CARD);

  test("nothing on it is computed", () => {
    // No arithmetic on money at all: the pages read amount, counterAmount and
    // fxRate, and print them. A conversion worked out here would disagree
    // with the receipt by a rounding unit, which is the defect the receipt's
    // own conversion block exists to avoid.
    const pages = card.slice(card.indexOf("function gloobalNotifCardPages"), card.indexOf("function GloobalNotifCardDots"));
    assert.ok(!/[*/]\s*\d|\bconvert\(/.test(pages.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "the card is doing sums on money");
    assert.match(pages, /meta\.counterAmount/);
    assert.match(pages, /meta\.fxRate/);
  });

  test("a page with nothing to say is not drawn", () => {
    const pages = card.slice(card.indexOf("function gloobalNotifCardPages"), card.indexOf("function GloobalNotifCardDots"));
    for (const guard of ["meta.counterpartyName", "meta.counterpartySymbolId", "meta.referenceId"]) {
      assert.match(pages, new RegExp(`if \\(${guard.replace(".", "\\.")}\\)`), `${guard} is pushed unconditionally`);
    }
    // And the conversion page only when the payment really crossed one.
    assert.match(pages, /const crossed = meta\.counterCurrency && meta\.currency && meta\.counterCurrency !== meta\.currency;/);
  });

  test("the pages are the five asked for, in order", () => {
    const pages = card.slice(card.indexOf("function gloobalNotifCardPages"), card.indexOf("function GloobalNotifCardDots"));
    const keys = [...pages.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(keys, ["who", "money", "id", "txn", "when"]);
  });

  test("the head says the direction and opens the payment; the chevron turns the page", () => {
    assert.match(card, /const tint = sent \? T\.negative : T\.positive;/);
    assert.match(card, /onClick=\{onOpen\}/);
    assert.match(card, /onClick=\{turn\}/);
    assert.match(card, /aria-label="Next detail"/);
  });

  test("only a payment gets a card", () => {
    // A security notice has one fact and no pages, and a pager with a single
    // dot is a control that does nothing.
    assert.match(readSource(SHEET), /if \(row\.type === "payment"\) \{/);
    assert.match(readSource(SHEET), /<GloobalNotificationCard/);
  });

  test("the mark on the right is the app's own logo, not a third way of saying the direction", () => {
    // The sign, the colour of the figure and the word after it already say
    // which way the money went. What the corner carries instead is the app's
    // own flipping mark — the same one on the Send and Receive buttons and in
    // the corner of the receipt.
    assert.match(card, /src=\{G_LOGO_DATA_URI\}/);
    // A disc, in one of the app's own colours, chosen from the row's id so it
    // is stable rather than flickering on every render.
    assert.match(card, /borderRadius: "50%"/);
    assert.match(card, /const markColour = LOGO_FLIP_COLORS\[/);
    assert.match(card, /flipSeedHash\(row && row\.id\)/);
    assert.ok(!/ArrowUpRight|ArrowDownLeft/.test(card), "the direction arrow is back");
  });

  test("the flag is dressed the way the receipt dresses it", () => {
    // Same component, same disc, same rim: the notification and the document
    // it opens are about the same payment and should look it.
    assert.match(card, /shape="circle"[\s\S]{0,60}fit="cover"/);
    assert.match(card, /boxShadow: `0 0 0 2px \$\{T\.surface\}, 0 0 0 3px \$\{T\.line\}/);
  });

  test("the flag comes from the ISO code, never an emoji on the wire", () => {
    // FlagEmoji's own reason: the character is two Latin letters on most of
    // the platforms this app runs on.
    assert.match(card, /COUNTRY_BY_ISO\[iso\]/);
    assert.match(card, /<FlagEmoji\s+flag=\{counterpartyFlag\}/);
  });
});

describe("the server records what the card reads", () => {
  const server = readSource(SERVER);

  test("both sides of the payment, and the counterparty's country", () => {
    for (const field of ["metadata.counterpartyIso", "metadata.counterAmount", "metadata.counterCurrency", "metadata.fxRate"]) {
      assert.match(server, new RegExp(`'${field.replace(".", "\\.")}'`), `${field} is not recorded`);
    }
    // Each leg carries the OTHER party's figure, not its own twice.
    const record = server.slice(server.indexOf("async function recordPaymentNotifications"), server.indexOf("// ── Web Push for a payment"));
    assert.match(record, /counterAmount: payeeReceives,\s*\n\s*counterCurrency: destinationCurrency,/);
    assert.match(record, /counterAmount: debitAmount,\s*\n\s*counterCurrency: senderCurrency,/);
  });

  test("the rate is carried as stored, never inverted", () => {
    const record = server.slice(server.indexOf("async function recordPaymentNotifications"), server.indexOf("// ── Web Push for a payment"));
    assert.match(record, /const fxRate = Number\(transaction\.metadata\?\.fxRate\);/);
    assert.ok(!/1\s*\/\s*fxRate/.test(record), "the notification is inverting the rate");
  });

  test("and the route hands them to the app", () => {
    const pub = server.slice(server.indexOf("function publicNotification"), server.indexOf("function publicNotification") + 1400);
    for (const field of ["counterpartyIso", "counterAmount", "counterCurrency", "fxRate"]) {
      assert.match(pub, new RegExp(`${field}:`), `${field} is recorded but never sent`);
    }
  });
});

describe("in the app", () => {
  before(async () => {
    await buildOnce();
  });
  after(async () => {
    await teardown();
  });

  test("a payment notification opens as a card, and turns through its pages", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.japan;
    const { page, context, errors } = await openPage({
      account: B,
      // B is the receiver, so the notification is theirs; seeding it directly
      // is the same row the payment route would have written.
      // The harness seeds notifications as a flat list, each naming the
      // account it belongs to — the same shape the routes return.
      notifications: [
        {
          userSymbolId: B.symbolId,
          type: "payment",
          title: "Money received",
          message: `You received 2,000 ${B.currency} from ${A.fullName}`,
          metadata: {
            transactionId: "txn-1",
            referenceId: "■×□×+○●=○○□+−−=−+□□×",
            direction: "received",
            amount: 2000,
            currency: B.currency,
            counterAmount: 18.33,
            counterCurrency: "EUR",
            fxRate: 0.009165,
            counterpartyName: A.fullName,
            counterpartySymbolId: A.symbolId,
            counterpartyIso: A.countryIso
          }
        }
      ]
    });
    try {
      await login(page, B);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("gloobal:openNotifications")));
      const card = page.getByTestId("notification-card").first();
      await card.waitFor({ timeout: 20000 });
      assert.equal(await card.getAttribute("data-direction"), "received");
      assert.match(await card.innerText(), /\+.*received/s, "the head does not say what happened");

      // Five pages, turned by the chevron, each naming what it shows.
      const seen = [];
      for (let i = 0; i < 5; i++) {
        seen.push((await card.getByTestId("notification-card-page").innerText()).replace(/\s+/g, " ").trim());
        await card.getByRole("button", { name: "Next detail", exact: true }).click();
        await page.waitForTimeout(320);
      }
      assert.match(seen[0], /^From /);
      assert.match(seen[1], /Sender paid/);
      assert.match(seen[1], /0\.009165/, "the rate is not the one recorded");
      assert.match(seen[3], /Transaction ID/);
      // Twenty symbols, the payment's own reference, not a shortened form.
      assert.equal((seen[3].match(/[−+×=○□●■]/g) || []).length, 20);
      assert.match(seen[4], /Date and time/);
      // And it came back round to the first page.
      assert.match((await card.getByTestId("notification-card-page").innerText()).trim(), /^From/);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
});
