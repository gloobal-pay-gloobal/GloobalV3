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
// This same component now renders all three lists — History, the Home tab's
// recent activity, and the Recent list on the Receive sheet. They used to be
// three hand-written copies that drifted apart in icon size, font size and
// date placement.
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
function TransactionRow({ t, color, sign, ccy, ccyCode = "USD", isFirst, onSelect, inset = 14 }) {
  const stamp = historyRowStamp(t);
  const amount = `${sign}${ccy}${fmt(Number(t.amount || 0), ccyCode)}`;
  return <div
    onClick={onSelect}
    className="v2-tap"
    role="button"
    tabIndex={0}
    aria-label={`${t.name}, ${amount}, ${stamp}${t.status === "simulated" ? " — not actually sent, simulated only" : ""}`}
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
  >{t.name}</span>{
    /* Date and clock together — see historyRowStamp. */
  }<span
    style={{ fontSize: 11, fontWeight: 600, color: T.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{stamp}</span></span>{
    /* The right-hand column. Never shrinks and never wraps: a truncated
       amount is a wrong amount. minWidth keeps the figures aligned as a
       column even when the names beside them differ in length. */
  }<span
    style={{ flexShrink: 0, minWidth: 92, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}
  ><span
    style={{
      fontSize: 14,
      fontWeight: 800,
      whiteSpace: "nowrap",
      // Green in, red out — TXN_IN_COLOR / TXN_OUT_COLOR in
      // constants/theme.js. The caller passes the colour so this row does
      // not need to know which list it is in.
      color
    }}
  >{amount}</span>{
    /* Sits under the amount, where a message list puts its unread pill, and
       means the one thing worth interrupting a scan for: this payment never
       actually left the device. */
  }{t.status === "simulated" && <span
    style={{ fontSize: 9, fontWeight: 800, color: "#8A5A00", background: "#FEF3C7", border: "1px solid #F5D68A", borderRadius: 999, padding: "1px 6px", whiteSpace: "nowrap" }}
  >
      Not sent
    </span>}</span></span></div>;
}
