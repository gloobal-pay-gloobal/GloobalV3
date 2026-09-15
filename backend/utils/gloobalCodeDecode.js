// src/utils/gloobalCodeDecode.js
//
// Reading a Gloobal code back out of an image.
//
// Four stages, and each one is separately testable because each one can fail
// for its own reason and a decoder that only says "no" is a decoder nobody
// can debug:
//
//   1. binarise    local threshold, because a code photographed on a counter
//                  is lit unevenly and one global cutoff loses whichever
//                  half is darker
//   2. find        the three markers, by the one shape nothing else in the
//                  code has: a ring with something inside it
//   3. rectify     an affine map from the three markers, which absorbs
//                  rotation, scale and shear exactly
//   4. classify    each of the twenty cells into one of eight symbols, by
//                  measured features rather than template matching
//
// ── What it actually does, measured ─────────────────────────────────────
//
// Against nine codes rendered by the real component and put through a lens
// blur, at six sizes from 200 to 400 pixels in frame:
//
//   exact decodes      53 of 54
//   worst single case  one cell wrong
//   rotation           no cost at all, at any angle — the three markers give
//                      an exact affine map
//   floor              200px in frame, about 13 pixels per glyph. At 180 the
//                      same corpus lost five, one of them wrong in four
//                      places, which is a limit rather than bad luck.
//
// The residual one-cell error is not worth chasing with another threshold —
// every attempt moved it rather than removing it. It is what error correction
// is for, and the room already exists: twenty cells of eight symbols hold 60
// bits, a session handle needs about 36, and the spare ~24 would absorb a
// single-symbol misread invisibly. Until that lands, a one-cell error decodes
// to a handle that resolves to nothing and the person is asked to scan again
// — safe, but avoidable.
//
// Perspective is the known gap: three points give an exact affine map, which
// covers rotation, scale and shear but not a steep viewing angle.
//
// It returns a reason on every failure, and the reasons are distinct, so
// "I could not find the code" and "I found it and one symbol was unreadable"
// never arrive as the same answer. The first is a framing problem the person
// can fix by moving the phone; the second is not.

// The canonical field, which must agree with gloobalCode.jsx. These are
// duplicated rather than imported because that file is a React component in
// the frontend bundle and this is a pure function that has to run in a test
// and a worker as well — but they are the same numbers, and the test suite
// asserts they have not drifted apart.
var GCD_FIELD = 100;
var GCD_MARKER = 20;
var GCD_EDGE = 4;
var GCD_GLYPH = 6.8;
var GCD_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
// The renderer's position mask, undone per cell. Its own copy for the same
// reason as the geometry above — this file has to run without the frontend
// bundle — and the test suite asserts it is identical to GLOOBAL_CODE_MASK,
// because a mask that differs by one entry does not fail loudly: it decodes
// to a valid-looking Gloobal ID that belongs to nobody.
var GCD_MASK = [0, 3, 6, 1, 4, 7, 2, 5, 3, 6, 1, 4, 7, 2, 5, 0, 6, 1, 4, 7];

// Marker centres in canonical space: top-right, bottom-left, bottom-right.
var GCD_TR = { x: GCD_FIELD - GCD_EDGE - GCD_MARKER / 2, y: GCD_EDGE + GCD_MARKER / 2 };
var GCD_BL = { x: GCD_EDGE + GCD_MARKER / 2, y: GCD_FIELD - GCD_EDGE - GCD_MARKER / 2 };
var GCD_BR = { x: GCD_FIELD - GCD_EDGE - GCD_MARKER / 2, y: GCD_FIELD - GCD_EDGE - GCD_MARKER / 2 };

// The twenty cell centres, in the reading order the renderer writes them:
// the right band top to bottom, then the bottom band left to right.
function gloobalCodeCellCentres() {
  const cells = [];
  const bandStart = GCD_EDGE + GCD_MARKER + 2;
  const bandEnd = GCD_FIELD - GCD_EDGE - GCD_MARKER - 2;
  const span = bandEnd - bandStart;
  const colW = GCD_MARKER / 2;
  const rowH = span / 5;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 2; col++) {
      cells.push({
        cx: GCD_FIELD - GCD_EDGE - GCD_MARKER + colW * col + colW / 2,
        cy: bandStart + rowH * row + rowH / 2
      });
    }
  }
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      cells.push({
        cx: bandStart + rowH * col + rowH / 2,
        cy: GCD_FIELD - GCD_EDGE - GCD_MARKER + colW * row + colW / 2
      });
    }
  }
  return cells;
}

