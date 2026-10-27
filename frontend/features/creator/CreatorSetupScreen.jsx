// src/features/creator/CreatorSetupScreen.jsx
import { useState as useState53, useEffect as useEffect50, useRef as useRef30 } from "react";
import { Camera as Camera6, Check as Check9, X as X12, MapPin as MapPin5, Loader as Loader5, Pencil as Pencil4, QrCode as QrCode2, Share2 as Share26, Copy as Copy5, Eye as Eye3, EyeOff as EyeOff4, Store as Store3, ShieldCheck as ShieldCheck2, ChevronRight as ChevronRight9, Contact as Contact4 } from "lucide-react";

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

// ── THE NAME A PERSON READS, AS DISTINCT FROM THE ONE THEY TYPE ────────
//
//     shown      रसोई ghar
//     behind     रसोई.ghar
//     the eye
//
// The handle is an ADDRESS: lower-cased, dotted, unique, and the thing
// somebody types to send money. It is not a name, and showing it as one
// puts punctuation in the middle of what a person calls their shop.
//
// So the page shows the two parts as they were typed, with a space, and the
// dotted form lives behind the eye beside the Gloobal ID — which is exactly
// where the founder put it: "just show chacha tea hide chacha.tea with
// details inside eye button".
//
// The RAW parts are used, not the normalised handle, because normalising
// lower-cases and NFC-folds for uniqueness. "McDonald" would come back
// "mcdonald", and a creator's own name is not the place to correct their
// capitalisation.
function creatorDisplayName(creator, fallbackGloobalId) {
  const first = creator && typeof creator.handleFirst === "string" ? creator.handleFirst.trim() : "";
  const last = creator && typeof creator.handleLast === "string" ? creator.handleLast.trim() : "";
  if (first) return last ? `${first} ${last}` : first;
  // Nothing typed survives — fall back to the address rather than to
  // nothing, because a page with no name on it is worse than a dotted one.
  return creatorHandleLabel(creator, fallbackGloobalId);
}

