// src/components/common/dialSound.js
//
// The Gloobal ID dial's mechanical feedback.
//
// ── Synthesised, not sampled ─────────────────────────────────────────────
//
// There are no audio files here and there deliberately are none. A set of
// four short clicks as mp3 or wav is 40-80KB in the bundle for a sound that
// lasts twelve milliseconds, it has to be decoded before the first one can
// play (so the first tap of a session is silent or late), and every variation
// asked for below — a different pitch each time, a different loudness each
// time — would have to be a separate file or a playbackRate hack that shifts
// the whole timbre with it.
//
// Built from oscillators and a noise burst instead, a tick costs nothing to
// ship, starts on the same frame it is asked for, and pitch and level are two
// numbers rather than two assets.
//
// ── What a click actually is ─────────────────────────────────────────────
//
// A real switch makes two sounds at once, and reproducing only the first is
// what makes synthesised UI clicks sound like a beep:
//
//   the STRIKE   a very short broadband transient — the two surfaces meeting.
//                Noise, bandpassed, three to six milliseconds, no more.
//   the BODY     the housing ringing at its own frequency for a few more
//                milliseconds and dying fast. A sine, sharply damped.
//
// Each voice below is one strike plus one body, and the four differ in the
// body's frequency and decay the way four different sizes of switch do.
//
// ── Why not one sound ────────────────────────────────────────────────────
//
// A single fixed sample repeated at speed is the sound of a machine gun, not
// of a mechanism: the human ear locks onto the exact repetition immediately.
// Real detents never repeat exactly. So: four voices, never the same one
// twice in a row, each with its pitch nudged by up to ±7% and its level by up
// to ±30%. That is enough irregularity to stop the run sounding looped and
// little enough that it still sounds like ONE mechanism rather than four.

// Where the preference lives. One key, one boolean.
var DIAL_SOUND_KEY = "gloobal.dialSound";

// Peak gain of a tick, before the per-tick variation below.
//
// Low on purpose. This is feedback, not an alert: it sits under a
// conversation and under a room, and the person holding the phone should
// notice it stop if they switch it off rather than notice it start. Anything
// that can be heard across a room from a payments app is a nuisance.
var DIAL_SOUND_GAIN = 0.075;

// The floor between two ticks.
//
// A fast flick of the ring crosses a detent every few milliseconds. Without
// this, a spin fires forty overlapping ticks that sum into a buzz — and every
// one of them is an oscillator and a buffer source the browser has to build
// and tear down, on the same thread that is animating the dial.
//
// 38ms is about 26 ticks a second, which is at the top of what still reads as
// separate clicks rather than a tone. Ticks over the limit are DROPPED, not
// queued: a queue would keep clicking after the wheel had stopped, which is
// the one thing that would make the feedback feel fake.
var DIAL_SOUND_MIN_GAP_MS = 38;

// One shared AudioContext for the whole app.
//
// A context per tick exhausts the browser's limit within a few seconds of
// spinning (Chrome allows about six), and every one of them costs a hardware
// device open. Created lazily rather than at module load, because a context
// constructed outside a user gesture starts "suspended" on every mobile
// browser and stays that way — which is why UI sound so often works on a
// laptop and silently does nothing on a phone.
var dialAudioCtx = null;
var dialNoiseBuffer = null;
// Deliberately far in the past rather than 0. performance.now() is small on
// a freshly-loaded page, so a zero here makes the rate limiter swallow the
// very FIRST tick of a session — the one that tells somebody the feature
// exists at all.
var dialLastTickAt = -1e9;
var dialLastVoice = -1;

function dialSoundEnabled() {
  try {
    var raw = window.localStorage.getItem(DIAL_SOUND_KEY);
    // Absent means never chosen. The feature is on by default — it is the
    // point of the dial having been given a voice — and the toggle beside it
    // is how anyone turns it off.
    return raw === null ? true : raw === "1";
  } catch (e) {
    // Private mode, blocked site data, or no window at all. Sound off is the
    // safe read: a page that cannot remember a preference should not keep
    // making noise somebody already switched off.
    return false;
  }
}

function setDialSoundEnabled(on) {
  try {
    window.localStorage.setItem(DIAL_SOUND_KEY, on ? "1" : "0");
  } catch (e) {
    // The preference does not survive the session. The toggle still works for
    // this one, which is better than refusing to toggle.
  }
}

// Must be called from inside a real user gesture the first time.
function dialAudio() {
  if (dialAudioCtx) {
    // Browsers suspend a context when the tab is backgrounded and do not
    // always resume it on return. Cheap to ask every time; a no-op when it is
    // already running.
    if (dialAudioCtx.state === "suspended") dialAudioCtx.resume().catch(function () {});
    return dialAudioCtx;
  }
  if (typeof window === "undefined") return null;
  var Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    dialAudioCtx = new Ctor();
  } catch (e) {
    // Some embedded webviews expose the constructor and refuse to build one.
    dialAudioCtx = null;
    return null;
  }
  // A quarter-second of white noise, generated once and re-used as the source
  // for every strike. Each tick reads a random slice of it, so no two strikes
  // are the same noise even though there is only one buffer.
  var frames = Math.floor(dialAudioCtx.sampleRate * 0.25);
  dialNoiseBuffer = dialAudioCtx.createBuffer(1, frames, dialAudioCtx.sampleRate);
  var data = dialNoiseBuffer.getChannelData(0);
  for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return dialAudioCtx;
}