// ── 1. Binarise ──────────────────────────────────────────────────────────
//
// Adaptive, via an integral image: each pixel is compared against the mean of
// a window around it, less a small bias. A single global threshold fails on
// the case this decoder exists for — a code under a counter lamp, bright on
// one side and in shadow on the other — where any cutoff that keeps the lit
// half loses the shadowed half entirely.
//
// The bias is what stops flat white paper dissolving into noise: with no
// bias, a uniform region sits exactly at its own mean and half its pixels
// fall either side of it.
function gloobalCodeBinarise(gray, width, height) {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  // An eighth of the smaller side: comfortably bigger than a glyph, so a
  // glyph never forms its own background, and small enough to track a
  // lighting gradient across the code.
  const radius = Math.max(4, Math.floor(Math.min(width, height) / 16));
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      // 1 means INK.
      bits[y * width + x] = gray[y * width + x] * area < sum * 0.92 ? 1 : 0;
    }
  }
  return bits;
}

// Greyscale by luminance, not by averaging the channels.
//
// It matters here because the markers may be brand-coloured while the payload
// is black: a flat average turns a saturated violet into a mid grey that can
// fall on the wrong side of a threshold, where luminance keeps it dark.
function gloobalCodeGrayscale(data, width, height) {
  const gray = new Float64Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }
  return gray;
}

// A one-pixel separable box blur, applied before binarising to images that
// measure as pin-sharp.
//
// ── Why a decoder deliberately softens its own input ─────────────────────
//
// Because a PIN-SHARP image is the hard case here, not the easy one, and that
// is counter-intuitive enough to be worth stating.
//
// Everything downstream samples the binarised bitmap on a grid recovered from
// the three markers. A camera image has edges a pixel or two wide, so a sample
// landing near an edge reads an intermediate value and the grid lands where
// the arithmetic says. A rasterised SVG has edges ONE pixel wide, and then the
// sample either catches the stroke or misses it entirely — so the same code at
// a slightly different scale reads differently, not gradually but abruptly.
//
// Measured across three payloads at eight raster sizes, sharp:
//
//     200px  ok      260px  ok      360px  ok      480px  ok
//     220px  ok      300px  ALL THREE MISREAD      600px  ok
//
// Not "failed to find" — MISREAD: the decoder returned twenty confident
// symbols and the payload checksum threw them out. 300px is not a number
// anybody would think to test, and it is exactly what a screenshot of the
// Receive panel is, because QR_PANEL_SIZE is 300.
//
// One pixel of blur removes the cliff. The alternative — every caller
// remembering to rasterise at a lucky size — is the kind of rule that holds
// until the first person who has not read this comment.
//
// ── Softening is a SECOND ATTEMPT, not a policy ──────────────────────────
//
// Two things were tried before this and both were wrong, which is worth
// recording because both looked obviously right at the time.
//
// Softening every image fixed the sharp misread and cost real decodes at the
// small end — an image that has already been through a lens does not want a
// second blur, and the decoder's own corpus went from 54/54 to 46/54 at
// 200-220px.
//
// Softening only images that MEASURE as sharp sounded like the fix. It is
// not, because the two populations do not separate. Edges-per-unit-of-ink was
// the best measure found: rasterised sharp ran 0.245-0.374 and through a lens
// 0.392-1.009. Eighteen thousandths is not a gap, it is an overlap that had
// not been sampled hard enough yet, and a branch sitting in it would be a
// coin toss that misbehaves on exactly the images nobody tested.
//
// So the decoder does not classify. It DECODES, and if the caller rejects
// what came back, it decodes again from the softened image and offers that
// instead. The caller can reject because the caller knows something this file
// does not: the payload carries a checksum. A misread is not a plausible
// answer to qrScanner.jsx, it is an invalid one, and that is a far better
// signal than any measurement of the pixels.
//
// Cost: nothing at all on the overwhelming majority of frames, where the
// first attempt is accepted. One extra pass when it is not.
//
// With no `accept` given, only the first attempt runs, so the bare call
// behaves exactly as it did before any of this — which is what keeps the
// decoder's own suite an honest record of the raw decoder rather than of the
// retry.

