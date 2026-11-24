// src/features/care/CarePeopleScreen.jsx
//
// ── PEOPLE I LOOK AFTER ──────────────────────────────────────────────────
//
// Someone who cannot use GLOOBAL themselves — a child, someone older,
// someone with a disability — gets their own GLOOBAL ID and their own
// Essentials, and somebody close to them uses it for them (server/lib/care.js).
//
// Anyone can be that helper: a parent, a big sister, a grandchild, a
// friend. GLOOBAL does not know who is whose parent, so the helper says who
// they are to the person, and the PERSON'S OWN DOCUMENT is what is checked —
// automatically. Their Essentials start only once it has passed.
//
// From here a helper adds someone, sees where their document stands, opens
// their account with the helper's own PIN (CareHelperPanel.jsx), invites one
// more helper, sees everything every helper did in it, and can step back.
import { useState as useState110 } from "react";
import { useEffect as useEffect110 } from "react";
import { useCallback as useCallback50 } from "react";
import { useRef as useRef111 } from "react";
import { HeartHandshake as CareHeart, UserPlus as CareUserPlus, ChevronRight as CareChevron, ShieldCheck as CareShield, Hourglass as CareHourglass, AlertCircle as CareAlert, KeyRound as CareKey } from "lucide-react";

// Who the HELPER is to the person. The server's list (models/CareLink.js),
// in the words a person would use.
var CARE_RELATIONSHIPS = [
  { kind: "parent", label: "Parent" },
  { kind: "sibling", label: "Brother or sister" },
  { kind: "grandparent", label: "Grandparent" },
  { kind: "grandchild", label: "Grandchild" },
  { kind: "child", label: "Son or daughter" },
  { kind: "spouse", label: "Husband or wife" },
  { kind: "relative", label: "Relative" },
  { kind: "friend", label: "Friend" },
  { kind: "caretaker", label: "Caretaker" },
  { kind: "other", label: "Other" },
];
function careRelationshipText(kind, note) {
  if (kind === "other") return String(note || "").trim() || "Other";
  const row = CARE_RELATIONSHIPS.find((r) => r.kind === kind);
  return row ? row.label : "";
}
function careAgeText(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return "";
  if (n < 1) return "Under 1";
  return n === 1 ? "1 yr" : `${n} yrs`;
}
function careFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "them";
}
function careToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function careAgeOn(birth) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birth || ""))) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

// The look every card here shares.
function careCard(extra) {
  return { borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 16px", display: "flex", flexDirection: "column", gap: 12, ...(extra || {}) };
}
function careInput(extra) {
  return { width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 13px", fontSize: 15, fontWeight: 600, color: T.ink, background: T.surface, fontFamily: T.fontBody, ...(extra || {}) };
}
function careButton(enabled, extra) {
  return { border: "none", borderRadius: T.radiusMd, padding: "13px 0", background: enabled ? T.gradButton : T.surfaceAlt, color: enabled ? "#fff" : T.inkFaint, fontSize: 14, fontWeight: 800, cursor: enabled ? "pointer" : "default", width: "100%", ...(extra || {}) };
}
function careQuietButton(extra) {
  return { border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 0", background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer", width: "100%", ...(extra || {}) };
}
var CARE_CAPTION = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 };

function CareNote({ note }) {
  if (!note) return null;
  return <div role={note.ok ? "status" : "alert"} data-testid="care-note" style={{ fontSize: 12.5, fontWeight: 700, color: note.ok ? T.positive : T.negative, lineHeight: 1.45 }}>{note.text}</div>;
}

// Where their document stands, in three words and a colour.
function CareStatusChip({ doc, ready }) {
  const status = doc ? doc.status : "waiting";
  const tone = status === "verified" ? T.positive : status === "rejected" ? T.negative : T.inkSoft;
  const soft = status === "verified" ? T.positiveSoft : status === "rejected" ? T.negativeSoft : T.surfaceAlt;
  const Icon = status === "verified" ? CareShield : status === "rejected" ? CareAlert : CareHourglass;
  const text = status === "verified" && ready === false ? "Checking the order" : (doc && doc.statusText) || "Waiting for check";
  return <span data-testid="care-status" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, background: soft, color: tone, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}><Icon size={12} color={tone} />{text}</span>;
}

