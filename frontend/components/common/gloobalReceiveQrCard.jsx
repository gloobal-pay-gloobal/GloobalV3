// src/components/common/gloobalReceiveQrCard.jsx
import { useState as useState36 } from "react";
import { Copy as Copy4, Share2 as Share23 } from "lucide-react";
import { encode as uqrEncode } from "uqr";
// "Your Gloobal QR": a plain, static, UPI-style receive code. The payload is
// the pay link from backend/utils/gloobalPayLink.js — an account, no amount,
// no session — so the same code works printed, screenshotted or shared.
//
// The symbol is deliberately ordinary: square modules, standard finders,
// error-correction H, a 4-module quiet zone, and a small white logo square
// sized by GLOOBAL_QR_LOGO_FRACTION (≈7% of the area, well inside what H
// recovers). Every styling liberty a QR takes costs some phone somewhere a
// failed scan; this one takes one.

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
  return { total, side, x: offset, y: offset, radius: side * 0.18, inset: side * 0.14 };
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

function GloobalQrSvg({ value, logo = true }) {
  const matrix = buildGloobalQrMatrix(value);
  if (!matrix) return null;
  const box = gloobalQrLogoBox(matrix.size);
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
          <rect x={box.x} y={box.y} width={box.side} height={box.side} rx={box.radius} ry={box.radius} fill="#FFFFFF" />
          <image
            href={G_LOGO_DATA_URI}
            x={box.x + box.inset}
            y={box.y + box.inset}
            width={box.side - box.inset * 2}
            height={box.side - box.inset * 2}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      ) : null}
    </svg>
  );
}

// The same symbol as a PNG, for sharing. Integer pixels per module so no
// module edge lands between pixels and blurs.
function gloobalQrToPngBlob(value, { moduleScale = 12 } = {}) {
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

      const bx = box.x * scale;
      const bs = box.side * scale;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, bx, bs, bs, box.radius * scale);
      else ctx.rect(bx, bx, bs, bs);
      ctx.fill();

      const finish = () => canvas.toBlob((blob) => resolve(blob || null), "image/png");
      const img = new Image();
      img.onload = () => {
        try {
          const inner = bs - box.inset * 2 * scale;
          const ratio = Math.min(inner / img.width, inner / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          ctx.drawImage(img, bx + (bs - w) / 2, bx + (bs - h) / 2, w, h);
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

function GloobalReceiveQrCard({ gloobalId, name, onToast }) {
  const [sharing, setSharing] = useState36(false);
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
      const blob = await gloobalQrToPngBlob(payload);
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
        <GloobalQrSvg value={payload} />
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
