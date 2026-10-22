// src/components/common/balanceMask.jsx
import { useState as useState47 } from "react";

// ── WHAT A HIDDEN BALANCE LOOKS LIKE ────────────────────────────────────
//
// Seven bullets. That is what this replaced, and seven bullets is what
// every banking app shows, which is the problem with it: a row of dots
// says "there is a number here and you may not see it", in the tone of
// a redaction.
//
// So the card draws a character instead. Not an emoji: an emoji is a font
// glyph, drawn differently on every phone, sized by the text engine, and
// incapable of moving. These are SVGs the app owns, so they are the same
// everywhere and they can breathe.
//
// ── TEN CHARACTERS, NOT ONE IN TEN COLOURS ──────────────────────────────
//
// The first attempt at this was one round body recoloured ten times with a
// different hat on each, and it was rejected on sight, correctly: at 40
// pixels on a dark card the eye reads SILHOUETTE long before it reads hue,
// so ten tints of the same circle are one character, not ten.
//
// Each of these is drawn separately. Ears, a beak, an antenna, tentacles,
// a flowerpot — you could name any of them from the outline alone with the
// colour stripped out. What they share is a manner, not a body: friendly,
// waving, pleased to see you.
//
// ── WHY NOTHING ABOUT THEM MEANS ANYTHING ───────────────────────────────
//
// This is the whole discipline of the file, and it is worth being explicit
// because the obvious idea is the wrong one.
//
// A character who REFLECTED the balance — cheerful when there is plenty,
// glum when it is thin — would be genuinely alive and genuinely useful,
// and would hand anybody looking at the phone the exact thing the eye was
// tapped to hide. A mask that leaks what it masks is not a mask.
//
// So every one of them is always pleased to see you. No expression varies,
// no character is luckier than another, and which one you get is not
// derived from the account, the balance, the hour or anything else a
// watcher could learn to read.
var BALANCE_MASK_CAST = [
  "penguin", "cat", "chick", "bear", "bunny",
  "robot", "ghost", "cactus", "octo", "star"
];

// ── ONE PER SIGN-IN ─────────────────────────────────────────────────────
//
// Not one per hide. Hiding the balance ten times in a minute and getting
// ten different animals turns the mask into a slot machine and draws the
// eye to the act of hiding, which is the opposite of what it is for. One
// character greets you when you sign in and stays yours until you sign in
// again — the same face each time you tap the eye today, a different one
// tomorrow.
//
// "This sign-in" is identified by the bearer token, which is minted fresh
// at every login, registration, PIN reset and passkey sign-in, and which
// changes when the account is switched. Hashing it to a short signature is
// how the choice survives a page reload without being pinned to the clock:
// the same session finds its own character again, a new session does not.
//
// The signature is a 32-bit FNV-1a fold, i.e. one of ~four billion values
// per token narrowed to one of ten characters. It is stored, the token is
// not, and nothing is reversible from it — no part of the credential can
// be recovered from the letter stored beside the character's name.
var BALANCE_MASK_SEEN_KEY = "gloobal:balanceMaskSeen";

// The page's own copy, so the character is stable across mounts even on a
// phone with storage blocked — there, every hide would otherwise re-pick.
var balanceMaskSession = null;

// The fold itself now lives beside the token, in sessionStore.js, because
// the install banner needs the same answer to the same question — "is this
// a new sign-in" — and two copies of a hash are two things to keep in step.
function balanceMaskSignature() {
  return typeof gloobalSessionFingerprint === "function" ? gloobalSessionFingerprint() : "";
}

function balanceMaskRemembered() {
  if (balanceMaskSession) return balanceMaskSession;
  try {
    const held = JSON.parse(window.localStorage.getItem(BALANCE_MASK_SEEN_KEY) || "null");
    if (held && typeof held.sig === "string" && BALANCE_MASK_CAST.indexOf(held.key) !== -1) return held;
  } catch (e) {
    // Storage blocked or holding something that is not ours. Either way
    // there is nothing remembered, which is a new character — never a crash.
  }
  return null;
}

