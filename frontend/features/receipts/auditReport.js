// src/features/receipts/auditReport.js
//
// The audit report: one transaction, as a PDF you can send to somebody.
//
// A receipt is for the person who made the payment. This is for whoever they
// have to show it to — an accountant, a support queue, the other side of a
// dispute. Same facts, stated formally, in a file that leaves the app.
//
// ── Why this writes the PDF by hand ──────────────────────────────────────
//
// The obvious answer is a library. jsPDF is ~350KB and this bundle has five
// runtime dependencies in total, for a PWA whose people are on mid-range
// Android. A one-page, text-and-lines document does not need a general PDF
// engine: the format is a plain byte stream with an offset table, and what is
// below is the whole of it.
//
// The other answer — `window.print()` and "Save as PDF" — costs nothing and
// was the first plan. It is not a file. It cannot be handed to
// navigator.share, cannot be attached to an email from the app, and puts a
// print dialog in front of somebody who asked for a document.
//
// ── Why the report writes ISO codes and never currency symbols ───────────
//
// Partly practical: PDF's built-in fonts cover WinAnsi, and the rupee sign
// is not in it. A PDF that renders "500.00" where the screen says "500.00₹"
// would be a document that quietly drops the unit — the worst possible
// failure for a financial record.
//
// Mostly deliberate, though. "$" is the currency of a dozen countries. On a
// document that exists to settle questions, "500.00 INR" answers one that
// "₹500.00" only appears to. Every figure below is written amount-then-code.
//
// The Gloobal reference symbols ARE drawn — as vector paths, not glyphs (see
// SYMBOL_PAINTERS). A reference is the one thing on this page somebody might
// have to match character for character against another system, so it is
// reproduced exactly rather than transliterated.

// ── Page geometry, in PDF points (1/72") ────────────────────────────────
//
// A4 rather than Letter: this app is built in India and the report will be
// printed and filed there far more often than not.
var AUDIT_PAGE_W = 595.28;
var AUDIT_PAGE_H = 841.89;
var AUDIT_MARGIN = 48;
var AUDIT_COL_VALUE_RIGHT = AUDIT_PAGE_W - AUDIT_MARGIN;

// ── Helvetica metrics ────────────────────────────────────────────────────
//
// Adobe's own widths, per 1000 em, for printable ASCII. Needed only so
// amounts can be RIGHT-aligned, which on a financial document is not
// decoration: a column of figures whose decimal points do not line up is one
// a person has to read digit by digit to compare.
var AUDIT_W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
var AUDIT_W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];

function auditTextWidth(text, size, bold) {
  const table = bold ? AUDIT_W_BOLD : AUDIT_W_REG;
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    units += c >= 32 && c <= 126 ? table[c - 32] : 556;
  }
  return (units / 1000) * size;
}

// Anything outside printable ASCII is replaced rather than dropped.
//
// Dropping is the failure this guards: a name with an accent would silently
// lose a letter, and nobody reading the PDF would know a character had ever
// been there. A visible marker is a worse-looking document and a more honest
// one. The Gloobal symbols never reach here — they are painted.
function auditAscii(text) {
  let out = "";
  const s = String(text == null ? "" : text);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 32 && c <= 126 ? s[i] : "?";
  }
  return out;
}

// PDF string literals are parenthesised, so three characters must escape.
function auditEscape(text) {
  return auditAscii(text).replace(/([\\()])/g, "\\$1");
}

// ── The Gloobal alphabet, as paths ───────────────────────────────────────
//
// The same eight shapes the dial pad, the ID chips and the codes draw, at
// whatever size the page needs. A reference on this document has to match,
// character for character, a reference on a screen or in a database — so it
// is reproduced, not described.
//
// Local copy of the alphabet for the reason every other module here states:
// build_app.mjs concatenates these files into one scope and `var` hoists the
// declaration but not the initialiser, so reading DIAL_SYMBOLS at load time
// reads undefined. tests/audit-report.test.mjs holds the copy honest.
var AUDIT_SYMBOLS = ["−", "+", "\xD7", "=", "○", "□", "●", "■"];

// Circle from four cubic Béziers. 0.5523 is the standard magic constant.
function auditCircle(cx, cy, r) {
  const k = r * 0.5523;
  return (
    `${cx - r} ${cy} m ` +
    `${cx - r} ${cy + k} ${cx - k} ${cy + r} ${cx} ${cy + r} c ` +
    `${cx + k} ${cy + r} ${cx + r} ${cy + k} ${cx + r} ${cy} c ` +
    `${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r} c ` +
    `${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy} c `
  );
}

