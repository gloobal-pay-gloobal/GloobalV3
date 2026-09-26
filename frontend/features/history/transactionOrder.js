// src/features/history/transactionOrder.js
//
// ── The one ordering rule for every transaction list ────────────────────
//
// Newest first, by the row's own `occurredAt` — the moment the transaction
// happened, as recorded: the server's `createdAt` for a row read back from
// history, the payment's own `now` for a row this session wrote, the seed's
// `plantedAt` for a restored asset. Used by Recent Transactions, History, the
// Home activity card and My Assets, so the lists cannot disagree.
//
// It replaces two things that were each wrong on their own:
//
//   - lists that were never sorted at all, and read in whatever order their
//     rows happened to arrive — a payment polled in after the first load was
//     appended to the END of its list; and
//   - lists sorted by `parseDemoDate(row.date)`, which is the DAY ("Aug 13")
//     and nothing finer, so every row on the same day tied and fell back to
//     arrival order. That is how a day read 16:14:07, 14:13:38, 16:13:01,
//     14:13:37, 16:13:00.
//
// No display string is compared: not `date`, not `time`, not the reference.
//
// Ties (two rows at the same instant) keep their existing relative order —
// Array.prototype.sort is stable — which for server rows is the server's own
// `createdAt: -1` order. No new tie-break rule is invented.
//
// A row with no recorded instant (legacy data only) is not given one: it
// sorts after every row that has one, keeping its own relative order.

function transactionOccurredAtMs(row) {
  const raw = row ? row.occurredAt : null;
  if (raw === null || raw === void 0 || raw === "") return null;
  const ms = typeof raw === "number" ? raw : new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function compareTransactionsNewestFirst(a, b) {
  const at = transactionOccurredAtMs(a);
  const bt = transactionOccurredAtMs(b);
  if (at === null && bt === null) return 0;
  if (at === null) return 1;
  if (bt === null) return -1;
  return bt - at;
}

// A sorted COPY. Never sorts the caller's array in place — these arrays are
// React state.
function sortTransactionsNewestFirst(rows) {
  return Array.isArray(rows) ? rows.slice().sort(compareTransactionsNewestFirst) : [];
}