// Takes no argument, deliberately: a caller passing the balance, the
// account or the time would make the character mean something, and the
// whole point is that it cannot.
function balanceMaskPick() {
  const sig = balanceMaskSignature();
  const held = balanceMaskRemembered();
  if (held && held.sig === sig) return held.key;

  // A new sign-in. Never the character that just left, so the change is
  // visible rather than a one-in-ten coincidence of looking identical.
  const pool = BALANCE_MASK_CAST.filter((name) => !held || name !== held.key);
  const from = pool.length ? pool : BALANCE_MASK_CAST;
  const picked = from[Math.floor(Math.random() * from.length)];
  balanceMaskSession = { sig: sig, key: picked };
  try {
    window.localStorage.setItem(BALANCE_MASK_SEEN_KEY, JSON.stringify(balanceMaskSession));
  } catch (e) {
    // The in-memory copy above already holds it for this page view.
  }
  return picked;
}

// There was a BALANCE_FIGURE_MASK here \u2014 four fixed dots for the week's
// paid and received figures, which the eye hid along with the balance.
//
// The founder took it back out: "no need to hide weekly chart amount just
// the balance". He is right, and the reason is worth keeping. The balance
// is what you HAVE, and it is the number somebody standing beside you is
// trying to read. The week is what MOVED, which is the part you are most
// likely to be showing somebody on purpose. Hiding both made the card go
// blank for a glance that only ever wanted one of them covered.

// The speed marks beside the waving arm take the character's own colour,
// so the wave reads as part of the same creature rather than a yellow mark
// borrowed from whoever was drawn first.
var BALANCE_MASK_MARKS = {
  penguin: "#8FA6D4",
  cat: "#F5A95C",
  chick: "#FFD24A",
  bear: "#C08B55",
  bunny: "#FFC2D6",
  robot: "#A9C2E0",
  ghost: "#D9CFF7",
  cactus: "#6FC46A",
  octo: "#C47BE8",
  star: "#FFD166"
};

