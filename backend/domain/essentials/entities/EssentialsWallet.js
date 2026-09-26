// src/domain/essentials/entities/EssentialsWallet.js
var EssentialsGrant = class {
  constructor({ key, business, chip, amountPaid, cashbackRate, date, time, creatorName, monthsAccrued = 0, txnId = null, paylaterSettledAmount = 0, occurredAt = null }) {
    this.key = key;
    this.business = business;
    this.chip = chip;
    this.amountPaid = amountPaid;
    this.cashbackRate = cashbackRate;
    this.date = date;
    this.time = time;
    this.creatorName = creatorName;
    this.monthsAccrued = monthsAccrued;
    // The completed transaction this grant is backed by — null only
    // for the (test-only) direct-grant path. Used to make addGrant
    // idempotent per transaction.
    this.txnId = txnId;
    // How much of this grant's value was immediately auto-settled
    // against outstanding PayLater due (see
    // TransactionOrchestrator#completeTransaction) — 0 when there was
    // no due to settle. Drives which method tag ("PayLater" vs
    // "Bank") this grant's Received history row shows, so the tag
    // reflects where the money actually landed instead of always
    // saying "Bank".
    this.paylaterSettledAmount = paylaterSettledAmount;
    // When this grant was planted, as an ISO instant: the payment's own
    // `now` for a grant minted here, the server's plantedAt for one restored
    // from it. What the My Assets list sorts by (transactionOrder.js) — the
    // date/time above are display strings, and "Aug 13" cannot order two
    // seeds planted the same day. Null only when nothing recorded one.
    this.occurredAt = occurredAt;
    Object.freeze(this);
  }
  // Current accrued value of this single grant, compounding monthly —
  // same formula as the original `computePaylaterAvailable` in
  // utils/currency.js, now attached to the entity it describes instead
  // of living in a standalone currency-math file.
  accruedValue(monthlyGrowthRate) {
    const cashback = this.amountPaid * this.cashbackRate;
    return cashback * Math.pow(1 + monthlyGrowthRate, this.monthsAccrued);
  }
};

