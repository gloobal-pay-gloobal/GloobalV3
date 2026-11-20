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
import { useState as useStateVp, useEffect as useEffectVp } from "react";

var gloobalViewPass = { pass: "", exp: 0, wait: null, http: null, subs: new Set() };

// Which client asks for the pass (Helloo signs in with its own).
function gloobalViewPassUse(http) { gloobalViewPass.http = http || null; gloobalViewPass.pass = ""; gloobalViewPass.exp = 0; }

async function gloobalViewPassRefresh() {
  if (gloobalViewPass.pass && gloobalViewPass.exp - Date.now() > 2 * 60 * 1000) return gloobalViewPass.pass;
  if (!gloobalViewPass.wait) {
    const http = gloobalViewPass.http || (typeof gloobalApiClient !== "undefined" ? gloobalApiClient : null);
    gloobalViewPass.wait = (http ? http.get("/api/social/pass") : Promise.reject(new Error("no client")))
      .then((r) => {
        gloobalViewPass.pass = (r && r.pass) || "";
        gloobalViewPass.exp = r && r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
        gloobalViewPass.subs.forEach((f) => { try { f(gloobalViewPass.pass); } catch (e) { /* a screen gone */ } });
        return gloobalViewPass.pass;
      })
      .catch(() => "")
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
