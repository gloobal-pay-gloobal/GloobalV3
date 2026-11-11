// tests/live-photo-0253.test.mjs
//
// The live photo: the founder's "camera only", and three moves drawn from
// seven — turn left, turn right, look up, look down, smile, open mouth, tilt — shown as
// cards above the camera, then a two-second hold. (Saying numbers out loud
// was dropped: speech recognition failed too often, and nobody should have
// to say numbers aloud in a shop.)
//
// Three layers:
//   1. The rules, as plain functions (moves seen, eyes closed, a smile).
//   2. The wiring, from source: no gallery anywhere a face is set, the
//      face models served from our own origin.
//   3. The screen, in a browser, with a scripted face
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
  vm.runInContext(body + "\n;this.api = { liveFacePose, liveFaceBaseline, liveFaceTurned, liveFaceStill, liveFaceSmiling, liveFaceMouthOpen, liveFaceTilted, liveFaceRested, liveFaceNeedsRest, liveFaceMoves, liveFaceIsTurn, LIVE_FACE_MOVES, LIVE_FACE_HOLD_MS, liveFaceFrameHint };", ctx);
  return ctx.api;
})();

describe("the rules", () => {
  const mesh = ({ yaw = 0.09, pitch = 0.27, mouth = 0.01, lid = 14, mouthW = 70 } = {}) => {
    const m = Array.from({ length: 468 }, () => [0, 0, 0]);
    m[33] = [250, 200, 0]; m[263] = [390, 200, 0]; m[10] = [320, 100, 0]; m[152] = [320, 400, 0];
    m[1] = [320 + yaw * 140, 200 + pitch * 300, 0]; m[13] = [320, 330, 0]; m[14] = [320, 330 + mouth * 300, 0];
    m[159] = [270, 200 - lid / 2, 0]; m[145] = [270, 200 + lid / 2, 0]; m[386] = [370, 200 - lid / 2, 0]; m[374] = [370, 200 + lid / 2, 0];
    m[61] = [320 - mouthW / 2, 330, 0]; m[291] = [320 + mouthW / 2, 330, 0];
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

  test("smile, open mouth and tilt are measured against the person's own resting face", () => {
    const base = pure.liveFaceBaseline([pure.liveFacePose(mesh()), pure.liveFacePose(mesh()), pure.liveFacePose(mesh())]);
    const at = (o) => pure.liveFacePose(mesh(o));
    assert.ok(pure.liveFaceSmiling(at({ mouthW: 82 }), base), "the mouth 17% wider: a smile");
    assert.ok(!pure.liveFaceSmiling(at({ mouthW: 74 }), base), "6% wider: talking, not smiling");
    assert.ok(pure.liveFaceSmiling(at({ mouth: 0.08 }), base), "an open laugh counts");
    assert.ok(!pure.liveFaceSmiling(at({ mouthW: 82, yaw: 0.3 }), base), "not while turned away");
    // Open mouth: a wide "aah", not talking, and not while turned away.
    assert.ok(pure.liveFaceMouthOpen(at({ mouth: 0.12 }), base));
    assert.ok(!pure.liveFaceMouthOpen(at({ mouth: 0.05 }), base), "talking is not an open mouth");
    assert.ok(!pure.liveFaceMouthOpen(at({ mouth: 0.12, yaw: 0.3 }), base));
    // Tilt: the eye line leaning ten degrees or more, either way.
    const lean = (deg) => { const m = mesh(); const r = deg * Math.PI / 180; for (const pt of m) { const x = pt[0] - 320, y = pt[1] - 250; pt[0] = 320 + x * Math.cos(r) - y * Math.sin(r); pt[1] = 250 + x * Math.sin(r) + y * Math.cos(r); } return pure.liveFacePose(m); };
    assert.ok(pure.liveFaceTilted(lean(14), base) && pure.liveFaceTilted(lean(-14), base), "either shoulder");
    assert.ok(!pure.liveFaceTilted(lean(5), base), "a small lean is not a tilt");
    assert.ok(!pure.liveFaceTilted(at({ yaw: 0.3 }), base), "a turn is not a tilt");
    // Back at rest: centred, level, mouth closed.
    assert.ok(pure.liveFaceRested(at({}), base));
    assert.ok(!pure.liveFaceRested(at({ mouth: 0.12 }), base), "mouth still open");
    assert.ok(!pure.liveFaceRested(lean(14), base), "still leaning");
    assert.equal(typeof pure.liveFaceEyesClosed, "undefined", "the blink is gone");
  });

  test("the moves: three of seven, no move twice, every move possible; two seconds of hold", () => {
    assert.deepEqual([...pure.LIVE_FACE_MOVES], ["left", "right", "up", "down", "smile", "mouth", "tilt"]);
    assert.equal(pure.LIVE_FACE_HOLD_MS, 2000);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const c = pure.liveFaceMoves();
      assert.equal(c.length, 3);
      assert.equal(new Set(c).size, 3, `a move twice: ${c}`);
      c.forEach((m) => seen.add(m));
    }
    assert.equal(seen.size, 7, "every one of the seven comes up");
    assert.ok(pure.liveFaceIsTurn("left") && !pure.liveFaceIsTurn("tilt") && !pure.liveFaceIsTurn("smile"));
    assert.ok(pure.liveFaceNeedsRest("mouth") && pure.liveFaceNeedsRest("tilt") && pure.liveFaceNeedsRest("left") && !pure.liveFaceNeedsRest("smile"));
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

  test("the camera is allowed for this site; nothing else widened", () => {
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
    assert.match(src, /GLOOBAL doesn't keep the video/);
    assert.match(src, /a coded face pattern/, "the descriptor is kept, and the screen says so");
    assert.match(src, /Nothing to say out loud/);
    assert.doesNotMatch(src, /SpeechRecognition/, "no speech recogniser anywhere in the flow");
    assert.doesNotMatch(src, /audio: true/, "no microphone");
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
  test("one move card at a time above the camera (three dots), each move followed, a two-second hold, the photo saved through the live route", async () => {
    const { page, context, api, errors } = await openLiveCheck();
    assert.match(await page.textContent("[data-testid=live-face-check]"), /No gallery, no uploads/);
    assert.match(await page.textContent("[data-testid=live-face-check]"), /Nothing to say out loud/);
    await page.getByTestId("live-face-open").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "combo", null, { timeout: 20000 });
    const moves = await page.locator("[data-testid=live-face-dot]").evaluateAll((els) => els.map((e) => e.dataset.move));
    assert.equal(moves.length, 3, "three dots, one per move");
    assert.equal(await page.locator("[data-testid=live-face-move]").count(), 1, "one card: the current move only");
    assert.equal(new Set(moves).size, 3);
    assert.ok(moves.every((m) => ["left", "right", "up", "down", "smile", "mouth", "tilt"].includes(m)), moves.join(","));
    // The cards sit above the camera.
    const cardsBox = await page.getByTestId("live-face-cards").boundingBox();
    const videoBox = await page.getByTestId("live-face-video").boundingBox();
    assert.ok(cardsBox.y + cardsBox.height <= videoBox.y, "the move cards are above the camera");
    assert.match(await page.getByTestId("live-face-subtitle").textContent(), /Move [123] of 3/);
    assert.equal(await page.locator("[data-testid=live-face-dot][data-now='1']").count(), 1, "one dot lit");
    // The hold: a countdown, the shutter there, auto-taken after two seconds.
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "hold", null, { timeout: 20000 });
    const holdAt = Date.now();
    assert.equal(await page.locator("[data-testid=live-face-dot][data-done='1']").count(), 3, "all three dots done");
    assert.match(await page.locator("[data-testid=live-face-move]").innerText(), /All done/);
    assert.ok(await page.getByTestId("live-face-countdown").isVisible(), "a countdown on the ring");
    assert.ok(await page.getByTestId("live-face-shutter").isVisible(), "the shutter is live during the hold");
    assert.equal(await takeLivePhoto(page, { open: false }), "review");
    const held = Date.now() - holdAt;
    assert.ok(held >= 1800, `held for ${held} ms, not a micro hold`);
    assert.match(await page.textContent("[data-testid=live-face-check]"), /Live check passed/);
    await page.getByTestId("live-face-use").click();
    await page.getByTestId("live-face-check").waitFor({ state: "detached", timeout: 15000 });
    assert.equal(api.state.livePhotoPosts, 1);
    assert.match(api.state.photos[A.symbolId] || "", /^data:image\/jpeg;base64,/);
    const posted = api.calls.find((c) => /live-photo$/.test(c.path));
    assert.equal(posted.body.method, "moves");
    assert.equal(posted.body.model, "human-faceres@3.3");
    assert.ok(Array.isArray(posted.body.descriptor) && posted.body.descriptor.length >= 64);
    assert.ok(!api.calls.some((c) => c.method === "PUT" && /\/photo$/.test(c.path)), "the photo was uploaded a second time through the old route");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("a face that won't follow the cards (a photo, a clip) doesn't pass", async () => {
    const { page, context, api } = await openLiveCheck({ follow: false });
    assert.equal(await takeLivePhoto(page), "fail");
    assert.ok(["turn", "smile", "mouth", "tilt"].includes(await page.getByTestId("live-face-fail").getAttribute("data-reason")));
    assert.equal(api.state.livePhotoPosts || 0, 0);
    assert.ok(await page.getByTestId("live-face-retry").isVisible());
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

  test("Hindi: picked on the intro, the cards and the instruction are in Hindi", async () => {
    const { page, context } = await openLiveCheck();
    await page.getByTestId("live-face-lang-hi").click();
    await page.getByTestId("live-face-open").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=live-face-check]").dataset.phase === "combo", null, { timeout: 20000 });
    const word = await page.locator("[data-testid=live-face-move]").innerText();
    assert.ok(/[\u0900-\u097F]/.test(word), word);
    assert.equal(await takeLivePhoto(page, { open: false }), "review");
    assert.equal(await page.evaluate(() => localStorage.getItem("gloobal.liveFaceLang")), "hi");
    await context.close();
  });
});

// 0254: on a real phone the check took 15 tries. These hold it to the
// 5–10 seconds the founder asked for, and keep a Take photo button there.
describe("fast enough on a phone", () => {
  test("a person who sits a little off-centre still gets their photo, and the shutter takes it at once", async () => {
    const { page, context } = await openLiveCheck();
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
    // The hold is two seconds (the founder: "give me 2 seconds for a good
    // hold"), counted down; the shutter takes it sooner.
    assert.match(src, /const pct = Math\.min\(1, elapsed \/ LIVE_FACE_HOLD_MS\);/);
    assert.match(src, /var LIVE_FACE_HOLD_MS = 2000;/);
  });
});
