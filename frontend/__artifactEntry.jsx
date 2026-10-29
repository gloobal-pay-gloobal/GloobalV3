// src/__artifactEntry.jsx
import { useState as useState21, useEffect as useEffect21 } from "react";

// Bug fix: this used to read useCurrentSymbolId() directly for the
// remount key below, which fires on ANY change to the stored Gloobal ID —
// including the same account renaming its own ID via Update Gloobal ID
// (handleGloobalIdChanged in App.jsx). A rename isn't a different account
// signing in; it's a label change on the one already signed in. But
// because this key gates a full remount of everything nested inside
// <LedgerProvider> (GloobalId included), treating a rename the same as a
// switch wiped the local ledger (My Essentials / PayLater history),
// App.jsx's accountCreatedAt, and Dashboard's own idUpdateHistory log —
// all mid-update, on the very account that just renamed itself.
//
// gloobal:accountSwitched (see sessionStore.js) is the narrower signal:
// it only fires for a genuine account change — fresh login, fresh
// registration completing, an explicit switch, or sign-out — never for
// an in-place rename of the current account. Reading that instead of the
// broad gloobal:symbolIdChanged event is what keeps a rename from
// force-unmounting the app it just renamed itself in.
function useAccountSwitchKey() {
  const [key, setKey] = useState21(() => gloobalCurrentSymbolId() || "signed-out");
  useEffect21(() => {
    // Re-read on mount too: the session can have been written between the
    // initial useState call and this effect (React 18 double-invokes the
    // initializer under StrictMode).
    setKey(gloobalCurrentSymbolId() || "signed-out");
    const onSwitch = (event) => {
      setKey((event && event.detail && event.detail.symbolId) || "signed-out");
    };
    if (typeof window === "undefined") return undefined;
    window.addEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onSwitch);
    return () => window.removeEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onSwitch);
  }, []);
  return key;
}


// src/__artifactEntry.jsx
function GloobalArtifactRoot() {
  const [showSplash, setShowSplash] = useState21(true);
  // Bug fix: <LedgerProvider> used to create its local FinancialCore
  // exactly once (a useRef that's never reset — see
  // frontend/adapters/ledger/LedgerProvider.jsx) for the entire page
  // lifetime, and GloobalId's own send/received-history state
  // (App.jsx's sendMoneyHistory/receivedMoneyHistory) was never cleared
  // on logout or a fresh registration either. So a second account
  // signing in during the same tab/page session — including a genuinely
  // new registration — kept reading and posting against the FIRST
  // account's local balance and transaction history. That is what
  // produced "my new account already has someone else's spending
  // history" and the local balance flip-flopping between the ledger's
  // hardcoded 5,000 default and whatever the previous account's figure
  // had drifted to.
  //
  // The fix is a React `key`: `accountKey` changes exactly when the
  // signed-in account's identity changes (a fresh login, a fresh
  // registration finishing, an account switch, or a sign-out — see
  // sessionStore.js's gloobalSessionSave/gloobalSessionClear, which fire
  // GLOOBAL_ACCOUNT_SWITCH_EVENT for exactly this reason, and deliberately
  // NOT for an in-place ID rename of the same account — see
  // useAccountSwitchKey above). Changing a component's key forces React to
  // fully unmount the old instance and mount a brand new one, which
  // resets EVERY piece of state under it in one place — the local
  // ledger, the send/received history arrays, and anything else
  // account-scoped living inside GloobalId — rather than requiring every
  // individual piece of state to be found and cleared by hand.
  const accountKey = useAccountSwitchKey();
  // The registration flow lives inside GloobalId, so the boundary goes
  // here: a throw in any stage now shows a message instead of a blank
  // page, and the real error still reaches the console.
  return <><GloobalLogoFavicon /><PhotoCropHost />{showSplash && <LaunchSplash onFinish={() => setShowSplash(false)} />}<LedgerProvider key={accountKey}><ScreenErrorBoundary name="Gloobal ID"><GloobalId /></ScreenErrorBoundary></LedgerProvider></>;
}
export {
  GloobalArtifactRoot as default
};

