// tests/live-photo-0253.test.mjs
//
// The live photo: the founder's "camera only", "say the numbers on screen",
// "if we fail we tell them go to a quiet place", head turns for anyone who
// can't speak, and the combo — "move head left, again left, again left, so
// there can be less fake".
//
// Three layers:
//   1. The rules, as plain functions (digits heard, moves seen, lips moved).
//   2. The wiring, from source: no gallery anywhere a face is set, the
//      microphone allowed, the face models served from our own origin.
//   3. The screen, in a browser, with a scripted face and voice
//      (tests/live-face-fake.mjs): what a person sees and what reaches the
//      server, for a pass, each kind of failure, and a different face.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { readSource, ROOT } from "./harness.mjs";
import { buildOnce, openPage, teardown, login, ACCOUNTS } from "./browser-harness.mjs";
import { liveFaceFake, takeLivePhoto } from "./live-face-fake.mjs";

const src = readSource("frontend/features/identity/liveFaceCheck.jsx");

// The pure part of the file: everything before the component, minus imports.
const pure = (() => {
  const body = src.slice(0, src.indexOf("function LiveFaceCheck(")).replace(/^import .*$/gm, "");
  const ctx = { Math, Array, Object, String, Number, localStorage: { getItem: () => null }, navigator: { language: "en-IN" } };
  vm.createContext(ctx);
  vm.runInContext(body + "\n;this.api = { liveFaceDigits, liveFaceHeard, liveFaceMatchCount, liveFacePose, liveFaceBaseline, liveFaceTurned, liveFaceStill, liveFaceLipsMoved, liveFaceTurns, liveFaceComboLength, liveFaceFrameHint, liveFaceDigitText };", ctx);
  return ctx.api;
})();

