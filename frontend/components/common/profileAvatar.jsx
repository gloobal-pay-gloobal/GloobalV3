// src/components/common/profileAvatar.jsx
import { useState as useState37, useState as useState38, useEffect as useEffect27 } from "react";
//
// The round profile photo every surface that shows a person draws — the scan
// card, the receipt, the notifications list — and the signed-in cache of
// OTHER people's photos read from the server.
//
// ── What counts as a photo ─────────────────────────────────────────────────
//
// Only a `data:image/...` URL. Photos are stored and served as data URLs on
// purpose: the Netlify CSP allows `data:` images but not the API origin, and
// a data URL keeps any canvas it is drawn onto (the shareable receipt image)
// untainted. Anything else — an http URL, a blob, an object — is not drawn.
//
// G_LOGO_DATA_URI is ALSO a data:image URL, and it is what the dashboard has
// long stored as "no photo chosen, use the logo". Drawing it as a photo would
// crop the logo with object-fit: cover onto a plain surface, so it is treated
// as "no photo" and gets the proper fallback instead.
//
// ── The fallback ───────────────────────────────────────────────────────────
//
// The same treatment the dashboard's logo circle uses: the brand gradient
// disc with the Gloobal mark in white (brightness(0) invert(1)), contained,
// with ~12% padding so the mark never touches the edge. Also used when a
// photo fails to decode (onError), so a broken image never shows.

function profileAvatarIsPhoto(photo) {
  return typeof photo === "string" && photo.startsWith("data:image/") && photo !== G_LOGO_DATA_URI;
}

function ProfileAvatar({ photo, name, size = 56, ring }) {
  // Keyed by the src that failed, not a boolean: a new photo arriving after a
  // broken one must get its own chance to load.
  const [failedSrc, setFailedSrc] = useState38(null);
  const showPhoto = profileAvatarIsPhoto(photo) && failedSrc !== photo;
  const displayName = typeof name === "string" && name.trim() ? name.trim() : "Gloobal user";
  const ringColor = ring ? (typeof ring === "string" ? ring : "#fff") : null;
  return <span
    data-testid="profile-avatar"
    data-avatar-state={showPhoto ? "photo" : "fallback"}
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      minWidth: size,
      borderRadius: "50%",
      // The photo is cropped to the circle here, not by the img.
      overflow: "hidden",
      flexShrink: 0,
      boxSizing: "border-box",
      background: showPhoto ? T.surface : T.gradWallet || T.accent,
      boxShadow: ringColor
        ? `0 0 0 2px ${ringColor}, 0 4px 10px rgba(76,29,149,0.16)`
        : "0 4px 10px rgba(76,29,149,0.16)"
    }}
  >{showPhoto
    ? <img
        src={photo}
        alt={`${displayName} profile photo`}
        width={size}
        height={size}
        onError={() => setFailedSrc(photo)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    : <img
        src={G_LOGO_DATA_URI}
        alt="Gloobal"
        width={size}
        height={size}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          padding: Math.max(2, Math.round(size * 0.12)),
          boxSizing: "border-box",
          display: "block",
          filter: "brightness(0) invert(1)"
        }}
      />}</span>;
}

// ── Counterparty photos ────────────────────────────────────────────────────
//
// symbolId → photo (string) | null (known: no photo) | Promise (in flight).
// One request per Gloobal ID per session, however many rows, receipts and
// cards ask at once: a second caller while the first is in flight gets the
// same promise.
//
// A FAILED read (cold start, offline, 5xx) is not cached — the entry is
// dropped so the next caller asks again — and resolves null for this caller.
// Caching it as null would hide somebody's photo for the rest of the session
// because the server was waking up the first time it was asked.
var COUNTERPARTY_PHOTO_CACHE = new Map();

function counterpartyPhotoKey(symbolId) {
  return typeof symbolId === "string" ? symbolId.trim() : "";
}

// undefined = not known yet (absent or in flight); otherwise photo | null.
function counterpartyPhotoPeek(key) {
  if (!key || !COUNTERPARTY_PHOTO_CACHE.has(key)) return undefined;
  const value = COUNTERPARTY_PHOTO_CACHE.get(key);
  return value && typeof value.then === "function" ? undefined : value;
}

// Usable outside React (the receipt image draws with it).
function loadCounterpartyPhoto(symbolId) {
  const key = counterpartyPhotoKey(symbolId);
  if (!key) return Promise.resolve(null);
  if (COUNTERPARTY_PHOTO_CACHE.has(key)) {
    const cached = COUNTERPARTY_PHOTO_CACHE.get(key);
    return cached && typeof cached.then === "function" ? cached : Promise.resolve(cached);
  }
  const pending = Promise.resolve()
    .then(() => GloobalApi.getUserPhoto(key))
    .then(
      (photo) => {
        const value = profileAvatarIsPhoto(photo) ? photo : null;
        // Only if this request is still the one on record — a sign-out
        // (clearCounterpartyPhotoCache) mid-flight must not be undone by it.
        if (COUNTERPARTY_PHOTO_CACHE.get(key) === pending) COUNTERPARTY_PHOTO_CACHE.set(key, value);
        return value;
      },
      () => {
        if (COUNTERPARTY_PHOTO_CACHE.get(key) === pending) COUNTERPARTY_PHOTO_CACHE.delete(key);
        return null;
      }
    );
  COUNTERPARTY_PHOTO_CACHE.set(key, pending);
  return pending;
}

// Sign-out: the next account must not see photos fetched under the last one.
function clearCounterpartyPhotoCache() {
  COUNTERPARTY_PHOTO_CACHE.clear();
}

function useCounterpartyPhoto(symbolId) {
  const key = counterpartyPhotoKey(symbolId);
  // The outcome of this hook's own load, for the case the cache cannot answer
  // afterwards (a failed read is deliberately not cached).
  const [settled, setSettled] = useState37({ key: null, photo: null });
  useEffect27(() => {
    if (!key || counterpartyPhotoPeek(key) !== undefined) return undefined;
    let alive = true;
    loadCounterpartyPhoto(key).then((photo) => {
      if (alive) setSettled({ key, photo });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  if (!key) return { photo: null, loading: false };
  const cached = counterpartyPhotoPeek(key);
  if (cached !== undefined) return { photo: cached, loading: false };
  if (settled.key === key) return { photo: settled.photo, loading: false };
  return { photo: null, loading: true };
}
