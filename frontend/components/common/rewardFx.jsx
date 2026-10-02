// src/components/common/rewardFx.jsx
import { useEffect as useEffect41, useRef as useRef24 } from "react";
// ── The reward moment: golden rain, and a coin shower to go with it ───────
//
// Used by the Creator Share reveal (PaymentUnlock) at the instant the foil
// clears and the card turns to the share. Both halves are deliberately
// self-contained:
//
//   * the rain is one <canvas> and one requestAnimationFrame loop — no
//     library, no DOM nodes per particle, nothing left running when the
//     component unmounts;
//   * the shower is synthesised from oscillators and the noise buffer
//     dialSound.js already builds — no audio file, so the bundle does not
//     grow and there is nothing to 404.
//
// This file must stay AFTER components/common/dialSound.js in
// build_app.mjs: dialAudio() and dialSoundEnabled() are read from it, and
// in a concatenated bundle that means "defined earlier in the file".

// ── Sound ────────────────────────────────────────────────────────────────
//
// A coin shower: one low thump as the money lands, then a scatter of small
// pings over about two seconds, thinning as they go, with a quiet band of
// air underneath. Roughly 2.5s end to end.
//
// Why the pings are scattered rather than played on a beat: a rhythm turns
// this into a jingle, and a jingle is a brand asking for attention. A
// scatter reads as a physical event that happened to the person.
var REWARD_COIN_NOTES = [1046.5, 1174.7, 1318.5, 1567.98, 1760, 2093, 2349.3];
var REWARD_COIN_COUNT = 22;
// Peak gain of a single ping, before the per-ping variation. In the same
// register as DIAL_SOUND_GAIN (0.075) for the same reason: this plays in
// a room, a second after somebody has paid for something.
var REWARD_COIN_GAIN = 0.05;
var REWARD_COIN_SPREAD_S = 1.9;

function rewardTone(ctx, freq, at, dur, peak, type, bendTo) {
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, at);
  if (bendTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, bendTo), at + dur);
  // exponentialRamp cannot start from or reach exactly 0, hence the epsilons.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.08);
  osc.onended = function () {
    // Every node is torn down. A reveal that leaked thirty oscillators would
    // not be audible, but it would be a graph the browser keeps alive.
    try { osc.disconnect(); gain.disconnect(); } catch (e) {}
  };
}

function rewardAir(ctx, buffer, at, dur, peak, hz) {
  if (!buffer) return;
  var src = ctx.createBufferSource();
  var filter = ctx.createBiquadFilter();
  var gain = ctx.createGain();
  src.buffer = buffer;
  src.loop = dur > 0.2;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(hz, at);
  filter.Q.value = 1.3;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(at);
  src.stop(at + dur + 0.08);
  src.onended = function () {
    try { src.disconnect(); filter.disconnect(); gain.disconnect(); } catch (e) {}
  };
}

// Warm the audio graph from inside a real user gesture.
//
// The reveal fires about a second after the tap that caused it, on a timer.
// A context constructed outside a gesture starts suspended on every mobile
// browser and stays that way — so the tap has to be the thing that builds
// it, even though the sound comes later. Call this from the pointer handler;
// it is cheap and a no-op once the context exists.
function warmRewardSound() {
  if (!dialSoundEnabled()) return;
  dialAudio();
}

// The cue itself. Obeys the same preference as the dial: someone who muted
// the keypad muted the app's voice, not one keypad.
function playCoinShower() {
  if (!dialSoundEnabled()) return false;
  var ctx = dialAudio();
  if (!ctx) return false;
  var t0 = ctx.currentTime + 0.02;
  // The landing: a short pitched thump, pulled down an octave as it decays.
  rewardTone(ctx, 150, t0, 0.42, REWARD_COIN_GAIN * 2, "sine", 78);
  rewardAir(ctx, dialNoiseBuffer, t0, 0.3, 0.05, 2600);
  // Then the coins. Pow(i/n, 0.78) front-loads them, so the scatter is
  // thickest right after the landing and thins out rather than stopping.
  for (var i = 0; i < REWARD_COIN_COUNT; i++) {
    var at = t0 + 0.04 + Math.pow(i / REWARD_COIN_COUNT, 0.78) * REWARD_COIN_SPREAD_S + Math.random() * 0.05;
    var note = REWARD_COIN_NOTES[Math.floor(Math.random() * REWARD_COIN_NOTES.length)];
    rewardTone(
      ctx,
      note * (0.985 + Math.random() * 0.03),
      at,
      0.3 + Math.random() * 0.25,
      REWARD_COIN_GAIN * (1 - i / (REWARD_COIN_COUNT + 8)),
      "triangle"
    );
  }
  rewardAir(ctx, dialNoiseBuffer, t0 + 0.15, 1.9, 0.016, 7600);
  return true;
}

