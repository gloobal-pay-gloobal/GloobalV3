// src/features/payee/quickPayBar.jsx
//
// THE DASHBOARD'S OWN SEARCH: PASTE ANYBODY, CHECK WHO, PAY.
//
// "A left corner rotating Gloobal icon to lead Gloobal Coverage, a search
// bar in which I can copy-paste any Gloobal ID, creator name or mobile
// number, then a side forward icon to verify, and a pay option."
//
// One box takes all four things a person might have been sent:
//   - a Gloobal ID (the twelve symbols),
//   - a Gloobal pay link (…/p/…, …/u/…, …/s/…), as copied from a chat,
//   - a mobile number, with or without its country code,
//   - a creator name (rasoi.ghar, or "rasoi ghar").
// The → button looks it up, and when it finds them the ordinary Send screen
// opens straight away with them filled in, where the amount is typed and
// the PIN asked; nothing is paid from here.
//
// The globe on the left still opens Gloobal Coverage, which is what the
// whole bar used to do.
import { useState as useState67, useRef as useRef39, useEffect as useEffect64 } from "react";
import { ArrowRight as ArrowRight4, Loader as Loader8, X as X22, ClipboardPaste as PasteQuick, ChevronDown as ChevronDown7, Delete as BackQuick, Smartphone as MobileQuick } from "lucide-react";

// ── ONE ROW, THREE CHOICES ──────────────────────────────────────────────
//
// The pad opens with one row on top: the flag, then GLOOBAL ID, then
// Mobile. The founder's words: "a row of three options — just the flag
// (tap it for the country list, no dial code on screen), then our dial,
// then the mobile pad".
//
//   flag       which country a mobile number without a code is read in.
//              Your own to start with; tap it for the list. The code
//              itself is not printed — the flag says it.
//   toggle     one switch: GLOOBAL ID (the wordmark, its two Os in colour)
//              on one side, a phone icon on the other. Tap it to swap
//              between the round symbol dial and the phone's number pad.
//              The number pad is a dialler: plain digits, hold 0 for +, and its bottom-left key (अA) still opens the
//              letters keyboard for a creator name.
//
// Above the pad, while it is up: the last five people you paid and your
// favourite shops (the ones pinned in Pay & Services), one tap each, with
// their photo or their shop's logo.
//
// There is one way to look somebody up: Find and pay, under the pad. The
// box above it no longer has an arrow of its own doing the same thing.
var QUICK_PAY_ID_LENGTH = 12;
var QUICK_PAY_MOBILE_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["name", "0", "back"]
];
// Digits only, no letters under them. 0 carries a small + because holding
// it types one.
var QUICK_PAY_KEY_LETTERS = { "0": "+" };

// ── WHAT WAS TYPED ──────────────────────────────────────────────────────
// { kind: "id" | "mobile" | "name", value, side? } or null. A pay link is
// read for its ID and its side, so a shop's link checks the shop.
function quickPayClassify(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const link = parseGloobalPayPayload(raw);
  if (link && link.gloobalId) return { kind: "id", value: link.gloobalId, side: link.side || "either" };
  const compact = raw.replace(/[\s\-().]/g, "");
  if (/^\+?\d{7,15}$/.test(compact)) return { kind: "mobile", value: compact };
  // A creator name: letters in any script, one dot or space between the
  // two parts, nothing else.
  const name = raw.replace(/\s+/g, ".").replace(/^@/, "").toLowerCase();
  if (/^[\p{L}\p{M}\p{N}]+(\.[\p{L}\p{M}\p{N}]+)?$/u.test(name) && name.length <= 60) return { kind: "name", value: name };
  return { kind: "unknown", value: raw };
}

// A number with no code is read in the chip's country. India's ten digits
// go as they are: the server already reads a bare ten digits as Indian.
function quickPayMobile(value, dialCode) {
  if (value.startsWith("+")) return value;
  const digits = value.replace(/^0+/, "");
  if (!dialCode) return value;
  if (dialCode === "+91" && /^\d{10}$/.test(digits)) return digits;
  return `${dialCode}${digits}`;
}