function CareChips({ options, value, onChange, testid }) {
  return <div data-testid={testid} style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{options.map((o) => {
    const on = value === o.value;
    return <button key={o.value} type="button" onClick={() => onChange(o.value)} className="v2-tap" aria-pressed={on} style={{ border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 999, padding: "8px 12px", background: on ? T.accentSoft : T.surface, color: on ? T.accent : T.ink, fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: "pointer" }}>{o.label}</button>;
  })}</div>;
}

function CareField({ label, hint, children }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ ...CARE_CAPTION, color: T.inkSoft }}>{label}</span>{children}{hint ? <span style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}>{hint}</span> : null}</label>;
}

// ── THE CARD ON MY ESSENTIALS ────────────────────────────────────────────
// Says how many people this account looks after, and whether anyone has
// asked it to help. Quiet when there is neither.
function CareEntryCard({ onOpen }) {
  const [state, setState] = useState110(null);
  useEffect110(() => {
    let live = true;
    GloobalApi.carePeople().then((r) => { if (live && r && r.ok) setState(r); });
    return () => { live = false; };
  }, []);
  const people = (state && state.people) || [];
  const invitations = (state && state.invitations) || [];
  const line = invitations.length
    ? `${invitations.length === 1 ? "1 person has" : `${invitations.length} people have`} asked you to help`
    : people.length
      ? `${people.length === 1 ? "1 person" : `${people.length} people`} · their own Essentials`
      : "A child, someone older, someone with a disability — their own GLOOBAL ID and Essentials, used by you for them.";
  return <button onClick={onOpen} className="v2-tap" data-testid="care-entry" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", border: "none", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 16px", cursor: "pointer", textAlign: "left" }}>
    <span style={{ width: 40, height: 40, borderRadius: 12, background: "#2E7A4F1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CareHeart size={19} color="#2E7A4F" /></span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: T.ink }}>People I look after</span>
      <span style={{ display: "block", fontSize: 11.5, color: invitations.length ? T.accent : T.inkSoft, fontWeight: invitations.length ? 800 : 500, marginTop: 2, lineHeight: 1.4 }}>{line}</span>
    </span>
    {invitations.length ? <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: T.accent, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{invitations.length}</span> : null}
    <CareChevron size={18} color={T.inkFaint} />
  </button>;
}

// ── ADDING SOMEONE ───────────────────────────────────────────────────────
function CareAddForm({ docs, onCancel, onAdded }) {
  const [name, setName] = useState110("");
  const [birth, setBirth] = useState110("");
  const [relationship, setRelationship] = useState110("");
  const [relationshipNote, setRelationshipNote] = useState110("");
  const [kind, setKind] = useState110("");
  const [number, setNumber] = useState110("");
  const [consent, setConsent] = useState110("");
  const [order, setOrder] = useState110("");
  const [busy, setBusy] = useState110(false);
  const [note, setNote] = useState110(null);
  const age = careAgeOn(birth);
  const adultAge = Number(docs && docs.adultAge) || 18;
  const adult = age != null && age >= adultAge;
  // A child: a birth certificate or a document any age can hold. An adult:
  // any listed government document.
  const offered = ((docs && docs.docs) || []).filter((d) => (age == null ? true : adult ? d.for !== "child" : d.for !== "adult"));
  const chosen = offered.find((d) => d.kind === kind) || null;
  useEffect110(() => { if (kind && !chosen) { setKind(""); setNumber(""); } }, [kind, chosen]);
  const ready = name.trim().length >= 2 && age != null && age >= 0 && relationship && (relationship !== "other" || relationshipNote.trim().length >= 2)
    && chosen && number.trim().length >= 4 && (!adult || consent === "said_yes" || (consent === "guardianship" && order.trim().length >= 4));
  const first = careFirstName(name);
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setNote(null);
    const r = await GloobalApi.careAdd({
      name: name.trim(), birthDate: birth, relationship, relationshipNote: relationship === "other" ? relationshipNote.trim() : "",
      document: { kind, number: number.trim() },
      consent: adult ? consent : undefined,
      guardianship: adult && consent === "guardianship" ? { number: order.trim() } : undefined,
    });
    setBusy(false);
    if (r.ok) onAdded(r);
    else setNote({ ok: false, text: r.message });
  };
  return <div data-testid="care-add" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={careCard({ gap: 14 })}>
      <CareField label="Their full name" hint="As it is written on their document."><input data-testid="care-add-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" style={careInput()} /></CareField>
      <CareField label="Date of birth" hint={age != null && age >= 0 ? `${careAgeText(age)}${adult ? "" : " · a child"}` : null}><input data-testid="care-add-birth" type="date" value={birth} max={careToday()} onChange={(e) => setBirth(e.target.value)} style={careInput()} /></CareField>
    </div>
    <div style={careCard({ gap: 10 })}>
      <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>You are their</span>
      <CareChips testid="care-add-relationship" options={CARE_RELATIONSHIPS.map((r) => ({ value: r.kind, label: r.label }))} value={relationship} onChange={setRelationship} />
      {relationship === "other" ? <input data-testid="care-add-relationship-note" value={relationshipNote} onChange={(e) => setRelationshipNote(e.target.value)} maxLength={40} placeholder="Neighbour, teacher, guardian…" autoComplete="off" style={careInput()} /> : null}
      <span style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}>Anyone close to them can look after them here. What is checked is their own document.</span>
    </div>
    <div style={careCard({ gap: 10 })}>
      <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>{age == null ? "Their document" : adult ? "One of their government documents" : "Their birth certificate, or a document for a child"}</span>
      {age == null
        ? <span style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>Enter their date of birth first — a child and an adult use different documents.</span>
        : <CareChips testid="care-add-doc" options={offered.map((d) => ({ value: d.kind, label: d.label }))} value={kind} onChange={(k) => { setKind(k); setNumber(""); }} />}
      {chosen ? <CareField label={chosen.number}><input data-testid="care-add-number" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} style={careInput({ letterSpacing: 1 })} /></CareField> : null}
    </div>
    {adult ? <div style={careCard({ gap: 10 })} data-testid="care-add-consent">
      <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>{first} is an adult</span>
      <CareChips options={[{ value: "said_yes", label: `${first} agrees to my help` }, { value: "guardianship", label: "They can't say — I have a guardianship order" }]} value={consent} onChange={setConsent} />
      {consent === "guardianship" ? <CareField label="Order or certificate number" hint="The guardianship order is checked the same way as their document."><input data-testid="care-add-order" value={order} onChange={(e) => setOrder(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" spellCheck={false} style={careInput({ letterSpacing: 1 })} /></CareField> : null}
    </div> : null}
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "2px 4px" }}>
      <CareShield size={16} color={T.inkSoft} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>{first === "them" ? "They get" : `${first} gets`} their own GLOOBAL ID straight away. Their document is checked automatically, and their Essentials start once it has passed. The number is sealed; only its last digits are shown.</span>
    </div>
    <CareNote note={note} />
    <div style={{ display: "flex", gap: 10 }}>
      <button onClick={onCancel} className="v2-tap" style={careQuietButton({ flex: 1 })}>Cancel</button>
      <button onClick={submit} className="v2-tap" data-testid="care-add-save" disabled={!ready || busy} style={careButton(ready && !busy, { flex: 2 })}>{busy ? "Adding…" : name.trim().length >= 2 ? `Add ${first}` : "Add"}</button>
    </div>
  </div>;
}

