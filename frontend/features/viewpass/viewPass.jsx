// src/features/viewpass/viewPass.jsx
//
// No open links. People's pictures and videos (Social posts, ads, Used
// listings) are served only with a view pass: 15 minutes long, given to a
// signed-in account (server/lib/viewPass.js, GET /api/social/pass). Every
// <img>/<video> of such content takes its address through gloobalSealedSrc,
// which adds the pass — and gives no address at all while there is none,
// so nothing is ever asked for anonymously. Shared by GLOOBAL and Helloo
// (Helloo hands over its own HTTP client with gloobalViewPassUse).
// Pay QRs are the exception and do not come through here.
//
// A pass is given only within five minutes of the phone's own fingerprint /
// face check (server/lib/viewCheck.js). Until then the server answers
// "person_check", and screens show GloobalSealedGate: "Confirm it's you".
import { useState as useStateVp, useEffect as useEffectVp } from "react";
import { Fingerprint as VpPrint, Lock as VpLock } from "lucide-react";

var gloobalViewPass = { pass: "", exp: 0, wait: null, http: null, subs: new Set(), needCheck: false };
// A picture with no address yet (no pass) is a blank space, not a broken
// image: hidden until its sealed address arrives. And every picture and
// video is for seeing only: download is off.
try {
  if (typeof document !== "undefined" && !document.getElementById("gloobal-sealed-style")) {
    const st = document.createElement("style"); st.id = "gloobal-sealed-style";
    // Seen, not downloaded: no long-press "Save image", no dragging a
    // picture out, no selecting it. (A screenshot can't be stopped by any
    // web app; that is said wherever it matters.)
    st.textContent = 'img[src=""],img:not([src]),video[src=""]{visibility:hidden}' +
      'img,video{-webkit-touch-callout:none;-webkit-user-drag:none;user-select:none;-webkit-user-select:none}';
    document.head.appendChild(st);
    // No "Save image / Download video" menu on any picture or video.
    document.addEventListener("contextmenu", (e) => { const t = e.target; if (t && (t.tagName === "IMG" || t.tagName === "VIDEO")) e.preventDefault(); }, true);
    document.addEventListener("dragstart", (e) => { const t = e.target; if (t && (t.tagName === "IMG" || t.tagName === "VIDEO")) e.preventDefault(); }, true);
  }
} catch (e) { /* no document (tests) */ }

// Which client asks for the pass (Helloo signs in with its own).
function gloobalViewPassUse(http) { gloobalViewPass.http = http || null; gloobalViewPass.pass = ""; gloobalViewPass.exp = 0; gloobalViewPass.needCheck = false; }
var gloobalViewPassHttp = () => gloobalViewPass.http || (typeof gloobalApiClient !== "undefined" ? gloobalApiClient : null);
var gloobalViewPassTell = () => gloobalViewPass.subs.forEach((f) => { try { f(gloobalViewPass.pass); } catch (e) { /* a screen gone */ } });

async function gloobalViewPassRefresh() {
  if (gloobalViewPass.pass && gloobalViewPass.exp - Date.now() > 30 * 1000) return gloobalViewPass.pass;
  if (gloobalViewPass.pass && gloobalViewPass.exp <= Date.now()) { gloobalViewPass.pass = ""; gloobalViewPassTell(); }
  if (!gloobalViewPass.wait) {
    const http = gloobalViewPassHttp();
    gloobalViewPass.wait = (http ? http.get("/api/social/pass") : Promise.reject(new Error("no client")))
      .then((r) => {
        gloobalViewPass.pass = (r && r.pass) || "";
        gloobalViewPass.exp = r && r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
        gloobalViewPass.needCheck = false;
        gloobalViewPassTell();
        return gloobalViewPass.pass;
      })
      .catch((e) => {
        // Not checked in the last five minutes: the screens ask for it.
        const code = (e && e.body && e.body.code) || (e && e.code) || "";
        if (code === "person_check" || (e && e.status === 403)) { gloobalViewPass.needCheck = true; gloobalViewPass.pass = ""; gloobalViewPassTell(); }
        return "";
      })
      .finally(() => { gloobalViewPass.wait = null; });
  }
  return gloobalViewPass.wait;
}

// The address to draw: our own content address plus the pass; a phone's
// own picture (blob:, data:) as it is; nothing while there is no pass.
function gloobalSealedSrc(url, pass) {
  if (!url) return "";
  const u = String(url);
  if (/^(blob:|data:)/i.test(u)) return u;
  const p = pass === undefined ? gloobalViewPass.pass : pass;
  if (!p) return "";
  const full = /^https?:/i.test(u) ? u : `${typeof GLOOBAL_API_BASE !== "undefined" ? GLOOBAL_API_BASE : ""}${u}`;
  return `${full}${full.includes("?") ? "&" : "?"}v=${encodeURIComponent(p)}`;
}

