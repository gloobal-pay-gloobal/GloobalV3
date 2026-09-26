// src/components/dialogs/PaymentUnlock.jsx
import { useState as useState39, useEffect as useEffect32, useRef as useRef23 } from "react";
import { Check as CheckUnlock } from "lucide-react";
// ── Reveal my share: one question, a coupon, and the share ────────────────
//
// Opened from the RECEIPT, by the button under it, and only on a payment that
// really carried a Creator Share. That order matters and it is the second one
// this screen has had: it used to come up before the receipt, which made a
// game the toll gate on a document somebody had just paid for. The receipt now
// lands first and is complete on its own; this is offered beside it.
//
// One card, turned over twice. The question — a Hooman check-in, a sum, or
// (for people who save their Hooman Score) a knowledge question, answered with
// one tap and no keyboard — then the coupon, then the share itself.
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
// The two heads the card wears, and they are the receipt's own: violet while
// the share is still a question, green once it is money.
var PAYMENT_UNLOCK_HEAD_OUT = "linear-gradient(135deg,#312E81 0%,#4F46E5 55%,#7C3AED 100%)";
var PAYMENT_UNLOCK_HEAD_IN = "linear-gradient(135deg,#064E3B 0%,#047857 55%,#0FA372 100%)";

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

// The card, turning.
//
// Three faces, one after the other: the question, the coupon, the share. A
// face is swapped at the halfway point of a quarter-turn, so the card reads
// as one object being turned over rather than three cards being replaced —
// and because the swap happens edge-on, the faces can be different heights
// without the turn showing a seam.
var PAYMENT_UNLOCK_TURN_MS = 240;
// How long the answer's verdict is left on screen before the card turns. Long
// enough to read "Right!" or to see which one it was; short enough that it
// does not feel like a wait for permission.
var PAYMENT_UNLOCK_VERDICT_MS = 950;
// And the pause after the foil is gone, so the figure is seen where it was
// hidden before the card turns to make something of it.
var PAYMENT_UNLOCK_REVEAL_MS = 900;

