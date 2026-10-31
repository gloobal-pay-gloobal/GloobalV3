// src/features/creator/shopPhotoPicker.jsx
//
// PICKING A PHOTO, ONCE, FOR EVERYTHING THAT TAKES ONE.
//
// A shop has three kinds of picture — the cover across the top, the mark,
// and a photo on each product — and all three go to routes that validate
// them identically: JPEG or PNG only, magic bytes checked, 200 KB, SVG
// refused. There is no reason for three pickers, and three pickers is three
// places for the resize step to be forgotten.
//
// ── WHY IT RESIZES BEFORE IT UPLOADS ────────────────────────────────────
//
// A phone camera produces four or five megabytes. The cap is 200 KB. Sending
// the original and letting the server say no is a long upload on a bad
// connection that ends in "too big", which is a true message and a useless
// one — the person did not choose the size, their camera did.
//
// fitProfilePhotoForUpload steps the longest edge and the JPEG quality down
// until it fits, and is the same function the profile photo has always used.
// Reusing it means a cover and a face are compressed by one rule.
import { useRef as useRef31, useState as useState56 } from "react";
import { ImagePlus, X as X13 } from "lucide-react";

// A hidden file input and whatever the caller wants to draw as the control.
//
// `onPicked` is handed a data URL already small enough to send. A failure to
// read or decode calls `onError` with a sentence rather than throwing, so a
// picker inside a sheet cannot take the sheet down with it.
// `crop` ("square" | "wide" | "circle") opens the cropper first
// (photoCropper.jsx); Cancel there picks nothing.
function ShopPhotoPicker({ id, onPicked, onError, disabled, children, crop = "" }) {
  const input = useRef31(null);
  const [busy, setBusy] = useState56(false);

  const take = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const raw = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      // The server refuses anything that is not a JPEG or PNG, and refuses
      // SVG specifically because it can carry script. Saying so here saves
      // a round trip and says it in words a person can act on.
      if (!/^data:image\/(jpeg|png);base64,/i.test(raw)) {
        if (onError) onError("That has to be a JPEG or a PNG.");
        setBusy(false);
        return;
      }
      let chosen = raw;
      if (crop && typeof requestPhotoCrop === "function") {
        chosen = await requestPhotoCrop(raw, crop);
        if (!chosen) {
          setBusy(false);
          if (input.current) input.current.value = "";
          return;
        }
      }
      const fitted = typeof fitProfilePhotoForUpload === "function"
        ? await fitProfilePhotoForUpload(chosen)
        : chosen;
      if (onPicked) await onPicked(fitted);
    } catch (e) {
      if (onError) onError("Could not read that photo.");
    }
    setBusy(false);
    // Cleared so picking the SAME file twice still fires a change event —
    // which is what happens when somebody re-crops and tries again.
    if (input.current) input.current.value = "";
  };

  return <>
    <input
      id={id}
      ref={input}
      type="file"
      accept="image/jpeg,image/png"
      onChange={(e) => take(e.target.files && e.target.files[0])}
      style={{ display: "none" }}
    />
    <button
      onClick={() => input.current && input.current.click()}
      disabled={disabled || busy}
      style={{
        border: "none", background: "none", padding: 0, cursor: disabled || busy ? "default" : "pointer",
        width: "100%", fontFamily: "inherit", textAlign: "inherit", opacity: busy ? 0.6 : 1
      }}
    >{typeof children === "function" ? children(busy) : children}</button>
  </>;
}

