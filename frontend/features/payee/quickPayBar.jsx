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
import { ArrowRight as ArrowRight4, Loader as Loader8, X as X22, ClipboardPaste as PasteQuick, ChevronDown as ChevronDown7, Delete as BackQuick } from "lucide-react";

// ── ONE SMART PAD ───────────────────────────────────────────────────────
//
// It was three pads behind three tabs (ID, Mobile, Name) and the founder
// found that confusing. Now there is one pad: the digits on the left, the
// eight ID symbols on the right in their own tint, and the box works out
// from what was typed whether it is a mobile number or a GLOOBAL ID. The
// letters keyboard comes up only from its own key (अA), for a creator
// name, and goes back with "123".
//
// A number in another country: the flag chip at the top of the pad says
// which country's code a number without one is read in — your own to
// start with; tap it to pick another. Starting with + works too.
var QUICK_PAY_ID_LENGTH = 12;
var QUICK_PAY_PAD_ROWS = [
  ["1", "2", "3", "\u2212", "+"],
  ["4", "5", "6", "\xD7", "="],
  ["7", "8", "9", "\u25CB", "\u25A1"],
  ["name", "0", "back", "\u25CF", "\u25A0"]
];

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

function QuickPayBar({ myGloobalId = "", dialCode = "", countryIso = "", onOpenCoverage, onPayPerson, onPayCreator }) {
  const [text, setText] = useState67("");
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
  // Back from the country list goes back to the pad.
  useBackClose(picking, () => { setPicking(false); setCountrySearch(""); }, { unwind: true });

  const reset = () => { setError(""); setSuggest(null); };

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
    padding: "5px 5px 5px 5px", boxShadow: T.shadowCard,
    border: `1.5px solid ${error ? T.negative : padOpen || nameMode ? T.accent : "transparent"}`, transition: "border-color 0.18s ease"
  }}><button
    onClick={onOpenCoverage}
    aria-label="Gloobal coverage"
    className="v2-tap"
    style={{
      width: 36, height: 36, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", flexShrink: 0,
      overflow: "hidden", position: "relative", background: "#1B3B6F",
      boxShadow: "inset -4px -3px 8px rgba(5,10,30,0.55), inset 3px 2px 6px rgba(255,255,255,0.3), 0 2px 6px rgba(20,30,80,0.25)"
    }}
  >{
    /* ── THE GLOBE ────────────────────────────────────────────────────
       The same Earth the Coverage screen opens on, at 36px, drifting west
       to east once every twelve seconds — slow enough to read as a globe
       and not a loading spinner. Still for reduced motion. */
  }<span className="quickpay-globe-spin" aria-hidden="true" style={{
    position: "absolute", top: 0, left: 0, height: "100%", width: "200%", display: "flex",
    animation: "quickPayGlobe 12s linear infinite"
  }}>{[0, 1].map((i) => <img
    key={i}
    src="https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg"
    alt=""
    draggable={false}
    style={{ width: "50%", height: "100%", objectFit: "cover", display: "block" }}
  />)}</span><span aria-hidden="true" style={{
    position: "absolute", inset: 0, borderRadius: "50%",
    background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 40%), radial-gradient(circle at 70% 78%, rgba(3,10,30,0.55) 0%, rgba(3,10,30,0) 60%)"
  }} /></button><input
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
  ><X22 size={14} color={T.inkFaint} /></button> : null}<button
    onClick={() => lookUp()}
    disabled={!text.trim() || busy}
    aria-label="Check who this is"
    style={{
      width: 36, height: 36, borderRadius: "50%", border: "none", flexShrink: 0, cursor: text.trim() ? "pointer" : "default",
      background: text.trim() ? T.gradButton : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: text.trim() ? "0 4px 10px rgba(124,58,237,0.3)" : "none", transition: "background 0.18s ease"
    }}
  >{busy ? <Loader8 size={16} color="#fff" style={{ animation: "spin 0.9s linear infinite" }} /> : <ArrowRight4 size={17} color={text.trim() ? "#fff" : T.inkFaint} strokeWidth={2.5} />}</button></div>{
    error ? <div role="alert" style={{
      position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)", zIndex: 20,
      fontSize: 12, fontWeight: 700, color: T.negative, lineHeight: 1.4, background: T.surface, borderRadius: 14,
      padding: "10px 12px", boxShadow: "0 10px 26px rgba(20,18,43,0.16)", animation: "quickPayIn 0.22s ease"
    }}>{error}</div> : null
  }{suggest ? <div data-quickpay-suggest="" style={{
    position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)", zIndex: 20,
    background: T.surface, borderRadius: 18, padding: "12px 6px 6px", overflow: "hidden",
    boxShadow: "0 14px 36px rgba(20,18,43,0.22), 0 0 0 1px rgba(20,18,43,0.04)", animation: "quickPayIn 0.22s ease"
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
  }}>{(typeof bazaarCategoryInfo === "function" && bazaarCategoryInfo(shop.category) || {}).label || "Shop"}</span></span><ArrowRight4 size={15} color={T.inkFaint} /></button>)}</div> : null}{padOpen && !nameMode ? quickPaySmartPad() : null}{nameMode ? <CreatorNameKeyboard
    open
    header={<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 9px", borderBottom: `1px solid ${T.line}` }}><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => { setNameMode(false); setText(""); setPadOpen(true); }}
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

  // ── THE SMART PAD ─────────────────────────────────────────────────────
  function quickPaySmartPad() {
    const digitsOnly = /^\+?\d*$/.test(text);
    const key = (k) => {
      const isSymbol = DIAL_SYMBOLS.indexOf(k) >= 0;
      const label = k === "back" ? <BackQuick size={20} /> : k === "name" ? <span style={{ fontSize: 15, fontWeight: 900 }}>अA</span> : k;
      return <button
        key={k}
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => press(k)}
        aria-label={k === "back" ? "Delete" : k === "name" ? "Type a creator name" : isSymbol ? `Symbol ${k}` : k}
        className="v2-tap"
        style={{
          height: 52, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isSymbol ? 22 : 22, fontWeight: isSymbol ? 800 : 700,
          background: isSymbol ? T.accentSoft : k === "name" ? T.surfaceAlt : T.surface,
          color: isSymbol ? T.accent : T.ink,
          boxShadow: isSymbol || k === "name" ? "none" : "0 1px 2px rgba(20,18,43,0.12)"
        }}
      >{label}</button>;
    };
    return <div
      role="group"
      aria-label="Number and GLOOBAL ID pad"
      data-quickpay-pad=""
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 430, background: T.bg,
        borderTop: `1px solid ${T.line}`, boxShadow: "0 -8px 28px rgba(20,18,43,0.16)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)", display: "flex", flexDirection: "column",
        userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        animation: "quickPayPadIn 0.22s ease"
      }}
    ><style>{"@keyframes quickPayPadIn { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }"}</style><div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px"
    }}><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => setPicking(true)}
      aria-label={dialCountry ? `Country code ${dialCountry.dialCode}, ${dialCountry.name}. Change` : "Pick a country code"}
      data-quickpay-country=""
      style={{ ...quickPayBarChip(false), gap: 6, padding: "0 10px 0 6px" }}
    >{dialCountry ? <FlagEmoji flag={dialCountry.flag} shape="circle" size={22} /> : null}<span style={{ fontWeight: 800 }}>{dialCountry ? dialCountry.dialCode : "+ Code"}</span><ChevronDown7 size={14} color={T.inkSoft} /></button><span style={{
      flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: T.inkFaint, lineHeight: 1.3
    }}>{digitsOnly ? "Mobile number, or the ID's symbols" : "GLOOBAL ID: 12 symbols"}</span><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={pasteNow}
      aria-label="Paste"
      style={quickPayBarChip(false)}
    ><PasteQuick size={15} /></button><button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => setPadOpen(false)}
      aria-label="Hide"
      style={{ ...quickPayBarChip(false), width: 36, padding: 0, justifyContent: "center" }}
    ><ChevronDown7 size={18} color={T.inkSoft} /></button></div><div style={{
      display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr)) 10px repeat(2, minmax(0, 1fr))", gap: 8, padding: "4px 12px 10px"
    }}>{QUICK_PAY_PAD_ROWS.map((row) => [key(row[0]), key(row[1]), key(row[2]), <span key={`gap-${row[0]}`} aria-hidden="true" />, key(row[3]), key(row[4])])}</div><div style={{
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

function quickPayBarChip(on) {
  return {
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, height: 36, padding: "0 12px",
    borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
    background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink,
    boxShadow: "0 1px 3px rgba(20,18,43,0.12)", whiteSpace: "nowrap"
  };
}