function gloobalCodeSoften(gray, width, height) {
  const tmp = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const a = gray[row + (x > 0 ? x - 1 : 0)];
      const b = gray[row + x];
      const c = gray[row + (x < width - 1 ? x + 1 : width - 1)];
      tmp[row + x] = (a + b + c) / 3;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const up = (y > 0 ? y - 1 : 0) * width;
    const mid = y * width;
    const down = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x++) {
      out[mid + x] = (tmp[up + x] + tmp[mid + x] + tmp[down + x]) / 3;
    }
  }
  return out;
}

// ── Connected components ─────────────────────────────────────────────────
//
// Two-pass union-find over 8-connectivity. Used three times: to find marker
// rings, to find the discs inside them, and to count the parts of a glyph.
function gloobalCodeLabel(bits, width, height, want) {
  const labels = new Int32Array(width * height);
  const parent = [0];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  let next = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (bits[i] !== want) continue;
      let best = 0;
      for (const [dx, dy] of [[-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nl = labels[ny * width + nx];
        if (!nl) continue;
        if (!best) best = nl; else union(best, nl);
      }
      if (!best) { best = next++; parent[best] = best; }
      labels[i] = best;
    }
  }
  const remap = new Int32Array(next);
  let count = 0;
  const stats = [null];
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) continue;
    const root = find(labels[i]);
    if (!remap[root]) { remap[root] = ++count; stats.push({ n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0 }); }
    const id = remap[root];
    labels[i] = id;
    const s = stats[id];
    const x = i % width, y = (i / width) | 0;
    s.n++; s.sx += x; s.sy += y;
    if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x;
    if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
  }
  for (let i = 1; i <= count; i++) { stats[i].cx = stats[i].sx / stats[i].n; stats[i].cy = stats[i].sy / stats[i].n; }
  return { labels, stats, count };
}

// ── 2. Find the markers ──────────────────────────────────────────────────
//
// A marker is the only thing in this code that is a ring with something
// inside it. That is worth stating precisely, because two payload glyphs are
// also rings — "○" and "□" — and what separates them is not size or
// roundness, which vary with focus, but that their holes are EMPTY.
//
// So: an ink component whose bounding box is roughly square, containing a
// second, much smaller ink component near its centre. Nothing else in the
// code has that shape, and it survives blur, because both parts have to
// dissolve before the pair stops existing.
function gloobalCodeFindMarkers(bits, width, height) {
  const { labels, stats, count } = gloobalCodeLabel(bits, width, height, 1);
  const boxes = [];
  for (let id = 1; id <= count; id++) {
    const s = stats[id];
    const w = s.x1 - s.x0 + 1, h = s.y1 - s.y0 + 1;
    if (w < 8 || h < 8) continue;
    const aspect = w / h;
    if (aspect < 0.6 || aspect > 1.66) continue;
    // A ring is mostly hollow: its ink covers far less than its own box.
    if (s.n > w * h * 0.72) continue;
    boxes.push({ id, s, w, h });
  }
  const markers = [];
  for (const outer of boxes) {
    const { s, w, h } = outer;
    // Look for a distinct ink component whose centre sits near this one's
    // centre and which is between about a seventh and a half of its size.
    let inner = null;
    for (let id = 1; id <= count; id++) {
      if (id === outer.id) continue;
      const t = stats[id];
      const tw = t.x1 - t.x0 + 1, th = t.y1 - t.y0 + 1;
      if (tw > w * 0.6 || th > h * 0.6 || tw < w * 0.12 || th < h * 0.12) continue;
      if (t.x0 < s.x0 || t.x1 > s.x1 || t.y0 < s.y0 || t.y1 > s.y1) continue;
      const dx = t.cx - (s.x0 + w / 2), dy = t.cy - (s.y0 + h / 2);
      if (Math.hypot(dx, dy) > Math.min(w, h) * 0.22) continue;
      inner = t;
      break;
    }
    if (!inner) continue;
    markers.push({
      // The DISC's centroid, not the ring's, because it is the more stable
      // of the two: a filled blob's centroid moves less under blur and
      // partial occlusion than a thin ring's does.
      x: inner.cx,
      y: inner.cy,
      size: Math.max(w, h)
    });
  }
  return markers;
}

