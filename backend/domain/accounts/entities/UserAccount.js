// src/domain/accounts/entities/UserAccount.js
// Defaults to COIN_CURRENCY rather than a literal, so the account's own
// currency label can never drift from the currency its lines are actually
// posted in. It said "GC" while CoinService posted "GEU" for exactly as long
// as it took to notice. (A default parameter is evaluated at call time, so
// module order in the bundle does not matter here.)
function createUserAccount(userId, currency = "INR", coinCurrency = COIN_CURRENCY) {
  return {
    userId,
    bank: new LedgerAccount({ id: `user:${userId}:bank`, type: ACCOUNT_TYPE.ASSET, name: "Gloobal Bank", currency, ownerId: userId }),
    // Gloobal Coin held by this account. An ASSET, like the bank account, and
    // denominated in GEU rather than the account's fiat currency — that is what
    // stops a coin figure being added to a rupee one anywhere downstream, since
    // Money refuses arithmetic across currencies outright.
    coin: new LedgerAccount({ id: `user:${userId}:coin`, type: ACCOUNT_TYPE.ASSET, name: "Gloobal Coin", currency: coinCurrency, ownerId: userId }),
    paylaterPayable: new LedgerAccount({ id: `user:${userId}:paylater-payable`, type: ACCOUNT_TYPE.LIABILITY, name: "PayLater Payable", currency, ownerId: userId }),
    essentials: new LedgerAccount({ id: `user:${userId}:essentials`, type: ACCOUNT_TYPE.ASSET, name: "Essentials Wallet", currency, ownerId: userId }),
    // ASSET, not INCOME: this is a settleable balance (money the user
    // can move to their bank), same category as Essentials — an
    // INCOME-typed account here would mean the SettlementEngine's
    // "credit the source to draw it down" line would *increase* the
    // balance instead of decreasing it (INCOME is credit-normal), the
    // same money-creation shape as the Essentials-grant bug this pass
    // fixed. Currently unfunded by any flow, so this was latent.
    referralEarnings: new LedgerAccount({ id: `user:${userId}:referral-earnings`, type: ACCOUNT_TYPE.ASSET, name: "Referral Earnings", currency, ownerId: userId }),
    creatorShareIncome: new LedgerAccount({ id: `user:${userId}:creator-share-income`, type: ACCOUNT_TYPE.INCOME, name: "Creator Share Income", currency, ownerId: userId })
  };
}

