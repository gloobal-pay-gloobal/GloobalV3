// src/components/common/balanceMask.jsx
import { useState as useState47 } from "react";
import { Eye as EyeMaskSign } from "lucide-react";
// ── WHAT A HIDDEN BALANCE LOOKS LIKE ────────────────────────────────────
//
// Seven bullets is what every banking app shows, and a row of dots says
// "there is a number here and you may not see it", in the tone of a
// redaction. So the card shows a friend instead: an SVG the app owns, the
// same on every phone, and able to breathe.
//
// ── CALM FRIENDS (0192) ─────────────────────────────────────────────────
//
// The first cast waved, flashed speed marks and was drawn bigger than the
// balance line, pushed off the card's left edge. On a phone it spilled over
// the card's badge and its edges. The founder asked for "happy or peaceful"
// characters instead, holding a sign, changing by themselves.
//
// So this cast is twelve round, soft friends who smile with their eyes
// closed and breathe slowly. Nobody waves. On the balance cards they hold a
// small white sign (BalanceMaskSign below), and the sign is the button that
// shows the balance — the card has one thing to tap, not a face AND an eye.
//
// ── WHY NOTHING ABOUT THEM MEANS ANYTHING ───────────────────────────────
//
// A friend who REFLECTED the balance — cheerful when there is plenty, glum
// when it is thin — would hand anybody looking at the phone the exact thing
// the eye was tapped to hide. So every one of them is always content, no
// expression varies, and which one you get says nothing about the account.
//
// What it does follow is the CLOCK, which is not a secret: anybody beside
// you already knows whether it is morning. Mornings bring the sun, the bird,
// the sprout and the bunny; daytime the cloud, the otter, the kitty and the
// lotus; evenings and night the moon, the panda, the sloth and the koala.
var BALANCE_MASK_CAST = [
  "sunny", "birdie", "sprout", "bunny",
  "cloud", "otter", "kitty", "lotus",
  "moon", "panda", "sloth", "koala"
];

// The hour's group, and what the sign says. Hours are the phone's own
// local hours. Night runs past midnight, so it is written as 17 → 29 and
// the small hours are read as 24 + h.
var BALANCE_MASK_HOURS = [
  { from: 5, to: 11, cast: ["sunny", "birdie", "sprout", "bunny"] },
  { from: 11, to: 17, cast: ["cloud", "otter", "kitty", "lotus"] },
  { from: 17, to: 29, cast: ["moon", "panda", "sloth", "koala"] }
];

function balanceMaskHour() {
  try {
    return new Date().getHours();
  } catch (e) {
    return 12;
  }
}

function balanceMaskHourGroup(hour) {
  const h = Number(hour) < 5 ? Number(hour) + 24 : Number(hour);
  return BALANCE_MASK_HOURS.find((g) => h >= g.from && h < g.to) || BALANCE_MASK_HOURS[1];
}

// The word on the sign, for the hour it was picked in.
function balanceMaskWord(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 11) return "Good morning";
  if (h >= 11 && h < 17) return "All safe";
  if (h >= 17 && h < 21) return "Good evening";
  return "Good night";
}

// ── A NEW FRIEND EACH TIME YOU OPEN ─────────────────────────────────────
//
// Not one per hide: ten different animals in a minute of tapping the eye
// would turn the mask into a slot machine. One friend greets you when the
// app opens (or when you sign in) and stays for as long as you are in it.
// Open GLOOBAL again and somebody else is holding the sign — never the one
// you saw last time.
//
// "This open" is the page's own memory, which a reload or a fresh launch
// empties. "This sign-in" is the bearer token's short fold
// (gloobalSessionFingerprint in sessionStore.js), so switching account in
// the same page also brings somebody new. The token itself is never stored:
// only the fold and the name of the friend, so the next open can avoid
// repeating them.
var BALANCE_MASK_SEEN_KEY = "gloobal:balanceMaskSeen";

var balanceMaskSession = null;

function balanceMaskSignature() {
  return typeof gloobalSessionFingerprint === "function" ? gloobalSessionFingerprint() : "";
}

