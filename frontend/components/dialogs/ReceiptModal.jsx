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
  const fxSenderCurrency = receipt.senderSideCurrency || null;
  const fxReceiverCurrency = receipt.receiverSideCurrency || null;
  const showsConversion = Boolean(
    fxSenderCurrency && fxReceiverCurrency &&
    fxSenderCurrency !== fxReceiverCurrency &&
    receipt.senderAmount != null && receipt.receiverAmount != null
  );
  // Stated in the direction it was RECORDED: 1 unit of the receiver's
  // currency into the sender's.
  //
  // Inverting it would read more naturally to a sender ("1 USD = 83.61 INR"
  // rather than "1 INR = 0.011960 USD") and that is exactly why it is not
  // done. An inverted rate is a computed rate: it rounds, so it would not
  // match the figure on the record, and somebody reconciling this receipt
  // against a statement would find two rates for one payment. The two amount
  // rows above it carry the intuition; this line carries the fact.
  const fxRateLabel = receipt.fxRate != null && showsConversion
    ? `1 ${fxReceiverCurrency} = ${Number(receipt.fxRate).toFixed(6)} ${fxSenderCurrency}`
    : null;

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
    const noConversion = { senderAmount: null, senderSideCurrency: null, receiverAmount: null, receiverSideCurrency: null, fxRate: null };
    if (onShareTab) {
      return {
        ...receipt,
        ...noConversion,
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
    return {
      ...receipt,
      ...noConversion,
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
      const tabReceipt = imageReceiptForTab();
      outcome = await shareReceiptImage(tabReceipt, {
        viewerName,
        viewerSymbolId: viewerSymbolId || "",
        summary: rawTxnId ? receiptShareSummary(tabReceipt) : "",
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
  return <div
    role="dialog"
    aria-modal="true"
    aria-label="Transaction receipt"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 500,
      background: T.surface,
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center",
      animation: "receipt-overlay-in 0.2s ease"
    }}
  >{
    /* A SCREEN, not a bottom sheet.
       It was a sheet at 88vh with a grab handle and a dimmed backdrop you
       could tap to dismiss. A receipt is a document people read top to
       bottom, scroll back up in, switch tabs on and send to somebody — and
       at 88vh the last thing on it was always half under the fold, with the
       Done button somewhere below that. The two tabs are also a horizontal
       control inside a vertically-swipeable sheet, which is a fight.
       The backdrop tap went with it. There is no "outside" on a full screen,
       and a dismiss gesture with nothing visible to aim at is a way to lose
       a receipt by accident. Back and Done are the two ways out, and both
       are drawn. */
  }<style>{`
        @keyframes receipt-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes receipt-sheet-up { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style><div
    style={{
      width: "100%",
      maxWidth: 430,
      height: "100%",
      background: T.surface,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      animation: "receipt-sheet-up 0.24s cubic-bezier(.32,.72,0,1)"
    }}
  >{
    /* Header: back, title, and nothing else. The share control stays where
       it is, on the amount card, because it shares the TAB you are looking
       at and belongs beside that tab's figure rather than above both. */
  }<div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "calc(10px + env(safe-area-inset-top, 0px)) 12px 10px",
      borderBottom: `1px solid ${T.line}`,
      flexShrink: 0
    }}
  >{
    /* The app's one back button, not a second one drawn here. Same circle,
       same glyph, same size as the twenty other screens that have one —
       navButtons.jsx exists because there used to be several. */
  }<NavBackButton onClick={onClose} /><span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>
      {isShareReceipt ? "Creator Share receipt" : "Receipt"}
    </span></div>{
    /* The document itself. Scrolls between the fixed header and the fixed
       footer, so Done is reachable from anywhere on a long receipt instead
       of being the thing you have to scroll to find. */
  }<div style={{
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      padding: "14px 24px 20px"
    }}
  ><div
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
    onClick={handleShareReceiptImage}
    aria-label="Share receipt image"
    aria-busy={imageShareBusy}
    disabled={imageShareBusy}
    data-testid="receipt-share-image"
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
      cursor: imageShareBusy ? "default" : "pointer",
      opacity: imageShareBusy ? 0.5 : 1,
      zIndex: 1
    }}
  ><Share2 size={13} color={T.inkSoft} /></button><div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, minHeight: onShareTab ? 0 : void 0 }}>{!onShareTab ? (isCoinReceipt
    ? /* Never "Money received" on a coin buy. Money did not arrive — it
         LEFT, and coin arrived in its place. The hero figure below is the
         coin, so the line above it has to name the exchange rather than
         describe a direction that is true of the coin and false of the
         money. The receipt's own title is that name. */
      receipt.title || "Gloobal Coin"
    : paymentKnown ? `${paymentIsSent ? "Money sent" : "Money received"}${receipt.status === "pending" ? " \xB7 Pending" : receipt.status === "simulated" ? " \xB7 Not actually sent" : ""}` : "Payment not available") : shareIsCredit ? <SingleOMark before="Back t" after=" you" /> : "You share back"}</div>{
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
      fontSize: receiptAmountFontSize(`${shareIsCredit ? "+" : "\u2212"}${fmtMoney(shownShareAmount, shareCurrency)}`, 27),
      fontWeight: 800,
      color: tint,
      fontFamily: T.fontDisplay,
      lineHeight: 1.15,
      overflowWrap: "anywhere"
    }}
    data-testid="receipt-hero-share"
  >{shareIsCredit ? "+" : "\u2212"}{fmtMoney(shownShareAmount, shareCurrency)}</div>}{
    /* The currency CODE under the figure.
       fmtMoney draws the symbol, and a symbol is not the currency: \u20b9 is
       shared by India, Pakistan, Nepal, Sri Lanka and Mauritius, $ by more
       than twenty, and kr by four. On a cross-border receipt \u2014 the only kind
       this app makes \u2014 "1,106.61\u20b9" alone does not say which rupee left the
       account, and this is the document somebody keeps.
       The shared PNG has carried this line since it was written; the screen
       it is a picture of did not, so the two disagreed about how completely
       the same payment was described.
       Suppressed when the formatted figure already ends in the code, which
       is what fmtMoney does for currencies with no symbol of their own
       ("1,450.25 CHF") \u2014 printing it twice reads as a mistake. */
  }{heroCurrencyCode && <div
    data-testid="receipt-hero-currency"
    style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, letterSpacing: 0.6, marginTop: 2 }}
  >{heroCurrencyCode}</div>}</div></div>{shareFeedback && <div
    role="status"
    data-testid="receipt-share-feedback"
    style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textAlign: "center", lineHeight: 1.4 }}
  >{shareFeedback}</div>}<div style={{ borderTop: `1.5px dashed ${T.line}`, margin: "18px 0" }} />{
    /* Two receipts, one toggle. Payment always exists. Creator
       Share exists whenever the payment actually carried one — a
       share leg minted server-side, or a non-zero rate applied by
       this device's own ledger — and its tab is drawn only then.
       A payment at 0% shares nothing, and a tab offering to show
       the receipt for a movement that never happened is a claim,
       not a control. The tab is hidden on value only in that one
       sense: whether the event exists at all, never on how big it
       is.

       A COIN receipt gets no toggle at all. It has one tab by
       construction — a coin movement carries no Creator Share —
       and a lone tab is not a toggle, it is a button that does
       nothing, restating the line already above it. */
  }{!isCoinReceipt && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 999, background: T.surfaceAlt, marginBottom: 14 }}><ReceiptTabButton
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
  />}</div>}{!onShareTab ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{
    /* Box 1 — who it's to/from, and their Gloobal ID if there is one.
       The flag no longer hangs off this box's top edge: it is on the
       tab row above, once for the whole receipt. The top padding is
       back to 14 because there is nothing overlapping it any more. */
  }<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 14px 12px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}><div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 0 }}><ReceiptRow
    testId="receipt-counterparty"
    // paymentIsSent, not isSent. This tab describes the PAYMENT, and on a
    // Creator Share receipt `direction` describes the share — so a share Jio
    // sent me read "From Jio" on a tab about money I sent TO Jio. The same
    // conflation the hero figure had; this row was missed when that was
    // fixed.
    label={paymentIsSent ? "To" : "From"}
    value={receipt.name}
  />{receipt.id && <ReceiptRow
    testId="receipt-counterparty-id"
    label={<GloobalWordmark suffix=" ID" />}
    value={<ColoredGloobalId id={receipt.id} />}
    mono
  />}</div></div>{
    /* Box 1b — the holder, and the other leg of a coin exchange.

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
       number that does not reproduce the two amounts printed directly above
       it. */
  }{isCoinReceipt && <div
    data-testid="receipt-coin"
    style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}
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
  />{coinRateLine && <ReceiptRow label="Rate applied" value={coinRateLine} accent />}{coinRateLine && <div style={{ fontSize: 10.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.45 }}>{
    /* The same sentence the payment receipt's conversion block carries, for
       the same reason: a rate with no date attached is one the reader takes
       to be today's. */
  }As converted at the time of this transaction, not a current rate.</div>}</div>}{
    /* Box 3 — payment method, date, time, status together */
  }{showsConversion && <div
    data-testid="receipt-conversion"
    style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}
  ><div style={{ fontSize: 10, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
      Currency conversion
    </div><ReceiptRow
    label="Sender paid"
    value={fmtMoney(receipt.senderAmount, fxSenderCurrency)}
  /><ReceiptRow
    label="Receiver got"
    value={fmtMoney(receipt.receiverAmount, fxReceiverCurrency)}
  />{fxRateLabel && <ReceiptRow label="Rate applied" value={fxRateLabel} accent />}<div style={{ fontSize: 10.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.45 }}>{
    /* A rate with no date attached is a rate the reader assumes is today's.
       This one is the rate the payment settled at, and saying so is the
       difference between a record and an estimate. */
  }As settled at the time of this transaction, not a current rate.</div></div>}<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", borderRadius: T.radiusMd, border: `1px solid ${T.line}` }}>{receipt.method && <ReceiptRow label="Payment method" value={receipt.method} />}<ReceiptRow label="Date" value={receipt.date} /><ReceiptRow label="Time" value={receipt.time} mono /><ReceiptRow label="Status" value={receipt.status === "pending" ? "Pending" : receipt.status === "simulated" ? "Not sent — simulated" : "Completed"} /></div>{receipt.status === "simulated" && <div
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
    value={`${shareIsCredit ? "+" : "\u2212"}${fmtMoney(shownShareAmount, shareCurrency)}`}
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
  >{showingShare ? "Share transaction ID" : "Transaction ID"}</span>{
    /* There was a second share button here: the summary plus the /t/ link,
       through the share sheet or the clipboard. It is gone. One receipt
       offering two share buttons meant that whichever you pressed, you did
       not send the other half — and neither half is the receipt on its own.
       The Share button on the amount card now carries the picture AND the
       link in a single sheet (receiptShareAttempts, features/receipts/
       receiptImage.js), and handleShareTxnId survives only as what runs when
       the picture cannot be drawn. Copying the ID is still its own button on
       the opposite corner: copying is not sharing. */
  }<button
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
          </p>}</div>}</div>{
    /* Done, pinned below the scroll area rather than sitting at the end of
       it. On a long receipt — a cross-border payment with a conversion block
       and a Creator Share — the old inline button was several screens down,
       so the way out of the document depended on how much the document had
       to say. */
  }<div style={{
      flexShrink: 0,
      borderTop: `1px solid ${T.line}`,
      padding: "12px 24px calc(14px + env(safe-area-inset-bottom, 0px))"
    }}
  >{
    /* The audit report. A secondary control, ABOVE Done rather than beside
       it: Done is what most people want most of the time, and two buttons of
       equal weight at the foot of a receipt is a decision nobody asked to
       make. */
  }<button
    onClick={async () => {
      if (auditBusy) return;
      setAuditBusy(true);
      try {
        await shareAuditReport(receipt, { generatedAt: formatAuditTimestamp() });
      } finally {
        setAuditBusy(false);
      }
    }}
    className="v2-tap"
    data-testid="receipt-audit-report"
    disabled={auditBusy}
    style={{
      width: "100%",
      padding: "11px 0",
      marginBottom: 10,
      borderRadius: 14,
      border: `1px solid ${T.line}`,
      background: "transparent",
      color: T.inkSoft,
      fontSize: 13,
      fontWeight: 700,
      cursor: auditBusy ? "default" : "pointer",
      opacity: auditBusy ? 0.6 : 1
    }}
  >{auditBusy ? "Preparing\u2026" : "Audit report (PDF)"}</button><button
    onClick={onDone || onClose}
    className="v2-tap"
    style={{
      width: "100%",
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
        </button></div></div></div>;
}