// ── Golden rain ──────────────────────────────────────────────────────────
//
// Ribbons and dust falling across the whole screen behind the card. Two
// shapes only — a rotating ribbon and a round speck — because a field of
// recognisable objects competes with the figure on the card, which is the
// thing anybody opened this to see.
var REWARD_RAIN_COLORS = ["#FDE68A", "#FCD34D", "#6EE7B7", "#A78BFA", "#FFFFFF"];
// Particles per 2200 square CSS pixels, clamped. Density rather than a flat
// count, so a tablet is not sparse and a small phone is not choked.
var REWARD_RAIN_AREA_PER = 2200;
var REWARD_RAIN_MIN = 90;
var REWARD_RAIN_MAX = 260;

function rewardRainParticle(width, height, seeded) {
  var ribbon = Math.random() < 0.55;
  return {
    x: Math.random() * width,
    // Seeded particles start spread down the screen so the field is already
    // full on the first frame. Respawns start above it, spread over a tall
    // band rather than one line, so nothing arrives in a visible row.
    y: seeded ? Math.random() * height : -20 - Math.random() * (height * 0.5),
    w: ribbon ? 3 + Math.random() * 4 : 1.4 + Math.random() * 2.4,
    h: ribbon ? 8 + Math.random() * 12 : 1.4 + Math.random() * 2.4,
    fall: 0.6 + Math.random() * 1.7,
    sway: 12 + Math.random() * 40,
    swaySpeed: 0.006 + Math.random() * 0.016,
    phase: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.09,
    angle: Math.random() * Math.PI * 2,
    alpha: 0.35 + Math.random() * 0.55,
    color: REWARD_RAIN_COLORS[Math.floor(Math.random() * REWARD_RAIN_COLORS.length)],
    ribbon: ribbon
  };
}

function GoldenRainField({ active }) {
  const canvasRef = useRef24(null);
  useEffect41(() => {
    if (!active) return void 0;
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") return void 0;
    // Somebody who has asked for less motion gets the card and no weather.
    // Not a reduced version — a field of falling objects IS the motion.
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return void 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return void 0;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    let particles = [];
    let raf = 0;
    let last = 0;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(
        REWARD_RAIN_MIN,
        Math.min(REWARD_RAIN_MAX, Math.round((width * height) / REWARD_RAIN_AREA_PER))
      );
      particles = [];
      for (let i = 0; i < count; i++) particles.push(rewardRainParticle(width, height, true));
      // And a first fall from above, so the screen is seen to FILL rather
      // than to already have been full when it appeared.
      for (let k = 0; k < Math.min(90, count); k++) {
        particles[k].y = -10 - Math.random() * (height * 0.6);
        particles[k].fall = 1.1 + Math.random() * 2.2;
      }
    };

    const frame = (now) => {
      // Normalised to a 60fps step and capped, so a dropped frame nudges the
      // field forward instead of teleporting it.
      const dt = Math.min(2.4, (now - last) / 16.67 || 1);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += p.swaySpeed * dt;
        p.y += p.fall * dt;
        p.angle += p.spin * dt;
        if (p.y > height + 24) {
          particles[i] = rewardRainParticle(width, height, false);
          continue;
        }
        const x = p.x + Math.sin(p.phase) * p.sway;
        // Fade out over the last 80px rather than vanishing at the edge.
        const fade = p.y > height - 80 ? Math.max(0, (height - p.y) / 80) : 1;
        ctx.save();
        ctx.translate(x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.alpha * fade * 0.8;
        ctx.fillStyle = p.color;
        if (p.ribbon) {
          // The ribbon turns edge-on as it tumbles: its drawn height is its
          // real height times the cosine of its own sway phase.
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.phase * 1.7)));
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.w, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = window.requestAnimationFrame(frame);
    };

    measure();
    window.addEventListener("resize", measure);
    raf = window.requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="reward-rain"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        // Behind the card, in front of the scrim, and never in the way of a
        // tap: every control under it must stay reachable.
        pointerEvents: "none"
      }}
    />
  );
}
