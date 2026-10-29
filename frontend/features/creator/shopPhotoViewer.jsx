// src/features/creator/shopPhotoViewer.jsx
//
// AN ITEM'S PHOTOS, FULL SCREEN — SWIPE, PINCH, DOWNLOAD, SHARE.
//
// "On tap item photo open, with a side download button also." Before this,
// a photo opened only when an item had more than one, and then as a still
// picture with no way to keep it. Now every photo opens on tap, and the
// viewer carries:
//
//   - swipe left / right between that item's photos (and arrows on a
//     keyboard), with thumbnails underneath to jump;
//   - pinch to zoom, double-tap to zoom in or back out, drag to look
//     around while zoomed;
//   - Download and Share on the right-hand side, where a thumb holding the
//     phone already rests;
//   - the item's name and price under the picture. The price is GeuFigure
//     on a white pill — the app's own figure, never restyled, as on every
//     other surface a shop controls.
//
// Share sends the photo itself where the phone can share files, and
// otherwise the shop's link with the item named, so the share sheet never
// opens to nothing. Download names the file after the shop and the item,
// so it is findable in a gallery later.
import { useState as useState63, useEffect as useEffect60, useRef as useRef36 } from "react";
import { Download as DownloadPhoto, Share2 as Share27, X as X18, ChevronLeft as ChevronLeft6, ChevronRight as ChevronRight11 } from "lucide-react";

var SHOP_PHOTO_MAX_ZOOM = 4;

// "रसोई Ghar" + "Shai panner" → "ghar-shai-panner-2.jpg".
//
// ASCII only, and that is measured, not cautious: a version that kept the
// Devanagari ("रसोई-ghar-…") was handed to Chromium, which threw the name
// away and saved the file as "download" — no shop, no item, and no
// extension, so a gallery would not even know it was a picture. Accents
// fold to their letters (Café → cafe); other scripts drop out, and a name
// with nothing left falls back to "gloobal-photo".
function shopPhotoFileName(shopName, title, index, mime) {
  const slug = (t) => String(t || "").normalize("NFKD").replace(/\p{M}+/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const base = [slug(shopName), slug(title)].filter(Boolean).join("-") || "gloobal-photo";
  const ext = /png/.test(mime || "") ? "png" : /webp/.test(mime || "") ? "webp" : "jpg";
  return `${base}-${index + 1}.${ext}`;
}

// A photo as a Blob, whether it is a data: URL (how item photos are
// stored) or an ordinary address.
async function shopPhotoBlob(src) {
  if (/^data:/.test(src)) {
    const comma = src.indexOf(",");
    const meta = src.slice(5, comma);
    const mime = meta.split(";")[0] || "image/jpeg";
    const body = src.slice(comma + 1);
    const bytes = /;base64/.test(meta)
      ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body));
    return new Blob([bytes], { type: mime });
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error("photo fetch failed");
  return res.blob();
}

