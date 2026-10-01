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
function randomLogoFlipColor(exclude) {
  let color = LOGO_FLIP_COLORS[Math.floor(Math.random() * LOGO_FLIP_COLORS.length)];
  if (exclude && LOGO_FLIP_COLORS.length > 1) {
    while (color === exclude) {
      color = LOGO_FLIP_COLORS[Math.floor(Math.random() * LOGO_FLIP_COLORS.length)];
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

