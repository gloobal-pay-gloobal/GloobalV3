// src/components/common/actionTileMotion.jsx
//
// The four action tiles move the way the thing they do moves.
//
// Send flies off the tile. Receive drops in from above. Scan sweeps a line
// down its frame. Bank settles on its footing.
//
// ── Why motion, and why this motion ──────────────────────────────────────
//
// The tiles were never actually still: Dashboard.jsx picks one of TEN
// flip-capable buttons every 15 seconds and flips it for 1.3s, so each tile
// turns about once every two and a half minutes. The machinery was there and
// the odds of catching it were not. That flip stays — it is part of the app's
// character, and it is what ties these buttons to the dial symbols — and this
// sits on a wrapper outside it, so the two compose rather than fight for the
// same transform.
//
// What it buys beyond decoration: two of these four tiles, Scan and Receive,
// carry NO text label. Their meaning rests entirely on a glyph. A movement
// that restates the meaning is a second way to read them, which a slow scale
// or a drifting sheen would not be — those are alive and say nothing, and the
// send tile would breathe exactly like the bank tile.
//
// ── The rest, which is most of the time ──────────────────────────────────
//
// Each animation occupies the first ~28% of a 9-second cycle and then holds
// still. Four tiles moving continuously on a mid-range Android is a battery
// cost paid all day for an effect nobody is looking at after the first
// minute, and a dashboard where everything is always moving is one where
// nothing draws the eye. Staggered by 0.6s so at almost any glance exactly
// one tile is doing something.
var ACTION_TILE_CYCLE_MS = 9000;

// The stagger, in seconds, by tile. Indexed the same way the dashboard lays
// them out, so the order on screen is the order they take their turn.
var ACTION_TILE_DELAYS = { send: 0, bank: 0.6, scan: 1.2, receive: 1.8 };

// One <style> for the whole group, rendered once by the dashboard.
//
// Inline rather than in App.jsx's global sheet, and that is a lesson this
// codebase already paid for: @keyframes finDrift lived in App.jsx while the
// particles that needed it lived in a component, so the day that component
// was rendered on a new screen it drew eighteen particles parked off-viewport
// and a blank background. Keyframes travel with what they animate.
function ActionTileMotionStyle() {
  return <style>{`
    /* Send — away, and back. The gap where it is invisible is deliberate:
       the plane does not fly BACK onto the tile, which would read as a
       return trip. It leaves, and another one is there. */
    @keyframes gat-send {
      0%, 4%   { transform: translate(0,0); opacity: 1; }
      20%      { transform: translate(14px,-14px); opacity: 0; }
      21%      { transform: translate(-10px,10px); opacity: 0; }
      30%, 100%{ transform: translate(0,0); opacity: 1; }
    }
    /* Receive — in from above, and it stays. The mirror of send: one ends
       empty-handed, the other ends holding something.
       Note it starts AT REST and fades before it moves, rather than starting
       already hoisted above the tile. Both matter: an animation-delay with
       the default fill mode shows the element's own resting state during the
       delay, so a keyframe set that opens mid-flight would draw the icon in
       one place for 1.8s and then jump; and a set that ends somewhere other
       than where it began pops on every loop. */
    @keyframes gat-receive {
      0%, 4%   { transform: translateY(0); opacity: 1; }
      9%       { transform: translateY(0); opacity: 0; }
      10%      { transform: translateY(-13px); opacity: 0; }
      24%      { transform: translateY(0); opacity: 1; }
      100%     { transform: translateY(0); opacity: 1; }
    }
    /* Bank — a settle, not a bounce. It is the one tile of the four that
       should look like it is not going anywhere. */
    @keyframes gat-bank {
      0%, 4%   { transform: translateY(0); }
      14%      { transform: translateY(-3px); }
      26%, 100%{ transform: translateY(0); }
    }
    /* Scan — the line a scanner actually shows. Runs inside the tile's own
       corner brackets rather than across the whole tile, so it reads as the
       frame doing its job. */
    @keyframes gat-sweep {
      0%, 3%   { top: 34%; opacity: 0; }
      7%       { opacity: 1; }
      22%      { top: 66%; opacity: 1; }
      27%, 100%{ top: 66%; opacity: 0; }
    }
    .gat { animation-duration: ${ACTION_TILE_CYCLE_MS}ms; animation-iteration-count: infinite;
           animation-timing-function: cubic-bezier(.4,0,.2,1); will-change: transform; }
    .gat-send    { animation-name: gat-send; }
    .gat-receive { animation-name: gat-receive; }
    .gat-bank    { animation-name: gat-bank; }
    .gat-sweep   { animation-name: gat-sweep; animation-duration: ${ACTION_TILE_CYCLE_MS}ms;
                   animation-iteration-count: infinite;
                   animation-timing-function: cubic-bezier(.45,0,.55,1); }
    @media (prefers-reduced-motion: reduce) {
      /* Nothing animates, and nothing is left mid-flight. Every keyframe
         above both starts and ends at the tile's resting state, so removing
         the animation removes the motion and not the icon — the failure the
         symbol background had, where particles started off-screen and were
         carried in BY the animation. */
      .gat, .gat-sweep { animation: none !important; }
      .gat-sweep { opacity: 0 !important; }
    }
  `}</style>;
}

// What the tile's GLYPH gets. Not the tile, and not the icon component's
// root — see the note in flipIcons.jsx on why those are the same element and
// why animating it would carry the tint away with the plane.
//
// Returns null for any key that is not one of the four, so a tile added later
// is obviously still rather than silently inheriting somebody else's meaning.
function actionTileIconMotion(tileKey) {
  const delay = ACTION_TILE_DELAYS[tileKey];
  if (delay === void 0) return null;
  return {
    className: `gat gat-${tileKey}`,
    style: { display: "block", animationDelay: `${delay}s` }
  };
}

// The scan line, which is the one piece of this that is not a transform on an
// existing element. Positioned against the tile, so the caller renders it as
// a sibling of the icon inside the tile's own positioned box.
function ActionTileSweep({ tileKey, color }) {
  if (tileKey !== "scan") return null;
  return <span
    aria-hidden="true"
    className="gat-sweep"
    style={{
      position: "absolute",
      left: "32%",
      right: "32%",
      height: 2,
      borderRadius: 2,
      background: color,
      // The line's RESTING state is invisible, and that has to live here
      // rather than in the keyframes. An animation-delay with the default
      // fill mode leaves the element showing its own style until the delay
      // elapses — so without this, the scan tile draws a solid bar across
      // its glyph for the first 1.2 seconds of every page load.
      opacity: 0,
      boxShadow: `0 0 8px ${color}AA`,
      animationDelay: `${ACTION_TILE_DELAYS.scan}s`,
      pointerEvents: "none"
    }}
  />;
}
