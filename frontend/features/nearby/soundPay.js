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
function soundPaySamples(values, sampleRate = SOUND_PAY_RATE_HINT, { plays = SOUND_PAY_PLAYS, volume = 0.6 } = {}) {
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
function soundPayListener(sampleRate, onHeard) {
  const block = Math.max(256, Math.round(sampleRate * 0.01));
  const coeffs = Array.from({ length: SOUND_PAY_TONES }, (_, i) => 2 * Math.cos((2 * Math.PI * soundPayFreq(i)) / sampleRate));
  let buf = new Float32Array(block);
  let fill = 0;
  let run = -1;
  let runLen = 0;
  let accepted = -1;
  let frame = null;
  const power = new Float64Array(SOUND_PAY_TONES);

  const blockSymbol = () => {
    let energy = 0;
    for (let i = 0; i < block; i += 1) energy += buf[i] * buf[i];
    energy /= block;
    if (energy < 1e-6) return -1;
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
    if (best < 0 || bestP < second * 4) return -1;
    if (bestP / (block * block) < energy * 0.08) return -1;
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

  const step = () => {
    const sym = blockSymbol();
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

var soundPayAudioContext = null;
function soundPayContext() {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  if (!soundPayAudioContext || soundPayAudioContext.state === "closed") soundPayAudioContext = new Ctx();
  return soundPayAudioContext;
}

// Plays the ID (and amount). Resolves when the last play has finished, or
// false if this phone cannot play sound from a web page.
async function soundPayPlay({ gloobalId, side, amount }) {
  const values = soundPayEncode({ gloobalId, side, amount });
  const ctx = soundPayContext();
  if (!values || !ctx) return false;
  if (ctx.state === "suspended") await ctx.resume();
  const samples = soundPaySamples(values, ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  return new Promise((resolve) => {
    src.onended = () => resolve(true);
    src.start();
  });
}

// Listens on the microphone until an ID is heard or `timeoutMs` passes.
// Returns { stop, done }, where done resolves to the heard
// { gloobalId, side, amount }, or null (timed out / stopped), and rejects if
// the microphone could not be opened.
function soundPayListen({ timeoutMs = 20000 } = {}) {
  let stopFn = () => {};
  const done = (async () => {
    const ctx = soundPayContext();
    if (!ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no_microphone");
    if (ctx.state === "suspended") await ctx.resume();
    // Echo cancelling, noise suppression and automatic gain are made for
    // voices and treat a steady tone as noise to remove; all three off.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    return new Promise((resolve) => {
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(2048, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      let finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { node.disconnect(); source.disconnect(); sink.disconnect(); } catch (e) { /* already gone */ }
        stream.getTracks().forEach((t) => t.stop());
        resolve(result);
      };
      const listener = soundPayListener(ctx.sampleRate, (heard) => finish(heard));
      node.onaudioprocess = (e) => listener.push(e.inputBuffer.getChannelData(0));
      source.connect(node);
      // A ScriptProcessor only runs while connected to the output; through
      // a silent gain so nothing is heard.
      node.connect(sink);
      sink.connect(ctx.destination);
      const timer = setTimeout(() => finish(null), timeoutMs);
      stopFn = () => finish(null);
    });
  })();
  return { stop: () => stopFn(), done };
}
