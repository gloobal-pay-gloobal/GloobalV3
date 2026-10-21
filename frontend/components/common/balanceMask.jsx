// src/components/common/balanceMask.jsx
import { useState as useState47 } from "react";

// ── WHAT A HIDDEN BALANCE LOOKS LIKE ────────────────────────────────────
//
// Seven bullets. That is what this replaced, and seven bullets is what
// every banking app shows, which is the problem with it: a row of dots
// says "there is a number here and you may not see it", in the tone of
// a redaction.
//
// So the card draws a character instead — a round one with arms, feet
// and a face, who waves. Not an emoji: an emoji is a font glyph, drawn
// differently on every phone, sized by the text engine, and incapable
// of moving. This is an SVG the app owns, so it is the same character
// everywhere and it can breathe.
//
// ── WHY NOTHING ABOUT HIM MEANS ANYTHING ────────────────────────────────
//
// This is the whole discipline of the file, and it is worth being
// explicit because the obvious idea is the wrong one.
//
// A character who REFLECTED the balance — cheerful when there is
// plenty, glum when it is thin — would be genuinely alive and genuinely
// useful, and would hand anybody looking at the phone the exact thing
// the eye was tapped to hide. A mask that leaks what it masks is not a
// mask.
//
// So he is always pleased to see you. What varies is the small charm
// floating beside him, and it varies AT RANDOM: no scale anybody could
// learn to read, nothing about money, nothing derived from the account,
// the balance or the hour. Different each time the balance is hidden,
// and meaningless every time.
var BALANCE_MASK_CHARMS = ["heart", "star", "spark", "leaf", "note", "sun"];

// The one shown last, so the next one is not the same. Module scope
// rather than component state because the component UNMOUNTS when the
// balance is revealed — state it held would go with it, and a third of
// all reveals would be followed by the same charm again.
var balanceMaskLast = -1;

function balanceMaskPick() {
  if (BALANCE_MASK_CHARMS.length < 2) return BALANCE_MASK_CHARMS[0] || "";
  let at = Math.floor(Math.random() * BALANCE_MASK_CHARMS.length);
  if (at === balanceMaskLast) at = (at + 1) % BALANCE_MASK_CHARMS.length;
  balanceMaskLast = at;
  return BALANCE_MASK_CHARMS[at];
}

// The figures either side of the chart, when the whole card is hidden.
//
// Four dots, fixed, and the same four for both. Hiding the balance while
// the week's spend and the week's income stay readable underneath is not
// hiding much — and a mask that tracked each figure's own length would
// say which of the two was larger.
var BALANCE_FIGURE_MASK = "••••";

// The charm, drawn at the character's shoulder. Each is a shape rather
// than a glyph for the same reason the character is.
function BalanceMaskCharm({ kind }) {
  if (kind === "star") {
    return <path d="M53 9l1.9 4.1 4.4.6-3.2 3 .8 4.4-3.9-2.1-3.9 2.1.8-4.4-3.2-3 4.4-.6z" fill="#FFD166" stroke="#E9A72C" strokeWidth="1" strokeLinejoin="round" />;
  }
  if (kind === "spark") {
    return <g stroke="#9BE7FF" strokeWidth="2.2" strokeLinecap="round" fill="none"><path d="M53 8v8" /><path d="M49 12h8" /><path d="M50.5 9.5l5 5" /><path d="M55.5 9.5l-5 5" /></g>;
  }
  if (kind === "leaf") {
    return <g><path d="M46 18c0-6 5-10 11-10 0 6-4 11-11 10z" fill="#7BD88F" stroke="#49A862" strokeWidth="1" /><path d="M48 17c3-3 5-5 8-6" stroke="#49A862" strokeWidth="1.1" fill="none" strokeLinecap="round" /></g>;
  }
  if (kind === "note") {
    return <g fill="#B9A6FF" stroke="#7C5CF0" strokeWidth="1"><ellipse cx="49.5" cy="17.5" rx="3.2" ry="2.5" transform="rotate(-18 49.5 17.5)" /><path d="M52.3 16.6V7.5l5 1.6v2l-5-1.5" strokeLinejoin="round" /></g>;
  }
  if (kind === "sun") {
    return <g><circle cx="53" cy="12" r="4.2" fill="#FFD166" stroke="#E9A72C" strokeWidth="1" /><g stroke="#FFD166" strokeWidth="2" strokeLinecap="round"><path d="M53 4v2.4" /><path d="M53 17.6V20" /><path d="M45 12h2.4" /><path d="M58.6 12H61" /></g></g>;
  }
  // heart, and the fallback for a charm nobody has drawn yet
  return <path d="M53 20s-6.6-4.2-6.6-8.6A3.6 3.6 0 0 1 53 9.6a3.6 3.6 0 0 1 6.6 1.8C59.6 15.8 53 20 53 20z" fill="#FF7B91" stroke="#E8536C" strokeWidth="1" strokeLinejoin="round" />;
}

