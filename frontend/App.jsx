// src/App.jsx
import { useState as useState19, useEffect as useEffect15, useRef as useRef13, useCallback as useCallback11 } from "react";
import {
  ChevronLeft as ChevronLeft4,
  Lock as Lock7,
  History as History8,
  RefreshCw as RefreshCw6,
  Fingerprint as Fingerprint2,
  ImageIcon,
  ArrowUpRight as ArrowUpRight5
} from "lucide-react";


// The decorative white circle on the registration/phone screen read as a
// ghost sitting behind the REGISTRATION badge and the phone input card,
// so it is switched off. Kept behind a flag rather than deleted because
// it is a real interactive element (handleHeroCircleTap), not just art —
// flip this to true to bring it back.
var SHOW_PHONE_HERO_CIRCLE = false;

// The way out of the scanner for a payment that has no code behind it.
//
// It sits where a dead "Enter Mobile Number to Pay" field used to: a div
// dressed as a text input that took no typing and had no handler. Paying
// somebody without scanning them is a real need, and the screen used to
// gesture at it without serving it.
//
// Two grounds, because it appears on both a white permission page and on
// top of live video, and a control that is legible on one is invisible on
// the other.
function ScanSendButton({ onClick, overVideo = false }) {
  return <button
    onClick={onClick}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      width: "100%",
      border: "none",
      borderRadius: 999,
      padding: "15px 20px",
      background: overVideo ? "rgba(255,255,255,0.94)" : T.gradButton,
      color: overVideo ? T.accent : "#fff",
      fontSize: 14.5,
      fontWeight: 800,
      cursor: "pointer",
      boxShadow: overVideo ? "0 6px 22px rgba(0,0,0,0.35)" : "0 8px 20px rgba(124,58,237,0.28)",
      backdropFilter: overVideo ? "blur(6px)" : undefined
    }}
  ><ArrowUpRight5 size={17} />Send</button>;
}

// Where the profile picture lives. Locally, keyed by Gloobal ID, because
// the backend has nowhere to put it: PUT /api/profile/:symbolId accepts
// `fullName` and `email` and nothing else, and inventing a photo field
// client-side would just be a body the server discards. The name is
// stored alongside it purely so a restored session can show both without
// waiting on a network round trip — the backend remains the authority on
// the name itself.
var GLOOBAL_PROFILE_KEY_PREFIX = "gloobal.profile.";

// Every localStorage access is guarded: it throws outright in Safari
// private mode and when storage is disabled, and a profile picture is
// never worth crashing a registration over.
function persistLocalProfile(symbolId, name, photo) {
  if (!symbolId) return;
  try {
    window.localStorage.setItem(
      GLOOBAL_PROFILE_KEY_PREFIX + symbolId,
      JSON.stringify({ name: name || "", photo: photo || "", savedAt: Date.now() })
    );
  } catch (e) {
    // No storage — the name still reached the backend at registration, and
    // the photo falls back to the Gloobal mark on the next load.
  }
}

