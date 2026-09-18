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
//   - Nobody's face is on it. The counterparty's photo was drawn here and
//     is not any more — see "Who it was" below for why the fallback disc was
//     the worse half of that. Nothing in this file loads a photo, so a
//     forwarded receipt cannot carry one and the canvas cannot be tainted by
//     one either.

var RECEIPT_IMAGE_BRAND = {
  wordmark: "GLOOBAL",
  hooman: "Hooman to Hooman",
  tagline: "Cashless · Textless · Borderless · Limitless"
};

var RECEIPT_IMAGE_DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];

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

function buildReceiptImageModel(receipt, { viewerName, viewerSymbolId } = {}) {
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

  // ── The Creator Share, always ────────────────────────────────────────
  //
  // Always, including when it is zero. A row that disappears at 0% and a row
  // that reads 0% say different things to somebody reading a forwarded
  // receipt: the first leaves them to assume a share was taken and not shown.
  // Only the second is true.
  //
  // The AMOUNT is read, not worked out, by the same rule ReceiptModal states
  // at `shownShareAmount`: the figure the server recorded wins, and the
  // multiplication below is only the fallback for a payment this device
  // settled locally and for which no share leg exists. The two round
  // differently in the last minor unit, and a receipt whose share does not
  // reconcile with the ledger is worse than one that shows the plainer
  // figure. A recorded 0 counts as "not recorded" — every builder defaults an
  // absent share to 0 — so it falls through to the multiplication, which is
  // also 0 when the rate is 0.
  const shareRatePercent = Number(r.shareRate) || 0;
  const recordedShare = Number(r.shareAmount);
  const shareAmountValue = isShare
    ? (Number(r.shareAmount) || Number(r.amount) || 0)
    : (Number.isFinite(recordedShare) && recordedShare > 0
      ? recordedShare
      : (Number(r.amount) || 0) * (shareRatePercent / 100));
  // Trimmed rather than fixed to two places: "20%" not "20.00%", but "2.5%"
  // keeps its half.
  const shareRateText = `${Number(shareRatePercent.toFixed(2))}%`;

  return {
    headline,
    status,
    // What the purple zone says above the figure. On a completed payment it
    // names the DIRECTION, because the status is carried by the mark at the
    // foot; on anything else it is the headline, so a pending or simulated
    // payment says so at the top of the card as well as the bottom.
    //
    // A Creator Share says so instead of "Money received". The direction is
    // true but it is not what this row IS, and with the share chip now on
    // every receipt, a share receipt labelled "Money received" reads as an
    // ordinary payment that happens to carry a share of exactly its own size.
    heroLabel: status === "completed"
      ? (isShare ? "Creator Share" : isCoin ? (r.title || "Gloobal Coin") : isSent ? "Money sent" : "Money received")
      : headline,
    // The figure as the card prints it: a MINUS on money that left, nothing
    // on money that arrived.
    //
    // A sign, not a colour — this figure is white on the brand gradient, and
    // a red-for-out/green-for-in scheme would either fight that ground or be
    // invisible on it. The minus survives a greyscale print, a screenshot and
    // a colour-blind reader, which is what a record has to do.
    //
    // No "+" on the received side. A leading plus on a receipt reads as an
    // adjustment or a credit note rather than as money arriving, and the
    // label above it already says which way it went.
    //
    // amountText stays unsigned: it is the formatted figure, and the sign is
    // a presentation decision about direction, made here in the model so the
    // renderer keeps making none.
    heroAmountText: isSent && amountText ? `−${amountText}` : amountText,
    shareRate: shareRatePercent,
    shareRateText,
    shareAmountText: receiptImageMoney(shareAmountValue, currency),
    shareText: `${shareRateText} \u00b7 ${receiptImageMoney(shareAmountValue, currency)}`,
    // What the chip on the purple says. On a share receipt the figure above
    // IS the share amount, so repeating it under a "Creator Share" eyebrow
    // says the same thing three times; the rate is the part not already
    // shown. Everywhere else the chip carries both, at zero included.
    shareChipLabel: isShare ? "Share rate" : "Creator share",
    shareChipValue: isShare ? shareRateText : `${shareRateText} \u00b7 ${receiptImageMoney(shareAmountValue, currency)}`,
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

// An uppercase eyebrow with real tracking. ctx.letterSpacing exists in
// Chromium only, and a label set solid reads as a mistake at this size, so
// the gaps are placed by hand. Returns the width drawn.
function receiptImageDrawTracked(ctx, text, cx, baseline, { size = 11, weight = 800, color = "#FFFFFF", tracking = 1.6, align = "center" } = {}) {
  ctx.font = `${weight} ${size}px ${RECEIPT_IMAGE_FONT_BODY}`;
  const chars = Array.from(String(text || ""));
  const widths = chars.map((ch) => ctx.measureText(ch).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0) - (chars.length ? tracking : 0);
  let x = align === "center" ? cx - total / 2 : align === "right" ? cx - total : cx;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    x += widths[i];
  });
  return total;
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
  const [logo, flag] = await Promise.all([
    receiptImageLoad(logoSrc),
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
  // Assigned once the card's height is known, and read by the ops, which all
  // run after that. The perforation notches are filled with this same
  // gradient object rather than a stand-in purple, so they match the card
  // exactly at whatever height it ends up.
  let cardGradient = null;

  // ── N3: the figure on the brand, the facts on white ─────────────────────
  //
  // The card used to be white with a purple strip across the top, and the
  // headline, the tick and the amount all competed for the same middle. This
  // inverts it. The whole card is the brand gradient and carries exactly one
  // thing — what happened and how much — and every fact that has to be read
  // back later sits on a white panel floating inside it.
  //
  // The split is the point: the purple is glanceable at thumbnail size in a
  // chat, and the white panel is the part somebody forwards to an accountant.
  // Nothing appears in both.
  const CARD_TOP = MARGIN;
  const PANEL_INSET = 14;
  const PANEL_X = CX + PANEL_INSET;
  const PANEL_W = CW - PANEL_INSET * 2;
  const PANEL_PAD = 24;
  const PW = PANEL_W - PANEL_PAD * 2;
  const PLX = PANEL_X + PANEL_PAD;
  const PRX = PANEL_X + PANEL_W - PANEL_PAD;
  const PCX = CX + CW / 2;

  // ── The brand zone ──
  let y = CARD_TOP + 44;

  const wordBase = y;
  ops.push(() => {
    const markSize = 23;
    const logoH = 30;
    const logoW = whiteLogo ? logoH * (whiteLogo.width / whiteLogo.height) : 0;
    const wordW = receiptImageDrawWordmark(ctx, 0, 0, markSize, "#FFFFFF", [dotA, dotB], { measureOnly: true });
    const groupW = logoW + (logoW ? 9 : 0) + wordW;
    const gx = PCX - groupW / 2;
    if (whiteLogo) ctx.drawImage(whiteLogo, gx, wordBase - logoH * 0.78, logoW, logoH);
    receiptImageDrawWordmark(ctx, gx + logoW + (logoW ? 9 : 0), wordBase, markSize, "#FFFFFF", [dotA, dotB]);
  });
  y = wordBase + 40;

  const eyebrowBase = y;
  ops.push(() => {
    receiptImageDrawTracked(ctx, String(m.heroLabel || "").toUpperCase(), PCX, eyebrowBase, {
      size: 11.5, weight: 800, color: "rgba(255,255,255,0.72)", tracking: 2.4
    });
  });
  y = eyebrowBase + 54;

  const figureBase = y;
  ops.push(() => {
    const text = m.heroAmountText || m.amountText || "—";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const size = receiptImageFit(ctx, text, (z) => `700 ${z}px ${RECEIPT_IMAGE_FONT_DISPLAY}`, 52, 26, PW);
    ctx.font = `700 ${size}px ${RECEIPT_IMAGE_FONT_DISPLAY}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(receiptImageEllipsis(ctx, text, PW), PCX, figureBase);
  });
  y = figureBase;

  // The ISO code under the figure, because a bare $ or ¥ is ambiguous. Not
  // repeated when the figure already ends in it ("1,450.25 CHF").
  const showCode = !!(m.currency && !String(m.amountText || "").endsWith(m.currency));
  if (showCode) {
    const codeBase = y + 26;
    ops.push(() => {
      receiptImageDrawTracked(ctx, m.currency, PCX, codeBase, {
        size: 12.5, weight: 700, color: "rgba(255,255,255,0.78)", tracking: 1.8
      });
    });
    y = codeBase;
  }

  // ── The Creator Share chip, on every receipt ──
  //
  // Including at zero, and that is the whole reason it is here rather than in
  // the detail rows. A chip that vanishes when the rate is 0% leaves a reader
  // to assume a share was taken and not shown; "0% · 0.00₹" is the only
  // version of that which is true. At zero it is drawn quieter, not hidden.
  const shareTop = y + 26;
  const SHARE_H = 30;
  ops.push(() => {
    const zero = !(Number(m.shareRate) > 0);
    const label = String(m.shareChipLabel || "Creator share");
    const value = String(m.shareChipValue || m.shareText || "");
    ctx.font = `700 12.5px ${RECEIPT_IMAGE_FONT_BODY}`;
    const labelW = ctx.measureText(label).width;
    ctx.font = `700 13px ${RECEIPT_IMAGE_FONT_BODY}`;
    const valueW = ctx.measureText(value).width;
    const chipW = labelW + 10 + valueW + 32;
    const chipX = PCX - chipW / 2;
    receiptImageRoundRect(ctx, chipX, shareTop, chipW, SHARE_H, SHARE_H / 2);
    ctx.fillStyle = zero ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.18)";
    ctx.fill();
    ctx.strokeStyle = zero ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.30)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const base = shareTop + SHARE_H / 2 + 4.5;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 12.5px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = zero ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.78)";
    ctx.fillText(label, chipX + 16, base);
    ctx.textAlign = "left";
    ctx.font = `700 13px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = zero ? "rgba(255,255,255,0.72)" : "#FFFFFF";
    ctx.fillText(value, chipX + 16 + labelW + 10, base);
  });
  y = shareTop + SHARE_H;

  // ── The white panel ──
  const panelTop = y + 26;
  const panelBox = { h: 0 };
  ops.push(() => {
    receiptImageRoundRect(ctx, PANEL_X, panelTop, PANEL_W, panelBox.h, 22);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
  });

  let py = panelTop + 10;

  // ── The rows ─────────────────────────────────────────────────────────────
  //
  // Every fact as a label/value row, the conversion included. An earlier pass
  // led with a large centred name and gave the conversion a filled box of its
  // own; both pulled the eye away from the figure on the purple, which is the
  // one thing this card exists to show. Flat rows read faster, and they let
  // the conversion sit WITH the other facts instead of announcing itself as a
  // separate event.
  //
  // The rate keeps its stored direction — see ReceiptModal's fxRateLabel.
  // Printing "1 EUR = 91.80 INR" when the server recorded the other way round
  // means inverting a number and calling it a record, which is the one thing
  // this file must never do.
  const panelRows = [];
  panelRows.push({ label: m.counterpartyLabel, value: m.counterpartyName || "—", flag: true });
  if (m.counterpartyId) panelRows.push({ label: "Gloobal ID", value: m.counterpartyId, symbols: true });
  if (m.conversion) {
    panelRows.push({ label: "Sent", value: m.conversion.sentText });
    panelRows.push({ label: "Received", value: m.conversion.receivedText });
    panelRows.push({ label: "Rate applied", value: m.conversion.rateText, accent: true });
  }
  if (m.viewerName) panelRows.push({ label: m.viewerLabel, value: m.viewerName });
  const whenText = [m.date, m.time].filter(Boolean).join(" · ");
  if (whenText) {
    panelRows.push({ label: m.date && m.time ? "Date · Time" : (m.date ? "Date" : "Time"), value: whenText });
  }
  if (m.receiptCode) panelRows.push({ label: "Receipt code", value: m.receiptCode, mono: true });

  const ROW_H = 40;
  const rowsTop = py;
  ops.push(() => {
    panelRows.forEach((row, i) => {
      const top = rowsTop + i * ROW_H;
      const base = top + ROW_H / 2 + 5;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(PLX, top);
        ctx.lineTo(PRX, top);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 13.5px ${RECEIPT_IMAGE_FONT_BODY}`;
      ctx.fillStyle = INK_SOFT;
      ctx.fillText(row.label, PLX, base);
      const labelW = ctx.measureText(row.label).width;

      // The flag rides at the right edge and the name is measured to stop
      // short of it, rather than the name being placed and the flag pushed
      // past the panel — which is how a long name loses its country.
      const fr = 8.5;
      const wantsFlag = !!(row.flag && flag);
      const rightEdge = wantsFlag ? PRX - fr * 2 - 8 : PRX;
      const maxW = rightEdge - PLX - labelW - 20;

      if (row.symbols) {
        receiptImageDrawSymbols(ctx, row.value, rightEdge, base, maxW, { size: 15, align: "right" });
      } else {
        ctx.textAlign = "right";
        ctx.font = row.mono
          ? `700 14.5px ui-monospace, 'Cascadia Mono', Consolas, monospace`
          : `700 14.5px ${RECEIPT_IMAGE_FONT_BODY}`;
        ctx.fillStyle = row.accent ? ACCENT : INK;
        ctx.fillText(receiptImageEllipsis(ctx, row.value, maxW), rightEdge, base);
      }

      if (wantsFlag) {
        const fx = PRX - fr;
        const fy = base - 5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.clip();
        const iw = flag.naturalWidth || flag.width;
        const ih = flag.naturalHeight || flag.height;
        const side = Math.min(iw, ih);
        ctx.drawImage(flag, (iw - side) / 2, (ih - side) / 2, side, side, fx - fr, fy - fr, fr * 2, fr * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  });
  py = rowsTop + panelRows.length * ROW_H;

  // The one line the rows cannot carry. A rate with no date attached invites
  // being read as today's, and a forwarded receipt is read long after the day
  // it was made.
  if (m.conversion) {
    const noteBase = py + 18;
    ops.push(() => {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 11px ${RECEIPT_IMAGE_FONT_BODY}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText("As settled at the time of this transaction, not a current rate.", PLX, noteBase);
    });
    py = noteBase + 4;
  }

  // ── Transaction ID, in its own block ──
  //
  // Not one of the rows above. It is the thing somebody quotes back when this
  // payment has to be found again, it is twelve coloured symbols rather than
  // a word, and right-aligned in a row it shrank until it could not be read
  // off a screenshot. Outlined rather than filled: on a white panel a filled
  // block reads as a second card.
  if (m.reference) {
    const refTop = py + 20;
    const REF_H = 66;
    ops.push(() => {
      receiptImageRoundRect(ctx, PLX, refTop, PW, REF_H, 14);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      receiptImageDrawTracked(ctx, String(m.referenceLabel).toUpperCase(), PCX, refTop + 25, {
        size: 10, weight: 800, color: INK_FAINT, tracking: 2
      });
      receiptImageDrawSymbols(ctx, m.reference, PCX, refTop + 50, PW - 32, { size: 18, align: "center" });
    });
    py = refTop + REF_H;
  }

  // ── Status ──
  const pillTop = py + 22;
  const PILL_H = 34;
  ops.push(() => {
    const done = m.status === "completed";
    const tone = m.status === "pending" ? "#B45309" : m.status === "simulated" ? INK_SOFT : POSITIVE;
    const wash = m.status === "pending" ? "#FEF3C7" : m.status === "simulated" ? SURFACE_ALT : POSITIVE_SOFT;
    const text = m.status === "pending" ? "Pending" : m.status === "simulated" ? "Not sent · Simulated" : "Completed";
    ctx.font = `800 13.5px ${RECEIPT_IMAGE_FONT_BODY}`;
    const w = ctx.measureText(text).width + 52;
    const x = PCX - w / 2;
    receiptImageRoundRect(ctx, x, pillTop, w, PILL_H, PILL_H / 2);
    ctx.fillStyle = wash;
    ctx.fill();
    const cy = pillTop + PILL_H / 2;
    const mx = x + 20;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (done) {
      ctx.moveTo(mx - 6, cy);
      ctx.lineTo(mx - 1.5, cy + 4.5);
      ctx.lineTo(mx + 7, cy - 5);
    } else if (m.status === "pending") {
      ctx.arc(mx, cy, 6.5, 0, Math.PI * 2);
      ctx.moveTo(mx, cy - 3.5);
      ctx.lineTo(mx, cy);
      ctx.lineTo(mx + 3.5, cy + 2);
    } else {
      ctx.moveTo(mx, cy - 6);
      ctx.lineTo(mx, cy + 1);
      ctx.moveTo(mx, cy + 5);
      ctx.lineTo(mx, cy + 5.5);
    }
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = tone;
    ctx.fillText(text, mx + 15, cy + 5);
  });
  py = pillTop + PILL_H;

  // ── Footer, inside the white panel ──
  const footerTop = py + 24;
  const hoomanBase = footerTop + 40;
  const taglineBase = hoomanBase + 26;
  ops.push(() => {
    // Perforation-style divider: the receipt tears off here. The notches are
    // filled with the PURPLE the panel floats on, not the page colour — this
    // divider is inside the card now, and a page-coloured notch would read as
    // two holes punched in the brand.
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + 16, footerTop);
    ctx.lineTo(PANEL_X + PANEL_W - 16, footerTop);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = cardGradient || (theme.bg || "#F6F5FC");
    [PANEL_X, PANEL_X + PANEL_W].forEach((nx) => {
      ctx.beginPath();
      ctx.arc(nx, footerTop, 9, 0, Math.PI * 2);
      ctx.fill();
    });

    receiptImageDrawHooman(ctx, PCX, hoomanBase, 18, ACCENT === "#7C3AED" ? "#4C1D95" : ACCENT, hoomanDots, m.brand.hooman);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 12.5px ${RECEIPT_IMAGE_FONT_BODY}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(m.brand.tagline, PCX, taglineBase);
  });

  const panelBottom = taglineBase + 26;
  panelBox.h = panelBottom - panelTop;
  const cardBottom = panelBottom + PANEL_INSET;
  const H = cardBottom + MARGIN;

  canvas.width = Math.round(W * s);
  canvas.height = Math.round(H * s);
  ctx.setTransform(s, 0, 0, s, 0, 0);

  // Page.
  ctx.fillStyle = theme.bg || "#F6F5FC";
  ctx.fillRect(0, 0, W, H);

  // The card, gradient all the way down.
  ctx.save();
  ctx.shadowColor = "rgba(76,29,149,0.22)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  receiptImageRoundRect(ctx, CX, CARD_TOP, CW, cardBottom - CARD_TOP, 28);
  cardGradient = ctx.createLinearGradient(CX, CARD_TOP, CX + CW, cardBottom);
  cardGradient.addColorStop(0, "#1E1B4B");
  cardGradient.addColorStop(0.38, "#3E2E8E");
  cardGradient.addColorStop(0.74, "#7C3AED");
  cardGradient.addColorStop(1, "#C026D3");
  ctx.fillStyle = cardGradient;
  ctx.fill();
  ctx.restore();
  ctx.save();
  receiptImageRoundRect(ctx, CX, CARD_TOP, CW, cardBottom - CARD_TOP, 28);
  ctx.clip();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(CX + CW - 30, CARD_TOP - 20, 95, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.arc(CX + 20, CARD_TOP + 150, 80, 0, Math.PI * 2);
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

  canvas.dataset.receiptModel = JSON.stringify(m);
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
// ── One share: the picture and the link ──────────────────────────────────
//
// The receipt had two share buttons: this one sent the picture, and a second
// one on the Transaction ID box sent a written summary and the /t/ link. Two
// share sheets for one receipt, and whichever you picked, you did not send
// the other half — the picture cannot be clicked through to the transaction,
// and the link is not something you can look at in a chat.
//
// They are one action now, and this builds the payload for it.
//
// The written summary is NOT in it. The picture already states the amount,
// the counterparty, the date and the Transaction ID, in Gloobal's own type —
// so a `text` field repeating all of it put the same receipt in the message
// twice, once as a document and once as a wall of plain text under it. The
// picture is the receipt; the link is where it leads. Nothing else goes.
//
// The ladder is the awkward part, and it exists because navigator.share is
// not uniform. A target that accepts files does not necessarily accept `url`
// alongside them, and the whole payload is rejected when any part of it is
// unsupported — so asking for both at once and giving up on a `false` from
// canShare would lose the picture on exactly the platforms that can show it.
// Each rung drops the least valuable thing that could be causing the
// refusal, and canShare decides, not a browser sniff:
//
//   1. picture + link, the thing that was asked for
//   2. the same, with the link folded into `text` — the field that survives
//      when `url` does not, and a pasted link is still a link
//   3. the picture alone, reported back as its own outcome so the caller can
//      say the link did not go rather than silently dropping it
//
// Nothing here opens a second share sheet. A person who wanted one share and
// got two is the thing this replaced.
function receiptShareAttempts(file, link) {
  const title = "Gloobal receipt";
  const out = [];
  if (link) {
    out.push([{ files: [file], title, url: link }, "shared"]);
    out.push([{ files: [file], title, text: link }, "shared"]);
  }
  out.push([{ files: [file], title }, link ? "shared-without-link" : "shared"]);
  return out;
}

async function shareReceiptImage(receipt, opts = {}) {
  try {
    if (!receipt || typeof document === "undefined") return "failed";
    // No photo is fetched. This used to call loadCounterpartyPhoto — a
    // request to the server for the other party's picture — purely so the
    // panel above could draw it. With the avatar gone that request buys
    // nothing, and not making it is the better half of the change: sharing a
    // receipt no longer reaches for anyone's face.
    const model = buildReceiptImageModel(receipt, opts);
    const canvas = await renderReceiptImage(model, { scale: opts.scale || 2 });
    const blob = await receiptImageToBlob(canvas);
    const filename = receiptImageFilename(receipt);

    const link = typeof opts.link === "string" ? opts.link.trim() : "";

    if (typeof File !== "undefined" && typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
      const file = new File([blob], filename, { type: "image/png" });
      for (const [payload, outcome] of receiptShareAttempts(file, link)) {
        let allowed = false;
        try {
          allowed = navigator.canShare(payload);
        } catch {
          allowed = false;
        }
        if (!allowed) continue;
        try {
          await navigator.share(payload);
          return outcome;
        } catch (error) {
          // A refusal here is the SHEET's answer, not the payload's, so the
          // ladder stops: retrying a shorter payload would re-open a sheet
          // the person just dismissed.
          return error && error.name === "AbortError" ? "cancelled" : "failed";
        }
      }
    }

    // No file sharing at all. The picture is downloaded, and the link goes to
    // the clipboard in the same gesture rather than needing a second button —
    // one action still carries both halves, just by two different routes.
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    if (link && typeof copyToClipboard === "function") {
      try {
        // The link alone. The downloaded PNG is the receipt; pasting its
        // contents again as text beside it is the duplication this removed.
        copyToClipboard(link);
        return "downloaded-link-copied";
      } catch {
      }
    }
    return "downloaded";
  } catch {
    return "failed";
  }
}
