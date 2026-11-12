// The Creator payment sound: a Web Audio chime, then the amount spoken.
//
//   node --test tests/payment-chime.test.mjs
//
// features/creator/paymentChime.js is evaluated on its own against a fake
// window that records what the Web Audio graph and the voice were asked to
// do. Then the wiring in App.jsx, the Creator profile and the service worker
// is checked in the source, the same way the other app tests do.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "frontend/features/creator/paymentChime.js"), "utf8");

function load({ language = "en-IN", withVoice = true, withAudio = true } = {}) {
  const log = { notes: [], slides: [], spoken: [], rates: [], clips: [], listeners: {} };
  class FakeParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class FakeContext {
    constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = "running"; return Promise.resolve(); }
    createGain() { return { gain: new FakeParam(), connect() {} }; }
    createOscillator() {
      const osc = {
        type: "", connect() {}, stop() {},
        frequency: {
          setValueAtTime: (f) => { osc.f = f; },
          exponentialRampToValueAtTime: (f) => { osc.to = f; },
        },
        start: () => { log.notes.push(osc.f); if (osc.to) log.slides.push([osc.f, osc.to]); },
      };
      return osc;
    }
  }
  class FakeUtterance { constructor(text) { this.text = text; } }
  const window = {
    addEventListener: (name, fn) => { log.listeners[name] = fn; },
    removeEventListener: () => {},
    speechSynthesis: withVoice
      ? {
        getVoices: () => [],
        speak: (u) => {
          if (u.text.trim()) { log.spoken.push({ text: u.text, lang: u.lang }); log.rates.push(u.rate); }
          setTimeout(() => u.onend && u.onend(), 1);
        },
      }
      : undefined,
  };
  if (withAudio) window.AudioContext = FakeContext;
  const navigator = { language };
  // The phone's own storage, where the shop's announcement line is kept.
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  // A player for the shop's audio clip: records what it was given.
  class FakeAudio {
    constructor(src) { this.src = src; }
    play() { log.clips.push(this.src); setTimeout(() => this.onended && this.onended(), 1); return Promise.resolve(); }
    pause() {}
  }
  const factory = new Function(
    "window", "navigator", "SpeechSynthesisUtterance", "setTimeout", "localStorage", "Audio",
    `${SOURCE}
     return { gloobalSetPaymentSoundEnabled, gloobalPlayPaymentChime, gloobalChimeSentence, gloobalMarkChimePlayed, gloobalChimeUnlock, gloobalPlayRoleSwitchSound,
              gloobalPaymentLineLoad, gloobalPaymentLineSave, gloobalPaymentLineSentence, gloobalPreviewPaymentLine, GLOOBAL_PAYMENT_LINE_PRESETS,
              gloobalPaymentClipLoad, gloobalPaymentClipSave,
              gloobalPaymentSoundPrefs, gloobalPaymentSoundPrefsSave, gloobalPreviewPaymentSound };`
  );
  // setTimeout shortened so the 650 ms chime wait does not slow the test.
  const fast = (fn, ms) => setTimeout(fn, Math.min(ms, 5));
  const api = factory(window, navigator, withVoice ? FakeUtterance : undefined, fast, localStorage, FakeAudio);
  return { api, log };
}

test("a confirmed payment plays the two-note chime, then says the amount", async () => {
  const { api, log } = load();
  await api.gloobalPlayPaymentChime({ txnId: "T1", amount: 500, currency: "INR" });
  assert.deepEqual(log.notes, [1046.5, 2093, 1568, 3136], "C6 and G6, each with its octave");
  assert.equal(log.spoken.length, 1);
  assert.match(log.spoken[0].text, /^Received 500 Indian rupees$/);
  assert.equal(log.spoken[0].lang, "en-IN");
});

test("each payment is announced once, however many times it is read", async () => {
  const { api, log } = load();
  await api.gloobalPlayPaymentChime({ txnId: "T2", amount: 20, currency: "USD" });
  await api.gloobalPlayPaymentChime({ txnId: "T2", amount: 20, currency: "USD" });
  assert.equal(log.spoken.length, 1);
});

test("payments already there when the app opened stay silent", async () => {
  const { api, log } = load();
  api.gloobalMarkChimePlayed("OLD");
  await api.gloobalPlayPaymentChime({ txnId: "OLD", amount: 99, currency: "INR" });
  assert.equal(log.spoken.length, 0);
  assert.equal(log.notes.length, 0);
});

