// src/features/creator/CreatorFinder.jsx
//
// FINDING A CREATOR BY NAME, WHEREVER THAT HAS TO HAPPEN.
//
// Two boxes shaped like a creator's name — `first` and `last` with a dot
// between them — an exact lookup on the server, and the shop that comes
// back drawn as a row you can tap.
//
// ── WHY THIS EXISTS AS ITS OWN THING ────────────────────────────────────
//
// Adding a supplier used to call window.prompt("Supplier's creator name").
// That is a native browser dialog: it ignores the app's type and colours,
// says "gloobalv3.netlify.app says" above the question, cannot show whether
// the name resolves to anybody, cannot show their mark, and on a name typed
// with one character wrong it simply fails after the fact. The founder hit
// it and the screenshot says the rest.
//
// A prompt was a shortcut, and the honest fix is not a nicer prompt — it is
// the search that already exists on Pay & Services, in the one other place
// a person types a creator's name. Same two boxes, same exact-match rule,
// same debounce and sequence guard.
//
// EXACT NAME ONLY, which is the founder's rule and the safe one: a prefix
// search would publish a browsable directory of every creator and seat a
// lookalike registered an hour ago next to the real one.
import { useState as useState57, useEffect as useEffect52, useRef as useRef32 } from "react";

var CREATOR_FINDER_DEBOUNCE_MS = 400;

function CreatorFinder({
  title = "Find a creator",
  note = "",
  actionLabel = "Add",
  excludeSymbolId = "",
  excludeMessage = "That is you.",
  onPick,
  onClose
}) {
  const [first, setFirst] = useState57("");
  const [last, setLast] = useState57("");
  const [found, setFound] = useState57(null);
  const [busy, setBusy] = useState57(false);
  const [working, setWorking] = useState57(false);
  const seq = useRef32(0);

  const typed = first.trim();
  const handle = typed ? (last.trim() ? `${typed}.${last.trim()}` : typed) : "";

  // Debounced and sequence-guarded: a slow answer for a half-typed name
  // must not land after a fast one for the whole name and overwrite it.
  useEffect52(() => {
    if (!typed) {
      setFound(null);
      setBusy(false);
      return undefined;
    }
    const mine = seq.current + 1;
    seq.current = mine;
    setBusy(true);
    const timer = setTimeout(async () => {
      let creator = null;
      try {
        creator = await GloobalApi.resolveCreatorHandle(handle);
      } catch (e) {
        // Offline, or the API asleep. A lookup that could not run is not a
        // creator who does not exist, and the empty state below says which.
        creator = null;
      }
      if (seq.current !== mine) return;
      setFound(creator);
      setBusy(false);
    }, CREATOR_FINDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [first, last]);

  const isSelf = Boolean(found && excludeSymbolId && found.symbolId === excludeSymbolId);
  const paint = found ? businessMarkInk(found.handle || "") : null;

  return <div style={{
    position: "fixed", inset: 0, zIndex: 360, background: T.bg,
    display: "flex", flexDirection: "column", overflow: "hidden"
  }}><div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "calc(15px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0
  }}><NavBackButton onClick={onClose} /><span style={{
    flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>{title}</span></div>

  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 30px" }}>
  {note ? <div style={{
    fontSize: 12, color: T.inkFaint, fontWeight: 600, lineHeight: 1.5, margin: "2px 2px 14px"
  }}>{note}</div> : null}

  {
    /* The same shape as the name itself: two parts and a dot. A single box
       would make somebody type the dot, and a dot typed in the wrong half
       is the one thing buildCreatorHandle refuses outright. */
  }<div style={{
    display: "flex", alignItems: "center", background: T.surface,
    borderRadius: 15, padding: 3, boxShadow: T.shadowCard
  }}><input
    id="creator-finder-first"
    value={first}
    onChange={(e) => setFirst(e.target.value)}
    placeholder="First name"
    autoComplete="off"
    style={{
      flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
      padding: "11px 12px", fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: "inherit"
    }}
  /><span style={{
    fontSize: 15, fontWeight: 800, color: T.inkFaint, flexShrink: 0
  }}>·</span><input
    id="creator-finder-last"
    value={last}
    onChange={(e) => setLast(e.target.value)}
    placeholder="Last name"
    autoComplete="off"
    style={{
      flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
      padding: "11px 12px", fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: "inherit"
    }}
  /></div>

  <div style={{ marginTop: 16 }}>{
    !typed
      ? <div style={{
        fontSize: 12, color: T.inkFaint, fontWeight: 600, textAlign: "center",
        padding: "26px 18px", lineHeight: 1.55
      }}>Type their creator name exactly as they wrote it. One word is a name too — leave the second box empty.</div>
      : busy
        ? <div style={{
          fontSize: 12.5, color: T.inkFaint, fontWeight: 700, textAlign: "center", padding: "26px 18px"
        }}>Looking…</div>
        : found
          ? <>{
            /* The shop, drawn the way it is drawn everywhere else: their
               mark, their name, and the handle underneath in accent — which
               is how a real creator is told from a placeholder brand. */
          }<div style={{
            display: "flex", alignItems: "center", gap: 13, background: T.surface,
            borderRadius: 17, padding: "12px 13px", boxShadow: T.shadowCard,
            border: `1.5px solid ${T.accent}`
          }}>{found.logo
            ? <img src={found.logo} alt="" style={{
              width: 48, height: 48, borderRadius: 15, objectFit: "cover", flexShrink: 0, display: "block"
            }} />
            : <span style={{
              width: 48, height: 48, borderRadius: 15, flexShrink: 0, background: paint.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: paint.fg
            }}>{businessMarkInitials(found.handle || "")}</span>
          }<span style={{ flex: 1, minWidth: 0 }}><span style={{
            display: "block", fontSize: 14, fontWeight: 700, color: T.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>{creatorDisplayName(found)}</span><span style={{
            display: "block", fontSize: 11.5, fontWeight: 700, color: T.accent, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>{found.handle}</span>{
            Array.isArray(found.items) && found.items.length ? <span style={{
              display: "block", fontSize: 10.5, color: T.inkFaint, fontWeight: 600, marginTop: 3
            }}>{found.items.length} thing{found.items.length === 1 ? "" : "s"} on their list</span> : null
          }</span></div>
          {isSelf ? <div style={{
            fontSize: 12, fontWeight: 700, color: T.negative, textAlign: "center", marginTop: 14
          }}>{excludeMessage}</div> : <button
            onClick={async () => {
              setWorking(true);
              const ok = onPick ? await onPick(found) : false;
              setWorking(false);
              if (ok !== false) onClose && onClose();
            }}
            disabled={working}
            style={{
              width: "100%", marginTop: 14, background: T.gradButton, color: "#fff", border: "none",
              borderRadius: 15, padding: 14, fontSize: 14, fontWeight: 800, fontFamily: "inherit",
              cursor: working ? "default" : "pointer", opacity: working ? 0.7 : 1
            }}
          >{working ? "Adding…" : `${actionLabel} ${creatorDisplayName(found)}`}</button>}</>
          : <div style={{
            background: T.surface, borderRadius: 17, padding: "24px 18px",
            textAlign: "center", boxShadow: T.shadowCard
          }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>No creator with that name</div><div style={{
            fontSize: 11.5, color: T.inkFaint, marginTop: 5, lineHeight: 1.5
          }}>A creator is found by their exact name. Check the spelling, or scan their code instead.</div></div>
  }</div></div></div>;
}
