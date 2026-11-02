// src/features/creator/nameMarket.jsx
import { useState as useState85, useEffect as useEffect81, useRef as useRef45 } from "react";

// ── BUYING AND SELLING CREATOR NAMES (0211) ───────────────────────────────
//
// As the founder drew it: a taken name says who holds it and whether it is
// for sale, right in the name step; anyone may Ask to buy a name in use;
// both sides bargain in a small window with offer cards; the seller's Accept
// asks first for the shop's next name; the buyer pays within 24 hours with
// the PIN, and GLOOBAL holds the money only for the instant the name moves
// and the seller is paid. Only the name moves. No fee. Every name's history
// — dates, shops, prices — is public.

function nameFig(v, ccy, lens) {
  return geuLensMoney(Number(v) || 0, ccy || "INR", lens);
}

// In the name step, under "That name is taken": who has it, and what can be
// done about it.
function NameTakenCard({ handle, onOpen }) {
  const lens = useGeuLens();
  const [info, setInfo] = useState85(null);
  useEffect81(() => {
    let live = true;
    setInfo(null);
    if (handle) GloobalApi.getName(handle).then((r) => { if (live) setInfo(r); });
    return () => { live = false; };
  }, [handle]);
  if (!info || !info.taken || info.mine) return null;
  const h = info.holder || {};
  const canAsk = info.forSale || info.allowAsks;
  return <div data-testid="name-taken-card" style={{ marginTop: 12, borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{(h.name || handle).slice(0, 2).toUpperCase()}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, color: T.ink }}>{handle}</b><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>{[`Held by ${h.name || "a shop"}`, h.city, h.since ? `since ${new Date(h.since).getFullYear()}` : "", h.payers ? `${h.payers} payers` : ""].filter(Boolean).join(" · ")}</span></span>
      <span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "3px 8px", background: info.forSale ? T.positiveSoft : T.surfaceAlt, color: info.forSale ? T.positive : T.inkSoft, whiteSpace: "nowrap" }}>{info.forSale ? "For sale" : "In use"}</span>
    </div>
    {info.forSale ? <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{info.price !== null ? <>Asking {nameFig(info.price, info.currency, lens)} <span style={{ color: T.inkFaint, fontWeight: 700 }}>or make an offer</span></> : "Open to offers"}</div> : <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, lineHeight: 1.45 }}>{info.allowAsks ? "This name isn't for sale. You can ask the owner — they decide." : "This name isn't for sale, and the owner isn't taking requests."}</div>}
    {info.myThread ? <button type="button" data-testid="name-continue" onClick={() => onOpen({ mode: "thread", handle, info, threadId: info.myThread.id })} className="v2-tap" style={{ border: "none", borderRadius: 14, padding: "11px 8px", fontFamily: "inherit", fontWeight: 900, fontSize: 13, cursor: "pointer", background: T.gradButton, color: "#fff" }}>{info.myThread.status === "deal" ? `Pay ${nameFig(info.myThread.price, info.currency, lens)} — the deal is agreed` : "Continue your offer"}</button> : canAsk ? <div style={{ display: "flex", gap: 8 }}>
      <button type="button" data-testid="name-make-offer" onClick={() => onOpen({ mode: "name", handle, info })} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 14, padding: "11px 8px", fontFamily: "inherit", fontWeight: 900, fontSize: 13, cursor: "pointer", background: info.forSale && info.price !== null ? T.surface : T.gradButton, color: info.forSale && info.price !== null ? T.ink : "#fff", boxShadow: info.forSale && info.price !== null ? `inset 0 0 0 1.5px ${T.line}` : "none" }}>{info.forSale ? "Make an offer" : "Ask to buy"}</button>
      {info.forSale && info.price !== null ? <button type="button" data-testid="name-buy-now" onClick={() => onOpen({ mode: "buy", handle, info })} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 14, padding: "11px 8px", fontFamily: "inherit", fontWeight: 900, fontSize: 13, cursor: "pointer", background: T.gradButton, color: "#fff" }}>{`Buy for ${nameFig(info.price, info.currency, lens)}`}</button> : null}
    </div> : null}
    {info.history && info.history.length ? <div style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint }}>{`Changed hands ${info.history.length}× · last ${new Date(info.history[0].at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} for ${nameFig(info.history[0].price, info.history[0].currency, lens)}`}</div> : null}
  </div>;
}

