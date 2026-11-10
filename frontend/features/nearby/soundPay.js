// src/features/nearby/soundPay.js
//
// ── PAY NEARBY BY SOUND ─────────────────────────────────────────────────
//
// The receiver's phone plays its Gloobal ID (and an amount, if they set one)
// as a short chirp; the payer's phone hears it and opens the same payee card
// a QR scan opens. Nothing is paid by the sound: it only says WHO to pay.
// The payment itself is the ordinary one, through the server, confirmed with
// PIN or fingerprint.
//
// Sound because it is the one way two phones near each other can talk from
// a web app on every phone: browsers give a page Bluetooth and NFC only for
// accessories, not phone to phone, and not at all on iPhone.
//
// THE SIGNAL. One tone at a time, each 70 ms with a 10 ms gap, picked from
// 19 frequencies 200 Hz apart between 1.8 and 5.4 kHz: audible, and inside
// what every phone speaker and microphone handles.
//
//   START  side  id × 12  [amount characters]  check × 2  END
//
//   side     0 either, 1 person, 2 shop (the QR's p / u / s)
//   id       the twelve symbols as their index, 0–7 (as the QR's digits)
//   amount   0–9, and 10 for the decimal point; absent for "any amount"
//   check    an 8-bit checksum of everything before it, as two values 0–15
//
// A tone equal to the one before it is sent as REPEAT instead, so the
// listener never has to count how long one tone lasted. A frame that fails
// its checksum, or names something that is not a Gloobal ID, is dropped:
// a misheard sound opens nothing rather than the wrong person.
//
// The whole frame is about two seconds; it is played three times.

var SOUND_PAY_RATE_HINT = 48000;
var SOUND_PAY_BASE_HZ = 1800;
var SOUND_PAY_STEP_HZ = 200;
var SOUND_PAY_START = 16;
var SOUND_PAY_END = 17;
var SOUND_PAY_REPEAT = 18;
var SOUND_PAY_TONES = 19;
var SOUND_PAY_TONE_MS = 70;
var SOUND_PAY_GAP_MS = 10;
var SOUND_PAY_PLAYS = 3;
var SOUND_PAY_PLAY_GAP_MS = 350;
var SOUND_PAY_SIDES = ["either", "person", "shop"];
var SOUND_PAY_MAX_AMOUNT_CHARS = 10; // 7 digits, the point, 2 decimals

function soundPayFreq(i) {
  return SOUND_PAY_BASE_HZ + SOUND_PAY_STEP_HZ * i;
}