// For a screen that draws such content: the current pass, kept fresh, and
// a redraw when it arrives or is renewed.
function useGloobalViewPass() {
  const [pass, setPass] = useStateVp(gloobalViewPass.pass);
  useEffectVp(() => {
    const sub = (p) => setPass(p);
    gloobalViewPass.subs.add(sub);
    gloobalViewPassRefresh();
    const t = setInterval(() => { gloobalViewPassRefresh(); }, 60 * 1000);
    return () => { gloobalViewPass.subs.delete(sub); clearInterval(t); };
  }, []);
  return pass;
}

// The phone's fingerprint / face, then a fresh pass. → { ok } | { reason, setup? }
async function gloobalViewCheckNow() {
  const http = gloobalViewPassHttp();
  if (!http) return { reason: "Sign in first." };
  if (typeof gloobalWebAuthnAvailable === "function" && !gloobalWebAuthnAvailable()) return { reason: "This phone can't do fingerprint / Face ID here." };
  try {
    const options = await http.post("/api/view-check/options", {});
    const credential = await navigator.credentials.get({ publicKey: gloobalDecodeRequestOptions(options) });
    if (!credential) return { reason: "Cancelled." };
    await http.post("/api/view-check/verify", { response: gloobalEncodeAuthenticationCredential(credential) });
    gloobalViewPass.pass = ""; gloobalViewPass.exp = 0;
    await gloobalViewPassRefresh();
    return gloobalViewPass.pass ? { ok: true } : { reason: "Try again." };
  } catch (e) {
    const code = (e && e.body && e.body.code) || "";
    if (code === "passkey_required") return { reason: "Fingerprint / Face ID isn't on for your GLOOBAL account yet.", setup: true };
    if (e && e.name === "NotAllowedError") return { reason: "Cancelled or timed out. Try again." };
    return { reason: (e && e.body && e.body.message) || (e && e.message) || "Couldn't check it. Try again." };
  }
}

// Where people's pictures would be: shown while the person check is due.
function GloobalSealedGate({ onSetup }) {
  const pass = useGloobalViewPass();
  const [busy, setBusy] = useStateVp(false);
  const [msg, setMsg] = useStateVp(null);
  if (pass || !gloobalViewPass.needCheck) return null;
  const go = async () => { setBusy(true); setMsg(null); const r = await gloobalViewCheckNow(); setBusy(false); if (!r.ok) setMsg(r); };
  // In GLOOBAL itself it can be turned on right here (the passkey belongs
  // to GLOOBAL's site); Helloo sends the person to GLOOBAL (onSetup).
  const turnOn = async () => {
    setBusy(true);
    const e = typeof gloobalEnrolBiometric === "function" ? await gloobalEnrolBiometric() : { ok: false, reason: "Open GLOOBAL to turn it on." };
    if (!e.ok) { setBusy(false); setMsg({ reason: e.reason }); return; }
    const r = await gloobalViewCheckNow(); setBusy(false); setMsg(r.ok ? null : r);
  };
  return <div data-testid="sealed-gate" style={{ margin: "8px 14px 10px", padding: "14px 14px 12px", borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, display: "flex", flexDirection: "column", gap: 10, fontFamily: T.fontBody }}>
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, background: T.accentSoft || T.surfaceSunk, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><VpLock size={18} /></span>
      <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink }}>Confirm it's you to see photos and videos</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, lineHeight: 1.4, marginTop: 2 }}>On GLOOBAL every view belongs to a real person. Good for 5 minutes.</span></span>
    </div>
    <button data-testid="sealed-gate-go" onClick={go} disabled={busy} className="v2-tap" style={{ height: 44, borderRadius: 14, border: "none", background: T.gradButton || T.accent, color: "#fff", fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: busy ? "default" : "pointer", fontFamily: T.fontBody, opacity: busy ? 0.7 : 1 }}><VpPrint size={18} />{busy ? "Checking…" : "Fingerprint / Face ID"}</button>
    {msg ? <div data-testid="sealed-gate-msg" style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, textAlign: "center" }}>{msg.reason}{msg.setup ? <> <button data-testid="sealed-gate-setup" onClick={onSetup || turnOn} style={{ border: "none", background: "none", padding: 0, color: T.accent, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: T.fontBody }}>{onSetup ? "Open GLOOBAL to turn it on" : "Turn it on"}</button></> : null}</div> : null}
  </div>;
}
