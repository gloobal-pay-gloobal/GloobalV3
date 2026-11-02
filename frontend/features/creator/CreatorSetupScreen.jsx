// src/features/creator/CreatorSetupScreen.jsx
import { useState as useState53, useEffect as useEffect50, useRef as useRef30 } from "react";
import { Camera as Camera6, Check as Check9, X as X12, MapPin as MapPin5, Loader as Loader5, Pencil as Pencil4, QrCode as QrCode2, Share2 as Share26, Copy as Copy5, Eye as Eye3, EyeOff as EyeOff4, Store as Store3, ShieldCheck as ShieldCheck2, ChevronRight as ChevronRight9, Contact as Contact4, ArrowLeftRight, Volume2 as VolumeOn1, VolumeX as VolumeOff1, Palette as PaletteSu, Percent as PercentSu, Sparkles as SparklesSu, MessageCircle as MessageSu, Phone as PhoneSu, Instagram as InstagramSu, Plus as PlusSu, Clock as ClockSu } from "lucide-react";

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

// ── SETUP AS FIVE SHORT STEPS (0199) ────────────────────────────────────
//
// This was one long form under the title "Your creator name": name, font,
// what you sell, Bazaar, hours, about and contacts, address, and the
// message on the code, all in one scroll with one Save at the bottom. The
// founder asked for it reworked as a flow, and chose from the drawings:
//
//   * the first flip opens on GLOOBAL बाज़ार — real shops from around the
//     world and a Join button (ShopSetupSplash, shopSetupSplash.jsx);
//   * five steps — Name & logo (About folded in), What you sell, Where &
//     when, Look, Creator Share — each with Skip except the name;
//   * the shop's own card on top of every step, filling in as it goes;
//   * Creator Share from 0% to 7%, the range the server already allows;
//   * a "Your shop is open" screen, and later an Edit list (the hub) that
//     opens any one step on its own instead of the long form.
//
// Every step SAVES as it is left, through onSaveStep, so a person who stops
// after step two has a shop with a name and a category rather than nothing.
// The name step is the one that reserves the handle, and the only one that
// cannot be skipped: until it exists the Creator side cannot take money.
var CREATOR_SETUP_STEPS = [
  { key: "name", title: "Your shop name", row: "Name & logo" },
  { key: "sell", title: "What you sell", row: "What you sell" },
  { key: "where", title: "Where & when", row: "Where & when" },
  { key: "look", title: "How it looks", row: "Look & QR message" },
  { key: "share", title: "Creator Share", row: "Creator Share" }
];

// The ready looks offered in setup. Each sets every dial at once, the same
// way the Look screen's Style does; the full set stays on that screen.
var CREATOR_SETUP_LOOKS = ["chai", "mithai", "kirana", "pharmacy", "dhaba", "boutique"];

// Creator Share's quick picks. Whole numbers to tap, and a slider beside
// them for anything in between, to 0.01 — what My Share has always taken.
var CREATOR_SHARE_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];

// Opening hours as three presets instead of a week grid; "Set my own" still
// opens the grid. Built in the person's own zone so "7am" is their 7am.
function creatorHoursPreset(key) {
  let tz = "UTC";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { /* UTC */ }
  const day = (open, close, closed = false) => ({ open, close, closed });
  if (key === "daily") return { tz, days: OPEN_HOURS_DAYS.map(() => day("07:00", "22:00")) };
  if (key === "weekdays") return { tz, days: OPEN_HOURS_DAYS.map((d) => (d === "Sun" ? day("09:00", "21:00", true) : day("09:00", "21:00"))) };
  return null;
}
function creatorHoursWhich(hours) {
  if (!hours || !Array.isArray(hours.days) || hours.days.length !== 7) return "none";
  const sig = (h) => JSON.stringify(h.days.map((d) => [d.open, d.close, Boolean(d.closed)]));
  if (sig(hours) === sig(creatorHoursPreset("daily"))) return "daily";
  if (sig(hours) === sig(creatorHoursPreset("weekdays"))) return "weekdays";
  return "own";
}

// The card at the top of every step: the shop as it will look, in its own
// colour, cover and font, with whatever this step has filled in.
function CreatorSetupCard({ look, name, tagline, logo, chips = [], badge = "", onLogo, big = false, dim = false }) {
  const cover = look.coverStyle === "pattern" ? shopPatternCss(look.pattern, look.color, look.dark)
    : `linear-gradient(140deg, ${look.hero.from} 0%, ${look.hero.to} 100%)`;
  const mark = big ? 70 : 58;
  const markBox = {
    position: "relative", flexShrink: 0, width: mark, height: mark, borderRadius: big ? 20 : 16, padding: 0, marginTop: -(mark / 2) - 4,
    border: logo ? "3px solid #fff" : `1.5px dashed ${look.hero.from}`, background: logo ? "#fff" : T.surface,
    boxShadow: "0 4px 12px rgba(0,0,0,.16)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible"
  };
  const markInner = logo
    ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: big ? 17 : 13 }} />
    : <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><Camera6 size={17} color={look.hero.from} /><span style={{ fontSize: 9.5, fontWeight: 800, color: look.hero.from }}>Logo</span></span>;
  return <div data-creator-live-card="" style={{
    position: "relative", overflow: "hidden", borderRadius: big ? 24 : 20, color: "#fff", flexShrink: 0,
    background: `linear-gradient(140deg, ${look.hero.from} 0%, ${look.hero.to} 100%)`, boxShadow: `0 12px 26px ${look.hero.glow}`
  }}><div aria-hidden="true" style={{ height: big ? 72 : 50, background: cover }} />{badge ? <span style={{
    position: "absolute", right: 10, top: 9, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
    background: "rgba(15,20,30,.55)", borderRadius: 999, padding: "3px 8px"
  }}>{badge}</span> : null}<div style={{ display: "flex", gap: 12, padding: big ? "0 16px 16px" : "0 14px 13px", alignItems: big ? "flex-start" : "center", flexDirection: big ? "column" : "row" }}>{onLogo ? <button
    type="button"
    onClick={onLogo}
    aria-label={logo ? "Change your creator logo" : "Add your creator logo"}
    className="v2-tap"
    style={{ ...markBox, cursor: "pointer" }}
  >{markInner}<span aria-hidden="true" style={{
    position: "absolute", right: -7, bottom: -7, width: 24, height: 24, borderRadius: "50%", background: T.surface,
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center"
  }}><Camera6 size={12} color={look.hero.from} /></span></button> : <span style={markBox}>{markInner}</span>}<span style={{ flex: 1, minWidth: 0, paddingTop: big ? 0 : 8 }}><span style={{
    display: "block", fontSize: big ? 28 : 23, lineHeight: 1.12, color: "#fff", overflowWrap: "anywhere",
    fontFamily: look.font.stack, fontWeight: look.font.weight, opacity: dim ? 0.6 : 1
  }}>{name}</span>{tagline ? <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, opacity: 0.88, marginTop: 3 }}>{tagline}</span> : null}{chips.length ? <span style={{
    display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7
  }}>{chips.map((c) => <span key={c.text} style={{
    fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "3px 8px",
    background: c.good ? "#DCFCE7" : "rgba(255,255,255,0.18)", color: c.good ? "#166534" : "#fff"
  }}>{c.text}</span>)}</span> : null}</span></div></div>;
}