test("two payments together are announced one after the other, in order", async () => {
  const { api, log } = load({ language: "en-US" });
  api.gloobalPlayPaymentChime({ txnId: "A", amount: 12.5, currency: "USD" });
  await api.gloobalPlayPaymentChime({ txnId: "B", amount: 3, currency: "USD" });
  assert.deepEqual(log.spoken.map((s) => s.text), ["Received 12.50 US dollars", "Received 3 US dollars"]);
});

test("the switch turns it off completely", async () => {
  const { api, log } = load();
  api.gloobalSetPaymentSoundEnabled(false);
  await api.gloobalPlayPaymentChime({ txnId: "T3", amount: 500, currency: "INR" });
  assert.equal(log.notes.length + log.spoken.length, 0);
  api.gloobalSetPaymentSoundEnabled(true);
  await api.gloobalPlayPaymentChime({ txnId: "T4", amount: 500, currency: "INR" });
  assert.equal(log.spoken.length, 1);
});

test("a Hindi phone hears Hindi", () => {
  const { api } = load({ language: "hi-IN" });
  const s = api.gloobalChimeSentence(500, "INR", "hi-IN");
  assert.equal(s.lang, "hi-IN");
  assert.match(s.text, /प्राप्त हुए$/);
});

test("no voice on the device: the chime still plays", async () => {
  const { api, log } = load({ withVoice: false });
  await api.gloobalPlayPaymentChime({ txnId: "T5", amount: 5, currency: "INR" });
  assert.equal(log.notes.length, 4);
});

test("no Web Audio on the device: the amount is still spoken", async () => {
  const { api, log } = load({ withAudio: false });
  await api.gloobalPlayPaymentChime({ txnId: "T6", amount: 5, currency: "INR" });
  assert.equal(log.spoken.length, 1);
});

test("the first touch anywhere unlocks sound", () => {
  const { log } = load();
  assert.equal(typeof log.listeners.pointerdown, "function");
  assert.equal(typeof log.listeners.touchstart, "function");
});

