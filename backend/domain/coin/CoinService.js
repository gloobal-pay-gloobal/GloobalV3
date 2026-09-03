// src/domain/coin/CoinService.js
//
// Gloobal Coin, in the browser ledger.
//
// The server is the authority — Backend/server.js holds the balances and the
// reserve, and its tests assert the supply invariant. This service is the local
// double-entry record of the same movements, so that the ledger a person can
// inspect on their own device tells the same story the database does rather
// than being a UI that happens to display a number fetched from elsewhere.
//
// Why the entries look the way they do. A mint is ONE journal entry with four
// lines in two currencies, not two entries:
//
//   INR   debit  platform:coin-reserve      the fiat is now held as backing
//         credit user:bank                  and has left the spendable account
//   GC    debit  user:coin                  coin exists and this account holds it
//         credit platform:coin-issuance     the platform owes that coin
//
// JournalEntry.#assertBalanced totals by currency and requires each to balance
// on its own, so this entry is rejected unless the INR pair agrees AND the GC
// pair agrees. That is the property that makes a one-sided conversion — fiat
// taken without coin issued, or the reverse — unpostable rather than merely
// discouraged. Splitting it into two entries would lose exactly that: each half
// would balance alone and nothing would tie them together.
//
// Money refuses arithmetic across currencies (see Money.assertSameCurrency), so
// no code path can add a coin figure to a fiat one even by accident.
//
// ── The two legs are NOT the same number ─────────────────────────────────
//
// They used to be. This file said "they are equal in magnitude because the
// issue rate is 1:1", and mint() took a single `amount` and used it for both
// the fiat line and the coin line.
//
// That holds only when the account's own currency IS the reserve currency.
// One coin is one unit of the RESERVE currency, and `reserveCurrency` here is
// the currency of the account this ledger belongs to (see FinancialCore,
// which passes the user's own). So for an account outside the reserve's
// country the two legs differ by the exchange rate: $100 leaves the bank and
// about 8,560 coin arrives. Posting 8,560 to both would have credited a US
// account's bank line with 8,560 dollars for a hundred-dollar purchase.
//
// Both amounts are now passed in, from the server's own response, because
// the server is where the rate was applied and a second local conversion
// could disagree with it.
// Matches the server's COIN_CURRENCY exactly. Was "GC" on both sides; the
// two must never disagree, because this ledger's whole purpose is to tell the
// same story the database does.
var COIN_CURRENCY = "GEU";

