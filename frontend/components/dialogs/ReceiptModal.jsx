// src/components/dialogs/ReceiptModal.jsx
import { useState as useState11, useEffect as useEffect10 } from "react";
import {
  Copy,
  Check,
  Share2
} from "lucide-react";


// src/components/dialogs/ReceiptModal.jsx
function ReceiptModal({ receipt, onClose, onDone }) {
  const [copied, setCopied] = useState11(false);
  const [receiptTab, setReceiptTab] = useState11("payment");
  const { getLocationForViewer, getComplaintWindow, openComplaint } = useProvenanceAndDisputes();
  const [reportSubmitted, setReportSubmitted] = useState11(false);
  useEffect10(() => {
    if (receipt) {
      setReceiptTab("payment");
      setReportSubmitted(false);
    }
  }, [receipt]);
  const [txnColorOffset, setTxnColorOffset] = useState11(0);
  useEffect10(() => {
    const interval = setInterval(() => {
      setTxnColorOffset((o) => (o + 1) % POSITION_COLORS.length);
    }, 2e3);
    return () => clearInterval(interval);
  }, []);
  if (!receipt) return null;
  const isSent = receipt.direction === "sent";
  const viewerRole = isSent ? "sender" : "receiver";
  const myLocation = receipt.txnId ? getLocationForViewer(receipt.txnId, viewerRole) : null;
  const complaintWindow = receipt.txnId ? getComplaintWindow(receipt.txnId) : null;
  const withinComplaintWindow = complaintWindow ? Date.now() <= new Date(complaintWindow.expiresAt).getTime() : false;
  const handleReportIssue = () => {
    if (!receipt.txnId) return;
    const result = openComplaint({ txnId: receipt.txnId, raisedBy: viewerRole, reason: "Reported from receipt" });
    if (result?.ok) setReportSubmitted(true);
  };
  const tint = receiptTab === "share" ? isSent ? T.positive : T.negative : isSent ? T.negative : T.positive;
  const tintSoft = receiptTab === "share" ? isSent ? T.positiveSoft : "rgba(226,63,69,0.12)" : isSent ? "rgba(226,63,69,0.12)" : T.positiveSoft;
  const shareCurrency = receipt.currencyCode;
  const shareAmountBase = receipt.amount;
  const shareAmount = shareAmountBase * ((receipt.shareRate ?? 0) / 100);
  // Each tab shows ITS OWN transaction's reference.
  //
  // The Creator Share is a separate movement between a different pair of
  // parties — I pay Jio (one transaction), then Jio's share comes back to
  // me (another) — and the server already mints it as its own Transaction
  // with its own referenceId (mintShareLegAndReceipts). Both tabs used to
  // print receipt.txnId, so the payment and the share were indistinguishable
  // by reference and neither could be looked up unambiguously.
  //
  // Falls back to the payment's id when there is no share leg — a payee
  // sharing 0% mints none — so the Creator Share tab is never left showing
  // a blank where a reference should be.
  const shareTxnRaw = receipt.shareTxnId ? String(receipt.shareTxnId).replace(/\s/g, "") : "";
  const showingShare = receiptTab === "share" && !!shareTxnRaw;
  const rawTxnId = showingShare
    ? shareTxnRaw
    : receipt.txnId ? receipt.txnId.replace(/\s/g, "") : "";
  // The payment this share came from, shown beneath it so the two can be
  // traced to each other.
  const shareSourceTxnId = showingShare && receipt.txnId ? receipt.txnId.replace(/\s/g, "") : "";
  const handleCopyTxnId = () => {
    if (!rawTxnId) return;
    copyToClipboard(rawTxnId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const handleShareTxnId = () => {
    if (!rawTxnId) return;
    if (navigator.share) {
      navigator.share({ title: "Transaction ID", text: rawTxnId }).catch(() => {
      });
    } else {
      handleCopyTxnId();
    }
  };
  return <div
    onClick={onClose}
    role="dialog"
    aria-modal="true"
    aria-label="Transaction receipt"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 500,
      background: "rgba(20,12,36,0.55)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      animation: "receipt-overlay-in 0.2s ease"
    }}
  ><style>{`
        @keyframes receipt-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes receipt-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style><div
    onClick={(e) => e.stopPropagation()}
    style={{
      width: "100%",
      maxWidth: 430,
      background: T.surface,
      borderRadius: "28px 28px 0 0",
      padding: "12px 24px calc(28px + env(safe-area-inset-bottom, 0px))",
      position: "relative",
      animation: "receipt-sheet-up 0.28s cubic-bezier(.32,.72,0,1)",
      maxHeight: "88vh",
      overflowY: "auto"
    }}
  ><div style={{ width: 36, height: 4, borderRadius: 999, background: T.line, margin: "2px auto 18px" }} /><div
    style={{
      position: "relative",
      textAlign: "center",
      padding: "16px 16px 18px",
      borderRadius: T.radiusMd,
      border: `1px solid ${T.line}`,
      background: tintSoft
    }}
  ><div
    style={{
      position: "absolute",
      top: -11,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      justifyContent: "center",
      background: T.surface,
      padding: 3,
      borderRadius: "50%",
      zIndex: 1
    }}
  ><GH2HFlipCircle size={22} /></div><button
    onClick={handleShareTxnId}
    aria-label="Share transaction"
    className="v2-tap"
    style={{
      position: "absolute",
      top: "50%",
      right: -14,
      transform: "translateY(-50%)",
      width: 28,
      height: 28,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      zIndex: 1
    }}
  ><Share2 size={13} color={T.inkSoft} /></button><div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, minHeight: receiptTab === "share" ? 0 : void 0 }}>{receiptTab === "payment" ? `${isSent ? "Money sent" : "Money received"}${receipt.status === "pending" ? " \xB7 Pending" : receipt.status === "simulated" ? " \xB7 Not actually sent" : ""}` : isSent ? <SingleOMark before="Back t" after=" you" /> : "You share back"}</div>{
    /* Amount — matches whichever receipt is actually showing.
       Payment tab: what I sent/received, signed accordingly.
       Creator Share tab: the opposite direction from Payment —
       I sent the payment, so the receiver shares back to ME
       (credit, +); I received the payment, so I share back to
       them (debit, −). Always my own currency, since it's always
       my account the share settles into or out of. */
  }<div style={{ margin: "10px 0 0", padding: "0 6px" }}>{receiptTab === "payment" ? <div
    style={{
      fontSize: receiptAmountFontSize(`${isSent ? "\u2212" : "+"}${receipt.currencySymbol}${fmt(receipt.amount)}`, 27),
      fontWeight: 800,
      color: tint,
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
  >{isSent ? "\u2212" : "+"}{receipt.currencySymbol}{fmt(receipt.amount)}</div> : <div
    style={{
      fontSize: receiptAmountFontSize(`${isSent ? "+" : "\u2212"}${CURRENCY_SYMBOL[shareCurrency] || ""}${fmt(shareAmount)}`, 27),
      fontWeight: 800,
      color: tint,
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
  >{isSent ? "+" : "\u2212"}{CURRENCY_SYMBOL[shareCurrency] || ""}{fmt(shareAmount)}</div>}</div></div><div style={{ borderTop: `1.5px dashed ${T.line}`, margin: "18px 0" }} />{
    /* Two receipts, one toggle — Payment always exists, Creator
       Share always exists too, even at 0%. Neither tab is ever
       hidden based on the value. */
  }<div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 999, background: T.surfaceAlt, marginBottom: 14 }}>{[
    { key: "payment", label: "Payment" },
    { key: "share", label: "Creator Share" }
  ].map((tab) => <button
    key={tab.key}
    onClick={() => setReceiptTab(tab.key)}
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "9px 0",
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer",
      color: receiptTab === tab.key ? "#fff" : T.inkSoft,
      background: receiptTab === tab.key ? T.gradButton : "transparent",
      transition: "background 0.18s ease, color 0.18s ease"
    }}
  >{tab.label}</button>)}</div>{receiptTab === "payment" ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{
    /* Box 1 — who it's to/from, and their Gloobal ID if there is one.
       The flag sits as its own circular badge on the box's top
       edge, centered, instead of inline next to the name. */
  }<div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12, padding: "18px 14px 12px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}>{receipt.flag && <span
    data-testid="receipt-flag"
    style={{
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 1,
      display: "flex"
    }}
  >{
    /* The real flag component, not the emoji character.
       This was `{receipt.flag}` printed as text at fontSize 15 inside a
       40px circle: too small to read even where it renders, and on any
       platform without flag glyphs (Windows above all) it is not a flag at
       all — it is the two regional-indicator letters, "GB", sitting where a
       flag should be. FlagCircle loads the same flag asset every other flag
       in the app uses and fits it to the circle without cropping or
       stretching it. */
  }<FlagCircle flag={receipt.flag} size={40} /></span>}<ReceiptRow
    testId="receipt-counterparty"
    label={isSent ? "To" : "From"}
    value={receipt.name}
  />{receipt.id && <ReceiptRow
    testId="receipt-counterparty-id"
    label={<GloobalWordmark suffix=" ID" />}
    value={<ColoredGloobalId id={receipt.id} />}
    mono
  />}</div>{
    /* Box 3 — payment method, date, time, status together */
  }<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}>{receipt.method && <ReceiptRow label="Payment method" value={receipt.method} />}<ReceiptRow label="Date" value={receipt.date} /><ReceiptRow label="Time" value={receipt.time} mono /><ReceiptRow label="Status" value={receipt.status === "pending" ? "Pending" : receipt.status === "simulated" ? "Not sent — simulated" : "Completed"} /></div>{receipt.status === "simulated" && <div
    role="alert"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
      padding: "10px 12px",
      borderRadius: 12,
      background: "#FEF3C7",
      border: "1px solid #F5D68A",
      color: "#8A5A00",
      fontSize: 11.5,
      fontWeight: 700,
      lineHeight: 1.35
    }}
  ><span aria-hidden="true">⚠️</span><span>This recipient wasn't a registered Gloobal account, so nothing was actually sent — this receipt reflects a local simulation only.</span></div>}</div> : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{
    /* Creator Share's own receipt — who earned it, the rate, and
       the actual value, shown as its own document rather than a
       section tucked inside the payment receipt. Rate and amount
       default to 0 rather than the whole receipt disappearing —
       a 0% share is still a real, reportable outcome of this
       transaction, not a reason to hide it. */
  }<div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12, padding: "18px 14px 12px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}>{receipt.flag && <span
    data-testid="receipt-flag"
    style={{
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 1,
      display: "flex"
    }}
  >{
    /* The real flag component, not the emoji character.
       This was `{receipt.flag}` printed as text at fontSize 15 inside a
       40px circle: too small to read even where it renders, and on any
       platform without flag glyphs (Windows above all) it is not a flag at
       all — it is the two regional-indicator letters, "GB", sitting where a
       flag should be. FlagCircle loads the same flag asset every other flag
       in the app uses and fits it to the circle without cropping or
       stretching it. */
  }<FlagCircle flag={receipt.flag} size={40} /></span>}<ReceiptRow label={isSent ? "Shared back to" : "You shared back to"} value={isSent ? "You" : receipt.name} /></div><div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><ReceiptRow label="Creator Share rate" value={`${(receipt.shareRate ?? 0).toFixed(2)}%`} accent />{
    /* Credit when I sent (the receiver shares back to me),
       debit when I received (I share back to them) — same
       direction as the hero figure above, always my own
       currency. */
  }<ReceiptRow
    label="Amount"
    value={`${isSent ? "+" : "\u2212"}${CURRENCY_SYMBOL[shareCurrency] || ""}${fmt(shareAmount)}`}
    accent
  /></div><div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><ReceiptRow label="From payment" value={`${receipt.currencySymbol}${fmt(receipt.amount)}`} /><ReceiptRow label="Date" value={receipt.date} /><ReceiptRow label="Time" value={receipt.time} mono /></div></div>}{
    /* Transaction ID — its own box, separate from the boxes above.
       Shown as individually colored symbols (same palette used for
       Secure ID chips elsewhere), centered in the box. Label sits
       centered on the box's top edge; copy sits on that same top
       edge at the right corner. Share moved to the Money Sent box
       above instead of living here too. */
  }{rawTxnId && <div
    style={{
      position: "relative",
      marginTop: 26,
      padding: "24px 18px 22px",
      borderRadius: T.radiusLg,
      border: `1px solid ${T.line}`,
      display: "flex",
      justifyContent: "center"
    }}
  ><span
    style={{
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: T.surface,
      padding: "0 8px",
      fontSize: 9.5,
      fontWeight: 800,
      color: T.inkFaint,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      whiteSpace: "nowrap"
    }}
  >{showingShare ? "Share transaction ID" : "Transaction ID"}</span><button
    onClick={handleCopyTxnId}
    aria-label="Copy transaction ID"
    className="v2-tap"
    style={{
      position: "absolute",
      top: 0,
      right: 14,
      transform: "translateY(-50%)",
      width: 28,
      height: 28,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surfaceAlt,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  >{copied ? <Check size={13} color={T.positive} /> : <Copy size={13} color={T.inkSoft} />}</button><div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "monospace", fontSize: 14, fontWeight: 800, maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{rawTxnId.split("").map((ch, i) => <span key={i} style={{ flexShrink: 0, color: POSITION_COLORS[(i + txnColorOffset) % POSITION_COLORS.length], transition: "color 0.4s ease" }}>{ch}</span>)}</div>{shareSourceTxnId && <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 600, color: T.inkFaint, textAlign: "center", lineHeight: 1.45, wordBreak: "break-all" }}>{"From payment "}<span style={{ fontFamily: "monospace", fontWeight: 800 }}>{shareSourceTxnId}</span></div>}</div>}{
    /* Provenance & complaint window — each viewer only ever sees
       their OWN resolved city/state (never the other party's), plus
       a short, explicit window to report an issue. Reporting opens a
       case; it never reverses money or flags fraud automatically. */
  }{complaintWindow && <div
    style={{
      marginTop: 18,
      padding: "14px 14px",
      borderRadius: T.radiusMd,
      border: `1px solid ${T.line}`,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }}
  >{myLocation && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>
            Completed near
          </span><span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>
            {myLocation.city}{myLocation.state ? `, ${myLocation.state}` : ""}{myLocation.approximate ? " (approx.)" : ""}
          </span></div>}{reportSubmitted ? <p style={{ fontSize: 12, color: T.positive, fontWeight: 600 }}>
            Reported — a case has been opened. This doesn't change your balance or eligibility; the other side has up to 24 hours to respond.
          </p> : withinComplaintWindow ? <button
    onClick={handleReportIssue}
    className="v2-tap"
    style={{
      width: "100%",
      padding: "10px 0",
      borderRadius: 12,
      border: `1px solid ${T.line}`,
      background: T.surfaceAlt,
      color: T.ink,
      fontSize: 12.5,
      fontWeight: 700,
      cursor: "pointer"
    }}
  >
            Report an issue with this transaction
          </button> : <p style={{ fontSize: 11.5, color: T.inkFaint }}>
            The verification window for this transaction has closed.
          </p>}</div>}<button
    onClick={onDone || onClose}
    className="v2-tap"
    style={{
      width: "100%",
      marginTop: 22,
      padding: "13px 0",
      borderRadius: 16,
      border: "none",
      background: T.gradButton,
      color: "#fff",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >
          Done
        </button></div></div>;
}