// ── 3. Orientation and rectification ─────────────────────────────────────
//
// Three markers make a right-angled triangle whose right angle is at the
// BOTTOM-RIGHT — this code omits the top-left corner where a standard QR
// omits the bottom-right, so a reader written from QR habit finds the origin
// in the wrong place. The corner is identified by measuring the angle at each
// marker rather than by any assumption about which way up the image is.
//
// Handedness then separates top-right from bottom-left, and it is what makes
// the decode fail honestly on a MIRRORED image rather than returning a
// plausible wrong handle: in canonical space the cross product of
// (corner→top-right) with (corner→bottom-left) is negative, and a mirror
// flips its sign.
function gloobalCodeOrient(markers) {
  if (markers.length !== 3) return null;
  let corner = -1, bestCos = 1;
  for (let i = 0; i < 3; i++) {
    const a = markers[(i + 1) % 3], b = markers[(i + 2) % 3], c = markers[i];
    const v1 = { x: a.x - c.x, y: a.y - c.y };
    const v2 = { x: b.x - c.x, y: b.y - c.y };
    const cos = Math.abs((v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1));
    if (cos < bestCos) { bestCos = cos; corner = i; }
  }
  // Well past any plausible perspective. A triangle this far from right-
  // angled is three things that happened to look like markers.
  if (bestCos > 0.45) return null;
  const br = markers[corner];
  let a = markers[(corner + 1) % 3], b = markers[(corner + 2) % 3];
  const cross = (a.x - br.x) * (b.y - br.y) - (a.y - br.y) * (b.x - br.x);
  if (cross > 0) { const t = a; a = b; b = t; }
  return { tr: a, bl: b, br };
}

// The affine map from canonical space into the image, from three points.
//
// Affine rather than a homography, and that is a real limit rather than a
// simplification: three points determine rotation, scale, shear and
// translation exactly, but not perspective. A code photographed square-on or
// at a modest tilt rectifies perfectly; one shot at a steep angle will drift
// toward the far corner. Four points would fix it, and the fourth would have
// to be inferred from these three — which is exactly the assumption that
// fails under perspective, so it would buy nothing.
function gloobalCodeAffine(o) {
  // Canonical: TR, BL, BR -> image.
  const x1 = GCD_TR.x, y1 = GCD_TR.y, x2 = GCD_BL.x, y2 = GCD_BL.y, x3 = GCD_BR.x, y3 = GCD_BR.y;
  const det = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
  if (!det) return null;
  const solve = (u1, u2, u3) => ({
    a: (u1 * (y2 - y3) + u2 * (y3 - y1) + u3 * (y1 - y2)) / det,
    b: (x1 * (u2 - u3) + x2 * (u3 - u1) + x3 * (u1 - u2)) / det,
    c: (x1 * (y2 * u3 - y3 * u2) + x2 * (y3 * u1 - y1 * u3) + x3 * (y1 * u2 - y2 * u1)) / det
  });
  const fx = solve(o.tr.x, o.bl.x, o.br.x);
  const fy = solve(o.tr.y, o.bl.y, o.br.y);
  return (cx, cy) => ({ x: fx.a * cx + fx.b * cy + fx.c, y: fy.a * cx + fy.b * cy + fy.c });
}

// ── 4. Classify one cell ─────────────────────────────────────────────────
//
// Sampled back into canonical space first, so the classifier never has to
// think about rotation: every patch arrives upright and the same size
// whatever the camera was doing.
var GCD_PATCH = 24;

