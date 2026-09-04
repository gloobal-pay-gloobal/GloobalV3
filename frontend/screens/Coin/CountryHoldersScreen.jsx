// src/screens/Coin/CountryHoldersScreen.jsx
import { ChevronRight as CountryChevron, Users2 as CountryUsers } from "lucide-react";

// Every holder of GEU in one country.
//
// Reached by tapping a country on the Holders screen. Where that screen
// stops at "Kenya · 5 holders · KSh 71,300", this one shows the five.
//
// ── What this publishes, and why that is a decision ──────────────────────
//
// Each row is a Gloobal ID and an amount. The Gloobal ID is already the
// app's public handle — it is what you hand someone so they can pay you, it
// is printed on receipts, and /api/resolve looks accounts up by it. The
// amount is the new disclosure.
//
// That is deliberate, and it is the same bargain a public chain makes: a
// reserve total is only checkable if the holdings that sum to it can be
// seen. A "fully backed" claim that nobody can audit is a slogan. This is
// what makes it an assertion instead.
//
// What is never shown: names, mobile numbers, emails, bank details, and
// accounts holding no coin. Someone who has never touched GEU does not
// appear on a GEU screen.
//
// The route behind it requires a signed-in caller, unlike the country
// totals. An aggregate is safe to hand to anyone; a list of who holds what
// is not something to leave open to unauthenticated scraping, even when
// every row in it is individually publishable.
//
// ── Two figures per row ──────────────────────────────────────────────────
//
// The country's own currency first, because that is what a person there
// reads without doing arithmetic — and it is the whole reason this screen
// was asked for. The GEU figure underneath, because that is the unit the
// rows add up in, and a list whose rows cannot be added is not evidence of
// anything. ∆ where the rate could not be fetched: not zero, which is a real
// answer to a question that was never answered.
function CountryHoldersScreen({ onBack, countryIso, data, loading, onRetry, myGloobalId }) {
  const country = countryIso ? COUNTRY_BY_ISO[countryIso] : null;
  const localCcy = data ? data.localCurrency : null;
  const rows = data ? data.rows || [] : [];

  return <div style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader
    title={country ? country.name : countryIso || "Holders"}
    onBack={onBack}
  /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* The country's total, so arriving here confirms the row that was
       tapped rather than presenting a second, unexplained figure. */
  }<div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      flexShrink: 0,
      padding: "16px 18px",
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadowCard
    }}
  >{
    /* One flag component, everywhere — FlagEmoji, cut to a disc here by
       shape="circle". It is what the registration country picker, Send
       Money, receipts, Coverage and the Bank screen all draw through: a
       real flag image with the emoji as its fallback. This used to call a
       separate FlagCircle, which wrapped this same component and so was
       never a different flag, only a second name for one silhouette of
       it. Printing `{country.flag}` as text instead
       looks identical on a Mac and renders as the two letters "KE" on most
       Android builds and every Windows browser, which is where a good part
       of this app's users are. */
  }{country ? <FlagEmoji flag={country.flag} size={46} shape="circle" /> : <span
    style={{ width: 46, height: 46, borderRadius: "50%", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><CountryUsers size={19} color={T.inkFaint} /></span>}<span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}><span
    style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.5 }}
  >{data ? `${data.holders} ${data.holders === 1 ? "holder" : "holders"}` : "Holders"}</span><span
    style={{ fontSize: 21, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, letterSpacing: -0.5, lineHeight: 1.15, overflowWrap: "anywhere" }}
  >{!data ? "∆" : `${fmt(data.held)} ${COIN_TICKER}`}</span>{data && localCcy && <span
    style={{ fontSize: 11, color: T.inkFaint }}
  >{localCcy}{" · "}1 {COIN_TICKER} = {fmtMoney(1, data.reserveCurrency)}</span>}</span></div>{
    /* Only the very first read gets a spinner. */
  }{!data && loading ? <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>
      Loading holders…
    </div> : !data ? <div
    style={{ padding: "26px 20px", borderRadius: T.radiusLg, background: T.surface, border: `1px solid ${T.line}`, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}
  ><span style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
      Couldn't load the holders for this country. Nothing here is zero — the
      server didn't answer.
    </span><button
      onClick={onRetry}
      className="v2-tap"
      style={{ alignSelf: "center", border: `1px solid ${T.line}`, background: T.surface, borderRadius: 999, padding: "9px 20px", fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer" }}
    >Try again</button></div> : !rows.length ? <div
    style={{ padding: "30px 20px", borderRadius: T.radiusLg, background: T.surface, border: `1px solid ${T.line}`, textAlign: "center", fontSize: 12.5, color: T.inkFaint, lineHeight: 1.5 }}
  >
      Nobody in {country ? country.name : countryIso} holds {COIN_TICKER} yet.
    </div> : <div style={{ position: "relative", flexShrink: 0 }}><span
    style={{
      position: "absolute",
      top: 0,
      left: 16,
      transform: "translateY(-50%)",
      background: T.bg,
      padding: "0 6px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 800,
      color: T.inkFaint,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      zIndex: 1
    }}
  >Every holder</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", padding: "4px 16px 6px", marginTop: 8 }}>{rows.map((row, i) => {
    // Your own row, marked. On a list of identifiers nobody reads as a
    // name, "which one is me" is otherwise a character-by-character
    // comparison of eight symbols.
    const isMe = !!myGloobalId && row.symbolId === myGloobalId;
    return <div
      key={row.symbolId || i}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, marginTop: i === 0 ? 6 : 0 }}
    ><span
      style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: isMe ? T.accentSoft : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: isMe ? T.accent : T.inkFaint }}
    >{i + 1}</span><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span
      style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >{row.symbolId ? <ColoredGloobalId id={row.symbolId} /> : <span style={{ color: T.inkFaint }}>∆</span>}</span>{isMe && <span
      style={{ fontSize: 10, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: 0.4 }}
    >You</span>}</span><span
      style={{ flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}
    ><span style={{ fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{row.localHeld === null
      ? "∆"
      : fmtMoney(row.localHeld, localCcy)}</span><span
      style={{ fontSize: 10.5, color: T.inkFaint }}
    >{fmt(row.held)} {COIN_TICKER}</span></span></div>;
  })}</div></div>}{
    /* Said out loud rather than left as an unexplained shortfall between
       the list and the total above it. */
  }{data && data.truncated && <span style={{ fontSize: 10.5, color: T.negative, lineHeight: 1.55, padding: "0 4px" }}>
      Showing the largest 200 holders. The total above is the sum of these
      rows, not of the whole country.
    </span>}{data && <span style={{ fontSize: 10.5, color: T.inkFaint, lineHeight: 1.55, padding: "0 4px" }}>
      Gloobal IDs and holdings only — no names, no numbers, no contact
      details. A holding is shown because a reserve is only checkable when
      the amounts that add up to it can be seen.
    </span>}</div></div>;
}
