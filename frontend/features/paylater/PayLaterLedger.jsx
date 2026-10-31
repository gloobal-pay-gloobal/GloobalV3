// src/features/paylater/PayLaterLedger.jsx
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
function PayLaterLedger({ title, rows, direction, ccy, ccyCode = "USD" }) {
  // PayLater is settled in the account's own currency, so every row here is
  // the reader's own money and the lens applies to all of them.
  const lens = useGeuLens();
  // One row's amount, with its other unit after a bar, sized so the pair
  // stays on one line. These rows are the same shape as a history row and
  // get the same treatment — see geuLensBarMoney and geuLensRowFontSize.
  //
  // 150px is this column's room: the card's 328px inner width on a 360px
  // phone, less the 36px mark, two 12px gaps and a readable minimum for the
  // name beside it. Base 13.5 to match the name, floor 10.
  const rowAmount = (amount, sign) => {
    const parts = geuLensBarParts(amount, ccyCode, lens, ccyCode);
    const text = `${sign}${geuLensBarMoney(amount, ccyCode, lens, ccyCode)}`;
    const size = geuLensRowFontSize(text, 13.5, 150, 10);
    // Drawn as two sizes, measured as one string.
    return { text, size, node: <>{sign}{parts.lead}{parts.trail && <span
      style={{ fontSize: geuLensTrailSize(size), fontWeight: 800 }}
    > {parts.trail}</span>}</> };
  };
  return <div><div style={{ fontSize: 12.5, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "4px 2px 8px" }}>{title}</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{rows.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing yet</div> : rows.map((t, i) => <div
    key={`${t.name}-${t.date}`}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
  ><span
    style={{
      width: 36,
      height: 36,
      borderRadius: 11,
      flexShrink: 0,
      background: direction === "in" ? T.positiveSoft : T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >{direction === "in" ? <ArrowDownLeft size={17} color={T.txnIn} /> : <ArrowUpRight size={17} color={T.txnOut} />}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: 1 }}>{t.date}</span></span><span style={{ textAlign: "right", flexShrink: 0 }}>{direction === "in" ? <><span style={{ display: "block", fontSize: rowAmount(t.amount, "+").size, fontWeight: 800, color: T.txnIn, whiteSpace: "nowrap" }}>{rowAmount(t.amount, "+").node}</span><span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: T.positive, marginTop: 1 }}>Received</span></> : <><span style={{ display: "block", fontSize: rowAmount(t.amount, "\u2212").size, fontWeight: 800, color: T.txnOut, whiteSpace: "nowrap" }}>{rowAmount(t.amount, "\u2212").node}</span><span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: t.status === "paid" ? T.positive : T.negative, marginTop: 1 }}>{t.status === "paid" ? "Paid" : "Pending"}</span></>}</span></div>)}</div></div>;
}

