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
  return `${sent ? "−" : "+"}${fmtMoney((meta && meta.amount) || 0, (meta && meta.currency) || "")}`;
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
function gloobalNotifCardPages(meta, when) {
  const money = (amount, currency) => (
    amount == null || !currency ? null : `${fmtMoney(amount, currency)}${String(fmtMoney(1, currency)).endsWith(String(currency)) ? "" : ` ${currency}`}`
  );
  const sent = meta.direction === "sent";
  const pages = [];
  if (meta.counterpartyName) {
    pages.push({ key: "who", label: sent ? "To" : "From", text: meta.counterpartyName });
  }
  // What was paid, against what arrived, with the rate between them. Drawn
  // only when the payment really crossed a currency: on a domestic one the
  // two figures are the same number said twice.
  const crossed = meta.counterCurrency && meta.currency && meta.counterCurrency !== meta.currency;
  if (crossed && money(meta.counterAmount, meta.counterCurrency)) {
    pages.push({
      key: "money",
      label: sent ? "They received" : "Sender paid",
      text: money(meta.counterAmount, meta.counterCurrency),
      note: meta.fxRate ? `1 ${meta.currency} = ${Number(meta.fxRate).toFixed(6)} ${meta.counterCurrency}` : null
    });
  }
  if (meta.counterpartySymbolId) {
    pages.push({ key: "id", label: <GloobalWordmark suffix=" ID" />, symbols: meta.counterpartySymbolId });
  }
  if (meta.referenceId) {
    pages.push({ key: "txn", label: "Transaction ID", symbols: meta.referenceId });
  }
  if (when) {
    pages.push({ key: "when", label: "Date and time", text: when });
  }
  return pages;
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
  const pages = gloobalNotifCardPages(meta, when);
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
  // The same headline the lock screen shows, from the same function.
  const headline = gloobalNotifHeadline(meta);
  const tint = sent ? T.negative : T.positive;
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
      >{` \u00B7 ${current.note}`}</span>}</span>}</span><GloobalNotifCardDots count={total} at={Math.min(page, total - 1)} />{total > 1 && <button
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
