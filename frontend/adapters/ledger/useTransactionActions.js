// src/adapters/ledger/useTransactionActions.js
import { useCallback as useCallback2 } from "react";
function useTransactionActions() {
  const core = useFinancialCore();
  const { orchestrator, userAccounts } = core;
  // THE single canonical transaction lifecycle. Send Money, Scan & Pay,
  // and Pay a Business all call this one hook function — there is no
  // separate ledger-posting path left anywhere in the UI layer. One
  // call does risk-check + posting + provenance + complaint window +
  // (if eligible) asset-seed grant, atomically, at the domain
  // boundary — not spread across a synchronous post here and a
  // fire-and-forget completion later.
  const executeTransaction = useCallback2(
    (args) => orchestrator.executeTransaction({ userAccounts, ...args }),
    [orchestrator, userAccounts]
  );
  const settleEssentialsToBank = useCallback2((amount) => orchestrator.settleEssentialsToBank({ userAccounts, amount }), [orchestrator, userAccounts]);
  const settleReferralToBank = useCallback2((amount) => orchestrator.settleReferralToBank({ userAccounts, amount }), [orchestrator, userAccounts]);
  // My Essentials daily pool — a separate, standing subsidy the
  // platform applies directly to the user's own bank balance, not a
  // payment method and not part of any one purchase's own lifecycle.
  // Currently called by Scan & Pay, once, before executeTransaction,
  // so the subsidized amount is already real bank balance by the time
  // the actual payment's own risk check runs.
  const applyEssentialsPoolSubsidy = useCallback2(
    (args) => orchestrator.applyEssentialsPoolSubsidy({ userAccounts, ...args }),
    [orchestrator, userAccounts]
  );
  // NOTE: no addEssentialsGrant here, and no standalone checkAndDeduct/
  // scanAndPay either. Asset seeds are created in exactly one place —
  // inside executeTransaction(), on a real, first-time completion, and
  // there is deliberately no direct UI passthrough that skips it.
  // Aligns the local bank balance with what the server says the account
  // holds. Not a transaction — it posts a reconciliation entry (see
  // reconcileBankBalance in FinancialCore) so the figure the dashboard
  // shows, and the figure executeTransaction's risk check reads, are the
  // account's real balance rather than a local opening float.
  const reconcileBankBalance = useCallback2((serverBalance) => core.reconcileBankBalance(serverBalance), [core]);
  // The same reconcile-against-the-server contract, for the two things that
  // used to reset on every re-login: what this account owes on PayLater, and
  // the seeds My Assets is built from. See their definitions in
  // FinancialCore for why the due is reconciled as a total while the seeds
  // are replayed individually.
  const reconcilePaylaterDue = useCallback2((serverDues) => core.reconcilePaylaterDue(serverDues), [core]);
  const hydrateGrantsFromServer = useCallback2((serverSeeds) => core.hydrateGrantsFromServer(serverSeeds), [core]);
  // Empties the ledger on sign-out so the next account does not inherit this
  // one's seeds and PayLater position. See resetForAccountSwitch in
  // FinancialCore for why the grants in particular could not simply be left
  // for the next hydrate to overwrite.
  const resetForAccountSwitch = useCallback2(() => core.resetForAccountSwitch(), [core]);
  return { executeTransaction, settleEssentialsToBank, settleReferralToBank, applyEssentialsPoolSubsidy, reconcileBankBalance, reconcilePaylaterDue, hydrateGrantsFromServer, resetForAccountSwitch };
}

