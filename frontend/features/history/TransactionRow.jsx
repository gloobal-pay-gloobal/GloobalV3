// src/features/history/TransactionRow.jsx
//
// One line of transaction history, in the shape of a message list.
//
//   ( mark )  Name                        − $240.00
//             Aug 30 · 13:52              [badge]
//
// Three columns, two of them stacked. The mark identifies the row, the middle
// column answers "who, and when", and the amount holds the right edge.
//
// The previous shape laid icon / name / date / amount across a single line,
// which put the date in the middle of the row doing nothing but separating
// the two things people actually read, and forced every name to be truncated
// to leave room for it. Moving the date under the name gives the name the
// whole width it needs and gives the date and the clock time room to sit
// together, while the amount keeps the right-hand column where a number
// belongs — amounts line up under each other and can be compared down the
// list without reading anything else.
//
// This same component now renders every transaction list in the app —
// History, the Home tab's recent activity, the Recent list on the Receive
// sheet, Send Money's Recent, Gloobal Bank's Recent Transactions and the Coin
// Activity ledger. They used to be six hand-written copies that drifted apart
// in mark size, font size and date placement: 29px here, 30 on Bank and Coin,
// 36 on Send; 14.5/11 type here against 13/10.5 on the other three; and two
// entirely different marks — this flipping symbol disc, and a soft-tinted
// circle holding a direction arrow.
//
// The arrow is the one thing that migration drops, and it is worth saying why
// that is not a loss of information. On a Bank or Coin row, direction was
// stated three times: by the arrow, by the sign on the amount, and by the
// colour of the amount. Two of those three survive here unchanged. What the
// arrow bought on top of them was a second mark idiom on a list of the same
// kind of thing, which is the drift itself.
//
// The payment-method chip ("Bank", "PayLater", "Coin") stays gone. It
// repeated on effectively every row, so it carried close to no information.
// It is still on the receipt this row opens.

// 42 was the avatar size a message list uses, and on the History screen it
// was fine. In the Dashboard's Recent Activity card — a narrow module among
// several, not the whole screen — it dominated the row, and once it is
// dominating the row it has stopped being a mark and started being the
// subject. 29 is 70% of it: still an avatar, no longer the loudest thing on
// the line. The glyph inside is sized off this (size * 0.42), so it follows
// on its own.
var TXN_ROW_MARK_SIZE = 29;

