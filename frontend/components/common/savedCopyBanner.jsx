// src/components/common/savedCopyBanner.jsx
import { useState as useState98, useEffect as useEffect95 } from "react";
import { WifiOff as OfflineWifiOff, RefreshCw as OfflineRefresh } from "lucide-react";

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

// The offline mark: a crossed-out signal in an amber disc. Used by the pill
// at the top and by any card that is showing the phone's saved copy, so
// "offline" looks the same everywhere. (It was a bare amber dot, which read
// as a status light, not as "no connection".)
function OfflineMark({ size = 22, updating = false }) {
  const Icon = updating ? OfflineRefresh : OfflineWifiOff;
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: updating ? "#3b82f6" : "#f59e0b", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 3px rgba(255,255,255,0.12)" }}><Icon size={Math.round(size * 0.58)} color="#fff" strokeWidth={2.6} /></span>;
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
  // "Updating…" is a promise that the server's answer is on its way. If
  // nothing has arrived in 75 s (a 45 s request, a retry, and room), the
  // promise is broken: say so, as "Offline", rather than keep promising.
  useEffect95(() => {
    if (!state || state.mode !== "updating") return undefined;
    const t = setTimeout(() => setState((prev) => (prev && prev.mode === "updating" ? { ...prev, mode: "offline" } : prev)), 75000);
    return () => clearTimeout(t);
  }, [state && state.mode]);
  if (!state) return null;
  const offline = state.mode === "offline";
  return (
    <div
      data-testid="saved-copy-banner"
      data-mode={state.mode}
      role="status"
      style={{
        position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 8px)", left: "50%", transform: "translateX(-50%)",
        zIndex: 9000, background: offline ? "#1f2937" : "rgba(31,41,55,0.85)", color: "#fff", borderRadius: 999, padding: "6px 14px 6px 6px",
        fontSize: 12.5, fontWeight: 600, boxShadow: "0 6px 18px rgba(0,0,0,.25)", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 8, pointerEvents: "none"
      }}
    >
      <OfflineMark size={20} updating={!offline} />
      {offline ? `Offline · saved at ${savedCopyTimeLabel(state.at)}` : "Updating…"}
    </div>
  );
}