// The four voices.
//
//   body     the housing's resonant frequency, in Hz
//   decay    how long the body rings, in seconds
//   strike   the bandpass centre of the transient, in Hz
//   bite     how loud the strike is relative to the body
//
// Read them as four sizes of the same mechanism rather than four unrelated
// sounds: the bodies walk 780 -> 2400Hz and the decays shorten as the pitch
// rises, which is what happens to a physical object as it gets smaller.
var DIAL_SOUND_VOICES = [
  { body: 2400, decay: 0.020, strike: 3600, bite: 0.55 },
  { body: 1620, decay: 0.028, strike: 2700, bite: 0.42 },
  { body: 1150, decay: 0.038, strike: 2100, bite: 0.34 },
  { body: 780, decay: 0.052, strike: 1500, bite: 0.28 }
];

// A firmer, lower click for a real key press, and a lower one still for
// delete. The dial's detents are the light sound; putting a symbol INTO the
// field should feel like a heavier action than turning the ring past one, and
// taking one out should be audibly different from putting one in — otherwise
// a person spinning and tapping hears one undifferentiated stream.
var DIAL_SOUND_PRESS = { body: 620, decay: 0.070, strike: 1800, bite: 0.40 };
var DIAL_SOUND_DELETE = { body: 400, decay: 0.090, strike: 1200, bite: 0.32 };

// Play one voice. `force` skips the rate limit — a deliberate tap is never
// the thing that needs throttling, only a fast spin is.
function playDialVoice(voice, level, force) {
  var ctx = dialAudio();
  if (!ctx) return false;
  var now = ctx.currentTime;
  var wall = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!force && wall - dialLastTickAt < DIAL_SOUND_MIN_GAP_MS) return false;
  dialLastTickAt = wall;

  // ±7% of pitch and ±30% of level, per tick. Small enough that the mechanism
  // still sounds like one object; large enough that twenty in a row do not
  // sound like a loop.
  var pitch = 1 + (Math.random() * 2 - 1) * 0.07;
  var gain = DIAL_SOUND_GAIN * level * (1 + (Math.random() * 2 - 1) * 0.3);
  var decay = voice.decay * (1 + (Math.random() * 2 - 1) * 0.15);

  var out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);

  // ── The body ──
  //
  // An exponential ramp, not a linear one: loudness is perceived
  // logarithmically, so a linear fade of a 20ms click is audible as a tiny
  // downward swoop rather than as a decay. exponentialRampToValueAtTime
  // cannot reach zero, hence the 0.0001 floor.
  var osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(voice.body * pitch, now);
  // A touch of downward pitch bend over the decay. A struck object loses its
  // higher partials first and reads as falling slightly; a dead-steady tone
  // is the thing that sounds synthetic.
  osc.frequency.exponentialRampToValueAtTime(voice.body * pitch * 0.82, now + decay);
  var bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  // 1.5ms of attack rather than an instant start: a true step edge produces
  // an audible click of its own on top of the one being synthesised.
  bodyGain.gain.exponentialRampToValueAtTime(gain, now + 0.0015);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  osc.connect(bodyGain);
  bodyGain.connect(out);

  // ── The strike ──
  var noise = ctx.createBufferSource();
  noise.buffer = dialNoiseBuffer;
  // A random offset into the shared buffer, so two strikes never read the
  // same samples.
  var offset = Math.random() * 0.2;
  var band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = voice.strike * pitch;
  band.Q.value = 1.4;
  var strikeGain = ctx.createGain();
  var strikeLen = 0.006;
  strikeGain.gain.setValueAtTime(gain * voice.bite, now);
  strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + strikeLen);
  noise.connect(band);
  band.connect(strikeGain);
  strikeGain.connect(out);

  osc.start(now);
  osc.stop(now + decay + 0.01);
  noise.start(now, offset, strikeLen + 0.01);
  noise.stop(now + strikeLen + 0.01);
  // Let the graph go as soon as the tail has finished, rather than leaving a
  // node per tick attached to the destination for the life of the page.
  osc.onended = function () {
    try {
      out.disconnect();
    } catch (e) {
      // Already torn down.
    }
  };
  return true;
}

// One detent of the ring. Rate limited — this is the one a fast spin fires
// dozens of times a second.
function dialSoundTick() {
  if (!dialSoundEnabled()) return;
  var i = Math.floor(Math.random() * DIAL_SOUND_VOICES.length);
  // Never the same voice twice running. Stepping to the next one rather than
  // re-rolling keeps this constant-time and cannot loop.
  if (i === dialLastVoice) i = (i + 1) % DIAL_SOUND_VOICES.length;
  dialLastVoice = i;
  playDialVoice(DIAL_SOUND_VOICES[i], 1, false);
}

// A symbol went into the field.
function dialSoundPress() {
  if (!dialSoundEnabled()) return;
  playDialVoice(DIAL_SOUND_PRESS, 1.15, true);
}

// A symbol came out of it.
function dialSoundDelete() {
  if (!dialSoundEnabled()) return;
  playDialVoice(DIAL_SOUND_DELETE, 1.1, true);
}

// Called when the toggle is switched ON, from inside that click. Two jobs:
// it is the user gesture that lets the context exist at all on mobile, and it
// plays one tick so the answer to "did that do anything?" is immediate.
function dialSoundConfirm() {
  playDialVoice(DIAL_SOUND_VOICES[1], 1, true);
}

// How far the ring turns between detents, in degrees.
//
// Not 45 (one symbol). The eight symbols are 45 degrees apart, but the ring's
// rotation does not select anything — pressing a symbol does — so a tick per
// symbol would be a click every eighth of a turn, which feels like a loose
// wheel rather than a mechanism. 15 degrees is 24 detents a turn, which is
// where a flick produces a run that decelerates audibly as the momentum dies.
var DIAL_DETENT_DEG = 15;