// ── THE DRAWINGS ────────────────────────────────────────────────────────
//
// One branch per character, each carrying its own gradient. Only the
// chosen one is ever mounted, so only its <defs> reach the document.
//
// Co-ordinates are in the shared 0 0 64 64 box. Ground level is y=58 and
// the waving arm leaves the box on the left, which is why the <svg> sets
// overflow: visible — the arm and the speed marks are meant to sit outside
// the square the figure would have occupied.
function BalanceMaskCreature({ kind }) {
  if (kind === "penguin") {
    return <g><defs><radialGradient id="bmGPeng" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#7A92C4"/><stop offset="100%" stopColor="#3B4A6B"/></radialGradient></defs>
      <path d="M27 53l-7 4.5 7 1.5z" fill="#F7A92B" stroke="#D1821A" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M39 53l7 4.5-7 1.5z" fill="#F7A92B" stroke="#D1821A" strokeWidth="1.2" strokeLinejoin="round"/>
      <path className="bm-wave" d="M18 31L6 21" stroke="#3B4A6B" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M49 36l9 9" stroke="#3B4A6B" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <ellipse cx="33" cy="33" rx="17" ry="20.5" fill="url(#bmGPeng)" stroke="#2C3752" strokeWidth="1.5"/>
      <ellipse cx="33" cy="35" rx="11.5" ry="17" fill="#FDFBF4"/>
      <path d="M33 31l-5 4.5h10z" fill="#F7A92B" stroke="#D1821A" strokeWidth="1.1" strokeLinejoin="round"/>
      <ellipse cx="23.5" cy="31" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="42.5" cy="31" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="28" cy="26" rx="3.1" ry="3.627" fill="#2F2208"/>
      <ellipse cx="38" cy="26" rx="3.1" ry="3.627" fill="#2F2208"/>
      <circle cx="29.178" cy="24.636" r="1.147" fill="#fff"/>
      <circle cx="39.178" cy="24.636" r="1.147" fill="#fff"/></g>;
  }
  if (kind === "cat") {
    return <g><defs><radialGradient id="bmGCat" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#FFD9A8"/><stop offset="100%" stopColor="#F5A95C"/></radialGradient></defs>
      <path d="M50 44c8 2 9 9 4 12" stroke="#F5A95C" strokeWidth="4.2" strokeLinecap="round" fill="none"/>
      <path d="M20 23l-1-12 11 7z" fill="#F5A95C" stroke="#D1803A" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M46 23l1-12-11 7z" fill="#F5A95C" stroke="#D1803A" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M22 20l-.5-6 5.5 3.5z" fill="#FFB7CE"/>
      <path d="M44 20l.5-6-5.5 3.5z" fill="#FFB7CE"/>
      <ellipse cx="25" cy="55" rx="5.4" ry="3" fill="#D1803A"/>
      <ellipse cx="41" cy="55" rx="5.4" ry="3" fill="#D1803A"/>
      <path className="bm-wave" d="M18 32L7 21" stroke="#F5A95C" strokeWidth="4.2" strokeLinecap="round" fill="none"/>
      <circle cx="33" cy="35" r="18" fill="url(#bmGCat)" stroke="#D1803A" strokeWidth="1.5"/>
      <g stroke="#D1803A" strokeWidth="1.3" strokeLinecap="round">
      <path d="M16 36h-7"/><path d="M16.5 41l-6.5 2.5"/><path d="M50 36h7"/><path d="M49.5 41l6.5 2.5"/>
      </g>
      <ellipse cx="23" cy="40" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="43" cy="40" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="27.5" cy="32" rx="3" ry="3.51" fill="#2F2208"/>
      <ellipse cx="38.5" cy="32" rx="3" ry="3.51" fill="#2F2208"/>
      <circle cx="28.64" cy="30.68" r="1.1099999999999999" fill="#fff"/>
      <circle cx="39.64" cy="30.68" r="1.1099999999999999" fill="#fff"/>
      <path d="M33 37.5l-2.6-2h5.2z" fill="#E8697F"/>
      <path d="M33 38.5v2m0 0c0 1.6 2 2.4 3.4 1.4m-3.4-1.4c0 1.6-2 2.4-3.4 1.4" stroke="#2F2208" strokeWidth="1.3" fill="none" strokeLinecap="round"/></g>;
  }
  if (kind === "chick") {
    return <g><defs><radialGradient id="bmGChick" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#FFF0A8"/><stop offset="100%" stopColor="#FFD24A"/></radialGradient></defs>
      <g stroke="#F09A1E" strokeWidth="2.4" strokeLinecap="round">
      <path d="M27 52v5"/><path d="M39 52v5"/>
      <path d="M27 57l-4 2.5"/><path d="M27 57l4 2.5"/><path d="M27 57v3"/>
      <path d="M39 57l-4 2.5"/><path d="M39 57l4 2.5"/><path d="M39 57v3"/>
      </g>
      <path d="M33 7c2 2 2.6 4.4 1.6 6.4" stroke="#F09A1E" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <ellipse cx="33" cy="34" rx="16" ry="18" fill="url(#bmGChick)" stroke="#F09A1E" strokeWidth="1.5"/>
      <path className="bm-wave" d="M20 34q-9-2-14-11 9 0 15 6z" fill="#FFE893" stroke="#F09A1E" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M46 36q8 2 12 9-9 1-13-4z" fill="#FFE893" stroke="#F09A1E" strokeWidth="1.4" strokeLinejoin="round"/>
      <ellipse cx="23.5" cy="36" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="42.5" cy="36" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="28" cy="29" rx="3" ry="3.51" fill="#2F2208"/>
      <ellipse cx="38" cy="29" rx="3" ry="3.51" fill="#2F2208"/>
      <circle cx="29.14" cy="27.68" r="1.1099999999999999" fill="#fff"/>
      <circle cx="39.14" cy="27.68" r="1.1099999999999999" fill="#fff"/>
      <path d="M33 34l-4.5 3.5h9z" fill="#F0890F" stroke="#C96A06" strokeWidth="1" strokeLinejoin="round"/></g>;
  }
  if (kind === "bear") {
    return <g><defs><radialGradient id="bmGBear" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#E6C49B"/><stop offset="100%" stopColor="#C08B55"/></radialGradient></defs>
      <circle cx="19" cy="19" r="7.5" fill="#C08B55" stroke="#8A5E2E" strokeWidth="1.4"/>
      <circle cx="47" cy="19" r="7.5" fill="#C08B55" stroke="#8A5E2E" strokeWidth="1.4"/>
      <circle cx="19" cy="19" r="3.6" fill="#F0C9A0"/>
      <circle cx="47" cy="19" r="3.6" fill="#F0C9A0"/>
      <ellipse cx="25" cy="55.5" rx="5.6" ry="3.1" fill="#8A5E2E"/>
      <ellipse cx="41" cy="55.5" rx="5.6" ry="3.1" fill="#8A5E2E"/>
      <path d="M26 48v5" stroke="#8A5E2E" strokeWidth="3.8" strokeLinecap="round"/>
      <path d="M40 48v5" stroke="#8A5E2E" strokeWidth="3.8" strokeLinecap="round"/>
      <path className="bm-wave" d="M18 32L7 21" stroke="#C08B55" strokeWidth="4.4" strokeLinecap="round" fill="none"/>
      <path d="M47 39l12 8" stroke="#C08B55" strokeWidth="4.8" strokeLinecap="round" fill="none"/>
      <circle cx="33" cy="34" r="18" fill="url(#bmGBear)" stroke="#8A5E2E" strokeWidth="1.5"/>
      <ellipse cx="33" cy="41" rx="10" ry="7.5" fill="#F3D6B6"/>
      <ellipse cx="21.5" cy="37" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="44.5" cy="37" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="27" cy="30" rx="3" ry="3.51" fill="#2F2208"/>
      <ellipse cx="39" cy="30" rx="3" ry="3.51" fill="#2F2208"/>
      <circle cx="28.14" cy="28.68" r="1.1099999999999999" fill="#fff"/>
      <circle cx="40.14" cy="28.68" r="1.1099999999999999" fill="#fff"/>
      <ellipse cx="33" cy="38.5" rx="3" ry="2.2" fill="#2F2208"/>
      <path d="M33 40.7v2m0 0c0 1.5 1.9 2.3 3.2 1.3m-3.2-1.3c0 1.5-1.9 2.3-3.2 1.3" stroke="#2F2208" strokeWidth="1.3" fill="none" strokeLinecap="round"/></g>;
  }
  if (kind === "bunny") {
    return <g><defs><radialGradient id="bmGBunny" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#FFF2F6"/><stop offset="100%" stopColor="#FFD3E2"/></radialGradient></defs>
      <g transform="rotate(-13 26 16)">
      <ellipse cx="26" cy="16" rx="4.6" ry="13" fill="#FFE4EE" stroke="#E89AB8" strokeWidth="1.4"/>
      <ellipse cx="26" cy="17" rx="2" ry="8.4" fill="#FFB7CE"/>
      </g>
      <g transform="rotate(13 40 16)">
      <ellipse cx="40" cy="16" rx="4.6" ry="13" fill="#FFE4EE" stroke="#E89AB8" strokeWidth="1.4"/>
      <ellipse cx="40" cy="17" rx="2" ry="8.4" fill="#FFB7CE"/>
      </g>
      <ellipse cx="23" cy="55" rx="6.6" ry="3.4" fill="#E89AB8"/>
      <ellipse cx="43" cy="55" rx="6.6" ry="3.4" fill="#E89AB8"/>
      <path className="bm-wave" d="M19 35L8 24" stroke="#FFD3E2" strokeWidth="4.2" strokeLinecap="round" fill="none"/>
      <path d="M47 38l9 7" stroke="#FFD3E2" strokeWidth="4.2" strokeLinecap="round" fill="none"/>
      <ellipse cx="33" cy="38" rx="16" ry="15" fill="url(#bmGBunny)" stroke="#E89AB8" strokeWidth="1.5"/>
      <ellipse cx="23" cy="41" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="43" cy="41" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="28" cy="35" rx="3" ry="3.51" fill="#2F2208"/>
      <ellipse cx="38" cy="35" rx="3" ry="3.51" fill="#2F2208"/>
      <circle cx="29.14" cy="33.68" r="1.1099999999999999" fill="#fff"/>
      <circle cx="39.14" cy="33.68" r="1.1099999999999999" fill="#fff"/>
      <path d="M33 39.5l-2.4-1.8h4.8z" fill="#E8697F"/>
      <path d="M33 40.4v1.8m0 0c0 1.5 1.9 2.2 3.1 1.2m-3.1-1.2c0 1.5-1.9 2.2-3.1 1.2" stroke="#2F2208" strokeWidth="1.2" fill="none" strokeLinecap="round"/></g>;
  }
  if (kind === "robot") {
    return <g><defs><radialGradient id="bmGBot" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#DCE8F7"/><stop offset="100%" stopColor="#A9C2E0"/></radialGradient></defs>
      <path d="M33 16V7" stroke="#7C97B5" strokeWidth="2.6" strokeLinecap="round"/>
      <circle cx="33" cy="5" r="3.4" fill="#FF7B91" stroke="#E8536C" strokeWidth="1"/>
      <rect x="23" y="52" width="9" height="6" rx="2.4" fill="#5E7996"/>
      <rect x="35" y="52" width="9" height="6" rx="2.4" fill="#5E7996"/>
      <path className="bm-wave" d="M17 32L8 22" stroke="#8FAAC6" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <circle cx="7" cy="21" r="3.4" fill="#A9C2E0" stroke="#7C97B5" strokeWidth="1.2"/>
      <path d="M49 36l8 6" stroke="#8FAAC6" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <circle cx="58" cy="43" r="3.4" fill="#A9C2E0" stroke="#7C97B5" strokeWidth="1.2"/>
      <rect x="15" y="17" width="36" height="35" rx="10" fill="url(#bmGBot)" stroke="#7C97B5" strokeWidth="1.6"/>
      <rect x="21" y="23" width="24" height="15" rx="6" fill="#2E4258"/>
      <circle cx="28" cy="30.5" r="3.1" fill="#7BE3FF"/><circle cx="38" cy="30.5" r="3.1" fill="#7BE3FF"/>
      <circle cx="29" cy="29.4" r="1.1" fill="#fff"/><circle cx="39" cy="29.4" r="1.1" fill="#fff"/>
      <path d="M27 44h12" stroke="#5E7996" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M30 44v3.2M33 44v3.2M36 44v3.2" stroke="#5E7996" strokeWidth="1.6" strokeLinecap="round"/></g>;
  }
  if (kind === "ghost") {
    return <g><defs><radialGradient id="bmGGhost" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#FFFFFF"/><stop offset="100%" stopColor="#D9CFF7"/></radialGradient></defs>
      <path className="bm-wave" d="M17 34L7 24" stroke="#CFC2F0" strokeWidth="4.2" strokeLinecap="round" fill="none"/>
      <path d="M49 37l9 6" stroke="#CFC2F0" strokeWidth="4.2" strokeLinecap="round" fill="none"/>
      <path d="M15 52V32a18 18 0 0 1 36 0v20c-3.2 0-3.6-4-6.5-4s-3.3 4-6.5 4-3.3-4-6.5-4-3.3 4-6.5 4-3.3-4-6.5-4-3.3 4-3.5 4z"
      fill="url(#bmGGhost)" stroke="#B7A8E8" strokeWidth="1.5" strokeLinejoin="round"/>
      <ellipse cx="23" cy="36" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="43" cy="36" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="27.5" cy="29" rx="3" ry="3.51" fill="#2F2208"/>
      <ellipse cx="38.5" cy="29" rx="3" ry="3.51" fill="#2F2208"/>
      <circle cx="28.64" cy="27.68" r="1.1099999999999999" fill="#fff"/>
      <circle cx="39.64" cy="27.68" r="1.1099999999999999" fill="#fff"/><path d="M27.5 36.5a5.5 5.5 0 0 0 11 0z" fill="#2F2208"/></g>;
  }
  if (kind === "cactus") {
    return <g><defs><radialGradient id="bmGCac" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#B6ECA8"/><stop offset="100%" stopColor="#6FC46A"/></radialGradient></defs>
      <path d="M24 49h18l-2 11H26z" fill="#E09A5C" stroke="#B4743C" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M22 47h22v4H22z" fill="#F0B274" stroke="#B4743C" strokeWidth="1.3"/>
      <path className="bm-wave" d="M24 37H16a5 5 0 0 0-5 5v5" stroke="#6FC46A" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <path d="M42 41h7a5 5 0 0 1 5 5v4" stroke="#6FC46A" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <rect x="23" y="13" width="20" height="36" rx="10" fill="url(#bmGCac)" stroke="#3F8C45" strokeWidth="1.5"/>
      <g stroke="#3F8C45" strokeWidth="1.3" strokeLinecap="round" opacity="0.8">
      <path d="M27 19l-2.5-1.5"/><path d="M39 19l2.5-1.5"/><path d="M27 44l-2.5-1.5"/><path d="M39 44l2.5-1.5"/>
      </g>
      <circle cx="33" cy="10" r="2.4" fill="#FFD166"/>
      <g fill="#FF9FB0" stroke="#E8697F" strokeWidth="0.9">
      <ellipse cx="33" cy="5.6" rx="2.3" ry="3"/><ellipse cx="33" cy="14.4" rx="2.3" ry="3"/>
      <ellipse cx="28.6" cy="10" rx="3" ry="2.3"/><ellipse cx="37.4" cy="10" rx="3" ry="2.3"/>
      </g>
      <ellipse cx="26.5" cy="31" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="39.5" cy="31" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="29.5" cy="25" rx="2.6" ry="3.042" fill="#2F2208"/>
      <ellipse cx="36.5" cy="25" rx="2.6" ry="3.042" fill="#2F2208"/>
      <circle cx="30.488" cy="23.856" r="0.962" fill="#fff"/>
      <circle cx="37.488" cy="23.856" r="0.962" fill="#fff"/><path d="M28.8 31.5a4.2 4.2 0 0 0 8.4 0z" fill="#2F2208"/></g>;
  }
  if (kind === "octo") {
    return <g><defs><radialGradient id="bmGOcto" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#F3C8FF"/><stop offset="100%" stopColor="#C47BE8"/></radialGradient></defs>
      <g stroke="#A14FC8" strokeWidth="5" strokeLinecap="round" fill="none">
      <path d="M18 42q-3 8 1 13"/><path d="M26 45q-2 8 2 12"/>
      <path d="M40 45q2 8-2 12"/><path d="M48 42q3 8-1 13"/>
      </g>
      <path className="bm-wave" d="M16 32L6 22" stroke="#C47BE8" strokeWidth="4.4" strokeLinecap="round" fill="none"/>
      <path d="M50 35l8 7" stroke="#C47BE8" strokeWidth="4.4" strokeLinecap="round" fill="none"/>
      <path d="M15 44V31a18 18 0 0 1 36 0v13z" fill="url(#bmGOcto)" stroke="#A14FC8" strokeWidth="1.5" strokeLinejoin="round"/>
      <ellipse cx="22.5" cy="35" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="43.5" cy="35" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="27.5" cy="28" rx="3.3" ry="3.8609999999999998" fill="#2F2208"/>
      <ellipse cx="38.5" cy="28" rx="3.3" ry="3.8609999999999998" fill="#2F2208"/>
      <circle cx="28.754" cy="26.548000000000002" r="1.2209999999999999" fill="#fff"/>
      <circle cx="39.754" cy="26.548000000000002" r="1.2209999999999999" fill="#fff"/><path d="M27.5 35.5a5.5 5.5 0 0 0 11 0z" fill="#2F2208"/></g>;
  }
  if (kind === "star") {
    return <g><defs><radialGradient id="bmGStar" cx="36%" cy="28%" r="80%"><stop offset="0%" stopColor="#FFF0A8"/><stop offset="100%" stopColor="#FFC43D"/></radialGradient></defs>
      <ellipse cx="21.2" cy="49.5" rx="5.4" ry="3" fill="#D99400"/>
      <ellipse cx="44.8" cy="49.5" rx="5.4" ry="3" fill="#D99400"/>
      <path className="bm-wave" d="M16 23L6 14" stroke="#F0B81E" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M33 11L38.3 23.7 52 24.8 41.6 33.8 44.8 47.2 33 40 21.2 47.2 24.4 33.8 14 24.8 27.7 23.7Z"
      fill="url(#bmGStar)" stroke="#E0A312" strokeWidth="1.6" strokeLinejoin="round"/>
      <ellipse cx="25" cy="35" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="41" cy="35" rx="4" ry="2.72" fill="#FF9FB0" opacity="0.65"/>
      <ellipse cx="28.5" cy="29" rx="3.1" ry="3.627" fill="#2F2208"/>
      <ellipse cx="37.5" cy="29" rx="3.1" ry="3.627" fill="#2F2208"/>
      <circle cx="29.678" cy="27.636" r="1.147" fill="#fff"/>
      <circle cx="38.678" cy="27.636" r="1.147" fill="#fff"/><path d="M28 35.5a5 5 0 0 0 10 0z" fill="#2F2208"/></g>;
  }
  return null;
}

