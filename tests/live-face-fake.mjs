// tests/live-face-fake.mjs
//
// A face for the live photo check, in a browser with no camera.
//
//   camera   getUserMedia returns a canvas stream (a real MediaStream, so the
//            <video> plays and frames can be drawn).
//   face     window.__GLOOBAL_FACE_ENGINE__ stands in for the face library
//            (liveFaceLoadEngine checks for it). It returns one face whose
//            mesh FOLLOWS the card on screen: it reads the move the check is
//            asking for (data-dir) and turns, smiles, opens its mouth or tilts. Switch
//            `follow` off to play a photo.
//
// What this is NOT: a test of the face library. tests/live-photo-0253 checks
// the screen's rules; the library itself was run against a real face image
// in Chromium under the site's CSP when this was written (see the commit).

export function liveFaceFake({ follow = true } = {}) {
  const cfg = JSON.stringify({ follow });
  return `(() => {
    const cfg = ${cfg};
    const cam = document.createElement("canvas");
    cam.width = 640; cam.height = 480;
    const g = cam.getContext("2d");
    const paint = () => { g.fillStyle = "#3c3746"; g.fillRect(0, 0, 640, 480); g.fillStyle = "#c9966b"; g.fillRect(170, 90, 300, 300); };
    paint(); setInterval(paint, 100);
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {} });
    navigator.mediaDevices.getUserMedia = async () => cam.captureStream(15);

    let t = 0;
    window.__GLOOBAL_FACE_ENGINE__ = {
      async detect() {
        await new Promise((r) => setTimeout(r, 40));
        t += 1;
        const root = document.querySelector("[data-testid=live-face-check]");
        const phase = root && root.dataset.phase;
        const turn = document.querySelector("[data-testid=live-face-turn]");
        const dir = cfg.follow && turn ? turn.dataset.dir : "center";
        let yaw = 0.09, pitch = 0.27, mouth = 0.01;
        // Eye-widths: 140 px. Lids 14 px apart at rest (0.1), mouth corners
        // 70 px apart (0.5).
        let lid = 14, mouthW = 70;
        if (dir === "left") yaw += 0.2;
        if (dir === "right") yaw -= 0.2;
        if (dir === "up") pitch -= 0.1;
        if (dir === "down") pitch += 0.1;
        if (dir === "mouth") mouth = 0.12;
        // Tilt: the whole mesh turned 14 degrees about the middle of the face.
        const lean = dir === "tilt" ? 14 * Math.PI / 180 : 0;
        if (dir === "smile") mouthW = 90;
        const m = Array.from({ length: 468 }, () => [0, 0, 0]);
        m[33] = [250, 200, 0]; m[263] = [390, 200, 0]; m[10] = [320, 100, 0]; m[152] = [320, 400, 0];
        m[1] = [320 + yaw * 140, 200 + pitch * 300, 0];
        m[13] = [320, 330, 0]; m[14] = [320, 330 + mouth * 300, 0];
        m[159] = [270, 200 - lid / 2, 0]; m[145] = [270, 200 + lid / 2, 0];
        m[386] = [370, 200 - lid / 2, 0]; m[374] = [370, 200 + lid / 2, 0];
        m[61] = [320 - mouthW / 2, 330, 0]; m[291] = [320 + mouthW / 2, 330, 0];
        if (lean) for (const pt of m) { const x = pt[0] - 320, y = pt[1] - 250; pt[0] = 320 + x * Math.cos(lean) - y * Math.sin(lean); pt[1] = 250 + x * Math.sin(lean) + y * Math.cos(lean); }
        window.__faceFrames = (window.__faceFrames || 0) + 1;
        return [{ box: [170, 90, 300, 300], mesh: m, score: 0.95, embedding: Array.from({ length: 128 }, (_, i) => Math.sin(i)), real: 0.9, live: 0.9 }];
      },
      similarity: () => 0.9
    };

  })();`;
}

// From Personal Details: open the check and take the photo, up to the
// "This is you" screen.
export async function takeLivePhoto(page, { open = true } = {}) {
  if (open) {
    await page.getByTestId("live-face-open").click();
  }
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid=live-face-check]");
    return el && (el.dataset.phase === "review" || el.dataset.phase === "fail");
  }, null, { timeout: 40000 });
  return page.evaluate(() => document.querySelector("[data-testid=live-face-check]").dataset.phase);
}

// From anywhere signed in: Profile → Personal Details → the photo → the live
// check → "Use this photo". Needs liveFaceFake() installed before the page
// loaded. Resolves once the check has closed (saved) or shows an error.
export async function takeProfileLivePhoto(page) {
  await page.getByRole("button", { name: "Profile", exact: true }).last().evaluate((n) => n.click());
  await page.getByRole("button", { name: "Gloobal ID — open your profile" }).evaluate((n) => n.click());
  await page.locator("[data-personal-profile]").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^(Change your photo|Add a photo)$/ }).click({ force: true });
  await page.getByTestId("live-face-check").waitFor({ timeout: 10000 });
  const phase = await takeLivePhoto(page);
  if (phase !== "review") throw new Error(`the live check ended on ${phase}`);
  await page.getByTestId("live-face-use").click();
  await Promise.race([
    page.getByTestId("live-face-check").waitFor({ state: "detached", timeout: 15000 }),
    page.getByTestId("live-face-save-error").waitFor({ timeout: 15000 })
  ]);
}