describe("the rules", () => {
  test("three different digits, never zero", () => {
    for (let i = 0; i < 300; i++) {
      const d = pure.liveFaceDigits();
      assert.equal(d.length, 3);
      assert.equal(new Set(d).size, 3);
      assert.ok(d.every((n) => n >= 1 && n <= 9));
    }
  });

  test("digits are heard as numerals, Devanagari numerals, Hindi words and English words", () => {
    assert.deepEqual([...pure.liveFaceHeard("4 7 2")], [4, 7, 2]);
    assert.deepEqual([...pure.liveFaceHeard("472")], [4, 7, 2]);
    assert.deepEqual([...pure.liveFaceHeard("४ ७ २")], [4, 7, 2]);
    assert.deepEqual([...pure.liveFaceHeard("चार सात दो")], [4, 7, 2]);
    assert.deepEqual([...pure.liveFaceHeard("Four, seven, two.")], [4, 7, 2]);
    assert.deepEqual([...pure.liveFaceHeard("for seven to")], [4, 7, 2], "en-IN homophones");
    assert.deepEqual([...pure.liveFaceHeard("पाँच छह नौ")], [5, 6, 9]);
    assert.equal(pure.liveFaceDigitText(4, "hi"), "४");
    assert.equal(pure.liveFaceDigitText(4, "en"), "4");
  });

  test("the three must come in order; words around them don't count against the person", () => {
    assert.equal(pure.liveFaceMatchCount([4, 7, 2], [9, 4, 1, 7, 2]), 3);
    assert.equal(pure.liveFaceMatchCount([4, 7, 2], [2, 7, 4]), 1);
    assert.equal(pure.liveFaceMatchCount([4, 7, 2], [4, 7]), 2);
  });

  const mesh = ({ yaw = 0.09, pitch = 0.27, mouth = 0.01 } = {}) => {
    const m = Array.from({ length: 468 }, () => [0, 0, 0]);
    m[33] = [250, 200, 0]; m[263] = [390, 200, 0]; m[10] = [320, 100, 0]; m[152] = [320, 400, 0];
    m[1] = [320 + yaw * 140, 200 + pitch * 300, 0]; m[13] = [320, 330, 0]; m[14] = [320, 330 + mouth * 300, 0];
    return m;
  };

  test("head moves are measured against the person's own resting face", () => {
    const base = pure.liveFaceBaseline([pure.liveFacePose(mesh()), pure.liveFacePose(mesh()), pure.liveFacePose(mesh())]);
    const at = (o) => pure.liveFacePose(mesh(o));
    assert.ok(pure.liveFaceTurned("left", at({ yaw: 0.25 }), base));
    // 0254: left/right counts either way round (cameras disagree on mirroring).
    assert.ok(pure.liveFaceTurned("right", at({ yaw: 0.25 }), base));
    assert.ok(pure.liveFaceTurned("right", at({ yaw: 0.0 }), base));
    assert.ok(!pure.liveFaceTurned("up", at({ yaw: 0.25 }), base), "a side turn is not a nod");
    assert.ok(pure.liveFaceTurned("up", at({ pitch: 0.2 }), base));
    assert.ok(pure.liveFaceTurned("down", at({ pitch: 0.34 }), base));
    assert.ok(!pure.liveFaceTurned("left", at({ yaw: 0.12 }), base), "a small drift is not a turn");
    assert.ok(pure.liveFaceStill(at({ yaw: 0.1 }), base));
    assert.ok(!pure.liveFaceStill(at({ yaw: 0.25 }), base));
    assert.ok(pure.liveFaceStill(at({ yaw: 0.17 }), base, 1.6), "back to the centre is looser than the photo");
  });

  test("the combo: random moves, repeats allowed, never all the same; 2 after speech, 3 alone, 3 to pay", () => {
    assert.equal(pure.liveFaceComboLength("speech"), 2);
    assert.equal(pure.liveFaceComboLength("turns"), 3);
    assert.equal(pure.liveFaceComboLength("turns", "pay"), 3);
    let repeats = 0;
    for (let i = 0; i < 2000; i++) {
      const c = pure.liveFaceTurns(Math.random, 3);
      assert.equal(c.length, 3);
      assert.ok(new Set(c).size > 1, `all the same: ${c}`);
      if (c[0] === c[1] || c[1] === c[2]) repeats++;
    }
    assert.ok(repeats > 100, "\"left, again left\" must be possible");
    // The founder's own example survives the not-all-same rule.
    const seq = [0, 0, 0.99];
    let k = 0;
    assert.deepEqual([...pure.liveFaceTurns(() => seq[k++] ?? 0, 3)].slice(0, 2), ["left", "left"]);
  });

  test("lips: a still mouth fails, a speaking one passes", () => {
    assert.ok(!pure.liveFaceLipsMoved([0.01, 0.011, 0.01, 0.012, 0.01]));
    assert.ok(pure.liveFaceLipsMoved([0.01, 0.06, 0.02, 0.07, 0.01, 0.05]));
    assert.ok(!pure.liveFaceLipsMoved([0.01, 0.06]), "too few frames to judge");
  });

  test("framing hints: no face, two faces, too far, off-centre", () => {
    const f = (box) => ({ box });
    assert.equal(pure.liveFaceFrameHint([], 640, 480), "none");
    assert.equal(pure.liveFaceFrameHint([f([170, 90, 300, 300]), f([20, 20, 120, 120])], 640, 480), "many");
    assert.equal(pure.liveFaceFrameHint([f([260, 180, 120, 120])], 640, 480), "closer");
    assert.equal(pure.liveFaceFrameHint([f([0, 90, 300, 300])], 640, 480), "center");
    assert.equal(pure.liveFaceFrameHint([f([170, 90, 300, 300])], 640, 480), null);
  });
});