function soundPayChecksum(values) {
  // CRC-8 (polynomial 0x07) over the values, one byte each.
  let crc = 0;
  for (const v of values) {
    crc ^= v & 0xff;
    for (let b = 0; b < 8; b += 1) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

// "250", "99.5" → the amount as typed, or "" for none. Anything else → null.
function soundPayCleanAmount(amount) {
  if (amount === undefined || amount === null || amount === "") return "";
  const s = String(amount).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  if (!(Number(s) > 0)) return "";
  return s;
}

// { gloobalId, side, amount } → the values to play (START…END), or null.
function soundPayEncode({ gloobalId, side = "either", amount = "" } = {}) {
  if (typeof isGloobalPayId !== "function" || !isGloobalPayId(gloobalId)) return null;
  const sideIndex = SOUND_PAY_SIDES.indexOf(side);
  const amountText = soundPayCleanAmount(amount);
  if (sideIndex < 0 || amountText === null) return null;
  const body = [sideIndex];
  for (const c of Array.from(gloobalId)) body.push(GLOOBAL_PAY_SYMBOLS.indexOf(c));
  for (const c of amountText) body.push(c === "." ? 10 : Number(c));
  const crc = soundPayChecksum(body);
  body.push(crc >> 4, crc & 15);
  // No tone may equal the one before it on the wire: a value equal to the
  // last VALUE goes as REPEAT, unless REPEAT was the last tone, in which case
  // the value itself differs from it and goes as is.
  const out = [SOUND_PAY_START];
  let prevValue = -1;
  for (const v of body) {
    const wire = v === prevValue && out[out.length - 1] !== SOUND_PAY_REPEAT ? SOUND_PAY_REPEAT : v;
    out.push(wire);
    prevValue = v;
  }
  out.push(SOUND_PAY_END);
  return out;
}

// The values between START and END → { gloobalId, side, amount }, or null.
function soundPayDecodeValues(values) {
  if (!Array.isArray(values) || values.length < 1 + 12 + 2) return null;
  const body = [];
  for (const v of values) {
    if (v === SOUND_PAY_REPEAT) {
      if (!body.length) return null;
      body.push(body[body.length - 1]);
    } else if (v >= 0 && v <= 15) {
      body.push(v);
    } else {
      return null;
    }
  }
  const crc = (body[body.length - 2] << 4) | body[body.length - 1];
  const data = body.slice(0, -2);
  if (soundPayChecksum(data) !== crc) return null;
  const side = SOUND_PAY_SIDES[data[0]];
  const idDigits = data.slice(1, 13);
  const amountValues = data.slice(13);
  if (!side || idDigits.length !== 12 || idDigits.some((d) => d > 7)) return null;
  if (amountValues.length > SOUND_PAY_MAX_AMOUNT_CHARS || amountValues.some((d) => d > 10)) return null;
  const gloobalId = idDigits.map((d) => GLOOBAL_PAY_SYMBOLS[d]).join("");
  const amount = soundPayCleanAmount(amountValues.map((d) => (d === 10 ? "." : String(d))).join(""));
  if (amount === null) return null;
  return { gloobalId, side, amount };
}

// The same thing a QR carries, so a heard ID goes down the scan path.
function soundPayToUrl(heard) {
  return heard && typeof buildGloobalPayUrl === "function" ? buildGloobalPayUrl(heard.gloobalId, heard.side) : null;
}

// The signal as audio samples, played SOUND_PAY_PLAYS times. One generator
// for the speaker and for the tests, so what is tested is what is played.
// The decoder's knobs, tunable so the range can be measured (tests/sound-pay-range):
//   BLOCK_MS  how long each analysis block is; longer = more energy per
//             decision (+3 dB per doubling), fewer decisions per tone
//   CLEAR     how far the winning tone's power must stand above the
//             runner-up's; the CRC and the START/END frame catch a wrong
//             symbol that slips past a smaller margin
//   SHARE     the share of the block's energy the winner must carry
// Range (tests/sound-pay-range.mjs, a simulated room): from the first
// settings (volume 0.6, margin 4×, three blocks in a row, auto-gain off)
// to these (0.95, 2.5×, a 3-of-6 vote, auto-gain on) the quietest signal
// that still decodes went from −42 to −56 dBFS: 14 dB, about three to
// four times the distance. Longer tones and longer blocks did not help.
var SOUND_PAY_BLOCK_MS = 10;
var SOUND_PAY_CLEAR = 2.5;
var SOUND_PAY_SHARE = 0.04;
var SOUND_PAY_VOLUME = 0.95;
//   VOTE / VOTE_WINDOW  a tone counts once it has won VOTE of the last
//             VOTE_WINDOW blocks (0 = three in a row, the older rule)
var SOUND_PAY_VOTE = 3;
var SOUND_PAY_VOTE_WINDOW = 6;
function soundPaySamples(values, sampleRate = SOUND_PAY_RATE_HINT, { plays = SOUND_PAY_PLAYS, volume = SOUND_PAY_VOLUME } = {}) {
  const tone = Math.round((SOUND_PAY_TONE_MS / 1000) * sampleRate);
  const gap = Math.round((SOUND_PAY_GAP_MS / 1000) * sampleRate);
  const between = Math.round((SOUND_PAY_PLAY_GAP_MS / 1000) * sampleRate);
  const fade = Math.round(0.006 * sampleRate);
  const one = values.length * (tone + gap);
  const out = new Float32Array(plays * one + (plays - 1) * between + between);
  let at = 0;
  for (let p = 0; p < plays; p += 1) {
    for (const v of values) {
      const w = (2 * Math.PI * soundPayFreq(v)) / sampleRate;
      for (let i = 0; i < tone; i += 1) {
        const env = Math.min(1, i / fade, (tone - 1 - i) / fade);
        out[at + i] = volume * env * Math.sin(w * i);
      }
      at += tone + gap;
    }
    at += between;
  }
  return out;
}

// ── LISTENING ───────────────────────────────────────────────────────────
//
// Feed it samples as they arrive (any chunk size). It looks at 10 ms blocks,
// measures the 19 tones in each (Goertzel), and keeps the loudest when it
// clearly stands out from the rest and from silence. A tone counts once it
// has held for three blocks; START opens a frame, END closes it, and the
// frame is decoded. `onHeard` is called with { gloobalId, side, amount }.
function soundPayListener(sampleRate, onHeard, onLevel) {
  const block = Math.max(256, Math.round(sampleRate * (SOUND_PAY_BLOCK_MS / 1000)));
  const coeffs = Array.from({ length: SOUND_PAY_TONES }, (_, i) => 2 * Math.cos((2 * Math.PI * soundPayFreq(i)) / sampleRate));
  let buf = new Float32Array(block);
  let fill = 0;
  let run = -1;
  let runLen = 0;
  let accepted = -1;
  const recent = [];
  let frame = null;
  const power = new Float64Array(SOUND_PAY_TONES);

  const blockSymbol = () => {
    let energy = 0;
    for (let i = 0; i < block; i += 1) energy += buf[i] * buf[i];
    energy /= block;
    lastEnergy = energy;
    // −80 dBFS. With auto-gain off, a phone a metre away can arrive near
    // −60 dBFS; the old floor (−60) threw those blocks away as silence.
    if (energy < 1e-8) return -1;
    let best = -1;
    let bestP = 0;
    let second = 0;
    for (let k = 0; k < SOUND_PAY_TONES; k += 1) {
      let s1 = 0;
      let s2 = 0;
      const c = coeffs[k];
      for (let i = 0; i < block; i += 1) {
        const s0 = buf[i] + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const p = s1 * s1 + s2 * s2 - c * s1 * s2;
      power[k] = p;
      if (p > bestP) { second = bestP; bestP = p; best = k; } else if (p > second) { second = p; }
    }
    // The winner has to stand clear of the runner-up and carry a fair share
    // of the block's energy; otherwise it is noise or a gap.
    if (best < 0 || bestP < second * SOUND_PAY_CLEAR) return -1;
    if (bestP / (block * block) < energy * SOUND_PAY_SHARE) return -1;
    return best;
  };

  const accept = (sym) => {
    if (sym === SOUND_PAY_START) { frame = []; return; }
    if (!frame) return;
    if (sym === SOUND_PAY_END) {
      const heard = soundPayDecodeValues(frame);
      frame = null;
      if (heard) onHeard(heard);
      return;
    }
    frame.push(sym);
    if (frame.length > 1 + 12 + SOUND_PAY_MAX_AMOUNT_CHARS + 2) frame = null;
  };

  let lastEnergy = 0;
  let blocks = 0;
  const step = () => {
    const sym = blockSymbol();
    // Every 5th block (50 ms): how loud, and which tone if any — for the
    // meter under "Listening…", so a phone that hears nothing says so.
    blocks += 1;
    if (onLevel && blocks % 5 === 0) onLevel({ level: Math.sqrt(lastEnergy), tone: sym });
    if (SOUND_PAY_VOTE_WINDOW > 0) {
      // A vote over the last few blocks: a tone counts once it has won
      // SOUND_PAY_VOTE of the last SOUND_PAY_VOTE_WINDOW blocks, in any
      // order. A faint tone that noise knocks out for one block in the
      // middle still counts, where three-in-a-row would have lost it.
      recent.push(sym);
      if (recent.length > SOUND_PAY_VOTE_WINDOW) recent.shift();
      if (sym >= 0 && sym !== accepted) {
        let n = 0;
        for (let i = 0; i < recent.length; i += 1) if (recent[i] === sym) n += 1;
        if (n >= SOUND_PAY_VOTE) { accepted = sym; accept(sym); }
      }
      return;
    }
    if (sym === run) {
      runLen += 1;
    } else {
      run = sym;
      runLen = 1;
    }
    // Two tones in a row are never equal on the wire, so a tone that dips
    // and comes back is still one tone: count a symbol only when it changes.
    if (runLen === 3 && sym >= 0 && sym !== accepted) {
      accepted = sym;
      accept(sym);
    }
  };

  return {
    push(samples) {
      for (let i = 0; i < samples.length; i += 1) {
        buf[fill++] = samples[i];
        if (fill === block) {
          step();
          fill = 0;
        }
      }
    }
  };
}

// ── THE PHONE'S SPEAKER AND MICROPHONE ──────────────────────────────────
//
// What goes wrong on a real phone is rarely the signal; it is the browser:
//
//   - A browser will not start audio until the page has had a tap. The
//     AudioContext is made and resumed INSIDE the tap (soundPayUnlock, from
//     the Play / Pay / Listen buttons), never later from an effect.
//   - On iPhone the hardware sample rate changes when the microphone opens,
//     and an AudioContext made before that goes silent. Listening makes a
//     fresh context AFTER getUserMedia, and closes it when done.
//   - On iPhone the silent switch mutes Web Audio but not <audio> elements,
//     so playback goes through an <audio> element there.
//   - A microphone track the system takes away (another app, the camera on
//     an older iPhone) ends silently; that is reported, not waited on.

var soundPayAudioContext = null;
function soundPayContext() {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  if (!soundPayAudioContext || soundPayAudioContext.state === "closed") soundPayAudioContext = new Ctx();
  return soundPayAudioContext;
}

function soundPayIsApple() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Call from a tap handler. Makes the context, resumes it and plays one
// silent sample, which is what unlocks audio on iPhone and Android alike.
// Also readies the <audio> element used for playback on iPhone.
var soundPayMediaEl = null;
function soundPayUnlock() {
  const ctx = soundPayContext();
  if (!ctx) return null;
  try {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) { /* best effort */ }
  if (soundPayIsApple() && typeof document !== "undefined" && !soundPayMediaEl) {
    try {
      const el = document.createElement("audio");
      el.setAttribute("playsinline", "");
      el.autoplay = true;
      el.muted = false;
      soundPayMediaEl = el;
    } catch (e) { /* no element */ }
  }
  return ctx;
}

// Waits (up to `ms`) for the context to actually run.
async function soundPayRunning(ctx, ms = 1500) {
  if (ctx.state === "running") return true;
  try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, ms))]); } catch (e) { /* locked */ }
  if (ctx.state === "running") return true;
  await new Promise((r) => setTimeout(r, 150));
  return ctx.state === "running";
}