// `inset` is the row's own horizontal padding. The History screen puts these
// straight into an unpadded card and needs it; the Dashboard's two lists sit
// inside cards that already pad themselves and pass 0, so the rows line up
// with the card's own heading instead of stepping in from it.
//
// `amountText` is for a row that is not denominated in a currency at all.
// The Coin ledger is the only one: it is counted in GC, which has no ISO code
// and no symbol, so fmtMoney cannot format it and must not be asked to —
// handing it "GC" would print the ticker through the currency table's
// fallback path and quietly imply GC is money. A caller that passes it owns
// the whole figure; everything else below still reads the same.
function TransactionRow({ t, color, sign, ccy, ccyCode = "USD", isFirst, onSelect, inset = 14, amountText }) {
  const stamp = historyRowStamp(t);
  // The row's OWN currency wins over the viewer's account currency.
  //
  // `ccy`/`ccyCode` describe the logged-in account, and for a domestic
  // payment that is also what the row is in. For a cross-border one it is
  // not: a restored row can legitimately be denominated in the counterparty's
  // currency (see mapServerTransaction — where the sender's own debit was
  // never recorded, the row honestly keeps the receiver's figure and says so).
  // Formatting that with the viewer's symbol is how ₹478,000 came to be
  // displayed as $478,000.
  //
  // The symbol and the decimal rule are taken from the SAME code, so they can
  // never disagree — a currency with no minor unit is not printed to two
  // decimals just because the viewer's currency has one.
  const rowCode = t.currency || ccyCode;
  // Amount first, currency after: "+20$", not "+$20". fmtMoney owns both
  // halves, so a row cannot print them in a different order from the receipt
  // that same row opens.
  //
  // It falls back to the CODE itself for a currency with no symbol in the
  // table, rather than to the viewer's symbol: an unfamiliar "5,000.00 CNY"
  // is readable and true, where "5,000.00$" is neither.
  // ── THE LENS, AND WHY IT USES rowCode RATHER THAN ccyCode ─────────────
  //
  // The lens is read here rather than passed in: these rows are rendered
  // from six different lists, and a prop would have to be threaded through
  // every one of them. The list that somebody forgot would print rupees
  // beside GEU on the same screen.
  //
  // geuLensOwnMoney relabels ONLY when the row's currency is the viewer's
  // own. That distinction is exactly the one the comment above already
  // draws for the symbol, and it matters more here: a cross-border payment
  // has the payer's 8,000 INR on one row and the payee's 98 USD on another,
  // and writing GEU after both would put two different quantities under one
  // name. Somebody would read "8000 GEU" and "98 GEU" and conclude the
  // money shrank in transit.
  //
  // So the viewer's own rows are relabelled and the counterparty's keep
  // their symbol, lens or no lens. The row then reads honestly as what it
  // is: your side in your unit, their side in theirs.
  //
  // `amountText` is untouched. It exists for a row that is not denominated
  // in a currency at all, which by definition has no own-currency to match.
  const lens = useGeuLens();

  // ── THE CREATOR SHARE, ON THE ROW THAT EARNED IT ──────────────────────
  //
  // A share-bearing payment plants an AssetSeed, so My Assets gains an
  // entry that History had nothing to say about. The founder's question
  // was the obvious consequence: "my assets has more seeds than history
  // shows transactions". Two lists describing the same events, and only
  // one of them mentioning the share.
  //
  // The server excludes 'share' legs from this endpoint on purpose —
  // Coverage reads the same rows for its spend figure, and a share leg
  // there would count the same money twice. So the fix is not a second
  // row. It is this row saying what it already knows.
  //
  // `shareReceiverAmount` is the PAYER'S side: what came back out of the
  // payment and into their assets. It is carried on every payment row
  // already; nothing new is fetched.
  //
  // Shown only when the viewer is the payer and the figure is real. On the
  // payee's own copy of the row the share is money they gave away, which
  // their amount already reflects — saying it twice would read as a second
  // deduction.
  // \u2500\u2500 THE NOTE NO LONGER CARRIES A FIGURE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  //
  // It used to read "4,000.00\u20b9 to My Assets", and the founder's call was to
  // drop the number: "we have assets received when they tap creator share,
  // receipt already has conversion data". He is right that it is stated
  // twice \u2014 the receipt this row opens shows the share with both sides and
  // the rate between them, which is more than a 9.5px line under an amount
  // can honestly say about a cross-border share.
  //
  // What the note is for now is the GAP it was added to explain: My Assets
  // holds more entries than History holds rows, because the server excludes
  // share legs from this endpoint on purpose (Coverage reads the same rows
  // for its spend figure and would count the money twice). The note's job is
  // to mark WHICH rows planted one, so the two lists stop looking like they
  // disagree. A marker needs no figure.
  //
  // ── ONLY A SHARE LEG CARRIES IT ───────────────────────────────────────
  //
  // `kind` comes from HISTORY_ROW_SHAPE_BY_TYPE and is "share" on exactly the
  // rows that ARE the Creator Share — the −4.00 beside the +200.00 that
  // produced it, two seconds apart in the list. Everything else is a payment.
  //
  // This read the share FIGURES before (shareReceiverAmount on the paid side,
  // shareSenderAmount on the received one), which put the label on every
  // payment that happened to carry a share. The founder saw the result on his
  // own Received tab: "+200.00 GEU │ ₹ / Assets received" on money somebody
  // paid him. It is a payment, and nothing about it was received as assets.
  //
  // AND THAT IS ALSO WHAT FIXES THE WORDING. On a payment row these two
  // labels were the opposite of the movement in both directions, which this
  // file carried a long comment admitting. On a SHARE LEG they are simply
  // true: the paid leg is the share leaving, the received leg is the share
  // arriving. Same two strings, put on the rows they describe.
  //
  //     Received   +200.00 GEU │ ₹                     (a payment, no label)
  //     Paid         −4.00 GEU │ ₹   Assets shared    (the share it produced)
  //
  // Share legs reach this list through /api/transactions/:symbolId, which the
  // app reads. They are excluded from /api/transactions/history/:symbolId by
  // a deliberate `type: { $ne: 'share' }` — Coverage reads that one for its
  // spend figure and would count the same money twice.
  const shareNote = t.kind === "share"
    ? (sign === "\u2212" ? "Assets shared" : "Assets received")
    : null;

  // ── THE AMOUNT, AND THE BAR AFTER IT ──────────────────────────────────
  //
  //     −959.07₹ │ GEU       flipping to      −959.07 GEU │ ₹
  //
  // Drawn in TWO PIECES so the unit being read in can be the bigger one —
  // see GEU_LENS_TRAIL_RATIO. `lead` is the figure with its active unit,
  // `trail` is the bar and the other name at 75%. Both come out of
  // geuLensBarParts, so the two halves cannot disagree about which unit is
  // active, and the string form below is the same two joined.
  //
  // `amountText` stays untouched. The Coin ledger is counted in GC, which is
  // not a currency, has no second name, and must not be given one.
  const amountParts = amountText != null
    ? { lead: `${sign}${amountText}`, trail: "" }
    : (() => {
        const parts = geuLensBarParts(Number(t.amount || 0), rowCode, lens, ccyCode);
        return { lead: `${sign}${parts.lead}`, trail: parts.trail };
      })();
  // The whole thing as text, for the screen reader and for the sizer. The
  // READER of a row hears one phrase; only the eye gets two sizes.
  const amount = `${amountParts.lead}${amountParts.trail ? ` ${amountParts.trail}` : ""}`;

  // Four more characters on the longest string in the narrowest column, so
  // the figure and its bar shrink together and stay on one line. Wrapping
  // reads as two facts; truncating shows a different number. Measured on the
  // JOINED string even though the trail is drawn smaller, which errs toward
  // shrinking — the safe direction, and the same bias as the character ratio
  // itself. See geuLensRowFontSize.
  const amountSize = geuLensRowFontSize(amount, 14);
  return <div
    onClick={onSelect}
    className="v2-tap"
    // Only a row that actually opens something is a button. Three of the six
    // lists this now renders — Send's Recent, Bank, Coin — are read-only, and
    // announcing those to a screen reader as buttons, and putting each one in
    // the tab order, would promise a receipt that never opens. Send's Recent
    // is read-only deliberately: see the comment at its call site.
    role={onSelect ? "button" : undefined}
    tabIndex={onSelect ? 0 : undefined}
    aria-label={`${t.name}, ${amount}, ${stamp}${shareNote ? ` — ${shareNote}` : ""}${t.status === "simulated" ? " — not actually sent, simulated only" : ""}`}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: `9px ${inset}px`, cursor: onSelect ? "pointer" : "default" }}
  >{
    /* The living mark, free-running: it flips on its own timer through the
       dial-pad symbols and the palette, the way it does everywhere else in
       the app.

       It was briefly seeded on the counterparty so each person kept one
       fixed colour and symbol. That bought a stable identity per row and
       cost the animation outright — FlipSymbolCircle's seeded branch
       returns before it ever sets its interval — and the motion is the
       point of this mark. Identity is carried by the name beside it. */
  }<FlipSymbolCircle size={TXN_ROW_MARK_SIZE} /><span
    style={{
      flex: "1 1 0",
      minWidth: 0,
      display: "flex",
      alignItems: "center",
      gap: 10,
      // The divider hangs off the TEXT block rather than the row, so it
      // starts where the text starts and clears the mark — the inset rule a
      // message list uses. On the row it would cut straight through the
      // gutter and chop the list into boxes.
      borderTop: isFirst ? "none" : `1px solid ${T.line}`,
      paddingTop: isFirst ? 0 : 9
    }}
  ><span style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}><span
    style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{
    /* Paid TO a shop: listed under the shop's creator name, its dot in
       colour, so a shop payment and a personal one are told apart. */
    t.creatorHandle && t.direction !== "received" ? <CreatorHandleText handle={t.creatorHandle} /> : t.name
  }</span>{
    /* Date and clock together — see historyRowStamp. Received AT your
       shop says so after the time. */
  }<span
    style={{ fontSize: 11, fontWeight: 600, color: T.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{stamp}{t.creatorHandle && t.direction === "received" ? <> · at <CreatorHandleText handle={t.creatorHandle} icon={false} /></> : null}</span></span>{
    /* The right-hand column. Never shrinks and never wraps: a truncated
       amount is a wrong amount. minWidth keeps the figures aligned as a
       column even when the names beside them differ in length. */
  }<span
    // 66% where it was 58%. The bar made the amount four characters longer
    // and the note under it four to nine characters SHORTER, so the column
    // needs more width and has more to spare. The name beside it ellipsises
    // and degrades gracefully; an amount does neither, which is why the
    // width goes this way round.
    style={{ flexShrink: 0, minWidth: 92, maxWidth: "66%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}
  ><span
    style={{
      fontSize: amountSize,
      fontWeight: 800,
      whiteSpace: "nowrap",
      // Green in, red out — TXN_IN_COLOR / TXN_OUT_COLOR in
      // constants/theme.js. The caller passes the colour so this row does
      // not need to know which list it is in.
      color
    }}
  >{amountParts.lead}{amountParts.trail && <span
    // Smaller, NOT fainter. The row's colour already says direction — red
    // out, green in — and fading half the figure would put a third signal on
    // a line that has two. It inherits the colour from the span above.
    style={{ fontSize: geuLensTrailSize(amountSize), fontWeight: 800 }}
  > {amountParts.trail}</span>}</span>{
    /* Sits under the amount, where a message list puts its unread pill, and
       means the one thing worth interrupting a scan for: this payment never
       actually left the device. */
  }{shareNote && <span
    // Under the amount, in the assets colour rather than the row's own.
    // The row's colour says which way the payment went; this is a
    // different movement inside it and must not read as part of that
    // figure. Small and quiet: it is context for a number, not a number.
    data-testid="history-row-share"
    style={{ fontSize: 9.5, fontWeight: 700, color: T.positive, whiteSpace: "nowrap" }}
  >{shareNote}</span>}{t.status === "simulated" && <span
    style={{ fontSize: 9, fontWeight: 800, color: "#8A5A00", background: "#FEF3C7", border: "1px solid #F5D68A", borderRadius: 999, padding: "1px 6px", whiteSpace: "nowrap" }}
  >
      Not sent
    </span>}</span></span></div>;
}
