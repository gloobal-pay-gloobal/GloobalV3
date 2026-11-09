// tests/sound-pay-browser.test.mjs
//
// Pay nearby by sound in the real app:
//   1. The receiver's QR card: "Play my ID", 250 on the pad, Play. The exact
//      sound the app plays is captured and decoded: it names the receiver,
//      as a person, for 250.
//   2. The payer's Scan screen: the microphone is fed that kind of chirp with
//      background noise under it. "Listen" opens the receiver's card, the
//      same card a QR scan opens, and Pay opens Send with 250 filled in.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildOnce, openPage, teardown, login, ACCOUNTS } from "./browser-harness.mjs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const S = new Function(
  read("backend/utils/gloobalPayLink.js") + read("frontend/features/nearby/soundPay.js") +
  ";return { soundPayEncode, soundPaySamples, soundPayListener };"
)();
const A = ACCOUNTS.india;
const B = ACCOUNTS.india2;

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

const tap = async (locator) => { await locator.waitFor({ timeout: 20000 }); await locator.evaluate((n) => n.click()); };

test("the receiver plays its ID and the amount, and the sound decodes to exactly that", async () => {
  const { page, context, errors } = await openPage({ account: B });
  // Capture what the app hands the speaker.
  await context.addInitScript(() => {
    window.__played = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) window.__played.push({ rate: this.buffer.sampleRate, data: Array.from(this.buffer.getChannelData(0)) });
      return start.apply(this, args);
    };
  });
  await page.reload();
  await page.waitForSelector("#root *", { timeout: 15000 });
  await login(page, B);
  await tap(page.getByRole("button", { name: "Receive", exact: true }));
  await tap(page.getByTestId("sound-pay-open"));
  for (const k of ["2", "5", "0"]) await tap(page.getByRole("button", { name: `Amount ${k}`, exact: true }));
  assert.equal(await page.getByTestId("sound-pay-amount").innerText(), "250");
  await tap(page.getByTestId("sound-pay-play"));
  await page.waitForFunction(() => window.__played.length > 0, null, { timeout: 10000 });
  const { rate, data } = (await page.evaluate(() => window.__played))[0];
  const heard = [];
  const l = S.soundPayListener(rate, (h) => heard.push(h));
  l.push(Float32Array.from(data));
  assert.ok(heard.length >= 2, `the three plays are heard (${heard.length})`);
  assert.deepEqual(heard[0], { gloobalId: B.symbolId, side: "person", amount: "250" });
  assert.deepEqual(errors, []);
  await context.close();
});

test("the payer listens: the receiver's card opens, and Pay brings the amount to Send", async () => {
  // B's chirp, as a nearby phone would play it, with noise under it.
  const rate = 48000;
  const clean = S.soundPaySamples(S.soundPayEncode({ gloobalId: B.symbolId, side: "person", amount: "250" }), rate);
  const lead = new Float32Array(rate); // a second of room noise before it starts
  const mic = new Float32Array(lead.length + clean.length);
  let seed = 3;
  for (let i = 0; i < mic.length; i += 1) {
    seed = (seed * 16807) % 2147483647;
    mic[i] = (i >= lead.length ? clean[i - lead.length] * 0.35 : 0) + (seed / 2147483647 - 0.5) * 0.05;
  }
  const { page, context, errors } = await openPage({ account: A });
  await context.addInitScript(({ samples, rate }) => {
    const real = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
    window.__micAsked = 0;
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (c && c.audio && !c.video) {
        window.__micAsked += 1;
        const ctx = new AudioContext({ sampleRate: rate });
        await ctx.resume();
        const buf = ctx.createBuffer(1, samples.length, rate);
        buf.copyToChannel(Float32Array.from(samples), 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        src.start();
        return dest.stream;
      }
      if (real) return real(c);
      throw new DOMException("no camera", "NotAllowedError");
    };
  }, { samples: Array.from(mic), rate });
  await page.reload();
  await page.waitForSelector("#root *", { timeout: 15000 });
  await login(page, A);
  await tap(page.getByRole("button", { name: "Scanner", exact: true }));
  await tap(page.getByTestId("sound-pay-listen"));
  // The same card a QR scan opens: the receiver's name and a Pay button.
  await page.waitForFunction((name) => document.body.innerText.includes(name) &&
    Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim() === "Pay"), B.fullName, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.__micAsked), 1);
  await tap(page.getByRole("button", { name: "Pay", exact: true }));
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => /^250(\.00)?$/.test(i.value)) || /250\.00/.test(document.body.innerText), null, { timeout: 20000 });
  assert.deepEqual(errors, []);
  await context.close();
});
