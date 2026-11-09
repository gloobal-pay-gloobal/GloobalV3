// tests/local-copy.test.mjs
//
// The phone's saved copy (backend/services/storage/localCopy.js), through the
// real request layer (backend/services/api/httpClient.js), in a real browser
// with real IndexedDB. The server is a Playwright route that can be switched
// off, which is what "no signal" or "Render still waking" look like to the app.
//
//   node --test tests/local-copy.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url);
const src = (p) => fs.readFileSync(new URL(p, ROOT), "utf8");
const API = "https://gloobal-pay.onrender.com";
const PAGE = "https://app.gloobal.test/";

let browser;
before(async () => {
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); });

// A page holding just the two files under test, plus the two session
// functions they call. `window.T` exposes what the tests drive.
async function rig() {
  const context = await browser.newContext();
  const server = { up: true, balance: 5000, status: 200, hits: [] };
  await context.route(PAGE, (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>t</title>" }));
  await context.route(`${API}/**`, async (r) => {
    server.hits.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
    if (!server.up) return r.abort("internetdisconnected");
    const path = new URL(r.request().url()).pathname;
    if (server.status !== 200) return r.fulfill({ status: server.status, contentType: "application/json", body: JSON.stringify({ message: "no", code: "nope" }) });
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ path, balance: server.balance }) });
  });
  const page = await context.newPage();
  await page.goto(PAGE);
  const code = `
    var session = { user: { symbolId: "SANJEEV", mobileNumber: "+919999900000" } };
    function gloobalSessionReadRaw() { return session; }
    var token = "tok";
    function gloobalAuthToken() { return token; }
    function gloobalAuthTokenSave(t) { token = t; }
    function gloobalAuthTokenClear() { token = null; }
    ${src("backend/services/storage/localCopy.js")}
    ${src("backend/services/api/httpClient.js")}
    const events = [];
    window.addEventListener(GLOOBAL_LOCAL_COPY_EVENT, (e) => events.push(["saved", e.detail.path, e.detail.at]));
    window.addEventListener(GLOOBAL_LOCAL_COPY_LIVE_EVENT, (e) => events.push(["live", e.detail.path]));
    window.T = {
      events,
      get: (p, o) => gloobalApiClient.get(p, Object.assign({ timeoutMs: 3000 }, o)).then((d) => ({ ok: d }), (e) => ({ err: e.status })),
      post: (p, b) => gloobalApiClient.post(p, b, { timeoutMs: 3000 }).then((d) => ({ ok: d }), (e) => ({ err: e.status })),
      as: (user) => { session = user ? { user } : null; },
      signOut: () => gloobalLocalCopyClear(),
      settle: () => new Promise((r) => setTimeout(r, 150)),
    };`;
  await page.addScriptTag({ type: "module", content: code });
  await page.waitForFunction(() => !!window.T);
  return { page, server, context };
}

test("a good answer is kept; with no server, the saved copy comes back and says so", async () => {
  const { page, server } = await rig();
  const first = await page.evaluate(async () => { const r = await T.get("/api/bank/SANJEEV"); await T.settle(); return r; });
  assert.equal(first.ok.balance, 5000);
  server.up = false;
  const offline = await page.evaluate(() => T.get("/api/bank/SANJEEV"));
  assert.deepEqual(offline.ok, { path: "/api/bank/SANJEEV", balance: 5000 }, "the saved copy");
  const events = await page.evaluate(() => T.events);
  assert.equal(events.at(-1)[0], "saved");
  assert.ok(Date.now() - events.at(-1)[2] < 60000, "stamped with when it was saved");
  // Back online: the live answer wins, and the app is told it's live again.
  server.up = true; server.balance = 4200;
  const live = await page.evaluate(async () => { const r = await T.get("/api/bank/SANJEEV"); await T.settle(); return r; });
  assert.equal(live.ok.balance, 4200);
  assert.equal((await page.evaluate(() => T.events)).at(-1)[0], "live");
});

