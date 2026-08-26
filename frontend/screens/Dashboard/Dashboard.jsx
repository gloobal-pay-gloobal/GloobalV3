// src/screens/Dashboard/Dashboard.jsx
import React3, { useState as useState14, useEffect as useEffect12, useRef as useRef10, useMemo as useMemo5 } from "react";
import {
  Search as Search3,
  User,
  CreditCard as CreditCard3,
  Coins as Coins2,
  Copy as Copy2,
  Check as Check2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Zap as Zap3,
  Lock as Lock4,
  X as X3,
  Shield as Shield3,
  ArrowLeft as ArrowLeft4,
  Landmark as Landmark5,
  Smartphone as Smartphone2,
  Globe2 as Globe22,
  Home as Home3,
  History as History5,
  Users2 as Users23,
  ArrowDown,
  RefreshCw as RefreshCw3,
  Share2 as Share22,
  Gift,
  Store as Store2,
  Info,
  TrendingUp as TrendingUp2,
  ArrowRight as ArrowRight2,
  PieChart,
  Pencil,
  BarChart3
} from "lucide-react";


// Bug fix / feature: the GH Score circle on the profile overview card used
// to be a small 76px corner accent, leaving most of the card's fixed
// (aspectRatio-driven) height empty purple background above the ID row
// pinned to its bottom. Sized up into a real hero element instead — see
// the card's own layout comment for why its height is fixed at all, and
// GH_ID_ROW_RESERVE below for how the ID row still avoids sitting under
// it at this larger size.
// Was 136. At that size the circle dominated the card and crowded the
// Gloobal ID row underneath it; 110 keeps it a hero element without the
// row having to fight it for the card's height.
// "12 Aug" for a date in the current year, "12 Aug 2025" once it is not —
// a year on every row is noise while every referral is recent, and missing
// on an old one is worse than redundant. Bad or missing input renders
// nothing rather than "Invalid Date".
// "SK" from "Sanjeev Kumar", "S" from "Sanjeev". First and LAST word, not
// the first two, so a middle name does not push the surname out. Returns ""
// for a nameless account, which the caller treats as "show nothing" rather
// than rendering an empty box with a stray letter in it.
function profileInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
function formatReferralJoinDate(value) {
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return "";
  const sameYear = when.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear();
  return when.toLocaleDateString(void 0, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}
var GH_HERO_CIRCLE_SIZE = 110;
// A small safety margin on the ID row's right edge — NOT sized to dodge
// the whole circle horizontally the way the original 68px reserve did.
// The card's own layout (fixed aspectRatio + justifyContent: flex-end,
// see the card's own comment) already keeps the row below the circle
// vertically, in the space that's clear underneath it; a full-width
// horizontal reserve was fighting that same clearance twice over, and at
// GH_HERO_CIRCLE_SIZE's larger size it would have choked the row down to
// single-digit-px dots — the opposite of "make the dots bigger." This
// stays purely to keep the row's last character from touching the card's
// rounded corner, not to route around the circle.
var GH_ID_ROW_RESERVE = 10;
// src/screens/Dashboard/Dashboard.jsx
function DashboardScreen({ dialCountry, onLogout, onOpenSend, onOpenBank, onOpenCoverage, onOpenScan, myGloobalId, creatorId, myName, openHistoryDirection, onConsumeOpenHistory, deepLinkTarget, onConsumeDeepLink, profilePhoto, onChangeProfilePhoto, sendHistory, receivedHistory = [], bankBalance, balanceUnavailable = false, assetSeeds, onPayBusiness, paylaterHistory, accountCreatedAt, onSettleAssetsToBank, onSettleReferralToBank, pendingOpenMyShare, onConsumePendingMyShare, essentialsIHaveEnough, onToggleEssentialsIHaveEnough, onShareRoleChange, onMyShareRateChange, onGloobalIdChange }) {
  const [balanceVisible, setBalanceVisible] = useState14(false);
  const [showBalanceBiometric, setShowBalanceBiometric] = useState14(false);
  const [balanceBiometricScanning, setBalanceBiometricScanning] = useState14(false);
  const [historyTab, setHistoryTab] = useState14("receiving");
  const [historyMethodFilter, setHistoryMethodFilter] = useState14("all");
  // Every guarded action on this screen goes through here. The gate is
  // requireBiometric() (frontend/hooks/useBiometric.js): a real WebAuthn
  // assertion against the passkey enrolled for this account, which on a
  // phone is the Face ID / Touch ID / fingerprint prompt.
  //
  // These five used to be a 700ms setTimeout that always succeeded, so the
  // prompt was an animation and the action behind it was never actually
  // gated. Now a refusal aborts: `run` is only reached when the device
  // check passed.
  //
  // The screen is closed on failure as well as success, because leaving a
  // "Verify" panel up after a refusal invites tapping it again with no new
  // information; the toast says what happened and the action can be
  // restarted deliberately.
  const runBiometricGate = async ({ scanning, setScanning, close, run, pinReason }) => {
    if (scanning) return;
    setScanning(true);
    // No symbolId passed on purpose: requireBiometric resolves it from the
    // account this device actually authenticated as. The myGloobalId prop
    // is the ID the person typed at registration, which is not necessarily
    // the one the backend settled on, and the passkey is stored against
    // the backend's.
    const ok = await requireBiometric({ pinReason });
    setScanning(false);
    close();
    if (!ok) {
      showToast2("Couldn't verify it's you — nothing was changed");
      return;
    }
    // Awaited so a gated action that talks to the backend (My Share's
    // PATCH, for one) can report its own failure instead of the gate
    // reporting success the moment the fingerprint reads.
    await run();
  };
  const handleToggleBalance = () => {
    if (balanceVisible) {
      setBalanceVisible(false);
    } else {
      setShowBalanceBiometric(true);
    }
  };
  const handleBalanceBiometricVerify = () => runBiometricGate({
    scanning: balanceBiometricScanning,
    setScanning: setBalanceBiometricScanning,
    close: () => setShowBalanceBiometric(false),
    pinReason: "Confirm it's you to show your balance.",
    // A refused check leaves the balance masked, which is the whole point
    // of putting a gate on the eye icon.
    run: () => setBalanceVisible(true)
  });
  const [ghFlipped, setGhFlipped] = useState14(false);
  const [showGhCircleMenu, setShowGhCircleMenu] = useState14(false);
  const requestCloseGhCircleMenu = useBackClose(showGhCircleMenu, () => setShowGhCircleMenu(false));
  const [ghLogoColor, setGhLogoColor] = useState14(() => randomLogoFlipColor());
  const ghFlipTimeoutRef = useRef10(null);
  useEffect12(() => {
    const interval = setInterval(() => {
      setGhLogoColor((prev) => randomLogoFlipColor(prev));
      setGhFlipped(true);
      ghFlipTimeoutRef.current = setTimeout(() => setGhFlipped(false), 1500);
    }, 1e4);
    return () => {
      clearInterval(interval);
      clearTimeout(ghFlipTimeoutRef.current);
    };
  }, []);
  const profilePhotoInputRef = useRef10(null);
  const handleProfilePhotoFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !onChangeProfilePhoto) return;
    const reader = new FileReader();
    reader.onload = () => onChangeProfilePhoto(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const [activeTab, setActiveTab] = useState14("home");
  const [showPayLater, setShowPayLater] = useState14(false);
  const requestClosePayLater = useBackClose(showPayLater, () => setShowPayLater(false));
  const [showAssets, setShowAssets] = useState14(false);
  const requestCloseAssets = useBackClose(showAssets, () => setShowAssets(false));
  const [showEssentials, setShowEssentials] = useState14(false);
  const requestCloseEssentials = useBackClose(showEssentials, () => setShowEssentials(false));
  // Set when the "Unlock Gloobal Bank" banner inside Essentials sends
  // the person to Bank info — closing Bank info then reopens
  // Essentials automatically, so the onboarding step feels like one
  // continuous flow (unlock -> land back on the same banner, now
  // showing Scan & Pay) instead of dropping them back on Dashboard.
  const [pendingReopenEssentials, setPendingReopenEssentials] = useState14(false);
  const [showGloobalBankInfo, setShowGloobalBankInfo] = useState14(false);
  const requestCloseGloobalBankInfo = useBackClose(showGloobalBankInfo, () => {
    setShowGloobalBankInfo(false);
    if (pendingReopenEssentials) {
      setPendingReopenEssentials(false);
      setShowEssentials(true);
    }
  });
  // First-time-user gate for My Essentials (req: locked until Gloobal
  // Bank has been opened at least once). Tracked as its own bit of
  // state rather than inferred from showGloobalBankInfo's current
  // value, since that flag flips back to false when the sheet closes
  // — this one is "has it EVER been opened", set once and never unset.
  const [hasOpenedGloobalBank, setHasOpenedGloobalBank] = useState14(false);
  const capabilities = useMemo5(() => deriveCapabilityStates({ hasOpenedGloobalBank }), [hasOpenedGloobalBank]);
  // Both product screens fetch their own catalogue on open rather than on
  // mount: the rows are only ever looked at here, and this backend sleeps,
  // so there is no reason to spend a cold start warming a list nobody has
  // asked for yet. loadProduct is defined further down; these are only
  // called from a tap, long after it exists.
  const openGloobalBankInfo = () => {
    loadProduct("bank");
    setHasOpenedGloobalBank(true);
    setShowGloobalBankInfo(true);
  };
  const openGloobalCoinInfo = () => {
    loadProduct("coin");
    setShowGloobalCoinInfo(true);
  };
  const [gloobalBankInterested, setGloobalBankInterested] = useState14(false);
  const [showGloobalCoinInfo, setShowGloobalCoinInfo] = useState14(false);
  const requestCloseGloobalCoinInfo = useBackClose(showGloobalCoinInfo, () => setShowGloobalCoinInfo(false));
  const [showAboutUs, setShowAboutUs] = useState14(false);
  const requestCloseAboutUs = useBackClose(showAboutUs, () => setShowAboutUs(false));
  const [gloobalCoinInterested, setGloobalCoinInterested] = useState14(false);
  // Gloobal Coin. The balance and the history are read from the ledger rather
  // than held here, so they cannot drift from what was posted; only the things
  // that genuinely are screen state live in useState — whether a call is in
  // flight, whether the send sheet is open, and the last supply figures read
  // from the server.
  //
  // `coinSupply` is null until the server answers, and null renders as ∆.
  // A zero would read as "no coin exists", which is a real and different state
  // from "we could not ask".
  const [showSendCoin, setShowSendCoin] = useState14(false);
  const requestCloseSendCoin = useBackClose(showSendCoin, () => setShowSendCoin(false));
  const [coinBusy, setCoinBusy] = useState14(false);
  const [coinSupply, setCoinSupply] = useState14(null);
  const coinBalance = useCoinBalance();
  const coinHistory = useCoinHistory(8);
  const { mintCoin, redeemCoin, sendCoin, refreshCoin } = useCoinActions();
  const [showGloobalBankStats, setShowGloobalBankStats] = useState14(false);
  const requestCloseGloobalBankStats = useBackClose(showGloobalBankStats, () => setShowGloobalBankStats(false));
  const [showGloobalCoinStats, setShowGloobalCoinStats] = useState14(false);
  const requestCloseGloobalCoinStats = useBackClose(showGloobalCoinStats, () => setShowGloobalCoinStats(false));
  // Interest in Gloobal Bank / Gloobal Coin — the one thing those two
  // screens exist to collect, and until now the one thing they did not.
  // The state lives here beside the screens' other flags; the effect and
  // handlers that drive it sit further down, after currentSymbolId exists.
  //
  // `interestCounts` holds the real { total, totalUsers } per product, or
  // null while unknown — null renders as ∆, the same "we don't have that
  // figure" mark Coverage uses, rather than a confident 0.
  const [interestCounts, setInterestCounts] = useState14({ bank: null, coin: null });
  const [interestBusy, setInterestBusy] = useState14(null);
  const [bankHeroColor, setBankHeroColor] = useState14(() => randomLogoFlipColor());
  const [coinHeroColor, setCoinHeroColor] = useState14(() => randomLogoFlipColor());
  const [paylaterHeroColor, setPaylaterHeroColor] = useState14(() => randomLogoFlipColor());
  const [assetsHeroColor, setAssetsHeroColor] = useState14(() => randomLogoFlipColor());
  const [essentialsHeroColor, setEssentialsHeroColor] = useState14(() => randomLogoFlipColor());
  const [aboutHeroColor, setAboutHeroColor] = useState14(() => randomLogoFlipColor());
  const [sendActionColor, setSendActionColor] = useState14(() => randomLogoFlipColor());
  const [bankActionColor, setBankActionColor] = useState14(() => randomLogoFlipColor());
  const [scanActionColor, setScanActionColor] = useState14(() => randomLogoFlipColor());
  const [receiveActionColor, setReceiveActionColor] = useState14(() => randomLogoFlipColor());
  useEffect12(() => {
    const interval = setInterval(() => {
      setBankHeroColor((prev) => randomLogoFlipColor(prev));
      setCoinHeroColor((prev) => randomLogoFlipColor(prev));
      setPaylaterHeroColor((prev) => randomLogoFlipColor(prev));
      setAssetsHeroColor((prev) => randomLogoFlipColor(prev));
      setEssentialsHeroColor((prev) => randomLogoFlipColor(prev));
      setAboutHeroColor((prev) => randomLogoFlipColor(prev));
      setSendActionColor((prev) => randomLogoFlipColor(prev));
      setBankActionColor((prev) => randomLogoFlipColor(prev));
      setScanActionColor((prev) => randomLogoFlipColor(prev));
      setReceiveActionColor((prev) => randomLogoFlipColor(prev));
    }, 3e3);
    return () => clearInterval(interval);
  }, []);
  const FLIP_BUTTON_KEYS = ["send", "bank", "scan", "receive", "gbank", "gcoin", "gpaylater", "myassets", "myessentials", "aboutus"];
  const [buttonFlips, setButtonFlips] = useState14(
    () => Object.fromEntries(FLIP_BUTTON_KEYS.map((k) => [k, { flipped: false, content: "symbol", symbol: DIAL_SYMBOLS[0], color: LOGO_FLIP_COLORS[0] }]))
  );
  useEffect12(() => {
    const interval = setInterval(() => {
      const chosenKey = FLIP_BUTTON_KEYS[Math.floor(Math.random() * FLIP_BUTTON_KEYS.length)];
      setButtonFlips((prev) => ({
        ...prev,
        [chosenKey]: {
          flipped: true,
          content: Math.random() < 0.5 ? "symbol" : "logo",
          symbol: DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)],
          color: LOGO_FLIP_COLORS[Math.floor(Math.random() * LOGO_FLIP_COLORS.length)]
        }
      }));
      setTimeout(() => {
        setButtonFlips((prev) => ({ ...prev, [chosenKey]: { ...prev[chosenKey], flipped: false } }));
      }, 1300);
    }, 15e3);
    return () => clearInterval(interval);
  }, []);
  const assetRows = useMemo5(
    () => assetSeeds.map((t) => {
      const cashback = t.amountPaid * t.cashbackRate;
      const value = cashback * Math.pow(1 + ASSET_GROWTH_RATE_MONTHLY, t.monthsAccrued);
      const monthsToTarget = Math.log(t.amountPaid / cashback) / Math.log(1 + ASSET_GROWTH_RATE_MONTHLY);
      return { ...t, cashback, value, monthsToTarget };
    }),
    [assetSeeds]
  );
  const totalAssets = assetRows.reduce((s, r) => s + r.value, 0);
  const avgMonthsToTarget = assetRows.length ? assetRows.reduce((s, r) => s + r.monthsToTarget, 0) / assetRows.length : 0;
  const totalSpending = assetRows.reduce((s, r) => s + r.amountPaid, 0);
  // Today's Collection — Creator view only. The raw cashback amount
  // (not the compounded growth value My Assets shows) earned today
  // specifically from Creator Share grants, since that's what "what
  // came in today" means for a creator checking their day's take.
  const todaysDateLabel = useMemo5(() => (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric" }), []);
  const todaysCollection = useMemo5(
    () => assetSeeds.filter((t) => t.chip === "CS" && t.date === todaysDateLabel).reduce((s, t) => s + t.amountPaid * t.cashbackRate, 0),
    [assetSeeds, todaysDateLabel]
  );
  // Creator's "Recent Activity" card, below Today's Collection —
  // Received (money customers paid in via Creator Share, newest
  // first) vs Paid (this role's own outgoing Send Money/Scan & Pay/
  // Pay a Business, already role-filtered by roleSendHistory below),
  // toggled by one flip control, showing the 5 most recent either way.
  const [recentActivityTab, setRecentActivityTab] = useState14("receiving");
  const creatorShareRows = useMemo5(
    // shareRate carried through as a real percent (matching the same
    // convention "sent" rows already use) so this row's own receipt
    // shows the actual Creator Share rate that generated it — never
    // a fabricated 0%, and never a second, separate transaction of
    // its own; it's the Creator Share tab of the SAME original
    // payment, read from the receiving side. method reflects where
    // the money actually landed: PayLater when it (fully or partly)
    // auto-settled outstanding due, Bank otherwise — never hardcoded.
    () => assetSeeds.filter((t) => t.chip === "CS").map((t) => {
      const receivedAmount = t.amountPaid * t.cashbackRate;
      return {
        name: t.creatorName || "Someone",
        date: t.date,
        time: t.time,
        amount: receivedAmount,
        method: t.paylaterSettledAmount > 0 ? "paylater" : "bank",
        status: "completed",
        txnId: t.txnId,
        shareRate: t.cashbackRate * 100
      };
    }).reverse(),
    [assetSeeds]
  );
  // Everything this account received: the Creator Share tabs above, plus the
  // real person-to-person payments made TO it (mapped from
  // GET /api/transactions/:symbolId in App, split on the backend's own
  // per-viewer `direction`).
  //
  // These used to be absent entirely — a received payment was appended to the
  // sent list and rendered as money paid out — so a two-sided transaction
  // showed as a debit on BOTH accounts. Newest first, across both sources, so
  // the merged list reads as one history rather than two concatenated ones.
  const receivedRows = useMemo5(() => {
    const merged = creatorShareRows.concat(Array.isArray(receivedHistory) ? receivedHistory : []);
    return merged.slice().sort((a, b) => {
      const at = parseDemoDate(a.date).getTime();
      const bt = parseDemoDate(b.date).getTime();
      if (isNaN(at) || isNaN(bt) || at === bt) return 0;
      return bt - at;
    });
  }, [creatorShareRows, receivedHistory]);
  const [assetDetailKey, setAssetDetailKey] = useState14(null);
  const requestCloseAssetDetail = useBackClose(!!assetDetailKey, () => setAssetDetailKey(null));
  const [showSettleAssetsBiometric, setShowSettleAssetsBiometric] = useState14(false);
  const [settleAssetsBiometricScanning, setSettleAssetsBiometricScanning] = useState14(false);
  // Which amount the pending settle-to-bank biometric prompt actually
  // settles — shared by both My Assets' "Settle all" and the Creator
  // Today's Collection box's "Settle to Gloobal Bank", set right
  // before opening the prompt, so one biometric flow serves both
  // instead of duplicating it.
  const [settlePendingAmount, setSettlePendingAmount] = useState14(0);
  const handleSettleAssetsBiometricVerify = () => runBiometricGate({
    scanning: settleAssetsBiometricScanning,
    setScanning: setSettleAssetsBiometricScanning,
    close: () => setShowSettleAssetsBiometric(false),
    pinReason: "Confirm it's you to settle to Gloobal Bank.",
    run: () => {
      onSettleAssetsToBank(settlePendingAmount);
      showToast2(`${ccy}${fmt(settlePendingAmount, ccyCode)} settled to Gloobal Bank`);
    }
  });
  const CHART_W = 320, CHART_H = 160, CHART_PAD_L = 8, CHART_PAD_R = 8, CHART_PAD_T = 16, CHART_PAD_B = 22;
  const assetDetail = useMemo5(() => {
    if (!assetDetailKey) return null;
    const row = assetRows.find((r) => r.key === assetDetailKey);
    if (!row) return null;
    const rate = ASSET_GROWTH_RATE_MONTHLY;
    const target = row.amountPaid;
    const monthsToTarget = Math.log(target / row.cashback) / Math.log(1 + rate);
    const steps = 48;
    const series = Array.from({ length: steps + 1 }, (_, i) => {
      const t = monthsToTarget * i / steps;
      return { t, value: row.cashback * Math.pow(1 + rate, t) };
    });
    const xScale = (t) => CHART_PAD_L + t / monthsToTarget * (CHART_W - CHART_PAD_L - CHART_PAD_R);
    const yScale = (v) => CHART_H - CHART_PAD_B - v / target * (CHART_H - CHART_PAD_B - CHART_PAD_T);
    const pathPoints = series.map((p) => `${xScale(p.t).toFixed(1)},${yScale(p.value).toFixed(1)}`).join(" ");
    const todayT = Math.min(row.monthsAccrued, monthsToTarget);
    return {
      row,
      target,
      monthsToTarget,
      pathPoints,
      todayX: xScale(todayT),
      todayY: yScale(row.value),
      targetY: yScale(target),
      baseY: CHART_H - CHART_PAD_B
    };
  }, [assetDetailKey, assetRows]);
  const realPaylaterDue = usePaylaterDue();
  const { paylaterLimit: PAYLATER_LIMIT, paylaterDue, paylaterAvailable } = computePaylaterAvailable(assetSeeds, paylaterHistory, realPaylaterDue);
  const paylaterSending = paylaterHistory.filter((t) => t.direction === "out");
  const paylaterReceiving = paylaterHistory.filter((t) => t.direction === "in");
  const [showIdTag, setShowIdTag] = useState14(false);
  const [toast, setToast] = useState14(null);
  const [showReceive, setShowReceive] = useState14(false);
  const [receiveQrSecondsLeft, setReceiveQrSecondsLeft] = useState14(60);
  const requestCloseReceive = useBackClose(showReceive, () => setShowReceive(false));
  const [myShareRate, setMyShareRate] = useState14(1);
  useEffect12(() => {
    if (onMyShareRateChange) onMyShareRateChange(myShareRate);
  }, [myShareRate]);
  const [myShareIconFlipped, setMyShareIconFlipped] = useState14(false);
  useEffect12(() => {
    const interval = setInterval(() => setMyShareIconFlipped((f) => !f), 2500);
    return () => clearInterval(interval);
  }, []);
  const [showMyShare, setShowMyShare] = useState14(false);
  const requestCloseMyShare = useBackClose(showMyShare, () => setShowMyShare(false));
  const [showMyShareBiometric, setShowMyShareBiometric] = useState14(false);
  const [myShareBiometricScanning, setMyShareBiometricScanning] = useState14(false);
  // In flight between the biometric passing and the backend answering, so
  // the Update button can say it is working rather than looking ignored on
  // a cold Render start.
  const [myShareSaving, setMyShareSaving] = useState14(false);
  const handleMyShareBiometricVerify = () => runBiometricGate({
    scanning: myShareBiometricScanning,
    setScanning: setMyShareBiometricScanning,
    close: () => setShowMyShareBiometric(false),
    pinReason: "Confirm it's you to change My Share.",
    // A refusal aborts the save outright: My Share is the cashback rate
    // this account offers on every future payment, so it must not change
    // on an unverified tap. The sheet stays open on failure so the rate
    // is still there to try again with.
    //
    // This used to close the sheet and announce the new rate without ever
    // telling the backend, so My Share was a number that existed only in
    // this component: reloading lost it, and — because the rate applied to
    // a payment is the PAYEE's stored `cashbackRate`, read server-side —
    // nobody paying this account was ever charged it. The PATCH is now the
    // save, and the toast only follows the server agreeing.
    run: async () => {
      const symbolId = currentSymbolId || myGloobalId;
      if (!symbolId) {
        showToast2("Sign in to set My Share.");
        return;
      }
      setMyShareSaving(true);
      try {
        // The backend stores a decimal (1% = 0.01) and answers with what it
        // actually saved, which is what the UI then shows — a rate the
        // server clamped or rounded must not be displayed as the rate that
        // was asked for.
        const saved = await GloobalApi.setCreatorCashbackRate(symbolId, myShareRate / 100);
        const savedPercent = Math.round(saved * 1e4) / 100;
        setMyShareRate(savedPercent);
        setShowMyShare(false);
        showToast2(`My Share set to ${savedPercent.toFixed(2)}%`);
      } catch (err) {
        showToast2(err.message || "Couldn't save My Share just now");
      } finally {
        setMyShareSaving(false);
      }
    }
  });
  const [showCreatorOverview, setShowCreatorOverview] = useState14(false);
  const requestCloseCreatorOverview = useBackClose(showCreatorOverview, () => setShowCreatorOverview(false));
  // Platform-wide account count for the Creator Share overview's filter,
  // read when that screen is opened. It was the literal `1` — true of the
  // test database and of nothing else, and wrong the moment a second person
  // registered. null means the server could not be reached, which renders as
  // "—" rather than as a number nobody counted.
  const [platformUserCount, setPlatformUserCount] = useState14(null);
  useEffect12(() => {
    if (!showCreatorOverview) return undefined;
    let cancelled = false;
    (async () => {
      const total = await GloobalApi.getPlatformUserCount();
      if (!cancelled) setPlatformUserCount(total);
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreatorOverview]);
  const [creatorFilterMin, setCreatorFilterMin] = useState14(0);
  const [creatorFilterMax, setCreatorFilterMax] = useState14(7);
  const [showRentChoice, setShowRentChoice] = useState14(false);
  const requestCloseRentChoice = useBackClose(showRentChoice, () => setShowRentChoice(false));
  const [showRecharge, setShowRecharge] = useState14(false);
  const requestCloseRecharge = useBackClose(showRecharge, () => setShowRecharge(false));
  const [showElectricity, setShowElectricity] = useState14(false);
  const requestCloseElectricity = useBackClose(showElectricity, () => setShowElectricity(false));
  const [showMore, setShowMore] = useState14(false);
  const requestCloseMore = useBackClose(showMore, () => {
    setShowMore(false);
    setMoreQuery("");
    setTravelExpanded(false);
  });
  const [moreQuery, setMoreQuery] = useState14("");
  const [travelExpanded, setTravelExpanded] = useState14(false);
  const [payTarget, setPayTarget] = useState14(null);
  // Pay a Business now follows the same options -> PIN -> biometric
  // sequence Send Money established, instead of jumping straight from
  // the amount field to executing the payment.
  const [payTargetOptionsOpen, setPayTargetOptionsOpen] = useState14(false);
  const [payTargetPinOpen, setPayTargetPinOpen] = useState14(false);
  const [payTargetMethod, setPayTargetMethod] = useState14(null);
  const [showPayTargetBiometric, setShowPayTargetBiometric] = useState14(false);
  const [payTargetBiometricScanning, setPayTargetBiometricScanning] = useState14(false);
  const requestClosePayTarget = useBackClose(!!payTarget, () => setPayTarget(null));
  const [payAmount, setPayAmount] = useState14("25.00");
  const [profileOverlay, setProfileOverlay] = useState14(null);
  const requestCloseProfileOverlay = useBackClose(!!profileOverlay, () => setProfileOverlay(null));
  const [selectedMember, setSelectedMember] = useState14(null);
  const requestCloseSelectedMember = useBackClose(!!selectedMember, () => setSelectedMember(null));
  const [showHowItWorks, setShowHowItWorks] = useState14(false);
  const requestCloseHowItWorks = useBackClose(showHowItWorks, () => setShowHowItWorks(false));
  const [profileDetail, setProfileDetail] = useState14(null);
  const requestCloseProfileDetail = useBackClose(!!profileDetail, () => setProfileDetail(null));
  const [ghScreen, setGhScreen] = useState14("categories");
  const [ghActiveCategory, setGhActiveCategory] = useState14(null);
  const [ghActiveItem, setGhActiveItem] = useState14(null);
  const [ghAnswers, setGhAnswers] = useState14({});
  const [ghMathNums, setGhMathNums] = useState14({});
  const [ghMathInput, setGhMathInput] = useState14("");
  const [ghNoteInput, setGhNoteInput] = useState14("");
  const [ghNoteOpen, setGhNoteOpen] = useState14(false);
  const [ghNotes, setGhNotes] = useState14({});
  const ghNoteWordCount = (str) => str.trim() ? str.trim().split(/\s+/).length : 0;
  const ghSubmitNote = (catKey, itemKey) => {
    const qId = `${catKey}.${itemKey}`;
    if (!ghNoteInput.trim()) return;
    setGhNotes((n) => ({ ...n, [qId]: ghNoteInput.trim() }));
    showToast2("Note added");
  };
  const [ghCategoryColors, setGhCategoryColors] = useState14({ ...GH_DEFAULT_COLORS });
  const [ghColorPickerCat, setGhColorPickerCat] = useState14("self");
  const [ghShowColorSheet, setGhShowColorSheet] = useState14(false);
  const [ghWheelHue, setGhWheelHue] = useState14(0);
  const [ghWheelSat, setGhWheelSat] = useState14(0);
  const requestCloseGhScore = useBackClose(profileOverlay === "ghscore", () => {
    if (ghScreen === "question") setGhScreen("items");
    else if (ghScreen === "items") {
      setGhScreen("categories");
      setGhActiveCategory(null);
    } else requestCloseProfileOverlay();
  });
  const catColor = (catKey) => ghCategoryColors[catKey] || GH_DEFAULT_COLORS[catKey];
  const catSoft = (catKey, alpha = 0.14) => hexToRgba(catColor(catKey), alpha);
  const ghSelectedColorCat = GH_CATEGORIES.find((c) => c.key === ghColorPickerCat);
  const ghPendingColor = hsvToHex(ghWheelHue, ghWheelSat, 1);
  useEffect12(() => {
    if (!ghShowColorSheet) return;
    const { h, s } = hexToHsv(catColor(ghColorPickerCat));
    setGhWheelHue(h);
    setGhWheelSat(s);
  }, [ghShowColorSheet, ghColorPickerCat]);
  const ghIsLocked = (catKey, itemKey) => {
    const cat = GH_CATEGORIES.find((c) => c.key === catKey);
    return !!(cat.locksAfterAnswer && ghAnswers[`${catKey}.${itemKey}`]);
  };
  const ghQuestionText = (catKey, item) => {
    if (!item.questions) return item.question;
    const seed = ghDailySeed(`${ghTodayKey()}.${catKey}.${item.key}`);
    return item.questions[seed % item.questions.length];
  };
  const ghMathNumsFor = (catKey, item) => {
    const cat = GH_CATEGORIES.find((c) => c.key === catKey);
    const qId = `${catKey}.${item.key}`;
    if (cat.dailyRotation) {
      const seedA = ghDailySeed(`${ghTodayKey()}.${qId}.a`);
      const seedB = ghDailySeed(`${ghTodayKey()}.${qId}.b`);
      return { a: 12 + seedA % 70, b: 11 + seedB % 70 };
    }
    return ghMathNums[qId] || { a: 12 + Math.floor(Math.random() * 70), b: 11 + Math.floor(Math.random() * 70) };
  };
  const ghOpenCategory = (catKey) => {
    setGhActiveCategory(catKey);
    setGhScreen("items");
  };
  const ghOpenQuestion = (catKey, item) => {
    if (ghIsLocked(catKey, item.key)) {
      showToast2("Finance answers lock after your first response");
      return;
    }
    setGhActiveCategory(catKey);
    setGhActiveItem(item.key);
    setGhNoteInput(ghNotes[`${catKey}.${item.key}`] || "");
    setGhNoteOpen(false);
    if (item.type === "math") {
      const qId = `${catKey}.${item.key}`;
      const cat = GH_CATEGORIES.find((c) => c.key === catKey);
      const existing = ghAnswers[qId];
      if (!cat.dailyRotation) {
        setGhMathNums((m) => ({
          ...m,
          [qId]: m[qId] || { a: 12 + Math.floor(Math.random() * 70), b: 11 + Math.floor(Math.random() * 70) }
        }));
      }
      setGhMathInput(existing ? String(existing.value) : "");
    }
    setGhScreen("question");
  };
  const ghAnswerYesNo = (catKey, itemKey, value) => {
    const qId = `${catKey}.${itemKey}`;
    const nextAnswers = { ...ghAnswers, [qId]: { type: "yesno", value, points: value === "yes" ? 25 : 10, day: ghTodayKey() } };
    setGhAnswers(nextAnswers);
    if (value === "no") {
      setGhNoteOpen(true);
      return;
    }
    setGhScreen(Object.keys(nextAnswers).length === ghTotalQuestions ? "complete" : "items");
  };
  const ghContinueAfterAnswer = () => {
    setGhNoteOpen(false);
    setGhScreen(Object.keys(ghAnswers).length === ghTotalQuestions ? "complete" : "items");
  };
  const ghSubmitMath = (catKey, itemKey) => {
    const qId = `${catKey}.${itemKey}`;
    const cat = GH_CATEGORIES.find((c) => c.key === catKey);
    const nums = cat.dailyRotation ? ghMathNumsFor(catKey, cat.items.find((it) => it.key === itemKey)) : ghMathNums[qId];
    const correct = nums && Number(ghMathInput) === nums.a + nums.b;
    const nextAnswers = { ...ghAnswers, [qId]: { type: "math", value: ghMathInput, correct, points: correct ? 25 : 10, day: ghTodayKey() } };
    setGhAnswers(nextAnswers);
    setGhScreen(Object.keys(nextAnswers).length === ghTotalQuestions ? "complete" : "items");
  };
  // Creator-side renames only. The personal Gloobal ID deliberately has no
  // override any more: it is whatever useCurrentSymbolId reports, full stop.
  // A single `gloobalIdOverride` used to serve both roles, so renaming while
  // in Creator mode wrote the new Creator ID over the *personal* one — the
  // profile and the dashboard then showed an ID the account had never had,
  // while the Scan screen (reading the real session) showed the true one.
  // That is the same account displaying two different Gloobal IDs.
  //
  // The Creator ID is a local-only identifier with no backend record, which
  // is why it needs an override at all and the personal ID does not.
  const [creatorIdOverride, setCreatorIdOverride] = useState14(null);
  // Declared early so shareableGloobalId (right below) can already be
  // role-aware — same source of truth toggleShareRole/roleSendHistory
  // further down use, just introduced here instead of down there.
  const [shareRole, setShareRole] = useState14("user");
  const [newIdBuffer, setNewIdBuffer] = useState14("");
  const [suggestedUpdateId, setSuggestedUpdateId] = useState14(() => genSuggestedId(12));
  const [idUpdateHistory, setIdUpdateHistory] = useState14([]);
  const [showIdHistory, setShowIdHistory] = useState14(false);
  const requestCloseIdHistory = useBackClose(showIdHistory, () => setShowIdHistory(false));
  useEffect12(() => {
    if (openHistoryDirection) {
      setActiveTab("profile");
      setProfileDetail("History");
    }
  }, [openHistoryDirection]);
  // Opens the sub-screen the app map asked for (App.jsx's dashboardDeepLink
  // — see components/common/appMap.jsx). Dashboard.jsx is the only place
  // that owns these show* booleans, so App.jsx can't set them directly; it
  // hands over what it wants opened, and this is consumed exactly once —
  // same "consume and clear" shape as openHistoryDirection/onConsumeOpenHistory
  // just above, so tapping the same map entry again still re-opens it even
  // if the target string didn't change.
  useEffect12(() => {
    if (!deepLinkTarget) return;
    if (deepLinkTarget === "bank") setShowGloobalBankInfo(true);
    else if (deepLinkTarget === "coin") setShowGloobalCoinInfo(true);
    else if (deepLinkTarget === "assets") setShowAssets(true);
    else if (deepLinkTarget === "paylater") setShowPayLater(true);
    else if (deepLinkTarget === "aboutus") setShowAboutUs(true);
    // The profile sub-screens. These are full-screen overlays keyed off
    // profileOverlay, independent of whether the Profile tab itself is
    // showing, so the app map can open them from anywhere the same way it
    // opens the show* screens above.
    else if (deepLinkTarget === "ghscore") setProfileOverlay("ghscore");
    else if (deepLinkTarget === "share") setProfileOverlay("share");
    else if (deepLinkTarget === "updateId") setProfileOverlay("updateId");
    else if (deepLinkTarget === "referral") setProfileOverlay("referral");
    if (onConsumeDeepLink) onConsumeDeepLink();
  }, [deepLinkTarget]);
  useEffect12(() => {
    if (pendingOpenMyShare) {
      setShowMyShare(true);
      if (onConsumePendingMyShare) onConsumePendingMyShare();
    }
  }, [pendingOpenMyShare]);
  const [profileToggles, setProfileToggles] = useState14({
    biometric: true,
    appLock: false,
    txAlerts: true,
    referralAlerts: true,
    promos: false,
    autopay: true
  });
  const [profileLanguage, setProfileLanguage] = useState14("English");
  const [profileCurrency, setProfileCurrency] = useState14(COUNTRY_CURRENCY[dialCountry.iso] || "USD");
  const flipToggle = (key) => setProfileToggles((t) => ({ ...t, [key]: !t[key] }));
  const [subscriptions, setSubscriptions] = useState14(SUBSCRIPTION_TOOLS);
  const toggleSubscription = (key) => setSubscriptions((subs) => subs.map((s) => s.key === key ? { ...s, active: !s.active } : s));
  const ccy = CURRENCY_SYMBOL[COUNTRY_CURRENCY[dialCountry.iso] || "USD"] || "$";
  // The ISO code behind that symbol. Money is formatted against the code,
  // never the symbol: a currency with no minor unit printed to two decimals
  // (¥750,000.00) states a precision the currency does not have.
  const ccyCode = COUNTRY_CURRENCY[dialCountry.iso] || "USD";
  // Declared after ccyCode because it needs it — this is the account's own
  // balance, the single most-read number on the screen.
  const balance = fmt(bankBalance, ccyCode);
  // THE account's Gloobal ID — the one and only value any screen on this
  // dashboard shows as "your Gloobal ID". It comes from the stored
  // session via useCurrentSymbolId, which re-renders on
  // gloobal:symbolIdChanged, so a rename reaches every screen at once.
  //
  // The myGloobalId prop is a fallback, not the source: during
  // registration the session is not written until the biometric step, so
  // for those few screens the prop is all there is.
  //
  // This replaces a scheme where each screen picked its own answer —
  // Receive/share read the local `gloobalIdOverride`, Personal Details and
  // the profile header read the raw prop — which is why the same account
  // showed different IDs depending on where you looked.
  const currentSymbolId = useCurrentSymbolId(myGloobalId);
  const personalGloobalId = currentSymbolId && currentSymbolId.length === 12 ? currentSymbolId : "++++++++++++";
  // Same real code the Scan screen's "My Code" tab shows for the same
  // role. Creator mode deliberately shares a different identifier
  // (creatorId): scanning the two means different things, so this is the
  // one place the displayed ID is legitimately not the personal one.
  const activeCreatorId = creatorIdOverride || creatorId;
  const shareableGloobalId = shareRole === "merchant" ? activeCreatorId : personalGloobalId;
  const gloobalIdTag = shareableGloobalId;
  // Bug fix: this used to point at https://gloobal.id/r/... — a domain
  // that was never wired up to anything (not this app, not the backend,
  // not a redirect). Every referral link anyone shared was dead on
  // arrival. The real /r/:symbolId route lives on the backend itself
  // (server.js), which resolves the ID and redirects the visitor on to
  // the actual live frontend with ?ref=<id> attached — so the link needs
  // to point at GLOOBAL_API_BASE (the same backend origin every other
  // API call in this app already uses), not an unregistered domain.
  // encodeURIComponent matters here specifically because a Gloobal ID is
  // built from symbols (− + × = ○ ● □ ■), and an unencoded "+" in a URL
  // is interpreted as a space by the time anything downstream reads it.
  const referralLink = `${GLOOBAL_API_BASE}/r/${encodeURIComponent(shareableGloobalId)}`;
  // The rate this account actually offers, read back from the server.
  //
  // Without this the sheet opened at its hardcoded 1% every time, so someone
  // who had set 3% was shown 1% and would either believe it had been lost or
  // "re-save" a rate they never chose. GET /api/profile/:symbolId carries
  // `cashbackRate` as a decimal; the UI works in percent.
  //
  // Silent on failure, and deliberately: a cold Render start is not evidence
  // that the rate is 1%, so the local value simply stays until the server can
  // be reached. `cancelled` guards the ID changing mid-flight (a rename), so
  // an older account's rate cannot land on a newer one.
  useEffect12(() => {
    if (!currentSymbolId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const profile = await GloobalApi.getProfile(currentSymbolId);
        if (cancelled || !profile) return;
        const rate = Number(profile.cashbackRate);
        if (!Number.isFinite(rate) || rate < 0) return;
        setMyShareRate(Math.round(rate * 1e4) / 100);
      } catch (e) {
        /* read-only; the sheet keeps whatever it had */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSymbolId]);
  const ghCategoryScore = (catKey) => {
    const cat = GH_CATEGORIES.find((c) => c.key === catKey);
    const answered = cat.items.filter((it) => ghAnswers[`${catKey}.${it.key}`]);
    if (answered.length === 0) return null;
    const total = answered.reduce((s, it) => s + ghAnswers[`${catKey}.${it.key}`].points, 0);
    return Math.round(total / (answered.length * 25) * 100);
  };
  const ghOverallScore = () => {
    const scores = GH_CATEGORIES.map((c) => ghCategoryScore(c.key)).filter((s) => s !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };
  const ghTotalAnswered = Object.keys(ghAnswers).length;
  const ghTotalQuestions = GH_CATEGORIES.reduce((s, c) => s + c.items.length, 0);
  const ghCanGenerate = ghTotalAnswered === ghTotalQuestions;
  const ghTier = (score) => {
    if (score === null) return "Not scored yet";
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    return "Needs Work";
  };
  const ghMaxTotal = GH_CATEGORIES.length * 100;
  const ghRawTotal = GH_CATEGORIES.reduce((s, c) => s + (ghCategoryScore(c.key) || 0), 0);
  const ghSaveColor = () => {
    setGhCategoryColors((c) => ({ ...c, [ghColorPickerCat]: ghPendingColor }));
    showToast2(`${ghSelectedColorCat.label} colour saved`);
    setGhShowColorSheet(false);
  };
  const ghRingOrder = ["community", "finance", "environment", "self"];
  const ghRingSegments = ghRingOrder.map((key) => {
    const score = ghCategoryScore(key);
    return { color: catColor(key), pct: (score || 0) / 100 };
  });
  // Reached only after the biometric gate has passed (see
  // handleUpdateIdBiometricVerify), which is what makes the PATCH below
  // the first thing that happens on an authorised change and nothing at
  // all on an unauthorised one.
  //
  // The backend is asked first and the local state follows its answer.
  // This used to update only local state, so the app showed a new Gloobal
  // ID that MongoDB had never heard of — the person would be told their ID
  // had changed while every real payment still resolved against the old
  // one. A rejected change now leaves both sides on the old ID.
  //
  // The Creator ID is a local-only identifier with no backend record, so a
  // change made while in Creator mode stays local by design.
  const saveNewGloobalId = async () => {
    if (newIdBuffer.length !== 12) return;
    const previousId = shareableGloobalId;
    const isCreatorRename = shareRole === "merchant";
    const isBackedByAccount = !isCreatorRename && (currentSymbolId || myGloobalId || "").length === 12;
    if (isBackedByAccount) {
      try {
        // The ID the backend knows this account by — not shareableGloobalId,
        // which is a display value that can already carry a local override.
        // Sending the display value would 404 the moment the two differ.
        await GloobalApi.changeSymbolId(currentSymbolId || myGloobalId, newIdBuffer);
      } catch (err) {
        showToast2(err.message || "Couldn't update your Gloobal ID");
        return;
      }
      // Told upward so the whole app follows the account to its new ID.
      // Without this the change stopped at this component: App kept the old
      // symbolId in state, in the saved session and in the biometric gate,
      // so the next guarded action asked the backend about an ID that no
      // longer existed (404), and a reload resolved the old ID to "No
      // account found for this Gloobal ID" — the account became unreachable
      // from the very screen that had just renamed it.
      if (onGloobalIdChange) onGloobalIdChange(newIdBuffer);
    }
    const now = /* @__PURE__ */ new Date();
    setIdUpdateHistory((h) => [
      { id: newIdBuffer, previousId, date: now.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" }), time: formatClockTime(now) },
      ...h
    ]);
    // Only the Creator ID is held locally. A personal rename needs no local
    // copy at all: the PATCH above succeeded, onGloobalIdChange wrote it into
    // the session, and useCurrentSymbolId re-reads that — so every screen,
    // including the ones outside this component, moves together.
    if (isCreatorRename) setCreatorIdOverride(newIdBuffer);
    setNewIdBuffer("");
    requestCloseProfileOverlay();
  };
  const [showUpdateIdBiometric, setShowUpdateIdBiometric] = useState14(false);
  const [updateIdBiometricScanning, setUpdateIdBiometricScanning] = useState14(false);
  const handleRequestSaveNewGloobalId = () => {
    if (newIdBuffer.length !== 12) return;
    setShowUpdateIdBiometric(true);
  };
  const handleUpdateIdBiometricVerify = () => runBiometricGate({
    scanning: updateIdBiometricScanning,
    setScanning: setUpdateIdBiometricScanning,
    close: () => setShowUpdateIdBiometric(false),
    pinReason: "Confirm it's you to change your Gloobal ID.",
    // Order matters here: the biometric resolves before saveNewGloobalId
    // runs, and saveNewGloobalId is what issues
    // PATCH /api/profile/change-symbol-id. A refusal means the request is
    // never sent and the ID on file is untouched.
    run: saveNewGloobalId
  });
  // Real referrals from GET /api/referrals/:symbolId.
  //
  // generateReferralNetwork() returns [] and nothing ever replaced it, so
  // this screen showed "No referrals yet" to everybody — including people
  // who had actually referred somebody. GloobalApi.getReferrals existed
  // and was never called from anywhere.
  //
  // The backend deliberately returns Gloobal IDs and join dates only, no
  // contact details, so `name` is the referred ID. Per-referral earnings
  // are not tracked server-side at all: the amounts stay 0 rather than
  // being invented, which keeps the "Settle to Gloobal Bank" total honest
  // — it settles what is actually attributable, which is currently
  // nothing.
  const [referralNetwork, setReferralNetwork] = useState14(() => generateReferralNetwork());
  useEffect12(() => {
    const symbolId = currentSymbolId;
    if (!symbolId) return;
    let cancelled = false;
    (async () => {
      try {
        const referrals = await GloobalApi.getReferrals(symbolId);
        if (cancelled || !Array.isArray(referrals)) return;
        setReferralNetwork(
          referrals.map((r) => ({
            // The server now returns a display name alongside the ID (see
            // GET /api/referrals/:symbolId). It is still deliberately not
            // returning contact details — no number, no email. `name` is
            // left EMPTY rather than falling back to the ID, so the row can
            // tell "this person has a name" apart from "this person has
            // not set one" and render each properly; a twelve-symbol ID
            // shown as a name is what made this list unreadable.
            name: r.referredName || "",
            symbolId: r.referredSymbolId || "",
            joinedAt: r.createdAt || null,
            status: r.status === "completed" ? "Active" : "Pending",
            earned: 0,
            earnedToday: 0
          }))
        );
      } catch (e) {
        // A read. The screen already renders an empty state correctly, so
        // a failed fetch degrades to exactly that rather than an error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSymbolId]);
  // "I am IN", made real. Both flags used to be plain useState(false): the
  // button lit up, the next reload forgot it, and nothing was ever sent
  // anywhere. The counter beside them was worse — `interested ? 1 : 0` out
  // of a hardcoded "1 active user", a platform statistic with no platform
  // behind it.
  //
  // This restores the flag from the server, so "You're on the list"
  // survives a reload and shows up on any other device this person signs
  // in on. Placed here rather than with the state above because it needs
  // currentSymbolId, which is declared further up this component.
  useEffect12(() => {
    if (!currentSymbolId) return;
    let cancelled = false;
    (async () => {
      const products = await GloobalApi.getInterestStatus(currentSymbolId);
      if (cancelled) return;
      if (products.includes("bank")) setGloobalBankInterested(true);
      if (products.includes("coin")) setGloobalCoinInterested(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSymbolId]);
  // Counts are read when a screen showing one is opened, not on mount —
  // no reason to spend a cold start on a number nobody is looking at yet.
  const loadInterestCount = async (product) => {
    const counts = await GloobalApi.getInterest(product);
    setInterestCounts((prev) => ({ ...prev, [product]: counts }));
  };
  // Both stats panels render the same two figures, so the arithmetic and
  // the wording live in one place rather than being written twice and
  // drifting. Returns null when the server hasn't answered — the panels
  // show ∆ for that, never a 0 that would read as "nobody wants this".
  const interestSummary = (product) => {
    const counts = interestCounts[product];
    if (!counts) return null;
    const { total, totalUsers } = counts;
    return {
      percent: totalUsers > 0 ? Math.round((total / totalUsers) * 100) : 0,
      caption: `${total} of ${totalUsers} ${totalUsers === 1 ? "registered account has" : "registered accounts have"} shown interest`
    };
  };
  // The "I am IN" handler for both screens. The flip to "You're on the
  // list" happens only after the server has accepted: this button is the
  // entire feature, and confirming a registration that failed would be the
  // same lie in a friendlier colour. The route is idempotent, so a second
  // tap — or a tap from another device — is safe rather than double-counted.
  const registerInterest = async (product) => {
    if (interestBusy) return;
    if (product === "bank" ? gloobalBankInterested : gloobalCoinInterested) return;
    if (!currentSymbolId) {
      showToast2("Finish setting up your Gloobal ID first.");
      return;
    }
    setInterestBusy(product);
    try {
      const result = await GloobalApi.registerInterest(currentSymbolId, product);
      if (product === "bank") setGloobalBankInterested(true);
      else setGloobalCoinInterested(true);
      setInterestCounts((prev) => ({ ...prev, [product]: { total: result.total, totalUsers: result.totalUsers } }));
      showToast2(
        result.alreadyRegistered
          ? "You're already on the list."
          : "\u{1F389} Congratulations — you're in! Thanks for showing your interest."
      );
    } catch (err) {
      showToast2(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
    } finally {
      setInterestBusy(null);
    }
  };
  // Gloobal Coin handlers.
  //
  // Every one goes through useCoinActions, which calls the server first and
  // posts to the local ledger only once the server has confirmed. None of them
  // writes a balance into component state: the ledger is where the number
  // lives and useCoinBalance reads it back out, so the figure on screen is
  // always the one the entries add up to.
  const refreshCoinPosition = async () => {
    if (currentSymbolId) {
      try {
        await refreshCoin(currentSymbolId);
      } catch (err) {
        // A read. The screen already shows the last reconciled figure, which
        // beats blanking it because one request failed.
      }
    }
    // Supply is a separate public route and reports its own failure as null,
    // which the screen renders as ∆ — never as a zero, which would say "no
    // coin exists" instead of "we could not ask".
    setCoinSupply(await GloobalApi.getCoinSupply());
  };
  const handleMintCoin = async (amount) => {
    if (!currentSymbolId) {
      showToast2("Finish setting up your Gloobal ID first.");
      return false;
    }
    setCoinBusy(true);
    try {
      const result = await mintCoin(currentSymbolId, amount);
      setCoinSupply(await GloobalApi.getCoinSupply());
      showToast2(`Bought ${result.minted.toFixed(2)} GC`);
      return true;
    } catch (err) {
      showToast2(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
      return false;
    } finally {
      setCoinBusy(false);
    }
  };
  const handleRedeemCoin = async (amount) => {
    if (!currentSymbolId) {
      showToast2("Finish setting up your Gloobal ID first.");
      return false;
    }
    setCoinBusy(true);
    try {
      const result = await redeemCoin(currentSymbolId, amount);
      setCoinSupply(await GloobalApi.getCoinSupply());
      showToast2(`Cashed out ${result.redeemed.toFixed(2)} GC`);
      return true;
    } catch (err) {
      showToast2(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
      return false;
    } finally {
      setCoinBusy(false);
    }
  };
  const handleSendCoin = async (receiverSymbolId, amount, pin) => {
    const result = await sendCoin(currentSymbolId, receiverSymbolId, amount, pin);
    setCoinSupply(await GloobalApi.getCoinSupply());
    return result;
  };
  // Rows as the server holds them, keyed by product ("bank" | "coin").
  // null means "not loaded / server didn't answer", which is what makes
  // the bundled table a fallback rather than dead code.
  const [productCatalogue, setProductCatalogue] = useState14({ bank: null, coin: null });
  const loadProduct = async (product) => {
    const loaded = await GloobalApi.getProduct(product);
    if (loaded) setProductCatalogue((prev) => ({ ...prev, [product]: loaded }));
  };
  // Server first, bundled table second.
  //
  // The fallback is not a nicety: this backend sleeps and takes 20-50s to
  // wake, so a screen opened cold would otherwise render an empty services
  // list — which reads as "this product does nothing" rather than "we
  // haven't heard back yet". The bundled copy is the same starting state
  // the database was seeded from, so a stale render is out of date at
  // worst, never wrong about which product it belongs to.
  //
  // Server rows arrive already downgraded for a product that isn't live
  // (the route applies that before answering), and deriveProductServices
  // applies the identical rule to the bundled rows, so both paths agree.
  const serviceRowsFor = (capabilityKey) => {
    const product = capabilityKey === CAPABILITY_KEY.GLOOBAL_BANK ? "bank" : "coin";
    const fromServer = productCatalogue[product];
    if (fromServer) return fromServer.services;
    return deriveProductServices(capabilityKey, capabilities);
  };
  const totalReferralEarned = referralNetwork.reduce((sum, m) => sum + m.earned, 0);
  const [showSettleReferralBiometric, setShowSettleReferralBiometric] = useState14(false);
  const [settleReferralBiometricScanning, setSettleReferralBiometricScanning] = useState14(false);
  const handleSettleReferralBiometricVerify = () => runBiometricGate({
    scanning: settleReferralBiometricScanning,
    setScanning: setSettleReferralBiometricScanning,
    close: () => setShowSettleReferralBiometric(false),
    pinReason: "Confirm it's you to settle referral earnings.",
    run: () => {
      onSettleReferralToBank(totalReferralEarned);
      showToast2(`${ccy}${fmt(totalReferralEarned, ccyCode)} settled to Gloobal Bank`);
    }
  });
  // Personal and Creator are separate books: each role only sees the
  // spending/receiving history (and the wallet card's chart) for
  // transactions made while that role was active — balance itself
  // stays merged (money is money once it's in Gloobal Bank; only the
  // history view and its chart split by role, not the account). Older
  // entries with no role tag (pre-dating this split) default to
  // "user" so nothing that already existed disappears.
  // (shareRole itself is declared earlier, alongside gloobalIdOverride,
  // so shareableGloobalId can already be role-aware.)
  const roleSendHistory = useMemo5(() => sendHistory.filter((t) => (t.role || "user") === shareRole), [sendHistory, shareRole]);
  const dailySpending = useMemo5(() => generateDailySpending(roleSendHistory, receivedRows), [roleSendHistory, receivedRows]);
  // The five most recent transactions on the Gloobal Bank account, both
  // directions in one list. Home's activity card splits them by a
  // sent/received tab because that is a question about a direction; the
  // Bank screen is a question about an account, so its list is the
  // account's, merged and ordered by when things happened.
  //
  // Rows carry a display date ("Aug 13") rather than a timestamp, so the
  // ordering goes through parseDemoDate — the same reader the history
  // filters and the spending chart already use. A row whose date won't
  // parse sorts last instead of throwing the whole list out of order.
  //
  // Placed here rather than beside the Bank screen's other state because
  // it reads roleSendHistory, which is declared immediately above.
  const recentBankTransactions = useMemo5(() => {
    const stamp = (row) => {
      const parsed = parseDemoDate(row.date);
      return isNaN(parsed.getTime()) ? -Infinity : parsed.getTime();
    };
    const sent = roleSendHistory.map((t, i) => ({ ...t, direction: "sent", key: t.txnId || `sent-${t.name}-${t.date}-${i}` }));
    const received = receivedRows.map((t, i) => ({ ...t, direction: "received", key: t.txnId || `recv-${t.name}-${t.date}-${i}` }));
    return sent.concat(received).sort((a, b) => stamp(b) - stamp(a)).slice(0, 5);
  }, [roleSendHistory, receivedRows]);
  useEffect12(() => {
    if (onShareRoleChange) onShareRoleChange(shareRole);
  }, [shareRole]);
  const [roleFlipping, setRoleFlipping] = useState14(false);
  const toggleShareRole = () => {
    setRoleFlipping(true);
    setTimeout(() => {
      setShareRole((r) => r === "user" ? "merchant" : "user");
      setRoleFlipping(false);
    }, 180);
  };
  const revealGloobalId = () => {
    setShowIdTag(true);
    setTimeout(() => setShowIdTag(false), 2500);
  };
  const showToast2 = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };
  const handleShareReferralLink = async () => {
    const text = `Join me on Gloobal Access \u2014 send and receive money globally. Use my link: ${referralLink}`;
    await shareOrCopy(
      { title: "Join Gloobal Access", text, url: referralLink },
      referralLink,
      () => showToast2(shareRole === "merchant" ? "Link copied \xB7 Creator" : "Link copied \xB7 Personal")
    );
  };
  const handleCopyReferralLink = () => {
    copyToClipboard(referralLink);
    showToast2(shareRole === "merchant" ? "Link copied \xB7 Creator" : "Link copied \xB7 Personal");
  };
  const handleShareGloobalId = async () => {
    const text = `Send my rent to my Gloobal ID: ${gloobalIdTag}`;
    await shareOrCopy({ title: "My Gloobal ID", text }, gloobalIdTag, () => showToast2("Copied"));
  };
  return <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody,
      overflow: "hidden"
    }}
  ><DashboardAmbientBg /><div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px", background: "transparent" }}><button
    onClick={onOpenCoverage}
    aria-label="Gloobal coverage"
    className="v2-tap"
    style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      gap: 8,
      border: "none",
      background: T.surface,
      borderRadius: T.radiusMd,
      padding: "11px 15px",
      boxShadow: T.shadowCard,
      cursor: "pointer"
    }}
  ><Search3 size={15} color={T.inkFaint} style={{ flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 13, color: T.inkFaint, fontWeight: 500, textAlign: "center" }}><GloobalWordmark suffix=" Coverage" /></span><span style={{ width: 15, flexShrink: 0 }} aria-hidden="true" /></button>{
    /* Profile flip — switches the same account between its two
       sides: user/consumer and merchant/producer. Every flow stays
       identical; only which side the data is read as changes (and
       share links already carry the active side via shareRole). */
  }<button
    onClick={() => {
      setShareRole((r) => {
        const next = r === "user" ? "merchant" : "user";
        showToast2(next === "merchant" ? "Switched to Creator profile" : "Switched to Personal profile");
        return next;
      });
    }}
    aria-label={shareRole === "merchant" ? "Switch to personal profile" : "Switch to creator profile"}
    className="v2-tap"
    style={{
      border: "none",
      background: shareRole === "merchant" ? T.gradButton : T.surface,
      width: 40,
      height: 40,
      borderRadius: "50%",
      padding: 0,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: shareRole === "merchant" ? "0 6px 16px rgba(124,58,237,0.3)" : T.shadowCard,
      flexShrink: 0
    }}
  ><RefreshCw3 size={17} color={shareRole === "merchant" ? "#fff" : T.accent} /></button></div><div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>{activeTab === "home" && <div style={{ padding: "8px 18px 30px", display: "flex", flexDirection: "column", gap: 22 }}><div
    style={{
      position: "relative",
      borderRadius: T.radiusXl,
      padding: "20px 18px",
      background: T.gradWallet,
      boxShadow: T.shadowRaised,
      color: "#fff"
    }}
  >{
    /* Soft decorative glow — purely visual, no logic. Clipped
       to its own wrapper (matching the card's own rounding)
       instead of the card itself being overflow:hidden — that
       was clipping the edge-straddling flag/name badges below,
       cutting them in half. */
  }<div style={{ position: "absolute", inset: 0, borderRadius: T.radiusXl, overflow: "hidden", pointerEvents: "none" }}><div
    style={{
      position: "absolute",
      top: -60,
      right: -60,
      width: 180,
      height: 180,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(255,255,255,0.16), transparent 70%)"
    }}
  /></div>{
    /* Flag — small edge badge, top-left, same straddling
       pattern as the other badges, instead of a large inline
       button. */
  }<button
    onClick={revealGloobalId}
    aria-label="Show my Gloobal ID"
    className="v2-tap"
    style={{
      position: "absolute",
      top: -10,
      left: 20,
      width: 30,
      height: 22,
      border: `1px solid ${T.line}`,
      background: T.surface,
      padding: 2,
      borderRadius: 6,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: T.shadowCard,
      zIndex: 1
    }}
  ><FlagEmoji flag={dialCountry.flag} width={26} height={18} radius={3} /></button>{
    /* "Gloobal India" / "Gloobal Creator" — shifted to the
       right side, up near the balance toggle, anchored from
       the right edge (not left) so long country names can't
       overflow past the card and break the layout the way
       it was doing before. */
  }<span
    style={{
      position: "absolute",
      top: -11,
      right: 20,
      maxWidth: "calc(100% - 90px)",
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
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      zIndex: 1
    }}
  ><GloobalWordmark suffix={shareRole === "merchant" ? " Creator" : ` ${dialCountry.name}`} withSymbols /></span><div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}><span style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0.2, fontFamily: T.fontDisplay }}>{balanceUnavailable ? <span style={{ fontSize: 17, fontWeight: 700, color: T.negative }}>Balance unavailable</span> : balanceVisible ? `${ccy}${balance}` : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}</span><button
    onClick={handleToggleBalance}
    aria-label={balanceVisible ? "Hide balance" : "Show balance"}
    className="v2-tap"
    style={{
      border: "none",
      background: "rgba(255,255,255,0.16)",
      borderRadius: "50%",
      width: 32,
      height: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0
    }}
  ><EyeIcon open={balanceVisible} /></button></div>{
    /* Spending mini chart — sits below its own divider so it
       reads as a distinct footer section of the wallet card
       rather than competing with the balance above it. */
  }<div style={{ position: "relative", marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.18)" }}><DailySpendingChart weeks={dailySpending.weeks} totals={dailySpending.totals} symbol={ccy} /></div>{showIdTag && <div
    style={{
      position: "absolute",
      top: 66,
      left: 22,
      zIndex: 5,
      background: "rgba(15,12,35,0.94)",
      backdropFilter: "blur(6px)",
      color: "#fff",
      borderRadius: 14,
      padding: "9px 14px",
      boxShadow: T.shadowFloat,
      whiteSpace: "nowrap"
    }}
  ><div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, opacity: 0.7, textTransform: "uppercase" }}><GloobalWordmark suffix=" ID" /></div><div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, marginTop: 1, fontFamily: T.fontDisplay }}>{gloobalIdTag}</div></div>}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, justifyItems: "center" }}>{DASHBOARD_ACTIONS.map(({ key, label, Icon }) => {
    const onClick = key === "send" ? onOpenSend : key === "bank" ? onOpenBank : key === "receive" ? () => setShowReceive(true) : key === "scan" ? onOpenScan : void 0;
    const actionColor = { send: sendActionColor, bank: bankActionColor, scan: scanActionColor, receive: receiveActionColor }[key];
    return <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}><button
      onClick={onClick}
      aria-label={label}
      className="v2-tap"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 156,
        aspectRatio: "1",
        borderRadius: T.radiusLg,
        border: "none",
        background: "none",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden"
      }}
    ><SyncedFlipIcon Icon={Icon} size={44} flipInfo={buttonFlips[key]} frontBackground={`${actionColor}22`} />{(key === "send" || key === "receive") && <span style={{ position: "absolute", top: 6, right: 6, zIndex: 2 }}><GH2HFlipCircle size={22} /></span>}{
      /* Direction dot, tucked under the GH2H mark: red on Send, green on
         Receive. Same two colours as every amount in the app (see
         TXN_IN_COLOR / TXN_OUT_COLOR), so the tile you tap and the figure
         that lands in your history agree on what "out" and "in" look like
         before you have read a single word.
         `right: 12` centres a 10px dot under the 22px mark above it: the
         mark spans 6..28 from the tile's right edge, so its centre is 17
         in, and 17 - 10/2 = 12. The white ring keeps it legible against
         the tile's own tint, which is a pale wash of that same hue.
         aria-hidden because the button already announces "Send"/"Receive"
         — the dot restates that visually, it does not add to it. */
    }{(key === "send" || key === "receive") && <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 32,
        right: 12,
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: key === "send" ? TXN_OUT_COLOR : TXN_IN_COLOR,
        boxShadow: `0 0 0 2px ${T.surface}`,
        zIndex: 2
      }}
    />}</button></div>;
  })}</div>{
    /* Bills row (personal) vs Today's Collection (creator) — these
       are mutually exclusive: a creator checking their dashboard
       wants to know what came in today and settle it, not quick-pay
       tiles for their own bills, which is a personal-account concern.
       Bills — a single compact row, kept small and quiet so the
       screen still reads clean; "More" is the door to everything
       else the business/network offers, without listing it all
       here. */
  }{shareRole === "user" ? <div style={{ display: "flex", gap: 10 }}>{BILL_ACTIONS.map(({ key, label, Icon }) => <button
    key={key}
    onClick={() => key === "recharge" ? setShowRecharge(true) : key === "electricity" ? setShowElectricity(true) : key === "rent" ? setShowRentChoice(true) : key === "more" ? setShowMore(true) : showToast2(`${label} \u2014 coming soon`)}
    aria-label={label}
    className="v2-tap"
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "12px 4px",
      border: `1px solid ${T.line}`,
      background: T.surface,
      borderRadius: 16,
      cursor: "pointer",
      boxShadow: T.shadowCard
    }}
  ><span
    style={{
      width: 32,
      height: 32,
      borderRadius: 10,
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><Icon size={15} color={T.accent} /></span><span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkSoft }}>{label}</span></button>)}</div> : <><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4 }}>Today's Collection</span><span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkFaint }}>{todaysDateLabel}</span></div><span style={{ fontSize: 26, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{ccy}{fmt(todaysCollection, ccyCode)}</span><div style={{ display: "flex", gap: 10, marginTop: 2 }}><button
    onClick={() => {
      if (todaysCollection <= 0) return;
      setSettlePendingAmount(todaysCollection);
      setShowSettleAssetsBiometric(true);
    }}
    disabled={todaysCollection <= 0}
    className="v2-tap"
    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", borderRadius: T.radiusMd, padding: "12px 0", color: "#fff", fontSize: 12.5, fontWeight: 800, background: todaysCollection > 0 ? T.gradButton : T.gradButtonDisabled, cursor: todaysCollection > 0 ? "pointer" : "not-allowed", opacity: todaysCollection > 0 ? 1 : 0.6 }}
  ><Landmark3 size={13} color="#fff" />Bank</button><button
    onClick={openGloobalCoinInfo}
    className="v2-tap"
    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1.5px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 0", color: T.ink, fontSize: 12.5, fontWeight: 800, background: T.surface, cursor: "pointer" }}
  ><Coins2 size={13} color={T.ink} />Coin</button></div></div>{
    /* Recent Activity — Received (Creator Share earnings, newest
       first) flips to Paid (this role's own outgoing spend) via one
       control; top 5 either way, with "More" jumping straight into
       the full History screen on the matching tab. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4 }}>Recent Activity</span><div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 999, background: T.surfaceAlt }}>{[
    { key: "receiving", label: "Received" },
    { key: "sending", label: "Paid" }
  ].map((tab) => <button
    key={tab.key}
    onClick={() => setRecentActivityTab(tab.key)}
    className="v2-tap"
    style={{
      border: "none",
      borderRadius: 999,
      padding: "5px 12px",
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      color: recentActivityTab === tab.key ? "#fff" : T.inkFaint,
      background: recentActivityTab === tab.key ? recentActivityTab === "receiving" ? T.positive : T.accent : "transparent",
      transition: "background 0.18s ease, color 0.18s ease"
    }}
  >{tab.label}</button>)}</div></div>{(() => {
    const rows = (recentActivityTab === "receiving" ? receivedRows : roleSendHistory).slice(0, 5);
    if (rows.length === 0) return <div style={{ padding: "14px 2px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing yet</div>;
    return <div style={{ display: "flex", flexDirection: "column" }}>{rows.map((t, i) => <div
      key={t.txnId || `${t.name}-${t.date}-${i}`}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
    >{
      /* Same mark as the History rows — see TransactionRow. The tab
         itself says which direction these are, and the signed amount
         says it again, so the icon is free to be the shared one. */
    }<FlipSymbolCircle size={36} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>{t.date}</span></span><span style={{ fontSize: 13, fontWeight: 800, color: recentActivityTab === "receiving" ? TXN_IN_COLOR : TXN_OUT_COLOR, flexShrink: 0 }}>{recentActivityTab === "receiving" ? "+" : "\u2212"}{ccy}{fmt(t.amount, ccyCode)}</span></div>)}</div>;
  })()}<button
    onClick={() => {
      setHistoryTab(recentActivityTab);
      setHistoryMethodFilter("all");
      setProfileDetail("History");
      setActiveTab("profile");
    }}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, border: "none", background: "none", padding: "4px 0 0", fontSize: 12, fontWeight: 700, color: T.accent, cursor: "pointer" }}
  >More<ChevronRight4 size={14} color={T.accent} /></button></div></>}</div>}{activeTab === "accounts" && <div style={{ padding: "12px 18px 30px", display: "flex", flexDirection: "column", gap: 22 }}>{
    /* Four account tiles — circle icon inside a circle button,
       label sitting outside/below it rather than inside a
       bordered square card. Locks follow the red/green service
       system: Coin is still red-locked; Bank, PayLater, and My
       Assets are live. Linked Banks was removed from here —
       it's redundant with the dedicated Add Bank screen, which
       already covers it. */
  }<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, justifyItems: "center" }}>{[
    { key: "gbank", label: "Gloobal Bank", displayLabel: <GloobalWordmark suffix=" Bank" />, onClick: openGloobalBankInfo },
    { key: "gcoin", label: "Gloobal Coin", displayLabel: <GloobalWordmark suffix=" Coin" />, onClick: openGloobalCoinInfo },
    { key: "gpaylater", label: "PayLater", onClick: () => setShowPayLater(true) },
    { key: "myassets", label: "My Assets", onClick: () => setShowAssets(true) },
    {
      key: "myessentials",
      label: "My Essentials",
      // Opens the real screen even for a first-time (locked) user —
      // the screen itself now carries the "Unlock Gloobal Bank"
      // onboarding banner instead of a toast bouncing them back out.
      onClick: () => setShowEssentials(true)
    },
    { key: "aboutus", label: "About Us", onClick: () => setShowAboutUs(true) }
  ].map(({ key, label, displayLabel, onClick }) => {
    const locked = capabilities[key]?.locked ?? false;
    return <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>{(() => {
    const heroColor = { gbank: bankHeroColor, gcoin: coinHeroColor, gpaylater: paylaterHeroColor, myassets: assetsHeroColor, myessentials: essentialsHeroColor, aboutus: aboutHeroColor }[key];
    const TileIcon = ({ size }) => key === "gbank" ? <img src={G_LOGO_DATA_URI} alt="" style={{ width: size * 1.55, height: size * 1.55, objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : key === "gcoin" ? <Coins2 size={size} color={heroColor} /> : key === "gpaylater" ? <CreditCard3 size={size} color={heroColor} /> : key === "myessentials" ? <EssHome size={size} color={heroColor} /> : key === "aboutus" ? <Info size={size} color={heroColor} /> : <TrendingUp2 size={size} color={heroColor} />;
    return <button
      onClick={onClick}
      aria-label={locked ? `${label} \u2014 locked` : label}
      className="v2-tap"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 130,
        aspectRatio: "1",
        borderRadius: T.radiusLg,
        border: "none",
        background: "none",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        overflow: "hidden"
      }}
    ><span style={{ position: "absolute", top: 6, right: 6, zIndex: 1 }}><ServiceLock locked={locked} size={13} /></span><SyncedFlipIcon Icon={TileIcon} size={48} flipInfo={buttonFlips[key]} frontBackground={key === "gbank" ? heroColor : `${heroColor}22`} /></button>;
  })()}<span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textAlign: "center" }}>{displayLabel || label}</span></div>;
  })}</div>{
    /* One bigger box now instead of the small divider line — the
       cost figure front and center, the HOOMAN-2-HOOMAN mark
       underneath in the same box. Taglines moved outside,
       below the box, instead of living inside it. Corner badge
       matches the same GH2HFlipCircle + size used on the
       Dashboard's Send button corner. */
  }<div
    style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "22px 18px",
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadowCard,
      textAlign: "center"
    }}
  ><span style={{ position: "absolute", top: 10, right: 10, zIndex: 1 }}><GH2HFlipCircle size={22} /></span><span style={{ marginBottom: 4 }}><ZeroPercentMark size={38} color={bankHeroColor} /></span><span style={{ fontSize: 14.5, color: T.ink }}><HoomanMark /></span></div><div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, textAlign: "center" }}>
              Cashless · Taxless · Borderless · Limitless
            </div></div>}{activeTab === "profile" && <div style={{ padding: "12px 18px 30px", display: "flex", flexDirection: "column", gap: 22 }}><div
    style={{
      borderRadius: T.radiusLg,
      background: T.gradWallet,
      boxShadow: T.shadowRaised,
      padding: 26,
      display: "flex",
      flexDirection: "column",
      // Bug fix: the GH Score circle and the name badge are both
      // absolutely positioned on top of this card (see their own
      // comments below — each already got a one-off patch for
      // overlapping the ID row: a maxWidth calc on the badge, a
      // paddingRight reserve on the ID row). Patching each collision as
      // it turned up never closed the actual gap — this card had no
      // fixed proportions, so its real height came from whatever the ID
      // row's flow content needed, with no guaranteed room for the
      // decorations floating on top of it. A real debit card doesn't
      // have that problem because it has a fixed shape: this card now
      // does too, at the standard ID-1 card ratio (85.60 x 53.98mm),
      // and the one real content row is pinned to the card's bottom
      // edge (justifyContent: flex-end) so it's laid out in the space
      // that's actually clear under the circle, not fighting it for the
      // same rows.
      aspectRatio: "1.586 / 1",
      justifyContent: "flex-end",
      gap: 28,
      position: "relative"
    }}
  >{
    /* GH Score — sits fully inside the card's top-right
       corner now (no longer straddling the top edge), and
       bigger so it reads as a real focal point. Still blinks
       through colors, flips to reveal the logo every 10
       seconds, tap opens the Edit ID / GH Score menu. */
  }<span style={{ position: "absolute", top: 14, right: 14, zIndex: 1 }}><div style={{ width: GH_HERO_CIRCLE_SIZE, height: GH_HERO_CIRCLE_SIZE, flexShrink: 0, perspective: 600 }}><button
    onClick={() => setShowGhCircleMenu((v) => !v)}
    aria-label={`GH Score, ${ghRawTotal} of ${ghMaxTotal} \u2014 tap for options`}
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      border: "none",
      padding: 0,
      background: "transparent",
      cursor: "pointer",
      transformStyle: "preserve-3d",
      transition: "transform 0.6s cubic-bezier(.4,.15,.2,1)",
      transform: ghFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  >{
    /* FRONT face — the profile photo.
       This was an empty `.gh-blink-circle`: a colour-cycling disc with a
       pulsing opacity and nothing on it. So the flip went "logo → blank
       pastel circle → logo", and the blank half read as a picture that had
       failed to load rather than as a deliberate face. The card already
       owns a photo (profilePhoto, set from this very circle's own tap menu
       under Photo/Logo) and it was being rendered nowhere.
       With no photo set there is genuinely nothing to show, so it falls
       back to the person's initials on the same cycling disc — an avatar
       placeholder, which is at least legibly *about* them — and only an
       account with no name at all still lands on the bare circle. */
  }<span
    className={profilePhoto ? void 0 : "gh-blink-circle"}
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      boxShadow: "0 6px 18px rgba(76,29,149,0.22)",
      // The photo is cropped to the circle by this, not by the img.
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // Only when a photo covers the whole face: the class carries both the
      // colour cycle and a 1.6s opacity blink, and a blinking photograph
      // looks like a rendering fault.
      background: profilePhoto ? T.surface : void 0
    }}
  >{profilePhoto
    ? <img
        src={profilePhoto}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    : <span
        style={{
          fontSize: GH_HERO_CIRCLE_SIZE * 0.34,
          fontWeight: 800,
          color: "#fff",
          fontFamily: T.fontDisplay,
          letterSpacing: 0.5,
          // The disc underneath is already pulsing; letting the letters
          // pulse with it makes them hard to read, so they sit at full
          // opacity in their own layer.
          animation: "none"
        }}
      >{profileInitials(myName)}</span>}</span><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: ghLogoColor,
      boxShadow: "0 6px 18px rgba(76,29,149,0.22)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      transition: "background 0.3s ease"
    }}
  ><img
    src={G_LOGO_DATA_URI}
    alt=""
    style={{
      width: "100%",
      height: "100%",
      objectFit: "contain",
      filter: `brightness(0) invert(1) drop-shadow(0 0 5px ${ghLogoColor}80)`
    }}
  /></span></button></div></span>{
    /* Name — top-edge straddling badge, same pattern as the
       Login/Registration badges during registration. */
  }<span
    style={{
      position: "absolute",
      top: -11,
      left: 26,
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
      whiteSpace: "nowrap",
      display: "flex",
      alignItems: "center",
      gap: 5,
      // The GH Score circle below is 76px wide and sits 14px in from the
      // card's right edge, so anything on this row that runs past
      // (100% − 116px) ends up underneath it. A long registered name did
      // exactly that: the badge kept growing (nowrap, no bound) straight
      // under the circle. It now stops short and ellipsises instead.
      maxWidth: "calc(100% - 116px)",
      overflow: "hidden",
      zIndex: 1
    }}
  ><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myName && myName.trim() ? myName : <GloobalWordmark suffix=" ID Member" />}</span><span
    aria-label="Verified"
    style={{
      width: 12,
      height: 12,
      borderRadius: "50%",
      flexShrink: 0,
      background: T.positive,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><Check2 size={8} color="#fff" strokeWidth={3.5} /></span></span>{
    /* Photo circle removed as its own separate tappable element —
       merged into the GH blink circle's tap menu below as the
       "Profile" option instead (one element, one menu, rather than
       two separate photo-ish affordances competing for attention).
       The hidden file input stays; the menu option below still opens
       it the same way. */
  }<input
    ref={profilePhotoInputRef}
    type="file"
    accept="image/*"
    onChange={handleProfilePhotoFile}
    style={{ display: "none" }}
  /><div style={{ position: "relative" }}>{
    /* Three-option menu — Edit ID, GH Score, or Profile (photo for
       Personal, logo for Creator — same underlying file picker
       either way, just different framing). */
  }{showGhCircleMenu && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column" }}><NavBackButton onClick={requestCloseGhCircleMenu} style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: 18,
      zIndex: 1
     }} /><div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}><div
    style={{
      width: "100%",
      maxWidth: 380,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: "36px 16px",
      borderRadius: T.radiusXl,
      background: T.surface,
      boxShadow: T.shadowRaised
    }}
  >{[
    { key: "id", label: "ID", Icon: Pencil, onClick: () => { setSuggestedUpdateId(genSuggestedId(12)); setProfileOverlay("updateId"); } },
    { key: "score", label: "Score", Icon: TrendingUp2, onClick: () => setProfileOverlay("ghscore") },
    // Personal asks for a photo, Creator asks for a logo — same file
    // picker either way (profilePhotoInputRef), just different
    // framing depending on which side of the account is active.
    { key: "profile", label: shareRole === "merchant" ? "Logo" : "Photo", Icon: ImageIcon, onClick: () => profilePhotoInputRef.current?.click() }
  ].map((opt) => <button
    key={opt.key}
    onClick={() => {
      setShowGhCircleMenu(false);
      opt.onClick();
    }}
    aria-label={opt.label}
    className="v2-tap"
    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, border: "none", background: "none", padding: 0, cursor: "pointer" }}
  ><FlippingMenuIcon Icon={opt.Icon} size={88} /><span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>{opt.label}</span></button>)}</div></div></div>}</div>{
    /* Gloobal ID — one line, shrinking to fit rather than
       wrapping. Eye icon sits on the card's right edge,
       straddling it, vertically aligned with this specific
       row (not the card overall) since it's positioned
       relative to this row's own wrapper. */
  }<div
    style={{
      position: "relative",
      // See GH_ID_ROW_RESERVE above. IdSymbolDots in oneLine mode takes
      // width: 100% and divides it between the twelve characters, so with
      // nothing reserving the circle's column the last few characters of
      // the Gloobal ID were drawn underneath it — the overlap on the
      // profile card. Reserving the column makes the characters shrink to
      // fit the space that is actually free.
      paddingRight: GH_ID_ROW_RESERVE
    }}
  ><button
    onClick={() => setShowGhCircleMenu(true)}
    aria-label="Gloobal ID — tap for options"
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      border: "none",
      background: "none",
      padding: 0,
      cursor: "pointer",
      width: "100%"
    }}
  >{
    /* Bug fix: size defaulted to 20 (24 in the old oneLine cap) — small
       enough that the whole row sat as a thin strip at the bottom of a
       much taller card, with most of the card's own height going unused
       above it. Sized up so the row is a real second focal point next to
       the GH Score circle rather than an afterthought; IdSymbolDots still
       shrinks each dot to fit whatever width is actually free (see its
       own comment), so this is a ceiling, not a fixed size. */
  }<IdSymbolDots id={personalGloobalId} revealed oneLine size={48} /></button></div></div><div style={{ borderRadius: T.radiusLg, overflow: "hidden", boxShadow: T.shadowCard, display: "flex", flexDirection: "column", gap: 2 }}>{PROFILE_ROWS.map((label, i) => {
    const rowColor = POSITION_COLORS[i % POSITION_COLORS.length];
    return <button
      key={label}
      onClick={() => setProfileDetail(label)}
      className="v2-row"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "15px 18px",
        border: "none",
        background: `${rowColor}14`,
        cursor: "pointer",
        textAlign: "left"
      }}
    ><span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{label}</span><ChevronRightIcon /></button>;
  })}</div>{
    /* Referral — moved here from the overview card. Tapping
       the row opens the Referral Network screen; tapping the
       share icon on the right opens Share directly instead. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, overflow: "hidden", boxShadow: T.shadowCard }}><button
    onClick={() => setProfileOverlay("referral")}
    className="v2-row"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "15px 18px",
      border: "none",
      background: "none",
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>My Referral Network</span><span
    role="button"
    tabIndex={0}
    onClick={(e) => {
      e.stopPropagation();
      setProfileOverlay("share");
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        setProfileOverlay("share");
      }
    }}
    aria-label="Share your referral link"
    style={{
      width: 32,
      height: 32,
      borderRadius: "50%",
      flexShrink: 0,
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><Share22 size={15} color={T.accent} /></span></button></div><button
    onClick={onLogout}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: "1px solid rgba(226,63,69,0.22)",
      background: T.negativeSoft,
      borderRadius: T.radiusMd,
      padding: "14px 0",
      color: T.negative,
      fontSize: 13.5,
      fontWeight: 800,
      cursor: "pointer"
    }}
  ><LogoutIcon />
              Exit
            </button></div>}</div><div
    style={{
      display: "flex",
      background: T.surface,
      borderTop: `1px solid ${T.line}`,
      padding: "10px 0 calc(10px + env(safe-area-inset-bottom, 0px))",
      flexShrink: 0
    }}
  ><button
    onClick={() => setActiveTab("home")}
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      border: "none",
      background: "none",
      cursor: "pointer",
      padding: "4px 0"
    }}
  ><HomeTabIcon active={activeTab === "home"} /><span style={{ fontSize: 10.5, fontWeight: 700, color: activeTab === "home" ? T.accent : T.inkFaint }}>
            Home
          </span></button><button
    onClick={() => setActiveTab("accounts")}
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      border: "none",
      background: "none",
      cursor: "pointer",
      padding: "4px 0"
    }}
  ><AccountsTabIcon active={activeTab === "accounts"} /><span style={{ fontSize: 10.5, fontWeight: 700, color: activeTab === "accounts" ? T.accent : T.inkFaint }}>
            Accounts
          </span></button><button
    onClick={() => setActiveTab("profile")}
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      border: "none",
      background: "none",
      cursor: "pointer",
      padding: "4px 0"
    }}
  ><ProfileTabIcon active={activeTab === "profile"} /><span style={{ fontSize: 10.5, fontWeight: 700, color: activeTab === "profile" ? T.accent : T.inkFaint }}>
            Profile
          </span></button></div>{toast && <div
    style={{
      position: "absolute",
      bottom: 90,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 50,
      background: T.ink,
      color: "#fff",
      padding: "11px 18px",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: "nowrap",
      boxShadow: T.shadowFloat
    }}
  >{toast}</div>}{
    /* Recharge sheet — mobile operators for the person's own country
       only. Every operator is listed but locked (right-side lock)
       until live recharge APIs are wired in, so the catalogue is real
       and ready without pretending it works yet. */
  }{showRecharge && <div style={{ position: "fixed", inset: 0, zIndex: 60, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ padding: "calc(18px + env(safe-area-inset-top, 0px)) 22px 0", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><span style={{ display: "flex", alignItems: "center", gap: 10 }}><FlagEmoji flag={dialCountry.flag} width={28} height={21} radius={6} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Recharge</span></span><button
    onClick={requestCloseRecharge}
    aria-label="Close"
    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><X3 size={15} color={T.inkSoft} /></button></div><p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 14px" }}>
              Operators in {dialCountry.name} — unlocking soon
            </p></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", margin: "0 22px calc(22px + env(safe-area-inset-bottom, 0px))", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}>{(TELECOMS_BY_COUNTRY[dialCountry.iso] || []).length === 0 ? <div style={{ padding: "22px 18px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Coming soon</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 3 }}>
                    Operators for {dialCountry.name} aren't listed yet.
                  </div></div> : TELECOMS_BY_COUNTRY[dialCountry.iso].map((name, i) => <button
    key={name}
    onClick={() => showToast2("Locked until live APIs connect")}
    aria-label={`${name} \u2014 locked`}
    className="v2-row"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 15px",
      border: "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      background: "none",
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span
    style={{
      width: 36,
      height: 36,
      borderRadius: 11,
      flexShrink: 0,
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 800,
      color: T.accent
    }}
  >{name.replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span><ServiceLock /></button>)}</div></div>}{
    /* Electricity sheet — same locked-catalogue pattern as Recharge:
       the person's own country's electricity operators are listed and
       real, but every row is locked (red) until live utility-payment
       APIs are connected. */
  }{showElectricity && <div style={{ position: "fixed", inset: 0, zIndex: 60, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ padding: "calc(18px + env(safe-area-inset-top, 0px)) 22px 0", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><span style={{ display: "flex", alignItems: "center", gap: 10 }}><FlagEmoji flag={dialCountry.flag} width={28} height={21} radius={6} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Electricity</span></span><button
    onClick={requestCloseElectricity}
    aria-label="Close"
    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><X3 size={15} color={T.inkSoft} /></button></div><p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 14px" }}>
              Operators in {dialCountry.name} — unlocking soon
            </p></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", margin: "0 22px calc(22px + env(safe-area-inset-bottom, 0px))", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}>{(ELECTRICITY_BY_COUNTRY[dialCountry.iso] || []).length === 0 ? <div style={{ padding: "22px 18px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Coming soon</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 3 }}>
                    Operators for {dialCountry.name} aren't listed yet.
                  </div></div> : ELECTRICITY_BY_COUNTRY[dialCountry.iso].map((name, i) => <button
    key={name}
    onClick={() => showToast2("Locked until live APIs connect")}
    aria-label={`${name} \u2014 locked`}
    className="v2-row"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 15px",
      border: "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      background: "none",
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span
    style={{
      width: 36,
      height: 36,
      borderRadius: 11,
      flexShrink: 0,
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 800,
      color: T.accent
    }}
  >{name.replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span><ServiceLock /></button>)}</div></div>}{
    /* More — search bar up top, one scrollable list below: Recharge /
       Electricity / Rent pinned first (reusing their own Bills
       buttons' handlers), then Travel as an icon group, then the top
       10 businesses. Full-screen like Add Bank / Coverage rather than
       a bottom sheet, since the list can run long once search is in
       play. */
  }{showMore && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseMore} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Pay & Services</span></div><div style={{ padding: "0 18px 10px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 14px", boxShadow: T.shadowCard }}><Search3 size={16} color={T.inkFaint} /><input
    value={moreQuery}
    onChange={(e) => setMoreQuery(e.target.value)}
    placeholder="Search businesses & services"
    style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 13.5, color: T.ink, fontFamily: "inherit" }}
  />{moreQuery && <button onClick={() => setMoreQuery("")} aria-label="Clear search" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex" }}><X3 size={14} color={T.inkFaint} /></button>}</div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 18 }}>{(() => {
    const q = moreQuery.trim().toLowerCase();
    const pinned = [
      { key: "recharge", label: "Recharge", Icon: Smartphone2, color: bankHeroColor, onClick: () => {
        requestCloseMore();
        setShowRecharge(true);
      } },
      { key: "electricity", label: "Electricity", Icon: Zap3, color: coinHeroColor, onClick: () => {
        requestCloseMore();
        setShowElectricity(true);
      } },
      { key: "rent", label: "Rent", Icon: Home3, color: paylaterHeroColor, onClick: () => {
        requestCloseMore();
        setShowRentChoice(true);
      } },
      { key: "autopay", label: "Autopay", Icon: RefreshCw3, color: assetsHeroColor, onClick: () => {
        requestCloseMore();
        showToast2("Autopay \u2014 coming soon");
      } }
    ].filter((a) => !q || a.label.toLowerCase().includes(q));
    const businesses = TOP_BUSINESSES.filter((b) => !q || b.label.toLowerCase().includes(q));
    const travelMatches = TRAVEL_ACTIONS.filter((t) => t.label.toLowerCase().includes(q));
    const showTravelSection = !q || travelMatches.length > 0;
    return <>{pinned.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
                        Quick pay
                      </div><div style={{ display: "flex", gap: 10 }}>{pinned.map(({ key, label, Icon, onClick }) => <button
      key={key}
      onClick={onClick}
      aria-label={label}
      className="v2-tap"
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 4px", border: `1px solid ${T.line}`, background: T.surface, borderRadius: 16, cursor: "pointer", boxShadow: T.shadowCard }}
    >{
      /* Same 32px/T.accentSoft/T.accent icon treatment as the
         Dashboard's own Bills row, so Recharge/Electricity/Rent
         look identical wherever they appear — this used to render
         each with its own hero color in a larger 38px box here,
         while the Dashboard used one shared accent style. */
    }<span style={{ width: 32, height: 32, borderRadius: 10, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={15} color={T.accent} /></span><span style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>{label}</span></button>)}</div></div>}{showTravelSection && <div><button
      onClick={() => setTravelExpanded((v) => !v)}
      className="v2-tap"
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", border: "none", background: "none", padding: "2px 2px 8px", cursor: "pointer" }}
    ><span style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>Travel</span>{travelExpanded || q ? <ChevronUp size={15} color={T.inkFaint} /> : <ChevronDown size={15} color={T.inkFaint} />}</button>{(travelExpanded || q) && <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>{(q ? travelMatches : TRAVEL_ACTIONS).map(({ key, label, Icon, chip, cashbackRate }) => <button
      key={key}
      onClick={() => {
        requestCloseMore();
        setPayTarget({ key, label, chip, Icon, cashbackRate });
        setPayAmount("25.00");
      }}
      aria-label={label}
      className="v2-tap"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 4px", border: `1px solid ${T.line}`, background: T.surface, borderRadius: 16, cursor: "pointer", boxShadow: T.shadowCard }}
    ><span style={{ width: 38, height: 38, borderRadius: 12, background: T.positiveSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color={T.positive} /></span><span style={{ fontSize: 11, fontWeight: 700, color: T.ink, textAlign: "center" }}>{label}</span></button>)}</div>}</div>}<div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
                      Top businesses
                    </div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{businesses.length === 0 ? <div style={{ padding: "22px 18px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>No matches</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 3 }}>Try a different search.</div></div> : businesses.map((b, i) => <button
      key={b.key}
      onClick={() => {
        requestCloseMore();
        setPayTarget({ key: b.key, label: b.label, chip: b.chip, Icon: null, cashbackRate: b.cashbackRate });
        setPayAmount("25.00");
      }}
      aria-label={`Pay ${b.label}`}
      className="v2-row"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
    ><span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.accent }}>{b.chip}</span><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</span><ChevronRightIcon /></button>)}</div></div></>;
  })()}</div></div>}{
    /* Generic Pay sheet — opened from a business or Travel option in
       More. Deliberately minimal: same functional core as Send Money
       (amount in, confirm, done) without the receiver search, since
       the "receiver" here is a fixed business rather than a person. */
  }{payTarget && <div style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "calc(18px + env(safe-area-inset-top, 0px)) 22px calc(30px + env(safe-area-inset-bottom, 0px))" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}><span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 34, height: 34, borderRadius: 11, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.accent }}>{payTarget.Icon ? <payTarget.Icon size={17} color={T.accent} /> : payTarget.chip}</span><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Pay {payTarget.label}</span></span><button
    onClick={requestClosePayTarget}
    aria-label="Close"
    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><X3 size={15} color={T.inkSoft} /></button></div><div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 6 }}>Amount</div><div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 14px", marginBottom: 8 }}><span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{ccy}</span><input
    value={payAmount}
    onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
    inputMode="decimal"
    style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: "inherit" }}
  /></div>{payTarget.cashbackRate > 0 && <div style={{ fontSize: 11.5, color: T.positive, fontWeight: 700, marginBottom: 18 }}>
                Earn {(payTarget.cashbackRate * 100).toFixed(2)}% back — {ccy}{fmt(((parseFloat(payAmount) || 0) * payTarget.cashbackRate), ccyCode)} instantly added to My Assets and your PayLater limit
              </div>}<button
    onClick={() => {
      const amt = parseFloat(payAmount) || 0;
      if (amt <= 0) return;
      // Same options -> PIN -> biometric sequence Send Money uses —
      // see PayOptionsSheet/PayPinModal below, then the biometric
      // step, only THEN does executeTransaction() actually run.
      setPayTargetOptionsOpen(true);
    }}
    className="v2-tap"
    style={{ width: "100%", border: "none", borderRadius: T.radiusMd, padding: "15px 0", color: "#fff", fontSize: 14, fontWeight: 800, background: T.gradButton, boxShadow: "0 8px 20px rgba(124,58,237,0.32)", cursor: "pointer" }}
  >
              Pay
            </button></div></div>}<PayOptionsSheet
    open={payTargetOptionsOpen}
    onClose={() => setPayTargetOptionsOpen(false)}
    onChoose={(label) => {
      // Whether Coin works is one fact, held in deriveCapabilityStates.
      // This used to assert it independently, which is how Coin ended up
      // "not live" here and fully ticked on its own screen at the same time.
      if (label === "Gloobal Coin" && !capabilities.gcoin.payments) {
        showToast2("Paying with Gloobal Coin isn't wired to this flow yet \u2014 paying via Gloobal Bank instead");
      }
      setPayTargetMethod(label === "Gloobal Coin" && !capabilities.gcoin.payments ? null : label);
      setPayTargetOptionsOpen(false);
      setPayTargetPinOpen(true);
    }}
  /><PayPinModal
    open={payTargetPinOpen}
    onClose={() => setPayTargetPinOpen(false)}
    amountLabel={payTarget ? `\u2212${ccy}${fmt((parseFloat(payAmount) || 0), ccyCode)}` : null}
    onVerified={() => {
      setPayTargetPinOpen(false);
      setShowPayTargetBiometric(true);
    }}
  />{showPayTargetBiometric && <BiometricVerifyScreen
    onBack={() => setShowPayTargetBiometric(false)}
    onVerify={() => {
      if (payTargetBiometricScanning || !payTarget) return;
      setPayTargetBiometricScanning(true);
      setTimeout(() => {
        setPayTargetBiometricScanning(false);
        setShowPayTargetBiometric(false);
        const amt = parseFloat(payAmount) || 0;
        // Same one canonical lifecycle as Send Money / Scan & Pay: a
        // single executeTransaction() call — risk-check, bank debit,
        // provenance, complaint window, and (only on success) the
        // Essentials grant — all atomic. No separate posting path.
        onPayBusiness({ key: payTarget.key, label: payTarget.label, chip: payTarget.chip || payTarget.label.slice(0, 2).toUpperCase(), amount: amt, cashbackRate: payTarget.cashbackRate, payMethodLabel: payTargetMethod });
        const cashback = amt * (payTarget.cashbackRate || 0);
        showToast2(
          cashback > 0 ? `Paid ${ccy}${fmt(amt, ccyCode)} to ${payTarget.label} \u2014 +${ccy}${fmt(cashback, ccyCode)} instant to PayLater & Assets` : `Paid ${ccy}${fmt(amt, ccyCode)} to ${payTarget.label}`
        );
        requestClosePayTarget();
      }, 700);
    }}
    scanning={payTargetBiometricScanning}
  />}{showReceive && <div style={{ position: "fixed", inset: 0, zIndex: 60, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(18px + env(safe-area-inset-top, 0px)) 22px 6px", flexShrink: 0 }}><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}><GloobalWordmark suffix=" ID" withSymbols /></span><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, fontVariantNumeric: "tabular-nums" }}>{receiveQrSecondsLeft}s
              </span><NavHistoryButton
    onClick={() => {
      requestCloseReceive();
      setActiveTab("profile");
      setProfileDetail("History");
      setHistoryTab("receiving");
      setHistoryMethodFilter("all");
    }}
    label="Received history"
  /><NavCloseButton onClick={requestCloseReceive} /></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "18px 22px calc(30px + env(safe-area-inset-bottom, 0px))" }}><div
    style={{
      position: "relative",
      display: "flex",
      justifyContent: "center",
      padding: 22,
      borderRadius: 20,
      background: T.surfaceAlt,
      border: `1px solid ${T.line}`,
      marginBottom: 18
    }}
  ><GloobalQRCode code={encodeGloobalQR({ gloobalId: gloobalIdTag, amountCents: 0 })} size={230} onSecondsLeftChange={setReceiveQrSecondsLeft} /><div style={{ position: "absolute", top: "50%", right: 0, transform: "translate(50%, -50%)", perspective: 200 }}><button
    onClick={() => {
      requestCloseReceive();
      setShowMyShare(true);
    }}
    aria-label={`My Share, currently ${myShareRate}%`}
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
      transform: myShareIconFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
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
  ><span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff" }}>{myShareRate}%</span></span></span></button></div></div><div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      background: T.surfaceAlt,
      border: `1px solid ${T.line}`,
      borderRadius: T.radiusMd,
      padding: "14px 16px"
    }}
  ><span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}><FlagEmoji flag={dialCountry.flag} width={30} height={23} radius={6} /><span style={{ fontSize: 15, fontWeight: 700, fontFamily: T.fontDisplay, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><ColoredGloobalId id={gloobalIdTag} /></span></span><button
    onClick={() => {
      copyToClipboard(gloobalIdTag);
      showToast2("Copied");
    }}
    aria-label="Copy Gloobal ID"
    style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
  ><Copy2 size={15} color={T.accent} /></button></div>{
    /* Recent — the last five payments actually received on this
       Gloobal ID, right on the Receive sheet itself rather than only
       reachable through the header's history icon. Same source
       (receivedRows) and cap (5) as the Home tab's own receiving list
       above, already newest-first (see receivedRows' own comment). */
  }{receivedRows.length > 0 && <div style={{ marginTop: 18 }}><div style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 10px 2px" }}>
              Recent
            </div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", padding: "6px 16px 10px" }}>{receivedRows.slice(0, 5).map((t, i) => <div
    key={t.txnId || `${t.name}-${t.date}-${i}`}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
  >{
    /* Same mark as the History rows — see TransactionRow. Direction is
       already carried by the signed, coloured amount on the right, so
       the icon does not need to repeat it, and repeating it was the only
       thing making these rows look like a different app's list. */
  }<FlipSymbolCircle size={36} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>{t.date}</span></span><span style={{ fontSize: 13, fontWeight: 800, color: TXN_IN_COLOR, flexShrink: 0 }}>
                    +{ccy}{fmt(Number(t.amount || 0), ccyCode)}
                  </span></div>)}</div></div>}</div></div>}{
    /* My Share — the % of every incoming payment this person shares
       back with whoever paid them. Opened from the Receive sheet's
       pill button. Slider and the custom-% input stay in sync (both
       write to the same myShareRate state), and the preview below
       recomputes live off whatever value is currently set. */
  }{showMyShare && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 6px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}><NavBackButton onClick={requestCloseMyShare} style={{ flexShrink: 0  }} /><div><div style={{ fontSize: 21, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 6 }}>My Share</div></div></div><button
    onClick={() => setShowCreatorOverview(true)}
    aria-label="Creator Share overview"
    className="v2-tap"
    style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.positive, boxShadow: "0 4px 12px rgba(5,150,105,0.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
  ><BarChart3 size={17} color="#fff" /></button></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 18px 30px", display: "flex", flexDirection: "column", gap: 22 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 18px 6px" }}>{
    /* My contribution — big open readout, no box around it */
  }<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 20 }}><div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 48, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay }}>{myShareRate.toFixed(2)}</span><span style={{ fontSize: 22, fontWeight: 700, color: T.ink }}>%</span></div><div style={{ fontSize: 13, color: T.inkSoft, textAlign: "center" }}>
                  For every 100, it's <span style={{ color: T.accent, fontWeight: 800 }}>{myShareRate.toFixed(2)}</span></div></div>{
    /* Slider */
  }<div style={{ marginBottom: 20 }}><input
    type="range"
    min={0}
    max={7}
    step={0.01}
    value={myShareRate}
    onChange={(e) => setMyShareRate(Math.min(7, Math.max(0, parseFloat(e.target.value))))}
    aria-label="My contribution percentage"
    style={{ width: "100%", accentColor: T.accent, cursor: "pointer" }}
  /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: T.inkFaint, marginTop: -2 }}><span>0%</span><span>7%</span></div></div>{
    /* Preview */
  }<div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 14 }}>Preview</div>{[
    { icon: User, label: "Payment amount", value: `${ccy}1000.00`, color: T.ink },
    { icon: Store2, label: "User gets", value: `${ccy}${fmt((1e3 * (myShareRate / 100)), ccyCode)}`, color: T.accent },
    { icon: PieChart, label: "My contribution", value: `${myShareRate.toFixed(2)}%`, color: T.accent }
  ].map((row, i) => <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}><row.icon size={16} color={T.inkFaint} /><span style={{ flex: 1, fontSize: 13.5, color: T.inkSoft, fontWeight: 600 }}>{row.label}</span><span style={{ fontSize: 14, fontWeight: 800, color: row.color }}>{row.value}</span></div>)}</div></div><div style={{ flexShrink: 0, padding: "0 18px calc(18px + env(safe-area-inset-bottom, 0px))" }}><button
    onClick={() => setShowMyShareBiometric(true)}
    disabled={myShareSaving}
    className="v2-tap"
    style={{ width: "100%", border: "none", borderRadius: T.radiusMd, padding: "16px 0", color: "#fff", fontSize: 14.5, fontWeight: 800, background: T.gradButton, boxShadow: "0 8px 20px rgba(124,58,237,0.32)", cursor: myShareSaving ? "default" : "pointer", opacity: myShareSaving ? 0.65 : 1 }}
  >{myShareSaving ? "Saving…" : "Update"}</button></div></div>}{
    /* Applying a newly-chosen My Share rate — same mandatory Face ID +
       fingerprint screen used for PIN-follow-up everywhere else. */
  }{showMyShareBiometric && <BiometricVerifyScreen
    onBack={() => setShowMyShareBiometric(false)}
    onVerify={handleMyShareBiometricVerify}
    scanning={myShareBiometricScanning}
  />}{
    /* RENT — tapping the Bills row's Rent action opens this choice
       first: Send Rent reuses the exact same flow as the main Send
       action (onOpenSend → SendMoneyScreen); Accept Rent opens the QR
       + Gloobal ID sheet below instead, since collecting rent is a
       receiving action, not a sending one. */
  }{showRentChoice && <div style={{ position: "fixed", inset: 0, zIndex: 60, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "calc(18px + env(safe-area-inset-top, 0px)) 22px calc(30px + env(safe-area-inset-bottom, 0px))" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Rent</span><button
    onClick={requestCloseRentChoice}
    aria-label="Close"
    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><X3 size={15} color={T.inkSoft} /></button></div><p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 16px" }}>Paying rent, or collecting it?</p><div style={{ display: "flex", gap: 12 }}><button
    onClick={() => {
      requestCloseRentChoice();
      onOpenSend();
    }}
    aria-label="Send Rent"
    className="v2-tap"
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      padding: "20px 14px",
      border: `1px solid ${T.line}`,
      background: T.surfaceAlt,
      borderRadius: T.radiusLg,
      cursor: "pointer"
    }}
  ><span style={{ width: 42, height: 42, borderRadius: 14, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowUpDown size={15} color={T.accent} /></span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Send Rent</span><span style={{ fontSize: 10.5, color: T.inkFaint, textAlign: "center", lineHeight: 1.4 }}>Pay your landlord</span></button><button
    onClick={() => {
      requestCloseRentChoice();
      setShowReceive(true);
    }}
    aria-label="Accept Rent"
    className="v2-tap"
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      padding: "20px 14px",
      border: `1px solid ${T.line}`,
      background: T.surfaceAlt,
      borderRadius: T.radiusLg,
      cursor: "pointer"
    }}
  ><span style={{ width: 42, height: 42, borderRadius: 14, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowDown size={19} color={T.accent} /></span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Accept Rent</span><span style={{ fontSize: 10.5, color: T.inkFaint, textAlign: "center", lineHeight: 1.4 }}>Collect from a tenant</span></button></div></div></div>}{
    /* Profile settings sheet — one overlay for all the basic options.
       Prototype-stage functionality: toggles toggle, selections select,
       Linked Banks jumps to the real Add Bank screen. */
  }{
    /* PayLater — balance, pending dues, and history. Prototype ledger:
       all figures derive from one history array so nothing can drift. */
  }{showPayLater && <PayLaterScreen
    onClose={requestClosePayLater}
    ccy={ccy} ccyCode={ccyCode}
    paylaterAvailable={paylaterAvailable}
    paylaterLimit={PAYLATER_LIMIT}
    totalAssets={totalAssets}
    paylaterDue={paylaterDue}
    paylaterReceiving={paylaterReceiving}
    paylaterSending={paylaterSending}
    onViewAssets={() => {
      requestClosePayLater();
      setShowAssets(true);
    }}
    onPayNow={() => showToast2("Payments unlock with live APIs")}
    toast={toast}
  />}{
    /* My Assets — spending becomes earnings becomes assets. Cashback
       from a payment isn't shown as a one-off rebate; it's carried
       forward as a small asset that keeps growing at a fixed
       monthly rate from the moment it was earned. */
  }{
    /* Gloobal Bank's own info sheet — opened by tapping its tile in
       Accounts. "Interested" just flips a local flag and shows a
       toast, standing in for what would be a real signup/waitlist
       call that gives the business a signal of demand. */
  }{showGloobalBankInfo && <ScreenErrorBoundary name="Gloobal Bank" onClose={requestCloseGloobalBankInfo}><GloobalBankScreen
    onBack={requestCloseGloobalBankInfo}
    onOpenStats={() => {
      loadInterestCount("bank");
      setShowGloobalBankStats(true);
    }}
    heroColor={bankHeroColor}
    services={serviceRowsFor(CAPABILITY_KEY.GLOOBAL_BANK)}
    interested={gloobalBankInterested}
    interestBusy={interestBusy === "bank"}
    onRegisterInterest={() => registerInterest("bank")}
    ccy={ccy} ccyCode={ccyCode}
    balance={balance}
    balanceUnavailable={balanceUnavailable}
    balanceVisible={balanceVisible}
    onToggleBalance={handleToggleBalance}
    recentTransactions={recentBankTransactions}
  /></ScreenErrorBoundary>}{showGloobalCoinInfo && <ScreenErrorBoundary name="Gloobal Coin" onClose={requestCloseGloobalCoinInfo}><GloobalCoinScreen
    onBack={requestCloseGloobalCoinInfo}
    onOpenStats={() => {
      loadInterestCount("coin");
      setShowGloobalCoinStats(true);
    }}
    heroColor={coinHeroColor}
    services={serviceRowsFor(CAPABILITY_KEY.GLOOBAL_COIN)}
    interested={gloobalCoinInterested}
    interestBusy={interestBusy === "coin"}
    onRegisterInterest={() => registerInterest("coin")}
    symbolId={currentSymbolId}
    ccy={ccy} ccyCode={ccyCode}
    bankBalance={bankBalance}
    coinBalance={coinBalance}
    coinHistory={coinHistory}
    supply={coinSupply}
    busy={coinBusy}
    onMint={handleMintCoin}
    onRedeem={handleRedeemCoin}
    onOpenSend={() => setShowSendCoin(true)}
    onRefresh={refreshCoinPosition}
  /></ScreenErrorBoundary>}{showSendCoin && <ScreenErrorBoundary name="Send Gloobal Coin" onClose={requestCloseSendCoin}><SendCoinScreen
    onBack={requestCloseSendCoin}
    coinBalance={coinBalance}
    onResolveRecipient={(identifier) => GloobalApi.resolveUser(identifier)}
    onSend={handleSendCoin}
    onShowToast={showToast2}
  /></ScreenErrorBoundary>}{
    /* Real interest data, counted server-side. Both numbers used to be
       written into the JSX — `interested ? 100 : 0`% and
       `interested ? 1 : 0` of a hardcoded "1 active user" — so this
       screen reported on nobody but the person reading it. They now
       come from GET /api/interest/:product, which counts the Interest
       collection against User.countDocuments(). ∆ while the server
       hasn't answered: a 0 here would read as "nobody wants this",
       which is a different claim from "we don't know yet". */
  }{showGloobalBankStats && <div style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseGloobalBankStats} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Interest so far</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "26px 20px", textAlign: "center" }}><div style={{ fontSize: 44, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay }}>{interestSummary("bank") ? `${interestSummary("bank").percent}%` : "∆"}</div><div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>{interestSummary("bank")?.caption || "Couldn't load the count — reopen this screen to try again."}</div></div><div style={{ fontSize: 11, color: T.inkFaint, textAlign: "center", lineHeight: 1.4 }}>
              Counted on the server: every account that has tapped “I am IN”, against every account registered. ∆ means the figure couldn’t be loaded, not that it is zero.
            </div></div></div>}{showGloobalCoinStats && <div style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseGloobalCoinStats} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Interest so far</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "26px 20px", textAlign: "center" }}><div style={{ fontSize: 44, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay }}>{interestSummary("coin") ? `${interestSummary("coin").percent}%` : "∆"}</div><div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>{interestSummary("coin")?.caption || "Couldn't load the count — reopen this screen to try again."}
              </div></div><div style={{ fontSize: 11, color: T.inkFaint, textAlign: "center", lineHeight: 1.4 }}>
              Counted on the server: every account that has tapped “I am IN”, against every account registered. ∆ means the figure couldn’t be loaded, not that it is zero.
            </div></div></div>}{
    /* About Us — same header/hero pattern as the Bank and Coin
       info screens: colored circle behind the logo, a short
       mission line, a real feature list (not fabricated
       numbers), then the same Version/Terms/Privacy rows and
       support email already used on the profile About screen. */
  }{showAboutUs && <ScreenErrorBoundary name="About Us" onClose={requestCloseAboutUs}><AboutUsScreen
    onBack={requestCloseAboutUs}
    heroColor={aboutHeroColor}
    onShowToast={showToast2}
  /></ScreenErrorBoundary>}{showAssets && <AssetsScreen
    onClose={requestCloseAssets}
    ccy={ccy} ccyCode={ccyCode}
    assetRows={assetRows}
    onViewPayLater={() => {
      requestCloseAssets();
      setShowPayLater(true);
    }}
    onViewDetail={setAssetDetailKey}
    onRequestSettle={() => {
      setSettlePendingAmount(totalAssets);
      setShowSettleAssetsBiometric(true);
    }}
  />}{showEssentials && <EssentialsScreen
    onClose={requestCloseEssentials}
    dialCountry={dialCountry}
    ccy={ccy} ccyCode={ccyCode}
    iHaveEnough={essentialsIHaveEnough}
    onToggleIHaveEnough={onToggleEssentialsIHaveEnough}
    bankUnlocked={!capabilities.myessentials.locked}
    onUnlockGloobalBank={() => {
      requestCloseEssentials();
      setPendingReopenEssentials(true);
      openGloobalBankInfo();
    }}
    onOpenScanAndPay={() => {
      requestCloseEssentials();
      onOpenScan();
    }}
  />}{
    /* Settling assets to Gloobal Bank — same mandatory Face ID +
       fingerprint screen used for PIN-follow-up everywhere else. */
  }{showSettleAssetsBiometric && <BiometricVerifyScreen
    onBack={() => setShowSettleAssetsBiometric(false)}
    onVerify={handleSettleAssetsBiometricVerify}
    scanning={settleAssetsBiometricScanning}
  />}{showSettleReferralBiometric && <BiometricVerifyScreen
    onBack={() => setShowSettleReferralBiometric(false)}
    onVerify={handleSettleReferralBiometricVerify}
    scanning={settleReferralBiometricScanning}
  />}{
    /* Single-asset growth chart — from the month cashback was earned
       up to the month it fully compounds to 100% of the original
       spend, at the fixed 1%/month rate. Layered above My Assets. */
  }{assetDetail && <div style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseAssetDetail} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{assetDetail.row.business}</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 18px 14px" }}><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Current value</div><div style={{ fontSize: 26, fontWeight: 800, color: T.positive, fontFamily: T.fontDisplay, marginTop: 3 }}>{ccy}{fmt(assetDetail.row.value, ccyCode)}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>{assetDetail.row.monthsAccrued === 0 ? "Just earned" : `${(assetDetail.row.monthsAccrued / 12).toFixed(1)} yr into growing toward ${ccy}${fmt(assetDetail.target, ccyCode)}`}</div>{
    /* Growth curve: cashback (t=0) compounding at 1%/month up
       to the point it equals 100% of the original spend. */
  }<svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height="150" style={{ marginTop: 14, display: "block" }} preserveAspectRatio="none">{
    /* Target line — 100% of original spending */
  }<line x1={CHART_PAD_L} y1={assetDetail.targetY} x2={CHART_W - CHART_PAD_R} y2={assetDetail.targetY} stroke={T.line} strokeWidth="1.5" strokeDasharray="4 4" />{
    /* Baseline (0 value) */
  }<line x1={CHART_PAD_L} y1={assetDetail.baseY} x2={CHART_W - CHART_PAD_R} y2={assetDetail.baseY} stroke={T.line} strokeWidth="1.5" />{
    /* Growth curve */
  }<polyline points={assetDetail.pathPoints} fill="none" stroke={T.positive} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{
    /* Today marker */
  }<line x1={assetDetail.todayX} y1={assetDetail.todayY} x2={assetDetail.todayX} y2={assetDetail.baseY} stroke={T.accent} strokeWidth="1.5" strokeDasharray="3 3" /><circle cx={assetDetail.todayX} cy={assetDetail.todayY} r="4.5" fill={T.accent} stroke="#fff" strokeWidth="1.5" /></svg><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: T.inkFaint, marginTop: -4 }}><span>Year 0</span><span>~{(assetDetail.monthsToTarget / 12).toFixed(1)} yrs</span></div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, flexShrink: 0 }} /><span style={{ fontSize: 11, color: T.inkSoft }}>Today</span><span style={{ width: 14, height: 2, background: T.line, marginLeft: 10, flexShrink: 0 }} /><span style={{ fontSize: 11, color: T.inkSoft }}>100% of original spend ({ccy}{fmt(assetDetail.target, ccyCode)})</span></div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>{[
    ...assetDetail.row.chip === "CS" ? [["Creator", assetDetail.row.creatorName]] : [],
    ["Paid", `${ccy}${fmt(assetDetail.row.amountPaid, ccyCode)}`],
    // Two decimals, not one, and this is load-bearing rather than cosmetic.
    //
    // The My Share slider is step={0.01}, so 2.36% is a rate somebody can
    // actually set. Rounding it to "2.4%" here while the amount beside it
    // stayed the true 2.36% of the payment produced the exact complaint that
    // sent us looking: "2.4% of 5000" shown next to ₹118.00, when 2.4% of
    // 5000 is 120. Nothing was wrong with the money — ₹118.00 is correct to
    // the cent — the label was quietly rounding the authoritative rate and
    // presenting the rounded value as if it were the rate.
    //
    // toFixed(2) is exactly lossless against step={0.01}, and matches what My
    // Share and the receipt have always shown. Do not reduce this precision
    // without also constraining the slider, or the two will disagree again.
    ["Cashback", `${(assetDetail.row.cashbackRate * 100).toFixed(2)}% \xB7 ${ccy}${fmt(assetDetail.row.cashback, ccyCode)}`],
    ["Earned on", assetDetail.row.time ? `${assetDetail.row.date}, ${assetDetail.row.time}` : assetDetail.row.date],
    ["Time to 100%", `${(assetDetail.monthsToTarget / 12).toFixed(1)} yrs`]
  ].map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 12, color: T.inkFaint }}>{label}</span><span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{value}</span></div>)}</div></div></div>}{profileDetail && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseProfileDetail} />{profileDetail !== "History" && <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{profileDetail}</span>}{profileDetail === "History" && <div style={{ display: "flex", gap: 8, flex: 1 }}><button
    onClick={() => setHistoryTab("receiving")}
    aria-label="Received"
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "9px 0",
      cursor: "pointer",
      fontSize: 12.5,
      fontWeight: 800,
      background: historyTab === "receiving" ? T.positiveSoft : T.surfaceAlt,
      color: historyTab === "receiving" ? T.positive : T.inkFaint,
      transition: "background 0.2s ease, color 0.2s ease"
    }}
  >
                  Received
                </button><button
    onClick={() => setHistoryTab("sending")}
    aria-label="Paid"
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "9px 0",
      cursor: "pointer",
      fontSize: 12.5,
      fontWeight: 800,
      background: historyTab === "sending" ? T.accentSoft : T.surfaceAlt,
      color: historyTab === "sending" ? T.accent : T.inkFaint,
      transition: "background 0.2s ease, color 0.2s ease"
    }}
  >
                  Paid
                </button></div>}</div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px" }}>{profileDetail === "Personal Details" && <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{
    /* Identity row — flag on the left, real registered name
       on the right, not a generic label:value pair. */
  }<div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 18px" }}><span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{dialCountry.flag}</span><span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: T.ink, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myName && myName.trim() ? myName : <GloobalWordmark suffix=" ID Member" />}</span></div>{[
    ["Country", dialCountry.name],
    ["Dial code", dialCountry.dialCode]
  ].map(([k, v], i) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderTop: `1px solid ${T.line}` }}><span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}>{k}</span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span></div>)}{
    /* Gloobal ID — colored per character, same as everywhere
       else the ID itself is shown. */
  }<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderTop: `1px solid ${T.line}` }}><span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}><GloobalWordmark suffix=" ID" /></span><span style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>{personalGloobalId ? <ColoredGloobalId id={personalGloobalId} /> : "\u2014"}</span></div>{
    /* Join date + time — the real moment this session
       actually started, not a fixed placeholder year. */
  }<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderTop: `1px solid ${T.line}` }}><span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}>Joined</span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink, textAlign: "right" }}>{accountCreatedAt.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" })}, {formatClockTime(accountCreatedAt)}</span></div></div>}{profileDetail === "Linked Banks" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px" }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Manage your linked banks</div><div style={{ fontSize: 12, color: T.inkFaint, marginTop: 3, lineHeight: 1.5 }}>
                    Add, view, and link bank accounts from your country on the Add Bank screen.
                  </div></div><button
    onClick={() => {
      setProfileDetail(null);
      onOpenBank();
    }}
    className="v2-tap"
    style={{ border: "none", borderRadius: T.radiusMd, padding: "14px 0", color: "#fff", fontSize: 13.5, fontWeight: 800, background: T.gradButton, boxShadow: "0 8px 20px rgba(124,58,237,0.32)", cursor: "pointer" }}
  >
                  Open Add Bank
                </button></div>}{profileDetail === "History" && <TransactionHistoryScreen
    isActive={profileDetail === "History"}
    sendHistory={roleSendHistory}
    // Cashback/Creator Share you earned belongs to you regardless of
    // which mode you were in when you spent — Personal history now
    // shows it as a Received entry too, not just Creator mode. This is
    // the "two receipts on my side" case: sending a payment that
    // carries a Creator Share rate produces a Paid entry (the amount
    // sent) AND, separately, a Received entry once the cashback grant
    // lands — both real, both already role-filtered like everything
    // else in this history.
    receiveHistory={receivedRows}
    dialCountry={dialCountry}
    ccy={ccy} ccyCode={ccyCode}
    openHistoryDirection={openHistoryDirection}
    onConsumeOpenHistory={onConsumeOpenHistory}
    historyTab={historyTab}
    setHistoryTab={setHistoryTab}
    historyMethodFilter={historyMethodFilter}
    setHistoryMethodFilter={setHistoryMethodFilter}
  />}{profileDetail === "Subscriptions" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px" }}><span><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Autopay</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 1 }}>{profileToggles.autopay ? "Active subscriptions renew automatically" : "You'll need to pay each subscription manually"}</div></span><ProfileToggle on={profileToggles.autopay} onToggle={() => flipToggle("autopay")} label="Autopay" /></div><div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
                    Top subscriptions
                  </div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{subscriptions.map((s, i) => <div
    key={s.key}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
  ><span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: s.active ? T.accentSoft : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: s.active ? T.accent : T.inkFaint }}>{s.chip}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: 1 }}>{ccy}{fmt(s.price, ccyCode)}/mo{s.active ? profileToggles.autopay ? " \xB7 Auto-renews" : " \xB7 Manual renewal" : ""}</span></span><ProfileToggle on={s.active} onToggle={() => toggleSubscription(s.key)} label={s.label} /></div>)}</div></div></div>}{profileDetail === "Language" && <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{PROFILE_LANGUAGES.map((lang, i) => <button
    key={lang}
    onClick={() => setProfileLanguage(lang)}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ fontSize: 13.5, fontWeight: profileLanguage === lang ? 800 : 600, color: profileLanguage === lang ? T.accent : T.ink }}>{lang}</span>{profileLanguage === lang && <Check2 size={17} color={T.accent} />}</button>)}</div>}{profileDetail === "Currency" && <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{PROFILE_CURRENCIES.map((code, i) => <button
    key={code}
    onClick={() => setProfileCurrency(code)}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 13.5, fontWeight: profileCurrency === code ? 800 : 600, color: profileCurrency === code ? T.accent : T.ink }}>{code}</span>{CURRENCIES[code] && <span style={{ fontSize: 13 }}>{CURRENCIES[code].flag}</span>}</span>{profileCurrency === code && <Check2 size={17} color={T.accent} />}</button>)}</div>}{profileDetail === "Security" && <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px" }}><span><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Biometric login</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 1 }}>Use Face ID or fingerprint to log in</div></span><ProfileToggle on={profileToggles.biometric} onToggle={() => flipToggle("biometric")} label="Biometric login" /></div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderTop: `1px solid ${T.line}` }}><span><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>App lock</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 1 }}>Ask for your PIN every time the app opens</div></span><ProfileToggle on={profileToggles.appLock} onToggle={() => flipToggle("appLock")} label="App lock" /></div><button
    onClick={() => showToast2("PIN change will be available soon")}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Change PIN</span><ChevronRightIcon /></button></div>}{profileDetail === "Notifications" && <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{[
    ["txAlerts", "Transaction alerts", "Money sent, received, and requests"],
    ["referralAlerts", "Referral earnings", "When your network earns you a share"],
    ["promos", "Offers & promotions", <>Occasional deals from <GloobalWordmark suffix=" ID" /></>]
  ].map(([key, title, sub], i) => <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}><span><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{title}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 1 }}>{sub}</div></span><ProfileToggle on={profileToggles[key]} onToggle={() => flipToggle(key)} label={title} /></div>)}</div>}{profileDetail === "Help & Support" && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{["How do I send money?", "How do referrals work?", "Which countries are supported?"].map((q, i) => <button
    key={q}
    onClick={() => showToast2("Full help center coming soon")}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{q}</span><ChevronRightIcon /></button>)}</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px" }}><div style={{ fontSize: 12, color: T.inkFaint }}>Need more help?</div><div style={{ fontSize: 13.5, fontWeight: 700, color: T.accent, marginTop: 2 }}>support@gloobal.id</div></div></div>}{profileDetail === "About" && <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px" }}><span style={{ fontSize: 13.5, fontWeight: 600, color: T.inkSoft }}>Version</span><span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>1.0.0 (prototype)</span></div>{["Terms of Service", "Privacy Policy"].map((label) => <button
    key={label}
    onClick={() => showToast2(`${label} coming soon`)}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{label}</span><ChevronRightIcon /></button>)}</div>}</div>{
    /* The sheet sits above the dashboard's own toast (z 50 vs this
       sheet's 300), so the toast is echoed here for actions
       triggered from inside the sheet. */
  }{toast && <div
    style={{
      position: "fixed",
      bottom: 40,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 310,
      background: T.ink,
      color: "#fff",
      padding: "11px 18px",
      borderRadius: 999,
      fontSize: 12.5,
      fontWeight: 700,
      boxShadow: "0 10px 24px rgba(20,18,43,0.3)",
      whiteSpace: "nowrap"
    }}
  >{toast}</div>}</div>}{profileOverlay === "share" && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden" }}><SendMoneyAmbientBg /></div><div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}><NavBackButton onClick={requestCloseProfileOverlay} style={{ flexShrink: 0  }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Share your <GloobalWordmark suffix=" ID" /></span></div>{
    /* User/Creator flip — lives on the header row now, opposite
       the back button, instead of floating on the ID card's top
       edge: navigation on one side, the flip sign on the other. */
  }<button
    onClick={toggleShareRole}
    aria-label={shareRole === "user" ? "Switch to Creator profile" : "Switch to User profile"}
    className="v2-tap"
    style={{
      flexShrink: 0,
      transform: `rotateY(${roleFlipping ? 90 : 0}deg)`,
      transition: "transform 0.18s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 40,
      height: 40,
      borderRadius: "50%",
      border: "none",
      background: shareRole === "merchant" ? "#FEF3E2" : T.accentSoft,
      boxShadow: T.shadowCard,
      cursor: "pointer"
    }}
  >{shareRole === "merchant" ? <Store2 size={17} color="#F59E0B" /> : <User size={17} color={T.accent} />}</button></div><div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}><div
    style={{
      position: "relative",
      width: "100%",
      maxWidth: 360,
      minHeight: 220,
      background: T.surface,
      borderRadius: T.radiusLg,
      boxShadow: T.shadowCard,
      padding: 22
    }}
  ><div style={{ position: "absolute", top: 22, left: 22 }}><FlagEmoji flag={dialCountry.flag} width={60} height={44} radius={9} dropShadow="drop-shadow(0 4px 10px rgba(76,29,149,0.20))" /></div><span
    style={{
      position: "absolute",
      top: 22,
      right: 22,
      width: 50,
      height: 50,
      borderRadius: "50%",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: profilePhoto === G_LOGO_DATA_URI ? ghLogoColor : "none",
      boxShadow: "0 4px 10px rgba(76,29,149,0.16)",
      flexShrink: 0
    }}
  ><img
    src={profilePhoto}
    alt="Profile"
    width={50}
    height={50}
    style={{
      width: "100%",
      height: "100%",
      objectFit: profilePhoto === G_LOGO_DATA_URI ? "contain" : "cover",
      padding: profilePhoto === G_LOGO_DATA_URI ? 6 : 0,
      boxSizing: "border-box",
      filter: profilePhoto === G_LOGO_DATA_URI ? "brightness(0) invert(1)" : "none"
    }}
  /></span><div
    style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      alignItems: "center",
      gap: 2,
      whiteSpace: "nowrap"
    }}
  >{shareableGloobalId.split("").map((ch, i) => <React3.Fragment key={i}><span
    style={{
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 0.5,
      fontFamily: T.fontDisplay,
      color: POSITION_COLORS[i % POSITION_COLORS.length]
    }}
  >{ch}</span>{(i + 1) % 4 === 0 && i !== shareableGloobalId.length - 1 && <span style={{ width: 8 }} />}</React3.Fragment>)}</div><button
    onClick={handleCopyReferralLink}
    aria-label="Copy"
    className="v2-tap"
    style={{ position: "absolute", bottom: 22, left: 22, border: "none", background: "none", padding: 4, cursor: "pointer", display: "flex" }}
  ><Copy2 size={22} color={T.accent} /></button><button
    onClick={handleShareReferralLink}
    aria-label="Share"
    className="v2-tap"
    style={{ position: "absolute", bottom: 22, right: 22, border: "none", background: "none", padding: 4, cursor: "pointer", display: "flex" }}
  ><Share22 size={22} color={T.accent} /></button></div></div>{toast && <div
    style={{
      position: "absolute",
      bottom: 30,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 50,
      background: T.ink,
      color: "#fff",
      padding: "11px 18px",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: "nowrap",
      boxShadow: T.shadowFloat
    }}
  >{toast}</div>}</div>}{profileOverlay === "referral" && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden" }}><SendMoneyAmbientBg /></div><div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseProfileOverlay} /></div><div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* Earnings summary */
  }<div style={{ position: "relative", background: T.gradWallet, borderRadius: T.radiusLg, padding: "22px 22px 52px", display: "flex", flexDirection: "column", gap: 4, boxShadow: T.shadowRaised }}><span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.3, textTransform: "uppercase" }}>
                By <SingleOMark before="N" after="W" /></span><span style={{ fontSize: 30, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay }}>{ccy}{fmt(referralNetwork.reduce((sum, m) => sum + m.earned, 0), ccyCode)}</span><div style={{ display: "flex", gap: 18, marginTop: 10 }}><div><div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{referralNetwork.length}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>Invited</div></div><div><div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{referralNetwork.filter((m) => m.status === "Active").length}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>Active</div></div></div><button
    onClick={() => setProfileOverlay("share")}
    aria-label="Share your referral link"
    className="v2-tap"
    style={{
      position: "absolute",
      bottom: 16,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: "50%",
      border: "none",
      background: "rgba(255,255,255,0.16)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><Share22 size={18} color="#fff" /></button></div>{
    /* Referral sharing vs. own Creator Share earning — referral
       total is the same seeded-demo figure shown above (there
       are no real referred accounts to read this from yet, see
       generateReferralNetwork); the Creator Share total is
       genuinely real, pulled from this account's own actual
       asset seeds (chip "CS" — see handleSendMoneyComplete). */
  }{(() => {
    const totalReferralSharing = referralNetwork.reduce((sum, m) => sum + m.earned, 0);
    const totalCreatorShareEarned = assetSeeds.filter((s) => s.chip === "CS").reduce((sum, s) => sum + s.amountPaid * s.cashbackRate, 0);
    const combined = totalReferralSharing + totalCreatorShareEarned;
    const referralPct = combined > 0 ? Math.round(totalReferralSharing / combined * 100) : 0;
    return <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 18px 16px" }}><div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, marginBottom: 14 }}>
                    Referral sharing vs. Creator Share
                  </div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Referral sharing</span><span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>{ccy}{fmt(totalReferralSharing, ccyCode)}</span></div><span style={{ display: "block", height: 8, borderRadius: 999, background: T.surfaceAlt, overflow: "hidden", marginBottom: 14 }}><span style={{ display: "block", width: `${referralPct}%`, height: "100%", borderRadius: 999, background: T.accent, transition: "width 0.3s ease" }} /></span><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Our own Creator Share</span><span style={{ fontSize: 13, fontWeight: 800, color: T.positive }}>{ccy}{fmt(totalCreatorShareEarned, ccyCode)}</span></div><span style={{ display: "block", height: 8, borderRadius: 999, background: T.surfaceAlt, overflow: "hidden" }}><span style={{ display: "block", width: `${100 - referralPct}%`, height: "100%", borderRadius: 999, background: T.positive, transition: "width 0.3s ease" }} /></span><div style={{ fontSize: 11, color: T.inkFaint, textAlign: "center", marginTop: 14, lineHeight: 1.4 }}>
                    Creator Share is real, from this account's own payments. Referral sharing is still a seeded example — there are no real referred accounts yet to read this from.
                  </div></div>;
  })()}{
    /* Settle — moves the real referral total into the real
       Gloobal Bank balance, gated behind verification. Disabled
       at zero (currently always, until real referrals exist). */
  }<button
    onClick={() => setShowSettleReferralBiometric(true)}
    disabled={totalReferralEarned <= 0}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: "none",
      borderRadius: T.radiusMd,
      padding: "14px 0",
      background: totalReferralEarned > 0 ? T.gradButton : T.surfaceAlt,
      color: totalReferralEarned > 0 ? "#fff" : T.inkFaint,
      fontSize: 13.5,
      fontWeight: 800,
      cursor: totalReferralEarned > 0 ? "pointer" : "not-allowed",
      boxShadow: totalReferralEarned > 0 ? "0 8px 20px rgba(124,58,237,0.3)" : "none"
    }}
  ><Landmark5 size={16} />
              Settle {ccy}{fmt(totalReferralEarned, ccyCode)} to Gloobal Bank
            </button>{
    /* How the network works */
  }<button
    onClick={() => setShowHowItWorks(true)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", background: T.gradButton, borderRadius: T.radiusMd, padding: "14px 0", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(124,58,237,0.32)" }}
  ><Info size={16} color="#fff" />
              How your network works
            </button>{
    /* Network list — ranked by today's earnings first, so whoever
       is putting the most in your pocket today sits at the top.
       Genuinely empty until a real referral actually exists —
       no fake people filling the space. */
  }{
    /* Keyed by symbolId AND index, not by `name`.
       `name` is `referredSymbolId || "Gloobal User"` (see referralNetwork's
       own fetch), so every referral the backend returns without a symbolId
       — which is most of them — carried the SAME key "Gloobal User". React
       still renders all the rows, but it reconciles by key: the duplicates
       share one identity, so each row's FlipSymbolCircle state gets reused
       across different people, and `setSelectedMember(m)` on a tap can open
       a different referral's detail than the row that was tapped. The index
       makes the key unique; the symbolId keeps it stable for the rows that
       actually have one. */
  }{referralNetwork.length === 0 ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "32px 20px", textAlign: "center" }}><div style={{ width: 52, height: 52, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Users23 size={22} color={T.accent} /></div><div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 6 }}>No referrals yet</div><div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
                  Share your link and this list fills in with real people, not placeholders.
                </div></div> : <div style={{
    borderRadius: T.radiusLg,
    background: T.surface,
    overflow: "hidden",
    boxShadow: T.shadowCard,
    // THIS is why the referral screen would not scroll once referrals
    // existed, and scrolled fine while the list was empty.
    //
    // The column this sits in is `display: flex; flexDirection: column;
    // overflowY: auto`, so every card in it is a flex ITEM, and a flex
    // item's default `flex-shrink: 1` lets it be compressed. What normally
    // stops that is the automatic minimum size — `min-height: auto`, which
    // resolves to the item's content height — but per the flexbox spec
    // that only applies while the item's `overflow` is `visible`. This card
    // sets `overflow: hidden` (it has to: that is what clips the rows to
    // the rounded corners), which resolves its min-height to 0 and hands
    // the layout permission to squash it.
    //
    // So it did: 38 rows needing 2622px were crushed into the ~554px left
    // over, and clipped by that same `overflow: hidden`. The scroll
    // container's content then FIT exactly, scrollHeight === clientHeight,
    // and there was genuinely nothing to scroll — the swipe was not being
    // swallowed, there was no overflow in the first place. The empty state
    // renders a card with no `overflow` set at all, which is precisely why
    // "no referrals" scrolled and "some referrals" did not.
    //
    // flexShrink: 0 opts this card out of being compressed, so its real
    // height reaches the scroller and the column overflows the way it
    // always should have.
    flexShrink: 0
  }}>{[...referralNetwork].sort((a, b) => b.earnedToday - a.earnedToday).map((m, i) => <button
    key={`${m.symbolId || "unknown"}-${i}`}
    onClick={() => setSelectedMember(m)}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 16px",
      // `border: "none"` MUST come before the borderTop below.
      //
      // React writes inline styles in key order, and `border: none` is a
      // shorthand that resets all four sides — width to `medium`, colour to
      // `currentColor`. Written after borderTop (as it was), it wiped the
      // 1px hairline and the follow-up `borderTopStyle: "solid"` brought the
      // top border back as `medium solid currentColor`: a 3px line in the
      // row's own near-black text colour. That is what the heavy black bars
      // between referral rows were — not a design, a shorthand collision.
      border: "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      background: "none",
      width: "100%",
      textAlign: "left",
      cursor: "pointer"
    }}
  >{
    /* Seeded with the member's own Gloobal ID, so each person keeps one
       stable colour+symbol instead of every row re-rolling on its own
       timer and all 38 looking alike. See FlipSymbolCircle's `seed`. */
  }<FlipSymbolCircle size={40} seed={m.symbolId || m.name} /><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}><span
    style={{
      fontSize: 13.5,
      fontWeight: 700,
      color: m.name ? T.ink : T.inkSoft,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }}
  >{m.name || "Gloobal member"}</span><span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>{
    /* Joined date and status — both already fetched from the server and
       both previously thrown away, while the row showed an em dash and
       the word "today" on every single line instead. */
  }{m.joinedAt && <span style={{ fontSize: 11, color: T.inkFaint, whiteSpace: "nowrap" }}>{formatReferralJoinDate(m.joinedAt)}</span>}<span
    style={{
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: 0.3,
      textTransform: "uppercase",
      padding: "1.5px 7px",
      borderRadius: 999,
      whiteSpace: "nowrap",
      color: m.status === "Active" ? T.positive : "#8A5A00",
      background: m.status === "Active" ? T.positiveSoft : "#FEF3C7"
    }}
  >{m.status}</span></span></span>{
    /* Earnings only when there ARE earnings. Every row used to end in
       "\u2014 / today", a column of dashes that said nothing and took the
       eye straight to it; referral earnings are not credited server-side
       yet, so that was every row, always. */
  }{m.earnedToday > 0 && <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}><span style={{ fontSize: 13.5, fontWeight: 800, color: T.positive }}>+{ccy}{fmt(m.earnedToday, ccyCode)}</span><span style={{ fontSize: 10, color: T.inkFaint, fontWeight: 600 }}>today</span></span>}<ChevronRight4 size={16} color={T.inkFaint} style={{ flexShrink: 0 }} /></button>)}</div>}</div>{toast && <div
    style={{
      position: "absolute",
      bottom: 30,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 50,
      background: T.ink,
      color: "#fff",
      padding: "11px 18px",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: "nowrap",
      boxShadow: T.shadowFloat
    }}
  >{toast}</div>}</div>}{
    /* GH Score — segmented ring (auto-reveals once every check-in
       across all 4 pillars is answered) + pillar list. Self/Community/
       Environment stay open for re-answering any time (question re-
       derived from today's date); Finance locks each item permanently
       after its first answer. Each pillar's colour is customisable via
       the header's colour-wheel icon. */
  }{profileOverlay === "ghscore" && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><style>{GH_STYLE}</style>{
    /* Header */
  }{ghScreen !== "complete" && <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
      if (ghScreen === "question") setGhScreen("items");
      else if (ghScreen === "items") {
        setGhScreen("categories");
        setGhActiveCategory(null);
      } else requestCloseGhScore();
    }} style={{ flexShrink: 0  }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, minWidth: 0 }}><GloobalWordmark suffix=" Human Score" /></span>{ghScreen === "categories" && <button
    onClick={() => setGhShowColorSheet(true)}
    aria-label="Change colours"
    className="v2-tap"
    style={{
      marginLeft: "auto",
      width: 40,
      height: 40,
      borderRadius: "50%",
      flexShrink: 0,
      border: "none",
      padding: 3,
      background: T.surface,
      boxShadow: T.shadowCard,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><span
    style={{
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      background: "radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 90deg, #FF0000 0deg, #FFFF00 60deg, #00FF00 120deg, #00FFFF 180deg, #0000FF 240deg, #FF00FF 300deg, #FF0000 360deg)",
      boxShadow: "inset 0 0 0 1px rgba(21,19,42,0.1)"
    }}
  /></button>}</div>}{
    /* Scrollable content */
  }<div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}>{
    /* ---------- Overview: ring + pillar list ---------- */
  }{ghScreen === "categories" && <><div style={{ position: "relative", background: T.surface, borderRadius: T.radiusXl, padding: "30px 14px", boxShadow: T.shadowCard, overflow: "hidden" }}><div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{GH_FLOAT_NUMS.map((n, i) => <span
    key={i}
    className={n.anim}
    style={{
      position: "absolute",
      top: n.top,
      left: n.left,
      right: n.right,
      fontSize: n.size,
      fontWeight: 800,
      color: n.color,
      fontFamily: T.fontDisplay,
      userSelect: "none",
      "--r": `${n.rotate}deg`,
      animationDuration: n.dur,
      animationDelay: n.delay
    }}
  >{n.text}</span>)}</div><div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}><GHSegmentedRing size={196} thickness={17} gapDeg={4} segments={ghRingSegments}><div key={ghCanGenerate ? "done" : "pending"} className={ghCanGenerate ? "gh-score-reveal" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: 42, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1 }}>{ghCanGenerate ? ghRawTotal : 0}</span><span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint, marginTop: 3 }}>out of {ghMaxTotal}</span>{ghCanGenerate && <span style={{ fontSize: 13, fontWeight: 800, color: T.positive, marginTop: 4 }}>{ghTier(ghOverallScore())}</span>}</div></GHSegmentedRing><span style={{ fontSize: 12, fontWeight: 700, color: ghCanGenerate ? T.positive : T.inkFaint }}>{ghCanGenerate ? "All check-ins complete" : `${ghTotalAnswered}/${ghTotalQuestions} answered`}</span></div></div>{
    /* Pillar list — icon, name, progress, score, answered count */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, overflow: "hidden", boxShadow: T.shadowCard }}>{GH_CATEGORIES.map((cat, i) => {
    const Icon = cat.icon;
    const score = ghCategoryScore(cat.key);
    const color = catColor(cat.key);
    const answeredCount = cat.items.filter((it) => ghAnswers[`${cat.key}.${it.key}`]).length;
    return <button
      key={cat.key}
      onClick={() => ghOpenCategory(cat.key)}
      className="v2-row"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        border: "none",
        borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
        background: "none",
        cursor: "pointer",
        textAlign: "left"
      }}
    ><span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: hexToRgba(color, 0.14), display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={color} /></span><span style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>{cat.label}</div><div style={{ height: 5, borderRadius: 999, background: T.surfaceAlt, marginTop: 7, overflow: "hidden" }}><div style={{ height: "100%", width: `${score || 0}%`, borderRadius: 999, background: color, transition: "width 0.4s ease" }} /></div></span><span style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 13.5, fontWeight: 800, color: score === null ? T.inkFaint : color }}>{score === null ? "\u2014" : score}</div><div style={{ fontSize: 10, fontWeight: 700, color: T.inkFaint, marginTop: 1 }}>{answeredCount}/{cat.items.length}</div></span></button>;
  })}</div></>}{
    /* ---------- The check-ins for one pillar ---------- */
  }{ghScreen === "items" && ghActiveCategory && (() => {
    const cat = GH_CATEGORIES.find((c) => c.key === ghActiveCategory);
    const Icon = cat.icon;
    const score = ghCategoryScore(cat.key);
    const color = catColor(cat.key);
    return <><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 42, height: 42, borderRadius: 13, background: catSoft(cat.key), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={19} color={color} /></span><div style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1, minWidth: 0 }}>{cat.label}</div><div style={{ fontSize: 19, fontWeight: 800, color: score === null ? T.inkFaint : color }}>{score === null ? "\u2014" : score}</div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, overflow: "hidden", boxShadow: T.shadowCard }}>{cat.items.map((item, i) => {
      const ItemIcon = item.icon;
      const ans = ghAnswers[`${cat.key}.${item.key}`];
      const locked = ghIsLocked(cat.key, item.key);
      let statusText;
      if (locked) {
        statusText = ans.type === "yesno" ? `Locked \u2014 ${ans.value === "yes" ? "Yes" : "No"}` : `Locked \u2014 ${ans.value}`;
      } else if (!ans) {
        statusText = "Not answered yet";
      } else if (ans.type === "yesno") {
        statusText = `${ans.value === "yes" ? "Yes" : "No"}${ans.day === ghTodayKey() ? " \xB7 today" : " \xB7 tap to refresh"}`;
      } else {
        statusText = `${ans.value} (${ans.correct ? "correct" : "not quite"})${ans.day === ghTodayKey() ? " \xB7 today" : " \xB7 tap to refresh"}`;
      }
      return <button
        key={item.key}
        onClick={() => ghOpenQuestion(cat.key, item)}
        className="v2-row"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          border: "none",
          borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
          background: "none",
          cursor: locked ? "default" : "pointer",
          textAlign: "left",
          opacity: locked ? 0.72 : 1
        }}
      ><span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}><ItemIcon size={15} color={T.inkSoft} /></span><span style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{item.label}</div><div style={{ fontSize: 11, color: T.inkFaint, marginTop: 1 }}>{statusText}</div></span>{locked ? <Lock4 size={15} color={T.inkFaint} /> : ans ? <Check2 size={16} color={T.positive} /> : <ChevronRightIcon />}</button>;
    })}</div></>;
  })()}{
    /* ---------- One question ---------- */
  }{ghScreen === "question" && ghActiveCategory && ghActiveItem && (() => {
    const cat = GH_CATEGORIES.find((c) => c.key === ghActiveCategory);
    const item = cat.items.find((it) => it.key === ghActiveItem);
    const color = catColor(cat.key);
    const nums = item.type === "math" ? ghMathNumsFor(cat.key, item) : null;
    return <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 6 }}><span style={{ width: 48, height: 48, borderRadius: 15, background: catSoft(cat.key), display: "flex", alignItems: "center", justifyContent: "center" }}>{React3.createElement(item.icon, { size: 21, color })}</span><div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.3 }}>{item.type === "math" && nums ? item.question.replace("{a}", nums.a).replace("{b}", nums.b) : ghQuestionText(cat.key, item)}</div>{item.type === "yesno" && !ghNoteOpen && <div style={{ display: "flex", gap: 10 }}><button
      onClick={() => ghAnswerYesNo(cat.key, item.key, "yes")}
      className="v2-tap"
      style={{ flex: 1, padding: "15px 0", borderRadius: T.radiusMd, border: "none", background: color, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: `0 8px 20px ${hexToRgba(color, 0.3)}` }}
    >
                        Yes
                      </button><button
      onClick={() => ghAnswerYesNo(cat.key, item.key, "no")}
      className="v2-tap"
      style={{ flex: 1, padding: "15px 0", borderRadius: T.radiusMd, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 14, fontWeight: 800, cursor: "pointer" }}
    >
                        No
                      </button></div>}{item.type === "math" && <><input
      type="number"
      inputMode="numeric"
      value={ghMathInput}
      onChange={(e) => setGhMathInput(e.target.value)}
      placeholder="Your answer"
      style={{
        width: "100%",
        padding: "13px 16px",
        borderRadius: T.radiusMd,
        border: `1px solid ${T.line}`,
        background: T.surface,
        fontSize: 16,
        fontWeight: 700,
        color: T.ink,
        boxSizing: "border-box"
      }}
    /><div style={{ display: "flex", gap: 10 }}><button
      onClick={() => ghSubmitMath(cat.key, item.key)}
      disabled={ghMathInput === ""}
      className="v2-tap"
      style={{
        flex: 1,
        padding: "15px 0",
        borderRadius: T.radiusMd,
        border: "none",
        background: ghMathInput === "" ? T.surfaceAlt : color,
        color: ghMathInput === "" ? T.inkFaint : "#fff",
        fontSize: 14,
        fontWeight: 800,
        cursor: ghMathInput === "" ? "default" : "pointer"
      }}
    >
                          Submit
                        </button>{!ghNoteOpen && <button
      onClick={() => setGhNoteOpen(true)}
      aria-label="Write a note instead"
      className="v2-tap"
      style={{ flex: 1, padding: "15px 0", borderRadius: T.radiusMd, border: `1px solid ${T.line}`, background: T.surfaceAlt, color: T.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    ><Pencil size={16} /></button>}</div></>}{
      /* Note box — auto-opens after answering "No" (which
         naturally invites a bit more context), or via
         math's Edit button. For yes/no, Submit saves the
         note and moves on in one tap; Continue is there
         too, for when there's nothing to add. Math's Submit
         stays note-only, since its own answer box handles
         moving on separately. */
    }{ghNoteOpen && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}><textarea
      value={ghNoteInput}
      onChange={(e) => {
        const words = e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [];
        if (words.length <= 50) setGhNoteInput(e.target.value);
      }}
      placeholder="Say more, if you'd like (optional, up to 50 words)"
      rows={3}
      autoFocus
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: T.radiusMd,
        border: `1px solid ${T.line}`,
        background: T.surface,
        fontSize: 13.5,
        fontWeight: 500,
        color: T.ink,
        fontFamily: "inherit",
        boxSizing: "border-box",
        resize: "vertical"
      }}
    />{ghNoteInput.trim() && <button
      onClick={() => {
        ghSubmitNote(cat.key, item.key);
        if (item.type === "yesno") ghContinueAfterAnswer();
      }}
      className="v2-tap"
      style={{
        padding: "12px 0",
        borderRadius: T.radiusMd,
        border: "none",
        background: color,
        color: "#fff",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer"
      }}
    >
                        Submit
                      </button>}{item.type === "yesno" && <button
      onClick={ghContinueAfterAnswer}
      className="v2-tap"
      style={{
        padding: "12px 0",
        borderRadius: T.radiusMd,
        border: `1px solid ${T.line}`,
        background: "none",
        color: T.inkSoft,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer"
      }}
    >
                        Continue
                      </button>}</div>}</div>;
  })()}{
    /* ---------- Complete: shown once, right after the last check-in ---------- */
  }{ghScreen === "complete" && <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "12px 4px 24px", textAlign: "center" }}><span style={{ fontSize: 12, fontWeight: 800, color: T.accent, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  All check-ins complete
                </span><GHSegmentedRing size={208} thickness={18} gapDeg={4} segments={ghRingSegments}><div className="gh-score-reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: 46, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1 }}>{ghRawTotal}</span><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, marginTop: 3 }}>out of {ghMaxTotal}</span><span style={{ fontSize: 14, fontWeight: 800, color: T.positive, marginTop: 5 }}>{ghTier(ghOverallScore())}</span></div></GHSegmentedRing><p style={{ fontSize: 13, color: T.inkSoft, margin: 0, maxWidth: 280 }}>
                  Your <GloobalWordmark suffix=" Human Score" /> is ready. You can revisit any pillar any time — Self, Community, and Environment refresh daily.
                </p><button
    onClick={() => setGhScreen("categories")}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "16px 0",
      cursor: "pointer",
      background: T.accent,
      color: "#fff",
      fontSize: 14,
      fontWeight: 800,
      boxShadow: `0 10px 24px ${hexToRgba(T.accent, 0.3)}`
    }}
  >
                  View My Pillars
                </button></div>}</div>{
    /* ---------- Colour popover — anchored to the header icon.
       Tap-outside-to-close area is invisible now, no dark scrim
       behind the sheet. ---------- */
  }<div
    onClick={() => setGhShowColorSheet(false)}
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 40,
      background: "transparent",
      opacity: ghShowColorSheet ? 1 : 0,
      pointerEvents: ghShowColorSheet ? "auto" : "none",
      transition: "opacity 0.25s ease"
    }}
  /><div
    onClick={(e) => e.stopPropagation()}
    style={{
      position: "absolute",
      top: 62,
      right: 18,
      width: "min(300px, calc(100% - 36px))",
      zIndex: 50,
      background: T.surface,
      borderRadius: T.radiusLg,
      padding: "16px",
      boxShadow: T.shadowRaised,
      transformOrigin: "top right",
      transform: ghShowColorSheet ? "scale(1)" : "scale(0.9)",
      opacity: ghShowColorSheet ? 1 : 0,
      pointerEvents: ghShowColorSheet ? "auto" : "none",
      transition: "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.18s ease"
    }}
  ><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}><span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>Colours</span><button
    onClick={() => setGhShowColorSheet(false)}
    aria-label="Close"
    className="v2-tap"
    style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><X3 size={14} color={T.inkFaint} /></button></div><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>{GH_CATEGORIES.map((cat, i) => {
    const Icon = cat.icon;
    const selected = ghColorPickerCat === cat.key;
    const blob = GH_BLOB_SHAPES[i % GH_BLOB_SHAPES.length];
    return <button
      key={cat.key}
      onClick={() => setGhColorPickerCat(cat.key)}
      aria-label={cat.label}
      className="v2-tap"
      style={{ border: "none", background: "none", cursor: "pointer" }}
    ><span
      style={{
        width: 38,
        height: 38,
        borderRadius: blob.radius,
        transform: `rotate(${blob.rotate}deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: selected ? `2px solid ${catColor(cat.key)}` : "2px solid transparent",
        background: hexToRgba(catColor(cat.key), selected ? 0.18 : 0.1),
        transition: "border-color 0.2s ease, background 0.2s ease"
      }}
    ><span style={{ display: "flex", transform: `rotate(${-blob.rotate}deg)` }}><Icon size={16} color={catColor(cat.key)} /></span></span></button>;
  })}</div><div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><GHColorWheel size={180} hue={ghWheelHue} sat={ghWheelSat} onChange={(h, s) => {
    setGhWheelHue(h);
    setGhWheelSat(s);
  }} /></div><button
    onClick={ghSaveColor}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "13px 0",
      cursor: "pointer",
      background: ghPendingColor,
      color: "#fff",
      fontSize: 13.5,
      fontWeight: 800,
      boxShadow: `0 8px 20px ${hexToRgba(ghPendingColor, 0.32)}`
    }}
  >
              Save
            </button></div></div>}{
    /* Update Gloobal ID — same 12-symbol dial pad used at registration,
       reused here to create a replacement ID. A History icon in the
       header opens the log of every past change. */
  }{profileOverlay === "updateId" && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
      requestCloseProfileOverlay();
      setNewIdBuffer("");
      setShowUpdateIdBiometric(false);
    }} /><span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Update <GloobalWordmark suffix=" ID" /></span><NavHistoryButton onClick={() => setShowIdHistory(true)} label="View update history" /></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 20 }}><div style={{ position: "relative", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 16px 14px" }}><span
    style={{
      position: "absolute",
      top: 0,
      left: 16,
      transform: "translateY(-50%)",
      background: T.surface,
      padding: "0 6px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 800,
      color: T.inkFaint,
      textTransform: "uppercase",
      letterSpacing: 0.4
    }}
  >
                Current ID
              </span><SymbolChipRow length={12} value={shareableGloobalId} masked={false} /></div><div style={{ position: "relative", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 16px 14px" }}><span
    style={{
      position: "absolute",
      top: 0,
      left: 16,
      transform: "translateY(-50%)",
      background: T.surface,
      padding: "0 6px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 800,
      color: T.inkFaint,
      textTransform: "uppercase",
      letterSpacing: 0.4
    }}
  >
                New ID
              </span><SymbolChipRow length={12} value={newIdBuffer} masked={false} /></div><SymbolDialPad value={newIdBuffer} onChange={setNewIdBuffer} length={12} /><SuggestedIdRow id={suggestedUpdateId} onPick={setNewIdBuffer} /><button
    onClick={handleRequestSaveNewGloobalId}
    disabled={newIdBuffer.length !== 12}
    className="v2-tap"
    style={{
      border: "none",
      borderRadius: T.radiusMd,
      padding: "14px 0",
      background: newIdBuffer.length === 12 ? T.gradButton : T.surfaceAlt,
      color: newIdBuffer.length === 12 ? "#fff" : T.inkFaint,
      fontSize: 13.5,
      fontWeight: 800,
      cursor: newIdBuffer.length === 12 ? "pointer" : "not-allowed"
    }}
  >
              Save new <GloobalWordmark suffix=" ID" /></button></div></div>}{
    /* Log of every past Gloobal ID change, newest first, opened from
       the History icon on the Update Gloobal ID screen. */
  }{showIdHistory && <div style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseIdHistory} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Update History</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px" }}>{idUpdateHistory.length === 0 ? <div style={{ textAlign: "center", padding: "40px 20px", color: T.inkFaint, fontSize: 13 }}>No updates yet</div> : <div style={{ borderRadius: T.radiusLg, background: T.surface, overflow: "hidden", boxShadow: T.shadowCard }}>{idUpdateHistory.map((h, i) => {
    const older = idUpdateHistory[i + 1];
    return <div key={i} style={{ padding: "14px 16px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}><div style={{ display: "flex", flexDirection: "column", gap: 3 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 9.5, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0, width: 32 }}>From</span><span style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint, letterSpacing: 0.5, fontFamily: "monospace", wordBreak: "break-all" }}>{h.previousId}</span></div><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 9.5, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0, width: 32 }}>To</span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: 0.5, fontFamily: "monospace", wordBreak: "break-all" }}>{h.id}</span></div></div><div style={{ fontSize: 11, color: T.inkFaint, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><span>{older ? `${older.date}, ${older.time}` : `${accountCreatedAt.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" })}, ${formatClockTime(accountCreatedAt)}`}</span><ArrowRight2 size={10} style={{ flexShrink: 0 }} /><span>{h.date}, {h.time}</span></div></div>;
  })}</div>}</div></div>}{
    /* Revealing the balance — same mandatory Face ID + fingerprint
       screen used for PIN-follow-up everywhere else in the app. */
  }{showBalanceBiometric && <BiometricVerifyScreen
    onBack={() => setShowBalanceBiometric(false)}
    onVerify={handleBalanceBiometricVerify}
    scanning={balanceBiometricScanning}
  />}{
    /* Creator Share overview box itself — an example distribution of
       what rate other people tend to choose, shown plainly as example
       data rather than dressed up as a live figure. */
  }{showCreatorOverview && <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={requestCloseCreatorOverview} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Creator Share overview</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* Filter — real numbers, not fake. "Total users" is the
       platform-wide count from the backend (GET /api/stats, the
       same figure Global Coverage shows), not the hardcoded 1 it
       used to be — that was true of the test database and of
       nothing after it.

       The other two tiles are deliberately about THIS account and
       say so in their labels. Nobody else's cashback rate is
       readable from here — the backend exposes a rate only on a
       user you resolve by ID — so a tile claiming "3 of 40 are
       sharing" would be an invention. "You share" is a rate above
       0%; the min/max inputs below say whether your own rate falls
       in the range being asked about. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px" }}><div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, marginBottom: 12 }}>Filter</div><div style={{ display: "flex", gap: 10, marginBottom: 14 }}><div style={{ flex: 1, borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "10px 12px" }}><div style={{ fontSize: 10, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>Total users</div><div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 2 }}>{platformUserCount === null ? "—" : platformUserCount}</div></div><div style={{ flex: 1, borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "10px 12px" }}><div style={{ fontSize: 10, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>You share</div><div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 2 }}>{myShareRate > 0 ? "Yes" : "No"}</div></div><div style={{ flex: 1, borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "10px 12px" }}><div style={{ fontSize: 10, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>Your rate</div><div style={{ fontSize: 18, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay, marginTop: 2 }}>{myShareRate >= creatorFilterMin && myShareRate <= creatorFilterMax ? "In range" : "Outside"}</div></div></div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ flex: 1 }}><div style={{ fontSize: 10, color: T.inkFaint, marginBottom: 4 }}>Between %</div><input
    type="number"
    min={0}
    max={7}
    step={0.1}
    value={creatorFilterMin}
    onChange={(e) => {
      if (e.target.value === "") {
        setCreatorFilterMin("");
        return;
      }
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      setCreatorFilterMin(v);
    }}
    onBlur={() => {
      if (creatorFilterMin === "" || creatorFilterMin < 0) setCreatorFilterMin(0);
      else if (creatorFilterMin > 7) setCreatorFilterMin(7);
    }}
    aria-label="Minimum share percentage"
    style={{ width: "100%", border: `1.5px solid ${T.line}`, borderRadius: T.radiusMd, padding: "9px 10px", fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: "inherit" }}
  /></div><span style={{ fontSize: 12, color: T.inkFaint, marginTop: 14 }}>and</span><div style={{ flex: 1 }}><div style={{ fontSize: 10, color: T.inkFaint, marginBottom: 4 }}>% (max)</div><input
    type="number"
    min={0}
    max={7}
    step={0.1}
    value={creatorFilterMax}
    onChange={(e) => {
      if (e.target.value === "") {
        setCreatorFilterMax("");
        return;
      }
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      setCreatorFilterMax(v);
    }}
    onBlur={() => {
      if (creatorFilterMax === "" || creatorFilterMax > 7) setCreatorFilterMax(7);
      else if (creatorFilterMax < 0) setCreatorFilterMax(0);
    }}
    aria-label="Maximum share percentage"
    style={{ width: "100%", border: `1.5px solid ${T.line}`, borderRadius: T.radiusMd, padding: "9px 10px", fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: "inherit" }}
  /></div></div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 18px 16px" }}><div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, marginBottom: 14 }}>
                Real Creator Share choices on this account
              </div>{computeCreatorShareDistribution(myShareRate).map((row, i) => <div key={row.range} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><span style={{ width: 40, flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.ink }}>{row.range}</span><span style={{ flex: 1, height: 8, borderRadius: 999, background: T.surfaceAlt, overflow: "hidden" }}><span style={{ display: "block", width: `${row.pct}%`, height: "100%", borderRadius: 999, background: GH_CATEGORIES[i % GH_CATEGORIES.length].color, transition: "width 0.3s ease" }} /></span><span style={{ width: 32, flexShrink: 0, textAlign: "right", fontSize: 12, fontWeight: 800, color: T.inkSoft }}>{row.pct}%</span></div>)}</div><div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: T.radiusLg, background: T.accentSoft, padding: "14px 16px" }}><span style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}><PieChart size={16} color={T.accent} /></span><span style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.4 }}>
                Your own rate is <strong>{myShareRate}%</strong>. You can change it any time from My Share.
              </span></div><div style={{ fontSize: 11, color: T.inkFaint, textAlign: "center", lineHeight: 1.4 }}>
              This account is the only real Creator Share choice tracked so far — 1 user, 1 rate, 100% in that one bucket. Not a projection or an example.
            </div></div></div>}{
    /* Saving a new Gloobal ID — same verification, required before the
       change actually takes effect. */
  }{showUpdateIdBiometric && <BiometricVerifyScreen
    onBack={() => setShowUpdateIdBiometric(false)}
    onVerify={handleUpdateIdBiometricVerify}
    scanning={updateIdBiometricScanning}
  />}{
    /* Tapping a name in "My Referral Network" opens this — a share-card
       style popup with a donut split between what this person earned
       you today and their all-time total. */
  }{selectedMember && <div
    onClick={requestCloseSelectedMember}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 400,
      background: "rgba(20,12,36,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    }}
  ><div
    onClick={(e) => e.stopPropagation()}
    style={{
      position: "relative",
      width: "100%",
      maxWidth: 320,
      background: T.surface,
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      padding: "30px 24px 26px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14
    }}
  ><button
    onClick={requestCloseSelectedMember}
    aria-label="Close"
    className="v2-tap"
    style={{
      position: "absolute",
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      borderRadius: "50%",
      border: "none",
      background: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><X3 size={16} color={T.inkFaint} /></button><FlipSymbolCircle size={44} /><div style={{ textAlign: "center" }}><div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{selectedMember.name}</div><div style={{ fontSize: 11.5, fontWeight: 600, color: selectedMember.status === "Active" ? T.positive : T.inkFaint, marginTop: 2 }}>{selectedMember.status}</div></div>{(() => {
    const total = selectedMember.earned;
    const today = selectedMember.earnedToday;
    const rawPct = total > 0 ? Math.min(100, today / total * 100) : 0;
    const deg = rawPct > 0 ? Math.max(18, rawPct / 100 * 360) : 0;
    return <div
      style={{
        position: "relative",
        width: 150,
        height: 150,
        borderRadius: "50%",
        background: deg > 0 ? `conic-gradient(${T.accent} 0deg ${deg}deg, ${T.accentSoft} ${deg}deg 360deg)` : T.accentSoft,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4
      }}
    ><div
      style={{
        width: 108,
        height: 108,
        borderRadius: "50%",
        background: T.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2
      }}
    ><span style={{ fontSize: 9.5, fontWeight: 700, color: T.inkFaint, letterSpacing: 0.4, textTransform: "uppercase" }}>
                      Total earned
                    </span><span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{ccy}{fmt(total, ccyCode)}</span></div></div>;
  })()}<div style={{ display: "flex", gap: 22, marginTop: 2 }}><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: T.accent, flexShrink: 0 }} /><div><div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{ccy}{fmt(selectedMember.earnedToday, ccyCode)}</div><div style={{ fontSize: 10, color: T.inkFaint, fontWeight: 600 }}>Today</div></div></div><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: T.accentSoft, flexShrink: 0 }} /><div><div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{ccy}{fmt(selectedMember.earned, ccyCode)}</div><div style={{ fontSize: 10, color: T.inkFaint, fontWeight: 600 }}>All-time total</div></div></div></div></div></div>}{
    /* Explains how earning through the referral network works — opened
       from the option that replaced the old "Invite a friend" CTA. */
  }{showHowItWorks && <div
    onClick={requestCloseHowItWorks}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 400,
      background: "rgba(20,12,36,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    }}
  ><div
    onClick={(e) => e.stopPropagation()}
    style={{
      position: "relative",
      width: "100%",
      maxWidth: 340,
      background: T.surface,
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      padding: "28px 24px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 18
    }}
  ><button
    onClick={requestCloseHowItWorks}
    aria-label="Close"
    className="v2-tap"
    style={{
      position: "absolute",
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      borderRadius: "50%",
      border: "none",
      background: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><X3 size={16} color={T.inkFaint} /></button><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}><div style={{ width: 52, height: 52, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Users23 size={24} color={T.accent} /></div><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>
                How your network works
              </span></div><div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", gap: 12 }}><div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Share22 size={16} color={T.accent} /></div><div><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Share your link</div><div style={{ fontSize: 12, color: T.inkFaint, lineHeight: 1.4, marginTop: 2 }}>
                    Your <GloobalWordmark suffix=" ID" /> doubles as your invite link. Send it to friends and family.
                  </div></div></div><div style={{ display: "flex", gap: 12 }}><div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Users23 size={16} color={T.accent} /></div><div><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>They join your network</div><div style={{ fontSize: 12, color: T.inkFaint, lineHeight: 1.4, marginTop: 2 }}>
                    Once they sign up and become active, they show up in your network list.
                  </div></div></div><div style={{ display: "flex", gap: 12 }}><div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Gift size={16} color={T.accent} /></div><div><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>You earn together</div><div style={{ fontSize: 12, color: T.inkFaint, lineHeight: 1.4, marginTop: 2 }}>
                    Every time they send money, a share of the fee is added straight to your balance — tracked today and all-time for each person.
                  </div></div></div></div><button
    onClick={requestCloseHowItWorks}
    className="v2-tap"
    style={{ border: "none", background: T.gradButton, borderRadius: T.radiusMd, padding: "13px 0", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(124,58,237,0.32)" }}
  >
              Got it
            </button></div></div>}</div>;
}
var Dashboard_default = DashboardScreen;

