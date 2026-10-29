// src/features/creator/shopPoster.jsx
//
// A POSTER FOR THE COUNTER: "SCAN TO PAY रसोई GHAR".
//
// An A4 sheet in the shop's own colour — the name in the shop's font, the
// logo, the shop's QR code large enough to scan from a metre away, the
// name people can type instead, and one line on how to scan. Downloaded as
// a PDF to print at any print shop, or as an image to send to one.
//
// Drawn on a canvas, by the same QR painter the Share button uses, so the
// code on the paper is byte for byte the code on the screen. The PDF is
// written here too — one page, one JPEG — because a PDF with a single
// picture in it is forty lines, and a library for it would be the largest
// thing in the bundle.
import { useState as useState64, useEffect as useEffect61 } from "react";
import { Printer as PrinterPoster, Download as DownloadPoster, Share2 as Share28, X as X19 } from "lucide-react";

// A4 at 150 dpi: sharp on paper, small enough to share.
var SHOP_POSTER_W = 1240;
var SHOP_POSTER_H = 1754;

function shopPosterImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function shopPosterRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Text that fits: the size steps down until the line fits the width.
function shopPosterFit(ctx, text, maxW, size, weight, family) {
  let s = size;
  for (; s > 24; s -= 4) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

async function shopPosterCanvas({ creator, gloobalId, qrStyle = "classic" }) {
  const theme = resolveShopTheme(creator && creator.shop);
  const name = creatorDisplayName(creator, gloobalId);
  const handle = (creator && creator.handle) || "";
  const tagline = (creator && creator.shop && creator.shop.tagline) || "";
  const payload = buildGloobalPayUrl(gloobalId, "shop");
  const family = theme.font.stack;

  // The shop's font has to be loaded before canvas can draw with it; a
  // poster printed in the fallback face is a poster printed wrong.
  ensureShopFont(theme.fontKey);
  try {
    if (document.fonts && document.fonts.load) {
      await Promise.race([
        Promise.all([document.fonts.load(`${theme.font.weight} 80px ${family}`, name), document.fonts.load("800 40px 'Space Grotesk'")]),
        new Promise((r) => setTimeout(r, 2500))
      ]);
    }
  } catch (e) { /* draw with what there is */ }

  const qrBlob = await gloobalQrToPngBlob(payload, { moduleScale: 16, animal: qrStyle !== "classic" ? qrStyle : null });
  const qrImg = qrBlob ? await shopPosterImage(URL.createObjectURL(qrBlob)) : null;
  const logoImg = await shopPosterImage(creator && creator.logo);

  const canvas = document.createElement("canvas");
  canvas.width = SHOP_POSTER_W;
  canvas.height = SHOP_POSTER_H;
  const ctx = canvas.getContext("2d");
  const W = SHOP_POSTER_W;

  // The page: a pale wash of the shop's colour.
  ctx.fillStyle = shopHexMix("#FFFFFF", theme.color, 0.08);
  ctx.fillRect(0, 0, W, SHOP_POSTER_H);

  // The coloured card along the top.
  const grad = ctx.createLinearGradient(0, 0, W, 560);
  grad.addColorStop(0, theme.hero.from);
  grad.addColorStop(1, theme.hero.to);
  shopPosterRoundRect(ctx, 70, 70, W - 140, 520, 56);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "800 54px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("SCAN TO PAY", W / 2, 190);

  // Logo, then the name in the shop's own face.
  // Without a logo the name sits in the middle of the card.
  let nameY = tagline ? 360 : 390;
  if (logoImg) {
    const s = 150;
    ctx.save();
    shopPosterRoundRect(ctx, W / 2 - s / 2, 222, s, s, 36);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logoImg, W / 2 - s / 2 + 8, 230, s - 16, s - 16);
    ctx.restore();
    nameY = 460;
  }
  ctx.fillStyle = "#FFFFFF";
  const nameSize = shopPosterFit(ctx, name, W - 260, logoImg ? 88 : 110, theme.font.weight, family);
  ctx.font = `${theme.font.weight} ${nameSize}px ${family}`;
  ctx.fillText(name, W / 2, nameY);
  if (tagline) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const tSize = shopPosterFit(ctx, tagline, W - 300, 40, 700, "Inter, system-ui, sans-serif");
    ctx.font = `700 ${tSize}px Inter, system-ui, sans-serif`;
    ctx.fillText(tagline, W / 2, nameY + 62);
  }

  // The code, on white, big.
  const qrSize = 760;
  const qx = (W - qrSize) / 2;
  const qy = 650;
  ctx.save();
  ctx.shadowColor = "rgba(20,18,43,0.16)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  shopPosterRoundRect(ctx, qx - 40, qy - 40, qrSize + 80, qrSize + 80, 48);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();
  if (qrImg) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImg, qx, qy, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
  }

  // The name people can type instead of scanning.
  if (handle) {
    ctx.font = "800 46px 'Space Grotesk', system-ui, sans-serif";
    const label = handle;
    const tw = ctx.measureText(label).width + 90;
    shopPosterRoundRect(ctx, (W - tw) / 2, 1520, tw, 82, 41);
    ctx.fillStyle = theme.hero.from;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(label, W / 2, 1576);
  }

  ctx.fillStyle = "#4B4762";
  ctx.font = "600 30px Inter, system-ui, sans-serif";
  ctx.fillText("Open the Gloobal app, tap Scan, and point it here.", W / 2, 1668);
  ctx.fillStyle = "#15132A";
  ctx.font = "800 34px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("Gloobal बाज़ार", W / 2, 1718);

  return canvas;
}

