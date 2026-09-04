// src/screens/Coin/CoinHoldersScreen.jsx
import { useState as useState34, useEffect as useEffect24 } from "react";
import { Check as HoldersCheck, ChevronRight as CountryChevronRight, Globe2 as HoldersGlobe, Users2 as HoldersUsers } from "lucide-react";

// Who holds Gloobal Coin, and where.
//
// This screen exists because the Coin screen used to end the backing claim
// at a green strip: "Fully backed · 412,000 issued · 37 holders". That strip
// asserted the one thing on the screen worth being able to check, and gave
// no way to check it. Tapping the holders line now opens this — the same
// total, broken into the countries it came from.
//
// ── What the numbers are, precisely ──────────────────────────────────────
//
// Every figure here comes from GET /api/coin/holders, which groups real User
// documents by the countryIso each account registered with and sums the coin
// balances the ledger actually holds. Nothing on this screen is derived from
// this device's own history, and nothing is a constant.
//
// Each country's holding is shown TWICE, on purpose:
//
//   · in that country's own currency, as the large figure — because a holder
//     in Kenya wants to know what Kenya holds in shillings, and a figure in
//     rupees is a number they have to do arithmetic on before it means
//     anything;
//   · in the reserve currency underneath, small — because that is the
//     currency the coin is actually backed by, and it is the only one the
//     country rows can be added up in.
//
// ── Why some rows show no amount ─────────────────────────────────────────
//
// A country with one holder has no aggregate to report. "Tonga · 1 holder ·
// T$3,000" is one person's balance with their country printed beside it, and
// anyone who knows who the only Gloobal user in Tonga is can read it off a
// public screen. The server withholds those amounts and returns the count
// alone; this screen shows the country and its holder count, and says why
// the amount is missing rather than drawing a blank.
//
// The withheld amounts are not lost — the server sums them into one figure,
// shown here as its own row, so the country rows and that row add back up to
// the total. A privacy rule that made the arithmetic stop working would be a
// worse bug than the one it fixed.
//
// ── ∆ ────────────────────────────────────────────────────────────────────
//
// ∆ means "we could not ask", and appears where a country's exchange rate
// could not be fetched. It is deliberately not 0, and deliberately not the
// reserve figure repeated: both of those are readable as real answers to a
// question that was never answered. Same mark, same meaning, as the supply
// banner and Coverage.
function CoinHoldersScreen({ onBack, holders, loading, onRefresh, onOpenCountry }) {
  const [reloading, setReloading] = useState34(false);

  useEffect24(() => {
    if (onRefresh) onRefresh();
  }, []);

  const reload = () => {
    if (!onRefresh || reloading) return;
    setReloading(true);
    Promise.resolve(onRefresh()).finally(() => setReloading(false));
  };

  const rows = holders ? holders.countries || [] : [];
  const reserveCcy = holders ? holders.reserveCurrency : "INR";

  // The reserve figure a country row is denominated in, formatted the way
  // every other amount in the app is. Kept as one helper so the withheld row
  // and the country rows cannot format the same currency two different ways.
  const inReserve = (n) => fmtMoney(Number(n) || 0, reserveCcy);

  return <div style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader
    title="Holders"
    onBack={onBack}
  /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* The total, first — the figure the Coin screen's holders row was
       showing, so arriving here confirms rather than surprises. */
  }<div
    style={{
      position: "relative",
      flexShrink: 0,
      borderRadius: T.radiusLg,
      background: T.gradWallet,
      color: "#fff",
      padding: "20px 20px 18px",
      overflow: "hidden",
      boxShadow: "0 14px 30px rgba(76,29,149,0.28)"
    }}
  ><HoldersGlobe
    size={128}
    style={{ position: "absolute", right: -26, top: -24, opacity: 0.09, pointerEvents: "none" }}
  /><span style={{ position: "relative", display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>People holding {COIN_TICKER}</span><span
    style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, fontFamily: T.fontDisplay }}
  ><span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{holders ? holders.totalHolders.toLocaleString("en-US") : "∆"}</span><span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.78)" }}>{holders && holders.totalHolders === 1 ? "holder" : "holders"}</span></span><span
    style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginTop: 13, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.18)", fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.84)" }}
  ><span style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><HoldersCheck size={9} /></span>{holders
    ? `${fmt(holders.heldByAccounts, reserveCcy)} ${COIN_TICKER} held across ${rows.length} ${rows.length === 1 ? "country" : "countries"}`
    : "Couldn't reach the server — this is ∆, not zero."}</span></div>{
    /* The list. `loading` only covers the very first read: once there are
       rows, a refresh redraws them in place rather than replacing the
       screen with a spinner over numbers it already has. */
  }{!holders && loading ? <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>
      Loading holders…
    </div> : !holders ? <div
    style={{ padding: "26px 20px", borderRadius: T.radiusLg, background: T.surface, border: `1px solid ${T.line}`, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}
  ><span style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
      Couldn't load the holder list. Nothing here is zero — the server just
      didn't answer.
    </span><button
      onClick={reload}
      className="v2-tap"
      style={{ alignSelf: "center", border: `1px solid ${T.line}`, background: T.surface, borderRadius: 999, padding: "9px 20px", fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer" }}
    >{reloading ? "Trying…" : "Try again"}</button></div> : !rows.length ? <div
    style={{ padding: "30px 20px", borderRadius: T.radiusLg, background: T.surface, border: `1px solid ${T.line}`, textAlign: "center", fontSize: 12.5, color: T.inkFaint, lineHeight: 1.5 }}
  >
      Nobody holds {COIN_TICKER} yet. The first person to buy one appears here.
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
  >By country</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", padding: "4px 16px 6px", marginTop: 8 }}>{rows.map((row, i) => {
    const country = row.countryIso ? COUNTRY_BY_ISO[row.countryIso] : null;
    const localCcy = row.localCurrency;
    const withheldRow = row.held === null;

    // A country with holders opens; one without a recorded ISO cannot be
    // asked about, so it stays a plain row rather than a control that does
    // nothing when tapped.
    const openable = !!row.countryIso && !!onOpenCountry;
    const Row = openable ? "button" : "div";

    return <Row
      key={row.countryIso || `unknown-${i}`}
      onClick={openable ? () => onOpenCountry(row.countryIso) : void 0}
      className={openable ? "v2-tap" : void 0}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 0",
        borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
        marginTop: i === 0 ? 6 : 0,
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderTopWidth: i === 0 ? 0 : 1,
        borderTopStyle: "solid",
        borderTopColor: i === 0 ? "transparent" : T.line,
        cursor: openable ? "pointer" : "default",
        font: "inherit",
        color: "inherit"
      }}
    >{country ? <FlagEmoji flag={country.flag} size={34} shape="circle" /> : <span
      style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}
    ><HoldersGlobe size={15} color={T.inkFaint} /></span>}<span style={{ flex: 1, minWidth: 0 }}><span
      style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >{country ? country.name : row.countryIso || "Country not recorded"}</span><span
      style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 2 }}
    >{row.holders.toLocaleString("en-US")} {row.holders === 1 ? "holder" : "holders"}{localCcy ? ` · ${localCcy}` : ""}</span></span><span
      style={{ flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}
    >{withheldRow ? <span
      style={{ fontSize: 10.5, fontWeight: 700, color: T.inkFaint, maxWidth: 108, lineHeight: 1.35, textAlign: "right" }}
    >Amount not shown for a single holder</span> : <><span
      style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
    >{row.localHeld === null
      ? "∆"
      : fmtMoney(row.localHeld, localCcy)}</span><span
      style={{ fontSize: 10.5, color: T.inkFaint }}
    >{inReserve(row.held)}</span></>}</span>{openable && <CountryChevronRight
      size={16}
      color={T.inkFaint}
      style={{ flexShrink: 0, marginLeft: 2 }}
    />}</Row>;
  })}{
    /* The withheld total, as its own row. Present so the country rows
       above plus this line equal the total at the top of the screen —
       a reader who adds them up must not come out short and be left
       wondering which country is missing. */
  }{holders.withheldCountries > 0 && <div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: `1px solid ${T.line}` }}
  ><span
    style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}
  ><HoldersUsers size={15} color={T.inkFaint} /></span><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.inkSoft }}>Held in single-holder countries</span><span
    style={{ display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 2, lineHeight: 1.4 }}
  >{holders.withheldCountries} {holders.withheldCountries === 1 ? "country" : "countries"} above, counted but not itemised</span></span><span
    style={{ flexShrink: 0, fontSize: 14.5, fontWeight: 800, color: T.inkSoft, fontFamily: T.fontDisplay }}
  >{inReserve(holders.withheld)}</span></div>}</div></div>}{
    /* Said once, at the end, rather than as a caveat on every row. */
  }{holders && <span style={{ fontSize: 10.5, color: T.inkFaint, lineHeight: 1.55, padding: "0 4px" }}>
      Counts and totals only — no names, no identifiers, no individual
      balances. Each country's figure is shown in its own currency and, below
      it, in {reserveCcy}, the currency the reserve is held in. ∆ marks a
      country whose exchange rate couldn't be fetched.
    </span>}</div></div>;
}
