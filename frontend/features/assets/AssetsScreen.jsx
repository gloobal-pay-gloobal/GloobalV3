// src/features/assets/AssetsScreen.jsx
import React2, { useState as useState10, useEffect as useEffect53, Fragment } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, TrendingUp, Sprout, Landmark as Landmark3, History as HistorySettle, RotateCcw as RestartSettle, CreditCard as CardSettle, Check as CheckSettle, Loader as LoaderSettle } from "lucide-react";
function AssetsScreen({ onClose, ccy, ccyCode = "USD", assetRows, onViewPayLater, onViewDetail, onRequestSettle, symbolId = "", historyRefresh = 0 }) {
  // Every figure on this screen is the account's own money in the account's
  // own currency, so the lens applies to all of them or none. Read from the
  // shared store the balance card's toggle writes.
  const lens = useGeuLens();

  // ── THE MAP BUTTON SAT ON THE SETTLE BUTTON ─────────────────────────
  //
  // AppMapButton is fixed at z-index 10000 against the right edge, and on
  // this screen it lands across the end of "Settle … to Gloobal Bank" —
  // so the button stopped saying where the money was going. Seen on the
  // founder's phone, not here.
  //
  // Hidden rather than nudged, which is what the scanner, the creator page
  // and every other full-screen overlay in this app already do with the
  // same event. The map belongs to the dashboard; a screen stacked on top
  // of it is not a place to open one from.
  useEffect53(() => {
    if (typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  const [assetsExpanded, setAssetsExpanded] = useState10(false);
  // Settle asks first (a short sheet that says what settling does), and
  // the history of settlements is one tap away in the top-right corner.
  const [confirmOpen, setConfirmOpen] = useState10(false);
  const [historyOpen, setHistoryOpen] = useState10(false);
  useBackClose(confirmOpen, () => setConfirmOpen(false));
  useBackClose(historyOpen, () => setHistoryOpen(false));
  const totalAssets = assetRows.reduce((s, r) => s + r.value, 0);
  // This number used to sit on the wallet card under the heading "Future
  // assets" — totalSpending relabelled, drawn at the same size, weight and
  // colour as the real balance beside it, with no horizon and no "if". Two
  // numbers side by side on a balance card read as two balances, and one
  // of them was money that had already left.
  //
  // It is here again on purpose, in the one place where it is not a
  // balance claim: the far end of the chain, small, under the bar, with
  // the years attached. Everything the seeds grow toward IS the spending,
  // returned in full — that is the whole point of the screen and it cannot
  // be made without printing the figure.
  const totalSpending = assetRows.reduce((s, r) => s + r.amountPaid, 0);
  const avgMonthsToTarget = assetRows.length ? assetRows.reduce((s, r) => s + r.monthsToTarget, 0) / assetRows.length : 0;
  // The horizon printed beside the total is the LONGEST seed, not the
  // average of them.
  //
  // The number it qualifies is totalSpending — the point at which every
  // seed has grown back to the payment it came from. That happens when the
  // last one arrives, not when the typical one does. These mature 25.1 to
  // 41.1 years apart, so the average would have promised the full total
  // sixteen years before it exists. The average still has a place, but it
  // is a fact about the seeds and it lives with them, further down.
  const maxMonthsToTarget = assetRows.length ? Math.max(...assetRows.map((r) => r.monthsToTarget)) : 0;
  // How much of everything ever spent has come back and is sitting here
  // now. This is a ratio of two real balances, and the label says exactly
  // that — "of what you spent" — because it is NOT progress earned.
  //
  // A seed is worth its cashback the day it is planted, so a fresh account
  // already reads a few percent before anything has grown. Calling that
  // "5.2% of the way" would credit the person with a journey they have not
  // taken; calling it "5.2% of what you spent" is just true.
  const pctOfSpend = totalSpending > 0 ? Math.min(100, totalAssets / totalSpending * 100) : 0;
  const rowColor = (i) => POSITION_COLORS[i % POSITION_COLORS.length];
  // ── THE HEADLINE, AND WHY ONLY THE HEADLINE ───────────────────────────
  //
  // The bar goes on the figure that is READ AS A FIGURE — the one at the
  // top of this card, which is the whole reason anybody opens this screen.
  // It is deliberately NOT on the four other amounts below it, and the line
  // between them is worth stating because it decides this everywhere:
  //
  //   a figure standing alone gets the bar       4,000.00₹ │ GEU
  //   a figure inside a sentence does not        "Settle 4,000.00₹ to
  //                                               Gloobal Bank"
  //
  // In a sentence the words already say what the number is, and a bar
  // breaks the sentence in half. The seed rows are the same call for a
  // second reason: they are a chain — paid → now → target, three figures at
  // 10px joined by arrows — and a bar after each would be more punctuation
  // than number.
  //
  // ccyCode on both sides: every figure on this screen is the viewer's own
  // money in the viewer's own currency, so there is no counterparty amount
  // here for the own-money rule to protect.
  const assetsTotalText = geuLensBarMoney(totalAssets, ccyCode, lens, ccyCode);
  // 284px is this card's inner width on a 360px phone, after the page's
  // padding and the card's own. Floor of 14 rather than the balance's 13:
  // this card has one figure on it and no competition for the width.
  const assetsTotalSize = geuLensRowFontSize(assetsTotalText, 30, 284, 14);
  const assetsTotalParts = geuLensBarParts(totalAssets, ccyCode, lens, ccyCode);
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><AppSymbolBg zIndex={-1} /><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onClose} /><span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>My Assets</span><button
    type="button"
    onClick={() => setHistoryOpen(true)}
    aria-label="Settlement history"
    data-testid="assets-settlement-history"
    className="v2-tap"
    style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
  ><HistorySettle size={19} color={T.accent} /></button></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}>{
    /* The whole chain, in one card: what is here now, how much of the
       spending that is, and where it lands.

       This replaced a three-word "Spending → Earnings → Assets" strip.
       Three bare nouns state an order that was never in doubt; they carry
       no quantity, so they explain nothing. The same chain with its
       numbers attached is the only version that says something — that the
       destination is the spending itself, returned in full. */
  }<div style={{ borderRadius: T.radiusLg, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "20px" }}><div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>Current assets</div><div style={{ fontSize: assetsTotalSize, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, letterSpacing: -0.7, marginTop: 3, whiteSpace: "nowrap" }}>{assetsTotalParts.lead}{assetsTotalParts.trail && <span style={{ fontSize: geuLensTrailSize(assetsTotalSize), fontWeight: 800 }}> {assetsTotalParts.trail}</span>}</div><div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.18)", overflow: "hidden", marginTop: 16 }}><div
    style={{
      // Same rule as every other bar in the app: a floor so a tiny real
      // value is a visible sliver, but zero draws nothing at all.
      width: pctOfSpend > 0 ? `${Math.max(pctOfSpend, 1.5)}%` : 0,
      height: "100%",
      borderRadius: 99,
      background: "#fff",
      transition: "width 0.3s ease"
    }}
  /></div><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}><span>{pctOfSpend.toFixed(1)}% of what you spent</span><span style={{ textAlign: "right" }}><GeuFigure amount={totalSpending} currency={ccyCode} lens={lens} size={10.5} />{maxMonthsToTarget > 0 ? ` · ~${(maxMonthsToTarget / 12).toFixed(0)} yrs` : ""}</span></div></div>{
    /* Settle — moves the real current assets total into the real
       Gloobal Bank balance, gated behind verification. Disabled at
       zero, since there's genuinely nothing to settle then. */
  }<button
    onClick={() => setConfirmOpen(true)}
    data-testid="assets-settle"
    disabled={totalAssets <= 0}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 0,
      border: "none",
      borderRadius: T.radiusMd,
      padding: "12px 14px",
      background: totalAssets > 0 ? T.gradButton : T.surfaceAlt,
      color: totalAssets > 0 ? "#fff" : T.inkFaint,
      fontSize: 13.5,
      fontWeight: 800,
      cursor: totalAssets > 0 ? "pointer" : "not-allowed",
      boxShadow: totalAssets > 0 ? "0 8px 20px rgba(124,58,237,0.3)" : "none"
    }}
  >{
    /* ── THE AMOUNT GETS ITS OWN LINE ─────────────────────────────────
       This was one line: icon, "Settle", the figure, "to Gloobal Bank".
       It fitted while a figure was "256,334.91₹"; with its other name
       beside it the line ran past the button and was cut to "to Gloobal
       Ba…", so the button no longer said where the money was going.
       Two lines rather than a smaller font, because the alternative is a
       figure that shrinks as it grows — exactly backwards for the number
       a person is about to act on. */
  }<span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, padding: "3px 0" }}><Landmark3 size={17} />
    <span>Settle to <GloobalWordmark /> Bank</span></span>
        </button>{
    /* One row per seed, each carrying its own chain end to end:
       what was paid, what it is worth today, and what it grows back
       to and when.

       The three-column table this replaced squeezed a name, a date, a
       rate, a bar and a duration into a phone width, and the thing it
       could not show was the one that matters — that a 0.74% seed starts
       seven times lower than a 5% one and lands sixteen years later. A
       full-width row has the room to print both ends of that journey
       instead of asking the reader to infer it from a stub of a bar. */
  }<div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
            Each seed, end to end
          </div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{assetRows.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing yet</div> : (assetsExpanded ? assetRows : assetRows.slice(0, 4)).map((r, i) => {
    const paid = Number(r.amountPaid) || 0;
    const now = Number(r.value) || 0;
    // Progress is this seed's current value against the payment it came
    // from — the same two numbers the chain underneath it prints, so the
    // bar and the words can never disagree.
    const pct = paid > 0 ? Math.min(100, now / paid * 100) : 0;
    const color = rowColor(i);
    return <button
      key={r.key}
      onClick={() => onViewDetail(r.key)}
      aria-label={`${r.business} — growth details`}
      className="v2-row"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
    >{
      /* Creator Share seeds keep their flip-symbol circle; everything
         else gets a sprout in the colour its bar is drawn in, so the
         row's marker and its progress are the same colour. */
    }{r.chip === "CS" ? <FlipSymbolCircle size={28} /> : <span style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}><Sprout size={14} color={color} /></span>}<span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.business}</span>{r.date ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: T.inkFaint }}>{r.date}</span> : null}</span><span style={{ display: "block", marginTop: 5, height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}><span
      style={{
        width: pct > 0 ? `${Math.max(pct, 2)}%` : 0,
        height: "100%",
        display: "block",
        borderRadius: 99,
        background: color,
        transition: "width 0.3s ease"
      }}
    /></span><span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: 10, fontWeight: 700, color: T.inkFaint, whiteSpace: "nowrap", overflow: "hidden" }}><span style={{ flexShrink: 0 }}><GeuFigure amount={paid} currency={ccyCode} lens={lens} size={10} /></span><ArrowRight size={10} style={{ flexShrink: 0 }} /><span style={{ flexShrink: 0, color: T.positive }}><GeuFigure amount={now} currency={ccyCode} lens={lens} size={10} /></span>{
      /* ── THE CHAIN USED TO END BY REPRINTING ITS OWN FIRST FIGURE ───
         paid → worth now → paid. The third was the same number as the
         first, on the same line, four centimetres away.
         It survived as long as a figure was "250.00₹". Once every figure
         carried its other name it became "250.00₹ │ GEU" three times
         over, the row ran out of width, and the repeat was ellipsized to
         "250.0…" — which is the worst of both: still taking the space,
         no longer stating the number.
         So it is gone, and the horizon says what it was there to say.
         "back in 31.6 yr" can only mean back to the figure at the front
         of the line, and that figure is printed in full. */
    }<span style={{ flexShrink: 0 }}>back in {(r.monthsToTarget / 12).toFixed(1)} yr</span></span></span></button>;
  })}</div>{assetRows.length > 4 && <button
    onClick={() => setAssetsExpanded((v) => !v)}
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", background: "none", padding: "12px 4px 4px", cursor: "pointer" }}
  ><span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{assetsExpanded ? "Show less" : `View all spending (${assetRows.length})`}</span><ChevronRight size={13} color={T.accent} style={{ transform: assetsExpanded ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }} /></button>}{
    /* Average time-to-fully-compound — only shown once the
       full list is expanded, as the total that summarizes it. */
  }{assetsExpanded && <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", marginTop: 12 }}><span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><TrendingUp size={17} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>Avg. time to fully compound</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: 1 }}>
                  Average across all {assetRows.length} asset{assetRows.length === 1 ? "" : "s"}, to reach 100% of spend
                </span></span><span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flexShrink: 0 }}>{(avgMonthsToTarget / 12).toFixed(1)} yr
              </span></div>}</div>{
    /* The rates, as one quiet line. These were three cards the size of
       the settle button — the same visual weight as the action — for
       three constants that never change and that nobody opens this
       screen to read. */
  }<div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px", padding: "0 2px", fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}><span>Cashback 0–7%</span><span>Growth {(ASSET_GROWTH_RATE_MONTHLY * 100).toFixed(0)}%/mo</span><span>Compounded monthly</span></div>{
    /* PayLater. Same fact as before — this total is also the limit —
       but as its own row at the foot of the screen rather than a line
       inside the balance card, where "= your PayLater limit" sat close
       enough to the total to read as part of it. */
  }<button
    onClick={onViewPayLater}
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", borderTop: `1px solid ${T.line}`, background: "none", padding: "12px 2px 0", cursor: "pointer", textAlign: "left" }}
  ><span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>
            Your assets are also your PayLater limit
          </span><ChevronRight size={14} color={T.inkFaint} style={{ flexShrink: 0 }} /></button></div>{confirmOpen && <AssetsSettleSheet
    symbolId={symbolId}
    ccyCode={ccyCode}
    lens={lens}
    localTotal={totalAssets}
    seedCount={assetRows.length}
    onCancel={() => setConfirmOpen(false)}
    onConfirm={() => { setConfirmOpen(false); if (onRequestSettle) onRequestSettle(); }}
  />}{historyOpen && <AssetsSettlementHistory
    symbolId={symbolId}
    ccyCode={ccyCode}
    lens={lens}
    refreshKey={historyRefresh}
    onClose={() => setHistoryOpen(false)}
  />}</div>;
}