test("nothing saved yet: no server is still an error, not an empty balance", async () => {
  const { page, server } = await rig();
  server.up = false;
  assert.deepEqual(await page.evaluate(() => T.get("/api/bank/SANJEEV")), { err: 0 });
});

test("a real answer from the server, even a refusal, is never replaced by the saved copy", async () => {
  const { page, server } = await rig();
  await page.evaluate(async () => { await T.get("/api/bank/SANJEEV"); await T.settle(); });
  server.status = 403;
  assert.deepEqual(await page.evaluate(() => T.get("/api/bank/SANJEEV")), { err: 403 });
});

test("payments and other writes never come from the phone", async () => {
  const { page, server } = await rig();
  await page.evaluate(async () => { await T.get("/api/bank/SANJEEV"); await T.settle(); });
  server.up = false;
  assert.deepEqual(await page.evaluate(() => T.post("/api/transactions/send", { amount: 10 })), { err: 0 });
  assert.deepEqual(await page.evaluate(() => T.post("/api/bank/SANJEEV", {})), { err: 0 }, "a POST to a saved path is still a write");
});

test("only the account's own views are kept, and liveOnly skips the copy", async () => {
  const { page, server } = await rig();
  await page.evaluate(async () => {
    await T.get("/api/users/resolve?identifier=X");
    await T.get("/api/coin/supply");
    await T.get("/api/transactions/history/SANJEEV");
    await T.settle();
  });
  server.up = false;
  const r = await page.evaluate(async () => [
    await T.get("/api/users/resolve?identifier=X"),
    await T.get("/api/coin/supply"),
    await T.get("/api/transactions/history/SANJEEV"),
    await T.get("/api/transactions/history/SANJEEV", { liveOnly: true }),
  ]);
  assert.deepEqual(r[0], { err: 0 }, "someone else's lookup");
  assert.deepEqual(r[1], { err: 0 }, "the coin's public page");
  assert.equal(r[2].ok.path, "/api/transactions/history/SANJEEV");
  assert.deepEqual(r[3], { err: 0 }, "a caller that needs the live answer");
});

test("another account on the same phone never sees the first one's copy; sign-out wipes it", async () => {
  const { page, server } = await rig();
  await page.evaluate(async () => { await T.get("/api/bank/SANJEEV"); await T.settle(); });
  server.up = false;
  await page.evaluate(() => T.as({ symbolId: "OTHER", mobileNumber: "+911111100000" }));
  assert.deepEqual(await page.evaluate(() => T.get("/api/bank/SANJEEV")), { err: 0 }, "different account");
  await page.evaluate(() => T.as({ symbolId: "SANJEEV", mobileNumber: "+919999900000" }));
  assert.equal((await page.evaluate(() => T.get("/api/bank/SANJEEV"))).ok.balance, 5000, "the owner still has it");
  await page.evaluate(async () => { await T.signOut(); });
  assert.deepEqual(await page.evaluate(() => T.get("/api/bank/SANJEEV")), { err: 0 }, "gone after sign-out");
  await page.evaluate(() => T.as(null));
  assert.deepEqual(await page.evaluate(() => T.get("/api/bank/SANJEEV")), { err: 0 }, "signed out: nothing");
});

test("sign-out and a rejected token are wired to wipe the copies; the banner is mounted", () => {
  assert.match(src("backend/services/api/sessionStore.js"), /function gloobalSessionClear\(\)[\s\S]*gloobalLocalCopyClear\(\)/);
  const http = src("backend/services/api/httpClient.js");
  assert.match(http, /gloobalAuthTokenClear\(\);\s*if \(typeof gloobalLocalCopyClear === "function"\) gloobalLocalCopyClear\(\);/);
  assert.match(src("frontend/__artifactEntry.jsx"), /<SavedCopyBanner \/>/);
  const build = src("build_app.mjs");
  assert.ok(build.indexOf('"services/storage/localCopy.js"') < build.indexOf('"services/api/httpClient.js"'), "before the client");
  assert.match(src("frontend/features/identity/liveFaceCheck.jsx"), /cacheModels: true/);
});