// The friend shown last time, from storage — only so the next one differs.
function balanceMaskRemembered() {
  try {
    const held = JSON.parse(window.localStorage.getItem(BALANCE_MASK_SEEN_KEY) || "null");
    if (held && typeof held.sig === "string" && BALANCE_MASK_CAST.indexOf(held.key) !== -1) return held;
  } catch (e) {
    // Storage blocked or holding something that is not ours: nothing
    // remembered, which is simply a new friend — never a crash.
  }
  return null;
}

// Takes no argument, deliberately: a caller passing the balance or the
// account would make the friend mean something. The hour is read inside.
function balanceMaskPick() {
  const sig = balanceMaskSignature();
  if (balanceMaskSession && balanceMaskSession.sig === sig) return balanceMaskSession.key;
  const before = balanceMaskSession ? balanceMaskSession.key : (balanceMaskRemembered() || {}).key;
  const group = balanceMaskHourGroup(balanceMaskHour()).cast;
  const pool = group.filter((name) => name !== before);
  const from = pool.length ? pool : group;
  const picked = from[Math.floor(Math.random() * from.length)];
  balanceMaskSession = { sig: sig, key: picked };
  try {
    window.localStorage.setItem(BALANCE_MASK_SEEN_KEY, JSON.stringify(balanceMaskSession));
  } catch (e) {
    // The in-memory copy above holds it for this open.
  }
  return picked;
}

