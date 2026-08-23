// src/adapters/ledger/LedgerProvider.jsx
import { createContext, useContext, useRef } from "react";


// src/adapters/ledger/LedgerProvider.jsx
var LedgerContext = createContext(null);
// openingBankBalance MUST match the server's DEFAULT_ACCOUNT_BALANCE
// (server.js: `const DEFAULT_ACCOUNT_BALANCE = 10000;`). This local ledger
// is a mirror of the account MongoDB holds, and the mirror's starting
// figure has to be the same one the server opens every account at.
//
// It was 5,000 against a server that opens accounts at 10,000, which is
// exactly why a freshly registered account showed 5,000 and then "became"
// 10,000 by itself: nothing was wrong at the second reading — the first one
// was a local invention, and the jump was simply the first successful
// reconcile against GET /api/profile/:symbolId correcting it (see the
// reconcileBankBalance effect in App.jsx).
function LedgerProvider({ children, userId = "demo-user", currency = "INR", openingBankBalance = 1e4 }) {
  const coreRef = useRef(null);
  if (coreRef.current === null) {
    coreRef.current = createFinancialCore({ userId, currency, openingBankBalance });
  }
  return <LedgerContext.Provider value={coreRef.current}>{children}</LedgerContext.Provider>;
}
function useFinancialCore() {
  const core = useContext(LedgerContext);
  if (!core) throw new Error("useFinancialCore must be used within a <LedgerProvider>");
  return core;
}

