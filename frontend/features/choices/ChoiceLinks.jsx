// src/features/choices/ChoiceLinks.jsx
import { useState as useState48, useEffect as useEffect47 } from "react";
import { UserPlus as UserPlus1, UserMinus as UserMinus1, Check as Check7, X as X10 } from "lucide-react";

// ── CONNECTED CATEGORIES, ON SCREEN ─────────────────────────────────────
//
// A merchant pays Ramu his wages and files it under "Staff salary". Ramu
// needs the same payment on his own books, as income, under a name he
// chose. The server half of this is in models/CategoryLink.js; these are
// the three moments it needs on a phone:
//
//   the merchant asking,
//   Ramu deciding,
//   and either of them seeing afterwards who is connected to what.
//
// Deliberately NOT a fourth moment: there is no screen anywhere here that
// shows one side anything about the other's money. A link carries a
// payment both parties were already party to into a label each of them
// chose, and that is the whole of it.

// The one event this feature can report, said the same way everywhere.
var CHOICE_LINK_EVENT = "gloobal:categoryLinks";

function choiceLinksChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHOICE_LINK_EVENT));
}

// Every connection this account is either side of, kept fresh.
//
// A hook rather than a prop threaded from the top, because the two screens
// that need it — a category and the grid — are not on the same branch of
// the tree, and the thing that changes them is a tap on whichever one the
// person happens to be looking at.
//
// Reloads on the app coming back to the front as well as on its own event:
// the other half of every invitation happens on somebody else's phone, so
// the answer arrives while this app is in the background or not at all.
function useCategoryLinks() {
  const [links, setLinks] = useState48([]);
  const [loading, setLoading] = useState48(true);

  useEffect47(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await GloobalApi.getCategoryLinks();
        if (alive) setLinks(Array.isArray(rows) ? rows : []);
      } catch (e) {
        // A connection list that will not load is not worth an error on a
        // screen about something else. The categories themselves are the
        // screen; this is furniture on it.
        if (alive) setLinks([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const onWake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load();
    };
    window.addEventListener(CHOICE_LINK_EVENT, load);
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      alive = false;
      window.removeEventListener(CHOICE_LINK_EVENT, load);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return { links, loading };
}

// ── ASKING ──────────────────────────────────────────────────────────────
//
// A plain text field rather than the symbol pad the Send screen uses.
// A Gloobal ID is twelve symbols somebody is reading off another phone or
// has been sent in a message, and the fastest way to get it right is to
// paste it. The pad is for when you are looking at the person; this is for
// when you are looking at their ID.
function ChoiceConnectSheet({ open, category, onClose, onDone, onToast }) {
  const [symbolId, setSymbolId] = useState48("");
  const [busy, setBusy] = useState48(false);
  const [error, setError] = useState48(null);

  useEffect47(() => {
    if (!open) return;
    setSymbolId("");
    setError(null);
    setBusy(false);
  }, [open, category && category.id]);

  if (!open || !category) return null;

  const send = async () => {
    const id = symbolId.trim();
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await GloobalApi.connectCategory(category.id, id);
      choiceLinksChanged();
      if (onToast) onToast("Invitation sent.");
      if (onDone) onDone();
      onClose();
    } catch (err) {
      // The server's own words. It distinguishes "no such account" from
      // "already asked" from "they turned this down", and each of those is
      // a different thing to do next.
      setError((err && err.message) || "Could not send that invitation.");
      setBusy(false);
    }
  };

  return <ChoiceFullScreen
    open={open}
    onClose={onClose}
    title={`Connect to ${category.name}`}
    footer={<button
      onClick={send}
      disabled={!symbolId.trim() || busy}
      className="v2-tap"
      style={{
        width: "100%",
        minHeight: 52,
        borderRadius: 18,
        border: "none",
        background: symbolId.trim() && !busy ? T.gradButton : T.surfaceSunk,
        color: symbolId.trim() && !busy ? "#fff" : T.inkFaint,
        fontSize: 15,
        fontWeight: 800,
        cursor: symbolId.trim() && !busy ? "pointer" : "default"
      }}
    >{busy ? "Sending…" : "Send invitation"}</button>}
  ><ChoiceFieldCard
    label="Their GLOOBAL ID"
    note="paste it"
  ><input
    value={symbolId}
    onChange={(e) => { setSymbolId(e.target.value); setError(null); }}
    placeholder="GLOOBAL ID"
    autoFocus
    style={{
      width: "100%",
      border: "none",
      outline: "none",
      background: "transparent",
      fontSize: 17,
      fontWeight: 700,
      color: T.ink,
      letterSpacing: 1,
      fontFamily: T.fontDisplay
    }}
  /></ChoiceFieldCard><div
    style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, padding: "0 4px" }}
  >{
    /* What they are agreeing to, said before they are asked to agree —
       and said from THEIR side, because that is the side being changed. */
  }They will be asked to accept, and will give it a name of their own.
      Once they do, every payment you file under <strong style={{ color: T.ink }}>{category.name}</strong> files
      itself under theirs as income. Neither of you sees the other's totals.
    </div>{error && <div
    role="alert"
    style={{ fontSize: 12.5, fontWeight: 700, color: T.negative, background: T.negativeSoft, borderRadius: 12, padding: "10px 14px", lineHeight: 1.45 }}
  >{error}</div>}</ChoiceFullScreen>;
}

