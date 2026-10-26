// src/screens/SendMoney/SendMoney.jsx
import { useState as useState15, useEffect as useEffect13, useRef as useRef11, useMemo as useMemo6 } from "react";
import { Sprout as Sprout2 } from "lucide-react";
import {
  ChevronLeft as ChevronLeft2,
  Search as Search4,
  Phone as Phone2,
  CreditCard as CreditCard4,
  Coins as Coins3,
  Copy as Copy3,
  Check as Check3,
  ChevronUp as ChevronUp2,
  ChevronDown as ChevronDown2,
  ArrowUpDown as ArrowUpDown2,
  ArrowUpRight as ArrowUpRight2,
  ArrowDownLeft as ArrowDownLeft2,
  Lock as Lock5,
  X as X4,
  ChevronRight as ChevronRight4,
  Landmark as Landmark6,
  History as History6,
  RefreshCw as RefreshCw4,
  Contact as ContactIcon,
  Plus as Plus6
} from "lucide-react";


// src/screens/SendMoney/SendMoney.jsx
var FLAG_CHIP_PX = { lg: [52, 40], md: [30, 23], sm: [24, 18] };
function Flag({ emoji, size = "md", badge }) {
  const [w, h] = FLAG_CHIP_PX[size];
  return <span className="flag-chip-wrap"><span className={`flag-chip ${size}`}><FlagEmoji flag={emoji} width={w} height={h} radius={0} /></span>{badge && <span className={`flag-badge ${badge}`}>{badge === "send" ? <ArrowUpRight2 size={11} strokeWidth={2.75} /> : <ArrowDownLeft2 size={11} strokeWidth={2.75} />}</span>}</span>;
}
// SEND_OTP — the literal "123456" — used to live here, and was what both
// this screen and PayPinModal compared a typed PIN against. Both now ask
// POST /api/pin/verify instead, so nothing reads it: a hardcoded PIN that
// unlocks payments has no business sitting in the bundle, even unused.
// The sender half of the screen: the SIGNED-IN account, as the rest of the
// app knows it — its name, its Gloobal ID and its own mobile number.
//
// This used to be a demo card: a randomName(), an "IN91••••••" placeholder
// for the ID, and a phone built from whatever was in the dial pad. Tapping
// the swap button showed those invented details as if they were the
// sender's. Now every field comes from the account App.jsx passes in
// (`fullName`, `symbolId`, `mobileNumber`), with plain fallbacks when a field
// is genuinely missing — never an invented one.
function senderProfileMaskMobile(mobile, dialCode) {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (!digits) return "";
  const dial = String(dialCode || "").replace(/\D/g, "");
  const local = dial && digits.startsWith(dial) ? digits.slice(dial.length) : digits;
  if (local.length <= 4) return `+${dial}${local}`;
  // The same shape the receiver's number arrives in from the server:
  // dial code, two digits, dots, the last two.
  return `+${dial}${local.slice(0, 2)}${"\u2022".repeat(Math.max(2, local.length - 4))}${local.slice(-2)}`;
}
function buildSenderProfile(sender) {
  const s = sender || { name: "United States", iso: "US", dialCode: "+1", flag: "\u{1F1FA}\u{1F1F8}", phoneNumber: "" };
  const mobile = s.mobileNumber || `${s.dialCode || ""}${String(s.phoneNumber || "").replace(/\D/g, "")}`;
  return {
    country: s.name,
    flag: s.flag,
    phone: senderProfileMaskMobile(mobile, s.dialCode),
    id: s.symbolId || "",
    currency: COUNTRY_CURRENCY[s.iso] || "USD",
    dialCode: s.dialCode,
    iso: s.iso,
    name: s.fullName && String(s.fullName).trim() ? String(s.fullName).trim() : "You"
  };
}
// The empty receiver half, before anybody has been searched for. It shows the
// sender's own country because there is no receiver yet to show — the moment
// one resolves, resolveSearch replaces this wholesale with THEIR country. The
// `iso` is carried so every consumer of `bottom` can read the receiver's
// country off one field instead of re-deriving it from the name.
function buildLocalReceiverPlaceholder(senderProfile) {
  return {
    country: senderProfile.country,
    iso: senderProfile.iso,
    flag: senderProfile.flag,
    phone: "",
    id: "",
    name: "",
    currency: senderProfile.currency
  };
}
function toCountryLike(senderProfile) {
  return {
    name: senderProfile.country,
    iso: senderProfile.iso,
    dialCode: senderProfile.dialCode,
    flag: senderProfile.flag
  };
}
// A number picked from the device's own contacts arrives as whatever the
// person typed when they saved it — "+91 98765 43210", "0044 7911
//123456", or just seven local digits with no country info at all. The
// mobile search field needs a country (for the dial-code tag and the
// digit-length check) plus the bare digits, so this makes a best-effort
// split: the longest dial code in ALL_COUNTRIES that prefixes the
// number wins, on the theory that "+1" and "+44" can both prefix-match
// a number but only one is actually that number's country. A number
// with no leading "+" has no country signal in it at all — it's handed
// back as-is and the search keeps whatever country was already selected,
// same as someone typing local digits by hand.
function matchCountryFromContactNumber(rawNumber) {
  const cleaned = String(rawNumber || "").replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) return { country: null, digits: cleaned };
  let best = null;
  for (const c of ALL_COUNTRIES) {
    if (cleaned.startsWith(c.dialCode) && (!best || c.dialCode.length > best.dialCode.length)) {
      best = c;
    }
  }
  return best ? { country: best, digits: cleaned.slice(best.dialCode.length) } : { country: null, digits: cleaned.slice(1) };
}
var ID_SEARCH_LENGTH = 12;
function identityDisplayValue(profile, mode) {
  switch (mode) {
    case "id":
      return profile.id;
    case "mobile":
      return profile.phone;
    case "country":
      return profile.country;
    case "name":
    default:
      return profile.name;
  }
}
// The label this method is stored under on a transaction, and the string
// choosePayMethod matches on. One constant rather than the literal in
// three places, because a payMethod that disagrees with itself by one
// character is a payment that silently falls through to the bank.
var ESSENTIALS_PAY_METHOD = "Gloobal Essentials";

// Drawn green rather than the app's violet: this row is the one that is
// not the person's own money, and the colour is the quickest way to say
// so before anybody reads the words.
function EssentialsPayIcon({ size, color }) {
  return <Sprout2 size={size} color={color} />;
}