// ── WHY NOTHING DRAWS THE HANDLE UNDER THE NAME ────────────────────────
//
// Four surfaces used to: the pinned tile, the Pay & Services hit, the
// supplier finder, and the card you get for scanning a shop. Each carried
// the same reasoning — that a shop which can take money should not look
// like a placeholder brand which cannot, and the honest difference is an
// address people type.
//
// The need was real. The means was not, and the founder saw it before the
// reasoning did. Look at creatorDisplayName above: it is handleFirst plus
// handleLast. The handle is those same two parts, NFC-folded to lower case
// and joined with a dot. The two lines are therefore the same characters,
// every time, for every creator who finished setup:
//
//     रसोई Ghar
//     रसोई.ghar
//
// A word repeated in a second colour does not prove there is an address.
// It says the word twice, in half the room a 62px tile has for a name that
// already clamps to two lines.
//
// A guard was written first — show the second line only when it differs —
// and then deleted, because it could never fire. The no-handleFirst case
// falls through creatorHandleLabel, which RETURNS THE HANDLE, so the two
// are equal there too. A condition that is always false is worse than no
// condition: the next person reads it as a case that exists.
//
// The address has not gone anywhere. It lives behind the eye on the
// creator's own page, beside the Gloobal ID — which is exactly where the
// founder put it: "just show chacha tea hide chacha.tea with details
// inside eye button". That is the one screen where somebody needs to read
// it off and tell it to a customer.

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
function CreatorNameBox({ value, onChange, placeholder, label, tone, quiet = false, onFocus }) {
  return <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={label}
    // `quiet` suppresses the PHONE's keyboard, for when Gloobal's own is
    // up. Not readOnly, which would take the caret with it.
    inputMode={quiet ? "none" : undefined}
    onFocus={onFocus}
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
  countryIso = "",
  saving = false,
  error = ""
}) {
  const [first, setFirst] = useState53((creator && creator.handleFirst) || "");
  const [last, setLast] = useState53((creator && creator.handleLast) || "");
  const [logo, setLogo] = useState53((creator && creator.logo) || null);
  const [address, setAddress] = useState53((creator && creator.address) || "");
  const [addressPublic, setAddressPublic] = useState53(Boolean(creator && creator.addressPublic));
  const fileRef = useRef30(null);
  // Which half Gloobal's own keyboard is typing into, "" when it is shut.
  //
  // It matters MOST here. Everywhere else somebody is typing a name they
  // were shown; here they are choosing the one they will be paid at for
  // good, and a phone that cannot write their own alphabet is how a shop
  // ends up called something its owner would not have chosen.
  const [kbField, setKbField] = useState53("");

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
    // Room for the board, so the availability line under the name boxes
    // — the one that says whether the name is yours — is not the first
    // thing it covers.
    padding: kbField ? "4px 22px 58vh" : "4px 22px calc(26px + env(safe-area-inset-bottom, 0px))"
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
    quiet={Boolean(kbField)}
    onFocus={() => { if (kbField) setKbField("first"); }}
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
    quiet={Boolean(kbField)}
    onFocus={() => { if (kbField) setKbField("last"); }}
  /><NameKeyboardButton
    active={Boolean(kbField)}
    onOpen={() => setKbField((f) => (f ? "" : "first"))}
    label="Write your name in another alphabet"
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
    </p></div><CreatorNameKeyboard
    open={Boolean(kbField)}
    field={kbField || "first"}
    onField={setKbField}
    first={first}
    last={last}
    onFirst={setFirst}
    onLast={setLast}
    countryIso={countryIso}
    firstLabel="First part"
    lastLabel="Second part"
    onClose={() => setKbField("")}
  /></div>;
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
// ── THE CREATOR'S OWN IDENTITY, AS A THING RATHER THAN A FORM ───────────
//
// This was a white card: an 86px mark, the handle under it, and three
// label/value rows — Gloobal ID, Address, Who sees it. Correct, legible,
// and indistinguishable from the eight other rows in the profile list. A
// person's creator name is the thing their customers type to pay them,
// and it read like a settings page.
//
// The founder had another tool redraw it and sent the result: the name on
// a violet field with its mark beside it, the things you DO with a name
// as three buttons rather than buried, and the facts below as icon rows
// instead of a label column.
//
// Three things in that picture were not built, and it is worth saying
// which and why rather than leaving somebody to wonder:
//
//   * A MOON in the header. That is a dark-mode switch, and this app has
//     no dark mode to switch. A control that does nothing is worse than
//     an absent one. (The shop page's own `dark` theme is a property of
//     that shop, not of the app.)
//   * A MAP in the header. There is already a floating map button, which
//     this screen tells to stand aside; a second one would be two doors
//     to the same room.
//   * A GREEN DOT on the mark meaning nothing in particular. It is kept,
//     but made to mean the one true thing available here: whether the
//     name is live. Green once a handle exists — people can pay you at
//     it — and grey before that.
function CreatorProfilePanel({ creator, myGloobalId, onLoad, onEdit, onOpenPage, onShowQr, onToast }) {
  // Opening this row can be the first touch of the Creator side — the
  // other being the flip itself — so it may arrive with nothing loaded.
  useEffect50(() => {
    if (!creator && typeof onLoad === "function") onLoad();
  }, [creator]);

  // The Gloobal ID starts covered, like the balance and the choices do.
  // It is not a secret, but it is an identifier somebody can write down
  // over your shoulder, and this screen is one people open in front of
  // customers. Hiding costs nothing; showing is one tap.
  const [idShown, setIdShown] = useState53(false);

  if (!creator) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: T.inkFaint }}>
      Loading your creator page…
    </div>;
  }

  const done = creatorSetupDone(creator);
  const handle = done ? creator.handle : "";

  const share = () => {
    if (!handle) return;
    const text = `Pay me on Gloobal at ${handle}`;
    try {
      if (navigator.share) { navigator.share({ title: handle, text }).catch(() => {}); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(handle).catch(() => {});
        onToast && onToast("Name copied.");
      }
    } catch (e) {
      // A share sheet the browser refuses is not worth a broken screen.
    }
  };

  const copy = () => {
    if (!handle) return;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(handle).catch(() => {});
        onToast && onToast("Name copied.");
      }
    } catch (e) {
      // Same: the name is on screen either way.
    }
  };

  // One shape for the three things you do with a name. The first is
  // filled because showing the code is what happens at a counter, and
  // the other two are for sending it to somebody who is not there.
  const act = (key, label, Icon, onClick, primary) => <button
    key={key}
    onClick={onClick}
    disabled={!done}
    aria-label={label}
    className="v2-tap"
    style={{
      flex: 1, minWidth: 0, height: 52, borderRadius: 16, cursor: done ? "pointer" : "default",
      border: primary ? "none" : "1px solid rgba(255,255,255,0.34)",
      background: primary ? "#FFFFFF" : "rgba(255,255,255,0.14)",
      opacity: done ? 1 : 0.45,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Icon size={19} color={primary ? T.accent : "#FFFFFF"} /></button>;

  // A fact about the creator identity: an icon, the fact, and sometimes a
  // control. Icons rather than a label column — "Gloobal ID" beside a
  // Gloobal ID is a word spent saying what the next word already says.
  const fact = (key, Icon, body, trailing, first) => <div
    key={key}
    style={{
      display: "flex", alignItems: "center", gap: 13, padding: "13px 15px",
      borderTop: first ? "none" : `1px solid ${T.line}`
    }}
  ><Icon size={18} color={T.accent} style={{ flexShrink: 0 }} /><span style={{
    flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.45,
    // Any script, so no truncation and no ellipsis: an address in a
    // script the designer did not have in mind is still that address.
    overflowWrap: "anywhere"
  }}>{body}</span>{trailing}</div>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{
    /* ── THE NAME, ON ITS OWN FIELD ───────────────────────────────────
       The mark and the name side by side rather than stacked and
       centred. Centred, an 86px square above a word reads as an avatar
       with a caption; side by side it reads as a sign with a name on
       it, which is what a creator handle is. */
  }<div style={{
    borderRadius: 24,
    background: T.gradButton,
    boxShadow: "0 10px 26px rgba(124,58,237,0.30)",
    padding: "20px 18px 18px"
  }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{
    position: "relative", flexShrink: 0, display: "inline-flex"
  }}><span style={{
    width: 74, height: 74, borderRadius: 20, overflow: "hidden",
    background: "rgba(255,255,255,0.92)",
    display: "flex", alignItems: "center", justifyContent: "center"
  }}>{creator.logo ? <img
    src={creator.logo}
    alt=""
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
  /> : <Camera6 size={24} color={T.inkFaint} />}</span>{
    /* Live, or not yet.

       The ring is WHITE, not the violet behind it. Matching the card was
       the first attempt and a render killed it: the card is a gradient,
       so a flat violet ring is the wrong violet everywhere except one
       line of the card, and it read as a mismatched purple circle rather
       than as a cut-out. White sits correctly on the violet AND on the
       corner of whatever logo somebody uploaded, which is the other half
       of the problem. */
  }<span aria-hidden="true" style={{
    position: "absolute", right: -3, bottom: -3, width: 16, height: 16, borderRadius: "50%",
    background: done ? T.positive : T.inkFaint,
    border: "3px solid #FFFFFF",
    boxShadow: "0 1px 3px rgba(20,18,43,0.25)"
  }} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 21, fontWeight: 800, color: "#FFFFFF",
    fontFamily: T.fontDisplay, lineHeight: 1.2, overflowWrap: "anywhere"
  }}>{done ? handle : "No creator name yet"}</span></span><button
    onClick={onEdit}
    aria-label={done ? "Edit your creator profile" : "Set up your creator name"}
    className="v2-tap"
    style={{
      flexShrink: 0, width: 44, height: 44, borderRadius: 14, cursor: "pointer",
      border: "1px solid rgba(255,255,255,0.34)", background: "rgba(255,255,255,0.14)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Pencil4 size={17} color="#FFFFFF" /></button></div><div style={{
    marginTop: 14, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.82)", lineHeight: 1.5
  }}>{done
    ? "People can pay you at this name"
    : "Until you pick one, people pay your creator side at your Gloobal ID"}</div><div style={{
    display: "flex", gap: 10, marginTop: 15
  }}>{[
    act("qr", "Show your code", QrCode2, onShowQr, true),
    act("share", "Share your name", Share26, share, false),
    act("copy", "Copy your name", Copy5, copy, false)
  ]}</div></div>{
    /* ── WHAT IS TRUE ABOUT IT ────────────────────────────────────────
       Three facts, each with its own icon, in one card. */
  }<div style={{
    borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden"
  }}>{fact(
    "id",
    Contact4,
    idShown
      ? (myGloobalId || "—")
      : <span aria-label="Your Gloobal ID, hidden" style={{
        letterSpacing: 3, fontSize: 15, color: T.inkSoft
      }}>{"•••• •••• ••••"}</span>,
    <button
      onClick={() => setIdShown((v) => !v)}
      aria-label={idShown ? "Hide your Gloobal ID" : "Show your Gloobal ID"}
      aria-pressed={idShown}
      className="v2-tap"
      style={{
        flexShrink: 0, width: 38, height: 38, borderRadius: 12, cursor: "pointer",
        border: `1px solid ${T.line}`, background: T.surface,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}
    >{idShown
      ? <EyeOff4 size={16} color={T.inkSoft} />
      : <Eye3 size={16} color={T.inkSoft} />}</button>,
    true
  )}{fact(
    "address",
    MapPin5,
    creator.address
      ? creator.address
      : <span style={{ color: T.inkFaint }}>No address set</span>,
    null,
    false
  )}{
    /* Stated as what happens rather than as a setting's name. "Address
       visibility: off" tells somebody what the app calls it; this tells
       them who can see their address, which is the thing they want to
       know. */
  }{fact(
    "who",
    ShieldCheck2,
    creator.address
      ? (creator.addressPublic ? "Anyone who pays you" : "Only you")
      : <span style={{ color: T.inkFaint }}>Nobody — there is no address yet</span>,
    null,
    false
  )}</div>{
    /* ── THE WAY INTO YOUR OWN PAGE ──────────────────────────────────
       This panel describes the creator identity; the page is where the
       identity does its job — the list people buy from, and the
       suppliers you buy from. Without a door here the inventory existed
       on the server and nowhere a creator could reach it. */
  }{done ? <button
    onClick={onOpenPage}
    className="v2-tap"
    style={{
      display: "flex", alignItems: "center", gap: 13, width: "100%",
      border: "none", borderRadius: T.radiusLg, padding: "15px 15px",
      background: T.surface, boxShadow: T.shadowCard, cursor: "pointer",
      fontFamily: "inherit", textAlign: "left"
    }}
  ><Store3 size={19} color={T.accent} style={{ flexShrink: 0 }} /><span style={{
    flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: T.accent
  }}>Your page and what you sell</span><ChevronRight9 size={17} color={T.accent} /></button> : <button
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
  >Set up my creator name</button>}</div>;
}
