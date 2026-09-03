// src/domain/accounts/AccountRegistry.js
var AccountRegistry = class {
  #accountsById = /* @__PURE__ */ new Map();
  // See createUserAccount for why this is COIN_CURRENCY and not a literal.
  constructor({ currency = "INR", coinCurrency = COIN_CURRENCY } = {}) {
    this.reserve = createReserveAccount(currency);
    this.#register(this.reserve);
    // The two platform-side halves of Gloobal Coin. Registered here rather than
    // per user because there is one reserve and one issuance for the whole
    // platform, however many accounts it holds — and because postJournalEntry
    // rejects a line naming an account the registry has never heard of, so they
    // have to exist before the first mint, not on demand at it.
    this.coinReserve = createCoinReserveAccount(currency);
    this.#register(this.coinReserve);
    this.coinIssuance = createCoinIssuanceAccount(coinCurrency);
    this.#register(this.coinIssuance);
  }
  #register(account) {
    this.#accountsById.set(account.id, account);
    return account;
  }
  registerUser(userId, currency = "INR") {
    const bundle = createUserAccount(userId, currency);
    Object.values(bundle).forEach((v) => {
      if (v && v.id) this.#register(v);
    });
    return bundle;
  }
  registerMerchant(merchantBundle) {
    Object.values(merchantBundle).forEach((v) => {
      if (v && v.id) this.#register(v);
    });
    return merchantBundle;
  }
  get(accountId) {
    const account = this.#accountsById.get(accountId);
    if (!account) throw new RangeError(`AccountRegistry: unknown account "${accountId}"`);
    return account;
  }
  has(accountId) {
    return this.#accountsById.has(accountId);
  }
  all() {
    return Array.from(this.#accountsById.values());
  }
};