describe("the wiring", () => {
  test("no gallery: registration and the profile take the photo live", () => {
    const reg = readSource("frontend/components/payments/PayPinModal.jsx");
    const setup = reg.slice(reg.indexOf("function ProfileSetupScreen("));
    assert.doesNotMatch(setup.slice(0, setup.indexOf("\nfunction ", 10)), /type="file"/, "a gallery picker came back to registration");
    assert.match(setup, /<LiveFaceCheck\s+purpose="register"/);
    const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
    assert.doesNotMatch(dash, /profilePhotoInputRef|handleProfilePhotoFile/, "the profile's gallery picker came back");
    assert.match(dash, /onChangePhoto=\{\(\) => setLivePhotoOpen\(true\)\}/);
    assert.match(dash, /<LiveFaceCheck\s+purpose="change"/);
  });

  test("registration sends the face with the account, so a duplicate is refused before it exists", () => {
    const app = readSource("frontend/App.jsx");
    assert.match(app, /face: liveRegResult && liveRegResult\.photo === profilePhoto\s*\? \{ descriptor: liveRegResult\.descriptor, model: liveRegResult\.model \}/);
    assert.match(app, /liveFaceSave\(newSymbolId, liveRegResult\)/);
    const server = fs.readFileSync(path.join(ROOT, "server/server.js"), "utf8");
    const reg = server.slice(server.indexOf("app.post('/api/register-symbol'"), server.indexOf("const newUser = new User({"));
    assert.match(reg, /livePhoto\.findOnOtherAccount\(null, model, d\)/);
    assert.ok(reg.indexOf("findVerifiedRegistrationOtp") < reg.indexOf("findOnOtherAccount"), "only after the OTP");
  });

  test("the microphone is allowed for this site; the camera too; nothing else widened", () => {
    const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
    assert.match(toml, /Permissions-Policy\s*=\s*"camera=\(self\), microphone=\(self\), geolocation=\(self\), payment=\(self\)"/);
    assert.match(toml, /script-src 'self';/, "no new script origin, no eval");
  });

  test("the face library loads only on this screen, from our own origin, pinned", () => {
    assert.match(src, /import\("@vladmandic\/human"\)/);
    assert.match(src, /modelBasePath: LIVE_FACE_MODEL_PATH/);
    assert.match(src, /var LIVE_FACE_MODEL_PATH = "\/face-models\/";/);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "gloobal-essentials-preview/package.json"), "utf8"));
    assert.equal(pkg.dependencies["@vladmandic/human"], "3.3.6", "pinned exactly: the stored descriptors depend on the model");
    const vite = fs.readFileSync(path.join(ROOT, "gloobal-essentials-preview/vite.config.js"), "utf8");
    assert.match(vite, /const FACE_MODELS = \["blazeface", "facemesh", "faceres", "antispoof", "liveness"\];/);
    assert.match(vite, /faceModels\(\),/);
    assert.match(vite, /globIgnores: \["\*\*\/maplibre-gl\*", "\*\*\/human\*", "\*\*\/face-models\/\*\*"\]/, "not precached at install");
    for (const m of ["blazeface", "facemesh", "faceres", "antispoof", "liveness"]) {
      for (const ext of ["json", "bin"]) {
        assert.ok(fs.existsSync(path.join(ROOT, "gloobal-essentials-preview/node_modules/@vladmandic/human/models", `${m}.${ext}`)), `${m}.${ext}`);
      }
    }
  });

  test("the words on screen promise only what is true", () => {
    assert.match(src, /GLOOBAL doesn't keep your voice or the video/);
    assert.match(src, /a coded face pattern/, "the descriptor is kept, and the screen says so");
    assert.match(src, /Try in a quieter place, closer to the phone\./);
  });
});

// ── In a browser ───────────────────────────────────────────────────────────

const A = ACCOUNTS.india;

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

async function openLiveCheck(fake = {}, options = {}) {
  const opened = await openPage({ account: A, ...options });
  await opened.context.addInitScript(liveFaceFake(fake));
  await opened.page.reload();
  await opened.page.waitForSelector("#root *");
  await login(opened.page, A);
  await opened.page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await opened.page.getByRole("button", { name: "Gloobal ID — open your profile" }).click({ force: true });
  await opened.page.locator("[data-personal-profile]").waitFor({ timeout: 15000 });
  await opened.page.getByRole("button", { name: /^(Change your photo|Add a photo)$/ }).click({ force: true });
  await opened.page.getByTestId("live-face-check").waitFor({ timeout: 10000 });
  return opened;
}

const phaseOf = (page) => page.evaluate(() => document.querySelector("[data-testid=live-face-check]")?.dataset.phase || null);

