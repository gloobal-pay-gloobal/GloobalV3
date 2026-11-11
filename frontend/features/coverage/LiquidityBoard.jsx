// src/features/coverage/LiquidityBoard.jsx
import { useState as useState101, useEffect as useEffect98, useRef as useRef58 } from "react";
import { ChevronLeft as LiqBack, Landmark as LiqBank, Crown as LiqCrown, EyeOff as LiqEyeOff, RefreshCw as LiqRefresh, ArrowUp as LiqUp, LocateFixed as LiqLocate, ArrowDownToLine as LiqBottom } from "lucide-react";

// ── GLOOBAL COVERAGE → LIQUIDITY ─────────────────────────────────────────
//
// The founder, 11 Nov 2026: "a screen in GLOOBAL Coverage about who has the
// most at the current moment in GLOOBAL, including the total GLOOBAL bank
// and their own bank, so I see where I am in terms of liquidity". Then, the
// same evening: a better screen, let people hide themselves from the public
// board, and let everyone scroll as far as they like, to the last place.
//
// Top to bottom:
//
//   1. The GLOOBAL bank: everything every member holds, as one figure, over
//      the three who hold the most.
//   2. Your bank: what you hold, your place, your share,
//      how far the next place is, and the switch that takes
//      you off the public board (or puts you back).
//   3. The board: every listed member, largest first, read a page at a
//      time as the list is scrolled. Three jumps: the top, your place, the
//      last place, so nobody scrolls through a million rows to find one.
//
// Everyone is on one board, converted into the currency Coverage is being
// read in. The rules are the server's: server/lib/liquidityBoard.js.

var LIQUIDITY_PAGE_ROWS = 50;
var LIQUIDITY_AVATAR_COLORS = ["#7C5CFF", "#0FA372", "#E86A17", "#2F6FEB", "#D6336C", "#0B7285", "#9C36B5", "#C2410C"];

function liquidityMoney(amount) {
  // Whole units on a ranking: decimals only add noise at these sizes. The
  // board is read in CEL: one CEL is one unit of the reader's own money, so
  // the digits are the converted figure and only the label is the coin's.
  return `${Math.round(Number(amount) || 0).toLocaleString("en-US")} ${typeof COIN_TICKER === "string" ? COIN_TICKER : "CEL"}`;
}
// A flag sits centred in its own small circle, so every country takes the
// same round space beside a name whatever the shape of its flag.
function LiquidityFlag({ iso, size = 18 }) {
  if (!iso) return null;
  // The flag is drawn larger than the circle and clipped by it, so the
  // circle is filled edge to edge with the middle of the flag.
  return <span aria-hidden="true" data-testid="liquidity-flag" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, position: "relative", overflow: "hidden", boxShadow: `0 0 0 1px ${T.line}` }}><span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontSize: Math.round(size * 1.45), lineHeight: 1 }}>{isoToFlag(iso)}</span></span>;
}
function liquidityInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function liquidityColor(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.codePointAt(0)) % 9973;
  return LIQUIDITY_AVATAR_COLORS[h % LIQUIDITY_AVATAR_COLORS.length];
}
function LiquidityAvatar({ name, size = 36, ring }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: liquidityColor(name), color: "#fff", fontSize: Math.round(size * 0.36), fontWeight: 800, boxShadow: ring ? `0 0 0 3px ${ring}` : "none" }}>{liquidityInitials(name)}</span>;
}

