// tests/dial-sound.test.mjs
//
// The Gloobal ID dial's mechanical feedback.
//
// ── Why this suite RUNS the synthesiser instead of reading it ────────────
//
// Sound is the one part of a UI a test cannot look at, which is exactly why
// it attracts assertions that prove nothing: "the file mentions an
// AudioContext", "there are four entries in the voices array". Both pass
// while the dial is silent, or while it plays the same click forty times a
// second.
//
// So dialSound.js is loaded and CALLED here, against a fake AudioContext that
// records every node built and every value set on it. The properties below
// are then read off that recording: how many ticks a fast spin actually
// produces, whether two consecutive ticks used the same voice, whether the
// pitch really moved. Each one is a thing the person holding the phone would
// hear.
//
// ── What is NOT covered ──────────────────────────────────────────────────
//
// Whether it sounds good. No test can say that. What these can say is that it
// is not one fixed sound, not a buzz, not silent, and not still playing after
// somebody switched it off.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SRC = "frontend/components/common/dialSound.js";
const DIAL = "frontend/components/inputs/dialPads.jsx";
const BUILD = "build_app.mjs";

// ── A fake AudioContext that remembers everything ────────────────────────
//
// Modelled closely enough on the real one that the module cannot tell, and
// recording enough that the test can. Every gain ramp and frequency set is
// kept with the time it was scheduled for, because "the pitch varies" and
// "the level varies" are claims about those numbers and nothing else.
function makeFakeAudio() {
  const built = { oscillators: [], gains: [], filters: [], sources: [], buffers: 0 };
  const param = (record) => ({
    value: 0,
    setValueAtTime(v, t) { record.push(["set", v, t]); return this; },
    exponentialRampToValueAtTime(v, t) { record.push(["ramp", v, t]); return this; },
    linearRampToValueAtTime(v, t) { record.push(["lin", v, t]); return this; }
  });
  class Ctx {
    constructor() {
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.state = "running";
      this.destination = { id: "destination" };
    }
    resume() { this.state = "running"; return Promise.resolve(); }
    createBuffer(channels, frames) {
      built.buffers += 1;
      const data = new Float32Array(frames);
      return { length: frames, getChannelData: () => data };
    }
    createGain() {
      const events = [];
      const node = { kind: "gain", events, gain: param(events), connect() {}, disconnect() {} };
      built.gains.push(node);
      return node;
    }
    createOscillator() {
      const events = [];
      const node = {
        kind: "osc", events, type: "sine", frequency: param(events),
        connect() {}, disconnect() {}, start() {}, stop() {}, onended: null
      };
      built.oscillators.push(node);
      return node;
    }
    createBiquadFilter() {
      const node = {
        kind: "filter", type: "", frequency: { value: 0 }, Q: { value: 0 },
        connect() {}, disconnect() {}
      };
      built.filters.push(node);
      return node;
    }
    createBufferSource() {
      const node = { kind: "source", buffer: null, connect() {}, disconnect() {}, start() {}, stop() {} };
      built.sources.push(node);
      return node;
    }
  }
  return { Ctx, built };
}

// Load the module fresh, with its own window, its own storage and its own
// module-level state. Fresh every time because the rate limiter and the
// "never the same voice twice" rule are both carried in module scope — one
// shared instance across tests would let one test's last tick decide the
// next test's first.
function loadDialSound(stored) {
  const { Ctx, built } = makeFakeAudio();
  const store = new Map();
  if (stored !== undefined && stored !== null) store.set("gloobal.dialSound", stored);
  const clock = { now: 0 };
  const win = {
    AudioContext: Ctx,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    }
  };
  const api = new Function(
    "window", "performance",
    `${readSource(SRC)}
     return { dialSoundEnabled, setDialSoundEnabled, dialSoundTick, dialSoundPress,
              dialSoundDelete, dialSoundConfirm, DIAL_SOUND_VOICES,
              DIAL_SOUND_MIN_GAP_MS, DIAL_DETENT_DEG, DIAL_SOUND_GAIN };`
  )(win, { now: () => clock.now });
  return { ...api, built, store, clock };
}

// The body oscillator's first scheduled frequency — the voice's pitch for
// that tick, jitter included.
function pitches(built) {
  return built.oscillators.map((o) => {
    const set = o.events.find((e) => e[0] === "set");
    return set ? set[1] : null;
  });
}

// The peak the body gain ramps up to — the tick's loudness.
function peaks(built) {
  return built.gains
    .map((g) => {
      const up = g.events.find((e) => e[0] === "ramp" && e[1] > 0.0005);
      return up ? up[1] : null;
    })
    .filter((v) => v !== null);
}

