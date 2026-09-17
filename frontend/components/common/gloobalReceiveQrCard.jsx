// src/components/common/gloobalReceiveQrCard.jsx
import { useState as useState36, useEffect as useEffect31 } from "react";
import { Copy as Copy4, Share2 as Share23 } from "lucide-react";
import { encode as uqrEncode } from "uqr";
// "Your Gloobal QR": a plain, static, UPI-style receive code. The payload is
// the pay link from backend/utils/gloobalPayLink.js — an account, no amount,
// no session — so the same code works printed, screenshotted or shared.
//
// The symbol is deliberately ordinary: square modules, standard finders,
// error-correction H, a 4-module quiet zone, and a small logo badge sized by
// GLOOBAL_QR_LOGO_FRACTION (≈7% of the area, well inside what H recovers).
// Every styling liberty a QR takes costs some phone somewhere a failed scan;
// this one takes one.
//
// ── The badge: white ring, coloured disc, white mark ─────────────────────
//
// The centre was a white rounded SQUARE with the logo in its own colours. It
// is now a circle, the mark is knocked out white, and the disc cycles through
// the brand palette every two seconds.
//
// The white ring is not decoration and is the reason this is safe. Whatever
// the disc's colour, the modules underneath it are gone and error correction
// has to rebuild them either way — but a DARK disc sitting straight against
// dark modules merges with them, and a decoder that cannot find the grid's
// edge fails to locate the code rather than misreading it. Keeping the white
// ring leaves the light gap the old square provided, and the circle inscribed
// in the same box covers 78.5% of what the square did, so this change
// strictly reduces the number of modules lost.

var GLOOBAL_QR_QUIET_ZONE = 4;

function buildGloobalQrMatrix(text) {
  try {
    const { size, data } = uqrEncode(text, { ecc: "H", border: 0 });
    return { size, data };
  } catch {
    return null;
  }
}

// The logo square, in modules, measured in the full (quiet-zone included)
// coordinate space. One helper so the SVG and the PNG draw the same square.
function gloobalQrLogoBox(size) {
  const total = size + GLOOBAL_QR_QUIET_ZONE * 2;
  const side = size * GLOOBAL_QR_LOGO_FRACTION;
  const offset = (total - side) / 2;
  const cx = offset + side / 2;
  // ring: the white halo, inscribed in the old square's box.
  // disc: the coloured badge inside it.
  // mark: the logo inside that.
  return {
    total, side, x: offset, y: offset, cx, cy: cx,
    ring: side / 2,
    disc: side / 2 * 0.84,
    mark: side / 2 * 0.84 * 1.06
  };
}

// ── The fourth corner ────────────────────────────────────────────────────
//
// Three corners of a QR carry finder patterns; the fourth carries nothing,
// and the GH2H mark from the Send and Receive tiles goes there.
//
// WHERE it goes was measured, not chosen. Centred on the symbol's own
// bottom-right 7×7 block — the position that mirrors a finder exactly — it
// lands on the version 5 alignment pattern, the 5×5 block centred two modules
// in from that corner. A decoder uses that pattern to correct perspective, so
// covering it does not cost error-correction capacity, it costs localisation:
// across 192 rasters (8 badge colours × 6 module scales × 4 blur levels) the
// bare code decoded 176 times, the mark on the block 138, and a SOLID dark
// mark on the block only 73.
//
// Moved two modules out, so its inner edge clears the alignment pattern and
// its outer edge overhangs into the quiet zone, the same 7-module circle
// decoded 184/192 — no worse than the code with no mark on it at all. That is
// the geometry below.
//
// It is also why the mark is mostly WHITE. A light badge reads to a decoder
// as a light region; a dark one merges with the modules around it, which is
// the difference between 184 and 73.
// Anchored by its OUTER edge, not its centre: the overhang past the symbol
// is what sets the mark in the corner, so resizing it should not slide it
// diagonally away. EDGE is how far past the symbol's own edge it reaches, in
// modules, out of a 4-module quiet zone.
//
// R was 3.5 — a 7-module circle, the size of a finder pattern — and read as
// a fourth finder rather than as a mark. At 2.8 it covers 64% of that area
// and still clears the alignment pattern by more than it did before, since
// shrinking it from a fixed outer edge only moves its inner edge outward.
// Measured at 176/192, which is the bare code's own rate: 3.1, 2.8, 2.5 and
// 2.2 all scored exactly that, so this is a free choice among sizes that
// cost the scan nothing.
var GLOOBAL_QR_CORNER_EDGE = 1.5;
var GLOOBAL_QR_CORNER_R = 2.8;

