// src/features/creator/CreatorSetupScreen.jsx
import { useState as useState53, useEffect as useEffect50, useRef as useRef30 } from "react";
import { Camera as Camera6, Check as Check9, X as X12, MapPin as MapPin5, Loader as Loader5 } from "lucide-react";

// ── THE CREATOR SIDE INTRODUCES ITSELF ──────────────────────────────────
//
// One account, two sides. The Personal side is paid at a Gloobal ID —
// twelve symbols from the dial alphabet, which is unforgeable and
// unsayable. The Creator side is paid at a name somebody can say across a
// counter: rasoi.ghar, chacha.tea, mama.pasta.
//
// This screen is where that name is chosen, the first time an account
// flips to the Creator side.
//
// ── WHY TWO BOXES AND A DOT ─────────────────────────────────────────────
//
// It could have been one box with a dot typed into it. Two boxes say
// something a single box cannot: that the dot is structure rather than
// punctuation, that both halves are required, and — once the eye has seen
// `rasoi` and `ghar` as separate things — that this is a NAME, with the
// same shape as a person's, rather than a username with a full stop in it.
//
// It is also what makes the Pay & Services search work the same way, with
// a first-name box and a last-name box side by side.
//
// ── ANY LANGUAGE ────────────────────────────────────────────────────────
//
// Asked for in those words, and it reaches all the way down: the boxes
// take any script, the server normalises rather than restricts, and the
// only characters refused are the ones that would break a handle — the
// dot itself, whitespace, and the direction overrides that can make text
// render as something other than what is stored. See normaliseHandlePart
// in server/server.js, which also records what this does NOT solve.
//
// ── IT CAN BE SKIPPED ───────────────────────────────────────────────────
//
// The founder's choice, against my recommendation, and the consequence is
// real rather than theoretical: every screen that shows a creator has to
// handle a creator with no name. So `creatorHandleLabel` below is the one
// place that decides what to show instead, and nothing else guesses.

// What to call a creator who has not finished setting up. Used by the
// Creator dashboard, the profile row, and anywhere else a handle is shown.
//
// Falls back to the Gloobal ID rather than to a blank or to "Creator": the
// ID is what they can actually be paid at until a handle exists, so
// showing it is also the honest instruction.
function creatorHandleLabel(creator, fallbackGloobalId) {
  const handle = creator && typeof creator.handle === "string" ? creator.handle.trim() : "";
  if (handle) return handle;
  return fallbackGloobalId || "";
}

function creatorSetupDone(creator) {
  return Boolean(creator && typeof creator.handle === "string" && creator.handle.trim());
}

// ── THE AVAILABILITY CHECK ──────────────────────────────────────────────
//
// Runs while somebody types, and is NEVER trusted as a reservation: the
// unique index on the server is what decides, and the save turns its
// refusal into the same message. This exists so the common case is
// answered in the box rather than after a submit.
//
// Debounced, because it is a network call per keystroke otherwise. 400ms
// is long enough that typing "ghar" is one request rather than four, short
// enough that the answer arrives before a thumb reaches the button.
//
// Three states, not two: "free", "taken", and DON'T KNOW. The third is
// what a dead connection produces, and it must not look like "taken" — a
// red box on a train with no signal would stop somebody finishing a form
// for a reason that has nothing to do with their name.
var CREATOR_HANDLE_DEBOUNCE_MS = 400;