function PaymentUnlock({ receipt, onClose, onViewShareReceipt, onToast }) {
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
  // The instruction goes as soon as it is being followed: a pill reading
  // SCRATCH HERE over the very figure being uncovered is the label getting in
  // the way of the thing it labelled.
  const [scratching, setScratching] = useState39(false);
  // "question" | "coupon" | "share"
  const [face, setFace] = useState39("question");
  const [turning, setTurning] = useState39(false);
  const canvasRef = useRef23(null);
  const wrapRef = useRef23(null);
  const lastPoint = useRef23(null);
  const moves = useRef23(0);
  const timers = useRef23([]);
  const after = (ms, fn) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  useEffect32(() => () => timers.current.forEach(clearTimeout), []);

  // The share. The server settled it with the payment; this only reads it.
  const recorded = Number(receipt && receipt.shareAmount);
  const share = Number.isFinite(recorded) && recorded > 0
    ? recorded
    : (Number(receipt && receipt.amount) || 0) * ((Number(receipt && receipt.shareRate) || 0) / 100);
  const shareCurrency = receipt && receipt.currencyCode;
  const shareRate = Math.max(0, Number(receipt && receipt.shareRate) || 0);
  const payeeName = (receipt && receipt.name) || "them";

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

  // Paint the foil when the coupon face arrives — not before, because the
  // canvas does not exist until then and its size is what the pattern is
  // drawn to.
  useEffect32(() => {
    if (face !== "coupon") return;
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
  }, [face]);

  const turnTo = (next) => {
    setTurning(true);
    after(PAYMENT_UNLOCK_TURN_MS, () => {
      setFace(next);
      setTurning(false);
    });
  };

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
      after(PAYMENT_UNLOCK_VERDICT_MS, () => turnTo("coupon"));
      return;
    }
    if (consented && transactionId) save(payload);
    after(PAYMENT_UNLOCK_VERDICT_MS, () => turnTo("coupon"));
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
  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    after(PAYMENT_UNLOCK_REVEAL_MS, () => turnTo("share"));
  };
  const scratchAt = (event) => {
    if (revealed) return;
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
    if (moves.current === 1) setScratching(true);
    if (moves.current % 6 === 0 && clearedShare() >= PAYMENT_UNLOCK_CLEAR_AT) reveal();
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

  // The head of the card, in the palette of the face it belongs to.
  const cardHead = (tone, eyebrow, line) => (
    <div style={{ padding: "14px 16px 15px", color: "#fff", background: tone === "green" ? PAYMENT_UNLOCK_HEAD_IN : PAYMENT_UNLOCK_HEAD_OUT, textAlign: "center" }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 2, opacity: 0.85 }}>{eyebrow}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 5, lineHeight: 1.3 }}>{line}</div>
    </div>
  );

  // One line, under the card, that says what the answer was worth. It is not
  // in the card because it is not part of the coupon — the share is the same
  // either way, and a point on a score is a different kind of thing.
  const pointLine = saved ? (
    <div
      data-testid="unlock-point"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 12, background: T.positiveSoft, color: "#0B7A57", fontSize: 11.5, fontWeight: 800 }}
    >
      <CheckUnlock size={13} strokeWidth={3} aria-hidden="true" />Answered — 1 point on your Hooman Score
    </div>
  ) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your Creator Share"
      data-testid="payment-unlock"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 540,
        background: "rgba(23,16,54,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))",
        perspective: 1200
      }}
    >
      <style>{`
        @keyframes unlock-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { [data-unlock-card] { transition: none !important; animation: none !important; } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          data-unlock-card
          data-testid={`unlock-face-${face}`}
          style={{
            background: T.surface,
            borderRadius: T.radiusXl,
            overflow: "hidden",
            boxShadow: T.shadowFloat,
            transformStyle: "preserve-3d",
            transform: turning ? "rotateY(90deg)" : "rotateY(0deg)",
            transition: `transform ${PAYMENT_UNLOCK_TURN_MS}ms ${turning ? "ease-in" : "ease-out"}`,
            animation: "unlock-in 0.28s cubic-bezier(.32,.72,0,1)"
          }}
        >
          {face === "question" ? (
            <>
              {cardHead("violet", "ONE QUESTION · WORTH A POINT", question && question.kind === "math"
                ? `${question.sum.a} + ${question.sum.b} + ${question.sum.c}`
                : question && question.kind === "checkin"
                  ? question.text
                  : question && question.kind === "knowledge"
                    ? (question.question.prompt || "Which one?")
                    : "One quick question…")}
              <div data-testid="unlock-question" style={{ padding: "14px 16px 6px", display: "flex", flexDirection: "column", gap: 12 }}>
                {!question ? (
                  <div style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", color: T.inkFaint, fontSize: 13, fontWeight: 700 }}>Just a moment…</div>
                ) : question.kind === "math" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {question.sum.options.map((n) => optionButton(`m${n}`, n, n))}
                  </div>
                ) : question.kind === "knowledge" ? (
                  <>
                    {question.question.glyph && typeof flagEmojiToIso === "function" && flagEmojiToIso(question.question.glyph) ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 4px" }}>
                        <FlagEmoji flag={question.question.glyph} width={96} height={64} fit="contain" />
                      </div>
                    ) : question.question.glyph ? (
                      <div style={{ textAlign: "center", fontFamily: T.fontDisplay, fontSize: 44, fontWeight: 800, color: T.accent }}>{question.question.glyph}</div>
                    ) : null}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {question.question.order.map((i) => optionButton(`k${i}`, question.question.options[i], i))}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {optionButton("yes", "Yes", "yes")}
                    {optionButton("no", "No", "no")}
                  </div>
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
              {/* Skip turns the card the same way answering does. It costs the
                  point and nothing else: the share was earned by paying. */}
              <button
                type="button"
                onClick={() => picked === null && turnTo("coupon")}
                style={{ width: "100%", border: "none", borderTop: `1px solid ${T.line}`, background: "transparent", color: T.inkFaint, fontSize: 13, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}
              >
                Skip
              </button>
            </>
          ) : face === "coupon" ? (
            <>
              {cardHead("violet", "YOUR CREATOR SHARE", `From your payment to ${payeeName}`)}
              <div
                ref={wrapRef}
                data-testid="unlock-scratch"
                style={{ position: "relative", height: 170, margin: 14, borderRadius: T.radiusLg, overflow: "hidden", background: T.surface, boxShadow: `inset 0 0 0 1px ${T.line}` }}
              >
                <div aria-live="polite" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.inkFaint }}>BACK TO YOU</div>
                  <div data-testid="unlock-share" style={{ fontFamily: T.fontDisplay, fontSize: shareText ? 32 : 22, fontWeight: 800, color: shareText ? T.positive : T.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                    {shareText || "No share on this one"}
                  </div>
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
                    cursor: revealed ? "default" : "grab",
                    opacity: revealed ? 0 : 1,
                    transition: "opacity 0.45s ease",
                    pointerEvents: revealed ? "none" : "auto"
                  }}
                />
                {!revealed && !scratching ? (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(15,12,40,0.45)", color: "#FFFFFF", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>
                      SCRATCH HERE
                    </span>
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, textAlign: "center", padding: "0 16px 6px" }}>
                Use your finger — it's yours whatever you do
              </div>
              {/* Nobody is made to scratch. Some people will not want to, and a
                  coupon that can only be opened one way is a toll. */}
              <button
                type="button"
                onClick={reveal}
                data-testid="unlock-reveal"
                style={{ width: "100%", border: "none", borderTop: `1px solid ${T.line}`, background: "transparent", color: T.accent, fontSize: 13, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}
              >
                Just show me
              </button>
            </>
          ) : (
            <>
              <div style={{ padding: "18px 16px 20px", color: "#fff", background: PAYMENT_UNLOCK_HEAD_IN, textAlign: "center" }}>
                <div aria-hidden="true" style={{ fontSize: 17, letterSpacing: 6 }}>★ ✦ ★</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 2, opacity: 0.85, marginTop: 9 }}>CREATOR SHARE EARNED</div>
                <div data-testid="unlock-earned" style={{ fontFamily: T.fontDisplay, fontSize: 38, fontWeight: 800, letterSpacing: -1.4, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  {shareText || "Nothing this time"}
                </div>
                <div data-testid="unlock-rate" style={{ fontSize: 11.5, fontWeight: 800, opacity: 0.92, marginTop: 2 }}>
                  {`${shareRate.toFixed(2)}% of what you paid`}
                </div>
              </div>
              <div style={{ padding: "14px 18px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 800, color: T.ink }}>Nice one</div>
                <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 5, lineHeight: 1.45 }}>
                  {`${payeeName} shares a part of every payment back. It's in your Gloobal balance already.`}
                </div>
              </div>
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
                <button
                  type="button"
                  onClick={onViewShareReceipt}
                  data-testid="unlock-view-share-receipt"
                  style={{ minHeight: 50, borderRadius: 16, border: "none", background: `linear-gradient(135deg,#047857 0%,${T.positive} 100%)`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                >
                  View Creator Share receipt
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ minHeight: 46, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
                >
                  Back to the payment receipt
                </button>
              </div>
            </>
          )}
        </div>
        {pointLine}
        {/* A way out at every face, including the first: the receipt behind is
            complete, and this is the part that is for fun. */}
        {face !== "share" ? (
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 6 }}
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
