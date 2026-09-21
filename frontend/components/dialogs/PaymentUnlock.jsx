// src/components/dialogs/PaymentUnlock.jsx
import { useState as useState39, useEffect as useEffect32, useRef as useRef23 } from "react";
import { Lock as LockUnlock, Check as CheckUnlock } from "lucide-react";
// ── After a payment: one question, then scratch to see your share ─────────
//
// Shown once, straight after a payment settles and before the receipt. One
// short question — a Hooman check-in, a sum, or (for people who save their
// Hooman Score) a knowledge question — answered with one tap, no keyboard.
// Answering unlocks a scratch card; under it is the Creator Share this
// payment earned.
//
// What the answer does and does not do. It counts toward the person's own
// Hooman Score (when they have agreed to save it), one answer per payment.
// It NEVER changes the share: the share was settled by the server with the
// payment, before this screen existed, and it is the same number whatever is
// tapped here — or if "Skip" is tapped instead. The screen says so.
//
// Questions are short and nearly wordless on purpose — digits, flags,
// currency symbols, names people already recognise — so they work across
// languages until a local-language filter exists (each bank question already
// carries a `lang` tier for it).

// Which check-ins may appear after a payment. Finance locks after its first
// answer, so it belongs on the score screen; "Are you okay?" is not a
// question to ask in the second after someone has paid for something.
var PAYMENT_UNLOCK_SKIP_ITEMS = ["self.mental", "self.education"];
// Knowledge questions shown this session, so the same one does not come up
// twice in a row.
var paymentUnlockRecentQuestions = [];
// Below this share of the foil still covered, the rest clears by itself.
var PAYMENT_UNLOCK_CLEAR_AT = 0.5;
var PAYMENT_UNLOCK_FOIL_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];

function paymentUnlockCheckins() {
  const out = [];
  if (typeof GH_CATEGORIES === "undefined") return out;
  for (const cat of GH_CATEGORIES) {
    if (cat.locksAfterAnswer) continue;
    for (const item of cat.items) {
      if (item.type !== "yesno") continue;
      if (PAYMENT_UNLOCK_SKIP_ITEMS.includes(`${cat.key}.${item.key}`)) continue;
      out.push({ cat, item });
    }
  }
  return out;
}

// 34 + 35 + 36 = ?  Three numbers and four answers: the right one and three
// near misses, the kind of wrong a quick head-sum actually produces.
function paymentUnlockSum(random = Math.random) {
  const n = () => 11 + Math.floor(random() * 49);
  const a = n();
  const b = n();
  const c = n();
  const sum = a + b + c;
  const offsets = [-10, -2, -1, 1, 2, 3, 10];
  const picks = new Set([sum]);
  while (picks.size < 4) picks.add(sum + offsets[Math.floor(random() * offsets.length)]);
  const options = [...picks].sort(() => random() - 0.5);
  return { a, b, c, sum, options };
}

// The question to ask, chosen once per payment.
function paymentUnlockPick({ knowledge, random = Math.random }) {
  const kinds = ["checkin", "math"];
  if (knowledge) kinds.push("knowledge");
  const kind = kinds[Math.floor(random() * kinds.length)];
  if (kind === "knowledge") return { kind, question: knowledge };
  if (kind === "math") return { kind, sum: paymentUnlockSum(random) };
  const pool = paymentUnlockCheckins();
  if (!pool.length) return { kind: "math", sum: paymentUnlockSum(random) };
  const { cat, item } = pool[Math.floor(random() * pool.length)];
  const text = item.questions
    ? item.questions[(typeof ghDailySeed === "function" ? ghDailySeed(`${ghTodayKey()}.${cat.key}.${item.key}`) : 0) % item.questions.length]
    : item.question;
  return { kind, cat, item, text };
}

// The foil. A different pattern each payment — thrown confetti, a stamp
// sheet of the Gloobal symbols, or a few oversized shapes — in the brand
// palette over the wallet's indigo.
function paymentUnlockPaintFoil(ctx, w, h, random = Math.random) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#312E81");
  g.addColorStop(0.55, "#4F46E5");
  g.addColorStop(1, "#7C3AED");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const palette = typeof LOGO_FLIP_COLORS !== "undefined" ? LOGO_FLIP_COLORS : ["#DB2777", "#2563EB", "#059669", "#EA580C"];
  const colour = () => palette[Math.floor(random() * palette.length)];
  const style = Math.floor(random() * 3);
  const glyph = (x, y, size, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour();
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PAYMENT_UNLOCK_FOIL_SYMBOLS[Math.floor(random() * PAYMENT_UNLOCK_FOIL_SYMBOLS.length)], x, y);
  };
  if (style === 0) {
    for (let i = 0; i < 46; i++) glyph(random() * w, random() * h, 10 + random() * 22, 0.55 + random() * 0.4);
  } else if (style === 1) {
    const step = Math.max(34, Math.round(w / 7));
    for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) glyph(x, y, step * 0.42, 0.8);
  } else {
    for (let i = 0; i < 6; i++) glyph(random() * w, random() * h, 60 + random() * 80, 0.35);
  }
  ctx.globalAlpha = 1;
}

