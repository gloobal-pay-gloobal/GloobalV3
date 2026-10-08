// src/components/cards/notificationCard.jsx
import { useState as useState41 } from "react";
import { ChevronRight as ChevronRightNotifCard } from "lucide-react";
//
// A payment notification, as a card you can page through.
//
// The row it replaces was a title, a message and a timestamp — three lines
// that said "You received 2,000.00 INR from Rajeev" and left everything else
// to the receipt. This says the same thing in its head and then lets the rest
// of the payment be turned through: who it was from, what was paid against
// what arrived, their Gloobal ID, the transaction's own reference, and when.
//
// NOTHING ON IT IS COMPUTED. Every page reads a field the server recorded on
// the notification itself (see recordPaymentNotifications). A page whose
// fields are absent — a domestic payment has no conversion, a row written
// before those fields existed has neither — is not drawn, rather than drawn
// with a figure worked out here. That is the same rule the receipt follows,
// and it matters more here: this card is the first thing somebody sees after
// money moves, and it is seen at a glance.
//
// Only payment notifications get a card. A security notice or a referral has
// one fact and no pages, and a pager with a single dot is a control that does
// nothing.

// How long the swipe/step animation runs. Short: this is a page turn, not a
// transition between screens.
var GLOOBAL_NOTIF_CARD_TURN_MS = 190;

// ── What a payment notification says, wherever it is drawn ───────────────
//
// A payment reaches this device in three ways and they used to be three
// different notifications. In the app it is the card below. With the app
// open but in the background, the page itself puts a banner in the tray
// (notifyPaymentSent / notifyPaymentReceived). With the app closed, the
// server pushes one and the service worker shows it. The card said
// "−250.00₹ sent"; the page's banner said "250.00₹ sent"; the server's said
// "Payment Sent". Three names for one event, and which one you got depended
// on where your thumb had been thirty seconds earlier.
//
// So the wording lives here, once, and everything that can reach it uses
// it. The server cannot — it is a different process on a different machine
// — and composes the same two strings itself, from the same fields, in
// paymentBannerText (server/lib/notificationText.js). That one duplication
// is asserted in tests/notification-card.test.mjs rather than trusted.
//
// `meta` is the notification's metadata: direction, amount, currency,
// counterpartyName.
function gloobalNotifHeadline(meta) {
  const sent = (meta && meta.direction) === "sent";
  // THE SIGN IS THE WHOLE SENTENCE. It used to be followed by the word —
  // "−250.00₹ sent" — and the word was the third time one line said which
  // way the money went: the minus says it, the colour it is drawn in says
  // it, and the page directly beneath says "To Chdg". A figure with a sign
  // in front of it is already a direction; the word only made the line
  // long enough to stop being a figure.
  //
  // It goes from the banner too, and deliberately: the lock screen shows
  // this over gloobalNotifSubline, so the sign is read against "To Chdg"
  // or "From Rajeev" there exactly as it is here.
  // A MISSING FIGURE IS NOT ZERO. `|| 0` with a `|| ""` currency turned a
  // notification whose metadata never arrived into a confident "−0.00" with
  // no unit on it — a payment of nothing, stated as a fact, on a lock
  // screen. The pages helper forty lines below already draws this
  // distinction (`amount == null || !currency ? null : …`); the headline did
  // not.
  //
  // Without both, the honest headline is what HAPPENED, which needs no
  // figure to be true. paymentBannerText falls back to exactly this string
  // and the parity test compares the two, so the lock screen and the card
  // cannot say different things about a payment neither can price.
  const amount = meta == null ? null : meta.amount;
  const currency = meta == null ? null : meta.currency;
  if (amount == null || !Number.isFinite(Number(amount)) || !currency) {
    return sent ? "Money sent" : "Money received";
  }
  return `${sent ? "\u2212" : "+"}${fmtMoney(Number(amount), currency)}`;
}
// WHICH NOTIFICATIONS ARE ABOUT MONEY.
//
// Every notification is a card now, and the card has two shapes inside it:
// one headed by a signed figure, one headed by a sentence. This is what
// chooses, and it is keyed on the TYPE rather than on whether the row
// happens to carry an amount — a promotional offer quoting a price in its
// metadata would otherwise be drawn as money that had moved.
//
// 'share' is a Creator Share release. It is money, it has two sides and two
// currencies, and it reads through exactly the pages a payment does.
var GLOOBAL_NOTIF_MONEY_TYPES = ["payment", "share"];

function gloobalNotifIsMoney(row) {
  return GLOOBAL_NOTIF_MONEY_TYPES.indexOf((row && row.type) || "") !== -1;
}