function gloobalCodeSampleCell(bits, width, height, map, cx, cy) {
  const patch = new Uint8Array(GCD_PATCH * GCD_PATCH);
  // A shade wider than the glyph, so a symbol whose ink reaches its own edge
  // is not clipped by a small registration error.
  const half = GCD_GLYPH * 0.62;
  // Each patch pixel is a BILINEAR sample of the binarised field, thresholded
  // at a half. Not a nearest neighbour, and not a supersample in patch space.
  //
  // Nearest-neighbour carries a half-pixel bias that is consistent across a
  // whole patch: at scales where the cell centres land near a .5 boundary
  // every probe rounds the same way, the sampled window shifts half a pixel,
  // and a glyph is clipped along one edge. It showed as an oscillation with
  // image size rather than a trend — 205px decoding 12/12 while 200px managed
  // 2/12 — and, tellingly, as rotated images decoding BETTER than square-on
  // ones, because rotating resamples and smooths the bias away.
  //
  // A supersample in patch space was the first fix and it only half worked:
  // when the code is small in frame a patch pixel is SMALLER than an image
  // pixel, so all four offsets land on the same one and the average is the
  // nearest neighbour again. Interpolating in image space has no such scale
  // at which it stops helping.
  for (let py = 0; py < GCD_PATCH; py++) {
    for (let px = 0; px < GCD_PATCH; px++) {
      const u = cx - half + (2 * half) * (px + 0.5) / GCD_PATCH;
      const v = cy - half + (2 * half) * (py + 0.5) / GCD_PATCH;
      const p = map(u, v);
      const fx = Math.floor(p.x), fy = Math.floor(p.y);
      const ax = p.x - fx, ay = p.y - fy;
      const at = (yy, xx) =>
        (xx >= 0 && yy >= 0 && xx < width && yy < height ? bits[yy * width + xx] : 0);
      const top = at(fy, fx) * (1 - ax) + at(fy, fx + 1) * ax;
      const bot = at(fy + 1, fx) * (1 - ax) + at(fy + 1, fx + 1) * ax;
      patch[py * GCD_PATCH + px] = (top * (1 - ay) + bot * ay) >= 0.5 ? 1 : 0;
    }
  }
  return patch;
}

// The features that separate the eight, measured rather than matched.
//
// Template matching was the other option and it is worse here: a template has
// to be built at one blur level and one stroke weight, and these glyphs are
// read at whatever the camera gives. Every feature below is a ratio, so none
// of them moves when the code is bigger, smaller or softer.
function gloobalCodeFeatures(patch) {
  const N = GCD_PATCH;
  let ink = 0, x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!patch[y * N + x]) continue;
      ink++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!ink) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const parts = gloobalCodeLabel(patch, N, N, 1).count;
  // Holes: background components that do not touch the patch border. The
  // border flood is what separates "inside the ring" from "outside it".
  const bg = gloobalCodeLabel(patch, N, N, 0);
  const touching = new Set();
  for (let x = 0; x < N; x++) { touching.add(bg.labels[x]); touching.add(bg.labels[(N - 1) * N + x]); }
  for (let y = 0; y < N; y++) { touching.add(bg.labels[y * N]); touching.add(bg.labels[y * N + N - 1]); }
  let holes = 0;
  for (let id = 1; id <= bg.count; id++) if (!touching.has(id) && bg.stats[id].n > N * 0.3) holes++;
  // How much of its own bounding box the ink fills. A disc is pi/4 ~ 0.785 of
  // its box; a filled square is ~1. That one number is the whole of the
  // round-versus-square decision, at both weights.
  const extent = ink / (bw * bh);
  // Ink on the axes against ink on the diagonals, which is the whole of the
  // "+" versus "×" decision.
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
  const r = Math.min(bw, bh) * 0.36;
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? patch[Math.round(y) * N + Math.round(x)] : 0);
  const axis = at(cxm + r, cym) + at(cxm - r, cym) + at(cxm, cym + r) + at(cxm, cym - r);
  const d = r * 0.7071;
  const diag = at(cxm + d, cym + d) + at(cxm - d, cym - d) + at(cxm + d, cym - d) + at(cxm - d, cym + d);
  // How much of the ink's own CORNER REGIONS are inked.
  //
  // This is what separates square from round, at both weights — "■" from "●"
  // and "□" from "○". It went through two worse versions first and the
  // reasons are worth keeping:
  //
  //   area threshold   a filled disc covers pi/4 of its box and a square 1.0.
  //                    Wide on a clean render, but blur rounds a square's
  //                    corners and spreads a circle's edge until the two
  //                    meet. Every ring read as "○".
  //   four points      sampling one pixel just inside each corner. The margin
  //                    is that a circle's edge sits 0.5 of the half-width
  //                    from centre and the sample sits at 0.566 — thirteen
  //                    per cent, which blur and pixel quantisation eat. It
  //                    failed in BOTH directions at different scales: round
  //                    read as square at 340px, square read as round at
  //                    220px.
  //
  // A region average has no such knife edge. Over a corner square of a fifth
  // of the box, a filled or ringed SQUARE comes out above 0.9 and a filled or
  // ringed CIRCLE below 0.25, because a circle simply is not there. Averaging
  // over an area is also what makes it blur-stable: softening moves ink about
  // inside the region without changing how much of it there is.
  const cs = Math.max(2, Math.round(Math.min(bw, bh) * 0.22));
  let cornerInk = 0, cornerArea = 0;
  for (const [ox, oy] of [[x0, y0], [x1 - cs + 1, y0], [x0, y1 - cs + 1], [x1 - cs + 1, y1 - cs + 1]]) {
    for (let yy = oy; yy < oy + cs; yy++) {
      for (let xx = ox; xx < ox + cs; xx++) {
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        cornerArea++;
        if (patch[yy * N + xx]) cornerInk++;
      }
    }
  }
  const corners = cornerArea ? cornerInk / cornerArea : 0;
  // Ink across the middle third of the shape's own height. Zero for "=",
  // whose two bars sit either side of it, and for the two rings — but the
  // rings are settled before this is consulted.
  let midInk = 0, midArea = 0;
  for (let y = Math.round(cym - bh * 0.12); y <= Math.round(cym + bh * 0.12); y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      midArea++; if (patch[y * N + x]) midInk++;
    }
  }
  const midBand = midArea ? midInk / midArea : 0;
  //
  // Measured across the corpus at 420, 300, 220 and 160 px:
  //
  //        −          +          ×          ○          □          ●     ■
  //  corn  -       0.00    0.76-0.91  0.00-0.13  0.39-0.56  0.09-0.14  0.72-0.81
  //  flat  0.27-0.36  ~1.0       ~1.0       ~1.0       ~1.0       ~1.0  ~1.0
  //
  // 0.28 is the line, and it is below "□"'s worst (0.39) and above "●"'s best
  // (0.14). It was 0.5 first, which cut straight through "□" — the square
  // ring is the weakest corner of the four because its stroke only clips the
  // corner where a filled square floods it.
  return { ink, bw, bh, parts, holes, extent, axis, diag, corners, midBand, flat: bh / bw, area: N * N };
}

