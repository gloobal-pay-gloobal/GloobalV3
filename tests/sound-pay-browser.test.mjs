// tests/sound-pay-browser.test.mjs
//
// Pay nearby by sound in the real app:
//   1. The receiver's Earn sheet: Get paid, 250 on the pad, Play. The exact
//      sound the app plays is captured and decoded: it names the receiver,
//      as a person, for 250.
//   2. The payer's Scan screen: the microphone is fed that kind of chirp with
//      background noise under it. "Listen" opens the receiver's card, the
//      same card a QR scan opens, and Pay opens Send with 250 filled in.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildOnce, openPage, teardown, login, ACCOUNTS, API_ORIGIN } from "./browser-harness.mjs";

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
      // Skip the one-sample silent buffer soundPayUnlock plays on the tap.
      if (this.buffer && this.buffer.length > 1) window.__played.push({ rate: this.buffer.sampleRate, data: Array.from(this.buffer.getChannelData(0)) });
      return start.apply(this, args);
    };
  });
  await page.reload();
  await page.waitForSelector("#root *", { timeout: 15000 });
  await login(page, B);
  await page.waitForTimeout(1200);
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("earn-receive"));
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
  const { page, context, errors, api } = await openPage({ account: A });
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
  await page.waitForTimeout(1200);
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("earn-pay"));
  await page.getByTestId("sound-listen-screen").waitFor({ timeout: 8000 });
  // The same card a QR scan opens: the receiver's name and a Pay button.
  await page.waitForFunction((name) => document.body.innerText.includes(name) &&
    Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim() === "Pay"), B.fullName, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.__micAsked), 1);
  // The card is the server's answer for the heard ID (name looked up, not
  // carried in the sound), with the asked amount on it.
  assert.ok(api.calls.some((c) => c.method === "GET" && c.path === "/api/users/resolve" && decodeURIComponent(c.query).includes(B.symbolId)), "the heard ID was looked up on the server");
  assert.match(await page.evaluate(() => document.body.innerText), /250/);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-heard-card.png" });
  await tap(page.getByRole("button", { name: "Pay", exact: true }));
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => /^250(\.00)?$/.test(i.value)) || /250\.00/.test(document.body.innerText), null, { timeout: 20000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test("the self-test: one phone plays and hears its own ID, and says so; a meter shows while listening", async () => {
  // The fake microphone hears A's own chirp (quiet, under noise), the way
  // the phone's mic hears its own speaker.
  const rate = 48000;
  const clean = S.soundPaySamples(S.soundPayEncode({ gloobalId: A.symbolId, side: "person", amount: "" }), rate);
  const lead = new Float32Array(rate * 1.5);
  const mic = new Float32Array(lead.length + clean.length);
  let seed = 11;
  for (let i = 0; i < mic.length; i += 1) {
    seed = (seed * 16807) % 2147483647;
    mic[i] = (i >= lead.length ? clean[i - lead.length] * 0.2 : 0) + (seed / 2147483647 - 0.5) * 0.03;
  }
  const { page, context, errors } = await openPage({ account: A });
  await context.addInitScript(({ samples, rate }) => {
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (c && c.audio && !c.video) {
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
      throw new DOMException("no camera", "NotAllowedError");
    };
  }, { samples: Array.from(mic), rate });
  await page.reload();
  await page.waitForSelector("#root *", { timeout: 15000 });
  await login(page, A);
  await page.waitForTimeout(1500);
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("sound-pay-selftest"));
  await page.getByTestId("sound-pay-selftest-result").waitFor({ timeout: 20000 });
  const r = page.getByTestId("sound-pay-selftest-result");
  assert.equal(await r.getAttribute("data-ok"), "1", await r.innerText());
  assert.match(await r.innerText(), /hears its own ID/);

  // The listening screen shows a meter and a count while it listens, and
  // Cancel closes it.
  await page.getByRole("button", { name: "Close", exact: true }).last().evaluate((n) => n.click());
  await page.getByTestId("earn-sheet").waitFor({ state: "detached", timeout: 8000 });
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("earn-pay"));
  await page.getByTestId("sound-pay-meter").waitFor({ timeout: 8000 });
  assert.match(await page.getByTestId("sound-listen-left").innerText(), /^(20|19|18) s$/);
  await tap(page.getByTestId("sound-listen-cancel"));
  await page.getByTestId("sound-listen-screen").waitFor({ state: "detached", timeout: 8000 });
  // The two old doors are gone: no Listen on Scan, no Play on the QR card.
  await tap(page.getByRole("button", { name: "Scanner", exact: true }));
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId("sound-pay-listen").count(), 0, "no Listen button on the Scan screen");
  await page.getByRole("button", { name: "Back", exact: true }).first().evaluate((n) => n.click()).catch(() => {});
  await page.waitForTimeout(500);
  await tap(page.getByRole("button", { name: "Receive", exact: true }));
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId("sound-pay-open").count(), 0, "no Play button on the QR card");
  assert.deepEqual(errors, []);
  await context.close();
});

test("offline: a person heard before still opens a card from the phone's copy, and the card says so", async () => {
  // B's chirp, as the payer's microphone hears it.
  const rate = 48000;
  const clean = S.soundPaySamples(S.soundPayEncode({ gloobalId: B.symbolId, side: "person", amount: "40" }), rate);
  const mic = new Float32Array(rate * 1.5 + clean.length);
  for (let i = 0; i < clean.length; i += 1) mic[rate * 1.5 + i] = clean[i] * 0.3;
  const { page, context, api } = await openPage({ account: A });
  await context.addInitScript(({ samples, rate }) => {
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (c && c.audio && !c.video) {
        const ctx = new AudioContext({ sampleRate: rate });
        await ctx.resume();
        const buf = ctx.createBuffer(1, samples.length, rate);
        buf.copyToChannel(Float32Array.from(samples), 0);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const dest = ctx.createMediaStreamDestination(); src.connect(dest); src.start();
        return dest.stream;
      }
      throw new DOMException("no camera", "NotAllowedError");
    };
  }, { samples: Array.from(mic), rate });
  await page.reload();
  await page.waitForSelector("#root *", { timeout: 15000 });
  await login(page, A);
  await page.waitForTimeout(1200);
  // Once with the server up: the lookup is made and kept on the phone.
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("earn-pay"));
  await page.waitForFunction((name) => document.body.innerText.includes(name), B.fullName, { timeout: 30000 });
  assert.equal(await page.getByTestId("scan-saved-copy").count(), 0, "online: no saved-copy line");
  await page.waitForTimeout(800);
  // Now with no server at all.
  await context.route(`${API_ORIGIN}/api/**`, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Back", exact: true }).first().evaluate((n) => n.click());
  await page.waitForTimeout(600);
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("earn-pay"));
  await page.waitForFunction((name) => document.body.innerText.includes(name), B.fullName, { timeout: 30000 });
  const line = page.getByTestId("scan-saved-copy");
  await line.waitFor({ timeout: 5000 });
  assert.match(await line.innerText(), /You're offline · saved copy from .* · paying needs a connection/);
  assert.match(await page.evaluate(() => document.body.innerText), /40/);
  await context.close();
});