function gloobalNotifSubline(meta) {
  const sent = (meta && meta.direction) === "sent";
  const name = meta && meta.counterpartyName;
  if (!name) return sent ? "Your Gloobal payment went through." : "Money has landed in your Gloobal account.";
  return `${sent ? "To" : "From"} ${name}`;
}

// ── The disc ─────────────────────────────────────────────────────────────
//
// A colour per notification, from the app's own palette, picked from the
// row's id rather than at random on every render: a list of these reads as a
// scatter of colours, which is the point, but a disc that changed hue every
// time React re-drew the list would be a flicker rather than a decoration.
// The id is stable, so each notification keeps the colour it was first
// drawn with — on this device, on the next one, and on the lock screen.
//
// That last one is why this is a function rather than an expression inside
// the card. The operating system draws the closed-app notification and will
// take an image, nothing else, so the eight possible discs are pre-drawn as
// PNGs (tools/icons/build-notif-discs.mjs) and the index below is what the
// page, the service worker and the server each use to pick the same one.
//
// THE SEED IS THE PAYMENT'S referenceId, not the notification's own id.
// Those are the same colour either way inside the app, but only the
// referenceId is known everywhere the notification is drawn: the page's own
// banner has it before any row has been fetched, and the server has it when
// it composes the push. Seeding on the notification id would mean the disc
// on the lock screen and the disc on the card were picked from two
// different strings, which is a coin flip seven times in eight. An older
// row with no referenceId falls back to its id — it is still stable, it
// just only agrees with itself.
function gloobalNotifDiscIndex(id) {
  const hash = typeof flipSeedHash === "function" ? flipSeedHash(id) : 0;
  return hash % LOGO_FLIP_COLORS.length;
}
function gloobalNotifDiscIcon(id) {
  return `/icons/notif/disc-${gloobalNotifDiscIndex(id)}.png`;
}

// The pages a payment notification can show, in the order they are turned
// through. `value` returns null when the page has nothing to say, and a page
// that says nothing is never drawn.
function gloobalNotifCardPages(meta, when, row) {
  // ── A notification with one fact ──────────────────────────────────────
  //
  // A security notice, a referral, an offer: a title and a sentence, and
  // nothing to page through. These used to be drawn as a plain row beside
  // the payment's card, which is the two-designs-in-one-list problem this
  // change exists to end.
  //
  // So they get the card too, with the sentence as its one page and the
  // time as its second. Two pages means the pager is a real control rather
  // than a single dot pretending to be one — and where there is genuinely
  // only one page, the dots and the chevron are both withheld (see the
  // `total > 1` guards below).
  if (!gloobalNotifIsMoney(row)) {
    const pages = [];
    if (row && row.message) pages.push({ key: "what", label: "What happened", text: row.message });
    if (when) pages.push({ key: "when", label: "Date and time", text: when });
    return pages;
  }
  const money = (amount, currency) => (
    amount == null || !currency ? null : `${fmtMoney(amount, currency)}${String(fmtMoney(1, currency)).endsWith(String(currency)) ? "" : ` ${currency}`}`
  );
  const sent = meta.direction === "sent";
  const share = (row && row.type) === "share";
  const pages = [];
  if (meta.counterpartyName) {
    // "Creator Share from Rajeev Menon", not "From Rajeev Menon".
    //
    // A share lands seconds after the payment that produced it, from the
    // same person, and the two cards sit next to each other in the list. On
    // the first page they were word-for-word identical apart from the
    // figure — "+2,000.00₹ / From Rajeev Menon" above "+20.00₹ / From
    // Rajeev Menon" — which reads as one payment duplicated at the wrong
    // amount rather than as two different events.
    //
    // Same words as the lock screen uses (shareBannerText in
    // server/lib/notificationText.js), because the whole arrangement
    // between that file and this one is that a notification says the same
    // thing wherever it is drawn.
    pages.push({
      key: "who",
      label: share ? (sent ? "Creator Share to" : "Creator Share from") : (sent ? "To" : "From"),
      text: meta.counterpartyName
    });
  }
  // What was paid, against what arrived, with the rate between them. Drawn
  // only when the payment really crossed a currency: on a domestic one the
  // two figures are the same number said twice.
  const crossed = meta.counterCurrency && meta.currency && meta.counterCurrency !== meta.currency;
  if (crossed && money(meta.counterAmount, meta.counterCurrency)) {
    // THE RATE'S DIRECTION IS THE RECORDED ONE, NOT THE VIEWER'S.
    //
    // The server stores one rate per payment: 1 unit of the RECEIVER's
    // currency in the SENDER's. receiptPaymentConversion prints exactly
    // that, and this has to print the same sentence or one payment carries
    // two rates — which is how a record stops reconciling.
    //
    // This used to read `1 {meta.currency} = rate {meta.counterCurrency}`,
    // keying off the VIEWER's own currency. That is right on the received
    // leg by luck, because there the viewer IS the receiver. On the sent
    // leg it inverts the fraction while keeping the number: paying £20 from
    // India, the payer's card said "1 INR = 105.260000 GBP" — one rupee
    // buying a hundred pounds, wrong by four orders of magnitude, on the
    // notification for a payment they had just made. The payee's card, for
    // the same payment, said "1 GBP = 105.260000 INR".
    //
    // Inverting the number instead of the labels would be worse: an
    // inverted rate is a computed rate, it rounds, and it would no longer
    // match the figure on the record. Same reason the receipt gives for
    // stating it this way round even though it reads less naturally.
    const base = sent ? meta.counterCurrency : meta.currency;
    const quote = sent ? meta.currency : meta.counterCurrency;
    pages.push({
      key: "money",
      label: sent ? "They received" : "Sender paid",
      text: money(meta.counterAmount, meta.counterCurrency),
      note: meta.fxRate ? `1 ${base} = ${Number(meta.fxRate).toFixed(6)} ${quote}` : null
    });
  }
  if (meta.counterpartySymbolId) {
    pages.push({ key: "id", label: <GloobalWordmark suffix=" ID" />, symbols: meta.counterpartySymbolId });
  }
  // THE PAYMENT A SHARE CAME FROM.
  //
  // Only a share has one, and without it the card names a figure and a
  // person and not the thing it was a share OF — which is the one question
  // a 20.00 that appeared seconds after a 1,000.00 actually raises.
  //
  // A payment has no payment above it, so `paymentReferenceId` is null
  // there and this page is not drawn, by the same rule as every other page
  // on this card.
  if (meta.paymentReferenceId) {
    pages.push({ key: "payment", label: "Share on", symbols: meta.paymentReferenceId });
  }
  // NO TRANSACTION ID PAGE. It was here and it is gone, and the two
  // identifiers being different lengths is the whole reason: a Gloobal ID
  // is somebody, a transaction reference is twenty symbols of bookkeeping.
  // On a card people glance at, the long one filled the widest page in the
  // pager with the one thing on it nobody reads off a notification — it is
  // read off a receipt, by someone who has gone looking for it, which is
  // where it still is. `metadata.referenceId` is untouched: the card still
  // seeds its disc colour from it, and the receipt still prints it.
  if (when) {
    pages.push({ key: "when", label: "Date and time", text: when });
  }
  return pages;
}