// The character.
//
// Picked ONCE per mount, in the state initialiser rather than the render
// body, so it cannot change under somebody while they are looking at it.
// balanceMaskPick itself returns the same answer all session, so remounting
// — which happens on every reveal and re-hide — gives back the same face.
//
// `size` is the balance's own font size, so the figure takes the space the
// number would have taken and the card does not change height when the eye
// is tapped.
function BalanceMaskFace({ size = 32, label = "Balance hidden", nudge = 0 }) {
  const [kind] = useState47(balanceMaskPick);
  const px = Number(size) > 0 ? Number(size) : 32;
  // 1.75 of the figure's own size, up from 1.35. At 1.35 the character was
  // drawn to the footprint of the NUMBER it replaces, which is the right
  // instinct for a mask and the wrong one for a drawing: a figure is read
  // glyph by glyph and a character is read whole, so the same box leaves it
  // looking like a small mark rather than somebody waving.
  //
  // The card's height does not follow this. The row is as tall as the
  // balance line either way, and the drawing is allowed to overflow it —
  // the same arrangement ChoiceNameMask uses, and for the same reason.
  const box = Math.round(px * 1.75);
  return <span
    role="img"
    aria-label={label}
    style={{
      display: "inline-flex",
      alignItems: "center",
      lineHeight: 1,
      // Pushed off the card's left edge. The balance sits hard against the
      // gutter because a number starts at its first digit; a character has
      // a raised arm and a shadow of space around it, and tucked into the
      // corner it reads as something that slipped rather than something
      // placed.
      marginLeft: nudge,
      // The box is the figure's height, not the drawing's, so growing the
      // character cannot grow the row it sits in.
      height: px
    }}
  ><style>{`
        @keyframes balanceMaskBreath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes balanceMaskWave { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-20deg); } 60% { transform: rotate(10deg); } }
        .bm-all { animation: balanceMaskBreath 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 85%; }
        .bm-wave { animation: balanceMaskWave 1.9s ease-in-out infinite; transform-box: fill-box; transform-origin: 100% 100%; }
        @media (prefers-reduced-motion: reduce) {
          .bm-all, .bm-wave { animation: none !important; }
        }
      `}</style><svg
    viewBox="0 0 64 64"
    width={box}
    height={box}
    style={{ display: "block", overflow: "visible" }}
    aria-hidden="true"
    focusable="false"
  ><g className="bm-all">{
    /* The little speed marks beside the waving arm, as in the sketch — they
       are what make a wave read as a wave rather than as an arm held up. */
  }<g stroke={BALANCE_MASK_MARKS[kind] || "#FFD166"} strokeWidth="2.6" strokeLinecap="round" opacity="0.95"><path d="M6 11V6" /><path d="M1 16h-5" /><path d="M1.5 9.5L-2 6" /></g><BalanceMaskCreature kind={kind} /></g></svg></span>;
}

