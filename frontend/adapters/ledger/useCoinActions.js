// src/adapters/ledger/useCoinActions.js
import { useCallback as useCallback9 } from "react";

// Gloobal Coin, from the UI's side of the boundary.
//
// Each action here is one server call followed by one local posting, in that
// order, and the order is the whole design. The server owns the balances: its
// conditional updates are what stop an account minting coin it cannot back or
// spending coin twice, and its supply invariant is what makes "fully backed" a
// checkable statement rather than a slogan. So nothing is posted locally until
// the server has said it happened.
//
// The local posting is not a duplicate of that work — it is the double-entry
// record of it, so the ledger a person can inspect on their device tells the
// same story the database does. Posting first and calling second would put a
// mint in the ledger that the server may have refused, which is the failure
// mode this ordering exists to rule out.
//
// Each call then reconciles from the figures in its own response rather than
// issuing a follow-up read. A second GET could land after some other device
// moved the same balance, and the screen would show a number that never
// followed from the action just taken.
function useCoinActions() {
  const core = useFinancialCore();

  // Fiat into coin.
  const mintCoin = useCallback9(
    async (symbolId, amount) => {
      const result = await GloobalApi.coinMint(symbolId, amount);
      // Both legs, from the server's own response. `minted` is coin issued;
      // `paid` is what actually left the bank balance, in this account's
      // currency. Passing only the first would post the coin figure to the
      // fiat line — see the note at the top of CoinService.
      core.coinService.mint(result.minted, {
        fiatAmount: result.paid,
        meta: { referenceId: result.referenceId, geuRate: result.geuRate }
      });
      // Both sides moved, so both are reconciled. Each is a no-op when the
      // posting above already landed on the server's figure, which is the
      // ordinary case — they earn their keep when it did not, for instance
      // when another device minted while this screen was open.
      core.reconcileBankBalance(result.balance);
      core.reconcileCoinBalance(result.coinBalance);
      return result;
    },
    [core]
  );

  // Coin back into fiat.
  const redeemCoin = useCallback9(
    async (symbolId, amount) => {
      const result = await GloobalApi.coinRedeem(symbolId, amount);
      core.coinService.redeem(result.redeemed, {
        fiatAmount: result.received,
        meta: { referenceId: result.referenceId, geuRate: result.geuRate }
      });
      core.reconcileBankBalance(result.balance);
      core.reconcileCoinBalance(result.coinBalance);
      return result;
    },
    [core]
  );

  // Coin to another Gloobal ID. Only the coin side moves — no fiat changes
  // hands and the reserve is untouched — so there is no bank reconcile here,
  // and its absence is deliberate rather than an oversight.
  const sendCoin = useCallback9(
    async (senderSymbolId, receiverSymbolId, amount, pin, note) => {
      const result = await GloobalApi.coinSend(senderSymbolId, receiverSymbolId, amount, pin, note);
      core.coinService.transferOut(result.sent, { meta: { referenceId: result.referenceId, to: receiverSymbolId } });
      core.reconcileCoinBalance(result.coinBalance);
      return result;
    },
    [core]
  );

  // A plain read, used on open and after a pull-to-refresh. Reconciles both
  // sides so a balance moved on another device shows up here.
  const refreshCoin = useCallback9(
    async (symbolId) => {
      const position = await GloobalApi.getCoin(symbolId);
      core.reconcileBankBalance(position.balance);
      core.reconcileCoinBalance(position.coinBalance);
      return position;
    },
    [core]
  );

  return { mintCoin, redeemCoin, sendCoin, refreshCoin };
}