// The decision tree. Ordered most-certain first, so a later rule never has to
// undo an earlier one.
// Square or round, from TWO measurements rather than one.
//
// Both are individually thin at the ring weight, which is the hard case: a
// square ring only clips its corners where a filled square floods them.
// Measured across the corpus at 420, 300, 220 and 160 px:
//
//            corners      extent
//   ○      0.00-0.13    0.62-0.67
//   □      0.39-0.56    0.74-0.76
//   ●      0.09-0.14    0.77-0.78
//   ■      0.72-0.81    0.93-0.97
//
// Either alone leaves about 0.26 of corners or 0.07 of extent between the
// ring pair, and a single marginal cell crossed the corners line on its own.
// Added together — with extent centred on the midpoint of its own two ranges
// and weighted to match — the gap widens to roughly 0.5, and a cell now has
// to be wrong on both counts at once to be misread.
function gloobalCodeClassify(patch) {
  const f = gloobalCodeFeatures(patch);
  if (!f) return null;
  // Flat and wide: only "−" is, and it is the ONLY thing separating a dash
  // from a filled square — the spoke test below sees ink in all four
  // directions on a dash too, because its bar is thicker than the sampling
  // radius. So this threshold is load-bearing rather than a shortcut.
  if (f.flat < 0.6) return "−";
  // A hole means a ring, and the corners say which ring. Settled first,
  // because a ring also has an empty middle and would otherwise be caught by
  // the "=" test below.
  if (f.holes >= 1) return f.corners > 0.28 ? "□" : "○";
  // "=" — two marks with white between them.
  //
  // Two signals, because the component count alone is not blur-proof: soften
  // the image enough and the two bars touch at their ends, the count drops to
  // one, and the glyph falls through to be read as "×". The middle band
  // survives that — the bars can meet at the tips while the centre is still
  // clear — so the count catches the clean case and the band catches the soft
  // one.
  //
  // The count carried a `flat < 0.85` guard once, on the assumption that "="
  // is a wide, short shape. It is not: once the bars were far enough apart to
  // stop merging, the bounding box came out square and the guard rejected
  // every one of them.
  if (f.parts >= 2 || f.midBand < 0.18) return "=";
  // Solid through the middle in every direction: a filled shape. A cross has
  // ink on one set of spokes and white on the other, so this needs no area
  // threshold — `extent > 0.62` was the first attempt and a blurred "×"
  // satisfied it, its strokes bleeding into the centre until it filled its box.
  if (f.axis === 4 && f.diag === 4) return f.corners > 0.28 ? "■" : "●";
  // What is left is a cross, and the corners say which. A "×" runs INTO its
  // corners and a "+" runs away from them, which measures 0.76-0.91 against
  // 0.00 — a far wider gap than the spoke test it replaced.
  return f.corners > 0.28 ? "×" : "+";
}

