// src/components/common/savedCopyBanner.jsx
import { useState as useState98, useEffect as useEffect95 } from "react";

// ── "THIS IS THE PHONE'S SAVED COPY" ────────────────────────────────────
//
// httpClient answers some reads from the phone's saved copy (localCopy.js)
// and says so with an event. This turns those into one small notice, so an
// old balance is never mistaken for a live one:
//
//   Updating…               the phone's copy is showing; the server's answer
//                           is on its way and the screen redraws when it lands
//   Offline · saved 10:42   the server can't be reached; this is the copy
//                           from 10:42
//
// It goes away by itself on the next live answer from the server.

function savedCopyTimeLabel(at) {
  try {
    const d = new Date(at);
    const sameDay = new Date().toDateString() === d.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return sameDay ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
  } catch (e) {
    return "";
  }
}

function SavedCopyBanner() {
  // { mode: "updating" | "offline", at } or null
  const [state, setState] = useState98(null);
  useEffect95(() => {
    if (typeof window === "undefined") return undefined;
    const oldest = (prev, at) => (prev && prev.at ? Math.min(prev.at, at) : at);
    const onOffline = (e) => {
      const at = e && e.detail && e.detail.at;
      if (at) setState((prev) => ({ mode: "offline", at: oldest(prev, at) }));
    };
    const onUpdating = (e) => {
      const at = e && e.detail && e.detail.at;
      // "Offline" outranks "Updating": once the server has failed, saying it
      // is on its way would be wrong.
      if (at) setState((prev) => (prev && prev.mode === "offline" ? prev : { mode: "updating", at: oldest(prev, at) }));
    };
    const onLive = () => setState(null);
    window.addEventListener(GLOOBAL_LOCAL_COPY_EVENT, onOffline);
    window.addEventListener(GLOOBAL_LOCAL_COPY_UPDATING_EVENT, onUpdating);
    window.addEventListener(GLOOBAL_LOCAL_COPY_LIVE_EVENT, onLive);
    window.addEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onLive);
    return () => {
      window.removeEventListener(GLOOBAL_LOCAL_COPY_EVENT, onOffline);
      window.removeEventListener(GLOOBAL_LOCAL_COPY_UPDATING_EVENT, onUpdating);
      window.removeEventListener(GLOOBAL_LOCAL_COPY_LIVE_EVENT, onLive);
      window.removeEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onLive);
    };
  }, []);
  if (!state) return null;
  const offline = state.mode === "offline";
  return (
    <div
      data-testid="saved-copy-banner"
      data-mode={state.mode}
      role="status"
      style={{
        position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 8px)", left: "50%", transform: "translateX(-50%)",
        zIndex: 9000, background: offline ? "#1f2937" : "rgba(31,41,55,0.85)", color: "#fff", borderRadius: 999, padding: "7px 14px",
        fontSize: 12.5, fontWeight: 600, boxShadow: "0 6px 18px rgba(0,0,0,.25)", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 8, pointerEvents: "none"
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 8, background: offline ? "#f59e0b" : "#60a5fa" }} />
      {offline ? `Offline · saved at ${savedCopyTimeLabel(state.at)}` : "Updating…"}
    </div>
  );
}
