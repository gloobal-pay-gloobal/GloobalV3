// src/features/creator/ShopReviews.jsx
//
// A SHOP'S REVIEWS: STARS AND A LINE, PUBLIC, WITHOUT A NAME.
//
// What Feedback on a shop opens. The founder chose public reviews with
// stars, shown anonymously. The server carries the three rules that keep
// that honest (see server/models/CreatorReview.js):
//
//   - only somebody who has PAID this shop may review it,
//   - one review per person per shop — writing again replaces yours,
//   - nobody reviews their own shop, and nobody removes anyone else's.
//
// This screen only says those rules out loud at the moment they matter, so
// a customer who has not paid yet is told why there is no form rather than
// finding a button that fails.
import { useState as useState60, useEffect as useEffect56 } from "react";
import { Star as Star5, X as X15, Trash2 as Trash2b } from "lucide-react";

var SHOP_REVIEW_TEXT_MAX = 280;
var SHOP_REVIEW_WORDS = ["", "Poor", "Not great", "Okay", "Good", "Loved it"];

// An average is printed only from three reviews up. Below that it is one
// or two people's verdict dressed as a score — the same reasoning that
// hides the repeat-payer count below ten.
var SHOP_REVIEW_MIN_FOR_AVERAGE = 3;

function shopReviewHasAverage(summary) {
  return Boolean(summary) && Number(summary.count) >= SHOP_REVIEW_MIN_FOR_AVERAGE;
}

function shopReviewCountLabel(n) {
  const c = Number(n) || 0;
  return `${c} review${c === 1 ? "" : "s"}`;
}

