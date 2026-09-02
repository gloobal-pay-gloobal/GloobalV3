// Who a receipt says the payment was with — verified in a real browser.
//
//   node --test tests/receipt-counterparty.test.mjs
//
// The requirement:
//
//   sender's receipt    ->  "To"    + the RECEIVER's name, Gloobal ID, flag
//   receiver's receipt  ->  "From"  + the SENDER's name, Gloobal ID, flag
//
// and the same payment reopened from saved history must say exactly the same
// thing as the receipt shown the moment it was paid.
//
// Why all of that is asserted in one walk rather than as separate unit tests:
// the defect was not in any single layer. The server never sent the
// counterparty's country, the client mapper dropped their Gloobal ID, and the
// receipt rendered a flag it was never given — each layer looked locally
// reasonable and the fact was gone by the end of the chain. Only walking
// payment -> history -> reopened receipt catches that, and only doing it as
// both parties catches a direction that has been reversed.
//
// Runs on the same rig as browser.test.mjs: the real bundle, served over http,
// with a controllable fake of the Gloobal API behind it. The fake now keeps a
// ledger and projects it per viewer the way server.js does, so "reopen from
// history" and "log in as the payee" are real round trips rather than stubs.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTS,
  buildOnce,
  login,
  openPage,
  teardown
} from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// Pays `receiverGets` of the payee's own currency, and leaves the immediate
// receipt open. Deliberately the real screens the whole way — a test that
// shortcut to the receipt could not notice the receipt never being reached.
async function pay(page, { sender, receiver, receiverGets }) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of receiver.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });

  const field = page.getByLabel(`Amount the receiver gets, in their own currency (${receiver.currency})`);
  await field.waitFor({ timeout: 25000 });
  await field.fill(String(receiverGets));
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });

  const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await paySheet.waitFor({ timeout: 20000 });
  await tap(paySheet.getByRole("button", { name: /Bank$/i }).first());

  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const digit of sender.pin) {
    await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
  }
  await page.waitForTimeout(2500);

  const biometric = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
  if (await biometric.count()) {
    await tap(biometric.first());
    await page.waitForTimeout(1500);
    if (await page.getByLabel("Digit 1", { exact: true }).count()) {
      for (const digit of sender.pin) {
        await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
      }
      const submit = page.getByLabel("Log in", { exact: true });
      if (await submit.count()) await tap(submit.last());
    }
  }

  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 45000 });
}

// What the open receipt actually says about the other party.
//
// The flag is read as the IMAGE the flag component loads, not as text: the
// receipt used to print the emoji character, which on a headless Chromium (and
// on Windows generally) is not a flag at all but the two regional-indicator
// letters. Asserting on the img `src` is what tells a real flag apart from a
// pair of letters that happen to look right in a font that has them.
async function readReceipt(page) {
  const row = page.getByTestId("receipt-counterparty");
  await row.waitFor({ timeout: 20000 });
  // DIRECT children only. A ReceiptRow is <div><span>label</span><span>value
  // </span></div>, but the Gloobal ID row's label is a <GloobalWordmark>,
  // which is itself made of spans — an unscoped `span` selector walks into it
  // and returns the wordmark's own text instead of the ID.
  const label = (await row.locator("> span").first().innerText()).trim();
  const name = (await row.locator("> span").nth(1).innerText()).trim();

  const idRow = page.getByTestId("receipt-counterparty-id");
  const gloobalId = (await idRow.count())
    ? (await idRow.locator("> span").nth(1).innerText()).replace(/\s+/g, "")
    : "";

  const flagImg = page.getByTestId("receipt-flag").locator("img").first();
  const flagSrc = (await flagImg.count()) ? await flagImg.getAttribute("src") : "";

  return { label, name, gloobalId, flagSrc };
}

const flagIsoOf = (src) => {
  const m = String(src || "").match(/flagcdn\.com\/w\d+\/([a-z]{2})\.png/);
  return m ? m[1].toUpperCase() : null;
};

// Closes the receipt and walks Profile -> History, then opens the row for
// `counterpartyName` from the given column.
async function reopenFromHistory(page, { counterpartyName, column }) {
  const done = page.getByRole("button", { name: /^(Done|Close)$/i });
  if (await done.count()) await tap(done.first());
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await tap(page.getByRole("button", { name: /^History$/i }).first());
  await page.waitForTimeout(1500);

  // The two columns are scroll-snapped side by side; "receiving" is first.
  if (column === "sending") {
    await page.evaluate(() => {
      const scroller = [...document.querySelectorAll("div")].find(
        (d) => d.scrollWidth > d.clientWidth + 50 && d.clientWidth > 200
      );
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    });
    await page.waitForTimeout(900);
  }

  await tap(page.getByRole("button", { name: new RegExp(`^${counterpartyName},`) }).first());
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
}

