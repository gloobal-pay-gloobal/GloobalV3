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
// The → button looks it up and shows WHO it is — photo or shop logo, name,
// flag, ID — before anything else. Pay opens the ordinary Send screen with
// them filled in, where the amount is typed and the PIN asked; nothing is
// paid from here.
//
// The globe on the left still opens Gloobal Coverage, which is what the
// whole bar used to do.
import { useState as useState67, useRef as useRef39, useEffect as useEffect64 } from "react";
import { ArrowRight as ArrowRight4, Loader as Loader8, X as X22, Store as Store6, Phone as Phone4, ClipboardPaste as PasteQuick, ChevronDown as ChevronDown7 } from "lucide-react";

// ── OUR OWN PADS, NOT THE PHONE'S KEYBOARD ──────────────────────────────
//
// "If they type, give them our dial pad, our PIN pad, and if they use a
// creator name, our keyboard — all in one horizontal row above for users
// to pick from." Tapping the box opens a panel with that row on top:
//
//   Gloobal ID   — the symbol dial the ID is made of (SymbolDialPad),
//   Mobile       — the number pad the PIN uses (PhoneDialPad),
//   Creator name — the Gloobal keyboard, in any alphabet,
//   Paste        — what is copied, checked at once.
//
// It opens on whichever was used last (kept on this phone), and on the
// Gloobal ID dial the first time. The phone's own keyboard never comes up:
// every one of the three things the box takes has a pad made for it.
var QUICK_PAY_MODES = ["id", "mobile", "name"];
var QUICK_PAY_ID_LENGTH = 12;

function quickPayModeLoad() {
  try {
    const m = localStorage.getItem("gloobal:quickPayMode:v1");
    return QUICK_PAY_MODES.indexOf(m) >= 0 ? m : "id";
  } catch (e) {
    return "id";
  }
}

function quickPayModeSave(m) {
  try { localStorage.setItem("gloobal:quickPayMode:v1", m); } catch (e) { /* a convenience */ }
}

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

// A ten-digit number on a non-Indian account gets that account's own
// dial code; the server already reads a bare ten digits as Indian.
function quickPayMobile(value, dialCode) {
  if (value.startsWith("+")) return value;
  if (/^\d{10}$/.test(value) && dialCode && dialCode !== "+91") return `${dialCode}${value}`;
  return value;
}

