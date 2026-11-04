// src/utils/color.js
function hexToRgba(hex, alpha) {
  const clean = (hex || "#7C3AED").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function hsvToHex(h, s, v = 1) {
  const c = v * s;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}
function hexToHsv(hex) {
  const clean = (hex || "#7C3AED").replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * ((g - b) / d % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max };
}
// ── READABLE ON ITS GROUND (0235) ──────────────────────────────────────
// WCAG contrast between two #RRGGBB colours, and a colour darkened in
// small steps until it reaches `min` against `bg`. The dial's symbols and
// its centre key take colours from the theme's family, and some family
// colours (mango, gold, sky) are too light to read on a white key or to
// carry a white cross; this keeps the hue and fixes the contrast.
function gloobalLuminance(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return 1;
  const ch = (i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}
function gloobalContrast(a, b) {
  const x = gloobalLuminance(a), y = gloobalLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function gloobalReadable(color, bg, min) {
  const want = min || 3;
  const ground = bg || "#FFFFFF";
  let c = String(color || "");
  if (!/^#[0-9a-f]{6}$/i.test(c)) return color;
  for (let i = 0; i < 20 && gloobalContrast(c, ground) < want; i += 1) {
    const h = c.slice(1);
    c = "#" + [0, 2, 4].map((j) => Math.round(parseInt(h.slice(j, j + 2), 16) * 0.9).toString(16).padStart(2, "0")).join("");
  }
  return c;
}
// The active theme's colour family (see GLOOBAL_THEMES in
// constants/theme.js), or the shared list when no palette carries one.
function gloobalFamily() {
  const fam = typeof GLOOBAL_PALETTE_ACTIVE !== "undefined" && GLOOBAL_PALETTE_ACTIVE && GLOOBAL_PALETTE_ACTIVE.family;
  return Array.isArray(fam) && fam.length ? fam : LOGO_FLIP_COLORS;
}
// The i-th colour of the family, wrapping. For lists that colour by position.
function gloobalFamilyColor(i) {
  const fam = gloobalFamily();
  return fam[((i % fam.length) + fam.length) % fam.length];
}
// A random colour from the active theme's family, other than `exclude`.
// Tiles call this every few seconds, so after a theme or side change they
// move into the new family within one tick.
function randomLogoFlipColor(exclude) {
  const fam = gloobalFamily();
  let color = fam[Math.floor(Math.random() * fam.length)];
  if (exclude && fam.length > 1) {
    while (color === exclude) {
      color = fam[Math.floor(Math.random() * fam.length)];
    }
  }
  return color;
}
// GONE, and deliberately not left for "someday".
//
// It returned Math.round(Math.random() * 700) / 100 — a random Creator Share
// percentage between 0.00 and 7.00 — and its only caller was the history
// receipt builder, which used it when a sent row carried no recorded rate.
// Every builder sets a real rate today, so it never fired; but a financial
// percentage generator with no caller is a loaded gun, and the receipt both
// prints that percentage and multiplies a money amount out of it.
//
// A share that was not recorded is now null, which the receipt draws as
// nothing. If a future screen needs a rate it must read the one the server
// stored, which is the only place one exists.