test("App.jsx plays it only for confirmed payments to the creator name, read from the server", () => {
  const app = readFileSync(join(ROOT, "frontend/App.jsx"), "utf8");
  const block = app.slice(app.indexOf("news.forEach((entry) => {"), app.indexOf("} catch (e) {", app.indexOf("news.forEach((entry) => {")));
  assert.match(block, /entry\.creatorHandle && confirmed/);
  assert.match(block, /gloobalPlayPaymentChime\(\{ txnId: entry\.txnId/);
  assert.match(app, /gloobalSetPaymentSoundEnabled\(paymentSoundOn\)/);
  assert.match(app, /data\.type === "gloobal:push-arrived"[\s\S]{0,80}setReceivedPollToken/);
});

test("the Creator profile has the switch, saved to the account", () => {
  const panel = readFileSync(join(ROOT, "frontend/features/creator/CreatorSetupScreen.jsx"), "utf8");
  assert.match(panel, /label="Sounds"/);
  const dash = readFileSync(join(ROOT, "frontend/screens/Dashboard/Dashboard.jsx"), "utf8");
  assert.match(dash, /flipSecurity\("paymentSound", !paymentSoundOn\)/);
  const build = readFileSync(join(ROOT, "build_app.mjs"), "utf8");
  assert.ok(build.indexOf('"features/creator/paymentChime.js"') < build.indexOf('"App.jsx"'));
});

test("a payment push nudges the open app to read the payment now", () => {
  const sw = readFileSync(join(ROOT, "gloobal-essentials-preview/src/push-sw-core.js"), "utf8");
  assert.match(sw, /type: "gloobal:push-arrived"/);
});

test("switching to Creator plays two notes that rise; back to Personal, two that fall", () => {
  const { api, log } = load();
  assert.equal(api.gloobalPlayRoleSwitchSound("merchant"), true);
  const up = log.slides.splice(0);
  assert.equal(up.length, 2);
  assert.ok(up[1][1] > up[0][1] && up.every(([a, b]) => b > a), JSON.stringify(up));
  api.gloobalPlayRoleSwitchSound("user");
  const down = log.slides.splice(0);
  assert.ok(down[1][1] < down[0][1] && down.every(([a, b]) => b < a), JSON.stringify(down));
  assert.equal(log.spoken.length, 0, "the switch makes a sound, it does not speak");
});

test("the same Sounds switch silences the side switch too", () => {
  const { api, log } = load();
  api.gloobalSetPaymentSoundEnabled(false);
  assert.equal(api.gloobalPlayRoleSwitchSound("merchant"), false);
  assert.equal(log.notes.length, 0);
});

test("both flip controls on the dashboard play it on the tap", () => {
  const dash = readFileSync(join(ROOT, "frontend/screens/Dashboard/Dashboard.jsx"), "utf8");
  assert.equal((dash.match(/gloobalPlayRoleSwitchSound\(/g) || []).length, 2);
});

// ── The shop's own announcement ──────────────────────────────────────────
test("the shop's own line is said in place of the standard sentence, with the amount where {amount} is", async () => {
  const { api, log } = load();
  assert.equal(api.gloobalPaymentLineLoad(), "", "no line saved: the standard sentence");
  api.gloobalPaymentLineSave("{amount} CEL prapt hue, aapka dhanyavaad");
  await api.gloobalPlayPaymentChime({ txnId: "L1", amount: 100, currency: "INR" });
  assert.deepEqual(log.spoken, [{ text: "100 Cell prapt hue, aapka dhanyavaad", lang: "en-IN" }]);
  assert.deepEqual(log.notes, [1046.5, 2093, 1568, 3136], "the chime still comes first");
  // Paise are said; a Hindi line gets a Hindi voice.
  api.gloobalPaymentLineSave("{amount} CEL प्राप्त हुए, आपका धन्यवाद");
  await api.gloobalPlayPaymentChime({ txnId: "L2", amount: 100.5, currency: "INR" });
  assert.deepEqual(log.spoken[1], { text: "100.50 सेल प्राप्त हुए, आपका धन्यवाद", lang: "hi-IN" });
});

test("a line with no {amount} has the amount said first; clearing it brings the standard sentence back", async () => {
  const { api, log } = load();
  assert.equal(api.gloobalPaymentLineSentence("Dhanyavaad, phir aaiyega", 250).text, "250. Dhanyavaad, phir aaiyega");
  api.gloobalPaymentLineSave("Dhanyavaad");
  api.gloobalPaymentLineSave("   ");
  assert.equal(api.gloobalPaymentLineLoad(), "");
  await api.gloobalPlayPaymentChime({ txnId: "L3", amount: 500, currency: "INR" });
  assert.match(log.spoken[0].text, /^Received 500 Indian rupees$/);
});

test("Hear it plays the chime and the line with 100; every ready line carries the amount", async () => {
  const { api, log } = load();
  await api.gloobalPreviewPaymentLine("{amount} CEL aa gaye");
  assert.equal(log.spoken[0].text, "100 Cell aa gaye");
  assert.equal(log.notes.length, 4);
  for (const t of api.GLOOBAL_PAYMENT_LINE_PRESETS) assert.match(t, /\{amount\}/, t);
});

test("an audio clip in place of the words: chime, the clip, then the amount; removing it brings the words back", async () => {
  const { api, log } = load();
  api.gloobalPaymentLineSave("{amount} CEL prapt hue");
  assert.equal(api.gloobalPaymentClipSave("data:audio/wav;base64,AAAA"), true);
  await api.gloobalPlayPaymentChime({ txnId: "C1", amount: 100, currency: "INR" });
  assert.equal(log.notes.length, 4, "the chime first");
  assert.deepEqual(log.clips, ["data:audio/wav;base64,AAAA"], "then the shop's clip");
  assert.deepEqual(log.spoken, [{ text: "100 Cell", lang: "en-IN" }], "then the amount, which a clip cannot say");
  // Only an audio data: URL is ever played.
  api.gloobalPaymentClipSave("https://example.com/x.mp3");
  assert.equal(api.gloobalPaymentClipLoad(), "");
  api.gloobalPaymentClipSave("");
  await api.gloobalPlayPaymentChime({ txnId: "C2", amount: 20, currency: "INR" });
  assert.equal(log.clips.length, 1);
  assert.equal(log.spoken[1].text, "20 Cell prapt hue");
});

// ── The Payment sound screen's choices ───────────────────────────────────
test("nothing chosen yet behaves as before: the words, or the clip if there is one", () => {
  const { api } = load();
  assert.deepEqual(api.gloobalPaymentSoundPrefs(), { mode: "line", voice: "auto", speed: "normal", clipAmount: true });
  api.gloobalPaymentClipSave("data:audio/wav;base64,AAAA");
  assert.equal(api.gloobalPaymentSoundPrefs().mode, "clip");
  // A saved "clip" with the clip since removed falls back to the words.
  api.gloobalPaymentSoundPrefsSave({ mode: "clip" });
  api.gloobalPaymentClipSave("");
  assert.equal(api.gloobalPaymentSoundPrefs().mode, "line");
});

test("chime only: the two notes and not a word, even with a line and a clip saved", async () => {
  const { api, log } = load();
  api.gloobalPaymentLineSave("{amount} CEL aa gaye");
  api.gloobalPaymentClipSave("data:audio/wav;base64,AAAA");
  api.gloobalPaymentSoundPrefsSave({ mode: "chime" });
  await api.gloobalPlayPaymentChime({ txnId: "M1", amount: 100, currency: "INR" });
  assert.equal(log.notes.length, 4);
  assert.equal(log.spoken.length + log.clips.length, 0);
});

test("the chosen voice and speed are what the line is spoken with", async () => {
  const { api, log } = load();
  api.gloobalPaymentLineSave("{amount} CEL aa gaye");
  api.gloobalPaymentSoundPrefsSave({ mode: "line", voice: "hi", speed: "slow" });
  await api.gloobalPlayPaymentChime({ txnId: "M2", amount: 100, currency: "INR" });
  assert.deepEqual(log.spoken, [{ text: "100 Cell aa gaye", lang: "hi-IN" }]);
  assert.ok(log.rates[0] < 0.9, "slow is slower than normal");
  api.gloobalPaymentSoundPrefsSave({ mode: "line", voice: "auto", speed: "fast" });
  await api.gloobalPlayPaymentChime({ txnId: "M3", amount: 100, currency: "INR" });
  assert.equal(log.spoken[1].lang, "en-IN");
  assert.ok(log.rates[1] > 1);
});

test("a clip with 'say the amount' off plays the clip alone; 'words' ignores a kept clip", async () => {
  const { api, log } = load();
  api.gloobalPaymentClipSave("data:audio/wav;base64,AAAA");
  api.gloobalPaymentSoundPrefsSave({ mode: "clip", clipAmount: false });
  await api.gloobalPlayPaymentChime({ txnId: "M4", amount: 100, currency: "INR" });
  assert.equal(log.clips.length, 1);
  assert.equal(log.spoken.length, 0);
  api.gloobalPaymentSoundPrefsSave({ mode: "line" });
  await api.gloobalPlayPaymentChime({ txnId: "M5", amount: 100, currency: "INR" });
  assert.equal(log.clips.length, 1);
  assert.match(log.spoken[0].text, /^Received 100 Indian rupees$/);
});

test("the screen's play button hears the unsaved draft, with the amount picked, and saves nothing", async () => {
  const { api, log } = load();
  await api.gloobalPreviewPaymentSound({ mode: "line", line: "{amount} CEL aa gaye", voice: "auto", speed: "normal" }, 2500, "INR");
  assert.deepEqual(log.spoken, [{ text: "2500 Cell aa gaye", lang: "en-IN" }]);
  assert.equal(api.gloobalPaymentLineLoad(), "");
});

test("the profile row opens a Payment sound screen that keeps nothing until Save", () => {
  const panel = readFileSync(join(ROOT, "frontend/features/creator/CreatorSetupScreen.jsx"), "utf8");
  assert.match(panel, /function PaymentSoundScreen\(\{ onBack, onToast, currency \}\)/);
  assert.match(panel, /gloobalMapPortal\(<PaymentSoundScreen /);
  const screen = panel.slice(panel.indexOf("function PaymentSoundScreen("), panel.indexOf("function PaymentLineRow("));
  for (const id of ["payment-sound-mode-", "payment-sound-try-", "payment-sound-voice-", "payment-sound-speed-", "payment-clip-record", "payment-clip-upload", "payment-sound-save"]) assert.ok(screen.includes(id), id);
  const saves = screen.slice(screen.indexOf("const save = () => {"), screen.indexOf("const shown ="));
  assert.equal((screen.match(/gloobalPaymentLineSave\(/g) || []).length, 1, "the line is saved in one place");
  assert.match(saves, /gloobalPaymentClipSave\(draft\.clip\)[\s\S]*gloobalPaymentLineSave\(draft\.line\)[\s\S]*gloobalPaymentSoundPrefsSave\(draft\)/);
});

test("CEL is said as a word, never spelled out; what is shown stays CEL", async () => {
  const { api, log } = load();
  assert.equal(api.gloobalPaymentLineSentence("{amount} CEL aa gaye", 100).text, "100 CEL aa gaye", "the shown text is untouched");
  api.gloobalPaymentLineSave("Received {amount} cel. EXCEL and CELL stay as they are, CEL!");
  await api.gloobalPlayPaymentChime({ txnId: "W1", amount: 5, currency: "INR" });
  assert.equal(log.spoken[0].text, "Received 5 Cell. EXCEL and CELL stay as they are, Cell!");
  assert.ok(!/\bCEL\b/.test(log.spoken.map((x) => x.text).join(" ")), "the three capitals never reach the voice");
});