describe("the screen", () => {
  test("say the numbers, follow three moves, hold still: the photo is saved through the live route", async () => {
    const { page, context, api, errors } = await openLiveCheck();
    assert.match(await page.textContent("[data-testid=live-face-check]"), /No gallery, no uploads/);
    await page.getByTestId("live-face-open").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=live-face-digit]").length === 3, null, { timeout: 20000 });
    assert.match(await page.getByTestId("live-face-subtitle").textContent(), /1 of 3 · say the numbers/);
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "combo", null, { timeout: 20000 });
    assert.equal(await page.locator("[data-testid=live-face-move]").count(), 2, "two moves after the numbers");
    assert.match(await page.getByTestId("live-face-subtitle").textContent(), /2 of 3 · follow the arrows/);
    assert.equal(await takeLivePhoto(page, { open: false }), "review");
    assert.match(await page.textContent("[data-testid=live-face-check]"), /Live check passed/);
    assert.equal(await page.evaluate(() => window.__recLang), "en-IN");
    await page.getByTestId("live-face-use").click();
    await page.getByTestId("live-face-check").waitFor({ state: "detached", timeout: 15000 });
    assert.equal(api.state.livePhotoPosts, 1);
    assert.match(api.state.photos[A.symbolId] || "", /^data:image\/jpeg;base64,/);
    const posted = api.calls.find((c) => /live-photo$/.test(c.path));
    assert.equal(posted.body.method, "speech");
    assert.equal(posted.body.model, "human-faceres@3.3");
    assert.ok(Array.isArray(posted.body.descriptor) && posted.body.descriptor.length >= 64);
    assert.ok(!api.calls.some((c) => c.method === "PUT" && /\/photo$/.test(c.path)), "the photo was uploaded a second time through the old route");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("no speech on this phone: the check is three head moves, and it passes", async () => {
    const { page, context, api } = await openLiveCheck({ speech: false });
    await page.getByTestId("live-face-open").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "combo", null, { timeout: 20000 });
    assert.equal(await page.locator("[data-testid=live-face-move]").count(), 3);
    assert.match(await page.getByTestId("live-face-subtitle").textContent(), /1 of 2 · follow the arrows/);
    assert.equal(await takeLivePhoto(page, { open: false }), "review");
    await page.getByTestId("live-face-use").click();
    await page.getByTestId("live-face-check").waitFor({ state: "detached", timeout: 15000 });
    assert.equal(api.calls.find((c) => /live-photo$/.test(c.path)).body.method, "turns");
    await context.close();
  });

  test("numbers heard but the lips never moved: refused, and head moves are offered", async () => {
    const { page, context, api } = await openLiveCheck({ lips: false });
    assert.equal(await takeLivePhoto(page), "fail");
    assert.equal(await page.getByTestId("live-face-fail").getAttribute("data-reason"), "lips");
    assert.equal(api.state.livePhotoPosts || 0, 0);
    await page.getByTestId("live-face-fail-turns").click();
    assert.equal(await takeLivePhoto(page, { open: false }), "review");
    await context.close();
  });

  test("nothing heard: 'Try in a quieter place', Try again, or turn your head", async () => {
    const { page, context } = await openLiveCheck({ spoken: false });
    assert.equal(await takeLivePhoto(page), "fail");
    const text = await page.textContent("[data-testid=live-face-check]");
    assert.match(text, /Couldn't hear you clearly/);
    assert.match(text, /Try in a quieter place, closer to the phone\./);
    assert.ok(await page.getByTestId("live-face-retry").isVisible());
    assert.ok(await page.getByTestId("live-face-fail-turns").isVisible());
    await context.close();
  });

  test("a face that won't follow the arrows (a photo, a clip) doesn't pass", async () => {
    const { page, context, api } = await openLiveCheck({ speech: false, follow: false });
    assert.equal(await takeLivePhoto(page), "fail");
    assert.equal(await page.getByTestId("live-face-fail").getAttribute("data-reason"), "turn");
    assert.equal(api.state.livePhotoPosts || 0, 0);
    await context.close();
  });

  test("a face already on another GLOOBAL ID is refused, in words", async () => {
    const { page, context, api } = await openLiveCheck({}, { liveAnswer: "taken" });
    assert.equal(await takeLivePhoto(page), "review");
    await page.getByTestId("live-face-use").click();
    await page.getByTestId("live-face-save-error").waitFor({ timeout: 10000 });
    assert.match(await page.getByTestId("live-face-save-error").textContent(), /already on another GLOOBAL ID/);
    assert.equal(api.state.photos[A.symbolId], undefined);
    await context.close();
  });

  test("a different person: PIN, a 24-hour wait, a banner on the profile, and Cancel", async () => {
    const { page, context, api } = await openLiveCheck({}, { liveAnswer: "different" });
    assert.equal(await takeLivePhoto(page), "review");
    await page.getByTestId("live-face-use").click();
    await page.getByTestId("live-face-different").waitFor({ timeout: 10000 });
    assert.match(await page.textContent("[data-testid=live-face-check]"), /goes live in 24 hours/);
    await page.getByTestId("live-face-pin").fill("000000");
    await page.getByTestId("live-face-confirm").click();
    await page.getByTestId("live-face-save-error").waitFor({ timeout: 10000 });
    assert.match(await page.getByTestId("live-face-save-error").textContent(), /PIN is wrong/);
    await page.getByTestId("live-face-pin").fill(A.pin);
    await page.getByTestId("live-face-confirm").click();
    await page.getByTestId("live-face-pending").waitFor({ timeout: 10000 });
    assert.ok(api.state.pendingPhotos[A.symbolId], "the change is waiting on the server");
    assert.equal(api.state.photos[A.symbolId], undefined, "the photo did not change yet");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByTestId("pd-pending-photo").waitFor({ timeout: 10000 });
    await page.getByTestId("pd-pending-cancel").click();
    await page.getByTestId("pd-pending-photo").waitFor({ state: "detached", timeout: 10000 });
    assert.equal(api.state.pendingPhotos[A.symbolId], undefined);
    await context.close();
  });

  test("Hindi: the digits are shown in Devanagari and listened for in hi-IN", async () => {
    const { page, context } = await openLiveCheck();
    await page.evaluate(() => localStorage.setItem("gloobal.liveFaceLang", "hi"));
    await page.getByTestId("live-face-back").click();
    await page.getByRole("button", { name: /^(Change your photo|Add a photo)$/ }).click({ force: true });
    await page.getByTestId("live-face-open").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=live-face-digit]").length === 3, null, { timeout: 20000 });
    const digits = await page.locator("[data-testid=live-face-digit]").allTextContents();
    assert.ok(digits.every((d) => /^[१-९]$/.test(d)), digits.join(","));
    assert.match(await page.textContent("[data-testid=live-face-check]"), /ये नंबर बोलिए/);
    assert.equal(await takeLivePhoto(page, { open: false }), "review");
    assert.equal(await page.evaluate(() => window.__recLang), "hi-IN");
    await context.close();
  });
});

// 0254: on a real phone the check took 15 tries. These hold it to the
// 5–10 seconds the founder asked for, and keep a Take photo button there.
describe("fast enough on a phone", () => {
  test("a person who sits a little off-centre still gets their photo, and the shutter takes it at once", async () => {
    const { page, context } = await openLiveCheck({ speech: false });
    await page.getByTestId("live-face-open").click();
    const started = Date.now();
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "hold", null, { timeout: 20000 });
    assert.ok(await page.getByTestId("live-face-shutter").isVisible(), "a Take photo button on the hold step");
    await page.getByTestId("live-face-shutter").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "review", null, { timeout: 10000 });
    const took = Date.now() - started;
    assert.ok(took < 10000, `the whole check took ${took} ms`);
    await context.close();
  });

  test("the heavy models run only at the start and for the photo; the models load while the intro is read", () => {
    assert.match(src, /faces = await engine\.detect\(work, stage === "align" \|\| stage === "hold"\);/);
    assert.match(src, /useEffect94\(\(\) => \{ liveFaceLoadEngine\(\)\.catch/);
    assert.match(src, /const pct = Math\.min\(1, \(now - st\.holdStart\) \/ 800\);/);
  });
});
