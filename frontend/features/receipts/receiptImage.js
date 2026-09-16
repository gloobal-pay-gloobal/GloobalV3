// src/features/receipts/receiptImage.js

// ── The receipt, as a picture ────────────────────────────────────────────
//
// A compact "payment successful" card that can be handed straight to the
// phone's share sheet as a PNG — the thing people actually forward on
// WhatsApp after paying someone. Gloobal's own identity throughout: the G
// logo, the GL●●BAL wordmark redrawn by hand, the theme's gradients, and the
// Hooman to Hooman mark and tagline INSIDE the image, as part of the card
// rather than an advert stapled to its foot.
//
// Two halves, deliberately split:
//
//   buildReceiptImageModel  PURE. Decides every word and figure that ends up
//                           on the image. This is where the rules live, and
//                           it is what the tests read.
//   renderReceiptImage      Draws the model and nothing else. It makes no
//                           decision about what is true.
//
// ── Rules the model keeps ────────────────────────────────────────────────
//
//   - Every figure is a RECORDED one. The conversion block prints the
//     server's own sender debit, receiver credit and rate; nothing is
//     multiplied, divided or inverted here (see ReceiptModal's fxRateLabel
//     for why the rate stays in its stored direction).
//   - Nothing on it reads as a request for money. No QR, no link, no "pay"
//     wording — a forwarded receipt must never be mistaken for something to
//     act on. The reference and receipt code identify it; that is all.
//   - A photo is drawn only if it is an inline PNG/JPEG data URL. Anything
//     else (the default G logo, SVG, a remote URL, a script URL) is ignored
//     and the Gloobal fallback disc is drawn instead. Data URLs also keep
//     the canvas untainted, so toBlob keeps working.

var RECEIPT_IMAGE_BRAND = {
  wordmark: "GLOOBAL",
  hooman: "Hooman to Hooman",
  tagline: "Cashless · Textless · Borderless · Limitless"
};

var RECEIPT_IMAGE_DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];

var RECEIPT_IMAGE_PHOTO_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

function receiptImagePhotoOrNull(photo) {
  if (typeof photo !== "string") return null;
  if (typeof G_LOGO_DATA_URI !== "undefined" && photo === G_LOGO_DATA_URI) return null;
  return RECEIPT_IMAGE_PHOTO_PATTERN.test(photo) ? photo : null;
}

function receiptImageCountry(receipt) {
  const list = typeof ALL_COUNTRIES !== "undefined" && Array.isArray(ALL_COUNTRIES) ? ALL_COUNTRIES : [];
  const iso = receipt.counterpartyIso ? String(receipt.counterpartyIso).toUpperCase() : "";
  const match = (receipt.flag && list.find((c) => c.flag === receipt.flag)) ||
    (iso && list.find((c) => c.iso === iso)) || null;
  if (!match && !receipt.flag) return null;
  return {
    name: match ? match.name : "",
    flag: receipt.flag || (match ? match.flag : ""),
    iso: match ? String(match.iso).toLowerCase() : (iso ? iso.toLowerCase() : "")
  };
}

function receiptImageMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return currency ? fmtMoney(n, currency) : fmt(n);
}

