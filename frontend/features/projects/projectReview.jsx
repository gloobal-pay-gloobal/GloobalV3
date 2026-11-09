// src/features/projects/projectReview.jsx
import { useState as useState100, useEffect as useEffect97 } from "react";
import { Check as RevCheck, X as RevX, Clock as RevClock, AlertCircle as RevAlert, ChevronRight as RevChevron, ShieldCheck as RevShield, Plus as RevPlus, Trash2 as RevTrash } from "lucide-react";

// ── HOOMAN PROJECTS: APPLYING FOR GLOOBAL FUNDING ───────────────────────
//
// The applicant's side and GLOOBAL's side of server/lib/projectReview.js.
//
//   ProjectStatusChip     where a project is, on every list row and page
//   ProjectApplicantPanel on the owner's own project page: the checklist,
//                         the plan, Submit, questions to answer, milestone
//                         updates to post, the timeline, withdraw / apply again
//   ProjectReviewDesk     GLOOBAL reviewers only: the queue, and for each
//                         project start, ask, approve with an amount and
//                         milestones, decline with a reason, pause, resume,
//                         pay a milestone on Send and mark it paid
//
// Every action is the server's to decide; these screens show its answer,
// including its own words when it refuses.

var PROJECT_REVIEW_TONE = {
  none: "positive", draft: "quiet", submitted: "info", under_review: "info", needs_info: "warn",
  approved: "positive", funding: "positive", paused: "warn", completed: "positive", declined: "negative", withdrawn: "quiet"
};

function projectReviewColors(state) {
  const tone = PROJECT_REVIEW_TONE[state] || "quiet";
  if (tone === "positive") return { fg: T.positive, bg: `${T.positive}1c` };
  if (tone === "info") return { fg: "#2563EB", bg: "#2563EB18" };
  if (tone === "warn") return { fg: "#B45309", bg: "#F59E0B22" };
  if (tone === "negative") return { fg: T.negative, bg: `${T.negative}18` };
  return { fg: T.inkSoft, bg: `${T.inkFaint}22` };
}