// The character.
//
// The charm is picked ONCE per mount, in the state initialiser. The
// component is mounted by the balance being hidden and unmounted by it
// being shown, so "once per mount" is exactly "a new one each time you
// hide it" — and it does not change under somebody while they are
// looking at it, which picking in the render body would cause.
//
// `size` is the balance's own font size, so he takes the space the
// figure would have taken and the card does not change height when the
// eye is tapped. `overflow: visible` lets his raised arm and the charm
// sit outside that box rather than being cropped to it.
function BalanceMaskFace({ size = 32, label = "Balance hidden" }) {
  const [charm] = useState47(balanceMaskPick);
  const px = Number(size) > 0 ? Number(size) : 32;
  const box = Math.round(px * 1.35);
  return <span
    role="img"
    aria-label={label}
    style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}
  ><style>{`
        @keyframes balanceMaskBreath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes balanceMaskWave { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-20deg); } 60% { transform: rotate(10deg); } }
        @keyframes balanceMaskFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
        .bm-all { animation: balanceMaskBreath 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 85%; }
        .bm-wave { animation: balanceMaskWave 1.9s ease-in-out infinite; transform-box: fill-box; transform-origin: 100% 100%; }
        .bm-charm { animation: balanceMaskFloat 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
        @media (prefers-reduced-motion: reduce) {
          .bm-all, .bm-wave, .bm-charm { animation: none !important; }
        }
      `}</style><svg
    viewBox="0 0 64 64"
    width={box}
    height={box}
    style={{ display: "block", overflow: "visible" }}
    aria-hidden="true"
    focusable="false"
  ><defs><radialGradient id="bmBody" cx="36%" cy="30%" r="78%"><stop offset="0%" stopColor="#FFE27A" /><stop offset="100%" stopColor="#FFC43D" /></radialGradient></defs><g className="bm-all">{
    /* The little speed marks beside the waving arm, as in the sketch —
       they are what make a wave read as a wave rather than as an arm
       held up. */
  }<g stroke="#FFD166" strokeWidth="2.6" strokeLinecap="round" opacity="0.95"><path d="M6 11V6" /><path d="M1 16h-5" /><path d="M1.5 9.5L-2 6" /></g><path
    d="M26 48v7" stroke="#6B4A12" strokeWidth="3.6" strokeLinecap="round"
  /><path d="M40 48v7" stroke="#6B4A12" strokeWidth="3.6" strokeLinecap="round" /><ellipse cx="24.5" cy="56.5" rx="5" ry="2.8" fill="#6B4A12" /><ellipse cx="41.5" cy="56.5" rx="5" ry="2.8" fill="#6B4A12" /><path
    className="bm-wave"
    d="M18 30L6 19"
    stroke="#F0A92B"
    strokeWidth="4"
    strokeLinecap="round"
    fill="none"
  /><path d="M48 35l9 7" stroke="#F0A92B" strokeWidth="4" strokeLinecap="round" fill="none" /><circle
    cx="33" cy="32" r="18" fill="url(#bmBody)" stroke="#F0A92B" strokeWidth="1.5"
  /><ellipse cx="23" cy="37.5" rx="4" ry="2.7" fill="#FF9FB0" opacity="0.75" /><ellipse cx="43" cy="37.5" rx="4" ry="2.7" fill="#FF9FB0" opacity="0.75" /><ellipse
    cx="27.5" cy="29" rx="3" ry="3.5" fill="#3A2A08"
  /><ellipse cx="38.5" cy="29" rx="3" ry="3.5" fill="#3A2A08" /><circle cx="28.6" cy="27.7" r="1.1" fill="#fff" /><circle cx="39.6" cy="27.7" r="1.1" fill="#fff" /><path
    d="M27.5 37a5.5 5.5 0 0 0 11 0z"
    fill="#3A2A08"
  /><g className="bm-charm"><BalanceMaskCharm kind={charm} /></g></g></svg></span>;
}