// ── ONE PERSON ───────────────────────────────────────────────────────────
function CarePersonView({ person, onChanged, onOpenAccount, onLeft }) {
  const [actions, setActions] = useState110(null);
  const [inviting, setInviting] = useState110(false);
  const [inviteId, setInviteId] = useState110("");
  const [inviteRel, setInviteRel] = useState110("");
  const [inviteNote, setInviteNote] = useState110("");
  const [busy, setBusy] = useState110("");
  const [note, setNote] = useState110(null);
  const [leaving, setLeaving] = useState110(false);
  useEffect110(() => {
    let live = true;
    GloobalApi.careActions(person.id).then((r) => { if (live) setActions(r && r.ok ? r.actions || [] : []); });
    return () => { live = false; };
  }, [person.id]);
  const lens = useGeuLens();
  const first = careFirstName(person.name);
  const helpers = person.helpers || [];
  const open = helpers.filter((h) => h.status === "active" || h.status === "invited");
  const iAmFirst = person.role === "first";
  const doc = person.document;
  const invite = async () => {
    if (busy) return;
    setBusy("invite"); setNote(null);
    const r = await GloobalApi.careInvite(person.id, { symbolId: inviteId.trim(), relationship: inviteRel, relationshipNote: inviteRel === "other" ? inviteNote.trim() : "" });
    setBusy("");
    if (r.ok) { setInviting(false); setInviteId(""); setInviteRel(""); setNote({ ok: true, text: "Invited. They become a helper once they accept." }); onChanged(r); }
    else setNote({ ok: false, text: r.message });
  };
  const remove = async (h) => {
    if (busy) return;
    setBusy(h.linkId); setNote(null);
    const r = await GloobalApi.careRemoveHelper(person.id, h.linkId);
    setBusy("");
    if (r.ok) { setNote({ ok: true, text: `${h.name || "They"} no longer helps ${first}.` }); onChanged(r); }
    else setNote({ ok: false, text: r.message });
  };
  const leave = async () => {
    if (busy) return;
    setBusy("leave"); setNote(null);
    const r = await GloobalApi.careLeave(person.id);
    setBusy("");
    if (r.ok) onLeft(r);
    else { setLeaving(false); setNote({ ok: false, text: r.message }); }
  };
  const inviteReady = inviteId.trim().length >= 3 && inviteRel && (inviteRel !== "other" || inviteNote.trim().length >= 2);
  return <div data-testid="care-person" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={careCard({ alignItems: "center", textAlign: "center", gap: 8, padding: "20px 16px" })}>
      <span style={{ width: 58, height: 58, borderRadius: "50%", background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, fontFamily: T.fontDisplay }}>{first.charAt(0).toUpperCase()}</span>
      <span style={{ fontSize: 19, fontWeight: 900, color: T.ink, fontFamily: T.fontDisplay }}>{person.name}</span>
      <span data-testid="care-person-id" style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.3 }}>GLOOBAL ID · {person.symbolId}</span>
      <span style={{ fontSize: 12, color: T.inkSoft }}>{careAgeText(person.age)} · you are their {careRelationshipText(person.relationship, person.relationshipNote).toLowerCase()}{person.relationshipConfirmed ? " · confirmed by the record" : ""}</span>
    </div>

    <div style={careCard()}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink }}>{doc ? doc.label : "Their document"}</span>
          {doc ? <span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2, letterSpacing: 0.5 }}>{doc.shown}</span> : null}
        </span>
        <CareStatusChip doc={doc} ready={person.essentialsReady} />
      </div>
      {person.guardianship ? <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${T.line}`, paddingTop: 11 }}>
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>{person.guardianship.label}</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2, letterSpacing: 0.5 }}>{person.guardianship.shown}</span></span>
        <CareStatusChip doc={person.guardianship} />
      </div> : null}
      <div data-testid="care-person-essentials" style={{ fontSize: 12.5, color: person.essentialsReady ? T.positive : T.inkSoft, fontWeight: person.essentialsReady ? 800 : 500, lineHeight: 1.5 }}>
        {person.essentialsReady
          ? `${first}'s Essentials are on, in ${first}'s own account.`
          : doc && doc.status === "rejected"
            ? `The document did not pass. ${first}'s Essentials stay off until a document does.`
            : doc && doc.waitingForService
              ? `Checks for this document are being connected. It waits until then — nothing is approved by hand. ${first}'s Essentials start the moment it passes.`
              : `Waiting for the automatic check. ${first}'s Essentials start the moment it passes.`}
      </div>
    </div>

    <button onClick={onOpenAccount} className="v2-tap" data-testid="care-open" style={careButton(true, { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 0", fontSize: 15 })}><CareKey size={17} color="#fff" />Open {first}'s account</button>
    <span style={{ fontSize: 11.5, color: T.inkSoft, textAlign: "center", marginTop: -6, lineHeight: 1.45 }}>With your own PIN. Everything you do there is written down as done by you.</span>

    <div style={careCard()} data-testid="care-helpers">
      <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>{first}'s helpers</span>
      {helpers.map((h) => <div key={h.linkId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.isMe ? "You" : h.name || h.symbolId}</span>
          <span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{careRelationshipText(h.relationship)}{h.role === "first" ? " · added them" : ""}{h.status === "invited" ? " · invited, not yet accepted" : ""}</span>
        </span>
        {iAmFirst && !h.isMe && h.role === "second" ? <button onClick={() => remove(h)} className="v2-tap" disabled={Boolean(busy)} data-testid="care-remove-helper" style={{ border: `1px solid ${T.line}`, borderRadius: 999, padding: "7px 12px", background: T.surface, color: T.negative, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{busy === h.linkId ? "…" : "Remove"}</button> : null}
      </div>)}
      {open.length < 2 && !inviting ? <button onClick={() => { setInviting(true); setNote(null); }} className="v2-tap" data-testid="care-invite-open" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: `1px dashed ${T.line}`, borderRadius: T.radiusMd, padding: "12px 0", background: "transparent", color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}><CareUserPlus size={16} color={T.accent} />Invite a second helper</button> : null}
      {inviting ? <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
        <CareField label="Their GLOOBAL ID" hint="They need their own GLOOBAL Bank open to accept."><input data-testid="care-invite-id" value={inviteId} onChange={(e) => setInviteId(e.target.value)} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} style={careInput()} /></CareField>
        <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>They are {first}'s</span>
        <CareChips options={CARE_RELATIONSHIPS.map((r) => ({ value: r.kind, label: r.label }))} value={inviteRel} onChange={setInviteRel} />
        {inviteRel === "other" ? <input value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} maxLength={40} placeholder="Who they are to them" autoComplete="off" style={careInput()} /> : null}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setInviting(false)} className="v2-tap" style={careQuietButton({ flex: 1 })}>Cancel</button>
          <button onClick={invite} className="v2-tap" data-testid="care-invite-send" disabled={!inviteReady || Boolean(busy)} style={careButton(inviteReady && !busy, { flex: 2 })}>{busy === "invite" ? "Inviting…" : "Invite"}</button>
        </div>
      </div> : null}
    </div>

    <CareNote note={note} />

    <div style={careCard({ gap: 10 })} data-testid="care-actions">
      <span style={{ ...CARE_CAPTION, color: T.inkSoft }}>What helpers did</span>
      {actions == null
        ? <span style={{ fontSize: 12.5, color: T.inkFaint }}>Loading…</span>
        : actions.length === 0
          ? <span style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>Nothing yet. Every payment, Essentials use or transfer made in {first}'s account shows here, with who did it.</span>
          : actions.slice(0, 30).map((a, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, borderTop: i ? `1px solid ${T.line}` : "none", paddingTop: i ? 9 : 0 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: a.ok ? T.ink : T.inkFaint }}>{a.what}{a.ok ? "" : " (did not go through)"}{a.to ? ` · to ${a.to}` : ""}</span>
              <span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{a.byMe ? "You" : a.by || "A helper"} · {a.at ? new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""} {a.at ? formatClockTime(a.at) : ""}</span>
            </span>
            {a.amount != null ? <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>{a.currency ? <GeuFigure amount={a.amount} currency={a.currency} lens={lens} size={13.5} /> : Number(a.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span> : null}
          </div>)}
    </div>

    {leaving
      ? <div style={careCard({ gap: 10 })} data-testid="care-leave-confirm">
        <span style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5, fontWeight: 600 }}>{helpers.some((h) => !h.isMe && h.status === "active") ? `${first}'s other helper keeps looking after them.` : `Nobody will be looking after ${first} on GLOOBAL. Their account, ID and money stay theirs; whoever adds them next with the same document takes over.`}</span>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setLeaving(false)} className="v2-tap" style={careQuietButton({ flex: 1 })}>Keep helping</button>
          <button onClick={leave} className="v2-tap" data-testid="care-leave-yes" style={careButton(true, { flex: 1, background: T.negative })}>{busy === "leave" ? "…" : "Step back"}</button>
        </div>
      </div>
      : <button onClick={() => setLeaving(true)} className="v2-tap" data-testid="care-leave" style={{ border: "none", background: "transparent", color: T.negative, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "6px 0 10px" }}>Step back as {first}'s helper</button>}
  </div>;
}

