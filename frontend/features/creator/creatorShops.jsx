// src/features/creator/creatorShops.jsx
//
// ── YOUR SHOPS (0210) ──────────────────────────────────────────────────────
//
// Up to five shops on one account. One Creator balance — everything paid to
// any of them lands there — and each shop with its own name, page, items and
// code. The strip sits on the creator side's Home: one chip per shop with
// today's takings, the one being worked on outlined, and "+ Shop" until
// there are five. Choosing a chip makes the creator side that shop: its
// setup, its look, its items, its code.

function creatorShopName(shop) {
  if (!shop) return "";
  if (shop.name) return shop.name;
  if (shop.handle) return shop.handle;
  return "New shop";
}

function CreatorShopsStrip({ info, active, ccyCode, lens, onPick, onAdd, adding }) {
  if (!info || !Array.isArray(info.shops)) return null;
  const shops = info.shops;
  const canAdd = shops.length < (Number(info.max) || 5) && shops[0] && shops[0].setUp;
  const fig = (v) => geuLensMoney(Number(v) || 0, ccyCode, lens);
  return <div data-testid="creator-shops" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "0 2px" }}>
      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkSoft }}>{`Your shops · ${shops.length} of ${Number(info.max) || 5}`}</span>
      <span data-testid="creator-shops-today" style={{ fontSize: 11.5, fontWeight: 800, color: T.inkFaint, whiteSpace: "nowrap" }}>{`Today, all shops: ${fig(info.totals && info.totals.today)}`}</span>
    </div>
    <div role="tablist" aria-label="Your shops" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
      {shops.map((s) => {
        const on = s.symbolId === active;
        const name = creatorShopName(s);
        return <button key={s.symbolId} type="button" role="tab" aria-selected={on} data-testid="creator-shop-chip" onClick={() => onPick(s)} className="v2-tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 9, maxWidth: 220, padding: "8px 12px 8px 8px", borderRadius: 16, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", background: T.surface, boxShadow: on ? `inset 0 0 0 2px ${T.accent}, ${T.shadowCard}` : T.shadowCard }}>
          {s.logo ? <img src={s.logo} alt="" style={{ width: 34, height: 34, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} /> : <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: on ? T.accent : T.surfaceAlt, color: on ? "#fff" : T.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14 }}>{name.slice(0, 1).toUpperCase()}</span>}
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: s.setUp ? T.inkFaint : T.accent, whiteSpace: "nowrap" }}>{s.setUp ? `${fig(s.totals && s.totals.today)} today` : "Finish setting up ›"}</span>
          </span>
        </button>;
      })}
      {canAdd && <button type="button" data-testid="creator-shop-add" onClick={onAdd} disabled={adding} className="v2-tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 16, border: "none", cursor: adding ? "default" : "pointer", fontFamily: "inherit", background: "transparent", boxShadow: `inset 0 0 0 1.5px ${T.line}`, color: T.accent, fontWeight: 900, fontSize: 13 }}><span aria-hidden="true" style={{ fontSize: 18 }}>+</span>{adding ? "Opening…" : "Shop"}</button>}
    </div>
  </div>;
}
