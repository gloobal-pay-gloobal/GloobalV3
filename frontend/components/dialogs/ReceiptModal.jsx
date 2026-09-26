// src/components/dialogs/ReceiptModal.jsx
import { useState as useState11, useEffect as useEffect10 } from "react";
import {
  Copy,
  Check,
  Share2,
  FileText,
  Eye,
  RefreshCw as RefreshCw7
} from "lucide-react";


// src/components/dialogs/ReceiptModal.jsx

// The ticket's head, in the direction the money went.
//
// Money OUT is the app's own violet; money IN — a payment received, a
// Creator Share credited — is green. The figure sits on the gradient in
// white rather than in T.negative/T.positive, so the direction is carried by
// the whole head of the document instead of by the colour of six characters.
var RECEIPT_HERO_OUT = "linear-gradient(135deg,#312E81 0%,#4F46E5 55%,#7C3AED 100%)";
var RECEIPT_HERO_IN = "linear-gradient(135deg,#064E3B 0%,#047857 55%,#0FA372 100%)";

// The perforation between the head and the rows.
//
// Two half-discs bitten out of the ticket's sides and a dashed rule between
// them. The discs are painted in the colour BEHIND the ticket, which is the
// only thing making them read as holes rather than as dots.
function ReceiptTicketTear() {
  const notch = {
    position: "absolute",
    top: -8,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: T.bg
  };
  return <div style={{ position: "relative", height: 16, background: T.surface }} aria-hidden="true"><span style={{ position: "absolute", left: 10, right: 10, top: 7, borderTop: `2px dashed ${T.line}` }} /><span style={{ ...notch, left: -8 }} /><span style={{ ...notch, right: -8 }} /></div>;
}

// A section heading inside the ticket — WHO, MONEY, PROOF — with room at the
// right for the one stamp the section carries.
//
// The stamp used to be absolutely positioned over the rows, where it landed
// on top of the first value it met (the counterparty's name, the payment
// figure). It sits on this line instead, which is the one line in the block
// with nothing on its right.
function ReceiptSectionLabel({ children, stamp, stampColor }) {
  return <div
    className="rcpt-sec"
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 0 2px", fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: T.inkFaint, textTransform: "uppercase" }}
  ><span>{children}</span>{stamp && <span
    style={{
      transform: "rotate(-7deg)",
      border: `2px solid ${stampColor}`,
      color: stampColor,
      borderRadius: 9,
      padding: "3px 8px",
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: 1.3,
      opacity: 0.9
    }}
  >{stamp}</span>}</div>;
}

// One of the three things you can do with a finished receipt. Icon over a
// one-word label, because the row has to hold three of them across a phone
// and "Audit report (PDF)" spelled out took a full-width button of its own.
function ReceiptIconAction({ icon, label, onClick, solid, disabled, testId, busy, ariaLabel }) {
  return <button
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    aria-label={ariaLabel}
    aria-busy={busy ? true : void 0}
    className="v2-tap"
    style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      padding: "10px 4px",
      borderRadius: 18,
      border: solid ? "none" : `1px solid ${T.line}`,
      background: solid ? T.gradButton : T.surface,
      color: solid ? "#fff" : T.inkSoft,
      fontSize: 10.5,
      fontWeight: 800,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.55 : 1,
      boxShadow: solid ? "0 8px 20px -14px rgba(76,29,149,0.9)" : T.shadowCard
    }}
  >{icon}<span>{label}</span></button>;
}

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