function gloobalQrCornerBadge(size) {
  const total = size + GLOOBAL_QR_QUIET_ZONE * 2;
  const edge = GLOOBAL_QR_QUIET_ZONE + size;
  const r = GLOOBAL_QR_CORNER_R;
  const c = edge + GLOOBAL_QR_CORNER_EDGE - r;
  return {
    total,
    cx: c,
    cy: c,
    r,
    // The ring, at the same fraction of the diameter as the 2px border on the
    // 22px GH2HFlipCircle the tiles draw.
    stroke: r * 2 * 0.09,
    font: r * 1.2
  };
}

// The mark's cycle comes from GH2H_LETTERS / GH2H_LETTER_COLORS in
// components/common/flipIcons.jsx — the same two arrays GH2HFlipCircle draws
// on the Send and Receive tiles. They are read here rather than restated:
// this IS that mark, and a second copy of the four letters is a second thing
// to remember to change.
//
// One difference, and it is deliberate. The tile's mark alternates each
// letter with a random dial symbol. This one does not: on something people
// photograph, a mark that spends half its life showing a stray "×" reads as
// noise ON the code rather than as a wordmark beside it.
function gloobalQrCornerFace(step) {
  const letters = typeof GH2H_LETTERS !== "undefined" ? GH2H_LETTERS : ["G", "H", "2", "H"];
  const colors = typeof GH2H_LETTER_COLORS !== "undefined"
    ? GH2H_LETTER_COLORS
    : ["#3B82F6", "#9333EA", "#059669", "#EC4899"];
  const i = ((Math.floor(step) % letters.length) + letters.length) % letters.length;
  return {
    letter: letters[i],
    // Through the same darkener the centre disc uses. These four were drawn
    // to sit ON white, not to be read against it — #3B82F6 measures 2.03:1 —
    // and the ring and the letter here are both a graphic on white.
    color: gloobalQrDiscInk(colors[i % colors.length])
  };
}

// A brand colour, darkened until a WHITE mark on it clears 3:1.
//
// Measured on the palette this cycles through: seven of the eight fail that
// floor as authored — #0891B2 is 2.11:1, #059669 2.15:1, #EA580C 2.19:1 —
// because they were chosen to sit on white, not to carry white. Only #DC2626
// passes untouched. Rather than hand-pick a second palette that drifts from
// the first, each colour is scaled down until it measures, so adding a colour
// to LOGO_FLIP_COLORS cannot quietly reintroduce an unreadable badge.
//
// 3:1 is the floor for a graphic that has to be read, and this mark is the
// one thing on the code a person looks at deliberately.
var GLOOBAL_QR_DISC_MAX_LUM = 80;

function gloobalQrDiscInk(hex) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return "#4C1D95";
  let r = parseInt(raw.slice(0, 2), 16);
  let g = parseInt(raw.slice(2, 4), 16);
  let b = parseInt(raw.slice(4, 6), 16);
  const lum = () => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Scaled rather than blended toward black: scaling keeps the hue and the
  // saturation, so the badge stays recognisably that brand colour instead of
  // walking toward grey.
  let guard = 0;
  while (lum() > GLOOBAL_QR_DISC_MAX_LUM && guard < 40) {
    r = Math.round(r * 0.92);
    g = Math.round(g * 0.92);
    b = Math.round(b * 0.92);
    guard += 1;
  }
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}

function gloobalQrModulePath(matrix) {
  const q = GLOOBAL_QR_QUIET_ZONE;
  let d = "";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
    }
  }
  return d;
}