const openSender = (account) =>
  openPage({
    account,
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 }
  });

describe("a receipt names the other party, on both sides and after a reload", () => {
  const corridors = [
    // £20, not £100: the Indian account opens with 10,000 rupees and £100
    // costs about 10,500 of them, so a larger figure is refused for lack of
    // funds before it can ever reach a receipt. The corridor is the point
    // here, not the size of it.
    { from: "india", to: "britain", gets: 20, note: "India -> UK (Example A)" },
    { from: "america", to: "india", gets: 5000, note: "USA -> India (Example B)" },
    { from: "japan", to: "mexico", gets: 500, note: "Japan -> Mexico" },
    { from: "britain", to: "america", gets: 100, note: "UK -> USA" }
  ];

  for (const corridor of corridors) {
    const A = ACCOUNTS[corridor.from];
    const B = ACCOUNTS[corridor.to];

    test(corridor.note, async () => {
      const { page, context } = await openSender(A);
      await login(page, A);
      await pay(page, { sender: A, receiver: B, receiverGets: corridor.gets });

      // ---- 1. THE SEND RECEIPT: To + B's name, B's ID, B's flag
      const sent = await readReceipt(page);
      assert.equal(sent.label, "To", `the sender's receipt must say To, it said "${sent.label}"`);
      assert.equal(sent.name, B.fullName, `it must name the payee, it named "${sent.name}"`);
      assert.equal(sent.gloobalId, B.symbolId, `it must carry the payee's Gloobal ID, it carried "${sent.gloobalId}"`);
      assert.equal(
        flagIsoOf(sent.flagSrc),
        B.countryIso,
        `it must show ${B.countryIso}'s flag, it showed ${flagIsoOf(sent.flagSrc)} (${sent.flagSrc})`
      );
      assert.notEqual(sent.gloobalId, A.symbolId, "the payer's own ID must never appear as the counterparty");
      assert.notEqual(flagIsoOf(sent.flagSrc), A.countryIso, "nor the payer's own flag");

      // ---- 2. THE SAME PAYMENT, REOPENED FROM SAVED HISTORY
      await reopenFromHistory(page, { counterpartyName: B.fullName, column: "sending" });
      const reopened = await readReceipt(page);
      assert.deepEqual(
        { label: reopened.label, name: reopened.name, id: reopened.gloobalId, iso: flagIsoOf(reopened.flagSrc) },
        { label: "To", name: B.fullName, id: B.symbolId, iso: B.countryIso },
        "the reopened receipt must say exactly what the immediate one said"
      );

      await context.close();
    });
  }

  test("the payee's own receipt says From, and names the payer", async () => {
    // The half that could not be reached before: B logs in on the same device
    // and opens what arrived. The direction is decided by the server from the
    // transaction's own sender id, so this is the check that a reversed
    // projection cannot survive.
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.britain;

    const { page, context } = await openSender(A);
    await login(page, A);
    // Same affordability reason as the corridor table above.
    await pay(page, { sender: A, receiver: B, receiverGets: 20 });

    // Sign out of A and in as B, on the same device.
    const done = page.getByRole("button", { name: /^(Done|Close)$/i });
    if (await done.count()) await tap(done.first());
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
    await tap(page.getByRole("button", { name: /^Exit$/i }).first());
    await page.getByLabel("Flip to log in", { exact: true }).waitFor({ timeout: 25000 });
    await tap(page.getByLabel("Flip to log in", { exact: true }));
    await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
    for (let i = 0; i < 12; i += 1) {
      await page.getByLabel("Delete last symbol", { exact: true }).click({ force: true });
    }
    for (const symbol of B.symbolId) {
      await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
    }
    await page.getByLabel("Log in", { exact: true }).click({ force: true });
    await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
    for (const digit of B.pin) {
      await page.getByLabel(`Digit ${digit}`, { exact: true }).click({ force: true });
    }
    await page.getByLabel("Log in", { exact: true }).click({ force: true });
    await page.getByLabel("Send", { exact: true }).waitFor({ timeout: 30000 });

    await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
    await tap(page.getByRole("button", { name: /^History$/i }).first());
    await page.waitForTimeout(1500);
    await tap(page.getByRole("button", { name: new RegExp(`^${A.fullName},`) }).first());

    const received = await readReceipt(page);
    assert.equal(received.label, "From", `the payee's receipt must say From, it said "${received.label}"`);
    assert.equal(received.name, A.fullName, `it must name the payer, it named "${received.name}"`);
    assert.equal(received.gloobalId, A.symbolId, `it must carry the payer's Gloobal ID, it carried "${received.gloobalId}"`);
    assert.equal(
      flagIsoOf(received.flagSrc),
      A.countryIso,
      `it must show ${A.countryIso}'s flag, it showed ${flagIsoOf(received.flagSrc)}`
    );
    // The bug this replaces, stated as an assertion: the receiver's own
    // identity appearing where the sender's belongs.
    assert.notEqual(received.gloobalId, B.symbolId, "the payee's own ID must never appear as the sender");
    assert.notEqual(flagIsoOf(received.flagSrc), B.countryIso, "nor the payee's own flag");

    await context.close();
  });

  test("the Creator Share survives being reopened from history", async () => {
    // The share tab is driven by the share leg's own reference and amount.
    // Those live on the server row; nothing carried them back into a restored
    // history row, so the tab was present on the receipt shown at payment time
    // and simply gone the next time the same payment was opened.
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.america;

    const { page, context } = await openSender(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 100 });

    const shareTab = page.getByRole("button", { name: /Creator Share/i });
    assert.ok(await shareTab.count(), "the immediate receipt must offer the Creator Share tab");

    await reopenFromHistory(page, { counterpartyName: B.fullName, column: "sending" });

    const reopenedShareTab = page.getByRole("button", { name: /Creator Share/i });
    assert.ok(
      await reopenedShareTab.count(),
      "the reopened receipt must still offer the Creator Share tab — this is the record that used to vanish"
    );
    await tap(reopenedShareTab.first());
    await page.waitForTimeout(600);

    // Direction: on the payer's side the share came back TO them, so the row
    // reads "Shared back to · You". The counterparty on the share tab is still
    // the payee, never the viewer.
    const shareText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    assert.match(shareText, /Shared back to/i, `the share tab must state its direction; screen: ${shareText.slice(0, 300)}`);
    assert.match(shareText, /Creator Share rate/i, "and the rate it was shared at");

    await context.close();
  });
});