describe("the preference", () => {
  test("is on by default, before anyone has chosen", () => {
    // The feature exists to be heard. A default of off ships it switched off
    // for everybody who never finds the toggle, which is most people.
    assert.equal(loadDialSound(undefined).dialSoundEnabled(), true);
  });

  test("survives being turned off, and being turned back on", () => {
    const a = loadDialSound(undefined);
    a.setDialSoundEnabled(false);
    assert.equal(a.store.get("gloobal.dialSound"), "0");
    // A fresh load, as if the app had been closed and reopened.
    assert.equal(loadDialSound("0").dialSoundEnabled(), false);
    assert.equal(loadDialSound("1").dialSoundEnabled(), true);
  });

  test("reads as OFF when storage throws, rather than as on", () => {
    // Private mode, blocked site data, an embedded webview. A page that
    // cannot remember the preference must not keep making a noise somebody
    // already switched off — the failure has to fall silent, not loud.
    const src = readSource(SRC);
    const api = new Function(
      "window", "performance",
      `${src} return { dialSoundEnabled };`
    )({ localStorage: { getItem() { throw new Error("blocked"); } } }, { now: () => 0 });
    assert.equal(api.dialSoundEnabled(), false);
  });

  test("off means SILENT, not quiet", () => {
    const s = loadDialSound("0");
    for (let i = 0; i < 20; i++) {
      s.clock.now += 1000;
      s.dialSoundTick();
      s.dialSoundPress();
      s.dialSoundDelete();
    }
    assert.equal(s.built.oscillators.length, 0, "something still played with sound off");
    // And no AudioContext was opened either. Opening a hardware audio device
    // for a feature the person switched off is its own small rudeness.
    assert.equal(s.built.buffers, 0, "an AudioContext was created with sound off");
  });
});

describe("a tick is a click, not a beep", () => {
  test("it has both a strike and a body", () => {
    // The two halves a real switch makes at once. A body alone is a beep; a
    // strike alone is a hiss. Every tick must build one of each.
    const s = loadDialSound(undefined);
    s.dialSoundTick();
    assert.equal(s.built.oscillators.length, 1, "no body was synthesised");
    assert.equal(s.built.sources.length, 1, "no strike transient was synthesised");
    assert.equal(s.built.filters.length, 1, "the strike was not shaped at all");
    assert.equal(s.built.filters[0].type, "bandpass");
  });

  test("it is short — a tick, not a tone", () => {
    // Every scheduled event lands inside 120ms of the start. A click that
    // outlasts that is a note, and twenty of them overlap into a drone.
    const s = loadDialSound(undefined);
    s.dialSoundTick();
    const times = s.built.oscillators
      .concat(s.built.gains)
      .flatMap((n) => (n.events || []).map((e) => e[2]))
      .filter((t) => typeof t === "number");
    assert.ok(times.length > 0, "nothing was scheduled");
    assert.ok(Math.max(...times) <= 0.12, `a tick runs for ${Math.max(...times)}s`);
  });

  test("it fades exponentially, not linearly", () => {
    // Loudness is perceived logarithmically. A linear fade on a 20ms click is
    // audible as a small downward swoop rather than as a decay — it is the
    // single most common reason a synthesised click sounds synthetic.
    const s = loadDialSound(undefined);
    s.dialSoundTick();
    const kinds = s.built.gains.flatMap((g) => g.events.map((e) => e[0]));
    assert.ok(kinds.includes("ramp"), "no exponential ramp anywhere in the envelope");
    assert.ok(!kinds.includes("lin"), "a linear ramp is shaping the envelope");
  });

  test("it is quiet enough to be feedback", () => {
    // Peak gain well under a tenth. This sits under a conversation; anything
    // audible across a room from a payments app is a nuisance.
    const s = loadDialSound(undefined);
    assert.ok(s.DIAL_SOUND_GAIN <= 0.12, `peak gain is ${s.DIAL_SOUND_GAIN}`);
    s.dialSoundTick();
    for (const p of peaks(s.built)) assert.ok(p <= 0.2, `a tick peaked at ${p}`);
  });
});