// ── "Date and time" means a date and a time ──────────────────────────────
//
// This page used to print the same string as the little stamp on a plain
// row: "Just now", "3h", "Tue". That is the right thing for a stamp in a
// list, where the question is "how fresh is this?", and the wrong thing
// under a label that says Date and time, where the question is "when did
// this happen?" — the one you ask when you are reconciling against a bank
// statement, and the one "3h" cannot answer an hour later.
//
// So the page prints the payment's own instant, the way the receipt prints
// it: the date, then the app's one clock. formatClockTime is 24-hour
// HH:MM:SS by deliberate policy (see backend/utils/format.js) — this app is
// built to be read by someone who reads no English, and "2:07 PM" is an
// English abbreviation of a Latin phrase.
//
// `metadata.occurredAt` is when the MONEY moved; the row's createdAt is when
// the inbox heard about it. Usually the same millisecond, which is why the
// difference was easy to miss — but the notification is a pointer at a
// payment, and it should carry the payment's time. Rows written before the
// server recorded it fall back to their own createdAt.
function gloobalNotifCardWhen(meta, row) {
  const iso = (meta && meta.occurredAt) || (row && row.createdAt) || null;
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const date = at.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  const clock = typeof formatClockTime === "function" ? formatClockTime(at) : "";
  return clock ? `${date} · ${clock}` : date;
}

// The dots. Not a scrollbar: five of them at most, and the one you are on is
// the only one that is dark.
function GloobalNotifCardDots({ count, at }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 5 }} aria-hidden="true">{Array.from({ length: count }, (_, i) => <span
    key={i}
    style={{
      width: i === at ? 7 : 5,
      height: i === at ? 7 : 5,
      borderRadius: "50%",
      background: i === at ? T.ink : "#D8D3E8",
      transition: "width 0.18s ease, height 0.18s ease, background 0.18s ease"
    }}
  />)}</span>;
}

