// src/features/support/helpSupport.jsx
import { useState as useState87, useEffect as useEffect83, useRef as useRef46 } from "react";
//
// ── HELP & SUPPORT (0216) ──────────────────────────────────────────────────
//
// Profile → Help & Support. Answers first, because most questions have one
// already; then "Chat with us", which reaches a real person on the Support
// desk of the staff site. A chat is started from a topic, so it lands with
// the right people, and lives here as a thread: the person's own words, the
// team's replies signed with a first name, and where it stands (with the
// team, waiting on you, done). A reply also arrives as a notice and a push.
//
// On the creator side the chat is marked as the shop's, so the desk knows
// it is a shop asking and answers about the shop.
//
// Team notes on a chat never reach here: the server leaves them out, so
// there is nothing to hide on this side.

var HELP_ANSWERS = [
  ["How do I send money?", "Home → Send. Pick someone by their GLOOBAL ID, a name, or a code you scan, type the amount, and confirm with your PIN. They have it the moment you see Sent."],
  ["A payment I sent has not arrived", "Open it from History: its receipt says exactly where it is. Sent and credited means it reached their account. If the receipt says something else, or they still cannot see it, chat with us below and pick “A payment”."],
  ["How does GLOOBAL Bank work?", "GLOOBAL Bank moves money between your GLOOBAL balance and a bank account you link. Money going out shows as Processing until your bank confirms it; if a bank sends it back, it returns to your balance by itself."],
  ["What is locked in My Essentials?", "Money you set aside for rent, bills and other essentials is held for them, so it is not spent by accident. It still belongs to you, and you can see each part in My Essentials."],
  ["How do referrals work?", "Share your GLOOBAL ID. When someone joins with it, the app shows them as yours in Referrals."],
  ["Which countries are supported?", "GLOOBAL works in every country on the registration list. Each account pays and is paid in its own country's money; payments between countries show both amounts before you confirm."],
];
var HELP_TOPICS = [
  ["payment", "A payment"],
  ["bank", "GLOOBAL Bank"],
  ["essentials", "My Essentials"],
  ["shop", "My shop"],
  ["account", "My account"],
  ["other", "Something else"],
];
// Where a chat stands, in the person's words.
var HELP_STATUS = {
  new: ["With the team", "accent"],
  open: ["With the team", "accent"],
  waiting: ["Waiting on you", "warn"],
  done: ["Done", "positive"],
};

function helpWhen(at) {
  if (!at) return "";
  const d = new Date(at), now = new Date();
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const same = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (same) return time;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function HelpStatusPill({ status }) {
  const [words, tone] = HELP_STATUS[status] || HELP_STATUS.open;
  const fg = tone === "positive" ? T.positive : tone === "warn" ? "#b26a00" : T.accent;
  const bg = tone === "positive" ? T.positiveSoft : tone === "warn" ? "rgba(237,161,0,0.14)" : T.accentSoft;
  return <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.2, color: fg, background: bg, padding: "3px 8px", borderRadius: 999 }}>{words}</span>;
}