// A bar of thickness t, length L, centred on (cx, cy) and rotated by deg.
// Emitted as an explicit quadrilateral rather than with `cm`, because `cm`
// would alter the coordinate system for everything drawn after it and this
// has to compose with ordinary text placement.
function auditBar(cx, cy, len, thick, deg) {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a) * (len / 2);
  const uy = Math.sin(a) * (len / 2);
  const vx = -Math.sin(a) * (thick / 2);
  const vy = Math.cos(a) * (thick / 2);
  const p = (sx, sy) => `${(cx + sx).toFixed(2)} ${(cy + sy).toFixed(2)}`;
  return (
    `${p(-ux + vx, -uy + vy)} m ` +
    `${p(ux + vx, uy + vy)} l ` +
    `${p(ux - vx, uy - vy)} l ` +
    `${p(-ux - vx, -uy - vy)} l h `
  );
}

// One painter per symbol, drawing into a box of side `s` whose centre is
// (cx, cy). Returns a content-stream fragment.
var SYMBOL_PAINTERS = [
  // − minus
  (cx, cy, s) => auditBar(cx, cy, s * 0.74, s * 0.16, 0) + "f\n",
  // + plus
  (cx, cy, s) =>
    auditBar(cx, cy, s * 0.74, s * 0.16, 0) + "f\n" +
    auditBar(cx, cy, s * 0.74, s * 0.16, 90) + "f\n",
  // × times
  (cx, cy, s) =>
    auditBar(cx, cy, s * 0.72, s * 0.16, 45) + "f\n" +
    auditBar(cx, cy, s * 0.72, s * 0.16, -45) + "f\n",
  // = equals
  (cx, cy, s) =>
    auditBar(cx, cy + s * 0.14, s * 0.74, s * 0.13, 0) + "f\n" +
    auditBar(cx, cy - s * 0.14, s * 0.74, s * 0.13, 0) + "f\n",
  // ○ hollow circle
  (cx, cy, s) => `${(s * 0.11).toFixed(2)} w ` + auditCircle(cx, cy, s * 0.3) + "S\n",
  // □ hollow square
  (cx, cy, s) =>
    `${(s * 0.11).toFixed(2)} w ${(cx - s * 0.3).toFixed(2)} ${(cy - s * 0.3).toFixed(2)} ` +
    `${(s * 0.6).toFixed(2)} ${(s * 0.6).toFixed(2)} re S\n`,
  // ● filled circle
  (cx, cy, s) => auditCircle(cx, cy, s * 0.32) + "f\n",
  // ■ filled square
  (cx, cy, s) =>
    `${(cx - s * 0.32).toFixed(2)} ${(cy - s * 0.32).toFixed(2)} ` +
    `${(s * 0.64).toFixed(2)} ${(s * 0.64).toFixed(2)} re f\n`
];

// A Gloobal reference, painted left-to-right from x. Returns { ops, width }.
// Unknown characters are SKIPPED rather than guessed at — a reference that
// contains something outside the alphabet is not a Gloobal reference, and
// inventing a shape for it would make a wrong document look right.
function auditPaintReference(reference, x, y, size) {
  const step = size * 0.86;
  let ops = "";
  let drawn = 0;
  const chars = Array.from(String(reference || ""));
  for (const ch of chars) {
    const index = AUDIT_SYMBOLS.indexOf(ch);
    if (index === -1) continue;
    ops += SYMBOL_PAINTERS[index](x + drawn * step + step / 2, y + size * 0.32, size);
    drawn += 1;
  }
  return { ops, width: drawn * step, count: drawn };
}

// ── The document ─────────────────────────────────────────────────────────

function auditMoney(amount, code) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  // Two decimals here regardless of the currency's own precision, which is a
  // departure from fmtMoney and is deliberate: this is a ledger document, and
  // a column where some rows carry decimals and others do not is one a reader
  // has to check twice. The CODE says what the unit is.
  return `${n.toFixed(2)} ${String(code || "").toUpperCase() || "—"}`;
}

