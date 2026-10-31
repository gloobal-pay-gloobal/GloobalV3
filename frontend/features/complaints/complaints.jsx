// src/features/complaints/complaints.jsx
import { useState as useState72, useEffect as useEffect68, useRef as useRef41 } from "react";
import {
  UserX as CpWrongPersonIcon,
  Calculator as CpWrongAmountIcon,
  Copy as CpTwiceIcon,
  PackageX as CpNotReceivedIcon,
  ShieldAlert as CpNotMeIcon,
  MessageCircleMore as CpOtherIcon,
  MessageSquareWarning as CpComplaintIcon,
  CheckCircle2 as CpDoneIcon,
  Send as CpSendIcon,
  Undo2 as CpSendBackIcon,
  LifeBuoy as CpEscalateIcon,
  ChevronRight as CpChevronIcon,
  Check as CpCheckIcon,
  KeyRound as CpPinIcon
} from "lucide-react";

// ── COMPLAINTS: A WRONG PAYMENT, BETWEEN THE TWO PEOPLE IT CONCERNS ─────
//
// The receipt's Report button used to open a case on THIS phone only: the
// other person never heard about it and nothing reached the server. This
// is the flow that replaces it.
//
//   1. The receipt's Complain icon opens a reason picker.
//   2. Picking a reason raises a case. No money moves.
//   3. The person who was paid is told, sees the reason, and the two of
//      them talk in the case's own chat.
//   4. They can send the money back from inside the case (confirmed with
//      their PIN), and the person who raised it marks it solved.
//   5. If nobody answers for 48 hours, the person who raised it can hand
//      it to GLOOBAL support, who can then read the chat.
//
// Both people find every case under Profile → Complaints & reports.

var COMPLAINT_REASONS = [
  { key: "wrong_person", label: "Sent to the wrong person", hint: "The money went to someone I didn't mean to pay.", Icon: CpWrongPersonIcon, color: "#DC2626" },
  { key: "wrong_amount", label: "Wrong amount", hint: "I paid more than I meant to.", Icon: CpWrongAmountIcon, color: "#EA580C" },
  { key: "paid_twice", label: "Paid twice", hint: "The same payment went through two times.", Icon: CpTwiceIcon, color: "#2563EB" },
  { key: "not_received", label: "Didn't get the item or service", hint: "I paid, but what I paid for never came.", Icon: CpNotReceivedIcon, color: "#9333EA" },
  { key: "not_me", label: "I didn't make this payment", hint: "Someone else used my account.", Icon: CpNotMeIcon, color: "#B91C1C" },
  { key: "other", label: "Something else", hint: "Tell them what went wrong.", Icon: CpOtherIcon, color: "#059669" }
];

function complaintReason(key) {
  return COMPLAINT_REASONS.find((r) => r.key === key) || COMPLAINT_REASONS[COMPLAINT_REASONS.length - 1];
}

// How long a case waits for the other person before it can be handed to
// support. Long enough to sleep on, short enough that money isn't stuck.
var COMPLAINT_ESCALATE_AFTER_MS = 48 * 60 * 60 * 1000;
var COMPLAINT_NOTE_MAX = 280;

// What each status is called, and the colour it reads in. The person who
// raised the case and the person it is against see the SAME word: a case
// that reads "Waiting on you" to one and "Open" to the other is two cases.
var COMPLAINT_STATUS_INFO = {
  open: { label: "Waiting for reply", color: "#B45309", soft: "#FEF3C7" },
  replied: { label: "In chat", color: "#2563EB", soft: "#DBEAFE" },
  returned: { label: "Money sent back", color: "#0FA372", soft: "#E3F8EE" },
  solved: { label: "Solved", color: "#0FA372", soft: "#E3F8EE" },
  escalated: { label: "With GLOOBAL support", color: T.accent, soft: T.accentSoft }
};

function complaintStatusInfo(status) {
  return COMPLAINT_STATUS_INFO[status] || COMPLAINT_STATUS_INFO.open;
}