// ── THE SAME FACE WHEREVER SOMETHING IS HIDDEN ──────────────────────────
//
// The Send screen hides the names of your choices behind the same eye,
// and for the same reason: a phone held up at a counter. It used to show
// eight dots — "••••••••" — once under the amount and again under
// each chip in the strip.
//
// Dots were already the better half of a bad pair: eight fixed ones say
// less than one-per-letter, which across four chips is most of the way to
// telling a reader which is which. But they are still a redaction bar,
// and they were a THIRD convention — the balance had a character, the
// names had dots, and the figures beside the chart had four other dots.
//
// So a hidden name is the same character too, and that is the whole
// point: one face, everywhere, means "this is yours and it is covered".
// It is also the character that greeted you at sign-in, which no watcher
// can read anything from — it is the same one whether the name is
// "Damroo Baby" or "Rent", whether there is one choice or four.
//
// Sized by the caller because the two places it appears are a 12.5px line
// and an 11.5px chip label.
//
// `line` is the second half of that, and it exists because of a measured
// fault rather than a guess. Dropped in bare at size 13, the character
// made the "for <name>" row 24px tall where the name made it 17 — seven
// pixels, every time the eye was tapped, with the Pay button directly
// underneath and a thumb already on its way down to it. An inline-flex
// box is as tall as what it holds, and the drawing is deliberately taller
// than its nominal size so the raised arm is not cropped.
//
// So the outer box is told exactly how much of the line to occupy and the
// drawing is allowed to overflow it. `vertical-align: bottom` rather than
// baseline: an inline-flex has no text baseline of its own, and letting
// the browser invent one from its contents is where the extra descender
// space came from.
//
// Where the row's height is already fixed — the chip labels are two lines
// tall whether they hold "Rent" or "Damroo Baby" — `line` is left off and
// the drawing sets its own box.
function ChoiceNameMask({ size = 14, line = 0 }) {
  const px = Number(size) > 0 ? Number(size) : 14;
  const tall = Number(line) > 0 ? Number(line) : Math.round(px * 1.35);
  return <span
    style={{ display: "inline-block", height: tall, lineHeight: `${tall}px`, verticalAlign: "bottom" }}
  ><span
    style={{ display: "inline-flex", alignItems: "center", height: tall, overflow: "visible" }}
  ><BalanceMaskFace size={px} label="Name hidden" /></span></span>;
}