// Builds the page's content stream. Kept apart from the file assembly below
// so the layout can be read as layout.
function auditContentStream(report) {
  const L = AUDIT_MARGIN;
  const R = AUDIT_COL_VALUE_RIGHT;
  let y = AUDIT_PAGE_H - AUDIT_MARGIN;
  let ops = "";

  const text = (str, x, size, bold, gray) => {
    const g = gray == null ? 0 : gray;
    ops += `BT ${g} ${g} ${g} rg /${bold ? "F2" : "F1"} ${size} Tf ` +
      `${x.toFixed(2)} ${y.toFixed(2)} Td (${auditEscape(str)}) Tj ET\n0 0 0 rg\n`;
  };
  const right = (str, size, bold, gray) =>
    text(str, R - auditTextWidth(auditAscii(str), size, bold), size, bold, gray);
  const rule = (gray) => {
    const g = gray == null ? 0.82 : gray;
    ops += `${g} ${g} ${g} RG 0.7 w ${L} ${y.toFixed(2)} m ${R} ${y.toFixed(2)} l S\n0 0 0 RG\n`;
  };
  const gap = (n) => { y -= n; };
  const row = (label, value) => {
    text(label, L, 9.5, false, 0.35);
    right(value, 9.5, true);
    gap(15);
  };
  const heading = (str) => {
    gap(6);
    text(str.toUpperCase(), L, 8.5, true, 0.45);
    gap(6);
    rule();
    gap(14);
  };

  // Title block
  text("GLOOBAL", L, 17, true);
  right(report.generatedAt || "", 8.5, false, 0.45);
  gap(17);
  text("Transaction audit report", L, 10.5, false, 0.35);
  gap(20);
  rule(0.55);
  gap(22);

  // ── The payment ────────────────────────────────────────────────────────
  heading("Payment");
  row(report.payment.directionLabel, auditMoney(report.payment.amount, report.payment.currency));
  row(report.payment.counterpartyLabel, report.payment.counterpartyName || "—");
  if (report.payment.date) row("Date", report.payment.date);
  if (report.payment.time) row("Time", report.payment.time);
  if (report.payment.method) row("Method", report.payment.method);
  if (report.payment.status) row("Status", report.payment.status);

  // ── Currency conversion ───────────────────────────────────────────────
  //
  // Only when the two sides really are different currencies. A "conversion"
  // section on a domestic payment showing 1.000000 states that an exchange
  // took place, and none did.
  if (report.conversion) {
    heading("Currency conversion");
    row("Sender pays", auditMoney(report.conversion.sourceAmount, report.conversion.sourceCurrency));
    row("Receiver gets", auditMoney(report.conversion.destinationAmount, report.conversion.destinationCurrency));
    row("Rate applied", report.conversion.rateLabel);
    // The sentence that makes the figure above meaningful. A rate with no
    // date on it is a rate somebody will assume is today's.
    text(
      "Rate as settled at the time of this transaction, not a current market rate.",
      L, 8, false, 0.45
    );
    gap(16);
  }

  // ── The Creator Share ─────────────────────────────────────────────────
  if (report.share) {
    heading("Creator Share");
    row(report.share.directionLabel, auditMoney(report.share.amount, report.share.currency));
    row("Rate", report.share.rateLabel);
    if (report.share.counterpartyName) row(report.share.counterpartyLabel, report.share.counterpartyName);
  }

  // ── References ────────────────────────────────────────────────────────
  heading("References");
  for (const ref of report.references || []) {
    text(ref.label, L, 9.5, false, 0.35);
    if (ref.value) {
      const painted = auditPaintReference(ref.value, L, y, 8.5);
      if (painted.count) {
        // Right-align the painted block the same way a text value would be.
        const shifted = auditPaintReference(ref.value, R - painted.width, y, 8.5);
        ops += shifted.ops;
      } else {
        right(ref.value, 9.5, true);
      }
    } else {
      right("—", 9.5, true);
    }
    gap(16);
  }

  // ── Footer ────────────────────────────────────────────────────────────
  y = AUDIT_MARGIN + 34;
  rule();
  gap(14);
  text(
    "Generated by Gloobal from the records on this device. Figures are as settled;",
    L, 7.5, false, 0.5
  );
  gap(10);
  text("nothing on this page is recalculated at the time of printing.", L, 7.5, false, 0.5);

  return ops;
}

// ── File assembly ────────────────────────────────────────────────────────
//
// A PDF is a list of numbered objects, a cross-reference table of their byte
// offsets, and a trailer pointing at the table. The offsets must be exact and
// are counted in BYTES — so the buffer is built as bytes from the start
// rather than as a string that is encoded at the end, where a single
// multi-byte character would shift every offset after it and produce a file
// that opens in some readers and not others.
function auditPdfBytes(report) {
  const content = auditContentStream(report);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + AUDIT_PAGE_W + " " + AUDIT_PAGE_H +
      "] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    "<< /Length " + content.length + " >>\nstream\n" + content + "endstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  ];

  const chunks = [];
  let length = 0;
  const push = (str) => {
    const bytes = new TextEncoder().encode(str);
    chunks.push(bytes);
    length += bytes.length;
  };

  push("%PDF-1.4\n");
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefAt = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

