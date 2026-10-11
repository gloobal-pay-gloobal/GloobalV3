// src/adapters/ledger/useLedgerProjections.js
import { useCallback, useMemo as useMemo2, useSyncExternalStore } from "react";
function useLedgerVersion() {
  const core = useFinancialCore();
  const subscribe = useCallback((onChange) => core.ledgerEngine.subscribe(onChange), [core]);
  const getSnapshot = useCallback(() => core.store.getAll().length, [core]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
function useBankBalance() {
  const core = useFinancialCore();
  useLedgerVersion();
  return core.ledgerEngine.getAccountBalance(core.userAccounts.bank.id, core.currency).amount;
}
// Real paylaterPayable ledger balance (a liability account — its
// balance already IS "how much is currently owed") instead of summing
// pending draw records, which never reflected settlements. See
// PayLaterService#computeAvailable for the same fix on the domain
// side; this is the UI-facing equivalent for computePaylaterAvailable.
function usePaylaterDue() {
  const core = useFinancialCore();
  useLedgerVersion();
  return core.ledgerEngine.getAccountBalance(core.userAccounts.paylaterPayable.id, core.currency).amount;
}
// My Essentials daily pool status — how much of today's dailyLimit is
// left, reactive to ledger changes (a subsidy application bumps the
// version like any other posting) so the UI updates immediately after
// a Scan & Pay draws from it. Resets automatically at the next
// calendar day, same as the domain-side remainingToday().
function useEssentialsPoolRemaining(dailyLimit) {
  const core = useFinancialCore();
  useLedgerVersion();
  return core.essentialsPoolService.remainingToday(dailyLimit);
}
function useEssentialsGrants() {
  const core = useFinancialCore();
  const version = useLedgerVersion();
  return useMemo2(() => core.essentialsService.listGrants(), [core, version]);
}
// Gloobal Coin held by this account, derived from the ledger the same way
function usePaylaterHistory() {
  const core = useFinancialCore();
  const version = useLedgerVersion();
  return useMemo2(() => core.payLaterService.listRecords(), [core, version]);
}