function complaintWhen(value) {
  if (!value) return "";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const mins = Math.round((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h`;
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function complaintTime(value) {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// The server's case, in the words the screens print: each side's own
// amount in its own currency, and when the payment was made.
function complaintForScreen(c, lens, ownCurrency) {
  if (!c) return c;
  const paid = c.paidAt ? new Date(c.paidAt) : null;
  const paidWhen = paid && !Number.isNaN(paid.getTime())
    ? `${paid.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${String(paid.getHours()).padStart(2, "0")}:${String(paid.getMinutes()).padStart(2, "0")}`
    : "";
  return {
    ...c,
    amountText: c.amountText || geuLensBarMoney(Number(c.amount) || 0, c.currency || "", lens, ownCurrency),
    // What "Send back" returns: the payer's figure, in the payer's money —
    // not the receiver's own reading of the same payment.
    returnAmountText: c.returnAmountText || geuLensBarMoney(Number(c.returnAmount) || 0, c.returnCurrency || c.currency || "", lens, ownCurrency),
    paidWhen: c.paidWhen || paidWhen,
    otherName: c.otherName || "GLOOBAL user"
  };
}

function ComplaintStatusPill({ status }) {
  const info = complaintStatusInfo(status);
  return <span
    data-complaint-status={status}
    style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "3px 9px", background: info.soft, color: info.color, fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}
  ><span style={{ width: 6, height: 6, borderRadius: "50%", background: info.color }} />{info.label}</span>;
}

// The payment a case is about, one line, used at the top of every step so
// nobody has to remember which payment they are complaining about.
function ComplaintPaymentLine({ payment, dark }) {
  if (!payment) return null;
  return <div
    data-complaint-payment
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, textAlign: "left", background: dark ? "rgba(255,255,255,0.12)" : T.surfaceAlt }}
  ><span
    style={{ width: 38, height: 38, borderRadius: "50%", background: dark ? "rgba(255,255,255,0.18)" : T.accentSoft, color: dark ? "#fff" : T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}
  >{String(payment.name || "?").trim().charAt(0).toUpperCase()}</span><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 14, fontWeight: 800, color: dark ? "#fff" : T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{payment.name}</span><span
    style={{ display: "block", fontSize: 11.5, color: dark ? "rgba(255,255,255,0.7)" : T.inkSoft, marginTop: 2 }}
  >{payment.when}</span></span><span
    style={{ fontSize: 16, fontWeight: 800, color: dark ? "#fff" : T.txnOut, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
  >{payment.amountText}</span></div>;
}

// ── 1. WHAT WENT WRONG ─────────────────────────────────────────────────
//
// One list, one choice, one button. The note is optional for every
// reason except "Something else", where it is the reason.
function ComplaintReasonSheet({ open, payment, busy = false, error = "", onRaise, onClose, onChangePin }) {
  const [reason, setReason] = useState72(null);
  const [note, setNote] = useState72("");
  useEffect68(() => {
    if (open) { setReason(null); setNote(""); }
  }, [open]);
  useBackClose(open, onClose);
  if (!open) return null;
  const needsNote = reason === "other";
  const ready = Boolean(reason) && (!needsNote || note.trim().length >= 3) && !busy;
  return <div
    role="dialog"
    aria-modal="true"
    aria-label="What went wrong?"
    data-complaint-sheet
    style={{ position: "fixed", inset: 0, zIndex: 640, background: "rgba(15,12,35,0.45)", display: "flex", alignItems: "flex-end" }}
    onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
  ><div
    style={{ width: "100%", maxHeight: "92%", display: "flex", flexDirection: "column", background: T.bg, borderRadius: "26px 26px 0 0", boxShadow: T.shadowFloat, fontFamily: T.fontBody }}
  ><div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}><span style={{ width: 40, height: 4, borderRadius: 2, background: T.line }} /></div><div
    style={{ padding: "8px 18px 0" }}
  ><div style={{ fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>What went wrong?</div><div
    style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4, lineHeight: 1.45 }}
  >Pick the closest reason. Raising a complaint doesn't move any money.</div><div style={{ marginTop: 12 }}><ComplaintPaymentLine payment={payment} /></div></div><div
    style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 18px 4px" }}
  ><div
    role="radiogroup"
    aria-label="Reason"
    style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{COMPLAINT_REASONS.map((r, i) => {
    const on = reason === r.key;
    return <button
      key={r.key}
      role="radio"
      aria-checked={on}
      data-complaint-reason={r.key}
      onClick={() => setReason(r.key)}
      className="v2-tap"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: on ? T.accentSoft : "transparent", cursor: "pointer", textAlign: "left", fontFamily: T.fontBody }}
    ><span style={{ width: 36, height: 36, borderRadius: 11, background: r.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><r.Icon size={18} color={r.color} /></span><span style={{ flex: 1, minWidth: 0 }}><span
      style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}
    >{r.label}</span><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2, lineHeight: 1.35 }}>{r.hint}</span></span><span
      aria-hidden="true"
      style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: on ? "none" : `2px solid ${T.line}`, background: on ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
    >{on && <CpCheckIcon size={13} color="#fff" strokeWidth={3} />}</span></button>;
  })}</div>{reason === "not_me" && <div
    data-complaint-not-me
    style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, background: T.negativeSoft }}
  ><CpPinIcon size={20} color={T.negative} style={{ flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#7F1D1D", lineHeight: 1.4 }}>If someone else is using your account, change your PIN now.</span>{onChangePin && <button
    onClick={onChangePin}
    className="v2-tap"
    style={{ border: "none", borderRadius: 999, padding: "8px 12px", background: T.negative, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
  >Change PIN</button>}</div>}{reason && <div style={{ marginTop: 12 }}><label
    htmlFor="complaint-note"
    style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: T.inkFaint, margin: "0 2px 6px" }}
  >{needsNote ? "What happened?" : "Add a note (optional)"}</label><textarea
    id="complaint-note"
    value={note}
    maxLength={COMPLAINT_NOTE_MAX}
    onChange={(e) => setNote(e.target.value)}
    rows={3}
    placeholder={needsNote ? "Tell them what went wrong" : "e.g. I meant to pay my brother Rahul"}
    style={{ width: "100%", boxSizing: "border-box", resize: "none", borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, padding: "11px 13px", fontSize: 13.5, color: T.ink, fontFamily: T.fontBody, outline: "none" }}
  /><div style={{ textAlign: "right", fontSize: 10.5, color: T.inkFaint, marginTop: 3 }}>{note.length}/{COMPLAINT_NOTE_MAX}</div></div>}</div><div
    style={{ padding: "10px 18px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.line}`, background: T.bg }}
  >{error && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: T.negative, marginBottom: 8 }}>{error}</div>}<div
    style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45, marginBottom: 10 }}
  >{`${payment && payment.name ? payment.name.split(" ")[0] : "They"} will see your reason and can reply in a private chat.`}</div><button
    data-complaint-raise
    disabled={!ready}
    onClick={() => ready && onRaise && onRaise({ reason, note: note.trim() })}
    className="v2-tap"
    style={{ width: "100%", minHeight: 50, borderRadius: 999, border: "none", background: ready ? T.gradButton : T.gradButtonDisabled, color: "#fff", fontSize: 15, fontWeight: 800, cursor: ready ? "pointer" : "default", fontFamily: T.fontBody }}
  >{busy ? "Raising…" : "Raise complaint"}</button></div></div></div>;
}

