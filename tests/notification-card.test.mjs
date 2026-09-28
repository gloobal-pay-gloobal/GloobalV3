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
    // A disc, in one of the app's own colours, chosen from the payment's own
    // reference so it is stable rather than flickering on every render — and
    // so the lock screen, which is drawn by the operating system from a
    // pre-rendered image, can pick the same one.
    assert.match(card, /borderRadius: "50%"/);
    assert.match(card, /const markColour = LOGO_FLIP_COLORS\[gloobalNotifDiscIndex\(/);
    assert.match(card, /flipSeedHash\(id\)/);
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

describe("an account keeps its last five", () => {
  const server = readSource(SERVER);

  test("the cap is one number, and the route cannot be asked past it", () => {
    // The inbox is a nudge, not a ledger: every payment it announces is in
    // History with its receipt, and the receipt is the record.
    assert.match(server, /const NOTIFICATION_KEEP = 5;/);
    assert.match(server, /\? Math\.min\(NOTIFICATION_KEEP, Math\.max\(1, requested\)\)\s*\n\s*: NOTIFICATION_KEEP;/);
    assert.match(readSource(SHEET), /var GLOOBAL_NOTIF_SHEET_PAGE = 5;/);
  });

  test("pruning keeps the newest, runs after a write, and never fails the payment", () => {
    const prune = server.slice(server.indexOf("async function pruneNotifications"), server.indexOf("const notificationNotFound"));
    assert.match(prune, /\.sort\(\{ createdAt: -1, _id: -1 \}\)/, "the prune is not keeping the newest");
    assert.match(prune, /\.limit\(NOTIFICATION_KEEP\)/);
    assert.match(prune, /_id: \{ \$nin: keep\.map/);
    // Fewer than the cap is not a prune — a deleteMany with an empty keep set
    // would empty the inbox.
    assert.match(prune, /if \(keep\.length < NOTIFICATION_KEEP\) return 0;/);
    assert.match(prune, /catch \(error\)/, "a failed prune can fail a payment");
    // Called for both legs of a payment, and for a campaign row.
    assert.match(server, /for \(const entry of entries\) await pruneNotifications\(entry\.userId\);/);
    assert.match(server, /notified \+= 1;\s*\n\s*await pruneNotifications\(userId\);/);
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

// ── One payment, one notification, three places it is drawn ──────────────
//
// In the app it is the card above. Backgrounded, the page puts a banner in
// the tray itself. Closed, the server pushes one and the service worker
// shows it. They used to say three different things about one event —
// "−250.00₹ sent", "250.00₹ sent" and "Payment Sent" over "250.00 INR sent
// to Chdg" — so which wording you got depended on where your thumb had been
// half a minute earlier, and the sign that tells you which way the money
// went appeared in exactly one of them.
//
// The first two now share gloobalNotifHeadline / gloobalNotifSubline. The
// third cannot: `server/` is a separate npm package deployed from its own
// root directory, with no module boundary to import across — the same
// reason GLOOBAL_ZERO_DECIMAL_CURRENCIES exists twice. So the copy is
// deliberate and this is what keeps it honest: the frontend's two functions
// are lifted out of their source and RUN, against the app's own money
// formatter, and their output is compared to the server's for the same
// fields. A divergence fails here rather than on somebody's lock screen.
describe("the banner says what the card says", () => {
  const card = readSource(CARD);
  const HOOK = "frontend/hooks/usePaymentNotifications.js";
  const SW = "gloobal-essentials-preview/src/push-sw-core.js";

  // The frontend's headline and subline, evaluated for real. `fmtMoney` and
  // the currency table are the app's own, lifted the same way, so this is
  // the string the card actually draws and not a restatement of it.
  const lift = (source, name) => {
    const at = source.indexOf(`function ${name}(`);
    assert.notEqual(at, -1, `${name} is gone`);
    // To the line that closes the declaration at column 0.
    const end = source.indexOf("\n}\n", at);
    assert.notEqual(end, -1, `${name} is not a top-level declaration`);
    return source.slice(at, end + 3);
  };
  const currencies = readSource("backend/data/currencies.js");
  const format = readSource("backend/utils/format.js");
  const symbols = currencies.slice(
    currencies.indexOf("var CURRENCY_SYMBOL = {"),
    currencies.indexOf("\n};\n", currencies.indexOf("var CURRENCY_SYMBOL = {")) + 3
  );
  const zeroDecimal = format.slice(
    format.indexOf("var GLOOBAL_ZERO_DECIMAL_CURRENCIES = ["),
    format.indexOf("\n];\n", format.indexOf("var GLOOBAL_ZERO_DECIMAL_CURRENCIES = [")) + 3
  );
  const frontend = new Function(`
    ${symbols}
    ${zeroDecimal}
    ${lift(format, "currencyDecimals")}
    ${lift(format, "fmt")}
    ${lift(format, "currencySuffix")}
    ${lift(format, "fmtMoney")}
    ${lift(card, "gloobalNotifHeadline")}
    ${lift(card, "gloobalNotifSubline")}
    ${lift(card, "gloobalNotifDiscIndex")}
    function flipSeedHash(value) {
      let hash = 5381;
      const text = String(value || "");
      for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
      return hash;
    }
    var LOGO_FLIP_COLORS = new Array(8);
    return { gloobalNotifHeadline, gloobalNotifSubline, gloobalNotifDiscIndex };
  `)();

  const CASES = [
    { direction: "sent", amount: 250, currency: "INR", counterpartyName: "Chdg" },
    { direction: "received", amount: 9800, currency: "INR", counterpartyName: "Rajeev" },
    // Zero-decimal, and a symbol that is letters and so takes a space.
    { direction: "received", amount: 750000, currency: "JPY", counterpartyName: "Aiko" },
    { direction: "sent", amount: 1450.25, currency: "CHF", counterpartyName: "Ann" },
    // No counterparty: both sides must fall back to the same sentence.
    { direction: "sent", amount: 12, currency: "USD", counterpartyName: null },
    { direction: "received", amount: 12, currency: "USD", counterpartyName: null }
  ];

  test("the two copies produce the same two lines, for every shape of payment", async () => {
    const { paymentBannerText } = await import("../server/lib/notificationText.js");
    for (const meta of CASES) {
      const server = paymentBannerText(meta);
      assert.equal(server.title, frontend.gloobalNotifHeadline(meta), `title for ${meta.currency} ${meta.direction}`);
      assert.equal(server.body, frontend.gloobalNotifSubline(meta), `body for ${meta.currency} ${meta.direction}`);
    }
  });

  test("the headline carries the sign, and it is a minus, not a hyphen", () => {
    // U+2212. A hyphen next to a figure reads as a dash between two things.
    assert.equal(frontend.gloobalNotifHeadline(CASES[0]).charAt(0), "−");
    assert.equal(frontend.gloobalNotifHeadline(CASES[1]).charAt(0), "+");
    assert.match(frontend.gloobalNotifHeadline(CASES[0]), /sent$/);
    assert.match(frontend.gloobalNotifHeadline(CASES[1]), /received$/);
  });

  test("the page's own banner uses those functions rather than composing its own", () => {
    const hook = readSource(HOOK);
    assert.match(hook, /\? gloobalNotifHeadline\(meta\)/);
    assert.match(hook, /body: gloobalNotifSubline\(meta\)/);
    assert.match(hook, /icon: gloobalNotifDiscIcon\(txnId\)/);
    // Both entry points go through the one builder.
    assert.match(hook, /function notifyPaymentReceived[\s\S]{0,400}notifyPaymentEvent\(\{ direction: "received"/);
    assert.match(hook, /function notifyPaymentSent[\s\S]{0,400}notifyPaymentEvent\(\{ direction: "sent"/);
  });
});

describe("the disc the lock screen is drawn with", () => {
  const card = readSource(CARD);
  const SW = "gloobal-essentials-preview/src/push-sw-core.js";
  const THEME = "frontend/constants/theme.js";
  const DISCS = "tools/icons/build-notif-discs.py";

  test("there is one image per colour, and the order is the palette's", async () => {
    // disc-3.png is LOGO_FLIP_COLORS[3] and nothing else: the index is what
    // the card, the worker and the server each compute independently, so a
    // reordered palette without a re-run makes them disagree.
    const palette = readSource(THEME).match(/var LOGO_FLIP_COLORS = \[([^\]]+)\]/);
    assert.ok(palette, "LOGO_FLIP_COLORS is gone");
    const colours = palette[1].match(/#[0-9A-Fa-f]{6}/g);
    const drawn = readSource(DISCS).match(/^COLORS = \[([^\]]+)\]/m);
    assert.ok(drawn, "the disc script no longer declares its colours");
    assert.deepEqual(drawn[1].match(/#[0-9A-Fa-f]{6}/g), colours, "the discs and the palette disagree");

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(new URL("../gloobal-essentials-preview/public/icons/notif", import.meta.url));
    assert.deepEqual(
      files.filter((f) => f.endsWith(".png")).sort(),
      colours.map((_, i) => `disc-${i}.png`).sort(),
      "a colour has no image, or an image has no colour"
    );
  });

  test("the two hashes agree, bucket for bucket", async () => {
    const { notifDiscIndex } = await import("../server/lib/notificationText.js");
    const frontendIndex = new Function(`
      function flipSeedHash(value) {
        let hash = 5381;
        const text = String(value || "");
        for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
        return hash;
      }
      var LOGO_FLIP_COLORS = new Array(8);
      ${card.slice(card.indexOf("function gloobalNotifDiscIndex("), card.indexOf("\n}\n", card.indexOf("function gloobalNotifDiscIndex(")) + 3)}
      return gloobalNotifDiscIndex;
    `)();
    // Enough ids to land in every bucket if the two ever drift.
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) {
      const id = `${i}`;
      assert.equal(notifDiscIndex(id), frontendIndex(id), `the two hashes disagree on ${id}`);
      seen.add(frontendIndex(id));
    }
    assert.equal(seen.size, 8, "the hash is not using the whole palette");
  });

  test("the worker only accepts a disc this app ships", () => {
    // An icon URL is a request this origin makes on behalf of whoever sent
    // the payload. An arbitrary one would let anything that could inject a
    // payload learn that this device woke up, and when.
    const sw = readSource(SW);
    assert.match(sw, /var GLOOBAL_PUSH_DISC = \/\^\\\/icons\\\/notif\\\/disc-\[0-7\]\\\.png\$\//);
    assert.match(sw, /GLOOBAL_PUSH_DISC\.test\(parsed\.icon\.trim\(\)\)/);
    assert.match(sw, /icon: payload\.icon \|\| GLOOBAL_PUSH_ICON/);
    // The badge is drawn as a monochrome silhouette, so a colour there is
    // thrown away.
    assert.match(sw, /badge: GLOOBAL_PUSH_ICON/);
  });

  test("the server sends one only when it can be the same one the card picks", () => {
    // Seeded on the referenceId, which metadata.referenceId gives the card
    // too. A payment minted without one gets no disc rather than a disc
    // picked from a different string — which is the wrong colour seven
    // times in eight.
    const server = readSource(SERVER);
    assert.match(server, /const icon = transaction\.referenceId \? notifDiscIcon\(String\(transaction\.referenceId\)\) : null;/);
    assert.match(card, /gloobalNotifDiscIndex\(meta\.referenceId \|\| \(row && row\.id\)\)/);
  });
});

describe("the list does not squash what it holds", () => {
  const sheet = readSource(SHEET);
  const card = readSource(CARD);

  test("the scroll area takes the leftover height instead of taking it from the rows", () => {
    // The bug this pins: the sheet is a column, the list inside it was a
    // column too with no flex sizing, so the sheet's maxHeight was paid for
    // by shrinking every card — each squeezed to a fraction of its height,
    // `overflow: hidden` slicing the flag and the logo into domes, and rows
    // that looked like they were sitting on top of one another.
    //
    // `minHeight: 0` is the half that is usually missing: a flex item's
    // default `min-height: auto` refuses to go below its content, so the
    // scroll never starts and the overflow is pushed back into the children.
    const list = sheet.slice(sheet.indexOf("overflowY: \"auto\"") - 1400, sheet.indexOf("overflowY: \"auto\"") + 200);
    assert.match(list, /flex: 1,\s*\n\s*minHeight: 0,\s*\n\s*overflowY: "auto"/);
  });

  test("and nothing in it is allowed to shrink anyway", () => {
    assert.match(card, /flexShrink: 0,\s*\n\s*overflow: "hidden"/);
    assert.match(sheet, /width: "100%",\s*\n(\s*\/\/[^\n]*\n)*\s*flexShrink: 0,/);
  });
});