// ── DECIDING ────────────────────────────────────────────────────────────
//
// What arrives on the other phone. It names who is asking and what they
// call it, and asks for one thing in return: what YOU want to call it.
//
// The name is the only field. Everything else about the category — its
// icon, its colour, its budget — is editable afterwards on a screen built
// for it, and asking for all of that here would turn a yes-or-no into a
// form.
function ChoiceAcceptSheet({ open, link, onClose, onToast }) {
  const [name, setName] = useState48("");
  const [busy, setBusy] = useState48(false);
  const [error, setError] = useState48(null);

  useEffect47(() => {
    if (!open) return;
    setName("");
    setError(null);
    setBusy(false);
  }, [open, link && link.id]);

  if (!open || !link) return null;

  const accept = async () => {
    const chosen = name.trim();
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      await GloobalApi.acceptCategoryLink(link.id, chosen);
      choiceLinksChanged();
      if (typeof window !== "undefined") {
        // The grid has a new category on it now, and it did not come from
        // this screen's own create flow.
        window.dispatchEvent(new CustomEvent("gloobal:paymentBanner"));
      }
      if (onToast) onToast(`"${chosen}" added to your choices.`);
      onClose();
    } catch (err) {
      setError((err && err.message) || "Could not accept that invitation.");
      setBusy(false);
    }
  };

  return <ChoiceFullScreen
    open={open}
    onClose={onClose}
    title="Name your side"
    footer={<button
      onClick={accept}
      disabled={!name.trim() || busy}
      className="v2-tap"
      style={{
        width: "100%",
        minHeight: 52,
        borderRadius: 18,
        border: "none",
        background: name.trim() && !busy ? T.gradButton : T.surfaceSunk,
        color: name.trim() && !busy ? "#fff" : T.inkFaint,
        fontSize: 15,
        fontWeight: 800,
        cursor: name.trim() && !busy ? "pointer" : "default"
      }}
    >{busy ? "Adding…" : "Accept and add"}</button>}
  ><div
    style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, padding: "0 4px" }}
  >{link.withName || "They"} file{link.withName ? "s" : ""} these payments
      under <strong style={{ color: T.ink }}>{link.invitedTo || "a choice of theirs"}</strong>.
      What you call yours is yours alone — they never see it.
    </div><ChoiceFieldCard
    label="Your name for it"
    note="income, creator side"
  ><input
    value={name}
    onChange={(e) => { setName(e.target.value); setError(null); }}
    placeholder="My earnings"
    autoFocus
    maxLength={40}
    style={{
      width: "100%",
      border: "none",
      outline: "none",
      background: "transparent",
      fontSize: 17,
      fontWeight: 700,
      color: T.ink,
      fontFamily: T.fontDisplay
    }}
  /></ChoiceFieldCard>{error && <div
    role="alert"
    style={{ fontSize: 12.5, fontWeight: 700, color: T.negative, background: T.negativeSoft, borderRadius: 12, padding: "10px 14px", lineHeight: 1.45 }}
  >{error}</div>}</ChoiceFullScreen>;
}

