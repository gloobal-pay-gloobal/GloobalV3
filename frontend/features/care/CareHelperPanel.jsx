// src/features/care/CareHelperPanel.jsx
//
// ── INSIDE THE ACCOUNT OF SOMEONE YOU LOOK AFTER ─────────────────────────
//
// Opened from People I look after with the helper's own PIN. Everything
// here is THEIR account — their balance, their Essentials, their payments —
// reached with a short session that names the helper too (server/lib/care.js,
// GloobalApi.careSession). That session is held in this panel only: it is
// never saved, never replaces this phone's own sign-in, and closing the
// panel drops it.
//
// The helper can do everything the person could: use their Essentials, pay
// anyone, pay the helper themselves. Each payment asks for the HELPER'S PIN,
// and each one is written down as done by this helper, for the other helper
// to see. Who the account IS (its ID, PIN, face, passkeys) cannot be changed
// from here; the server refuses it in a helper's session.
import { useState as useState111 } from "react";
import { useEffect as useEffect111 } from "react";
import { useRef as useRef110 } from "react";
import { useCallback as useCallback51 } from "react";
import { X as CareCloseIcon, Sprout as CareSprout, Send as CareSend, ArrowUpRight as CareOut, ArrowDownLeft as CareIn, Hourglass as CareWait } from "lucide-react";

// A helper's session that the server no longer accepts: it ran out, or this
// person stopped being theirs to help.
function careSessionOver(r) {
  return Boolean(r && !r.ok && r.status === 401 && r.code === "auth_token_invalid");
}