function QuickPayBar({ myGloobalId = "", dialCode = "", countryIso = "", onOpenCoverage, onPayPerson, onPayCreator, onOpenShop }) {
  const [text, setText] = useState67("");
  // The pad panel, and which pad. See QUICK_PAY_MODES above.
  const [padOpen, setPadOpen] = useState67(false);
  const [mode, setModeState] = useState67(() => quickPayModeLoad());
  const [nameField, setNameField] = useState67("first");
  const [busy, setBusy] = useState67(false);
  const [found, setFound] = useState67(null);
  const [error, setError] = useState67("");
  // A name nobody has: the shops that start with it, or — when none do —
  // the shops we have. { title, shops }.
  const [suggest, setSuggest] = useState67(null);
  const seq = useRef39(0);

  const reset = () => { setFound(null); setError(""); setSuggest(null); };

  const setMode = (m) => {
    if (m === mode) return;
    setModeState(m);
    quickPayModeSave(m);
    // An ID typed on the dial is not a mobile number: switching pads
    // starts the box again rather than reading one as the other.
    setText("");
    setNameField("first");
    reset();
  };

  // The pad hides the floating map button while it is up, as every other
  // full-width board in the app does.
  useEffect64(() => {
    if (typeof window === "undefined" || !padOpen || mode === "name") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, [padOpen, mode]);

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
    lookUp(pasted);
  };

  // The two halves of a creator name, as the keyboard edits them.
  const nameFirst = mode === "name" ? text.split(".")[0] || "" : "";
  const nameLast = mode === "name" ? text.split(".").slice(1).join("") : "";
  const setName = (first, last) => setText(last ? `${first}.${last}` : first);

  const lookUp = async (input) => {
    const what = quickPayClassify(input === undefined ? text : input);
    if (!what) return;
    if (what.kind === "unknown") {
      setFound(null);
      setError("Paste a GLOOBAL ID, a pay link, a mobile number or a creator name.");
      return;
    }
    const mine = seq.current + 1;
    seq.current = mine;
    setPadOpen(false);
    setBusy(true);
    setError("");
    setFound(null);
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
        const id = what.kind === "mobile" ? quickPayMobile(what.value, dialCode) : what.value;
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
          if (result.kind === "person") {
            try { result.photo = await GloobalApi.getUserPhoto(user.symbolId); } catch (e) { result.photo = null; }
          }
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
    if (result) setFound(result);
    else if (offer) setSuggest(offer);
    else setError(problem);
  };

  const country = (iso) => (iso && typeof COUNTRY_BY_ISO !== "undefined" ? COUNTRY_BY_ISO[String(iso).toUpperCase()] : null);
  const card = found ? (() => {
    const isShop = found.kind === "creator";
    const name = isShop ? creatorDisplayName(found.creator) : found.payee.name;
    const id = isShop ? found.creator.symbolId : found.payee.gloobalId;
    const c = country(isShop ? found.creator.countryIso : found.payee.countryIso);
    const sub = isShop ? (found.creator.handle || "") : (found.payee.mobileNumber || "");
    // Drops OVER the dashboard rather than pushing it down: the balance
    // card jumping 150px every time somebody checks a name is the kind of
    // movement that makes a thumb land on the wrong thing.
    return <div data-quickpay-result="" style={{
      position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)", zIndex: 20,
      background: T.surface, borderRadius: 18, padding: "12px 12px 12px 14px",
      boxShadow: "0 14px 36px rgba(20,18,43,0.22), 0 0 0 1px rgba(20,18,43,0.04)",
      animation: "quickPayIn 0.22s ease"
    }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ position: "relative", flexShrink: 0 }}>{isShop
      ? <BusinessMark name={found.creator.handle || ""} logo={found.creator.logo} size={48} radius={14} />
      : (found.photo
        ? <img src={found.photo} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", display: "block" }} />
        : <span style={{
          width: 48, height: 48, borderRadius: "50%", background: T.accentSoft, color: T.accent,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800
        }}>{businessMarkInitials(name)}</span>)}{c ? <span style={{ position: "absolute", right: -4, bottom: -4 }}><FlagEmoji flag={c.flag} shape="circle" size={20} border={`inset 0 0 0 2px ${T.surface}`} /></span> : null}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
      display: "flex", alignItems: "center", gap: 6
    }}><span style={{
      fontSize: 14.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{name}</span>{isShop ? <span style={{
      flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800,
      letterSpacing: 0.4, textTransform: "uppercase", color: T.accent, background: T.accentSoft, borderRadius: 6, padding: "2px 6px"
    }}><Store6 size={10} />Shop</span> : null}</span><span style={{
      display: "block", fontSize: 11.5, color: T.inkFaint, fontWeight: 600, marginTop: 2,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{[sub, c ? c.name : ""].filter(Boolean).join(" · ")}</span><span style={{ display: "block", marginTop: 4, fontSize: 12 }}><ColoredGloobalId id={id} /></span></span><button
      onClick={reset}
      aria-label="Clear"
      style={{
        width: 30, height: 30, borderRadius: "50%", border: "none", background: T.surfaceAlt, cursor: "pointer", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "flex-start"
      }}
    ><X22 size={14} color={T.inkSoft} /></button></div><div style={{ display: "flex", gap: 8, marginTop: 12 }}>{isShop && onOpenShop ? <button
      onClick={() => onOpenShop(found.creator)}
      style={{
        flex: 1, height: 44, borderRadius: 13, border: "none", background: T.accentSoft, color: T.accent,
        fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer"
      }}
    >View shop</button> : null}<button
      onClick={() => {
        if (isShop) { if (onPayCreator) onPayCreator({ creator: found.creator }); }
        else if (onPayPerson) onPayPerson(found.payee);
        setFound(null);
        setText("");
      }}
      style={{
        flex: 1, height: 44, borderRadius: 13, border: "none", background: T.gradButton, color: "#fff",
        fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 6px 16px rgba(124,58,237,0.28)"
      }}
    >Pay {isShop ? "" : (name.split(" ")[0] || "")}</button></div></div>;
  })() : null;

  return <div style={{ flex: 1, minWidth: 0, position: "relative" }}><style>{`
    @keyframes quickPayIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @keyframes quickPayGlobe { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @media (prefers-reduced-motion: reduce) { .quickpay-globe-spin { animation: none !important; } }
    @keyframes quickPayVeil { from { opacity: 0; } to { opacity: 1; } }
  `}</style>{
    // ── A PLAIN LIGHT GROUND WHILE YOU LOOK SOMEBODY UP ───────────────
    // While the pad, the answer or an error is up, the dashboard behind
    // it — the purple balance card most of all — is covered by the app's
    // own light ground, so the only things on screen are the box, what
    // it found and the pad. zIndex -1 keeps it inside the header's own
    // stacking context: under the box, over everything below the header.
    // Tapping it puts the pad away, or clears the answer.
    (padOpen || found || error || busy || suggest) ? <div
      data-quickpay-veil=""
      aria-hidden="true"
      onClick={() => {
        if (padOpen) { setPadOpen(false); return; }
        setFound(null);
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
    border: `1.5px solid ${error ? T.negative : found ? T.positive : "transparent"}`, transition: "border-color 0.18s ease"
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
    onChange={(e) => { setText(e.target.value); if (found || error) reset(); }}
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
    onFocus={() => setPadOpen(true)}
    onClick={() => setPadOpen(true)}
    placeholder={mode === "mobile" ? "Mobile number" : mode === "name" ? "Creator name" : "GLOOBAL ID, or paste anything"}
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
  }{suggest && !found ? <div data-quickpay-suggest="" style={{
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
  }}>{(typeof bazaarCategoryInfo === "function" && bazaarCategoryInfo(shop.category) || {}).label || "Shop"}</span></span><ArrowRight4 size={15} color={T.inkFaint} /></button>)}</div> : null}{card}{padOpen ? quickPayPads() : null}</div>;

  // ── THE PANEL ─────────────────────────────────────────────────────────
  function quickPayPads() {
    const chip = (key, label, Icon, on, onTap) => <button
      key={key}
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onTap}
      aria-pressed={on}
      aria-label={typeof label === "string" && label ? undefined : key}
      style={{
        // The three pads share the width; Paste and Hide are icons. A
        // render had "Paste" and Hide pushed off a 390px phone.
        flex: label ? "1 1 0" : "0 0 auto", minWidth: 0, justifyContent: "center",
        display: "inline-flex", alignItems: "center", gap: 5, height: 36, padding: label ? "0 8px" : "0 11px",
        borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
        background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink,
        boxShadow: on ? "0 4px 12px rgba(124,58,237,0.28)" : "0 1px 3px rgba(20,18,43,0.12)", whiteSpace: "nowrap"
      }}
    >{Icon}{label ? <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span> : null}</button>;
    const row = <div role="tablist" aria-label="How to type it" style={{
      display: "flex", alignItems: "center", gap: 7, padding: "10px 10px 9px", overflowX: "auto", scrollbarWidth: "none",
      borderBottom: `1px solid ${T.line}`, flexShrink: 0
    }}>{chip("id", "ID", <span aria-hidden="true" style={{ fontSize: 11, letterSpacing: -1, fontWeight: 900 }}>●■</span>, mode === "id", () => setMode("id"))}{
      chip("mobile", "Mobile", <Phone4 size={13} />, mode === "mobile", () => setMode("mobile"))}{
      chip("name", "Name", <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 900 }}>अA</span>, mode === "name", () => setMode("name"))}{
      chip("Paste", "", <PasteQuick size={15} />, false, pasteNow)}{mode === "name" ? null : <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => setPadOpen(false)}
      aria-label="Hide"
      style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
        background: T.surface, boxShadow: "0 1px 3px rgba(20,18,43,0.12)", display: "flex", alignItems: "center", justifyContent: "center"
      }}
    ><ChevronDown7 size={18} color={T.inkSoft} /></button>}</div>;

    if (mode === "name") {
      return <CreatorNameKeyboard
        open
        header={row}
        field={nameField}
        onField={setNameField}
        first={nameFirst}
        last={nameLast}
        onFirst={(v) => setName(v, nameLast)}
        onLast={(v) => setName(nameFirst, v)}
        countryIso={countryIso}
        firstLabel="Creator name"
        lastLabel="Second part"
        onClose={() => { setPadOpen(false); if (nameFirst) lookUp(text); }}
      />;
    }

    return <div
      role="group"
      aria-label={mode === "mobile" ? "Number pad" : "Gloobal ID dial"}
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 430, background: T.bg,
        borderTop: `1px solid ${T.line}`, boxShadow: "0 -8px 28px rgba(20,18,43,0.16)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)", display: "flex", flexDirection: "column",
        maxHeight: "72vh", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        animation: "quickPayPadIn 0.22s ease"
      }}
    ><style>{"@keyframes quickPayPadIn { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }"}</style>{row}<div style={{
      flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px 14px", display: "flex", flexDirection: "column", alignItems: "center"
    }}>{mode === "id"
      ? <>{
        /* The twelve symbols, filling as they are dialled; the twelfth
           checks the ID without another tap. */
      }<div style={{ width: "100%", maxWidth: 360 }}><SymbolChipRow length={QUICK_PAY_ID_LENGTH} value={text} masked={false} justify="center" /></div><div style={{ width: "100%", maxWidth: 360, marginTop: 12 }}><SymbolDialPad
        value={text}
        onChange={(v) => {
          const next = Array.from(v).slice(0, QUICK_PAY_ID_LENGTH).join("");
          setText(next);
          if (found || error) reset();
          if (Array.from(next).length === QUICK_PAY_ID_LENGTH) lookUp(next);
        }}
        length={QUICK_PAY_ID_LENGTH}
        showLogo={false}
      /></div></>
      : <div style={{ width: "100%", maxWidth: 360 }}>{dialCode ? <div style={{
        textAlign: "center", fontSize: 11.5, fontWeight: 700, color: T.inkFaint, marginBottom: 4
      }}>{`Numbers without a code are read as ${dialCode}`}</div> : null}<PhoneDialPad
        value={text.replace(/[^0-9]/g, "")}
        onChange={(v) => { setText(v); if (found || error) reset(); }}
        minLength={7}
        maxLength={15}
        onSubmit={() => lookUp(text)}
      /></div>}</div></div>;
  }
}
