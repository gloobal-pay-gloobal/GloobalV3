// src/features/paylater/PayLaterScreen.jsx
import { ArrowLeft as ArrowLeft2, ChevronRight as ChevronRight2 } from "lucide-react";


// src/features/paylater/PayLaterScreen.jsx
function PayLaterScreen({ onClose, ccy, ccyCode = "USD", paylaterAvailable, paylaterLimit, totalAssets, paylaterDue, paylaterReceiving, paylaterSending, onViewAssets, onPayNow, toast }) {
  // Every figure on this screen is the account's own money in the account's
  // own currency, so the lens applies to all of them or none. Read from the
  // shared store the balance card's toggle writes.
  const lens = useGeuLens();
  // The two headline figures get the bar — see the standing-alone rule in
  // AssetsScreen. "of X limit" below the first one does not: it is a
  // sentence, and the figure it qualifies already carries both unit names
  // two lines above it. Same for "Your limit = your current assets (X)".
  //
  // ccyCode as its own ownCurrency, as on every screen that shows one
  // account's money in that account's currency and nobody else's.
  const availableText = geuLensBarMoney(paylaterAvailable, ccyCode, lens, ccyCode);
  const dueText = geuLensBarMoney(paylaterDue, ccyCode, lens, ccyCode);
  // 306 and 288 are these two cards' inner widths on a 360px phone (the
  // dues card gives up width to the Pay Now button beside it). Floor 13,
  // against design sizes of 28 and 20.
  const availableSize = geuLensRowFontSize(availableText, 28, 306, 13);
  const dueSize = geuLensRowFontSize(dueText, 20, 288, 13);
  const availableParts = geuLensBarParts(paylaterAvailable, ccyCode, lens, ccyCode);
  const dueParts = geuLensBarParts(paylaterDue, ccyCode, lens, ccyCode);
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><AppSymbolBg zIndex={-1} /><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onClose} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}><GloobalWordmark suffix=" PayLater" /></span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* Balance */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 18px" }}><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Available PayLater balance</div><div style={{ fontSize: availableSize, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay, marginTop: 4, whiteSpace: "nowrap" }}>{availableParts.lead}{availableParts.trail && <span style={{ fontSize: geuLensTrailSize(availableSize), fontWeight: 800 }}> {availableParts.trail}</span>}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>of <GeuFigure amount={paylaterLimit} currency={ccyCode} lens={lens} size={11.5} /> limit</div><div style={{ height: 6, borderRadius: 999, background: T.surfaceAlt, marginTop: 12, overflow: "hidden" }}><div
    style={{
      width: `${Math.max(0, Math.min(100, paylaterAvailable / Math.max(paylaterLimit, 0.01) * 100))}%`,
      height: "100%",
      borderRadius: 999,
      background: T.gradButton
    }}
  /></div><button
    onClick={onViewAssets}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", padding: 0, marginTop: 12, cursor: "pointer" }}
  ><span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>Your limit = your current assets (<GeuFigure amount={totalAssets} currency={ccyCode} lens={lens} size={11} />)</span><ChevronRight2 size={13} color={T.accent} /></button></div>{
    /* Pending dues */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Pending dues</div><div style={{ fontSize: dueSize, fontWeight: 800, color: paylaterDue > 0 ? T.negative : T.positive, fontFamily: T.fontDisplay, marginTop: 3, whiteSpace: "nowrap" }}>{dueParts.lead}{dueParts.trail && <span style={{ fontSize: geuLensTrailSize(dueSize), fontWeight: 800 }}> {dueParts.trail}</span>}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>{paylaterDue > 0 ? "Due Aug 1" : "Nothing due \u2014 all clear"}</div></span>{paylaterDue > 0 && <button
    onClick={onPayNow}
    className="v2-tap"
    style={{
      border: "none",
      borderRadius: 999,
      padding: "10px 20px",
      fontSize: 12.5,
      fontWeight: 800,
      color: "#fff",
      background: T.gradButton,
      boxShadow: "0 6px 16px rgba(124,58,237,0.3)",
      cursor: "pointer",
      flexShrink: 0
    }}
  >
                Pay now
              </button>}</div></div>{
    /* History — split into the two directions of the ledger. */
  }<PayLaterLedger title="Receiving" rows={paylaterReceiving} direction="in" ccy={ccy} ccyCode={ccyCode} /><PayLaterLedger title="Sending" rows={paylaterSending} direction="out" ccy={ccy} ccyCode={ccyCode} /></div>{
    /* Toast echo — this overlay (z 300) covers the dashboard's own
       toast (z 50). */
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
  >{toast}</div>}</div>;
}

