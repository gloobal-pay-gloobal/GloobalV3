// tests/sound-pay.test.mjs
//
// Pay nearby by sound (frontend/features/nearby/soundPay.js): the signal the
// speaker plays is the signal the listener decodes, through noise, a quieter
// copy, a different sample rate, and a cut-off start; and a damaged signal
// decodes to nothing rather than to someone else.
//
//   node --test tests/sound-pay.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const S = new Function(
  read("backend/utils/gloobalPayLink.js") + read("frontend/features/nearby/soundPay.js") +
  ";return { soundPayEncode, soundPayDecodeValues, soundPaySamples, soundPayListener, soundPayToUrl, SOUND_PAY_REPEAT, SOUND_PAY_START, SOUND_PAY_END };"
)();

const ID = "−+×=○□●■−−−+";
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

function hear(samples, rate, chunk = 2048) {
  const heard = [];
  const l = S.soundPayListener(rate, (h) => heard.push(h));
  for (let i = 0; i < samples.length; i += chunk) l.push(samples.subarray(i, i + chunk));
  return heard;
}

test("no two tones in a row are equal, even for three equal values", () => {
  const v = S.soundPayEncode({ gloobalId: "−−−−−−−−−−−−", side: "either", amount: "1000" });
  for (let i = 1; i < v.length; i += 1) assert.notEqual(v[i], v[i - 1], `tone ${i}`);
  assert.deepEqual(S.soundPayDecodeValues(v.slice(1, -1)), { gloobalId: "−−−−−−−−−−−−", side: "either", amount: "1000" });
});

test("ID, side and amount survive the round trip; a URL like the QR's comes out", () => {
  for (const [side, amount] of [["person", ""], ["shop", "250"], ["either", "99.5"], ["person", "1234567.25"]]) {
    const v = S.soundPayEncode({ gloobalId: ID, side, amount });
    assert.deepEqual(S.soundPayDecodeValues(v.slice(1, -1)), { gloobalId: ID, side, amount });
  }
  assert.equal(S.soundPayToUrl({ gloobalId: ID, side: "shop" }), "https://gloobalv3.netlify.app/s/012345670001");
});

test("refuses what it should: not an ID, a bad amount, a damaged frame", () => {
  assert.equal(S.soundPayEncode({ gloobalId: "ABC", side: "person" }), null);
  assert.equal(S.soundPayEncode({ gloobalId: ID, side: "person", amount: "12abc" }), null);
  const v = S.soundPayEncode({ gloobalId: ID, side: "person", amount: "50" }).slice(1, -1);
  for (let i = 0; i < v.length; i += 1) {
    const bad = v.slice();
    bad[i] = bad[i] === 3 ? 4 : 3;
    const out = S.soundPayDecodeValues(bad);
    assert.ok(out === null || (out.gloobalId === ID && out.amount === "50"), `one changed tone at ${i} never names someone else`);
  }
});

test("the played sound decodes, at 48 kHz and 44.1 kHz, quiet and with noise", () => {
  for (const rate of [48000, 44100]) {
    for (const [gain, noiseLevel] of [[1, 0], [0.15, 0.03], [0.5, 0.12]]) {
      const v = S.soundPayEncode({ gloobalId: ID, side: "shop", amount: "75.50" });
      const s = S.soundPaySamples(v, rate);
      for (let i = 0; i < s.length; i += 1) s[i] = s[i] * gain + noise() * noiseLevel;
      const heard = hear(s, rate);
      assert.ok(heard.length >= 2, `${rate} Hz, gain ${gain}, noise ${noiseLevel}: heard ${heard.length} of 3`);
      assert.deepEqual(heard[0], { gloobalId: ID, side: "shop", amount: "75.50" });
    }
  }
});

test("starting to listen halfway through still hears a later play", () => {
  const rate = 48000;
  const s = S.soundPaySamples(S.soundPayEncode({ gloobalId: ID, side: "person" }), rate);
  const heard = hear(s.subarray(Math.round(s.length / 5)), rate);
  assert.ok(heard.length >= 1);
  assert.equal(heard[0].gloobalId, ID);
});

test("silence and plain noise are never heard as anyone", () => {
  const rate = 48000;
  const s = new Float32Array(rate * 6);
  for (let i = 0; i < s.length; i += 1) s[i] = noise() * 0.3;
  assert.deepEqual(hear(s, rate), []);
  assert.deepEqual(hear(new Float32Array(rate * 3), rate), []);
});

test("the sound carries the CURRENT ID: the sheet reads the same state an ID change writes", () => {
  // App: an ID change sets secureId; the Dashboard gets it as myGloobalId;
  // the Earn sheet plays myGloobalId. No copy of the old ID in between.
  const app = fs.readFileSync(new URL("../frontend/App.jsx", import.meta.url), "utf8");
  const dash = fs.readFileSync(new URL("../frontend/screens/Dashboard/Dashboard.jsx", import.meta.url), "utf8");
  assert.match(app, /const handleGloobalIdChanged = \(newSymbolId\) => \{[\s\S]{0,400}setSecureId\(newSymbolId\);/);
  assert.match(app, /myGloobalId=\{secureId\}/);
  assert.match(dash, /<EarnSheet\s+gloobalId=\{myGloobalId\}/);
  // And the payer never trusts the sound for a name: the heard ID goes down
  // the QR path, which looks the ID up on the server.
  assert.match(app, /const handleSoundHeard = \(heard\) => \{[\s\S]{0,500}handleQrScanned\(url, \{ amount: heard\.amount \|\| "" \}\);/);
});