// Plays the ID (and amount). Resolves true when the last play has finished,
// or false if this phone cannot play sound from a web page (or audio is
// still locked: no tap has reached it yet).
async function soundPayPlay({ gloobalId, side, amount }) {
  const values = soundPayEncode({ gloobalId, side, amount });
  const ctx = soundPayUnlock();
  if (!values || !ctx) return false;
  if (!(await soundPayRunning(ctx))) return false;
  const samples = soundPaySamples(values, ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  let viaElement = false;
  if (soundPayMediaEl && typeof ctx.createMediaStreamDestination === "function") {
    // iPhone: through an <audio> element, which the silent switch does
    // not mute. If the element will not play, fall back to the speaker
    // output directly.
    try {
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      soundPayMediaEl.srcObject = dest.stream;
      await soundPayMediaEl.play();
      viaElement = true;
    } catch (e) {
      try { src.disconnect(); } catch (e2) { /* nothing connected */ }
    }
  }
  if (!viaElement) src.connect(ctx.destination);
  return new Promise((resolve) => {
    src.onended = () => {
      if (viaElement) { try { soundPayMediaEl.pause(); soundPayMediaEl.srcObject = null; } catch (e) { /* gone */ } }
      resolve(true);
    };
    src.start();
  });
}

// Listens on the microphone until an ID is heard or `timeoutMs` passes.
// Returns { stop, done, level }, where done resolves to the heard
// { gloobalId, side, amount }, or null (timed out / stopped), and rejects
// with Error("no_microphone" | "audio_locked" | "mic_lost") when it could
// not listen at all. `onLevel({ level, tone })` is called every 50 ms while
// listening; `stats()` says what was heard overall.
function soundPayListen({ timeoutMs = 20000, onLevel } = {}) {
  let stopFn = () => {};
  const stats = { blocks: 0, loud: 0, tones: 0, peak: 0 };
  const done = (async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no_microphone");
    // Echo cancelling and noise suppression are made for voices and treat
    // a steady tone as noise to remove: both off. Automatic gain is ON: it
    // lifts a faint chirp from a phone a few metres away (worth ~6 dB in
    // the room simulation), and the decoder's margin tests are relative,
    // so the louder noise floor it brings costs nothing.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
    });
    // A FRESH context, made after the microphone is open (iPhone changes
    // the hardware rate when it opens; the shared context would go quiet).
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let ctx = new Ctx();
    let shared = false;
    if (!(await soundPayRunning(ctx))) {
      // Made outside a tap, a new context can stay locked. The shared one
      // was unlocked by the tap that brought us here: use that instead.
      try { ctx.close(); } catch (e) { /* already */ }
      ctx = soundPayContext();
      shared = true;
      if (!ctx || !(await soundPayRunning(ctx, 800))) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("audio_locked");
      }
    }
    return new Promise((resolve, reject) => {
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(2048, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      let finished = false;
      const finish = (result, error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { node.disconnect(); source.disconnect(); sink.disconnect(); } catch (e) { /* already gone */ }
        stream.getTracks().forEach((t) => t.stop());
        if (!shared) { try { ctx.close(); } catch (e) { /* already */ } }
        if (error) reject(error); else resolve(result);
      };
      const listener = soundPayListener(ctx.sampleRate, (heard) => finish(heard), (lv) => {
        stats.blocks += 1;
        if (lv.level > 0.002) stats.loud += 1;
        if (lv.tone >= 0) stats.tones += 1;
        if (lv.level > stats.peak) stats.peak = lv.level;
        if (onLevel) onLevel(lv);
      });
      node.onaudioprocess = (e) => listener.push(e.inputBuffer.getChannelData(0));
      source.connect(node);
      // A ScriptProcessor only runs while connected to the output; through
      // a silent gain so nothing is heard.
      node.connect(sink);
      sink.connect(ctx.destination);
      // The system took the microphone away (another app, or the camera on
      // an older iPhone): say so rather than listen to nothing.
      stream.getTracks().forEach((t) => { t.onended = () => finish(null, new Error("mic_lost")); });
      const timer = setTimeout(() => finish(null), timeoutMs);
      stopFn = () => finish(null);
    });
  })();
  return { stop: () => stopFn(), done, stats: () => stats };
}