describe("it is never the same sound twice", () => {
  test("there are several voices, and they are genuinely different", () => {
    const { DIAL_SOUND_VOICES } = loadDialSound(undefined);
    assert.ok(DIAL_SOUND_VOICES.length >= 4, "fewer than four voices is not variety");
    const bodies = DIAL_SOUND_VOICES.map((v) => v.body);
    assert.equal(new Set(bodies).size, bodies.length, "two voices share a body frequency");
    // And spread across a real range rather than clustered — four voices
    // within a semitone of each other are one voice.
    assert.ok(Math.max(...bodies) / Math.min(...bodies) >= 2, "the voices are all the same pitch");
  });

  test("no two consecutive ticks use the same voice", () => {
    // The property that stops a spin sounding looped. A run of forty with a
    // random pick would repeat about five times by chance.
    const s = loadDialSound(undefined);
    const bodies = [];
    for (let i = 0; i < 40; i++) {
      s.clock.now += 1000;
      s.dialSoundTick();
      const o = s.built.oscillators[s.built.oscillators.length - 1];
      bodies.push(o.events.find((e) => e[0] === "set")[1]);
    }
    // Compared as which VOICE it was, so the per-tick pitch jitter does not
    // make two of the same voice look different.
    const nearest = (f) => s.DIAL_SOUND_VOICES
      .map((v, i) => [Math.abs(Math.log(v.body / f)), i])
      .sort((a, b) => a[0] - b[0])[0][1];
    const voices = bodies.map(nearest);
    for (let i = 1; i < voices.length; i++) {
      assert.notEqual(voices[i], voices[i - 1], `voice ${voices[i]} repeated at tick ${i}`);
    }
  });

  test("pitch and level move from one tick to the next", () => {
    const s = loadDialSound(undefined);
    for (let i = 0; i < 24; i++) {
      s.clock.now += 1000;
      s.dialSoundTick();
    }
    assert.ok(new Set(pitches(s.built)).size >= 20, "the pitch is barely moving");
    assert.ok(new Set(peaks(s.built)).size >= 20, "the level is barely moving");
  });

  test("but the variation is small enough to still be one mechanism", () => {
    // A single voice, played many times, must stay within about a tenth of
    // its own pitch. Wider than that and the four voices smear into each
    // other and the dial stops sounding like one object.
    const s = loadDialSound(undefined);
    for (let i = 0; i < 60; i++) {
      s.clock.now += 1000;
      s.dialSoundTick();
    }
    const all = pitches(s.built);
    for (const v of s.DIAL_SOUND_VOICES) {
      const mine = all.filter((f) => Math.abs(Math.log(f / v.body)) < 0.15);
      if (mine.length < 2) continue;
      const spread = Math.max(...mine) / Math.min(...mine);
      assert.ok(spread <= 1.2, `voice ${v.body}Hz wandered by ${((spread - 1) * 100).toFixed(0)}%`);
    }
  });
});

describe("a fast spin does not become a buzz", () => {
  test("ticks closer together than the floor are DROPPED", () => {
    // Dropped, not queued. A queue keeps clicking after the wheel has
    // stopped, which is the one thing that would make the feedback feel like
    // a sound effect played over the gesture rather than part of it.
    const s = loadDialSound(undefined);
    for (let i = 0; i < 50; i++) {
      s.clock.now += 2; // 500 detents a second — a violent flick
      s.dialSoundTick();
    }
    const played = s.built.oscillators.length;
    const ceiling = Math.ceil(100 / s.DIAL_SOUND_MIN_GAP_MS) + 1;
    assert.ok(played <= ceiling, `${played} ticks played in 100ms (ceiling ${ceiling})`);
    assert.ok(played >= 1, "a fast spin went completely silent");
  });

  test("the floor still allows a run to read as separate clicks", () => {
    // Above about 30 a second, separate clicks fuse into a tone. Below about
    // 12, a spin sounds sparse and mechanical in the wrong way.
    const { DIAL_SOUND_MIN_GAP_MS } = loadDialSound(undefined);
    const perSecond = 1000 / DIAL_SOUND_MIN_GAP_MS;
    assert.ok(perSecond <= 32, `${perSecond.toFixed(0)} ticks a second will fuse into a tone`);
    assert.ok(perSecond >= 12, `${perSecond.toFixed(0)} ticks a second is too sparse for a spin`);
  });

  test("a deliberate tap is never throttled", () => {
    // Rate limiting exists for a spin. A press is one intentional action and
    // must always answer, even if it lands a millisecond after a tick.
    const s = loadDialSound(undefined);
    s.dialSoundTick();
    const after = s.built.oscillators.length;
    s.clock.now += 1; // well inside the floor
    s.dialSoundPress();
    assert.equal(s.built.oscillators.length, after + 1, "a press was swallowed by the rate limiter");
  });

  test("putting a symbol in and taking one out sound different", () => {
    // Otherwise someone spinning and tapping hears one undifferentiated
    // stream, and the delete — the only destructive control on the dial — is
    // the one that most needs its own voice.
    const a = loadDialSound(undefined);
    a.dialSoundPress();
    const b = loadDialSound(undefined);
    b.dialSoundDelete();
    assert.notEqual(pitches(a.built)[0], undefined);
    assert.ok(
      Math.abs(Math.log(pitches(a.built)[0] / pitches(b.built)[0])) > 0.15,
      "press and delete are the same pitch"
    );
  });
});

