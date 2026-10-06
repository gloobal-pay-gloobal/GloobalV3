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
  "Gloobal Bank Recent Transactions": "frontend/screens/Banks/GloobalBankScreen.jsx",
  "Coin Activity": "frontend/screens/Coin/GloobalCoinScreen.jsx"
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

  test("and there are exactly six of them", () => {
    // If this count changes, a list was added or removed — which is fine, but
    // the new one has to be accounted for here rather than quietly becoming a
    // seventh idiom.
    const total = Object.values(LIST_FILES)
      .reduce((n, f) => n + (code(f).match(/<TransactionRow/g) || []).length, 0);
    assert.equal(total, 6, `${total} transaction lists; six are accounted for above`);
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

  test("the direction arrows are gone from Bank and Coin, imports included", () => {
    // An unused alias is not harmless here: build_app.mjs concatenates every
    // module into ONE scope and consolidates the imports, so a dead alias is
    // carried into the bundle.
    for (const file of [LIST_FILES["Gloobal Bank Recent Transactions"], LIST_FILES["Coin Activity"]]) {
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

  test("the two mixed-direction lists choose both per row", () => {
    // Bank and Coin each hold sent AND received rows in one list, so a
    // constant would be wrong in half of it.
    for (const file of [LIST_FILES["Gloobal Bank Recent Transactions"], LIST_FILES["Coin Activity"]]) {
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
    // features/history/rowReceipt.js — because it is not a simple one: a
    // Gloobal Coin buy or sell needs coinReceiptFrom (the holder, the
    // reserve, the fiat leg and the rate it converted at), a Creator Share
    // leg needs its source payment looked up in the FULL history rather than
    // the handful of rows the list is showing, and a GEU transfer between two
    // people needs the ordinary payment receipt despite being a coin
    // movement.
    //
    // Before that function existed, those three lines lived in exactly one
    // list — History's — and a buy tapped there opened the PAYMENT receipt:
    // method "Bank", a counterparty of "Gloobal User", and no mention of
    // either side of the exchange. Five lists each deciding this for
    // themselves is the same drift this whole file exists to prevent, on the
    // document rather than on the row.
    for (const [name, file] of Object.entries(LIST_FILES)) {
      const src = code(file);
      if (name === "Coin Activity") continue; // builds coin receipts directly; see below
      assert.ok(
        !/\bbuildHistoryReceipt\(/.test(src),
        `${name} calls buildHistoryReceipt itself instead of receiptForRow`
      );
      assert.ok(
        !/\bcoinReceiptFrom\(/.test(src),
        `${name} calls coinReceiptFrom itself instead of receiptForRow`
      );
    }
    // Coin Activity is the exception and allowed to be: every row in it is a
    // coin movement by construction, so there is nothing to choose between.
    // It still shares the viewer shape — receiptViewer — so the holder on a
    // buy receipt opened from the Coin screen and the same buy opened from
    // History cannot be described two different ways.
    const coin = code(LIST_FILES["Coin Activity"]);
    assert.match(coin, /receiptViewer\(/, "the Coin screen names the holder its own way again");
  });

  test("a coin row opens a receipt only when there is one to open", () => {
    // A row restored from the in-browser ledger carries no server reference,
    // so there is no movement for a receipt to be OF. Passing undefined
    // rather than a no-op handler is what keeps role="button" and the tab
    // stop off it — a control that does nothing is worse than no control.
    const src = code(LIST_FILES["Coin Activity"]);
    assert.match(src, /onSelect=\{row\.receipt \? \(\) => setCoinReceipt\(row\.receipt\) : undefined\}/);
    assert.match(src, /receipt: null/, "a locally-posted coin row now claims a receipt");
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

  test("the Coin ledger is not formatted as money", () => {
    // GC has no ISO code and no symbol. Handing "GC" to fmtMoney would print
    // the ticker through the currency table's fallback and imply GC is a
    // currency, which it is not.
    const src = code(LIST_FILES["Coin Activity"]);
    const call = src.match(/<TransactionRow[\s\S]{0,900}?\/>/)[0];
    assert.match(call, /amountText=\{`\$\{fmt\(Number\(row\.amount\) \|\| 0\)\} \$\{COIN_TICKER\}`\}/);
    assert.ok(!/ccyCode=/.test(call), "the coin ledger claims a currency code");
    assert.ok(!/fmtMoney/.test(call), "the coin ledger is being formatted as money");
  });

  test("amountText is used verbatim and keeps the sign outside it", () => {
    const src = code(ROW);
    assert.match(src, /const amount = amountText != null\s*\? `\$\{sign\}\$\{amountText\}`/);
  });
});

describe("the coin ledger's two renamed fields are translated at its own call site", () => {
  test("memo becomes the row's name", () => {
    // Rather than teaching the shared row that a coin exists.
    assert.match(code(LIST_FILES["Coin Activity"]), /t=\{\{ name: row\.memo, date: stamp \}\}/);
  });

  test("the postedAt fallback still runs, through coinRowStamp", () => {
    const src = code(LIST_FILES["Coin Activity"]);
    assert.match(src, /const stamp = coinRowStamp\(row\);/);
    // And coinRowStamp still routes through the one shared formatter, so a
    // coin row and a payment row cannot print two different date shapes.
    assert.match(src, /return historyRowStamp\(\{/);
  });
});

describe("the lists inside padded cards sit flush", () => {
  test("every card-embedded list passes inset 0", () => {
    // `inset` is the row's own horizontal padding. History drops rows into an
    // unpadded card and needs the default 14; the other five sit in cards
    // that already pad themselves, and a second inset would step the rows in
    // from the card's own heading.
    for (const file of [
      LIST_FILES["Home Recent Activity + Receive sheet Recent"],
      LIST_FILES["Send Money Recent"],
      LIST_FILES["Gloobal Bank Recent Transactions"],
      LIST_FILES["Coin Activity"]
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
  test("TransactionRow is concatenated ahead of all five list files", () => {
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