// ── 2. RAISED ──────────────────────────────────────────────────────────
function ComplaintRaisedSheet({ open, caseRef, payment, onOpenChat, onDone }) {
  useBackClose(open, onDone);
  if (!open) return null;
  const first = payment && payment.name ? payment.name.split(" ")[0] : "They";
  return <div
    role="dialog"
    aria-modal="true"
    aria-label="Complaint raised"
    data-complaint-raised
    style={{ position: "fixed", inset: 0, zIndex: 640, background: "rgba(15,12,35,0.45)", display: "flex", alignItems: "flex-end" }}
  ><div
    style={{ width: "100%", background: T.bg, borderRadius: "26px 26px 0 0", padding: "26px 20px calc(18px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", fontFamily: T.fontBody }}
  ><span style={{ width: 64, height: 64, borderRadius: "50%", background: T.positiveSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><CpDoneIcon size={34} color={T.positive} /></span><div
    style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 14 }}
  >Complaint raised</div><div
    style={{ fontSize: 13, color: T.inkSoft, marginTop: 6, lineHeight: 1.5, maxWidth: 300 }}
  >{`We've told ${first}. You'll get a notification when they reply. If there's no reply in 48 hours, you can ask GLOOBAL support to step in.`}</div><div
    style={{ marginTop: 14, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.inkFaint, fontFamily: "ui-monospace, monospace" }}
  >{`CASE ${caseRef || ""}`}</div><div style={{ width: "100%", marginTop: 16 }}><ComplaintPaymentLine payment={payment} /></div><div
    style={{ display: "flex", gap: 10, width: "100%", marginTop: 16 }}
  ><button
    onClick={onDone}
    className="v2-tap"
    style={{ flex: 1, minHeight: 48, borderRadius: 999, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 14, fontWeight: 800, cursor: "pointer" }}
  >Done</button><button
    data-complaint-open-chat
    onClick={onOpenChat}
    className="v2-tap"
    style={{ flex: 1, minHeight: 48, borderRadius: 999, border: "none", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
  >Open chat</button></div></div></div>;
}

// ── 3. THE LIST — Profile → Complaints & reports ───────────────────────
function ComplaintsScreen({ cases = [], loading = false, onOpen, onBack }) {
  const raised = cases.filter((c) => c.myRole === "reporter");
  const against = cases.filter((c) => c.myRole === "receiver");
  const [tab, setTab] = useState72(() => (against.some((c) => c.unread) && !raised.some((c) => c.unread) ? "against" : "raised"));
  const list = tab === "raised" ? raised : against;
  const tabButton = (key, label, rows) => {
    const on = tab === key;
    const unread = rows.filter((c) => c.unread).length;
    return <button
      role="tab"
      aria-selected={on}
      data-complaint-tab={key}
      onClick={() => setTab(key)}
      className="v2-tap"
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", borderRadius: 999, padding: "9px 0", background: on ? T.surface : "transparent", boxShadow: on ? T.shadowCard : "none", color: on ? T.ink : T.inkSoft, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody }}
    >{label}<span style={{ fontSize: 11, color: T.inkFaint }}>{rows.length}</span>{unread > 0 && <span style={{ minWidth: 17, height: 17, borderRadius: 9, background: T.negative, color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unread}</span>}</button>;
  };
  return <div
    data-complaints-screen
    style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody }}
  ><div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px" }}
  ><NavBackButton onClick={onBack} /><span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Complaints & reports</span></div><div
    style={{ padding: "4px 18px 12px" }}
  ><div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 999, background: T.surfaceSunk }}>{tabButton("raised", "Raised by me", raised)}{tabButton("against", "Against me", against)}</div></div><div
    style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px calc(24px + env(safe-area-inset-bottom, 0px))" }}
  >{loading ? <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 13, marginTop: 40 }}>Loading…</div> : list.length === 0 ? <div
    data-complaints-empty
    style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 50, padding: "0 20px" }}
  ><span style={{ width: 60, height: 60, borderRadius: 18, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><CpComplaintIcon size={28} color={T.accent} /></span><div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginTop: 14 }}>{tab === "raised" ? "No complaints raised" : "No complaints against you"}</div><div
    style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}
  >{tab === "raised" ? "Paid the wrong person or the wrong amount? Open the payment's receipt and tap Complain." : "If someone raises a complaint about a payment they sent you, it shows up here."}</div></div> : <div
    style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{list.map((c, i) => {
    const r = complaintReason(c.reason);
    const last = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
    return <button
      key={c.id}
      data-complaint-row={c.id}
      onClick={() => onOpen && onOpen(c)}
      className="v2-tap"
      style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 14px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: T.fontBody }}
    ><span style={{ position: "relative", width: 40, height: 40, borderRadius: 13, background: r.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><r.Icon size={19} color={r.color} />{c.unread && <span style={{ position: "absolute", top: -2, right: -2, width: 11, height: 11, borderRadius: "50%", background: T.negative, border: "2px solid #fff" }} />}</span><span
      style={{ flex: 1, minWidth: 0 }}
    ><span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span
      style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >{c.otherName}</span><span style={{ fontSize: 13, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.amountText}</span></span><span
      style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2 }}
    >{r.label}</span><span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}><ComplaintStatusPill status={c.status} /><span
      style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: c.unread ? T.ink : T.inkFaint, fontWeight: c.unread ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >{last ? last.text : ""}</span><span style={{ fontSize: 10.5, color: T.inkFaint, flexShrink: 0 }}>{complaintWhen(last ? last.at : c.openedAt)}</span></span></span></button>;
  })}</div>}</div></div>;
}

