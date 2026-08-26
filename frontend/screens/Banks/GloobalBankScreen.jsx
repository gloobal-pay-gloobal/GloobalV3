// src/screens/Banks/GloobalBankScreen.jsx
import { ArrowDownLeft as BankArrowDownLeft, ArrowUpRight as BankArrowUpRight } from "lucide-react";

// Gloobal Bank — the account this app actually runs on, and the screen
// people land on from the Accounts tab.
//
// Lifted out of DashboardScreen, where it was one of three ~90-line
// conditional blocks written inline. Nothing about what it draws changed
// in the move; what it gained is the two things it was missing, and the
// reason they were missing is that a screen buried inside another screen's
// return statement is a bad place to add anything:
//
//   - the balance, which this screen is nominally about and never showed
//   - the last five transactions on that balance
//
// Both are handed in as props rather than fetched here. `balance` is the
// same reconciled figure the wallet card shows (App.jsx reconciles it
// against GET /api/profile/:symbolId on sign-in and after every payment),
// so reading the profile route a second time here would risk showing a
// different number for the same account on two screens of the same app.
// One read, one number.
function GloobalBankScreen({
  onBack,
  onOpenStats,
  heroColor,
  services,
  interested,
  interestBusy,
  onRegisterInterest,
  ccy,
  balance,
  // Same unconfirmed-balance state the dashboard card shows (see the
  // balanceStatus effect in App.jsx). Threaded through so the two places
  // that display this account's balance can never disagree about whether
  // the server has actually confirmed it.
  balanceUnavailable = false,
  balanceVisible,
  onToggleBalance,
  recentTransactions
}) {
  const rows = Array.isArray(recentTransactions) ? recentTransactions : [];
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader
    title={<OneBankMark />}
    onBack={onBack}
    onAction={onOpenStats}
    actionLabel="Interest stats"
  /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 20 }}><ProductScreenHero color={heroColor} />{
    /* The balance sits behind the same biometric gate as the wallet
       card on Home — same `balanceVisible` state, same eye control,
       same WebAuthn check on the way to revealing it. Showing it
       unmasked here would have made the gate on the other screen
       decorative: one tap to a second screen and the number is
       there anyway. */
  }<div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "18px 20px",
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadowCard
    }}
  ><span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>Your balance</span><span style={{ fontSize: 28, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, letterSpacing: 0.2 }}>{balanceUnavailable ? <span style={{ fontSize: 16, fontWeight: 700, color: T.negative }}>Balance unavailable</span> : balanceVisible ? `${ccy}${balance}` : "•••••••"}</span></span><button
    onClick={onToggleBalance}
    aria-label={balanceVisible ? "Hide balance" : "Show balance"}
    className="v2-tap"
    style={{ width: 38, height: 38, borderRadius: "50%", border: "none", flexShrink: 0, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><EyeIcon open={balanceVisible} /></button></div><ProductServicesCard services={services} />{
    /* Recent transactions — the same five rows the Home tab's activity
       list draws, merged across both directions rather than split by a
       tab, because this screen is about the account rather than about
       sending or receiving. Empty is stated as empty; a balance screen
       with nothing under it should say so instead of rendering a blank
       card that reads as a failed load. */
  }<div style={{ position: "relative", marginTop: 14, flexShrink: 0 }}>{
    /* Bug fix: "Recent Transactions" straddles the card's top border the
       same way every notch-labelled card on this screen does
       (translateY(-50%) pulls it half outside the box). The card used to
       set overflow: hidden on itself, which clipped the label's upper
       half to an unreadable sliver the moment it tried to poke out.
       overflow: hidden now lives on an inner wrapper around just the rows,
       so the row dividers still clip to the rounded corners and the label
       renders in full above it. */
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
  >Recent Transactions</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", padding: "6px 18px 12px" }}>{rows.length === 0 ? <div style={{ padding: "18px 0 8px", textAlign: "center", fontSize: 12, color: T.inkFaint, lineHeight: 1.5 }}>
        No transactions yet — send your first payment
      </div> : rows.map((t, i) => {
    const received = t.direction === "received";
    return <div
      key={t.key}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, marginTop: i === 0 ? 8 : 0 }}
    ><span
      style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: received ? T.positiveSoft : T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}
    >{received ? <BankArrowDownLeft size={14} color={TXN_IN_COLOR} /> : <BankArrowUpRight size={14} color={TXN_OUT_COLOR} />}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>{t.date}</span></span><span style={{ fontSize: 13, fontWeight: 800, color: received ? TXN_IN_COLOR : TXN_OUT_COLOR, flexShrink: 0 }}>{received ? "+" : "−"}{ccy}{Number(t.amount || 0).toFixed(2)}</span></div>;
  })}</div></div>{
    /* Moved to the bottom of the screen at the user's request — the
       tagline card and "I am IN" waitlist button used to sit between the
       balance and Our Services, which pushed the account's own content
       (services, recent transactions) further down. They're marketing/
       waitlist elements rather than account data, so the end of the
       screen — after everything about the account itself — is where they
       belong. */
  }<GloobalTaglineCard accentColor={heroColor} /><GloobalIamInButton
    interested={interested}
    busy={interestBusy}
    onClick={onRegisterInterest}
  /></div></div>;
}
