// tests/transaction-row-consistency.test.mjs
//
// Every transaction list in the app is the same list.
//
// ── What drifted ─────────────────────────────────────────────────────────
//
// There are six places that draw a list of transactions: History's Received
// and Paid pages, the Home tab's Recent Activity, the Recent list on the
// Receive sheet, Send Money's Recent, Gloobal Bank's Recent Transactions and
// the Coin Activity ledger. Three of them shared a component. The other three
// were hand-written copies, and they had drifted to:
//
//   mark    29px (shared) / 30px (Bank, Coin) / 36px (Send)
//   glyph   a flipping dial symbol (shared, Send) / a lucide direction
//           arrow in a soft-tinted disc (Bank, Coin)
//   title   14.5/700 (shared) / 13/700 (all three copies)
//   stamp   11/600 (shared) / 10.5 (all three copies)
//   gutter  gap 12 (shared) / gap 10 (all three copies)
//
// So the same payment was drawn at three different sizes depending on which
// tab you were looking at.
//
// ── Why this is asserted structurally rather than numerically ────────────
//
// The obvious test — "every list uses mark size 29" — is the wrong test,
// because it is satisfied by six hand-written copies that happen to agree
// today. That state is exactly what produced this drift, and Gloobal Bank
// proves it: this is the SECOND time that list has been brought back into
// line. The first was its date format, repaired by making it call
// historyRowStamp the way History does — a copy matched by hand, which then
// drifted on everything else instead.
//
// So what is pinned below is that there is ONE component, that all six lists
// route through it, and that none of them has grown a second mark of its own.
// The sizes are then true by construction rather than by agreement.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const ROW = "frontend/features/history/TransactionRow.jsx";
const BUILD = "build_app.mjs";

// The six lists, by the file that renders each.
const LIST_FILES = {
  "History (Received and Paid)": "frontend/features/history/TransactionHistoryScreen.jsx",
  "Home Recent Activity + Receive sheet Recent": "frontend/screens/Dashboard/Dashboard.jsx",
  "Send Money Recent": "frontend/screens/SendMoney/SendMoney.jsx",
  "Gloobal Bank Recent Transactions": "frontend/screens/Banks/GloobalBankScreen.jsx"
  // "Coin Activity" was the sixth. The Coin screen is deleted and its rows
  // are in History with everything else, so there are five lists now and
  // one fewer place for them to disagree.
};

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const code = (p) => strip(readSource(p));

