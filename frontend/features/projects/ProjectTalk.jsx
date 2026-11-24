// src/features/projects/ProjectTalk.jsx
//
// ── UNDERSTAND IT FIRST, THEN APPLY ──────────────────────────────────────
//
// Before a Hooman Project goes to GLOOBAL's reviewers, its owner talks it
// over with GLOOBAL's assistant (server/lib/projectTalk.js) until it is
// understood: nine things — the problem, who benefits, what will be done,
// why this person, the money, the steps, the risks, afterwards, and whether
// it all fits — each clear, thin, missing or doesn't fit, with the owner's
// own words as evidence. "Understood n of 9" shows as it goes; it can pause
// and carry on later, or finish now to see where it stands. All nine clear
// is "ready", and a yes sends it. For now the assistant only advises:
// people at GLOOBAL decide.
//
//   ProjectTalkScreen    the conversation, full screen
//   ProjectTalkAnalysis  the analysis card (here, and on the review desk)
//   ProjectTalkThread    the conversation as a read-only list (review desk)
import { useState as useState112 } from "react";
import { useEffect as useEffect112 } from "react";
import { useRef as useRef112 } from "react";
import { Send as TalkSend, Sparkles as TalkSpark, ShieldCheck as TalkShield, AlertTriangle as TalkWarn, HelpCircle as TalkAsk, ListChecks as TalkSteps, CheckCircle2 as TalkOk, Circle as TalkTodo } from "lucide-react";

var TALK_READINESS = {
  ready: { color: "#15803D", soft: "#DCFCE7", label: "Ready for review" },
  almost: { color: "#B45309", soft: "#FEF3C7", label: "Almost ready" },
  not_ready: { color: "#B91C1C", soft: "#FEE2E2", label: "Not ready yet" },
};

function TalkReadinessChip({ readiness, label }) {
  const r = TALK_READINESS[readiness] || TALK_READINESS.almost;
  return <span data-testid="talk-readiness" data-readiness={readiness} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: r.soft, color: r.color, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: r.color }} />{label || r.label}</span>;
}

var TALK_STATUS = {
  clear: { color: "#15803D", soft: "#DCFCE7", word: "Clear" },
  thin: { color: "#B45309", soft: "#FEF3C7", word: "Thin" },
  missing: { color: "#64748B", soft: "#F1F5F9", word: "Missing" },
  contradicting: { color: "#B91C1C", soft: "#FEE2E2", word: "Doesn't fit" },
};

// "Understood 6 of 9": one segment per item, and what is still open.
function TalkProgress({ items, open, onToggle }) {
  const list = items || [];
  const clear = list.filter((i) => i.status === "clear").length;
  return <div data-testid="talk-progress" data-understood={clear} style={{ borderRadius: 14, background: T.surface, boxShadow: T.shadowCard, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
    <button type="button" onClick={onToggle} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>Understood {clear} of {list.length}</span>
      <span style={{ flex: 1, display: "flex", gap: 3 }}>{list.map((i) => <span key={i.key} title={`${i.label}: ${(TALK_STATUS[i.status] || TALK_STATUS.missing).word}`} style={{ flex: 1, height: 7, borderRadius: 4, background: (TALK_STATUS[i.status] || TALK_STATUS.missing).color, opacity: i.status === "missing" ? 0.25 : 1 }} />)}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.accent, whiteSpace: "nowrap" }}>{open ? "Hide" : "What's open"}</span>
    </button>
    {open ? <TalkChecklist items={list} /> : null}
  </div>;
}

