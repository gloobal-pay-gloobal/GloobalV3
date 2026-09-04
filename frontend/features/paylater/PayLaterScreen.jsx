// src/features/paylater/PayLaterScreen.jsx
import { ArrowLeft as ArrowLeft2, ChevronRight as ChevronRight2 } from "lucide-react";


// src/features/paylater/PayLaterScreen.jsx
function PayLaterScreen({ onClose, ccy, ccyCode = "USD", paylaterAvailable, paylaterLimit, totalAssets, paylaterDue, paylaterReceiving, paylaterSending, onViewAssets, onPayNow, toast }) {
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onClose} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}><GloobalWordmark suffix=" PayLater" /></span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* Balance */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 18px" }}><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Available PayLater balance</div><div style={{ fontSize: 28, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay, marginTop: 4 }}>{fmtMoney(paylaterAvailable, ccyCode)}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>of {fmtMoney(paylaterLimit, ccyCode)} limit</div><div style={{ height: 6, borderRadius: 999, background: T.surfaceAlt, marginTop: 12, overflow: "hidden" }}><div
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
  ><span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>Your limit = your current assets ({fmtMoney(totalAssets, ccyCode)})</span><ChevronRight2 size={13} color={T.accent} /></button></div>{
    /* Pending dues */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Pending dues</div><div style={{ fontSize: 20, fontWeight: 800, color: paylaterDue > 0 ? T.negative : T.positive, fontFamily: T.fontDisplay, marginTop: 3 }}>{fmtMoney(paylaterDue, ccyCode)}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>{paylaterDue > 0 ? "Due Aug 1" : "Nothing due \u2014 all clear"}</div></span>{paylaterDue > 0 && <button
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