// ── A ONE-PAGE PDF AROUND ONE JPEG ──────────────────────────────────────
// Catalog → Pages → Page (A4, 595×842 pt) → an image XObject with the
// JPEG as-is (DCTDecode) → a content stream that paints it full-page.
function shopPosterPdf(jpegBytes, pxW, pxH) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push("\nendstream\nendobj\n");
  const content = "q 595.28 0 0 841.89 0 0 cm /Im0 Do Q";
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return new Blob([out], { type: "application/pdf" });
}

function shopPosterSave(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function shopPosterFileName(creator, ext) {
  const base = String((creator && creator.handle) || "shop").normalize("NFKD").replace(/\p{M}+/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shop";
  return `gloobal-poster-${base}.${ext}`;
}

function ShopPosterSheet({ creator, gloobalId, qrStyle, onClose, onToast }) {
  const [canvas, setCanvas] = useState64(null);
  const [preview, setPreview] = useState64("");
  const [busy, setBusy] = useState64("");

  useEffect61(() => {
    let live = true;
    if (!buildGloobalPayUrl(gloobalId, "shop")) {
      // A poster with no code on it is a poster that cannot be paid at.
      onToast && onToast("Your Gloobal ID isn't ready yet.");
      onClose && onClose();
      return undefined;
    }
    shopPosterCanvas({ creator, gloobalId, qrStyle }).then((c) => {
      if (!live) return;
      setCanvas(c);
      setPreview(c.toDataURL("image/jpeg", 0.85));
    });
    return () => { live = false; };
  }, []);

  const blobOf = (type, q) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, q));

  const pdf = async () => {
    if (!canvas || busy) return;
    setBusy("pdf");
    const jpeg = await blobOf("image/jpeg", 0.92);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    shopPosterSave(shopPosterPdf(bytes, SHOP_POSTER_W, SHOP_POSTER_H), shopPosterFileName(creator, "pdf"));
    onToast && onToast("Poster saved as PDF");
    setBusy("");
  };
  const image = async () => {
    if (!canvas || busy) return;
    setBusy("png");
    shopPosterSave(await blobOf("image/png"), shopPosterFileName(creator, "png"));
    onToast && onToast("Poster saved");
    setBusy("");
  };
  const share = async () => {
    if (!canvas || busy) return;
    setBusy("share");
    const blob = await blobOf("image/png");
    const file = typeof File !== "undefined" ? new File([blob], shopPosterFileName(creator, "png"), { type: "image/png" }) : null;
    await gloobalShareLink({
      title: creatorDisplayName(creator, gloobalId),
      message: `Pay ${creatorDisplayName(creator, gloobalId)} on Gloobal:`,
      url: buildGloobalPayUrl(gloobalId, "shop"),
      file,
      onToast
    });
    setBusy("");
  };

  const btn = (key, label, Icon, onClick, primary) => <button
    onClick={onClick}
    disabled={!canvas || Boolean(busy)}
    style={{
      flex: 1, minWidth: 0, height: 48, borderRadius: 14, border: "none", cursor: canvas ? "pointer" : "default",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit",
      fontSize: 13, fontWeight: 800, opacity: !canvas || (busy && busy !== key) ? 0.55 : 1,
      background: primary ? T.gradButton : T.surface, color: primary ? "#fff" : T.ink,
      boxShadow: primary ? "0 8px 20px rgba(124,58,237,0.28)" : T.shadowCard
    }}
  ><Icon size={16} />{busy === key ? "…" : label}</button>;

  return <div style={{
    position: "fixed", inset: 0, zIndex: 440, background: T.bg, display: "flex", flexDirection: "column"
  }}><div style={{
    display: "flex", alignItems: "center", gap: 10, padding: "calc(15px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0
  }}><NavIconButton onClick={onClose} label="Close the poster"><X19 size={NAV_GLYPH_SIZE} color={T.ink} /></NavIconButton><span style={{
    flex: 1, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>Poster for your counter</span></div><div style={{
    flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 16px", display: "flex", flexDirection: "column", alignItems: "center"
  }}>{preview
    ? <img src={preview} alt="Your poster" style={{ width: "100%", maxWidth: 360, borderRadius: 10, boxShadow: "0 12px 32px rgba(20,18,43,0.18)", display: "block" }} />
    : <div style={{ width: "100%", maxWidth: 360, aspectRatio: "210 / 297", borderRadius: 10, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", color: T.inkFaint, fontSize: 13 }}>Drawing your poster…</div>}<p style={{
    fontSize: 12, color: T.inkSoft, lineHeight: 1.5, textAlign: "center", maxWidth: 340, margin: "14px 0 0"
  }}>A4, in your shop's colour and font. Print it at any print shop and put it where people pay — the code scans from about a metre away.</p></div><div style={{
    flexShrink: 0, display: "flex", gap: 8, padding: "10px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
    borderTop: `1px solid ${T.line}`, background: T.surface
  }}>{btn("pdf", "PDF", PrinterPoster, pdf, true)}{btn("png", "Image", DownloadPoster, image)}{btn("share", "Share", Share28, share)}</div></div>;
}
