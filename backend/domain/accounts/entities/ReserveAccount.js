// src/domain/accounts/entities/ReserveAccount.js
function createReserveAccount(currency = "INR") {
  return new LedgerAccount({
    id: `platform:reserve:${currency}`,
    type: ACCOUNT_TYPE.LIABILITY,
    // platform holds it in trust, owes it onward
    name: "Platform Reserve / Clearing",
    currency
  });
}

// The fiat backing Gloobal Coin, held by the platform.
//
// An ASSET and not a second clearing liability: this is money the platform is
// holding, and a mint debits it — value arriving. It is a different pool from
// `platform:reserve`, which is what the platform owes against bank balances.
// A mint moves an obligation from one to the other rather than creating either.
function createCoinReserveAccount(currency = "INR") {
  return new LedgerAccount({
    id: `platform:coin-reserve:${currency}`,
    type: ACCOUNT_TYPE.ASSET,
    name: "Gloobal Coin Reserve",
    currency
  });
}

// Coin the platform has issued and therefore owes to whoever holds it.
//
// A LIABILITY, so a credit increases it: issuing coin increases what the
// platform owes, exactly as taking a deposit does. Its balance is the coin
// supply as this ledger can see it — in a browser modelling one account, that
// account's holding.
// Defaults to COIN_CURRENCY rather than a literal, so the account's own
// currency label can never drift from the currency its lines are actually
// posted in. It said "GC" while CoinService posted "GEU" for exactly as long
// as it took to notice. (A default parameter is evaluated at call time, so
// module order in the bundle does not matter here.)
function createCoinIssuanceAccount(coinCurrency = COIN_CURRENCY) {
  return new LedgerAccount({
    id: `platform:coin-issuance:${coinCurrency}`,
    type: ACCOUNT_TYPE.LIABILITY,
    name: "Gloobal Coin Issuance",
    currency: coinCurrency
  });
}