function projectMoney(minor, currency) {
  const n = (Number(minor) || 0) / 100;
  return `${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

function projectReviewDate(at) {
  try { return new Date(at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
}

// The label the server gave the state ("Under review", "Paused"…).
function ProjectStatusChip({ review, small }) {
  const state = (review && review.state) || "none";
  const label = (review && review.label) || "Live";
  const c = projectReviewColors(state);
  return <span data-testid="project-status" data-state={state} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: small ? 10.5 : 11.5, fontWeight: 800, color: c.fg, background: c.bg, borderRadius: 999, padding: small ? "3px 8px" : "4px 10px", whiteSpace: "nowrap" }}>{state === "under_review" || state === "submitted" ? <RevClock size={small ? 10 : 12} /> : state === "needs_info" || state === "paused" ? <RevAlert size={small ? 10 : 12} /> : null}{label}</span>;
}

var projectCard = () => ({ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 14px" });
var projectTitle = { fontSize: 13.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay };
var projectSmall = { fontSize: 12, fontWeight: 600, color: T.inkSoft, lineHeight: 1.5 };
var projectButton = (primary, disabled) => ({ height: 44, borderRadius: 14, border: primary ? "none" : `1px solid ${T.line}`, background: primary ? T.gradButton : T.surface, color: primary ? "#fff" : T.ink, fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, padding: "0 16px" });
var projectTextArea = { width: "100%", boxSizing: "border-box", minHeight: 76, marginTop: 8, borderRadius: 12, border: `1px solid ${T.line}`, background: T.bg, padding: "10px 12px", fontSize: 14, color: T.ink, fontFamily: "inherit", outline: "none", resize: "vertical" };
var projectAmountInput = { width: 110, boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 10px", background: T.bg, fontSize: 14, color: T.ink, fontFamily: "inherit", outline: "none", textAlign: "right" };

function ProjectTimeline({ timeline }) {
  if (!timeline || !timeline.length) return null;
  return <div style={projectCard()}><div style={projectTitle}>Timeline</div><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>{timeline.slice().reverse().map((t, i) => {
    const c = projectReviewColors(t.state);
    return <div key={i} style={{ display: "flex", gap: 10 }}><span style={{ width: 10, height: 10, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: c.fg }} /><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>{t.label}<span style={{ fontWeight: 600, color: T.inkFaint }}>{` · ${t.by === "gloobal" ? "GLOOBAL" : "You"} · ${projectReviewDate(t.at)}`}</span></span>{t.note ? <span style={{ display: "block", ...projectSmall, marginTop: 1 }}>{t.note}</span> : null}</span></div>;
  })}</div></div>;
}

function ProjectMilestones({ review, owner, onUpdate, busy }) {
  const [drafts, setDrafts] = useState100({});
  if (!review || !review.milestones || !review.milestones.length) return null;
  return <div style={projectCard()}><div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={projectTitle}>GLOOBAL funding</span>{review.fund ? <span style={{ ...projectSmall, marginLeft: "auto" }}>{projectMoney(review.fund.minor, review.fund.currency)}</span> : null}</div><div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>{review.milestones.map((m, i) => {
    const needsUpdate = owner && m.state === "paid" && !m.updateAt;
    return <div key={i} data-testid="project-milestone" data-state={m.state} style={{ borderTop: i ? `1px solid ${T.line}` : "none", paddingTop: i ? 10 : 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: m.state === "paid" ? T.positive : m.state === "due" ? "#2563EB" : `${T.inkFaint}33`, color: "#fff", fontSize: 11, fontWeight: 800 }}>{m.state === "paid" ? <RevCheck size={13} /> : i + 1}</span><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{m.label}</span><span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{projectMoney(m.amountMinor, review.fund && review.fund.currency)}</span></div><div style={{ ...projectSmall, marginLeft: 30 }}>{m.state === "paid" ? `Paid ${projectReviewDate(m.paidAt)}${m.updateAt ? ` · update posted ${projectReviewDate(m.updateAt)}` : ""}` : m.state === "due" ? "GLOOBAL pays this next" : "Opens when the update before it is posted"}</div>{m.update ? <div style={{ ...projectSmall, marginLeft: 30, marginTop: 4, color: T.ink }}>{`“${m.update}”`}</div> : null}{needsUpdate ? <div style={{ marginLeft: 30, marginTop: 6 }}><textarea
      data-testid="milestone-update"
      value={drafts[i] || ""}
      onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
      placeholder="What was done with this money? Add photos to the project if you can."
      style={projectTextArea}
    /><button type="button" data-testid="milestone-update-send" disabled={busy} onClick={() => onUpdate(i, drafts[i] || "")} style={{ ...projectButton(true, busy), marginTop: 8, width: "100%" }}>Post update</button></div> : null}</div>;
  })}</div></div>;
}

// ── THE APPLICANT ───────────────────────────────────────────────────────
function ProjectApplicantPanel({ project, onChanged, onToast }) {
  const [data, setData] = useState100(null);
  const [plan, setPlan] = useState100([]);
  const [answers, setAnswers] = useState100({});
  const [busy, setBusy] = useState100(false);
  const [error, setError] = useState100(null);
  const load = async () => {
    try {
      const r = await GloobalApi.getProjectReview(project.id);
      setData(r);
      setPlan((r.plan || []).map((l) => ({ label: l.label, amountMajor: (l.amountMinor / 100).toFixed(2) })));
    } catch (e) {
      setError((e && e.message) || "Couldn't load the review.");
    }
  };
  useEffect97(() => { load(); }, [project.id]);
  const act = async (fn, okText) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      if (okText) onToast?.(okText);
      onChanged?.();
    } catch (e) {
      setError((e && e.body && e.body.message) || (e && e.message) || "That didn't work.");
      if (e && e.body && e.body.requirements) setData((d) => (d ? { ...d, requirements: e.body.requirements } : d));
    } finally {
      setBusy(false);
    }
  };
  if (!data) return error ? <div style={{ ...projectCard(), ...projectSmall, color: T.negative }}>{error}</div> : null;
  const review = data.review || {};
  if (review.state === "none") return null;
  const draft = review.state === "draft";
  const goal = project.goal;
  const planSum = plan.reduce((a, l) => a + Math.round(Number(l.amountMajor || 0) * 100), 0);
  const openQs = (review.questions || []).filter((q) => !q.answeredAt);
  const reqs = data.requirements || [];
  const ready = reqs.length && reqs.every((r) => r.ok);
  return <div data-testid="project-applicant-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}><div style={{ ...projectCard(), display: "flex", flexDirection: "column", gap: 6 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><RevShield size={17} color={T.accent} /><span style={{ ...projectTitle, flex: 1 }}>GLOOBAL funding</span><ProjectStatusChip review={review} /></div>{review.nextStep ? <div data-testid="project-next-step" style={projectSmall}>{review.nextStep}</div> : null}{review.reason ? <div data-testid="project-reason" style={{ ...projectSmall, color: T.ink, background: `${T.inkFaint}18`, borderRadius: 10, padding: "8px 10px" }}><b>Why: </b>{review.reason}</div> : null}</div>{draft ? <div style={projectCard()}><div style={projectTitle}>Before you submit</div><div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>{reqs.map((r) => <div key={r.key} data-testid="project-requirement" data-ok={r.ok ? "1" : "0"} style={{ display: "flex", gap: 10 }}><span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: r.ok ? T.positive : `${T.inkFaint}33` }}>{r.ok ? <RevCheck size={12} color="#fff" /> : <RevX size={12} color={T.inkSoft} />}</span><span><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>{r.label}</span>{!r.ok ? <span style={{ display: "block", ...projectSmall }}>{r.hint}</span> : null}</span></div>)}</div></div> : null}{draft ? <div style={projectCard()}><div style={{ display: "flex", alignItems: "baseline" }}><span style={projectTitle}>Funding plan</span><span style={{ ...projectSmall, marginLeft: "auto" }}>{goal ? `Goal ${projectMoney(goal.minor, goal.currency)}` : "Set a goal on the project first"}</span></div><div style={{ ...projectSmall, marginTop: 2 }}>What the money is for, line by line. It has to add up to the goal.</div><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>{plan.map((l, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}><input
    aria-label={`Plan line ${i + 1}`}
    value={l.label}
    maxLength={80}
    onChange={(e) => setPlan((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
    placeholder="e.g. Steel and cement"
    style={{ ...projectAmountInput, flex: 1, width: "auto", textAlign: "left" }}
  /><input
    aria-label={`Plan line ${i + 1} amount`}
    data-amount-pad="2"
    data-amount-label="Plan amount"
    readOnly
    inputMode="none"
    value={l.amountMajor}
    onChange={(e) => setPlan((p) => p.map((x, j) => (j === i ? { ...x, amountMajor: e.target.value.replace(/[^0-9.]/g, "") } : x)))}
    placeholder="0"
    style={projectAmountInput}
  /><button type="button" aria-label="Remove line" onClick={() => setPlan((p) => p.filter((_, j) => j !== i))} style={{ width: 34, height: 34, border: "none", background: "transparent", cursor: "pointer" }}><RevTrash size={15} color={T.inkFaint} /></button></div>)}</div><div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}><button type="button" onClick={() => setPlan((p) => [...p, { label: "", amountMajor: "" }])} style={{ ...projectButton(false), height: 36, display: "flex", alignItems: "center", gap: 6 }}><RevPlus size={14} />Add line</button><span style={{ ...projectSmall, marginLeft: "auto", color: goal && planSum === goal.minor ? T.positive : T.inkSoft }}>{`Adds up to ${projectMoney(planSum, goal && goal.currency)}`}</span></div><button type="button" data-testid="project-plan-save" disabled={busy || !plan.length} onClick={() => act(() => GloobalApi.setProjectPlan(project.id, plan), "Plan saved")} style={{ ...projectButton(false, busy || !plan.length), width: "100%", marginTop: 10 }}>Save plan</button></div> : null}{draft ? <button type="button" data-testid="project-submit" disabled={busy || !ready} onClick={() => act(() => GloobalApi.submitProject(project.id), "Sent to GLOOBAL for review")} style={{ ...projectButton(true, busy || !ready), width: "100%" }}>{ready ? "Submit for GLOOBAL review" : "Finish the checklist to submit"}</button> : null}{openQs.map((q) => <div key={q.id} data-testid="project-question" style={{ ...projectCard(), border: "1px solid #F59E0B66" }}><div style={projectTitle}>GLOOBAL asks</div><div style={{ ...projectSmall, color: T.ink, marginTop: 4 }}>{q.question}</div><textarea data-testid="project-answer" value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Your answer" style={projectTextArea} /><button type="button" data-testid="project-answer-send" disabled={busy || !(answers[q.id] || "").trim()} onClick={() => act(() => GloobalApi.answerProjectQuestion(project.id, q.id, answers[q.id]), "Answer sent")} style={{ ...projectButton(true, busy), width: "100%", marginTop: 8 }}>Send answer</button></div>)}<ProjectMilestones review={review} owner busy={busy} onUpdate={(i, text) => act(() => GloobalApi.postMilestoneUpdate(project.id, i, text), "Update posted")} />{error ? <div data-testid="project-review-error" style={{ ...projectSmall, color: T.negative, padding: "0 4px" }}>{error}</div> : null}<ProjectTimeline timeline={review.timeline} />{review.state === "declined" || review.state === "withdrawn" ? <button type="button" data-testid="project-reapply" disabled={busy} onClick={() => act(() => GloobalApi.reapplyProject(project.id), "Back to a draft: edit it and submit again")} style={{ ...projectButton(false, busy), width: "100%" }}>Edit and apply again</button> : !["completed", "draft"].includes(review.state) ? <button type="button" data-testid="project-withdraw" disabled={busy} onClick={() => act(() => GloobalApi.withdrawProject(project.id), "Withdrawn")} style={{ ...projectButton(false, busy), width: "100%", color: T.negative }}>Withdraw application</button> : null}</div>;
}

// ── GLOOBAL'S DESK ──────────────────────────────────────────────────────
var PROJECT_DESK_TABS = [["", "To do"], ["submitted", "New"], ["under_review", "Reviewing"], ["needs_info", "Asked"], ["funding", "Funding"], ["paused", "Paused"], ["declined", "Declined"], ["completed", "Done"]];

function ProjectReviewDesk({ onClose, onPayMilestone, onToast }) {
  const [tab, setTab] = useState100("");
  const [data, setData] = useState100(null);
  const [open, setOpen] = useState100(null);
  const [error, setError] = useState100(null);
  const load = async () => {
    try {
      setData(await GloobalApi.reviewQueue(tab));
      setError(null);
    } catch (e) {
      setError((e && e.message) || "Couldn't load the queue.");
    }
  };
  useEffect97(() => { load(); }, [tab]);
  const counts = (data && data.counts) || {};
  return <div data-testid="project-review-desk" style={{ position: "fixed", inset: 0, zIndex: 360, background: T.bg, display: "flex", flexDirection: "column" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 10px" }}><NavBackButton onClick={open ? () => { setOpen(null); load(); } : onClose} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{open ? "Review" : "GLOOBAL review desk"}</span></div>{open ? <ProjectReviewItem item={open} onPayMilestone={onPayMilestone} onToast={onToast} onChanged={(next) => setOpen(next)} /> : <><div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 18px 10px", flexShrink: 0 }}>{PROJECT_DESK_TABS.map(([k, label]) => <button key={k || "todo"} type="button" onClick={() => setTab(k)} style={{ flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 999, border: `1px solid ${tab === k ? T.accent : T.line}`, background: tab === k ? `${T.accent}14` : T.surface, color: tab === k ? T.accent : T.inkSoft, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{label}{k && counts[k] ? ` ${counts[k]}` : ""}</button>)}</div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 30px", display: "flex", flexDirection: "column", gap: 10 }}>{error ? <div style={{ ...projectSmall, color: T.negative }}>{error}</div> : null}{data && !data.projects.length ? <div style={{ ...projectSmall, textAlign: "center", padding: 30 }}>Nothing here.</div> : null}{data && data.projects.map((p) => <button key={p.id} type="button" data-testid="desk-row" onClick={() => setOpen(p)} style={{ ...projectCard(), border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center" }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", ...projectTitle }}>{p.title}</span><span style={{ display: "block", ...projectSmall }}>{`${p.category}${p.countryIso ? ` · ${p.countryIso}` : ""}${p.goal ? ` · asks ${projectMoney(p.goal.minor, p.goal.currency)}` : ""}`}</span><span style={{ display: "block", marginTop: 6 }}><ProjectStatusChip review={p.review} small /></span></span><RevChevron size={17} color={T.inkFaint} /></button>)}</div></>}</div>;
}

function ProjectReviewItem({ item, onPayMilestone, onToast, onChanged }) {
  const [full, setFull] = useState100(null);
  const [busy, setBusy] = useState100(false);
  const [error, setError] = useState100(null);
  const [question, setQuestion] = useState100("");
  const [reason, setReason] = useState100("");
  const [reapplyDays, setReapplyDays] = useState100("30");
  const [amount, setAmount] = useState100("");
  const [milestones, setMilestones] = useState100([{ label: "To start", percent: "40" }, { label: "Halfway", percent: "30" }, { label: "To finish", percent: "30" }]);
  const load = async () => {
    try { setFull(await GloobalApi.getProjectReview(item.id)); } catch (e) { setError((e && e.message) || "Couldn't load it."); }
  };
  useEffect97(() => { load(); }, [item.id]);
  const act = async (fn, okText) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      await load();
      if (okText) onToast?.(okText);
      setQuestion(""); setReason("");
      return r;
    } catch (e) {
      setError((e && e.body && e.body.message) || (e && e.message) || "That didn't work.");
      return e && e.body;
    } finally {
      setBusy(false);
    }
  };
  if (!full) return <div style={{ ...projectSmall, padding: 20 }}>{error || "Loading…"}</div>;
  const review = full.review;
  const state = review.state;
  const reviewing = ["submitted", "under_review", "needs_info"].includes(state);
  const pctTotal = milestones.reduce((a, m) => a + Number(m.percent || 0), 0);
  const due = (review.milestones || []).findIndex((m) => m.state === "due");
  return <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 30px", display: "flex", flexDirection: "column", gap: 12 }}><div style={projectCard()}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ ...projectTitle, flex: 1, fontSize: 16 }}>{item.title}</span><ProjectStatusChip review={review} /></div><div style={{ ...projectSmall, marginTop: 4 }}>{`${item.category}${item.countryIso ? ` · ${item.countryIso}` : ""} · by ${item.ownerSymbolId}`}</div>{item.goal ? <div style={{ ...projectSmall, marginTop: 6, color: T.ink }}><b>Asks for </b>{projectMoney(item.goal.minor, item.goal.currency)}</div> : null}{(full.plan || []).length ? <div style={{ marginTop: 8 }}>{full.plan.map((l, i) => <div key={i} style={{ display: "flex", ...projectSmall }}><span style={{ flex: 1 }}>{l.label}</span><span>{projectMoney(l.amountMinor, item.goal && item.goal.currency)}</span></div>)}</div> : null}<div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>{(full.requirements || []).map((r) => <span key={r.key} style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 8px", color: r.ok ? T.positive : T.negative, background: r.ok ? `${T.positive}18` : `${T.negative}14` }}>{`${r.ok ? "✓" : "✗"} ${r.label}`}</span>)}</div></div>{state === "submitted" ? <button type="button" data-testid="desk-start" disabled={busy} onClick={() => act(() => GloobalApi.reviewAction(item.id, "start"), "Review started")} style={{ ...projectButton(true, busy), width: "100%" }}>Start review</button> : null}{reviewing ? <div style={projectCard()}><div style={projectTitle}>Ask the applicant</div><textarea data-testid="desk-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you need to know?" style={projectTextArea} /><button type="button" data-testid="desk-ask" disabled={busy || question.trim().length < 5} onClick={() => act(() => GloobalApi.reviewAction(item.id, "ask", { question }), "Question sent")} style={{ ...projectButton(false, busy), width: "100%", marginTop: 8 }}>Send question</button></div> : null}{state === "under_review" || state === "submitted" ? <div style={projectCard()}><div style={projectTitle}>Approve</div><div style={{ ...projectSmall, marginTop: 2 }}>How much GLOOBAL gives. 0 approves it for public giving only.</div><div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}><input data-testid="desk-amount" aria-label="GLOOBAL gives" data-amount-pad="2" data-amount-label="GLOOBAL gives" readOnly inputMode="none" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={{ ...projectAmountInput, flex: 1, width: "auto" }} /><span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>{(item.goal && item.goal.currency) || ""}</span></div>{Number(amount) > 0 ? <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>{milestones.map((m, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}><input aria-label={`Milestone ${i + 1}`} value={m.label} onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ ...projectAmountInput, flex: 1, width: "auto", textAlign: "left" }} /><input aria-label={`Milestone ${i + 1} percent`} data-amount-pad="0" data-amount-label="Percent" readOnly inputMode="none" value={m.percent} onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, percent: e.target.value.replace(/[^0-9]/g, "") } : x)))} style={{ ...projectAmountInput, width: 64 }} /><span style={projectSmall}>%</span></div>)}<span style={{ ...projectSmall, color: pctTotal === 100 ? T.positive : T.negative }}>{`Adds up to ${pctTotal}%`}</span></div> : null}<button type="button" data-testid="desk-approve" disabled={busy || (Number(amount) > 0 && pctTotal !== 100)} onClick={() => act(() => GloobalApi.reviewAction(item.id, "approve", { amountMajor: amount || "0", currency: item.goal && item.goal.currency, milestones: milestones.map((m) => ({ label: m.label, percent: Number(m.percent) })) }), "Approved")} style={{ ...projectButton(true, busy), width: "100%", marginTop: 10 }}>{Number(amount) > 0 ? `Approve and give ${amount}` : "Approve for public giving"}</button></div> : null}{reviewing || ["approved", "funding"].includes(state) ? <div style={projectCard()}><div style={projectTitle}>{reviewing ? "Decline" : "Pause"}</div><textarea data-testid="desk-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reviewing ? "Why, so they know what to change" : "Why it is paused, and what restarts it"} style={projectTextArea} />{reviewing ? <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}><span style={projectSmall}>They can apply again after</span><input aria-label="Days before applying again" data-amount-pad="0" data-amount-label="Days" readOnly inputMode="none" value={reapplyDays} onChange={(e) => setReapplyDays(e.target.value.replace(/[^0-9]/g, ""))} style={{ ...projectAmountInput, width: 60 }} /><span style={projectSmall}>days</span></div> : null}<button type="button" data-testid={reviewing ? "desk-decline" : "desk-pause"} disabled={busy || reason.trim().length < 10} onClick={() => act(() => GloobalApi.reviewAction(item.id, reviewing ? "decline" : "pause", reviewing ? { reason, reapplyDays: Number(reapplyDays || 0) } : { reason }), reviewing ? "Declined" : "Paused")} style={{ ...projectButton(false, busy), width: "100%", marginTop: 8, color: T.negative }}>{reviewing ? "Decline" : "Pause"}</button></div> : null}{state === "paused" ? <button type="button" data-testid="desk-resume" disabled={busy} onClick={() => act(() => GloobalApi.reviewAction(item.id, "resume"), "Resumed")} style={{ ...projectButton(true, busy), width: "100%" }}>Resume</button> : null}<ProjectMilestones review={review} />{due >= 0 && ["approved", "funding"].includes(state) ? <div style={projectCard()}><div style={projectTitle}>{`Pay "${review.milestones[due].label}"`}</div><div style={{ ...projectSmall, marginTop: 2 }}>Pay it on Send, then mark it paid. GLOOBAL checks that the payment really happened.</div><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button type="button" data-testid="desk-pay" onClick={() => onPayMilestone && onPayMilestone({ toSymbolId: item.ownerSymbolId, amountMajor: (review.milestones[due].amountMinor / 100).toFixed(2) })} style={{ ...projectButton(false), flex: 1 }}>Pay on Send</button><button type="button" data-testid="desk-mark-paid" disabled={busy} onClick={() => act(() => GloobalApi.reviewMarkPaid(item.id, due), "Marked paid")} style={{ ...projectButton(true, busy), flex: 1 }}>Mark paid</button></div></div> : null}{error ? <div data-testid="desk-error" style={{ ...projectSmall, color: T.negative }}>{error}</div> : null}<ProjectTimeline timeline={review.timeline} />{(review.questions || []).length ? <div style={projectCard()}><div style={projectTitle}>Questions</div>{review.questions.map((q) => <div key={q.id} style={{ marginTop: 8 }}><div style={{ ...projectSmall, color: T.ink }}>{`Q: ${q.question}`}</div><div style={projectSmall}>{q.answeredAt ? `A: ${q.answer}` : "Not answered yet"}</div></div>)}</div> : null}</div>;
}