function ReceiptModal({ receipt, onClose, onDone, onRevealShare, shareTabRequest }) {
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
  // "Working", not "done": the share sheet can be dismissed, and a button
  // that flipped to a success state on tap would claim the report had gone
  // somewhere when the person had just cancelled it.
  const [auditBusy, setAuditBusy] = useState11(false);
  // The receipt-image share. Busy while the picture is drawn and handed to
  // the share sheet (the button is disabled meanwhile, so a double tap cannot
  // draw two); `shareFeedback` is the one line saying what happened.
  const [imageShareBusy, setImageShareBusy] = useState11(false);
  const [shareFeedback, setShareFeedback] = useState11("");
  // The link share's own tick, apart from the Transaction ID copy's.
  // Who is looking at this receipt: their Gloobal ID for the image's
  // "Sent by / Received by" line. Read from the stored session, the same
  // place every other screen asks.
  const viewerSymbolId = useCurrentSymbolId();
  // No counterparty photo is read here any more.
  //
  // It used to call the server by the other party's Gloobal ID to fetch their
  // picture, and draw it beside their name. Two reasons it is gone, and the
  // second is the one that settled it:
  //
  //   A receipt is a record, and this one is shared — as a link and as a PNG.
  //   A face is the single thing on it that is not a fact about the payment,
  //   and it travels further than the sender means it to.
  //   The fallback was worse than the photo. Where there was no picture the
  //   component drew a brand-gradient disc, so the largest mark on the block
  //   carried nothing at all and was there only because the layout had a
  //   hole shaped like a face.
  //
  // profileAvatar.jsx stays — the scan card and the dashboard still use it.
  // What is removed is this screen's request for it.
  useEffect10(() => {
    if (receipt) {
      setReceiptTab(receipt.kind === "share" ? "share" : "payment");
      setReportSubmitted(false);
      setShareFeedback("");
    }
  }, [receipt]);
  // "View Creator Share receipt", from the card that has just been scratched.
  //
  // A counter rather than a boolean, because the request can be made more than
  // once in a receipt's life and a boolean that is already true fires nothing.
  // Zero — the initial value — is not a request, so a receipt that opens with
  // no reveal behind it is unaffected.
  useEffect10(() => {
    if (shareTabRequest) setReceiptTab("share");
  }, [shareTabRequest]);
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
  // A Gloobal Coin buy, sell or send.
  //
  // It reaches this component through the same door as a payment and reuses
  // everything that already fits: the hero figure, the counterparty box
  // (`name`/`id`, filled by coinReceipt.js so that box needs no third
  // shape), the date/time/status box, and the audit report. What it adds is
  // one block — the holder, and the other side of the exchange — because a
  // coin buy is the one movement here whose two legs are in different units
  // and whose counterparty is not a person.
  //
  // It gets no Creator Share tab, and not by a special case: hasShareEvent
  // below reads a rate and a share reference, and coinReceipt.js states both
  // as absent rather than leaving them undefined, precisely so a coin
  // receipt opened after a payment cannot inherit the previous one's.
  const isCoinReceipt = receipt.kind === "coin";
  const coinRateLine = isCoinReceipt ? coinRateSentence(receipt) : null;

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
  // A coin movement is not a payment and must not be labelled as one. It has
  // no second tab either — the chip is the document's own name, which is the
  // only thing left for it to say.
  const tabLabel = (tab) => (tab === "share"
    ? "Creator Share"
    : receipt.kind === "coin" ? (receipt.title || "Gloobal Coin") : "Payment");

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
  // Two documents, or one.
  //
  // One tab is not a toggle — it is a button that does nothing, restating the
  // line already beside it. A coin movement carries no Creator Share by
  // construction, and neither does a payment at 0%, so both get their
  // document's name in the header instead of a pill with a single segment.
  // Is there a share to reveal, and is anyone offering to reveal it?
  //
  // Both halves matter. `hasShareEvent` is the payment's own answer — a payee
  // who shares nothing back has nothing behind a coupon, and a button
  // promising otherwise is a lie the scratch card would have to tell. And
  // `onRevealShare` is only passed by the screen that has just paid: from
  // History the share is simply on its tab, which is what "it reveals itself
  // quietly" means for somebody who walked away.
  const canReveal = typeof onRevealShare === "function" && hasShareEvent;
  // While the coupon is still unopened the receipt keeps the share to itself:
  // no Creator Share tab, and no "Creator share 2.78₹ back" on the head. A
  // coupon over a figure printed two inches above it is not a coupon.
  const showReceiptTabs = !isCoinReceipt && hasShareEvent && !canReveal;

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
  // Which currency the hero figure is in, and whether saying so adds
  // anything. See the note beside the line that draws it.
  //
  // Whether fmtMoney already ends in the code is a property of the CURRENCY,
  // not of the amount — it appends the code exactly for those with no symbol
  // of their own — so it is probed with a fixed 1 rather than with the hero
  // figure. That keeps this independent of where the hero amounts are worked
  // out further down the component.
  const heroCurrencyRaw = onShareTab ? receipt.currencyCode : (paymentKnown ? paymentCurrency : null);
  const heroCurrencyCode = heroCurrencyRaw &&
    !String(fmtMoney(1, heroCurrencyRaw)).endsWith(String(heroCurrencyRaw))
    ? String(heroCurrencyRaw)
    : "";
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
  // What the share tab DISPLAYS.
  //
  // On a PAYMENT receipt the row carries the share the server actually
  // recorded (the share leg's amount straight after paying, cashbackCredit /
  // cashback on a restored row), and that figure wins. The multiplication
  // above is only the fallback for a receipt with no recorded share — a
  // payment this device settled locally — because it rounds differently from
  // the server's minor-unit figure. A recorded 0 counts as "not recorded":
  // every builder defaults an absent share to 0, and a 0% payment has no
  // share tab to show it on anyway.
  const recordedShareAmount = Number(receipt.shareAmount);
  const shownShareAmount = !isShareReceipt && Number.isFinite(recordedShareAmount) && recordedShareAmount > 0
    ? recordedShareAmount
    : shareAmount;
  // The rate to DISPLAY. On a share receipt it comes off the payment, for
  // the reason historyUtils spells out: the share row's own rate is zeroed
  // at the boundary by design, so reading it here would print 0.00%.
  // ── What this transaction was exchanged at ─────────────────────────────
  //
  // Drawn only when the two sides really are different currencies. A
  // "conversion" block on a domestic payment showing 1.000000 states that an
  // exchange took place, and none did.
  //
  // Every figure is a recorded one: the server stores the receiver's face
  // value, the sender's own debit, and the rate, as three separate facts.
  // Multiplying one by another to fill in the third would give a number that
  // disagrees with the ledger by a rounding unit, and a receipt whose halves
  // do not reconcile is worse than one that shows a single side.
  //
  // The rate is stated in the direction it was RECORDED: 1 unit of the
  // receiver's currency into the sender's. Inverting it would read more
  // naturally to a sender ("1 USD = 83.61 INR" rather than "1 INR = 0.011960
  // USD") and that is exactly why it is not done. An inverted rate is a
  // computed rate: it rounds, so it would not match the figure on the record,
  // and somebody reconciling this receipt against a statement would find two
  // rates for one payment.
  //
  // Read through receiptCurrency.js, the same functions the shared picture
  // and the audit PDF use, so the three cannot disagree about whether this
  // transaction crossed a currency. On a Creator Share receipt the payment is
  // the SOURCE payment, not this row — the share row carries no conversion of
  // its own, and reading it here is why the Payment tab of every share
  // receipt used to look domestic.
  const paymentConversion = paymentKnown ? receiptPaymentConversion(receipt) : null;
  // And the share's own two sides: what the payee gave, in their currency,
  // and what the payer got, in theirs. The Creator Share tab showed only the
  // viewer's side of a movement that had two.
  const shareConversion = receiptShareConversion(receipt);

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
  // The words that travel with the picture.
  //
  // Built from the TAB's receipt, not the raw row, so the summary and the
  // image describe the same movement. They did not before: the picture was
  // built per tab and this text was not, so sharing a payment's Creator Share
  // tab sent a picture of the share captioned with the payment's figure.
  //
  // `for` is the per-tab receipt; rawTxnId is already per-tab.
  const receiptShareSummary = (For) => {
    const r = For || receipt;
    const sent = r.direction === "sent";
    const money = fmtMoney(Number(r.amount || 0), r.currencyCode);
    const who = r.name ? `${sent ? "To" : "From"}: ${r.name}${receiptCountryName ? ` (${receiptCountryName})` : ""}` : "";
    return [
      `Gloobal receipt - ${sent ? "money sent" : "money received"}`,
      money,
      who,
      `${r.date || ""}${r.time ? ` \u00b7 ${r.time}` : ""}`,
      `Transaction ID: ${rawTxnId}`
    ].filter(Boolean).join("\n");
  };
  // Text and link only. This is no longer a button — it is what runs when the
  // picture could not be drawn, so that a failure still sends the receipt
  // rather than nothing.
  const handleShareTxnId = () => {
    if (!rawTxnId) return;
    const text = receiptShareSummary(imageReceiptForTab());
    // The clipboard fallback copies the WHOLE receipt including the link,
    // rather than the bare id it used to leave behind.
    shareOrCopy(
      { title: "Gloobal receipt", text, url: receiptShareUrl },
      `${text}\n${receiptShareUrl}`,
      () => setShareFeedback("Receipt and link copied.")
    );
  };
  // ── Share the receipt as a PICTURE ─────────────────────────────────────
  //
  // The Share button on the amount card hands the phone's share sheet a PNG
  // of the receipt (features/receipts/receiptImage.js) — the thing people
  // actually forward after paying someone — or downloads it where a browser
  // cannot share files. The text-and-link share above is still one tap away
  // on the Transaction ID box, and is what runs if drawing the image fails.
  //
  // The image describes the TAB being looked at, the same rule the link
  // follows: a payment receipt's Creator Share tab shares the share, not the
  // payment it came from, and vice versa on a share receipt. Every figure on
  // the derived documents below is one this component already shows on that
  // tab; nothing new is computed for the picture.
  const imageReceiptForTab = () => {
    if (isCoinReceipt || onShareTab === isShareReceipt) return receipt;
    // The payment's conversion is dropped from a derived share document (a
    // share is not a conversion of its payment). The share's own two sides —
    // shareSender* / shareReceiver* / shareFxRate — ride along untouched on
    // the spread, and the picture reads those for a share.
    const noConversion ={ senderAmount: null, senderSideCurrency: null, receiverAmount: null, receiverSideCurrency: null, fxRate: null };
    if (onShareTab) {
      return {
        ...receipt,
        ...noConversion,
        // Resolved BEFORE the payment's fields are stripped: on a receipt
        // shown straight after paying, the share's rate is the payment's own
        // recorded one, and it is read off those fields (receiptShareFxRate).
        shareFxRate: receiptShareFxRate(receipt),
        kind: "share",
        direction: shareIsCredit ? "received" : "sent",
        amount: shownShareAmount,
        shareAmount: shownShareAmount,
        currencyCode: shareCurrency,
        txnId: shareSideTxnId,
        receiptCode: receipt.shareReceiptCode || ""
      };
    }
    if (!paymentKnown) return receipt;
    // The payment tab of a share receipt: the conversion is the SOURCE
    // payment's recorded one, the same figures this tab draws on screen.
    return {
      ...receipt,
      ...noConversion,
      senderAmount: receipt.sourceSenderAmount ?? null,
      senderSideCurrency: receipt.sourceSenderSideCurrency || null,
      receiverAmount: receipt.sourceReceiverAmount ?? null,
      receiverSideCurrency: receipt.sourceReceiverSideCurrency || null,
      fxRate: receipt.sourceFxRate ?? null,
      kind: "payment",
      direction: paymentIsSent ? "sent" : "received",
      amount: paymentAmount,
      currencyCode: paymentCurrency,
      txnId: paymentSideTxnId,
      receiptCode: receipt.sourceReceiptCode || ""
    };
  };
  const handleShareReceiptImage = async () => {
    if (imageShareBusy) return;
    setImageShareBusy(true);
    setShareFeedback("");
    let outcome = "failed";
    try {
      const session = typeof gloobalSessionLoad === "function" ? gloobalSessionLoad() : null;
      const storedName = session && session.user && typeof session.user.fullName === "string" ? session.user.fullName.trim() : "";
      // Accounts made before the name step carry their mobile number as
      // fullName; a phone number is not a name to print on a shared picture.
      const viewerName = storedName && !/^\+?\d[\d\s-]*$/.test(storedName) ? storedName : "";
      // No photo is passed, and receiptImage.js no longer fetches one of its
      // own. The shared picture carries the payment and nobody's face.
      // ONE share, carrying both halves. The picture and the /t/ link go out
      // in a single sheet; there is no second share button any more.
      //
      // No `summary`. It used to ride along, and it repeated — line for line
      // — what the picture already prints: the amount, the counterparty, the
      // date, the Transaction ID. One receipt arrived twice in the same
      // message, once as a document and once as plain text under it. The
      // picture carries the payment and the branding; the link carries where
      // it leads. receiptShareSummary still exists for handleShareTxnId,
      // which runs only when there is no picture to send.
      const tabReceipt = imageReceiptForTab();
      outcome = await shareReceiptImage(tabReceipt, {
        viewerName,
        viewerSymbolId: viewerSymbolId || "",
        link: receiptShareUrl
      });
    } catch (e) {
      outcome = "failed";
    } finally {
      setImageShareBusy(false);
    }
    if (outcome === "shared") setShareFeedback(receiptShareUrl ? "Receipt and link shared." : "Receipt shared.");
    // Said out loud rather than swallowed: some share targets refuse a link
    // alongside a file, and a person who expected both should be told which
    // one went, not left to discover it in the chat they sent it to.
    else if (outcome === "shared-without-link") setShareFeedback("Receipt shared. This app wouldn't take the link with it — use Copy to send it.");
    else if (outcome === "downloaded-link-copied") setShareFeedback("Receipt saved to your downloads, and the link copied.");
    else if (outcome === "downloaded") setShareFeedback("Receipt image saved to your downloads.");
    else if (outcome === "cancelled") setShareFeedback("");
    else {
      // Only a real failure falls back to the text and link — a person who
      // dismissed the share sheet did not ask for a second one.
      setShareFeedback("Couldn't make the receipt image, so the receipt link was shared instead.");
      handleShareTxnId();
    }
  };
  // ── Pay again ──────────────────────────────────────────────────────────
  //
  // The same counterparty, a blank amount. Blank rather than prefilled with
  // the figure just paid: the second payment to somebody is not usually the
  // same size as the first, and a form that opens holding a number is a form
  // that gets sent holding it. Everything else about them — name, Gloobal ID,
  // country, their Creator Share rate — is carried over, which is the part
  // that is tedious to type and the part this button exists to save.
  //
  // Announced rather than called: this component is mounted from Send Money,
  // from History and from the Coin screen, and only App.jsx knows how to open
  // Send Money on a payee. It listens for this event (openSendToPayee).
  //
  // The receipt is closed FIRST and the event fires after that turn, because
  // App.jsx clears a pending payee whenever the send screen is not the open
  // one — dispatching before the close would hand it a payee and then wipe it.
  const canPayAgain = !isCoinReceipt && !!receipt.id && receipt.status !== "simulated";
  const handlePayAgain = () => {
    if (!canPayAgain) return;
    const detail = {
      gloobalId: receipt.id,
      name: receipt.name || "",
      mobileNumber: receipt.phone || "",
      countryIso: receipt.counterpartyIso || null,
      shareRate: Number(receipt.shareRate) || 0
    };
    (onDone || onClose)();
    if (typeof window !== "undefined") {
      setTimeout(() => window.dispatchEvent(new CustomEvent("gloobal:payAgain", { detail })), 0);
    }
  };
  // Which way the money went on the tab being read, and therefore which head
  // the ticket wears. `tint` still exists above and still colours the rate
  // and the share figures in the rows; it is the hero that stopped using it.
  const heroIsCredit = onShareTab ? shareIsCredit : !paymentIsSent;
  const heroGradient = heroIsCredit ? RECEIPT_HERO_IN : RECEIPT_HERO_OUT;
  const stampColor = receipt.status === "pending" || receipt.status === "simulated" ? "#B45309" : T.positive;
  const paymentStamp = receipt.status === "pending"
    ? "PENDING"
    : receipt.status === "simulated" ? "NOT SENT" : "COMPLETED";
  const shareStamp = shareIsCredit ? "CREDITED" : "SHARED";
  const ticketStamp = onShareTab ? shareStamp : paymentStamp;
  // The line under the figure. On the payment tab it names the share the
  // payment carried; on the share tab, the rate it came from. Drawn only when
  // there is really one — see hasShareEvent.
  const heroChip = onShareTab
    ? (displayShareRate == null ? "" : `${receipt.name || "They"} share${/s$/i.test(String(receipt.name || "")) ? "" : "s"} ${displayShareRate.toFixed(2)}% of every payment`)
    : (hasShareEvent && !canReveal && shownShareAmount > 0
      ? `Creator share ${fmtMoney(shownShareAmount, shareCurrency)} ${shareIsCredit ? "back" : "shared"}`
      : "");
  const dateTimeValue = [receipt.date, receipt.time].filter(Boolean).join(" \xB7 ");
  return <div
    role="dialog"
    aria-modal="true"
    aria-label="Transaction receipt"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 500,
      background: T.bg,
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center",
      animation: "receipt-overlay-in 0.2s ease"
    }}
  >{
    /* A SCREEN, not a bottom sheet.
       It was a sheet at 88vh with a grab handle and a dimmed backdrop you
       could tap to dismiss. A receipt is a document people read top to
       bottom, switch tabs on and send to somebody — and at 88vh the last
       thing on it was always half under the fold.
       The backdrop tap went with it. There is no "outside" on a full screen,
       and a dismiss gesture with nothing visible to aim at is a way to lose
       a receipt by accident. Back is the way out, and it is drawn. */
  }<style>{`
        @keyframes receipt-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes receipt-sheet-up { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .rcpt-rows > div:not(.rcpt-sec):not(.rcpt-sub) { padding: 7px 0; border-bottom: 1px solid ${T.line}; }
        .rcpt-sub > div { padding: 7px 0; border-bottom: 1px solid ${T.line}; }
        .rcpt-rows > div:not(.rcpt-sec):last-child, .rcpt-sub > div:last-child { border-bottom: none; }
        .rcpt-rows .rcpt-note { border-bottom: none; }
      `}</style><div
    style={{
      width: "100%",
      maxWidth: 430,
      height: "100%",
      background: T.bg,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      animation: "receipt-sheet-up 0.24s cubic-bezier(.32,.72,0,1)"
    }}
  >{
    /* Header: back, and the two tabs. No "Receipt" word — the tab that is
       lit says which document you are on, and it says it in the one place
       you can also change it from. A title above a toggle repeated the
       toggle's job and took a line to do it. */
  }<div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "calc(10px + env(safe-area-inset-top, 0px)) 12px 8px",
      flexShrink: 0
    }}
  >{
    /* The app's one back button, not a second one drawn here. Same circle,
       same glyph, same size as the twenty other screens that have one —
       navButtons.jsx exists because there used to be several. */
  }<NavBackButton onClick={onClose} />{
    /* A COIN receipt has one document, so it gets a name rather than a
       toggle: a lone tab is not a toggle, it is a button that does nothing.
       Everything else gets Payment and — when the payment really carried a
       share — Creator Share. */
  }{showReceiptTabs ? <div style={{ display: "flex", flex: 1, gap: 4, padding: 3, borderRadius: 999, background: T.surfaceAlt, boxShadow: "inset 0 1px 2px rgba(76,29,149,0.06)" }}><ReceiptTabButton
    label={tabLabel(leadingTab)}
    active={leadingTab === "share" ? onShareTab : !onShareTab}
    onSelect={() => setReceiptTab(leadingTab)}
  /><ReceiptTabButton
    label={tabLabel(trailingTab)}
    active={trailingTab === "share" ? onShareTab : !onShareTab}
    onSelect={() => setReceiptTab(trailingTab)}
  /></div> : <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{tabLabel(leadingTab)}</span>}</div>{
    /* The document. It scrolls if it has to, but the whole point of the
       tighter rows is that on an ordinary payment it does not have to: one
       screen, one screenshot. */
  }<div style={{
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      padding: "4px 12px calc(10px + env(safe-area-inset-bottom, 0px))",
      display: "flex",
      flexDirection: "column",
      gap: 10
    }}
  ><div
    data-testid="receipt-ticket"
    style={{
      background: T.surface,
      borderRadius: T.radiusXl,
      overflow: "hidden",
      position: "relative",
      boxShadow: T.shadowCard
    }}
  >{
    /* ── The head of the ticket ──────────────────────────────────────────
       Our mark in one corner, the counterparty's flag in the other, the
       wordmark between them, and under it the one figure this document is
       about. */
  }<div style={{ padding: "12px 14px 14px", color: "#fff", textAlign: "center", background: heroGradient }}><div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 30, padding: "0 42px" }}><span style={{ position: "absolute", left: 0, top: 0 }}><GH2HFlipCircle size={28} /></span><span style={{ fontSize: 14, letterSpacing: 2.2, fontFamily: T.fontWordmark }}><GloobalWordmark /></span>{
    /* The same FlagEmoji every other flag in this app is, cut to a disc.
       Never the emoji character: on any platform without flag glyphs
       (Windows above all) that is not a flag, it is the two
       regional-indicator letters sitting where a flag should be.
       One flag for the whole document: the person named on the Payment tab
       is the person shared with on the Creator Share tab. */
  }{receipt.flag && <span
    data-testid="receipt-flag"
    style={{ position: "absolute", right: 0, top: 0, display: "flex", borderRadius: "50%", boxShadow: "0 0 0 2px rgba(255,255,255,0.85), 0 2px 8px rgba(20,10,50,0.25)" }}
  ><FlagEmoji
    flag={receipt.flag}
    shape="circle"
    size={28}
    fit="cover"
  /></span>}</div><div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 2.2, opacity: 0.85, marginTop: 9, textTransform: "uppercase" }}>{!onShareTab ? (isCoinReceipt
    ? /* Never "Money received" on a coin buy. Money did not arrive — it
         LEFT, and coin arrived in its place. The hero figure below is the
         coin, so the line above it has to name the exchange rather than
         describe a direction that is true of the coin and false of the
         money. The receipt's own title is that name. */
      receipt.title || "Gloobal Coin"
    : paymentKnown ? (paymentIsSent ? "Money sent" : "Money received") : "Payment not available") : shareIsCredit ? "Creator share earned" : "You share back"}</div><div style={{ marginTop: 1 }}>{!onShareTab ? (paymentKnown ? <div
    style={{
      fontSize: receiptAmountFontSize(`${paymentIsSent ? "\u2212" : "+"}${fmtMoney(paymentAmount, paymentCurrency)}`, 31),
      fontWeight: 800,
      color: "#fff",
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      letterSpacing: -0.5,
      overflowWrap: "anywhere"
    }}
    data-testid="receipt-hero-payment"
  >{paymentIsSent ? "\u2212" : "+"}{fmtMoney(paymentAmount, paymentCurrency)}</div> : <div
    style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.4, padding: "6px 0" }}
    data-testid="receipt-payment-unavailable"
  >{
    /* The payment row is not on this device. Saying so is the only honest
       option: the share and its rate are both known, so the payment COULD
       be reconstructed by division — and that is exactly the figure that
       would be quietly wrong for every share that rounded. */
  }This payment isn't on this device. The Creator Share above is complete.</div>) : <div
    style={{
      fontSize: receiptAmountFontSize(`${shareIsCredit ? "+" : "\u2212"}${fmtMoney(shownShareAmount, shareCurrency)}`, 31),
      fontWeight: 800,
      color: "#fff",
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      letterSpacing: -0.5,
      overflowWrap: "anywhere"
    }}
    data-testid="receipt-hero-share"
  >{shareIsCredit ? "+" : "\u2212"}{fmtMoney(shownShareAmount, shareCurrency)}</div>}{
    /* The currency CODE under the figure.
       fmtMoney draws the symbol, and a symbol is not the currency: ₹ is
       shared by India, Pakistan, Nepal, Sri Lanka and Mauritius, $ by more
       than twenty, and kr by four. On a cross-border receipt — the only kind
       this app makes — "1,106.61₹" alone does not say which rupee left the
       account, and this is the document somebody keeps.
       Suppressed when the formatted figure already ends in the code, which
       is what fmtMoney does for currencies with no symbol of their own. */
  }{heroCurrencyCode && <div
    data-testid="receipt-hero-currency"
    style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: 0.6, marginTop: 1 }}
  >{heroCurrencyCode}</div>}</div>{heroChip && <span
    data-testid="receipt-hero-chip"
    style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,0.18)", fontSize: 10.5, fontWeight: 800 }}
  >{heroChip}</span>}</div><ReceiptTicketTear />{
    /* ── The rows ────────────────────────────────────────────────────────
       Hairlines between them rather than a box around each group, which is
       what lets the whole receipt fit one screen. The section headings do
       the grouping the boxes used to. */
  }<div className="rcpt-rows" style={{ padding: "0 16px 6px" }}>{!onShareTab ? <>{
    /* Who it's to/from, and their Gloobal ID if there is one. */
  }<ReceiptSectionLabel stamp={ticketStamp} stampColor={stampColor}>Who</ReceiptSectionLabel><ReceiptRow
    testId="receipt-counterparty"
    // paymentIsSent, not isSent. This tab describes the PAYMENT, and on a
    // Creator Share receipt `direction` describes the share — so a share Jio
    // sent me read "From Jio" on a tab about money I sent TO Jio.
    label={paymentIsSent ? "To" : "From"}
    value={receipt.name}
  />{receipt.id && <ReceiptRow
    testId="receipt-counterparty-id"
    label={<GloobalWordmark suffix=" ID" />}
    value={<ColoredGloobalId id={receipt.id} />}
    mono
  />}{
    /* The holder, and the other leg of a coin exchange.

       Only on a coin receipt, and it carries the three facts a coin buy
       could not previously answer: who bought it, under which Gloobal ID,
       from which country — none of which the movement itself records, since
       they are properties of the account — and then what the coin cost, in
       real money, at the rate it actually converted at.

       The rate is printed in the direction it was RECORDED. The mint route
       stores GEU-per-fiat and the redeem route stores fiat-per-GEU under the
       same field name; coinRateSentence reads the basis the server now sends
       and writes the matching sentence rather than inverting one into the
       other. Inverting means dividing, and one over a rounded rate is a
       number that does not reproduce the two amounts printed above it. */
  }{isCoinReceipt && <ReceiptSectionLabel>Coin</ReceiptSectionLabel>}{isCoinReceipt && <div
    data-testid="receipt-coin"
    className="rcpt-sub"
  >{receipt.holderName && <ReceiptRow label="Held by" value={receipt.holderName} />}{receipt.holderSymbolId && <ReceiptRow
    label={<GloobalWordmark suffix=" ID" />}
    value={<ColoredGloobalId id={receipt.holderSymbolId} />}
    mono
  />}{receipt.holderCountryName && <ReceiptRow
    label="Country"
    value={receipt.holderCountryName}
    flag={receipt.holderCountryFlag}
  />}{
    /* The fiat leg. Absent on a send, which moves no money at all — and
       absent rather than shown as zero, because a zero here would read as
       "this cost nothing" rather than "no money was involved". */
  }{receipt.fiatAmount != null && receipt.fiatCurrencyCode && <ReceiptRow
    label={receipt.fiatDirection === "out" ? "Paid" : "Received"}
    value={fmtMoney(receipt.fiatAmount, receipt.fiatCurrencyCode)}
  />}<ReceiptRow
    label={receipt.fiatDirection === "out" ? "Coin bought" : receipt.fiatDirection === "in" ? "Coin sold" : "Coin moved"}
    value={`${fmt(receipt.amount)} ${receipt.currencyCode}`}
  />{coinRateLine && <ReceiptRow label="Rate applied" value={coinRateLine} accent />}{coinRateLine && <div className="rcpt-note" style={{ fontSize: 10, fontWeight: 600, color: T.inkFaint, lineHeight: 1.4, paddingTop: 6 }}>{
    /* The same sentence the payment receipt's conversion block carries, for
       the same reason: a rate with no date attached is one the reader takes
       to be today's. */
  }As converted at the time of this transaction, not a current rate.</div>}</div>}{
    /* What this transaction was exchanged at.

       Drawn only when the two sides really are different currencies. A
       "conversion" block on a domestic payment showing 1.000000 states that
       an exchange took place, and none did. Every figure is a recorded one,
       read through receiptCurrency.js so the screen, the shared picture and
       the audit PDF cannot disagree about it. */
  }{paymentConversion && <ReceiptSectionLabel>Money</ReceiptSectionLabel>}{paymentConversion && <div
    data-testid="receipt-conversion"
    className="rcpt-sub"
  ><ReceiptRow
    label="Sender paid"
    value={fmtMoney(paymentConversion.paidAmount, paymentConversion.paidCurrency)}
  /><ReceiptRow
    label="Receiver got"
    value={fmtMoney(paymentConversion.gotAmount, paymentConversion.gotCurrency)}
  />{paymentConversion.rateLabel && <ReceiptRow label="Rate applied" value={paymentConversion.rateLabel} accent />}<div className="rcpt-note" style={{ fontSize: 10, fontWeight: 600, color: T.inkFaint, lineHeight: 1.4, paddingTop: 6 }}>{
    /* A rate with no date attached is a rate the reader assumes is today's.
       This one is the rate the payment settled at, and saying so is the
       difference between a record and an estimate. */
  }As settled at the time of this transaction, not a current rate.</div></div>}<ReceiptSectionLabel>Proof</ReceiptSectionLabel>{receipt.method && <ReceiptRow label="Method" value={receipt.method} />}<ReceiptRow label={"Date \xB7 Time"} value={dateTimeValue} /></> : <>{
    /* The Creator Share's own document: the arithmetic, where it went, and
       who it came from. Rate and amount are shown even at 0 rather than the
       tab disappearing — a 0% share is still a real, reportable outcome. */
  }<ReceiptSectionLabel stamp={ticketStamp} stampColor={stampColor}>How it was worked out</ReceiptSectionLabel><ReceiptRow
    label="From payment"
    value={paymentKnown ? fmtMoney(paymentAmount, paymentCurrency) : "Not on this device"}
    testId="receipt-share-from-payment"
  /><ReceiptRow
    label="Creator Share rate"
    value={displayShareRate == null ? "\u2014" : `${displayShareRate.toFixed(2)}%`}
    accent
  />{
    /* Credit when I sent (the receiver shares back to me), debit when I
       received (I share back to them) — same direction as the figure above,
       always my own currency, since it is always my account the share
       settles into or out of. */
  }<ReceiptRow
    label={shareIsCredit ? "Your share" : "You shared"}
    value={`${shareIsCredit ? "+" : "\u2212"}${fmtMoney(shownShareAmount, shareCurrency)}`}
    accent
  />{
    /* The share's own currency conversion, when it crossed one.

       The payee gives the share in their currency and the payer gets it in
       theirs; both figures are recorded, and the rate is the payment's own.
       Absent on a same-currency share, and absent — rather than worked out —
       when either side was never recorded (a legacy row, or the receipt shown
       straight after paying, whose response carries only the payer's side). */
  }{shareConversion && <ReceiptSectionLabel>Conversion</ReceiptSectionLabel>}{shareConversion && <div
    data-testid="receipt-share-conversion"
    className="rcpt-sub"
  ><ReceiptRow
    label="Share given"
    value={fmtMoney(shareConversion.paidAmount, shareConversion.paidCurrency)}
  /><ReceiptRow
    label="Share received"
    value={fmtMoney(shareConversion.gotAmount, shareConversion.gotCurrency)}
  />{shareConversion.rateLabel && <ReceiptRow label="Rate applied" value={shareConversion.rateLabel} accent />}<div className="rcpt-note" style={{ fontSize: 10, fontWeight: 600, color: T.inkFaint, lineHeight: 1.4, paddingTop: 6 }}>
      As settled at the time of this transaction, not a current rate.
    </div></div>}<ReceiptSectionLabel>Where it went</ReceiptSectionLabel><ReceiptRow label={shareIsCredit ? "Credited to" : "Taken from"} value="Gloobal balance" /><ReceiptRow label={"Date \xB7 Time"} value={dateTimeValue} /><ReceiptSectionLabel>Who</ReceiptSectionLabel><ReceiptRow label={shareIsCredit ? "Shared back to" : "You shared back to"} value={shareIsCredit ? "You" : receipt.name} />{
    /* Who the other side of the share is, by name and by ID.

       When I RECEIVED the payment, the row above already names the person I
       shared back to. When I SENT it, the row above says "You" — the share
       came back to me — so the counterparty needs naming before their ID can
       be attached to anything. Hence the extra row in that direction only:
       receipt.id belongs to receipt.name in both cases, and it must sit under
       the row that names them, never under "You". */
  }{shareIsCredit && <ReceiptRow label="Shared back by" value={receipt.name} />}{receipt.id && <ReceiptRow
    testId="receipt-share-counterparty-id"
    label={<GloobalWordmark suffix=" ID" />}
    value={<ColoredGloobalId id={receipt.id} />}
    mono
  />}</>}{
    /* Transaction ID — twenty symbols in one row, inside a dashed box at the
       foot of the ticket. Each tab shows ITS OWN reference: the payment and
       its Creator Share are two movements between two different pairs of
       parties, and the server mints each with its own. There is no fallback
       to the other one's — a blank looks broken, but printing the payment's
       id on the share tab is a false statement about which transaction you
       are holding. */
  }{rawTxnId && <div
    className="rcpt-note"
    style={{
      position: "relative",
      margin: "8px 0 4px",
      padding: "8px 10px 9px",
      borderRadius: 14,
      border: `1px dashed ${T.line}`
    }}
  >{
    /* The label, the copy control and the symbols are three DIRECT children
       of this box, and that is load-bearing rather than incidental: the
       browser tests find the reference by looking for the label and then for
       the monospace row inside the label's own parent. Nesting the label with
       the button in a flex row of their own hid the symbols from that walk —
       and from anything else reading the receipt structurally. */
  }<span style={{ display: "block", textAlign: "center", fontSize: 9, fontWeight: 800, color: T.inkFaint, letterSpacing: 1.5, textTransform: "uppercase" }}>{showingShare ? "Share transaction ID" : "Transaction ID"}</span><button
    onClick={handleCopyTxnId}
    aria-label="Copy transaction ID"
    className="v2-tap"
    style={{
      position: "absolute",
      top: 4,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: "50%",
      border: "none",
      background: "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0
    }}
  >{copied ? <Check size={12} color={T.positive} /> : <Copy size={12} color={T.inkFaint} />}</button><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, marginTop: 5, fontFamily: "monospace", fontSize: 12.5, fontWeight: 800 }}>{rawTxnId.split("").map((ch, i) => <span key={i} style={{ flexShrink: 0, color: POSITION_COLORS[(i + txnColorOffset) % POSITION_COLORS.length], transition: "color 0.4s ease" }}>{ch}</span>)}</div></div>}</div></div>{
    /* Simulated payments say so outside the ticket, not inside it: the
       ticket is the record, and this is a warning about the record. */
  }{receipt.status === "simulated" && <div
    role="alert"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 12px",
      borderRadius: 12,
      background: "#FEF3C7",
      border: "1px solid #F5D68A",
      color: "#8A5A00",
      fontSize: 11.5,
      fontWeight: 700,
      lineHeight: 1.35
    }}
  ><span aria-hidden="true">⚠️</span><span>This recipient wasn't a registered Gloobal account, so nothing was actually sent — this receipt reflects a local simulation only.</span></div>}{shareFeedback && <div
    role="status"
    data-testid="receipt-share-feedback"
    style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textAlign: "center", lineHeight: 1.4 }}
  >{shareFeedback}</div>}{
    /* Provenance & complaint window — each viewer only ever sees their OWN
       resolved city/state (never the other party's), plus a short, explicit
       window to report an issue. Reporting opens a case; it never reverses
       money or flags fraud automatically. */
  }{complaintWindow && <div
    style={{
      padding: "12px 14px",
      borderRadius: T.radiusMd,
      background: T.surface,
      border: `1px solid ${T.line}`,
      display: "flex",
      flexDirection: "column",
      gap: 8
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
          </p>}</div>}{
    /* Audit, Share, Pay again — three icons rather than three sentences.
       There is no Done: back is the only way out of a document, and a second
       control that does the same thing is a decision nobody asked to make. */
  }<div style={{ display: "flex", gap: 9 }}><ReceiptIconAction
    testId="receipt-audit-report"
    icon={<FileText size={20} color={T.accent} />}
    label={auditBusy ? "Preparing…" : "Audit"}
    disabled={auditBusy}
    busy={auditBusy}
    onClick={async () => {
      if (auditBusy) return;
      setAuditBusy(true);
      try {
        await shareAuditReport(receipt, { generatedAt: formatAuditTimestamp() });
      } finally {
        setAuditBusy(false);
      }
    }}
  /><ReceiptIconAction
    testId="receipt-share-image"
    ariaLabel="Share receipt image"
    icon={<Share2 size={20} color={T.accent} />}
    label="Share"
    disabled={imageShareBusy}
    busy={imageShareBusy}
    onClick={handleShareReceiptImage}
  />{canPayAgain && <ReceiptIconAction
    testId="receipt-pay-again"
    icon={<RefreshCw7 size={20} color="#fff" />}
    label={paymentIsSent ? "Pay again" : "Pay back"}
    solid
    onClick={handlePayAgain}
  />}</div>{
    /* Reveal my share.
       Offered only when this payment really carried a Creator Share, and only
       while it is still a surprise — `onRevealShare` is passed by the screen
       that has just paid, and never by History, so a receipt reopened a week
       later simply has its Creator Share tab and no coupon.
       It sits UNDER the receipt rather than on it: the receipt is a record and
       is complete without this. This is the part that is for fun. */
  }{canReveal && <button
    onClick={onRevealShare}
    data-testid="receipt-reveal-share"
    className="v2-tap"
    style={{
      marginTop: 10,
      width: "100%",
      minHeight: 52,
      borderRadius: 16,
      border: "none",
      background: T.gradButton,
      color: "#fff",
      fontSize: 14.5,
      fontWeight: 800,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 12px 26px -16px rgba(76,29,149,0.9)"
    }}
  ><Eye size={17} aria-hidden="true" />Reveal my share</button>}{canReveal && <div
    style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: T.inkFaint, marginTop: 7, lineHeight: 1.4 }}
  >{`${receipt.name || "They"} share${/s$/i.test(String(receipt.name || "")) ? "" : "s"} a little of every payment back`}</div>}{
    /* What the document is signed with. Same two lines the app opens on. */
  }<div style={{ marginTop: "auto", textAlign: "center", padding: "10px 0 2px" }}><div style={{ fontSize: 11.5, letterSpacing: 1.2, color: T.ink }}><HoomanMark /></div><div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, color: T.inkFaint, marginTop: 4, textTransform: "none" }}>
          Cashless · Taxless · Borderless · Limitless
        </div></div></div></div></div>;
}