function useHandleAvailability(first, last) {
  const [state, setState] = useState53({ status: "idle", message: "", handle: "" });
  // Which request is the latest. An answer that arrives after a newer
  // request went out is discarded rather than painted, or a slow reply
  // about "ras" lands on top of a fast one about "rasoi".
  const seq = useRef30(0);

  useEffect50(() => {
    const a = (first || "").trim();
    const b = (last || "").trim();
    if (!a || !b) {
      setState({ status: "idle", message: "", handle: "" });
      return undefined;
    }
    const mine = seq.current + 1;
    seq.current = mine;
    setState((prev) => ({ status: "checking", message: "", handle: prev.handle }));
    const timer = setTimeout(async () => {
      const answer = await GloobalApi.creatorHandleAvailable(a, b);
      if (seq.current !== mine) return;
      if (!answer.known) {
        setState({ status: "unknown", message: "", handle: "" });
        return;
      }
      // Three refusals, not one. "Taken" means somebody holds it;
      // "invalid" means it is not a name this app can use at all — a
      // mix of alphabets, a dot inside a half, something too long. The
      // box says which, because "that name is taken" sent to somebody
      // who typed a Cyrillic letter by accident is an answer they can
      // do nothing with.
      setState({
        status: answer.available ? "free" : (answer.code ? "invalid" : "taken"),
        message: answer.message || "",
        handle: answer.handle || ""
      });
    }, CREATOR_HANDLE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [first, last]);

  return state;
}

// One name box. Tapping it edits; the dot between two of them is drawn by
// the parent, not by either box, so neither can be typed into to produce
// a second dot.
function CreatorNameBox({ value, onChange, placeholder, label, tone }) {
  return <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={label}
    // No autocapitalize and no autocorrect: a handle is not prose, and a
    // phone keyboard "helpfully" capitalising `rasoi` produces a display
    // name that does not match what everybody else types.
    autoCapitalize="none"
    autoCorrect="off"
    spellCheck={false}
    style={{
      flex: 1,
      minWidth: 0,
      border: `1.5px solid ${tone === "bad" ? T.negative : tone === "good" ? T.positive : T.line}`,
      borderRadius: T.radiusMd,
      background: T.surface,
      padding: "13px 14px",
      fontSize: 16,
      fontWeight: 700,
      color: T.ink,
      fontFamily: "inherit",
      outline: "none",
      textAlign: "center",
      transition: "border-color 0.18s ease"
    }}
  />;
}

function CreatorSetupScreen({
  myGloobalId,
  creator,
  onSave,
  onSkip,
  onClose,
  saving = false,
  error = ""
}) {
  const [first, setFirst] = useState53((creator && creator.handleFirst) || "");
  const [last, setLast] = useState53((creator && creator.handleLast) || "");
  const [logo, setLogo] = useState53((creator && creator.logo) || null);
  const [address, setAddress] = useState53((creator && creator.address) || "");
  const [addressPublic, setAddressPublic] = useState53(Boolean(creator && creator.addressPublic));
  const fileRef = useRef30(null);

  const availability = useHandleAvailability(first, last);

  // ── THE FLOATING MAP BUTTON STANDS ASIDE ──────────────────────────────
  //
  // AppMapButton is fixed at z-index 10000 and remembers where it was last
  // dragged, which defaults to 62% down the right-hand edge — directly on
  // top of this screen's address switch. A render showed it sitting on the
  // control, and a map button is not something anybody wants to hit while
  // deciding whether their home address is public.
  //
  // The same event a payment in flight uses. This is a full-screen form:
  // the only thing the map could do here is throw the form away.
  useEffect50(() => {
    if (typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  // ── THE SECOND BOX IS OPTIONAL ────────────────────────────────────────
  //
  // A creator whose name is one word — amazon, netflix, chacha — holds
  // just that word, with no dot. The FIRST box is the required one, so
  // leaving the second empty gives a one-word name, and the dot fades out
  // when there is nothing on its right.
  //
  // The other way round is a mistake rather than a one-word name:
  // somebody has typed into the wrong box, and quietly reordering it for
  // them would hand them a name they did not type. The server refuses it.
  const enough = Boolean(first.trim());
  const twoParts = Boolean(first.trim() && last.trim());
  // A refusal turns the box red; "checking" and "unknown" leave it
  // neutral, because neither is a fault of the name.
  const refused = availability.status === "taken" || availability.status === "invalid";
  const tone = refused ? "bad" : availability.status === "free" ? "good" : null;
  // Save is allowed while the answer is unknown — a dead connection is
  // not a reason to refuse, and the server will decide anyway.
  const canSave = enough && !saving && !refused;

  const pickLogo = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      // The same resizer the profile photo uses, so a 4MB camera shot
      // becomes something the 200 KB cap will take rather than a refusal
      // the person cannot act on.
      setLogo(await fitProfilePhotoForUpload(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const preview = twoParts
    ? `${first.trim().toLowerCase()}.${last.trim().toLowerCase()}`
    : (first.trim().toLowerCase() || "your name");

  return <div style={{
    position: "fixed",
    inset: 0,
    zIndex: 420,
    background: T.bg,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  }}><div style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 10px",
    flexShrink: 0
  }}><NavBackButton onClick={onClose} /><span style={{
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: 800,
    color: T.ink,
    fontFamily: T.fontDisplay
  }}>Your creator name</span>{
    /* The back button's own width, so the title is centred on the screen
       rather than on the space left beside it. */
  }<span aria-hidden="true" style={{ width: 42, flexShrink: 0 }} /></div><div style={{
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "4px 22px calc(26px + env(safe-area-inset-bottom, 0px))"
  }}><p style={{
    fontSize: 13,
    lineHeight: 1.55,
    color: T.inkSoft,
    textAlign: "center",
    margin: "0 0 22px"
  }}>
      This is how people pay you as a creator — a name they can say, instead of twelve symbols.
    </p>{
    /* ── THE MARK ─────────────────────────────────────────────────────
       A square rather than a circle, and that is the whole distinction
       between this and the profile photo: a round frame reads as a face
       and a squared one reads as a shop's sign. Both are this account;
       they are pictures of different things about it. */
  }<div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><button
    onClick={() => fileRef.current && fileRef.current.click()}
    aria-label={logo ? "Change your creator logo" : "Add your creator logo"}
    className="v2-tap"
    style={{
      position: "relative",
      width: 104,
      height: 104,
      borderRadius: 26,
      border: logo ? "none" : `1.5px dashed ${T.line}`,
      background: logo ? "none" : T.surface,
      padding: 0,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }}
  >{logo ? <img
    src={logo}
    alt=""
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
  /> : <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><Camera6 size={22} color={T.inkFaint} /><span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint }}>Logo</span></span>}<span
    aria-hidden="true"
    style={{
      position: "absolute",
      right: -1,
      bottom: -1,
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: T.accent,
      border: `2px solid ${T.bg}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><Camera6 size={13} color="#fff" /></span></button><input
    ref={fileRef}
    type="file"
    accept="image/*"
    onChange={pickLogo}
    style={{ display: "none" }}
  /></div>{
    /* ── THE NAME ─────────────────────────────────────────────────────
       The dot is drawn BETWEEN the boxes rather than typed into either.
       It cannot be deleted, cannot be doubled, and does not have to be
       explained — which is three problems a single text box with a dot
       in it would have had. */
  }<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><CreatorNameBox
    value={first}
    onChange={setFirst}
    placeholder="rasoi"
    label="First part of your creator name"
    tone={tone}
  /><span aria-hidden="true" style={{
    fontSize: 24,
    fontWeight: 900,
    color: T.accent,
    lineHeight: 1,
    paddingBottom: 4,
    flexShrink: 0,
    // It fades rather than disappears. Removing it would resize both
    // boxes under somebody's thumb the moment they start typing the
    // second half, and bring them back the moment they clear it.
    opacity: twoParts ? 1 : 0.22,
    transition: "opacity 0.18s ease"
  }}>.</span><CreatorNameBox
    value={last}
    onChange={setLast}
    placeholder="ghar (optional)"
    label="Second part of your creator name"
    tone={tone}
  /></div>{
    /* One line that is always present, so nothing below it moves as the
       answer changes. A row that appears and disappears shifts the
       address field under somebody's thumb mid-tap. */
  }<div style={{
    minHeight: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 24
  }}>{availability.status === "checking" && <><Loader5 size={13} color={T.inkFaint} /><span style={{ color: T.inkFaint }}>Checking…</span></>}{availability.status === "free" && <><Check9 size={13} color={T.positive} /><span style={{ color: T.positive }}>{availability.handle} is yours</span></>}{refused && <><X12 size={13} color={T.negative} /><span style={{ color: T.negative }}>{availability.message || "That name is taken."}</span></>}{(availability.status === "idle" || availability.status === "unknown") && <span style={{ color: T.inkFaint, fontWeight: 600 }}>
        {enough ? preview : "A first part is needed."}
      </span>}</div>{
    /* ── THE ADDRESS ──────────────────────────────────────────────────
       Private unless its owner says otherwise, and the switch says who
       will see it rather than naming a setting. The app cannot tell a
       shop's address from the kitchen somebody cooks in, and the cost of
       guessing wrong falls entirely on the person who typed it. */
  }<div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 2px 8px" }}><MapPin5 size={14} color={T.inkSoft} /><span style={{
    fontSize: 11,
    fontWeight: 800,
    color: T.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4
  }}>Address</span></div><textarea
    value={address}
    onChange={(e) => setAddress(e.target.value.slice(0, 400))}
    placeholder="Where you trade from. Optional."
    aria-label="Your creator address"
    rows={3}
    style={{
      width: "100%",
      border: `1.5px solid ${T.line}`,
      borderRadius: T.radiusMd,
      background: T.surface,
      padding: "12px 14px",
      fontSize: 14,
      lineHeight: 1.5,
      color: T.ink,
      fontFamily: "inherit",
      outline: "none",
      resize: "none",
      boxSizing: "border-box"
    }}
  /><div style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: T.radiusMd,
    background: T.surfaceAlt,
    border: `1px solid ${T.line}`
  }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>
        Show this to people who pay me
      </span><span style={{ display: "block", fontSize: 11.5, lineHeight: 1.45, color: T.inkFaint, marginTop: 2 }}>{addressPublic
    ? "Anybody who opens your creator page will see this address."
    : "Only you can see this. Nobody paying you will."}</span></span><ProfileToggle
    on={addressPublic}
    onToggle={() => setAddressPublic((v) => !v)}
    label="Show my address to people who pay me"
  /></div>{error && <div
    role="alert"
    style={{
      marginTop: 16,
      fontSize: 12.5,
      fontWeight: 700,
      color: "#fff",
      background: T.negative,
      borderRadius: 10,
      padding: "9px 13px",
      textAlign: "center",
      lineHeight: 1.45
    }}
  >{error}</div>}<button
    onClick={() => onSave({
      handleFirst: first.trim(),
      handleLast: last.trim(),
      address: address.trim(),
      addressPublic,
      logo: logo || undefined
    })}
    disabled={!canSave}
    className="v2-tap"
    style={{
      width: "100%",
      marginTop: 22,
      border: "none",
      borderRadius: 999,
      padding: "15px 20px",
      background: canSave ? T.gradButton : T.surfaceAlt,
      color: canSave ? "#fff" : T.inkFaint,
      fontSize: 15,
      fontWeight: 800,
      cursor: canSave ? "pointer" : "default",
      boxShadow: canSave ? "0 8px 20px rgba(124,58,237,0.28)" : "none"
    }}
  >{saving ? "Saving…" : "Save my creator name"}</button>{
    /* ── THE WAY OUT ──────────────────────────────────────────────────
       The founder chose a skippable screen. It is drawn as plain text
       rather than a second button, because two buttons of equal weight
       is a question and this is not one — the screen has a thing it
       wants you to do, and a way past it for people who do not want to
       do it now.
       Skipping is RECORDED (creatorProfile.setupSkippedAt), so the
       Creator dashboard can keep offering it without putting the whole
       screen back in the way on every flip. */
  }<button
    onClick={onSkip}
    className="v2-tap"
    style={{
      width: "100%",
      marginTop: 12,
      border: "none",
      background: "none",
      padding: "10px 0",
      fontSize: 13,
      fontWeight: 700,
      color: T.inkFaint,
      cursor: "pointer"
    }}
  >Set this up later</button><p style={{
    fontSize: 11.5,
    lineHeight: 1.5,
    color: T.inkFaint,
    textAlign: "center",
    margin: "10px 0 0"
  }}>
      Until you do, people can still pay your creator side at your Gloobal ID.
    </p></div></div>;
}

// ── THE CREATOR'S PAGE, UNDER PROFILE ───────────────────────────────────
//
// The Creator side's own row in the profile list: the mark, the handle and
// the address, with one way to change any of them — the same setup screen
// that asked for them in the first place.
//
// One editor, deliberately. A second one would be a second place for the
// rules about what a handle may contain to live, and two copies of a rule
// drift until one of them is wrong.
function CreatorProfilePanel({ creator, myGloobalId, onLoad, onEdit }) {
  // Opening this row can be the first touch of the Creator side — the
  // other being the flip itself — so it may arrive with nothing loaded.
  useEffect50(() => {
    if (!creator && typeof onLoad === "function") onLoad();
  }, [creator]);

  if (!creator) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: T.inkFaint }}>
      Loading your creator page…
    </div>;
  }

  const done = creatorSetupDone(creator);
  const row = (label, value, muted) => <div style={{
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    padding: "13px 0",
    borderTop: `1px solid ${T.line}`
  }}><span style={{ fontSize: 12, color: T.inkFaint, flexShrink: 0 }}>{label}</span><span style={{
    fontSize: 13.5,
    fontWeight: 700,
    color: muted ? T.inkFaint : T.ink,
    textAlign: "right",
    minWidth: 0,
    lineHeight: 1.5,
    // Any script, so no truncation and no ellipsis: a name in a script
    // the designer did not have in mind is still that person's name.
    overflowWrap: "anywhere"
  }}>{value}</span></div>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{
    borderRadius: T.radiusLg,
    background: T.surface,
    boxShadow: T.shadowCard,
    padding: "22px 18px 6px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  }}>{
    /* Square, not round. The round frame on Personal Details is a face;
       this is a sign over a door. Same account, two different pictures of
       two different things about it. */
  }<div style={{
    width: 86,
    height: 86,
    borderRadius: 22,
    overflow: "hidden",
    background: T.surfaceAlt,
    border: `1px solid ${T.line}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  }}>{creator.logo ? <img
    src={creator.logo}
    alt=""
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
  /> : <Camera6 size={22} color={T.inkFaint} />}</div><div style={{
    marginTop: 14,
    fontSize: 19,
    fontWeight: 800,
    color: done ? T.ink : T.inkFaint,
    fontFamily: T.fontDisplay,
    textAlign: "center",
    overflowWrap: "anywhere"
  }}>{done ? creator.handle : "No creator name yet"}</div><div style={{
    marginTop: 4,
    marginBottom: 16,
    fontSize: 12,
    color: T.inkFaint,
    textAlign: "center",
    lineHeight: 1.5,
    padding: "0 10px"
  }}>{done
    ? "People can pay you at this name."
    : "Until you pick one, people pay your creator side at your Gloobal ID."}</div><div style={{ width: "100%" }}>{row("Gloobal ID", myGloobalId || "—", !myGloobalId)}{row(
    "Address",
    creator.address ? creator.address : "Not set",
    !creator.address
  )}{
    /* Stated as what happens rather than as a setting's name. "Address
       visibility: off" tells somebody what the app calls it; this tells
       them who can see their address, which is the thing they actually
       want to know. */
  }{row(
    "Who sees it",
    creator.address
      ? (creator.addressPublic ? "Anybody who pays you" : "Only you")
      : "—",
    !creator.address
  )}</div></div><button
    onClick={onEdit}
    className="v2-tap"
    style={{
      border: "none",
      borderRadius: T.radiusMd,
      padding: "14px 0",
      color: "#fff",
      fontSize: 13.5,
      fontWeight: 800,
      background: T.gradButton,
      boxShadow: "0 8px 20px rgba(124,58,237,0.32)",
      cursor: "pointer"
    }}
  >{done ? "Edit creator profile" : "Set up my creator name"}</button></div>;
}
