// src/features/history/TransactionRow.jsx
function TransactionRow({ t, chip, color, sign, ccy, isFirst, onSelect }) {
  const meta = HISTORY_METHOD_META[t.method];
  const MethodIcon = meta?.icon;
  return <div
    onClick={onSelect}
    className="v2-tap"
    role="button"
    tabIndex={0}
    aria-label={`View receipt for ${t.name}, ${t.date}${t.status === "simulated" ? " — not actually sent, simulated only" : ""}`}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: isFirst ? "none" : `1px solid ${T.line}`, cursor: "pointer" }}
  >{
    /* The row's icon.
       This was a coloured square rendering `t.flag` — the counterparty's
       country flag. In practice most rows have no flag to render: a Creator
       Share grant has no counterparty country, and a row restored from the
       server carries no flag either, so the square came out empty. A blank
       tinted box on every line reads as a broken avatar, not as a design.
       Using the same living flip-symbol mark that My Assets and the Referral
       Network already use for their rows gives every transaction an icon and
       makes the three lists look like one app. The country is still on the
       receipt this row opens. */
  }<FlipSymbolCircle size={36} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span><span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, flexWrap: "wrap" }}><span style={{ fontSize: 11, color: T.inkFaint }}>{t.date}</span>{meta && <span style={{ display: "flex", alignItems: "center", gap: 3, background: T.surfaceAlt, borderRadius: 999, padding: "1.5px 7px 1.5px 5px" }}><MethodIcon size={10} color={T.inkSoft} /><span style={{ fontSize: 9.5, fontWeight: 700, color: T.inkSoft }}>{meta.label}</span></span>}{t.status === "simulated" && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#8A5A00", background: "#FEF3C7", border: "1px solid #F5D68A", borderRadius: 999, padding: "1.5px 7px" }}>Not sent</span>}</span></span><span style={{ fontSize: 13.5, fontWeight: 800, color, flexShrink: 0 }}>{sign}{ccy}{t.amount.toFixed(2)}</span></div>;
}