function NameBubble({ m, mine, ccy, lens, other }) {
  if (m.from === "gloobal") return <div style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: 11.5, fontWeight: 700, color: T.inkSoft, background: T.surfaceAlt, borderRadius: 12, padding: "7px 11px" }}>{m.text}</div>;
  return <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", display: "flex", flexDirection: "column", gap: 5, alignItems: mine ? "flex-end" : "flex-start" }}>
    {m.text ? <div style={{ background: mine ? T.accent : T.surface, color: mine ? "#fff" : T.ink, boxShadow: mine ? "none" : T.shadowCard, borderRadius: 16, padding: "9px 12px", fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{m.text}</div> : null}
    {m.offer ? <div data-testid="name-offer-card" style={{ background: T.surface, boxShadow: `inset 0 0 0 2px ${mine ? T.accent : T.line}`, borderRadius: 16, padding: "9px 12px", minWidth: 150 }}><div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint }}>{mine ? "Your offer" : `Offer from ${other}`}</div><div style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 800, color: T.ink }}>{nameFig(m.offer, ccy, lens)}</div></div> : null}
    <span style={{ fontSize: 10, fontWeight: 700, color: T.inkFaint }}>{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
  </div>;
}

// The whole market in one screen: a name's card (offer / ask / buy), the
// bargain window, the deal and its payment, and the seller's side — the
// listing form and the offers. Above the shop setup (420), which it opens from.
function NameMarketScreen({ start, ccyCode = "INR", lens, shopSymbol, shops, onClose, onToast, onChanged }) {
  const [view, setView] = useState85(start.mode === "sell" ? "sell" : start.mode === "thread" ? "thread" : "compose");
  const [thread, setThread] = useState85(null);
  const [list, setList] = useState85(null);
  const [text, setText] = useState85("");
  const [offer, setOffer] = useState85("");
  const [busy, setBusy] = useState85(false);
  const [error, setError] = useState85("");
  const [next, setNext] = useState85({ first: "", last: "" });
  const [pinValue, setPinValue] = useState85("");
  const [target, setTarget] = useState85("new");
  const [listing, setListing] = useState85({ forSale: true, open: false, price: "", floor: "", allowAsks: true, nextFirst: "", nextLast: "" });
  const [done, setDone] = useState85(null);
  const endRef = useRef45(null);
  const info = start.info || null;
  const handle = (thread && thread.handle) || start.handle || "";
  const ccy = (thread && thread.currency) || (info && info.currency) || ccyCode;
  const fig = (v) => nameFig(v, ccy, lens);
  const clean = (v) => String(v).replace(/[^\d.]/g, "").slice(0, 10);

  // A response's thread keeps the other side's name the screen already has.
  const keep = (t) => setThread((prev) => (t ? { ...t, other: t.other || (prev && prev.other) || "" } : t));
  const loadThread = async (id) => { const r = await GloobalApi.nameThread(id); if (r && r.thread) keep(r.thread); return r && r.thread; };
  const loadList = async () => { try { const r = await GloobalApi.nameThreads(); setList(r); const l = r && r.listings && r.listings.find((x) => x.handle === handle); if (l) setListing({ forSale: l.forSale, open: l.price === null, price: l.price === null ? "" : String(l.price), floor: l.floor ? String(l.floor) : "", allowAsks: l.allowAsks !== false, nextFirst: (l.nextHandle || "").split(".")[0] || "", nextLast: (l.nextHandle || "").split(".").slice(1).join(".") }); } catch (e) { setList({ threads: [], filed: 0 }); } };
  useEffect81(() => {
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    if (start.mode === "thread" && start.threadId) loadThread(start.threadId);
    if (start.mode === "sell") loadList();
    if (start.mode === "buy") (async () => { setBusy(true); try { const r = await GloobalApi.buyName(start.handle); setThread(r.thread); setView("thread"); } catch (e) { setError((e && e.message) || "Couldn't start that."); setView("compose"); } finally { setBusy(false); } })();
    return () => fire(false);
  }, []);
  useEffect81(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [thread && thread.messages && thread.messages.length, view]);

  const run = async (fn) => { setBusy(true); setError(""); try { await fn(); } catch (e) { setError((e && e.message) || "Couldn't do that just now."); } finally { setBusy(false); } };
  const send = () => run(async () => {
    const o = offer ? Number(offer) : null;
    const r = thread ? await GloobalApi.nameMessage(thread.id, { text, offer: o }) : await GloobalApi.openNameThread(handle, { message: text, offer: o });
    keep(r.thread); setText(""); setOffer(""); setView("thread");
  });
  const accept = () => run(async () => { const r = await GloobalApi.acceptName(thread.id, { nextFirst: next.first, nextLast: next.last }); keep(r.thread); setView("thread"); });
  const pay = () => run(async () => {
    const r = await GloobalApi.payName(thread.id, { pin: pinValue, target });
    setPinValue("");
    keep(r.thread);
    setDone(r);
    setView("done");
    if (onChanged) onChanged();
  });
  const saveListing = () => run(async () => {
    await GloobalApi.listName({ shop: shopSymbol, forSale: listing.forSale, price: listing.forSale && !listing.open ? Number(listing.price) : null, floor: Number(listing.floor) || 0, allowAsks: listing.allowAsks, nextFirst: listing.nextFirst, nextLast: listing.nextLast });
    if (onToast) onToast(listing.forSale ? `${handle} is for sale` : "Saved");
    loadList();
  });

  const role = thread ? thread.role : "buyer";
  const other = (thread && thread.other) || (info && info.holder && info.holder.name) || "";
  const back = () => {
    if (view === "accept" || view === "pay") { setView("thread"); return; }
    if (view === "thread" && start.mode === "sell") { setThread(null); setView("sell"); loadList(); return; }
    onClose();
  };
  const title = { compose: handle, thread: handle, accept: "Accept the offer", pay: "Buy the name", done: "", sell: `Sell ${handle}` }[view] || handle;
  const input = (id, label, value, set, extra = {}) => <label htmlFor={id} style={{ display: "block", flex: extra.flex || "initial", background: T.surface, borderRadius: 14, padding: "8px 12px", boxShadow: `inset 0 0 0 1.5px ${T.line}` }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: T.inkFaint }}>{label}</span><input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode={extra.inputMode || "text"} placeholder={extra.placeholder || ""} autoComplete="off" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 15, fontWeight: 800, color: T.ink, padding: "2px 0 0" }} /></label>;
  const btn = (label, onClick, opts = {}) => <button type="button" data-testid={opts.testId} disabled={busy || opts.disabled} onClick={onClick} className="v2-tap" style={{ flex: opts.flex || 1, width: opts.flex ? undefined : "100%", border: "none", borderRadius: 14, padding: "13px 10px", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: busy || opts.disabled ? "default" : "pointer", background: opts.quiet ? T.surface : busy || opts.disabled ? T.surfaceAlt : T.gradButton, color: opts.quiet ? T.ink : busy || opts.disabled ? T.inkFaint : "#fff", boxShadow: opts.quiet ? `inset 0 0 0 1.5px ${T.line}` : "none" }}>{label}</button>;

  let body = null;
  let footer = null;

  if (view === "compose") {
    const asking = info && info.forSale && info.price !== null ? info.price : null;
    body = <>
      <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: 14 }}><b style={{ fontSize: 15, color: T.ink }}>{handle}</b><div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginTop: 3 }}>{info && info.forSale ? (asking !== null ? `Asking ${fig(asking)} · or make an offer` : "Open to offers") : "Not for sale — the owner decides. One request per person every 30 days."}</div></div>
      {input("name-msg", "Your message", text, setText, { placeholder: "Hi! Would you sell this name? I’m opening…" })}
      {input("name-offer", info && info.forSale ? "Your offer" : "Your first offer (optional)", offer, (v) => setOffer(clean(v)), { inputMode: "decimal", placeholder: asking !== null ? String(Math.round(asking * 0.8)) : "" })}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Phone numbers and links are hidden in the window, so nobody is asked to pay outside GLOOBAL.</div>
    </>;
    footer = btn(info && info.forSale ? "Send offer" : "Send request", send, { testId: "name-send", disabled: !text.trim() && !offer });
  } else if (view === "thread" && thread) {
    const deal = thread.status === "deal";
    body = <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: T.inkSoft }}><span>{role === "buyer" ? `With ${other}` : `${other} · buying ${thread.handle}`}</span>{thread.status !== "open" ? <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "3px 8px", background: thread.status === "paid" ? T.positiveSoft : T.accentSoft, color: thread.status === "paid" ? T.positive : T.accent }}>{{ deal: "Deal", paid: "Sold", lapsed: "Lapsed", closed: "Closed" }[thread.status]}</span> : null}</div>
      <div data-testid="name-window" style={{ display: "flex", flexDirection: "column", gap: 10 }}>{(thread.messages || []).map((m, i) => <NameBubble key={i} m={m} mine={m.from === role} ccy={ccy} lens={lens} other={other} />)}<span ref={endRef} /></div>
      {deal ? <div data-testid="name-deal" style={{ borderRadius: 18, background: T.surface, boxShadow: `inset 0 0 0 2px ${T.accent}, ${T.shadowCard}`, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: T.accent }}>Deal</div><div style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 800, color: T.ink }}>{`${thread.handle} · ${fig(thread.price)}`}</div><div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginTop: 4 }}>{`For the name only · ${role === "buyer" ? "pay" : "to be paid"} by ${new Date(thread.payBy).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${thread.nextHandle ? ` · the shop becomes ${thread.nextHandle}` : ""}`}</div></div> : null}
    </>;
    if (thread.status === "open") {
      footer = <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {role === "seller" && thread.lastOfferBy === "buyer" && thread.lastOffer ? btn(`Accept ${fig(thread.lastOffer)}`, () => { setNext({ first: "", last: "" }); setView("accept"); }, { testId: "name-accept" }) : null}
        {role === "buyer" && thread.lastOfferBy === "seller" && thread.lastOffer ? btn(`Offer ${fig(thread.lastOffer)}`, () => run(async () => { const r = await GloobalApi.nameMessage(thread.id, { text: "Agreed.", offer: thread.lastOffer }); keep(r.thread); }), { quiet: true, testId: "name-meet" }) : null}
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>{input("name-text", "Message…", text, setText, { flex: 2 })}{input("name-amount", "₹ Offer", offer, (v) => setOffer(clean(v)), { inputMode: "decimal", flex: 1 })}{btn("➤", send, { flex: "0 0 52px", testId: "name-send", disabled: !text.trim() && !offer })}</div>
      </div>;
    } else if (deal && role === "buyer") {
      footer = btn(`Pay ${fig(thread.price)}`, () => { const empty = ((shops && shops.shops) || []).find((x) => !x.handle); setTarget(empty ? empty.symbolId : "new"); setView("pay"); }, { testId: "name-pay" });
    }
  } else if (view === "accept" && thread) {
    body = <>
      <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>{`${other} offers`}</div><div style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 800, color: T.ink }}>{fig(thread.lastOffer)}</div></div>
      <div style={{ fontSize: 14, fontWeight: 900, color: T.ink }}>Pick your shop's new name first</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, lineHeight: 1.45 }}>{`Only ${thread.handle} moves. Your items, reviews, look and money all stay, under the new name.`}</div>
      <div style={{ display: "flex", gap: 8 }}>{input("name-next-first", "New name", next.first, (v) => setNext((n) => ({ ...n, first: v })), { flex: 1 })}{input("name-next-last", "Second part (optional)", next.last, (v) => setNext((n) => ({ ...n, last: v })), { flex: 1 })}</div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, fontWeight: 700, color: T.inkSoft, lineHeight: 1.7 }}><li>{`You accept — ${other} is asked to pay within 24 hours.`}</li><li>Your shop takes its new name the moment they pay.</li><li>{`${fig(thread.lastOffer)} lands in your balance. No fee.`}</li></ol>
    </>;
    footer = btn("Accept and keep my shop", accept, { testId: "name-accept-confirm", disabled: !next.first.trim() });
  } else if (view === "pay" && thread) {
    const own = (shops && shops.shops) || [];
    body = <>
      <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: T.accent }}>Agreed</div><div style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 800, color: T.ink }}>{`${thread.handle} · ${fig(thread.price)}`}</div></div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, fontWeight: 700, color: T.inkSoft, lineHeight: 1.7 }}><li>You pay — GLOOBAL holds it, not the seller yet.</li><li>The name moves to you, by itself.</li><li>The seller is paid, the same moment. If anything fails, nothing is taken.</li></ol>
      <div style={{ fontSize: 12, fontWeight: 900, color: T.ink }}>Which shop gets the name?</div>
      <div role="radiogroup" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{[{ symbolId: "new", label: "A new shop" }, ...own.map((s) => ({ symbolId: s.symbolId, label: s.name || s.handle || "Unnamed shop", sub: s.handle ? "its name is replaced" : "" }))].map((o) => <button key={o.symbolId} type="button" role="radio" aria-checked={target === o.symbolId} onClick={() => setTarget(o.symbolId)} className="v2-tap" style={{ border: "none", borderRadius: 12, padding: "8px 11px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: "pointer", background: T.surface, color: T.ink, boxShadow: target === o.symbolId ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1.5px ${T.line}` }}>{o.label}{o.sub ? <span style={{ display: "block", fontSize: 10, color: T.inkFaint }}>{o.sub}</span> : null}</button>)}</div>
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: T.inkSoft }}>{`Enter your PIN to pay ${fig(thread.price)}`}</div>
      <div aria-label={`${pinValue.length} digits entered`} style={{ display: "flex", gap: 12, justifyContent: "center" }}>{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: i < pinValue.length ? T.ink : T.line }} />)}</div>
      <BankKeypad onDigit={(d) => setPinValue((p) => (p.length < 6 ? p + d : p))} onDelete={() => setPinValue((p) => p.slice(0, -1))} />
    </>;
    footer = btn(busy ? "Paying…" : `Pay ${fig(thread.price)}`, pay, { testId: "name-pay-confirm", disabled: pinValue.length < 4 });
  } else if (view === "done" && thread) {
    body = <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 20, textAlign: "center" }}>
      <span aria-hidden="true" style={{ width: 76, height: 76, borderRadius: "50%", background: T.positiveSoft, color: T.positive, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900 }}>✓</span>
      <div data-testid="name-yours" style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 800, color: T.ink }}>{`${thread.handle} is yours`}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>{`Paid ${fig(thread.price)} · held and released by GLOOBAL`}</div>
      <div style={{ width: "100%", borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: "6px 14px", textAlign: "left" }}>{["Paid into the hold", "Name moved to you", "Seller paid"].map((k, i) => <div key={k} style={{ display: "flex", gap: 8, padding: "9px 0", borderTop: i ? `1px solid ${T.line}` : "none", fontSize: 13, fontWeight: 800, color: T.ink }}><span style={{ color: T.positive }}>✓</span>{k}</div>)}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.45 }}>For 30 days, people paying this name see it changed hands.</div>
    </div>;
    footer = btn("Done", onClose, { testId: "name-done" });
  } else if (view === "sell") {
    const threads = (list && list.threads) || [];
    const mineAsSeller = threads.filter((t) => t.role === "seller" && t.handle === handle);
    body = <>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>Only the name — you keep your shop.</div>
      <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 800, color: T.ink }}><input type="checkbox" checked={listing.forSale} onChange={(e) => setListing((l) => ({ ...l, forSale: e.target.checked }))} style={{ width: 20, height: 20 }} />For sale<span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.inkFaint }}>shows “For sale” to anyone who searches it</span></label>
        {listing.forSale ? <>
          <div role="radiogroup" style={{ display: "flex", gap: 8 }}>{[[false, "Asking price"], [true, "Open to offers"]].map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={listing.open === v} onClick={() => setListing((x) => ({ ...x, open: v }))} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 12, padding: "10px 6px", fontFamily: "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer", background: listing.open === v ? T.accentSoft : T.surface, color: listing.open === v ? T.accent : T.inkSoft, boxShadow: listing.open === v ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1.5px ${T.line}` }}>{l}</button>)}</div>
          {!listing.open ? input("name-price", "Asking", listing.price, (v) => setListing((l) => ({ ...l, price: clean(v) })), { inputMode: "decimal" }) : null}
          {input("name-floor", "Don't show me offers under", listing.floor, (v) => setListing((l) => ({ ...l, floor: clean(v) })), { inputMode: "decimal" })}
          {!listing.open ? <><div style={{ fontSize: 12, fontWeight: 900, color: T.ink }}>Your shop's next name</div><div style={{ display: "flex", gap: 8 }}>{input("name-sell-first", "New name", listing.nextFirst, (v) => setListing((l) => ({ ...l, nextFirst: v })), { flex: 1 })}{input("name-sell-last", "Second part", listing.nextLast, (v) => setListing((l) => ({ ...l, nextLast: v })), { flex: 1 })}</div></> : null}
        </> : null}
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 800, color: T.ink }}><input type="checkbox" checked={listing.allowAsks} onChange={(e) => setListing((l) => ({ ...l, allowAsks: e.target.checked }))} style={{ width: 20, height: 20 }} />Let people ask<span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.inkFaint }}>one request per person every 30 days</span></label>
      </div>
      <div style={{ borderRadius: 14, padding: "10px 12px", background: T.surfaceAlt, color: T.inkSoft, fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>{`When it sells, your shop takes a new name. People who saved ${handle} reach the new owner — they see “New owner” for 30 days. No fee.`}</div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkSoft, padding: "4px 2px 0" }}>{`Offers · ${mineAsSeller.length}`}</div>
      <div data-testid="name-offers" style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{mineAsSeller.length ? mineAsSeller.map((t, i) => <button key={t.id} type="button" onClick={() => { loadThread(t.id).then(() => setView("thread")); }} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}><span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 }}>{(t.other || "?").slice(0, 2).toUpperCase()}</span><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>{t.other}</b><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.kind === "ask" ? "Asked to buy" : (t.lastText ? `“${t.lastText}”` : "Offer")}</span></span><b style={{ fontSize: 13.5, color: T.ink, whiteSpace: "nowrap" }}>{t.lastOffer ? fig(t.lastOffer) : "—"}</b></button>) : <div style={{ padding: 16, fontSize: 12.5, color: T.inkFaint, textAlign: "center", fontWeight: 700 }}>No offers yet.</div>}</div>
      {list && list.filed ? <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, textAlign: "center" }}>{`${list.filed} offer${list.filed === 1 ? "" : "s"} under your floor ${list.filed === 1 ? "was" : "were"} filed away`}</div> : null}
    </>;
    footer = btn(listing.forSale ? "Put it up for sale" : "Save", saveListing, { testId: "name-list-save", disabled: listing.forSale && !listing.open && (!(Number(listing.price) > 0) || !listing.nextFirst.trim()) });
  }

  return <div data-testid="name-market" style={{ position: "fixed", inset: 0, zIndex: 440, background: T.bg, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px", flexShrink: 0 }}><NavBackButton onClick={back} /><span style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>{info && info.forSale && info.price !== null && view === "thread" ? <span style={{ fontSize: 11.5, fontWeight: 800, color: T.inkFaint }}>{`Asking ${fig(info.price)}`}</span> : null}</div>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>{busy && !thread && view !== "sell" && view !== "compose" ? <div role="status" style={{ padding: 30, textAlign: "center", color: T.inkFaint, fontWeight: 700 }}>One moment…</div> : body}{error ? <div role="alert" style={{ borderRadius: 12, padding: "10px 12px", background: T.negativeSoft, color: T.negative, fontSize: 12.5, fontWeight: 700 }}>{error}</div> : null}</div>
    {footer ? <div style={{ flexShrink: 0, padding: "10px 18px calc(14px + env(safe-area-inset-bottom, 0px))" }}>{footer}</div> : null}
  </div>;
}
