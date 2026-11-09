// src/components/common/savedCopyBanner.jsx
import { useState as useState98, useEffect as useEffect95 } from "react";

// ── "THIS IS THE PHONE'S SAVED COPY" ────────────────────────────────────
//
// When the server can't be reached, httpClient answers the account's own
// read-only views from the phone's saved copy (localCopy.js) and fires
// GLOOBAL_LOCAL_COPY_EVENT. This says so, with the time the copy was saved,
// so an old balance is never mistaken for a live one. It goes away by itself
// on the next live answer from the server, or when the phone is back online.

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
  const [savedAt, setSavedAt] = useState98(null);
  useEffect95(() => {
    if (typeof window === "undefined") return undefined;
    const onSaved = (e) => {
      const at = e && e.detail && e.detail.at;
      // Several screens can fall back at once; show the oldest copy's time.
      if (at) setSavedAt((prev) => (prev ? Math.min(prev, at) : at));
    };
    const onLive = () => setSavedAt(null);
    window.addEventListener(GLOOBAL_LOCAL_COPY_EVENT, onSaved);
    window.addEventListener(GLOOBAL_LOCAL_COPY_LIVE_EVENT, onLive);
    window.addEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onLive);
    return () => {
      window.removeEventListener(GLOOBAL_LOCAL_COPY_EVENT, onSaved);
      window.removeEventListener(GLOOBAL_LOCAL_COPY_LIVE_EVENT, onLive);
      window.removeEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onLive);
    };
  }, []);
  if (!savedAt) return null;
  return (
    <div
      data-testid="saved-copy-banner"
      role="status"
      style={{
        position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 8px)", left: "50%", transform: "translateX(-50%)",
        zIndex: 9000, background: "#1f2937", color: "#fff", borderRadius: 999, padding: "7px 14px",
        fontSize: 12.5, fontWeight: 600, boxShadow: "0 6px 18px rgba(0,0,0,.25)", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 8, pointerEvents: "none"
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 8, background: "#f59e0b" }} />
      Offline · saved at {savedCopyTimeLabel(savedAt)}
    </div>
  );
}