function CreatorSetupScreen({
  myGloobalId,
  creator,
  onSave,
  onSaveStep,
  onSaveShare,
  onSkip,
  onClose,
  onOpenPage,
  onShowQr,
  onEditLook,
  onToast,
  startStep = "name",
  shareRate = 1,
  ccyCode = "",
  mobileNumber = "",
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
  // The one line under the name, the same field Look's Tagline sets.
  const [tagline, setTagline] = useState53((creator && creator.shop && creator.shop.tagline) || "");
  // What kind of shop, for Gloobal बाज़ार's categories, and whether to be
  // listed there at all. Listed is ON unless the creator turned it off.
  const [category, setCategoryRaw] = useState53((creator && creator.category) || "");
  // The narrower kind and an optional second category (0141).
  const [subcategory, setSubcategory] = useState53((creator && creator.subcategory) || "");
  const [category2, setCategory2] = useState53((creator && creator.category2) || "");
  // 0185: picking Other asks what they make, in two words.
  const [otherWords, setOtherWords] = useState53((creator && creator.otherWords) || "");
  const setCategory = (c) => {
    setCategoryRaw(c);
    setSubcategory("");
    if (c && c === category2) setCategory2("");
  };
  const [listed, setListed] = useState53(!(creator && creator.listed === false));
  // Null until the creator turns hours on; see openHoursEditor.jsx.
  const [hours, setHours] = useState53((creator && creator.hours) || null);
  const [ownHours, setOwnHours] = useState53(() => creatorHoursWhich((creator && creator.hours) || null) === "own");
  // A few lines about the shop, and how to reach it. All optional.
  const [about, setAbout] = useState53((creator && creator.about) || "");
  const [aboutOpen, setAboutOpen] = useState53(Boolean(creator && creator.about));
  const [contacts, setContacts] = useState53(() => Object.assign({ whatsapp: "", phone: "", instagram: "" }, (creator && creator.contacts) || {}));
  // Which of the three buttons are switched on. Kept apart from the text so
  // switching one off and on again does not lose what was typed.
  const [reachOn, setReachOn] = useState53(() => ({
    whatsapp: Boolean(contacts.whatsapp), phone: Boolean(contacts.phone), instagram: Boolean(contacts.instagram)
  }));
  // The ready look picked in step four, if any.
  const [lookKey, setLookKey] = useState53((creator && creator.shop && creator.shop.theme) || "");
  // Creator Share, as a percentage.
  const [rate, setRate] = useState53(() => Math.min(7, Math.max(0, Number(shareRate) || 0)));
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

  // Where in the flow. "hub" is the Edit list; `single` means one step was
  // opened from it and Save goes back there rather than on.
  const hubMode = startStep === "hub";
  const [step, setStep] = useState53(startStep);
  const [cameFromSplash, setCameFromSplash] = useState53(startStep === "splash");
  const [busy, setBusy] = useState53(false);
  const [stepError, setStepError] = useState53("");
  const [savedAs, setSavedAs] = useState53(() => ({
    handle: (creator && creator.handle) || "",
    first: (creator && creator.handleFirst) || "",
    last: (creator && creator.handleLast) || "",
    logo: (creator && creator.logo) || null
  }));

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
  // Other needs its two words: a shop that is only "Other" cannot be
  // found by what it makes. The server holds the same rule.
  const otherReady = category !== "other" || (Boolean(otherWords.trim()) && !bazaarOtherWordsProblem(otherWords));
  const canSave = enough && !saving && !busy && !refused;
  const nameKept = savedAs.handle && first.trim() === savedAs.first && last.trim() === savedAs.last;

  const pickLogo = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      // Cropped to a square first (photoCropper.jsx); Cancel keeps the old
      // logo. Then the same resizer the profile photo uses, so a 4MB
      // camera shot becomes something the 200 KB cap will take.
      const cropped = await requestPhotoCrop(reader.result, "square");
      if (!cropped) return;
      setLogo(await fitProfilePhotoForUpload(cropped));
    };
    reader.readAsDataURL(file);
  };

  const preview = twoParts
    ? `${first.trim().toLowerCase()}.${last.trim().toLowerCase()}`
    : (first.trim().toLowerCase() || "your name");

  // The card is painted from the same resolver the shop page uses, so the
  // setup screen and the page it sets up look like one thing. A look picked
  // in step four shows here at once, in the font chosen in step one.
  const lookBase = lookKey && SHOP_THEMES[lookKey] ? creatorSetupLookDials(lookKey) : ((creator && creator.shop) || {});
  const look = resolveShopTheme(Object.assign({}, (creator && creator.shop) || {}, lookBase, { font }));
  const fontFace = SHOP_FONTS[font] || SHOP_FONTS.grotesk;
  const shownName = enough ? (twoParts ? `${first.trim()} ${last.trim()}` : first.trim()) : "Your shop";
  const quickKeys = SHOP_FONT_QUICK.map((q) => q.key);
  const moreName = quickKeys.indexOf(font) < 0 ? fontFace.name : "";
  const ccy = String(ccyCode || "").toUpperCase();

  // What the card says under the name, step by step.
  const catInfo = (BAZAAR_CATEGORY_INFO || []).find((c) => c.key === category);
  const subInfo = category ? ((BAZAAR_SUBCATEGORY_INFO[category] || []).find((s) => s[0] === subcategory)) : null;
  const status = openHoursStatus(hours, new Date());
  const cardChips = (k) => {
    if (k === "sell") return [catInfo ? { text: catInfo.label } : null, subInfo ? { text: subInfo[1] } : null].filter(Boolean);
    if (k === "where") {
      const city = (addressParts && (addressParts.city || addressParts.area)) || "";
      return [status.known ? { text: status.open ? "Open now" : "Closed now", good: status.open } : null, city && addressPublic ? { text: city } : null].filter(Boolean);
    }
    if (k === "share") return rate > 0 ? [{ text: `${creatorShareText(rate)}% back`, good: true }] : [];
    if (k === "done" || k === "hub") {
      return [
        status.known ? { text: status.open ? "Open now" : "Closed now", good: status.open } : null,
        rate > 0 ? { text: `${creatorShareText(rate)}% back`, good: true } : null,
        subInfo ? { text: subInfo[1] } : (catInfo ? { text: catInfo.label } : null)
      ].filter(Boolean);
    }
    return [];
  };

  // A white section card, one shape for every group on every step.
  const section = (title, Icon, children, aside) => <section style={{
    background: T.surface, borderRadius: 20, padding: "14px 14px 16px", marginTop: 12,
    boxShadow: `0 1px 2px rgba(${T.inkRgb},0.04), 0 6px 18px rgba(${T.inkRgb},0.05)`
  }}>{title ? <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>{Icon ? <span style={{
    width: 22, height: 22, borderRadius: 7, background: T.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
  }}><Icon size={12} color={T.accent} /></span> : null}<span style={{
    flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>{title}</span>{aside || null}</div> : null}{children}</section>;

  const fieldBox = {
    width: "100%", border: `1.5px solid ${T.line}`, borderRadius: 14, background: T.bg,
    padding: "12px 14px", fontSize: 14, lineHeight: 1.5, color: T.ink, fontFamily: "inherit",
    outline: "none", resize: "none", boxSizing: "border-box"
  };
  const small = (text) => <div style={{
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 2px 7px"
  }}>{text}</div>;
  const switchRow = (title, sub, on, onToggle, label) => <div style={{
    display: "flex", alignItems: "center", gap: 12, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${T.line}`
  }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>{title}</span><span style={{
    display: "block", fontSize: 11.5, lineHeight: 1.45, color: T.inkFaint, marginTop: 2
  }}>{sub}</span></span><ProfileToggle on={on} onToggle={onToggle} label={label} /></div>;
  const pick = (on) => ({
    border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 13,
    background: on ? T.accentSoft : T.bg, color: on ? T.accent : T.inkSoft,
    boxShadow: on ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}`
  });

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
        flex: 1, minWidth: 0, border: "none", cursor: "pointer", borderRadius: 13, padding: "8px 6px 7px",
        background: on ? T.accentSoft : T.bg,
        boxShadow: on ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative"
      }}
    >{on ? <span aria-hidden="true" style={{
      position: "absolute", top: 5, right: 5, width: 14, height: 14, borderRadius: "50%", background: T.accent,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}><Check9 size={9} color="#fff" strokeWidth={3} /></span> : null}<span style={{
      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      fontSize: 15, lineHeight: 1.35, color: T.ink, fontFamily: f.stack, fontWeight: f.weight
    }}>{enough ? first.trim() : "रसोई"}</span><span style={{
      fontSize: 10.5, fontWeight: 700, color: on ? T.accent : T.inkSoft
    }}>{label}</span></button>;
  };

  // ── SAVING A STEP ────────────────────────────────────────────────────
  //
  // Each step sends only its own fields. The handle is sent only when it
  // changed, so going back to fix a tagline does not re-run the name rules
  // (or re-stamp completedAt) for a name nobody touched.
  const stepPatch = (k) => {
    if (k === "name") {
      const patch = { about: about.trim() };
      if (!nameKept) Object.assign(patch, { handleFirst: first.trim(), handleLast: last.trim() });
      if (logo && logo !== savedAs.logo) patch.logo = logo;
      return { patch, shop: { font, tagline: tagline.trim() } };
    }
    if (k === "sell") {
      return {
        patch: {
          category,
          subcategory: category ? subcategory : "",
          category2: category2 && category2 !== category ? category2 : "",
          listed,
          ...(category === "other" ? { otherWords: otherWords.trim() } : {})
        }
      };
    }
    if (k === "where") {
      const shown = {};
      for (const key of ["whatsapp", "phone", "instagram"]) shown[key] = reachOn[key] ? String(contacts[key] || "").trim() : "";
      return { patch: { addressParts, addressPublic, hours, contacts: shown } };
    }
    if (k === "look") {
      return {
        patch: { scanNote: scanNote.trim(), scanNoteStyle },
        shop: lookKey && SHOP_THEMES[lookKey] ? Object.assign(creatorSetupLookDials(lookKey), { font }) : null
      };
    }
    return null;
  };

  const order = CREATOR_SETUP_STEPS.map((s) => s.key);
  const nextOf = (k) => (order.indexOf(k) >= 0 && order.indexOf(k) < order.length - 1 ? order[order.indexOf(k) + 1] : "done");
  const prevOf = (k) => (order.indexOf(k) > 0 ? order[order.indexOf(k) - 1] : (cameFromSplash ? "splash" : null));

  const commit = async (k) => {
    setStepError("");
    if (k === "share") {
      const had = Math.round((Number(shareRate) || 0) * 100);
      if (Math.round(rate * 100) === had) return true;
      if (!onSaveShare) return true;
      const ok = await onSaveShare(rate);
      if (!ok) setStepError("Creator Share was not changed. You can set it again from your shop.");
      return Boolean(ok);
    }
    const body = stepPatch(k);
    if (!body || !onSaveStep) return true;
    const answer = await onSaveStep(body.patch, body.shop);
    if (!answer || !answer.ok) {
      setStepError((answer && answer.message) || "Could not save that right now.");
      return false;
    }
    if (k === "name") setSavedAs({ handle: (answer.creator && answer.creator.handle) || preview, first: first.trim(), last: last.trim(), logo });
    return true;
  };
  const go = async () => {
    if (busy) return;
    if (step === "name" && !canSave) return;
    if (step === "sell" && !otherReady) return;
    setBusy(true);
    const ok = await commit(step);
    setBusy(false);
    if (!ok) return;
    if (hubMode) { setStep("hub"); return; }
    setStep(nextOf(step));
  };
  const back = () => {
    setStepError("");
    if (hubMode && step !== "hub") { setStep("hub"); return; }
    if (step === "hub" || step === "done") { onClose && onClose(); return; }
    const prev = prevOf(step);
    if (prev) { setStep(prev); return; }
    // The name step with nothing behind it. Leaving here before the name
    // exists is the old "Later"; after, it just closes.
    if (savedAs.handle) onClose && onClose(); else onSkip && onSkip();
  };

  // ── THE SPLASH ──────────────────────────────────────────────────────
  if (step === "splash") {
    return <ShopSetupSplash
      onJoin={() => { setCameFromSplash(true); setStep("name"); }}
      onLater={onSkip}
    />;
  }

  const stepIndex = order.indexOf(step);
  const stepInfo = CREATOR_SETUP_STEPS[stepIndex] || null;
  const isStep = stepIndex >= 0;
  const ctaLabel = step === "name"
    ? (hubMode ? "Save" : "Save name & next")
    : hubMode ? "Save" : step === "share" ? "Open my shop" : "Next";
  const ctaOn = step === "name" ? canSave : step === "sell" ? otherReady && !busy : !busy;
  const shareSplit = (n) => <GeuTwin amount={n} currency={ccy} own={ccy} />;

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
    padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 8px",
    flexShrink: 0
  }}><NavBackButton onClick={back} /><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>{step === "hub" ? "Edit your shop" : step === "done" ? "" : stepInfo ? stepInfo.title : ""}</span>{isStep && !hubMode ? <span style={{
    display: "block", fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginTop: 1
  }}>{`Step ${stepIndex + 1} of ${order.length}`}</span> : step === "hub" ? <span style={{
    display: "block", fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginTop: 1
  }}>Changes show to customers once saved</span> : null}</span>{isStep && !hubMode && step !== "name" ? <button
    type="button"
    data-testid="creator-setup-skip"
    onClick={() => { setStepError(""); setStep(nextOf(step)); }}
    style={{ border: "none", background: "none", color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: "8px 4px" }}
  >Skip</button> : null}</div>{isStep && !hubMode ? <div aria-hidden="true" style={{
    display: "flex", gap: 5, padding: "0 16px 8px", flexShrink: 0
  }}>{order.map((k, i) => <span key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= stepIndex ? T.accent : T.line }} />)}</div> : null}<div
    data-creator-setup-step={step}
    style={{
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      // Room for the board, so the availability line under the name boxes
      // — the one that says whether the name is yours — is not the first
      // thing it covers.
      padding: kbField ? "6px 16px 58vh" : "6px 16px 24px"
    }}
  >{step === "done" ? <div style={{ textAlign: "center", margin: "4px 0 14px" }}><div style={{
    fontSize: 23, fontWeight: 800, color: T.ink, fontFamily: look.font.stack, lineHeight: 1.2
  }}>{`${shownName} is open`}</div><div style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600, marginTop: 6 }}>People can pay you at <b style={{ color: T.ink }}>{savedAs.handle || preview}</b> from now.</div></div> : null}<CreatorSetupCard
    look={look}
    name={shownName}
    tagline={tagline.trim()}
    logo={logo}
    dim={!enough}
    big={step === "done"}
    badge={step === "name" ? "Live preview" : ""}
    chips={cardChips(step)}
    onLogo={step === "name" ? () => fileRef.current && fileRef.current.click() : null}
  /><input
    ref={fileRef}
    type="file"
    accept="image/*"
    onChange={pickLogo}
    style={{ display: "none" }}
  />{

  /* ── 1. NAME & LOGO ───────────────────────────────────────────────── */
  step === "name" ? <>{section("", null, <>{
    /* Still two parts with the dot drawn BETWEEN them rather than typed —
       it cannot be deleted, doubled or misplaced — in one joined field,
       with the keyboard button at its edge, so it reads as one name in two
       halves rather than two separate questions. */
  }<div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 2px 7px" }}>Shop name</div><div style={{
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
  }}>{nameKept ? <><Check9 size={13} color={T.positive} /><span style={{ color: T.positive }}>{savedAs.handle} is yours</span></> : <>{availability.status === "checking" && <><Loader5 size={13} color={T.inkFaint} /><span style={{ color: T.inkFaint }}>Checking…</span></>}{availability.status === "free" && <><Check9 size={13} color={T.positive} /><span style={{ color: T.positive }}>{availability.handle} is yours</span></>}{refused && <><X12 size={13} color={T.negative} /><span style={{ color: T.negative }}>{availability.message || "That name is taken."}</span></>}{(availability.status === "idle" || availability.status === "unknown") && <span style={{ color: T.inkFaint, fontWeight: 600 }}>
        {enough ? preview : "A first part is needed. The second is optional."}
      </span>}</>}</div>{small(<>One line under your name <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: T.inkFaint }}>(optional)</span></>)}<input
    id="creator-tagline"
    value={tagline}
    maxLength={60}
    autoComplete="off"
    placeholder="Chai since 2015"
    onChange={(e) => setTagline(e.target.value.slice(0, 60))}
    style={{ ...fieldBox, padding: "11px 14px" }}
  />{aboutOpen ? <>{small(<>About your shop <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: T.inkFaint }}>(optional)</span></>)}<textarea
    id="creator-about"
    value={about}
    onChange={(e) => setAbout(e.target.value.slice(0, 280))}
    placeholder="Fresh chai and snacks since 2015. Orders for parties too."
    aria-label="About your shop"
    rows={3}
    style={fieldBox}
  /><div style={{ textAlign: "right", fontSize: 10.5, color: T.inkFaint, fontWeight: 700, margin: "4px 2px 0" }}>{about.length}/280</div></> : <button
    type="button"
    data-testid="creator-about-open"
    onClick={() => setAboutOpen(true)}
    style={{ display: "flex", alignItems: "center", gap: 7, border: "none", background: "none", padding: "12px 2px 2px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: T.accent }}
  ><PlusSu size={15} />A few lines about your shop</button>}{
    /* ── HOW THE NAME IS WRITTEN ──────────────────────────────────────
       Three suggestions drawn in the person's own name — Clean, Classic,
       Bold — and every other face behind More fonts. All of them carry
       Hindi AND English in one design, so both halves of a name like
       रसोई Ghar come out in the same hand. */
  }{small("Font")}<div style={{ display: "flex", gap: 8 }}>{SHOP_FONT_QUICK.map((q) => fontTile(q.key, q.label))}</div><button
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
  }}>{moreName ? `Using ${moreName}` : `${Object.keys(SHOP_FONTS).length - SHOP_FONT_QUICK.length} more, each in your name`}</span></span><ChevronRight9 size={16} color={T.inkFaint} /></button></>)}</> : null}{

  /* ── 2. WHAT YOU SELL ─────────────────────────────────────────────── */
  step === "sell" ? <>{section("", null, <>{
    /* One of fourteen, so "Food & Chai" on Pay & Services gathers every
       chai stall however each one spells chai. Optional: a shop with no
       category is still found by name and Near me. */
  }<BazaarCategoryPicker value={category} onChange={setCategory} />{category === "other" ? <div style={{ marginTop: 14 }}><BazaarOtherWordsBox value={otherWords} onChange={setOtherWords} /></div> : null}{category && (BAZAAR_SUBCATEGORY_INFO[category] || []).length ? <div style={{ marginTop: 12 }}>{small("What kind exactly")}<BazaarSubcategoryPicker category={category} value={subcategory} onChange={setSubcategory} /></div> : null}{category ? <div style={{ marginTop: 12 }}>{small(<>Also show me in <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: T.inkFaint }}>(optional)</span></>)}<BazaarAlsoPicker primary={category} value={category2} onChange={setCategory2} /></div> : null}</>)}{section("", null, <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>
        Show my shop in <GloobalWordmark /> बाज़ार
      </span><span style={{ display: "block", fontSize: 11.5, lineHeight: 1.45, color: T.inkFaint, marginTop: 2 }}>{listed
    ? "People can find you by name, in your category, and in Near me if your address is public."
    : "You won't appear in search or Near me. People can still pay you by your exact name or your code."}</span></span><ProfileToggle
    on={listed}
    onToggle={() => setListed((v) => !v)}
    label="Show my shop in GLOOBAL बाज़ार"
  /></div>)}</> : null}{

  /* ── 3. WHERE & WHEN ──────────────────────────────────────────────── */
  step === "where" ? <>{section("Address", MapPin5, <>{
    /* Private unless its owner says otherwise, and the switch says who
       will see it rather than naming a setting. The app cannot tell a
       shop's address from the kitchen somebody cooks in, and the cost of
       guessing wrong falls entirely on the person who typed it. */
  }<CreatorAddressFields value={addressParts} onChange={setAddressParts} countryIso={countryIso} />{switchRow(
    "Show this to people who pay me",
    addressPublic ? "Anybody who opens your creator page sees this address and gets Directions to your pin." : "Only you can see this. Nobody paying you will.",
    addressPublic, () => setAddressPublic((v) => !v), "Show my address to people who pay me"
  )}</>)}{section("Open", ClockSu, <>{
    /* Three presets for what most shops are, and the full grid behind the
       third. "Don't show" is a real answer: a shop with no hours shows no
       Open or Closed line at all, rather than a wrong one. */
  }<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{[
    { key: "daily", title: "Every day", sub: "7am – 10pm" },
    { key: "weekdays", title: "Mon – Sat", sub: "9am – 9pm" },
    { key: "own", title: "Set my own", sub: "day by day" },
    { key: "none", title: "Don't show", sub: "no Open line" }
  ].map((o) => {
    const which = ownHours ? "own" : creatorHoursWhich(hours);
    const on = which === o.key;
    return <button
      key={o.key}
      type="button"
      data-testid={`creator-hours-${o.key}`}
      aria-pressed={on}
      onClick={() => {
        if (o.key === "own") { setOwnHours(true); if (!hours) setHours(creatorHoursPreset("daily")); return; }
        setOwnHours(false);
        setHours(o.key === "none" ? null : creatorHoursPreset(o.key));
      }}
      style={{ ...pick(on), padding: "10px 8px", textAlign: "center" }}
    ><span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{o.title}</span><span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: on ? T.accent : T.inkFaint, marginTop: 1 }}>{o.sub}</span></button>;
  })}</div>{ownHours ? <div style={{ marginTop: 12 }}><OpenHoursEditor value={hours} onChange={setHours} /></div> : null}</>)}{section("Buttons on your page", Contact4, <>{
    /* ── HOW PEOPLE REACH YOU ─────────────────────────────────────────
       All optional and all PUBLIC. WhatsApp and Call start from the
       account's own number, but only once switched on: a number is never
       published because a box happened to be pre-filled. */
  }<div style={{ display: "flex", gap: 8 }}>{[
    { key: "whatsapp", label: "WhatsApp", Icon: MessageSu },
    { key: "phone", label: "Call", Icon: PhoneSu },
    { key: "instagram", label: "Instagram", Icon: InstagramSu }
  ].map(({ key, label, Icon }) => {
    const on = Boolean(reachOn[key]);
    return <button
      key={key}
      type="button"
      data-testid={`creator-contact-${key}-toggle`}
      aria-pressed={on}
      onClick={() => {
        setReachOn((r) => ({ ...r, [key]: !on }));
        if (!on && key !== "instagram" && !String(contacts[key] || "").trim() && mobileNumber) setContacts((c) => ({ ...c, [key]: mobileNumber }));
      }}
      style={{ ...pick(on), flex: 1, padding: "10px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    ><Icon size={17} /><span style={{ fontSize: 11.5, fontWeight: 800 }}>{on ? `${label} ✓` : label}</span></button>;
  })}</div>{[
    { key: "whatsapp", label: "WhatsApp number", placeholder: "+91 98765 43210", mode: "tel" },
    { key: "phone", label: "Phone to call", placeholder: "+91 98765 43210", mode: "tel" },
    { key: "instagram", label: "Instagram", placeholder: "rasoi.ghar", mode: "text" }
  ].filter(({ key }) => Boolean(reachOn[key])).map(({ key, label, placeholder, mode }) => <label key={key} style={{ display: "block", marginTop: 10 }}><span style={{
    display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint, margin: "0 2px 5px"
  }}>{label}</span><input
    id={`creator-contact-${key}`}
    value={contacts[key] || ""}
    inputMode={mode === "tel" ? "tel" : "text"}
    autoComplete="off"
    placeholder={placeholder}
    onChange={(e) => setContacts((c) => ({ ...c, [key]: key === "instagram" ? e.target.value.replace(/^@/, "").slice(0, 30) : e.target.value.slice(0, 20) }))}
    style={{ ...fieldBox, padding: "11px 12px" }}
  /></label>)}<div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.45, margin: "10px 2px 0" }}>Anybody who opens your shop page sees these as buttons. Leave any empty to hide it.</div></>)}</> : null}{

  /* ── 4. LOOK ──────────────────────────────────────────────────────── */
  step === "look" ? <>{section("Pick a look", PaletteSu, <><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>{CREATOR_SETUP_LOOKS.map((key) => {
    const t = SHOP_THEMES[key];
    const l = resolveShopTheme({ theme: key });
    const on = lookKey === key;
    const ground = t.coverStyle === "pattern" ? shopPatternCss(t.pattern, l.color, l.dark) : `linear-gradient(140deg, ${l.hero.from}, ${l.hero.to})`;
    return <button
      key={key}
      type="button"
      data-testid={`creator-look-${key}`}
      aria-pressed={on}
      onClick={() => setLookKey(on ? "" : key)}
      className="v2-tap"
      style={{
        border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, overflow: "hidden", textAlign: "left",
        background: l.dark ? "#1E1814" : T.surface, borderRadius: 13,
        boxShadow: on ? `0 0 0 2.5px ${T.accent}, ${T.shadowCard}` : T.shadowCard
      }}
    ><span style={{ display: "block", height: 42, background: ground, position: "relative" }}><span style={{
      position: "absolute", left: 7, bottom: -8, width: 20, height: 20, borderRadius: 6, background: l.color, border: "2px solid #fff"
    }} />{on ? <span style={{
      position: "absolute", top: 5, right: 5, width: 16, height: 16, borderRadius: "50%", background: T.accent,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}><Check9 size={10} color="#fff" strokeWidth={3} /></span> : null}</span><span style={{
      display: "block", padding: "11px 8px 8px", fontSize: 11.5, fontWeight: 800, color: l.dark ? "#F3EBE1" : T.ink, fontFamily: l.font.stack
    }}>{t.name}</span></button>;
  })}</div><div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.45, margin: "10px 2px 0" }}>Colour, cover and pattern in one tap. Your font from step one stays.</div>{hubMode && onEditLook ? <button
    type="button"
    onClick={onEditLook}
    style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", padding: "10px 2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: T.accent }}
  >Colour, cover and top band<ChevronRight9 size={15} /></button> : null}</>)}{section("A message on your code", ShieldCheck2, <>{
    /* ── WHAT YOUR CODE SAYS ──────────────────────────────────────────
       One short line under the Pay button on the card somebody gets
       from scanning. "Cash only after 9pm", "Order number on the slip
       please" — the things a counter says out loud, said by the code.
       Capped at 120 characters by the server and by this box. */
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
  }}>Anybody who scans your code sees this, right under the Pay button.</div>{scanNote.trim() ? <>{small("How it looks")}<ScanNoteStylePicker
    value={scanNoteStyle}
    onChange={setScanNoteStyle}
    text={scanNote}
    seed={myGloobalId}
  /></> : null}</>, <span style={{
    fontSize: 11, fontWeight: 700, color: scanNote.length > 104 ? T.negative : T.inkFaint, fontVariantNumeric: "tabular-nums"
  }}>{`${scanNote.length}/120`}</span>)}</> : null}{

  /* ── 5. CREATOR SHARE ─────────────────────────────────────────────── */
  step === "share" ? <><div style={{ margin: "16px 2px 4px" }}><div style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.25 }}>Give a little back on every payment?</div><div style={{
    fontSize: 12.5, color: T.inkSoft, fontWeight: 600, lineHeight: 1.45, marginTop: 5
  }}>It goes to the person who paid you, into their My Assets. You can change it any time.</div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 5, marginTop: 12 }}>{CREATOR_SHARE_STEPS.map((n) => {
    const on = Math.abs(rate - n) < 0.005;
    return <button
      key={n}
      type="button"
      data-testid={`creator-share-${n}`}
      aria-pressed={on}
      aria-label={`${n}%`}
      onClick={() => setRate(n)}
      style={{
        border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 12, padding: "10px 0",
        fontSize: 16, fontWeight: 900, background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink,
        boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}`
      }}
    >{n}<span style={{ fontSize: 10.5, opacity: 0.7, marginLeft: 1 }}>%</span></button>;
  })}</div>{section("", null, <><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>Fine-tune</span><span data-testid="creator-share-value" style={{ fontSize: 15, fontWeight: 900, color: T.accent }}>{`${rate.toFixed(2)}%`}</span></div><input
    type="range"
    min={0}
    max={7}
    step={0.01}
    value={rate}
    aria-label="Creator Share"
    onChange={(e) => setRate(Math.min(7, Math.max(0, parseFloat(e.target.value) || 0)))}
    style={{ width: "100%", accentColor: T.accent, margin: "12px 0 4px" }}
  /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontWeight: 800, color: T.inkFaint }}><span>0%</span><span>7%</span></div></>)}{section("", null, <>{
    /* The split of a round 100 in the creator's own currency, both halves
       with their GEU name, so the rate is read as money rather than as a
       percentage sign. */
  }<div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: T.inkFaint }}>When someone pays you {shareSplit(100)}</div><div aria-hidden="true" style={{
    display: "flex", height: 12, borderRadius: 999, overflow: "hidden", margin: "10px 0 8px", background: T.line
  }}><span style={{ width: `${100 - rate}%`, background: T.accent }} /><span style={{ width: `${rate}%`, background: T.positive }} /></div>{[
    { key: "keep", label: "You keep", sub: "", amount: Math.round((100 - rate) * 100) / 100, color: T.accent },
    { key: "back", label: "They get back", sub: "in their My Assets", amount: Math.round(rate * 100) / 100, color: T.positive }
  ].map((r, i) => <div key={r.key} style={{
    display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? `1px solid ${T.line}` : "none"
  }}><span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>{r.label}</span>{r.sub ? <span style={{
    display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 1
  }}>{r.sub}</span> : null}</span><span data-testid={`creator-share-${r.key}`} style={{ fontSize: 14, fontWeight: 800, color: r.key === "back" ? T.positive : T.ink }}>{shareSplit(r.amount)}</span></div>)}</>)}<div style={{
    display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "11px 14px", borderRadius: 16, background: T.accentSoft
  }}><PercentSu size={16} color={T.accent} /><span style={{ fontSize: 12, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>{rate > 0 ? <>Shows as <b>{`${creatorShareText(rate)}% back`}</b> on your card and in बाज़ार's "Who shares".</> : "No share: your shop still takes payments as normal."}</span></div></> : null}{

  /* ── DONE ─────────────────────────────────────────────────────────── */
  step === "done" ? <><div style={{ display: "flex", gap: 8, marginTop: 12 }}>{[
    { key: "share", label: "Share", Icon: Share26, onClick: () => shareCreatorShop(Object.assign({}, creator || {}, { symbolId: (creator && creator.symbolId) || myGloobalId, handle: savedAs.handle, handleFirst: first.trim(), handleLast: last.trim(), shop: { tagline: tagline.trim() } }), onToast) },
    { key: "qr", label: "QR to print", Icon: QrCode2, onClick: () => onShowQr && onShowQr() },
    { key: "page", label: "See my shop", Icon: Store3, onClick: () => onOpenPage && onOpenPage() }
  ].map(({ key, label, Icon, onClick }) => <button
    key={key}
    type="button"
    data-testid={`creator-done-${key}`}
    onClick={onClick}
    className="v2-tap"
    style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 4px", border: "none", borderRadius: 16,
      background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, color: T.ink
    }}
  ><Icon size={18} color={T.accent} />{label}</button>)}</div>{section("Next", null, <button
    type="button"
    onClick={() => onOpenPage && onOpenPage()}
    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
  ><span style={{ width: 24, height: 24, borderRadius: "50%", boxShadow: `inset 0 0 0 2px ${T.line}`, flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: T.ink }}>Add your first things to sell</span><span style={{ fontSize: 12.5, fontWeight: 800, color: T.accent }}>Add</span></button>)}</> : null}{

  /* ── THE EDIT LIST ────────────────────────────────────────────────── */
  step === "hub" ? <div style={{
    marginTop: 12, background: T.surface, borderRadius: 20, overflow: "hidden", boxShadow: T.shadowCard
  }}>{CREATOR_SETUP_STEPS.map((s, i) => {
    const Icon = { name: Pencil4, sell: Store3, where: MapPin5, look: PaletteSu, share: PercentSu }[s.key];
    const line = {
      name: [tagline.trim() || savedAs.handle || preview].filter(Boolean).join(" · "),
      sell: [catInfo && catInfo.label, subInfo && subInfo[1], listed ? "in बाज़ार" : "not listed"].filter(Boolean).join(" · "),
      where: [addressParts && (addressParts.city || addressParts.area), hours ? "hours set" : "no hours", addressPublic ? "address shown" : "address private"].filter(Boolean).join(" · "),
      look: [lookKey && SHOP_THEMES[lookKey] ? SHOP_THEMES[lookKey].name : look.name, scanNote.trim() ? `“${scanNote.trim()}”` : ""].filter(Boolean).join(" · "),
      share: rate > 0 ? `${creatorShareText(rate)}% back on every payment` : "None"
    }[s.key];
    const done = { name: Boolean(savedAs.handle), sell: Boolean(category), where: Boolean(hours || (addressParts && addressParts.city)), look: true, share: true }[s.key];
    return <button
      key={s.key}
      type="button"
      data-testid={`creator-hub-${s.key}`}
      onClick={() => { setStepError(""); setStep(s.key); }}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "13px 14px", border: "none", cursor: "pointer",
        fontFamily: "inherit", textAlign: "left", background: "none", borderTop: i ? `1px solid ${T.line}` : "none"
      }}
    ><span style={{ width: 36, height: 36, borderRadius: 11, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{
      display: "block", fontSize: 14, fontWeight: 800, color: T.ink
    }}>{s.row}</span><span style={{
      display: "block", fontSize: 11.5, color: T.inkSoft, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{line}</span></span>{done ? null : <span style={{
      fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 9px", background: "#FEF3C7", color: "#92400E", flexShrink: 0
    }}>Add</span>}<ChevronRight9 size={16} color={T.inkFaint} /></button>;
  })}</div> : null}{(stepError || error) && <div
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
  >{stepError || error}</div>}{step === "name" && !savedAs.handle ? <p style={{
    fontSize: 11.5,
    lineHeight: 1.5,
    color: T.inkFaint,
    textAlign: "center",
    margin: "16px 8px 0"
  }}>
      Until you set this up, people can still pay your creator side at your <GloobalWordmark /> ID.
    </p> : null}</div>{
    /* ── THE SAVE BAR ─────────────────────────────────────────────────
       Pinned under the scroll rather than at the end of it, so the one
       thing each step wants done is always a thumb away. Hidden while
       Gloobal's own keyboard is up, which needs that space, and on the
       Edit list, where each row is its own way in. */
  }{kbField || step === "hub" ? null : <div style={{
    flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
    padding: "10px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
    background: T.surface, boxShadow: `0 -6px 20px rgba(${T.inkRgb},0.06)`
  }}>{step === "name" && !hubMode && !savedAs.handle && !cameFromSplash ? <button
    onClick={onSkip}
    aria-label="Set this up later"
    className="v2-tap"
    style={{
      flexShrink: 0, height: 50, padding: "0 18px", border: "none", borderRadius: 999, background: T.surfaceAlt,
      fontSize: 14, fontWeight: 800, color: T.inkSoft, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap"
    }}
  >Later</button> : null}{step === "done" ? <button
    type="button"
    data-testid="creator-done-go"
    onClick={() => onOpenPage && onOpenPage()}
    className="v2-tap"
    style={{
      flex: 1, height: 50, border: "none", borderRadius: 999, background: T.gradButton, color: "#fff", fontSize: 15, fontWeight: 800,
      fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", boxShadow: `0 8px 20px rgba(${T.accentRgb},0.28)`
    }}
  >Go to my shop</button> : <button
    onClick={go}
    disabled={!ctaOn}
    data-testid="creator-setup-next"
    aria-label={step === "name" ? "Save my creator name" : ctaLabel}
    className="v2-tap"
    style={{
      flex: 1,
      minWidth: 0,
      height: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: "none",
      borderRadius: 999,
      padding: "0 18px",
      background: ctaOn ? T.gradButton : T.surfaceAlt,
      color: ctaOn ? "#fff" : T.inkFaint,
      fontSize: 15,
      fontWeight: 800,
      fontFamily: "inherit",
      whiteSpace: "nowrap",
      cursor: ctaOn ? "pointer" : "default",
      boxShadow: ctaOn ? `0 8px 20px rgba(${T.accentRgb},0.28)` : "none"
    }}
  >{busy || saving ? <Loader5 size={17} style={{ animation: "spin 0.9s linear infinite" }} /> : step === "share" && !hubMode ? <SparklesSu size={17} /> : <Check9 size={18} strokeWidth={2.8} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{busy || saving ? "Saving…" : ctaLabel}</span></button>}</div>}{
    /* ── MORE FONTS ───────────────────────────────────────────────────
       Every face, each drawn in the person's own name, the same way the
       three suggestions are. Tapping one picks it and closes the sheet. */
  }{fontsOpen ? <div
    onClick={() => setFontsOpen(false)}
    style={{
      position: "absolute", inset: 0, zIndex: 5, background: `rgba(${T.inkRgb},0.38)`,
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

// Every dial a ready look sets, the same replacement Look's Style makes:
// picking "Chai Stall" gives Chai Stall, not Chai Stall's colour on
// whatever corners were there before.
function creatorSetupLookDials(key) {
  const base = SHOP_THEMES[key] || SHOP_THEMES.gloobal;
  return {
    theme: key, color: base.color, font: base.font, corners: base.corners,
    cards: base.cards, density: base.density, photoShape: base.photoShape, dark: base.dark,
    layout: base.layout || "list", buttons: base.buttons || "filled", heroStyle: base.heroStyle || "gradient",
    coverStyle: base.coverStyle || "photo", pattern: base.pattern || "dots"
  };
}

// 3 → "3", 2.5 → "2.5", 2.36 → "2.36": a share as people say it.
function creatorShareText(rate) {
  const n = Math.round((Number(rate) || 0) * 100) / 100;
  return String(n);
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
function CreatorProfilePanel({ creator, myGloobalId, onLoad, onEdit, onOpenPage, onShowQr, onOpenLedger, onToast, paymentSoundOn = true, onTogglePaymentSound }) {
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

  // It sent "Pay me on Gloobal at rasoi.ghar" and no address, so the
  // person receiving it had nothing to tap. Now the shop's own link goes
  // inside the message, on its own line, where every messenger makes it a
  // link — the same /s/ address the shop's QR code carries.
  const share = () => {
    if (!handle) return;
    const url = buildGloobalPayUrl(creator.symbolId || myGloobalId, "shop");
    gloobalShareLink({
      title: creatorDisplayName(creator),
      message: `Pay ${creatorDisplayName(creator)} on GLOOBAL (${handle}):`,
      url,
      onToast
    });
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
    boxShadow: `0 10px 26px rgba(${T.accentRgb},0.30)`,
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
    boxShadow: `0 1px 3px rgba(${T.inkRgb},0.25)`
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
    : "Until you pick one, people pay your creator side at your GLOOBAL ID"}</div><div style={{
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
  /></button> : null}{
    /* The counter soundbox: a chime and the amount spoken when a payment
       to this creator name is confirmed. A fact about how the shop works,
       so it sits with the other facts rather than in Security. */
  }{typeof onTogglePaymentSound === "function" ? fact(
    "sound",
    paymentSoundOn ? VolumeOn1 : VolumeOff1,
    <span><span style={{ display: "block", fontWeight: 700 }}>Sounds</span><span style={{
      display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint, marginTop: 2
    }}>Payment chime with the amount spoken, and the Personal / Creator switch</span></span>,
    <ProfileToggle on={paymentSoundOn} onToggle={() => {
      // The tap that turns it on is also the one that unlocks sound,
      // so play a sample: the person hears what customers will trigger.
      if (!paymentSoundOn && typeof gloobalPlayChimeTone === "function") {
        gloobalChimeUnlock();
        gloobalPlayChimeTone();
      }
      onTogglePaymentSound();
    }} label="Sounds" />,
    !done
  ) : null}{fact(
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
      boxShadow: `0 8px 20px rgba(${T.accentRgb},0.32)`,
      cursor: "pointer"
    }}
  >Set up my creator name</button>}</div>;
}
