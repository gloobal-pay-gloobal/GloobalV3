// src/features/coverage/LiquidityBoard.jsx
import { useState as useState101, useEffect as useEffect98 } from "react";
import { ChevronLeft as LiqBack, Landmark as LiqBank, Trophy as LiqTrophy, Eye as LiqEye, EyeOff as LiqEyeOff, RefreshCw as LiqRefresh } from "lucide-react";

// ── GLOOBAL COVERAGE → LIQUIDITY ─────────────────────────────────────────
//
// The founder, 11 Nov 2026: "a screen in GLOOBAL Coverage about who has the
// most at the current moment in GLOOBAL, including the total GLOOBAL bank
// and their own bank, so I see where I am in terms of liquidity".
//
// Three things, top to bottom:
//
//   1. The GLOOBAL bank: everything every member holds, as one figure.
//   2. Your bank: what you hold, your place, your share of the whole, how
//      many holders you are ahead of, and how far the next place is.
//   3. Who holds the most: the top twenty, by name, with each one's amount
//      and share. Your own row is marked; if you are further down, it is
//      pinned under the list.
//
// Everyone is on one board, converted into the currency Coverage is being
// read in. Names are shown; a member can take their own name off the board
// with the switch on their card (the row stays, as "Hidden member"). The
// rules are the server's: server/lib/liquidityBoard.js.

function liquidityMoney(amount, currency) {
  const n = Number(amount) || 0;
  // Whole units on a ranking: paise only add noise at these sizes.
  return fmtMoney(Math.round(n), currency).replace(/\.00(?=\D|$)/, "");
}

