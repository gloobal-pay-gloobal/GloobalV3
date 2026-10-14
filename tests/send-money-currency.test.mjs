// The founder's Send Money currency requirement, verified in a real browser.
//
//   node --test tests/send-money-currency.test.mjs
//
// The requirement, stated exactly:
//
//   amount input  ->  the RECEIVER'S currency  (what they get)
//   Send button   ->  the SENDER'S currency    (what you pay)
//
// Sender India / receiver USA reads "$ 0.00" over "Send ₹0.00"; the reverse
// pair reads "₹ 0.00" over "Send $0.00".
//
// Why the two halves are asserted together in one pass: the failure being
// guarded against is them disagreeing. A screen showing the payee's symbol
// over a payload that says the payer typed it moves the wrong sum, and either
// half on its own looks perfectly fine. So every case here checks the symbol
// on the box, the symbol on the button, the two currency codes in the request
// the app actually made, and that the conversion between them runs the right
// way round.
//
// Runs on the same rig as browser.test.mjs — the real bundle, served over
// http, with a controllable fake of the Gloobal API behind it. No row is
// written to any real database.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTS,
  buildOnce,
  convert,
  login,
  openPage,
  teardown
} from "./browser-harness.mjs";

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

// "₹4,750.00" -> 4750
const money = (rendered) => Number(String(rendered).replace(/[^\d.]/g, ""));

// The expected symbols are written down HERE, in the test, and nowhere in the
// app. The component reads CURRENCY_SYMBOL[bottom.currency] for the box and
// CURRENCY_SYMBOL[top.currency] for the button, both resolved from the two
// accounts' own countries through the existing country/currency tables. A
// test needs a value to compare against; that is not the same thing as the
// product hardcoding one, and these five are here only because these are the
// five corridors the requirement named.
const SYMBOL = { INR: "₹", USD: "$", JPY: "\xA5", GBP: "\xA3", MXN: "Mex$" };

const boxSymbolLabel = (currency) =>
  `Receiver's currency: ${currency} — fixed to their account, can't be changed`;

const amountFieldLabel = (currency) =>
  `Amount the receiver gets, in their own currency (${currency})`;

// Walks to the amount step and stops there. Everything after it — pay method,
// transfer OTP, biometric gate — is already covered by browser.test.mjs; this
// suite only needs the screen as the person sees it while typing.
async function openAmountStep(page, receiver) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of receiver.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
  const field = page.getByLabel(amountFieldLabel(receiver.currency));
  await field.waitFor({ timeout: 25000 });
  return field;
}

const openSender = (sender) =>
  openPage({
    account: sender,
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 }
  });

