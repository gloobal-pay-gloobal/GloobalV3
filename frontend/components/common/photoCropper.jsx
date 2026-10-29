// src/components/common/photoCropper.jsx
//
// CROP A PHOTO BEFORE IT IS UPLOADED.
//
// The founder: "during uploading photos give them crop option also" — for
// the shop logo, the cover, item photos and the profile photo. Every one of
// those pickers now hands the chosen picture to requestPhotoCrop() before it
// is resized and sent:
//
//   const cropped = await requestPhotoCrop(dataUrl, "square");
//   if (!cropped) return;      // they tapped Cancel
//
// The picture sits behind a fixed frame in the shape it will be shown in —
// a square for a logo or an item, a wide banner for a cover, a circle for a
// face. Drag to move it, pinch (or the slider) to zoom, Rotate turns it a
// quarter, Reset puts it back. The frame is always filled: the picture can
// never be dragged so far that an empty edge would be uploaded.
//
// One host, mounted once at the root (PhotoCropHost in __artifactEntry), so
// any picker anywhere can ask without owning a modal of its own, and the
// cropper always paints above whatever sheet asked for it.
import { useState as useState69, useEffect as useEffect66, useRef as useRef40 } from "react";
import { RotateCw as CropRotate, X as X23, Check as Check12 } from "lucide-react";

// Shapes: the frame's width / height, the size of the picture it makes,
// and whether the frame is drawn round.
var PHOTO_CROP_SHAPES = {
  square: { aspect: 1, outW: 900, outH: 900, round: false, title: "Crop to a square" },
  wide: { aspect: 2, outW: 1400, outH: 700, round: false, title: "Crop the cover" },
  circle: { aspect: 1, outW: 720, outH: 720, round: true, title: "Crop your photo" }
};

var PHOTO_CROP_QUEUE = [];
var PHOTO_CROP_LISTENERS = new Set();

// Opens the cropper and resolves with the cropped picture as a JPEG data
// URL, or null when it is cancelled. With no host mounted (a test, a page
// that never mounted one) it resolves with the picture unchanged, so a
// picker can always await it.
function requestPhotoCrop(dataUrl, shape = "square") {
  if (!dataUrl) return Promise.resolve(null);
  if (!PHOTO_CROP_LISTENERS.size) return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    PHOTO_CROP_QUEUE.push({ dataUrl, shape: PHOTO_CROP_SHAPES[shape] ? shape : "square", resolve });
    PHOTO_CROP_LISTENERS.forEach((fn) => fn());
  });
}

// The largest offset the picture may move from the centre on each axis
// while still covering the frame.
function photoCropLimits(natW, natH, rot, scale, fw, fh) {
  const turned = rot % 180 !== 0;
  const w = (turned ? natH : natW) * scale;
  const h = (turned ? natW : natH) * scale;
  return { x: Math.max(0, (w - fw) / 2), y: Math.max(0, (h - fh) / 2) };
}

// The smallest scale at which the picture covers the frame.
function photoCropCoverScale(natW, natH, rot, fw, fh) {
  const turned = rot % 180 !== 0;
  const w = turned ? natH : natW;
  const h = turned ? natW : natH;
  return Math.max(fw / w, fh / h);
}

function PhotoCropHost() {
  const [job, setJob] = useState69(null);
  useEffect66(() => {
    const next = () => setJob((cur) => cur || PHOTO_CROP_QUEUE.shift() || null);
    PHOTO_CROP_LISTENERS.add(next);
    next();
    return () => { PHOTO_CROP_LISTENERS.delete(next); };
  }, []);
  if (!job) return null;
  const finish = (result) => {
    job.resolve(result);
    setJob(PHOTO_CROP_QUEUE.shift() || null);
  };
  return <PhotoCropper key={job.dataUrl.length + job.shape} dataUrl={job.dataUrl} shape={job.shape} onDone={finish} />;
}