describe("the flag is a circular badge", () => {
  // This suite used to hand-build a copy of FlagCircle's DOM in the page and
  // measure THAT — a span, an inner box at 0.83 x 0.55, an <img> with
  // object-fit: contain — across four flag shapes. It measured the copy
  // accurately and told us nothing about the component: FlagCircle could have
  // been deleted outright and every assertion would still have passed. It
  // also needed flagcdn.com to be reachable to prove a geometry fact that has
  // nothing to do with the image bytes.
  //
  // Both are fixed below. The source test pins the decision; the rendered
  // test measures the real badge in a real receipt, and does it without
  // depending on the CDN — a flag that fails to load still occupies the box,
  // so the geometry is checkable either way, and whether the asset arrived is
  // asserted separately so a CDN outage reads as a CDN outage.

  test("FlagCircle fills the disc, and can still inscribe when asked", () => {
    const flags = readSource("frontend/components/cards/flags.jsx");
    const at = flags.indexOf("function FlagCircle(");
    assert.ok(at > 0, "FlagCircle not found");
    // Sliced to the function's real end rather than a character count. A
    // fixed window silently stops covering the code it was written to cover
    // the moment a comment grows — which it did, on the very commit that
    // added these assertions.
    const end = flags.indexOf("\n}\n", at);
    assert.ok(end > at, "could not find the end of FlagCircle");
    const fn = flags.slice(at, end + 2);

    // Filling is the default — this is the change: a flag that used to float
    // as a small rectangle inside a white disc now IS the disc.
    assert.match(fn, /mode = "fill"/, "fill must be the default mode");
    assert.match(fn, /fit=\{inscribed \? "contain" : "cover"\}/);
    assert.match(fn, /radius=\{inscribed \? 2 : size \/ 2\}/, "the fill mode must be fully round");
    assert.match(
      fn,
      /width=\{inscribed \? Math\.round\(size \* widthRatio\) : size\}/,
      "filling means the image box IS the circle"
    );

    // And the old behaviour survives as an option rather than being deleted.
    // `cover` crops a 3:2 flag to its central two-thirds, which is fine when
    // a name sits beside the badge and wrong when the flag alone must
    // identify the country. A future surface needs to be able to say so.
    assert.match(fn, /inscribed = mode === "inscribe"/);
  });

  test("the badge in a real receipt is a circle the flag fills edge to edge", async () => {
    const { page, context } = await openSender(ACCOUNTS.america);
    await login(page, ACCOUNTS.america);
    // America -> India, so the badge carries a flag that is not the viewer's.
    await pay(page, { sender: ACCOUNTS.america, receiver: ACCOUNTS.india, receiverGets: 500 });

    const badge = page.getByTestId("receipt-flag");
    await badge.waitFor({ timeout: 20000 });

    const m = await badge.evaluate((el) => {
      const img = el.querySelector("img");
      const box = img ? img.parentElement : null;
      const r = (n) => (n ? n.getBoundingClientRect() : null);
      const cs = (n) => (n ? getComputedStyle(n) : null);
      return {
        circle: r(el),
        box: r(box),
        img: r(img),
        boxRadius: cs(box) && cs(box).borderRadius,
        objectFit: cs(img) && cs(img).objectFit,
        natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null
      };
    });

    assert.ok(m.img, "the badge must render a real flag image, not an emoji character");

    // Round: the container is square and its clip is a full circle.
    assert.ok(
      Math.abs(m.circle.width - m.circle.height) < 1,
      `the badge must be square to be circular; got ${m.circle.width}x${m.circle.height}`
    );

    // Filled: the image box covers the whole disc rather than sitting inside
    // it. This is the assertion that would have caught the old inscribed
    // rectangle — 33x22 in a 40px circle — as a failure.
    assert.ok(
      m.box.width >= m.circle.width - 1 && m.box.height >= m.circle.height - 1,
      `the flag must fill the ${m.circle.width}px disc; it is ${m.box.width}x${m.box.height}`
    );

    // Round at the image too, not just clipped by an ancestor, so the flag's
    // own corners are gone rather than merely hidden.
    const radius = parseFloat(m.boxRadius);
    assert.ok(
      Number.isFinite(radius) && radius >= m.circle.width / 2 - 1,
      `the flag's own box must be fully round; radius is ${m.boxRadius}`
    );

    // Undistorted: `cover` scales and crops, it never stretches. A `fill`
    // here would squash every flag into a square.
    assert.equal(m.objectFit, "cover", "the flag must be cropped to the circle, never stretched");

    // Whether the asset actually arrived is a separate question from the
    // geometry above, and gets its own message so a blocked CDN cannot be
    // mistaken for a layout regression.
    assert.ok(
      m.natural && m.natural.w > 0 && m.natural.h > 0,
      `the flag asset did not load (${m.natural && m.natural.w}x${m.natural && m.natural.h}) — ` +
        "flagcdn.com unreachable? the geometry assertions above still passed"
    );

    await context.close();
  });
});

