// src/components/dialogs/ReceiptModal.jsx
import { useState as useState11, useEffect as useEffect10 } from "react";
import {
  Copy,
  Check,
  Share2
} from "lucide-react";


// src/components/dialogs/ReceiptModal.jsx

// One segment of the Payment / Creator Share toggle.
//
// Pulled out of the row because the row is no longer two identical things
// in a loop — the counterparty's flag sits between them — and interleaving
// a separator into a .map() costs more clarity than the loop was saving.
function ReceiptTabButton({ label, active, onSelect }) {
  return <button
    onClick={onSelect}
    className="v2-tap"
    aria-pressed={active}
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "9px 0",
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      color: active ? "#fff" : T.inkSoft,
      background: active ? T.gradButton : "transparent",
      transition: "background 0.18s ease, color 0.18s ease"
    }}
  >{label}</button>;
}

function ReceiptModal({ receipt, onClose, onDone }) {
  const [copied, setCopied] = useState11(false);
  // A Creator Share receipt opens on its share.
  //
  // Initialised from the prop AND reset by the effect below. Two places on
  // purpose: the effect runs after paint, so on its own it would show one
  // frame of the Payment tab before switching — a flicker on the document
  // that is least about a payment.
  const [receiptTab, setReceiptTab] = useState11(
    () => (receipt && receipt.kind === "share" ? "share" : "payment")
  );
  const { getLocationForViewer, getComplaintWindow, openComplaint } = useProvenanceAndDisputes();
  const [reportSubmitted, setReportSubmitted] = useState11(false);
  useEffect10(() => {
    if (receipt) {
      setReceiptTab(receipt.kind === "share" ? "share" : "payment");
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
  // The share leg's own reference, stripped of the grouping spaces rows
  // saved before genTxnId dropped them still carry. See the block below the
  // tints for what it is and why nothing falls back to the payment's id.
  const shareTxnRaw = receipt.shareTxnId ? String(receipt.shareTxnId).replace(/\s/g, "") : "";
  // Is there a Creator Share on this receipt AT ALL?
  //
  // Two ways to be sure there is: the share leg's own reference (a server
  // payment whose payee shares something), or a non-zero rate (a payment
  // settled locally, where the share is real in this device's ledger but no
  // server leg exists to reference). A payment at 0% has neither, and it
  // gets no Creator Share tab — an empty tab on a payment that shares
  // nothing implies a movement that never happened.
  const shareRatePercent = Number(receipt.shareRate) || 0;
  const isShareReceipt = receipt.kind === "share";

  // The payment the Payment tab describes.
  //
  // On a payment receipt that is this row. On a share receipt it is the
  // payment the share came from — 500 to Jio, not the 10 share — resolved by
  // reference in historyUtils, and null when it could not be found.
  const paymentKnown = !isShareReceipt || receipt.sourceAmount != null;
  const paymentAmount = isShareReceipt
    ? Number(receipt.sourceAmount) || 0
    : receipt.amount;
  const paymentCurrency = isShareReceipt
    ? receipt.sourceCurrencyCode || receipt.currencyCode
    : receipt.currencyCode;
  const paymentIsSent = isShareReceipt ? receipt.sourceDirection === "sent" : isSent;

  // Which tab leads.
  //
  // Payment receipt: Payment, the flag, then Creator Share — the order the
  // money moved in. Share receipt: the document is about the share, so
  // Creator Share leads and Payment follows, carrying the payment it came
  // from. The ORDER is what says which kind of receipt you opened before you
  // have read a figure; lighting a tab does not, because a lit tab in second
  // place still reads as the second thing.
  const leadingTab = isShareReceipt ? "share" : "payment";
  const trailingTab = isShareReceipt ? "payment" : "share";
  const tabLabel = (tab) => (tab === "share" ? "Creator Share" : "Payment");

  // A Creator Share receipt gets a Creator Share tab, and it is the one it
  // opens on — but the tab shows the share, it never COMPUTES one.
  //
  // That distinction is the whole of it, and it is worth being exact about,
  // because the tab was removed from share receipts outright to stop a real
  // fabrication: the row arrived carrying the payment's rate, this check read
  // it as "there is a share here", and the tab computed the rate AGAIN
  // against the share amount and announced the result as money shared back.
  // On the reported payment that was a second release of 49.00 out of a 700
  // share — a movement that exists in no transaction, no ledger entry and no
  // balance. In the Jio example it is 2% of 10, printed as 0.20.
  //
  // Two things now make the tab safe rather than absent:
  //
  //   - mapServerTransaction zeroes `shareRate` on a share leg, so no share
  //     row can claim a rate of its own; and
  //   - `shareAmount` below READS the row's own figure on a share receipt
  //     instead of multiplying anything, so there is no second computation
  //     left to be wrong.
  //
  // What the tab shows is the share that actually happened, and the Payment
  // tab beside it shows the payment it came from. Removing the tab stopped
  // the fabrication but left the other half of the defect standing: the
  // share still opened as a document headed "Money received", as though Jio
  // had paid you 10 for something.
  //
  // A PAYMENT receipt still gets the tab only when a share really happened —
  // a share leg minted server-side, or a non-zero rate applied by this
  // device's own ledger. A payment at 0% shares nothing, and a tab offering
  // the receipt for a movement that never happened is a claim, not a control.
  const hasShareEvent = isShareReceipt || !!shareTxnRaw || shareRatePercent > 0;

  // `direction` means two different things, and conflating them puts the
  // wrong sign on the hero figure.
  //
  // On a PAYMENT receipt it describes the payment, and the share always runs
  // the other way: I paid Jio, so Jio's share comes back to ME. On a SHARE
  // receipt it describes the share itself and needs no inverting — direction
  // "received" IS the share arriving.
  const shareIsCredit = isShareReceipt ? !isSent : isSent;
  // Guarded rather than read straight off `receiptTab`, so a receipt opened
  // while the previous one was left on its share tab cannot land on a tab
  // this receipt does not have.
  const onShareTab = hasShareEvent && receiptTab === "share";
  const tint = onShareTab
    ? (shareIsCredit ? T.positive : T.negative)
    : (paymentIsSent ? T.negative : T.positive);
  const tintSoft = onShareTab
    ? (shareIsCredit ? T.positiveSoft : "rgba(226,63,69,0.12)")
    : (paymentIsSent ? "rgba(226,63,69,0.12)" : T.positiveSoft);
  const shareCurrency = receipt.currencyCode;
  const shareAmountBase = receipt.amount;
  // READ on a share receipt, computed on a payment receipt.
  //
  // On a share receipt the row IS the share, so its own figure is the
  // figure. This is the line that makes the Creator Share tab safe to show
  // on a share receipt at all — see hasShareEvent above.
  const shareAmount = isShareReceipt
    ? (Number(receipt.shareAmount) || Number(receipt.amount) || 0)
    : shareAmountBase * ((receipt.shareRate ?? 0) / 100);
  // The rate to DISPLAY. On a share receipt it comes off the payment, for
  // the reason historyUtils spells out: the share row's own rate is zeroed
  // at the boundary by design, so reading it here would print 0.00%.
  const displayShareRate = isShareReceipt
    ? (receipt.sourceShareRate ?? null)
    : shareRatePercent;
  // Each tab shows ITS OWN transaction's reference.
  //
  // The Creator Share is a separate movement between a different pair of
  // parties — I pay Jio (one transaction), then Jio's share comes back to
  // me (another) — and the server already mints it as its own Transaction
  // with its own referenceId (mintShareLegAndReceipts). Both tabs used to
  // print receipt.txnId, so the payment and the share were indistinguishable
  // by reference and neither could be looked up unambiguously.
  //
  // It used to FALL BACK to the payment's id when the share reference was
  // absent, on the reasoning that a blank looked broken. That fallback is
  // removed, because what it actually printed was a false statement: the
  // Creator Share tab claimed a transaction id that belongs to a different
  // transaction, and the two legs of one payment could not be told apart by
  // anyone reading the receipt. Four ordinary situations reached it —
  // reopening any receipt from history, retrying a send, paying a scanned
  // code, paying a business — so the same-id receipt was the normal case,
  // not an edge one.
  //
  // No reference now means no reference is shown. The id box is drawn only
  // `&&` there is one (see below), so the tab renders its money and its rate
  // and simply omits a field it does not have.
  // Which reference each tab names, and it swaps with the document.
  //
  // PAYMENT receipt: the payment's id is the row's own, the share's is
  // shareTxnId. SHARE receipt: the other way round — the row IS the share,
  // so its own id is the share's, and the payment's comes off the row the
  // lookup found.
  const ownTxnId = receipt.txnId ? String(receipt.txnId).replace(/\s/g, "") : "";
  const shareSideTxnId = isShareReceipt ? ownTxnId : shareTxnRaw;
  const paymentSideTxnId = isShareReceipt ? receipt.sourceTxnId || "" : ownTxnId;
  const showingShare = onShareTab && !!shareSideTxnId;
  const rawTxnId = onShareTab ? shareSideTxnId : paymentSideTxnId;
  // No cross-reference line under the id.
  //
  // There was one — "From payment <id>" in small grey type beneath the
  // share's own reference. The two tabs are a single swipe apart and each
  // already shows the id of the thing it is about, in its own box under its
  // own label, so the line said the same thing twice and in the worse of the
  // two places. It was also laid out as a flex ROW sibling of the reference,
  // so the two drew on top of each other.
  const handleCopyTxnId = () => {
    if (!rawTxnId) return;
    copyToClipboard(rawTxnId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  // Share the RECEIPT, not the reference on its own.
  //
  // This used to hand the share sheet a bare 20-symbol reference. Pasted into
  // WhatsApp it arrived as a wall of symbols that said nothing about what it
  // was, from whom or for how much - and could not be acted on, because there
  // was nowhere for it to lead.
  //
  // Now it opens the phone's own share sheet with a summary and a link. The
  // summary is the sender deliberately disclosing their own payment, which is
  // what sharing a receipt IS. The link carries only the reference (see
  // GET /t/:referenceId) and the app it opens shows the receipt from the
  // VIEWER'S OWN history, so a forwarded link tells a stranger nothing.
  const receiptCountryName = (() => {
    if (!receipt || !receipt.flag) return "";
    const match = (typeof ALL_COUNTRIES !== "undefined" ? ALL_COUNTRIES : []).find((c) => c.flag === receipt.flag);
    return match ? match.name : "";
  })();
  // The path this receipt's link is addressed by.
  //
  // It used to be the transaction's own reference. Every one of the twenty
  // dial-pad symbols is multi-byte UTF-8, so encodeURIComponent turned a
  // 20-character reference into about 180 characters of %E2%96%A0 — a link
  // that filled a WhatsApp message and read as a decoding error:
  //
  //   /t/%E2%96%A1%E2%96%A0%3D%E2%97%8B%E2%96%A0%E2%96%A1…
  //
  // The server now mints a ten-character ASCII handle for each transaction
  // (Transaction.receiptCode) and GET /t/ resolves it back to that row, so
  // the same link reads /t/A7K9M2QX8P.
  //
  // Read per TAB, not per receipt: the payment and its Creator Share are two
  // different movements with two different references, so they have two
  // different handles, and sharing the share tab must not hand somebody a
  // link to the payment it came from.
  //
  // The reference is still the fallback, and is still what a receipt with no
  // code shares — a payment that stayed local, or a row restored from before
  // codes existed. Those links are long, and they still resolve: GET /t/
  // accepts both shapes. Nothing here changes the Transaction ID itself; it
  // is minted, stored, displayed and copied exactly as before.
  const receiptShareCode = onShareTab
    ? (isShareReceipt ? receipt.receiptCode || "" : receipt.shareReceiptCode || "")
    : (isShareReceipt ? receipt.sourceReceiptCode || "" : receipt.receiptCode || "");
  const receiptSharePath = receiptShareCode || (rawTxnId ? encodeURIComponent(rawTxnId) : "");
  const receiptShareUrl = receiptSharePath ? `${GLOOBAL_API_BASE}/t/${receiptSharePath}` : "";
  const handleShareTxnId = () => {
    if (!rawTxnId) return;
    const money = fmtMoney(Number(receipt.amount || 0), receipt.currencyCode);
    const who = receipt.name ? `${isSent ? "To" : "From"}: ${receipt.name}${receiptCountryName ? ` (${receiptCountryName})` : ""}` : "";
    const lines = [
      `Gloobal receipt - ${isSent ? "money sent" : "money received"}`,
      money,
      who,
      `${receipt.date || ""}${receipt.time ? ` \u00b7 ${receipt.time}` : ""}`,
      `Transaction ID: ${rawTxnId}`
    ].filter(Boolean);
    const text = lines.join("\n");
    // The clipboard fallback copies the WHOLE receipt including the link,
    // rather than the bare id it used to leave behind.
    shareOrCopy(
      { title: "Gloobal receipt", text, url: receiptShareUrl },
      `${text}\n${receiptShareUrl}`,
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }
    );
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
  ><Share2 size={13} color={T.inkSoft} /></button><div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, minHeight: onShareTab ? 0 : void 0 }}>{!onShareTab ? (paymentKnown ? `${paymentIsSent ? "Money sent" : "Money received"}${receipt.status === "pending" ? " \xB7 Pending" : receipt.status === "simulated" ? " \xB7 Not actually sent" : ""}` : "Payment not available") : shareIsCredit ? <SingleOMark before="Back t" after=" you" /> : "You share back"}</div>{
    /* Amount — matches whichever receipt is actually showing.
       Payment tab: what I sent/received, signed accordingly.
       Creator Share tab: the opposite direction from Payment —
       I sent the payment, so the receiver shares back to ME
       (credit, +); I received the payment, so I share back to
       them (debit, −). Always my own currency, since it's always
       my account the share settles into or out of. */
  }<div style={{ margin: "10px 0 0", padding: "0 6px" }}>{!onShareTab ? (paymentKnown ? <div
    style={{
      fontSize: receiptAmountFontSize(`${paymentIsSent ? "\u2212" : "+"}${fmtMoney(paymentAmount, paymentCurrency)}`, 27),
      fontWeight: 800,
      color: tint,
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
    data-testid="receipt-hero-payment"
  >{paymentIsSent ? "\u2212" : "+"}{fmtMoney(paymentAmount, paymentCurrency)}</div> : <div
    style={{ fontSize: 13, fontWeight: 700, color: T.inkFaint, lineHeight: 1.4, padding: "6px 0" }}
    data-testid="receipt-payment-unavailable"
  >{
    /* The payment row is not on this device. Saying so is the only honest
       option: the share and its rate are both known, so the payment COULD
       be reconstructed by division — and that is exactly the figure that
       would be quietly wrong for every share that rounded. */
  }This payment isn't on this device. The Creator Share above is complete.</div>) : <div
    style={{
      fontSize: receiptAmountFontSize(`${shareIsCredit ? "+" : "\u2212"}${fmtMoney(shareAmount, shareCurrency)}`, 27),
      fontWeight: 800,
      color: tint,
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
    data-testid="receipt-hero-share"
  >{shareIsCredit ? "+" : "\u2212"}{fmtMoney(shareAmount, shareCurrency)}</div>}</div></div><div style={{ borderTop: `1.5px dashed ${T.line}`, margin: "18px 0" }} />{
    /* Two receipts, one toggle. Payment always exists. Creator
       Share exists whenever the payment actually carried one — a
       share leg minted server-side, or a non-zero rate applied by
       this device's own ledger — and its tab is drawn only then.
       A payment at 0% shares nothing, and a tab offering to show
       the receipt for a movement that never happened is a claim,
       not a control. The tab is hidden on value only in that one
       sense: whether the event exists at all, never on how big it
       is. */
  }<div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 999, background: T.surfaceAlt, marginBottom: 14 }}><ReceiptTabButton
    label={tabLabel(leadingTab)}
    active={leadingTab === "share" ? onShareTab : !onShareTab}
    onSelect={() => setReceiptTab(leadingTab)}
  />{
    /* The counterparty's flag, on the seam between the two tabs.
       It used to hang off the top edge of the box BELOW this row —
       half in the row's margin, half over the box — which made it
       an ornament floating in a gap rather than a fact about the
       transaction, and it was drawn twice, once per tab, because
       each tab's first box carried its own copy.
       There is only ever one counterparty on a receipt: the person
       named on the Payment tab is the person shared with on the
       Creator Share tab. So the flag belongs to the whole document
       and is drawn once, above both. The hairlines either side are
       what stop it reading as a hole punched in the pill track.
       They are inkFaint at 35%, not T.line: the track behind them
       is surfaceAlt (#F3F1FA) and T.line is #EAE6F7, so a line in
       it is invisible against its own background — drawn, painted,
       and doing nothing. Measured on a screenshot, not guessed. */
  }{receipt.flag && <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}><span style={{ width: 1, height: 14, background: T.inkFaint, opacity: 0.35 }} /><span
    data-testid="receipt-flag"
    style={{ display: "flex" }}
  >{
    /* The same FlagEmoji every other flag in this app is, cut to a
       disc: shape="circle" squares the box, rounds it to half the
       box, and paints the rim as an inset shadow so no straight
       edge or corner of the source image survives the crop.
       It was a rounded rectangle here until the receipt was asked
       for a circular flag specifically. The cost of the disc is
       real and worth naming: fit stays "cover", so a 3:2 flag is
       filled to the circle and its left and right thirds are cropped
       away — for Kuwait, Sudan, the UAE that is the hoist emblem.
       "contain" would keep the whole flag but letterbox it, and a
       letterboxed flag puts its own rectangular edges back inside
       the disc, which is the thing the circle exists to remove.
       Filling wins here because the counterparty's country is also
       written out on the receipt; the flag is a mark, not the only
       label. Diameter is 26 — the old chip's height, so the pill
       track it sits in does not change height. Drop shadow is
       registration's, unchanged.
       Never the emoji character: on any platform without flag
       glyphs (Windows above all) it is not a flag at all — it is
       the two regional-indicator letters, "GB", sitting where a
       flag should be. FlagEmoji loads the real asset and falls back
       to the character only when that fails. */
  }<FlagEmoji
    flag={receipt.flag}
    shape="circle"
    size={26}
    fit="cover"
    dropShadow="drop-shadow(0 2px 6px rgba(76,29,149,0.20))"
  /></span><span style={{ width: 1, height: 14, background: T.inkFaint, opacity: 0.35 }} /></span>}{(trailingTab !== "share" || hasShareEvent) && <ReceiptTabButton
    label={tabLabel(trailingTab)}
    active={trailingTab === "share" ? onShareTab : !onShareTab}
    onSelect={() => setReceiptTab(trailingTab)}
  />}</div>{!onShareTab ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{
    /* Box 1 — who it's to/from, and their Gloobal ID if there is one.
       The flag no longer hangs off this box's top edge: it is on the
       tab row above, once for the whole receipt. The top padding is
       back to 14 because there is nothing overlapping it any more. */
  }<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 14px 12px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><ReceiptRow
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
  }<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 14px 12px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><ReceiptRow label={shareIsCredit ? "Shared back to" : "You shared back to"} value={shareIsCredit ? "You" : receipt.name} />{
    /* Who the other side of the share is, by name and by ID.
       The Payment tab has carried the counterparty's Gloobal ID since it
       was built; this tab named a person and stopped there, so the Creator
       Share receipt was the one document in the app that identified someone
       by display name alone. A name is not an identifier — two people share
       one, and it is not what you would quote to support or paste into Send
       Money. The ID is.

       When I RECEIVED the payment, the row above already names the person I
       shared back to, and the ID goes straight under it. When I SENT it, the
       row above says "You" — the share came back to me — so the counterparty
       needs naming before their ID can be attached to anything. Hence the
       extra row in that direction only: receipt.id belongs to receipt.name in
       both cases, and it must sit under the row that names them, never under
       "You". */
  }{shareIsCredit && <ReceiptRow label="Shared back by" value={receipt.name} />}{receipt.id && <ReceiptRow
    testId="receipt-share-counterparty-id"
    label={<GloobalWordmark suffix=" ID" />}
    value={<ColoredGloobalId id={receipt.id} />}
    mono
  />}</div><div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><ReceiptRow
    label="Creator Share rate"
    value={displayShareRate == null ? "\u2014" : `${displayShareRate.toFixed(2)}%`}
    accent
  />{
    /* Credit when I sent (the receiver shares back to me),
       debit when I received (I share back to them) — same
       direction as the hero figure above, always my own
       currency. */
  }<ReceiptRow
    label="Amount"
    value={`${shareIsCredit ? "+" : "\u2212"}${fmtMoney(shareAmount, shareCurrency)}`}
    accent
  /></div><div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><ReceiptRow
    label="From payment"
    value={paymentKnown ? fmtMoney(paymentAmount, paymentCurrency) : "Not on this device"}
    testId="receipt-share-from-payment"
  /><ReceiptRow label="Date" value={receipt.date} /><ReceiptRow label="Time" value={receipt.time} mono /></div></div>}{
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
  >{copied ? <Check size={13} color={T.positive} /> : <Copy size={13} color={T.inkSoft} />}</button><div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "monospace", fontSize: 14, fontWeight: 800, maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{rawTxnId.split("").map((ch, i) => <span key={i} style={{ flexShrink: 0, color: POSITION_COLORS[(i + txnColorOffset) % POSITION_COLORS.length], transition: "color 0.4s ease" }}>{ch}</span>)}</div></div>}{
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

