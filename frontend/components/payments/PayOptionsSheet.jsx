// src/components/payments/PayOptionsSheet.jsx
// Every "Pay" action in the app (Send Money, Scan & Pay, Pay a
// Business, ...) shares this same options -> PIN -> biometric
// sequence — this bottom sheet is step one: pick which of Bank /
// PayLater / Coin actually funds the payment, exactly like Send
// Money's own pay-method sheet, not a shortcut straight to biometric.
function PayOptionsSheet({ open, onClose, onChoose }) {
  if (!open) return null;
  const options = [
    { key: "bank", label: "Gloobal Bank", Icon: Landmark3 },
    { key: "paylater", label: "Gloobal PayLater", Icon: CreditCard3 },
    { key: "coin", label: "Gloobal Coin", Icon: Coins2 }
  ];
  return <div
    style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,12,35,0.45)", display: "flex", alignItems: "flex-end" }}
    onClick={onClose}
  ><div
    onClick={(e) => e.stopPropagation()}
    style={{ width: "100%", background: T.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "10px 20px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 10 }}
  ><div style={{ width: 36, height: 4, borderRadius: 2, background: T.line, alignSelf: "center", margin: "6px 0 10px" }} /><span style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginBottom: 4 }}>
        Pay with
      </span>{options.map((opt) => <button
    key={opt.key}
    onClick={() => onChoose(opt.label)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "14px 16px", background: T.surface, cursor: "pointer", textAlign: "left" }}
  ><span style={{ width: 36, height: 36, borderRadius: 11, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><opt.Icon size={17} color={T.accent} /></span><span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: T.ink }}>{gloobalText(opt.label)}</span><ChevronRight4 size={16} color={T.inkFaint} /></button>)}</div></div>;
}