function PaymentUnlock({ receipt, amountLabel, onDone, onToast }) {
  const signedIn = typeof gloobalAuthToken === "function" && !!gloobalAuthToken();
  const transactionId = receipt && receipt.txnId;
  // null while deciding (a knowledge question needs one round trip), then the
  // question object for the rest of this screen's life.
  const [question, setQuestion] = useState39(null);
  const [consented, setConsented] = useState39(false);
  const [picked, setPicked] = useState39(null); // the option tapped
  const [verdict, setVerdict] = useState39(null); // { correct, rightChoice } | "checking" | null
  const [saved, setSaved] = useState39(false);
  const [saving, setSaving] = useState39(false);
  const [revealed, setRevealed] = useState39(false);
  const canvasRef = useRef23(null);
  const wrapRef = useRef23(null);
  const lastPoint = useRef23(null);
  const moves = useRef23(0);

  // The share. The server settled it with the payment; this only reads it.
  const recorded = Number(receipt && receipt.shareAmount);
  const share = Number.isFinite(recorded) && recorded > 0
    ? recorded
    : (Number(receipt && receipt.amount) || 0) * ((Number(receipt && receipt.shareRate) || 0) / 100);
  const shareCurrency = receipt && receipt.currencyCode;

  // Full-screen, so the app map's floating launcher steps aside while this is
  // up — the same channel PaymentProcessing uses.
  useEffect32(() => {
    if (typeof window === "undefined") return void 0;
    const fire = (active) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active } }));
    fire(true);
    return () => fire(false);
  }, []);

  // Pick the question. A knowledge question only for people who save their
  // score: it is checked by the server, which is also what records it.
  useEffect32(() => {
    let cancelled = false;
    let settled = false;
    // Once only: a slow server answering after the 2.5s fallback must not
    // swap the question out from under someone who is already answering it.
    const settle = (knowledge) => {
      if (cancelled || settled) return;
      settled = true;
      setQuestion(paymentUnlockPick({ knowledge }));
    };
    if (!signedIn) {
      settle(null);
      return () => { cancelled = true; };
    }
    const giveUp = setTimeout(() => settle(null), 2500);
    (async () => {
      try {
        const { consented: agreed } = await GloobalApi.getHoomanScore();
        if (cancelled) return;
        setConsented(agreed);
        let knowledge = null;
        if (agreed) {
          const q = await GloobalApi.getHoomanQuestion(paymentUnlockRecentQuestions);
          if (q && Array.isArray(q.options) && q.options.length >= 2) {
            // Shown in a shuffled order; the ORIGINAL index is what is sent.
            knowledge = { ...q, order: q.options.map((_, i) => i).sort(() => Math.random() - 0.5) };
          }
        }
        clearTimeout(giveUp);
        settle(knowledge);
      } catch {
        clearTimeout(giveUp);
        settle(null);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
    };
  }, []);

  // Paint the foil once the card has a size.
  useEffect32(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ratio = Math.min(2, typeof window !== "undefined" && window.devicePixelRatio || 1);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paymentUnlockPaintFoil(ctx, w, h);
  }, []);

  const unlocked = picked !== null && verdict !== "checking";

  const body = (extra) => ({ source: "payment", transactionId, day: typeof ghTodayKey === "function" ? ghTodayKey() : undefined, ...extra });
  const answerBody = (choice) => {
    if (!question) return null;
    if (question.kind === "checkin") return body({ pillar: question.cat.key, item: question.item.key, kind: "yesno", value: choice });
    if (question.kind === "math") return body({ pillar: "self", item: "education", kind: "math", a: question.sum.a, b: question.sum.b, c: question.sum.c, value: String(choice) });
    return body({ pillar: "self", item: "education", kind: "knowledge", questionId: question.question.id, choice });
  };

  const save = async (payload) => {
    setSaving(true);
    try {
      const { answer } = await GloobalApi.saveHoomanAnswer(payload);
      setSaved(true);
      return answer;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  };

  const answer = async (choice) => {
    if (picked !== null || !question) return;
    setPicked(choice);
    const payload = answerBody(choice);
    if (question.kind === "math") setVerdict({ correct: choice === question.sum.sum, rightChoice: question.sum.sum });
    if (question.kind === "checkin") setVerdict({ correct: null });
    if (question.kind === "knowledge") {
      paymentUnlockRecentQuestions = [...paymentUnlockRecentQuestions, question.question.id].slice(-12);
      setVerdict("checking");
      const result = await save(payload);
      setVerdict(result && typeof result.correct === "boolean"
        ? { correct: result.correct, rightChoice: result.rightChoice }
        : { correct: null, unchecked: true });
      return;
    }
    if (consented && transactionId) save(payload);
  };

  // "Save to my Hooman Score" for someone who has not agreed yet: the same
  // agreement the score screen asks for, then this one answer.
  const agreeAndSave = async () => {
    if (saving || picked === null) return;
    setSaving(true);
    try {
      await GloobalApi.setHoomanConsent();
      setConsented(true);
      setSaving(false);
      await save(answerBody(picked));
      onToast?.("Saved to your Hooman Score");
    } catch {
      setSaving(false);
      onToast?.("Couldn't save right now");
    }
  };

  // ── Scratching ──────────────────────────────────────────────────────────
  const clearedShare = () => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext("2d");
    if (!ctx) return 1;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let clear = 0;
    let total = 0;
    const step = 12;
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
      total += 1;
      if (data[(y * width + x) * 4 + 3] < 40) clear += 1;
    }
    return total ? clear / total : 1;
  };
  const scratchAt = (event) => {
    if (!unlocked || revealed) return;
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 44;
    ctx.beginPath();
    const from = lastPoint.current || point;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(point.x + 0.01, point.y);
    ctx.stroke();
    lastPoint.current = point;
    moves.current += 1;
    if (moves.current % 6 === 0 && clearedShare() >= PAYMENT_UNLOCK_CLEAR_AT) setRevealed(true);
  };

  const shareText = share > 0 ? `+${fmtMoney(share, shareCurrency)}` : null;
  const optionButton = (key, label, value, extra = {}) => {
    const chosen = picked === value;
    const right = verdict && verdict.rightChoice === value && picked !== null && question.kind !== "checkin";
    const wrongPick = chosen && verdict && verdict.correct === false;
    return (
      <button
        key={key}
        type="button"
        onClick={() => answer(value)}
        disabled={picked !== null}
        aria-pressed={chosen}
        style={{
          minHeight: 50,
          borderRadius: T.radiusMd,
          border: `2px solid ${right ? T.positive : wrongPick ? T.negative : chosen ? T.accent : T.line}`,
          background: right ? T.positiveSoft : wrongPick ? T.negativeSoft : chosen ? T.accentSoft : T.surface,
          color: T.ink,
          fontSize: 15,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          cursor: picked === null ? "pointer" : "default",
          padding: "8px 10px",
          ...extra
        }}
      >
        {label}
      </button>
    );
  };

  let feedback = null;
  if (verdict === "checking") feedback = "Checking…";
  else if (verdict && question) {
    if (question.kind === "checkin") feedback = consented ? "Thanks — added to your Hooman Score" : "Thanks";
    else if (verdict.unchecked) feedback = "Couldn't check that one — your share is below either way";
    else if (verdict.correct) feedback = "Right!";
    else if (question.kind === "math") feedback = `Not quite — it's ${verdict.rightChoice}`;
    else feedback = `Not quite — it's ${question.question.options[verdict.rightChoice]}`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payment complete"
      data-testid="payment-unlock"
      style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div style={{ background: T.gradWallet, color: "#FFFFFF", padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 22px", flexShrink: 0, position: "relative", textAlign: "center" }}>
        <button
          type="button"
          onClick={onDone}
          style={{ position: "absolute", right: 12, top: "calc(10px + env(safe-area-inset-top, 0px))", border: "none", background: "rgba(255,255,255,0.14)", color: "#FFFFFF", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          Skip
        </button>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, opacity: 0.85, marginTop: 22 }}>PAYMENT COMPLETE</div>
        {amountLabel ? <div style={{ fontFamily: T.fontDisplay, fontSize: 30, fontWeight: 800, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{amountLabel}</div> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 14, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {/* The question */}
        <div data-testid="unlock-question" style={{ background: T.surface, borderRadius: T.radiusLg, boxShadow: T.shadowCard, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {!question ? (
            <div style={{ minHeight: 150, display: "flex", alignItems: "center", justifyContent: "center", color: T.inkFaint, fontSize: 13, fontWeight: 700 }}>One quick question…</div>
          ) : question.kind === "math" ? (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.accent }}>{"Σ NUMBERS"}</div>
              <div aria-label={`${question.sum.a} plus ${question.sum.b} plus ${question.sum.c}`} style={{ alignSelf: "center", fontFamily: T.fontDisplay, fontSize: 30, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums", textAlign: "right", lineHeight: 1.15 }}>
                <div>{question.sum.a}</div>
                <div><span style={{ color: T.accent, marginRight: 8 }}>+</span>{question.sum.b}</div>
                <div><span style={{ color: T.accent, marginRight: 8 }}>+</span>{question.sum.c}</div>
                <div style={{ borderTop: `2px solid ${T.line}`, marginTop: 4, paddingTop: 2, color: T.inkFaint }}>?</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {question.sum.options.map((n) => optionButton(`m${n}`, n, n))}
              </div>
            </>
          ) : question.kind === "knowledge" ? (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.accent }}>{String(question.question.category || "quiz").toUpperCase()}</div>
              <div style={{ minHeight: 84, borderRadius: T.radiusMd, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: 10 }}>
                {question.question.glyph && typeof flagEmojiToIso === "function" && flagEmojiToIso(question.question.glyph)
                  ? <FlagEmoji flag={question.question.glyph} width={84} height={56} fit="contain" />
                  : question.question.glyph
                    ? <span style={{ fontFamily: T.fontDisplay, fontSize: 44, fontWeight: 800, color: T.accent }}>{question.question.glyph}</span>
                    : null}
                {question.question.prompt
                  ? <span style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{question.question.prompt}</span>
                  : <span style={{ fontSize: 36, fontWeight: 800, color: T.inkFaint }}>?</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {question.question.order.map((i) => optionButton(`k${i}`, question.question.options[i], i))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.accent }}>{`HOOMAN · ${String(question.cat.label || "").toUpperCase()}`}</div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 19, fontWeight: 800, color: T.ink, textAlign: "center", padding: "14px 4px", textWrap: "balance" }}>{question.text}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {optionButton("yes", "Yes", "yes")}
                {optionButton("no", "No", "no")}
              </div>
            </>
          )}
          {feedback ? (
            <div role="status" style={{ fontSize: 13, fontWeight: 800, color: verdict && verdict.correct === false ? T.negative : verdict && verdict.correct ? T.positive : T.inkSoft, textAlign: "center" }}>{feedback}</div>
          ) : null}
          {signedIn && !consented && picked !== null && question && question.kind !== "knowledge" && !saved ? (
            <button
              type="button"
              onClick={agreeAndSave}
              disabled={saving}
              style={{ border: "none", background: "none", color: T.accent, fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 4 }}
            >
              {saving ? "Saving…" : "Add this to my Hooman Score"}
            </button>
          ) : null}
        </div>

        {/* The scratch card */}
        <div
          ref={wrapRef}
          data-testid="unlock-scratch"
          style={{ position: "relative", height: 170, borderRadius: T.radiusLg, overflow: "hidden", background: T.surface, boxShadow: T.shadowCard, flexShrink: 0 }}
        >
          <div aria-live="polite" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, textAlign: "center" }}>
            {revealed || unlocked ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.inkFaint }}>YOUR CREATOR SHARE</div>
                <div data-testid="unlock-share" style={{ fontFamily: T.fontDisplay, fontSize: 32, fontWeight: 800, color: shareText ? T.positive : T.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                  {shareText || "No share on this one"}
                </div>
                <div style={{ fontSize: 11.5, color: T.inkFaint }}>Paid in full, whatever you answer.</div>
              </>
            ) : null}
          </div>
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            onPointerDown={(e) => {
              lastPoint.current = null;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              scratchAt(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons || e.pointerType === "touch") scratchAt(e);
            }}
            onPointerUp={() => { lastPoint.current = null; }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              touchAction: "none",
              cursor: unlocked && !revealed ? "grab" : "default",
              opacity: revealed ? 0 : 1,
              transition: "opacity 0.45s ease",
              pointerEvents: revealed ? "none" : "auto"
            }}
          />
          {!revealed ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(15,12,40,0.45)", color: "#FFFFFF", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>
                {unlocked ? "SCRATCH HERE" : <><LockUnlock size={13} aria-hidden="true" />ANSWER TO UNLOCK</>}
              </span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => (revealed ? onDone() : setRevealed(true))}
          disabled={!unlocked && !revealed}
          style={{
            minHeight: 52,
            borderRadius: 999,
            border: "none",
            background: unlocked || revealed ? T.gradButton : T.gradButtonDisabled,
            color: "#FFFFFF",
            fontSize: 15,
            fontWeight: 800,
            cursor: unlocked || revealed ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexShrink: 0
          }}
        >
          {revealed ? <><CheckUnlock size={16} aria-hidden="true" />View receipt</> : "Reveal my share"}
        </button>
      </div>
    </div>
  );
}
