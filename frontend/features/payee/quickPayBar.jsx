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
import { useState as useState67, useRef as useRef39 } from "react";
import { ArrowRight as ArrowRight4, Loader as Loader8, X as X22, Store as Store6 } from "lucide-react";

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

function QuickPayBar({ myGloobalId = "", dialCode = "", onOpenCoverage, onPayPerson, onPayCreator, onOpenShop }) {
  const [text, setText] = useState67("");
  const [busy, setBusy] = useState67(false);
  const [found, setFound] = useState67(null);
  const [error, setError] = useState67("");
  const seq = useRef39(0);

  const reset = () => { setFound(null); setError(""); };

  const lookUp = async (input) => {
    const what = quickPayClassify(input === undefined ? text : input);
    if (!what) return;
    if (what.kind === "unknown") {
      setFound(null);
      setError("Paste a Gloobal ID, a pay link, a mobile number or a creator name.");
      return;
    }
    const mine = seq.current + 1;
    seq.current = mine;
    setBusy(true);
    setError("");
    setFound(null);
    let result = null;
    let problem = "";
    try {
      if (what.kind === "name") {
        const creator = await GloobalApi.resolveCreatorHandle(what.value);
        if (creator) result = { kind: "creator", creator };
        else problem = "No creator has that name. Check the spelling, or search shops in Pay & Services.";
      } else {
        const id = what.kind === "mobile" ? quickPayMobile(what.value, dialCode) : what.value;
        const user = await GloobalApi.resolveUser(id);
        if (!user || !user.symbolId) {
          problem = "No one on Gloobal matches that.";
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
              name: user.fullName && !user.nameIsMobile ? user.fullName : "Gloobal User",
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
      problem = notFound ? "No one on Gloobal matches that." : ((err && err.message) || "Couldn't check that just now. Try again.");
    }
    if (seq.current !== mine) return;
    setBusy(false);
    const id = result && (result.kind === "creator" ? result.creator.symbolId : result.payee.gloobalId);
    if (id && myGloobalId && id === myGloobalId) {
      setError("That's you.");
      return;
    }
    if (result) setFound(result); else setError(problem);
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
  `}</style><div style={{
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
    placeholder="Paste ID, mobile or name"
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
  }{card}</div>;
}