// ── A CHARACTER PER CHOICE, NOT ONE FOR ALL OF THEM ────────────────────
//
// balanceMaskPick above answers "which character is this SIGN-IN", which
// is the right question for the balance: there is one balance and it gets
// one mask. The choices strip asked the same question four times and got
// the same answer four times, so every hidden tile wore the same face and
// the row read as one thing repeated.
//
// This deals a DIFFERENT character to each choice — and reshuffles the
// deal every sign-in.
//
// Reshuffling is the part that matters. A fixed pairing would be easier to
// recognise, and that is exactly the problem: anybody who watches the
// screen once learns that the bear is Donation, and from then on the mask
// hides the name from the owner's shoulder-surfer and nobody else. Dealing
// again each session keeps the four distinguishable from each other
// without any of them meaning anything for longer than one sitting.
//
// Deterministic within a session, so a re-render never reshuffles the row
// under somebody's thumb: the session's own fingerprint is folded together
// with the choice's id, and the same pair always lands on the same
// character.
function choiceMaskPick(choiceKey) {
  const raw = String(choiceKey == null ? "" : choiceKey);
  // The session's answer, so the whole deal changes when the sign-in does.
  const salt = typeof balanceMaskSignature === "function" ? balanceMaskSignature() : "";
  const mixed = salt + "\u0000" + raw;
  let hash = 2166136261;
  for (let at = 0; at < mixed.length; at += 1) {
    hash ^= mixed.charCodeAt(at);
    hash = Math.imul(hash, 16777619);
  }
  return BALANCE_MASK_CAST[(hash >>> 0) % BALANCE_MASK_CAST.length];
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

// Each friend's own colour, used for the two little hands that hold the
// sign, so the hands read as theirs.
var BALANCE_MASK_MARKS = {
  sunny: "#FFC43D",
  birdie: "#8EC5FF",
  sprout: "#A9DC8E",
  bunny: "#FFFFFF",
  cloud: "#E3E9FB",
  otter: "#A8754F",
  kitty: "#F7D6A6",
  lotus: "#F7A9C6",
  moon: "#F0DC8C",
  panda: "#2E2E38",
  sloth: "#B08A68",
  koala: "#AEB4C8"
};

// Closed, smiling eyes and a little blush: the one expression the whole
// cast shares. `g` is half the gap between the eyes.
function BmFace({ x, y, g, ink = "#3A2A3E", blush = true }) {
  return <g>
    <path d={`M${x - g - 3} ${y}q3 -3.4 6 0M${x + g - 3} ${y}q3 -3.4 6 0`} stroke={ink} strokeWidth="2.3" fill="none" strokeLinecap="round"/>
    {blush ? <g><ellipse cx={x - g - 4} cy={y + 4.5} rx="3.2" ry="2" fill="#FF8FA8" opacity="0.55"/><ellipse cx={x + g + 4} cy={y + 4.5} rx="3.2" ry="2" fill="#FF8FA8" opacity="0.55"/></g> : null}
  </g>;
}

function BmSmile({ x, y, ink = "#3A2A3E" }) {
  return <path d={`M${x - 3.2} ${y}q3.2 3.2 6.4 0`} stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round"/>;
}

// ── THE DRAWINGS ────────────────────────────────────────────────────────
//
// Flat colours in the shared 0 0 64 64 box, every one inside 8..56: nothing
// reaches past the edge, so nothing can spill over a card. Shapes that
// overlap (the cloud's puffs, the kitty's ears, the bunny's ears) are drawn
// twice — once fat in the outline colour, once on top in the fill — so they
// read as one soft body rather than a pile of circles.
function BalanceMaskCreature({ kind }) {
  if (kind === "sunny") {
    return <g>
      <path d="M51 34h3.5M9.5 34h3.5M32 15v-3.5M32 56.5V53M45.4 20.6l2.6-2.6M16 52l2.6-2.6M45.4 47.4l2.6 2.6M16 16l2.6 2.6" stroke="#FFB938" strokeWidth="3.4" strokeLinecap="round"/>
      <circle cx="32" cy="34" r="15" fill="#FFD45C" stroke="#F2B33D" strokeWidth="2"/>
      <BmFace x={32} y={33} g={5}/><BmSmile x={32} y={39}/>
    </g>;
  }
  if (kind === "birdie") {
    return <g>
      <path d="M30 21q2 -8 6.5 -6.5 -3.5 2 -2.5 6.5" fill="#6FAEF2"/>
      <circle cx="32" cy="36" r="15" fill="#8EC5FF" stroke="#6FAEF2" strokeWidth="2"/>
      <ellipse cx="32" cy="42" rx="9.5" ry="7" fill="#E8F3FF"/>
      <ellipse cx="46.5" cy="38" rx="4" ry="7" transform="rotate(-20 46.5 38)" fill="#6FAEF2"/>
      <path d="M29.5 37.5l2.5 3.2 2.5-3.2z" fill="#FFB547"/>
      <BmFace x={32} y={32} g={5}/>
    </g>;
  }
  if (kind === "sprout") {
    return <g>
      <path d="M32 24q-1 -6 0 -9" stroke="#5DAE5F" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <path d="M32 16q-11 -6 -14 2 8 4 14 -2z" fill="#6CC47E"/>
      <path d="M32 16q11 -7 15 1 -8 5 -15 -1z" fill="#80D18E"/>
      <circle cx="32" cy="39" r="14" fill="#C4EBAE" stroke="#8CCB72" strokeWidth="2"/>
      <BmFace x={32} y={38} g={5}/><BmSmile x={32} y={44}/>
    </g>;
  }
  if (kind === "bunny") {
    return <g>
      <ellipse cx="25" cy="20" rx="5" ry="10" fill="#E2D9EE" stroke="#E2D9EE" strokeWidth="3"/>
      <ellipse cx="39" cy="20" rx="5" ry="10" fill="#E2D9EE" stroke="#E2D9EE" strokeWidth="3"/>
      <circle cx="32" cy="38" r="14" fill="#E2D9EE" stroke="#E2D9EE" strokeWidth="3"/>
      <ellipse cx="25" cy="20" rx="5" ry="10" fill="#FFFFFF"/>
      <ellipse cx="39" cy="20" rx="5" ry="10" fill="#FFFFFF"/>
      <circle cx="32" cy="38" r="14" fill="#FFFFFF"/>
      <ellipse cx="25" cy="20" rx="2.3" ry="6.5" fill="#FFC6D6"/>
      <ellipse cx="39" cy="20" rx="2.3" ry="6.5" fill="#FFC6D6"/>
      <path d="M30 41.5q2 1.8 4 0q-2 -1.6 -4 0z" fill="#F08DA2"/>
      <BmFace x={32} y={36} g={5}/><BmSmile x={32} y={44}/>
    </g>;
  }
  if (kind === "cloud") {
    return <g>
      <circle cx="21" cy="39" r="10" fill="#C9D3F0" stroke="#C9D3F0" strokeWidth="3"/>
      <circle cx="32" cy="31" r="13" fill="#C9D3F0" stroke="#C9D3F0" strokeWidth="3"/>
      <circle cx="44" cy="38" r="10" fill="#C9D3F0" stroke="#C9D3F0" strokeWidth="3"/>
      <rect x="12" y="37" width="41" height="13" rx="6.5" fill="#C9D3F0" stroke="#C9D3F0" strokeWidth="3"/>
      <circle cx="21" cy="39" r="10" fill="#FFFFFF"/>
      <circle cx="32" cy="31" r="13" fill="#FFFFFF"/>
      <circle cx="44" cy="38" r="10" fill="#FFFFFF"/>
      <rect x="12" y="37" width="41" height="13" rx="6.5" fill="#FFFFFF"/>
      <path d="M17 46q4 2 8 0" stroke="#E3E9FB" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <BmFace x={32} y={36} g={5}/><BmSmile x={32} y={42}/>
    </g>;
  }
  if (kind === "otter") {
    return <g>
      <circle cx="19" cy="23" r="4.5" fill="#94643F"/>
      <circle cx="45" cy="23" r="4.5" fill="#94643F"/>
      <circle cx="32" cy="34" r="15" fill="#A8754F" stroke="#8A5E3D" strokeWidth="2"/>
      <ellipse cx="32" cy="40" rx="9.5" ry="6.5" fill="#F0DDC6"/>
      <ellipse cx="32" cy="37.5" rx="2.6" ry="1.9" fill="#3A2A1E"/>
      <path d="M22 40h-6M22 42.5l-5 1.5M42 40h6M42 42.5l5 1.5" stroke="#E8D3BC" strokeWidth="1.2" strokeLinecap="round"/>
      <BmFace x={32} y={31} g={5} ink="#2E1F14"/><BmSmile x={32} y={41} ink="#3A2A1E"/>
    </g>;
  }
  if (kind === "kitty") {
    return <g>
      <path d="M17 28L19 11L30 21Z" fill="#E8BF85" stroke="#E8BF85" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M47 28L45 11L34 21Z" fill="#E8BF85" stroke="#E8BF85" strokeWidth="3" strokeLinejoin="round"/>
      <circle cx="32" cy="35" r="15" fill="#E8BF85" stroke="#E8BF85" strokeWidth="3"/>
      <path d="M17 28L19 11L30 21Z" fill="#F9DDAF"/>
      <path d="M47 28L45 11L34 21Z" fill="#F9DDAF"/>
      <circle cx="32" cy="35" r="15" fill="#F9DDAF"/>
      <path d="M19.8 16l1.2 8 5-4zM44.2 16l-1.2 8 -5-4z" fill="#F7B6C2"/>
      <path d="M30.6 38.5h2.8l-1.4 1.8z" fill="#F08DA2"/>
      <path d="M21 39h-6M21 41.5l-5 1.5M43 39h6M43 41.5l5 1.5" stroke="#D9AE77" strokeWidth="1.2" strokeLinecap="round"/>
      <BmFace x={32} y={33} g={5}/><BmSmile x={32} y={42}/>
    </g>;
  }
  if (kind === "lotus") {
    return <g>
      <path d="M32 50q-18 -2 -22 -14 10 -2 22 8z" fill="#F7A9C6"/>
      <path d="M32 50q18 -2 22 -14 -10 -2 -22 8z" fill="#F7A9C6"/>
      <path d="M32 49q-12 -8 -10 -22 9 3 10 12z" fill="#FBC4D8"/>
      <path d="M32 49q12 -8 10 -22 -9 3 -10 12z" fill="#FBC4D8"/>
      <ellipse cx="32" cy="36" rx="10" ry="13" fill="#FFE1EC" stroke="#F2A0BF" strokeWidth="2"/>
      <BmFace x={32} y={35} g={3.5}/><BmSmile x={32} y={41}/>
    </g>;
  }
  if (kind === "moon") {
    return <g>
      <circle cx="32" cy="34" r="16" fill="#F7E9A6" stroke="#E2CC72" strokeWidth="2"/>
      <circle cx="24" cy="26" r="2.6" fill="#EBD584"/>
      <circle cx="41" cy="44" r="2" fill="#EBD584"/>
      <path d="M49 11l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="#FFE27A"/>
      <path d="M46 23h4.5l-4.5 5h4.5" stroke="#B9C3F0" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <BmFace x={32} y={35} g={5}/><BmSmile x={32} y={41}/>
    </g>;
  }
  if (kind === "panda") {
    return <g>
      <circle cx="19" cy="21" r="6.5" fill="#2E2E38"/>
      <circle cx="45" cy="21" r="6.5" fill="#2E2E38"/>
      <circle cx="32" cy="35" r="16" fill="#FFFFFF" stroke="#D5D5E3" strokeWidth="2"/>
      <ellipse cx="24.5" cy="33" rx="5.2" ry="6.6" transform="rotate(-25 24.5 33)" fill="#2E2E38"/>
      <ellipse cx="39.5" cy="33" rx="5.2" ry="6.6" transform="rotate(25 39.5 33)" fill="#2E2E38"/>
      <path d="M22 33q2.6 -3 5.2 0M37 33q2.6 -3 5.2 0" stroke="#FFFFFF" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <ellipse cx="32" cy="39.5" rx="2.6" ry="1.9" fill="#2E2E38"/>
      <ellipse cx="20" cy="40" rx="3" ry="1.8" fill="#FF8FA8" opacity="0.5"/>
      <ellipse cx="44" cy="40" rx="3" ry="1.8" fill="#FF8FA8" opacity="0.5"/>
      <BmSmile x={32} y={43}/>
    </g>;
  }
  if (kind === "sloth") {
    return <g>
      <circle cx="32" cy="34" r="16" fill="#B08A68" stroke="#93704F" strokeWidth="2"/>
      <ellipse cx="32" cy="36" rx="12.5" ry="10.5" fill="#EDD7BA"/>
      <ellipse cx="25.5" cy="34" rx="5.6" ry="3.6" transform="rotate(-18 25.5 34)" fill="#6E513A"/>
      <ellipse cx="38.5" cy="34" rx="5.6" ry="3.6" transform="rotate(18 38.5 34)" fill="#6E513A"/>
      <path d="M23 34.5q2.6 -2.8 5.2 0M35.8 34.5q2.6 -2.8 5.2 0" stroke="#F6E7D6" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
      <ellipse cx="32" cy="39" rx="2.4" ry="1.6" fill="#4A3526"/>
      <path d="M22 22q10 -6 20 0" stroke="#93704F" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <BmSmile x={32} y={42} ink="#4A3526"/>
    </g>;
  }
  if (kind === "koala") {
    return <g>
      <circle cx="18" cy="24" r="8" fill="#AEB4C8"/>
      <circle cx="46" cy="24" r="8" fill="#AEB4C8"/>
      <circle cx="18" cy="24" r="4.5" fill="#F4C9D6"/>
      <circle cx="46" cy="24" r="4.5" fill="#F4C9D6"/>
      <circle cx="32" cy="35" r="15" fill="#BCC2D4" stroke="#9EA5BC" strokeWidth="2"/>
      <path d="M27.6 36.5q0 -4.8 4.4 -4.8 4.4 0 4.4 4.8 0 5.2 -4.4 5.2 -4.4 0 -4.4 -5.2z" fill="#3E4258"/>
      <BmFace x={32} y={30} g={6}/>
    </g>;
  }
  return null;
}

// The part of the 64 box the friends actually use. Every drawing stays
// inside 8..56 on both axes, so cropping to it draws them a third larger in
// the same space without cutting anybody off.
var BALANCE_MASK_VIEWBOX = "8 8 48 48";

// Breathing, shared by the face and the sign. Slow, and off entirely for
// anybody whose phone asks for less motion.
var BALANCE_MASK_CSS = `
  @keyframes balanceMaskBreath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
  .bm-all { animation: balanceMaskBreath 3.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 90%; }
  @media (prefers-reduced-motion: reduce) {
    .bm-all { animation: none !important; }
  }
`;

// The friend on its own: the Essentials tile and the hidden choice names.
//
// Picked ONCE per mount, in the state initialiser rather than the render
// body, so it cannot change under somebody while they are looking at it.
// `size` is the line it stands in for. The drawing is a little larger
// (1.2 of it; every friend fits its own box) and the row is not, so the
// line does not change height when something is hidden.
function BalanceMaskFace({ size = 32, label = "Balance hidden", nudge = 0, seed = null }) {
  const [kind] = useState47(() => (seed == null ? balanceMaskPick() : choiceMaskPick(seed)));
  const px = Number(size) > 0 ? Number(size) : 32;
  const box = Math.round(px * 1.2);
  return <span
    role="img"
    aria-label={label}
    style={{ display: "inline-flex", alignItems: "center", lineHeight: 1, marginLeft: nudge, height: px }}
  ><style>{BALANCE_MASK_CSS}</style><svg
    viewBox={BALANCE_MASK_VIEWBOX}
    width={box}
    height={box}
    style={{ display: "block", overflow: "visible" }}
    aria-hidden="true"
    focusable="false"
  ><g className="bm-all"><BalanceMaskCreature kind={kind} /></g></svg></span>;
}

// ── THE FRIEND HOLDING THE SIGN (0192) ──────────────────────────────────
//
// What the balance cards show while the balance is hidden. The sign is the
// button: tapping it is "Show balance", so the card does not also need an
// eye — one thing to tap. Once the balance is showing, the card's eye
// (now "Hide balance") puts it away again.
//
// Everything sits inside `size`, the balance line's own height: the friend
// is drawn at exactly that size, the sign is shorter than it, and the two
// hands are inside the sign's box. Nothing can spill over the card.
function BalanceMaskSign({ size = 38, onShow, label = "Show balance" }) {
  const [picked] = useState47(() => ({ kind: balanceMaskPick(), word: balanceMaskWord(balanceMaskHour()) }));
  const hand = BALANCE_MASK_MARKS[picked.kind] || "#FFD24A";
  const handStyle = (edge) => ({
    position: "absolute", left: -5, [edge]: 4, width: 11, height: 11, borderRadius: "50%",
    background: hand, border: "1.5px solid rgba(0,0,0,0.16)", boxSizing: "border-box"
  });
  return <span
    data-testid="balance-mask-sign"
    data-kind={picked.kind}
    style={{ display: "inline-flex", alignItems: "center", height: size, lineHeight: 1, verticalAlign: "middle" }}
  ><style>{BALANCE_MASK_CSS}</style><svg
    role="img"
    aria-label="Balance hidden"
    viewBox={BALANCE_MASK_VIEWBOX}
    width={size}
    height={size}
    style={{ display: "block", flexShrink: 0 }}
  ><g className="bm-all"><BalanceMaskCreature kind={picked.kind} /></g></svg><button
    type="button"
    onClick={onShow}
    aria-label={label}
    data-testid="balance-mask-show"
    className="v2-tap"
    style={{ position: "relative", marginLeft: -7, transform: "rotate(-2deg)", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
  ><span style={{
    display: "inline-flex", alignItems: "center", gap: 6, background: "#FFFFFF", color: T.accentDeep,
    fontSize: 12.5, fontWeight: 800, letterSpacing: 0, borderRadius: 10, padding: "7px 11px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)", whiteSpace: "nowrap"
  }}><EyeMaskSign size={14} strokeWidth={2.6} aria-hidden="true" />{picked.word}</span><span aria-hidden="true" style={handStyle("top")} /><span aria-hidden="true" style={handStyle("bottom")} /></button></span>;
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
// `seed` is the choice's own id. Without one every hidden tile in the row
// wore the session's single character and the strip read as one thing
// repeated four times.
function ChoiceNameMask({ size = 14, line = 0, seed = null }) {
  const px = Number(size) > 0 ? Number(size) : 14;
  const tall = Number(line) > 0 ? Number(line) : Math.round(px * 1.35);
  return <span
    style={{ display: "inline-block", height: tall, lineHeight: `${tall}px`, verticalAlign: "bottom" }}
  ><span
    style={{ display: "inline-flex", alignItems: "center", height: tall, overflow: "visible" }}
  ><BalanceMaskFace size={px} label="Name hidden" seed={seed} /></span></span>;
}
