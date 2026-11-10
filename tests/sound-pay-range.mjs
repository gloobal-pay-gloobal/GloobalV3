// tests/sound-pay-range.mjs — not a test: a report. `node tests/sound-pay-range.mjs`
// prints, per decoder configuration, the quietest microphone level at which
// the chirp still decodes in a simulated living room (0.3 s reverb, speaker
// tilt and distortion, white mic noise at -48 dBFS, 3 plays). Each 6 dB is
// roughly a doubling of distance. Edit `configs` to try a change.
// Sensitivity: the quietest mic level (dBFS) at which >= 95% of plays decode,
// in a living room (reverb 0.3 s, mic noise -48 dBFS), per configuration.
import fs from "node:fs";
const ROOT = new URL("../", import.meta.url).pathname;
const read = (p) => fs.readFileSync(ROOT + p, "utf8");
const S = new Function(read("backend/utils/gloobalPayLink.js") + read("frontend/features/nearby/soundPay.js") +
  `;return { soundPayEncode, soundPaySamples, soundPayListener, set(k, v) { eval(k + " = " + v); } };`)();
const ID = "−+×=○□●■−−−+";
let seed = 7; const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function reverb(x, rate, rt60, wet) {
  const taps = [[0.0031, 0.5], [0.0074, 0.35], [0.0117, 0.25], [0.0193, 0.18], [0.0256, 0.12]];
  const tailLen = Math.round(rt60 * rate); const decay = Math.pow(0.001, 1 / tailLen);
  const out = new Float32Array(x.length + tailLen);
  for (let i = 0; i < x.length; i++) out[i] += x[i];
  for (const [t, g] of taps) { const d = Math.round(t * rate); for (let i = 0; i < x.length; i++) out[i + d] += wet * g * x[i]; }
  const combs = [Math.round(0.0297 * rate), Math.round(0.0371 * rate), Math.round(0.0411 * rate)]; const bufs = combs.map((n) => new Float32Array(n));
  for (let i = 0; i < out.length; i++) { let acc = 0; for (let c = 0; c < 3; c++) { const n = combs[c], b = bufs[c], j = i % n; const y = b[j]; b[j] = (i < x.length ? x[i] : 0) * 0.3 + y * Math.pow(decay, n); acc += y; } out[i] += wet * 0.6 * acc; }
  return out;
}
function speaker(x) { const out = new Float32Array(x.length); let y = 0; for (let i = 0; i < x.length; i++) { y = 0.55 * x[i] + 0.45 * y; out[i] = y + 0.1 * y * y; } return out; }
function trial(level, noise, agc) {
  const rate = 48000;
  const values = S.soundPayEncode({ gloobalId: ID, side: "shop", amount: "" });
  let x = S.soundPaySamples(values, rate, { plays: 3 });
  x = reverb(speaker(x), rate, 0.3, 0.4);
  const y = new Float32Array(x.length + rate);
  let g = 1, env = 0;
  for (let i = 0; i < y.length; i++) {
    const v = (i < x.length ? x[i] : 0) * level;
    env = 0.999 * env + 0.001 * Math.abs(v);
    if (agc) { const want = Math.min(30, 0.1 / Math.max(env, 1e-4)); g += (want - g) * 0.0005; }
    y[i] = v * g + noise * (agc ? g * 0.5 + 0.5 : 1) * gauss();
  }
  const heard = []; const l = S.soundPayListener(rate, (h) => heard.push(h));
  const off = Math.floor(rnd() * 2048);
  for (let i = off; i < y.length; i += 2048) l.push(y.subarray(i, i + 2048));
  return heard.length && heard[0].gloobalId === ID;
}
function threshold(noise, agc, trials = 10) {
  // Walk the level down in 2 dB steps until fewer than 95% decode.
  let db = -10; let last = null;
  for (; db >= -80; db -= 2) {
    const level = Math.pow(10, db / 20); let ok = 0;
    for (let t = 0; t < trials; t++) if (trial(level, noise, agc)) ok++;
    if (ok / trials < 0.9) break; last = db;
  }
  return last;
}
const configs = {
  "C: vol 0.95, clear 2.5, share 0.04, vote 3/6":          { SOUND_PAY_VOLUME: 0.95, SOUND_PAY_CLEAR: 2.5, SOUND_PAY_SHARE: 0.04, SOUND_PAY_VOTE: 3, SOUND_PAY_VOTE_WINDOW: 6 },
  "G: C + block 20 ms, tones 110/15, vote 3/5":            { SOUND_PAY_VOLUME: 0.95, SOUND_PAY_CLEAR: 2.5, SOUND_PAY_SHARE: 0.04, SOUND_PAY_VOTE: 3, SOUND_PAY_VOTE_WINDOW: 5, SOUND_PAY_BLOCK_MS: 20, SOUND_PAY_TONE_MS: 110, SOUND_PAY_GAP_MS: 15 },
  "H: C + block 20 ms, tones 140/20, vote 4/7":            { SOUND_PAY_VOLUME: 0.95, SOUND_PAY_CLEAR: 2.5, SOUND_PAY_SHARE: 0.04, SOUND_PAY_VOTE: 4, SOUND_PAY_VOTE_WINDOW: 7, SOUND_PAY_BLOCK_MS: 20, SOUND_PAY_TONE_MS: 140, SOUND_PAY_GAP_MS: 20 },
};
const noise = Math.pow(10, -48 / 20);
const base = { SOUND_PAY_VOLUME: 0.6, SOUND_PAY_TONE_MS: 70, SOUND_PAY_GAP_MS: 10, SOUND_PAY_BLOCK_MS: 10, SOUND_PAY_CLEAR: 4, SOUND_PAY_SHARE: 0.08, SOUND_PAY_VOTE: 3, SOUND_PAY_VOTE_WINDOW: 0 };
console.log("quietest level that still decodes (dBFS at the mic)");
for (const [name, cfg] of Object.entries(configs)) {
  for (const [k, v] of Object.entries({ ...base, ...cfg })) S.set(k, v);
  const noAgc = threshold(noise, false); const agc = threshold(noise, true);
  console.log(`${String(noAgc).padStart(4)} dB  (AGC on: ${String(agc).padStart(4)} dB)  ${name}`);
}