// The nine, with where each stands, the note, and the owner's own words.
function TalkChecklist({ items, withEvidence }) {
  return <div data-testid="talk-checklist" style={{ display: "flex", flexDirection: "column", gap: 8 }}>{(items || []).map((i) => {
    const st = TALK_STATUS[i.status] || TALK_STATUS.missing;
    return <div key={i.key} data-testid="talk-item" data-key={i.key} data-status={i.status} style={{ display: "flex", flexDirection: "column", gap: 3, paddingBottom: 7, borderBottom: `1px solid ${T.line}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>{i.label}</span>
        <span style={{ padding: "2px 8px", borderRadius: 999, background: st.soft, color: st.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{st.word}</span>
      </span>
      {i.note ? <span style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45 }}>{i.note}</span> : i.status !== "clear" ? <span style={{ fontSize: 12, color: T.inkFaint, lineHeight: 1.45 }}>{i.clear}</span> : null}
      {withEvidence && i.evidence && i.status !== "missing" ? <span style={{ fontSize: 12, color: T.ink, lineHeight: 1.45, fontStyle: "italic", borderLeft: `3px solid ${st.color}55`, paddingLeft: 8 }}>“{i.evidence}”</span> : null}
    </div>;
  })}</div>;
}

function TalkList({ icon: Icon, color, title, items }) {
  if (!items || !items.length) return null;
  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkSoft }}><Icon size={13} color={color} />{title}</span>
    {items.map((t, i) => <span key={i} style={{ fontSize: 13, color: T.ink, lineHeight: 1.5, paddingLeft: 19, position: "relative" }}><span style={{ position: "absolute", left: 6, top: 8, width: 5, height: 5, borderRadius: "50%", background: color }} />{t}</span>)}
  </div>;
}

function ProjectTalkAnalysis({ analysis, onUseMilestones }) {
  if (!analysis) return null;
  const ai = String(analysis.by || "").startsWith("groq");
  return <div data-testid="talk-analysis" data-readiness={analysis.readiness} style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14.5, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}><TalkSpark size={16} color={T.accent} />{ai ? "The assistant's analysis" : "GLOOBAL's checklist analysis"}</span>
      <TalkReadinessChip readiness={analysis.readiness} label={analysis.readinessLabel} />
    </div>
    <span style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55 }}>{analysis.summary}</span>
    {analysis.understanding ? <span data-testid="talk-understood" style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginTop: -4 }}>Understood {analysis.understood} of {analysis.of}{analysis.readinessWhy ? <span style={{ fontWeight: 500, color: T.inkSoft }}> · {analysis.readinessWhy}</span> : null}</span> : analysis.readinessWhy ? <span style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginTop: -6 }}>{analysis.readinessWhy}</span> : null}
    {analysis.understanding ? <TalkChecklist items={analysis.understanding} withEvidence /> : null}
    <TalkList icon={TalkWarn} color="#B91C1C" title="Doesn't fit" items={analysis.contradictions} />
    <TalkList icon={TalkOk} color="#15803D" title="Strengths" items={analysis.strengths} />
    {analysis.understanding ? null : <TalkList icon={TalkTodo} color="#B45309" title="Gaps" items={analysis.gaps} />}
    <TalkList icon={TalkWarn} color="#B91C1C" title="Risks" items={analysis.risks} />
    <TalkList icon={TalkAsk} color={T.accent} title="A reviewer may still ask" items={analysis.openQuestions} />
    {analysis.milestones && analysis.milestones.length ? <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkSoft }}><TalkSteps size={13} color={T.accent} />Suggested milestones</span>
      {analysis.milestones.map((m, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: T.accentSoft, color: T.accent, fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.ink, fontWeight: 600 }}>{m.label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{m.percent}%</span>
      </div>)}
      {onUseMilestones ? <button type="button" data-testid="desk-use-milestones" onClick={() => onUseMilestones(analysis.milestones)} style={{ ...projectButton(false), height: 38, marginTop: 2 }}>Use these milestones</button> : null}
    </div> : null}
    <span style={{ fontSize: 11, color: T.inkFaint, lineHeight: 1.45 }}>{ai ? "Written by an AI from the conversation; whether it's ready is decided by the nine above, not by the AI. It advises; people at GLOOBAL decide." : "From GLOOBAL's fixed questions and the plan. People at GLOOBAL decide."}</span>
  </div>;
}

function TalkBubble({ m }) {
  const mine = m.from === "applicant";
  return <div data-testid="talk-message" data-from={m.from} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
    <span style={{ maxWidth: "82%", padding: "10px 13px", borderRadius: mine ? "18px 18px 6px 18px" : "18px 18px 18px 6px", background: mine ? T.gradButton : T.surface, color: mine ? "#fff" : T.ink, boxShadow: mine ? "none" : T.shadowCard, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</span>
  </div>;
}

function ProjectTalkThread({ messages }) {
  return <div data-testid="talk-thread" style={{ display: "flex", flexDirection: "column", gap: 8 }}>{(messages || []).map((m, i) => <TalkBubble key={i} m={m} />)}</div>;
}

function ProjectTalkScreen({ project, onClose, onApplied }) {
  const [info, setInfo] = useState112(null);
  const [talk, setTalk] = useState112(null);
  const [text, setText] = useState112("");
  const [busy, setBusy] = useState112("");
  const [error, setError] = useState112("");
  const [showOpen, setShowOpen] = useState112(false);
  const scroller = useRef112(null);
  const started = useRef112(false);
  const answer = (r) => { if (r && r.talk) setTalk(r.talk); return r; };

  const begin = async () => {
    setBusy("start"); setError("");
    const r = await GloobalApi.projectTalkStart(project.id);
    setBusy("");
    if (r.ok) answer(r); else setError(r.message);
  };
  useEffect112(() => {
    let live = true;
    (async () => {
      const r = await GloobalApi.projectTalk(project.id);
      if (!live) return;
      if (!r.ok) { setError(r.message); setInfo({}); return; }
      setInfo(r);
      if (r.talk && r.talk.state !== "left") setTalk(r.talk);
      // Opening it starts the conversation when there is none to pick up.
      if ((!r.talk || r.talk.state === "left") && r.canStart && !started.current) { started.current = true; begin(); }
    })();
    return () => { live = false; };
  }, [project.id]);
  useEffect112(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [talk && talk.messages && talk.messages.length, talk && talk.state, busy]);

  const send = async () => {
    const said = text.trim();
    if (!said || busy) return;
    setBusy("say"); setError("");
    setTalk((t) => (t ? { ...t, messages: [...t.messages, { from: "applicant", text: said, at: new Date().toISOString() }] } : t));
    setText("");
    const r = await GloobalApi.projectTalkSay(project.id, said);
    setBusy("");
    if (r.ok) answer(r);
    else {
      setError(r.message);
      setText(said);
      setTalk((t) => (t ? { ...t, messages: t.messages.slice(0, -1) } : t));
    }
  };
  const apply = async (anyway) => {
    if (busy) return;
    setBusy(anyway ? "anyway" : "apply"); setError("");
    const r = await GloobalApi.projectTalkApply(project.id, anyway);
    setBusy("");
    if (r.ok) { answer(r); onApplied?.(r); return; }
    setError(r.message);
    if (r.requirements) setInfo((i) => ({ ...(i || {}), requirements: r.requirements }));
  };
  const again = async () => { started.current = true; setTalk(null); await begin(); };
  const finishNow = async () => {
    if (busy) return;
    setBusy("finish"); setError("");
    const r = await GloobalApi.projectTalkFinish(project.id);
    setBusy("");
    if (r.ok) answer(r); else setError(r.message);
  };

  const mode = info && info.mode;
  const talking = talk && talk.state === "talking";
  const done = talk && talk.state === "done";
  const applied = talk && talk.state === "applied";
  const readiness = talk && talk.analysis && talk.analysis.readiness;
  const missing = ((info && info.requirements) || []).filter((r) => !r.ok);
  return <div data-testid="project-talk" style={{ position: "fixed", inset: 0, zIndex: 380, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: T.fontBody }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0, borderBottom: `1px solid ${T.line}`, background: T.surface }}>
      <NavBackButton onClick={onClose} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Talk it through</span>
        <span style={{ display: "block", fontSize: 12, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.title}</span>
      </span>
      <span style={{ width: 38, height: 38, borderRadius: 12, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><TalkSpark size={18} color={T.accent} /></span>
    </div>
    {talking ? <div style={{ flexShrink: 0, padding: "10px 16px 0", background: T.bg }}><TalkProgress items={talk.understanding} open={showOpen} onToggle={() => setShowOpen((v) => !v)} /></div> : null}
    <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", borderRadius: 14, background: T.surfaceAlt }}>
        <TalkShield size={15} color={T.inkSoft} style={{ flexShrink: 0, marginTop: 2 }} />
        <span data-testid="talk-privacy" style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>{mode === "groq"
          ? "GLOOBAL's assistant is an AI. Your answers go to it and to GLOOBAL's reviewers — not your documents, photos or account. Don't type ID numbers, bank details or passwords."
          : "GLOOBAL's questions, answered here, go to GLOOBAL's reviewers with your project. Don't type ID numbers, bank details or passwords."} It advises; people at GLOOBAL decide.</span>
      </div>
      {talk ? <ProjectTalkThread messages={talk.messages} /> : null}
      {busy === "start" || busy === "say" || busy === "finish" ? <div data-testid="talk-typing" style={{ display: "flex" }}><span style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 6px", background: T.surface, boxShadow: T.shadowCard, color: T.inkFaint, fontSize: 14, letterSpacing: 2 }}>•••</span></div> : null}
      {(done || applied) && talk.analysis ? <ProjectTalkAnalysis analysis={talk.analysis} /> : null}
      {done && missing.length ? <div data-testid="talk-missing" style={{ borderRadius: T.radiusLg, background: "#FEF3C7", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>Before it can be sent</span>
        {missing.map((m) => <span key={m.key} style={{ fontSize: 12.5, color: "#92400E", lineHeight: 1.45 }}>• {m.label} — {m.hint}</span>)}
      </div> : null}
      {applied ? <div data-testid="talk-applied" style={{ borderRadius: T.radiusLg, background: "#DCFCE7", padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#166534", lineHeight: 1.5 }}>Sent to GLOOBAL{talk.appliedAnyway ? " (anyway)" : ""}. A reviewer reads the project, this conversation and the analysis.</div> : null}
      {error ? <div role="alert" data-testid="talk-error" style={{ fontSize: 12.5, fontWeight: 700, color: T.negative, lineHeight: 1.45 }}>{error}</div> : null}
    </div>
    {talking ? <div style={{ flexShrink: 0, padding: "10px 12px calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.line}`, background: T.surface, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <textarea data-testid="talk-input" value={text} onChange={(e) => setText(e.target.value.slice(0, 1500))} rows={Math.min(5, Math.max(1, text.split("\n").length))} placeholder="Your answer" style={{ flex: 1, boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 18, padding: "10px 14px", fontSize: 14.5, color: T.ink, background: T.bg, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.45 }} />
        <button type="button" data-testid="talk-send" aria-label="Send" onClick={send} disabled={!text.trim() || Boolean(busy)} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: text.trim() && !busy ? T.gradButton : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: text.trim() && !busy ? "pointer" : "default", flexShrink: 0 }}><TalkSend size={18} color={text.trim() && !busy ? "#fff" : T.inkFaint} /></button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 6 }}>
        <span style={{ flex: 1, fontSize: 11, color: T.inkFaint, lineHeight: 1.4 }}>Take your time — you can leave and carry on later. "I don't know yet" is a fine answer.</span>
        {talk.canFinish ? <button type="button" data-testid="talk-finish" onClick={finishNow} disabled={Boolean(busy)} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "2px 0", whiteSpace: "nowrap" }}>Finish now</button> : null}
      </div>
    </div> : null}
    {done ? <div style={{ flexShrink: 0, padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.line}`, background: T.surface, display: "flex", flexDirection: "column", gap: 8 }}>
      {readiness === "ready"
        ? <><span style={{ fontSize: 13, fontWeight: 700, color: T.ink, textAlign: "center" }}>Shall I send it to GLOOBAL for review?</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...projectButton(false), flex: 1 }}>Not yet</button>
            <button type="button" data-testid="talk-apply" onClick={() => apply(false)} disabled={Boolean(busy)} style={{ ...projectButton(true, Boolean(busy)), flex: 2 }}>{busy === "apply" ? "Sending…" : "Yes, send it"}</button>
          </div></>
        : <><div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...projectButton(false), flex: 1 }}>Improve it</button>
            {info && info.canStart !== false ? <button type="button" data-testid="talk-again" onClick={again} disabled={Boolean(busy)} style={{ ...projectButton(true, Boolean(busy)), flex: 1 }}>Talk again</button> : null}
          </div>
          <button type="button" data-testid="talk-apply-anyway" onClick={() => apply(true)} disabled={Boolean(busy)} style={{ border: "none", background: "transparent", color: T.inkSoft, fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: "2px 0" }}>{busy === "anyway" ? "Sending…" : "Send it to GLOOBAL anyway"}</button></>}
    </div> : null}
  </div>;
}