// One phone, speaker to its own microphone: the whole chain on the device
// in hand, so "does this phone's sound pay work?" has an answer without a
// second phone. Resolves { ok, heard, stats, error }.
async function soundPaySelfTest({ gloobalId, side = "either" } = {}) {
  const session = soundPayListen({ timeoutMs: 9000 });
  let error = null;
  // Give the microphone a moment to open before playing.
  const played = new Promise((r) => setTimeout(r, 700)).then(() => soundPayPlay({ gloobalId, side, amount: "" }));
  let heard = null;
  try { heard = await session.done; } catch (e) { error = e && e.message; }
  const didPlay = await played;
  if (!didPlay && !error) error = "no_speaker";
  const stats = session.stats();
  return { ok: Boolean(heard && heard.gloobalId === gloobalId), heard, stats, error };
}

// ── YOUR LINE: A HUMAN VOICE BEFORE THE CHIRP ───────────────────────────
//
// The founder, 10 Nov: sound pay is the rare case, so make it human, not a
// ringtone — "I tap 100 CEL and Play, and what comes is what I have
// decided, like: arre bhai, thoda jaldi bhej". So before the chirp the
// phone says the receiver's own line: one they picked, typed (spoken by
// the phone's voice), or recorded in their own voice. The line is for the
// people; the chirp after it is still what the other phone reads.
//
// Kept on this phone only (localStorage): { on, text, clip } where clip is
// a recorded data: URL, at most a few seconds.
var SOUND_PAY_LINE_KEY = "gloobal.soundPayLine";
var SOUND_PAY_LINE_PRESETS = ["Arre bhai, thoda jaldi bhej", "Chalo, bhej do", "Paise bhej do, please", "Payment, please"];
var SOUND_PAY_LINE_MAX_TEXT = 60;
var SOUND_PAY_LINE_MAX_MS = 5000;
var SOUND_PAY_LINE_MAX_CLIP = 400000; // characters of data: URL

