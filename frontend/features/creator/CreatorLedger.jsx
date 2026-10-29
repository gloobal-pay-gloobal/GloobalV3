// src/features/creator/CreatorLedger.jsx
//
// WHAT A MERCHANT SOLD AND WHAT A MERCHANT BOUGHT, ON ONE SCREEN.
//
// Asked for as "history option of both side of buy and sell". The two
// sides are not symmetrical, and pretending they are would be the easy
// lie here — so this says plainly what each one is.
//
// ── THE BUY SIDE IS ITEMISED. THE SELL SIDE IS NOT. ─────────────────────
//
// BOUGHT comes from CreatorPurchase: a line per thing, written after a
// payment to a supplier succeeds, carrying the title, the quantity and
// the price as they stood at the moment of buying. "3 x Loose leaf,
// 1,850" — which is what tells a merchant what leaf cost last month.
//
// SOLD is payments received. Not items, and the screen says so rather
// than implying otherwise.
//
// The reason is in CreatorPurchase's own header and it was a decision,
// not an oversight: a customer paying a tea stall gets a plain payment
// with no order attached, because an itemised order would need refunds
// and corrections per line. Nothing records which samosas were in the
// bag. So the honest sell-side history is the money — who paid, how
// much, when — and the founder picked that knowingly over building the
// other thing.
//
// There is a second reason it could not be more exact even if we wanted
// it today: THE CREATOR SIDE AND THE PERSONAL SIDE ARE ONE ACCOUNT.
// `creatorId = secureId` in App.jsx, with a long note saying why the
// split was removed — a separate creator identifier pointed at no
// account and broke payments. So the server cannot tell a payment made
// to the shop from one made to the person; they are the same payment to
// the same ID. For a merchant that is nearly always fine, since money
// arriving IS their sales, but the heading has to be "paid you" rather
// than "bought from you", because only one of those is true.
import { useState as useState59, useEffect as useEffect55, useMemo as useMemo16 } from "react";
import { ArrowDownLeft as ArrowDownLeft3, Package as Package3 } from "lucide-react";

