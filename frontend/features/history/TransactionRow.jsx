// src/features/history/TransactionRow.jsx
//
// One line of transaction history: mark, who, when, how much.
//
// Four columns, in reading order — icon, name, date, amount — rather than
// the previous two-column shape that stacked the date and a method chip
// underneath the name. The old shape made every row two lines tall and put
// three different pieces of information down the left edge, so scanning a
// list for an amount meant reading past all of it. Name and date each take
// an equal share of the free space (`flex: 1 1 0`), which is what puts the
// date in the middle of the row rather than trailing the name; the amount
// is pinned right with a fixed minimum width so the currency figures line
// up as a column even when the names beside them differ in length.
//
// The payment-method chip ("Bank", "PayLater", "Coin") is deliberately
// gone. It repeated on effectively every row — almost everything settles
// to Bank — so it carried close to no information while taking the space
// the date now uses. The method is still on the receipt this row opens.
function TransactionRow({ t, chip, color, sign, ccy, isFirst, onSelect }) {
  return <div
    onClick={onSelect}
    className="v2-tap"
    role="button"
    tabIndex={0}
    aria-label={`View receipt for ${t.name}, ${t.date}${t.status === "simulated" ? " — not actually sent, simulated only" : ""}`}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderTop: isFirst ? "none" : `1px solid ${T.line}`, cursor: "pointer" }}
  >{
    /* The shared living flip-symbol mark, at 28 rather than 36. It is an
       identifier for the row, not the subject of it — at the old size it
       was the heaviest thing on a line whose actual content is a name and
       a number. */
  }<FlipSymbolCircle size={28} /><span
    style={{
      flex: "1 1 0",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 2
    }}
  ><span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>{
    /* The one badge worth keeping inline: it says this payment never
       actually left the device. That is not a detail to find on a
       receipt. */
  }{t.status === "simulated" && <span style={{ alignSelf: "flex-start", fontSize: 9, fontWeight: 800, color: "#8A5A00", background: "#FEF3C7", border: "1px solid #F5D68A", borderRadius: 999, padding: "1px 6px" }}>
      Not sent
    </span>}</span><span
    style={{
      flex: "1 1 0",
      minWidth: 0,
      textAlign: "center",
      fontSize: 11,
      color: T.inkFaint,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }}
  >{t.date}</span><span
    style={{
      flexShrink: 0,
      minWidth: 86,
      textAlign: "right",
      fontSize: 13.5,
      fontWeight: 800,
      // Green in, red out — see TXN_IN_COLOR / TXN_OUT_COLOR in
      // constants/theme.js. The caller passes the colour so this row does
      // not need to know which list it is in, but there are now only two
      // colours it can ever be given.
      color
    }}
  >{sign}{ccy}{t.amount.toFixed(2)}</span></div>;
}