describe("the dial is wired to it, and to nothing else", () => {
  const dial = () => readSource(DIAL);

  test("rotation drives the ticks by DISTANCE, not by a timer", () => {
    // A timer would keep an even click rate while the wheel slowed down,
    // which is the difference between feedback that belongs to the gesture
    // and a click track playing over it.
    const s = dial();
    assert.match(s, /detentRef\.current \+= delta/);
    assert.match(s, />= DIAL_DETENT_DEG/);
    // Both the drag and the momentum coast must feed it, or the spin-down is
    // silent.
    assert.match(s, /feelRotation\(stepDelta\)/, "dragging does not tick");
    assert.match(s, /feelRotation\(v\)/, "the momentum coast does not tick");
  });

  test("the detent is finer than one symbol", () => {
    const { DIAL_DETENT_DEG } = loadDialSound(undefined);
    assert.ok(DIAL_DETENT_DEG > 0 && DIAL_DETENT_DEG < 45,
      "a tick per symbol is a click every eighth of a turn — a loose wheel, not a mechanism");
    assert.equal(360 % DIAL_DETENT_DEG, 0, "detents must divide a full turn evenly");
  });

  test("the sound follows the state change, never the tap", () => {
    // A press on a full field and a delete on an empty one both do nothing.
    // A click that plays anyway says a symbol went in or came out when it
    // did not.
    const s = dial();
    assert.match(s, /if \(soundOn && value\.length > 0\) dialSoundDelete\(\);/);
    assert.match(s, /\} else if \(k && value\.length < length\) \{\s*\n\s*if \(soundOn\) dialSoundPress\(\);/);
  });

  test("the toggle exists, says which state it is in, and is not a colour alone", () => {
    const s = dial();
    assert.match(s, /aria-pressed=\{soundOn\}/);
    assert.match(s, /aria-label=\{soundOn \? "Turn dial sound off" : "Turn dial sound on"\}/);
    // The icon changes, not just the tint — a toggle that differs only by
    // shade is unreadable to anyone who cannot see the shade.
    assert.match(s, /DialSoundOnIcon/);
    assert.match(s, /DialSoundOffIcon/);
  });

  test("switching it on plays from inside the click", () => {
    // Not politeness — necessity. Every mobile browser leaves an AudioContext
    // built outside a user gesture suspended, which is the classic bug where
    // UI sound works on a laptop and is silent on a phone.
    assert.match(dial(), /if \(next\) dialSoundConfirm\(\);/);
  });

  test("the preference is read once, not on every tick", () => {
    // localStorage is a synchronous main-thread call and a tick can fire
    // twenty times a second, on the thread animating the ring.
    assert.match(dial(), /useState5\(dialSoundEnabled\)/);
  });

  test("the module is in the build, ahead of the dial that calls it", () => {
    const b = readSource(BUILD);
    const sound = b.indexOf("components/common/dialSound.js");
    const pad = b.indexOf("components/inputs/dialPads.jsx");
    assert.ok(sound !== -1, "dialSound.js is not in FRONTEND_MODULES — it will silently not ship");
    assert.ok(sound < pad, "the dial is emitted before the sound it calls");
  });

  test("authentication and PIN entry are untouched", () => {
    // The brief was explicit, and this is the assertion that keeps it true
    // through later edits. PhoneDialPad is the numeric PIN pad; it has no
    // sound, and nothing in this feature reaches it.
    const s = dial();
    const phonePad = s.slice(s.indexOf("function PhoneDialPad("));
    assert.ok(phonePad.length > 0, "PhoneDialPad is gone");
    for (const call of ["dialSoundTick", "dialSoundPress", "dialSoundDelete", "dialSoundConfirm"]) {
      assert.ok(!phonePad.includes(call), `${call} reached the PIN pad`);
    }
    // And the sound module knows nothing about values, PINs or auth.
    // Whole words only. "spinning" contains "pin", which is how a check like
    // this quietly becomes a check on nothing once somebody loosens it to get
    // a green run.
    const sound = readSource(SRC);
    for (const word of ["pin", "token", "auth", "password", "credential", "secret"]) {
      assert.ok(
        !new RegExp(`\\b${word}\\b`, "i").test(sound),
        `dialSound.js mentions ${word}`
      );
    }
  });
});
