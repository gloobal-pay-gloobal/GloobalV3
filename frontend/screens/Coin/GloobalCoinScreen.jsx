// src/screens/Coin/GloobalCoinScreen.jsx
import { useState as useState30, useEffect as useEffect20 } from "react";
import { ArrowDownLeft as CoinArrowIn, ArrowUpRight as CoinArrowOut, Check as CoinCheck } from "lucide-react";

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
  heroColor,
  services,
  interested,
  interestBusy,
  onRegisterInterest,
  symbolId,
  ccy,
  ccyCode = "USD",
  bankBalance,
  coinBalance,
  coinHistory,
  supply,
  busy,
  onMint,
  onRedeem,
  onOpenSend,
  onRefresh
}) {
  const [mode, setMode] = useState30("mint");
  const [amount, setAmount] = useState30("");

  // Read once when the screen opens. The balance is already in the ledger from
  // whenever it was last reconciled, so this is a refresh rather than a load —
  // the screen renders a real figure immediately and corrects it if the server
  // knows better, instead of showing a spinner over a number it already has.
  useEffect20(() => {
    if (onRefresh) onRefresh();
  }, []);

  const numericAmount = Number(amount);
  const amountIsValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const ceiling = mode === "mint" ? Number(bankBalance) || 0 : Number(coinBalance) || 0;
  const overCeiling = amountIsValid && numericAmount > ceiling;
  const canSubmit = amountIsValid && !overCeiling && !busy;

  const submit = () => {
    if (!canSubmit) return;
    const run = mode === "mint" ? onMint : onRedeem;
    Promise.resolve(run(numericAmount)).then((ok) => {
      if (ok !== false) setAmount("");
    });
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader
    title={<SingleOMark before="" after="NE CURRENCY" />}
    onBack={onBack}
    onAction={onOpenStats}
    actionLabel="Interest stats"
  /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 20 }}><ProductScreenHero color={heroColor} />{
    /* The holding. Not gated behind the passkey the way the bank balance
       is: coin is minted from a balance that already sits behind that
       gate, so a second prompt here would guard a figure the person had
       to authenticate to create in the first place. */
  }<div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "18px 20px",
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadowCard
    }}
  ><span style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>Your Gloobal Coin</span><span style={{ fontSize: 30, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, letterSpacing: 0.2 }}>{Number(coinBalance || 0).toFixed(2)} GC</span><span style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>
        Backed 1:1 by {ccy}{fmt(Number(coinBalance || 0), ccyCode)} held in reserve
      </span></div>{
    /* Supply, as the server reports it. `backed` is a comparison of three
       independently maintained figures, so a mismatch is a real finding
       and is shown as one rather than hidden behind the happy path. ∆ is
       the same "we don't have that figure" mark Coverage uses — a zero
       here would read as "no coin exists", which is a different claim
       from "we couldn't ask". */
  }<div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      borderRadius: T.radiusMd,
      background: supply ? supply.backed ? T.positiveSoft : T.negativeSoft : T.surfaceAlt,
      border: `1px solid ${supply ? supply.backed ? "transparent" : T.negative : T.line}`
    }}
  ><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: supply ? supply.backed ? T.positive : T.negative : T.inkSoft }}>{!supply ? "Supply unavailable" : supply.backed ? "Fully backed" : "Reserve does not match supply"}</span><span style={{ fontSize: 11, color: T.inkFaint, lineHeight: 1.4 }}>{!supply
    ? "Couldn't reach the server — this is ∆, not zero."
    : `${supply.issued.toFixed(2)} GC issued against ${ccy}${fmt(supply.reserve, ccyCode)} in reserve · ${supply.holders} ${supply.holders === 1 ? "holder" : "holders"}`}</span></span>{supply && supply.backed && <CoinCheck size={18} color={T.positive} style={{ flexShrink: 0 }} />}</div>{
    /* Mint / Redeem. One control with two directions rather than two
       screens, because they are the same conversion read in opposite
       directions and the ceiling is the only thing that differs. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}><div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 999, background: T.surfaceSunk }}>{[
    { key: "mint", label: "Buy coin" },
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
  >{tab.label}</button>)}</div><div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: T.radiusMd, background: T.surfaceAlt, border: `1px solid ${overCeiling ? T.negative : T.line}` }}><span style={{ fontSize: 15, fontWeight: 800, color: T.inkFaint, flexShrink: 0 }}>{mode === "mint" ? ccy : "GC"}</span><input
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
  >MAX</button></div><div style={{ fontSize: 11, color: overCeiling ? T.negative : T.inkFaint, lineHeight: 1.4 }}>{overCeiling
    ? mode === "mint"
      ? `You only have ${ccy}${fmt(ceiling, ccyCode)} to convert.`
      : `You only hold ${ceiling.toFixed(2)} GC.`
    : mode === "mint"
      ? `Moves ${ccy} out of Gloobal Bank and into the reserve. You can cash out again at any time.`
      : `Returns ${ccy} to Gloobal Bank and destroys the coin. Same rate, both ways.`}</div><button
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
  >{busy ? "Working…" : mode === "mint" ? "Buy Gloobal Coin" : "Cash out to Gloobal Bank"}</button></div><button
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
  >{Number(coinBalance) > 0 ? "Send Gloobal Coin" : "Buy coin to start sending"}</button><ProductServicesCard services={services} />{
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
  >Coin Activity</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", padding: "6px 18px 12px" }}>{!(coinHistory || []).length ? <div style={{ padding: "18px 0 8px", textAlign: "center", fontSize: 12, color: T.inkFaint, lineHeight: 1.5 }}>
        No coin activity yet — buy your first Gloobal Coin above
      </div> : (coinHistory || []).map((row, i) => {
    const incoming = row.direction === "in";
    return <div
      key={row.id}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, marginTop: i === 0 ? 8 : 0 }}
    ><span
      style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: incoming ? T.positiveSoft : T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}
    >{incoming ? <CoinArrowIn size={14} color={TXN_IN_COLOR} /> : <CoinArrowOut size={14} color={TXN_OUT_COLOR} />}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.memo}</span><span style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>{new Date(row.postedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span><span style={{ fontSize: 13, fontWeight: 800, color: incoming ? TXN_IN_COLOR : TXN_OUT_COLOR, flexShrink: 0 }}>{incoming ? "+" : "−"}{Number(row.amount).toFixed(2)} GC</span></div>;
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
  /></div></div>;
}