// ── BEFORE SETTLING: WHAT HAPPENS ──────────────────────────────────────────
//
// "Don't settle directly. Ask, and tell them what happens after." Three
// short facts and one tick, then the usual Face ID / PIN gate. The figure
// is the server's — what the settle route will actually pay — so the sheet
// and the payout cannot disagree; the screen's own total is shown only
// while that is being read.
function AssetsSettleSheet({ symbolId, ccyCode, lens, localTotal, seedCount, onCancel, onConfirm }) {
  const [server, setServer] = useState10(null);
  const [dues, setDues] = useState10(0);
  const [agreed, setAgreed] = useState10(false);
  useEffect53(() => {
    let alive = true;
    if (!symbolId || typeof GloobalApi === "undefined") return undefined;
    Promise.all([GloobalApi.getAssets(symbolId), GloobalApi.getPaylater(symbolId)]).then(([a, p]) => {
      if (!alive) return;
      if (a) setServer(a);
      if (p) setDues(Number(p.pendingDues) || 0);
    });
    return () => { alive = false; };
  }, [symbolId]);
  const amount = server ? server.totalClaimable : localTotal;
  const count = server ? server.seeds.length : seedCount;
  const point = (Icon, color, title, text) => <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={color} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{title}</span><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{text}</span></span></div>;
  return <div role="dialog" aria-modal="true" aria-label="Settle to GLOOBAL Bank" style={{ position: "fixed", inset: 0, zIndex: 320, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}><div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(20,18,43,0.45)" }} /><div data-testid="assets-settle-sheet" style={{ position: "relative", background: T.bg, borderRadius: "26px 26px 0 0", padding: "10px 18px calc(18px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -12px 40px rgba(20,18,43,0.25)", maxHeight: "92vh", overflowY: "auto" }}><div style={{ width: 40, height: 4, borderRadius: 99, background: T.line, margin: "0 auto 14px" }} /><div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Settle to <GloobalWordmark /> Bank?</div><div style={{ marginTop: 12, borderRadius: 18, background: T.gradButton, color: "#fff", padding: "14px 16px" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>You receive</div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.fontDisplay, marginTop: 2, whiteSpace: "nowrap" }}>{server ? <GeuFigure amount={amount} currency={ccyCode} lens={lens} size={24} /> : <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15 }}><LoaderSettle size={16} style={{ animation: "spin 0.9s linear infinite" }} />Checking…</span>}</div><div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{`from ${count} ${count === 1 ? "seed" : "seeds"}`}</div></div><div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>{point(Landmark3, T.accent, "It moves into your bank balance", "Spend it or send it like any other money.")}{point(RestartSettle, "#EA580C", "My Assets starts again from zero", "These seeds and the spending they grew from close. Your next payment plants the first new one.")}{point(CardSettle, "#0E7490", "PayLater starts from zero too", dues > 0 ? <>Your limit is your assets. You still owe <GeuFigure amount={dues} currency={ccyCode} lens={lens} size={12} />.</> : "Your limit is your assets, so it grows back as you spend.")}</div><button
    type="button"
    onClick={() => setAgreed((v) => !v)}
    role="checkbox"
    aria-checked={agreed}
    data-testid="assets-settle-agree"
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, marginTop: 18, padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${agreed ? T.accent : T.line}`, background: T.surface, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
  ><span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, border: agreed ? "none" : `2px solid ${T.line}`, background: agreed ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{agreed ? <CheckSettle size={15} color="#fff" strokeWidth={3} /> : null}</span><span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>I understand My Assets starts again from zero</span></button><div style={{ display: "flex", gap: 10, marginTop: 14 }}><button
    type="button"
    onClick={onCancel}
    className="v2-tap"
    style={{ flex: 1, minHeight: 50, borderRadius: 999, border: `1px solid ${T.line}`, background: T.surface, color: T.inkSoft, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
  >Not now</button><button
    type="button"
    onClick={onConfirm}
    disabled={!agreed || !server || count === 0}
    data-testid="assets-settle-confirm"
    className="v2-tap"
    style={{ flex: 1.4, minHeight: 50, borderRadius: 999, border: "none", background: agreed && server ? T.gradButton : T.surfaceAlt, color: agreed && server ? "#fff" : T.inkFaint, fontSize: 14, fontWeight: 800, cursor: agreed && server ? "pointer" : "default", fontFamily: "inherit" }}
  >Settle now</button></div></div></div>;
}

// ── SETTLEMENT HISTORY ─────────────────────────────────────────────────────
// Every settle, newest first: when, how much, and the spending it came from.
function AssetsSettlementHistory({ symbolId, ccyCode, lens, refreshKey, onClose }) {
  const [rows, setRows] = useState10(undefined);
  useEffect53(() => {
    let alive = true;
    if (!symbolId || typeof GloobalApi === "undefined") { setRows(null); return undefined; }
    GloobalApi.getAssetSettlements(symbolId).then((list) => { if (alive) setRows(list); });
    return () => { alive = false; };
  }, [symbolId, refreshKey]);
  const day = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; };
  const short = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
  const total = Array.isArray(rows) ? rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) : 0;
  return <div data-testid="assets-history-screen" style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onClose} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Settlements</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}>{rows === undefined ? <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><LoaderSettle size={20} color={T.accent} style={{ animation: "spin 0.9s linear infinite" }} /></div> : rows === null ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 16px", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>Couldn't read your settlements just now. Try again in a moment.</div> : rows.length === 0 ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "24px 16px", textAlign: "center" }}><div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>No settlements yet</div><div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4, lineHeight: 1.45 }}>Each time you settle My Assets to your bank, it is listed here.</div></div> : <><div style={{ borderRadius: T.radiusLg, background: T.gradButton, color: "#fff", padding: "16px 18px" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>Settled to your bank, all time</div><div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.fontDisplay, marginTop: 2, whiteSpace: "nowrap" }}><GeuFigure amount={total} currency={ccyCode} lens={lens} size={22} /></div><div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{`${rows.length} ${rows.length === 1 ? "settlement" : "settlements"}`}</div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{rows.map((r, i) => <div key={r.id} data-testid="assets-history-row" style={{ display: "flex", gap: 12, padding: "14px 16px", borderTop: i ? `1px solid ${T.line}` : "none" }}><span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Landmark3 size={18} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden" }}><GeuFigure amount={r.amount} currency={ccyCode} lens={lens} size={14} /></span><span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}>{day(r.at)}</span></span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 3, lineHeight: 1.45 }}>{`${r.seedCount} ${r.seedCount === 1 ? "seed" : "seeds"}`}{r.from ? ` · ${short(r.from)}${r.to && short(r.to) !== short(r.from) ? ` – ${short(r.to)}` : ""}` : ""}</span><span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: T.inkFaint, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden" }}>from <GeuFigure amount={r.spent} currency={ccyCode} lens={lens} size={11} /> spent</span></span></div>)}</div></>}</div></div>;
}

// ── AFTER SETTLING ─────────────────────────────────────────────────────────
// One short message: what came in, and that My Assets starts again.
function AssetsSettledCard({ done, ccyCode, lens, onClose }) {
  useBackClose(true, onClose);
  return <div role="dialog" aria-modal="true" aria-label="Settled" data-testid="assets-settled" style={{ position: "fixed", inset: 0, zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}><div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,18,43,0.45)" }} /><div style={{ position: "relative", width: "100%", maxWidth: 360, background: T.surface, borderRadius: 26, padding: "24px 20px 18px", textAlign: "center", boxShadow: "0 20px 50px rgba(20,18,43,0.3)" }}><span style={{ width: 58, height: 58, borderRadius: "50%", margin: "0 auto", background: T.positive, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(5,150,105,0.35)" }}><CheckSettle size={30} color="#fff" strokeWidth={3} /></span><div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginTop: 14 }}>Settled to <GloobalWordmark /> Bank</div><div style={{ fontSize: 26, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 4, whiteSpace: "nowrap" }}><GeuFigure amount={done.amount} currency={ccyCode} lens={lens} size={26} /></div><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>My Assets starts fresh. Your next payment plants the first new seed.</div><button
    type="button"
    onClick={onClose}
    data-testid="assets-settled-done"
    className="v2-tap"
    style={{ width: "100%", minHeight: 50, marginTop: 18, borderRadius: 999, border: "none", background: T.gradButton, color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
  >Done</button></div></div>;
}