function ShopPhotoViewer({ item, start = 0, shopName = "", shopSymbolId = "", ccyCode = "USD", lens = null, onClose, onToast }) {
  const shots = Array.isArray(item && item.photos) && item.photos.length
    ? item.photos
    : (item && item.photo ? [item.photo] : []);
  const [at, setAt] = useState63(Math.min(Math.max(0, start), Math.max(0, shots.length - 1)));
  const [zoom, setZoom] = useState63({ s: 1, x: 0, y: 0 });
  const [dragX, setDragX] = useState63(0);
  const [busy, setBusy] = useState63("");
  const pointers = useRef36(new Map());
  const gesture = useRef36(null);
  const lastTap = useRef36(0);

  const go = (n) => {
    const next = Math.min(Math.max(0, n), shots.length - 1);
    setAt(next);
    setZoom({ s: 1, x: 0, y: 0 });
  };

  useEffect60(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
      else if (e.key === "ArrowLeft") go(at - 1);
      else if (e.key === "ArrowRight") go(at + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, shots.length]);

  // ── TOUCH ─────────────────────────────────────────────────────────────
  // One finger: swipe between photos, or pan when zoomed in. Two fingers:
  // pinch. Pointer events, so a mouse drags the same way on a laptop.
  const onDown = (e) => {
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current = { kind: "pinch", d0: d || 1, s0: zoom.s, x0: zoom.x, y0: zoom.y };
    } else if (pts.length === 1) {
      gesture.current = { kind: zoom.s > 1 ? "pan" : "swipe", sx: e.clientX, sy: e.clientY, x0: zoom.x, y0: zoom.y, moved: false };
    }
  };

  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const pts = Array.from(pointers.current.values());
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const s = Math.min(SHOP_PHOTO_MAX_ZOOM, Math.max(1, g.s0 * (d / g.d0)));
      setZoom({ s, x: s === 1 ? 0 : g.x0, y: s === 1 ? 0 : g.y0 });
    } else if (g.kind === "pan") {
      g.moved = true;
      setZoom((z) => ({ ...z, x: g.x0 + (e.clientX - g.sx), y: g.y0 + (e.clientY - g.sy) }));
    } else {
      const dx = e.clientX - g.sx;
      if (Math.abs(dx) > 6) g.moved = true;
      // Resistance at the first and last photo, so the edge is felt.
      const edge = (at === 0 && dx > 0) || (at === shots.length - 1 && dx < 0);
      setDragX(edge ? dx * 0.3 : dx);
    }
  };

  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g && g.kind === "swipe") {
      const dx = e.clientX - g.sx;
      if (dx < -60) go(at + 1);
      else if (dx > 60) go(at - 1);
      setDragX(0);
      // A tap that did not move: double-tap zooms.
      if (!g.moved) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
    }
    if (g && g.kind === "pan" && !g.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) { setZoom({ s: 1, x: 0, y: 0 }); lastTap.current = 0; } else lastTap.current = now;
    }
    gesture.current = pointers.current.size === 1
      ? { kind: zoom.s > 1 ? "pan" : "swipe", sx: Array.from(pointers.current.values())[0].x, sy: Array.from(pointers.current.values())[0].y, x0: zoom.x, y0: zoom.y, moved: true }
      : null;
  };

  const download = async () => {
    const src = shots[at];
    if (!src || busy) return;
    setBusy("download");
    try {
      const blob = await shopPhotoBlob(src);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = shopPhotoFileName(shopName, item && item.title, at, blob.type);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      onToast && onToast("Photo saved");
    } catch (e) {
      onToast && onToast("Couldn't save this photo");
    }
    setBusy("");
  };

  const share = async () => {
    const src = shots[at];
    if (!src || busy) return;
    setBusy("share");
    const title = item && item.title ? `${item.title} · ${shopName}` : shopName;
    const link = buildGloobalPayUrl(shopSymbolId, "shop");
    const text = link ? `${title} on Gloobal` : title;
    try {
      const blob = await shopPhotoBlob(src);
      const file = typeof File !== "undefined"
        ? new File([blob], shopPhotoFileName(shopName, item && item.title, at, blob.type), { type: blob.type || "image/jpeg" })
        : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text: link ? `${text}\n${link}` : text });
        setBusy("");
        return;
      }
      // The picture cannot go through this phone's share sheet (most
      // installed PWAs on Android): send the shop's link instead, with the
      // item named, rather than nothing.
      if (navigator.share) {
        await navigator.share(link ? { title, text, url: link } : { title, text });
        setBusy("");
        return;
      }
      await navigator.clipboard.writeText(link ? `${text}\n${link}` : text);
      onToast && onToast("Link copied");
    } catch (e) {
      if (!(e && e.name === "AbortError")) onToast && onToast("Couldn't share this photo");
    }
    setBusy("");
  };

  if (!shots.length) return null;

  const side = (label, Icon, onClick, key) => <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    aria-label={label}
    disabled={Boolean(busy)}
    style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 5, border: "none",
      background: "none", padding: 0, cursor: busy ? "default" : "pointer", fontFamily: "inherit"
    }}
  ><span style={{
    width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.16)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
    display: "flex", alignItems: "center", justifyContent: "center", opacity: busy && busy !== key ? 0.5 : 1
  }}><Icon size={20} color="#fff" /></span><span style={{
    fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.88)"
  }}>{busy === key ? "…" : label}</span></button>;

  return <div
    role="dialog"
    aria-label={`Photos of ${item.title}`}
    style={{
      position: "absolute", inset: 0, zIndex: 8, background: "#0B0912",
      display: "flex", flexDirection: "column", overflow: "hidden", touchAction: "none"
    }}
  ><div style={{
    display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
    padding: "calc(14px + env(safe-area-inset-top, 0px)) 14px 8px"
  }}><button
    onClick={onClose}
    aria-label="Close photos"
    style={{
      width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
      background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><X18 size={18} color="#fff" /></button><span style={{
    flex: 1, minWidth: 0, color: "#fff", fontSize: 14, fontWeight: 700,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{shopName}</span>{shots.length > 1 ? <span style={{
    flexShrink: 0, color: "rgba(255,255,255,0.78)", fontSize: 12.5, fontWeight: 700,
    fontVariantNumeric: "tabular-nums", padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)"
  }}>{at + 1} / {shots.length}</span> : null}</div>

  <div
    onPointerDown={onDown}
    onPointerMove={onMove}
    onPointerUp={onUp}
    onPointerCancel={onUp}
    style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", cursor: zoom.s > 1 ? "grab" : "default" }}
  ><div style={{
    position: "absolute", inset: 0, display: "flex",
    transform: `translateX(calc(${-at * 100}% + ${dragX}px))`,
    transition: dragX ? "none" : "transform 0.28s cubic-bezier(.2,.8,.2,1)"
  }}>{shots.map((src, i) => <div key={i} style={{
    flex: "0 0 100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    padding: "6px 72px 6px 16px", boxSizing: "border-box"
  }}><img
    src={src}
    alt={i === at ? item.title : ""}
    draggable={false}
    style={{
      maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", borderRadius: 14,
      userSelect: "none", pointerEvents: "none",
      transform: i === at ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` : "none",
      transition: gesture.current ? "none" : "transform 0.2s ease"
    }}
  /></div>)}</div>{
    /* Arrows for a mouse; a finger swipes. */
    shots.length > 1 && at > 0 ? <button
      onClick={() => go(at - 1)}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Previous photo"
      style={{
        position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 34, height: 34,
        borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}
    ><ChevronLeft6 size={18} color="#fff" /></button> : null
  }{
    /* ── THE SIDE BUTTONS ─────────────────────────────────────────────
       On the right, vertically centred: where the thumb of the hand
       holding the phone already is. */
  }<div
    onPointerDown={(e) => e.stopPropagation()}
    style={{
      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
      display: "flex", flexDirection: "column", gap: 18, zIndex: 2
    }}
  >{side("Download", DownloadPhoto, download, "download")}{side("Share", Share27, share, "share")}{
    shots.length > 1 && at < shots.length - 1 ? <button
      onClick={() => go(at + 1)}
      aria-label="Next photo"
      style={{
        alignSelf: "center", width: 34, height: 34, borderRadius: "50%", border: "none",
        background: "rgba(255,255,255,0.14)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}
    ><ChevronRight11 size={18} color="#fff" /></button> : null
  }</div></div>

  <div style={{
    flexShrink: 0, padding: "10px 16px calc(18px + env(safe-area-inset-bottom, 0px))",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 10
  }}><div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: "100%" }}><span style={{
    minWidth: 0, color: "#fff", fontSize: 15, fontWeight: 800,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{item.title}</span>{item.price != null ? <span style={{
    flexShrink: 0, background: "#fff", borderRadius: 999, padding: "4px 10px"
  }}><GeuFigure amount={item.price} currency={item.currency || ccyCode} lens={lens} size={12} /></span> : null}</div>{
    shots.length > 1 ? <div style={{ display: "flex", gap: 8, overflowX: "auto", maxWidth: "100%", padding: "2px" }}>{shots.map((src, i) => <button
      key={i}
      onClick={() => go(i)}
      aria-label={`Photo ${i + 1} of ${shots.length}`}
      aria-current={i === at}
      style={{
        flexShrink: 0, width: 48, height: 48, borderRadius: 12, border: "none", padding: 0, cursor: "pointer",
        overflow: "hidden", opacity: i === at ? 1 : 0.45,
        boxShadow: i === at ? "0 0 0 2px #fff" : "none"
      }}
    ><img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></button>)}</div> : null
  }<div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10.5, fontWeight: 600 }}>{shots.length > 1 ? "Swipe for more · pinch or double-tap to zoom" : "Pinch or double-tap to zoom"}</div></div></div>;
}