var helpCard = () => ({ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" });
var helpLabel = () => ({ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" });

function HelpSupportPanel({ side = "person", openId, onOpened, showToast }) {
  const [chats, setChats] = useState87(null);
  const [failed, setFailed] = useState87(false);
  const [openAnswer, setOpenAnswer] = useState87(null);
  const [topic, setTopic] = useState87(null);
  const [draft, setDraft] = useState87("");
  const [sending, setSending] = useState87(false);
  const [thread, setThread] = useState87(null);
  const [threadId, setThreadId] = useState87(null);
  const [reply, setReply] = useState87("");
  const endRef = useRef46(null);
  const say = (m) => (showToast ? showToast(m) : null);

  const loadList = async () => {
    const got = await GloobalApi.getSupportChats();
    if (got) { setChats(got.conversations || []); setFailed(false); } else setFailed(true);
  };
  const loadThread = async (id) => {
    const c = await GloobalApi.getSupportChat(id);
    if (c) setThread(c);
    else if (!thread) { say("Could not open that chat just now."); setThreadId(null); }
  };
  useEffect83(() => { loadList(); }, []);
  // A notice or a push for a reply opens its chat directly.
  useEffect83(() => {
    if (!openId) return;
    setThreadId(String(openId));
    onOpened && onOpened();
  }, [openId]);
  // While a chat is open, look for the team's answer every ten seconds;
  // the list, every thirty.
  useEffect83(() => {
    if (!threadId) { setThread(null); return undefined; }
    loadThread(threadId);
    const t = setInterval(() => { if (!document.hidden) loadThread(threadId); }, 10000);
    return () => { clearInterval(t); loadList(); };
  }, [threadId]);
  useEffect83(() => {
    if (threadId) return undefined;
    const t = setInterval(() => { if (!document.hidden) loadList(); }, 30000);
    return () => clearInterval(t);
  }, [threadId]);
  useEffect83(() => {
    if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: "end" });
  }, [thread && thread.messages && thread.messages.length]);

  const start = async () => {
    const text = draft.trim();
    if (!topic || text.length < 2 || sending) return;
    setSending(true);
    try {
      const r = await GloobalApi.startSupportChat({ topic, text, side });
      setDraft(""); setTopic(null);
      setThread(r.conversation);
      setThreadId(r.conversation.id);
    } catch (e) {
      say((e && e.status && e.message) || "Could not send that just now. It is still here — try again.");
    } finally { setSending(false); }
  };
  const send = async () => {
    const text = reply.trim();
    if (!text || sending || !thread) return;
    setSending(true);
    try {
      const r = await GloobalApi.sendSupportMessage(thread.id, text);
      setReply("");
      setThread(r.conversation);
    } catch (e) {
      say((e && e.status && e.message) || "Could not send that just now.");
    } finally { setSending(false); }
  };

  // ── one chat ──
  if (threadId) {
    const msgs = (thread && thread.messages) || [];
    return <div data-testid="help-thread" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setThreadId(null)} style={{ border: "none", background: "none", padding: "4px 0", color: T.accent, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>‹ All chats</button>
        <span style={{ flex: 1 }} />
        {thread && <span style={{ fontSize: 11, color: T.inkFaint, fontVariantNumeric: "tabular-nums" }}>{thread.ref}</span>}
        {thread && <HelpStatusPill status={thread.status} />}
      </div>
      {thread && <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{thread.topicWords}{thread.side === "shop" ? " · your shop" : ""}</div>}
      {!thread && <div style={{ ...helpCard(), padding: 18, fontSize: 13, color: T.inkFaint }}>Opening…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m, i) => {
          if (m.from === "system") return <div key={i} style={{ alignSelf: "center", maxWidth: "88%", textAlign: "center", fontSize: 11.5, color: T.inkFaint, lineHeight: 1.45, padding: "2px 6px" }}>{m.text}</div>;
          const mine = m.from === "customer";
          return <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "84%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", gap: 3 }}>
            {!mine && <span style={{ fontSize: 10.5, fontWeight: 800, color: T.accent }}>{m.name}</span>}
            <div style={{ padding: "10px 13px", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: mine ? T.accent : T.surface, color: mine ? "#fff" : T.ink, boxShadow: mine ? "none" : T.shadowCard, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
            <span style={{ fontSize: 10, color: T.inkFaint }}>{helpWhen(m.at)}</span>
          </div>;
        })}
        <div ref={endRef} />
      </div>
      {thread && thread.status === "done" && <div style={{ fontSize: 11.5, color: T.inkFaint, textAlign: "center" }}>This chat is done. Write here and it goes back to the team.</div>}
      {thread && <div style={{ ...helpCard(), display: "flex", alignItems: "flex-end", gap: 8, padding: 8 }}>
        <textarea
          id="help-reply"
          aria-label="Your message"
          value={reply}
          maxLength={1000}
          rows={Math.min(5, Math.max(1, reply.split("\n").length))}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write to the team"
          style={{ flex: 1, minWidth: 0, resize: "none", border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: 14, lineHeight: 1.4, padding: "8px 8px", fontFamily: "inherit" }}
        />
        <button data-testid="help-send" onClick={send} disabled={!reply.trim() || sending} style={{ flexShrink: 0, border: "none", borderRadius: 12, padding: "10px 14px", background: reply.trim() && !sending ? T.gradButton : T.gradButtonDisabled, color: "#fff", fontWeight: 800, fontSize: 13, cursor: reply.trim() && !sending ? "pointer" : "default" }}>{sending ? "Sending" : "Send"}</button>
      </div>}
    </div>;
  }

  // ── answers, a new chat, and past chats ──
  const ready = topic && draft.trim().length >= 2 && !sending;
  const openCount = (chats || []).filter((c) => c.status !== "done").length;
  return <div data-testid="help-support" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div>
      <div style={helpLabel()}>Answers</div>
      <div style={helpCard()}>{HELP_ANSWERS.map(([q, a], i) => {
        const on = openAnswer === i;
        return <div key={q} style={{ borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}>
          <button onClick={() => setOpenAnswer(on ? null : i)} aria-expanded={on} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: T.ink }}>{q}</span>
            <span aria-hidden="true" style={{ color: T.inkFaint, fontSize: 16, transform: on ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
          </button>
          {on && <div style={{ padding: "0 18px 14px", fontSize: 13, color: T.inkSoft, lineHeight: 1.55 }}>{a}</div>}
        </div>;
      })}</div>
    </div>

    <div>
      <div style={helpLabel()}>Chat with us</div>
      <div style={{ ...helpCard(), padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>A person from GLOOBAL answers here{side === "shop" ? ", about your shop" : ""}. You get a notice when they do.</div>
        <div role="radiogroup" aria-label="What is it about?" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {HELP_TOPICS.filter(([k]) => side === "shop" || k !== "shop").map(([k, words]) => {
            const on = topic === k;
            return <button key={k} role="radio" aria-checked={on} data-testid={`help-topic-${k}`} onClick={() => setTopic(k)} style={{ border: `1.5px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : "transparent", color: on ? T.accent : T.ink, borderRadius: 999, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{words}</button>;
          })}
        </div>
        {topic && <>
          <textarea
            id="help-first"
            aria-label="Tell us what happened"
            data-testid="help-first"
            value={draft}
            maxLength={1000}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={topic === "payment" ? "Who you paid, how much, and what you see" : "Tell us what happened"}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${T.line}`, borderRadius: 12, background: T.surfaceAlt, color: T.ink, fontSize: 14, lineHeight: 1.45, padding: "11px 12px", fontFamily: "inherit", outline: "none" }}
          />
          <button data-testid="help-start" onClick={start} disabled={!ready} style={{ border: "none", borderRadius: 14, padding: "13px 16px", background: ready ? T.gradButton : T.gradButtonDisabled, color: "#fff", fontWeight: 800, fontSize: 14, cursor: ready ? "pointer" : "default" }}>{sending ? "Sending…" : "Send to GLOOBAL"}</button>
        </>}
        {openCount >= 3 && <div style={{ fontSize: 11.5, color: T.inkFaint }}>You have three chats open — add to one of those below.</div>}
      </div>
    </div>

    {(chats === null && !failed) && <div style={{ fontSize: 12, color: T.inkFaint, padding: "0 2px" }}>Loading your chats…</div>}
    {failed && <button onClick={loadList} style={{ alignSelf: "flex-start", border: "none", background: "none", color: T.accent, fontSize: 12.5, fontWeight: 700, padding: "0 2px", cursor: "pointer" }}>Could not load your chats. Try again</button>}
    {chats && chats.length > 0 && <div>
      <div style={helpLabel()}>Your chats</div>
      <div style={helpCard()}>{chats.map((c, i) => <button key={c.id} data-testid="help-chat-row" onClick={() => setThreadId(c.id)} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 750, color: T.ink }}>{c.topicWords}</span>
            {c.side === "shop" && <span style={{ fontSize: 10.5, color: T.inkFaint }}>· shop</span>}
            {c.unread > 0 && <span aria-label={`${c.unread} new`} style={{ minWidth: 17, height: 17, borderRadius: 9, background: T.negative, color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{c.unread}</span>}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: T.inkFaint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastFrom === "staff" ? "GLOOBAL: " : ""}{c.preview}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <HelpStatusPill status={c.status} />
          <span style={{ fontSize: 10.5, color: T.inkFaint }}>{helpWhen(c.lastActivityAt)}</span>
        </span>
      </button>)}</div>
    </div>}

    <div style={{ fontSize: 11.5, color: T.inkFaint, textAlign: "center", lineHeight: 1.5 }}>Something wrong with a payment you can point to? Profile → Complaints & reports opens a case on it.</div>
  </div>;
}
