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
  const log = { notes: [], slides: [], spoken: [], listeners: {} };
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
          if (u.text.trim()) log.spoken.push({ text: u.text, lang: u.lang });
          setTimeout(() => u.onend && u.onend(), 1);
        },
      }
      : undefined,
  };
  if (withAudio) window.AudioContext = FakeContext;
  const navigator = { language };
  const factory = new Function(
    "window", "navigator", "SpeechSynthesisUtterance", "setTimeout",
    `${SOURCE}
     return { gloobalSetPaymentSoundEnabled, gloobalPlayPaymentChime, gloobalChimeSentence, gloobalMarkChimePlayed, gloobalChimeUnlock, gloobalPlayRoleSwitchSound };`
  );
  // setTimeout shortened so the 650 ms chime wait does not slow the test.
  const fast = (fn, ms) => setTimeout(fn, Math.min(ms, 5));
  const api = factory(window, navigator, withVoice ? FakeUtterance : undefined, fast);
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
