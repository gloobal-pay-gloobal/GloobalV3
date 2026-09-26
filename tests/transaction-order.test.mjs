// tests/transaction-order.test.mjs
//
// Every transaction list reads newest first, by each row's recorded instant.
//
// Founder report — one day's list read:
//
//   16:14:07, 14:13:38, 16:13:01, 14:13:37, 16:13:00
//
// Root causes (see frontend/features/history/transactionOrder.js):
//   - mapServerTransaction turned the server's createdAt into display strings
//     and dropped it, so nothing finer than the day was left to sort on;
//   - Recent Transactions and the received list sorted by parseDemoDate(date)
//     — the DAY — so same-day rows tied and kept concat/arrival order;
//   - the history poll appended newly-arrived rows to the END of the list;
//   - My Assets listed grants in insertion order, new seeds last.
//
// Expected everywhere:  16:14:07, 16:13:01, 16:13:00, 14:13:38, 14:13:37

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const ORDER_SRC = readSource("frontend/features/history/transactionOrder.js");
const { transactionOccurredAtMs, compareTransactionsNewestFirst, sortTransactionsNewestFirst } =
  new Function(`${ORDER_SRC}; return { transactionOccurredAtMs, compareTransactionsNewestFirst, sortTransactionsNewestFirst };`)();