var CoinService = class {
  constructor(ledgerEngine, accounts, { reserveCurrency = "INR", eventBus = null } = {}) {
    this.ledgerEngine = ledgerEngine;
    this.accounts = accounts;
    this.reserveCurrency = reserveCurrency;
    this.eventBus = eventBus;
  }

  // How much coin this account holds, derived from the entries — never stored.
  balance() {
    return this.ledgerEngine.getAccountBalance(this.accounts.userCoin.id, COIN_CURRENCY);
  }

  // Coin the platform has issued to accounts this ledger knows about. In a
  // browser that models one person, that is this person's holding, so the two
  // agree by construction; the account exists so the GC side of every entry has
  // a counterparty and can balance at all.
  issued() {
    return this.ledgerEngine.getAccountBalance(this.accounts.coinIssuance.id, COIN_CURRENCY);
  }

  // Fiat held as backing.
  reserve() {
    return this.ledgerEngine.getAccountBalance(this.accounts.coinReserve.id, this.reserveCurrency);
  }

  // Fiat in, coin out. `amount` is in major units of the reserve currency, and
  // the same figure is issued as coin because the rate is 1:1.
  // `coinAmount` is what was issued; `fiatAmount` is what was paid for it, in
  // this account's own currency. They default to being equal, which is the
  // correct and complete answer for an account in the reserve's own country
  // and nowhere else — every caller outside that case must pass both.
  mint(coinAmount, { now, meta, fiatAmount = coinAmount } = {}) {
    const fiat = Money.of(fiatAmount, this.reserveCurrency);
    const coin = Money.of(coinAmount, COIN_CURRENCY);

    if (!fiat.isPositive()) throw new TypeError("CoinService.mint: fiat amount must be positive");
    if (!coin.isPositive()) throw new TypeError("CoinService.mint: coin amount must be positive");

    return this.ledgerEngine.postJournalEntry({
      memo: "Minted Gloobal Coin",
      now,
      lines: [
        DebitEntry(this.accounts.coinReserve.id, fiat),
        CreditEntry(this.accounts.userBank.id, fiat),
        DebitEntry(this.accounts.userCoin.id, coin),
        CreditEntry(this.accounts.coinIssuance.id, coin)
      ],
      meta: { kind: "coin-mint", amount: coin.amount, fiatAmount: fiat.amount, ...meta }
    });
  }

  // The exact inverse of mint, line for line and direction for direction.
  redeem(coinAmount, { now, meta, fiatAmount = coinAmount } = {}) {
    const fiat = Money.of(fiatAmount, this.reserveCurrency);
    const coin = Money.of(coinAmount, COIN_CURRENCY);

    if (!fiat.isPositive()) throw new TypeError("CoinService.redeem: fiat amount must be positive");
    if (!coin.isPositive()) throw new TypeError("CoinService.redeem: coin amount must be positive");

    return this.ledgerEngine.postJournalEntry({
      memo: "Redeemed Gloobal Coin",
      now,
      lines: [
        DebitEntry(this.accounts.userBank.id, fiat),
        CreditEntry(this.accounts.coinReserve.id, fiat),
        DebitEntry(this.accounts.coinIssuance.id, coin),
        CreditEntry(this.accounts.userCoin.id, coin)
      ],
      meta: { kind: "coin-redeem", amount: coin.amount, fiatAmount: fiat.amount, ...meta }
    });
  }

  // Coin leaving for another Gloobal ID.
  //
  // Only the GC side moves: no fiat changes hands and the reserve is not
  // touched, because a transfer does not change how much coin exists — only
  // who has it. That is the same property the server's test asserts (a transfer
  // leaves `reserve` and `issued` untouched), stated here in the ledger's own
  // terms.
  //
  // The counterparty is `platform:coin-issuance` rather than the recipient,
  // because this ledger models one account and has no entry for the other side.
  // Locally the issuance account means "coin held by accounts this ledger can
  // see", and after a transfer out it can see less of it.
  transferOut(amount, { now, meta } = {}) {
    const coin = Money.of(amount, COIN_CURRENCY);

    if (!coin.isPositive()) throw new TypeError("CoinService.transferOut: amount must be positive");

    return this.ledgerEngine.postJournalEntry({
      memo: "Sent Gloobal Coin",
      now,
      lines: [DebitEntry(this.accounts.coinIssuance.id, coin), CreditEntry(this.accounts.userCoin.id, coin)],
      meta: { kind: "coin-transfer-out", amount: coin.amount, ...meta }
    });
  }

  transferIn(amount, { now, meta } = {}) {
    const coin = Money.of(amount, COIN_CURRENCY);

    if (!coin.isPositive()) throw new TypeError("CoinService.transferIn: amount must be positive");

    return this.ledgerEngine.postJournalEntry({
      memo: "Received Gloobal Coin",
      now,
      lines: [DebitEntry(this.accounts.userCoin.id, coin), CreditEntry(this.accounts.coinIssuance.id, coin)],
      meta: { kind: "coin-transfer-in", amount: coin.amount, ...meta }
    });
  }

  // Bring the local coin balance in line with the server's, the same way
  // reconcileBankBalance does for fiat and for the same reason: the server is
  // where the balance actually lives, and this ledger is a mirror that can fall
  // behind (another device minted, a response was lost, the tab was open across
  // a redeem elsewhere).
  //
  // Adjusting by posting rather than by assignment, because a balance here is
  // derived from entries and there is nothing to assign. The adjustment moves
  // the issuance account against the holding, which keeps the GC side balanced
  // and leaves the discrepancy visible in the ledger under its own memo instead
  // of quietly rewriting history.
  //
  // Returns the delta applied, or 0 when already in sync.
  reconcile(serverCoinBalance) {
    // Only a real number counts. Number(null), Number("") and Number([]) are
    // all 0 — finite, non-negative and indistinguishable from a true zero — so
    // coercing first would let a response with `coinBalance` missing wipe the
    // holding and post an entry claiming the server asked for it.
    const isNumeric =
      typeof serverCoinBalance === "number" ||
      (typeof serverCoinBalance === "string" && serverCoinBalance.trim() !== "" && Number.isFinite(Number(serverCoinBalance)));

    if (!isNumeric) return 0;

    const target = Number(serverCoinBalance);
    if (!Number.isFinite(target) || target < 0) return 0;

    const current = this.balance().amount;
    const delta = Number((target - current).toFixed(2));
    if (delta === 0) return 0;

    const magnitude = Money.of(Math.abs(delta), COIN_CURRENCY);

    this.ledgerEngine.postJournalEntry({
      memo: "Gloobal Coin reconciled with Gloobal server",
      lines:
        delta > 0
          ? [DebitEntry(this.accounts.userCoin.id, magnitude), CreditEntry(this.accounts.coinIssuance.id, magnitude)]
          : [DebitEntry(this.accounts.coinIssuance.id, magnitude), CreditEntry(this.accounts.userCoin.id, magnitude)],
      meta: { kind: "coin-server-reconciliation", serverCoinBalance: target, delta }
    });

    return delta;
  }

  // Every coin movement on this account, newest first, shaped for a screen.
  history(limit = 20) {
    return this.ledgerEngine
      .getAccountHistory(this.accounts.userCoin.id)
      .slice()
      .reverse()
      .slice(0, limit)
      .map((record) => {
        const line = record.lines[0];
        // The same { date, time } shape every other history row in the app
        // carries, so this list can go through historyRowStamp like the rest
        // instead of formatting a date of its own.
        //
        // The screen used to call toLocaleDateString(undefined, …) on
        // postedAt: no time at all, and a device-dependent date, on the one
        // list that shows coin movements. "Sep 3" cannot tell two purchases
        // on the same day apart, and `undefined` for the locale means the
        // same instant reads differently on two phones — both of which the
        // rest of the app had already been fixed for.
        const posted = new Date(record.postedAt);
        const postedValid = !isNaN(posted.getTime());
        return {
          id: record.recordId,
          sequence: record.sequence,
          postedAt: record.postedAt,
          date: postedValid ? posted.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
          time: postedValid ? formatClockTime(posted) : "",
          memo: record.memo,
          kind: record.meta?.kind || "coin",
          // A debit to an ASSET account is an increase, which is why this reads
          // the direction rather than the sign of anything.
          direction: line?.direction === "debit" ? "in" : "out",
          amount: line?.money.amount || 0,
          currency: COIN_CURRENCY
        };
      });
  }
};