describe("the Creator Share receipt identifies the other side by ID", () => {
  // A name is not an identifier. The Payment tab has carried the
  // counterparty's Gloobal ID since it was built; the Creator Share tab named
  // a person and stopped, which made it the one document in the app that
  // said who without saying which.
  test("the share tab carries the counterparty's Gloobal ID", () => {
    const modal = readSource("frontend/components/dialogs/ReceiptModal.jsx");
    assert.match(modal, /testId="receipt-share-counterparty-id"/);
  });

  test("the ID sits under the row that names them, never under \"You\"", () => {
    // receipt.id belongs to receipt.name. When the viewer SENT the payment
    // the share came back to them, so the row above reads "Shared back to ·
    // You" — attaching the counterparty's ID to that row would label the
    // viewer with someone else's identifier. Hence the extra naming row in
    // that direction.
    const modal = readSource("frontend/components/dialogs/ReceiptModal.jsx");
    assert.match(modal, /\{isSent && <ReceiptRow label="Shared back by" value=\{receipt\.name\} \/>\}/);
    const at = modal.indexOf('label="Shared back by"');
    const idAt = modal.indexOf('testId="receipt-share-counterparty-id"');
    assert.ok(idAt > at, "the ID row must come after the row naming the counterparty");
  });

  test("a receipt with no counterparty ID simply omits the row", () => {
    // Locally-simulated payments to a non-Gloobal payee have no ID to show.
    // An empty "GLOOBAL ID —" row would be worse than none.
    const modal = readSource("frontend/components/dialogs/ReceiptModal.jsx");
    assert.match(modal, /\{receipt\.id && <ReceiptRow\s+testId="receipt-share-counterparty-id"/);
  });
});