// What is waiting for me, above the grid.
//
// On the Choices screen rather than only in the notification tray, because
// a notification is a thing that happened and this is a thing to do. The
// tray row gets you here; this is what being here looks like.
function ChoiceInviteList({ links, onAccept, onToast }) {
  const waiting = links.filter((row) => row.role === "member" && row.status === "pending");
  if (!waiting.length) return null;

  const decline = async (row) => {
    try {
      await GloobalApi.declineCategoryLink(row.id);
      choiceLinksChanged();
      if (onToast) onToast("Declined.");
    } catch (err) {
      if (onToast) onToast((err && err.message) || "Could not decline that.");
    }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>{waiting.map((row) => <div
    key={row.id}
    style={{
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.accentSoft}`,
      boxShadow: T.shadowCard,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }}
  ><div style={{ display: "flex", alignItems: "center", gap: 11 }}><span
    style={{ width: 34, height: 34, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><UserPlus1 size={16} color={T.accent} /></span><span style={{ minWidth: 0 }}><span
    style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink, overflowWrap: "anywhere" }}
  >{row.withName || row.withSymbolId || "Someone"}</span><span
    style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 1, overflowWrap: "anywhere" }}
  >wants to connect {row.invitedTo ? `"${row.invitedTo}"` : "a choice"}</span></span></div><div
    style={{ display: "flex", gap: 9 }}
  ><button
    onClick={() => onAccept(row)}
    className="v2-tap"
    style={{ flex: 1, minHeight: 42, borderRadius: 14, border: "none", background: T.gradButton, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
  ><Check7 size={15} />Accept</button><button
    onClick={() => decline(row)}
    className="v2-tap"
    aria-label={`Decline ${row.withName || "this invitation"}`}
    style={{ width: 44, minHeight: 42, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, color: T.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><X10 size={16} /></button></div></div>)}</div>;
}

// ── SEEING AFTERWARDS ───────────────────────────────────────────────────
//
// Who is on this category, on the category's own screen. Shown to both
// sides, because both sides have a standing arrangement they may want to
// end, and a connection you cannot leave is not a connection.
//
// Pending invitations are listed too, greyed. An invitation that vanishes
// until it is answered leaves the person who sent it wondering whether
// they sent it.
function ChoiceConnections({ categoryId, links, onToast, canInvite, onInvite }) {
  const mine = links.filter((row) => row.categoryId === String(categoryId || ""));
  // Nothing at all on a category that has nobody on it and cannot have
  // anybody — a personal category is one person's own life, and an empty
  // "Connected" heading on it is a question nobody asked.
  if (!mine.length && !canInvite) return null;

  const end = async (row) => {
    try {
      await GloobalApi.endCategoryLink(row.id);
      choiceLinksChanged();
      if (onToast) onToast(row.status === "pending" ? "Invitation withdrawn." : "Disconnected.");
    } catch (err) {
      if (onToast) onToast((err && err.message) || "Could not end that connection.");
    }
  };

  return <div style={{ marginTop: 18 }}><div
    style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 9px 2px" }}
  >
      Connected
    </div><div
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{mine.map((row, i) => <div
    key={row.id}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "12px 15px",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      opacity: row.status === "pending" ? 0.65 : 1
    }}
  ><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflowWrap: "anywhere" }}
  >{row.withName || row.withSymbolId || "Someone"}</span><span
    style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}
  >{row.status === "pending"
    ? (row.role === "owner" ? "Waiting for them" : "Waiting for you")
    : (row.role === "owner" ? "Their copy files itself" : "Files itself from theirs")}</span></span><button
    onClick={() => end(row)}
    className="v2-tap"
    aria-label={`Disconnect ${row.withName || row.withSymbolId || "this person"}`}
    style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><UserMinus1 size={15} /></button></div>)}{
    /* And the way IN, at the end of the list rather than up in the title
       row. It started as a fourth circle beside Back, Scan and Edit, and
       four circles left the category's own name truncated to "Staff …" —
       the one thing on that row nobody can do without. Here it also sits
       beside the people it adds to, which is where somebody looking for
       it would look. */
  }{canInvite && <button
    onClick={onInvite}
    className="v2-tap"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "12px 15px",
      borderTop: mine.length ? `1px solid ${T.line}` : "none",
      border: "none",
      borderTopWidth: mine.length ? 1 : 0,
      borderTopStyle: "solid",
      borderTopColor: T.line,
      background: "transparent",
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span
    style={{ width: 34, height: 34, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><UserPlus1 size={15} color={T.accent} /></span><span
    style={{ fontSize: 13.5, fontWeight: 800, color: T.accent }}
  >Connect someone</span></button>}</div></div>;
}