function LiquidityBoardScreen({ currency = "INR", onBack, onToast }) {
  const [head, setHead] = useState101(null);      // totals and my card: the latest page's
  const [rows, setRows] = useState101([]);        // the contiguous stretch of the board loaded so far
  const [start, setStart] = useState101(0);       // the offset of rows[0]
  const [next, setNext] = useState101(null);      // the offset after rows, or null at the last place
  const [podium, setPodium] = useState101([]);    // the first three, from the top page
  const [view, setView] = useState101("top");     // top | me | last
  const [busy, setBusy] = useState101("first");   // "" | first | more | earlier | jump
  const [failed, setFailed] = useState101(false);
  const [saving, setSaving] = useState101(false);
  const scrollRef = useRef58(null);
  const busyRef = useRef58(false);
  const afterLoadRef = useRef58(null);
  useAppMapHere("coverage");

  // Reads one page. mode: replace (a jump), append (scrolling down),
  // prepend (earlier places).
  const load = async (offset, mode, limit = LIQUIDITY_PAGE_ROWS) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(mode === "append" ? "more" : mode === "prepend" ? "earlier" : head ? "jump" : "first");
    setFailed(false);
    const d = await GloobalApi.getLiquidityBoard(currency, offset, limit);
    busyRef.current = false;
    setBusy("");
    if (!d) { setFailed(true); return; }
    setHead(d);
    if (d.offset === 0 && mode !== "prepend") setPodium(d.rows.slice(0, 3));
    if (mode === "append") { setRows((cur) => cur.concat(d.rows)); setNext(d.nextOffset); }
    else if (mode === "prepend") {
      // Keep the row the person was looking at where it was.
      const box = scrollRef.current;
      const before = box ? box.scrollHeight - box.scrollTop : 0;
      setRows((cur) => d.rows.concat(cur));
      setStart(d.offset);
      afterLoadRef.current = () => { if (box) box.scrollTop = box.scrollHeight - before; };
    } else { setRows(d.rows); setStart(d.offset); setNext(d.nextOffset); }
  };
  useEffect98(() => { load(0, "replace"); }, [currency]);
  // After a page is drawn: whatever the jump asked for (my row, the bottom).
  useEffect98(() => { const f = afterLoadRef.current; afterLoadRef.current = null; if (f) f(); }, [rows]);

  const cur = head ? head.currency : String(currency || "INR").toUpperCase();
  const me = head && head.me;
  const jump = (to) => {
    if (!head) return;
    setView(to);
    const box = scrollRef.current;
    if (to === "top") { afterLoadRef.current = () => { if (box) box.scrollTop = 0; }; return load(0, "replace"); }
    if (to === "me" && me && !me.hidden) {
      afterLoadRef.current = () => { const el = box && box.querySelector("[data-me='1']"); if (el) el.scrollIntoView({ block: "center" }); };
      return load(Math.max(0, me.rank - 1 - 6), "replace");
    }
    if (to === "last") {
      afterLoadRef.current = () => { if (box) box.scrollTop = box.scrollHeight; };
      return load(Math.max(0, head.listed - LIQUIDITY_PAGE_ROWS), "replace");
    }
    return null;
  };
  const onScroll = (e) => {
    const box = e.currentTarget;
    if (next != null && !busyRef.current && box.scrollHeight - box.scrollTop - box.clientHeight < 500) load(next, "append");
  };
  const setHidden = async (hidden) => {
    if (saving) return;
    setSaving(true);
    const ok = await GloobalApi.setLiquidityHidden(hidden);
    setSaving(false);
    if (!ok) { onToast?.("Couldn't change that just now"); return; }
    // Back to the top, where the card that just changed is.
    setView("top");
    const box = scrollRef.current;
    afterLoadRef.current = () => { if (box) box.scrollTop = 0; };
    load(0, "replace");
  };

  const medal = (rank) => rank === 1 ? "#E0A100" : rank === 2 ? "#8A94A6" : rank === 3 ? "#B4682C" : null;
  const row = (r) => {
    const m = medal(r.rank);
    return <div key={r.rank} data-testid="liquidity-row" data-rank={r.rank} data-me={r.me ? "1" : "0"} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 14px", borderTop: `1px solid ${T.line}`, background: r.me ? "rgba(124,92,255,0.09)" : "transparent" }}>
      <span style={{ width: 34, textAlign: "center", flexShrink: 0, fontSize: r.rank > 9999 ? 10.5 : 12.5, fontWeight: 800, color: m || T.inkFaint, fontFamily: T.fontDisplay }}>{r.rank.toLocaleString()}</span>
      <LiquidityAvatar name={r.name} size={36} ring={m} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <b style={{ fontSize: 13.5, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name || "Member"}</b>
          <LiquidityFlag iso={r.countryIso} />
          {r.me ? <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: T.accent, borderRadius: 999, padding: "2px 7px" }}>You</span> : null}
        </span>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint, marginTop: 2 }}>{r.share}% of total</span>
      </span>
      <b style={{ fontSize: 13.5, color: T.ink, whiteSpace: "nowrap", fontFamily: T.fontDisplay }}>{liquidityMoney(r.amount).replace(/ \D+$/, "")}<span style={{ fontSize: 10, fontWeight: 800, color: T.inkFaint, marginLeft: 3 }}>{typeof COIN_TICKER === "string" ? COIN_TICKER : "CEL"}</span></b>
    </div>;
  };
  // The three who hold the most, as a podium: 2nd, 1st, 3rd.
  const podiumCol = (r, height) => r ? <div key={r.rank} data-testid="liquidity-podium" data-rank={r.rank} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
    {r.rank === 1 ? <LiqCrown size={18} color="#FFD75E" /> : <span style={{ height: 18 }} />}
    <LiquidityAvatar name={r.name} size={r.rank === 1 ? 52 : 42} ring="rgba(255,255,255,0.55)" />
    <b style={{ fontSize: 12, color: "#fff", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(r.name || "Member").split(/\s+/)[0]}{r.me ? " (you)" : ""}</b>
    <span style={{ width: "100%", height, borderRadius: "12px 12px 0 0", background: "rgba(255,255,255,0.16)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: "0 4px", boxSizing: "border-box" }}>
      <b style={{ fontFamily: T.fontDisplay, fontSize: 17, color: "#fff" }}>{r.rank}</b>
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap" }}>{liquidityMoney(r.amount, cur)}</span>
    </span>
  </div> : <div key={`e${height}`} style={{ flex: 1 }} />;
  const chip = (id, label, Icon, disabled) => <button key={id} data-testid={`liquidity-jump-${id}`} onClick={() => jump(id)} disabled={disabled || Boolean(busy)} style={{ flex: 1, height: 38, borderRadius: 999, border: `1.5px solid ${view === id ? T.accent : T.line}`, background: view === id ? "rgba(124,92,255,0.1)" : T.surface, color: disabled ? T.inkFaint : view === id ? T.accent : T.inkSoft, fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: disabled ? 0.55 : 1 }}><Icon size={14} />{label}</button>;

  return <div data-testid="liquidity-board" style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 10px" }}>
      <button onClick={onBack} aria-label="Back" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><LiqBack size={18} color={T.ink} /></button>
      <span style={{ flex: 1 }}>
        <b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 18, color: T.ink }}>Liquidity</b>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Who holds what in GLOOBAL, right now</span>
      </span>
      <button onClick={() => jump("top")} disabled={Boolean(busy)} aria-label="Refresh" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><LiqRefresh size={16} color={T.accent} /></button>
    </div>
    <div ref={scrollRef} onScroll={onScroll} data-testid="liquidity-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 16px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12 }}>
      {!head && busy ? <div style={{ padding: 40, textAlign: "center", fontSize: 13, fontWeight: 700, color: T.inkSoft }}>Adding up the GLOOBAL bank…</div> : null}
      {!head && failed ? <div data-testid="liquidity-failed" style={{ padding: 28, textAlign: "center", fontSize: 13, fontWeight: 600, color: T.inkSoft, lineHeight: 1.5 }}>Couldn't load the board. Check your connection and tap refresh.</div> : null}
      {head ? <>
        {/* 1. The GLOOBAL bank, over the three who hold the most */}
        <div data-testid="liquidity-total" style={{ borderRadius: 24, padding: "18px 16px 0", background: "linear-gradient(160deg, #3B1FA8 0%, #6B4DF8 55%, #8E73FF 100%)", color: "#fff", boxShadow: "0 16px 36px rgba(91,61,245,0.3)", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, opacity: 0.9 }}><LiqBank size={14} color="#fff" />TOTAL GLOOBAL BANK</div>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 34, fontWeight: 800, letterSpacing: -0.8, marginTop: 6, textAlign: "center" }}>{liquidityMoney(head.total, cur)}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.9, marginTop: 3, textAlign: "center" }}>Held by {head.holders.toLocaleString()} {head.holders === 1 ? "member" : "members"}{head.topCount ? ` · the top ${head.topCount} hold ${head.topShare}%` : ""}</div>
          {podium.length ? <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 14 }}>{[podiumCol(podium[1], 54), podiumCol(podium[0], 74), podiumCol(podium[2], 44)]}</div> : <div style={{ height: 16 }} />}
        </div>
        {/* 2. Your bank */}
        {me ? <div data-testid="liquidity-me" style={{ borderRadius: 20, padding: "16px 16px 6px", background: T.surface, boxShadow: T.shadowCard, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LiquidityAvatar name={me.name} size={46} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, color: T.inkFaint }}>YOUR BANK</span>
              <b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 24, color: T.ink, letterSpacing: -0.5 }}>{liquidityMoney(me.ownAmount, me.ownCurrency)}</b>
              {me.ownCurrency !== cur ? <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft }}>{liquidityMoney(me.amount, cur)} on this board</span> : null}
            </span>
            <span data-testid="liquidity-my-rank" style={{ textAlign: "center", borderRadius: 16, background: me.hidden ? "rgba(0,0,0,0.05)" : "rgba(124,92,255,0.1)", padding: "8px 13px", flexShrink: 0 }}>
              <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: me.hidden ? T.inkSoft : T.accent, letterSpacing: 0.4 }}>{me.hidden ? "WOULD BE" : "YOUR PLACE"}</span>
              <b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 21, color: me.hidden ? T.inkSoft : T.accent }}>#{me.rank.toLocaleString()}</b>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>of {(head.listed + (me.hidden ? 1 : 0)).toLocaleString()}</span>
            </span>
          </div>
          {/* Where you sit between the least and the most. */}
          <div style={{ position: "relative", height: 8, borderRadius: 8, background: "rgba(0,0,0,0.06)", marginTop: 14 }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${me.aheadOf}%`, borderRadius: 8, background: T.gradButton }} />
            <span style={{ position: "absolute", top: -4, left: `calc(${me.aheadOf}% - 8px)`, width: 16, height: 16, borderRadius: "50%", background: "#fff", border: `3px solid ${T.accent}`, boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {[[`${me.share}%`, "of total"], [me.toNext > 0 ? liquidityMoney(me.toNext, cur) : "—", me.toNext > 0 ? `to reach #${(me.rank - 1).toLocaleString()}` : "you hold the most"]].map(([big, small]) => <span key={small} style={{ flex: 1, minWidth: 0, borderRadius: 12, background: T.bg, padding: "8px 8px 7px", textAlign: "center" }}>
              <b style={{ display: "block", fontSize: 14, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{big}</b>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.25, marginTop: 2 }}>{small}</span>
            </span>)}
          </div>
          {/* On the public board, or off it. */}
          <button data-testid="liquidity-hide" data-hidden={me.hidden ? "1" : "0"} role="switch" aria-checked={!me.hidden} onClick={() => setHidden(!me.hidden)} disabled={saving} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", gap: 12, border: "none", borderTop: `1px solid ${T.line}`, background: "transparent", padding: "12px 0 10px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", fontSize: 13.5, color: T.ink }}>Show me on the public board</b>
              <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.35, marginTop: 2 }}>{saving ? "Saving…" : me.hidden ? "You're hidden. Nobody sees your name or balance here." : "Other members see your name, balance and place."}</span>
            </span>
            <span aria-hidden="true" style={{ width: 46, height: 28, borderRadius: 14, background: me.hidden ? "rgba(0,0,0,0.15)" : T.accent, position: "relative", flexShrink: 0, transition: "background 180ms" }}><span style={{ position: "absolute", top: 3, left: me.hidden ? 3 : 21, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 180ms" }} /></span>
          </button>
        </div> : null}
        {/* 3. The board */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {chip("top", "Top", LiqUp, false)}
          {chip("me", "My place", LiqLocate, !me || me.hidden)}
          {chip("last", "Last place", LiqBottom, false)}
        </div>
        <div data-testid="liquidity-list" style={{ borderRadius: 20, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 14px 11px" }}><b style={{ flex: 1, fontSize: 13.5, color: T.ink }}>{head.listed.toLocaleString()} {head.listed === 1 ? "member" : "members"} on the board</b><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>1 {typeof COIN_TICKER === "string" ? COIN_TICKER : "CEL"} = 1 {cur}</span></div>
          {start > 0 ? <button data-testid="liquidity-earlier" onClick={() => { const from = Math.max(0, start - LIQUIDITY_PAGE_ROWS); load(from, "prepend", start - from); }} disabled={Boolean(busy)} style={{ width: "100%", border: "none", borderTop: `1px solid ${T.line}`, background: "transparent", padding: "11px 0", fontSize: 12.5, fontWeight: 800, color: T.accent, fontFamily: "inherit", cursor: "pointer" }}>{busy === "earlier" ? "Loading…" : `Show places ${(Math.max(0, start - LIQUIDITY_PAGE_ROWS) + 1).toLocaleString()} to ${start.toLocaleString()}`}</button> : null}
          {rows.length ? rows.map(row) : <div style={{ padding: "18px 14px", fontSize: 13, fontWeight: 600, color: T.inkSoft, borderTop: `1px solid ${T.line}` }}>Nobody is on the board yet.</div>}
          {next != null ? <div data-testid="liquidity-more" style={{ padding: "13px 0", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: T.inkFaint, borderTop: `1px solid ${T.line}` }}>{failed ? <button onClick={() => load(next, "append")} style={{ border: "none", background: "transparent", color: T.accent, fontWeight: 800, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>Couldn't load more. Tap to try again.</button> : "Loading more…"}</div>
            : rows.length ? <div data-testid="liquidity-end" style={{ padding: "13px 0", textAlign: "center", fontSize: 12, fontWeight: 700, color: T.inkFaint, borderTop: `1px solid ${T.line}` }}>The last place · that's everyone on the board</div> : null}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.5, textAlign: "center", padding: "0 10px", flexShrink: 0 }}>
          GLOOBAL balances only, converted at today's rates and shown in CEL (1 CEL = 1 {cur}). Members only.
          {head.hiddenCount ? <span style={{ display: "block" }}><LiqEyeOff size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />{head.hiddenCount.toLocaleString()} {head.hiddenCount === 1 ? "member has" : "members have"} hidden themselves; their balances still count in the total.</span> : null}
          {head.unconverted ? <span style={{ display: "block" }}>{head.unconverted} {head.unconverted === 1 ? "balance is" : "balances are"} left out: no rate for their currency today.</span> : null}
        </div>
      </> : null}
    </div>
  </div>;
}