// ── 4. ONE CASE: THE FACTS, THE CHAT, AND THE WAY OUT ──────────────────
function ComplaintCaseScreen({ complaint, busy = "", onBack, onSend, onSendBack, onSolved, onEscalate, now = Date.now() }) {
  const [draft, setDraft] = useState72("");
  const listRef = useRef41(null);
  useEffect68(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [complaint && complaint.messages && complaint.messages.length]);
  if (!complaint) return null;
  const c = complaint;
  const r = complaintReason(c.reason);
  const isReporter = c.myRole === "reporter";
  const closed = c.status === "solved" || c.status === "returned";
  const canEscalateAt = new Date(c.openedAt).getTime() + COMPLAINT_ESCALATE_AFTER_MS;
  const escalateWait = Math.max(0, canEscalateAt - now);
  const first = String(c.otherName || "They").split(" ")[0];
  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onSend && onSend(text);
    setDraft("");
  };
  const steps = [["Raised", true], ["Replied", c.status !== "open"], [c.status === "escalated" ? "Support" : "Solved", closed || c.status === "escalated"]];
  return <div
    data-complaint-case={c.id}
    style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody }}
  ><div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px" }}
  ><NavBackButton onClick={onBack} /><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 16.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{c.otherName}</span><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: T.inkFaint, fontFamily: "ui-monospace, monospace" }}>{`CASE ${c.ref}`}</span></span><ComplaintStatusPill status={c.status} /></div><div
    style={{ padding: "0 18px 10px" }}
  ><div
    data-complaint-summary
    style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, padding: 14 }}
  ><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 40, height: 40, borderRadius: 13, background: r.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><r.Icon size={19} color={r.color} /></span><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}
  >{r.label}</span><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{`${isReporter ? "You paid" : `${first} paid you`} ${c.amountText} · ${c.paidWhen}`}</span></span></div>{c.note && <div
    style={{ marginTop: 10, padding: "9px 12px", borderRadius: 12, background: T.surfaceAlt, fontSize: 12.5, color: T.ink, lineHeight: 1.45 }}
  >{`“${c.note}”`}</div>}<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>{steps.map(([label, done], i) => <span
    key={label}
    style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}
  ><span style={{ height: 4, borderRadius: 2, background: done ? (i === 2 && c.status === "escalated" ? T.accent : T.positive) : T.line }} /><span
    style={{ fontSize: 10.5, fontWeight: 800, color: done ? T.ink : T.inkFaint }}
  >{label}</span></span>)}</div></div>{!isReporter && !closed && c.status !== "escalated" && <div
    data-complaint-against-banner
    style={{ marginTop: 10, borderRadius: 18, padding: 14, background: "#FFF7ED", border: "1px solid #FED7AA" }}
  ><div style={{ fontSize: 12.5, color: "#7C2D12", fontWeight: 700, lineHeight: 1.45 }}>{`${first} says this payment was a mistake. If they're right, send it back — it goes straight to them and this case closes.`}{c.returnAmountText && c.returnAmountText !== c.amountText && <span style={{ display: "block", marginTop: 4, fontWeight: 600 }}>{`You received ${c.amountText}; sending back ${c.returnAmountText} in their money.`}</span>}</div><button
    data-complaint-send-back
    disabled={Boolean(busy)}
    onClick={onSendBack}
    className="v2-tap"
    style={{ marginTop: 10, width: "100%", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, border: "none", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
  ><CpSendBackIcon size={17} color="#fff" />{busy === "sendBack" ? "Sending…" : `Send back ${c.returnAmountText || c.amountText}`}</button></div>}</div><div
    ref={listRef}
    data-complaint-chat
    style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 10px", display: "flex", flexDirection: "column", gap: 8 }}
  ><div style={{ alignSelf: "center", fontSize: 10.5, color: T.inkFaint, textAlign: "center", lineHeight: 1.45, maxWidth: 270, margin: "4px 0 6px" }}>Only you two can read this chat. GLOOBAL support sees it only if the case is escalated.</div>{(c.messages || []).map((m) => m.from === "system" ? <div
    key={m.id}
    data-complaint-msg="system"
    style={{ alignSelf: "center", fontSize: 11, fontWeight: 700, color: T.inkSoft, background: T.surfaceSunk, borderRadius: 999, padding: "5px 12px", textAlign: "center" }}
  >{m.text}</div> : <div
    key={m.id}
    data-complaint-msg={m.from}
    style={{ alignSelf: m.from === "me" ? "flex-end" : "flex-start", maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: m.from === "me" ? "flex-end" : "flex-start" }}
  ><span
    style={{ padding: "9px 13px", borderRadius: m.from === "me" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.from === "me" ? T.accent : T.surface, color: m.from === "me" ? "#fff" : T.ink, boxShadow: m.from === "me" ? "none" : T.shadowCard, fontSize: 13.5, lineHeight: 1.4, overflowWrap: "anywhere" }}
  >{m.text}</span><span style={{ fontSize: 10, color: T.inkFaint, marginTop: 3 }}>{complaintTime(m.at)}</span></div>)}</div>{isReporter && !closed && c.status !== "escalated" && <div
    style={{ display: "flex", gap: 8, padding: "0 18px 8px" }}
  ><button
    data-complaint-solved
    onClick={onSolved}
    disabled={Boolean(busy)}
    className="v2-tap"
    style={{ flex: 1, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, border: `1px solid ${T.line}`, background: T.surface, color: T.positive, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
  ><CpDoneIcon size={15} color={T.positive} />Mark solved</button><button
    data-complaint-escalate
    onClick={escalateWait === 0 ? onEscalate : undefined}
    disabled={escalateWait > 0 || Boolean(busy)}
    className="v2-tap"
    style={{ flex: 1, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, border: `1px solid ${T.line}`, background: T.surface, color: escalateWait > 0 ? T.inkFaint : T.accent, fontSize: 12.5, fontWeight: 800, cursor: escalateWait > 0 ? "default" : "pointer" }}
  ><CpEscalateIcon size={15} color={escalateWait > 0 ? T.inkFaint : T.accent} />{escalateWait > 0 ? `Support in ${Math.ceil(escalateWait / 3600000)}h` : "Ask support"}</button></div>}{closed ? <div
    style={{ padding: "12px 18px calc(16px + env(safe-area-inset-bottom, 0px))", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: T.positive, borderTop: `1px solid ${T.line}` }}
  >{c.status === "returned" ? "The money was sent back. This case is closed." : "Marked solved. This case is closed."}</div> : <div
    style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 14px calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.line}`, background: T.bg }}
  ><textarea
    id="complaint-chat-input"
    aria-label="Message"
    value={draft}
    rows={1}
    maxLength={500}
    onChange={(e) => setDraft(e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
    placeholder={`Message ${first}`}
    style={{ flex: 1, minWidth: 0, resize: "none", borderRadius: 20, border: `1px solid ${T.line}`, background: T.surface, padding: "11px 14px", fontSize: 14, color: T.ink, fontFamily: T.fontBody, outline: "none", maxHeight: 110 }}
  /><button
    data-complaint-send
    onClick={send}
    disabled={!draft.trim() || Boolean(busy)}
    aria-label="Send"
    className="v2-tap"
    style={{ width: 44, height: 44, borderRadius: "50%", border: "none", flexShrink: 0, background: draft.trim() ? T.gradButton : T.gradButtonDisabled, display: "flex", alignItems: "center", justifyContent: "center", cursor: draft.trim() ? "pointer" : "default" }}
  ><CpSendIcon size={18} color="#fff" /></button></div>}</div>;
}