// One empty state shape, so the two tabs cannot drift into two voices.
function CreatorLedgerEmpty({ title, body }) {
  return <div style={{
    background: T.surface, borderRadius: T.radiusLg, padding: "30px 20px",
    textAlign: "center", boxShadow: T.shadowCard
  }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{title}</div><div style={{
    fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.55
  }}>{body}</div></div>;
}

// A money row: who, when, how much. The figure uses GeuFigure so it
// carries both of its names under either lens, exactly as every other
// figure in the app does — a history screen is not an exception to that
// rule and was never going to be allowed to become one.
function CreatorLedgerRow({ mark, markTint, title, subtitle, amount, currency, lens, sign, first }) {
  return <div style={{
    display: "flex", alignItems: "center", gap: 12, padding: "13px 15px",
    borderTop: first ? "none" : `1px solid ${T.line}`
  }}><span style={{
    width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: markTint,
    display: "flex", alignItems: "center", justifyContent: "center"
  }}>{mark}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{title}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint, marginTop: 2,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{subtitle}</span></span><span style={{
    flexShrink: 0, textAlign: "right", fontSize: 13, fontWeight: 800,
    color: sign === "+" ? T.positive : T.ink
  }}><GeuFigure amount={amount} currency={currency} lens={lens} size={13} /></span></div>;
}

function CreatorLedgerScreen({
  symbolId,
  handle = "",
  received = [],
  lens = "own",
  onClose
}) {
  const [tab, setTab] = useState59("sold");
  const [bought, setBought] = useState59(null);
  const [loadError, setLoadError] = useState59("");

  // Fetched once, when the Bought tab is first opened rather than on
  // mount. Most visits are to check what came in; a request for the
  // other list on every open is a request nobody asked for.
  useEffect55(() => {
    if (tab !== "bought" || bought !== null) return undefined;
    let live = true;
    (async () => {
      try {
        const rows = await GloobalApi.getCreatorPurchases(symbolId);
        if (live) setBought(Array.isArray(rows) ? rows : []);
      } catch (e) {
        // Offline, or the API asleep. An empty list would say "you have
        // never bought anything", which is a different and wrong claim.
        if (live) { setBought([]); setLoadError("Could not load your purchases just now."); }
      }
    })();
    return () => { live = false; };
  }, [tab, bought, symbolId]);

  // Newest first, and only money that actually arrived.
  const sold = useMemo16(() => {
    const rows = Array.isArray(received) ? received.slice() : [];
    rows.sort((a, b) => {
      const at = a && a.occurredAt ? Date.parse(a.occurredAt) : 0;
      const bt = b && b.occurredAt ? Date.parse(b.occurredAt) : 0;
      return bt - at;
    });
    return rows;
  }, [received]);

  const tabButton = (key, label) => <button
    key={key}
    onClick={() => setTab(key)}
    aria-pressed={tab === key}
    className="v2-tap"
    style={{
      flex: 1, minWidth: 0, border: "none", borderRadius: 14, padding: "11px 0",
      background: tab === key ? T.gradButton : T.surface,
      color: tab === key ? "#fff" : T.inkSoft,
      boxShadow: tab === key ? "0 6px 16px rgba(124,58,237,0.26)" : T.shadowCard,
      fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer"
    }}
  >{label}</button>;

  return <div style={{
    position: "fixed", inset: 0, zIndex: 330, background: T.bg,
    display: "flex", flexDirection: "column", overflow: "hidden"
  }}><div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "calc(15px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0
  }}><NavBackButton onClick={onClose} /><span style={{
    flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>Sales &amp; purchases</span></div>

  <div style={{ display: "flex", gap: 10, padding: "4px 18px 12px", flexShrink: 0 }}>
    {tabButton("sold", "Sold")}{tabButton("bought", "Bought")}
  </div>

  <div style={{
    flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
    padding: "2px 18px 30px"
  }}>{tab === "sold" ? <>{
    /* Said once, at the top, rather than left for somebody to work out
       from a list that does not mention a single item. The sentence is
       the whole difference between an honest screen and one that looks
       like it lost your data. */
  }<div style={{
    fontSize: 11, fontWeight: 600, color: T.inkFaint, lineHeight: 1.5, margin: "2px 2px 10px"
  }}>Money people paid you. <GloobalWordmark /> records the payment, not the basket, so
  this says who and how much rather than which items.</div>{
    sold.length ? <div style={{
      borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden"
    }}>{sold.map((row, i) => <CreatorLedgerRow
      key={row.txnId || `${row.name}-${i}`}
      first={i === 0}
      mark={<ArrowDownLeft3 size={16} color={T.positive} />}
      markTint={T.positiveSoft}
      title={row.name || "Someone"}
      subtitle={[row.date, row.time].filter(Boolean).join(" · ") || "—"}
      amount={row.amount}
      currency={row.currency}
      lens={lens}
      sign="+"
    />)}</div> : <CreatorLedgerEmpty
      title="Nothing has come in yet"
      body={handle
        ? `When somebody pays you at ${handle}, it lands here.`
        : "When somebody pays you, it lands here."}
    />
  }</> : <>{
    <div style={{
      fontSize: 11, fontWeight: 600, color: T.inkFaint, lineHeight: 1.5, margin: "2px 2px 10px"
    }}>What you bought from your suppliers, line by line, at the price it
    cost on the day.</div>
  }{loadError ? <div style={{
    fontSize: 11.5, fontWeight: 700, color: T.negative, textAlign: "center",
    padding: "0 10px 10px"
  }}>{loadError}</div> : null}{
    bought === null
      ? <div style={{
        fontSize: 12.5, color: T.inkFaint, fontWeight: 700, textAlign: "center", padding: "26px 18px"
      }}>Loading…</div>
      : bought.length ? <div style={{
        borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden"
      }}>{bought.map((row, i) => <CreatorLedgerRow
        key={row._id || row.id || `${row.title}-${i}`}
        first={i === 0}
        mark={<Package3 size={16} color={T.accent} />}
        markTint={T.accentSoft}
        title={`${Number(row.quantity) > 1 ? `${row.quantity} × ` : ""}${row.title || "Something"}`}
        subtitle={[
          row.supplierHandle || "",
          row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""
        ].filter(Boolean).join(" · ") || "—"}
        amount={row.amount}
        currency={row.currency}
        lens={lens}
        sign="-"
      />)}</div> : <CreatorLedgerEmpty
        title="You have not bought anything yet"
        body="Add a supplier on your page, buy from their list, and every line lands here with the price you paid."
      />
  }</>}</div></div>;
}