function LiquidityBoardScreen({ currency = "INR", onBack, onToast }) {
  const [data, setData] = useState101(null);
  const [failed, setFailed] = useState101(false);
  const [loading, setLoading] = useState101(true);
  const [saving, setSaving] = useState101(false);
  const [token, setToken] = useState101(0);
  useAppMapHere("coverage");
  useEffect98(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    GloobalApi.getLiquidityBoard(currency).then((d) => {
      if (!alive) return;
      setLoading(false);
      if (d) setData(d); else setFailed(true);
    });
    return () => { alive = false; };
  }, [currency, token]);

  const cur = data ? data.currency : String(currency || "INR").toUpperCase();
  const me = data && data.me;
  const setHidden = async (hidden) => {
    if (saving) return;
    setSaving(true);
    const ok = await GloobalApi.setLiquidityHidden(hidden);
    setSaving(false);
    if (ok) setToken((n) => n + 1);
    else onToast?.("Couldn't change that just now");
  };

  const medal = (rank) => rank === 1 ? "#E0A100" : rank === 2 ? "#8A94A6" : rank === 3 ? "#B4682C" : null;
  const row = (r, pinned) => {
    const m = medal(r.rank);
    return <div key={`${pinned ? "me" : "r"}-${r.rank}`} data-testid={pinned ? "liquidity-me-row" : "liquidity-row"} data-rank={r.rank} data-me={r.me ? "1" : "0"} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: `1px solid ${T.line}`, background: r.me ? "rgba(124,92,255,0.08)" : "transparent" }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: m || "rgba(0,0,0,0.05)", color: m ? "#fff" : T.inkSoft, fontSize: 12.5, fontWeight: 800 }}>{r.rank}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <b style={{ fontSize: 13.5, color: r.name ? T.ink : T.inkFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name || "Hidden member"}</b>
          {r.countryIso ? <span aria-hidden="true" style={{ fontSize: 13 }}>{isoToFlag(r.countryIso)}</span> : null}
          {r.me ? <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: T.accent, borderRadius: 999, padding: "2px 7px" }}>You</span> : null}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
          <span style={{ flex: 1, height: 5, borderRadius: 5, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, r.share))}%`, background: r.me ? T.accent : (m || "#9b86ff"), borderRadius: 5 }} /></span>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint, minWidth: 40, textAlign: "right" }}>{r.share}%</span>
        </span>
      </span>
      <b style={{ fontSize: 13.5, color: T.ink, whiteSpace: "nowrap", fontFamily: T.fontDisplay }}>{liquidityMoney(r.amount, cur)}</b>
    </div>;
  };

  const inTop = Boolean(me && data.top.some((r) => r.me));
  return <div data-testid="liquidity-board" style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 10px" }}>
      <button onClick={onBack} aria-label="Back" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><LiqBack size={18} color={T.ink} /></button>
      <span style={{ flex: 1 }}>
        <b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 18, color: T.ink }}>Liquidity</b>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft }}>Who holds what in GLOOBAL, right now</span>
      </span>
      <button onClick={() => setToken((n) => n + 1)} aria-label="Refresh" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><LiqRefresh size={16} color={T.accent} /></button>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12 }}>
      {!data && loading ? <div style={{ padding: 40, textAlign: "center", fontSize: 13, fontWeight: 700, color: T.inkSoft }}>Adding up the GLOOBAL bank…</div> : null}
      {!data && failed ? <div data-testid="liquidity-failed" style={{ padding: 28, textAlign: "center", fontSize: 13, fontWeight: 600, color: T.inkSoft, lineHeight: 1.5 }}>Couldn't load the board. Check your connection and tap refresh.</div> : null}
      {data ? <>
        {/* 1. The GLOOBAL bank */}
        <div data-testid="liquidity-total" style={{ borderRadius: 22, padding: "18px 18px 16px", background: T.gradButton, color: "#fff", boxShadow: "0 14px 34px rgba(91,61,245,0.28)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: 0.4, opacity: 0.9 }}><LiqBank size={15} color="#fff" />TOTAL GLOOBAL BANK</div>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 32, fontWeight: 800, letterSpacing: -0.8, marginTop: 6 }}>{liquidityMoney(data.total, cur)}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.9, marginTop: 4 }}>Held by {data.holders.toLocaleString()} {data.holders === 1 ? "member" : "members"} · the top {data.top.length} hold {data.topShare}%</div>
        </div>
        {/* 2. Your bank */}
        {me ? <div data-testid="liquidity-me" style={{ borderRadius: 20, padding: "16px 16px 14px", background: T.surface, boxShadow: T.shadowCard }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: T.inkFaint }}>YOUR BANK</span>
              <b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 26, color: T.ink, letterSpacing: -0.5, marginTop: 4 }}>{liquidityMoney(me.ownAmount, me.ownCurrency)}</b>
              {me.ownCurrency !== cur ? <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft }}>{liquidityMoney(me.amount, cur)} on this board</span> : null}
            </span>
            <span data-testid="liquidity-my-rank" style={{ textAlign: "center", borderRadius: 16, background: "rgba(124,92,255,0.1)", padding: "8px 14px", flexShrink: 0 }}>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: T.accent, letterSpacing: 0.4 }}>YOUR PLACE</span>
              <b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 22, color: T.accent }}>#{me.rank}</b>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>of {data.members.toLocaleString()}</span>
            </span>
          </div>
          {/* Where you sit between the least and the most. */}
          <div style={{ position: "relative", height: 8, borderRadius: 8, background: "rgba(0,0,0,0.06)", marginTop: 14 }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${me.aheadOf}%`, borderRadius: 8, background: T.gradButton }} />
            <span style={{ position: "absolute", top: -4, left: `calc(${me.aheadOf}% - 8px)`, width: 16, height: 16, borderRadius: "50%", background: "#fff", border: `3px solid ${T.accent}`, boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {[[`${me.share}%`, "of the GLOOBAL bank"], [`${me.aheadOf}%`, "of holders are behind you"], [me.toNext > 0 ? liquidityMoney(me.toNext, cur) : "—", me.toNext > 0 ? `to reach #${me.rank - 1}` : "you hold the most"]].map(([big, small]) => <span key={small} style={{ flex: 1, minWidth: 0, borderRadius: 12, background: T.bg, padding: "8px 8px 7px", textAlign: "center" }}>
              <b style={{ display: "block", fontSize: 14, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{big}</b>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.25, marginTop: 2 }}>{small}</span>
            </span>)}
          </div>
          <button data-testid="liquidity-hide" data-hidden={me.hidden ? "1" : "0"} onClick={() => setHidden(!me.hidden)} disabled={saving} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", gap: 10, border: "none", background: "transparent", padding: "6px 0 0", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            {me.hidden ? <LiqEyeOff size={16} color={T.inkSoft} /> : <LiqEye size={16} color={T.accent} />}
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>{me.hidden ? "Your name is hidden on this board" : "Your name shows on this board"}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.accent }}>{saving ? "Saving…" : me.hidden ? "Show it" : "Hide it"}</span>
          </button>
        </div> : null}
        {/* 3. Who holds the most */}
        <div style={{ borderRadius: 20, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 14px 11px" }}><LiqTrophy size={16} color={T.accent} /><b style={{ flex: 1, fontSize: 13.5, color: T.ink }}>Who holds the most</b><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>in {cur}</span></div>
          {data.top.length ? data.top.map((r) => row(r, false)) : <div style={{ padding: "18px 14px", fontSize: 13, fontWeight: 600, color: T.inkSoft, borderTop: `1px solid ${T.line}` }}>Nobody holds a balance yet.</div>}
          {me && !inTop ? <><div style={{ textAlign: "center", color: T.inkFaint, fontSize: 14, letterSpacing: 3, padding: "2px 0", borderTop: `1px solid ${T.line}` }}>···</div>{row(me, true)}</> : null}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.5, textAlign: "center", padding: "0 10px" }}>
          GLOOBAL balances only, converted to {cur} at today's rates. Members only.{data.unconverted ? ` ${data.unconverted} ${data.unconverted === 1 ? "balance is" : "balances are"} left out: no rate for their currency today.` : ""}
        </div>
      </> : null}
    </div>
  </div>;
}