function GloobalQrSvg({ value, logo = true, discColor, markStep = 0 }) {
  const matrix = buildGloobalQrMatrix(value);
  if (!matrix) return null;
  const box = gloobalQrLogoBox(matrix.size);
  const corner = gloobalQrCornerBadge(matrix.size);
  const face = gloobalQrCornerFace(markStep);
  return (
    <svg
      viewBox={`0 0 ${box.total} ${box.total}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Gloobal QR code"
      style={{ display: "block" }}
    >
      <rect x="0" y="0" width={box.total} height={box.total} fill="#FFFFFF" />
      <path d={gloobalQrModulePath(matrix)} fill="#000" shapeRendering="crispEdges" />
      {logo ? (
        <g>
          <circle cx={box.cx} cy={box.cy} r={box.ring} fill="#FFFFFF" />
          <circle
            cx={box.cx}
            cy={box.cy}
            r={box.disc}
            fill={gloobalQrDiscInk(discColor || (typeof T !== "undefined" ? T.accent : "#7C3AED"))}
            style={{ transition: "fill 0.55s ease" }}
          />
          <image
            href={G_LOGO_DATA_URI}
            x={box.cx - box.mark / 2}
            y={box.cy - box.mark / 2}
            width={box.mark}
            height={box.mark}
            preserveAspectRatio="xMidYMid meet"
            // Knocked out white. The mark's own blues would disappear into a
            // blue disc and fight a green one; white is the only fill that
            // works against all eight.
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </g>
      ) : null}
      {logo ? (
        <g aria-hidden="true">
          {/* The fourth corner. The white disc is painted first and full size,
              so the modules under the mark are gone rather than showing
              through the ring — see gloobalQrCornerBadge for why this sits two
              modules out from the corner instead of on it. */}
          <circle cx={corner.cx} cy={corner.cy} r={corner.r} fill="#FFFFFF" />
          <circle
            cx={corner.cx}
            cy={corner.cy}
            r={corner.r - corner.stroke / 2}
            fill="none"
            stroke={face.color}
            strokeWidth={corner.stroke}
            style={{ transition: "stroke 0.55s ease" }}
          />
          <text
            x={corner.cx}
            y={corner.cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={typeof T !== "undefined" ? T.fontDisplay : "system-ui, sans-serif"}
            fontSize={corner.font}
            fontWeight="800"
            fill={face.color}
            style={{ transition: "fill 0.55s ease" }}
          >
            {face.letter}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

// The same symbol as a PNG, for sharing. Integer pixels per module so no
// module edge lands between pixels and blurs.
function gloobalQrToPngBlob(value, { moduleScale = 12, discColor, markStep = 0 } = {}) {
  return new Promise((resolve) => {
    try {
      const matrix = buildGloobalQrMatrix(value);
      if (!matrix || typeof document === "undefined") return resolve(null);
      const scale = Math.max(1, Math.round(moduleScale));
      const box = gloobalQrLogoBox(matrix.size);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = box.total * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
          if (matrix.data[y][x]) {
            ctx.fillRect((x + GLOOBAL_QR_QUIET_ZONE) * scale, (y + GLOOBAL_QR_QUIET_ZONE) * scale, scale, scale);
          }
        }
      }

      // The same badge the SVG draws: white ring, coloured disc, white mark.
      const cx = box.cx * scale;
      ctx.beginPath();
      ctx.arc(cx, cx, box.ring * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cx, box.disc * scale, 0, Math.PI * 2);
      ctx.fillStyle = gloobalQrDiscInk(discColor || (typeof T !== "undefined" ? T.accent : "#7C3AED"));
      ctx.fill();

      // The fourth corner, drawn the same way: a full white disc first, then
      // the ring and the letter showing at the moment Share was pressed.
      const corner = gloobalQrCornerBadge(matrix.size);
      const face = gloobalQrCornerFace(markStep);
      ctx.beginPath();
      ctx.arc(corner.cx * scale, corner.cy * scale, corner.r * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(corner.cx * scale, corner.cy * scale, (corner.r - corner.stroke / 2) * scale, 0, Math.PI * 2);
      ctx.strokeStyle = face.color;
      ctx.lineWidth = corner.stroke * scale;
      ctx.stroke();
      ctx.fillStyle = face.color;
      ctx.font = `800 ${corner.font * scale}px ${typeof T !== "undefined" ? T.fontDisplay : "system-ui, sans-serif"}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(face.letter, corner.cx * scale, corner.cy * scale);

      const finish = () => canvas.toBlob((blob) => resolve(blob || null), "image/png");
      const img = new Image();
      img.onload = () => {
        try {
          const mark = box.mark * scale;
          const ratio = Math.min(mark / img.width, mark / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          // Knocked out white, the same way the SVG's CSS filter does it:
          // draw the mark, then flood its own pixels with white through
          // source-in. Done on a scratch canvas so the flood cannot reach the
          // code underneath.
          const cut = document.createElement("canvas");
          cut.width = Math.max(1, Math.round(w));
          cut.height = Math.max(1, Math.round(h));
          const cctx = cut.getContext("2d");
          if (cctx) {
            cctx.drawImage(img, 0, 0, cut.width, cut.height);
            cctx.globalCompositeOperation = "source-in";
            cctx.fillStyle = "#FFFFFF";
            cctx.fillRect(0, 0, cut.width, cut.height);
            ctx.drawImage(cut, cx - w / 2, cx - h / 2, w, h);
          } else {
            ctx.drawImage(img, cx - w / 2, cx - h / 2, w, h);
          }
        } catch {
        }
        finish();
      };
      // A QR without its logo still scans; never fail the share over it.
      img.onerror = finish;
      img.src = G_LOGO_DATA_URI;
    } catch {
      resolve(null);
    }
  });
}