// Five stars. Read-only when there is no onPick; with one, each star is a
// 40px tap target, which matters on a phone held in one hand at a counter.
function ShopStars({ value = 0, size = 14, onPick }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: onPick ? 4 : 2 }}>{[1, 2, 3, 4, 5].map((n) => {
    const on = n <= Math.round(Number(value) || 0);
    const star = <Star5 size={size} color={on ? PAY_PIN_STAR : "#C9C4D8"} fill={on ? PAY_PIN_STAR : "none"} strokeWidth={on ? 1.6 : 1.8} />;
    return onPick
      ? <button
        key={n}
        onClick={() => onPick(n)}
        aria-label={`${n} star${n === 1 ? "" : "s"}`}
        aria-pressed={on}
        style={{
          width: 40, height: 40, border: "none", background: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >{star}</button>
      : <span key={n} style={{ display: "inline-flex" }}>{star}</span>;
  })}</span>;
}

function ShopReviewsSheet({ creator, theme, name, onClose, onSummary, onToast }) {
  const [data, setData] = useState60(null);
  const [error, setError] = useState60("");
  const [stars, setStars] = useState60(0);
  const [text, setText] = useState60("");
  const [saving, setSaving] = useState60(false);
  const symbolId = creator && creator.symbolId;
  const accent = theme.hero.from;

  const take = (payload) => {
    setData(payload);
    if (payload && payload.mine) {
      setStars(payload.mine.stars);
      setText(payload.mine.text || "");
    }
    if (payload && payload.summary && onSummary) onSummary(payload.summary);
  };

  useEffect56(() => {
    let live = true;
    GloobalApi.getCreatorReviews(symbolId)
      .then((payload) => { if (live) take(payload); })
      .catch(() => { if (live) setError("Could not load reviews right now."); });
    return () => { live = false; };
  }, [symbolId]);

  const post = async () => {
    if (stars < 1) { setError("Tap a star first."); return; }
    setSaving(true);
    setError("");
    try {
      take(await GloobalApi.saveCreatorReview(symbolId, { stars, text: text.trim() }));
      if (onToast) onToast("Review posted");
    } catch (e) {
      setError((e && e.body && e.body.message) || "Could not post that just now.");
    }
    setSaving(false);
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      take(await GloobalApi.deleteMyCreatorReview(symbolId));
      setStars(0);
      setText("");
      if (onToast) onToast("Your review was removed");
    } catch (e) {
      setError("Could not remove it just now.");
    }
    setSaving(false);
  };

  const summary = (data && data.summary) || { count: 0, average: 0, byStars: {} };
  const reviews = (data && data.reviews) || [];
  const most = Math.max(1, ...[1, 2, 3, 4, 5].map((k) => Number(summary.byStars && summary.byStars[k]) || 0));

  const card = { background: T.surface, borderRadius: 18, padding: "14px 15px", boxShadow: T.shadowCard, marginBottom: 12 };

  return <div style={{
    position: "absolute", inset: 0, zIndex: 6, background: "rgba(21,19,42,0.38)",
    display: "flex", alignItems: "flex-end"
  }} onClick={onClose}><div
    role="dialog"
    aria-label={`Reviews of ${name}`}
    onClick={(e) => e.stopPropagation()}
    style={{
      width: "100%", background: T.bg, borderRadius: "24px 24px 0 0",
      padding: "14px 18px calc(22px + env(safe-area-inset-bottom, 0px))", maxHeight: "90%", overflowY: "auto"
    }}
  ><div style={{ width: 38, height: 4, borderRadius: 2, background: T.line, margin: "0 auto 12px" }} /><div style={{
    display: "flex", alignItems: "center", gap: 10, marginBottom: 14
  }}><span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Reviews</span><button
    onClick={onClose}
    aria-label="Close reviews"
    style={{
      width: 34, height: 34, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
    }}
  ><X15 size={16} color={T.ink} /></button></div>

  {!data && !error ? <div style={{ padding: "26px 0", textAlign: "center", fontSize: 13, color: T.inkFaint }}>Loading reviews…</div> : null}

  {data ? <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>{
    /* The summary. With fewer than three reviews there is no average —
       just the stars people actually gave, counted. */
  }<span style={{ textAlign: "center", minWidth: 86 }}><span style={{
    display: "block", fontSize: shopReviewHasAverage(summary) ? 34 : 15, fontWeight: 800, color: T.ink,
    fontFamily: T.fontDisplay, lineHeight: 1.1, fontVariantNumeric: "tabular-nums"
  }}>{shopReviewHasAverage(summary) ? Number(summary.average).toFixed(1) : (summary.count ? "New shop" : "No reviews")}</span>{
    shopReviewHasAverage(summary) ? <span style={{ display: "block", marginTop: 4 }}><ShopStars value={summary.average} size={12} /></span> : null
  }<span style={{ display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 4 }}>{shopReviewCountLabel(summary.count)}</span></span><span style={{
    flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4
  }}>{[5, 4, 3, 2, 1].map((k) => {
    const n = Number(summary.byStars && summary.byStars[k]) || 0;
    return <span key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{
      width: 10, fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textAlign: "right", fontVariantNumeric: "tabular-nums"
    }}>{k}</span><span style={{ flex: 1, height: 6, borderRadius: 3, background: T.surfaceAlt, overflow: "hidden" }}><span style={{
      display: "block", height: "100%", width: `${(n / most) * 100}%`, background: accent, borderRadius: 3
    }} /></span><span style={{
      width: 22, fontSize: 10.5, fontWeight: 600, color: T.inkFaint, fontVariantNumeric: "tabular-nums"
    }}>{n}</span></span>;
  })}</span></div> : null}

  {data && data.canReview ? <div style={card}><div style={{
    fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkFaint
  }}>{data.mine ? "Your review" : `Rate ${name}`}</div><div style={{
    display: "flex", alignItems: "center", gap: 6, margin: "4px 0 2px -6px"
  }}><ShopStars value={stars} size={28} onPick={(n) => { setStars(n); setError(""); }} /><span style={{
    fontSize: 12.5, fontWeight: 700, color: accent, marginLeft: 4
  }}>{SHOP_REVIEW_WORDS[stars] || ""}</span></div><textarea
    id="shop-review-text"
    value={text}
    maxLength={SHOP_REVIEW_TEXT_MAX}
    rows={3}
    placeholder="What was it like? (optional)"
    onChange={(e) => setText(e.target.value)}
    style={{
      width: "100%", boxSizing: "border-box", resize: "none", border: `1px solid ${T.line}`, borderRadius: 13,
      padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: T.ink, background: T.bg, outline: "none", marginTop: 6
    }}
  /><div style={{
    display: "flex", justifyContent: "space-between", fontSize: 10.5, color: T.inkFaint, fontWeight: 600, margin: "5px 2px 10px"
  }}><span>Shown without your name</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{text.length}/{SHOP_REVIEW_TEXT_MAX}</span></div><div style={{
    display: "flex", gap: 9
  }}>{data.mine ? <button
    onClick={remove}
    disabled={saving}
    aria-label="Remove my review"
    style={{
      width: 46, flexShrink: 0, border: "none", borderRadius: 14, background: T.surfaceAlt, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Trash2b size={16} color={T.negative} /></button> : null}<button
    onClick={post}
    disabled={saving}
    style={{
      flex: 1, border: "none", borderRadius: 14, padding: "13px 0", background: accent, color: "#fff",
      fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1
    }}
  >{saving ? "Saving…" : (data.mine ? "Update review" : "Post review")}</button></div></div> : null}

  {data && !data.canReview ? <div style={{
    ...card, boxShadow: "none", background: T.surfaceAlt, fontSize: 12, color: T.inkSoft, fontWeight: 600, lineHeight: 1.5
  }}>{data.isOwner
    ? "Reviews are anonymous. Only people who have paid you can leave one, and nobody — you included — can remove somebody else's."
    : `Only people who have paid ${name} can leave a review. Pay once, then come back to rate it.`}</div> : null}

  {error ? <div style={{ fontSize: 12, fontWeight: 700, color: T.negative, margin: "0 2px 12px" }}>{error}</div> : null}

  {data && reviews.length === 0 ? <div style={{
    textAlign: "center", fontSize: 12.5, color: T.inkFaint, padding: "10px 0 6px"
  }}>No reviews yet.</div> : null}
  {reviews.map((r) => <div key={r.id} style={{
    padding: "12px 2px", borderTop: `1px solid ${T.line}`
  }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><ShopStars value={r.stars} size={12} /><span style={{
    flex: 1, fontSize: 10.5, color: T.inkFaint, fontWeight: 600
  }}>{creatorWhen(r.at)}</span>{r.mine ? <span style={{
    fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
    color: accent, background: theme.soft, borderRadius: 6, padding: "2px 6px"
  }}>You</span> : null}</div>{r.text ? <div style={{
    fontSize: 13, color: T.ink, lineHeight: 1.45, marginTop: 6, overflowWrap: "anywhere"
  }}>{r.text}</div> : null}</div>)}
  </div></div>;
}
