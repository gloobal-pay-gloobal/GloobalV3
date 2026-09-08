# Creator Share, the PayLater pool, and held collections

Agreed 8 September 2026. **Nothing in this document is built yet.** It is the
spec for a change to live money paths, written down first because the server
edits touch a production database with real balances.

---

## 1. The worked example

Asha pays Ravi **100₹**. Ravi's Creator Share is **2%**.

### What happens now (wrong)

| Step | Account | Movement | Where it lands |
|---|---|---|---|
| 1 | Asha | −100₹ | balance |
| 2 | Ravi | +98₹ | balance (`amount − cashback`, one credit) |
| 3 | Asha | +2₹ | **balance — immediately spendable** |
| 4 | Asha | +2₹ | asset seed, client-side |
| 5 | Asha | +2₹ | PayLater limit (`paylaterLimit = totalAssets`) |

The books balance (−100 + 98 + 2 = 0) but **the same 2₹ does three jobs**:
spendable cash, a compounding seed, and PayLater headroom. Ravi never sees
that he shared anything — he just receives a smaller number.

### What should happen

| Step | Account | Movement | Where it lands | History row |
|---|---|---|---|---|
| 1 | Asha | −100₹ | balance | Asha: **Paid** −100₹ |
| 2 | Ravi | +100₹ | collection | Ravi: **Received** +100₹ |
| 3 | Ravi | −2₹ | collection | Ravi: **Paid** −2₹ (share) |
| 4 | Asha | +2₹ | **PayLater pool** | Asha: **Received** +2₹, method: PayLater |

Ledger identity: −100 + 100 − 2 + 2 = **0**.

Asha's 2₹ is **not** spendable cash. It is one pot with two exits:

- **spend it later** — it raises her PayLater available limit
- **settle it** — from My Assets, to Bank or Coin

Settling reduces the pool, which reduces the limit, so the 2₹ is only ever
spent once.

Ravi now has two rows, which is what actually happened: he was paid 100 and
he shared 2. Today he sees a single +98 and no record of the share.

---

## 2. Held collections — a creator setting, off by default

| Setting | Ravi's 100₹ | Ravi can spend it |
|---|---|---|
| **Off** (default) | straight to balance | immediately |
| **On** | to a held collection | after he taps Bank or Coin |

Off by default matters: a personal account receiving 500₹ from a friend must
still be able to pay it onward. Only a creator who deliberately turns this on
gets settlement behaviour.

"Today's Collection" on the creator dashboard shows the held pot when the
setting is on, and today's received total when it is off. Bank and Coin
settle the held pot out.

---

## 3. Migration — existing balances will go DOWN

Accounts today hold share money as spendable balance. The agreed fix moves it
into the pool, so **an account that has earned shares will see its balance
drop with no payment to explain it.**

That is correct by the new rule and it is still money the person has — it
moves to My Assets and raises their PayLater limit. But it is visible, and it
happens to real accounts.

**Sequence:**

1. **Dry run first.** A read-only query reporting, per account and in total,
   how much share money is sitting in balances. No writes. Review the real
   numbers before deciding.
2. Migrate with `--apply`, in a transaction, writing an audit row per account
   so every movement is traceable and reversible.
3. The app should say something when a balance moves for this reason, rather
   than letting it change silently.

---

## 4. Code sites

| What | Where |
|---|---|
| Sender credited the share as balance | `server/server.js` ~5563 `$inc: { balance: cashbackCredit }` |
| Payee credited `amount − cashback` | `server/server.js` ~5540 `$inc: { balance: payeeReceives }` |
| Share leg minted | `server/lib/merchantShareFlow.js` ~217 `type: 'share'` |
| Grant planted client-side | `backend/domain/transactions/TransactionOrchestrator.js` ~147 `addGrant` |
| Limit derived from assets | `backend/domain/paylater/PayLaterService.js` `computeAvailable` |
| Settle assets → bank | `settleEssentialsToBank`, `SettlementEngine` |

**Correction to an earlier assumption.** I expected a pool account would have
to be built server-side. It does not: `server/models/AssetSeed.js` is already
a persisted collection, written at payment time (`server.js` ~5839). Its own
schema states the bug —

```js
cashback: { type: Number, required: true },  // amountPaid x cashbackRate - already credited to balance
```

So step 1 is not "add a pool". It is "stop the second credit" and let the
seed be the only home for that money, which it already is on both sides.

Three edits, no schema change, no migration:

1. Delete `$inc: { balance: cashbackCredit }` on the sender (~5563).
2. Retype the ledger row pushed at ~5628 — today it reads
   `note: 'Cashback credited to balance'` with `balanceBefore`/`balanceAfter`
   moving. The money still moves and still needs its line, but the line now
   records a credit to the asset pool, and the sender's balance does not
   change. Double-entry still holds: debit `debitAmount`, credit
   `payeeReceives` to the receiver, credit the remainder to the pool.
3. Fix that schema comment, which is the only place the old behaviour is
   written down.

---

## 5. Order of work

1. Pool account on the server + stop crediting the share to `balance`.
2. Ravi's two rows (+100 received, −2 shared) instead of one +98.
3. Dry-run migration report.
4. Migration `--apply`.
5. Held collections behind the creator setting.
6. Today's Collection reads the held pot; Bank and Coin settle it.

Steps 1–2 fix the reported bug. Steps 5–6 are the new feature. They are
separable and should ship separately.

---

## 6. Already done

- Creator Share no longer appears twice in Recent Activity. The server's
  share leg is the single source; the client-side synthesiser is deleted.
- Today's Collection counts money actually received, not Creator Share.
- The Bank/Coin settle buttons are off the creator card until they have a
  real pot to settle.