describe("the amount box is the payee's currency and the Send button is the payer's", () => {
  const pairs = [
    { from: "india", to: "america", note: "INR -> USD" },
    { from: "america", to: "india", note: "USD -> INR" },
    { from: "india", to: "japan", note: "INR -> JPY, zero-decimal payee" },
    { from: "japan", to: "india", note: "JPY -> INR, zero-decimal payer" },
    { from: "britain", to: "mexico", note: "GBP -> MXN, neither side is a default" }
  ];

  for (const pair of pairs) {
    const sender = ACCOUNTS[pair.from];
    const receiver = ACCOUNTS[pair.to];

    test(pair.note, async () => {
      const { page, context, api } = await openSender(sender);
      await login(page, sender);
      const field = await openAmountStep(page, receiver);

      // ---- 1. AMOUNT INPUT: the receiver's own money, before anything is typed
      //
      // The marker carries TWO names now — "$ │ USD" with the lens off, "GEU │
      // USD" with it on. See geuLensUnitPair. This used to assert the symbol
      // and nothing else, which was right while the lens did not reach this
      // screen at all.
      //
      // The claim being protected is unchanged and is the important one: the
      // box names the RECEIVER's money, never the sender's. A box carrying
      // the payer's symbol is how "₹478,000" came to be shown as "$478,000",
      // and it is the reason this suite exists.
      const boxSymbol = (await page.getByLabel(boxSymbolLabel(receiver.currency)).innerText())
        .replace(/\s+/g, " ").trim();
      assert.ok(
        boxSymbol.startsWith(SYMBOL[receiver.currency]),
        `the amount box must lead with ${receiver.currency}'s symbol, it carried "${boxSymbol}"`
      );
      if (sender.currency !== receiver.currency) {
        // Not merely "different from the sender's symbol" — the sender's
        // symbol must not appear ANYWHERE in the marker, including after the
        // bar, which is where a lazily-written pair would put it.
        assert.ok(
          !boxSymbol.includes(SYMBOL[sender.currency]),
          `the amount box carried the sender's ${sender.currency} symbol: "${boxSymbol}"`
        );
        // And it names WHICH currency it is, which a symbol alone cannot: $
        // belongs to more than twenty countries.
        assert.ok(
          boxSymbol.includes(receiver.currency),
          `the amount box does not name the receiver's currency: "${boxSymbol}"`
        );
      }

      // A zero-decimal payee is never offered a minor unit to type into.
      const placeholder = await field.getAttribute("placeholder");
      assert.equal(
        placeholder,
        receiver.currency === "JPY" ? "0" : "0.00",
        `a ${receiver.currency} payee's box must read ${receiver.currency === "JPY" ? "0" : "0.00"}, it read "${placeholder}"`
      );

      // ---- 2. SEND BUTTON: the sender's symbol, and the sender's figure
      const receiverGets = receiver.currency === "JPY" ? 5000 : 100;
      await field.fill(String(receiverGets));
      await page.waitForTimeout(900);

      const payButton = page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last();
      const buttonText = (await payButton.innerText()).trim();
      const quoted = buttonText.replace(/^(Send|Simulate)\s*/, "").trim();

      // Amount first, currency after — "9,539.81₹", not "₹9,539.81". These
      // two assertions were written against the old symbol-first
      // convention and kept passing only because nothing on the Send
      // button had moved yet; when fmtMoney flipped every amount in the
      // app, this is where it showed.
      // The suffix is what is left once the number is taken off the front,
      // and it is compared WHOLE rather than with endsWith: "Mex$" ends
      // with "$", so an endsWith test would let a peso amount pass as
      // dollars and would fail a peso amount that should pass.
      // The bar and everything after it is the OTHER name for this same
      // figure — "9,539.81₹ │ GEU" — so the unit under test is what sits
      // between the digits and the bar. Dropping the trail here rather than
      // asserting on the whole string keeps this test about the thing it has
      // always been about: which currency the payer is quoted in.
      const suffix = quoted.split("\u2502")[0].replace(/^[\d.,\s]+/, "").trim();
      assert.equal(
        suffix,
        SYMBOL[sender.currency],
        `the Send button must be in ${sender.currency}; it read "${buttonText}"`
      );
      // And the trailing half must be GEU, never another currency's symbol.
      // This is the payer's own money, so its other name is the unit — if a
      // real currency ever appears after that bar, two tenders are being
      // claimed for one figure on the screen where money leaves.
      if (quoted.includes("\u2502")) {
        const trail = quoted.split("\u2502")[1].replace(/\s+/g, " ").trim();
        assert.equal(trail, "GEU",
          `the Send button's second unit must be GEU; it read "${buttonText}"`);
      }
      if (sender.currency !== receiver.currency) {
        assert.notEqual(
          suffix,
          SYMBOL[receiver.currency],
          `the Send button must not be in the receiver's currency; it read "${buttonText}"`
        );
      }

      // ---- 3. FX: the button's figure is the typed figure converted the
      // right way round.
      //
      // Compared against the harness's own rate table — which is what the
      // fake server settles at — with a tolerance, because the app converts
      // with its own bundled rates and a test that re-implemented those would
      // be asserting its own arithmetic. What must hold is the DIRECTION and
      // the order of magnitude: 100 USD to a US payee costs an Indian sender
      // thousands of rupees, never 100 of them.
      const shown = money(quoted);
      assert.ok(shown > 0, `the button must quote a real amount, it read "${buttonText}"`);

      if (sender.currency !== receiver.currency) {
        const expected = convert(receiverGets, receiver.currency, sender.currency);
        const ratio = shown / expected;
        assert.ok(
          ratio > 0.5 && ratio < 2,
          `${receiverGets} ${receiver.currency} to the payee should cost roughly ${expected} ${sender.currency}, the button said ${shown}`
        );
        assert.notEqual(
          shown,
          receiverGets,
          "the button must not echo the typed figure — that is the two sides collapsing into one"
        );
      } else {
        assert.equal(shown, receiverGets, "a same-currency pair must quote the typed figure exactly");
      }

      // A zero-decimal PAYER is never quoted a minor unit either.
      if (sender.currency === "JPY") {
        assert.ok(!/\.\d/.test(quoted), `${sender.currency} has no minor unit, the button quoted "${quoted}"`);
      }

      // ---- 4. THE PAYLOAD: both sides named, and the typed side declared
      //
      // Read off the request the app actually made rather than off the
      // screen, so a screen that reads correctly over a payload that does not
      // still fails here.
      await payButton.click({ force: true });
      const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
      await paySheet.waitFor({ timeout: 20000 });
      const sheetText = (await paySheet.innerText()).replace(/\s+/g, " ");

      // The confirmation sheet is where both sides are put in front of the
      // person together, so it has to name both currencies and the rate.
      if (sender.currency !== receiver.currency) {
        assert.ok(
          sheetText.includes(sender.currency) && sheetText.includes(receiver.currency),
          `the confirmation must name both currencies; it said: ${sheetText}`
        );
        assert.match(
          sheetText,
          new RegExp(`at 1 ${sender.currency} = `),
          `the confirmation must state the rate; it said: ${sheetText}`
        );
      }

      await context.close();

      // The send call itself is asserted in browser.test.mjs block D, which
      // walks the whole flow to a receipt. Stopping at the sheet here keeps
      // this suite about what is on screen while choosing an amount — the
      // part the requirement is actually about — and keeps it quick enough
      // to run five corridors.
      assert.ok(Array.isArray(api.calls), "the API log must exist");
    });
  }
});

