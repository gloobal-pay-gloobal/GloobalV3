// src/features/creator/CreatorSetupScreen.jsx
import { useState as useState53, useEffect as useEffect50, useRef as useRef30 } from "react";
import { Camera as Camera6, Check as Check9, X as X12, MapPin as MapPin5, Loader as Loader5, Pencil as Pencil4, QrCode as QrCode2, Share2 as Share26, Copy as Copy5, Eye as Eye3, EyeOff as EyeOff4, Store as Store3, ShieldCheck as ShieldCheck2, ChevronRight as ChevronRight9, Contact as Contact4, ArrowLeftRight } from "lucide-react";

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
      // The border belongs to the joined field around both halves now;
      // `tone` colours that, so it is the one edge that turns green or red.
      border: "none",
      borderRadius: 0,
      background: "transparent",
      padding: "15px 8px",
      fontSize: 16,
      fontWeight: 700,
      color: T.ink,
      fontFamily: "inherit",
      outline: "none",
      textAlign: "center"
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
  // The address as its parts — see creatorAddress.jsx. An address saved as
  // one line before the parts existed opens with that line kept.
  const [addressParts, setAddressParts] = useState53(() => creatorAddressInitial(creator));
  const [addressPublic, setAddressPublic] = useState53(Boolean(creator && creator.addressPublic));
  // A line for whoever scans the code, and nowhere else. Deliberately
  // separate from the shop's announcement band: that one is read while
  // browsing a page, this one in the two seconds before money moves, and
  // the two say different things for that reason.
  const [scanNote, setScanNote] = useState53((creator && creator.scanNote) || "");
  const [scanNoteStyle, setScanNoteStyle] = useState53((creator && creator.scanNoteStyle) || "ribbon");
  // How the name is written — the shop's font, which this screen and the
  // Look screen both set. A creator who never picked one starts on Clean
  // rather than the app's Latin-only face, so a Hindi name is drawn in
  // one hand from the first save.
  const [font, setFont] = useState53(() => {
    const saved = creator && creator.shop && creator.shop.font;
    return SHOP_FONTS[saved] && saved !== "grotesk" ? saved : "mukta";
  });
  const [fontsOpen, setFontsOpen] = useState53(false);
  // What kind of shop, for Gloobal बाज़ार's categories, and whether to be
  // listed there at all. Listed is ON unless the creator turned it off.
  const [category, setCategory] = useState53((creator && creator.category) || "");
  const [listed, setListed] = useState53(!(creator && creator.listed === false));
  // Every face is drawn in the person's name — the three tiles, the live
  // card and the More fonts list — so all of them are fetched up front.
  useEffect50(() => { Object.keys(SHOP_FONTS).forEach(ensureShopFont); }, []);
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

  // The card at the top is painted in this shop's own colour, from the same
  // resolver the shop page uses, so the setup screen and the page it sets up
  // look like one thing. A creator with no colour yet gets Gloobal violet.
  const look = resolveShopTheme(Object.assign({}, (creator && creator.shop) || {}, { font }));
  const fontFace = SHOP_FONTS[font] || SHOP_FONTS.grotesk;
  const shownName = enough ? (twoParts ? `${first.trim()} ${last.trim()}` : first.trim()) : "Your name";
  const quickKeys = SHOP_FONT_QUICK.map((q) => q.key);
  const moreName = quickKeys.indexOf(font) < 0 ? fontFace.name : "";

  // A white section card. One shape for all three, so the screen reads as
  // three things to fill in rather than one long form.
  const section = (title, Icon, children, aside) => <section style={{
    background: T.surface, borderRadius: 22, padding: "16px 16px 18px", marginTop: 14,
    boxShadow: "0 1px 2px rgba(21,19,42,0.04), 0 6px 18px rgba(21,19,42,0.05)"
  }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>{Icon ? <span style={{
    width: 26, height: 26, borderRadius: 9, background: T.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
  }}><Icon size={14} color={T.accent} /></span> : null}<span style={{
    flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>{title}</span>{aside || null}</div>{children}</section>;

  const fieldBox = {
    width: "100%", border: `1.5px solid ${T.line}`, borderRadius: 14, background: T.bg,
    padding: "12px 14px", fontSize: 14, lineHeight: 1.5, color: T.ink, fontFamily: "inherit",
    outline: "none", resize: "none", boxSizing: "border-box"
  };

  // One font tile: the person's OWN name in that face, with the face's
  // label under it. Their name, not "Aa" — the question is how MY shop
  // looks in this, and a sample alphabet does not answer it.
  const fontTile = (key, label) => {
    const f = SHOP_FONTS[key];
    const on = font === key;
    return <button
      key={key}
      onClick={() => setFont(key)}
      aria-pressed={on}
      aria-label={`${label} font, ${f.name}`}
      className="v2-tap"
      style={{
        flex: 1, minWidth: 0, border: "none", cursor: "pointer", borderRadius: 16, padding: "12px 6px 10px",
        background: on ? T.accentSoft : T.bg,
        boxShadow: on ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative"
      }}
    >{on ? <span aria-hidden="true" style={{
      position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: T.accent,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}><Check9 size={10} color="#fff" strokeWidth={3} /></span> : null}<span style={{
      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      fontSize: 18, lineHeight: 1.35, color: T.ink, fontFamily: f.stack, fontWeight: f.weight
    }}>{enough ? first.trim() : "रसोई"}</span><span style={{
      fontSize: 11, fontWeight: 700, color: on ? T.accent : T.inkSoft
    }}>{label}</span></button>;
  };

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
    padding: "calc(16px + env(safe-area-inset-top, 0px)) 16px 8px",
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
  }<span aria-hidden="true" style={{ width: 40, flexShrink: 0 }} /></div><div style={{
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    // Room for the board, so the availability line under the name boxes
    // — the one that says whether the name is yours — is not the first
    // thing it covers.
    padding: kbField ? "6px 16px 58vh" : "6px 16px 24px"
  }}>{
    /* ── THE LIVE CARD ────────────────────────────────────────────────
       What customers will see, drawn as it is typed: the logo, the name in
       the chosen font, and the address people can type to pay. It IS the
       preview, so the screen needs no separate one — and the logo is
       changed by tapping it here, on the card, where it will be seen.

       A square mark rather than a circle, and that is the whole distinction
       between this and the profile photo: a round frame reads as a face and
       a squared one reads as a shop's sign. */
  }<div data-creator-live-card="" style={{
    position: "relative", overflow: "hidden", borderRadius: 26, padding: "18px 18px 16px", color: "#fff",
    background: `linear-gradient(140deg, ${look.hero.from} 0%, ${look.hero.to} 100%)`,
    boxShadow: `0 14px 30px ${look.hero.glow}`
  }}><span aria-hidden="true" style={{
    position: "absolute", right: -50, top: -60, width: 170, height: 170, borderRadius: "50%",
    background: "rgba(255,255,255,0.08)", pointerEvents: "none"
  }} /><div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}><button
    onClick={() => fileRef.current && fileRef.current.click()}
    aria-label={logo ? "Change your creator logo" : "Add your creator logo"}
    className="v2-tap"
    style={{
      position: "relative", flexShrink: 0, width: 76, height: 76, borderRadius: 22, padding: 0,
      border: logo ? "3px solid rgba(255,255,255,0.92)" : "1.5px dashed rgba(255,255,255,0.7)",
      background: logo ? "none" : "rgba(255,255,255,0.14)", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  >{logo ? <img
    src={logo}
    alt=""
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 19 }}
  /> : <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><Camera6 size={20} color="#fff" /><span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff" }}>Logo</span></span>}<span
    aria-hidden="true"
    style={{
      position: "absolute", right: -7, bottom: -7, width: 26, height: 26, borderRadius: "50%",
      background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Camera6 size={12} color={look.hero.from} /></span></button><input
    ref={fileRef}
    type="file"
    accept="image/*"
    onChange={pickLogo}
    style={{ display: "none" }}
  /><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 24, lineHeight: 1.2, color: "#fff", overflowWrap: "anywhere",
    fontFamily: fontFace.stack, fontWeight: fontFace.weight, opacity: enough ? 1 : 0.6
  }}>{shownName}</span><span style={{
    display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, maxWidth: "100%",
    padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.16)",
    fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.95)"
  }}><Store3 size={12} color="#fff" style={{ flexShrink: 0 }} /><span style={{
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{preview}</span></span></span></div><p style={{
    position: "relative", fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.82)", margin: "14px 0 0"
  }}>This is how people pay you as a creator — a name they can say, instead of twelve symbols.</p></div>

  {section("Name", Pencil4, <>{
    /* ── THE NAME ─────────────────────────────────────────────────────
       Still two parts with the dot drawn BETWEEN them rather than typed —
       it cannot be deleted, doubled or misplaced — but now one joined
       field, with the keyboard button at its edge, so it reads as one name
       in two halves rather than two separate questions. */
  }<div style={{
    display: "flex", alignItems: "stretch", borderRadius: 16, background: T.bg, overflow: "hidden",
    boxShadow: `inset 0 0 0 1.5px ${tone === "bad" ? T.negative : tone === "good" ? T.positive : T.line}`,
    transition: "box-shadow 0.18s ease"
  }}><CreatorNameBox
    value={first}
    onChange={setFirst}
    placeholder="rasoi"
    label="First part of your creator name"
    tone={tone}
    quiet={Boolean(kbField)}
    onFocus={() => { if (kbField) setKbField("first"); }}
  /><span aria-hidden="true" style={{
    alignSelf: "center",
    fontSize: 26,
    fontWeight: 900,
    color: T.accent,
    lineHeight: 1,
    paddingBottom: 6,
    flexShrink: 0,
    // It fades rather than disappears. Removing it would resize both
    // boxes under somebody's thumb the moment they start typing the
    // second half, and bring them back the moment they clear it.
    opacity: twoParts ? 1 : 0.25,
    transition: "opacity 0.18s ease"
  }}>.</span><CreatorNameBox
    value={last}
    onChange={setLast}
    placeholder="ghar (optional)"
    label="Second part of your creator name"
    tone={tone}
    quiet={Boolean(kbField)}
    onFocus={() => { if (kbField) setKbField("last"); }}
  /><span style={{
    display: "flex", alignItems: "center", padding: "0 6px", borderLeft: `1px solid ${T.line}`, flexShrink: 0
  }}><NameKeyboardButton
    active={Boolean(kbField)}
    onOpen={() => setKbField((f) => (f ? "" : "first"))}
    label="Write your name in another alphabet"
  /></span></div>{
    /* One line that is always present, so nothing below it moves as the
       answer changes. A row that appears and disappears shifts the
       fields under somebody's thumb mid-tap. */
  }<div style={{
    minHeight: 20,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    margin: "9px 2px 0"
  }}>{availability.status === "checking" && <><Loader5 size={13} color={T.inkFaint} /><span style={{ color: T.inkFaint }}>Checking…</span></>}{availability.status === "free" && <><Check9 size={13} color={T.positive} /><span style={{ color: T.positive }}>{availability.handle} is yours</span></>}{refused && <><X12 size={13} color={T.negative} /><span style={{ color: T.negative }}>{availability.message || "That name is taken."}</span></>}{(availability.status === "idle" || availability.status === "unknown") && <span style={{ color: T.inkFaint, fontWeight: 600 }}>
        {enough ? preview : "A first part is needed. The second is optional."}
      </span>}</div>{
    /* ── HOW THE NAME IS WRITTEN ──────────────────────────────────────
       "This type of suggestions i need during they create there name both
       normal and custom": three suggestions drawn in the person's own name
       — Clean, Classic, Bold — and every other face behind More fonts.
       All of them carry Hindi AND English in one design, so both halves of
       a name like रसोई Ghar come out in the same hand. The pick is the
       shop's font, the same one the Look screen sets. */
  }<div style={{
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase",
    letterSpacing: 0.5, margin: "16px 2px 8px"
  }}>Font</div><div style={{ display: "flex", gap: 8 }}>{SHOP_FONT_QUICK.map((q) => fontTile(q.key, q.label))}</div><button
    onClick={() => setFontsOpen(true)}
    className="v2-tap"
    style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", marginTop: 8, padding: "11px 12px",
      border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      background: moreName ? T.accentSoft : T.bg,
      boxShadow: moreName ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}`
    }}
  ><span style={{
    width: 30, height: 30, borderRadius: 10, background: T.surface, flexShrink: 0, fontFamily: "'Fraunces', Georgia, serif",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: T.accent
  }}>Aa</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 13, fontWeight: 800, color: T.ink
  }}>More fonts</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, color: moreName ? T.accent : T.inkFaint, marginTop: 1
  }}>{moreName ? `Using ${moreName}` : `${Object.keys(SHOP_FONTS).length - SHOP_FONT_QUICK.length} more, each in your name`}</span></span><ChevronRight9 size={16} color={T.inkFaint} /></button></>)}

  {section("What you sell", Store3, <>{
    /* ── THE SHOP'S CATEGORY ──────────────────────────────────────────
       One of fourteen, so "Food & Chai" on Pay & Services gathers every
       chai stall however each one spells chai. Optional: a shop with no
       category is still found by name and Near me. */
  }<BazaarCategoryPicker value={category} onChange={setCategory} /><div style={{
    display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}`
  }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>
        Show my shop in Gloobal बाज़ार
      </span><span style={{ display: "block", fontSize: 11.5, lineHeight: 1.45, color: T.inkFaint, marginTop: 2 }}>{listed
    ? "People can find you by name, in your category, and in Near me if your address is public."
    : "You won't appear in search or Near me. People can still pay you by your exact name or your code."}</span></span><ProfileToggle
    on={listed}
    onToggle={() => setListed((v) => !v)}
    label="Show my shop in Gloobal बाज़ार"
  /></div></>)}

  {section("Address", MapPin5, <>{
    /* ── THE ADDRESS ──────────────────────────────────────────────────
       Private unless its owner says otherwise, and the switch says who
       will see it rather than naming a setting. The app cannot tell a
       shop's address from the kitchen somebody cooks in, and the cost of
       guessing wrong falls entirely on the person who typed it. */
  }<CreatorAddressFields value={addressParts} onChange={setAddressParts} countryIso={countryIso} /><div style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTop: `1px solid ${T.line}`
  }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>
        Show this to people who pay me
      </span><span style={{ display: "block", fontSize: 11.5, lineHeight: 1.45, color: T.inkFaint, marginTop: 2 }}>{addressPublic
    ? "Anybody who opens your creator page sees this address and gets Directions to your pin."
    : "Only you can see this. Nobody paying you will."}</span></span><ProfileToggle
    on={addressPublic}
    onToggle={() => setAddressPublic((v) => !v)}
    label="Show my address to people who pay me"
  /></div></>)}

  {section("A message on your code", ShieldCheck2, <>{
    /* ── WHAT YOUR CODE SAYS ──────────────────────────────────────────
       One short line under the Pay button on the card somebody gets
       from scanning. "Cash only after 9pm", "Order number on the slip
       please" — the things a counter says out loud, said by the code.

       Capped at 120 characters by the server and by this box. A payer
       is not reading a notice board with their thumb over Pay, and a
       long message would push that button off a small screen. */
  }<textarea
    id="creator-scan-note"
    value={scanNote}
    onChange={(e) => setScanNote(e.target.value.slice(0, 120))}
    placeholder="Cash only after 9pm. Optional."
    aria-label="A message for people who scan your code"
    rows={2}
    style={fieldBox}
  /><div style={{
    fontSize: 11.5, lineHeight: 1.45, color: T.inkFaint, margin: "6px 2px 0"
  }}>{
    /* Said plainly, because a creator deciding what to write needs to
       know who reads it and when. "Everybody" is the honest answer and
       it is not the same answer the address field gives. */
  }Anybody who scans your code sees this, right under the Pay button.</div>{
    /* ── HOW IT HANGS ─────────────────────────────────────────────────
       Eight shapes, each drawn by the real strip under a miniature of
       the card a scanner gets — in this account's own colour, with the
       message as typed — so what is tapped here is what is seen there. */
  }<div style={{
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase",
    letterSpacing: 0.5, margin: "16px 2px 8px"
  }}>How it looks</div><ScanNoteStylePicker
    value={scanNoteStyle}
    onChange={setScanNoteStyle}
    text={scanNote}
    seed={myGloobalId}
  /></>, <span style={{
    fontSize: 11, fontWeight: 700, color: scanNote.length > 104 ? T.negative : T.inkFaint, fontVariantNumeric: "tabular-nums"
  }}>{`${scanNote.length}/120`}</span>)}

  {error && <div
    role="alert"
    style={{
      marginTop: 16,
      fontSize: 12.5,
      fontWeight: 700,
      color: "#fff",
      background: T.negative,
      borderRadius: 12,
      padding: "9px 13px",
      textAlign: "center",
      lineHeight: 1.45
    }}
  >{error}</div>}<p style={{
    fontSize: 11.5,
    lineHeight: 1.5,
    color: T.inkFaint,
    textAlign: "center",
    margin: "16px 8px 0"
  }}>
      Until you set this up, people can still pay your creator side at your Gloobal ID.
    </p></div>{
    /* ── THE SAVE BAR ─────────────────────────────────────────────────
       Pinned under the scroll rather than at the end of it, so the one
       thing this screen wants done is always a thumb away however far
       down the message picker somebody has gone. Hidden while Gloobal's
       own keyboard is up, which needs that space.

       "Later" is plain text beside it, not a second button of equal
       weight: two equal buttons is a question, and this is not one. The
       founder chose a skippable screen; skipping is RECORDED
       (creatorProfile.setupSkippedAt), so the Creator dashboard can keep
       offering it without putting the whole screen back in the way. */
  }{kbField ? null : <div style={{
    flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
    padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
    background: T.surface, borderTop: `1px solid ${T.line}`
  }}><button
    onClick={onSkip}
    className="v2-tap"
    style={{
      border: "none",
      background: "none",
      padding: "12px 10px",
      fontSize: 13,
      fontWeight: 700,
      color: T.inkSoft,
      cursor: "pointer",
      flexShrink: 0
    }}
  >Set this up later</button><button
    onClick={() => onSave({
      handleFirst: first.trim(),
      handleLast: last.trim(),
      addressParts,
      category,
      listed,
      addressPublic,
      scanNote: scanNote.trim(),
      scanNoteStyle,
      font,
      logo: logo || undefined
    })}
    disabled={!canSave}
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 999,
      padding: "15px 18px",
      background: canSave ? T.gradButton : T.surfaceAlt,
      color: canSave ? "#fff" : T.inkFaint,
      fontSize: 15,
      fontWeight: 800,
      cursor: canSave ? "pointer" : "default",
      boxShadow: canSave ? "0 8px 20px rgba(124,58,237,0.28)" : "none"
    }}
  >{saving ? "Saving…" : "Save my creator name"}</button></div>}{
    /* ── MORE FONTS ───────────────────────────────────────────────────
       Every face, each drawn in the person's own name, the same way the
       three suggestions are. Tapping one picks it and closes the sheet. */
  }{fontsOpen ? <div
    onClick={() => setFontsOpen(false)}
    style={{
      position: "absolute", inset: 0, zIndex: 5, background: "rgba(21,19,42,0.38)",
      display: "flex", alignItems: "flex-end"
    }}
  ><div
    role="dialog"
    aria-label="All fonts"
    onClick={(e) => e.stopPropagation()}
    style={{
      width: "100%", background: T.bg, borderRadius: "24px 24px 0 0", maxHeight: "82%", overflowY: "auto",
      padding: "14px 16px calc(20px + env(safe-area-inset-bottom, 0px))"
    }}
  ><div style={{ width: 38, height: 4, borderRadius: 2, background: T.line, margin: "0 auto 12px" }} /><div style={{
    display: "flex", alignItems: "center", gap: 10, marginBottom: 12
  }}><span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Fonts</span><button
    onClick={() => setFontsOpen(false)}
    aria-label="Close fonts"
    style={{
      width: 34, height: 34, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
    }}
  ><X12 size={16} color={T.ink} /></button></div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{Object.keys(SHOP_FONTS).map((key) => {
    const f = SHOP_FONTS[key];
    const on = font === key;
    const quick = SHOP_FONT_QUICK.find((q) => q.key === key);
    return <button
      key={key}
      onClick={() => { setFont(key); setFontsOpen(false); }}
      aria-pressed={on}
      className="v2-tap"
      style={{
        display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
        background: T.surface, borderRadius: 16, padding: "12px 14px", border: "none", cursor: "pointer",
        fontFamily: "inherit", boxShadow: on ? `inset 0 0 0 2px ${T.accent}` : T.shadowCard
      }}
    ><span style={{ flex: 1, minWidth: 0 }}><span style={{
      display: "block", fontSize: 20, lineHeight: 1.35, color: T.ink, fontFamily: f.stack, fontWeight: f.weight,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{enough ? shownName : "रसोई Ghar"}</span><span style={{
      display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 2
    }}>{f.name} · {quick ? quick.label : f.note}</span></span>{on ? <Check9 size={16} color={T.accent} /> : null}</button>;
  })}</div></div></div> : null}<CreatorNameKeyboard
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
function CreatorProfilePanel({ creator, myGloobalId, onLoad, onEdit, onOpenPage, onShowQr, onOpenLedger, onToast }) {
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

  // ── THE FLOATING MAP BUTTON STANDS ASIDE ──────────────────────────────
  //
  // Fixed at z-index 10000, 62% down the right-hand edge — which on this
  // screen is the violet card's pencil. The founder's screenshot has the
  // map disc sitting half over the edit button. Same event the setup
  // screen and the keyboard fire; a profile with four buttons on one card
  // is not a screen that wants a fifth floating on top of them.
  useEffect50(() => {
    if (typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);

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
  }}>{done ? creatorDisplayName(creator) : "No creator name yet"}</span></span><button
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
    ? "People pay you at your digital address below"
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
  }}>{
    /* ── THE DIGITAL ADDRESS, WHICH IS ALSO THE DOOR ──────────────────
       The handle used to be the big title on the card above. It is an
       ADDRESS — lower-cased, dotted, unique, the string somebody types
       to send money — and the card above now carries the name people
       say instead. One screen, two forms, each where it belongs.

       It is a BUTTON rather than a line of text, because what sits
       behind an address is the thing it addresses: the page, and the
       list people buy from. That also retires the separate "Your page
       and what you sell" row this panel carried underneath — two doors
       to one room, which is the same objection that kept the mockup's
       second map icon out. */
  }{done ? <button
    onClick={onOpenPage}
    aria-label={`Open your page, ${handle}`}
    className="v2-row"
    style={{
      display: "flex", alignItems: "center", gap: 13, width: "100%",
      padding: "13px 15px", border: "none", background: "none",
      cursor: "pointer", textAlign: "left", fontFamily: "inherit"
    }}
  ><Store3 size={18} color={T.accent} style={{ flexShrink: 0 }} /><span style={{
    flex: 1, minWidth: 0
  }}><span style={{
    display: "block", fontSize: 14, fontWeight: 800, color: T.accent, overflowWrap: "anywhere"
  }}>{handle}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint, marginTop: 2
  }}>{
    /* Two lines deep on a 390px phone when it read "your page and what
       you sell", which pushed the row taller than every other one in
       the card. Shorter, and the store mark plus the chevron carry the
       rest of the sentence. */
  }Your digital address &middot; opens your page</span></span><ChevronRight9
    size={17} color={T.accent} style={{ flexShrink: 0 }}
  /></button> : null}{
    /* The ledger sits with the address rather than on the page behind
       it: what came in and what went out is a fact about the BUSINESS,
       not part of the shopfront customers see. */
  }{done ? <button
    onClick={onOpenLedger}
    aria-label="Your sales and purchases"
    className="v2-row"
    style={{
      display: "flex", alignItems: "center", gap: 13, width: "100%",
      padding: "13px 15px", border: "none", background: "none",
      borderTop: `1px solid ${T.line}`,
      cursor: "pointer", textAlign: "left", fontFamily: "inherit"
    }}
  ><ArrowLeftRight size={18} color={T.accent} style={{ flexShrink: 0 }} /><span style={{
    flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.ink
  }}>Sales &amp; purchases</span><ChevronRight9
    size={17} color={T.inkFaint} style={{ flexShrink: 0 }}
  /></button> : null}{fact(
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
    // Only the top row of the card goes without a divider, and the two
    // buttons above now hold that place whenever there is a handle.
    !done
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
    /* The door into the page used to be a card of its own down here. It
       is the address row above now — an address and the place it
       addresses are one thing, and two rows for them was two doors to
       one room. */
  }{done ? null : <button
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