// `row` is the notification as the server sends it (publicNotification).
// `onOpen` opens the payment it is about — the whole card is that tap, except
// for the chevron, which turns the page instead.
function GloobalNotificationCard({ row, when, unread, onOpen }) {
  const meta = (row && row.metadata) || {};
  const sent = meta.direction === "sent";
  const [page, setPage] = useState41(0);
  const [turning, setTurning] = useState41(false);
  // `when` is still taken as a prop, and still ignored for this page: the
  // sheet passes the relative stamp it draws on plain rows, and the card
  // wants the payment's own instant. Kept in the signature because the
  // sheet has no other reason to know the difference.
  const pages = gloobalNotifCardPages(meta, gloobalNotifCardWhen(meta, row), row);
  const total = pages.length;
  const current = total ? pages[Math.min(page, total - 1)] : null;
  const turn = () => {
    if (total < 2) return;
    setTurning(true);
    setTimeout(() => {
      setPage((p) => (p + 1) % total);
      setTurning(false);
    }, GLOOBAL_NOTIF_CARD_TURN_MS);
  };
  // WHAT THE HEAD SAYS, which depends on whether money moved.
  //
  // For a payment or a Creator Share it is the signed figure, from the same
  // function the lock screen uses — that shared function is the whole point
  // of notificationText.js and the parity test that guards it.
  //
  // For everything else there is no figure, and gloobalNotifHeadline would
  // answer "Money received": `sent` is false when there is no direction, so
  // a security notice would have announced an arrival of money. The row's
  // own title is the headline there, which is what the plain row this card
  // replaces already showed.
  const money = gloobalNotifIsMoney(row);
  const headline = money ? gloobalNotifHeadline(meta) : ((row && row.title) || "Gloobal");
  // Red out, green in — and neither for a notice about no money at all,
  // where a green sentence would read as something having arrived.
  const tint = money ? (sent ? T.negative : T.positive) : T.ink;
  // The type's own mark and colour, the pair the plain row used to carry.
  // Read from the sheet's own table rather than restated here: it is the
  // one place that decides what a security notice or a referral looks like,
  // and two tables would be two answers.
  const look = typeof gloobalNotifSheetLook === "function"
    ? gloobalNotifSheetLook(row)
    : { Icon: null, tint: T.inkSoft, soft: T.surfaceAlt };
  // Their country's flag, through the same lookup every other screen uses.
  // The notification carries the ISO code, never an emoji, for the reason
  // FlagEmoji itself states: the character is two Latin letters on most of
  // the platforms this app runs on.
  const markColour = LOGO_FLIP_COLORS[gloobalNotifDiscIndex(meta.referenceId || (row && row.id))];
  const iso = String(meta.counterpartyIso || "").toUpperCase();
  const counterpartyFlag = iso
    ? (COUNTRY_BY_ISO[iso] && COUNTRY_BY_ISO[iso].flag) || (typeof isoToFlag === "function" ? isoToFlag(iso) : null)
    : null;

  return <div
    data-testid="notification-card"
    data-direction={sent ? "sent" : "received"}
    style={{
      background: T.surface,
      borderRadius: T.radiusLg,
      border: `1px solid ${T.line}`,
      boxShadow: unread ? T.shadowCard : "none",
      // A card is its content's height or it is nothing. `overflow: hidden`
      // is what rounds the corners, and a card that has been allowed to
      // shrink crops itself with it — the flag and the logo come out as
      // domes and the pager disappears entirely. The list above no longer
      // squeezes anything, and this makes the card refuse regardless.
      flexShrink: 0,
      overflow: "hidden"
    }}
  >{
    /* The head: the country the money came from or went to, the figure, and
       what happened to it. One line, and it is the whole notification for
       anybody who reads no further. */
  }<button
    onClick={onOpen}
    className="v2-row"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 11,
      width: "100%",
      border: "none",
      background: "transparent",
      textAlign: "left",
      padding: "13px 14px 11px",
      cursor: "pointer"
    }}
  >{
    /* The app's own logo, white on a coloured disc — the mark from the home
       screen, so a notification is recognisably from this app before a word
       of it is read. It replaced a direction arrow, which was saying for a
       third time what the sign, the colour of the figure beside it and the
       word after it already say. It is not an unread dot either: unread is
       the card's shadow.

       IT LEADS THE ROW, and the flag closes it. They were the other way
       round. A list of these is read down its left edge, and what sat there
       was the flag — which changes from row to row and answers a question
       nobody asked first ("which country?") before the one they did ("what
       happened to my money?"). The mark is the same shape on every row, so
       as a left edge it is a margin rather than a column of content, and
       the eye goes straight to the figure. The flag earns its place at the
       end, where it qualifies the name on the page below it.

       The mark is drawn white out of the shipped artwork (brightness(0)
       inverts it) rather than kept as a second white copy of the same file:
       one logo, one source. */
  }<span
    aria-hidden="true"
    style={{
      // 32, down from 42, and the flag 26 from 34. Both were sized as
      // objects on the row; they are furniture around one line of text,
      // and at the old sizes the disc stood taller than the figure it was
      // sitting next to.
      width: 32,
      height: 32,
      borderRadius: "50%",
      flexShrink: 0,
      background: markColour,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 6px 16px -11px rgba(20,10,50,0.8)"
    }}
  ><img
    src={G_LOGO_DATA_URI}
    alt=""
    draggable={false}
    style={{ width: 21, height: 21, objectFit: "contain", filter: "brightness(0) invert(1)" }}
  /></span><span
    // Centred, and centred in the CARD rather than in the space left over.
    // Those are the same thing only while the two flanks are the same
    // width, which is why the flag below is boxed to the disc's 32 — its
    // circle is 26 with a rim painted outside the layout box, so left to
    // itself it would take six pixels less than the mark and drag the
    // figure off centre by three. Nobody would name the fault; they would
    // just see a row that sits slightly wrong.
    style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 16, fontWeight: 800, color: tint, overflowWrap: "anywhere" }}
  >{headline}</span>{
    /* The counterparty's flag, cut and ringed the way the receipt cuts and
       rings it — same component, same disc, same rim — so the notification
       and the document it opens are plainly about the same payment. The rim
       is what keeps a pale flag (Japan, Poland) from dissolving into the
       card behind it. */
  }<span
    style={{ width: 32, flexShrink: 0, display: "flex", justifyContent: "center" }}
  >{counterpartyFlag
    ? <span
        style={{ display: "flex", flexShrink: 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${T.surface}, 0 0 0 3px ${T.line}, 0 2px 8px rgba(20,10,50,0.16)` }}
      ><FlagEmoji
        flag={counterpartyFlag}
        shape="circle"
        size={26}
        fit="cover"
      /></span>
    : look.Icon
      ? <span
          // WHAT KIND OF NOTIFICATION THIS IS, where there is no flag to
          // put here.
          //
          // The left edge is the Gloobal mark on every card, deliberately:
          // one shape down the list, so the eye goes to the figure rather
          // than to a column of changing glyphs. That rule is what made
          // this slot the right home for the type's own mark — a shield, a
          // gift, an info disc — which is the signal the plain row carried
          // in ITS left edge and which would otherwise be lost now that
          // every row is a card. A payment and a share keep the flag,
          // because the country qualifies the name on the page below.
          aria-hidden="true"
          style={{ width: 26, height: 26, borderRadius: "50%", background: look.soft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        ><look.Icon size={14} color={look.tint} /></span>
      : <span style={{ width: 26, height: 26, borderRadius: "50%", background: T.surfaceAlt, flexShrink: 0 }} />}</span></button>{total > 0 && <div
    style={{ borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10, padding: "11px 14px 13px" }}
  ><span
    data-testid="notification-card-page"
    style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 2,
      opacity: turning ? 0 : 1,
      transform: turning ? "translateX(-8px)" : "none",
      transition: `opacity ${GLOOBAL_NOTIF_CARD_TURN_MS}ms ease, transform ${GLOOBAL_NOTIF_CARD_TURN_MS}ms ease`
    }}
  ><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>{current.label}</span>{current.symbols
    ? <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{String(current.symbols).split("").map((ch, i) => <span
        key={i}
        style={{ fontFamily: "monospace", fontSize: 13.5, fontWeight: 800, color: POSITION_COLORS[i % POSITION_COLORS.length] }}
      >{ch}</span>)}</span>
    : <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, overflowWrap: "anywhere" }}>{current.text}{current.note && <span
        style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint }}
      >{` \u00B7 ${current.note}`}</span>}</span>}</span>{
    /* ONE PAGE DRAWS NO PAGER. A single dot beside a page that cannot turn
       is a control that does nothing, which is the objection that kept
       these notifications off the card in the first place. The chevron was
       already withheld below; the dot was not, and a lone dot reads as a
       pager whose other pages failed to load. */
  }{total > 1 && <GloobalNotifCardDots count={total} at={Math.min(page, total - 1)} />}{total > 1 && <button
    onClick={turn}
    aria-label="Next detail"
    className="v2-tap"
    style={{
      width: 34,
      height: 34,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      cursor: "pointer"
    }}
  ><ChevronRightNotifCard size={16} color={T.ink} /></button>}</div>}</div>;
}