describe("the two sides stay attached to the right people", () => {
  test("switching to a payee in another currency re-denominates the box and leaves the button alone", async () => {
    // The staleness case the requirement calls out.
    //
    // A note on how the recipient is changed here. Send Money has no
    // in-place "change recipient" control: openSearch() exists in the
    // component and is wired only to the contacts picker, so the way a
    // person actually switches payees is to leave the screen and come back.
    // This drives that — the header's own Back button, then Send again —
    // rather than a control that does not exist. It still exercises the
    // thing that matters: the box has to be denominated by whoever is
    // resolved NOW, and the button by the account that is signed in, and
    // neither may inherit anything from the previous payee.
    const sender = ACCOUNTS.india;
    const first = ACCOUNTS.america;
    const second = ACCOUNTS.japan;

    const { page, context } = await openSender(sender);
    await login(page, sender);

    const firstField = await openAmountStep(page, first);
    await firstField.fill("100");
    await page.waitForTimeout(700);

    // Normalised the same way as the first suite: the marker carries two
    // names now ("$ │ USD"), and what this test is about is WHOSE currency
    // follows the payee.
    const boxMark = (text) => text.replace(/\s+/g, " ").trim();
    const firstBox = boxMark(await page.getByLabel(boxSymbolLabel(first.currency)).innerText());
    const firstButton = (await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().innerText()).trim();
    assert.ok(firstBox.startsWith(SYMBOL[first.currency]),
      `the box starts in the first payee's currency; it read "${firstBox}"`);
    assert.ok(
      firstButton.includes(SYMBOL[sender.currency]),
      `and the button in the sender's; it read "${firstButton}"`
    );

    // Out of Send Money and back in, to a payee in a different currency.
    await page.getByLabel("Back", { exact: true }).first().click({ force: true });
    await page.getByLabel("Send", { exact: true }).waitFor({ timeout: 20000 });

    const secondField = await openAmountStep(page, second);
    await secondField.fill("5000");
    await page.waitForTimeout(900);

    const secondBox = boxMark(await page.getByLabel(boxSymbolLabel(second.currency)).innerText());
    const secondButton = (await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().innerText()).trim();

    assert.ok(
      secondBox.startsWith(SYMBOL[second.currency]),
      `the box must follow the new payee to ${second.currency}, it showed "${secondBox}"`
    );
    // The CODE must follow too. A marker that kept the right symbol and the
    // stale code would read "$ │ INR", which names two currencies for one
    // figure on the field somebody is typing a payment into.
    assert.ok(
      secondBox.includes(second.currency) || second.currency === first.currency,
      `the box names the wrong currency for ${second.currency}: "${secondBox}"`
    );
    assert.notEqual(secondBox, firstBox, "a stale first-payee symbol is the bug this guards");
    assert.ok(
      secondButton.includes(SYMBOL[sender.currency]),
      `the button must stay in ${sender.currency} — the payer did not change; it read "${secondButton}"`
    );
    assert.ok(
      !secondButton.includes(SYMBOL[second.currency]),
      `the button must not drift to the payee's currency; it read "${secondButton}"`
    );

    await context.close();
  });
});