// ── What the receipt hands in ────────────────────────────────────────────
//
// Every figure is taken off the receipt as it stands. Nothing here computes a
// rate, converts an amount or derives a missing side — a field the receipt
// does not have becomes a dash on the page, which is the true statement.
function buildAuditReport(receipt, options) {
  const opts = options || {};
  const isShare = receipt.kind === "share";
  const paymentIsSent = isShare ? receipt.sourceDirection === "sent" : receipt.direction === "sent";
  const paymentAmount = isShare ? receipt.sourceAmount : receipt.amount;
  const paymentCurrency = isShare
    ? receipt.sourceCurrencyCode || receipt.currencyCode
    : receipt.currencyCode;
  const shareIsCredit = isShare ? receipt.direction !== "sent" : receipt.direction === "sent";
  const shareRate = isShare ? receipt.sourceShareRate : receipt.shareRate;
  const shareAmount = isShare
    ? Number(receipt.shareAmount) || Number(receipt.amount) || 0
    : (Number(receipt.amount) || 0) * ((Number(receipt.shareRate) || 0) / 100);

  const conversion =
    receipt.sourceCurrency && receipt.destinationCurrency &&
    receipt.sourceCurrency !== receipt.destinationCurrency
      ? {
          sourceAmount: receipt.sourceSideAmount,
          sourceCurrency: receipt.sourceCurrency,
          destinationAmount: receipt.destinationSideAmount,
          destinationCurrency: receipt.destinationCurrency,
          rateLabel: receipt.fxRateLabel || "—"
        }
      : null;

  return {
    generatedAt: opts.generatedAt || "",
    payment: {
      directionLabel: paymentAmount == null ? "Amount (not on this device)" : (paymentIsSent ? "Money sent" : "Money received"),
      amount: paymentAmount,
      currency: paymentCurrency,
      counterpartyLabel: paymentIsSent ? "To" : "From",
      counterpartyName: receipt.name,
      date: receipt.date,
      time: receipt.time,
      method: receipt.method,
      status: receipt.status
    },
    conversion,
    share: (shareRate != null || isShare)
      ? {
          directionLabel: shareIsCredit ? "Shared back to you" : "You shared back",
          amount: shareAmount,
          currency: receipt.currencyCode,
          rateLabel: shareRate == null ? "—" : `${Number(shareRate).toFixed(2)}%`,
          counterpartyLabel: shareIsCredit ? "Shared back by" : "Shared back to",
          counterpartyName: receipt.name
        }
      : null,
    references: [
      { label: "Payment reference", value: isShare ? receipt.sourceTxnId : receipt.txnId },
      { label: "Creator Share reference", value: isShare ? receipt.txnId : receipt.shareTxnId },
      { label: "Gloobal ID", value: receipt.id }
    ].filter((r) => r.value)
  };
}

// The two entry points. `bytes` is what the tests drive; `blob` is what the
// screen hands to a download or to navigator.share.
function auditReportBytes(receipt, options) {
  return auditPdfBytes(buildAuditReport(receipt, options));
}

function auditReportBlob(receipt, options) {
  return new Blob([auditReportBytes(receipt, options)], { type: "application/pdf" });
}

// A filename somebody can find again. Dated, and named for what it is.
function auditReportFilename(receipt) {
  const date = String(receipt && receipt.date ? receipt.date : "").replace(/[^\w-]+/g, "-");
  return `gloobal-audit-${date || "transaction"}.pdf`;
}

// ── Getting the file off the phone ───────────────────────────────────────
//
// Share first, download second, and the order matters.
//
// A report is going somewhere — an accountant, a support thread, a dispute.
// navigator.share with a file puts the PDF straight into WhatsApp or email,
// which is the whole errand. A download leaves it in a folder the person then
// has to find, and on Android that folder is not always obvious.
//
// canShare is asked BEFORE the call rather than the call being tried and
// caught, because a platform that cannot share files and a person who
// dismissed the sheet both surface as a rejected promise. Falling back on a
// rejection would mean that cancelling the share sheet silently downloaded a
// copy instead — a second thing happening that nobody asked for.
async function shareAuditReport(receipt, options) {
  const blob = auditReportBlob(receipt, options);
  const filename = auditReportFilename(receipt);

  if (typeof File !== "undefined" && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Gloobal audit report" });
        return { ok: true, via: "share" };
      } catch (error) {
        // Dismissed, or refused mid-flight. The person has seen the sheet.
        return { ok: false, via: "share" };
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
  // Revoking immediately cancels the download on some browsers, which is a
  // bug that only shows on slower devices — exactly the ones this app is for.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { ok: true, via: "download" };
}

// When the report was produced, in the reader's own locale.
//
// This is the ONE figure on the page that is not a record of the transaction,
// so it is generated here rather than taken off the receipt — and the page
// says "Generated" beside it so the two can never be confused. A document
// that showed only transaction dates would leave a reader unable to tell a
// fresh export from one filed months ago.
function formatAuditTimestamp(now) {
  const d = now || new Date();
  try {
    return d.toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch (error) {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}