function SendMoneyScreen({ onClose, sender, prefillReceiver = null, prefillChoiceId = null, history = [], onOpenPaidHistory, onOpenScan, onSendComplete, onExecuteTransaction, onRemoteSend, onBuildRowReceipt, onDrawEssentials, essentialsDailyLimit = 0 }) {
  // The account's CURRENT Gloobal ID — the same source the Dashboard reads,
  // so a rename made this session shows here too.
  const liveSenderId = useCurrentSymbolId(sender && sender.symbolId);
  const [top, setTop] = useState15(() => buildSenderProfile({ ...sender, symbolId: liveSenderId || (sender && sender.symbolId) }));
  const [bottom, setBottom] = useState15(() => buildLocalReceiverPlaceholder(buildSenderProfile(sender)));
  // `top` is seeded once, from the account that was signed in when this screen
  // mounted — and the Send button quotes its currency. If a different account
  // signs in while the screen is still mounted, that seed is stale, and the
  // button would price the payment in the previous occupant's currency while
  // the amount box priced it in the new receiver's. In practice the account
  // switch remounts the whole tree (GloobalArtifactRoot keys its provider off
  // that event), so this is belt and braces rather than a live defect — but
  // "belt and braces" is the right amount of care for the one figure on this
  // screen that says how much of your own money is about to leave.
  //
  // Keyed on the account's country, name, number and current Gloobal ID —
  // all real now, so rebuilding the card when one changes shows the change
  // rather than inventing anything.
  useEffect13(() => {
    const next = buildSenderProfile({ ...sender, symbolId: liveSenderId || (sender && sender.symbolId) });
    setTop((current) => {
      if (next.iso === current.iso && next.currency === current.currency && next.id === current.id && next.name === current.name && next.phone === current.phone) return current;
      return next;
    });
    // And the empty receiver half, which mirrors the sender's country until
    // somebody is actually searched for. Only while it IS still the empty
    // half — a resolved recipient carries an id, and their currency is their
    // own account's, never the sender's.
    setBottom((current) => (current.id ? current : buildLocalReceiverPlaceholder(next)));
  }, [sender && sender.iso, sender && sender.dialCode, sender && sender.phoneNumber, sender && sender.mobileNumber, sender && sender.fullName, liveSenderId]);
  // ── THE LENS REACHES THE SEND SCREEN TOO ──────────────────────────────
  //
  // It deliberately did not, and a test asserted as much. The reasoning was
  // that the amount being entered is the amount leaving, and that is a
  // moment to be unambiguous about real currency — which was correct while
  // GEU carried a MAGNITUDE, because "2 GEU" then meant something different
  // to whoever read it.
  //
  // Under the founder's model GEU never appears without the currency it is
  // in, so there is no longer an ambiguous way to write a figure here. The
  // screen already shows the two sides he described — "shop is asking 2
  // GEU │ USD, I pay them 176 GEU │ INR" — one in the box, one on the
  // button. It was the only screen in the app still answering to nothing.
  //
  // WHAT IS STILL TRUE: the two figures come from DIFFERENT currencies and
  // must never be conflated. The box is the receiver's own money, fixed to
  // their account; the button is what leaves yours. The bar names both, which
  // is what makes showing them together safe rather than merely tidy.
  const lens = useGeuLens();
  const [amount, setAmount] = useState15("");
  const [topOpen, setTopOpen] = useState15(false);
  const [bottomOpen, setBottomOpen] = useState15(true);
  const [copiedKey, setCopiedKey] = useState15(null);
  const [toast, setToast] = useState15(null);
  // The server's own words for why a payment did not happen, held so the
  // processing screen can show them. Cleared whenever the status leaves
  // "failed", so a stale reason can never appear under a new attempt.
  const [failureReason, setFailureReason] = useState15(null);
  const [payMethodBankColor, setPayMethodBankColor] = useState15(() => randomLogoFlipColor());
  useEffect13(() => {
    const interval = setInterval(() => {
      setPayMethodBankColor((prev) => randomLogoFlipColor(prev));
    }, 3e3);
    return () => clearInterval(interval);
  }, []);
  const [pinOpen, setPinOpen] = useState15(false);
  const requestClosePin = useBackClose(pinOpen, () => closePin());
  const [pin, setPin] = useState15("");
  const [pinError, setPinError] = useState15(false);
  const [pinRevealed, setPinRevealed] = useState15(false);
  const toastTimer = useRef11(null);
  const copyTimer = useRef11(null);
  const pinErrorTimer = useRef11(null);
  const [receipt, setReceipt] = useState15(null);
  // The post-payment question and scratch card, shown before the receipt.
  // The Creator Share this payment earned, offered under its receipt.
  //
  // `unlock` is the offer (the receipt the share belongs to); `unlockOpen` is
  // whether the card is up; `shareTabRequest` is bumped when the scratched
  // card asks the receipt to show its Creator Share tab. The offer is dropped
  // once taken, so the button does not come back on a receipt already opened.
  const [unlock, setUnlock] = useState15(null);
  const [unlockOpen, setUnlockOpen] = useState15(false);
  const [shareTabRequest, setShareTabRequest] = useState15(0);
  // Closing the receipt leaves Send Money too.
  //
  // It used to only dismiss the document, dropping the person back onto the
  // form they had just paid from — with the recipient still loaded and the
  // amount still typed. That was survivable while the receipt also carried a
  // Done button, which did close both; Done is gone (back is the one way out
  // of a document now), so this is what back has to mean. The payment is
  // finished: there is nothing left to do on the form behind it.
  const requestCloseReceipt = useBackClose(!!receipt, () => {
    setReceipt(null);
    setTransactionStatus("idle");
    onClose();
  });
  // A receipt opened from the RECENT list, which is a different thing from
  // the one above and must not share its state.
  //
  // `receipt` is the payment this screen just made, and closing it leaves
  // Send Money entirely — the payment is finished and the form behind it is
  // spent. A receipt opened by tapping a past payment is a look at history:
  // closing it goes back to the form with the dialled number still in it.
  // Reusing `receipt` for both would mean reading an old payment and being
  // thrown out of the screen for it.
  const [pastReceipt, setPastReceipt] = useState15(null);
  const requestClosePastReceipt = useBackClose(!!pastReceipt, () => setPastReceipt(null));
  const [searchStage, setSearchStage] = useState15(() => prefillReceiver ? "found" : "dialing");
  // Recipient lookup against GET /api/users/resolve. searchError carries
  // the inline "no such user" message; searchBusy blocks a second lookup
  // and disables Search while one is in flight.
  const [searchBusy, setSearchBusy] = useState15(false);
  const [searchError, setSearchError] = useState15(null);
  // maskMobileNumber used to live here. The masking it did was right — the
  // recipient confirmation has to be recognisable to the sender without
  // handing out somebody else's number to anyone who types an ID — but it was
  // happening in the wrong place: the server sent the number in full and this
  // screen hid it on the way to the pixels, so the full number was still in
  // the response, in devtools, and in anything else that called the route.
  //
  // GET /api/users/resolve now masks before it answers (audit finding
  // GLB-17), so `user.mobileNumber` arrives already reduced to a dial code
  // and two trailing digits. Masking it a second time here would only garble
  // it.
  const [searchMode, setSearchMode] = useState15("id");
  const [idBuffer, setIdBuffer] = useState15("");
  const [mobileBuffer, setMobileBuffer] = useState15("");
  const [searchCountry, setSearchCountry] = useState15(null);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState15(false);
  const [foundDisplayMode, setFoundDisplayMode] = useState15("name");
  const [searchCountryQuery, setSearchCountryQuery] = useState15("");
  const effectiveSearchCountry = searchCountry || toCountryLike(top);
  const [minMobileDigits, maxMobileDigits] = mobileDigitRange(effectiveSearchCountry.iso);
  const filteredSearchCountries = useMemo6(
    // Ranked, not merely filtered — see countrySearch. "ind" puts India
    // before Indonesia, "91" puts India first, and "IN" finds it at all.
    () => countrySearch(ALL_COUNTRIES, searchCountryQuery),
    [searchCountryQuery]
  );
  // The two sides of the payment, each named for whose money it is.
  //
  // ── Which side the amount box is denominated in ──────────────────────────
  //
  // The RECEIVER's. The person types what the payee should end up with, in
  // the payee's own currency, and the Send button quotes back what that costs
  // in the sender's. Both halves are on screen at once and each is labelled
  // with the currency it is actually in, so neither figure can be read as the
  // other:
  //
  //     amount box    ->  $ 0.00     receiver's currency, what they get
  //     Send button   ->  Send ₹0.00 sender's currency, what you pay
  //
  // This is a deliberate reversal. The box used to hold the SENDER's own
  // figure and the receiver's side was quoted underneath — which reads
  // correctly for "I want to spend 5,000 rupees" and badly for the thing
  // people actually mean when paying somebody abroad, which is "they need
  // 100 dollars". Under the old arrangement the payee's total drifted with
  // the rate; under this one the sender's total does, and the payee gets
  // exactly the figure that was agreed.
  //
  // It also makes the payment-request case (a scanned QR carrying an amount)
  // the same shape as an ordinary send rather than a special one: the figure
  // the payee named goes straight into the box, in the currency they named it
  // in, with no conversion on the way in and no second rounding on the way
  // out. See the prefill in the effect below, which no longer converts.
  //
  // Nothing about the corridor moves. `convert` is the same helper, called in
  // the same direction the server settles in for a destination-denominated
  // payment; the server still recomputes both sides itself and refuses the
  // payment if its own arithmetic disagrees with what the screen showed.

  // What the payee is credited: exactly what was typed, rounded to the
  // RECEIVER's own minor unit, because that is the account it has to land in.
  // A yen balance cannot hold 8,274.29, and quoting a figure the payee's
  // currency cannot represent means the screen and the request disagree about
  // what was agreed. The server rounds this side the same way.
  const receiverAmount = useMemo6(
    () => {
      const typed = parseFloat(amount) || 0;
      const decimals = currencyDecimals(bottom.currency);
      const factor = Math.pow(10, decimals);
      return Math.round(typed * factor) / factor;
    },
    [amount, bottom.currency]
  );
  // What it costs the sender, in the sender's own currency. Derived from the
  // typed figure rather than typed itself, and rounded to the SENDER's minor
  // unit — this is the number that leaves their balance, so it has to be a
  // real amount of their own money.
  //
  // ── My Choices ────────────────────────────────────────────────────────
  //
  // The optional label above the Send button. It is not part of the
  // payment: nothing here is sent to /api/transactions/send, nothing here
  // can fail the transfer, and clearing it is one tap on the chosen tile.
  // The filing happens AFTER the payment has committed — see handleSend.
  //
  // `choicesOfKind` already drops archived categories, so a choice the
  // person retired stops being offered while payments already filed under
  // it keep their label.
  const choicesState = useChoices();
  const [choiceId, setChoiceId] = useState15(prefillChoiceId || null);
  const [choicesOpen, setChoicesOpen] = useState15(false);
  // The strip shows the first few; "All" opens the rest. choicesOfKind
  // puts favourites first, so the heart on a tile is also what decides
  // what appears here — one rule rather than a separate pinned list that
  // could disagree with the grid.
  const sendChoices = useMemo6(
    () => choicesOfKind(choicesState, "expense").slice(0, CHOICES_STRIP_COUNT),
    [choicesState]
  );
  // DECLARED AFTER choiceId and choicesState, not beside them. It reads
  // both, and a const that reads a const declared below it is a temporal
  // dead zone error at render — the one that has bitten this bundle three
  // times now. Order by dependency, not by subject.
  const pickedChoice = choiceId ? choicesById(choicesState, choiceId) : null;
  // ── WHOSE NAMES THESE ARE ─────────────────────────────────────────────
  //
  // A choice is named by the person who made it, for themselves, and
  // they name them things like "Damroo Baby" and put a photograph of
  // the child on the tile. This screen then prints that under the
  // amount and again, larger, on four chips below it — on a phone held
  // up at a counter while somebody is paying.
  //
  // So one control covers all of it. Hiding the line under the amount
  // while the same name sits in large type two centimetres below hides
  // nothing, which is why this is screen-wide rather than per-element.
  //
  // ── DEFAULT HIDDEN ────────────────────────────────────────────────
  //
  // This was default VISIBLE, on the argument that hiding is "a shoulder
  // you choose to turn". That argument is wrong in the one way that
  // matters: a mask you have to switch on has already failed by the time
  // you think to switch it on. The names are "Darling", "Donation",
  // "Dream" — the private ones are exactly the ones nobody remembers to
  // hide before opening the screen in front of somebody.
  //
  // So the strip opens masked and the eye is what opens it, behind the
  // same check the dashboard's balance sits behind. It resets with the
  // screen — see the effect below.
  const [choiceNamesHidden, setChoiceNamesHidden] = useState15(true);
  // ── THE EYE IS JUST AN EYE ────────────────────────────────────────
  //
  // It had a biometric gate on it for one patch. That was built to answer
  // "sometimes it asks, sometimes it doesn't" — and the real cause turned
  // out to be that this control had NO check while the dashboard's
  // balance eye had one, so the two looked alike and behaved differently.
  //
  // Adding a check here made them consistent and made this worse. The
  // balance is a number somebody could use against you; these are your
  // own labels for your own spending, on a screen you are already mid-
  // payment on, having just passed a check to get into the app. A
  // fingerprint prompt to read the word "Donation" on your own phone is
  // friction charged for nothing.
  //
  // So the consistency goes the other way: the strip still opens HIDDEN,
  // which is the part that protects anything, and opening it is one tap.
  const handleToggleChoiceNames = () => setChoiceNamesHidden((v) => !v);

  // Every consumer of `senderAmount` on this screen — the Send button, the
  // pay-method sheet, the receipt, the local ledger leg — wants "what I
  // paid", and reads correctly against this without changing.
  const senderAmount = useMemo6(
    () => {
      const raw = convert(receiverAmount, bottom.currency, top.currency);
      const decimals = currencyDecimals(top.currency);
      const factor = Math.pow(10, decimals);
      return Math.round(raw * factor) / factor;
    },
    [receiverAmount, top.currency, bottom.currency]
  );
  // The last five payments sent from this screen — `history` (the
  // sendMoneyHistory App.jsx passes in) has always reached this
  // component, but nothing here ever rendered it: the History icon in
  // the header opens a separate full history screen instead, so anyone
  // mid-dial had no way to see who they'd recently paid without leaving
  // this screen entirely. Same "last five" figure and the same
  // out-of-order guard as GloobalBankScreen's recentBankTransactions —
  // rows seeded from the server (see App.jsx's seedUnder) land appended
  // under whatever this session already has, not necessarily
  // newest-first overall, so this sorts by the parsed date rather than
  // trusting array order.
  const recentSentTransactions = useMemo6(() => {
    const stamp = (row) => {
      const parsed = parseDemoDate(row.date);
      return isNaN(parsed.getTime()) ? -Infinity : parsed.getTime();
    };
    return [...history].sort((a, b) => stamp(b) - stamp(a)).slice(0, 5);
  }, [history]);
  // A recipient handed in from outside — currently the Scan screen, after it
  // has decoded a Gloobal QR and resolved the ID against
  // GET /api/users/resolve. It has already done the lookup this screen's own
  // search step would do, so repeating it would mean scanning somebody's code
  // and then being asked to dial the ID off it by hand.
  //
  // Applied through the same setBottom/searchStage pair resolveSearch uses, so
  // a prefilled recipient and a dialled one are the same state from here on —
  // the screen opens on the amount, and openSearch() still clears it, which is
  // how the person changes their mind about who they are paying.
  useEffect13(() => {
    if (!prefillReceiver) return;
    setBottom({
      // Already the RECIPIENT's own country by the time it arrives — Scan
      // resolves the ID against GET /api/users/resolve and reads countryIso
      // off that response (App.jsx's handleSendToScanned). Taken as given
      // here rather than re-derived, and never merged with the sender's.
      country: prefillReceiver.country,
      iso: prefillReceiver.iso,
      flag: prefillReceiver.flag,
      id: prefillReceiver.id || "",
      name: prefillReceiver.name || "Gloobal User",
      // Already masked. This value originates in GET /api/users/resolve (via
      // App.jsx's handleSendToScanned), which now masks before it answers —
      // see the note where maskMobileNumber used to be defined.
      phone: prefillReceiver.mobileNumber || "",
      currency: prefillReceiver.currency || top.currency,
      // Already a percent by the time it arrives (see handleSendToScanned).
      shareRate: Number(prefillReceiver.shareRate) || 0,
      // Defaults true (undefined !== false) because every receiver this
      // screen's OWN search resolves is already real — resolveSearch only
      // reaches setSearchStage("found") after GloobalApi.resolveUser
      // succeeds. Only a handed-in prefill can carry an explicit false,
      // the same "unregistered" fact Scan's own confirmation card shows —
      // now it survives the handoff instead of Send Money treating a
      // scanned placeholder identically to a resolved account.
      registered: prefillReceiver.registered !== false
    });
    // Prefill the box with the figure the payee actually named.
    //
    // No conversion on the way in any more. The box is denominated in the
    // RECEIVER's currency now (see the memos above) and a payment request is
    // already stated in exactly that currency, so converting it here would
    // have been converting it into the wrong unit — and the send would then
    // convert it back, rounding twice against a figure the payee named.
    if (Number(prefillReceiver.requestedAmount) > 0) {
      setAmount(String(Number(prefillReceiver.requestedAmount)));
    }
    setSearchStage("found");
    setFoundDisplayMode("name");
    setTopOpen(false);
    setBottomOpen(true);
  }, [prefillReceiver]);
  useEffect13(() => {
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(copyTimer.current);
      clearTimeout(pinErrorTimer.current);
    };
  }, []);
  const [transactionStatus, setTransactionStatus] = useState15("idle");
  // The PIN the backend has already confirmed, held out of visible state so
  // closePin() can wipe the on-screen digits without also destroying the
  // value POST /api/transactions/send still needs.
  const verifiedPinRef = useRef11(null);
  const [pinChecking, setPinChecking] = useState15(false);
  const requestIdRef = useRef11(null);
  const appliedRequestIdRef = useRef11(null);
  async function completePayment() {
    if (appliedRequestIdRef.current === requestIdRef.current) return;
    // Refused before anything is sent, posted, recorded or receipted: no
    // server call, no local ledger leg, no history row, no receipt.
    if (!isPositivePaymentAmount(receiverAmount) || !isPositivePaymentAmount(senderAmount)) {
      verifiedPinRef.current = null;
      setTransactionStatus("failed");
      setFailureReason("Enter an amount greater than zero.");
      return;
    }
    appliedRequestIdRef.current = requestIdRef.current;
    const now = /* @__PURE__ */ new Date();
    const txnId = genTxnId();
    // The real backend goes FIRST and is authoritative: it re-verifies the
    // PIN, enforces its own duplicate guard and amount ceiling, and writes
    // the Transaction + paired LedgerEntry rows to MongoDB. Only once it
    // has accepted does the local ledger post, so the client can never end
    // up showing money that the server rejected.
    //
    // onRemoteSend reports { ok, skipped, reason }. `skipped` is the honest
    // case, not an error: this screen's receivers are local placeholders
    // with no server identity, so unless the payment is aimed at a real
    // registered Gloobal ID there is no counterparty for the backend to
    // credit. Those still run as a local simulation, exactly as before.
    // What the server confirmed, once it has. Declared out here because
    // everything below — the ledger post, the history row and the receipt —
    // must describe the transaction the BACKEND recorded, not the one this
    // screen guessed at before calling.
    let confirmedTxnId = txnId;
    let confirmedShareRatePercent = (bottom.shareRate ?? 0);
    let confirmedCashback = null;
    // The Creator Share leg's own server-minted reference. Stays empty for a
    // local simulation or a 0%-share payee.
    let confirmedShareTxnId = "";
    let confirmedShareAmount = 0;
    // The short ASCII handles the payment's and the share's receipt LINKS are
    // addressed by. Empty for a local simulation, which has no server row for
    // a link to lead to — that receipt keeps the long form it always had.
    let confirmedReceiptCode = "";
    let confirmedShareReceiptCode = "";
    // The figures the server RECORDED for this payment — its debit, its
    // credit and its rate. Receipt display only (buildTransactionSnapshot's
    // `recorded`); the local ledger post and the toast below keep reading
    // this screen's own senderAmount. Null for a local simulation, which then
    // shows no conversion block rather than a client-computed one.
    let confirmedRecorded = null;
    // Whether the backend actually recorded this payment — false for a
    // `skipped` local simulation, and (consistently) false when there is
    // no onRemoteSend at all to have recorded it. Read below by the final
    // toast, the receipt, and the history row, so none of the three can
    // describe a payment that never reached MongoDB as a normal, completed
    // send — the exact gap that let Send Money show a real-looking
    // success for money that never moved.
    let settledRemotely = false;
    if (onRemoteSend) {
      const remote = await onRemoteSend({
        txnId,
        // Both sides of the corridor, named, plus which one the person
        // actually typed. POST /api/transactions/send recomputes the other
        // from its own FX and refuses the payment if the two disagree, so
        // nothing here can mislabel a leg — the failure mode this replaces
        // is a single `amount` whose currency depended on which screen sent
        // it, which once credited a payee 378.53 instead of 5,000.
        //
        // `amountBasis: "source"` is the ordinary send: the box holds the
        // sender's own money and the receiver gets the conversion. A scanned
        // payment request sends "destination" instead, so the payee is
        // credited the exact figure they asked for.
        // Always destination-denominated: the box holds the receiver's own
        // figure, so that is the side the person typed and the side the
        // server must treat as authoritative. `sourceAmount` is sent
        // alongside it as this screen's own view of the cost — the server
        // recomputes it from its own rate for a destination basis and does
        // not take this one, which is what stops a stale client rate from
        // moving the wrong sum.
        amountBasis: "destination",
        sourceAmount: senderAmount,
        sourceCurrency: top.currency,
        destinationAmount: receiverAmount,
        destinationCurrency: bottom.currency,
        // Legacy field, kept so an older server build still reads the leg it
        // expects: before the contract above existed, `amount` meant the
        // receiver's face value and nothing said so.
        amount: receiverAmount,
        currency: bottom.currency,
        receiver: bottom,
        // The verified PIN, from the ref — `pin` state is "" by now.
        pin: verifiedPinRef.current || "",
        payMethodLabel: payMethod,
        memo: `Send Money to ${bottom.name}`,
        clientRequestId: requestIdRef.current
      });
      if (remote && remote.ok === false && !remote.skipped) {
        verifiedPinRef.current = null;
        setTransactionStatus("failed");
        // The reason goes to the SCREEN, not to a toast, and the status is
        // no longer wound back on a timer.
        //
        // A toast that clears itself after 1.8 seconds is the wrong carrier
        // for "your money did not move": look away and a failure is
        // indistinguishable from a success. The processing screen now turns
        // into the failure and waits to be acknowledged.
        setFailureReason(remote.reason || "The server rejected this payment.");
        // Let the same request be retried — the server never posted it.
        appliedRequestIdRef.current = null;
        return;
      }
      // A `skipped` send never reached the backend, so it has nothing to
      // confirm and the locally-minted values stand.
      settledRemotely = Boolean(remote && remote.ok && !remote.skipped);
      if (settledRemotely) {
        // Normally the same value this device sent; different only if the
        // backend had to mint its own (see resolveTransactionReference).
        if (remote.transactionId) confirmedTxnId = remote.transactionId;
        // The Creator Share the payee's account actually charged, as a
        // percent. The server is the authority on this — it reads the rate
        // off the payee's own record at the moment of payment, which is not
        // necessarily the rate this screen saw when it looked the recipient
        // up.
        if (Number.isFinite(remote.cashbackRate)) confirmedShareRatePercent = remote.cashbackRate * 100;
        if (Number.isFinite(remote.cashback)) confirmedCashback = remote.cashback;
        if (remote.shareTransactionId) confirmedShareTxnId = remote.shareTransactionId;
        if (Number.isFinite(remote.shareAmount)) confirmedShareAmount = remote.shareAmount;
        // The short handles this payment's two receipt links are addressed
        // by (Transaction.receiptCode). Server-minted, like the references
        // beside them, and carried only so the share sheet has a URL that
        // does not percent-encode to 180 characters.
        if (remote.receiptCode) confirmedReceiptCode = remote.receiptCode;
        if (remote.shareReceiptCode) confirmedShareReceiptCode = remote.shareReceiptCode;
        confirmedRecorded = {
          debitAmount: remote.debitAmount,
          senderCurrency: remote.senderCurrency,
          destinationAmount: remote.destinationAmount,
          destinationCurrency: remote.destinationCurrency,
          fxRate: remote.fxRate,
          // Both sides of the Creator Share as the server stored them on the
          // share leg: the payer's (shareAmount/shareCurrency) and the
          // payee's. Receipt display only, like the five above.
          shareCurrency: remote.shareCurrency,
          sharePayeeAmount: remote.sharePayeeAmount,
          sharePayeeCurrency: remote.sharePayeeCurrency
        };
      }
    }
    // ONE call: risk-check, posting, provenance, complaint window, and
    // (if eligible) the asset-seed grant all happen atomically inside
    // executeTransaction — not a synchronous post here followed by a
    // fire-and-forget completion later. Location is intentionally not
    // part of this call at all (see the location submission below);
    // financial validity never waits on or depends on it.
    const result = onExecuteTransaction
      ? onExecuteTransaction({
          txnId: confirmedTxnId,
          amount: senderAmount,
          payMethodLabel: payMethod,
          memo: `Send Money to ${bottom.name}`,
          name: bottom.name,
          shareRatePercent: confirmedShareRatePercent,
          time: formatClockTime(now),
          now,
          clientRequestId: requestIdRef.current
        })
      : { ok: true, ledgerRecordId: null };
    if (!result.ok) {
      verifiedPinRef.current = null;
      setTransactionStatus("failed");
      setFailureReason(result.reason || "Insufficient balance");
      return;
    }
    // File the payment under the chosen category, now that it has
    // committed. AFTER the success check and deliberately not awaited:
    // a label is not part of the transfer, and the one thing that must
    // never happen is a payment that went through being reported as
    // failed because a tag write did not. choicesTagQuietly swallows its
    // own errors for exactly that reason — an untagged payment can be
    // filed later from its category screen, and a frightened person
    // cannot unsend money.
    // ── A PAYMENT ESSENTIALS CARRIED IS FILED UNDER ESSENTIALS ─────
    //
    // Asked for in those words: Essentials can pay for anything, but
    // whatever it touches lands in My Essentials so the record is honest
    // about where the money came from. An explicit choice still wins —
    // somebody who picked "Food" meant Food, and overriding that would
    // be the app arguing with them about their own record.
    const filedUnder = choiceId
      || (essentialsAppliedRef.current > 0 ? choicesSystemCategoryId(choicesState, "essentials") : null);
    choicesTagQuietly(confirmedTxnId, filedUnder);
    showToast2(
      settledRemotely
        ? `Sending ${CURRENCIES[top.currency].label} ${fmt(
            senderAmount,
            top.currency
          )} to ${bottom.country} \xB7 via ${payMethod || "Gloobal Bank"}`
        : `Not sent — ${CURRENCIES[top.currency].label} ${fmt(
            senderAmount,
            top.currency
          )} recorded locally only, no registered Gloobal account to credit`
    );
    const { receipt: receipt2, historyEntry } = buildTransactionSnapshot({
      sender: top,
      receiver: bottom,
      shareTxnId: confirmedShareTxnId,
      shareAmount: confirmedShareAmount,
      receiptCode: confirmedReceiptCode,
      shareReceiptCode: confirmedShareReceiptCode,
      amount,
      convertedAmount: senderAmount,
      payMethod,
      now,
      shareRatePercent: confirmedShareRatePercent,
      ledgerRecordId: result.ledgerRecordId,
      txnId: confirmedTxnId,
      recorded: confirmedRecorded
    });
    // Held no longer than the send it authorised.
    verifiedPinRef.current = null;
    // Overridden after buildTransactionSnapshot, the same way confirmedCashback
    // already is below — a `status: "simulated"` row must never collapse back
    // to whatever default buildTransactionSnapshot assigns (History and the
    // reopened receipt both read this field, and both need to keep saying
    // "simulated" the next time this payment is looked at, not just in the
    // first toast).
    const receiptOverrides = Object.assign(
      {},
      confirmedCashback === null ? null : { cashback: confirmedCashback },
      settledRemotely ? null : { status: "simulated" }
    );
    const finalReceipt = Object.keys(receiptOverrides).length ? Object.assign({}, receipt2, receiptOverrides) : receipt2;
    const finalHistoryEntry = settledRemotely ? historyEntry : Object.assign({}, historyEntry, { status: "simulated" });
    // The receipt is set before the status flips, so "completed" is never
    // observable without one to show for it.
    setReceipt(finalReceipt);
    // A payment that really settled carries a share to reveal, so its receipt
    // is offered the Reveal my share button (PaymentUnlock is what that opens).
    // A locally-recorded one goes straight to its receipt and is offered
    // nothing: it earned no share, because it never reached the server.
    //
    // The receipt comes FIRST either way. This used to open the question over
    // the top of it, which made a game the toll gate on a document somebody
    // had just paid for.
    if (settledRemotely && typeof gloobalAuthToken === "function" && gloobalAuthToken()) {
      setUnlock({ receipt: finalReceipt, amountLabel: geuLensBarMoney(senderAmount, top.currency, lens, top.currency) });
    }
    setTransactionStatus("completed");
    if (onSendComplete) onSendComplete(finalHistoryEntry);
  }
  const [showPayBiometric, setShowPayBiometric] = useState15(false);
  const [payBiometricScanning, setPayBiometricScanning] = useState15(false);
  // The last gate before money moves. requireBiometric() runs a real
  // WebAuthn assertion against this account's passkey — the Face ID /
  // Touch ID / fingerprint prompt on a phone — and completePayment() (which
  // is what issues POST /api/transactions/send) is only reached once it
  // resolves true.
  //
  // This was a 700ms setTimeout that always succeeded, so the screen asked
  // for a fingerprint and then paid regardless of the answer. A refusal now
  // cancels the transaction outright.
  //
  // transactionStatus is set to "processing" only after the check passes.
  // Setting it up front — as this used to — left the screen stuck mid-send
  // on a refusal, with no transaction and no way back.
  const handlePayBiometricVerify = async () => {
    if (transactionStatus === "processing" || payBiometricScanning) return;
    setPayBiometricScanning(true);
    const ok = await requireBiometric({ pinReason: "Confirm this payment with your PIN." });
    setPayBiometricScanning(false);
    setShowPayBiometric(false);
    if (!ok) {
      // The PIN authorised a send that is not happening. Drop it rather
      // than leaving it available to a later attempt that never passed a
      // check of its own.
      verifiedPinRef.current = null;
      showToast2("Couldn't verify it's you — payment cancelled");
      return;
    }
    // Minted here, after the gate, so a cancelled attempt does not consume
    // an idempotency key that a genuine retry would then be deduplicated
    // against.
    requestIdRef.current = generateRequestId();
    setFailureReason(null);
    setTransactionStatus("processing");
    completePayment();
  };
  // PIN entry, verified against the backend.
  //
  // Two bugs lived here, and together they made the payment unfinishable.
  //
  // First, the PIN was compared to SEND_OTP — a hardcoded "123456" in this
  // file. The person's real PIN was never checked, and any account whose
  // PIN was not literally 123456 could not get past this step at all.
  //
  // Second, and this is the "PIN required" loop: on success this called
  // requestClosePin(), and closePin() does setPin(""). The biometric step
  // then ran, and by the time completePayment() reached
  // POST /api/transactions/send the pin it forwarded was the empty string.
  // That route requires the PIN in its body and bcrypt-checks it
  // server-side, so it answered 400 "PIN is required before sending
  // transaction." — after the person had entered the right PIN and passed
  // the biometric. No transaction, so no receipt either.
  //
  // The verified PIN is now held in a ref instead of the visible state.
  // closePin() still wipes the on-screen buffer immediately (the digits
  // should not linger on screen), while the ref carries the value the one
  // step further it has to travel. It is cleared the moment the send
  // settles, either way.
  useEffect13(() => {
    if (pin.length < 6 || pinChecking) return;
    let cancelled = false;
    (async () => {
      setPinChecking(true);
      const symbolId = gloobalCurrentSymbolId();
      try {
        if (symbolId) {
          await GloobalApi.verifyPin(symbolId, pin);
        }
        // No symbolId means this device has no signed-in account to check
        // against — the local-simulation path this screen still supports
        // for placeholder receivers. Nothing to verify, nothing to send.
        if (cancelled) return;
        verifiedPinRef.current = pin;
        setPinChecking(false);
        requestClosePin();
        setShowPayBiometric(true);
      } catch (err) {
        if (cancelled) return;
        setPinChecking(false);
        verifiedPinRef.current = null;
        setPinError(true);
        // The backend's own words: it distinguishes a wrong PIN from a
        // locked one ("PIN is temporarily locked", after five tries) and
        // that difference matters to whoever is holding the phone.
        showToast2(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
        pinErrorTimer.current = setTimeout(() => {
          setPin("");
          setPinError(false);
        }, 550);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin]);
  function showToast2(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }
  function handleCopy(text, key) {
    const doSet = () => {
      setCopiedKey(key);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedKey(null), 1400);
    };
    copyToClipboard(text);
    doSet();
  }
  function handleSwap() {
    setTopOpen((o) => !o);
    setBottomOpen((o) => !o);
  }
  function openSearch() {
    if (searchStage === "dialing") return;
    setSearchStage("dialing");
    setTopOpen(false);
    setBottomOpen(true);
    if (searchStage === "found") {
      setIdBuffer("");
      setMobileBuffer("");
      setSearchCountry(null);
      setSearchCountryQuery("");
      setFoundDisplayMode("name");
      setBottom(buildLocalReceiverPlaceholder(top));
    }
  }
  // Lets someone pick a recipient's number out of their own phone contacts
  // instead of dialling it in by hand. This is the real Contact Picker API
  // (navigator.contacts.select) — there is no bundled contacts list of any
  // kind to fake it with, and there shouldn't be one: reading someone's
  // address book is exactly the kind of access that has to go through the
  // browser's own permission prompt, not an app-level shortcut around it.
  //
  // Support is real but narrow — Chrome/Edge on Android behind HTTPS, as
  // of when this was written. Desktop Chrome, Firefox and Safari (desktop
  // and iOS) have no implementation at all. That's stated plainly rather
  // than papered over: the button still works everywhere by falling back
  // to a toast instead of silently doing nothing, and manual dial entry
  // next to it is never blocked on this succeeding.
  async function openContactPicker() {
    const supported = typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;
    if (!supported) {
      showToast2("Contacts aren't available on this browser — dial the number in instead");
      return;
    }
    let picked;
    try {
      picked = await navigator.contacts.select(["name", "tel"], { multiple: false });
    } catch (e) {
      // Permission denied, or the picker itself failed. Either way there's
      // nothing to recover into — the manual dial pad still works.
      showToast2("Couldn't open contacts");
      return;
    }
    const contact = picked && picked[0];
    const tel = contact && contact.tel && contact.tel[0];
    if (!tel) {
      // An empty array means the person cancelled the picker — leaving
      // silently is correct there, same as backing out of any other
      // sheet. A contact with no saved number is a different case and
      // gets told apart from a plain cancel.
      if (contact) showToast2("That contact has no phone number saved");
      return;
    }
    const { country, digits } = matchCountryFromContactNumber(tel);
    openSearch();
    setSearchMode("mobile");
    setSearchError(null);
    if (country) {
      setSearchCountry(country);
      // openSearch() above has already put the screen back into "dialing", so
      // this is decorating an empty receiver card with the country whose
      // number is about to be typed — never overwriting a resolved recipient.
      // Guarded anyway: see selectSearchCountry.
      applySearchCountryToPlaceholder(country);
    }
    setMobileBuffer(digits.replace(/\D/g, "").slice(0, maxMobileDigits));
  }
  function toggleSearchMode(e) {
    e.stopPropagation();
    setSearchMode((m) => m === "id" ? "mobile" : "id");
  }
  // The country picker next to the dial pad chooses which country's NUMBER is
  // being typed. It is not a statement about the recipient, who is unknown
  // until the lookup returns — so it may only ever paint the empty placeholder
  // card, and must never reach a receiver the backend has already identified.
  //
  // The guard is on the stage rather than on where it is called from: the
  // picker only renders while dialing today, but a resolved recipient's
  // country coming from anywhere other than that recipient's own account is
  // precisely the bug this screen had, and it should not be able to come back
  // by someone rendering this control somewhere new.
  function applySearchCountryToPlaceholder(c) {
    if (searchStage === "found") return;
    setBottom((b) => ({ ...b, country: c.name, iso: c.iso, flag: c.flag }));
  }
  function selectSearchCountry(c) {
    setSearchCountry(c);
    if (searchMode === "mobile") setMobileBuffer("");
    setSearchCountryQuery("");
    setCountryDropdownOpen(false);
    applySearchCountryToPlaceholder(c);
  }
  // Looks the recipient up on the backend instead of inventing one.
  //
  // This used to accept anything: whatever twelve symbols were dialled
  // became the recipient, with randomName() standing in for a name and
  // randomLocalPhone() for a number, and the send proceeded against an
  // account that need not exist. Money aimed at a typo was
  // indistinguishable from money aimed at a real person.
  //
  // GET /api/users/resolve takes `identifier` and accepts either a Gloobal
  // ID or a full international mobile number, so one call serves both
  // modes. (Not `?symbolId=` / `?phone=` — this backend reads neither.)
  async function resolveSearch() {
    if (searchBusy) return;
    const c = effectiveSearchCountry;
    const identifier = searchMode === "id" ? idBuffer : `${c.dialCode}${mobileBuffer.replace(/\D/g, "")}`;
    setSearchBusy(true);
    setSearchError(null);
    let user;
    try {
      user = await GloobalApi.resolveUser(identifier);
    } catch (err) {
      setSearchBusy(false);
      // Only a definite 404 means "no such person". A cold start or a 5xx
      // is not an answer about this recipient, and reporting it as one
      // would tell somebody their friend has no Gloobal account.
      setSearchError(
        err instanceof GloobalApiError && err.status === 404
          ? "No Gloobal user found. Check the ID and try again."
          : err.message
      );
      return;
    }
    setSearchBusy(false);
    const grouped = mobileBuffer.replace(/(\d{3})(?=\d)/g, "$1 ");
    // Who this money is actually going to lives in `user` — their OWN
    // registered country — not `c` (effectiveSearchCountry), which is just
    // whichever country flag the sender happened to have selected/typed
    // from while dialling. Before this fix, a resolved receiver always
    // inherited the SENDER's country, flag and currency: someone in India
    // searching up a Gloobal ID belonging to a person in the US saw the
    // amount dial in rupees under an Indian flag — the right person, but
    // the wrong currency and flag entirely, and (via `convert` below) the
    // wrong amount if that ever got sent.
    //
    // Three sources, strictly in this order:
    //
    //   1. user.countryIso — the receiver's registered country, straight off
    //      GET /api/users/resolve. Authoritative, and now actually correct:
    //      the server reads it through lib/accountCountry.js, which stopped
    //      it reporting 'IN' for every account (registration never sent a
    //      country, so every row held the schema default; see that module).
    //   2. Their E.164 mobile number, matched on dial code the same way the
    //      contact picker does — for an account the server could not answer
    //      for at all.
    //   3. `c` (effectiveSearchCountry) — the country the SENDER happened to
    //      be dialling from. Last resort only, and never an override: it
    //      describes the payer, not the payee, and letting it win is exactly
    //      what put an Indian flag and ₹ over a US recipient.
    //
    // Everything on the receiver half derives from this single value —
    // the flag, the country name, `currency` (which the amount dial displays
    // and which `convert` above uses as the FROM currency for the FX
    // conversion), and through the receipt, the payment summary. Nothing
    // below re-reads `c` or `top` for any of them, and once searchStage is
    // "found" nothing else on this screen may write country/iso/flag into
    // `bottom` (see applySearchCountryToPlaceholder).
    const recipientCountry =
      ALL_COUNTRIES.find((country) => country.iso === user.countryIso) ||
      matchCountryFromContactNumber(user.mobileNumber).country ||
      c;
    setBottom({
      country: recipientCountry.name,
      iso: recipientCountry.iso,
      flag: recipientCountry.flag,
      // The recipient's CURRENT registered ID, as the backend holds it —
      // not what was typed. Someone paying an ID that has since been
      // changed is shown, and pays, the ID the account actually has now.
      id: user.symbolId || identifier,
      // fullName is the mobile number on accounts created before the name
      // step existed (register-symbol overwrites it), and a name that is
      // just the number is not a name worth showing.
      // `nameIsMobile` is the server's own answer to "is this account's
      // fullName just its phone number?" — the comparison this line used to
      // make locally, which stopped being possible once the number started
      // arriving masked, and which was never the client's comparison to make.
      name: user.fullName && !user.nameIsMobile ? user.fullName : "Gloobal User",
      // Already masked by the server. The fallback is the number the sender
      // typed themselves, which needs no hiding from them.
      phone: user.mobileNumber || (searchMode === "mobile" ? `${c.dialCode} ${grouped}` : ""),
      currency: COUNTRY_CURRENCY[recipientCountry.iso] || "USD",
      // The receiver's real rate off their own account, not a random one.
      //
      // Converted to a percent here, at the boundary. The backend stores and
      // returns a decimal (1% = 0.01) and every consumer of `shareRate` in
      // this app — the Creator Share readout below, the receipt, the asset
      // seed's shareRatePercent — works in percent, so carrying the decimal
      // through showed a 1% creator as "0.01%" and posted a hundredth of the
      // share they had actually set.
      shareRate: (Number(user.cashbackRate) || 0) * 100
    });
    setSearchStage("found");
    setFoundDisplayMode("name");
    setTopOpen(false);
    setBottomOpen(true);
  }
  function handleAmountChange(e) {
    const v = e.target.value;
    // The box is in the RECEIVER's currency, so the decimal places it accepts
    // are the receiver's. Fixed at two, a yen payee could be asked for
    // ¥100.55 — which is not an amount of yen, and which the server refuses
    // outright. A zero-decimal currency accepts no separator at all.
    const decimals = currencyDecimals(bottom.currency);
    const allowed = decimals === 0 ? /^\d*$/ : new RegExp("^\\d*\\.?\\d{0," + decimals + "}$");
    if (v === "" || allowed.test(v)) {
      setAmount(v);
    }
  }
  const [payMethodOpen, setPayMethodOpen] = useState15(false);
  const requestClosePayMethod = useBackClose(payMethodOpen, () => setPayMethodOpen(false));
  const [payMethod, setPayMethod] = useState15(null);
  // What the pool still has today. Reactive to the ledger, so drawing on
  // it anywhere updates this row without a reload.
  const essentialsLeft = useEssentialsPoolRemaining(Number(essentialsDailyLimit) || 0);
  // How much Essentials actually carried of the payment in flight. Read
  // by the receipt; cleared whenever a new payment starts.
  const essentialsAppliedRef = useRef11(0);
  function handleSend() {
    // A payment of nothing is not a payment. Stopped before the pay-method
    // sheet and PIN, so nobody is asked to authorise it; completePayment and
    // the server both refuse it again, so this is not the only guard.
    if (!isPositivePaymentAmount(receiverAmount) || !isPositivePaymentAmount(senderAmount)) return;
    setPayMethod(null);
    setPayMethodOpen(true);
  }
  async function choosePayMethod(label) {
    // ── THE ONE METHOD THAT DOES SOMETHING BEFORE THE PIN ──────────
    //
    // Essentials is not a separate place money leaves from. Choosing it
    // tops this account's own bank balance up by whatever the pool has
    // left today, and then the payment proceeds from the bank exactly
    // as it would have anyway — one source of funds, one deduction, one
    // row in the ledger.
    //
    // Applied HERE rather than after the PIN because the top-up has to
    // be real bank balance by the time the payment's own risk check
    // runs. It is not a charge: if the person backs out at the PIN, the
    // money sits in their bank account where the pool put it, which is
    // the honest outcome of "Gloobal credited you today" and is exactly
    // what the standing-top-up design always did.
    if (label === ESSENTIALS_PAY_METHOD && onDrawEssentials) {
      const drawn = await onDrawEssentials(senderAmount);
      essentialsAppliedRef.current = Number(drawn && drawn.applied) || 0;
      if (essentialsAppliedRef.current > 0) {
        showToast2(`${geuLensBarMoney(essentialsAppliedRef.current, top.currency, lens, top.currency)} from your Essentials`);
      } else {
        // Nothing left in the pool today. Say so rather than letting the
        // payment proceed as though Essentials had carried part of it.
        showToast2("Nothing left in your Essentials today — paying from your bank");
      }
    } else {
      essentialsAppliedRef.current = 0;
    }
    setPayMethod(label);
    requestClosePayMethod();
    setPin("");
    setPinError(false);
    setPinOpen(true);
  }
  function closePin() {
    clearTimeout(pinErrorTimer.current);
    setPinOpen(false);
    setPin("");
    setPinError(false);
  }
  return <div className="app-shell"><style>{`
        * { box-sizing: border-box; }
        .app-shell {
          max-width: 430px;
          margin: 0 auto;
          background: radial-gradient(120% 60% at 50% -10%, #F8F7FC 0%, #F1F0F7 55%, #ECEAF4 100%);
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 24px 18px 40px;
          position: relative;
          -webkit-font-smoothing: antialiased;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .icon-btn {
          width: 44px;
          height: 44px;
          border-radius: 15px;
          background: #f4f2fb;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4633C7;
          cursor: pointer;
          transition: transform 0.12s ease, background 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 1px 2px rgba(20,18,43,0.04);
        }
        .icon-btn:hover { background: #ece6fb; }
        .icon-btn:active { transform: scale(0.92); background: #e0d8f7; }
        .icon-btn.circle {
          border-radius: 50%;
          background: #fff;
          border: 1.6px solid #7c3aed;
          color: #7c3aed;
          width: 40px;
          height: 40px;
          box-shadow: 0 2px 8px rgba(124,58,237,0.14);
        }
        .icon-btn:focus-visible, .collapse-btn:focus-visible, .copy-btn:focus-visible,
        .currency-select:focus-visible, .swap-btn:focus-visible, .send-btn:focus-visible {
          outline: 2px solid #7c3aed; outline-offset: 2px;
        }
        .title { font-size: 21px; font-weight: 700; color: #14122B; letter-spacing: -0.01em; }

        .search-bar {
          display: flex;
          align-items: center;
          background: #fff;
          border-radius: 999px;
          padding: 13px 14px 13px 16px;
          gap: 12px;
          margin-bottom: 18px;
          border: 1px solid #ECECF3;
          box-shadow: 0 2px 10px rgba(20,18,43,0.04);
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
          cursor: pointer;
        }
        .search-bar:hover { border-color: #E1DCF2; }
        .search-bar:focus-visible { border-color: #d8d2ee; box-shadow: 0 2px 14px rgba(124,58,237,0.12); }
        .search-bar-active { border-color: #d8d2ee; box-shadow: 0 2px 14px rgba(124,58,237,0.1); }
        .search-bar > svg:first-child { color: #7c3aed; flex-shrink: 0; }
        .search-bar-text {
          flex: 1;
          min-width: 0;
          font-size: 13px;
          font-weight: 600;
          color: #14122B;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          text-align: center;
        }
        .search-mode-toggle {
          flex-shrink: 0;
          width: 32px; height: 32px; border-radius: 50%;
          background: #f4f2fb; border: none; color: #7c3aed;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: transform 0.15s ease, background 0.15s ease;
        }
        .search-mode-toggle:hover { background: #ece6fb; }
        .search-mode-toggle:active { transform: scale(0.88) rotate(180deg); }

        .dial-entry { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 4px; }
        .dial-entry-label { font-size: 13px; font-weight: 700; color: #6B6580; margin: 0 0 14px; text-align: center; }

        .flag-chip-wrap { position: relative; display: inline-flex; flex-shrink: 0; }
        .flag-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 12px;
          background: #fff;
          box-shadow: inset 0 0 0 1px rgba(20,18,43,0.08), 0 1px 3px rgba(20,18,43,0.08);
          overflow: hidden;
        }
        .flag-chip.lg { width: 52px; height: 40px; font-size: 22px; border-radius: 13px; }
        .flag-chip.md { width: 30px; height: 23px; font-size: 13px; border-radius: 7px; }
        .flag-chip.sm { width: 24px; height: 18px; font-size: 11px; border-radius: 6px; }
        .flag-badge {
          position: absolute; bottom: -5px; right: -6px;
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #fff; border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(20,18,43,0.18);
        }
        .flag-badge.send { background: #7c3aed; }
        .flag-badge.receive { background: #16A34A; }

        .card {
          background: #fff;
          border-radius: 28px;
          padding: 20px;
          box-shadow: 0 1px 2px rgba(20,18,43,0.03), 0 10px 30px -12px rgba(20,18,43,0.10);
          border: 1px solid rgba(20,18,43,0.03);
          position: relative;
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
        }
        .card-header-left { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .card-name {
          font-size: 14.5px;
          font-weight: 700;
          color: #14122B;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .collapse-btn {
          background: #F7F6FB;
          border: none;
          color: #7c3aed;
          cursor: pointer;
          display: flex;
          padding: 7px;
          border-radius: 10px;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .collapse-btn:hover { background: #f4f2fb; }
        .collapse-btn:active { transform: scale(0.85); }

        .contact-block { overflow: hidden; transition: max-height 0.25s ease; }
        .contact-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 2px; }
        .contact-icon {
          width: 36px; height: 36px; border-radius: 11px;
          background: #f4f2fb; color: #7c3aed;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          box-shadow: inset 0 0 0 1px rgba(124,58,237,0.06);
        }
        .contact-icon.green { background: #E1F5E7; color: #16A34A; box-shadow: inset 0 0 0 1px rgba(22,163,74,0.08); }
        .contact-text {
          flex: 1; font-size: 15px; font-weight: 600; color: #14122B;
          letter-spacing: 0.01em; font-variant-numeric: tabular-nums;
        }
        .copy-btn {
          background: transparent; border: none; color: #C2C0D4; cursor: pointer;
          display: flex; padding: 7px; border-radius: 9px;
          transition: color 0.15s ease, transform 0.15s ease, background 0.15s ease;
        }
        .copy-btn:hover { background: #F7F6FB; color: #8B899E; }
        .copy-btn:active { transform: scale(0.85); }
        .copy-btn.copied { color: #16A34A; }
        .copy-btn.copied:hover { background: #E9FBF0; color: #16A34A; }

        .divider { height: 1px; background: #EFEFF5; margin: 6px 0 14px; }

        .rate-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px; padding: 0 2px;
        }
        .rate-left {
          display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 600;
          color: #14122B; font-variant-numeric: tabular-nums;
        }
        .live-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #22C55E; flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.15);
          animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.15); }
          50% { box-shadow: 0 0 0 5px rgba(34,197,94,0.22); }
        }
        .live-text { display: flex; align-items: center; gap: 4px; color: #16A34A; font-size: 14px; font-weight: 700; }
        .live-pill {
          display: flex; align-items: center; gap: 4px; background: #DCFCE7; color: #16A34A;
          font-size: 12.5px; font-weight: 700; padding: 5px 11px; border-radius: 999px; flex-shrink: 0;
        }

        .amount-box { border-radius: 20px; padding: 16px 18px; transition: box-shadow 0.15s ease; }
        .amount-box.indigo { background: linear-gradient(155deg, #EFEDFC, #E7E4FB); box-shadow: inset 0 0 0 1px rgba(124,58,237,0.06); }
        .amount-box.indigo:has(.amount-input:focus) { box-shadow: inset 0 0 0 1.5px rgba(124,58,237,0.35); }
        .amount-box.green { background: linear-gradient(155deg, #EEF9F1, #E5F6EA); box-shadow: inset 0 0 0 1px rgba(22,163,74,0.06); }

        .amount-input {
          border: none; background: transparent; font-size: 27px; font-weight: 800;
          color: #14122B; width: 100%; outline: none; padding: 0; font-family: inherit;
          letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
        }
        .amount-input::placeholder { color: #B9B6D6; }

        .amount-top-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .amount-display {
          font-size: 24px; font-weight: 800; color: #16A34A;
          letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
        }

        .currency-select {
          display: flex; align-items: center; justify-content: center; margin-top: 8px;
          width: 30px; height: 30px;
          background: rgba(255,255,255,0.65); border: none; cursor: pointer;
          color: #14122B; padding: 0;
          border-radius: 50%; transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
          box-shadow: 0 1px 2px rgba(20,18,43,0.05);
        }
        .currency-select:hover { background: rgba(255,255,255,0.95); box-shadow: 0 2px 6px rgba(20,18,43,0.1); }
        .currency-select:active { transform: scale(0.9); }

        .bottom-meta-row { display: flex; align-items: center; justify-content: flex-start; margin-top: 12px; }

        .dropdown-overlay { position: fixed; inset: 0; z-index: 40; }
        .dropdown-menu {
          position: absolute; z-index: 50; top: calc(100% + 8px); left: 0;
          background: #fff; border-radius: 18px; box-shadow: 0 16px 40px -8px rgba(20,18,43,0.22);
          padding: 7px; min-width: 148px; border: 1px solid rgba(20,18,43,0.05);
          max-height: 300px; overflow-y: auto;
        }
        .dropdown-item {
          display: flex; align-items: center; gap: 10px; padding: 9px 10px;
          border-radius: 11px; cursor: pointer; font-size: 14.5px; font-weight: 600; color: #14122B;
          background: transparent; border: none; width: 100%; text-align: left;
          transition: background 0.12s ease;
        }
        .dropdown-item:hover { background: #F3F2F8; }
        .dropdown-item.active { color: #7c3aed; background: #f4f2fb; }

        .country-menu {
          position: absolute; z-index: 50; top: calc(100% + 10px); left: 0;
          background: #fff; border-radius: 16px; box-shadow: 0 16px 40px -8px rgba(20,18,43,0.22);
          padding: 6px; border: 1px solid rgba(20,18,43,0.05);
          display: flex; flex-direction: column;
          /* Wide enough for the longest country name beside its dial
             code, and capped so it cannot run off a narrow phone. Scrolls
             on ONE axis: the grid it replaced overflowed sideways by 2px
             and grew a horizontal scrollbar for the privilege. */
          width: min(300px, calc(100vw - 72px));
          max-height: 300px; overflow-y: auto; overflow-x: hidden;
          overscroll-behavior: contain;
        }
        .country-row {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 9px 10px; border: none; border-radius: 10px;
          background: transparent; cursor: pointer; text-align: left;
          transition: background 0.12s ease;
        }
        .country-row:hover { background: #F3F2F8; }
        .country-row.active { background: #F4F2FB; }
        .country-flag {
          width: 26px; height: 20px; border-radius: 4px; overflow: hidden;
          flex-shrink: 0; box-shadow: 0 0 0 1px rgba(20,18,43,0.08);
        }
        .country-name {
          flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; color: #14122B;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .country-row.active .country-name { color: #7c3aed; font-weight: 800; }
        .country-live {
          width: 6px; height: 6px; border-radius: 50%; background: #22C55E; flex-shrink: 0;
        }
        .country-soon {
          font-size: 10px; font-weight: 700; color: #9C96AF; flex-shrink: 0;
          white-space: nowrap; letter-spacing: 0.2px;
        }
        .country-code {
          font-size: 12.5px; font-weight: 700; color: #6B6580; flex-shrink: 0;
          font-variant-numeric: tabular-nums; min-width: 42px; text-align: right;
        }
        .country-empty {
          padding: 16px 12px; font-size: 12.5px; color: #9C96AF;
          font-weight: 600; line-height: 1.5; text-align: center;
        }

        .swap-wrap { display: flex; justify-content: center; margin: -22px 0; position: relative; z-index: 6; }
        .swap-btn {
          width: 46px; height: 46px; border-radius: 50%;
          background: linear-gradient(180deg, #ffffff, #fbfaff);
          border: 1px solid #ECECF3; box-shadow: 0 6px 18px -4px rgba(124,58,237,0.22), 0 1px 2px rgba(20,18,43,0.06);
          display: flex; align-items: center; justify-content: center; color: #7c3aed;
          cursor: pointer; transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.15s ease;
        }
        .swap-btn:hover { box-shadow: 0 8px 22px -4px rgba(124,58,237,0.3), 0 1px 2px rgba(20,18,43,0.06); }
        .swap-btn:active { transform: scale(0.88) rotate(180deg); }

        .send-btn {
          width: 100%; margin-top: 22px; border: none; border-radius: 999px; padding: 18px;
          font-size: 16.5px; font-weight: 700; color: #fff; letter-spacing: 0.01em;
          background: linear-gradient(100deg, #3b6ef5, #7b5bf0, #7c3aed);
          display: flex; align-items: center; justify-content: center; gap: 10px;
          cursor: pointer; box-shadow: 0 12px 28px -6px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
          transition: transform 0.12s ease, box-shadow 0.15s ease;
        }
        .send-btn:hover { box-shadow: 0 14px 32px -6px rgba(124,58,237,0.46), inset 0 1px 0 rgba(255,255,255,0.15); }
        .send-btn:active { transform: scale(0.98); }

        .toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: #14122B; color: #fff; padding: 12px 18px; border-radius: 14px;
          font-size: 13.5px; font-weight: 600; max-width: 90%; text-align: left;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 100;
          animation: toast-in 0.2s ease;
          display: flex; align-items: center; gap: 9px;
        }
        .toast-icon {
          width: 20px; height: 20px; border-radius: 50%; background: rgba(34,197,94,0.18);
          color: #4ADE80; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        @keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

        .pin-overlay {
          position: fixed; inset: 0; background: rgba(20,18,43,0.55);
          display: flex; align-items: flex-end; justify-content: center;
          z-index: 200; animation: overlay-in 0.2s ease;
        }
        @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
        .pin-modal {
          width: 100%; max-width: 430px; background: #fff;
          border-radius: 28px 28px 0 0; padding: 28px 24px 36px;
          position: relative; animation: sheet-up 0.28s cubic-bezier(.32,.72,0,1);
        }
        @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .pin-close {
          position: absolute; top: 16px; right: 16px; width: 34px; height: 34px;
          border-radius: 50%; background: #F7F6FB; border: none; color: #8B899E;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: background 0.15s ease;
        }
        .pin-close:hover { background: #EFEDF6; }
        .pin-lock-icon {
          width: 52px; height: 52px; border-radius: 16px; background: #f4f2fb; color: #7c3aed;
          display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
        }
        .pin-title { text-align: center; font-size: 18px; font-weight: 700; color: #14122B; margin: 0 0 6px; }
        .pin-sub { text-align: center; font-size: 13.5px; color: #8B899E; margin: 0 0 28px; font-weight: 500; line-height: 1.4; }
        .pin-dots { display: flex; justify-content: center; gap: 18px; margin-bottom: 32px; }
        .pin-dots.shake { animation: pin-shake 0.4s ease; }
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .pin-dot { width: 14px; height: 14px; border-radius: 50%; background: #E4E1F0; transition: background 0.15s ease, transform 0.15s ease; }
        .pin-dot.filled { background: #7c3aed; transform: scale(1.1); }
        .pin-dot.filled.error { background: #EF4444; }
        .pin-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 280px; margin: 0 auto; }
        .pin-key {
          aspect-ratio: 1; border-radius: 50%; border: none; background: #F7F6FB;
          font-size: 22px; font-weight: 600; color: #14122B; font-variant-numeric: tabular-nums;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: background 0.12s ease, transform 0.1s ease;
        }
        .pin-key:hover { background: #f4f2fb; }
        .pin-key:active { transform: scale(0.9); background: #ece6fb; }
        .pin-key.empty { background: transparent; cursor: default; }
        .pin-key.empty:hover, .pin-key.empty:active { background: transparent; transform: none; }

        @media (prefers-reduced-motion: reduce) {
          .icon-btn, .collapse-btn, .copy-btn, .swap-btn, .send-btn, .toast, .live-dot,
          .pin-overlay, .pin-modal, .pin-dots, .pin-key { transition: none; animation: none; }
        }
      `}</style><SendMoneyAmbientBg /><div style={{ position: "relative", zIndex: 1 }}>{
    /* Header — back button on the left, and once a receiver's been
       found, a single flip icon on the right (opposite the
       navigation icon) that cycles BOTH the sender and receiver
       cards together through name → Gloobal ID → mobile number →
       country name. Replaces the old per-card flip button that used
       to sit on the found receiver card's own corner. */
  }<div className="header"><NavBackButton onClick={onClose} /><div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavIconButton onClick={openContactPicker} label="Choose from contacts"><ContactIcon size={17} color={T.ink} /></NavIconButton>{
    /* Scan, beside history, where the founder asked for it. Somebody on
       this screen is about to type twelve symbols they are reading off
       another phone; the code on that phone says the same thing and
       cannot be mistyped. */
  }{onOpenScan && <NavIconButton onClick={onOpenScan} label="Scan a Gloobal QR code"><ScannerIcon size={17} animated color={T.ink} /></NavIconButton>}<NavHistoryButton onClick={onOpenPaidHistory} label="Paid history" /></div></div>{searchStage !== "closed" && <>{bottomOpen && <>{
    /* RECEIVER CARD — now shown first/up top: their name/ID and
       the editable amount (in their currency) are what matters
       while searching and typing. Hosts the active search dial
       pad until a receiver's resolved, then the normal contact +
       editable amount UI. Hidden entirely (not just collapsed to
       a strip) whenever the sender card is the active side —
       the swap button is the only way to bring it back. */
  }<div className={searchStage === "found" ? "card card-flip-in" : "card"}><div
    style={{
      position: "absolute",
      top: -11,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#fff",
      padding: 3,
      borderRadius: "50%",
      zIndex: 1
    }}
  ><GH2HFlipCircle size={22} /></div><div style={{ height: 14 }} aria-hidden="true" />{
    /* Switches the recipient search between Gloobal ID and phone
       number.

       This was a <span aria-hidden="true"> with no onClick: it looked
       like a control, and toggleSearchMode was defined and ready, but
       nothing ever called it. Tapping did nothing, and because the mode
       could never leave "id", the entire phone-number path below —
       country picker, dial-code tag, PhoneDialPad — was unreachable.
       That is why the flip "did not work" AND the mobile option was
       "missing": one unbound handler, two symptoms.

       Now a real button: labelled, reachable by keyboard, and it says
       which mode it will switch to rather than being decoration. */
  }{searchStage === "dialing" && <button
    type="button"
    onClick={toggleSearchMode}
    aria-label={searchMode === "id" ? "Search by phone number instead" : "Search by Gloobal ID instead"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -14,
      right: -10,
      minWidth: 40,
      height: 40,
      padding: "0 10px",
      borderRadius: 999,
      border: "1px solid rgba(20,18,43,0.06)",
      background: "#fff",
      color: "#7c3aed",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(20,18,43,0.12)",
      zIndex: 3
    }}
  ><RefreshCw4 size={18} style={{ transform: searchMode === "mobile" ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }} /><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3 }}>{searchMode === "id" ? "ID" : "TEL"}</span></button>}<div className="card-header"><div className="card-header-left" style={{ position: "relative", flex: searchStage === "dialing" ? 1 : void 0 }}>{searchStage === "dialing" ? <div style={{ position: "relative", flexShrink: 0 }}><button
    onClick={() => setCountryDropdownOpen((o) => !o)}
    aria-label={`Country: ${effectiveSearchCountry.name}. Tap to search for someone outside your own country`}
    className="v2-tap"
    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex" }}
  ><Flag emoji={bottom.flag} size="lg" badge="receive" /></button>{
    /* Dial code tucked behind the flag as a small tag —
       mobile-only, since a Gloobal ID has no dial code
       of its own. */
  }{searchMode === "mobile" && <span
    style={{
      position: "absolute",
      top: -6,
      left: -8,
      background: "#14122B",
      color: "#fff",
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: 0.2,
      padding: "2px 5px",
      borderRadius: 999,
      border: "2px solid #fff",
      boxShadow: "0 2px 6px rgba(20,18,43,0.18)",
      pointerEvents: "none",
      whiteSpace: "nowrap"
    }}
  >{effectiveSearchCountry.dialCode}</span>}</div> : <Flag emoji={bottom.flag} size="lg" badge="receive" />}{searchStage === "found" ? <span className="card-name">{identityDisplayValue(bottom, foundDisplayMode)}</span> : bottom.name && <span className="card-name">{bottom.name}</span>}{
    /* "Gloobal ID" label, aligned with the flag on the header
       row — the chip row + dial pad below already echo what's
       typed, so this is just the field label, not an input. */
  }{searchStage === "dialing" && searchMode === "id" && <span style={{ fontSize: 14.5, fontWeight: 700, color: "#14122B" }}><GloobalWordmark suffix=" ID" /></span>}{
    /* Country field beside the flag while dialing in mobile
       mode — a real typeable search, same country/code
       matching every other country picker in the app uses,
       not just a static label. Typing filters the dropdown
       below live; tapping the flag opens it too. */
  }{searchStage === "dialing" && searchMode === "mobile" && <div
    style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      alignItems: "center",
      gap: 9,
      background: "#fff",
      border: "1px solid #ECECF3",
      borderRadius: 999,
      padding: "9px 13px",
      boxShadow: "0 2px 10px rgba(20,18,43,0.04)"
    }}
  ><input
    value={searchCountryQuery}
    onChange={(e) => {
      setSearchCountryQuery(e.target.value);
      setCountryDropdownOpen(true);
    }}
    onFocus={() => setCountryDropdownOpen(true)}
    placeholder={effectiveSearchCountry.name}
    aria-label="Search country or code"
    style={{
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "none",
      fontSize: 13,
      fontWeight: 600,
      color: "#14122B"
    }}
  /><ChevronDown2 size={14} style={{ color: "#9C96AF", flexShrink: 0 }} /></div>}{countryDropdownOpen && <><div className="dropdown-overlay" onClick={() => setCountryDropdownOpen(false)} />{
    /* ── A LIST, NOT A WALL OF FLAGS ──────────────────────────────────

       This was a six-column grid of 194 unlabelled flags, 33 rows deep,
       with a red or green halo around each one. Three things were wrong
       with it, and the search made all three worse.

       You could not tell what you were picking. Typing "ind" left two
       flags side by side with no names — India and Indonesia, and no way
       to know which was which without recognising both at 26 pixels.

       The halos read as errors. Green meant Gloobal operates there and
       red meant it does not, which is worth saying, but saying it as a
       red glow on 150 of the 194 made the whole panel look like a
       failure state.

       And it overflowed its own width: six 36px cells plus five 6px gaps
       plus padding came to 266px inside a 264px box, so the panel grew a
       horizontal scrollbar it could never usefully scroll.

       A row per country — flag, name, dial code — fixes all three and
       costs only vertical space, which this panel scrolls anyway. */
  }<div className="country-menu" role="listbox" aria-label="Choose a country">{filteredSearchCountries.length === 0 && <div className="country-empty">
      No country matches {"“"}{searchCountryQuery.trim()}{"”"}. Try its name, or its dialling code.
    </div>}{filteredSearchCountries.map((c) => {
    const live = ACTIVE_ISO_SET.has(c.iso);
    const chosen = c.iso === effectiveSearchCountry.iso;
    return <button
      key={c.iso}
      role="option"
      aria-selected={chosen}
      className={`country-row ${chosen ? "active" : ""}`}
      onClick={() => selectSearchCountry(c)}
      aria-label={`${c.name}${c.dialCode ? ` ${c.dialCode}` : ""}${live ? "" : " — not live yet"}`}
    ><span className="country-flag"><FlagEmoji flag={c.flag} width={26} height={20} /></span><span className="country-name">{c.name}</span>{
      /* Where Gloobal actually operates, said once and quietly. A dot
         for live, a word for not — rather than a coloured halo on every
         row, which is the same fact shouted 194 times. */
    }{!live && <span className="country-soon">
        not live yet
      </span>}{live && <span className="country-live" aria-hidden="true" />}<span className="country-code">{c.dialCode || ""}</span></button>;
  })}</div></>}</div>{searchStage === "found" && <button className="collapse-btn" onClick={() => setBottomOpen((o) => !o)} aria-label="Toggle details">{bottomOpen ? <ChevronUp2 size={20} /> : <ChevronDown2 size={20} />}</button>}</div>{searchStage === "dialing" && <div className="dial-entry">{searchMode === "id" ? <><SymbolChipRow length={ID_SEARCH_LENGTH} value={idBuffer} masked={false} /><div style={{ marginTop: 22, width: "100%" }}><SymbolDialPad value={idBuffer} onChange={(v) => { setSearchError(null); setIdBuffer(v); }} length={ID_SEARCH_LENGTH} /></div></> : <PhoneDialPad
    value={mobileBuffer}
    onChange={(v) => { setSearchError(null); setMobileBuffer(v); }}
    minLength={minMobileDigits}
    maxLength={maxMobileDigits}
  />}{
    /* Inline, under the pad it belongs to. The recipient either exists or
       the send cannot proceed, so this is part of the field rather than a
       transient toast that can be missed. */
  }{searchError && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 700, color: T.negative, textAlign: "center", lineHeight: 1.45 }}>{searchError}</div>}<SubmitButton
    onClick={resolveSearch}
    disabled={searchBusy || (searchMode === "id" ? idBuffer.length < ID_SEARCH_LENGTH : mobileBuffer.length < minMobileDigits)}
    label={searchBusy ? "Checking…" : "Search"}
  /></div>}{
    /* Recent — the last five payments sent from this account, shown
       only while still choosing who to pay (searchStage "dialing"):
       once a receiver's found the screen is about THAT payment, not a
       browsing list. Read-only on purpose — this states what already
       happened rather than offering a shortcut to repeat it, since a
       repeat-send would need the receiver's live currency/registration
       state this snapshot doesn't carry. */
  }{searchStage === "dialing" && recentSentTransactions.length > 0 && <div style={{ marginTop: 20 }}><div style={{ fontSize: 12, fontWeight: 800, color: "#8B899E", textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 10px 4px" }}>
              Recent
            </div><div className="card" style={{ padding: "6px 18px 10px" }}>{recentSentTransactions.map((t, i) => <TransactionRow
    key={t.txnId || `${t.name}-${t.date}-${i}`}
    t={t}
    color={TXN_OUT_COLOR}
    sign="&#8722;"
    // The ACCOUNT's currency, as the fallback only.
    //
    // This list used to format every row with `top.currency` outright, and
    // that is the ₹478,000-shown-as-$478,000 bug, still alive in this one
    // list after it was fixed everywhere else: these rows come straight off
    // `history`, and a restored cross-border payment whose sender-side debit
    // was never recorded honestly keeps the RECEIVER's figure (see
    // mapServerTransaction). Printing that figure with the sender's symbol
    // relabels somebody's rupees as dollars. TransactionRow prefers the
    // row's own currency and falls back to this one, so a domestic row is
    // unchanged and a foreign one now says what it actually is.
    ccyCode={top.currency}
    isFirst={i === 0}
    // The card pads itself; these rows sit flush inside it.
    inset={0}
    // Tapping a row opens that payment's receipt — NOT a repeat-send.
    //
    // This list was read-only, and the reason given for it holds: a
    // repeat-send would need the receiver's live currency and registration
    // state that a history snapshot does not carry, so offering one here
    // would be offering to send money on stale facts. A receipt moves
    // nothing and is built entirely from the row, so it is the one thing
    // this list can honestly do on a tap.
    //
    // Every row here is a payment this account SENT — the list is
    // `history` — so the direction is constant.
    onSelect={onBuildRowReceipt && rowHasReceipt(t) ? () => {
      const built = onBuildRowReceipt(t, "sent");
      if (built) setPastReceipt(built);
    } : undefined}
  />)}</div></div>}{searchStage === "found" && bottomOpen && <>{bottom.registered === false && <div
    role="alert"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      margin: "0 0 12px",
      padding: "10px 12px",
      borderRadius: 12,
      background: "#FEF3C7",
      border: "1px solid #F5D68A",
      color: "#8A5A00",
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.35
    }}
  ><span aria-hidden="true">⚠️</span><span>Not a registered Gloobal account. This send won't reach the backend or move any real money — it stays a local simulation only.</span></div>}<div className="contact-block"><div className="contact-row"><span className="contact-text">{bottom.phone}</span><button
    className="copy-btn"
    onClick={() => showToast2("Calling \u2014 coming soon")}
    aria-label="Call"
  ><Phone2 size={17} /></button></div><div className="contact-row"><span className="contact-text"><ColoredGloobalId id={bottom.id} /></span><button
    className={`copy-btn ${copiedKey === "bottom-id" ? "copied" : ""}`}
    onClick={() => handleCopy(bottom.id, "bottom-id")}
    aria-label="Copy ID"
  >{copiedKey === "bottom-id" ? <Check3 size={17} /> : <Copy3 size={17} />}</button></div></div>{
    /* Creator Share — this is the RECEIVER's own rate, not
       something the sender picks, read straight from
       bottom.shareRate (set once when this receiver was found).
       Shown as a green or red dot only; the percentage itself is
       revealed on the scratch card after paying. */
  }<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>Creator Share</span>{
    /* A dot, not the rate. Green: this receiver shares something back.
       Red: they share nothing. The exact percentage is kept for the
       scratch card after the payment (PaymentUnlock), where it is revealed
       with the share it earned — so the sender still learns BEFORE paying
       whether anything comes back, just not how much. */
  }<span
    data-testid="share-dot"
    data-shares={(bottom.shareRate ?? 0) > 0 ? "yes" : "no"}
    role="img"
    aria-label={(bottom.shareRate ?? 0) > 0 ? "This receiver shares back — revealed after you pay" : "This receiver shares nothing back"}
    title={(bottom.shareRate ?? 0) > 0 ? "Shares back — scratch after paying to see how much" : "Shares nothing back"}
    style={{
      width: 14,
      height: 14,
      borderRadius: "50%",
      flexShrink: 0,
      marginRight: 7,
      background: (bottom.shareRate ?? 0) > 0 ? T.positive : T.negative,
      boxShadow: `0 0 0 5px ${(bottom.shareRate ?? 0) > 0 ? T.positiveSoft : T.negativeSoft}`
    }}
  /></div>{
    /* Editable — what the RECEIVER gets, in the receiver's own
       currency. What it costs the sender is on the Send button.

       This box lives inside the receiver's card and carries the
       receiver's symbol, so the figure and the currency beside
       it always belong to the same person.

       The symbol comes from `bottom.currency`, which is set from
       the payee's own account when they resolve — never from the
       sender's country, and never a hardcoded code. It is read
       straight off state rather than memoised, so changing the
       recipient re-renders it in the same paint.

       Starts genuinely empty; the placeholder is the receiver's
       own zero, so a yen payee shows "0" rather than "0.00". */
  }<div className="amount-box green" style={{ marginTop: 4, position: "relative" }}><input
    className="amount-input"
    value={amount}
    onChange={handleAmountChange}
    inputMode="decimal"
    placeholder={fmt(0, bottom.currency)}
    aria-label={`Amount the receiver gets, in their own currency (${bottom.currency})`}
  /><span
    style={{
      position: "absolute",
      top: 14,
      right: 16,
      fontSize: 20,
      fontWeight: 800,
      color: T.inkSoft,
      lineHeight: 1
    }}
    // The CODE, not the symbol, is what the spoken label carries, and the bar
    // is left out of it — U+2502 has no reliable spoken form. The eye gets
    // both names; the ear gets the one that identifies the money.
    aria-label={`Receiver's currency: ${bottom.currency} \u2014 fixed to their account, can't be changed`}
  >{(() => {
    // The receiver's currency is theirs, so `bottom.currency` is passed as
    // the figure's code and `top.currency` as the viewer's own — which is
    // what makes a foreign box read "GEU │ USD" rather than borrowing the
    // sender's symbol. See geuLensUnitPair.
    const pair = geuLensUnitPair(bottom.currency, lens, top.currency);
    if (!pair.lead) return CURRENCY_SYMBOL[bottom.currency] || bottom.currency;
    return <>{pair.lead}{pair.trail && <span
      style={{ fontSize: geuLensTrailSize(20), fontWeight: 800 }}
    > {GEU_LENS_BAR} {pair.trail}</span>}</>;
  })()}</span></div>{
    /* WHAT THIS PAYMENT IS FOR, under the box it belongs to.

       It spent a version inside the pay button, sharing a line with the
       figure and ellipsising itself to fit, and another stacked on a
       second line of that button. Here it has the card's full width, so
       the name wraps rather than truncating and is read in full — and
       the button is left with its verb and its figure, which is what
       that button is for. */
  }{pickedChoice && <div
    style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 12.5, color: T.inkSoft }}
  ><span style={{ fontWeight: 600, flexShrink: 0 }}>
      for
    </span>{
    /* THE CHOICE'S OWN FACE, which this line never showed.
       It said "for hosting" in plain text while the strip below drew
       every category as a photograph or an emoji on a coloured chip —
       so the one category actually attached to the payment was the only
       one on the screen with nothing to recognise it by. Worse when the
       chosen one is not among the four chips in view, which is exactly
       when this line is the only thing naming it.

       Blurred, not removed, when the names are hidden — the same
       treatment the chips get, for the same reason: shape and colour
       are enough to recognise your own, and nothing in a 20px smear
       identifies anybody to somebody reading across a counter. */
  }<span
    aria-hidden="true"
    style={{
      width: 22,
      height: 22,
      borderRadius: 7,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      filter: choiceNamesHidden ? "blur(3.5px)" : "none",
      transition: "filter 0.18s ease"
    }}
  ><ChoiceGlyph category={pickedChoice} size={14} /></span><span
    style={{ fontWeight: 800, color: T.ink, minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.35 }}
  >{
    /* HIDDEN, NOT REMOVED. The line still says a choice is attached —
       that the payment will be filed is worth knowing even when which
       one is not — and it keeps the same height either way, so the Pay
       button underneath does not move when the eye is tapped. */
  }{choiceNamesHidden ? <ChoiceNameMask size={13} line={17} seed={pickedChoice.id} /> : pickedChoice.name}</span><button
    onClick={handleToggleChoiceNames}
    className="v2-tap"
    aria-label={choiceNamesHidden ? "Show choice names" : "Hide choice names"}
    aria-pressed={choiceNamesHidden}
    style={{
      marginLeft: "auto",
      flexShrink: 0,
      alignSelf: "center",
      width: 26,
      height: 26,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0
    }}
  ><MaskEyeIcon open={!choiceNamesHidden} color={T.inkSoft} /></button></div>}</>}</div></>}{
    /* SWAP — only once a receiver's been found. Flips currency
       sides and, with it, which card is shown big vs as a strip.
       The search bar itself always looks up the receiver, no
       matter which card is currently in front. */
  }{searchStage === "found" && <div className="swap-wrap"><button className="swap-btn" onClick={handleSwap} aria-label="Flip sender and receiver cards"><ArrowUpDown2 size={20} /></button></div>}{
    /* SENDER CARD — hidden entirely (not shown as a collapsed
       strip) unless swapped to active, whether that's while
       searching, while typing the amount, or once a receiver's
       been found — matches the receiver card's own hide/reveal
       behavior. The swap button is the only way to bring it up. */
  }{topOpen && <div className="card card-flip-in" style={{ marginTop: searchStage === "dialing" ? 14 : 0 }}><div className="card-header"><div className="card-header-left"><Flag emoji={top.flag} size="lg" badge="send" /><span className="card-name">{searchStage === "found" ? identityDisplayValue(top, foundDisplayMode) : top.name}</span></div><button className="collapse-btn" onClick={() => setTopOpen((o) => !o)} aria-label="Toggle details">{topOpen ? <ChevronUp2 size={20} /> : <ChevronDown2 size={20} />}</button></div>{topOpen && <><div className="contact-block"><div className="contact-row"><span className="contact-text">{top.phone}</span><button
    className="copy-btn"
    onClick={() => showToast2("Calling \u2014 coming soon")}
    aria-label="Call"
  ><Phone2 size={17} /></button></div><div className="contact-row"><span className="contact-text"><ColoredGloobalId id={top.id} /></span><button
    className={`copy-btn ${copiedKey === "top-id" ? "copied" : ""}`}
    onClick={() => handleCopy(top.id, "top-id")}
    aria-label="Copy ID"
  >{copiedKey === "top-id" ? <Check3 size={17} /> : <Copy3 size={17} />}</button></div></div><div className="divider" /><div className="rate-row"><div className="rate-left"><span className="live-dot" /><span>
                      1 {top.currency} = {fmt(convert(1, top.currency, bottom.currency), bottom.currency)} {bottom.currency}</span></div>{
    /* "Indicative", not "Live".

       This rate comes from convert(), which reads the RATES table in
       backend/data/currencies.js — and that table's own header says it "has
       always been a static snapshot, not a live feed" and that the figures
       "are approximate". Nothing refreshes it; it changes when somebody
       edits the file.

       So the word Live, in green, under a lightning bolt, was a claim about
       money that was not true. The rate that will actually be applied is
       struck by the server when the payment is made, and the receipt prints
       that one — which is why the two can differ, and why this one has to
       say what it is. The figure is unchanged; only the claim about it is. */
  }<span className="live-text" style={{ color: T.inkSoft }}>Indicative</span></div>{
    /* Read-only — the exact amount that will be debited from
       the sender's own account, converted from the figure the
       receiver is being sent above. Shown large since it's the
       number that matters before paying.

       This card is the SENDER's, so it states the sender's side.
       It used to read "Receiver gets" and quote the converted
       figure, which was right while the box above held the
       sender's own amount; now that the box holds the receiver's,
       that caption would have printed the typed number back at
       the person under a different heading and never shown them
       what it costs. */
  }<div className="amount-box indigo"><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.accent, marginBottom: 6 }}>
                    You pay
                  </div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span
    style={{
      fontSize: 34,
      fontWeight: 800,
      color: "#14122B",
      letterSpacing: "-0.01em",
      fontVariantNumeric: "tabular-nums"
    }}
  >{fmt(senderAmount, top.currency)}</span><span
    style={{
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: "6px 11px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.65)",
      fontSize: 13,
      fontWeight: 800,
      color: T.ink,
      letterSpacing: 0.2,
      flexShrink: 0
    }}
    aria-label={`Your currency: ${top.currency} \u2014 fixed to your account, can't be changed`}
  >{top.currency}</span></div></div></>}</div>}{
    /* SEND BUTTON — just my own currency and amount now, nothing
       about what the receiver gets. */
  }{searchStage === "found" && <div style={{ marginTop: topOpen ? 0 : 20 }}><div
    style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.inkFaint, textTransform: "uppercase", marginBottom: 9 }}
  >
            My Choices <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>{"·"} optional</span>
          </div><div
    style={{ display: "flex", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2, scrollbarWidth: "none" }}
  >{sendChoices.map((category) => {
    const picked = String(choiceId || "") === String(category.id);
    return <button
      key={category.id}
      onClick={() => setChoiceId(picked ? null : category.id)}
      className="v2-tap"
      // The label a screen reader speaks is a name being said out
      // loud in the same room, so it masks with the rest.
      aria-label={choiceNamesHidden
        ? (picked ? "Hidden choice — chosen, tap to clear" : "Hidden choice")
        : (picked ? `${category.name} — chosen, tap to clear` : category.name)}
      aria-pressed={picked}
      style={{ position: "relative", flexShrink: 0, width: 62, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
    ><span
      style={{
        position: "relative",
        width: 56,
        height: 56,
        borderRadius: choicesCornerCss(category.shape, 18),
        background: choicesTint(category.color),
        // ── THE EDGE BELONGS TO THE BUDGET ────────────────────────────
        //
        // This used to go violet when the chip was chosen, which put
        // two concentric rings on a 56px circle saying two different
        // things: one "this is the one you picked", one "this is how
        // much is left". At that size nobody can tell which is which,
        // and the budget is the one that cannot be shown any other way.
        //
        // So chosen is said by the tick below and by the label going
        // bold violet, and the edge has one meaning again. The border
        // STAYS at 2.5px transparent rather than being removed: the
        // stroke's radius is the chip's 18 less this border, because
        // box-sizing is border-box here and the overlay covers the
        // padding box. Taking it away would move the stroke.
        border: "2.5px solid transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden"
      }}
    >{
      /* BLURRED, NOT REPLACED. The photographs are how a person finds
         their own choice in a row of four, so they stay — shape,
         colour and a soft impression of the picture are enough to pick
         from at arm's length, and none of it identifies anybody to
         somebody reading across a counter.

         Applied here rather than to the chip, so the budget stroke
         drawn below stays sharp: a blurred edge would be a blurred
         figure. */
    }<span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        filter: choiceNamesHidden ? "blur(5px)" : "none",
        transition: "filter 0.18s ease"
      }}
    ><ChoiceGlyph category={category} size={25} /></span>{(() => {
      // The same budget stroke the grid tiles carry, on the chip. This
      // strip is where a category is chosen for a payment about to
      // happen, which is the moment "how much is left on this one"
      // matters most — and it was the one place showing a category
      // without showing that.
      //
      // Smaller numbers than the grid for a smaller box: a 4px stroke,
      // and a radius of the chip's 18 less its 2.5px border, since
      // box-sizing is border-box here and the overlay covers the
      // padding box rather than the border one.
      const totals = choicesTotalIn(category, top.currency);
      const budget = choicesBudgetProgress(totals.thisMonth, category.monthlyBudget);
      return <ChoiceBudgetEdge
        fraction={budget ? budget.fraction : null}
        over={Boolean(budget && budget.over)}
        // The same stroke colour the grid tile uses, so a category is
        // recognisable by it on both surfaces.
        color={choicesBarColor(category.barColor)}
        shape={category.shape}
        radius={15.5}
        // The chip is a fixed 56px, so unlike the grid tile it does not
        // have to measure anything — but it follows the same fraction
        // the tile does. 56 * 0.026 rounds to 1.5, which is too fine to
        // survive a round linecap on a curve, so it is floored at 2.
        stroke={2}
      />;
    })()}</span>{
      /* CHOSEN. Outside the chip's own span, which clips to its radius
         — a badge inside would be cut in half on the rounder shapes.
         The chip is 56 centred in a 62 button, so its top-right corner
         is 3px in from this edge. */
    }{picked && <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: -2,
        right: 0,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: T.accent,
        border: `2px solid ${T.bg}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    ><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}<span
      style={{
        fontSize: 11.5,
        fontWeight: picked ? 800 : 700,
        color: picked ? T.accent : T.inkSoft,
        textAlign: "center",
        maxWidth: 62,
        // Two lines, then clip. One line with an ellipsis turned "Damroo
        // Baby" into "Damroo …", which names nothing — the whole point of
        // the strip is recognising your own category at a glance, and the
        // half that got cut is usually the half that distinguishes it.
        // Widening the chip instead would push "All" off the end of the
        // row, which is worse: that is the way in to the rest of them.
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        lineHeight: 1.25,
        wordBreak: "break-word"
      }}
      // Masked with the same character the line under the amount uses,
      // so one control reads as one control.
      title={choiceNamesHidden ? void 0 : category.name}
    >{choiceNamesHidden ? <ChoiceNameMask size={15} seed={category.id} /> : category.name}</span></button>;
  })}<button
    onClick={() => setChoicesOpen(true)}
    className="v2-tap"
    aria-label="All my choices"
    style={{ flexShrink: 0, width: 62, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
  ><span
    style={{ width: 56, height: 56, borderRadius: 18, background: T.surface, border: `2.5px solid ${T.accentSoft}`, display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Plus6 size={24} color={T.accent} strokeWidth={2.4} /></span><span
    style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft }}
  >
            All
          </span></button></div>{
    /* What this choice has left this month, when it has a budget at all.
       choicesBudgetProgress returns null for a budget of 0 — "no budget"
       is not "a budget that is fully spent". */
  }{(() => {
    if (!pickedChoice) return null;
    const totals = choicesTotalIn(pickedChoice, top.currency);
    const budget = choicesBudgetProgress(totals.thisMonth, pickedChoice.monthlyBudget);
    if (!budget) return null;
    const parts = geuLensBarParts(budget.over ? budget.used - budget.limit : budget.left, top.currency, lens, top.currency);
    // The name is stated under the amount box now, so this line is only
    // about the budget rather than repeating which category it belongs to.
    return <div style={{ fontSize: 11, color: T.inkFaint, marginTop: 8 }}><span
      style={{ fontWeight: 700, color: budget.over ? T.negative : T.inkSoft, whiteSpace: "nowrap" }}
    >{parts.lead}{parts.trail && <span style={{ fontSize: geuLensTrailSize(11) }}> {parts.trail}</span>}</span>{budget.over ? " over this month" : " left this month"}</div>;
  })()}</div>}{
    /* The whole section, reached from the strip's "All". Rendered here
       rather than handed up to the Dashboard because everything it can do
       ends by coming back to this screen with a choice picked — including
       its own "Pay for X", which on this screen means "file what I am
       already sending under X". */
  }{choicesOpen && <ChoicesScreen
    onClose={() => setChoicesOpen(false)}
    onToast={setToast}
    history={history}
    ccyCode={top.currency}
    onPay={(category) => { if (category) setChoiceId(category.id); setChoicesOpen(false); }}
    onScan={(category) => { if (category) setChoiceId(category.id); setChoicesOpen(false); }}
  />}{searchStage === "found" && <button
    className="send-btn"
    onClick={handleSend}
    style={{ padding: "14px 18px", marginTop: topOpen ? 0 : 24 }}
  >{(() => {
    // The verb and the figure. No icon — it said nothing the word "Pay"
    // does not — and no category: that is named under the amount box,
    // where it has room to be read.
    //
    // STILL ONE NOWRAP SPAN. This button is a flex row with a 10px gap,
    // and anything split across two children puts that gap inside the
    // sentence: it has landed between a figure and its own currency
    // once, and between the verb and the figure once.
    const parts = geuLensBarParts(senderAmount, top.currency, lens, top.currency);
    const verb = bottom.registered === false ? "Simulate" : pickedChoice ? "Pay" : "Send";
    return <span style={{ whiteSpace: "nowrap" }}>{verb} {parts.lead}{parts.trail && <span
      style={{ fontSize: geuLensTrailSize(16), fontWeight: 800 }}
    > {parts.trail}</span>}</span>;
  })()}</button>}</>}{
    /* Funding source — the four ways a transfer can be paid. Picking
       one moves straight on to the OTP confirmation. */
  }{payMethodOpen && <div
    className="pin-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Choose how to pay"
    onClick={requestClosePayMethod}
  ><div className="pin-modal" onClick={(e) => e.stopPropagation()}><button className="pin-close" onClick={requestClosePayMethod} aria-label="Cancel"><X4 size={18} /></button><h3 className="pin-title">Pay with</h3><p className="pin-sub">{CURRENCIES[top.currency].label} {fmt(senderAmount, top.currency)}{top.currency !== bottom.currency && <> — they get {CURRENCY_SYMBOL[bottom.currency] || ""}{fmt(receiverAmount, bottom.currency)} {bottom.currency} at 1 {top.currency} = {fmt(convert(1, top.currency, bottom.currency), bottom.currency)} {bottom.currency}</>}{" "}
              to {bottom.phone}</p><div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6, textAlign: "left" }}>{[
    { key: "gbank", label: "Gloobal Bank", displayLabel: <GloobalWordmark suffix=" Bank" /> },
    {
      key: "gessentials",
      label: ESSENTIALS_PAY_METHOD,
      displayLabel: <GloobalWordmark suffix=" Essentials" />,
      // ── THE FIGURE STAYS HIDDEN HERE TOO ────────────────────────
      // The same figure the category screen masks behind a check. A
      // row reading "₹162 left today" in a sheet anyone can open
      // mid-payment would undo that masking in the one place the
      // phone is most likely to be visible to somebody else.
      // What it says instead is whether there is anything to draw on,
      // which is the only thing needed to choose.
      note: essentialsLeft > 0 ? "Covers what it can today" : "Nothing left today",
      disabled: !(essentialsLeft > 0)
    },
    { key: "gpaylater", label: "Gloobal PayLater", displayLabel: <GloobalWordmark suffix=" PayLater" /> },
    { key: "local", label: "Local Banks" }
  ].map(({ key, label, displayLabel, note, disabled }) => <button
    key={key}
    onClick={() => { if (!disabled) choosePayMethod(label); }}
    className="v2-tap"
    aria-disabled={disabled ? "true" : void 0}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: "100%",
      border: "1px solid #ECECF3",
      background: "#fff",
      borderRadius: 16,
      padding: "12px 14px",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.55 : 1,
      textAlign: "left"
    }}
  ><span
    style={{
      width: 40,
      height: 40,
      borderRadius: 13,
      flexShrink: 0,
      background: key === "gbank" ? payMethodBankColor : "#F1EDFB",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      transition: "background 0.4s ease"
    }}
  >{key === "gbank" ? <img src={G_LOGO_DATA_URI} alt="" style={{ width: 32, height: 32, objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : key === "gessentials" ? <EssentialsPayIcon size={19} color="#2E7A4F" /> : key === "gpaylater" ? <CreditCard4 size={19} color="#7C3AED" /> : key === "gcoin" ? <Coins3 size={19} color="#7C3AED" /> : <Landmark6 size={19} color="#7C3AED" />}</span><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 14, fontWeight: 700, color: "#14122B" }}>{displayLabel || label}</span>{note && <span style={{ fontSize: 11.5, color: "#8A84A0" }}>{note}</span>}</span><ChevronRight4 size={17} color="#B9B3CC" style={{ flexShrink: 0 }} /></button>)}</div></div></div>}{pinOpen && <div className="pin-overlay" role="dialog" aria-modal="true" aria-label="Enter OTP to confirm transfer"><div className="pin-modal"><button className="pin-close" onClick={requestClosePin} aria-label="Cancel"><X4 size={18} /></button><div className="pin-lock-icon"><Lock5 size={22} /></div><h3 className="pin-title">Enter OTP</h3>{
    /* Just the amount now, in a box — same "card holding the
       thing being verified" concept as registration's OTP
       screen (which shows the phone number in its own card),
       just showing the debit here instead of a long sentence.
       The G-H-2-H mark sits right on the box's own top edge. */
  }<div
    style={{
      position: "relative",
      margin: "18px 0 2px",
      padding: "14px 18px",
      borderRadius: T.radiusMd,
      border: `1px solid ${T.line}`,
      background: T.surfaceAlt,
      textAlign: "center"
    }}
  ><div
    style={{
      position: "absolute",
      top: -11,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      justifyContent: "center",
      background: T.surface,
      padding: 3,
      borderRadius: "50%",
      zIndex: 1
    }}
  ><GH2HFlipCircle size={22} /></div><div
    style={{
      marginTop: 14,
      fontSize: receiptAmountFontSize(`\u2212${geuLensBarMoney(senderAmount, top.currency, lens, top.currency)}`, 26),
      fontWeight: 800,
      color: T.negative,
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
  >
                <GeuFigure amount={senderAmount} currency={top.currency} lens={lens} sign="\u2212" size={receiptAmountFontSize(`\u2212${geuLensBarMoney(senderAmount, top.currency, lens, top.currency)}`, 26)} /></div></div>{
    /* Same dial pad used for PIN/OTP everywhere else in the app
       (registration, login) instead of this screen's own
       separate keypad — one PIN entry pattern app-wide. Reaching
       6 digits still auto-submits via the pin.length effect
       below, same as before. */
  }<div style={{ marginTop: 8 }}><PhoneDialPad
    value={pin}
    onChange={setPin}
    minLength={6}
    maxLength={6}
    masked={!pinRevealed}
    onToggleMask={() => setPinRevealed((v) => !v)}
  /></div></div></div>}{toast && <div className="toast">{toast.startsWith("Sending") && <span className="toast-icon"><Check3 size={12} strokeWidth={3} /></span>}<span>{toast}</span></div>}{
    /* The screen between "verified" and the receipt.
       `amount` is the SENDER's own figure — what actually leaves the
       balance — not the receiver's face value. On a cross-border payment the
       two are different numbers, and the one a person is waiting to lose is
       theirs. Same `senderAmount` the Send button and the ledger leg read.

       Through geuLensBarParts, like every other figure on this screen. It
       used to go through fmtMoney alone, which is why this was the one
       money line in the app with no "│ GEU" beside it — a screen somebody
       stares at for thirty seconds, naming the currency differently from
       the screen they just left and the receipt they are about to get. */
  }<PaymentProcessing
    status={transactionStatus}
    recipientName={bottom.name}
    amount={geuLensBarParts(senderAmount, top.currency, lens, top.currency)}
    receives={top.currency === bottom.currency
      ? null
      : geuLensBarParts(receiverAmount, bottom.currency, lens, top.currency)}
    flag={bottom.flag}
    reason={failureReason}
    onRetry={() => {
      // Straight back to the amount screen rather than re-posting from
      // here. Both failure paths returned before anything moved, and the
      // send needs a fresh idempotency key and a fresh verification — the
      // PIN was dropped when the attempt failed.
      setFailureReason(null);
      setTransactionStatus("idle");
    }}
    onClose={() => {
      setFailureReason(null);
      setTransactionStatus("idle");
    }}
  /><ReceiptModal
    receipt={receipt}
    onClose={requestCloseReceipt}
    onDone={() => {
      setReceipt(null);
      setTransactionStatus("idle");
      onClose();
    }}
    onRevealShare={unlock ? () => setUnlockOpen(true) : void 0}
    shareTabRequest={shareTabRequest}
  />{
    /* A past payment, opened from the Recent list. Its own modal, because
       closing it returns to the form rather than leaving Send Money — see
       pastReceipt. No onDone and no share offer: those belong to a payment
       just made, and this one was made earlier. */
  }<ReceiptModal receipt={pastReceipt} onClose={requestClosePastReceipt} />{unlock && unlockOpen && <PaymentUnlock
    receipt={unlock.receipt}
    onToast={showToast2}
    onClose={() => {
      // Closed at any face, and the offer goes with it: whether they
      // scratched, skipped or walked away, the share is on the Creator Share
      // tab from here on. Nobody is asked the same question twice.
      setUnlockOpen(false);
      setUnlock(null);
    }}
    onViewShareReceipt={() => {
      setUnlockOpen(false);
      setUnlock(null);
      setShareTabRequest((n) => n + 1);
    }}
  />}{
    /* Face ID + fingerprint — required after PIN, before the payment
       actually completes. Backing out just cancels the payment;
       nothing has been sent yet at this point. */
  }{showPayBiometric && <BiometricVerifyScreen
    onBack={() => setShowPayBiometric(false)}
    onVerify={handlePayBiometricVerify}
    scanning={payBiometricScanning}
  />}{
    /* The same screen, for the choice names. Deliberately the SAME
       component rather than a lighter one of its own: a second kind of
       "prove it's you" is a second thing to get wrong, and this one is
       already carrying a real payment. */
  }</div></div>;
}
var SendMoney_default = SendMoneyScreen;

