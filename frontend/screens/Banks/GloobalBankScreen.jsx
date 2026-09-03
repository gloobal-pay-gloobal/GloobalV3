// src/screens/Banks/GloobalBankScreen.jsx
import { ArrowDownLeft as BankArrowDownLeft, ArrowUpRight as BankArrowUpRight, Copy as BankCopy } from "lucide-react";

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
  ccyCode = "USD",
  balance,
  // Same unconfirmed-balance state the dashboard card shows (see the
  // balanceStatus effect in App.jsx). Threaded through so the two places
  // that display this account's balance can never disagree about whether
  // the server has actually confirmed it.
  balanceUnavailable = false,
  balanceStatus = "ready",
  onRetryBalance,
  balanceVisible,
  onToggleBalance,
  recentTransactions,
  // Whose account this is. The screen showed a balance and a service list
  // and never once said which account they belonged to — it could have been
  // anybody's. Passed in rather than read here for the same reason the
  // balance is: one source, one answer, no chance of this screen and the
  // dashboard disagreeing about who is logged in.
  gloobalId = "",
  countryFlag = "",
  countryName = "",
  onCopyId
}) {
  const rows = Array.isArray(recentTransactions) ? recentTransactions : [];
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader
    title={<OneBankMark />}
    onBack={onBack}
    onAction={onOpenStats}
    actionLabel="Interest stats"
  /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 20 }}>{
    /* The account, as one card.
       This was a standalone flipping logo box, and under it a plain white
       rectangle reading "YOUR BALANCE". Three problems in one: the mark
       cost ~180px to say something the header already says; the balance
       carried the same surface, border, radius and shadow as the Services
       card and the Transactions card below it, so the most important thing
       on the screen was the third identical white rectangle down; and
       nothing anywhere named the account.
       All three are the same fix. The balance becomes the one coloured
       object on the screen — T.gradWallet, the app's own deep gradient, the
       same one the Home wallet card uses — and it carries the country and
       the Gloobal ID with it.
       flexShrink: 0 is load-bearing, not defensive. In a flex column this
       tall the browser shrinks the first thing it can, and in a mock of
       this exact layout that was the balance: it collapsed to a strip. */
  }<div
    style={{
      position: "relative",
      flexShrink: 0,
      overflow: "hidden",
      borderRadius: 24,
      padding: "17px 18px 15px",
      background: T.gradWallet,
      color: "#fff",
      boxShadow: T.shadowRaised
    }}
  >{
    /* One dial symbol, oversized and barely there, bled off the corner.
       The living logo box is gone from this screen; this is what carries
       the brand in its place, at no cost in height. */
  }<span
    aria-hidden="true"
    style={{ position: "absolute", right: -16, top: -22, fontSize: 118, fontWeight: 800, lineHeight: 1, color: "rgba(255,255,255,0.07)", fontFamily: T.fontDisplay }}
  >+</span><span
    style={{ position: "relative", display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}
  >{
    /* Country and currency, NOT the product name. OneBankMark is already
       the header title two centimetres above; repeating it here would have
       spent the one line this card has on something the screen has just
       said. What it does not say anywhere else is which country's account
       this is and what it is denominated in. */
  }{[countryName, ccyCode].filter(Boolean).join(" \u00B7 ")}</span><div
    style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 5 }}
  ><span
    style={{ fontSize: 29, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, letterSpacing: -0.5, minWidth: 0 }}
  >{balanceStatus === "loading" ? <BalanceLoading /> : balanceStatus === "error" ? <BalanceError onRetry={onRetryBalance} /> : balanceVisible ? `${ccy}${balance}` : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}</span><button
    onClick={onToggleBalance}
    aria-label={balanceVisible ? "Hide balance" : "Show balance"}
    className="v2-tap"
    style={{ width: 34, height: 34, borderRadius: "50%", border: "none", flexShrink: 0, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><EyeIcon open={balanceVisible} /></button></div>{
    /* The ID, on the account it belongs to. Rendered white rather than
       through ColoredGloobalId: that component paints each position in the
       twelve-colour palette, which is right on a light surface and
       illegible on this one. */
  }{gloobalId && <div
    style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, marginTop: 12, paddingTop: 11, borderTop: "1px solid rgba(255,255,255,0.18)" }}
  >{countryFlag && <FlagEmoji flag={countryFlag} width={22} height={17} radius={4} />}<span
    style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.4, color: "rgba(255,255,255,0.94)", fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{gloobalId}</span>{onCopyId && <button
    onClick={onCopyId}
    aria-label="Copy Gloobal ID"
    className="v2-tap"
    style={{ width: 30, height: 30, borderRadius: 9, border: "none", flexShrink: 0, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><BankCopy size={14} color="#fff" /></button>}</div>}</div><ProductServicesCard services={services} />{
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
    // Date AND time, through historyRowStamp — the same "Aug 30 \u00B7 14:07:32"
    // every History row shows. This showed the bare date, so the same
    // payment read "Sep 2" here and "Sep 2 \u00B7 14:07:32" one screen away,
    // and two payments to the same person on one day were indistinguishable
    // on this list.
    const received = t.direction === "received";
    return <div
      key={t.key}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, marginTop: i === 0 ? 8 : 0 }}
    ><span
      style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: received ? T.positiveSoft : T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}
    >{received ? <BankArrowDownLeft size={14} color={TXN_IN_COLOR} /> : <BankArrowUpRight size={14} color={TXN_OUT_COLOR} />}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>{historyRowStamp(t)}</span></span><span style={{ fontSize: 13, fontWeight: 800, color: received ? TXN_IN_COLOR : TXN_OUT_COLOR, flexShrink: 0 }}>{received ? "+" : "−"}{ccy}{fmt(Number(t.amount || 0), ccyCode)}</span></div>;
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