function CareHelperPanel({ token, person, onClose }) {
  const session = useRef110(null);
  if (!session.current) session.current = GloobalApi.careSession(token);
  const first = careFirstName(person && person.name);
  // Every figure carries both its names (features/geuLens/), as everywhere.
  const lens = useGeuLens();
  const [who, setWho] = useState111(null);
  const [ess, setEss] = useState111(null);
  const [rows, setRows] = useState111(null);
  const [busy, setBusy] = useState111("");
  const [note, setNote] = useState111(null);
  const [to, setTo] = useState111("");
  const [amount, setAmount] = useState111("");
  const [memo, setMemo] = useState111("");
  const [payee, setPayee] = useState111(null);
  const [pinOpen, setPinOpen] = useState111(false);
  const [pin, setPin] = useState111("");
  const [pinError, setPinError] = useState111("");
  const payKey = useRef110("");

  const over = useCallback51((r) => {
    if (!careSessionOver(r)) return false;
    onClose(`${first}'s account was closed — sessions last an hour, and end when a helper steps back. Open it again to carry on.`);
    return true;
  }, [first, onClose]);

  const refresh = useCallback51(async () => {
    const s = session.current;
    const [a, e] = await Promise.all([s.acting(), s.essentials()]);
    if (over(a) || over(e)) return;
    if (a.ok) setWho(a);
    if (e.ok) setEss(e);
    else if (!a.ok) setNote({ ok: false, text: e.message });
    const h = await s.history((a.ok && a.person && a.person.symbolId) || person.symbolId);
    if (over(h)) return;
    setRows(h.ok && Array.isArray(h.transactions) ? h.transactions : []);
  }, [over, person.symbolId]);
  useEffect111(() => { refresh(); }, [refresh]);

  const currency = ess && ess.currency;
  const helper = who && who.helper;
  const left = Number(ess && ess.leftToday) || 0;

  const useToday = async () => {
    if (busy || !(left > 0)) return;
    setBusy("draw"); setNote(null);
    const r = await session.current.draw(left, generateRequestId());
    setBusy("");
    if (over(r)) return;
    if (r.ok) {
      setEss((prev) => ({ ...(prev || {}), ...r }));
      setNote({ ok: true, text: Number(r.applied) > 0 ? `${geuLensBarMoney(r.applied, r.currency || currency, lens, currency)} of today's Essentials is now in ${first}'s balance.` : "Nothing left to use today." });
      refresh();
    } else setNote({ ok: false, text: r.message });
  };

  const typed = Number(String(amount).replace(/,/g, ""));
  const payReady = to.trim().length >= 3 && typed > 0;
  const checkPayee = async () => {
    if (busy || !payReady) return;
    setBusy("resolve"); setNote(null);
    const r = await session.current.resolve(to.trim());
    setBusy("");
    if (over(r)) return;
    if (r.ok && r.user) { payKey.current = generateRequestId(); setPayee(r.user); }
    else setNote({ ok: false, text: r.ok ? "No GLOOBAL account has that ID." : r.message });
  };
  const send = useCallback51(async () => {
    if (!payee || pin.length !== 6 || busy) return;
    setBusy("send"); setPinError("");
    const r = await session.current.send({
      senderSymbolId: (who && who.person && who.person.symbolId) || person.symbolId,
      receiverSymbolId: payee.symbolId,
      amountBasis: "source",
      sourceAmount: typed,
      amount: typed,
      note: memo.trim(),
      pin,
      payMethod: "Gloobal Bank",
      idempotencyKey: payKey.current,
    });
    setBusy("");
    if (over(r)) return;
    if (r.ok) {
      setPin(""); setPinOpen(false);
      setNote({ ok: true, text: `Paid ${geuLensBarMoney(typed, currency, lens, currency)} to ${payee.fullName || payee.symbolId} from ${first}'s account.` });
      setPayee(null); setTo(""); setAmount(""); setMemo("");
      refresh();
      return;
    }
    // A wrong PIN stays on the pad; anything else is the payment's answer.
    if (r.status === 401 && r.attemptsRemaining != null) { setPinError(r.message); setTimeout(() => setPin(""), 700); return; }
    setPin(""); setPinOpen(false);
    setNote({ ok: false, text: r.message });
  }, [payee, pin, busy, who, person.symbolId, typed, memo, over, currency, first, refresh, lens]);

  const helperName = helper && helper.name ? careFirstName(helper.name) : "you";
  return <div data-testid="care-helper-panel" role="dialog" aria-modal="true" aria-label={`${person.name}'s account`} style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: T.fontBody }}>
    {/* Always on screen: whose account this is, and who is using it. */}
    <div data-testid="care-helper-banner" style={{ flexShrink: 0, background: "#2E7A4F", color: "#fff", padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px 14px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, flexShrink: 0, fontFamily: T.fontDisplay }}>{first.charAt(0).toUpperCase()}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 900, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.name}'s account</span>
        <span style={{ display: "block", fontSize: 11.5, opacity: 0.85, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.symbolId} · used by {helperName}</span>
      </span>
      <button onClick={() => onClose()} className="v2-tap" aria-label="Close their account" data-testid="care-helper-close" style={{ display: "flex", alignItems: "center", gap: 5, border: "none", borderRadius: 999, background: "rgba(255,255,255,0.18)", color: "#fff", padding: "8px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}><CareCloseIcon size={14} color="#fff" />Close</button>
    </div>

    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 18px calc(30px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={careCard({ gap: 4 })} data-testid="care-helper-balance">
        <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>{first}'s balance</span>
        <span style={{ fontSize: 28, fontWeight: 900, color: T.ink, fontFamily: T.fontDisplay, letterSpacing: -0.5 }}>{ess ? <GeuFigure amount={ess.balance} currency={currency} lens={lens} size={28} /> : "…"}</span>
      </div>

      <div style={careCard()} data-testid="care-helper-essentials">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: "#2E7A4F1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ess && ess.waitingForCheck ? <CareWait size={17} color="#2E7A4F" /> : <CareSprout size={17} color="#2E7A4F" />}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink }}>{first}'s Essentials today</span>
            <span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{!ess
              ? "…"
              : ess.waitingForCheck
                ? "Waiting for check — they start once their document has passed."
                : !ess.available
                  ? "Not set up in their country yet."
                  : left > 0 ? <><GeuFigure amount={left} currency={currency} lens={lens} size={12} /> left of <GeuFigure amount={ess.dailyLimit} currency={currency} lens={lens} size={12} /></> : "Used for today. More tomorrow."}</span>
          </span>
        </div>
        {ess && !ess.waitingForCheck && ess.available ? <button onClick={useToday} className="v2-tap" data-testid="care-helper-use" disabled={Boolean(busy) || !(left > 0)} style={careButton(!busy && left > 0)}>{busy === "draw" ? "Using…" : left > 0 ? "Use today's" : "Used today"}</button> : null}
        {ess && !ess.waitingForCheck && ess.available ? <span style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}>It goes into {first}'s own balance and stays in GLOOBAL, for {first}.</span> : null}
      </div>

      <div style={careCard()} data-testid="care-helper-pay">
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 800, color: T.ink }}><CareSend size={16} color={T.accent} />Pay from {first}'s account</span>
        {payee
          ? <>
            <div style={{ borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 12, color: T.inkSoft }}>To</span>
              <span data-testid="care-helper-payee" style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{payee.fullName || payee.symbolId}{helper && payee.symbolId === helper.symbolId ? " (you)" : ""}</span>
              <span style={{ fontSize: 12, color: T.inkSoft }}>{payee.symbolId}</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: T.ink, fontFamily: T.fontDisplay, marginTop: 6 }}><GeuFigure amount={typed} currency={currency} lens={lens} size={22} /></span>
              {memo.trim() ? <span style={{ fontSize: 12, color: T.inkSoft }}>{memo.trim()}</span> : null}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPayee(null)} className="v2-tap" style={careQuietButton({ flex: 1 })}>Change</button>
              <button onClick={() => { setPin(""); setPinError(""); setPinOpen(true); }} className="v2-tap" data-testid="care-helper-confirm" style={careButton(true, { flex: 2 })}>Pay with your PIN</button>
            </div>
          </>
          : <>
            <CareField label="To — their GLOOBAL ID"><input data-testid="care-helper-to" value={to} onChange={(e) => setTo(e.target.value)} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} style={careInput()} /></CareField>
            {helper && helper.symbolId ? <div><button type="button" onClick={() => setTo(helper.symbolId)} className="v2-tap" data-testid="care-helper-to-me" style={{ border: `1px solid ${to === helper.symbolId ? T.accent : T.line}`, borderRadius: 999, padding: "7px 12px", background: to === helper.symbolId ? T.accentSoft : T.surface, color: to === helper.symbolId ? T.accent : T.ink, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>To me ({helperName})</button></div> : null}
            <CareField label={`Amount${currency ? ` (${currency})` : ""}`}><input data-testid="care-helper-amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" autoComplete="off" style={careInput({ fontSize: 18, fontWeight: 800 })} /></CareField>
            <CareField label="What it's for (optional)"><input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={140} autoComplete="off" style={careInput()} /></CareField>
            <button onClick={checkPayee} className="v2-tap" data-testid="care-helper-next" disabled={!payReady || Boolean(busy)} style={careButton(payReady && !busy)}>{busy === "resolve" ? "Checking…" : "Continue"}</button>
          </>}
      </div>

      <CareNote note={note} />

      <div style={careCard({ gap: 10 })} data-testid="care-helper-history">
        <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>{first}'s history</span>
        {rows == null
          ? <span style={{ fontSize: 12.5, color: T.inkFaint }}>Loading…</span>
          : rows.length === 0
            ? <span style={{ fontSize: 12.5, color: T.inkSoft }}>No payments yet.</span>
            : rows.slice(0, 20).map((t, i) => {
              const out = t.direction === "sent";
              const shownAmount = out && t.debitAmount != null ? t.debitAmount : t.amount;
              const shownCcy = out && t.senderCurrency ? t.senderCurrency : t.currency;
              const other = t.counterparty ? (t.counterparty.fullName || t.counterparty.symbolId) : t.type === "disbursement" ? "Essentials" : "";
              const Icon = out ? CareOut : CareIn;
              return <div key={t.id || i} style={{ display: "flex", alignItems: "center", gap: 10, borderTop: i ? `1px solid ${T.line}` : "none", paddingTop: i ? 9 : 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", background: out ? T.negativeSoft : T.positiveSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} color={out ? T.negative : T.positive} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other || (out ? "Paid" : "Received")}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{t.createdAt ? `${new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${formatClockTime(t.createdAt)}` : ""}</span>
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: out ? T.ink : T.positive, whiteSpace: "nowrap" }}><GeuFigure amount={shownAmount} currency={shownCcy} own={currency} lens={lens} size={13.5} sign={out ? "−" : "+"} /></span>
              </div>;
            })}
      </div>
      <span style={{ fontSize: 11.5, color: T.inkSoft, textAlign: "center", lineHeight: 1.5, padding: "0 10px" }}>Everything done here is written down as done by {helper && helper.name ? helper.name : "you"}, and their other helper can see it. Their ID, PIN and face stay theirs and cannot be changed from here.</span>
    </div>

    {pinOpen && payee ? <div role="dialog" aria-modal="true" aria-label="Confirm with your PIN" style={{ position: "fixed", inset: 0, zIndex: 350, background: T.bg, display: "flex", flexDirection: "column", padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px calc(22px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
      <GloobalPinPanel testid="care-helper-pin" title={`Pay from ${first}'s account`} note="Enter YOUR PIN." value={pin} onChange={(v) => { setPinError(""); setPin(v); }} onSubmit={send} busy={busy === "send"} error={pinError} onBack={() => { setPinOpen(false); setPin(""); }} backLabel="Cancel" top={<span style={{ display: "inline-flex", padding: "10px 18px", borderRadius: 999, background: T.surface, boxShadow: T.shadowCard, fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}><GeuFigure amount={typed} currency={currency} lens={lens} size={22} /></span>} />
    </div> : null}
  </div>;
}