function sliceFunction(file, name) {
  const src = readSource(file);
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found`);
  const end = src.indexOf("\n}\n", at);
  return src.slice(at, end + 2);
}
const { formatClockTime } = loadDomain(["formatClockTime"]);
const mapServerTransaction = new Function(
  "formatClockTime",
  `${sliceFunction("frontend/App.jsx", "mapServerTransaction")}; return mapServerTransaction;`
)(formatClockTime);

// Today, at a local clock time, as the server would send it.
const at = (hh, mm, ss) => {
  const d = new Date();
  d.setHours(hh, mm, ss, 0);
  return d;
};
const FOUNDER_SHOWN = [[16, 14, 7], [14, 13, 38], [16, 13, 1], [14, 13, 37], [16, 13, 0]];
const EXPECTED = ["16:14:07", "16:13:01", "16:13:00", "14:13:38", "14:13:37"];
const times = (rows) => rows.map((r) => r.time);

// ── The rule ──────────────────────────────────────────────────────────────

describe("the shared newest-first rule", () => {
  const rows = FOUNDER_SHOWN.map(([h, m, s], i) => ({ id: i, occurredAt: at(h, m, s).toISOString(), time: formatClockTime(at(h, m, s)) }));

  test("the founder's sequence comes out chronological, newest first", () => {
    assert.deepEqual(times(sortTransactionsNewestFirst(rows)), EXPECTED);
  });

  test("it reads the instant, not the display time, the id or the position", () => {
    // Display strings deliberately contradict the instants.
    const lying = [
      { id: "a", occurredAt: at(9, 0, 0).toISOString(), time: "23:59:59", date: "Dec 31" },
      { id: "b", occurredAt: at(10, 0, 0).toISOString(), time: "00:00:01", date: "Jan 1" }
    ];
    assert.deepEqual(sortTransactionsNewestFirst(lying).map((r) => r.id), ["b", "a"]);
  });

  test("ties keep their existing (server) order — no invented tie-break", () => {
    const same = at(12, 0, 0).toISOString();
    const tied = [{ id: "first", occurredAt: same }, { id: "second", occurredAt: same }, { id: "third", occurredAt: same }];
    assert.deepEqual(sortTransactionsNewestFirst(tied).map((r) => r.id), ["first", "second", "third"]);
  });

  test("a row with no recorded instant is not given one: it sorts after, in its own order", () => {
    const mixed = [{ id: "legacy1" }, { id: "new", occurredAt: at(12, 0, 0).toISOString() }, { id: "legacy2", occurredAt: null }, { id: "old", occurredAt: at(8, 0, 0).toISOString() }];
    assert.deepEqual(sortTransactionsNewestFirst(mixed).map((r) => r.id), ["new", "old", "legacy1", "legacy2"]);
    assert.equal(transactionOccurredAtMs({ occurredAt: "not a date" }), null);
  });

  test("returns a copy — React state is never sorted in place", () => {
    const original = rows.slice();
    sortTransactionsNewestFirst(rows);
    assert.deepEqual(rows, original);
  });

  test("the rule itself never looks at display fields", () => {
    const code = ORDER_SRC.replace(/\/\/.*$/gm, "");
    assert.ok(!/\.(date|time|txnId|name|amount)\b/.test(code), "the comparator reads a display or identity field");
  });
});

// ── Server rows carry their instant ───────────────────────────────────────

const serverRow = (over) => ({
  type: "payment", status: "success", amount: 100, currency: "INR", debitAmount: 100, senderCurrency: "INR", fxRate: 1,
  counterparty: { fullName: "Priya", symbolId: "" }, cashbackRate: 0, ...over
});

describe("mapServerTransaction keeps the server's createdAt", () => {
  test("occurredAt is the server's createdAt, and date/time are printed from it", () => {
    const created = at(16, 14, 7);
    const row = mapServerTransaction(serverRow({ referenceId: "R1", direction: "sent", createdAt: created.toISOString() }));
    assert.equal(row.occurredAt, created.toISOString());
    assert.equal(row.time, "16:14:07");
    assert.equal(row.date, created.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  });

  test("no createdAt: no instant, and no time invented from the clock", () => {
    const row = mapServerTransaction(serverRow({ referenceId: "R2", direction: "sent" }));
    assert.equal(row.occurredAt, null);
    assert.equal(row.time, "");
    assert.equal(row.date, "");
  });

  test("mixed sent / received / Creator Share / cross-currency rows sort on their own instants", () => {
    const [t1, t2, t3, t4, t5] = FOUNDER_SHOWN.map(([h, m, s]) => at(h, m, s).toISOString());
    const mapped = [
      serverRow({ referenceId: "SENT-X", direction: "sent", createdAt: t1, amount: 10, currency: "USD", debitAmount: 950, senderCurrency: "INR", fxRate: 95 }),
      serverRow({ referenceId: "RECV", direction: "received", createdAt: t2 }),
      serverRow({ referenceId: "SHARE", type: "share", direction: "received", createdAt: t3, amount: 2 }),
      serverRow({ referenceId: "SENT", direction: "sent", createdAt: t4 }),
      serverRow({ referenceId: "RECV-X", direction: "received", createdAt: t5, amount: 5, currency: "INR", debitAmount: 0.06, senderCurrency: "USD", fxRate: 0.0105 })
    ].map((r) => mapServerTransaction(r));
    assert.equal(mapped.find((r) => r.txnId === "SHARE").kind, "share");
    assert.equal(mapped.find((r) => r.txnId === "SHARE").time, "16:13:01", "the share uses its own recorded time");
    assert.deepEqual(times(sortTransactionsNewestFirst(mapped)), EXPECTED);
  });
});

// ── Session rows carry their instant ──────────────────────────────────────

describe("a payment made this session records its instant", () => {
  const { buildTransactionSnapshot } = loadDomain(["buildTransactionSnapshot"]);
  test("history entry and receipt carry occurredAt = the payment's now", () => {
    const now = at(16, 14, 7);
    const { receipt, historyEntry } = buildTransactionSnapshot({
      sender: { currency: "INR" }, receiver: { name: "Priya", currency: "INR" },
      amount: 100, convertedAmount: 100, payMethod: "Gloobal Bank", now, shareRatePercent: 0, ledgerRecordId: null, txnId: "T"
    });
    assert.equal(historyEntry.occurredAt, now.toISOString());
    assert.equal(receipt.occurredAt, now.toISOString());
    assert.equal(historyEntry.time, "16:14:07");
  });
});

// ── 1. Recent Transactions (Gloobal Bank screen) ──────────────────────────

describe("Recent Transactions", () => {
  const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");

  test("merges sent and received with the shared rule, not the day", () => {
    assert.match(dash, /return sortTransactionsNewestFirst\(sent\.concat\(received\)\)\.slice\(0, 5\);/);
    assert.ok(!/parseDemoDate\(row\.date\)[\s\S]{0,80}getTime/.test(dash.replace(/\/\/.*$/gm, "")), "a list still sorts by the day");
  });

  test("the founder's day, sent and received interleaved, comes out chronological", () => {
    // The shape recentBankTransactions builds: the sent column concatenated
    // with the received column — which by the day alone stayed in that order.
    const rows = FOUNDER_SHOWN.map(([h, m, s], i) => ({
      direction: i % 2 ? "received" : "sent", occurredAt: at(h, m, s).toISOString(), time: formatClockTime(at(h, m, s))
    }));
    const sent = rows.filter((r) => r.direction === "sent");
    const received = rows.filter((r) => r.direction === "received");
    assert.deepEqual(times(sortTransactionsNewestFirst(sent.concat(received)).slice(0, 5)), EXPECTED);
  });
});

// ── 2. History ────────────────────────────────────────────────────────────

describe("History and the Home activity card", () => {
  const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  const app = readSource("frontend/App.jsx");

  test("both columns are sorted at the source they are fed from", () => {
    assert.match(dash, /return sortTransactionsNewestFirst\(receivedHistory\);/);
    assert.match(dash, /sortTransactionsNewestFirst\(sendHistory\.filter\(\(t\) => \(t\.role \|\| "user"\) === shareRole\)\)/);
  });

  test("the history poll sorts after merging, instead of appending new rows at the end", () => {
    assert.match(app, /return sortTransactionsNewestFirst\(\s*reconciled\.concat\(rows\.filter/);
  });

  test("a local row the server has recorded takes the server's instant", () => {
    assert.match(app, /\{ \.\.\.entry, occurredAt: server\.occurredAt, date: server\.date, time: server\.time \}/);
  });

  test("session payments are inserted by the rule, not just prepended", () => {
    assert.match(app, /setSendMoneyHistory\(\(h\) => sortTransactionsNewestFirst\(\[\{ \.\.\.entry, role: activeShareRole \}, \.\.\.h\]\)\)/);
    assert.match(app, /setSendMoneyHistory\(\(h\) => sortTransactionsNewestFirst\(\[historyEntry, \.\.\.h\]\)\)/);
  });
});

// ── 3. My Assets ──────────────────────────────────────────────────────────

describe("My Assets", () => {
  const domain = loadDomain(["createFinancialCore"]);
  const INR = "INR";
  const newCore = () => domain.createFinancialCore({ userId: "t", currency: INR, openingBankBalance: 1000000, logLevel: "silent" });

  test("grants minted by payments record the payment's instant", () => {
    const core = newCore();
    FOUNDER_SHOWN.forEach(([h, m, s], i) => {
      const now = at(h, m, s);
      const result = core.orchestrator.executeTransaction({
        userAccounts: core.userAccounts, txnId: `T${i}`, amount: 100, payMethodLabel: "Gloobal Bank", memo: "m", name: `Shop ${i}`,
        shareRatePercent: 2, time: formatClockTime(now), now, clientRequestId: `R${i}`
      });
      assert.ok(result.ok, JSON.stringify(result));
    });
    const grants = core.essentialsService.listGrants();
    assert.equal(grants.length, 5);
    assert.deepEqual(grants.map((g) => g.time), FOUNDER_SHOWN.map(([h, m, s]) => formatClockTime(at(h, m, s))), "fixture: inserted in the founder's order");
    assert.deepEqual(times(grants.slice().sort(compareTransactionsNewestFirst)), EXPECTED);
  });

  test("grants restored from the server keep plantedAt as their instant", () => {
    const core = newCore();
    core.hydrateGrantsFromServer(FOUNDER_SHOWN.map(([h, m, s], i) => ({
      id: `s${i}`, business: `Shop ${i}`, amountPaid: 100, cashbackRate: 0.02, yearsAccrued: 0, plantedAt: at(h, m, s).toISOString()
    })));
    const grants = core.essentialsService.listGrants();
    assert.ok(grants.every((g) => typeof g.occurredAt === "string"));
    assert.deepEqual(times(grants.slice().sort(compareTransactionsNewestFirst)), EXPECTED);
  });

  test("the asset list is sorted by the shared rule", () => {
    assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /return \{ \.\.\.t, cashback, value, monthsToTarget \};\s*\}\)\.sort\(compareTransactionsNewestFirst\)/);
  });
});

// ── In the browser: History and Home, initial load, poll, reload ──────────

describe("in the browser", () => {
  before(async () => { await buildOnce(); });
  after(async () => { await teardown(); });

  const A = ACCOUNTS.india;
  const B = ACCOUNTS.india2;
  const party = (acc) => ({ symbolId: acc.symbolId, fullName: acc.fullName, countryIso: acc.countryIso, currency: acc.currency });
  let seq = 0;
  const ledgerRow = (from, to, when, amount) => {
    seq += 1;
    return {
      id: `order-${seq}`, referenceId: `ORDER-REF-${seq}`, sender: party(from), receiver: party(to),
      sourceAmount: amount, sourceCurrency: from.currency, destinationAmount: amount, destinationCurrency: to.currency,
      rate: 1, cashbackRate: 0, cashback: 0, cashbackCredit: 0, shareReferenceId: null,
      receiptCode: `ORD${String(seq).padStart(7, "0")}`, shareReceiptCode: null, note: "", createdAt: when.toISOString()
    };
  };

  // Stamps of the rows a list shows, top to bottom, read from each row's own
  // accessible name ("Name, amount, Aug 30 · 16:14:07").
  const stampsIn = (page, selector) => page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document;
    return [...(root || document).querySelectorAll("[aria-label]")]
      .map((el) => (el.getAttribute("aria-label").match(/· (\d\d:\d\d:\d\d)/) || [])[1])
      .filter(Boolean);
  }, selector);

  async function openHistory(page) {
    await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
    const btn = page.getByRole("button", { name: /^History$/i }).first();
    await btn.waitFor({ timeout: 20000 });
    await btn.evaluate((n) => n.click());
    await page.waitForTimeout(1500);
  }

  // Both History columns, in DOM order: receiving first, then sending.
  const historyColumns = (page) => page.evaluate(() => {
    const scroller = [...document.querySelectorAll("div")].find((d) => d.scrollWidth > d.clientWidth + 50 && d.clientWidth > 200 && d.children.length === 2);
    if (!scroller) return null;
    return [...scroller.children].map((col) => [...col.querySelectorAll("[aria-label]")]
      .map((el) => (el.getAttribute("aria-label").match(/· (\d\d:\d\d:\d\d)/) || [])[1])
      .filter(Boolean));
  });

  test("History: interleaved server rows, then a newer arrival, then a reload", async () => {
    const { page, context, api } = await openPage({ account: A, permissions: ["geolocation"], geolocation: { latitude: 19.076, longitude: 72.8777 } });
    try {
      // Pushed in the founder's displayed order, alternating received/sent —
      // and the fake serves them in REVERSE push order, so what reaches the
      // client is not chronological either. The client has to sort.
      FOUNDER_SHOWN.forEach(([h, m, s], i) => {
        api.state.ledger.push(i % 2 ? ledgerRow(A, B, at(h, m, s), 100 + i) : ledgerRow(B, A, at(h, m, s), 100 + i));
      });
      await login(page, A);
      await page.waitForTimeout(3000);
      await openHistory(page);
      let cols = await historyColumns(page);
      assert.ok(cols, "could not find the History columns");
      const all = (c) => c[0].concat(c[1]);
      const receivedExpected = EXPECTED.filter((t) => ["16:14:07", "16:13:01", "16:13:00"].includes(t));
      const sentExpected = EXPECTED.filter((t) => ["14:13:38", "14:13:37"].includes(t));
      assert.deepEqual(cols[0], receivedExpected, `receiving column: ${cols[0]}`);
      assert.deepEqual(cols[1], sentExpected, `sending column: ${cols[1]}`);

      // A payment received AFTER the first load, newer than everything. The
      // poll used to append it to the bottom.
      api.state.ledger.push(ledgerRow(B, A, at(16, 20, 0), 999));
      let arrived = false;
      for (let i = 0; i < 25 && !arrived; i++) {
        await page.waitForTimeout(2000);
        cols = await historyColumns(page);
        arrived = Boolean(cols && cols[0][0] === "16:20:00");
      }
      assert.ok(arrived, `the new arrival is not first: ${cols && cols[0]}`);
      assert.deepEqual(cols[0], ["16:20:00", ...receivedExpected]);

      // Reload: the same order, rebuilt from the server.
      await page.reload();
      await page.waitForSelector("#root *", { timeout: 20000 });
      await login(page, A);
      await page.waitForTimeout(3000);
      await openHistory(page);
      cols = await historyColumns(page);
      assert.deepEqual(cols[0], ["16:20:00", ...receivedExpected], "receiving column after reload");
      assert.deepEqual(cols[1], sentExpected, "sending column after reload");
      assert.equal(all(cols).length, 6);
    } finally {
      await context.close();
    }
  });
});
