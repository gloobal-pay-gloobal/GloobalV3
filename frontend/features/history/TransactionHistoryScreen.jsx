// src/features/history/TransactionHistoryScreen.jsx
import { useState as useState12, useEffect as useEffect11, useRef as useRef9 } from "react";
import { Filter as FilterHist, ChevronDown as ChevronDown4 } from "lucide-react";


// src/features/history/TransactionHistoryScreen.jsx
// One toggle only: the parent (History header, in the Account/Profile
// screen) owns historyTab/historyMethodFilter and renders the actual
// Received/Paid buttons — this component just consumes that state via
// props instead of keeping its own separate copy (which used to render
// a second, redundant Receiving/Sending pill directly underneath the
// header's Received/Paid buttons).
// How many rows a history list shows before it asks to be expanded.
//
// A period like "This Month" can hold hundreds of rows, and rendering all of
// them builds a list taller than the phone several times over — every one of
// which has to be laid out and painted before the first is visible. Ten is
// roughly one screenful: enough that the common case (glance at the recent
// few) never needs a tap, and short enough that the list appears instantly
// no matter how much history sits behind it.
//
// Expanding adds another ten rather than revealing everything, for the same
// reason. Someone with a thousand transactions who taps once wants the next
// ten, not a thousand-row list.
var HISTORY_PAGE_SIZE = 10;

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
  // How many rows each side of the pager is currently showing. Two counts,
  // not one: the Received and Paid lists are independent lists, and expanding
  // one has no business expanding the other behind the swipe.
  const [visibleCounts, setVisibleCounts] = useState12({ receiving: HISTORY_PAGE_SIZE, sending: HISTORY_PAGE_SIZE });
  // Any change to WHAT is being listed collapses both sides back to one page.
  // Without this, expanding to 90 rows under "This Month" and then switching
  // to "Today" would leave the shorter list claiming to be 90 rows deep, and
  // switching back would skip the pagination entirely.
  useEffect11(() => {
    setVisibleCounts({ receiving: HISTORY_PAGE_SIZE, sending: HISTORY_PAGE_SIZE });
  }, [historyPeriod, historyMethodFilter, isActive]);
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
  const periodPaidTotal = useMemo5(() => sumHistoryAmount(periodSendHistory, ccyCode), [periodSendHistory, ccyCode]);
  const periodReceivedTotal = useMemo5(() => sumHistoryAmount(periodReceiveHistory, ccyCode), [periodReceiveHistory, ccyCode]);
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
    /* ONE box, not two. The period total used to sit in its own card
       directly above the chart's card, and the two were describing the
       same filtered rows — the total for the period, and the figure for
       whichever day is selected inside it. Stacked as separate boxes they
       read as two competing answers (and on a "Today" filter one could say
       +₹10,000.00 while the other said +₹0.00, which looks like a bug and
       is not one: they are different questions).

       Now they share the chart's header line. Left is the part you are
       pointing at — the selected bar, or the visible week. Right is the
       whole, for the period the strip above selects. The chart sits
       underneath both, inside the same card as the control that filters
       it, so the thing being filtered and the filter are never separated.

       ONE total, not two directions: the Received/Paid toggle in the
       header already decides which list is on screen, so a figure for the
       other direction answers a question nobody asked here. */
    const active = historyTab === "sending"
      ? { label: "Paid", sign: "\u2212", value: periodPaidTotal, color: TXN_OUT_COLOR }
      : { label: "Received", sign: "+", value: periodReceivedTotal, color: TXN_IN_COLOR };
    return <div style={{ padding: "14px 16px 16px" }}><DailySpendingChart
      weeks={historyDailyTrend.weeks}
      totals={historyDailyTrend.totals}
      symbol={ccy}
      focusDirection={historyTab === "sending" ? "paid" : "received"}
      palette="light"
      trailing={<span
        // The label the eye no longer needs, kept for the ear: a screen
        // reader gets neither the colour nor the sign, and without it this
        // is a bare number beside another bare number.
        aria-label={`${active.label} ${historyPeriodMeta(historyPeriod).emptyLabel}: ${ccy}${fmt(active.value, ccyCode)}`}
        style={{
          fontSize: 19,
          fontWeight: 800,
          color: active.color,
          fontFamily: T.fontDisplay,
          whiteSpace: "nowrap",
          flexShrink: 0
        }}
      >{active.sign}{ccy}{fmt(active.value, ccyCode)}</span>}
    /></div>;
  })()}</div>{
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
    // One page at a time. `remaining` is what the expander offers, and it
    // counts every row still held back — not just the next ten — so the
    // number on the button answers "how much more is there" rather than
    // "how much will this tap give me".
    const shownRows = filteredRows.slice(0, visibleCounts[col.key]);
    const remaining = filteredRows.length - shownRows.length;
    return <div key={col.key} style={{ flex: "0 0 100%", scrollSnapAlign: "start", minWidth: 0 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{filteredRows.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing {historyPeriodMeta(historyPeriod).emptyLabel}</div> : <>{shownRows.map((t, i) => <TransactionRow
      // txnId first: the received list is now two sources merged (Creator
      // Share grants and real incoming payments), so name+date alone can
      // repeat across them and React would treat two distinct rows as one.
      key={t.txnId || `${t.name}-${t.date}-${i}`}
      t={t}
      color={col.color}
      sign={col.sign}
      ccy={ccy} ccyCode={ccyCode}
      isFirst={i === 0}
      onSelect={() => openHistoryReceipt(t, col.key === "sending" ? "sent" : "received")}
    />)}{
      /* The expander. A chevron and a number, and nothing else — this is
         the one control on the screen a person meets while already deep in
         a list, and "Show 24 more" would be the longest English sentence on
         the page. A downward chevron means "more below" to a reader of any
         script, and 24 is 24 everywhere. Screen readers get the full
         sentence through aria-label, which is where it belongs. */
    }{remaining > 0 && <button
      onClick={() => setVisibleCounts((counts) => ({ ...counts, [col.key]: counts[col.key] + HISTORY_PAGE_SIZE }))}
      className="v2-tap"
      aria-label={`Show ${Math.min(remaining, HISTORY_PAGE_SIZE)} more, ${remaining} remaining`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        // Shorthand FIRST, longhand after. Written the other way round the
        // shorthand resets borderTop to `medium currentColor` and draws a
        // thick dark rule across the card.
        border: "none",
        borderTop: `1px solid ${T.line}`,
        background: "transparent",
        padding: "12px 0",
        cursor: "pointer",
        color: T.accent,
        fontSize: 12.5,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums"
      }}
    ><ChevronDown4 size={15} color={T.accent} />{remaining}</button>}</>}</div></div>;
  })}</div><ReceiptModal receipt={receipt} onClose={requestCloseReceipt} /></div>;
}

