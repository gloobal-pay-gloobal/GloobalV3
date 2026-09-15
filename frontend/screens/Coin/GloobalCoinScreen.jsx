// src/screens/Coin/GloobalCoinScreen.jsx
import { useState as useState30, useEffect as useEffect20 } from "react";
import { Check as CoinCheck, ChevronRight as CoinChevron } from "lucide-react";

// Gloobal Coin — a working, fully backed prototype currency.
//
// This screen used to be a leaflet: a hero, a tagline, a waitlist button and
// four rows all marked Planned. The coin now exists, so the screen shows what
// it actually does — mint, send, redeem — and the numbers on it come from the
// server that holds them.
//
// What "fully backed" means here, precisely, because it is the one claim worth
// being careful about: a coin comes into existence only when the same amount of
// prototype fiat leaves an account and enters the reserve, and it leaves
// existence only when that fiat is handed back. The supply banner does not
// assert this — it reports GET /api/coin/supply, which is the server comparing
// three figures it maintains through three different writes. When they
// disagree, the banner says so. A green tick nobody can fail is not a check.
//
// Amounts are typed as plain numbers rather than through the dial pad because
// this is a converter, not a payment — the payment path (sending coin) goes
// through the PIN, same as sending money does.
function GloobalCoinScreen({
  onBack,
  onOpenStats,
  onOpenHolders,
  heroColor,
  services,
  interested,
  interestBusy,
  onRegisterInterest,
  symbolId,
  ccy,
  ccyCode = "USD",
  countryName,
  geuRate,
  reserveCurrency,
  bankBalance,
  coinBalance,
  coinHistory,
  // The durable history, from GET /api/coin/:symbolId/history. Preferred
  // over `coinHistory` above, which is the in-browser ledger and empties on
  // every page reload — see refreshCoinLedger in Dashboard.jsx.
  serverCoinHistory,
  holderName,
  holderSymbolId,
  holderCountryFlag,
  supply,
  busy,
  onMint,
  onRedeem,
  onOpenSend,
  onRefresh
}) {
  const [mode, setMode] = useState30("mint");
  const [amount, setAmount] = useState30("");
  // The receipt for a coin movement, open over this screen.
  //
  // Buying coin used to produce a toast and nothing else, so the one movement
  // in this app that is literally a currency exchange was the only one with
  // no record anybody could open.
  const [coinReceipt, setCoinReceipt] = useState30(null);

  // Who the receipt is for. Assembled once here rather than at each of the
  // two call sites below, so the receipt opened straight after a purchase and
  // the one reopened from the list a week later cannot describe the holder
  // differently.
  const coinReceiptViewer = {
    name: holderName,
    symbolId: holderSymbolId,
    countryName,
    countryFlag: holderCountryFlag
  };

  // Read once when the screen opens. The balance is already in the ledger from
  // whenever it was last reconciled, so this is a refresh rather than a load —
  // the screen renders a real figure immediately and corrects it if the server
  // knows better, instead of showing a spinner over a number it already has.
  useEffect20(() => {
    if (onRefresh) onRefresh();
  }, []);

  // ── The peg, and what it means for an account outside India ───────────
  //
  // One GEU is one unit of the RESERVE currency, for everybody. What differs
  // is what you pay with. `geuRate` is how many GEU one unit of THIS
  // account's own currency buys — 1 for an Indian account, about 85 for a US
  // one — and the server is the only place it is ever computed, so the
  // figure previewed here is the figure the mint will actually apply.
  //
  // null means the rate could not be fetched. It is NOT treated as 1: this
  // screen used to tell a US account "1 GEU = $1, always", which was not a
  // rounding error but a claim wrong by a factor of eighty-five, and it was
  // the only statement of the rate anywhere in the app. An unknown rate now
  // reads as ∆ and the buy is refused rather than guessed at.
  const pegCode = reserveCurrency || COIN_PEG_CURRENCY;
  const rateKnown = Number.isFinite(geuRate) && geuRate > 0;
  const isPegCurrency = rateKnown && geuRate === 1;

  const numericAmount = Number(amount);
  const amountIsValid = Number.isFinite(numericAmount) && numericAmount > 0;
  // What the person actually receives, in the unit they receive it in.
  // Buying: they type their own currency and get GEU. Cashing out: they type
  // GEU and get their own currency back. Same rate, both ways.
  const converted = !amountIsValid || !rateKnown
    ? null
    : mode === "mint"
      ? numericAmount * geuRate
      : numericAmount / geuRate;
  const ceiling = mode === "mint" ? Number(bankBalance) || 0 : Number(coinBalance) || 0;
  const overCeiling = amountIsValid && numericAmount > ceiling;
  // A conversion nobody can compute must not be submitted. The server fails
  // closed on a missing rate anyway; stopping here means the person is told
  // before they commit rather than after.
  const canSubmit = amountIsValid && !overCeiling && !busy && rateKnown && converted > 0;

  // The stamp for a coin row, from the row's own fields when it has them and
  // from postedAt when it does not.
  //
  // CoinService.history() now attaches { date, time } to every row it builds,
  // which is the shape historyRowStamp wants and the shape every other list
  // in the app already uses. But rows restored from a ledger persisted before
  // that change carry only postedAt, and for those historyRowStamp returns an
  // empty string — a transaction with no date at all, which is worse than the
  // bare "Sep 3" this replaced.
  //
  // Derived through the same two formatters the rest of the app uses, so a
  // fallback row and a fresh one read identically rather than being a second
  // date format hiding behind a condition.
  const coinRowStamp = (row) => {
    if (row.date || row.time) return historyRowStamp(row);
    const posted = new Date(row.postedAt);
    if (isNaN(posted.getTime())) return "";
    return historyRowStamp({
      date: posted.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      time: formatClockTime(posted)
    });
  };

  // What Coin Activity actually lists.
  //
  // The server's history when it answered, the in-browser ledger when it did
  // not. Preferring the server is the point of this: the ledger is an array
  // in memory, so before this the list was empty every time the tab was
  // reloaded and no row could open a receipt for a purchase made yesterday.
  //
  // Falling back rather than showing nothing keeps the offline case honest —
  // a mint posted locally in this session is still real and still the
  // person's — and the two are normalised to one row shape here so the list
  // below renders one thing, not two.
  const coinActivityRows = serverCoinHistory
    ? serverCoinHistory.map((row) => {
        const receipt = coinReceiptFrom(row, coinReceiptViewer);
        return {
          id: row.id || row.referenceId,
          // The receipt's own title, so a row and the document it opens
          // cannot name the same movement two different ways.
          memo: receipt.title,
          direction: row.direction,
          amount: row.coinAmount,
          date: receipt.date,
          time: receipt.time,
          receipt
        };
      })
    : (coinHistory || []).map((row) => ({
        ...row,
        // A locally-posted row carries no server reference, and a receipt
        // without one has nothing to identify the movement by — so these
        // stay unopenable rather than opening a document that cannot say
        // which transaction it describes.
        receipt: null
      }));

  const submit = () => {
    if (!canSubmit) return;
    const run = mode === "mint" ? onMint : onRedeem;
    Promise.resolve(run(numericAmount)).then((result) => {
      if (result === false) return;
      setAmount("");
      // Build the receipt from the SERVER's response, which carries the
      // reference id, the fiat that actually moved, the currency it moved in
      // and the rate it converted at. Not from `numericAmount` and the
      // screen's own `geuRate`: those are what the person asked for and what
      // the screen last displayed, and a receipt is a record of what
      // happened, not of what was requested. On a cross-rate they differ.
      if (!result || !result.referenceId) return;
      const minted = mode === "mint";
      setCoinReceipt(coinReceiptFrom({
        id: result.referenceId,
        referenceId: result.referenceId,
        type: minted ? "coin_mint" : "coin_redeem",
        direction: minted ? "in" : "out",
        coinAmount: minted ? result.minted : result.redeemed,
        coinCurrency: COIN_TICKER,
        fiatAmount: minted ? result.paid : result.received,
        fiatCurrency: minted ? result.paidCurrency : result.receivedCurrency,
        geuRate: result.geuRate,
        // Which way the rate points, matching what the history route sends
        // for the same movement — the mint route records GEU per unit of
        // fiat, the redeem route records fiat per GEU, under one field name.
        geuRateBasis: minted ? "coin-per-fiat" : "fiat-per-coin",
        reserveCurrency,
        note: minted ? "Minted Gloobal Coin" : "Redeemed Gloobal Coin",
        // The server does not return a timestamp on mint or redeem, so this
        // is the only honest source for one and it is accurate to the second
        // the response landed. The receipt reopened from history later shows
        // the server's own createdAt.
        createdAt: new Date().toISOString()
      }, coinReceiptViewer));
    });
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><AppSymbolBg zIndex={-1} /><ProductScreenHeader
    title={<SingleOMark before="" after="NE CURRENCY" />}
    onBack={onBack}
    onAction={onOpenStats}
    actionLabel="Interest stats"
  /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 20 }}>{
    /* The two balances, side by side, with the peg between them.
       ─────────────────────────────────────────────────────────────
       This screen used to open with the brand hero, then one card
       holding the coin balance and, in small grey type underneath,
       "Backed 1:1 by ₹X held in reserve". So the single most important
       fact about this currency — that a unit of it IS a unit of your own
       money, not a token whose price you have to look up — was a
       footnote under the number it explains.

       Showing both accounts at once makes the claim structural instead
       of textual: your rupees on the left, your units on the right, the
       same amount either side of a chip that says the rate. There is
       nothing to read to understand it, which matters on a screen built
       for someone who reads no English.

       The hero is gone from here rather than shrunk. It stands alone on
       the splash and on Gloobal Bank; a third appearance directly above
       two account cards was pushing the accounts themselves under the
       fold to repeat a signature the person had already seen twice this
       session. */
  }<div style={{ display: "flex", gap: 10, flexShrink: 0, marginTop: 8 }}><div
    style={{
      flex: 1,
      minWidth: 0,
      padding: "14px 15px",
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadowCard
    }}
  ><span style={{ display: "block", fontSize: 9.5, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>Gloobal Bank</span><span
    style={{
      /* Deliberately NOT nowrap+ellipsis, which is what this was.
         At 21px in half a 390px screen "₹124,500.00" rendered as
         "₹124,500…." — a balance with its last digits cut off, which is
         worse than a balance on two lines. An ellipsis is an acceptable
         way to shorten a NAME; it is not an acceptable way to shorten a
         number. The card grows instead. */
      display: "block",
      fontSize: 19,
      fontWeight: 800,
      color: T.ink,
      fontFamily: T.fontDisplay,
      letterSpacing: -0.5,
      marginTop: 6,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
  >{fmtMoney(Number(bankBalance) || 0, ccyCode)}</span><span
    style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{
    /* The same label Gloobal Bank's account card uses, built the same
       way — country and code, whichever of the two we actually have.
       Deliberately NOT a currency full-name lookup: no such table
       exists in this codebase, and writing one to fill a caption would
       mean 160 hand-typed names nobody would ever check. */
  }{[countryName, ccyCode].filter(Boolean).join(" · ")}</span></div><div
    style={{
      flex: 1,
      minWidth: 0,
      padding: "14px 15px",
      borderRadius: T.radiusLg,
      background: T.gradWallet,
      color: "#fff",
      boxShadow: "0 12px 26px rgba(76,29,149,0.26)"
    }}
  ><span style={{ display: "block", fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,0.72)", textTransform: "uppercase", letterSpacing: 0.5 }}>Gloobal Coin</span><span
    style={{
      /* Same rule as the bank figure beside it — see that comment. */
      display: "block",
      fontSize: 19,
      fontWeight: 800,
      fontFamily: T.fontDisplay,
      letterSpacing: -0.5,
      marginTop: 6,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
  >{fmt(Number(coinBalance) || 0)} {COIN_TICKER}</span><span
    style={{ display: "block", fontSize: 10.5, color: "rgba(255,255,255,0.74)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{COIN_TICKER_LONG}</span></div></div>{
    /* The peg, stated once, between the two things it relates. Not a
       claim the screen is making on its own account — it is the rule the
       mint and redeem routes below both enforce, which is why the same
       sentence can be read in either direction. */
  }<div style={{ display: "flex", justifyContent: "center", flexShrink: 0, marginTop: -8 }}><span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "6px 13px",
      borderRadius: 999,
      background: rateKnown ? T.positiveSoft : T.surfaceAlt,
      color: rateKnown ? T.positive : T.inkSoft,
      fontSize: 11.5,
      fontWeight: 800,
      textAlign: "center",
      lineHeight: 1.35
    }}
  ><CoinCheck size={12} style={{ flexShrink: 0 }} />{
    /* Three different true sentences, because there are three states and
       no one sentence covers them.

       An account in the reserve's own country really does pay one unit for
       one unit, and saying so plainly is right. An account anywhere else
       needs the rate, because "1 GEU = ₹1" alone does not tell them what
       their own money buys. An account whose rate could not be fetched gets
       neither claim made on its behalf. */
  }{!rateKnown
    ? `1 ${COIN_TICKER} = ${fmtMoney(1, pegCode)} · your rate is ∆`
    : isPegCurrency
      ? `1 ${COIN_TICKER} = ${fmtMoney(1, ccyCode)}, always`
      : `1 ${COIN_TICKER} = ${fmtMoney(1, pegCode)} · ${fmtMoney(1, ccyCode)} = ${fmt(geuRate)} ${COIN_TICKER}`}</span></div>{
    /* Holders — a control, not a banner.
       ─────────────────────────────────────────────────────────────
       This slot used to hold a green "Fully backed" strip that asserted
       the one thing on the screen worth being able to check, and gave no
       way to check it. It is now the door to the check: it reports the
       same reconciliation the strip did, and tapping it opens the
       country-by-country holder list the total is made of.

       The backing state still governs the colour and still shows a
       mismatch as a mismatch — a green tick nobody can fail is not a
       check, and that was true of the old strip too. What changed is
       that a reader who does not believe the tick now has somewhere to
       go. ∆ where the server did not answer; a 0 here would read as
       "nobody holds this", which is a different claim. */
  }<button
    onClick={onOpenHolders}
    className="v2-tap"
    aria-label="Holders"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: "100%",
      textAlign: "left",
      cursor: "pointer",
      padding: "14px 16px",
      borderRadius: T.radiusMd,
      background: supply ? supply.backed ? T.positiveSoft : T.negativeSoft : T.surfaceAlt,
      border: `1px solid ${supply ? supply.backed ? "transparent" : T.negative : T.line}`
    }}
  ><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span
    style={{ fontSize: 12.5, fontWeight: 800, color: supply ? supply.backed ? T.positive : T.negative : T.inkSoft }}
  >{!supply
    ? "Holders unavailable"
    : !supply.backed
      ? "Reserve does not match supply"
      : `${supply.holders.toLocaleString("en-US")} ${supply.holders === 1 ? "holder" : "holders"}`}</span><span style={{ fontSize: 11, color: T.inkFaint, lineHeight: 1.4 }}>{!supply
    ? "Couldn't reach the server — this is ∆, not zero."
    : `${fmt(supply.issued)} ${COIN_TICKER} issued against ${fmtMoney(supply.reserve, pegCode)} in reserve · see them by country`}</span></span><CoinChevron size={17} color={supply ? supply.backed ? T.positive : T.negative : T.inkFaint} style={{ flexShrink: 0 }} /></button>{
    /* Mint / Redeem. One control with two directions rather than two
       screens, because they are the same conversion read in opposite
       directions and the ceiling is the only thing that differs. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}><div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 999, background: T.surfaceSunk }}>{[
    { key: "mint", label: "Buy units" },
    { key: "redeem", label: "Cash out" }
  ].map((tab) => <button
    key={tab.key}
    onClick={() => {
      setMode(tab.key);
      setAmount("");
    }}
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "9px 0",
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer",
      color: mode === tab.key ? "#fff" : T.inkFaint,
      background: mode === tab.key ? T.gradButton : "transparent",
      transition: "background 0.18s ease, color 0.18s ease"
    }}
  >{tab.label}</button>)}</div><div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: T.radiusMd, background: T.surfaceAlt, border: `1px solid ${overCeiling ? T.negative : T.line}` }}><span style={{ fontSize: 15, fontWeight: 800, color: T.inkFaint, flexShrink: 0 }}>{mode === "mint" ? ccy : COIN_TICKER}</span><input
    value={amount}
    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
    inputMode="decimal"
    placeholder="0.00"
    aria-label={mode === "mint" ? "Amount to convert into coin" : "Amount of coin to cash out"}
    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  /><button
    onClick={() => setAmount(String(ceiling))}
    className="v2-tap"
    style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11.5, fontWeight: 800, color: T.accent, flexShrink: 0 }}
  >MAX</button></div>{
    /* What you get, before you commit to getting it.
       ─────────────────────────────────────────────────────────────
       This space used to hold only prose about what a mint does. For an
       Indian account that was enough, because the answer to "how much do
       I get" was the number already typed. For everyone else the screen
       never showed the conversion at all — not before and not after.
       Someone in the US typed 100 with no way to know whether that meant
       100 units or 8,560 until they looked at their balance afterwards.

       Computed from the same rate the server will apply, so this is a
       preview of the real arithmetic rather than a second, independent
       guess at it. ≈ because the server rounds in the destination unit
       and this does not. */
  }{amountIsValid && <div
    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: T.radiusMd, background: T.surfaceAlt, border: `1px solid ${T.line}` }}
  ><span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint, flexShrink: 0 }}>You get</span><span
    style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 15, fontWeight: 800, color: rateKnown ? T.ink : T.inkFaint, fontFamily: T.fontDisplay }}
  >{!rateKnown
    ? "∆"
    : mode === "mint"
      ? `≈ ${fmt(converted)} ${COIN_TICKER}`
      : `≈ ${fmtMoney(converted, ccyCode)}`}</span></div>}<div style={{ fontSize: 11, color: overCeiling || !rateKnown ? T.negative : T.inkFaint, lineHeight: 1.4 }}>{!rateKnown
    ? "Today's exchange rate couldn't be fetched, so this can't be converted yet. That's unknown, not zero."
    : overCeiling
      ? mode === "mint"
        ? `You only have ${fmtMoney(ceiling, ccyCode)} to convert.`
        : `You only hold ${fmt(ceiling)} ${COIN_TICKER}.`
      : mode === "mint"
        ? isPegCurrency
          ? `Moves ${ccy} out of Gloobal Bank and into the reserve. You can cash out again at any time.`
          : `Your ${ccyCode} is converted at today's rate and held in the reserve as ${pegCode}. You can cash out again at any time.`
        : `Returns ${ccy} to Gloobal Bank and destroys the ${COIN_TICKER}. Same rate, both ways.`}</div><button
    onClick={submit}
    disabled={!canSubmit}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "15px 0",
      cursor: canSubmit ? "pointer" : "default",
      background: canSubmit ? T.gradButton : T.gradButtonDisabled,
      color: "#fff",
      fontSize: 14,
      fontWeight: 800
    }}
  >{busy ? "Working…" : mode === "mint" ? `Buy ${COIN_TICKER_LONG}s` : "Cash out to Gloobal Bank"}</button></div><button
    onClick={onOpenSend}
    disabled={!(Number(coinBalance) > 0)}
    className="v2-tap"
    style={{
      width: "100%",
      border: `1px solid ${T.line}`,
      borderRadius: T.radiusMd,
      padding: "15px 0",
      cursor: Number(coinBalance) > 0 ? "pointer" : "default",
      background: T.surface,
      color: Number(coinBalance) > 0 ? T.accent : T.inkFaint,
      fontSize: 14,
      fontWeight: 800,
      boxShadow: T.shadowCard
    }}
  >{Number(coinBalance) > 0 ? `Send ${COIN_TICKER}` : `Buy ${COIN_TICKER} to start sending`}</button><ProductServicesCard services={services} />{
    /* Coin movements, read from the local ledger rather than from a
       separate history fetch — every one of them was posted there by the
       action that caused it, so this list cannot disagree with the
       balance above it. */
  }<div style={{ position: "relative", marginTop: 14, flexShrink: 0 }}>{
    /* Bug fix: "Coin Activity" straddles the card's top border the same
       way every notch-labelled card here does (translateY(-50%) pulls it
       half outside the box). The card used to set overflow: hidden on
       itself, which clipped the label's upper half to an unreadable
       sliver the moment it tried to poke out. overflow: hidden now lives
       on an inner wrapper around just the rows, so the row dividers still
       clip to the rounded corners and the label renders in full above it. */
  }<span
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
      letterSpacing: 0.4,
      zIndex: 1
    }}
  >Coin Activity</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", padding: "6px 18px 12px" }}>{!coinActivityRows.length ? <div style={{ padding: "18px 0 8px", textAlign: "center", fontSize: 12, color: T.inkFaint, lineHeight: 1.5 }}>
        No coin activity yet — buy your first Gloobal Coin above
      </div> : coinActivityRows.map((row, i) => {
    const incoming = row.direction === "in";
    // The shared transaction row, the same one History, Home, Receive, Send
    // and Gloobal Bank use. This list was a hand-written copy at a 30px disc
    // and 13/10.5 type, and the coin ledger is a transaction list like any
    // other — a person should not have to re-learn the shape of a row when
    // they move between two tabs of the same app.
    //
    // Two things this ledger names differently have to be translated rather
    // than passed through, and both are named here rather than pushed into
    // the shared row, which should not have to know that a coin exists:
    //
    //   `memo` is this list's word for the counterparty column, and
    //   `coinRowStamp` resolves a date from `postedAt` for a row that
    //   predates rows carrying their own date/time.
    const stamp = coinRowStamp(row);
    return <TransactionRow
      key={row.id}
      // Already a finished "Sep 3 · 14:07:32", so it goes in as the date with
      // no time beside it — historyRowStamp passes a stampless row straight
      // through rather than composing it a second time.
      t={{ name: row.memo, date: stamp }}
      color={incoming ? TXN_IN_COLOR : TXN_OUT_COLOR}
      sign={incoming ? "+" : "−"}
      isFirst={i === 0}
      inset={0}
      // GC is a token, not a currency: no ISO code, no symbol, and nothing
      // fmtMoney could correctly do with it. The figure is formatted here,
      // by the same `fmt` that renders the balance above it.
      amountText={`${fmt(Number(row.amount) || 0)} ${COIN_TICKER}`}
      // Only a row backed by a server record opens. A row restored from the
      // in-browser ledger has no reference id, so there is no movement for a
      // receipt to be OF — and TransactionRow drops role="button" and the tab
      // stop when onSelect is absent, so an unopenable row does not announce
      // itself as a control.
      onSelect={row.receipt ? () => setCoinReceipt(row.receipt) : undefined}
    />;
  })}</div></div>{
    /* Moved to the bottom of the screen at the user's request — the
       tagline card and "I am IN" waitlist button used to sit between the
       mint/redeem control and Our Services, ahead of the account's own
       coin activity. They're marketing/waitlist elements rather than
       account data, so the end of the screen — after everything about
       the coin itself — is where they belong. */
  }<GloobalTaglineCard accentColor={heroColor} /><GloobalIamInButton
    interested={interested}
    busy={interestBusy}
    onClick={onRegisterInterest}
  /></div>{
    /* The receipt, over everything. Opened two ways — straight after a buy
       or sell, and by tapping a row in Coin Activity — and built by the same
       mapper both times, so the document a person sees at the till and the
       one they reopen a week later are the same document. */
  }<ReceiptModal
    receipt={coinReceipt}
    onClose={() => setCoinReceipt(null)}
    onDone={() => setCoinReceipt(null)}
  /></div>;
}