var GLOOBAL_QR_CARD_BUTTON = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  padding: "0 12px"
};

// How long each colour holds before the badge turns over.
var GLOOBAL_QR_DISC_CYCLE_MS = 2000;

function GloobalReceiveQrCard({ gloobalId, name, onToast }) {
  const [sharing, setSharing] = useState36(false);
  // The badge's colour, turning over every two seconds.
  //
  // randomLogoFlipColor(prev) is the same picker the dial pad's centre key
  // uses, and it takes the current colour so it never hands back the one
  // already showing — a turn that lands on the same colour reads as the
  // animation having stopped.
  //
  // Only this one value animates. The modules, the finders and the quiet zone
  // are the code, and nothing that is the code moves.
  const [discColor, setDiscColor] = useState36(() => randomLogoFlipColor());
  // The corner mark's step, advanced on the same tick as the disc so the two
  // turn over together — staggering them reads as one of them lagging.
  const [markStep, setMarkStep] = useState36(0);
  useEffect31(() => {
    const id = setInterval(() => {
      setDiscColor((prev) => randomLogoFlipColor(prev));
      setMarkStep((s) => s + 1);
    }, GLOOBAL_QR_DISC_CYCLE_MS);
    return () => clearInterval(id);
  }, []);
  const payload = buildGloobalPayUrl(gloobalId);

  if (!payload) {
    return (
      <p style={{ margin: 0, textAlign: "center", fontSize: 13, color: T.inkSoft }}>
        Your Gloobal ID isn't ready yet.
      </p>
    );
  }

  const handleCopy = () => {
    // copyToClipboard is fire-and-forget (it falls back internally and
    // returns nothing), so the toast is shown straight away.
    copyToClipboard(gloobalId);
    onToast?.("Gloobal ID copied");
  };

  // Share first, download second — see shareAuditReport in
  // features/receipts/auditReport.js for why canShare is asked up front
  // rather than a rejected share falling through to a download.
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      // The colour showing at the moment Share was pressed. A PNG cannot
      // cycle, and picking a fixed brand colour instead would hand somebody a
      // file that does not match the code they were looking at.
      const blob = await gloobalQrToPngBlob(payload, { discColor, markStep });
      if (!blob) {
        onToast?.("Couldn't create the QR image");
        return;
      }
      if (typeof File !== "undefined" && typeof navigator !== "undefined" && navigator.canShare) {
        const file = new File([blob], "gloobal-qr.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "My Gloobal QR", text: payload });
          } catch (error) {
            if (error?.name !== "AbortError") onToast?.("Couldn't share the QR");
          }
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gloobal-qr.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      onToast?.("QR saved");
    } finally {
      setSharing(false);
    }
  };

  return (
    <section
      aria-labelledby="gloobal-receive-qr-title"
      style={{
        background: "#FFFFFF",
        borderRadius: T.radiusXl,
        border: `1px solid ${T.line}`,
        boxShadow: T.shadowCard,
        width: "100%",
        maxWidth: 360,
        margin: "0 auto",
        padding: "20px 12px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14
      }}
    >
      <h2
        id="gloobal-receive-qr-title"
        style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 800, color: T.ink }}
      >
        Your Gloobal QR
      </h2>

      <div style={{ width: "min(300px, 100%)", aspectRatio: "1 / 1", background: "#FFFFFF" }}>
        <GloobalQrSvg value={payload} discColor={discColor} markStep={markStep} />
      </div>

      <div style={{ width: "100%", minWidth: 0, textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
        {name ? (
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: T.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {name}
          </div>
        ) : null}
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.3, wordBreak: "break-all" }}>
          {gloobalId}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy Gloobal ID"
          style={{ ...GLOOBAL_QR_CARD_BUTTON, background: "#FFFFFF", color: T.ink, border: `1px solid ${T.line}` }}
        >
          <Copy4 size={16} aria-hidden="true" />
          Copy ID
        </button>
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          aria-label="Share Gloobal QR"
          style={{
            ...GLOOBAL_QR_CARD_BUTTON,
            background: T.gradButton,
            color: "#FFFFFF",
            border: "none",
            opacity: sharing ? 0.7 : 1
          }}
        >
          <Share23 size={16} aria-hidden="true" />
          Share
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: T.inkSoft, textAlign: "center" }}>
        Scan this QR to pay into your Gloobal wallet.
      </p>
    </section>
  );
}