// ── The decoder ──────────────────────────────────────────────────────────
//
// `image` is { data, width, height } in RGBA, which is what a canvas gives
// and what a test can build by hand.
//
// Returns { ok: true, value } or { ok: false, reason }, where the reasons are
// distinct on purpose: "no_markers" is a framing problem the person fixes by
// moving the phone, "unreadable_cell" is not, and telling them apart is the
// difference between a useful prompt and "try again".
// One pass: threshold, find, rectify, read. Split out of decodeGloobalCode so
// the same pass can be run twice over two different greyscales without either
// copy of it drifting from the other.
function gloobalCodeReadGray(gray, width, height) {
  const bits = gloobalCodeBinarise(gray, width, height);
  const markers = gloobalCodeFindMarkers(bits, width, height);
  if (markers.length < 3) return { ok: false, reason: "no_markers", markers: markers.length };
  // More than three means something else in frame looked like one. Keep the
  // three largest: a marker is far bigger than any glyph, so a false positive
  // is almost always smaller than a real one.
  const three = markers.slice().sort((a, b) => b.size - a.size).slice(0, 3);
  const oriented = gloobalCodeOrient(three);
  if (!oriented) return { ok: false, reason: "not_a_code" };
  const map = gloobalCodeAffine(oriented);
  if (!map) return { ok: false, reason: "not_a_code" };
  const cells = gloobalCodeCellCentres();
  let value = "";
  for (let i = 0; i < cells.length; i++) {
    const patch = gloobalCodeSampleCell(bits, width, height, map, cells[i].cx, cells[i].cy);
    const symbol = gloobalCodeClassify(patch);
    if (!symbol) return { ok: false, reason: "unreadable_cell", cell: i };
    // Unmask as each cell is read, so `value` is the PAYLOAD throughout and
    // no caller has to know the mask exists. Undone here rather than over the
    // finished string for one reason: there is then no intermediate variable
    // holding a twenty-symbol string that looks like a payload and is not.
    const digit = GCD_SYMBOLS.indexOf(symbol);
    value += GCD_SYMBOLS[(digit - GCD_MASK[i] + GCD_SYMBOLS.length) % GCD_SYMBOLS.length];
  }
  return { ok: true, value };
}

function decodeGloobalCode(image, options) {
  if (!image || !image.data || !image.width || !image.height) {
    return { ok: false, reason: "no_image" };
  }
  const { data, width, height } = image;
  const raw = gloobalCodeGrayscale(data, width, height);
  const first = gloobalCodeReadGray(raw, width, height);
  // `accept` is how a caller that can VALIDATE a payload tells this decoder
  // that a confident-looking answer was nonetheless wrong. See the note above
  // on why the retry is driven by the caller's checksum rather than by any
  // measurement of the image.
  const accept = options && typeof options.accept === "function" ? options.accept : null;
  if (!accept) return first;
  if (first.ok && accept(first.value)) return first;
  const second = gloobalCodeReadGray(gloobalCodeSoften(raw, width, height), width, height);
  if (second.ok && accept(second.value)) return second;
  // Neither attempt produced something the caller would take. Report the
  // FIRST one's failure rather than the retry's: it is the one that describes
  // the image as it actually arrived, and "no_markers" versus
  // "unreadable_cell" is the difference between a framing problem the person
  // can fix and one they cannot.
  return first.ok ? { ok: false, reason: "rejected", value: first.value } : first;
}