function loadLocalProfile(symbolId) {
  if (!symbolId) return null;
  try {
    const raw = window.localStorage.getItem(GLOOBAL_PROFILE_KEY_PREFIX + symbolId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Turns one row of GET /api/transactions/:symbolId into the shape this
// app's history list renders. The backend's projection is already
// per-viewer — `direction` and `counterparty` are computed relative to the
// symbolId that was asked for — so nothing here has to work out which side
// of the transaction the person was on.
//
// Fields with no server equivalent get honest defaults rather than
// invented values: `method` is not recorded server-side (the backend has
// no concept of PayLater vs bank), and cashback is withheld per
// transaction but not returned on this projection, so shareRate is 0
// rather than a guess.
function mapServerTransaction(row, viewerSymbolId) {
  const created = row.createdAt ? new Date(row.createdAt) : new Date();
  const counterparty = row.counterparty || {};
  // fullName is the mobile number on accounts made before the name step
  // existed, so a "name" that is just the number is not worth showing.
  const counterpartyName =
    counterparty.fullName && counterparty.fullName !== counterparty.symbolId
      ? counterparty.fullName
      : counterparty.symbolId || "Gloobal User";
  // WHOSE money this row is about.
  //
  // A payment has two sides and they are not the same number. The server
  // stores `amount`/`currency` as the RECEIVER's face value — ₹478,000, INR
  // — and the sender's own debit separately (`debitAmount`/`senderCurrency`
  // — $5,000, USD). This used to take `amount` and drop `currency`
  // altogether, leaving a bare figure that the row then rendered with
  // whatever symbol the logged-in account happens to use. A US sender saw
  // −$478,000.00 for a $5,000 payment: the rupee number wearing a dollar
  // sign. Same shape in every corridor — ¥5,000 to the UK came back as ¥545.
  //
  // So each side is shown its own money. The receiver keeps the face value,
  // which is genuinely theirs; the sender gets the debit that actually left
  // their balance.
  const isReceived = row.direction === "received";
  const debit = Number(row.debitAmount);
  const senderSideKnown = !isReceived && Number.isFinite(debit) && row.senderCurrency;
  // Where the sender's side was never recorded (rows predating it), the
  // receiver-currency figure is kept AND labelled as such. Mislabelling it
  // is exactly the bug; showing it honestly in a foreign currency is not.
  const ownAmount = senderSideKnown ? debit : Number(row.amount) || 0;
  const ownCurrency = senderSideKnown ? row.senderCurrency : row.currency || null;
  // WHO the other party is, carried whole.
  //
  // This mapper used to take `counterparty.fullName` and nothing else. The
  // Gloobal ID and the country were both dropped on the floor, so every row
  // restored from the server reached the receipt with `id` undefined and
  // `flag` undefined — and ReceiptModal renders each of those only `&&` they
  // exist, so a reopened receipt silently showed a name and no identity at
  // all. It read as a rendering bug and was a mapping one: the fields were
  // never asked for from the server (they are now — see counterpartyFor) and
  // never copied out of the response here.
  //
  // The flag is derived from the ISO code rather than sent as an emoji, and
  // through the same COUNTRY_BY_ISO table every other flag in the app comes
  // from — no country is named here, and an unknown code falls back to
  // isoToFlag's regional-indicator pair rather than to a default country.
  const counterpartyIso = String(counterparty.countryIso || "").toUpperCase();
  const counterpartyFlag = counterpartyIso
    ? (COUNTRY_BY_ISO[counterpartyIso] && COUNTRY_BY_ISO[counterpartyIso].flag) || isoToFlag(counterpartyIso)
    : "";

  return {
    name: counterpartyName,
    // The counterparty's own Gloobal ID — the "To"/"From" identity on the
    // receipt. Never the viewer's: the server picks the opposite side by the
    // transaction's own fromUserId (counterpartyFor), and this only carries
    // that answer through.
    id: counterparty.symbolId || "",
    flag: counterpartyFlag,
    counterpartyIso: counterpartyIso || null,
    date: created.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: formatClockTime(created),
    amount: ownAmount,
    // Carried on the row so nothing downstream has to guess. A row with an
    // amount and no currency is what made this bug possible.
    currency: ownCurrency,
    // Kept for the receipt, which shows both sides of a cross-border payment.
    counterpartyAmount: Number(row.amount) || 0,
    counterpartyCurrency: row.currency || null,
    fxRate: Number.isFinite(Number(row.fxRate)) ? Number(row.fxRate) : null,
    status: row.status || "completed",
    direction: row.direction === "received" ? "received" : "sent",
    // A Creator Share leg is a real movement, not a payment.
    //
    // These rows used to be filtered out of the history endpoint entirely,
    // on the reading that a share "moves no balance" — see the query in
    // server.js. It does: the payee is credited the payment minus their
    // share, and the share goes back to the payer. So a payee who received
    // 1,000 at 2% saw +1,000 in their history against a balance that rose by
    // 980, with no row anywhere for the 20.
    //
    // Now that the row exists, it has to say what it is. It carries the same
    // shape as any other row — its own currency, its own side's figure, the
    // counterparty's name — and `kind` is what lets a list label it rather
    // than showing a second, unexplained payment to the same person on the
    // same day.
    kind: row.type === "share" ? "share" : "payment",
    method: row.type === "share" ? "share" : "bank",
    txnId: row.referenceId || row.id || "",
    // The Creator Share this payment carried, as the server recorded it.
    //
    // Hardcoded 0 before, which is why the receipt's Creator Share tab
    // vanished on reopen: a payment with a real 1% share came back claiming
    // it had none. The server stores the rate as a decimal (1% = 0.01) and
    // every consumer on this side works in percent, so it is converted once,
    // here at the boundary — the same conversion GloobalApi.resolveUser's
    // cashbackRate already goes through.
    shareRate: Number.isFinite(Number(row.cashbackRate)) ? Number(row.cashbackRate) * 100 : 0,
    // What the share was actually worth, in whichever currency this row is
    // shown in: the payer sees their own credit back, the payee sees the
    // figure withheld from their side.
    shareAmount: isReceived
      ? Number(row.cashback) || 0
      : Number(row.cashbackCredit) || Number(row.cashback) || 0,
    // The share leg's own reference, so the receipt's share tab can name the
    // movement it is describing instead of reusing the payment's id.
    shareTxnId: row.shareReferenceId || "",
    shareSourceTxnId: row.shareReferenceId ? row.referenceId || row.id || "" : "",
    memo: row.note || "",
    ledgerRecordId: null,
    // Server rows predate this device's Personal/Creator split and carry
    // no role of their own; they belong to the personal book.
    role: "user",
    // Marks rows that came from MongoDB rather than this session's local
    // ledger, so the two can never be confused when reconciling.
    remote: true
  };
}

// Bug fix: a referral link (Dashboard.jsx's referralLink, resolved through
// the backend's GET /r/:symbolId route) redirects a new visitor here as
// https://gloobalv3.netlify.app/?ref=<encoded Gloobal ID> — but nothing
// ever read that query param back out. The redirect worked, the person
// landed on the right app, and then the referral code they'd followed a
// link specifically to use was nowhere: not pre-filled, not applied,
// gone. This reads it once on load so the referral dial pad already has
// it by the time someone reaches that step of registration; it's still
// editable and still optional (the referral stage has its own "Skip for
// now"), exactly as if they'd typed it in themselves.
// The other half of a shared receipt (see GET /t/:referenceId and the share
// handler in ReceiptModal): the app is opened at /?txn=<reference>.
//
// It is looked up in the viewer's OWN history and nowhere else. That is the
// privacy design: a receipt link travels through WhatsApp and gets forwarded,
// so anything that fetched the transaction by reference would let whoever
// ends up holding the link read a stranger's payment. Both people who were
// part of it already have the row; nobody else does.
function readSharedTxnFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = new URLSearchParams(window.location.search).get("txn");
    return raw ? decodeURIComponent(raw).trim() : "";
  } catch (e) {
    return "";
  }
}

function readReferralCodeFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = new URLSearchParams(window.location.search).get("ref");
    return raw ? decodeURIComponent(raw).trim() : "";
  } catch (e) {
    return "";
  }
}
// The permissions gate (PermissionsGateScreen) is a once-ever onboarding
// screen, not something a returning visitor should see again on every
// page load — so whether it's been shown lives in localStorage rather
// than component state. Guarded the same way every other localStorage
// access in this app is: a private-mode throw or a disabled store just
// means "treat it as not yet seen" rather than crashing the app before
// it has even rendered anything.
var GLOOBAL_PERMISSIONS_GATE_KEY = "gloobal.permissionsGateSeen.v1";
function hasSeenPermissionsGate() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(GLOOBAL_PERMISSIONS_GATE_KEY) === "1";
  } catch (e) {
    return true;
  }
}
function markPermissionsGateSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOOBAL_PERMISSIONS_GATE_KEY, "1");
  } catch (e) {
    // No storage — the gate will simply show again next load, which is a
    // minor repeat, not a broken app.
  }
}
// Feature: the app map (the floating draggable icon + searchable screen
// list, see components/common/appMap.jsx) shows every registration-flow
// screen and every post-login destination in one list, with the ones that
// don't apply yet greyed out as "Locked." Which half is locked depends on
// whether this device has EVER finished registration — not whether
// someone happens to be signed in right now, since signing out again
// shouldn't hide Dashboard/Bank/Coin behind a lock the person already
// cleared once. So this needs its own persisted flag, independent of
// gloobalSessionSave/gloobalSessionClear (session identity, cleared on
// sign-out) — same "own localStorage key, guarded against a private-mode
// throw" shape as GLOOBAL_PERMISSIONS_GATE_KEY just above.
var GLOOBAL_HAS_REGISTERED_KEY = "gloobal.hasEverRegistered.v1";
function hasEverRegistered() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GLOOBAL_HAS_REGISTERED_KEY) === "1";
  } catch (e) {
    return false;
  }
}
function markEverRegistered() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOOBAL_HAS_REGISTERED_KEY, "1");
  } catch (e) {
    // No storage — the app map will simply treat every future visit as
    // "not yet registered" on this device, which just re-locks a few map
    // entries; it doesn't block using the app itself.
  }
}
// src/App.jsx
function GloobalId() {
  const stageRef = useRef13(null);
  const particlesRef = useRef13([]);
  const elsRef = useRef13({});
  const rafRef = useRef13(null);
  const dimsRef = useRef13({ w: 0, h: 0 });
  const frameRef = useRef13(0);
  const [, forceRender] = useState19(0);
  const [verifying, setVerifying] = useState19(false);
  // Root-level toast — used by flows that complete above any single
  // screen (Scan & Pay, the business "Pay" sheet) after those screens
  // have already closed, so there's no longer a screen-local toast to
  // borrow. Same visual language as every other screen's toast pill.
  const [rootToast, setRootToast] = useState19(null);
  const showToast = (msg) => {
    setRootToast(msg);
    setTimeout(() => setRootToast(null), 1800);
  };
  const [heroCircleColors, setHeroCircleColors] = useState19(() => [
    randomLogoFlipColor(),
    randomLogoFlipColor(),
    randomLogoFlipColor(),
    randomLogoFlipColor()
  ]);
  useEffect15(() => {
    const interval = setInterval(() => {
      const i = Math.floor(Math.random() * 4);
      setHeroCircleColors((prev) => {
        const next = [...prev];
        next[i] = randomLogoFlipColor(prev[i]);
        return next;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);
  const [heroCircleTapped, setHeroCircleTapped] = useState19(false);
  const handleHeroCircleTap = () => {
    setHeroCircleTapped(true);
    setTimeout(() => setHeroCircleTapped(false), 1400);
  };
  // accountCreatedAt is declared further down, right after registeredUser
  // (see there for why) — this used to be its own useState(() => new
  // Date()) sitting here with no connection to the account at all.
  const accountCreatedAtFallbackRef = useRef13(null);
  const [essentialsIHaveEnough, setEssentialsIHaveEnough] = useState19(false);
  const handleToggleEssentialsIHaveEnough = () => setEssentialsIHaveEnough((v) => !v);
  const [sendMoneyHistory, setSendMoneyHistory] = useState19(SEND_MONEY_HISTORY_SEED);
  const { openComplaint, submitLocationObservation } = useProvenanceAndDisputes();
  // Best-effort, fire-and-forget location report for a transaction
  // that has ALREADY completed. This is deliberately the only
  // fire-and-forget piece left anywhere in the transaction flow — by
  // design, since location must never gate or delay financial
  // validity. It calls the same submitLocationObservation() interface
  // a real receiver device would call with its own reading; here it's
  // this device reporting its own (sender-role) observation.
  // Which payment, if any, is currently stopped for want of a location.
  // `retry` is the exact action that was blocked, so the modal's retry
  // button resumes THAT payment rather than dumping the person back on a
  // screen to start again.
  const [locationGate, setLocationGate] = useState19(null);
  const [locationGateBusy, setLocationGateBusy] = useState19(false);
  // The reading captured by the gate, handed to reportSenderLocation so the
  // observation submitted to provenance is the SAME one the payment was
  // authorised against — not a second fix taken moments later, which could
  // legitimately differ and would make the record disagree with the check.
  const gatedLocationRef = useRef13(null);

  // Every payment funnels through this. Returns true to proceed.
  //
  // On a block it opens the modal and remembers `retry`, so the person
  // resumes the same payment instead of navigating back to it.
  const passesLocationGate = async ({ retry, isRetry = false } = {}) => {
    const gate = await ensurePaymentLocation({ retry: isRetry });
    if (gate.ok) {
      gatedLocationRef.current = gate.observation;
      setLocationGate(null);
      return true;
    }
    gatedLocationRef.current = null;
    setLocationGate({ reason: gate.reason, retry: retry || null });
    return false;
  };

  const handleLocationGateRetry = async () => {
    if (locationGateBusy) return;
    setLocationGateBusy(true);
    try {
      const pending = locationGate;
      // `isRetry` asks for the longer timeout — the retry case is usually
      // someone who allowed and needs the extra seconds for a fix.
      const ok = await passesLocationGate({ retry: pending && pending.retry, isRetry: true });
      if (ok && pending && pending.retry) pending.retry();
    } finally {
      setLocationGateBusy(false);
    }
  };

  // Location report for a transaction that has already completed.
  //
  // The capture no longer happens here. The gate above takes the reading
  // BEFORE the payment (see hooks/usePaymentLocation.js for why that
  // reversed the previous "never gate financial validity" design), and this
  // submits that same reading. The fallback capture stays for the one path
  // that can reach here without having gone through the gate — a history
  // entry replayed from an older record — so provenance still gets an
  // honest status rather than nothing.
  const reportSenderLocation = (txnId) => {
    (async () => {
      const observation = gatedLocationRef.current
        || await captureBrowserGeo().catch(() => new LocationObservation({ status: LOCATION_STATUS.UNAVAILABLE }));
      submitLocationObservation({ txnId, role: "sender", observation });
    })();
  };
  const handleSendMoneyComplete = (entry) => {
    // Confirmation in the tray, then the one-and-only notification ask.
    // Order matters: notifyPaymentSent is a no-op until permission exists,
    // so the FIRST payment gets no tray entry and only the offer — asking
    // and firing in the same breath would show a notification before the
    // person had answered the prompt about notifications.
    notifyPaymentSent({
      txnId: entry.txnId,
      amount: entry.amount,
      currencySymbol: CURRENCY_SYMBOL[COUNTRY_CURRENCY[dialCountry.iso] || "USD"] || "",
      to: entry.name
    });
    offerPaymentNotificationsAfterPayment();
    // Tags which side of the account (Personal/Creator) this
    // transaction belongs to, for the role-separated history/chart
    // split in DashboardScreen — not to be confused with the
    // sender/receiver location role used just above.
    setSendMoneyHistory((h) => [{ ...entry, role: activeShareRole }, ...h]);
    // Posting + completion + provenance + complaint window + asset-seed
    // eligibility already happened atomically inside executeTransaction
    // (called from SendMoneyScreen.completePayment, via
    // onExecuteTransaction) before this history entry ever existed.
    // Nothing financial is fired-and-forgotten here — only the location
    // report, which is independent by design (see reportSenderLocation).
    reportSenderLocation(entry.txnId);
  };
  // POST /api/transactions/send — the authoritative leg of a payment.
  // Runs before the local ledger posts (see SendMoneyScreen.completePayment),
  // so a server rejection means nothing is posted anywhere.
  //
  // Returns { ok } | { ok: false, reason } | { ok: true, skipped: true }.
  // `skipped` is deliberate and not a failure: a payment can only be
  // recorded server-side when BOTH parties are real registered accounts.
  // This build's receiver pickers are local placeholders, so anything
  // aimed at one of those has no counterparty in MongoDB to credit and
  // stays a local simulation. Scan & Pay against a real scanned Gloobal
  // ID, or any receiver carrying a resolvable symbolId, goes remote.
  const handleRemoteSend = async ({
    txnId,
    amount,
    currency,
    // The explicit corridor, passed straight through to the server, which
    // recomputes whichever side was not typed and refuses the payment if its
    // own arithmetic disagrees. A caller that sends none of these still works
    // — the legacy `amount`/`currency` pair below is read as the receiver's
    // face value, which is what it has always meant.
    amountBasis,
    sourceAmount,
    sourceCurrency,
    destinationAmount,
    destinationCurrency,
    receiver,
    pin: sendPin,
    payMethodLabel,
    memo,
    clientRequestId
  }) => {
    // Before anything else, including the skipped/local-simulation exits
    // below — a simulated send still writes a history row, and a gate with
    // an exception is not a gate.
    if (!(await passesLocationGate({ retry: null }))) {
      return { ok: false, reason: "Location is needed before this payment can go through." };
    }
    const senderSymbolId = registeredUser && registeredUser.symbolId;
    const receiverSymbolId = receiver && (receiver.gloobalId || receiver.symbolId || receiver.id);
    if (!senderSymbolId) return { ok: true, skipped: true, reason: "not signed in against the backend" };
    if (!receiverSymbolId) return { ok: true, skipped: true, reason: "receiver has no Gloobal ID" };
    try {
      const result = await GloobalApi.sendTransaction({
        senderSymbolId,
        receiverSymbolId,
        amountBasis,
        sourceAmount,
        sourceCurrency,
        destinationAmount,
        destinationCurrency,
        amount,
        // No longer defaulted to rupees. A missing currency is now simply
        // absent, and the server derives both sides from the two accounts'
        // own countries — claiming INR for an account that is not Indian is
        // how a mislabelled leg used to get through.
        currency,
        note: memo || "",
        pin: sendPin,
        payMethod: payMethodLabel || "",
        // The ID this device already minted for the payment, so the record
        // MongoDB stores is the same one the sender's receipt, complaint
        // window and location report are keyed by — and, because the
        // receiver reads their history from that record, the same one the
        // other side sees. The backend validates it and mints its own if it
        // is malformed or already taken, so this is a request, not a claim.
        referenceId: txnId || "",
        // The backend also runs a 15-second identical-resend guard; this
        // makes the dedup explicit rather than time-based.
        idempotencyKey: clientRequestId || ""
      });
      // The server just moved money, so its balance is now ahead of the
      // local ledger's own view of the same payment. Re-read and reconcile
      // rather than assuming the two arrived at the same number: the
      // backend also withholds cashback and can apply its own adjustments
      // this client never sees.
      setRefreshBalanceToken((n) => n + 1);
      // What the server actually recorded, handed back so the receipt can
      // quote the stored reference rather than assuming its own was kept,
      // and can show the Creator Share the payee's account really charged.
      const transaction = (result && result.transaction) || {};
      // The Creator Share's own transaction, minted server-side alongside
      // the payment with its own referenceId. Passed up so the share
      // receipt can quote ITS id instead of reusing the payment's — the two
      // are different movements between different pairs of parties and must
      // not be identifiable by the same reference.
      const share = (result && result.shareTransaction) || null;
      return {
        ok: true,
        transactionId: transaction.referenceId || txnId || "",
        shareTransactionId: (share && share.referenceId) || "",
        shareAmount: Number(share && share.amount) || 0,
        shareCurrency: (share && share.currency) || "",
        cashback: Number(result && result.cashback) || 0,
        cashbackRate: Number(result && result.cashbackRate) || 0,
        // What actually left this account, in this account's own currency,
        // as the SERVER computed it. The local history row records these
        // rather than the typed figure: on a cross-border payment the typed
        // figure is the receiver's side, and a row holding it without a
        // currency is what made a ₹200 request appear as −£200.00 in a UK
        // account's history.
        debitAmount: Number.isFinite(Number(result && result.debitAmount)) ? Number(result.debitAmount) : null,
        senderCurrency: (result && result.senderCurrency) || null
      };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  };
  const handleReportTransactionIssue = (txnId, reason) => openComplaint({ txnId, raisedBy: "sender", reason });
  const bankBalance = useBankBalance();
  const { executeTransaction, settleEssentialsToBank, settleReferralToBank, applyEssentialsPoolSubsidy, reconcileBankBalance, reconcilePaylaterDue, hydrateGrantsFromServer, resetForAccountSwitch } = useTransactionActions();
  const [usedQrCodes, setUsedQrCodes] = useState19(() => /* @__PURE__ */ new Set());
  const [showScanScreen, setShowScanScreen] = useState19(false);
  // Backdrop color behind the QR/scan area — same "pick one random
  // hero color per session" pattern as the Bank/Coin/About Us info
  // screens, so the scanner isn't locked to a single fixed tint.
  const [scanHeroColor] = useState19(() => randomLogoFlipColor());
  // Scan & Pay now follows the same options -> PIN -> biometric
  // sequence Send Money established, for real payments (amountCents >
  // 0). A zero-amount scan is just an identity confirm — no money
  // moves, so it skips straight to biometric, same as before.
  const [scanPayOptionsOpen, setScanPayOptionsOpen] = useState19(false);
  const [scanPayPinOpen, setScanPayPinOpen] = useState19(false);
  // The PIN the backend has already confirmed, held out of visible state so
  // the modal can wipe its on-screen digits while the value travels the one
  // step further POST /api/transactions/send needs it to. Same arrangement as
  // Send Money's verifiedPinRef, and cleared the moment the send settles or
  // the payment is abandoned.
  const scanVerifiedPinRef = useRef13(null);
  const [scanPayMethod, setScanPayMethod] = useState19(null);
  // "My Code" can double as a payment request: typing an amount here
  // embeds it into the SAME QR (encodeGloobalQR already supports
  // amountCents) instead of a separate request flow — the scanning
  // side already renders any nonzero amount as "Payment request".
  const [requestAmount, setRequestAmount] = useState19("");
  // Read from inside the received-payments poll, which does not list
  // requestAmount among its dependencies - a closed-over copy would be
  // whatever the amount was when that effect last ran, so a request typed
  // afterwards would never be recognised as paid.
  const requestAmountRef = useRef13(requestAmount);
  requestAmountRef.current = requestAmount;
  const [requestOpen, setRequestOpen] = useState19(false);
  const requestCents = Math.round((parseFloat(requestAmount) || 0) * 100);
  const [scanScreenTab, setScanScreenTab] = useState19("scan");
  const [scanCameraAccessGranted, setScanCameraAccessGranted] = useState19(false);
  const [scanPendingPayment, setScanPendingPayment] = useState19(null);
  const [scanError, setScanError] = useState19(null);
  const [showScanBiometric, setShowScanBiometric] = useState19(false);
  const [scanBiometricScanning, setScanBiometricScanning] = useState19(false);
  // A scanned code decodes to a Gloobal ID, and an ID is not proof that
  // anybody holds it — the checksum only says the string wasn't mangled.
  // So the scan now runs the SAME backend lookup typed entry does in Send
  // Money (GET /api/users/resolve), and the confirmation card shows the
  // registered name it comes back with instead of twelve symbols the
  // person has no way to recognise.
  //
  // A 404 is not made fatal. This screen's demo code is a generated ID
  // that no account holds, and the app already supports paying an
  // unregistered counterparty as a local-ledger simulation (the same
  // `skipped` case Send Money's onRemoteSend reports). Refusing here
  // would remove the only way to exercise Scan & Pay in an environment
  // with no camera. It is labelled as unregistered instead, so the
  // difference is visible rather than hidden.
  const [scanResolving, setScanResolving] = useState19(false);
  // The gallery path. Same decoder and same handler as the live camera, so
  // a code that reads from an image behaves identically to one held up to
  // the lens — including the resolve, the payment-request branch and the
  // unregistered-ID warning.
  const scanGalleryInputRef = useRef13(null);
  const handleScanGalleryFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    // Clearing the value is what lets the same picture be chosen twice in a
    // row: without it the input's change event never fires again.
    event.target.value = "";
    if (!file) return;
    setScanError(null);
    setScanResolving(true);
    try {
      const payload = await decodeGloobalQrFromImageFile(file);
      if (!payload) {
        // Said plainly. A tap that appears to do nothing is the failure this
        // whole path replaces.
        setScanError("No Gloobal code found in that image.");
        return;
      }
      // Move into the scan view before resolving. `scanCameraAccessGranted`
      // is a view flag, not a permission claim — the real camera request
      // happens inside QrCameraScanner when it mounts — and everything a
      // decoded code produces (the resolving state, the payment-request
      // card, the unregistered warning) is rendered on the other side of
      // it. Decoding a code and leaving the person on the "Allow Camera
      // Access" panel would be its own version of the tap that did nothing.
      setScanCameraAccessGranted(true);
      await handleQrScanned(payload);
    } catch (e) {
      setScanError("That image could not be read.");
    } finally {
      setScanResolving(false);
    }
  };
  // A payment request is denominated in the REQUESTER's currency, not the
  // scanner's.
  //
  // The QR payload carries an ID, an amount in minor units and a checksum -
  // and no currency at all. The scan card formatted that bare number with the
  // SCANNER's own symbol, so a Rs 2,596.05 request read as $2,596.05 to an
  // American scanning it: a hundred-and-twentyfold overstatement of what they
  // were about to pay, on the confirm screen.
  //
  // No change to the code format is needed. The resolve step already returns
  // the payee's own registered country (recipientCountryIso), so the currency
  // is knowable from the account - the better source anyway, since it stays
  // right for a code printed before its holder moved country.
  const scanRequestCurrency = (pending) => {
    const iso = pending && pending.recipientCountryIso;
    return (iso && COUNTRY_CURRENCY[iso]) || COUNTRY_CURRENCY[dialCountry.iso] || "USD";
  };
  const scanRequestSymbol = (pending) => {
    const code = scanRequestCurrency(pending);
    return CURRENCY_SYMBOL[code] || `${code} `;
  };

  const handleQrScanned = async (rawCode) => {
    setScanError(null);
    if (usedQrCodes.has(rawCode)) {
      setScanError("This QR code has already been used.");
      return;
    }
    const decoded = decodeGloobalQR(rawCode);
    if (!decoded) {
      setScanError("This isn't a valid Gloobal QR code.");
      return;
    }
    setScanResolving(true);
    let user = null;
    try {
      user = await GloobalApi.resolveUser(decoded.gloobalId);
    } catch (err) {
      // Only a definite 404 means "nobody holds this ID". A cold start or
      // a 5xx is not an answer about the recipient, and treating it as one
      // would put "unregistered" under a perfectly real account.
      if (!(err instanceof GloobalApiError && err.status === 404)) {
        setScanResolving(false);
        setScanError(err.message);
        return;
      }
    }
    setScanResolving(false);
    setScanPendingPayment({
      ...decoded,
      rawCode,
      // The ID the backend holds NOW — someone whose code was printed
      // before they changed their Gloobal ID is still paid correctly.
      gloobalId: (user && user.symbolId) || decoded.gloobalId,
      registered: Boolean(user),
      // fullName is the mobile number on accounts created before the name
      // step existed, and a name that is just the number is not a name.
      //
      // `nameIsMobile` is the server's own answer to that, added when
      // GET /api/users/resolve started masking the number it returns (audit
      // finding GLB-17) — comparing against a masked number here would say
      // "not the same" for every account, and put a real phone number back on
      // screen as somebody's name.
      recipientName: user ? (user.fullName && !user.nameIsMobile ? user.fullName : "Gloobal User") : null,
      recipientMobile: (user && user.mobileNumber) || "",
      // The payee's OWN registered country, straight off the resolve
      // response — the same field Send Money's dial-in search reads. Without
      // it, handleSendToScanned below had nothing to describe the recipient
      // with and fell back to the SENDER's country, so scanning an American
      // account's QR from India opened Send Money on an Indian flag and ₹.
      // Null when the ID resolved to nobody, which is the honest answer for
      // an unregistered code and is what keeps the fallback below a fallback.
      recipientCountryIso: (user && user.countryIso) || null,
      // As a percent, the unit the rest of the app carries it in — the
      // backend returns a decimal.
      recipientShareRate: (Number(user && user.cashbackRate) || 0) * 100
    });
  };
  // A scanned Gloobal ID carrying no amount is an identity, not a bill. The
  // useful thing to do with one is send to it, so it hands the resolved
  // recipient straight to Send Money — which opens past its own search step,
  // on the amount, with the person already filled in.
  //
  // Kept separate from the amount-bearing path above: a QR with an amount in
  // it is a payment request and still pays in place, since the sender has
  // nothing left to decide.
  const [sendPrefillReceiver, setSendPrefillReceiver] = useState19(null);
  const handleSendToScanned = () => {
    if (!scanPendingPayment) return;
    // The country the payee is registered in, from the resolve call the scan
    // already made. The QR itself carries no country, but the account behind
    // it does, and that is the only authority on it — a recipient's country
    // can never be inferred from the payer's.
    //
    // The sender's country is the last resort and applies only to a code that
    // resolved to nobody (an unregistered ID, which cannot be paid for real
    // anyway). Everything the receiver half of Send Money shows — flag,
    // country, currency, and through that the FX conversion and the payment
    // summary — comes off this one value.
    const scannedCountry =
      COUNTRY_BY_ISO[String(scanPendingPayment.recipientCountryIso || "").toUpperCase()] || dialCountry;
    setSendPrefillReceiver({
      country: scannedCountry.name,
      flag: scannedCountry.flag,
      iso: scannedCountry.iso,
      id: scanPendingPayment.gloobalId,
      name: scanPendingPayment.recipientName || "Gloobal User",
      mobileNumber: scanPendingPayment.recipientMobile || "",
      currency: COUNTRY_CURRENCY[scannedCountry.iso] || "USD",
      shareRate: scanPendingPayment.recipientShareRate || 0,
      // Carried through so Send Money can warn before the person pays,
      // the same way the scan confirmation card already does — an
      // unregistered ID handed to Send Money used to arrive indistinguishable
      // from a real one, which is what let this screen skip its own honest
      // "unregistered" label entirely.
      registered: Boolean(scanPendingPayment.registered)
    });
    setShowScanScreen(false);
    setScanPendingPayment(null);
    setScanError(null);
    setActiveScreen("send");
  };
  // Scan & Pay runs through the exact same canonical executeTransaction
  // lifecycle as Send Money and Pay a Business — no separate posting
  // path. A real txnId is minted up front and the whole risk-check +
  // post + provenance + complaint-window + grant-eligibility sequence
  // happens in one atomic call, synchronously, before the UI shows
  // success. The paid QR also becomes a normal history entry, so it's
  // reportable from the same Receipt/History UI Send Money already
  // uses — no new screens.
  //
  // Same gate as Send Money, for the same reason: this path posts a real
  // transaction. It was a 700ms setTimeout that always succeeded, so the
  // biometric prompt here was decoration. A refusal now leaves the QR
  // unspent and nothing posted.
  const handleScanBiometricVerify = async () => {
    // Scan & Pay posts through executeTransaction directly rather than
    // handleRemoteSend, so it needs the gate in its own right.
    if (!(await passesLocationGate({ retry: () => handleScanBiometricVerify() }))) return;
    if (scanBiometricScanning || !scanPendingPayment) return;
    setScanBiometricScanning(true);
    const verified = await requireBiometric({ pinReason: "Confirm this payment with your PIN." });
    setScanBiometricScanning(false);
    setShowScanBiometric(false);
    if (!verified) {
      // The PIN authorised a payment that is not happening.
      scanVerifiedPinRef.current = null;
      setScanError("Couldn't verify it's you — payment cancelled.");
      return;
    }
    const amount = scanPendingPayment.amountCents / 100;
    const ccy = CURRENCY_SYMBOL[COUNTRY_CURRENCY[dialCountry.iso] || "USD"] || "$";
    // The ISO code behind that symbol. Money is formatted against the code,
    // never the symbol: a currency with no minor unit printed to two decimals
    // (¥750,000.00) states a precision the currency does not have.
    const ccyCode = COUNTRY_CURRENCY[dialCountry.iso] || "USD";
    // Declared out here, not inside the `if (amount > 0)` block below, so
    // the final toast — which runs after that block, for both the
    // zero-amount and paid cases — can still tell a real send from a
    // skipped/simulated one. Defaults true: a zero-amount identity-only
    // scan never claims money moved, so it has nothing to be dishonest
    // about either way.
    let scanSettledRemotely = true;
    // The currency this request is denominated in, and whether that is
    // genuinely known. Both the confirmation card and the settlement below
    // read these, which is what keeps them in step.
    const requestCurrency = scanRequestCurrency(scanPendingPayment);
    const requestCurrencyKnown = Boolean(
      scanPendingPayment.recipientCountryIso && COUNTRY_CURRENCY[scanPendingPayment.recipientCountryIso]
    );
    if (amount > 0) {
      let txnId = genTxnId();
      const now = /* @__PURE__ */ new Date();
      // The backend goes FIRST and is authoritative, exactly as it does in
      // Send Money's completePayment.
      //
      // This whole branch used to be local only: executeTransaction posted to
      // this browser's ledger, the screen announced "Paid … — verified and
      // locked", a history row appeared, and MongoDB never heard about any of
      // it. The person scanned was never credited, and the next dashboard load
      // quietly reversed the payer's balance back, because the profile read
      // reconciles the local ledger against the server's figure. A payment
      // that announces itself and then un-happens is worse than one that
      // fails outright.
      const remote = await handleRemoteSend({
        txnId,
        // Source-denominated, because that is what this screen showed. A
        // Gloobal QR payload carries an amount in minor units and NO
        // currency (see encodeGloobalQR), so the scanning side renders it
        // with the scanner's own symbol — which means the figure the payer
        // read and agreed to was in their own currency. Settling it as the
        // payee's currency instead, which is what the old single-`amount`
        // contract did, moved a different sum than the one on screen.
        //
        // The residual limitation is the payload's, not this call's: a code
        // minted in one currency and scanned in another is ambiguous by
        // construction. Paying what the payer was shown is the honest
        // reading of it.
        // Denominated on the side the payer was actually SHOWN.
        //
        // The card used to render a request with the scanner's own symbol,
        // so "source" — pay what is on screen, in your own money — was the
        // honest reading. The card now renders it in the REQUESTER's
        // currency (scanRequestCurrency), which makes "source" settle a
        // different sum than the one displayed: a ₹200 request read as
        // "₹200.00, ≈ £1.67 from your balance" and then debited £200.
        //
        // "destination" is the server's own name for exactly this case —
        // "a QR encodes a figure the payee named, and the sender pays
        // whatever that converts to". The condition below is deliberately
        // the SAME one the display uses, so what is shown and what is
        // settled cannot disagree: when the payee's currency is unknown the
        // card falls back to the scanner's own, and so does this.
        ...(requestCurrencyKnown
          ? { amountBasis: "destination", destinationAmount: amount, destinationCurrency: requestCurrency, amount, currency: requestCurrency }
          : { amountBasis: "source", sourceAmount: amount, sourceCurrency: requestCurrency, amount, currency: requestCurrency }),
        receiver: { gloobalId: scanPendingPayment.gloobalId, name: scanPendingPayment.recipientName },
        pin: scanVerifiedPinRef.current || "",
        payMethodLabel: scanPayMethod,
        memo: "Scan & Pay",
        clientRequestId: generateRequestId()
      });
      if (remote && remote.ok === false && !remote.skipped) {
        scanVerifiedPinRef.current = null;
        setScanError(remote.reason || "The server rejected this payment.");
        return;
      }
      // `skipped` is the honest case, not a failure: the scanned ID belongs to
      // no registered account — the confirmation card already says so — which
      // leaves the backend no counterparty to credit. Those stay a local
      // simulation, exactly as they were.
      const settledRemotely = Boolean(remote && remote.ok && !remote.skipped);
      scanSettledRemotely = settledRemotely;
      if (settledRemotely && remote.transactionId) txnId = remote.transactionId;
      // The payee's real Creator Share, as the server applied it. A scanned
      // code carries no rate of its own, so this used to be hardcoded 0 and
      // the payer's asset seed was silently skipped on every scanned payment
      // to a creator.
      const shareRatePercent =
        settledRemotely && Number.isFinite(remote.cashbackRate) ? remote.cashbackRate * 100 : 0;
      // My Essentials daily pool applies here — before the real
      // payment, as its own separate step (see
      // TransactionOrchestrator#applyEssentialsPoolSubsidy). Not a
      // payment method the person picks; it's a standing daily
      // subsidy from the platform's own reserve that just makes
      // part of this Scan & Pay already covered by the time the
      // real risk check runs. Capped at today's baseline for this
      // country; whatever's left resets tomorrow.
      const dailyEssentialsLimit = computeEssentialsBaseline(dialCountry.iso).dailyTotal;
      applyEssentialsPoolSubsidy({ requestedAmount: amount, dailyLimit: dailyEssentialsLimit, now });
      const result = executeTransaction({
        txnId,
        amount,
        payMethodLabel: scanPayMethod,
        memo: "Scan & Pay",
        name: scanPendingPayment.recipientName || scanPendingPayment.gloobalId,
        shareRatePercent,
        time: formatClockTime(now),
        now,
        clientRequestId: generateRequestId()
      });
      // Held no longer than the send it authorised.
      scanVerifiedPinRef.current = null;
      if (result.ok) {
        // What LEFT this account, in this account's own currency.
        //
        // `amount` is the figure on the card, which for a cross-border
        // request is the RECEIVER's side (₹200). Recording that with no
        // currency is why a UK account's history showed −£200.00 for a ₹200
        // request: the row had a bare number and History labelled it with
        // the viewer's symbol. Same defect as the restored rows, in the row
        // written at payment time rather than the one read back.
        //
        // The server's own debit figure is preferred; the typed amount and
        // its real currency are the fallback, so the row is always honestly
        // labelled even when the payment stayed local.
        const settledAmount = Number.isFinite(remote && remote.debitAmount) ? remote.debitAmount : amount;
        const settledCurrency = (remote && remote.senderCurrency) || requestCurrency;
        const historyEntry = {
          name: scanPendingPayment.recipientName || scanPendingPayment.gloobalId,
          date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          amount: settledAmount,
          currency: settledCurrency,
          // A skipped/local-only send must not read as "completed" here
          // either — History and the reopened receipt (buildHistoryReceipt
          // passes an unrecognised status straight through) are the only
          // record of this payment a person can go back and check, and
          // "completed" next to money that was never posted is exactly the
          // fake-success this status exists to prevent.
          status: settledRemotely ? "completed" : "simulated",
          method: scanPayMethod && scanPayMethod.includes("PayLater") ? "paylater" : "bank",
          time: formatClockTime(now),
          txnId,
          shareRate: shareRatePercent,
          ledgerRecordId: result.ledgerRecordId,
          role: activeShareRole
        };
        setSendMoneyHistory((h) => [historyEntry, ...h]);
        reportSenderLocation(txnId);
      } else {
        setScanError(result.reason || "Payment failed \u2014 insufficient balance");
        // A rejected payment must not be reported as a paid one. This
        // used to set scanError and then fall straight through to the
        // lines below, which close the very screen scanError is rendered
        // on and announce "Paid ..." — so a failed payment looked like a
        // successful one and its reason was destroyed on the same tick.
        // The screen now stays open with the reason on it.
        return;
      }
    }
    // Only now is the code spent: once a payment was actually posted,
    // or — for a zero-amount scan — once the identity was confirmed.
    // Marking it used before the risk check burned the QR on a payment
    // that never happened and left no way to retry it.
    setUsedQrCodes((prev) => new Set(prev).add(scanPendingPayment.rawCode));
    // Covers the zero-amount branch too, which never reaches the clear inside
    // the payment path above.
    scanVerifiedPinRef.current = null;
    setShowScanScreen(false);
    setScanPendingPayment(null);
    showToast(
      amount > 0
        ? scanSettledRemotely
          ? `Paid ${ccy}${fmt(amount, ccyCode)} \u2014 verified and locked`
          : `Not sent \u2014 ${ccy}${fmt(amount, ccyCode)} recorded locally only, no registered Gloobal account to credit`
        : "Gloobal ID verified and locked"
    );
  };
  // Business/travel "Pay" flow (Dashboard's More sheet) also runs
  // through executeTransaction — the same one canonical lifecycle as
  // Send Money and Scan & Pay. No separate ledger-posting path is left
  // anywhere in the app; an Essentials grant can only ever come from a
  // real, first-time completion inside executeTransaction.
  // Async now: it consults the location gate before posting, like every
  // other payment path. Its callers fire it from an onClick and ignore the
  // return value, so the promise is unobserved by design.
  const handlePayBusiness = async ({ key, label, chip, amount, cashbackRate, payMethodLabel = null }) => {
    const payBusinessArgs = { key, label, chip, amount, cashbackRate, payMethodLabel };
    if (!(await passesLocationGate({ retry: () => handlePayBusiness(payBusinessArgs) }))) return;
    if (amount <= 0) return;
    const txnId = genTxnId();
    const now = /* @__PURE__ */ new Date();
    const methodKey = !payMethodLabel ? "bank" : payMethodLabel.includes("PayLater") ? "paylater" : "bank";
    const result = executeTransaction({
      txnId,
      amount,
      payMethodLabel,
      memo: `Pay ${label}`,
      name: label,
      shareRatePercent: (cashbackRate || 0) * 100,
      time: formatClockTime(now),
      now,
      clientRequestId: generateRequestId()
    });
    if (!result.ok) {
      showToast(result.reason || "Insufficient balance");
      return;
    }
    const historyEntry = {
      name: label,
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount,
      status: "completed",
      method: methodKey,
      time: formatClockTime(now),
      txnId,
      shareRate: (cashbackRate || 0) * 100,
      ledgerRecordId: result.ledgerRecordId,
      role: activeShareRole
    };
    setSendMoneyHistory((h) => [historyEntry, ...h]);
    reportSenderLocation(txnId);
  };
  const assetSeeds = useEssentialsGrants();
  const paylaterHistory = usePaylaterHistory();
  const handleSettleAssetsToBank = (amount) => {
    if (amount <= 0) return;
    settleEssentialsToBank(amount);
  };
  const handleSettleReferralToBank = (amount) => {
    if (amount <= 0) return;
    settleReferralToBank(amount);
  };
  const handleExecuteTransaction = executeTransaction;
  const [stage, setStage] = useState19(() => hasSeenPermissionsGate() ? "phone" : "permissions");
  // Backs the app map's lock state (see the comment on hasEverRegistered
  // above) — mirrored into React state, rather than read straight from
  // localStorage each render, purely so the map's "Dashboard/Bank/Coin…"
  // section re-renders unlocked the instant registration or login first
  // succeeds, without needing a remount to notice the flag changed.
  const [everRegistered, setEverRegistered] = useState19(hasEverRegistered);
  const handleContinueFromPermissionsGate = () => {
    markPermissionsGateSeen();
    setStage("phone");
  };
  const [flipping, setFlipping] = useState19(false);
  const [secureId, setSecureId] = useState19("");
  // A second, separate Gloobal ID for the Creator side of the account
  // — scanning/showing "your code" while in Creator mode now shares a
  // real, different identifier than Personal mode, not the same
  // secureId reused for both. Generated once per account, stably, the
  // same way suggestedRegId is.
  // The Creator ID IS the account's Gloobal ID.
  //
  // It used to be `genSuggestedId(12)` — a fresh random twelve symbols minted
  // in the browser on every load, stored nowhere and registered with nothing.
  // The string "creatorId" does not appear in server.js at all. So the code
  // shown in Creator mode resolved to no account: scanning it produced "No
  // Gloobal account is registered under this ID", the payment could not
  // settle against the backend, and the identifier was different again the
  // next time the app opened.
  //
  // The separate identifier was not needed even in principle. Creator Share
  // is a property of the PAYEE'S ACCOUNT — the send route reads
  // `receiver.cashbackRate` — so it already applies to any payment made to
  // this person, whichever code was scanned. Splitting the identity did not
  // enable Creator Share; it prevented it, by pointing payers at an ID that
  // belonged to nobody.
  const creatorId = secureId;
  // Mirrors DashboardScreen's own shareRole (that component owns the
  // toggle and all of its UI) up to this level, purely so the Scan
  // screen — rendered here, outside DashboardScreen — knows which of
  // the two Gloobal IDs to show/act as under "My Code".
  const [activeShareRole, setActiveShareRole] = useState19("user");
  // Same mirror pattern — DashboardScreen owns myShareRate (the
  // Creator Share % this account offers), the QR edge badge here just
  // needs to read the current value.
  const [activeMyShareRate, setActiveMyShareRate] = useState19(1);
  const [scanShareIconFlipped, setScanShareIconFlipped] = useState19(false);
  useEffect15(() => {
    const interval = setInterval(() => setScanShareIconFlipped((f) => !f), 2500);
    return () => clearInterval(interval);
  }, []);
  const [suggestedRegId] = useState19(() => genSuggestedId(12));
  // Which explain-this-screen sheet is open: null, "symbols", or
  // "referral". One piece of state rather than two booleans, because the
  // two sheets are mutually exclusive by construction — they belong to
  // different stages, so there is no state in which both should be open,
  // and two booleans would let one exist.
  const [helpSheet, setHelpSheet] = useState19(null);
  const [referralCode, setReferralCode] = useState19(readReferralCodeFromUrl);
  // The ?ref= param has done its job once it's been read into state above —
  // left in place it would keep re-seeding referralCode (clobbering an edit
  // or a deliberate clear) on every remount, and it would sit in the address
  // bar and browser history indefinitely. Same cleanup shape as
  // closeDiagnostics' hash removal below: strip the one param this app
  // added, leave everything else in the URL untouched.
  useEffect15(() => {
    if (typeof window === "undefined" || !window.location.search.includes("ref=")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  const [pin, setPin] = useState19("");
  const [otp, setOtp] = useState19("123456");
  const [dialCountry, setDialCountry] = useState19(() => TOP_COUNTRIES.find((c) => c.iso === "IN") || TOP_COUNTRIES[0]);
  // dialCountry starts on India because registration has to start SOMEWHERE
  // before anyone has said where they are. For a signed-in account that is no
  // longer a guess — the backend returns countryIso on every response that
  // carries a user (login, registration, profile) — and leaving the initial
  // guess in place is what made a British or Kenyan account show an Indian
  // flag and ₹ on its own dashboard. It also fed Send Money: `sender` (built
  // from dialCountry, below) is the last-resort fallback for a receiver whose
  // own country cannot be read, so a wrong sender country propagated into the
  // receiver card too.
  //
  // Applied wherever a real user object arrives. Unknown or unlisted codes are
  // ignored rather than defaulted over the top, since the existing value is
  // already the honest "we don't know" answer.
  const applyAccountCountry = (user) => {
    const iso = user && String(user.countryIso || "").trim().toUpperCase();
    if (!iso) return;
    const match = COUNTRY_BY_ISO[iso];
    if (match) setDialCountry(match);
  };
  const [phoneNumber, setPhoneNumber] = useState19("");
  const [showPicker, setShowPicker] = useState19(false);
  const [phoneDialOpen, setPhoneDialOpen] = useState19(false);
  const [showLoginFace, setShowLoginFace] = useState19(false);
  const [isLoginAttempt, setIsLoginAttempt] = useState19(false);
  const [loginEntryMode, setLoginEntryMode] = useState19("id");
  const [loginMobileBuffer, setLoginMobileBuffer] = useState19("");
  const [loginMobileCountry, setLoginMobileCountry] = useState19(null);
  const [showLoginPicker, setShowLoginPicker] = useState19(false);
  const [loginCountrySearch, setLoginCountrySearch] = useState19("");
  const [countrySearch, setCountrySearch] = useState19("");
  const [activeScreen, setActiveScreen] = useState19(null);
  const requestCloseActiveScreen = useBackClose(activeScreen !== null, () => setActiveScreen(null));
  const [showDiagnostics, setShowDiagnostics] = useState19(() => typeof window !== "undefined" && window.location.hash === "#diagnostics");
  useEffect15(() => {
    const onHashChange = () => setShowDiagnostics(window.location.hash === "#diagnostics");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const closeDiagnostics = () => {
    setShowDiagnostics(false);
    if (typeof window !== "undefined" && window.location.hash === "#diagnostics") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };
  const [dashboardHistoryDirection, setDashboardHistoryDirection] = useState19(null);
  // Which Dashboard sub-screen the app map should open once Dashboard.jsx
  // is actually mounted — "bank" | "coin" | "assets" | "paylater" |
  // "aboutus" | null. Dashboard.jsx watches this prop and opens the
  // matching internal show* screen itself; App.jsx only owns the request,
  // not the screen state, since each of those booleans is local to
  // Dashboard.jsx. "send" and "coverage" don't go through this — they're
  // App.jsx's own activeScreen instead (see goToDashboardDestination).
  const [dashboardDeepLink, setDashboardDeepLink] = useState19(null);
  // A receipt link someone was sent. Read once here; acted on further down,
  // below the history it has to search.
  const [sharedTxnRef, setSharedTxnRef] = useState19(() => readSharedTxnFromUrl());
  // Where the app map wanted to go when it was tapped from a screen that
  // isn't Dashboard and the person isn't currently signed in (e.g. they
  // signed out after registering once, and tap "Send Money" from the
  // map). goToDashboardDestination sends them to Login instead of failing
  // silently, and this remembers the original destination so it opens the
  // moment they actually land on Dashboard rather than dropping them on
  // the plain Dashboard home with no explanation.
  const [pendingMapDestination, setPendingMapDestination] = useState19(null);
  useEffect15(() => {
    if (stage !== "dashboard" || !pendingMapDestination) return;
    applyDashboardDestination(pendingMapDestination);
    setPendingMapDestination(null);
    // applyDashboardDestination is defined below and is stable across
    // renders in everything it closes over that matters here (it only
    // calls other setters), so it's intentionally left out of the
    // dependency array rather than hoisted above this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pendingMapDestination]);
  // GLOOBAL_SESSION_EXPIRED_EVENT fires (see httpClient.js) the moment any
  // authenticated call comes back 401 and its bearer token gets dropped —
  // a Render restart invalidating the token, a genuine expiry, whatever
  // the cause. This is the one place that reacts to it: closing whatever
  // App.jsx-level overlay was open (Send Money, Add Bank, Coverage — any
  // of which could be the screen that was mid-call when the token died),
  // dropping any dashboard deep-link that no longer applies, and sending
  // the person to Login rather than leaving them stuck on a screen that's
  // quietly stopped working. goToLogin/showToast are defined further down
  // this component but are already assigned by the time this effect's
  // callback actually runs (mount, not render), same as
  // applyDashboardDestination above.
  useEffect15(() => {
    const onSessionExpired = () => {
      setActiveScreen(null);
      setDashboardDeepLink(null);
      setPendingMapDestination(null);
      showToast("Your session expired. Please sign in again.");
      goToLogin();
    };
    window.addEventListener(GLOOBAL_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(GLOOBAL_SESSION_EXPIRED_EVENT, onSessionExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pendingOpenMyShare, setPendingOpenMyShare] = useState19(false);
  const [secureIdRevealed, setSecureIdRevealed] = useState19(false);
  const [referralRevealed, setReferralRevealed] = useState19(false);
  const [otpRevealed, setOtpRevealed] = useState19(false);
  const [pinRevealed, setPinRevealed] = useState19(false);
  const [loginMobileRevealed, setLoginMobileRevealed] = useState19(false);
  const [regBiometricScanning, setRegBiometricScanning] = useState19(false);
  const [profilePhoto, setProfilePhoto] = useState19(G_LOGO_DATA_URI);
  // Changing the photo has to WRITE it, not just show it.
  //
  // This was `onChangeProfilePhoto={setProfilePhoto}` — state only. The very
  // first photo appeared to persist because the documentation step happens to
  // call persistLocalProfile straight after it; every later change lived in
  // memory and was gone on the next load, which is exactly the "first one
  // saves, updates don't" report. Same storage the first one used, so an
  // updated photo is no more special than the original.
  const handleChangeProfilePhoto = (photo) => {
    setProfilePhoto(photo);
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (symbolId) persistLocalProfile(symbolId, documentedName.trim(), photo);
  };
  const [docType, setDocType] = useState19(null);
  const [documentedName, setDocumentedName] = useState19("");
  const [loginAuthPin, setLoginAuthPin] = useState19("");
  const [loginAuthRevealed, setLoginAuthRevealed] = useState19(false);
  const [loginBiometricScanning, setLoginBiometricScanning] = useState19(false);
  const SECURE_ID_LENGTH = 12;
  const REFERRAL_LENGTH = 12;
  const PIN_LENGTH = 6;
  const OTP_LENGTH2 = 6;

  // --- Real backend (Express + MongoDB Atlas, on Render) ----------------
  //
  // Identity is server-owned from here down. Every stage below calls the
  // real API in backend/services/api/ instead of the setTimeout mocks it
  // used to, so an account created here exists in MongoDB and can be
  // logged into from any other Gloobal frontend against the same backend.
  //
  // authError carries the backend's own message rather than a rewritten
  // one — it already says useful things like "PIN must be 4 to 6 digits"
  // and "Please verify OTP before registration".
  const [authError, setAuthError] = useState19(null);
  const [authBusy, setAuthBusy] = useState19(false);
  // What the backend returned for this account. The whole app keys off
  // registeredUser.symbolId once past registration.
  const [registeredUser, setRegisteredUser] = useState19(null);
  // Bug fix: accountCreatedAt used to be its own useState(() => new Date())
  // — a client-side "now" with no connection to the account at all. It
  // looked fine as long as nothing ever remounted GloobalId, but the
  // backend already tracks the real join date (User.createdAt, sent back
  // as createdAt/joinedDate on every register-symbol, login and profile
  // response — see publicUserPayload in Backend/server.js) and this never
  // read it. So Personal Details' "Joined" date was always just "whenever
  // this browser tab happened to load," and it visibly reset to "now"
  // every time something remounted GloobalId — most noticeably right
  // after Update Gloobal ID, before that remount was fixed at its own
  // source (see gloobalSessionSave's account-switch notice in
  // sessionStore.js).
  //
  // The real value is read straight from registeredUser once the backend
  // has answered, which is why this sits here rather than up with the
  // other early useState calls. accountCreatedAtFallbackRef (declared up
  // there, since it needs no data from registeredUser) only covers the
  // brief window during registration before the account exists
  // server-side at all, and is itself computed once — not on every
  // render — so it does not drift.
  const registeredCreatedAtRaw = registeredUser && (registeredUser.createdAt || registeredUser.joinedDate);
  let accountCreatedAt = null;
  if (registeredCreatedAtRaw) {
    const parsedCreatedAt = new Date(registeredCreatedAtRaw);
    if (!Number.isNaN(parsedCreatedAt.getTime())) accountCreatedAt = parsedCreatedAt;
  }
  if (!accountCreatedAt) {
    if (!accountCreatedAtFallbackRef.current) accountCreatedAtFallbackRef.current = /* @__PURE__ */ new Date();
    accountCreatedAt = accountCreatedAtFallbackRef.current;
  }
  // Set when /api/otp/send answers 409. Kept apart from authError because
  // it is not a transient failure to retry — it is a dead end for
  // registration, and the card renders it with a "Log in instead" action.
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState19(false);
  // Login only: set once GET /api/users/resolve has confirmed the entered
  // Gloobal ID belongs to somebody. Drives the "Account found" chip and is
  // the gate on advancing to the PIN step.
  const [loginIdResolved, setLoginIdResolved] = useState19(false);
  // What the PIN step signs in with — a Gloobal ID or a full mobile number,
  // whichever the person entered. Held separately from `secureId` because on
  // the mobile path there is no Gloobal ID to put there yet: the backend
  // resolves the number behind the PIN, which is what stopped that resolution
  // being an unauthenticated lookup anyone could run.
  const [loginIdentifier, setLoginIdentifier] = useState19("");
  // Registration only: the biometric step's own message, so a device with
  // no sensor (or a declined prompt) explains itself on that screen rather
  // than through the root error banner.
  const [biometricNotice, setBiometricNotice] = useState19(null);

  // The backend normalises 10/11/12-digit forms server-side, but sending
  // the full international number means non-India dial codes survive
  // instead of being assumed to be +91.
  // (The login-side equivalent is built inside handleSubmitSecureId —
  // effectiveLoginCountry is declared further down this component.)
  const fullMobileNumber = `${dialCountry.dialCode || ""}${phoneNumber.replace(/\D/g, "")}`;

  // The PIN fallback behind the biometric gate, hosted once at the root so
  // every guarded action anywhere in the tree can reach it (see
  // gloobalRegisterPinFallbackHost). Held as { reason, resolve }: `resolve`
  // is the promise requireBiometric() is waiting on, and the modal is the
  // only thing that settles it.
  const [pinFallbackRequest, setPinFallbackRequest] = useState19(null);
  useEffect15(() => {
    gloobalRegisterPinFallbackHost(
      (opts) =>
        new Promise((resolve) => {
          setPinFallbackRequest({
            reason: (opts && opts.pinReason) || "Confirm it's you with your PIN.",
            resolve
          });
        })
    );
    // Unregistering on unmount matters: a stale host would resolve into a
    // component that no longer exists, hanging the caller forever.
    return () => gloobalRegisterPinFallbackHost(null);
  }, []);
  // Resolved outside the state updater on purpose — an updater has to stay
  // pure, and React calls it twice under StrictMode.
  const resolvePinFallback = (verified) => {
    if (pinFallbackRequest) pinFallbackRequest.resolve(verified);
    setPinFallbackRequest(null);
  };

  // Render's free tier sleeps when idle and takes 20-50s to wake. Firing
  // one throwaway request at mount means the backend is already booting
  // while the person picks a country and types their number, instead of
  // that wait landing inside the OTP call's own timeout.
  useEffect15(() => {
    GloobalApi.warmUp();
  }, []);

  // Restore whose account this device last used. Not a security token and
  // not a login: it only pre-fills the identity, and reaching the
  // dashboard still costs the PIN check below.
  useEffect15(() => {
    const restored = GloobalApi.loadSession();
    if (!restored) return;
    setRegisteredUser(restored.user);
    // The country this account is registered in, as the backend reported it
    // on the response this session was saved from.
    applyAccountCountry(restored.user);
    if (restored.user.symbolId) setSecureId(restored.user.symbolId);
    if (restored.phoneNumber) setPhoneNumber(restored.phoneNumber);
    // The ID came from a session this device already authenticated once,
    // so it needs no fresh resolve to be trusted as an existing account —
    // it just skips straight to the PIN when submitted.
    if (restored.user.symbolId) setLoginIdResolved(true);
    if (restored.user.symbolId) setLoginIdentifier(restored.user.symbolId);
    // Name and photo come back with it, so a returning person sees their
    // own account rather than a placeholder while the dashboard loads.
    const storedProfile = loadLocalProfile(restored.user.symbolId);
    if (storedProfile) {
      if (storedProfile.name) setDocumentedName(storedProfile.name);
      if (storedProfile.photo) setProfilePhoto(storedProfile.photo);
      // storedProfile.name is not guaranteed non-empty (persistLocalProfile
      // writes "" when nothing was typed), so a stored-but-empty name still
      // falls through to the server's real name below rather than leaving
      // documentedName blank when the backend actually has one.
    }
    if ((!storedProfile || !storedProfile.name) && restored.user.fullName && restored.user.fullName !== restored.user.mobileNumber) {
      // fullName is the mobile number on accounts made before the name step
      // existed (see mapServerTransaction above for the same guard) — never
      // show a phone number as someone's name.
      setDocumentedName(restored.user.fullName);
    }
    gloobalSetBiometricSymbolId(restored.user.symbolId || null);
    setIsLoginAttempt(true);
    setStage("secureId");
  }, []);

  // Any stage change clears a stale error so a fixed problem doesn't keep
  // showing the message from the previous attempt.
  useEffect15(() => {
    setAuthError(null);
  }, [stage]);

  // Real transaction history, once there is a dashboard to show it on.
  //
  // GloobalApi.getTransactionSummary existed and was never called from
  // anywhere, so the history list only ever held what this session had
  // sent — sign in on a new device and your entire payment history was
  // gone. It is loaded once on reaching the dashboard.
  //
  // Server rows are seeded UNDER anything this session already added
  // rather than replacing the list: a payment made moments ago is in local
  // state, and may not be in the fetched page yet, so overwriting would
  // make a just-completed payment disappear. Rows are keyed by txnId so a
  // transaction present in both is not listed twice.
  //
  // A failure is silent by design. History is a read: the dashboard is
  // fully usable without it, and an error banner over a working screen
  // because a list is a few seconds late helps nobody.
  // The account's real balance, pulled from the server and reconciled into
  // the local ledger.
  //
  // These were unrelated numbers: the ledger opened at a fixed 5,000 and
  // tracked only this browser session, while POST /api/transactions/send
  // debited the balance MongoDB holds. The dashboard could show 5,000 for
  // an account the server knew was empty — and since the local figure is
  // what executeTransaction's risk check reads, spending was authorised
  // against a number the backend did not share.
  //
  // GET /api/profile/:symbolId is the read (publicUserPayload carries
  // `balance`), and reconcileBankBalance posts the difference as a real
  // double-entry adjustment rather than assigning to a derived value.
  //
  // `refreshBalanceToken` re-runs it: it is bumped after every successful
  // remote send, because that send changed the server's number and the
  // local ledger has only applied its own view of the same event.
  const [refreshBalanceToken, setRefreshBalanceToken] = useState19(0);
  // Whether the figure on screen has actually been confirmed against the
  // server, rather than being whatever the local ledger happens to hold.
  // The local ledger always has *a* number, so on its own it can never say
  // "I don't know" — and that same number is what the risk check reads.
  // "loading" until the first read resolves, so a fresh dashboard never
  // flashes an error before it has had a chance to succeed.
  // Three states, never two. "loading" is not a balance and neither is an
  // error, and the screen has to be able to say which it is looking at.
  //
  // This used to be read as a single boolean — `balanceStatus ===
  // "unavailable"` — which meant "loading" and "confirmed" rendered
  // IDENTICALLY: as a hard currency figure taken from the local ledger. The
  // local ledger always has a number (it opens at a fixed float and is
  // rebuilt from empty on every page load), so a first login against a cold
  // Render instance showed a confident, correctly-formatted, entirely
  // fictional balance for as long as the read took — €10,000.00 to a
  // Netherlands account whose real balance was €3,120.55 — and then either
  // corrected itself or flipped to "Balance unavailable". That is the
  // "first login shows the wrong balance" report, and the fix is that a
  // figure is only ever shown once the server has confirmed it.
  const [balanceStatus, setBalanceStatus] = useState19("loading");

  // The identity this hydration cycle belongs to. Compared on the way back
  // in, so a response for the account someone just signed out of can never
  // land on the account they signed in to.
  const hydratedForRef = useRef13(null);

  // ONE hydration cycle for the whole account: the authoritative balance,
  // the asset seeds and the PayLater due. It is a function rather than an
  // effect body so the effect, the refresh button and pull-to-refresh can
  // all call the SAME code path instead of maintaining three copies of it.
  //
  // Returns a promise that settles when the cycle is done, which is what
  // lets pull-to-refresh hold its spinner for exactly as long as the work
  // actually takes rather than a guessed interval.
  const hydrateAccount = useCallback11(async () => {
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return false;
    hydratedForRef.current = symbolId;

    // Only the FIRST read for an account announces itself as loading. A
    // pull-to-refresh on a screen already showing a confirmed figure must
    // not blank it back to "Loading balance…" — the number on screen is
    // still the last thing the server said, and replacing it with a
    // spinner every few seconds is worse than leaving it there.
    setBalanceStatus((current) => (current === "ready" ? "ready" : "loading"));

    // All three together, retried as a set while the server is still waking.
    //
    // The backend sits on a Render free instance that spins down after about
    // fifteen minutes idle, and the coldest moment it ever sees is exactly
    // this one: someone opening the app after not using it. A single attempt
    // meant a cold start was indistinguishable from a broken server, which is
    // the "sometimes it fails to load balance on first login" report.
    //
    // The profile read is the probe. Rethrowing its unreachable failure is
    // what asks gloobalApiWithWakeRetry for another pass — and because the
    // whole triple is inside the attempt, the assets and PayLater reads get
    // retried with it instead of being quietly lost to the same cold start.
    //
    // A profile that comes back REJECTED but reachable (a 401, a 500) is not
    // rethrown: that is a real answer from an awake server, and it falls
    // through to the `confirmed` check below exactly as it always has.
    const outcome = await gloobalApiWithWakeRetry(
      async () => {
        const results = await Promise.allSettled([
          GloobalApi.getProfile(symbolId),
          GloobalApi.getAssets(symbolId),
          GloobalApi.getPaylater(symbolId)
        ]);
        const profile = results[0];
        if (profile.status === "rejected" && gloobalApiIsUnreachable(profile.reason)) {
          throw profile.reason;
        }
        return results;
      },
      {
        // The same account guard used below, so a wake-up that outlives the
        // account it was started for stops waiting instead of finishing.
        isCancelled: () => hydratedForRef.current !== symbolId,
        // Distinct from "loading": the server is starting, not failing, and
        // the screen is allowed to say so rather than sit on a spinner that
        // never changes for half a minute.
        onWaking: () => setBalanceStatus("waking")
      }
    );

    // The account changed while this was in flight. Everything below would
    // be writing one person's money onto another person's screen.
    if (hydratedForRef.current !== symbolId) return false;

    // Unreachable through every retry. That is a genuine failure now, not a
    // cold start, and it is reported as one.
    if (!outcome.ok) {
      if (outcome.cancelled) return false;
      setBalanceStatus("error");
      return false;
    }

    const [profileResult, assetsResult, paylaterResult] = outcome.value;
    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;

    // Passed through as-is rather than coerced: reconcileBankBalance is the
    // one place that decides what counts as a real balance, and
    // Number(null) === 0 would otherwise sneak a "zero the account" past
    // this guard. It no-ops on anything that is not a number.
    if (profile) reconcileBankBalance(profile.balance);

    // Only a profile carrying a genuinely numeric balance counts as
    // confirmed — the same bar reconcileBankBalance itself applies. Anything
    // else is an error, and says so, rather than being shown as a figure.
    const confirmed = Boolean(profile) && Number.isFinite(Number(profile.balance));
    setBalanceStatus(confirmed ? "ready" : "error");

    // Seeds before dues: the PayLater LIMIT is derived from the seed list,
    // so reconciling the due first would briefly compute a negative
    // availability against an empty limit.
    const assets = assetsResult.status === "fulfilled" ? assetsResult.value : null;
    const paylater = paylaterResult.status === "fulfilled" ? paylaterResult.value : null;
    if (assets && Array.isArray(assets.seeds)) hydrateGrantsFromServer(assets.seeds);
    // A null is skipped rather than reconciled — reconciling "I couldn't
    // read it" to 0 would clear a real PayLater due, which is the same
    // mistake as fabricating a balance, in the opposite direction.
    if (paylater) reconcilePaylaterDue(paylater.pendingDues);

    return confirmed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredUser, secureId]);

  // Kept in a ref so the pull-to-refresh handler and the refresh control can
  // reach the current cycle without being re-bound on every identity change.
  const hydrateAccountRef = useRef13(hydrateAccount);
  useEffect15(() => {
    hydrateAccountRef.current = hydrateAccount;
  }, [hydrateAccount]);

  // THE refresh. Pull-to-refresh and any refresh control both call this and
  // nothing else, so there is exactly one definition of what "refresh this
  // account" means and no way for two entry points to drift apart.
  //
  // Awaits the hydration cycle rather than firing and forgetting, because
  // the gesture needs to know when the work is actually finished — a
  // spinner that stops on a timer is lying about the same thing the balance
  // used to lie about.
  const handleRefreshAccount = useCallback11(async () => {
    // Arrivals are polled on their own interval; a deliberate refresh should
    // pick them up too rather than leaving money that landed a minute ago
    // invisible until the next tick.
    setReceivedPollToken((n) => n + 1);
    try {
      return await hydrateAccountRef.current();
    } catch (e) {
      // hydrateAccount already records the failure in balanceStatus. This
      // only stops a rejected promise escaping into the gesture handler.
      return false;
    }
  }, []);

  // A new account must never inherit the previous one's verdict. Without
  // this, signing out of an account whose read had failed and into one that
  // works showed "Balance unavailable" on the new account until its own read
  // landed — and the reverse leaked a stale "ready" over the previous
  // account's number. handleStartOver resets around twenty-five pieces of
  // identity state and this was not among them.
  const lastHydratedIdRef = useRef13(null);
  useEffect15(() => {
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId || null;
    if (symbolId === lastHydratedIdRef.current) return;
    lastHydratedIdRef.current = symbolId;
    setBalanceStatus("loading");
  }, [registeredUser, secureId]);

  useEffect15(() => {
    if (stage !== "dashboard") return;
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    // No identity yet. The effect re-runs the moment one arrives, because
    // BOTH sources are watched below — the id lands in `secureId` on some
    // paths and in `registeredUser` on others, and watching only one of them
    // is what made a first login miss its read entirely.
    if (!symbolId) return;
    hydrateAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, registeredUser, secureId, refreshBalanceToken, hydrateAccount]);

  // My Assets and PayLater, restored from the server on arriving at the
  // dashboard.
  //
  // Neither of these was ever read. Both screens are projections of the
  // local ledger, which is rebuilt from empty on every page load, so every
  // re-login presented a brand new account: no seeds, no accrued interest,
  // and — the part that actually mattered — ₹0 owed on PayLater with the
  // full limit available, to somebody who owed money. RiskEngine reads
  // paylaterAvailable off that same balance, so it would have authorised
  // spending against credit that had already been used.
  //
  // Runs on the same trigger as the balance reconcile above, including
  // refreshBalanceToken, so a completed payment refreshes all three
  // together rather than leaving the seeds a payment just planted invisible
  // until the next reload.
  //
  // Both calls fail soft (null on a failed read, never a fabricated zero),
  // and a null is skipped rather than reconciled — reconciling "I couldn't
  // read it" to 0 would clear a real PayLater due, which is the same
  // mistake in the opposite direction.
  // (The separate My Assets / PayLater effect that used to sit here has been
  // folded into hydrateAccount above. It ran on exactly the same trigger and
  // read the id exactly the same two ways, so keeping it apart meant two
  // copies of the same identity handling and two chances to get it wrong —
  // and pull-to-refresh would have had to know about both.)

  // Arrivals are only noticed if something asks. The summary fetch below
  // ran once per dashboard entry, so money landing while the app sat open
  // went unseen until an unrelated refresh happened to fire.
  const [receivedPollToken, setReceivedPollToken] = useState19(0);
  // Whether the dedupe list has been primed for this session.
  //
  // Without this the first poll would notify for the ENTIRE received
  // history at once — every payment ever received, all in the tray, the
  // moment someone turns notifications on. The first pass therefore marks
  // what already exists as seen WITHOUT showing anything, and only genuinely
  // new arrivals after that point notify.
  const receivedNotifyPrimedRef = useRef13(false);
  useEffect15(() => {
    if (stage !== "dashboard") return;
    const interval = setInterval(() => {
      // Nothing to gain from polling a backgrounded tab, and a phone on
      // battery has plenty to lose. A notification the person would only
      // see on returning is one the freshly-woken poll will raise anyway.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setReceivedPollToken((n) => n + 1);
    }, GLOOBAL_RECEIVED_POLL_MS);
    return () => clearInterval(interval);
  }, [stage]);
  // A sign-out must re-prime for whoever signs in next.
  useEffect15(() => {
    if (stage !== "dashboard") receivedNotifyPrimedRef.current = false;
  }, [stage]);

  // Money this account RECEIVED, kept apart from what it sent.
  //
  // Every server row used to be appended to sendMoneyHistory regardless of
  // which side of it this account was on, and the dashboard's Paid list is
  // built from that state — so a payment somebody made TO you appeared in
  // your Paid history, as money you had spent. The backend has always said
  // which it is (`direction`, computed per viewer); the client was throwing
  // the answer away.
  const [receivedMoneyHistory, setReceivedMoneyHistory] = useState19([]);

  // Placed HERE, below sendMoneyHistory and receivedMoneyHistory, not beside
  // the state it reads. A hook's dependency array is evaluated on EVERY
  // render - before the `const`s further down the component body exist.
  // Declared earlier, this threw "Cannot access 'receivedMoneyHistory' before
  // initialization" during mount and the app rendered a blank white page.
  useEffect15(() => {
    if (!sharedTxnRef || stage !== "dashboard") return;
    const found =
      sendMoneyHistory.find((t) => t.txnId === sharedTxnRef) ||
      receivedMoneyHistory.find((t) => t.txnId === sharedTxnRef);
    if (!found) {
      // The history fetch may not have landed yet, so this stays armed and
      // re-runs when it does. A link for a payment this account was no part
      // of quietly does nothing, which is the correct outcome.
      return;
    }
    setSharedTxnRef("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("txn");
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      // A browser that refuses replaceState still gets the receipt.
    }
    setDashboardHistoryDirection(
      sendMoneyHistory.some((t) => t.txnId === found.txnId) ? "sending" : "receiving"
    );
  }, [sharedTxnRef, stage, sendMoneyHistory, receivedMoneyHistory]);
  useEffect15(() => {
    if (stage !== "dashboard") return;
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return;
    let cancelled = false;
    (async () => {
      try {
        const { transactions } = await GloobalApi.getTransactionSummary(symbolId, "all");
        if (cancelled || !Array.isArray(transactions)) return;
        const mapped = transactions.map((row) => mapServerTransaction(row, symbolId));
        const sent = mapped.filter((entry) => entry.direction !== "received");
        const received = mapped.filter((entry) => entry.direction === "received");
        // Both lists seed UNDER whatever this session already holds, keyed by
        // txnId, for the same reason: a payment made moments ago is in local
        // state and may not be in the fetched page yet.
        const seedUnder = (local, rows) => {
          const seen = new Set(local.map((entry) => entry.txnId).filter(Boolean));
          return local.concat(rows.filter((entry) => !entry.txnId || !seen.has(entry.txnId)));
        };
        setSendMoneyHistory((local) => seedUnder(local, sent));
        setReceivedMoneyHistory((local) => seedUnder(local, received));
        // First pass for this session: record what is already there as seen
        // and say nothing. Only what arrives AFTER this point is news.
        if (!receivedNotifyPrimedRef.current) {
          received.forEach((entry) => markPaymentNotified(entry.txnId));
          receivedNotifyPrimedRef.current = true;
        } else {
          received.forEach((entry) => notifyPaymentReceived({
            txnId: entry.txnId,
            amount: entry.amount,
            currencySymbol: CURRENCY_SYMBOL[COUNTRY_CURRENCY[dialCountry.iso] || "USD"] || "",
            from: entry.name
        }));
          // A paid request clears itself, which is what makes the code on
          // screen refresh.
          //
          // The QR is deterministic - encodeGloobalQR(id, amount) returns the
          // same code for the same pair forever - so a request code could
          // never change while the amount stood. Once someone paid it, the
          // payer's device added it to usedQrCodes and refused it ever after,
          // while the receiver went on displaying that exact dead code.
          //
          // Clearing the amount IS the refresh: requestCents drops to 0 and
          // the panel re-mints a plain identity code. No timer - the trigger
          // is the money landing, the only event that means the code is spent.
          //
          // Matched on the amount so an unrelated payment landing first does
          // not wipe a request the person is still holding up. Both figures
          // are in this account's own currency, compared in whole minor units.
          const outstanding = Math.round(parseFloat(requestAmountRef.current || "0") * 100);
          if (outstanding > 0 && received.some((entry) => Math.round((Number(entry.amount) || 0) * 100) === outstanding)) {
          setRequestAmount("");
          setRequestOpen(false);
          }
        }
      } catch (e) {
        /* read-only; the dashboard works without it */
      }
    })();
    return () => {
      cancelled = true;
    };
    // secureId — same missing dependency as the two effects above.
    // receivedPollToken re-runs this on the poll tick, which is what makes
    // an arrival visible (and notifiable) while the app is simply open.
  }, [stage, registeredUser, secureId, receivedPollToken]);

  // Login, ID mode: check the Gloobal ID the moment it is complete rather
  // than waiting for submit, so the card can show "Account found" before
  // the PIN screen is ever reached.
  //
  // The IN button is deliberately NOT gated on this. An unclear answer —
  // a cold Render start, a 5xx — is not evidence that the ID is wrong,
  // and disabling the only way forward on one would lock somebody out of
  // their own account over a slow network. handleSubmitSecureId re-checks
  // and is the real gate; this is the early, advisory half.
  //
  // `cancelled` guards the usual out-of-order finish: someone who
  // backspaces and retypes has two lookups in flight, and the slower one
  // must not overwrite the newer answer.
  useEffect15(() => {
    if (!isLoginAttempt || loginEntryMode !== "id" || stage !== "secureId") return;
    if (secureId.length !== SECURE_ID_LENGTH) {
      setLoginIdResolved(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // Asks only whether the ID is taken, not who has it. This used to call
      // GET /api/users/resolve, which hands back a name and a mobile number —
      // before anybody had signed in, so typing twelve symbols into the login
      // screen was a way to read a stranger's contact details. The chip only
      // ever needed the boolean.
      const { available } = await GloobalApi.checkSymbolAvailability(secureId);
      if (cancelled) return;
      if (available === false) {
        setLoginIdResolved(true);
        setAuthError(null);
        return;
      }
      setLoginIdResolved(false);
      // Only a definite answer is reported. `null` means the lookup could not
      // tell — a cold start or a 5xx — and saying "no account found" over one
      // would be telling somebody their own account does not exist.
      if (available === true) setAuthError("No account found for this Gloobal ID.");
    })();
    return () => {
      cancelled = true;
    };
  }, [secureId, isLoginAttempt, loginEntryMode, stage]);
  const flipTo = (next) => {
    // Every path that ever reaches "dashboard" — registration finishing,
    // a fresh login, a restored session's PIN check — funnels through
    // here, so this is the one place that needs to know about it to keep
    // hasEverRegistered accurate (see its own comment above).
    if (next === "dashboard" && !everRegistered) {
      markEverRegistered();
      setEverRegistered(true);
    }
    setFlipping(true);
    setTimeout(() => {
      setStage(next);
      setFlipping(false);
    }, 220);
  };
  // App-map navigation. These are deliberately plain "go there" helpers —
  // no confirmation, no attempt to preserve whatever the person was mid-
  // way through — because that's what a map is for. The four functions
  // below cover every way a map entry can be reached:
  //   - a pre-registration entry (Mobile Number / Create Gloobal ID /
  //     Referral Code) → straight to that registration stage;
  //   - the Login entry → straight to the login form;
  //   - an unlocked post-registration destination while already on
  //     Dashboard → open it immediately;
  //   - the same destination from anywhere else (including signed out on
  //     a device that has registered before) → send them to Login first,
  //     remembering the destination so it opens the moment they land.
  const goToRegistrationStart = () => {
    setIsLoginAttempt(false);
    flipTo("phone");
  };
  const goToLogin = () => {
    setIsLoginAttempt(true);
    setLoginEntryMode("id");
    flipTo("secureId");
  };
  // Applies a Dashboard-level destination that is already safe to open —
  // either because Dashboard is already mounted (stage === "dashboard"),
  // or because pendingMapDestination's effect above is calling this the
  // instant it becomes true. "send" and "coverage" are App.jsx's own
  // activeScreen overlays; everything else is a Dashboard-internal show*
  // screen, requested via dashboardDeepLink and opened by Dashboard.jsx
  // itself (see its deepLinkTarget prop).
  const applyDashboardDestination = (target) => {
    if (!target) return;
    if (target === "send") {
      setActiveScreen("send");
      return;
    }
    if (target === "coverage") {
      setActiveScreen("coverage");
      return;
    }
    if (target === "history") {
      // Same mechanism the dashboard's own "Paid" history link already
      // uses (see the SendMoney onOpenPaidHistory callback below) — any
      // truthy value opens history; "sending" is the value already
      // proven to work end-to-end.
      setDashboardHistoryDirection("sending");
      return;
    }
    setDashboardDeepLink(target);
  };
  const goToDashboardDestination = (target) => {
    if (stage === "dashboard") {
      applyDashboardDestination(target);
      return;
    }
    // Not on Dashboard right now (mid-flow elsewhere, or signed out on a
    // device that has registered before) — get them signed in first, and
    // remember where they actually wanted to go.
    setPendingMapDestination(target);
    goToLogin();
  };
  // What tapping a LOCKED map entry does: jump to whichever screen
  // actually unlocks it, rather than doing nothing or just explaining why
  // it's locked. Pre-registration entries lock once the device has
  // registered before, and the only thing that could still make sense of
  // tapping one then is signing back in; post-registration entries lock
  // until that first registration happens, so the fix is the start of
  // registration itself.
  const handleAppMapLockedPress = (entry) => {
    if (entry.group === "pre") {
      goToLogin();
    } else {
      goToRegistrationStart();
    }
  };
  // The app map's full entry list. "pre" entries are the registration
  // flow's own checkpoints (locked once this device has registered
  // before — there's nothing left to do there); "post" entries are the
  // main, signed-in destinations (locked until that first registration
  // happens). Login is the one pre-registration entry that's never
  // locked — it's still the right place to go on a device that has
  // registered before but is currently signed out.
  const appMapEntries = [
    { key: "phone", group: "pre", label: "Mobile Number", locked: everRegistered, onPress: goToRegistrationStart },
    { key: "secureId", group: "pre", label: "Create Gloobal ID", locked: everRegistered, onPress: () => { setIsLoginAttempt(false); flipTo("secureId"); } },
    { key: "referral", group: "pre", label: "Referral Code", locked: everRegistered, onPress: () => { setIsLoginAttempt(false); flipTo("referral"); } },
    { key: "login", group: "pre", label: "Login", locked: false, onPress: goToLogin },
    { key: "dashboard", group: "post", label: "Dashboard", locked: !everRegistered, onPress: () => goToDashboardDestination(null) },
    { key: "gbank", group: "post", label: "Gloobal Bank", locked: !everRegistered, onPress: () => goToDashboardDestination("bank") },
    { key: "gcoin", group: "post", label: "Gloobal Coin", locked: !everRegistered, onPress: () => goToDashboardDestination("coin") },
    { key: "send", group: "post", label: "Send Money", locked: !everRegistered, onPress: () => goToDashboardDestination("send") },
    { key: "assets", group: "post", label: "My Assets", locked: !everRegistered, onPress: () => goToDashboardDestination("assets") },
    { key: "paylater", group: "post", label: "PayLater", locked: !everRegistered, onPress: () => goToDashboardDestination("paylater") },
    { key: "history", group: "post", label: "Transaction History", locked: !everRegistered, onPress: () => goToDashboardDestination("history") },
    { key: "coverage", group: "post", label: "Gloobal Coverage", locked: !everRegistered, onPress: () => goToDashboardDestination("coverage") },
    { key: "aboutus", group: "post", label: "About Us", locked: !everRegistered, onPress: () => goToDashboardDestination("aboutus") },
    // Profile sub-screens. They live behind the Profile tab in normal
    // navigation, but each is a full-screen overlay in its own right, so the
    // map can open them directly rather than dropping somebody on Profile
    // and leaving them to find the row themselves — which is the whole point
    // of having a map.
    { key: "ghscore", group: "post", label: "GH Score", locked: !everRegistered, onPress: () => goToDashboardDestination("ghscore") },
    { key: "share", group: "post", label: "Creator Share", locked: !everRegistered, onPress: () => goToDashboardDestination("share") },
    { key: "updateId", group: "post", label: "Update Gloobal ID", locked: !everRegistered, onPress: () => goToDashboardDestination("updateId") },
    { key: "referralnet", group: "post", label: "Referral Network", locked: !everRegistered, onPress: () => goToDashboardDestination("referral") }
  ];
  const effectiveLoginCountry = loginMobileCountry || dialCountry;
  const [loginMinLen, loginMaxLen] = mobileDigitRange(effectiveLoginCountry.iso);
  const loginMobileComplete = loginMobileBuffer.length >= loginMinLen;
  const handleSubmitSecureId = async () => {
    // Login by mobile number: resolve it to the Secure ID behind it, so
    // the PIN step that follows has a real symbolId to authenticate.
    if (isLoginAttempt && loginEntryMode === "mobile") {
      if (!loginMobileComplete || authBusy) return;
      // Carried to the PIN step as-is. It used to be resolved to a Gloobal ID
      // here, through GET /api/users/resolve, which meant an unauthenticated
      // caller could map any phone number to the account behind it. POST
      // /api/login now accepts the number itself and does that resolution
      // behind the PIN, so there is nothing to look up first.
      setLoginIdentifier(`${effectiveLoginCountry.dialCode || ""}${loginMobileBuffer.replace(/\D/g, "")}`);
      setAuthError(null);
      flipTo("loginAuth");
      return;
    }
    if (secureId.length !== SECURE_ID_LENGTH || authBusy) return;
    // Login by Gloobal ID: the ID has to resolve to a real account before
    // the PIN step, not after. Sending an unknown ID into /api/login only
    // produces a generic failure that reads as "wrong PIN", and burns an
    // attempt against the backend's 5-strike lockout for a mistake that
    // was never about the PIN.
    if (isLoginAttempt) {
      // The background effect above already resolved this exact ID and it
      // came back as a real account — no reason to spend a second
      // GET /api/users/resolve (and a second 45s cold-start timeout) on
      // the same question.
      setLoginIdentifier(secureId);
      if (loginIdResolved) {
        flipTo("loginAuth");
        return;
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        // Existence only — the account's details come back from /api/login,
        // after the PIN. A `null` answer (cold start, 5xx) is not evidence the
        // ID is wrong and must not block the one way forward.
        const { available } = await GloobalApi.checkSymbolAvailability(secureId);
        if (available === true) {
          setLoginIdResolved(false);
          setAuthError("No account found for this Gloobal ID.");
          return;
        }
        setLoginIdResolved(available === false);
        flipTo("loginAuth");
      } finally {
        setAuthBusy(false);
      }
      return;
    }
    // Registration: warn early if this ID is already somebody's. Only an
    // explicit "taken" blocks — an unclear answer (cold start, 5xx) lets
    // the person continue, because POST /api/register-symbol is the real
    // uniqueness authority and a flaky lookup must not lock anyone out.
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { available } = await GloobalApi.checkSymbolAvailability(secureId);
      if (available === false) {
        // No second set of alternatives here — the Suggested-for-you row
        // above the dial already offers one, and its own refresh control
        // generates another. Showing a second, different pair on top of
        // that was redundant and made "taken" look like a bigger dead end
        // than it is.
        setAuthError("That Gloobal ID is already taken. Try another.");
        return;
      }
      flipTo("referral");
    } finally {
      setAuthBusy(false);
    }
  };
  // The referral code is only carried here; it is submitted as part of
  // registration at the PIN step. Skipping leaves it empty, which the
  // backend accepts.
  const handleSubmitReferral = async () => {
    if (referralCode.length !== REFERRAL_LENGTH || authBusy) return;
    // Check the code belongs to somebody before carrying it forward.
    // GloobalApi.referralCodeExists existed and was called from nowhere,
    // so a mistyped code travelled all the way to registration, where the
    // backend silently drops it — the person believed they had credited a
    // friend and nobody found out.
    //
    // Only a definite `false` (an explicit 404) blocks. Null means the
    // lookup could not tell — a cold start or a 5xx — and rejecting a
    // probably-genuine code over that would be worse than letting
    // registration proceed, which is also why the backend never fails a
    // registration over a bad code.
    setAuthBusy(true);
    setAuthError(null);
    try {
      const exists = await GloobalApi.referralCodeExists(referralCode);
      if (exists === false) {
        setAuthError("No Gloobal account uses that referral ID. Check it, or skip this step.");
        return;
      }
      flipTo("profile");
    } finally {
      setAuthBusy(false);
    }
  };
  // The account is actually created here — this is the one write that
  // matters. Two calls in order: register-symbol creates the User in
  // MongoDB, then pin/set stores its bcrypt PIN hash. If the PIN call
  // fails the user exists without a PIN, which /api/pin/set can retry, so
  // the error is surfaced rather than rolled back.
  const handleSubmitPin = async () => {
    if (pin.length !== PIN_LENGTH || authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await GloobalApi.register({
        // The real name, collected at the profile step just before this
        // one. It used to be the phone number: fullName was set to
        // fullMobileNumber because the name had not been asked for yet at
        // this point in the flow, so every account created here was stored
        // with its own mobile number as its display name.
        fullName: documentedName.trim(),
        mobileNumber: fullMobileNumber,
        symbolId: secureId,
        // The country picked on the phone-code step. POST /api/register-symbol
        // has always read this out of the body and stored it, but nothing ever
        // sent it — so the route's `undefined` fallback ran on every single
        // registration and wrote 'IN'. Every account in the database is
        // recorded as India-registered as a result, which is the root of the
        // wrong receiver flag and currency on Send Money: an American payee
        // resolved to countryIso 'IN' and was drawn with an Indian flag and ₹
        // on the sender's screen, and the FX conversion used INR as the
        // receiving currency. Sending it is what makes the stored country
        // real; server/scripts/backfill-country-iso.mjs repairs the accounts
        // written before this line existed.
        countryIso: dialCountry.iso,
        referredBy: referralCode || ""
      });
      setRegisteredUser(result.user);
      // Normally the same country that was just sent; read back from the
      // response so the client agrees with whatever the server actually
      // stored rather than with what it asked for.
      applyAccountCountry(result.user);
      const newSymbolId = result.user.symbolId || secureId;
      await GloobalApi.setPin(newSymbolId, pin);
      // The photo has no home on the backend (PUT /api/profile takes
      // fullName and email only), so it is written locally against the ID
      // that now exists. Done here rather than at the profile step because
      // that step runs before the account does.
      persistLocalProfile(newSymbolId, documentedName.trim(), profilePhoto);
      // This — not the register call above — is what actually sets the
      // name. POST /api/register-symbol destructures `fullName` out of the
      // body and then throws it away: it does
      // `cleanFullName = cleanMobileNumber` and stores that, so every
      // account it creates is named after its own phone number regardless
      // of what was sent. (Confirmed against live data: resolving an
      // existing account returns fullName "+2528685888888".) PUT
      // /api/profile/:symbolId is the only route that honours a real name,
      // so it is awaited rather than fired and forgotten — an earlier
      // version let it fail silently, which meant the name quietly stayed
      // as the phone number and nothing said so.
      //
      // It still must not fail the registration. The account and its PIN
      // both exist by now; a name that did not reach the server is worth a
      // warning and a retry, not throwing the whole thing away.
      try {
        await GloobalApi.updateProfile(newSymbolId, { fullName: documentedName.trim() });
      } catch (err) {
        setAuthError("Your name couldn't be saved to your profile just now — we'll retry next time you sign in.");
      }
      // The passkey has to be enrolled against an account that exists, so
      // the gate is told who it is working for only now.
      gloobalSetBiometricSymbolId(newSymbolId);
      // A bad referral code never fails the registration, so this is the
      // only place it can be reported.
      if (result.referralWarning) setAuthError(result.referralWarning);
      flipTo("biometric");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };
  // Registration's biometric step: a real WebAuthn enrolment, not a timed
  // animation. On a phone this is the Face ID / Touch ID / fingerprint
  // prompt, and what it leaves behind is a passkey the backend verified
  // and stored — which is what every later gate checks against.
  //
  // Failure here never blocks the dashboard. Someone whose device has no
  // sensor, or who declines the prompt, still has a working account
  // protected by the PIN they just set; they are told it can be turned on
  // later rather than being held at a screen they cannot pass.
  const handleRegBiometricVerify = async () => {
    if (regBiometricScanning) return;
    setRegBiometricScanning(true);
    setBiometricNotice(null);
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    const result = await gloobalEnrolBiometric(symbolId);
    setRegBiometricScanning(false);
    if (registeredUser) GloobalApi.saveSession(registeredUser, phoneNumber, result.ok);
    if (!result.ok) {
      setBiometricNotice(`${result.reason} You can set this up later in Settings.`);
      return;
    }
    flipTo("dashboard");
  };
  // Skipping biometric setup. Kept explicit so declining is a decision the
  // person makes rather than something they have to fail their way past.
  const handleSkipRegBiometric = () => {
    if (registeredUser) GloobalApi.saveSession(registeredUser, phoneNumber, false);
    flipTo("dashboard");
  };
  // Name and photo, both mandatory, collected before the PIN so the
  // account is created with a real name on it.
  const handleSubmitProfile = () => {
    if (!docType || documentedName.trim().length < 2 || profilePhoto === G_LOGO_DATA_URI) return;
    // Written against the chosen Gloobal ID now and re-written against the
    // confirmed one after registration — the backend can hand back a
    // different symbolId, and this keeps the local copy findable either way.
    persistLocalProfile(secureId, documentedName.trim(), profilePhoto);
    flipTo("pin");
  };
  // POST /api/login — Secure ID + PIN, verified server-side against the
  // bcrypt hash. The backend locks the account for 10 minutes after 5 bad
  // attempts and says so in its message, which is surfaced as-is.
  const handleSubmitLoginAuth = async () => {
    if (loginAuthPin.length !== PIN_LENGTH || authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const symbolId = loginIdentifier || (registeredUser && registeredUser.symbolId) || secureId;
      const result = await GloobalApi.login(symbolId, loginAuthPin);
      setRegisteredUser(result.user);
      // Signing in on a new device: the country picker still holds whatever
      // was guessed at the phone step, and the account's own country is
      // authoritative over it.
      applyAccountCountry(result.user);
      // The backend resolved a mobile number to its account, so this is the
      // first point the Gloobal ID is known on that path.
      if (result.user && result.user.symbolId) setSecureId(result.user.symbolId);
      GloobalApi.saveSession(result.user, phoneNumber);
      gloobalSetBiometricSymbolId(result.user.symbolId || symbolId);
      setLoginAuthPin("");
      const loggedInSymbolId = result.user.symbolId || symbolId;
      const localProfile = loadLocalProfile(loggedInSymbolId);
      // Restore the name and photo for THIS login, not just the one at
      // page-mount (see the session-restore effect above, which only ever
      // runs once). handleStartOver blanks documentedName/profilePhoto back
      // to "" and the Gloobal placeholder on sign-out; nothing repopulated
      // them here, so anyone who signed out and back in during the same
      // browser tab saw "Gloobal ID Member" instead of their real name even
      // though it was safely stored both locally and on the backend the
      // whole time. The backend is the authority (per persistLocalProfile's
      // comment) except when its fullName is really just the account's own
      // mobile number — true of accounts created before the name step
      // existed, or before the register-symbol fix that stopped discarding
      // a real name at signup — in which case the locally cached name, if
      // there is one, is shown instead of a phone number.
      const serverName =
        result.user.fullName && result.user.fullName !== result.user.mobileNumber
          ? result.user.fullName
          : null;
      if (serverName) {
        setDocumentedName(serverName);
      } else if (localProfile && localProfile.name) {
        setDocumentedName(localProfile.name);
      }
      if (localProfile && localProfile.photo) setProfilePhoto(localProfile.photo);
      // The retry the registration step promises when PUT /api/profile
      // fails. The local copy is the one the person actually typed; if the
      // server still disagrees, push it again. Cheap, silent, and harmless
      // when it is already in sync (the condition is false). Never
      // awaited — a sign-in must not wait on a display name.
      if (localProfile && localProfile.name && localProfile.name !== result.user.fullName) {
        GloobalApi.updateProfile(loggedInSymbolId, { fullName: localProfile.name }).catch(() => {});
      }
      // Whatever the local session claims, the server knows whether this
      // account actually has a passkey. Asked once, here, so the next
      // screen already knows whether it is verifying or offering setup.
      const hasPasskey = await gloobalBiometricEnrolledRemote(result.user.symbolId || symbolId);
      if (hasPasskey !== null) GloobalApi.saveSession(result.user, phoneNumber, hasPasskey);
      // A device with no sensor at all cannot be asked for one. The PIN
      // just verified server-side is the whole check on that device, and
      // holding it at a prompt it can never satisfy would lock the person
      // out of their own account.
      if (!(await gloobalPlatformAuthenticatorAvailable())) {
        flipTo("dashboard");
        return;
      }
      setBiometricNotice(null);
      flipTo("loginBiometric");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };
  // Mandatory on every re-login, after the PIN. Enrolled accounts get a
  // real WebAuthn assertion; accounts that have never enrolled get the
  // offer here instead, so the second login is the last one without it.
  const handleLoginBiometricVerify = async () => {
    if (loginBiometricScanning) return;
    setLoginBiometricScanning(true);
    setBiometricNotice(null);
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    const enrolled = gloobalBiometricEnrolled();
    const result = enrolled ? await gloobalVerifyBiometric(symbolId) : await gloobalEnrolBiometric(symbolId);
    if (result.ok) {
      setLoginBiometricScanning(false);
      flipTo("dashboard");
      return;
    }
    // Failing the device check cannot be a dead end, and this is where it
    // used to become one. The enrolment flag stored at login is the
    // *account's* (the server answers "does this account have a passkey"),
    // but the assertion is the *device's* — so signing in on a second
    // phone reported "enrolled", ran a verify that can only fail because
    // the credential lives on the first phone, and got a NotAllowedError
    // rather than the 404 that would have offered enrolment. With no skip
    // shown for an enrolled account, the dashboard was unreachable on that
    // device, permanently. (Enrolling the second device is not an option
    // either: /api/passkey/register/options 409s once the account has one.)
    //
    // requireBiometric gives the device one more try — a misread finger is
    // the common case and deserves it — and then falls to the PIN, checked
    // server-side by POST /api/pin/verify. That is the same credential the
    // login one step ago was verified against, so this is still a real
    // check rather than a way past the gate.
    const verifiedByPin = await requireBiometric({
      symbolId,
      pinReason: "Confirm it's you with your PIN to finish signing in."
    });
    setLoginBiometricScanning(false);
    if (verifiedByPin) {
      flipTo("dashboard");
      return;
    }
    setBiometricNotice(
      result.notEnrolled
        ? "Set up Face ID or fingerprint, or confirm with your PIN, to finish signing in."
        : `${result.reason} Try again, or confirm with your PIN.`
    );
  };
  // Continue without biometrics. Only offered when there is nothing
  // enrolled to verify against — an account that HAS a passkey has to
  // satisfy the gate above (device check, or the PIN behind it), which is
  // what makes it mandatory rather than advisory.
  const handleSkipLoginBiometric = () => {
    if (gloobalBiometricEnrolled()) return;
    flipTo("dashboard");
  };
  const handleBackFromSecureId = () => {
    if (isLoginAttempt) {
      setIsLoginAttempt(false);
      setLoginEntryMode("id");
      setLoginMobileBuffer("");
      setLoginMobileCountry(null);
      setShowLoginFace(false);
      flipTo("phone");
    } else {
      flipTo("otp");
    }
  };
  const requestBackFromSecureId = useBackClose(stage === "secureId", handleBackFromSecureId);
  const requestBackFromReferral = useBackClose(stage === "referral", () => flipTo("secureId"));
  // Registration order is phone → OTP → Gloobal ID → referral → name and
  // photo → PIN → biometric, so these three walk back along that same
  // chain. The name/photo step moved ahead of the PIN so that the account
  // POST /api/register-symbol creates at the PIN step already carries the
  // person's real name.
  const requestBackFromProfile = useBackClose(stage === "profile", () => flipTo("referral"));
  const requestBackFromPin = useBackClose(stage === "pin", () => flipTo("profile"));
  // Registration's biometric step is terminal: the account exists and its
  // PIN is set, so there is nothing behind it to go back to — walking back
  // to the PIN would re-run POST /api/register-symbol for an account that
  // already exists.
  //
  // So Back does nothing here rather than being wired to the skip handler,
  // which made both the hardware Back gesture and the on-screen chevron
  // navigate *forward* into the dashboard — pressing Back signed you in.
  // Moving on without biometrics is the explicit "Set this up later"
  // button instead, which is a decision rather than a side effect.
  const requestBackFromRegBiometric = useBackClose(stage === "biometric", () => {});
  const requestBackFromLoginAuth = useBackClose(stage === "loginAuth", () => {
    setLoginAuthPin("");
    flipTo("secureId");
  });
  const requestBackFromLoginBiometric = useBackClose(stage === "loginBiometric", () => flipTo("loginAuth"));
  useEffect15(() => {
    const stage2 = stageRef.current;
    dimsRef.current = { w: stage2.clientWidth, h: stage2.clientHeight };
    for (let i = 0; i < 8; i++) {
      const p = makeParticle(dimsRef.current.w, dimsRef.current.h);
      p.y = Math.random() * dimsRef.current.h;
      p.spawnY = p.y + dimsRef.current.h * 0.5;
      p.scale = 1;
      p.opacity = 0.15 + Math.random() * 0.5;
      particlesRef.current.push(p);
    }
    forceRender((n) => n + 1);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    const tick = () => {
      frameRef.current += 1;
      const { w, h } = dimsRef.current;
      const arr = particlesRef.current;
      for (const p of arr) {
        p.x += p.vx;
        p.y += p.vy;
        p.twinklePhase += p.twinkleSpeed;
      }
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          const ra = Math.max(a.pw, a.ph) * a.scale / 2;
          const rb = Math.max(b.pw, b.ph) * b.scale / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
          const minDist = (ra + rb) * 0.9;
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const push = 0.18;
            a.vx -= nx * push;
            a.vy -= ny * push * 0.25;
            b.vx += nx * push;
            b.vy += ny * push * 0.25;
            a.vx = Math.max(-1.3, Math.min(1.3, a.vx));
            b.vx = Math.max(-1.3, Math.min(1.3, b.vx));
            a.vy = Math.max(-1.6, Math.min(-0.15, a.vy));
            b.vy = Math.max(-1.6, Math.min(-0.15, b.vy));
          }
        }
      }
      for (const p of arr) {
        const distFromBottom = h - p.y;
        if (distFromBottom < 60) {
          p.opacity = Math.min(0.9, distFromBottom / 60);
        } else {
          p.opacity = 0.35 + Math.abs(Math.sin(p.twinklePhase)) * 0.55;
        }
        const traveled = p.spawnY - p.y;
        const growthRatio = Math.min(1, traveled / (h * 0.5));
        const eased = 1 - Math.pow(1 - growthRatio, 3);
        p.scale = GROWTH_START_SCALE + (1 - GROWTH_START_SCALE) * eased;
        const el = elsRef.current[p.id];
        if (el) {
          el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
          el.style.opacity = p.opacity;
        }
      }
      let changed = false;
      particlesRef.current = arr.filter((p) => {
        const alive = p.y > -30 && p.x > -30 && p.x < w + 30;
        if (!alive) changed = true;
        return alive;
      });
      if (frameRef.current % 10 === 0 && particlesRef.current.length < MAX_PARTICLES) {
        particlesRef.current.push(makeParticle(w, h));
        changed = true;
      }
      if (changed) forceRender((n) => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  // POST /api/otp/send. The backend records an Otp document against this
  // number; register-symbol later refuses (403) unless it finds a verified
  // one, so this step is what makes registration possible at all.
  const handleVerify = async () => {
    if (verifying || stage !== "phone") return;
    const digits = phoneNumber.replace(/\D/g, "");
    const [minLen, maxLen] = mobileDigitRange(dialCountry.iso);
    if (digits.length < minLen || digits.length > maxLen) return;
    setVerifying(true);
    setAuthError(null);
    setPhoneAlreadyRegistered(false);
    try {
      await GloobalApi.sendOtp(fullMobileNumber, "registration");
      flipTo("otp");
    } catch (err) {
      // 409 — the backend found an account on this number and deliberately
      // sent no OTP (see /api/otp/send). Registration cannot continue, so
      // this is shown inline on the phone card with a way straight into
      // login rather than as the generic error banner: the person's next
      // move is obvious and should be one tap, not a re-read of the form.
      if (err instanceof GloobalApiError && err.status === 409) {
        setPhoneAlreadyRegistered(true);
      } else {
        setAuthError(err.message);
      }
    } finally {
      setVerifying(false);
    }
  };
  // Switches the same phone number straight into the login flow. The
  // number is kept — it is the one thing already known to be correct.
  const handleSwitchToLogin = () => {
    setPhoneAlreadyRegistered(false);
    setAuthError(null);
    setShowLoginFace(true);
    setIsLoginAttempt(true);
    setLoginEntryMode("mobile");
    setLoginMobileBuffer(phoneNumber.replace(/\D/g, ""));
    setLoginMobileCountry(dialCountry);
    flipTo("secureId");
  };
  const [otpVerifying, setOtpVerifying] = useState19(false);
  // POST /api/otp/verify. On success the backend marks the OTP verified;
  // nothing is created yet — the account itself is written at the PIN step.
  const handleSubmitOtp = async () => {
    if (otp.length !== OTP_LENGTH2 || otpVerifying) return;
    setOtpVerifying(true);
    setAuthError(null);
    try {
      await GloobalApi.verifyOtp(fullMobileNumber, otp, "registration");
      flipTo("secureId");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setOtpVerifying(false);
    }
  };
  // The account's Gloobal ID changed server-side (Dashboard → Update
  // Gloobal ID → PATCH /api/profile/change-symbol-id succeeded). Every
  // copy of the old one has to follow it in the same breath: React state,
  // the persisted session, the local profile blob, and the biometric
  // gate's idea of who it is checking. Any one left behind points the app
  // at an ID the backend no longer has.
  const handleGloobalIdChanged = (newSymbolId) => {
    if (!newSymbolId) return;
    const updatedUser = Object.assign({}, registeredUser || {}, { symbolId: newSymbolId });
    setRegisteredUser(updatedUser);
    setSecureId(newSymbolId);
    GloobalApi.saveSession(updatedUser, phoneNumber);
    // Writes the new ID into the stored session — the single source every
    // screen reads through useCurrentSymbolId — and fires
    // gloobal:symbolIdChanged so anything already on screen re-renders
    // with it. Without the event the Receive QR, the share card, Personal
    // Details and the referral link would each keep whatever they last
    // rendered until a reload.
    gloobalSessionSetSymbolId(newSymbolId);
    gloobalSetBiometricSymbolId(newSymbolId);
    // Re-keyed rather than moved: the name and photo are looked up by
    // Gloobal ID, so under the old key they would simply stop being found.
    persistLocalProfile(newSymbolId, documentedName.trim(), profilePhoto);
  };
  const handleStartOver = () => {
    // Explicit sign-out: drop the remembered identity too, or the mount
    // effect restores it straight back to the lock screen.
    GloobalApi.clearSession();
    // The location fix this device captured belongs to whoever was signed
    // in when it was taken. Carrying it across a sign-out would attach one
    // person's whereabouts to another person's first payment.
    forgetPaymentLocation();
    // Same reasoning: the next person's first real arrival must not be
    // swallowed as "already notified".
    forgetPaymentNotifications();
    // Money state first, before any of the identity state below is torn down.
    // This ledger lives in a useRef in LedgerProvider and survives sign-out,
    // so without this the next account to sign in inherits this one's seeds —
    // and hydrateGrantsFromServer refuses to restore into a non-empty grant
    // list, so the server's real seeds for the new account were never fetched
    // in. My Assets kept showing the previous person's cashback, and the
    // PayLater limit derived from it kept extending their credit.
    resetForAccountSwitch();
    setRegisteredUser(null);
    setAuthError(null);
    // The previous account's verdict about its own balance. Carrying it
    // across a sign-out told the NEXT person "Balance unavailable" — or,
    // worse, "ready" — about an account this app had not read yet.
    setBalanceStatus("loading");
    hydratedForRef.current = null;
    lastHydratedIdRef.current = null;
    // Everything the previous identity left behind. The biometric gate in
    // particular has to forget who it was working for, or the next
    // person's first guarded action would be checked against the signed-
    // out account's passkey.
    gloobalSetBiometricSymbolId(null);
    setPhoneAlreadyRegistered(false);
    setLoginIdResolved(false);
    setLoginIdentifier("");
    setBiometricNotice(null);
    setDocumentedName("");
    setDocType(null);
    setProfilePhoto(G_LOGO_DATA_URI);
    setVerifying(false);
    setPhoneNumber("");
    setPhoneDialOpen(false);
    setShowLoginFace(false);
    setIsLoginAttempt(false);
    setLoginEntryMode("id");
    setLoginMobileBuffer("");
    setLoginMobileCountry(null);
    setShowLoginPicker(false);
    setLoginCountrySearch("");
    setSecureId("");
    setReferralCode("");
    setPin("");
    setOtp("123456");
    setLoginAuthPin("");
    setLoginBiometricScanning(false);
    flipTo("phone");
  };
  return <div
    ref={stageRef}
    style={{
      position: "fixed",
      inset: 0,
      width: "100%",
      height: "100%",
      background: "#ffffff",
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}
  >{particlesRef.current.map((p) => <div
    key={p.id}
    ref={(el) => {
      if (el) elsRef.current[p.id] = el;
      else delete elsRef.current[p.id];
    }}
    style={{
      position: "absolute",
      top: -(p.ph / 2),
      left: -(p.pw / 2),
      width: p.pw,
      height: p.ph,
      userSelect: "none",
      pointerEvents: "none",
      willChange: "transform, opacity",
      opacity: p.opacity
    }}
  ><FlagSignShape sign={p.sign} flag={p.flag} box={p.box} /></div>)}{
    /* Center focal circle — fills the previously-empty middle of
       this background. Outer wrapper is static (fixes true
       centering — an earlier version baked translate into the spin
       keyframe itself, which could drift). Center stays plain white;
       the boundary always has a subtle low-opacity colored glow, and
       tapping the circle boosts that same glow to a higher opacity
       briefly before it settles back down. Rotation shows as a
       subtle white shine sweeping around the ring. */
  }{SHOW_PHONE_HERO_CIRCLE && stage === "phone" && !phoneNumber && !phoneDialOpen && <button
    onClick={handleHeroCircleTap}
    aria-label="Gloobal ID"
    style={{
      position: "absolute",
      top: "38%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: 176,
      height: 176,
      borderRadius: "50%",
      background: "#fff",
      border: "none",
      padding: 0,
      cursor: "pointer",
      boxShadow: heroCircleTapped ? `0 0 0 1px rgba(0,0,0,0.04), 0 0 30px 8px ${heroCircleColors[0]}70, 0 0 55px 16px ${heroCircleColors[2]}55` : `0 0 0 1px rgba(0,0,0,0.04), 0 0 22px 4px ${heroCircleColors[0]}28, 0 0 40px 8px ${heroCircleColors[2]}1c`,
      transition: "box-shadow 0.4s ease",
      overflow: "hidden",
      zIndex: 0
    }}
  ><div
    style={{
      position: "absolute",
      inset: -20,
      background: "conic-gradient(rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 25deg, rgba(255,255,255,0) 70deg, rgba(255,255,255,0) 360deg)",
      animation: "pureSpin 4s linear infinite",
      pointerEvents: "none"
    }}
  /></button>}{
    /* Back — sits in the same top-left corner regardless of stage,
       separate from the flipping card itself so it never overlaps or
       shifts the card's own corner controls (eye toggles, flip icons).
       The Secure ID / Referral corner tab used to sit left-aligned here
       too and could collide with this button on shorter screens; it's
       now centered on the card instead, so the two can never overlap.
       Covers the steps that had no way back: registration's Secure ID
       (→ OTP), login's Secure ID (→ phone), and Referral (→ Secure ID). */
  }{(stage === "secureId" || stage === "referral") && <NavBackButton onClick={stage === "referral" ? requestBackFromReferral : requestBackFromSecureId} style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: "calc(18px + env(safe-area-inset-left, 0px))",
      zIndex: 25
     }} />}{
    /* Explain this screen — the mirror of the Back chevron above, in the
       opposite corner, on the two screens that ask for something the
       person has never seen before: twelve symbols off a pad with no
       letters on it, and somebody else's twelve with no statement of what
       handing it over does. Shown on Secure ID whether creating or
       logging in — the symbol glossary is what makes an existing ID
       readable too, not only a new one. Nothing else occupies this corner
       at screen level: the card's own controls (eye toggles, the
       flip-to-mobile button) live on the card, which starts ~74px lower. */
  }{(stage === "secureId" || stage === "referral") && <HelpCornerButton
    onClick={() => setHelpSheet(stage === "referral" ? "referral" : "symbols")}
    label={stage === "referral" ? "How the referral network works" : "What the Gloobal ID symbols mean"}
  />}{
    /* Mounted only while their own stage is active, so leaving the stage
       unmounts the sheet and useBackClose's cleanup pops its history
       entry — rather than leaving an open sheet, or a stranded back-stack
       entry, behind on a screen it does not belong to. */
  }{stage === "secureId" && <SymbolIdHelpSheet open={helpSheet === "symbols"} onClose={() => setHelpSheet(null)} />}{stage === "referral" && <ReferralHelpSheet open={helpSheet === "referral"} onClose={() => setHelpSheet(null)} />}{
    /* "Gloobal ID" wordmark — now shown on every early registration/
       login screen: phone entry, Secure ID (creating a new one,
       logging in with an existing one, or logging in by phone), and
       referral — not just the very first phone screen. */
  }{(stage === "phone" || stage === "secureId" || stage === "referral") && <div
    style={{
      position: "absolute",
      top: "calc(22px + env(safe-area-inset-top, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 20,
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: 0.5,
      color: T.ink,
      fontFamily: T.fontDisplay
    }}
  ><GloobalWordmark suffix=" ID" withSymbols /></div>}<div
    style={{
      position: "absolute",
      top: "calc(74px + env(safe-area-inset-top, 0px))",
      left: "50%",
      bottom: "6%",
      transform: "translateX(-50%)",
      // The card is still exactly 92% / 340px wide: the extra 48px here is
      // padding, not card. See the overflow note below for why it exists.
      width: "calc(92% + 48px)",
      maxWidth: 340 + 48,
      padding: "0 24px",
      boxSizing: "border-box",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      // No horizontal scrollbar, ever — this is where the dark line under
      // the symbol/digit row came from.
      //
      // This was `overflowY: "auto"` with overflow-x left at its `visible`
      // default, which CSS does not allow: when one axis is not `visible`,
      // the other computes to `auto`. So the column was silently
      // horizontally scrollable — and the cards inside deliberately hang
      // controls outside their own box, the flip-to-login /
      // flip-to-mobile button most of all at `right: -18`. Those 18px gave
      // the column a horizontal scroll range, and Chrome paints a scroll
      // range as a track: the dark line, on exactly the REGISTRATION and
      // LOGIN cards (the two with that button) and not on OTP, whose
      // controls all sit inside the card's width.
      //
      // Pinning overflow-x to hidden on its own would clip 18px off that
      // button. The 24px of horizontal padding above is what makes that
      // safe: the overhang now falls inside the column's own padding box
      // rather than past its edge, so there is no horizontal overflow left
      // to scroll and nothing gets cut. Vertical scrolling is kept —
      // the dial pad genuinely does not fit on a short screen, and
      // dropping it there would strand the card off the top.
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch"
    }}
  ><div style={{ perspective: 800, position: "relative", flexShrink: 0, maxWidth: "100%" }}><div
    style={{
      position: "relative",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      transform: flipping ? "rotateY(90deg)" : "rotateY(0deg)",
      transition: "transform 0.22s ease"
    }}
  >{
    /* The Secure ID / Referral card itself — unmoved, unchanged:
       same shadows, border radius, corner label, and counter as
       before. Just the card; the dial and button now live below
       it instead of inside it. */
  }<div
    style={{
      position: "relative",
      zIndex: 1,
      width: "100%",
      minHeight: stage === "phone" ? 96 : 100,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "18px 14px",
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxSizing: "border-box",
      overflow: "visible"
    }}
  >{
    /* Corner shine — soft, low-opacity colored glows at each
       corner, clipped to their own inset wrapper so the
       card's own overflow:visible (needed for the corner
       label/counter) stays untouched. Center stays plain
       white — this is decoration at the edges only. */
  }<div style={{ position: "absolute", inset: 0, borderRadius: T.radiusLg, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}><div style={{ position: "absolute", top: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[0]}22, transparent 70%)` }} /><div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[2]}22, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[3]}1c, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[1]}1c, transparent 70%)` }} /></div>{stage === "phone" && <PhoneConnector
    country={dialCountry}
    phoneNumber={phoneNumber}
    onOpenPicker={() => setShowPicker(true)}
    onOpenDial={() => setPhoneDialOpen(true)}
    dialOpen={phoneDialOpen}
    onActivate={handleVerify}
    verifying={verifying}
    showLogin={showLoginFace}
    onLoginTap={() => {
      setIsLoginAttempt(true);
      setLoginEntryMode("id");
      setLoginMobileBuffer("");
      setLoginMobileCountry(null);
      flipTo("secureId");
    }}
  />}{
    /* Number already has an account. Shown inside the card, under the
       number it is about, rather than in the root error banner: this
       is not a failure to retry, it is a fork in the flow, and the
       way out of it is the tap directly below the message. */
  }{stage === "phone" && phoneAlreadyRegistered && <div style={{ width: "100%", marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><span role="alert" style={{ fontSize: 12, fontWeight: 700, color: T.negative, textAlign: "center", lineHeight: 1.4 }}>
                  This number is already registered.
                </span><button
    onClick={handleSwitchToLogin}
    className="v2-tap"
    style={{
      border: "none",
      background: "none",
      padding: "4px 6px",
      color: T.accent,
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >
                  Log in instead →
                </button></div>}{
    /* Flip to log in — on the card's own boundary now, not on
       the call button, same treatment as the Secure ID card's
       flip icon. Keeps a slow, continuous spin on its own (not
       tied to being tapped) so it reads as "this can be flipped"
       at a glance instead of sitting there looking static. */
  }{stage === "phone" && <button
    onClick={() => {
      setShowLoginFace(true);
      setIsLoginAttempt(true);
      setLoginEntryMode("id");
      setLoginMobileBuffer("");
      setLoginMobileCountry(null);
      flipTo("secureId");
    }}
    aria-label="Flip to log in"
    className="v2-tap"
    style={{
      position: "absolute",
      top: -20,
      right: -18,
      width: 48,
      height: 48,
      borderRadius: "50%",
      border: `1.5px solid ${T.line}`,
      background: T.surface,
      color: T.accent,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowRaised,
      zIndex: 3
    }}
  ><RefreshCw6 size={22} style={{ animation: "iconAttention 2s linear infinite" }} /></button>}{stage === "phone" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard,
      minWidth: 44,
      textAlign: "center",
      whiteSpace: "nowrap"
    }}
  ><CyclingBadge words={["Registration", <GloobalWordmark key="g" withSymbols />, "Id"]} intervalMs={2600} /></span>}{stage === "secureId" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      transform: "none",
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard,
      minWidth: 44,
      textAlign: "center",
      whiteSpace: "nowrap"
    }}
  >{isLoginAttempt ? <CyclingBadge words={["Login", <GloobalWordmark key="g" withSymbols />, "Id"]} intervalMs={2600} /> : <CyclingBadge words={["Create", "Secure", <GloobalWordmark key="g" withSymbols />, "Id"]} intervalMs={2600} />}</span>}{stage === "referral" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      transform: "none",
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard,
      whiteSpace: "nowrap"
    }}
  >
                  Referral ID
                </span>}{stage === "otp" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard
    }}
  >
                  Verify OTP
                </span>}{
    /* Edit number — flips back to the phone step, same corner
       spot the flip-to-login icon uses on that step. */
  }{stage === "otp" && <button
    onClick={() => flipTo("phone")}
    aria-label="Edit phone number"
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 16,
      background: "none",
      border: "none",
      color: T.accent2,
      fontSize: 10.5,
      fontWeight: 700,
      cursor: "pointer",
      padding: "3px 4px"
    }}
  >
                  Edit number
                </button>}{
    /* Eye toggle: mask/reveal the code — same on both
       registration and login, but only relevant in ID mode.
       Shifted left of its usual spot on login so it doesn't
       collide with the bigger flip-to-mobile icon in the
       top-right corner. */
  }{
    /* Eye toggle for OTP — shifted left of "Edit number" so the
       two controls don't collide in the same top-right corner. */
  }{stage === "otp" && <button
    onClick={() => setOtpRevealed((v) => !v)}
    aria-label={otpRevealed ? "Hide OTP" : "Show OTP"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 90,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 2
    }}
  ><MaskEyeIcon open={otpRevealed} color={T.inkSoft} /></button>}{stage === "secureId" && (!isLoginAttempt || loginEntryMode === "id") && <button
    onClick={() => setSecureIdRevealed((v) => !v)}
    aria-label={secureIdRevealed ? "Hide Secure ID" : "Show Secure ID"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: isLoginAttempt ? 68 : 16,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 2
    }}
  ><MaskEyeIcon open={secureIdRevealed} color={T.inkSoft} /></button>}{
    /* Eye toggle for the mobile login number — same boundary
       spot the Secure ID eye uses in ID mode (right: 68, clear
       of the bigger flip-to-mobile icon in the corner). */
  }{stage === "secureId" && isLoginAttempt && loginEntryMode === "mobile" && <button
    onClick={() => setLoginMobileRevealed((v) => !v)}
    aria-label={loginMobileRevealed ? "Hide mobile number" : "Show mobile number"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 68,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 2
    }}
  ><MaskEyeIcon open={loginMobileRevealed} color={T.inkSoft} /></button>}{
    /* Flip to mobile — login only. Fixed to the card's top-right
       corner (not tied to the card's height, which changes
       between ID and mobile content) so it's always in the same
       reachable spot in both modes. Twice the size of the eye
       toggle, and visibly rotates on tap. */
  }{stage === "secureId" && isLoginAttempt && <button
    onClick={() => setLoginEntryMode((m) => m === "id" ? "mobile" : "id")}
    aria-label={`Switch to ${loginEntryMode === "id" ? "mobile number" : "Gloobal ID"}`}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -20,
      right: -18,
      width: 48,
      height: 48,
      borderRadius: "50%",
      border: `1.5px solid ${T.line}`,
      background: T.surface,
      color: T.accent,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowRaised,
      zIndex: 3
    }}
  ><RefreshCw6
    size={22}
    style={{
      transform: loginEntryMode === "mobile" ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
    }}
  /></button>}{stage === "referral" && <button
    onClick={() => setReferralRevealed((v) => !v)}
    aria-label={referralRevealed ? "Hide Referral ID" : "Show Referral ID"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 16,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard
    }}
  ><MaskEyeIcon open={referralRevealed} color={T.inkSoft} /></button>}{stage === "secureId" && (!isLoginAttempt || loginEntryMode === "id") && <SymbolChipRow length={SECURE_ID_LENGTH} value={secureId} masked={!secureIdRevealed} />}{stage === "secureId" && isLoginAttempt && loginEntryMode === "mobile" && <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", gap: 10 }}><button
    onClick={() => setShowLoginPicker(true)}
    aria-label={`Country: ${effectiveLoginCountry.name}. Tap to change`}
    style={{ flexShrink: 0, width: 46, height: 40, borderRadius: 13, border: `1px solid ${T.line}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
  ><FlagEmoji flag={effectiveLoginCountry.flag} width={38} height={32} radius={6} dropShadow="drop-shadow(0 4px 10px rgba(76,29,149,0.18))" /></button>{
    /* Masked by default, revealed with the eye toggle that
       now sits on the card's boundary (top-right corner)
       instead of inline here — same spot the Secure ID eye
       uses in ID mode. */
  }<div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "9px 13px" }}><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, letterSpacing: loginMobileRevealed ? 0 : 2, color: loginMobileBuffer ? T.ink : T.inkFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loginMobileBuffer ? loginMobileRevealed ? loginMobileBuffer.replace(/(\d{3})(?=\d)/g, "$1 ") : loginMobileBuffer.replace(/\d/g, "\u2022").replace(/(.{3})(?=.)/g, "$1 ") : "Mobile number"}</span></div></div>}{stage === "referral" && <SymbolChipRow length={REFERRAL_LENGTH} value={referralCode} masked={!referralRevealed} />}{stage === "otp" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, textAlign: "center" }}>
                    Enter the code sent to {dialCountry.dialCode} {phoneNumber}</span><SymbolChipRow length={OTP_LENGTH2} value={otp} masked={!otpRevealed} boxSize={34} justify="center" /></div>}</div>{
    /* Symbol dial pad — same compact grid-button pattern as
       PhoneDialPad, sized down so the card, dial, and button all
       stay fully visible together on one screen. */
  }{stage === "secureId" && (!isLoginAttempt || loginEntryMode === "id") && <div style={{ marginTop: 32, position: "relative", zIndex: 1, width: "100%" }}><SymbolDialPad value={secureId} onChange={setSecureId} length={SECURE_ID_LENGTH} /></div>}{
    /* Two ready-made IDs — creation only, never shown while
       logging in, since login needs the person's existing ID,
       not a fresh suggestion.
       (This comment has always said "Two"; the row actually
       rendered one. It renders two now, so the two finally agree.
       Someone meeting the symbol alphabet for the first time has no
       basis on which to judge a single arbitrary string — a pair
       side by side is a choice they can actually make. The Update
       Gloobal ID screen still passes no count and still gets one:
       replacing an ID you already have is a different, more
       considered decision.) */
  }{stage === "secureId" && !isLoginAttempt && <SuggestedIdRow id={suggestedRegId} onPick={setSecureId} count={2} />}{
    /* Login only: proof the ID resolves to a real account, shown before
       the PIN screen rather than after a sign-in that would have failed
       for a reason the person could not see. */
  }{stage === "secureId" && isLoginAttempt && loginEntryMode === "id" && loginIdResolved && <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 12 }}><span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 12px",
      borderRadius: 999,
      background: T.accentSoft,
      border: `1px solid ${T.line}`,
      color: T.positive,
      fontSize: 11.5,
      fontWeight: 800
    }}
  >
                  ✓ Account found
                </span></div>}{stage === "secureId" && isLoginAttempt && loginEntryMode === "mobile" && <div style={{ marginTop: 28, position: "relative", zIndex: 1, width: "100%" }}><PhoneDialPad
    value={loginMobileBuffer}
    onChange={setLoginMobileBuffer}
    minLength={loginMinLen}
    maxLength={loginMaxLen}
    onSubmit={handleSubmitSecureId}
  /></div>}{stage === "referral" && <div style={{ marginTop: 32, position: "relative", zIndex: 1, width: "100%" }}><SymbolDialPad value={referralCode} onChange={setReferralCode} length={REFERRAL_LENGTH} /></div>}{stage === "phone" && phoneDialOpen && <div style={{ marginTop: 28, position: "relative", zIndex: 1, width: "100%" }}><PhoneDialPad
    value={phoneNumber}
    onChange={(next) => {
      // Editing the number retracts the "already registered" verdict —
      // it was about the previous digits, not these.
      setPhoneAlreadyRegistered(false);
      setPhoneNumber(next);
    }}
    minLength={mobileDigitRange(dialCountry.iso)[0]}
    maxLength={mobileDigitRange(dialCountry.iso)[1]}
    onSubmit={handleVerify}
  /></div>}{
    /* OTP dial pad — the numeric code is 6 digits, entered with
       the exact same dial pad as the mobile number step, not the
       symbol dial used for the 12-character Secure/Referral ID. */
  }{stage === "otp" && <div style={{ marginTop: 28, position: "relative", zIndex: 1, width: "100%" }}><PhoneDialPad value={otp} onChange={setOtp} minLength={OTP_LENGTH2} maxLength={OTP_LENGTH2} onSubmit={handleSubmitOtp} processing={otpVerifying} /></div>}{stage === "secureId" && !isLoginAttempt && <div style={{ marginTop: 20 }}><SubmitButton
    onClick={handleSubmitSecureId}
    disabled={secureId.length !== SECURE_ID_LENGTH || authBusy}
    label={authBusy ? "Checking…" : "Submit"}
  /></div>}{stage === "secureId" && isLoginAttempt && loginEntryMode === "id" && <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}><CircularInButton
    onClick={handleSubmitSecureId}
    disabled={secureId.length !== SECURE_ID_LENGTH || authBusy}
    size={44}
  /></div>}{stage === "referral" && <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center" }}><SubmitButton
    onClick={handleSubmitReferral}
    disabled={referralCode.length !== REFERRAL_LENGTH || authBusy}
    label={authBusy ? "Checking…" : void 0}
  /><button
    onClick={() => flipTo("profile")}
    style={{
      marginTop: 10,
      border: "none",
      background: "none",
      color: T.accent2,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      padding: "6px 8px"
    }}
  >
                  Skip for now
                </button></div>}{stage === "otp" && <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center" }}><button
    onClick={() => setOtp("")}
    style={{
      border: "none",
      background: "none",
      color: T.accent2,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      padding: "6px 8px"
    }}
  >
                  Resend code
                </button></div>}</div></div></div>{stage === "phone" && !phoneDialOpen && <div style={{ position: "absolute", left: "50%", bottom: "3%", transform: "translateX(-50%)", zIndex: 20, width: "100%", padding: "0 16px", display: "flex", justifyContent: "center" }}><span
    style={{
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.4,
      color: T.inkFaint,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "100%"
    }}
  >
            Cashless · Taxless · Borderless · Limitless
          </span></div>}{stage === "permissions" && <PermissionsGateScreen onContinue={handleContinueFromPermissionsGate} />}{stage === "pin" && <PinScreen
    value={pin}
    length={PIN_LENGTH}
    onChange={setPin}
    onSubmit={handleSubmitPin}
    onBack={requestBackFromPin}
    revealed={pinRevealed}
    onToggleReveal={() => setPinRevealed((v) => !v)}
  />}{stage === "biometric" && <BiometricVerifyScreen
    // No back chevron: this step is terminal (see
    // requestBackFromRegBiometric). A control that cannot go anywhere is
    // worse than no control.
    onBack={null}
    onVerify={handleRegBiometricVerify}
    scanning={regBiometricScanning}
    notice={biometricNotice}
    // The account and its PIN both exist by this point, so declining is a
    // real choice rather than an abandoned registration.
    onSkip={handleSkipRegBiometric}
    skipLabel="Set this up later"
  />}{stage === "profile" && <ProfileSetupScreen
    onBack={requestBackFromProfile}
    onSubmit={handleSubmitProfile}
    photo={profilePhoto}
    onChangePhoto={setProfilePhoto}
    docType={docType}
    onSelectDocType={setDocType}
    name={documentedName}
    onChangeName={setDocumentedName}
  />}{stage === "loginAuth" && <LoginAuthScreen
    value={loginAuthPin}
    length={PIN_LENGTH}
    onChange={setLoginAuthPin}
    onSubmit={handleSubmitLoginAuth}
    onBack={requestBackFromLoginAuth}
    revealed={loginAuthRevealed}
    onToggleReveal={() => setLoginAuthRevealed((v) => !v)}
  />}{stage === "loginBiometric" && <BiometricVerifyScreen
    onBack={requestBackFromLoginBiometric}
    onVerify={handleLoginBiometricVerify}
    scanning={loginBiometricScanning}
    notice={biometricNotice}
    // No skip once a passkey exists — that is what makes this mandatory
    // on every re-login rather than a suggestion. An account with nothing
    // enrolled is offered setup here instead, and may defer it.
    onSkip={gloobalBiometricEnrolled() ? null : handleSkipLoginBiometric}
    skipLabel="Not now"
  />}{stage === "dashboard" && <Dashboard_default
    dialCountry={dialCountry}
    onLogout={handleStartOver}
    onOpenSend={(opts) => {
      setActiveScreen("send");
    }}
    onOpenBank={() => setActiveScreen("bank")}
    onOpenCoverage={() => setActiveScreen("coverage")}
    onOpenScan={() => setShowScanScreen(true)}
    myGloobalId={secureId}
    creatorId={creatorId}
    myName={documentedName}
    openHistoryDirection={dashboardHistoryDirection}
    onConsumeOpenHistory={() => setDashboardHistoryDirection(null)}
    deepLinkTarget={dashboardDeepLink}
    onConsumeDeepLink={() => setDashboardDeepLink(null)}
    pendingOpenMyShare={pendingOpenMyShare}
    onConsumePendingMyShare={() => setPendingOpenMyShare(false)}
    profilePhoto={profilePhoto}
    onChangeProfilePhoto={handleChangeProfilePhoto}
    // The account's own number, for Personal Details. Held in this session
    // since registration and restored with the session on login.
    mobileNumber={fullMobileNumber}
    // Every Gloobal ID this account has ever used, from the server. The
    // Update History screen used to show only renames made in THIS session,
    // so it was empty again after every login — see idUpdateHistory there.
    idHistory={(registeredUser && registeredUser.symbolIdHistory) || []}
    sendHistory={sendMoneyHistory}
    receivedHistory={receivedMoneyHistory}
    bankBalance={bankBalance}
    balanceStatus={balanceStatus}
    balanceUnavailable={balanceStatus === "error"}
    onRefreshAccount={handleRefreshAccount}
    assetSeeds={assetSeeds}
    onPayBusiness={handlePayBusiness}
    paylaterHistory={paylaterHistory}
    accountCreatedAt={accountCreatedAt}
    onSettleAssetsToBank={handleSettleAssetsToBank}
    onSettleReferralToBank={handleSettleReferralToBank}
    essentialsIHaveEnough={essentialsIHaveEnough}
    onToggleEssentialsIHaveEnough={handleToggleEssentialsIHaveEnough}
    onShareRoleChange={setActiveShareRole}
    onMyShareRateChange={setActiveMyShareRate}
    onGloobalIdChange={handleGloobalIdChanged}
  />}{
    /* Scan to pay — real decode/lock logic, simulated camera input
       since there's no actual camera access here. Tapping the demo
       target is standing in for "the camera detected this code." */
  }{showScanScreen && (() => {
    // Leaving the scanner abandons whatever was pending on it, PIN included.
    // One definition, used by the back button AND by Send — two copies of a
    // teardown this security-relevant is two chances to forget the PIN line.
    const closeScanScreen = () => {
      scanVerifiedPinRef.current = null;
      setShowScanScreen(false);
      setScanPendingPayment(null);
      setScanError(null);
      setScanCameraAccessGranted(false);
      setScanScreenTab("scan");
    };
    // The camera is the screen, not a picture on it, whenever it is actually
    // scanning — not while showing My Code, not before permission, and not
    // once a code has been read and there is a payment card to look at.
    const scanLive = scanScreenTab === "scan" && scanCameraAccessGranted && !scanPendingPayment;
    // Over live video every control needs its own contrast; on the light
    // page they keep the app's normal colours.
    const overVideoInk = scanLive ? "#fff" : T.inkFaint;
    return <div style={{ position: "fixed", inset: 0, zIndex: 400, background: scanLive ? "#000" : T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>{!scanLive && <DashboardAmbientBg />}{
    /* The camera layer. A direct child of the overlay rather than an item
       in the column below, which is what lets it run edge to edge behind
       the back button and the tabs instead of stopping under them. */
  }{scanLive && <QrCameraScanner
    fullScreen
    active={showScanScreen}
    paused={scanResolving}
    onDetected={handleQrScanned}
  />}<div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={closeScanScreen} />{
    /* No title. It said "Scan to pay" directly above a two-button strip
       whose first button says "Scan" — the same word twice in 40 pixels —
       and over a full-screen camera a heading is just something in the way
       of the thing it is describing. */
  }</div>{
    /* Scan / My Code — same two-way pattern as any scanner: scan
       someone else's code, or show your own for them to scan.
       "My Code" shows a real, separate ID per role — Personal mode
       shares secureId (the same one the Receive screen uses),
       Creator mode shares creatorId — never the same code for both,
       since scanning them means different things (a plain transfer
       vs. one that carries Creator Share). */
  }<div style={{ position: "relative", zIndex: 1, display: "flex", gap: 8, padding: "0 18px 14px", flexShrink: 0 }}>{[
    { key: "scan", label: "Scan" },
    { key: "myCode", label: "My Code" }
  ].map((tab) => <button
    key={tab.key}
    onClick={() => setScanScreenTab(tab.key)}
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "10px 0",
      // Over live video the inactive chip needs its own ground: T.surfaceAlt
      // is a near-white that vanishes on a bright frame and glares on a dark
      // one. A translucent black chip reads on both.
      background: scanScreenTab === tab.key ? T.gradButton : scanLive ? "rgba(0,0,0,0.45)" : T.surfaceAlt,
      color: scanScreenTab === tab.key ? "#fff" : overVideoInk,
      backdropFilter: scanLive && scanScreenTab !== tab.key ? "blur(6px)" : undefined,
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
      transition: "background 0.18s ease, color 0.18s ease"
    }}
  >{tab.label}</button>)}</div>{scanScreenTab === "myCode" ? <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", gap: 16 }}><div
    style={{
      // Exactly the Receive sheet's frame: a bare relative box that the
      // panel sizes, and nothing else.
      //
      // This used to add a tinted pad — borderRadius 28, padding 16 — around
      // the shared panel. Sixteen pixels a side on top of a 324px panel is
      // 356px, and inside this column's own 24px side padding that needs
      // 404px of width. A 390px phone does not have it, so the box ran off
      // the screen and took the Creator Share badge with it: the screenshot
      // shows it clipped to "1.7".
      //
      // The panel already carries its own white card, border and quiet zone.
      // A second frame around it was never adding anything the first frame
      // was not already doing — it was the last piece of the per-screen
      // framing that GloobalQrPanel exists to have removed.
      position: "relative",
      display: "flex",
      justifyContent: "center"
    }}
  ><GloobalQrPanel code={encodeGloobalQR({ gloobalId: activeShareRole === "merchant" ? creatorId : secureId, amountCents: requestCents })} />{
    /* Same Creator Share edge badge the Receive screen's QR shows —
       one consistent "here's my share rate" affordance wherever your
       code is displayed. Straddles the TOP edge, centred: see the
       matching comment on the Receive sheet for why it moved off the
       right edge. */
  }<div style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%)", perspective: 200 }}><button
    onClick={() => {
      setShowScanScreen(false);
      setScanScreenTab("scan");
      setPendingOpenMyShare(true);
    }}
    aria-label={`My Share, currently ${activeMyShareRate}%`}
    className="v2-tap"
    style={{ display: "flex", border: "none", background: "none", padding: 0, cursor: "pointer" }}
  ><span
    style={{
      position: "relative",
      width: 40,
      height: 40,
      borderRadius: "50%",
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
      transform: scanShareIconFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", background: T.gradButton, boxShadow: "0 4px 12px rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}><PieChart size={17} color="#fff" /></span><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: T.gradButton,
      boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff" }}>{activeMyShareRate}%</span></span></span></button></div></div><div style={{ textAlign: "center" }}><div style={{ fontSize: 13, color: T.inkFaint, marginBottom: 6 }}>{activeShareRole === "merchant" ? "Your Creator ID" : "Your Gloobal ID"}</div><ColoredGloobalId id={activeShareRole === "merchant" ? creatorId : secureId} /></div>{
    /* Request — turns this same code into a payment request by
       embedding an amount (encodeGloobalQR already supports
       amountCents; the scanning side already renders it as "Payment
       request" with a Pay button instead of a plain Confirm — this
       is just the missing UI to set that amount from here). Covers
       generate (type an amount, the code above updates immediately)
       and receive (share/show that same code); nothing here sends a
       request to a specific person — that's Send Money, a different
       screen, one screen already covers "pay someone", not "ask
       someone to pay me". */
  }<div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>{requestCents > 0 && <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: T.positive }}>
        Requesting {CURRENCY_SYMBOL[COUNTRY_CURRENCY[dialCountry.iso] || "USD"] || "$"}{(requestCents / 100).toFixed(2)}
      </div>}{requestOpen ? <div style={{ display: "flex", gap: 8 }}><input
    value={requestAmount}
    onChange={(e) => {
      const v = e.target.value;
      if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setRequestAmount(v);
    }}
    placeholder="Amount to request"
    inputMode="decimal"
    autoFocus
    style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 14px", fontSize: 14, fontWeight: 700, color: T.ink, background: T.surface, outline: "none" }}
  /><button
    onClick={() => setRequestOpen(false)}
    className="v2-tap"
    style={{ border: "none", borderRadius: T.radiusMd, padding: "0 20px", background: T.gradButton, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
  >
            Done
          </button></div> : <button
    onClick={() => setRequestOpen(true)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", border: `1.5px solid ${T.line}`, borderRadius: 999, padding: "12px 0", background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  ><ArrowDownLeft2 size={15} color={T.accent} />{requestCents > 0 ? "Change requested amount" : "Request an amount"}</button>}{requestCents > 0 && !requestOpen && <button
    onClick={() => {
      setRequestAmount("");
      setRequestOpen(false);
    }}
    className="v2-tap"
    style={{ border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 700, color: T.inkFaint, cursor: "pointer", alignSelf: "center" }}
  >
          Clear request
        </button>}</div></div> : <>{!scanCameraAccessGranted ? (
    // Matches the reference screenshot's real permission-request
    // pattern. There's no actual camera API in this environment,
    // so "Allow Access" can't request a genuine permission — it
    // moves into the same simulated-scan flow below, honestly,
    // rather than pretending to grant something real.
    <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "10px 24px 0" }}>{
    /* The "Scan any QR code" headline is gone. The screen below it already
       shows a scanner icon the size of a saucer and a button that says
       Allow Access — the heading restated the tab that got you here. */
  }<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, paddingBottom: 60 }}><div
      style={{
        width: 200,
        height: 200,
        borderRadius: "50%",
        background: `${scanHeroColor}1A`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.4s ease"
      }}
    ><ScannerIcon size={72} animated /></div><div style={{ textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginBottom: 8 }}>
                    Allow Camera Access
                  </div><div style={{ fontSize: 13, color: T.inkFaint, lineHeight: 1.5, maxWidth: 260 }}>
                    We need access to your camera to scan QR codes. Your browser will ask you to confirm.
                  </div></div><button
      onClick={() => setScanCameraAccessGranted(true)}
      className="v2-tap"
      style={{
        border: "none",
        borderRadius: 999,
        padding: "14px 40px",
        background: T.gradButton,
        color: "#fff",
        fontSize: 14.5,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(124,58,237,0.28)"
      }}
    >
                  Allow Access
                </button><button
      onClick={() => {
        // Opens the picker. This used to set scanCameraAccessGranted and
        // nothing else — a control labelled "Upload from gallery" that
        // revealed the camera view instead, decoding nothing, leaving no
        // route in for a device whose camera is blocked or for a code that
        // arrived as a screenshot.
        setScanError(null);
        if (scanGalleryInputRef.current) scanGalleryInputRef.current.click();
      }}
      className="v2-tap"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "none",
        background: "none",
        color: T.accent,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer"
      }}
    ><ImageIcon size={17} />
                  Upload from gallery
                </button>{scanError && <div
      role="alert"
      style={{ fontSize: 12.5, color: T.negative, textAlign: "center", fontWeight: 700, maxWidth: 260, lineHeight: 1.45 }}
    >{scanError}</div>}<input
      ref={scanGalleryInputRef}
      type="file"
      accept="image/*"
      onChange={handleScanGalleryFile}
      style={{ display: "none" }}
    /></div><div style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }}>{
    /* Was a div reading "Enter Mobile Number to Pay" that was styled to
       look like a text field but was not one — no input, no handler, no
       tap target. It could not be typed into and it did nothing, which is
       the worst kind of control: it advertised a way to pay someone
       without a code and then refused to take it.

       This is that promise kept. It opens the real Send flow, where a
       number or a Gloobal ID can actually be entered. */
  }<ScanSendButton onClick={() => { closeScanScreen(); setActiveScreen("send"); }} /></div></div>
  ) : <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: scanLive ? "flex-end" : "center", padding: "0 24px calc(26px + env(safe-area-inset-bottom, 0px))", gap: 16 }}>{!scanPendingPayment ? <>{
    /* The scanner itself is no longer here — it is a full-bleed layer on
       the overlay above, behind these controls. What is left is what has
       to sit ON the video: what the camera is doing, and the way out. */
  }<div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 1.5, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{scanResolving ? "Looking this ID up\u2026" : "Hold a Gloobal QR code inside the frame."}</div>{scanError && <div style={{ fontSize: 12.5, color: "#fff", background: T.negative, borderRadius: 12, padding: "8px 14px", textAlign: "center", fontWeight: 700 }}>{scanError}</div>}<ScanSendButton overVideo onClick={() => { closeScanScreen(); setActiveScreen("send"); }} /></> : <div style={{ width: "100%", maxWidth: 340, borderRadius: T.radiusXl, background: T.surface, boxShadow: T.shadowCard, border: `1px solid ${T.line}`, padding: "28px 24px", textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>{scanPendingPayment.amountCents > 0 ? "Payment request" : "Gloobal ID"}</div>{scanPendingPayment.amountCents > 0 && (() => {
    const asked = scanPendingPayment.amountCents / 100;
    const askedCode = scanRequestCurrency(scanPendingPayment);
    const mine = COUNTRY_CURRENCY[dialCountry.iso] || "USD";
    // What it will cost from this account. An estimate, and labelled as one:
    // the server recomputes the corridor at payment time and its figure is
    // what moves money. Shown only when the currencies differ.
    const inMine = askedCode !== mine ? convert(asked, askedCode, mine) : null;
    return <><div style={{ fontSize: 32, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginBottom: Number.isFinite(inMine) ? 4 : 14 }}>{scanRequestSymbol(scanPendingPayment)}{fmt(asked, askedCode)}</div>{Number.isFinite(inMine) && <div style={{ fontSize: 13, fontWeight: 700, color: T.inkFaint, marginBottom: 14 }}>
                    {"\u2248 "}{CURRENCY_SYMBOL[mine] || `${mine} `}{fmt(inMine, mine)} from your balance
                  </div>}</>;
  })()}{scanPendingPayment.recipientName && <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{scanPendingPayment.recipientName}</div>}<div style={{ fontSize: 13, color: T.inkSoft, marginBottom: scanPendingPayment.registered ? 20 : 8 }}><ColoredGloobalId id={scanPendingPayment.gloobalId} /></div>{
    /* Said plainly rather than left to be discovered after paying:
       nobody is registered under this ID, so there is no account on
       the other side for the backend to credit and the payment runs
       against the local ledger only. */
  }{!scanPendingPayment.registered && <div style={{ fontSize: 11.5, fontWeight: 700, color: T.negative, marginBottom: 20, lineHeight: 1.45 }}>
                    No Gloobal account is registered under this ID.
                  </div>}<button
    onClick={() => {
      if (scanPendingPayment.amountCents > 0) {
        setScanPayOptionsOpen(true);
      } else {
        setShowScanBiometric(true);
      }
    }}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "14px 0",
      background: T.gradButton,
      color: "#fff",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >
                  Verify & {scanPendingPayment.amountCents > 0 ? "Pay" : "Confirm"}</button>{
    /* Only for a code that names somebody real and asks for nothing:
       an unregistered ID has no account to send to, and a code with
       an amount on it is already a bill to settle above. */
  }{scanPendingPayment.registered && scanPendingPayment.amountCents === 0 && <button
    onClick={handleSendToScanned}
    className="v2-tap"
    style={{
      width: "100%",
      marginTop: 10,
      borderRadius: T.radiusMd,
      padding: "13px 0",
      border: `1.5px solid ${T.accent}`,
      background: "none",
      color: T.accent,
      fontSize: 13.5,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >
                  Send money to this ID</button>}<button
    onClick={() => setScanPendingPayment(null)}
    className="v2-tap"
    style={{ width: "100%", border: "none", background: "none", padding: "12px 0 0", fontSize: 12.5, color: T.inkFaint, cursor: "pointer" }}
  >
                  Cancel
                </button></div>}</div>}</>}</div>;
  })()}<PayOptionsSheet
    open={scanPayOptionsOpen}
    onClose={() => setScanPayOptionsOpen(false)}
    onChoose={(label) => {
      // Same single fact as the Dashboard's own pay sheet \u2014 see
      // deriveCapabilityStates. Asserted here independently before, which
      // is how "Coin isn't live" and Coin's four ticked services coexisted.
      const coinPayable = deriveCapabilityStates({ hasOpenedGloobalBank: true }).gcoin.payments;
      if (label === "Gloobal Coin" && !coinPayable) {
        showToast("Paying with Gloobal Coin isn't wired to this flow yet \u2014 paying via Gloobal Bank instead");
      }
      setScanPayMethod(label === "Gloobal Coin" && !coinPayable ? null : label);
      setScanPayOptionsOpen(false);
      setScanPayPinOpen(true);
    }}
  /><LocationRequiredModal
    open={Boolean(locationGate)}
    reason={locationGate && locationGate.reason}
    busy={locationGateBusy}
    onRetry={handleLocationGateRetry}
    // Dismissing IS cancelling the payment — nothing was posted, so there
    // is nothing to undo, and the modal only ever appears in place of a
    // payment that did not happen.
    onClose={() => setLocationGate(null)}
  /><PayPinModal
    open={scanPayPinOpen}
    onClose={() => {
      // Backing out of the PIN abandons the payment, so the PIN it would have
      // authorised must not survive to a later attempt that passed no check.
      scanVerifiedPinRef.current = null;
      setScanPayPinOpen(false);
    }}
    // Same currency as the card that led here - a PIN screen quoting a
    // different figure from the one just confirmed is how a person approves
    // an amount they did not read.
    amountLabel={scanPendingPayment ? `\u2212${scanRequestSymbol(scanPendingPayment)}${fmt(scanPendingPayment.amountCents / 100, scanRequestCurrency(scanPendingPayment))}` : null}
    onVerified={(verifiedPin) => {
      scanVerifiedPinRef.current = verifiedPin || null;
      setScanPayPinOpen(false);
      setShowScanBiometric(true);
    }}
  />{showScanBiometric && <BiometricVerifyScreen
    onBack={() => setShowScanBiometric(false)}
    onVerify={handleScanBiometricVerify}
    scanning={scanBiometricScanning}
  />}{activeScreen === "send" && <div style={{ position: "fixed", inset: 0, zIndex: 190, overflowY: "auto", WebkitOverflowScrolling: "touch" }}><SendMoney_default
    onClose={() => {
      setSendPrefillReceiver(null);
      requestCloseActiveScreen();
    }}
    sender={{ ...dialCountry, phoneNumber }}
    prefillReceiver={sendPrefillReceiver}
    history={sendMoneyHistory}
    onSendComplete={handleSendMoneyComplete}
    onExecuteTransaction={handleExecuteTransaction}
    onRemoteSend={handleRemoteSend}
    onOpenPaidHistory={() => {
      requestCloseActiveScreen();
      setDashboardHistoryDirection("sending");
    }}
  /></div>}{activeScreen === "bank" && <ScreenErrorBoundary name="Add bank" onClose={requestCloseActiveScreen}><AddBankScreen onClose={requestCloseActiveScreen} country={dialCountry} /></ScreenErrorBoundary>}{activeScreen === "coverage" && <ScreenErrorBoundary name="Gloobal Coverage" onClose={requestCloseActiveScreen}><GloobalCoverageScreen
    onClose={requestCloseActiveScreen}
    dialCountry={dialCountry}
    sendHistory={sendMoneyHistory}
    isFullyRegistered={stage === "dashboard"}
    onOpenMyShare={() => {
      requestCloseActiveScreen();
      setPendingOpenMyShare(true);
    }}
  /></ScreenErrorBoundary>}{
    /* Backend errors, shown over every stage — the PIN and login screens
       are their own full-screen overlays, so an in-card banner would be
       invisible on exactly the steps most likely to fail. The backend's
       own message is surfaced as-is ("PIN must be 4 to 6 digits",
       "Please verify OTP before registration", "Account locked"), since
       it is already more specific than anything generic here. */
  }{authError && <div
    role="alert"
    onClick={() => setAuthError(null)}
    style={{
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
      zIndex: 999,
      width: "calc(100% - 40px)",
      maxWidth: 340,
      padding: "12px 16px",
      borderRadius: 14,
      background: "#FEF2F2",
      border: "1px solid rgba(220,38,38,0.3)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
      color: "#B91C1C",
      fontSize: 12.5,
      fontWeight: 600,
      lineHeight: 1.45,
      textAlign: "center",
      cursor: "pointer"
    }}
  >{authError}</div>}{
    /* Sits at the root so it can cover any screen a guarded action was
       started from — Send Money, the Dashboard sheets, Scan & Pay — not
       just the auth flow. */
  }<BiometricPinFallbackModal
    open={Boolean(pinFallbackRequest)}
    symbolId={(registeredUser && registeredUser.symbolId) || secureId}
    reason={pinFallbackRequest && pinFallbackRequest.reason}
    onResolve={resolvePinFallback}
  />{showDiagnostics && <DiagnosticsScreen onClose={closeDiagnostics} />}{showPicker && <CountryPickerScreen
    topCountries={TOP_COUNTRIES}
    countries={ALL_COUNTRIES}
    search={countrySearch}
    onSearch={setCountrySearch}
    selectedIso={dialCountry.iso}
    onSelect={(c) => {
      setDialCountry(c);
      setShowPicker(false);
      setCountrySearch("");
    }}
    onClose={() => {
      setShowPicker(false);
      setCountrySearch("");
    }}
  />}{showLoginPicker && <CountryPickerScreen
    topCountries={TOP_COUNTRIES}
    countries={ALL_COUNTRIES}
    search={loginCountrySearch}
    onSearch={setLoginCountrySearch}
    selectedIso={(loginMobileCountry || dialCountry).iso}
    onSelect={(c) => {
      setLoginMobileCountry(c);
      setLoginMobileBuffer("");
      setShowLoginPicker(false);
      setLoginCountrySearch("");
    }}
    onClose={() => {
      setShowLoginPicker(false);
      setLoginCountrySearch("");
    }}
  />}<style>{`
        /* Space Grotesk has no 800 face — asking for one here got the
           whole weight dropped and left T.fontDisplay's 800 rendering as
           700. Inter keeps its 800: that is the weight the GLOOBAL
           wordmark (T.fontWordmark) is built on. index.html carries the
           same two families as a <link>, which is what actually loads
           them on first paint; this @import is the fallback for contexts
           that render this component without that shell. */
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes phoneFlipPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes badgePop { from { transform: translateY(-3px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes iconAttention { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .phone-flip-btn { animation: phoneFlipPop 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
        /* Ambient dashboard motion \u2014 floating financial symbols, drifting
           dots, and slow geometric outlines. Transform/opacity only, so
           these stay on the compositor thread. */
        @keyframes finDrift {
          0% { transform: translate3d(0, 0, 0) rotate(var(--r0)); opacity: 0; }
          12% { opacity: var(--peak-op); }
          88% { opacity: var(--peak-op); }
          100% { transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--r1)); opacity: 0; }
        }
        @keyframes finDotPulse {
          0%, 100% { transform: translate3d(0, 0, 0) scale(0.7); opacity: 0; }
          50% { transform: translate3d(0, -6px, 0) scale(1); opacity: var(--peak-op); }
        }
        @keyframes finGlow {
          0%, 100% { filter: none; }
          50% { filter: drop-shadow(0 0 6px currentColor) brightness(1.5); }
        }
        @keyframes finGeoSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] span, [aria-hidden="true"] div { animation: none !important; opacity: 0 !important; }
        }
        @keyframes signalWave {
          0%, 100% { transform: scale(0.6); opacity: 0.3; box-shadow: none; }
          50% { transform: scale(1.35); opacity: 1; box-shadow: 0 0 6px 2px rgba(124,58,237,0.55); }
        }
        button:focus-visible {
          outline: 2px solid #3b6ef5;
          outline-offset: 2px;
        }
        /* Shared Version 2 tap/row feedback \u2014 used across registration,
           dashboard, country picker, and PIN screens for a consistent,
           lightweight "premium" press feel. Purely visual, no logic. */
        .v2-tap { transition: transform 0.1s ease, box-shadow 0.15s ease, background 0.15s ease; }
        .v2-tap:active { transform: scale(0.94); }
        .v2-row { transition: background 0.15s ease; }
        .v2-row:hover { background: rgba(124,58,237,0.05); }
        .v2-row:active { background: rgba(124,58,237,0.09); }
        @keyframes successPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .v2-success-pop { animation: successPop 0.35s cubic-bezier(.34,1.56,.64,1); }
        /* GH Score dashboard indicator \u2014 a soft circle that blinks through
           a rotating set of light colors instead of showing a static
           score card. Color-cycle and opacity-blink run as two separate
           animations so the color changes read as "random" against the
           blink's own rhythm rather than always landing in sync. */
        @keyframes ghColorCycle {
          0%   { background: #FDE68A; }
          14%  { background: #A7F3D0; }
          28%  { background: #BFDBFE; }
          42%  { background: #FBCFE8; }
          57%  { background: #DDD6FE; }
          71%  { background: #FED7AA; }
          85%  { background: #FCA5A5; }
          100% { background: #FDE68A; }
        }
        @keyframes ghBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .gh-blink-circle {
          animation: ghColorCycle 7s linear infinite, ghBlink 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
          .v2-tap:active { transform: none; }
        }
      `}</style>{rootToast && <div
    style={{
      position: "fixed",
      bottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#15132A",
      color: "#fff",
      fontSize: 13.5,
      fontWeight: 600,
      padding: "10px 18px",
      borderRadius: 999,
      zIndex: 9999,
      whiteSpace: "nowrap",
      boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
      pointerEvents: "none"
    }}
  >{rootToast}</div>}<AppMapLauncher entries={appMapEntries} onLockedPress={handleAppMapLockedPress} /></div>;
}