function buildReceiptImageModel(receipt, { photo, viewerName, viewerSymbolId } = {}) {
  const r = receipt || {};
  const isShare = r.kind === "share";
  const isCoin = r.kind === "coin";
  const isSent = r.direction === "sent";
  const status = r.status === "pending" ? "pending" : r.status === "simulated" ? "simulated" : "completed";

  let headline;
  if (status === "pending") headline = "Payment Pending";
  else if (status === "simulated") headline = "Not Sent · Simulated";
  else if (isCoin) headline = r.title || "Gloobal Coin";
  else headline = isSent ? "Payment Successful" : "Money Received";

  // The hero figure is the row's own. On a Creator Share receipt the row IS
  // the share, so its figure is read, never worked out from a rate.
  const currency = r.currencyCode || null;
  const heroAmount = isShare
    ? (r.shareAmount != null ? r.shareAmount : r.amount)
    : r.amount;
  const amountText = receiptImageMoney(heroAmount, currency);

  const counterpartyName = r.name ? String(r.name) : "";
  const counterpartyId = r.id ? String(r.id).replace(/\s/g, "") : "";
  const viewer = viewerName ? String(viewerName) : "";

  const fxSender = r.senderSideCurrency || null;
  const fxReceiver = r.receiverSideCurrency || null;
  const hasConversion = Boolean(
    !isCoin && fxSender && fxReceiver && fxSender !== fxReceiver &&
    r.senderAmount != null && r.receiverAmount != null && r.fxRate != null &&
    Number.isFinite(Number(r.senderAmount)) && Number.isFinite(Number(r.receiverAmount)) &&
    Number.isFinite(Number(r.fxRate))
  );
  const conversion = hasConversion
    ? {
      sentText: receiptImageMoney(r.senderAmount, fxSender),
      receivedText: receiptImageMoney(r.receiverAmount, fxReceiver),
      rateText: `1 ${fxReceiver} = ${Number(r.fxRate).toFixed(6)} ${fxSender}`
    }
    : null;

  const safePhoto = receiptImagePhotoOrNull(photo);

  return {
    headline,
    status,
    kind: isShare ? "share" : isCoin ? "coin" : "payment",
    kindLabel: isShare ? "Creator Share" : "",
    direction: isSent ? "sent" : "received",
    amountText,
    currency,
    counterpartyLabel: isSent ? "To" : "From",
    counterpartyName,
    counterpartyId,
    counterpartyCountry: receiptImageCountry(r),
    senderName: isSent ? viewer : counterpartyName,
    receiverName: isSent ? counterpartyName : viewer,
    viewerLabel: isSent ? "Sent by" : "Received by",
    viewerName: viewer,
    viewerSymbolId: viewerSymbolId ? String(viewerSymbolId).replace(/\s/g, "") : "",
    date: r.date ? String(r.date) : "",
    time: r.time ? String(r.time) : "",
    referenceLabel: "Transaction ID",
    reference: r.txnId ? String(r.txnId).replace(/\s/g, "") : "",
    receiptCode: r.receiptCode ? String(r.receiptCode) : "",
    conversion,
    photo: safePhoto,
    hasPhoto: !!safePhoto,
    brand: { ...RECEIPT_IMAGE_BRAND }
  };
}

// ── Drawing ──────────────────────────────────────────────────────────────

var RECEIPT_IMAGE_FONT_BODY = "Inter, 'Segoe UI', -apple-system, system-ui, sans-serif";
var RECEIPT_IMAGE_FONT_DISPLAY = "'Space Grotesk', Inter, 'Segoe UI', system-ui, sans-serif";
var RECEIPT_IMAGE_FONT_MONO = "'Segoe UI Symbol', 'Noto Sans Symbols 2', 'DejaVu Sans Mono', ui-monospace, monospace";

function receiptImageLoad(src, { crossOrigin, timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    if (!src || typeof Image === "undefined") return resolve(null);
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => done(img.naturalWidth || img.width ? img : null);
      img.onerror = () => done(null);
      setTimeout(() => done(null), timeoutMs);
      img.src = src;
    } catch {
      done(null);
    }
  });
}

// The G logo in a single flat colour, for use on gradients.
function receiptImageTint(img, color) {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  } catch {
    return null;
  }
}

