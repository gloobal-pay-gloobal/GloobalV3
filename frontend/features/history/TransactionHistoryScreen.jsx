// src/features/history/TransactionHistoryScreen.jsx
import { useState as useState12, useEffect as useEffect11, useRef as useRef9 } from "react";
import { Filter as FilterHist } from "lucide-react";


// src/features/history/TransactionHistoryScreen.jsx
// One toggle only: the parent (History header, in the Account/Profile
// screen) owns historyTab/historyMethodFilter and renders the actual
// Received/Paid buttons — this component just consumes that state via
// props instead of keeping its own separate copy (which used to render
// a second, redundant Receiving/Sending pill directly underneath the
// header's Received/Paid buttons).
function TransactionHistoryScreen({ isActive, sendHistory, receiveHistory = [], dialCountry, ccy, ccyCode = "USD", openHistoryDirection, onConsumeOpenHistory, historyTab, setHistoryTab, historyMethodFilter, setHistoryMethodFilter }) {
  const historyScrollRef = useRef9(null);
  const [receipt, setReceipt] = useState12(null);
  const requestCloseReceipt = useBackClose(!!receipt, () => setReceipt(null));
  const routedHistoryRef = useRef9(false);
  // Today / This Week / This Month. Everything below — the two summary
  // tiles, the daily chart and both sides of the pager — reads the same
  // filtered rows, so the period is one choice rather than three
  // separately-scoped views that can disagree with each other.
  const [historyPeriod, setHistoryPeriod] = useState12("week");
  useEffect11(() => {
    if (isActive) {
      if (routedHistoryRef.current) {
        routedHistoryRef.current = false;
      } else {
        setHistoryTab("receiving");
        setHistoryMethodFilter("all");
        setHistoryPeriod("week");
        if (historyScrollRef.current) historyScrollRef.current.scrollLeft = 0;
      }
    }
  }, [isActive]);
  useEffect11(() => {
    if (openHistoryDirection) {
      routedHistoryRef.current = true;
      setHistoryTab(openHistoryDirection);
      setHistoryMethodFilter("all");
      requestAnimationFrame(() => {
        if (historyScrollRef.current) {
          historyScrollRef.current.scrollLeft = openHistoryDirection === "sending" ? historyScrollRef.current.clientWidth : 0;
        }
      });
      if (onConsumeOpenHistory) onConsumeOpenHistory();
    }
  }, [openHistoryDirection]);
  // The header's Received/Paid buttons (the single source of truth for
  // historyTab now) only set state — this keeps the swipeable pager
  // scrolled to match, from any source (header tap or a fresh mount),
  // without fighting the scroll-driven handleHistoryScroll -> setHistoryTab
  // direction below (the small distance check skips a redundant
  // re-scroll while the user is actively swiping).
  useEffect11(() => {
    const el = historyScrollRef.current;
    if (!el) return;
    const target = historyTab === "sending" ? el.clientWidth : 0;
    if (Math.abs(el.scrollLeft - target) > 2) {
      el.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [historyTab]);
  function openHistoryReceipt(t, direction) {
    setReceipt(buildHistoryReceipt(t, direction, dialCountry, ccy));
  }
  function handleHistoryScroll(e) {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setHistoryTab(idx === 0 ? "receiving" : "sending");
  }
  // Everything on this screen is scoped to the selected period.
  const periodSendHistory = useMemo5(() => filterHistoryByPeriod(sendHistory, historyPeriod), [sendHistory, historyPeriod]);
  const periodReceiveHistory = useMemo5(() => filterHistoryByPeriod(receiveHistory, historyPeriod), [receiveHistory, historyPeriod]);
  // Daily trend for this history's own data — same day-by-day
  // paid/received bar chart the wallet card uses, so "what does my
  // typical day look like" is answerable from inside History too,
  // not only from the Dashboard's headline chart. The page count
  // follows the period so a month's worth of days isn't cut off at
  // two weeks.
  const historyDailyTrend = useMemo5(
    () => generateDailySpending(periodSendHistory, periodReceiveHistory, historyPeriodMeta(historyPeriod).weekPages),
    [periodSendHistory, periodReceiveHistory, historyPeriod]
  );
  const periodPaidTotal = useMemo5(() => sumHistoryAmount(periodSendHistory), [periodSendHistory]);
  const periodReceivedTotal = useMemo5(() => sumHistoryAmount(periodReceiveHistory), [periodReceiveHistory]);
  return <div><style>{`.history-pager::-webkit-scrollbar { display: none; }`}</style>{
    /* Period tabs — the outermost filter on this screen. The chart and
       both pager panels below are built from the rows these leave in,
       so the tab, the two totals and the list can never describe
       different spans of time. */
  }<div
    style={{
      marginBottom: 14,
      borderRadius: T.radiusLg,
      background: T.surface,
      boxShadow: T.shadowCard,
      overflow: "hidden"
    }}
  >{
    /* Period and totals in ONE card, and the totals carry no words.
       This was three stacked blocks — a full-width row of period pills,
       then a Received tile, then a Paid tile — eating roughly 136px
       before a single transaction was visible. Worse, the words
       "RECEIVED" and "PAID" were already on screen: the header directly
       above this has a Received/Paid toggle, so the same two labels
       appeared twice within about 200px of each other and neither
       instance told you anything the other did not.
       The period control is a compact segmented strip along the top of
       the card it governs, which is also the honest place for it — it
       filters these totals, the chart and the list all at once. The two
       figures below are unlabelled because a signed, coloured figure is
       already unambiguous under this app's one rule: + and green is
       money in, − and red is money out. Screen readers still get the
       full sentence via aria-label, since colour and sign are exactly
       what a reader cannot convey. */
  }<div style={{ display: "flex", alignItems: "center", gap: 3, padding: 5, background: T.surfaceAlt }}>{
    /* A funnel, so the row reads as a control rather than as three words
       someone left at the top of the screen. Decorative to a screen
       reader — each segment is already a real button with aria-pressed,
       which is what carries the state. */
  }<span
    aria-hidden="true"
    style={{ display: "flex", alignItems: "center", padding: "0 7px 0 5px", flexShrink: 0 }}
  ><FilterHist size={13} color={T.inkFaint} /></span>{HISTORY_PERIODS.map((p) => <button
    key={p.key}
    onClick={() => setHistoryPeriod(p.key)}
    aria-pressed={historyPeriod === p.key}
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "6px 0",
      cursor: "pointer",
      fontSize: 11.5,
      fontWeight: 800,
      // The selected one is lifted onto the card's own surface rather
      // than tinted a different colour — the same "raised chip" idea the
      // pay-method filter below already uses, so the two filter rows on
      // this screen read as the same kind of control.
      background: historyPeriod === p.key ? T.surface : "transparent",
      color: historyPeriod === p.key ? T.accent : T.inkFaint,
      boxShadow: historyPeriod === p.key ? "0 1px 3px rgba(76,29,149,0.14)" : "none",
      transition: "background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease"
    }}
  >{p.label}</button>)}</div>{(() => {
    /* ONE total: the direction you are actually looking at.
       Received and Paid side by side made the same mistake the labels
       did — the Received/Paid toggle in the header already decides which
       list is on screen, so a second figure for the other direction
       answers a question nobody asked here, and it sat directly under a
       tab saying otherwise. The number now always agrees with the rows
       beneath it, and the other direction is one tap away, re-read from
       the same filtered rows. With only one figure to place it can also
       be bigger, which is what a period total should have been. */
    const active = historyTab === "sending"
      ? { label: "Paid", sign: "\u2212", value: periodPaidTotal, color: TXN_OUT_COLOR }
      : { label: "Received", sign: "+", value: periodReceivedTotal, color: TXN_IN_COLOR };
    return <div
      // The label the eye no longer needs, kept for the ear: a screen
      // reader gets neither the colour nor the sign.
      aria-label={`${active.label} ${historyPeriodMeta(historyPeriod).emptyLabel}: ${ccy}${fmt(active.value, ccyCode)}`}
      style={{ padding: "12px 16px" }}
    ><div
      style={{
        fontSize: 22,
        fontWeight: 800,
        color: active.color,
        fontFamily: T.fontDisplay,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}
    >{active.sign}{ccy}{fmt(active.value, ccyCode)}</div></div>;
  })()}</div>{
    /* Daily trend — same DailySpendingChart the wallet card uses,
       scoped to just this history's data, giving a quick "average
       day vs a bigger day" read before scrolling the list below. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px", marginBottom: 14 }}><DailySpendingChart weeks={historyDailyTrend.weeks} totals={historyDailyTrend.totals} symbol={ccy} focusDirection={historyTab === "sending" ? "paid" : "received"} palette="light" /></div>{
    /* Method filter — All / Bank / PayLater / Coin, applied to
       whichever panel (Receiving/Sending) is currently active. The
       Received/Paid direction toggle itself lives in the header
       above (see profileDetail === "History"), not duplicated here. */
  }<div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>{["all", "bank", "paylater", "coin"].map((m) => <button
    key={m}
    onClick={() => setHistoryMethodFilter(m)}
    className="v2-tap"
    style={{
      flexShrink: 0,
      border: `1.5px solid ${historyMethodFilter === m ? T.accent : T.line}`,
      borderRadius: 999,
      padding: "6px 13px",
      fontSize: 11.5,
      fontWeight: 700,
      cursor: "pointer",
      color: historyMethodFilter === m ? T.accent : T.inkSoft,
      background: historyMethodFilter === m ? T.accentSoft : "none"
    }}
  >{m === "all" ? "All" : HISTORY_METHOD_META[m].label}</button>)}</div>{
    /* Swipeable pager — Receiving panel first, Sending panel to its
       right; scroll-snap gives a native swipe-right gesture between
       them, synced to the header's Received/Paid toggle via the
       shared historyTab state (scrollHistoryTo / handleHistoryScroll
       keep the two in sync in both directions). */
  }<div
    ref={historyScrollRef}
    onScroll={handleHistoryScroll}
    style={{
      display: "flex",
      overflowX: "auto",
      scrollSnapType: "x mandatory",
      WebkitOverflowScrolling: "touch",
      borderRadius: T.radiusLg,
      scrollbarWidth: "none"
    }}
    className="history-pager"
  >{[
    { key: "receiving", rows: periodReceiveHistory, sign: "+", color: TXN_IN_COLOR, chip: TXN_IN_SOFT },
    { key: "sending", rows: periodSendHistory, sign: "\u2212", color: TXN_OUT_COLOR, chip: TXN_OUT_SOFT }
  ].map((col) => {
    const filteredRows = historyMethodFilter === "all" ? col.rows : col.rows.filter((t) => t.method === historyMethodFilter);
    return <div key={col.key} style={{ flex: "0 0 100%", scrollSnapAlign: "start", minWidth: 0 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{filteredRows.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing {historyPeriodMeta(historyPeriod).emptyLabel}</div> : filteredRows.map((t, i) => <TransactionRow
      // txnId first: the received list is now two sources merged (Creator
      // Share grants and real incoming payments), so name+date alone can
      // repeat across them and React would treat two distinct rows as one.
      key={t.txnId || `${t.name}-${t.date}-${i}`}
      t={t}
      chip={col.chip}
      color={col.color}
      sign={col.sign}
      ccy={ccy} ccyCode={ccyCode}
      isFirst={i === 0}
      onSelect={() => openHistoryReceipt(t, col.key === "sending" ? "sent" : "received")}
    />)}</div></div>;
  })}</div><ReceiptModal receipt={receipt} onClose={requestCloseReceipt} /></div>;
}