// The cover's own control: the photo if there is one, a drop target if not,
// and a slider for where the crop sits.
//
// The crop is stored as a percentage rather than baked into the image, so
// dragging it never re-encodes — a photo nudged five times would otherwise
// be five generations of JPEG loss away from the one that was taken.
function ShopCoverPicker({ cover, onPick, onMove, onRemove, onError, accent }) {
  const photo = cover && cover.photo;
  const focusY = Number(cover && cover.focusY);
  const y = Number.isFinite(focusY) ? focusY : 50;

  return <div><div style={{
    position: "relative", borderRadius: 18, overflow: "hidden",
    height: 150, background: T.surfaceAlt
  }}>{photo
    ? <img
      src={photo}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `50% ${y}%`, display: "block" }}
    />
    : <ShopPhotoPicker id="shop-cover-input" crop="wide" onPicked={onPick} onError={onError}>{(busy) => <span style={{
      height: 150, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 8, color: T.inkFaint
    }}><span style={{
      width: 44, height: 44, borderRadius: 15, background: T.accentSoft, color: T.accent,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}><ImagePlus size={19} /></span><span style={{
      fontSize: 12, fontWeight: 700, color: T.accent
    }}>{busy ? "Working…" : "Add a cover photo"}</span><span style={{
      fontSize: 10.5, fontWeight: 600
    }}>A photo of the place works better than one product</span></span>}</ShopPhotoPicker>
  }{photo ? <button
    onClick={onRemove}
    aria-label="Remove the cover photo"
    style={{
      position: "absolute", top: 9, right: 9, width: 28, height: 28, borderRadius: "50%",
      background: `rgba(${T.inkRgb},0.6)`, border: "none", cursor: "pointer", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><X13 size={13} /></button> : null}</div>
  {photo ? <div style={{ marginTop: 11 }}><label htmlFor="shop-cover-focus" style={{
    display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7,
    textTransform: "uppercase", color: T.inkFaint, marginBottom: 7
  }}>Which part of it shows</label><input
    id="shop-cover-focus"
    type="range"
    min="0"
    max="100"
    value={y}
    onChange={(e) => onMove && onMove(Number(e.target.value))}
    style={{ width: "100%", accentColor: accent || T.accent }}
  /></div> : null}</div>;
}

var SHOP_ITEM_PHOTOS_MAX = 4;

// EVERY PICTURE OF ONE THING, COVER FIRST.
//
// A strip of what has been added, plus a tile to add another. The first one
// is labelled, because "first is the cover" is a rule nobody can see — and
// a person who wants a different cover should not have to delete three
// photos to get it, so any photo can be promoted in one tap.
//
// Reordering is "Make cover" rather than drag. On a 62px thumbnail inside a
// sheet that itself scrolls, a drag gesture fights the scroll and loses; a
// tap on the photo you want is unambiguous and works with one thumb.
function ShopItemPhotos({ photos, onChange, onError, accent }) {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  const full = list.length >= SHOP_ITEM_PHOTOS_MAX;
  const ink = accent || T.accent;

  return <div style={{ marginBottom: 12 }}><div style={{
    display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8
  }}><span style={{
    fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkFaint
  }}>Photos</span><span style={{
    fontSize: 10.5, fontWeight: 700, color: T.inkFaint
  }}>{list.length ? `${list.length} of ${SHOP_ITEM_PHOTOS_MAX} · first is the cover` : "Optional"}</span></div>

  <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>{list.map((src, i) => <span
    key={`${i}-${src.slice(-24)}`}
    style={{ position: "relative", width: 74, height: 74, flexShrink: 0 }}
  ><img
    src={src}
    alt=""
    style={{ width: 74, height: 74, borderRadius: 16, objectFit: "cover", display: "block" }}
  />{i === 0 ? <span style={{
    position: "absolute", left: 0, right: 0, bottom: 0, background: `rgba(${T.inkRgb},0.62)`,
    color: "#fff", fontSize: 8, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
    textAlign: "center", padding: "3px 0", borderRadius: "0 0 16px 16px"
  }}>Cover</span> : <button
    onClick={() => onChange([src].concat(list.filter((_, k) => k !== i)))}
    aria-label="Make this the cover"
    style={{
      position: "absolute", left: 0, right: 0, bottom: 0, background: `rgba(${T.inkRgb},0.62)`,
      color: "#fff", fontSize: 8, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
      textAlign: "center", padding: "3px 0", borderRadius: "0 0 16px 16px", border: "none", cursor: "pointer"
    }}
  >Make cover</button>}<button
    onClick={() => onChange(list.filter((_, k) => k !== i))}
    aria-label="Remove this photo"
    style={{
      position: "absolute", top: 4, right: 4, width: 19, height: 19, borderRadius: "50%",
      background: `rgba(${T.inkRgb},0.66)`, border: "none", cursor: "pointer", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><X13 size={10} /></button></span>)}{
    full ? null : <span style={{ width: 74, height: 74, flexShrink: 0 }}><ShopPhotoPicker
      id={`shop-item-photo-${list.length}`}
      crop="square"
      onError={onError}
      onPicked={(photo) => onChange(list.concat([photo]).slice(0, SHOP_ITEM_PHOTOS_MAX))}
    >{(busy) => <span style={{
      width: 74, height: 74, borderRadius: 16, border: `1.6px dashed ${T.line}`,
      background: T.surface, color: ink, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 2
    }}><ImagePlus size={17} /><span style={{ fontSize: 8.5, fontWeight: 800 }}>{busy ? "…" : "Add"}</span></span>}</ShopPhotoPicker></span>
  }</div></div>;
}