function PhotoCropper({ dataUrl, shape, onDone }) {
  const spec = PHOTO_CROP_SHAPES[shape] || PHOTO_CROP_SHAPES.square;
  const stage = useRef40(null);
  const [img, setImg] = useState69(null);
  const [frame, setFrame] = useState69({ w: 300, h: 300 });
  const [rot, setRot] = useState69(0);
  const [zoom, setZoom] = useState69(1);
  const [pos, setPos] = useState69({ x: 0, y: 0 });
  const [busy, setBusy] = useState69(false);
  const pointers = useRef40(new Map());
  const pinch = useRef40(null);

  // The picture, decoded once.
  useEffect66(() => {
    let live = true;
    const im = new Image();
    im.onload = () => { if (live) setImg(im); };
    im.onerror = () => { if (live) onDone(dataUrl); };
    im.src = dataUrl;
    return () => { live = false; };
  }, [dataUrl]);

  // The frame fits the screen: as wide as it can be with a margin, and no
  // taller than half the screen.
  useEffect66(() => {
    const measure = () => {
      const el = stage.current;
      const W = Math.max(200, (el && el.clientWidth) || 360) - 40;
      const H = Math.max(200, (el && el.clientHeight) || 500) - 40;
      let w = Math.min(W, 420);
      let h = w / spec.aspect;
      if (h > H) { h = H; w = h * spec.aspect; }
      setFrame({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [shape]);

  // Lock the page behind while cropping, and hide the floating map button.
  useEffect66(() => {
    window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: true } }));
    return () => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: false } }));
  }, []);

  const natW = img ? img.naturalWidth : 1;
  const natH = img ? img.naturalHeight : 1;
  const base = photoCropCoverScale(natW, natH, rot, frame.w, frame.h);
  const scale = base * zoom;
  const clamp = (p, z = zoom, r = rot) => {
    const lim = photoCropLimits(natW, natH, r, photoCropCoverScale(natW, natH, r, frame.w, frame.h) * z, frame.w, frame.h);
    return { x: Math.max(-lim.x, Math.min(lim.x, p.x)), y: Math.max(-lim.y, Math.min(lim.y, p.y)) };
  };

  const setZoomTo = (z) => {
    const nz = Math.max(1, Math.min(4, z));
    setZoom(nz);
    setPos((p) => clamp(p, nz));
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
    }
  };
  const onMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoomTo(pinch.current.zoom * (d / pinch.current.d));
      return;
    }
    setPos((p) => clamp({ x: p.x + (now.x - prev.x), y: p.y + (now.y - prev.y) }));
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onWheel = (e) => { setZoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };

  const rotate = () => {
    const r = (rot + 90) % 360;
    setRot(r);
    // The offset is on the screen, not on the picture, so it stays put and
    // is only pulled back inside the new limits.
    setPos((p) => clamp(p, zoom, r));
  };
  const reset = () => { setRot(0); setZoom(1); setPos({ x: 0, y: 0 }); };

  // The frame's contents, drawn at the size the picture is shown in.
  const use = () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = spec.outW;
      canvas.height = spec.outH;
      const ctx = canvas.getContext("2d");
      const k = spec.outW / frame.w;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, spec.outW, spec.outH);
      ctx.translate(spec.outW / 2 + pos.x * k, spec.outH / 2 + pos.y * k);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale * k, scale * k);
      ctx.drawImage(img, -natW / 2, -natH / 2);
      onDone(canvas.toDataURL("image/jpeg", 0.92));
    } catch (e) {
      onDone(dataUrl);
    }
  };

  const btn = (primary) => ({
    flex: primary ? 2 : 1, height: 50, borderRadius: 15, border: "none", cursor: "pointer", fontFamily: "inherit",
    fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: primary ? T.gradButton : "rgba(255,255,255,0.12)", color: "#fff"
  });

  return <div
    role="dialog"
    aria-modal="true"
    aria-label={spec.title}
    data-photo-cropper=""
    style={{
      position: "fixed", inset: 0, zIndex: 20000, background: "#0E0C16", display: "flex", flexDirection: "column",
      fontFamily: T.fontBody, color: "#fff", userSelect: "none", WebkitUserSelect: "none"
    }}
  ><div style={{
    display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 10px"
  }}><button
    onClick={() => onDone(null)}
    aria-label="Cancel"
    style={{
      width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.12)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><X23 size={18} color="#fff" /></button><span style={{ flex: 1, fontSize: 16, fontWeight: 800, fontFamily: T.fontDisplay }}>{spec.title}</span><button
    onClick={reset}
    style={{ border: "none", background: "none", color: "rgba(255,255,255,0.8)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
  >Reset</button></div><div
    ref={stage}
    onPointerDown={onDown}
    onPointerMove={onMove}
    onPointerUp={onUp}
    onPointerCancel={onUp}
    onWheel={onWheel}
    style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", touchAction: "none", cursor: "grab" }}
  >{img ? <img
    src={dataUrl}
    alt=""
    draggable={false}
    style={{
      position: "absolute", left: "50%", top: "50%", width: natW, height: natH, maxWidth: "none",
      transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg) scale(${scale})`,
      transformOrigin: "center", pointerEvents: "none"
    }}
  /> : null}<div
    aria-hidden="true"
    data-crop-frame=""
    style={{
      position: "absolute", left: "50%", top: "50%", width: frame.w, height: frame.h, transform: "translate(-50%, -50%)",
      borderRadius: spec.round ? "50%" : 14, boxShadow: "0 0 0 9999px rgba(14,12,22,0.66)",
      outline: "2px solid rgba(255,255,255,0.9)", outlineOffset: -1, pointerEvents: "none"
    }}
  ><div style={{
    position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden",
    backgroundImage: "linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)",
    backgroundSize: `${frame.w / 3}px ${frame.h / 3}px`, backgroundPosition: "-1px -1px", opacity: 0.6
  }} /></div></div><div style={{ padding: "12px 20px 4px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Zoom</span><input
    id="photo-crop-zoom"
    type="range"
    min={1}
    max={4}
    step={0.01}
    value={zoom}
    onChange={(e) => setZoomTo(Number(e.target.value))}
    aria-label="Zoom"
    style={{ flex: 1, accentColor: "#A78BFA" }}
  /><button
    onClick={rotate}
    aria-label="Rotate"
    style={{
      width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.12)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><CropRotate size={18} color="#fff" /></button></div><div style={{
    textAlign: "center", fontSize: 12, fontWeight: 600, opacity: 0.6, padding: "2px 20px 8px"
  }}>Drag to move · pinch or slide to zoom</div><div style={{
    display: "flex", gap: 10, padding: "6px 16px calc(16px + env(safe-area-inset-bottom, 0px))"
  }}><button onClick={() => onDone(null)} style={btn(false)}>Cancel</button><button onClick={use} disabled={!img || busy} style={btn(true)}><Check12 size={18} strokeWidth={2.8} />Use photo</button></div></div>;
}