function QuickPayBar({ myGloobalId = "", dialCode = "", countryIso = "", onOpenCoverage, onPayPerson, onPayCreator, recent = [], favourites = [], onActiveChange }) {
  const [text, setText] = useState67("");
  // Which pad is up: the round GLOOBAL ID dial or the mobile number pad.
  const [padKind, setPadKind] = useState67("id");
  // The smart pad, and the letters keyboard for a creator name.
  const [padOpen, setPadOpen] = useState67(false);
  const [nameMode, setNameMode] = useState67(false);
  const [nameField, setNameField] = useState67("first");
  const [busy, setBusy] = useState67(false);
  const [error, setError] = useState67("");
  // A name nobody has: the shops that start with it, or — when none do —
  // the shops we have. { title, shops }.
  const [suggest, setSuggest] = useState67(null);
  // Which country a number without a code is read in.
  const [dialCountry, setDialCountry] = useState67(() => {
    const iso = String(countryIso || "").toUpperCase();
    return (typeof COUNTRY_BY_ISO !== "undefined" && COUNTRY_BY_ISO[iso]) || null;
  });
  const [picking, setPicking] = useState67(false);
  const [countrySearch, setCountrySearch] = useState67("");
  const seq = useRef39(0);
  // Holding 0 types +; the click that ends the hold must not also type 0.
  const plusHold = useRef39({ timer: null, fired: false });
  // Back from the country list goes back to the pad.
  useBackClose(picking, () => { setPicking(false); setCountrySearch(""); }, { unwind: true });

  const reset = () => { setError(""); setSuggest(null); };

  // ── WHILE YOU SEARCH, THE BOX HAS THE WHOLE ROW ───────────────────────
  // The dashboard hides the profile-flip button beside the box while the
  // pad, the name keyboard, a message or the shop list is up, so the box
  // runs edge to edge.
  const active = padOpen || nameMode || Boolean(error) || Boolean(suggest) || busy;
  useEffect64(() => {
    if (onActiveChange) onActiveChange(active);
  }, [active]);
  useEffect64(() => () => { if (onActiveChange) onActiveChange(false); }, []);

  // ── PHONE BACK ────────────────────────────────────────────────────────
  // Back closes what the box opened — the pad, the letters keyboard, the
  // shop list or a message — instead of leaving the dashboard (0145). And
  // when the app closes it itself, its history entry goes with it, so the
  // next Back is not swallowed.
  useBackClose(padOpen || nameMode || Boolean(suggest) || Boolean(error), () => {
    setPadOpen(false);
    setNameMode(false);
    setSuggest(null);
    setError("");
  }, { unwind: true });

  // The pad hides the floating map button while it is up, as every other
  // full-width board in the app does.
  useEffect64(() => {
    if (typeof window === "undefined" || !padOpen || nameMode) return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, [padOpen, nameMode]);

  const pasteNow = async () => {
    let pasted = "";
    try {
      pasted = String(await navigator.clipboard.readText() || "").trim();
    } catch (e) {
      pasted = "";
    }
    if (!pasted) {
      setPadOpen(false);
      setError("Nothing to paste here — long-press the box and choose Paste.");
      return;
    }
    setText(pasted);
    setPadOpen(false);
    setNameMode(false);
    lookUp(pasted);
  };

  // The two halves of a creator name, as the keyboard edits them.
  const nameFirst = nameMode ? text.split(".")[0] || "" : "";
  const nameLast = nameMode ? text.split(".").slice(1).join("") : "";
  const setName = (first, last) => setText(last ? `${first}.${last}` : first);

  const switchPad = (kind) => {
    if (kind === padKind) return;
    setPadKind(kind);
    setText("");
    reset();
  };

  // The round dial hands back the whole value; twelve symbols check
  // themselves, as typing them on the old pad did.
  const dialChange = (next) => {
    if (error || suggest) reset();
    const value = Array.from(String(next || "")).slice(0, QUICK_PAY_ID_LENGTH).join("");
    setText(value);
    if (Array.from(value).length === QUICK_PAY_ID_LENGTH) lookUp(value);
  };

  const press = (key) => {
    if (error || suggest) reset();
    if (key === "back") { setText((t) => Array.from(t).slice(0, -1).join("")); return; }
    if (key === "name") { setText(""); setPadOpen(false); setNameField("first"); setNameMode(true); return; }
    const next = Array.from(text).concat(key).slice(0, 20).join("");
    setText(next);
    // Twelve ID symbols and nothing else: that is a whole GLOOBAL ID, so
    // it is checked without another tap.
    const chars = Array.from(next);
    if (chars.length === QUICK_PAY_ID_LENGTH && chars.every((ch) => DIAL_SYMBOLS.indexOf(ch) >= 0)) lookUp(next);
  };

  const lookUp = async (input) => {
    const what = quickPayClassify(input === undefined ? text : input);
    if (!what) return;
    if (what.kind === "unknown") {
      setError("Paste a GLOOBAL ID, a pay link, a mobile number or a creator name.");
      return;
    }
    const mine = seq.current + 1;
    seq.current = mine;
    setPadOpen(false);
    setBusy(true);
    setError("");
    setSuggest(null);
    let result = null;
    let problem = "";
    let offer = null;
    try {
      if (what.kind === "name") {
        const creator = await GloobalApi.resolveCreatorHandle(what.value);
        if (creator) result = { kind: "creator", creator };
        else {
          // ── NOBODY BY THAT NAME: SHOW WHAT WE HAVE ────────────────────
          // Shops whose name starts with what was typed; when there are
          // none, the most-paid shops in your country. Never a dead end.
          const shown = what.value.replace(/\./g, " ").trim();
          let shops = [];
          let none = false;
          try {
            shops = await GloobalApi.bazaarSearch({ q: what.value, country: String(countryIso || "").toUpperCase() });
            if (!shops || !shops.length) {
              none = true;
              shops = await GloobalApi.bazaarSearch({ q: "", country: String(countryIso || "").toUpperCase() });
            }
          } catch (e) {
            shops = [];
          }
          shops = (shops || []).filter((x) => x && x.handle).slice(0, 5);
          if (shops.length) offer = { title: none ? `No shop called “${shown}” yet. Here's what's on` : `No exact match for “${shown}”. Shops starting with it:`, none, shops };
          else problem = "No creator has that name. Check the spelling, or search shops in Pay & Services.";
        }
      } else {
        const id = what.kind === "mobile" ? quickPayMobile(what.value, dialCountry ? dialCountry.dialCode : dialCode) : what.value;
        const user = await GloobalApi.resolveUser(id);
        if (!user || !user.symbolId) {
          problem = "No one on GLOOBAL matches that.";
        } else {
          // A shop's link checks the shop: same account, its creator side.
          let creator = null;
          if (what.kind === "id" && what.side === "shop") {
            try { creator = await GloobalApi.getCreatorProfile(user.symbolId); } catch (e) { creator = null; }
            if (!(creator && creator.handle)) creator = null;
          }
          result = creator ? { kind: "creator", creator } : {
            kind: "person",
            payee: {
              gloobalId: user.symbolId,
              name: user.fullName && !user.nameIsMobile ? user.fullName : "GLOOBAL User",
              mobileNumber: user.mobileNumber || "",
              countryIso: user.countryIso || null,
              shareRate: (Number(user.cashbackRate) || 0) * 100
            }
          };
        }
      }
    } catch (err) {
      const notFound = err && (err.status === 404 || err.message === "No user found.");
      problem = notFound ? "No one on GLOOBAL matches that." : ((err && err.message) || "Couldn't check that just now. Try again.");
    }
    if (seq.current !== mine) return;
    setBusy(false);
    const id = result && (result.kind === "creator" ? result.creator.symbolId : result.payee.gloobalId);
    if (id && myGloobalId && id === myGloobalId) {
      setError("That's you.");
      return;
    }
    // ── FOUND: STRAIGHT TO SEND ──────────────────────────────────────
    // No card and no Pay button in between: the Send screen opens on the
    // amount with them at the top — their name, photo and flag are there
    // to confirm it's the right person before anything is paid.
    if (result) {
      setText("");
      setNameMode(false);
      if (result.kind === "creator") { if (onPayCreator) onPayCreator({ creator: result.creator }); }
      else if (onPayPerson) onPayPerson(result.payee);
      return;
    }
    if (offer) setSuggest(offer);
    else setError(problem);
  };

  return <div style={{ flex: 1, minWidth: 0, position: "relative" }}><style>{`
    @keyframes quickPayIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @keyframes quickPayGlobe { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @media (prefers-reduced-motion: reduce) { .quickpay-globe-spin { animation: none !important; } }
    @keyframes quickPayVeil { from { opacity: 0; } to { opacity: 1; } }
  `}</style>{
    // ── A PLAIN LIGHT GROUND WHILE YOU LOOK SOMEBODY UP ───────────────
    // While the pad, an error or the shop list is up, the dashboard behind
    // it is covered by the app's own light ground. zIndex -1 keeps it
    // inside the header's own stacking context: under the box, over
    // everything below the header. Tapping it puts the pad away, or
    // clears the message.
    (padOpen || nameMode || error || busy || suggest) ? <div
      data-quickpay-veil=""
      aria-hidden="true"
      onClick={() => {
        if (padOpen || nameMode) { setPadOpen(false); setNameMode(false); return; }
        setError("");
        setSuggest(null);
      }}
      style={{
        position: "fixed", inset: 0, zIndex: -1, background: T.bg,
        animation: "quickPayVeil 0.18s ease"
      }}
    /> : null
  }<div style={{
    display: "flex", alignItems: "center", gap: 6, background: T.surface, borderRadius: T.radiusMd,
    padding: "5px 8px 5px 5px", minHeight: 46, boxSizing: "border-box", boxShadow: T.shadowCard,
    border: `1.5px solid ${error ? T.negative : padOpen || nameMode ? T.accent : "transparent"}`, transition: "border-color 0.18s ease"
  }}><button
    onClick={onOpenCoverage}
    aria-label="Gloobal coverage"
    data-testid="coverage-globe"
    className="v2-tap"
    style={{
      width: 36, height: 36, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", flexShrink: 0,
      background: "none", display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 2px 6px rgba(${T.accentDeepRgb},0.25)`
    }}
  >{
    /* ── THE GLOBE ────────────────────────────────────────────────────
       Drawn, not photographed: six globes in the side's own ink that
       turn over from one to the next (components/common/globeIcons.jsx).
       It was a three.js Earth texture fetched from GitHub on every load,
       which at 36px was a blurred marble that ignored the theme. */
  }<GloobalGlobeFlip size={36} /></button><input
    id="quickpay-input"
    value={text}
    onChange={(e) => { setText(e.target.value); if (error || suggest) reset(); }}
    onPaste={(e) => {
      // A paste is a complete thing — check it straight away rather than
      // making somebody also find the arrow.
      const pasted = String((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
      if (!pasted) return;
      e.preventDefault();
      setText(pasted);
      lookUp(pasted);
    }}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookUp(); } }}
    // Our pads instead of the phone's keyboard. Long-press still pastes.
    inputMode="none"
    onFocus={() => { if (!nameMode) setPadOpen(true); }}
    onClick={() => { if (!nameMode) setPadOpen(true); }}
    placeholder={nameMode ? "Creator name" : "ID, mobile or name"}
    aria-label="Pay someone by Gloobal ID, mobile number or creator name"
    autoCapitalize="none"
    autoCorrect="off"
    spellCheck={false}
    enterKeyHint="go"
    style={{
      flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 13.5, fontWeight: 600,
      color: T.ink, fontFamily: "inherit", padding: "0 4px"
    }}
  />{text ? <button
    onClick={() => { setText(""); reset(); }}
    aria-label="Clear"
    style={{ width: 26, height: 26, border: "none", background: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
  ><X22 size={14} color={T.inkFaint} /></button> : null}{busy ? <span
    role="status"
    aria-label="Looking them up"
    style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Loader8 size={17} color={T.accent} style={{ animation: "spin 0.9s linear infinite" }} /></span> : null}</div>{
    error ? <div role="alert" style={{
      position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)", zIndex: 20,
      fontSize: 12, fontWeight: 700, color: T.negative, lineHeight: 1.4, background: T.surface, borderRadius: 14,
      padding: "10px 12px", boxShadow: `0 10px 26px rgba(${T.inkRgb},0.16)`, animation: "quickPayIn 0.22s ease"
    }}>{error}</div> : null
  }{suggest ? <div data-quickpay-suggest="" style={{
    position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)", zIndex: 20,
    background: T.surface, borderRadius: 18, padding: "12px 6px 6px", overflow: "hidden",
    boxShadow: `0 14px 36px rgba(${T.inkRgb},0.22), 0 0 0 1px rgba(${T.inkRgb},0.04)`, animation: "quickPayIn 0.22s ease"
  }}><div role="status" style={{
    display: "flex", alignItems: "flex-start", gap: 8, padding: "0 8px 8px", fontSize: 12.5, fontWeight: 700, color: T.inkSoft, lineHeight: 1.4
  }}><span style={{ flex: 1, minWidth: 0 }}>{suggest.title}{suggest.none ? <> <GloobalWordmark /></> : null}</span><button
    onClick={reset}
    aria-label="Close"
    style={{
      width: 26, height: 26, borderRadius: "50%", border: "none", background: T.surfaceAlt, cursor: "pointer", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><X22 size={13} color={T.inkSoft} /></button></div>{suggest.shops.map((shop) => <button
    key={shop.symbolId}
    onClick={() => { setText(String(shop.handle)); lookUp(String(shop.handle)); }}
    className="v2-row"
    style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", border: "none", borderRadius: 12,
      background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit"
    }}
  ><BusinessMark name={shop.handle || ""} logo={shop.logo} size={36} radius={11} /><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{creatorDisplayName(shop)}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint, marginTop: 1
  }}>{(typeof bazaarCategoryInfo === "function" && bazaarCategoryInfo(shop.category) || {}).label || "Shop"}</span></span><ArrowRight4 size={15} color={T.inkFaint} /></button>)}</div> : null}{padOpen && !nameMode && !error && !suggest && !busy ? quickPayShortcuts() : null}{padOpen && !nameMode ? quickPaySmartPad() : null}{nameMode ? <CreatorNameKeyboard
    open
    header={<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 9px", borderBottom: `1px solid ${T.line}` }}><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => { setNameMode(false); setText(""); setPadKind("mobile"); setPadOpen(true); }}
      style={quickPayBarChip(false)}
    ><span aria-hidden="true" style={{ fontWeight: 900 }}>123</span>Numbers &amp; ID</button><span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: T.inkFaint, textAlign: "center" }}>Type a creator name</span><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={pasteNow}
      aria-label="Paste"
      style={quickPayBarChip(false)}
    ><PasteQuick size={15} /></button></div>}
    field={nameField}
    onField={setNameField}
    first={nameFirst}
    last={nameLast}
    onFirst={(v) => setName(v, nameLast)}
    onLast={(v) => setName(nameFirst, v)}
    countryIso={countryIso}
    firstLabel="Creator name"
    lastLabel="Second part"
    onClose={() => { setNameMode(false); if (nameFirst) lookUp(text); }}
  /> : null}{picking ? <div style={{ position: "fixed", inset: 0, zIndex: 520 }}><CountryPickerScreen
    topCountries={TOP_COUNTRIES}
    countries={ALL_COUNTRIES}
    search={countrySearch}
    onSearch={setCountrySearch}
    selectedIso={dialCountry ? dialCountry.iso : ""}
    onSelect={(c) => { setDialCountry(c); setPicking(false); setCountrySearch(""); setPadOpen(true); }}
    onClose={() => { setPicking(false); setCountrySearch(""); }}
  /></div> : null}</div>;

  // ── RECENT AND FAVOURITES ─────────────────────────────────────────────
  // Under the box while the pad is up: the last five people paid and the
  // pinned shops. A tap looks them up exactly as typing them would, so it
  // lands on the same Send screen with them already filled in.
  function quickPayShortcuts() {
    const people = (recent || []).slice(0, 5);
    const shops = (favourites || []).slice(0, 5);
    if (!people.length && !shops.length) return null;
    const row = (title, items, draw) => items.length ? <div style={{ marginTop: 14 }}><div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkFaint, padding: "0 4px 8px"
    }}>{title}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>{items.map(draw)}</div></div> : null;
    const tile = (key, label, face, onClick) => <button
      key={key}
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="v2-tap"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0, padding: "6px 2px",
        border: "none", background: "none", cursor: "pointer", fontFamily: "inherit"
      }}
    >{face}<span style={{
      maxWidth: "100%", fontSize: 11.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{label}</span></button>;
    return <div data-quickpay-shortcuts="" style={{
      position: "absolute", left: 0, right: 0, top: "100%", zIndex: 10, padding: "4px 2px 0", animation: "quickPayIn 0.22s ease"
    }}>{row("Recent", people, (p) => tile(p.key, String(p.name || "").split(/\s+/)[0] || p.name, <span style={{ position: "relative", display: "inline-block" }}><QuickPayFace person={p} />{p.flag ? <span style={{
      position: "absolute", right: -2, bottom: -2, width: 20, height: 20, borderRadius: "50%", background: T.surface,
      display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.18)"
    }}><FlagEmoji flag={p.flag} size={14} shape="circle" border="none" /></span> : null}</span>, () => {
      const target = p.handle || p.gloobalId;
      if (!target) return;
      setText(target);
      lookUp(target);
    }))}{row("Favourites", shops, (c) => tile(c.key, c.label || c.handle, <QuickPayShopFace symbolId={c.key} name={c.handle || c.label || ""} logo={c.logo} />, () => {
      if (!c.handle) return;
      setText(c.handle);
      lookUp(c.handle);
    }))}</div>;
  }

  // ── THE PAD ───────────────────────────────────────────────────────────
  function quickPaySmartPad() {
    const mobile = padKind === "mobile";
    const holdStart = () => {
      const h = plusHold.current;
      h.fired = false;
      clearTimeout(h.timer);
      h.timer = setTimeout(() => {
        h.fired = true;
        if (!text) press("+");
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
      }, 450);
    };
    const holdEnd = () => clearTimeout(plusHold.current.timer);
    const key = (k) => {
      const plain = k === "name" || k === "back";
      const letters = QUICK_PAY_KEY_LETTERS[k] || "";
      const label = k === "back" ? <BackQuick size={22} /> : k === "name" ? <span style={{ fontSize: 15, fontWeight: 900 }}>अA</span> : <span style={{
        display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1
      }}><span style={{ fontSize: 26, fontWeight: 600, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}>{k}</span>{letters && <span style={{
        fontSize: 10, fontWeight: 700, color: T.inkFaint, marginTop: 2
      }}>{letters}</span>}</span>;
      return <button
        key={k}
        type="button"
        onPointerDown={(e) => { e.preventDefault(); if (k === "0") holdStart(); }}
        onPointerUp={k === "0" ? holdEnd : undefined}
        onPointerLeave={k === "0" ? holdEnd : undefined}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (k === "0" && plusHold.current.fired) { plusHold.current.fired = false; return; }
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(6);
          press(k);
        }}
        aria-label={k === "back" ? "Delete" : k === "name" ? "Type a creator name" : k === "0" ? "0, hold for plus" : k}
        className="v2-tap"
        style={{
          height: 58, borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: plain ? "transparent" : T.surface,
          color: T.ink,
          boxShadow: plain ? "none" : `0 1px 2px rgba(${T.inkRgb},0.08), 0 0 0 1px rgba(${T.inkRgb},0.04)`
        }}
      >{label}</button>;
    };
    // ── THE TOGGLE ───────────────────────────────────────────────────────
    // One switch, two sides: the GLOOBAL ID wordmark, and a phone. A white
    // thumb slides under whichever is on. Tapping anywhere on it swaps.
    const toggle = <button
      type="button"
      role="switch"
      aria-checked={mobile}
      aria-label={mobile ? "Mobile number pad. Switch to GLOOBAL ID" : "GLOOBAL ID dial. Switch to mobile number"}
      data-quickpay-toggle=""
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => switchPad(mobile ? "id" : "mobile")}
      className="v2-tap"
      style={{
        position: "relative", flex: 1, minWidth: 0, height: 44, borderRadius: 999, border: "none", padding: 4,
        cursor: "pointer", fontFamily: "inherit", background: T.surfaceSunk || T.surfaceAlt,
        boxShadow: `inset 0 1px 3px rgba(${T.inkRgb},0.10)`,
        display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", alignItems: "center"
      }}
    ><span aria-hidden="true" style={{
      position: "absolute", top: 4, bottom: 4, borderRadius: 999, background: T.surface,
      boxShadow: `0 2px 8px rgba(${T.inkRgb},0.16)`,
      left: mobile ? "calc(66.666% + 1px)" : 4,
      width: mobile ? "calc(33.333% - 5px)" : "calc(66.666% - 5px)",
      transition: "left 0.25s cubic-bezier(.3,.7,.2,1), width 0.25s cubic-bezier(.3,.7,.2,1)"
    }} /><span style={{
      position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", letterSpacing: 0.2,
      opacity: mobile ? 0.45 : 1, transition: "opacity 0.2s ease"
    }}><GloobalWordmark suffix=" ID" /></span><span style={{
      position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
      color: mobile ? T.accent : T.inkFaint, transition: "color 0.2s ease"
    }}><MobileQuick size={19} strokeWidth={2.3} /></span></button>;
    return <div
      role="group"
      aria-label={padKind === "id" ? "GLOOBAL ID dial" : "Mobile number pad"}
      data-quickpay-pad=""
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 430, background: T.bg,
        borderTop: `1px solid ${T.line}`, boxShadow: `0 -8px 28px rgba(${T.inkRgb},0.16)`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)", display: "flex", flexDirection: "column",
        userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        animation: "quickPayPadIn 0.22s ease"
      }}
    ><style>{"@keyframes quickPayPadIn { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }"}</style><div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px"
    }}><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => setPicking(true)}
      aria-label={dialCountry ? `Mobile numbers are read as ${dialCountry.name}. Change country` : "Pick a country"}
      data-quickpay-country=""
      className="v2-tap"
      style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
        background: T.surface, boxShadow: `0 1px 3px rgba(${T.inkRgb},0.12)`, display: "flex", alignItems: "center", justifyContent: "center"
      }}
    >{dialCountry ? <FlagEmoji flag={dialCountry.flag} shape="circle" size={30} border="none" /> : <ChevronDown7 size={16} color={T.inkSoft} />}</button>{toggle}</div>{padKind === "id" ? <div style={{
      display: "flex", justifyContent: "center", padding: "2px 12px 6px"
    }}><SymbolDialPad value={text} onChange={dialChange} length={QUICK_PAY_ID_LENGTH} showLogo={false} soundWhileTyping /></div> : <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px 14px", padding: "6px 20px 12px"
    }}>{QUICK_PAY_MOBILE_ROWS.map((row) => row.map(key))}</div>}<div style={{
      padding: "0 12px 12px"
    }}><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => lookUp()}
      disabled={!text.trim()}
      style={{
        width: "100%", height: 50, borderRadius: 15, border: "none", cursor: text.trim() ? "pointer" : "default",
        background: text.trim() ? T.gradButton : T.surfaceAlt, color: text.trim() ? "#fff" : T.inkFaint,
        fontSize: 15, fontWeight: 800, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8
      }}
    >Find and pay<ArrowRight4 size={17} strokeWidth={2.5} /></button></div></div>;
  }
}

// ── FACES ON THE SHORTCUTS ──────────────────────────────────────────────
// A person: their photo, read through the same per-session cache the
// receipt and the scan card use; their initials until it arrives or if
// they have none. Somebody paid as a shop: the shop's logo.
function QuickPayFace({ person }) {
  const isShop = Boolean(person && person.handle);
  const { photo } = useCounterpartyPhoto(isShop ? "" : (person && person.gloobalId) || "");
  if (isShop) return <QuickPayShopFace symbolId={person.gloobalId} name={person.handle} logo={person.logo} />;
  if (photo) return <ProfileAvatar photo={photo} name={person.name} size={48} />;
  return quickPayInitials(person && person.name, person && person.key);
}

// symbolId → logo | null | Promise. One read per shop per session.
var QUICK_PAY_LOGOS = new Map();
function quickPayLoadLogo(symbolId) {
  if (!symbolId) return Promise.resolve(null);
  if (QUICK_PAY_LOGOS.has(symbolId)) return Promise.resolve(QUICK_PAY_LOGOS.get(symbolId));
  const pending = GloobalApi.getCreatorProfile(symbolId)
    .then((c) => {
      const logo = c && typeof c.logo === "string" && c.logo.startsWith("data:image/") ? c.logo : null;
      QUICK_PAY_LOGOS.set(symbolId, logo);
      return logo;
    }, () => { QUICK_PAY_LOGOS.delete(symbolId); return null; });
  QUICK_PAY_LOGOS.set(symbolId, pending);
  return pending;
}
function QuickPayShopFace({ symbolId, name, logo }) {
  const known = QUICK_PAY_LOGOS.get(symbolId);
  const [fresh, setFresh] = useState67(known && typeof known.then !== "function" ? known : null);
  useEffect64(() => {
    let alive = true;
    quickPayLoadLogo(symbolId).then((l) => { if (alive && l) setFresh(l); });
    return () => { alive = false; };
  }, [symbolId]);
  return <BusinessMark name={name || ""} logo={fresh || logo || null} size={48} radius={16} />;
}

// A person with no photo: their initials on a tint picked from their ID, so
// the same person is the same colour every time.
var QUICK_PAY_TINTS = [T.accent, "#2563EB", "#059669", "#EA580C", "#DB2777", "#0E7490"];
function quickPayInitials(name, key) {
  let h = 7;
  for (const ch of String(key || name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = QUICK_PAY_TINTS[h % QUICK_PAY_TINTS.length];
  const letters = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0].toUpperCase()).join("");
  return <span style={{
    width: 48, height: 48, borderRadius: "50%", background: hue + "22", color: hue, display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 17, fontWeight: 800, fontFamily: T.fontDisplay
  }}>{letters}</span>;
}

function quickPayBarChip(on) {
  return {
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, height: 36, padding: "0 12px",
    borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
    background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink,
    boxShadow: `0 1px 3px rgba(${T.inkRgb},0.12)`, whiteSpace: "nowrap"
  };
}