function soundPayLineLoad() {
  const base = { on: true, text: SOUND_PAY_LINE_PRESETS[0], clip: "" };
  try {
    const raw = JSON.parse(localStorage.getItem(SOUND_PAY_LINE_KEY) || "null");
    if (!raw || typeof raw !== "object") return base;
    return {
      on: raw.on !== false,
      text: typeof raw.text === "string" ? raw.text.slice(0, SOUND_PAY_LINE_MAX_TEXT) : base.text,
      clip: typeof raw.clip === "string" && raw.clip.startsWith("data:audio/") ? raw.clip : ""
    };
  } catch (e) {
    return base;
  }
}
function soundPayLineSave(line) {
  try { localStorage.setItem(SOUND_PAY_LINE_KEY, JSON.stringify({ on: line.on !== false, text: String(line.text || "").slice(0, SOUND_PAY_LINE_MAX_TEXT), clip: line.clip || "" })); return true; } catch (e) { return false; }
}

// Says the line and resolves when it has finished (or cannot be said, or
// has taken too long: the chirp must never wait on a voice that hangs).
// Call it inside the tap, before any await, so the browser lets it sound.
function soundPaySayLine(line) {
  if (!line || line.on === false) return Promise.resolve(false);
  const text = String(line.text || "").trim();
  return new Promise((resolve) => {
    let done = false;
    const finish = (said) => { if (!done) { done = true; clearTimeout(timer); resolve(said); } };
    let timer = setTimeout(() => finish(false), line.clip ? SOUND_PAY_LINE_MAX_MS + 1500 : Math.min(7000, 1500 + text.length * 110));
    try {
      if (line.clip && typeof Audio !== "undefined") {
        const a = new Audio(line.clip);
        a.onended = () => finish(true);
        a.onerror = () => finish(false);
        const p = a.play();
        if (p && p.catch) p.catch(() => finish(false));
        return;
      }
      if (text && typeof window !== "undefined" && window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
        const u = new SpeechSynthesisUtterance(text);
        // Devanagari is read by a Hindi voice; Latin letters (English or
        // Hinglish) by an Indian-English one, which says "bhai" as written.
        u.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
        u.rate = 1;
        u.onend = () => finish(true);
        u.onerror = () => finish(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        return;
      }
    } catch (e) { /* cannot speak here */ }
    finish(false);
  });
}

// Records the receiver's own voice for the line: up to five seconds.
// Returns { stop, done } where done resolves to a data: URL, or rejects
// (no microphone, no recorder, or a clip too large to keep).
function soundPayRecordLine() {
  let stopFn = () => {};
  const done = (async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof MediaRecorder === "undefined") throw new Error("no_recorder");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new Promise((resolve, reject) => {
      const chunks = [];
      const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = () => { stream.getTracks().forEach((t) => t.stop()); reject(new Error("record_failed")); };
      rec.onstop = () => {
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result || "");
          if (!url.startsWith("data:audio/") || url.length > SOUND_PAY_LINE_MAX_CLIP) reject(new Error("clip_too_large"));
          else resolve(url);
        };
        reader.onerror = () => reject(new Error("record_failed"));
        reader.readAsDataURL(blob);
      };
      const timer = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, SOUND_PAY_LINE_MAX_MS);
      stopFn = () => { if (rec.state !== "inactive") rec.stop(); };
      rec.start();
    });
  })();
  return { stop: () => stopFn(), done };
}
