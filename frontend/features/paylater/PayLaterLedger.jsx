// src/features/paylater/PayLaterLedger.jsx
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
function PayLaterLedger({ title, rows, direction, ccy, ccyCode = "USD" }) {
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
  >{direction === "in" ? <ArrowDownLeft size={17} color={TXN_IN_COLOR} /> : <ArrowUpRight size={17} color={TXN_OUT_COLOR} />}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: 1 }}>{t.date}</span></span><span style={{ textAlign: "right", flexShrink: 0 }}>{direction === "in" ? <><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: TXN_IN_COLOR }}>+{ccy}{fmt(t.amount, ccyCode)}</span><span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: T.positive, marginTop: 1 }}>Received</span></> : <><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: TXN_OUT_COLOR }}>−{ccy}{fmt(t.amount, ccyCode)}</span><span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: t.status === "paid" ? T.positive : T.negative, marginTop: 1 }}>{t.status === "paid" ? "Paid" : "Pending"}</span></>}</span></div>)}</div></div>;
}