describe("there is one transaction row, and every list uses it", () => {
  test("all six lists render TransactionRow", () => {
    for (const [name, file] of Object.entries(LIST_FILES)) {
      assert.match(code(file), /<TransactionRow/, `${name} does not use the shared row`);
    }
  });

  test("and there are exactly five of them", () => {
    // If this count changes, a list was added or removed — which is fine, but
    // the new one has to be accounted for here rather than quietly becoming a
    // sixth idiom.
    //
    // It was six. Coin Activity, on the deleted Coin screen, was the one
    // that went: GEU is a display lens rather than a balance with a ledger
    // of its own, and the coin movements that list showed are in History
    // with every other movement.
    const total = Object.values(LIST_FILES)
      .reduce((n, f) => n + (code(f).match(/<TransactionRow/g) || []).length, 0);
    assert.equal(total, 5, `${total} transaction lists; five are accounted for above`);
  });

  test("the mark's size is stated once, in the row", () => {
    const src = code(ROW);
    assert.match(src, /var TXN_ROW_MARK_SIZE = 29;/);
    assert.match(src, /<FlipSymbolCircle size=\{TXN_ROW_MARK_SIZE\} \/>/);
  });

  test("no transaction list draws a mark of its own", () => {
    // The three copies each had one: Bank and Coin a 30px tinted disc holding
    // a lucide arrow, Send a 36px FlipSymbolCircle. A list that grows its own
    // mark again is the drift restarting.
    //
    // Dashboard.jsx is checked separately below, because it is the one file
    // here that also holds lists of things that are NOT transactions.
    for (const [name, file] of Object.entries(LIST_FILES)) {
      if (file === LIST_FILES["Home Recent Activity + Receive sheet Recent"]) continue;
      const src = code(file);
      assert.ok(
        !/<FlipSymbolCircle/.test(src),
        `${name} draws its own mark instead of letting the row do it`
      );
      assert.ok(
        !/width: 30, height: 30, borderRadius: "50%"/.test(src),
        `${name} still has the hand-rolled tinted disc`
      );
    }
  });

  test("the Dashboard's own marks belong to lists that are not transactions", () => {
    // Two marks live in this file legitimately and are NOT in scope: the
    // Referral Network rows (28) list people, and the member sheet header
    // (44) is a header, not a row. Neither is a list of payments, so neither
    // has to match the transaction row — but a THIRD size appearing here is
    // how a hand-rolled transaction list would come back, which is what this
    // pins.
    const sizes = [...code(LIST_FILES["Home Recent Activity + Receive sheet Recent"])
      .matchAll(/<FlipSymbolCircle size=\{(\d+)\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(
      [...new Set(sizes)].sort((a, b) => a - b), [28, 44],
      "a new hand-drawn mark appeared in the Dashboard"
    );
  });

  test("the direction arrows are gone from the Bank list, imports included", () => {
    // An unused alias is not harmless here: build_app.mjs concatenates every
    // module into ONE scope and consolidates the imports, so a dead alias is
    // carried into the bundle.
    //
    // This covered Bank and Coin. The Coin screen is deleted; the rule is
    // unchanged for the list that remains.
    for (const file of [LIST_FILES["Gloobal Bank Recent Transactions"]]) {
      const src = readSource(file);
      assert.ok(!/ArrowDownLeft/.test(src), `${file} still imports a direction arrow`);
      assert.ok(!/ArrowUpRight/.test(src), `${file} still imports a direction arrow`);
    }
  });
});

describe("direction survives the arrow being dropped", () => {
  test("every list still passes both a sign and a colour", () => {
    // The arrow was the third of three statements of direction. These are the
    // other two, and they are what the arrow's removal rests on — so if a
    // list ever stops passing them, dropping the arrow HAS lost information.
    for (const [name, file] of Object.entries(LIST_FILES)) {
      const src = code(file);
      for (const call of src.match(/<TransactionRow[\s\S]{0,600}?\/>/g) || []) {
        assert.match(call, /\bsign=/, `a row in ${name} has no sign`);
        assert.match(call, /\bcolor=/, `a row in ${name} has no colour`);
      }
    }
  });

  test("the mixed-direction list chooses both per row", () => {
    // Bank holds sent AND received rows in one list, so a constant would be
    // wrong in half of it. Coin Activity was the other such list and is
    // deleted with its screen — its rows are in History, which is itself
    // mixed and covered by the loop above.
    for (const file of [LIST_FILES["Gloobal Bank Recent Transactions"]]) {
      const src = code(file);
      assert.match(src, /color=\{\w+ \? TXN_IN_COLOR : TXN_OUT_COLOR\}/);
      assert.match(src, /sign=\{\w+ \? "\+" : "[−−]"\}/);
    }
  });
});

describe("a row that opens nothing is not announced as a button", () => {
  test("role and tabIndex follow onSelect", () => {
    const src = code(ROW);
    assert.match(src, /role=\{onSelect \? "button" : undefined\}/);
    assert.match(src, /tabIndex=\{onSelect \? 0 : undefined\}/);
  });

  test("every list offers its receipt, and offers it conditionally", () => {
    // ── This test used to assert the opposite ──────────────────────────
    //
    // Two of these lists passed no onSelect at all, and this file pinned
    // that, for two stated reasons. One was sound and still is; the other
    // was never quite true:
    //
    //   "Send's Recent is read-only deliberately — a repeat-send would need
    //    the receiver's live currency and registration state this snapshot
    //    does not carry."
    //
    //     Correct, and unchanged. That is why tapping a row there opens the
    //     RECEIPT and not a prefilled form. A receipt moves nothing and is
    //     built entirely out of the row, so none of that staleness applies.
    //
    //   "Gloobal Bank has no receipt to open."
    //
    //     It always had one. Those rows are roleSendHistory and receivedRows
    //     — the same two arrays History builds receipts from, the same row
    //     objects, reachable by the same call. And it is now plainly wrong:
    //     a Gloobal Coin buy and sell appear in that list, and the exchange
    //     receipt (what it cost, at what rate, against which reserve) is the
    //     entire reason the row is worth tapping.
    //
    // ── What is pinned now ────────────────────────────────────────────
    //
    // Every list offers the receipt, and every list offers it CONDITIONALLY.
    // The second half is the half that matters: a row restored from the
    // in-browser ledger carries no server reference, so there is no movement
    // for a receipt to be of. TransactionRow drops role="button" and the tab
    // stop when onSelect is absent, so passing a handler that opens nothing
    // would announce a control to a screen reader and then do nothing — the
    // original rule this file enforced, held from the other side.
    for (const [name, file] of Object.entries(LIST_FILES)) {
      const calls = code(file).match(/<TransactionRow[\s\S]{0,1400}?\/>/g) || [];
      assert.ok(calls.length > 0, `${name} renders no TransactionRow`);
      for (const call of calls) {
        assert.match(call, /onSelect=\{/, `${name} draws a row that opens nothing`);
        // A ternary ending in `undefined`, not a bare handler: that shape is
        // what keeps the row from claiming to be a button when there is
        // nothing behind it.
        assert.match(
          call,
          /onSelect=\{[^}]*\?[\s\S]*?:\s*undefined\s*\}/,
          `${name} passes onSelect unconditionally — a row with no receipt would still announce itself as a button`
        );
      }
    }
  });

  test("no list builds its own receipt", () => {
    // WHICH receipt a row opens is one decision, made once, in
    // features/history/rowReceipt.js. It used to be two: the Coin screen
    // built a coin receipt itself while every other list went through the
    // shared resolver, and they shared only the viewer shape.
    //
    // That screen is deleted, so the decision is made in exactly one place
    // now — and a coin row opened from History routes through the same
    // resolver as a payment, which is what this asserts.
    const resolver = code("frontend/features/history/rowReceipt.js");
    assert.match(resolver, /coinReceiptFrom/, "the resolver no longer knows how to open a coin movement");
    assert.match(resolver, /receiptViewer/, "the viewer shape is no longer shared");
  });

  test("a row opens a receipt only when there is one to open", () => {
    // A row with no server reference has no movement for a receipt to be
    // OF. Passing undefined rather than a no-op handler is what keeps
    // role="button" and the tab stop off it — a control that does nothing
    // is worse than no control.
    //
    // This was asserted on the Coin screen, whose in-browser ledger rows
    // were the ones that could lack a reference. The screen is gone; the
    // rule is the shared one the loop above already applies to every list.
    const resolver = code("frontend/features/history/rowReceipt.js");
    assert.match(resolver, /function rowHasReceipt\(/,
      "nothing decides whether a row has a receipt to open");
  });
});

describe("the figure on each row is in the currency that row is actually in", () => {
  test("Send's Recent passes the account currency as a fallback, not as the answer", () => {
    // The bug this replaced: `fmtMoney(Number(t.amount), top.currency)` on
    // every row. These rows come off `history`, and a restored cross-border
    // payment whose sender-side debit was never recorded honestly keeps the
    // RECEIVER's figure (see mapServerTransaction) — so formatting it with
    // the sender's symbol printed ₹478,000 as $478,000. The row prefers
    // t.currency and falls back to this.
    const src = code(LIST_FILES["Send Money Recent"]);
    const call = src.match(/<TransactionRow[\s\S]{0,900}?\/>/)[0];
    assert.match(call, /ccyCode=\{top\.currency\}/);
    assert.ok(
      !/fmtMoney\([^)]*top\.currency\)/.test(call),
      "the recent list is formatting rows with the sender's currency again"
    );
  });

  test("the row still prefers the row's own currency", () => {
    assert.match(code(ROW), /const rowCode = t\.currency \|\| ccyCode;/);
  });

  test("a coin figure is never formatted as a currency", () => {
    // GEU has no ISO code and no symbol of its own. Handing it to fmtMoney
    // would print the ticker through the currency table's fallback and
    // imply it is a currency people hold, which — now that GEU is a label
    // on money they already hold — is precisely the wrong idea.
    //
    // The Coin screen's list carried this rule and is deleted. The two
    // places that still print a coin figure carry it instead.
    const receipt = code("frontend/features/receipts/coinReceipt.js");
    assert.match(receipt, /COIN_TICKER|"GEU"/, "the coin receipt no longer names the unit");
    const lens = code("frontend/features/geuLens/geuLens.js");
    assert.match(lens, /\$\{digits\} \$\{COIN_TICKER\}/,
      "the lens is formatting GEU through the currency table");
  });

  test("amountText is used verbatim and keeps the sign outside it", () => {
    const src = code(ROW);
    // The row draws its amount as TWO spans now, so the active unit can be
    // larger than the other — see GEU_LENS_TRAIL_RATIO. amountText takes the
    // `trail: ""` branch and so renders exactly as it always did: one piece,
    // at full size, with the sign outside it and nothing appended.
    //
    // That branch is the point. The Coin ledger is counted in GC, which is
    // not a currency, has no second name and must not be given one — so a
    // caller that owns its whole figure must come out the other side
    // untouched.
    assert.match(src, /const amountParts = amountText != null\s*\? \{ lead: `\$\{sign\}\$\{amountText\}`, trail: "" \}/);
    // And the joined string, which is what the sizer and the screen reader
    // get, is still the sign outside the caller's own text.
    assert.match(src, /const amount = `\$\{amountParts\.lead\}\$\{amountParts\.trail \? ` \$\{amountParts\.trail\}` : ""\}`;/);
  });
});

// ── THE COIN LEDGER'S RENAMED FIELDS ───────────────────────────────────
//
// The in-browser coin ledger called things `memo` and `postedAt` where the
// shared row wanted `name` and `date`, and the Coin screen translated the
// two at its own call site rather than teaching TransactionRow that a coin
// exists. Both tests here checked that translation.
//
// The screen and the in-browser ledger are both deleted. Coin rows reach
// History as the SERVER shapes them (lib/coinHistoryRow.js), in the same
// field names as every other movement — so there is no translation left to
// make and no second vocabulary for the row to learn.
describe("a coin row reaches the list in the same shape as a payment", () => {
  test("the server's shaper is what the list reads", () => {
    const shaper = code("server/lib/coinHistoryRow.js");
    assert.match(shaper, /function coinHistoryRow\(/);
    // No `memo`, no `postedAt` — the two names that used to need
    // translating at a call site.
    assert.ok(!/\bmemo\b/.test(shaper), "the coin shaper is emitting `memo` again");
    assert.ok(!/\bpostedAt\b/.test(shaper), "the coin shaper is emitting `postedAt` again");
  });
});

describe("the lists inside padded cards sit flush", () => {
  test("every card-embedded list passes inset 0", () => {
    // `inset` is the row's own horizontal padding. History drops rows into an
    // unpadded card and needs the default 14; the other four sit in cards
    // that already pad themselves, and a second inset would step the rows in
    // from the card's own heading.
    for (const file of [
      LIST_FILES["Home Recent Activity + Receive sheet Recent"],
      LIST_FILES["Send Money Recent"],
      LIST_FILES["Gloobal Bank Recent Transactions"]
    ]) {
      for (const call of code(file).match(/<TransactionRow[\s\S]{0,600}?\/>/g) || []) {
        assert.match(call, /inset=\{0\}/, `${file} has a row that steps in from its card`);
      }
    }
  });

  test("History keeps the default", () => {
    const src = code(LIST_FILES["History (Received and Paid)"]);
    for (const call of src.match(/<TransactionRow[\s\S]{0,600}?\/>/g) || []) {
      assert.ok(!/inset=/.test(call), "History now overrides the inset it was the reason for");
    }
  });
});

describe("the bundle can see the row before the lists that use it", () => {
  test("TransactionRow is concatenated ahead of every list file", () => {
    // One global scope, and `var` hoists the declaration but not the
    // initialiser — so a module that reads TransactionRow at top level must
    // come after it.
    const src = readSource(BUILD);
    const row = src.indexOf("features/history/TransactionRow.jsx");
    assert.ok(row > 0, "TransactionRow is not registered in the build");
    for (const file of Object.values(LIST_FILES)) {
      const at = src.indexOf(file.replace("frontend/", ""));
      assert.ok(at > row, `${file} is built before the row it renders`);
    }
  });
});