// ── OPENING THEIR ACCOUNT ────────────────────────────────────────────────
// The helper's own PIN, checked and counted like any PIN check.
function CareOpenPin({ person, onClose, onOpened }) {
  const [pin, setPin] = useState110("");
  const [busy, setBusy] = useState110(false);
  const [error, setError] = useState110("");
  const submit = useCallback50(async () => {
    if (busy || pin.length !== 6) return;
    setBusy(true); setError("");
    const r = await GloobalApi.careOpen(person.id, pin);
    setBusy(false);
    if (r.ok && r.token) { setPin(""); onOpened(r); return; }
    setError(r.message);
    setTimeout(() => setPin(""), 700);
  }, [busy, pin, person.id, onOpened]);
  return <div role="dialog" aria-modal="true" aria-label={`Open ${person.name}'s account`} style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody, padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px calc(22px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
    <GloobalPinPanel testid="care-pin" title={`Open ${careFirstName(person.name)}'s account`} note="Enter YOUR PIN — the one you use for your own account." value={pin} onChange={(v) => { setError(""); setPin(v); }} onSubmit={submit} busy={busy} error={error} onBack={onClose} backLabel="Cancel" />
  </div>;
}

// ── THE SCREEN ───────────────────────────────────────────────────────────
function CarePeopleScreen({ onClose }) {
  const [state, setState] = useState110(null);
  const [docs, setDocs] = useState110(null);
  const [view, setView] = useState110({ name: "list" });
  const [note, setNote] = useState110(null);
  const [busy, setBusy] = useState110("");
  const [opening, setOpening] = useState110(null);
  const [acting, setActing] = useState110(null);
  // Bumped when their account is closed, so the person's page reads what
  // was just done in it.
  const [round, setRound] = useState110(0);
  // Each view starts at its top, not where the last one was scrolled to.
  const scroller = useRef111(null);
  useEffect110(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [view.name, view.id]);
  const load = useCallback50(async () => {
    const r = await GloobalApi.carePeople();
    if (r.ok) setState(r);
    else setState((s) => s || { people: [], invitations: [], max: 10, failed: r.message });
  }, []);
  useEffect110(() => { load(); GloobalApi.careDocs().then((r) => { if (r.ok) setDocs(r); }); }, [load]);
  const people = (state && state.people) || [];
  const invitations = (state && state.invitations) || [];
  const max = Number(state && state.max) || 10;
  const shown = view.name === "person" ? people.find((p) => p.id === view.id) : null;
  const answer = async (inv, accept) => {
    if (busy) return;
    setBusy(inv.linkId); setNote(null);
    const r = await GloobalApi.careAnswer(inv.linkId, accept);
    setBusy("");
    if (r.ok) { setState(r); setNote({ ok: true, text: accept ? `You now help ${careFirstName(inv.name)}.` : "Declined." }); }
    else setNote({ ok: false, text: r.message });
  };
  const back = () => {
    if (view.name !== "list") { setView({ name: "list" }); setNote(null); return; }
    onClose();
  };
  const title = view.name === "add" ? "Add someone" : shown ? careFirstName(shown.name) : "People I look after";
  return <div data-testid="care-screen" style={{ position: "fixed", inset: 0, zIndex: 310, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <AppSymbolBg zIndex={-1} />
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}>
      <NavBackButton onClick={back} />
      <span style={{ fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
    </div>
    <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px calc(30px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 14 }}>
      {view.name === "add"
        ? <CareAddForm docs={docs} onCancel={() => setView({ name: "list" })} onAdded={(r) => { setState(r); setView(r.person ? { name: "person", id: r.person.id } : { name: "list" }); setNote(null); }} />
        : shown
          ? <CarePersonView key={`${shown.id}:${round}`} person={shown} onChanged={(r) => { if (r && r.people) setState(r); }} onOpenAccount={() => setOpening(shown)} onLeft={(r) => { setState(r); setView({ name: "list" }); setNote({ ok: true, text: `You no longer help ${careFirstName(shown.name)}.` }); }} />
          : <>
            {state == null ? <div style={{ fontSize: 13, color: T.inkFaint, padding: "10px 4px" }}>Loading…</div> : null}
            {state && state.failed ? <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: T.negative }}>{state.failed}</div> : null}

            {invitations.map((inv) => {
              const by = (inv.helpers || []).find((h) => h.role === "first");
              return <div key={inv.linkId} style={careCard({ background: T.accentSoft, boxShadow: "none" })} data-testid="care-invitation">
                <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, lineHeight: 1.45 }}>{by && by.name ? by.name : "Someone"} asked you to help look after {inv.name}</span>
                <span style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45 }}>{careAgeText(inv.age)} · GLOOBAL ID {inv.symbolId}. You would be able to use {careFirstName(inv.name)}'s account for them, with your own PIN. Everything you do there is shown to their other helper.</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => answer(inv, false)} className="v2-tap" disabled={Boolean(busy)} style={careQuietButton({ flex: 1 })}>Decline</button>
                  <button onClick={() => answer(inv, true)} className="v2-tap" disabled={Boolean(busy)} data-testid="care-accept" style={careButton(true, { flex: 1 })}>{busy === inv.linkId ? "…" : "Accept"}</button>
                </div>
              </div>;
            })}

            {state && !people.length && !invitations.length ? <div style={careCard({ gap: 10 })} data-testid="care-empty">
              <span style={{ width: 44, height: 44, borderRadius: 13, background: "#2E7A4F1F", display: "flex", alignItems: "center", justifyContent: "center" }}><CareHeart size={21} color="#2E7A4F" /></span>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Their own Essentials, in their own account</span>
              <span style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55 }}>For someone who can't use GLOOBAL themselves — a child, someone older, someone with a disability. They get their own GLOOBAL ID. You open their account with your PIN and use it for them: their Essentials, paying, moving money.</span>
              <span style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55 }}>Anyone close to them can do this — a parent, a big sister, a grandchild, a friend. Their document is what is checked: a birth certificate for a child, a government document for an adult.</span>
            </div> : null}

            {people.map((p) => <button key={p.id} onClick={() => { setView({ name: "person", id: p.id }); setNote(null); }} className="v2-tap" data-testid="care-person-row" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", border: "none", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 14px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 42, height: 42, borderRadius: "50%", background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, flexShrink: 0, fontFamily: T.fontDisplay }}>{careFirstName(p.name).charAt(0).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{careAgeText(p.age)} · {p.symbolId}</span>
                <span style={{ display: "block", marginTop: 7 }}><CareStatusChip doc={p.document} ready={p.essentialsReady} /></span>
              </span>
              <CareChevron size={18} color={T.inkFaint} />
            </button>)}

            <CareNote note={note} />

            {state && people.length < max ? <button onClick={() => { setView({ name: "add" }); setNote(null); }} className="v2-tap" data-testid="care-add-open" style={careButton(true, { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 0" })}><CareUserPlus size={17} color="#fff" />Add someone</button> : null}
            {state && people.length >= max ? <span style={{ fontSize: 12, color: T.inkSoft, textAlign: "center" }}>You can look after up to {max} people.</span> : null}
          </>}
    </div>
    {opening ? <CareOpenPin person={opening} onClose={() => setOpening(null)} onOpened={(r) => { setOpening(null); setActing({ token: r.token, person: r.person || opening }); }} /> : null}
    {acting ? <CareHelperPanel token={acting.token} person={acting.person} onClose={(ended) => { setActing(null); setRound((n) => n + 1); load(); if (ended) { setView({ name: "list" }); setNote({ ok: false, text: ended }); } }} /> : null}
  </div>;
}
