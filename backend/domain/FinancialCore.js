// src/domain/FinancialCore.js
// openingBankBalance defaults to the server's own DEFAULT_ACCOUNT_BALANCE
// (server.js: 10000) — see the matching comment in LedgerProvider.jsx for
// why the two must not drift apart.
function createFinancialCore({ userId = "demo-user", currency = "INR", openingBankBalance = 1e4, eventBus, logLevel } = {}) {
  const store = new LedgerStore();
  const registry = new AccountRegistry();
  const bus = eventBus || new EventBus();
  const ledgerEngine = new LedgerEngine(store, registry, bus);
  const userAccounts = registry.registerUser(userId, currency);
  // Gloobal Coin. The server owns the balances (Backend/server.js, and
  // tests/coin-supply-invariant.test.mjs asserts the supply invariant there);
  // this records the same movements as double entry so the local ledger and the
  // database tell one story rather than two.
  const coinService = new CoinService(
    ledgerEngine,
    {
      userBank: userAccounts.bank,
      userCoin: userAccounts.coin,
      coinReserve: registry.coinReserve,
      coinIssuance: registry.coinIssuance
    },
    { reserveCurrency: currency, eventBus: bus }
  );
  const liquidityPool = new LiquidityPool({ id: `pool:${currency}`, currency, reserveAccountId: registry.reserve.id });
  const liquidityService = new LiquidityService(ledgerEngine, liquidityPool);
  const essentialsService = new EssentialsService(ledgerEngine, ASSET_GROWTH_RATE_MONTHLY, bus);
  const essentialsPoolService = new EssentialsPoolService(ledgerEngine, bus);
  const creatorShareService = new CreatorShareService(essentialsService);
  const payLaterService = new PayLaterService(ledgerEngine, essentialsService, liquidityService, bus);
  const riskEngine = new RiskEngine(ledgerEngine, payLaterService, bus);
  const settlementEngine = new SettlementEngine(ledgerEngine);
  const provenanceStore = createProvenanceStore();
  const disputeStore = createDisputeStore();
  const idempotencyGuard = new IdempotencyGuard({ eventBus: bus });
  const provenanceService = new ProvenanceService(provenanceStore, bus, { idempotencyGuard });
  const disputeService = new DisputeService({ store: disputeStore, provenanceService, eventBus: bus, idempotencyGuard });
  const logger = createLogger(bus, { level: logLevel ?? "info", scope: userId });
  const orchestrator = new TransactionOrchestrator({
    ledgerEngine,
    riskEngine,
    payLaterService,
    settlementEngine,
    creatorShareService,
    essentialsService,
    essentialsPoolService,
    provenanceService,
    idempotencyGuard,
    eventBus: bus,
    currency
  });
  if (openingBankBalance > 0) {
    ledgerEngine.postJournalEntry({
      memo: "Opening Balance",
      lines: [DebitEntry(userAccounts.bank.id, Money.of(openingBankBalance, currency)), CreditEntry(registry.reserve.id, Money.of(openingBankBalance, currency))],
      meta: { kind: "opening-balance" }
    });
  }
  // Bring the local bank balance in line with the account's real balance
  // on the server.
  //
  // The two used to be unrelated: this ledger opened at a fixed 5,000 and
  // tracked only what happened in this browser session, while
  // POST /api/transactions/send debited the balance MongoDB holds. So the
  // dashboard could show 5,000 to an account the server knew was empty —
  // and, worse, the local figure is what executeTransaction's risk check
  // reads, so spending decisions were made against a number the backend
  // did not share.
  //
  // Reconciling by posting rather than by assignment is deliberate. This
  // is a double-entry ledger; a balance is derived from entries, not
  // stored, so there is nothing to assign. The adjustment uses the same
  // account pair the opening balance uses (bank against reserve), which is
  // what makes it a legitimate entry rather than a hole in the books, and
  // it stays visible in the ledger as its own memo.
  //
  // Returns the delta applied, or 0 when already in sync — callers can
  // fire this on every refresh without it doing anything when nothing
  // changed.
  function reconcileBankBalance(serverBalance) {
    // Only a genuine number counts. Coercing first would be a trap:
    // Number(null), Number("") and Number([]) are all 0 — finite,
    // non-negative, and indistinguishable from a real zero balance — so a
    // response with `balance` missing or null would wipe the account's
    // balance to nothing and post an entry saying the server asked for it.
    const isNumeric =
      typeof serverBalance === "number" ||
      (typeof serverBalance === "string" && serverBalance.trim() !== "" && Number.isFinite(Number(serverBalance)));
    if (!isNumeric) return 0;
    const target = Number(serverBalance);
    if (!Number.isFinite(target) || target < 0) return 0;
    const current = ledgerEngine.getAccountBalance(userAccounts.bank.id, currency).amount;
    const delta = Number((target - current).toFixed(2));
    if (delta === 0) return 0;
    const magnitude = Money.of(Math.abs(delta), currency);
    ledgerEngine.postJournalEntry({
      memo: "Balance reconciled with Gloobal server",
      lines:
        delta > 0
          ? [DebitEntry(userAccounts.bank.id, magnitude), CreditEntry(registry.reserve.id, magnitude)]
          : [DebitEntry(registry.reserve.id, magnitude), CreditEntry(userAccounts.bank.id, magnitude)],
      meta: { kind: "server-reconciliation", serverBalance: target, delta }
    });
    return delta;
  }
  // The PayLater equivalent of reconcileBankBalance above, and it exists for
  // the same reason: GET /api/assets/paylater/:symbolId is where what this
  // account actually owes lives, and this ledger is a mirror that starts
  // empty on every page load. Without this, a re-login showed a fresh ₹0 due
  // and a full PayLater limit to somebody who genuinely owed money — and
  // since RiskEngine reads paylaterAvailable off this same balance, it would
  // have authorised spending against credit that was already used.
  //
  // Deliberately reconciles the AGGREGATE, not the row list. The server sends
  // only the 50 most recent PayLater rows, so replaying them to derive the
  // due would silently overstate it the moment a charge is still in the
  // window but its repayment has scrolled out — showing money as owed that
  // was already repaid, and blocking the limit it should have freed. The
  // server's own `pendingDues` total is computed over everything, so it is
  // the only figure that is correct by construction; the rows are history to
  // display, not arithmetic to redo.
  //
  // paylaterPayable is a LIABILITY account, so the entry directions are the
  // mirror of the bank's: crediting it increases what is owed (matching
  // PayLaterService's own draw), debiting it reduces it (matching
  // SettlementEngine's settle).
  function reconcilePaylaterDue(serverDues) {
    // Same never-coerce guard as reconcileBankBalance: Number(null) === 0
    // would read as "this account owes nothing" and wipe a real due.
    const isNumeric =
      typeof serverDues === "number" ||
      (typeof serverDues === "string" && serverDues.trim() !== "" && Number.isFinite(Number(serverDues)));
    if (!isNumeric) return 0;
    const target = Number(serverDues);
    if (!Number.isFinite(target) || target < 0) return 0;
    const current = ledgerEngine.getAccountBalance(userAccounts.paylaterPayable.id, currency).amount;
    const delta = Number((target - current).toFixed(2));
    if (delta === 0) return 0;
    const magnitude = Money.of(Math.abs(delta), currency);
    ledgerEngine.postJournalEntry({
      memo: "PayLater due reconciled with Gloobal server",
      lines:
        delta > 0
          ? [DebitEntry(registry.reserve.id, magnitude), CreditEntry(userAccounts.paylaterPayable.id, magnitude)]
          : [DebitEntry(userAccounts.paylaterPayable.id, magnitude), CreditEntry(registry.reserve.id, magnitude)],
      meta: { kind: "server-paylater-reconciliation", serverDues: target, delta }
    });
    return delta;
  }
  // Replays this account's saved seeds from GET /api/assets/:symbolId into
  // the local grant list, so My Assets survives a re-login instead of
  // starting empty every time.
  //
  // Every seed the server holds was planted by a payment THIS account made
  // and got Creator Share back from, so they all carry chip "CS" — that is
  // what the profile screen's "Creator Share" total counts. Referral
  // earnings are a different thing entirely and are not seeds (see
  // referralNetwork in Dashboard.jsx, where per-referral amounts are
  // deliberately left at 0 because the backend does not attribute them yet).
  //
  // ONLY restores into an empty list, and that restriction is load-bearing.
  //
  // A seed planted by a payment made in THIS session (addGrant) is keyed by
  // its txnId and its own minted key. The same seed read back from the
  // server arrives keyed by the server's row id, and computeSeed does not
  // return the transactionId, so there is no field the two share to match
  // on. Merging them would therefore count one payment's cashback twice —
  // ₹20 earned showing as ₹40 — and since the PayLater LIMIT is the sum of
  // seed values, that is inflated credit the RiskEngine would authorise real
  // spending against.
  //
  // Restricting to an empty list makes that impossible while still doing the
  // whole job: this ledger is rebuilt from nothing on every page load, so
  // "empty" is exactly the state a re-login arrives in, which is the case
  // this exists for. Once a payment has planted a seed locally, the local
  // list is already the more current of the two and is left alone until the
  // next reload.
  //
  // If the server ever exposes transactionId on a seed, this can become a
  // real per-seed merge; until then, refusing to merge is the only safe
  // behaviour.
  function hydrateGrantsFromServer(serverSeeds) {
    if (!Array.isArray(serverSeeds) || serverSeeds.length === 0) return 0;
    if (essentialsService.listGrants().length > 0) return 0;
    let added = 0;
    for (const seed of serverSeeds) {
      const id = seed && seed.id;
      if (!id) continue;
      const key = `srv-${id}`;
      if (essentialsService.listGrants().some((g) => g.key === key)) continue;
      const amountPaid = Number(seed.amountPaid) || 0;
      const cashbackRate = Number(seed.cashbackRate) || 0;
      if (amountPaid <= 0 || cashbackRate <= 0) continue;
      // The server reports elapsed growth in YEARS; every local consumer
      // (EssentialsGrant#accruedValue, computePaylaterAvailable, the Assets
      // detail chart) works in MONTHS. Converting here rather than at each
      // read is what stops a 1-year-old seed being valued as a 1-month-old
      // one.
      const monthsAccrued = Math.max(0, Math.round((Number(seed.yearsAccrued) || 0) * 12));
      const planted = seed.plantedAt ? new Date(seed.plantedAt) : null;
      const valid = planted && !Number.isNaN(planted.getTime());
      essentialsService.restoreGrant({
        userAccounts,
        currency,
        key,
        business: seed.business || "Gloobal",
        chip: "CS",
        amountPaid,
        cashbackRate,
        monthsAccrued,
        creatorName: seed.business || "Gloobal",
        date: valid ? planted.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
        // Through formatClockTime like every other time in the app. This
        // line was its own formatter — "en-US", hour + minute only — so an
        // asset seed's time rendered "2:07 PM" while the payment that
        // planted it rendered "14:07:32". Two clocks, one event.
        time: valid ? formatClockTime(planted) : ""
      });
      added += 1;
    }
    return added;
  }
  // Empties this ledger so the next account starts from nothing.
  //
  // The ledger is created once per page load (LedgerProvider holds it in a
  // useRef and never rebuilds it), so signing out and into a second account
  // reuses the first account's ledger. The balance alone recovered, because
  // reconcileBankBalance posts a DELTA toward whatever the server reports and
  // converges from any starting point. The seeds did not: hydrateGrantsFromServer
  // deliberately restores only into an EMPTY grant list — its guard against
  // double-counting a seed it cannot match by id — so account B arrived, found
  // account A's grants still sitting there, and declined to hydrate at all.
  // Account A's assets stayed on screen, and because the PayLater LIMIT is the
  // sum of seed values, account B borrowed against account A's cashback.
  //
  // Zeroing rather than reconstructing: every figure here is re-derived from
  // the server moments later by the hydration effects in App.jsx. Leaving the
  // ledger at zero in between is honest — it is what this browser actually
  // knows about the new account before the first read returns — and
  // balanceStatus already renders that state as unconfirmed rather than as a
  // real zero.
  function resetForAccountSwitch() {
    essentialsService.clearGrants();
    // Same posting discipline reconcileBankBalance uses: a balance is derived
    // from entries, so it is driven to zero by posting the inverse entry, not
    // by assignment. Reusing reconcile* also means the reset is recorded in
    // the ledger with its own memo rather than silently vanishing.
    reconcileBankBalance(0);
    reconcilePaylaterDue(0);
    return true;
  }
  bus.emit(DomainEvent.CORE_INITIALIZED, { userId, currency, openingBankBalance });
  return {
    store,
    registry,
    ledgerEngine,
    userAccounts,
    liquidityService,
    essentialsService,
    essentialsPoolService,
    creatorShareService,
    payLaterService,
    riskEngine,
    settlementEngine,
    orchestrator,
    provenanceStore,
    provenanceService,
    disputeStore,
    disputeService,
    idempotencyGuard,
    reconcileBankBalance,
    reconcilePaylaterDue,
    hydrateGrantsFromServer,
    resetForAccountSwitch,
    coinService,
    // Mirrors reconcileBankBalance for the coin side. Both are handed the
    // figure the server just reported, and both are no-ops when it already
    // agrees, so a screen can call them after every coin call without
    // littering the ledger.
    reconcileCoinBalance: (serverCoinBalance) => coinService.reconcile(serverCoinBalance),
    coinCurrency: COIN_CURRENCY,
    currency,
    eventBus: bus,
    logger
  };
}