function receiptImageEllipsis(ctx, text, maxWidth) {
  const s = String(text || "");
  if (ctx.measureText(s).width <= maxWidth) return s;
  const chars = Array.from(s);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(chars.slice(0, mid).join("").trimEnd() + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

// Largest size (down to `min`) at which `text` fits; the caller ellipsises
// whatever still does not.
function receiptImageFit(ctx, text, fontFor, max, min, maxWidth) {
  let size = max;
  ctx.font = fontFor(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = fontFor(size);
  }
  return size;
}

function receiptImageRoundRect(ctx, x, y, w, h, r) {
  const rr = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + rr[0], y);
  ctx.lineTo(x + w - rr[1], y);
  ctx.arcTo(x + w, y, x + w, y + rr[1], rr[1]);
  ctx.lineTo(x + w, y + h - rr[2]);
  ctx.arcTo(x + w, y + h, x + w - rr[2], y + h, rr[2]);
  ctx.lineTo(x + rr[3], y + h);
  ctx.arcTo(x, y + h, x, y + h - rr[3], rr[3]);
  ctx.lineTo(x, y + rr[0]);
  ctx.arcTo(x, y, x + rr[0], y, rr[0]);
  ctx.closePath();
}

function receiptImageHash(text) {
  let h = 7;
  for (const ch of String(text || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// "GL●●BAL", left-aligned at (x, baseline). Returns the width drawn.
function receiptImageDrawWordmark(ctx, x, baseline, size, color, dotColors, { measureOnly = false } = {}) {
  ctx.font = `800 ${size}px ${RECEIPT_IMAGE_FONT_BODY}`;
  const d = size * 0.72;
  const gap = size * 0.035;
  const w1 = ctx.measureText("GL").width;
  const w2 = ctx.measureText("BAL").width;
  const total = w1 + gap + d + gap * 2 + d + gap + w2;
  if (measureOnly) return total;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("GL", x, baseline);
  const cy = baseline - size * 0.36;
  let cx = x + w1 + gap + d / 2;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = dotColors[i];
    ctx.fill();
    cx += d + gap * 2;
  }
  ctx.fillStyle = color;
  ctx.fillText("BAL", x + w1 + gap + d + gap * 2 + d + gap, baseline);
  return total;
}

// "H●●MAN T● H●●MAN", centred on cx. The circles stand in for the O's, the
// same as HoomanMark in brand.jsx.
function receiptImageDrawHooman(ctx, cx, baseline, size, color, dotColors, hoomanText) {
  ctx.font = `800 ${size}px ${RECEIPT_IMAGE_FONT_BODY}`;
  const d = size * 0.78;
  const gap = size * 0.05;
  const space = size * 0.55;
  // Parse the brand string rather than hardcoding the letters, so the mark
  // on the image is always the brand text, upper-cased, with its O's as dots.
  const parts = [];
  const upper = String(hoomanText).toUpperCase();
  for (const ch of upper) {
    if (ch === "O") parts.push({ dot: true });
    else if (ch === " ") parts.push({ space: true });
    else if (parts.length && parts[parts.length - 1].text != null) parts[parts.length - 1].text += ch;
    else parts.push({ text: ch });
  }
  const widthOf = (p) => (p.dot ? d + gap * 2 : p.space ? space : ctx.measureText(p.text).width);
  const total = parts.reduce((sum, p) => sum + widthOf(p), 0);
  let x = cx - total / 2;
  let dotIndex = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const p of parts) {
    if (p.dot) {
      ctx.beginPath();
      ctx.arc(x + gap + d / 2, baseline - size * 0.36, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = dotColors[dotIndex++ % dotColors.length];
      ctx.fill();
    } else if (p.text) {
      ctx.fillStyle = color;
      ctx.fillText(p.text, x, baseline);
    }
    x += widthOf(p);
  }
  // The accessible string, drawn invisibly so the exact brand text is part
  // of what was painted (and of what a text-extracting reader finds).
  ctx.save();
  ctx.globalAlpha = 0;
  ctx.textAlign = "center";
  ctx.font = `600 2px ${RECEIPT_IMAGE_FONT_BODY}`;
  ctx.fillText(hoomanText, cx, baseline);
  ctx.restore();
}

// Symbols one colour each, the way ColoredGloobalId draws them. Shrinks to
// fit, then ellipsises.
function receiptImageDrawSymbols(ctx, text, x, baseline, maxWidth, { size = 17, align = "left", colored = true, color } = {}) {
  const fontFor = (s) => `700 ${s}px ${RECEIPT_IMAGE_FONT_MONO}`;
  const s = receiptImageFit(ctx, text, fontFor, size, 11, maxWidth);
  ctx.font = fontFor(s);
  const shown = receiptImageEllipsis(ctx, text, maxWidth);
  const chars = Array.from(shown);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  const palette = typeof POSITION_COLORS !== "undefined" ? POSITION_COLORS : RECEIPT_IMAGE_DOT_COLORS;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  chars.forEach((ch, i) => {
    ctx.fillStyle = colored && ch !== "…" ? palette[i % palette.length] : (color || "#15132A");
    ctx.fillText(ch, cx, baseline);
    cx += widths[i];
  });
}

async function receiptImageWaitForFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const loads = [
      `800 30px Inter`, `700 16px Inter`, `600 14px Inter`, `700 48px 'Space Grotesk'`
    ].map((f) => (document.fonts.load ? document.fonts.load(f).catch(() => null) : null));
    await Promise.race([Promise.all(loads), timeout]);
    if (document.fonts.ready) await Promise.race([document.fonts.ready, timeout]);
  } catch {
  }
}

async function renderReceiptImage(model, { scale = 2 } = {}) {
  const m = model || buildReceiptImageModel({});
  const theme = typeof T !== "undefined" ? T : {};
  const INK = theme.ink || "#15132A";
  const INK_SOFT = theme.inkSoft || "#6B6580";
  const INK_FAINT = theme.inkFaint || "#9C96AF";
  const LINE = theme.line || "#EAE6F7";
  const SURFACE_ALT = theme.surfaceAlt || "#F3F1FA";
  const ACCENT = theme.accent || "#7C3AED";
  const POSITIVE = theme.positive || "#0FA372";
  const POSITIVE_SOFT = theme.positiveSoft || "#E3F8EE";

  await receiptImageWaitForFonts();

  const logoSrc = typeof G_LOGO_DATA_URI !== "undefined" ? G_LOGO_DATA_URI : null;
  const country = m.counterpartyCountry;
  const [logo, photo, flag] = await Promise.all([
    receiptImageLoad(logoSrc),
    m.hasPhoto ? receiptImageLoad(m.photo) : Promise.resolve(null),
    // flagcdn serves `Access-Control-Allow-Origin: *`, so an anonymous load
    // keeps the canvas exportable. If it ever stops, the load fails rather
    // than tainting, and the country is written out without its flag.
    country && country.iso
      ? receiptImageLoad(`https://flagcdn.com/w160/${country.iso}.png`, { crossOrigin: "anonymous", timeoutMs: 3000 })
      : Promise.resolve(null)
  ]);
  const whiteLogo = logo ? receiptImageTint(logo, "#FFFFFF") : null;

  const s = Math.max(1, Number(scale) || 2);
  const W = 540;
  const MARGIN = 22;
  const CX = MARGIN;
  const CW = W - MARGIN * 2;
  const PAD = 26;
  const INNER = CW - PAD * 2;

  const seed = receiptImageHash(m.reference || m.receiptCode || m.counterpartyName);
  const dotA = RECEIPT_IMAGE_DOT_COLORS[seed % RECEIPT_IMAGE_DOT_COLORS.length];
  // Two different colours, as the live wordmark always has.
  const dotB = RECEIPT_IMAGE_DOT_COLORS[(seed + 1 + ((seed >>> 3) % (RECEIPT_IMAGE_DOT_COLORS.length - 1))) % RECEIPT_IMAGE_DOT_COLORS.length];
  const hoomanDots = [0, 1, 4, 2, 3].map((i) => RECEIPT_IMAGE_DOT_COLORS[(seed + i * 2) % RECEIPT_IMAGE_DOT_COLORS.length]);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const ops = [];
  let y = MARGIN;

  // ── Header band ──
  const HEADER_H = 92;
  const headerTop = y;
  ops.push(() => {
    const g = ctx.createLinearGradient(CX, headerTop, CX + CW, headerTop + HEADER_H);
    g.addColorStop(0, "#1E1B4B");
    g.addColorStop(0.42, "#3E2E8E");
    g.addColorStop(0.8, "#7C3AED");
    g.addColorStop(1, "#C026D3");
    ctx.save();
    receiptImageRoundRect(ctx, CX, headerTop, CW, HEADER_H, [28, 28, 0, 0]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    // Two soft light discs, for depth rather than decoration.
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(CX + CW - 40, headerTop - 10, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.arc(CX + CW - 150, headerTop + HEADER_H + 30, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const markSize = 30;
    const logoH = 40;
    const logoW = whiteLogo ? logoH * (whiteLogo.width / whiteLogo.height) : 0;
    const wordW = receiptImageDrawWordmark(ctx, 0, 0, markSize, "#FFFFFF", [dotA, dotB], { measureOnly: true });
    const groupW = logoW + (logoW ? 10 : 0) + wordW;
    const gx = CX + (CW - groupW) / 2;
    const midY = headerTop + HEADER_H / 2;
    if (whiteLogo) ctx.drawImage(whiteLogo, gx, midY - logoH / 2, logoW, logoH);
    receiptImageDrawWordmark(ctx, gx + logoW + (logoW ? 10 : 0), midY + markSize * 0.36, markSize, "#FFFFFF", [dotA, dotB]);
  });
  y += HEADER_H;
  const cardTop = headerTop;

  // ── Status: tick + headline + amount ──
  const tickR = 24;
  const tickY = y + 34 + tickR;
  ops.push(() => {
    const tone = m.status === "pending" ? "#F59E0B" : m.status === "simulated" ? INK_FAINT : POSITIVE;
    const halo = m.status === "pending" ? "#FEF3C7" : m.status === "simulated" ? SURFACE_ALT : POSITIVE_SOFT;
    const cx = W / 2;
    ctx.beginPath();
    ctx.arc(cx, tickY, tickR + 9, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, tickY, tickR, 0, Math.PI * 2);
    ctx.fillStyle = tone;
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (m.status === "pending") {
      ctx.moveTo(cx, tickY - 11);
      ctx.lineTo(cx, tickY);
      ctx.lineTo(cx + 8, tickY + 6);
    } else if (m.status === "simulated") {
      ctx.moveTo(cx, tickY - 11);
      ctx.lineTo(cx, tickY + 3);
      ctx.moveTo(cx, tickY + 10);
      ctx.lineTo(cx, tickY + 10.5);
    } else {
      ctx.moveTo(cx - 10, tickY + 1);
      ctx.lineTo(cx - 3, tickY + 8);
      ctx.lineTo(cx + 11, tickY - 7);
    }
    ctx.stroke();
  });
  y = tickY + tickR + 9;

  const headlineBase = y + 38;
  ops.push(() => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const size = receiptImageFit(ctx, m.headline, (z) => `800 ${z}px ${RECEIPT_IMAGE_FONT_BODY}`, 24, 16, INNER);
    ctx.font = `800 ${size}px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = INK;
    ctx.fillText(receiptImageEllipsis(ctx, m.headline, INNER), W / 2, headlineBase);
  });
  y = headlineBase;

  if (m.kindLabel) {
    const chipTop = y + 12;
    ops.push(() => {
      ctx.font = `800 11px ${RECEIPT_IMAGE_FONT_BODY}`;
      const label = m.kindLabel.toUpperCase();
      const w = ctx.measureText(label).width + 22;
      receiptImageRoundRect(ctx, W / 2 - w / 2, chipTop, w, 22, 11);
      ctx.fillStyle = theme.accentSoft || "#F1ECFC";
      ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.textAlign = "center";
      ctx.fillText(label, W / 2, chipTop + 15);
    });
    y = chipTop + 22;
  }

  const amountBase = y + 58;
  ops.push(() => {
    const text = m.amountText || "—";
    ctx.textAlign = "center";
    const size = receiptImageFit(ctx, text, (z) => `700 ${z}px ${RECEIPT_IMAGE_FONT_DISPLAY}`, 50, 26, INNER);
    ctx.font = `700 ${size}px ${RECEIPT_IMAGE_FONT_DISPLAY}`;
    ctx.fillStyle = INK;
    ctx.fillText(receiptImageEllipsis(ctx, text, INNER), W / 2, amountBase);
  });
  y = amountBase;

  // The ISO code under the figure, because a bare $ or ¥ is ambiguous. Not
  // repeated when the figure already ends in it ("1,450.25 CHF"). Date and
  // time live in the detail rows only, not twice.
  const showCode = !!(m.currency && !String(m.amountText || "").endsWith(m.currency));
  const metaBase = y + 28;
  if (showCode) {
    ops.push(() => {
      ctx.textAlign = "center";
      ctx.font = `700 13px ${RECEIPT_IMAGE_FONT_BODY}`;
      ctx.fillStyle = INK_SOFT;
      ctx.fillText(m.currency, W / 2, metaBase);
    });
  }
  y = (showCode ? metaBase : y) + 26;

  // ── Counterparty panel ──
  const PANEL_X = CX + PAD - 6;
  const PANEL_W = INNER + 12;
  const partyTop = y;
  const AV_R = 38;
  const partyH = 112;
  const avatarCx = PANEL_X + 20 + AV_R;
  const avatarCy = partyTop + partyH / 2;
  canvas.dataset.avatarCenter = [avatarCx * s, avatarCy * s, AV_R * s].map((n) => Math.round(n)).join(",");
  ops.push(() => {
    receiptImageRoundRect(ctx, PANEL_X, partyTop, PANEL_W, partyH, 18);
    ctx.fillStyle = SURFACE_ALT;
    ctx.fill();

    // Avatar ring
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AV_R + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AV_R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (photo) {
      const iw = photo.naturalWidth || photo.width;
      const ih = photo.naturalHeight || photo.height;
      const side = Math.min(iw, ih);
      ctx.drawImage(photo, (iw - side) / 2, (ih - side) / 2, side, side, avatarCx - AV_R, avatarCy - AV_R, AV_R * 2, AV_R * 2);
    } else {
      const g = ctx.createLinearGradient(avatarCx - AV_R, avatarCy - AV_R, avatarCx + AV_R, avatarCy + AV_R);
      g.addColorStop(0, "#1E1B4B");
      g.addColorStop(0.45, "#3E2E8E");
      g.addColorStop(0.8, "#7C3AED");
      g.addColorStop(1, "#C026D3");
      ctx.fillStyle = g;
      ctx.fillRect(avatarCx - AV_R, avatarCy - AV_R, AV_R * 2, AV_R * 2);
      if (whiteLogo) {
        const lw = AV_R * 1.2;
        const lh = lw * (whiteLogo.height / whiteLogo.width);
        ctx.drawImage(whiteLogo, avatarCx - lw / 2, avatarCy - lh / 2, lw, lh);
      }
    }
    ctx.restore();

    const tx = avatarCx + AV_R + 20;
    const tw = PANEL_X + PANEL_W - 18 - tx;
    const hasId = !!m.counterpartyId;
    const hasCountry = !!(m.counterpartyCountry && (m.counterpartyCountry.name || flag));
    const lines = 2 + (hasCountry ? 1 : 0) + (hasId ? 1 : 0);
    const blockH = 14 + 26 + (hasCountry ? 22 : 0) + (hasId ? 24 : 0);
    let ty = avatarCy - blockH / 2 + (lines ? 10 : 0);

    ctx.textAlign = "left";
    ctx.font = `800 11px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText(m.counterpartyLabel.toUpperCase(), tx, ty);
    ty += 26;

    const name = m.counterpartyName || "—";
    const nameSize = receiptImageFit(ctx, name, (z) => `800 ${z}px ${RECEIPT_IMAGE_FONT_BODY}`, 21, 15, tw);
    ctx.font = `800 ${nameSize}px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = INK;
    ctx.fillText(receiptImageEllipsis(ctx, name, tw), tx, ty);

    if (hasCountry) {
      ty += 22;
      let fx = tx;
      if (flag) {
        const fr = 8;
        ctx.save();
        ctx.beginPath();
        ctx.arc(tx + fr, ty - 5, fr, 0, Math.PI * 2);
        ctx.clip();
        const iw = flag.naturalWidth || flag.width;
        const ih = flag.naturalHeight || flag.height;
        const side = Math.min(iw, ih);
        ctx.drawImage(flag, (iw - side) / 2, (ih - side) / 2, side, side, tx, ty - 5 - fr, fr * 2, fr * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(tx + fr, ty - 5, fr, 0, Math.PI * 2);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.stroke();
        fx = tx + fr * 2 + 7;
      }
      if (m.counterpartyCountry.name) {
        ctx.font = `600 13px ${RECEIPT_IMAGE_FONT_BODY}`;
        ctx.fillStyle = INK_SOFT;
        ctx.fillText(receiptImageEllipsis(ctx, m.counterpartyCountry.name, tx + tw - fx), fx, ty);
      }
    }
    if (hasId) {
      ty += 24;
      receiptImageDrawSymbols(ctx, m.counterpartyId, tx, ty, tw, { size: 16 });
    }
  });
  y = partyTop + partyH + 14;

  // ── Conversion ──
  if (m.conversion) {
    const convTop = y;
    const rowsC = [
      ["Sent", m.conversion.sentText],
      ["Received", m.conversion.receivedText],
      ["Rate applied", m.conversion.rateText]
    ];
    const convH = 16 + 18 + rowsC.length * 30 + 26 + 22;
    ops.push(() => {
      receiptImageRoundRect(ctx, PANEL_X, convTop, PANEL_W, convH, 18);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const lx = PANEL_X + 18;
      const rx = PANEL_X + PANEL_W - 18;
      let ry = convTop + 30;
      ctx.textAlign = "left";
      ctx.font = `800 11px ${RECEIPT_IMAGE_FONT_BODY}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText("CURRENCY CONVERSION", lx, ry);
      ry += 8;
      rowsC.forEach(([label, value], i) => {
        ry += 30;
        ctx.textAlign = "left";
        ctx.font = `600 14px ${RECEIPT_IMAGE_FONT_BODY}`;
        ctx.fillStyle = INK_SOFT;
        ctx.fillText(label, lx, ry);
        ctx.textAlign = "right";
        ctx.font = `${i === 2 ? 800 : 700} 15px ${RECEIPT_IMAGE_FONT_BODY}`;
        ctx.fillStyle = i === 2 ? ACCENT : INK;
        ctx.fillText(receiptImageEllipsis(ctx, value, rx - lx - 110), rx, ry);
      });
      ry += 24;
      ctx.textAlign = "left";
      ctx.font = `600 11.5px ${RECEIPT_IMAGE_FONT_BODY}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText("As settled at the time of this transaction, not a current rate.", lx, ry);
    });
    y = convTop + convH + 14;
  }

  // ── Details ──
  const rows = [];
  if (m.viewerName) rows.push({ label: m.viewerLabel, value: m.viewerName });
  if (m.date) rows.push({ label: "Date", value: m.date });
  if (m.time) rows.push({ label: "Time", value: m.time });
  if (m.receiptCode) rows.push({ label: "Receipt code", value: m.receiptCode, mono: true });
  if (m.reference) rows.push({ label: m.referenceLabel, value: m.reference, symbols: true });
  const ROW_H = 40;
  const detailsTop = y;
  const detailsH = rows.length ? rows.length * ROW_H + 8 : 0;
  if (rows.length) {
    ops.push(() => {
      receiptImageRoundRect(ctx, PANEL_X, detailsTop, PANEL_W, detailsH, 18);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const lx = PANEL_X + 18;
      const rx = PANEL_X + PANEL_W - 18;
      rows.forEach((row, i) => {
        const top = detailsTop + 4 + i * ROW_H;
        const base = top + ROW_H / 2 + 5;
        if (i > 0) {
          ctx.beginPath();
          ctx.moveTo(lx, top);
          ctx.lineTo(rx, top);
          ctx.strokeStyle = LINE;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.textAlign = "left";
        ctx.font = `600 14px ${RECEIPT_IMAGE_FONT_BODY}`;
        ctx.fillStyle = INK_SOFT;
        ctx.fillText(row.label, lx, base);
        const labelW = ctx.measureText(row.label).width;
        const maxW = rx - lx - labelW - 20;
        if (row.symbols) {
          receiptImageDrawSymbols(ctx, row.value, rx, base, maxW, { size: 16, align: "right" });
        } else {
          ctx.textAlign = "right";
          ctx.font = row.mono ? `700 15px ui-monospace, 'Cascadia Mono', Consolas, monospace` : `700 15px ${RECEIPT_IMAGE_FONT_BODY}`;
          ctx.fillStyle = INK;
          ctx.fillText(receiptImageEllipsis(ctx, row.value, maxW), rx, base);
        }
      });
    });
    y = detailsTop + detailsH;
  }

  // ── Footer, inside the card ──
  const footerTop = y + 26;
  const hoomanBase = footerTop + 44;
  const taglineBase = hoomanBase + 28;
  ops.push(() => {
    // Perforation-style divider: the receipt tears off here.
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CX + 18, footerTop);
    ctx.lineTo(CX + CW - 18, footerTop);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = theme.bg || "#F6F5FC";
    [CX, CX + CW].forEach((nx) => {
      ctx.beginPath();
      ctx.arc(nx, footerTop, 10, 0, Math.PI * 2);
      ctx.fill();
    });

    receiptImageDrawHooman(ctx, W / 2, hoomanBase, 19, ACCENT === "#7C3AED" ? "#4C1D95" : ACCENT, hoomanDots, m.brand.hooman);

    ctx.textAlign = "center";
    ctx.font = `600 13.5px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(m.brand.tagline, W / 2, taglineBase);
  });
  const cardBottom = taglineBase + 30;
  const H = cardBottom + MARGIN;

  canvas.width = Math.round(W * s);
  canvas.height = Math.round(H * s);
  ctx.setTransform(s, 0, 0, s, 0, 0);

  // Page and card.
  ctx.fillStyle = theme.bg || "#F6F5FC";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = "rgba(76,29,149,0.14)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  receiptImageRoundRect(ctx, CX, cardTop, CW, cardBottom - cardTop, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();

  for (const op of ops) {
    ctx.save();
    try {
      op();
    } catch {
    }
    ctx.restore();
  }

  canvas.dataset.receiptModel = JSON.stringify({ ...m, photo: m.hasPhoto ? "[data-url]" : null });
  return canvas;
}

function receiptImageToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the receipt image"))), "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

function receiptImageFilename(receipt) {
  const r = receipt || {};
  const code = String(r.receiptCode || "").replace(/[^A-Za-z0-9-]/g, "");
  return `gloobal-receipt-${code || "payment"}.png`;
}

// Share first, download second — the same order and the same canShare
// check as the receive-QR card and the audit report.
async function shareReceiptImage(receipt, opts = {}) {
  try {
    if (!receipt || typeof document === "undefined") return "failed";
    let photo = opts.photo;
    if (photo === undefined && receipt.id && typeof loadCounterpartyPhoto === "function") {
      photo = await loadCounterpartyPhoto(receipt.id).catch(() => null);
    }
    const model = buildReceiptImageModel(receipt, { ...opts, photo });
    const canvas = await renderReceiptImage(model, { scale: opts.scale || 2 });
    const blob = await receiptImageToBlob(canvas);
    const filename = receiptImageFilename(receipt);

    if (typeof File !== "undefined" && typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Gloobal receipt" });
          return "shared";
        } catch (error) {
          return error && error.name === "AbortError" ? "cancelled" : "failed";
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
