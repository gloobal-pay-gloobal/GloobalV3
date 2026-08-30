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

// Big enough to read as an avatar rather than a bullet. A message list's
// mark is the thing your eye lands on first, and 28 was sized for a row that
// was one line tall.
var TXN_ROW_MARK_SIZE = 42;

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
    /* Seeded on the counterparty, so one person keeps ONE mark — the same
       colour and symbol in History, in the Home list and on the Receive
       sheet, every time the screen is drawn.

       Unseeded it re-rolls on every render, which was tolerable when the
       mark was a 28px bullet decorating a table row. At avatar size and
       avatar position it is read as identity, and an identity that changes
       colour each time you open the screen is worse than no identity: it
       invites you to recognise a row by its mark and then quietly lies. */
  }<FlipSymbolCircle size={TXN_ROW_MARK_SIZE} seed={t.phone || t.symbolId || t.name} /><span
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
