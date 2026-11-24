// tests/care-screens.test.mjs
//
// People I look after, on the phone (frontend/features/care/). The helper's
// session for someone's account goes through the REAL request layer
// (httpClient.js + localCopy.js + gloobalApi.js) in a real browser:
//
//   • every call in their account carries the helper's session for it, not
//     this phone's own sign-in, and a renewal from the server changes only
//     that session;
//   • it is never stored — not as this phone's sign-in, not in the phone's
//     saved copy of reads — so their balance and history never end up
//     filed under the helper;
//   • when the server stops accepting it (an hour passed, the helper
//     stepped back), this phone stays signed in as itself.
//
// Then the screens: where they are opened from, and what they send.
//
//   node --test tests/care-screens.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url);
const src = (p) => fs.readFileSync(new URL(p, ROOT), "utf8");
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const API = "https://gloobal-pay.onrender.com";
// What gloobalApi.js names when it loads, from sessionStore.js.
const SESSION_STUBS = "function gloobalSessionSave() {} function gloobalSessionLoad() { return null; } function gloobalSessionClear() {}";
const PAGE = "https://app.gloobal.test/";

let browser;
before(async () => {
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); });

async function rig() {
  const context = await browser.newContext();
  const server = { up: true, hits: [], expire: false };
  await context.route(PAGE, (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>t</title>" }));
  await context.route(`${API}/**`, async (r) => {
    const url = new URL(r.request().url());
    const auth = (r.request().headers().authorization || "").replace("Bearer ", "");
    server.hits.push([r.request().method(), url.pathname, auth]);
    if (!server.up) return r.abort("internetdisconnected");
    const json = (status, body, headers) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "X-Gloobal-Token", ...(headers || {}) }, body: JSON.stringify(body) });
    if (auth.startsWith("ACT")) {
      if (server.expire) return json(401, { success: false, code: "auth_token_invalid", message: "Your session has expired." });
      // The server renews a helper's session as it would any other.
      if (url.pathname === "/api/essentials/me") return json(200, { success: true, balance: 450, currency: "INR", leftToday: 200 }, { "X-Gloobal-Token": "ACT-2" });
      return json(200, { success: true, transactions: [{ id: "t1" }], path: url.pathname });
    }
    if (url.pathname === "/api/care/people/d1/open") return json(200, { success: true, token: "ACT-1", person: { id: "d1" } });
    return json(200, { success: true, balance: 20000, path: url.pathname });
  });
  const page = await context.newPage();
  await page.goto(PAGE);
  const script = `
    var session = { user: { symbolId: "SANJEEV", mobileNumber: "+919999900000" } };
    function gloobalSessionReadRaw() { return session; }
    var token = "OWN";
    function gloobalAuthToken() { return token; }
    function gloobalAuthTokenSave(t) { token = t; }
    function gloobalAuthTokenClear() { token = null; }
    ${SESSION_STUBS}
    ${src("backend/services/storage/localCopy.js")}
    ${src("backend/services/api/httpClient.js")}
    ${src("backend/services/api/gloobalApi.js")}
    const events = [];
    window.addEventListener(GLOOBAL_LOCAL_COPY_EVENT, (e) => events.push(["saved", e.detail.path]));
    window.addEventListener(GLOOBAL_LOCAL_COPY_LIVE_EVENT, (e) => events.push(["live", e.detail.path]));
    window.addEventListener(GLOOBAL_SESSION_EXPIRED_EVENT, () => events.push(["signedOut"]));
    window.T = { events, api: GloobalApi, own: () => token, settle: () => new Promise((r) => setTimeout(r, 200)) };`;
  await page.addScriptTag({ type: "module", content: script });
  await page.waitForFunction(() => !!window.T);
  return { page, server };
}

test("their account is reached with the helper's session for it, and renewing it changes nothing else", async () => {
  const { page, server } = await rig();
  const out = await page.evaluate(async () => {
    const opened = await T.api.careOpen("d1", "123456");
    const s = T.api.careSession(opened.token);
    const e = await s.essentials();
    const h = await s.history("RIYA");
    await T.settle();
    return { opened, e, h, own: T.own(), events: T.events };
  });
  assert.equal(out.opened.ok, true);
  assert.equal(out.opened.token, "ACT-1");
  assert.equal(out.e.ok, true);
  assert.equal(out.e.balance, 450);
  assert.equal(out.h.transactions.length, 1);
  const hits = server.hits.map(([m, p, a]) => `${m} ${p} ${a}`);
  assert.deepEqual(hits, [
    "POST /api/care/people/d1/open OWN",
    "GET /api/essentials/me ACT-1",
    "GET /api/transactions/history/RIYA ACT-2",
  ], "opened with the phone's own sign-in; inside, the helper's session, renewed in place");
  assert.equal(out.own, "OWN", "this phone is still signed in as itself");
  assert.deepEqual(out.events.filter((e) => e[0] === "saved" || e[0] === "live"), [], "nothing from their account is kept on the phone");
});

test("with no answer, their account is not served from the phone's saved copy", async () => {
  const { page, server } = await rig();
  // The helper's own Essentials, read and saved the ordinary way.
  await page.evaluate(async () => { await T.api.getEssentials(); await T.settle(); });
  server.up = false;
  const r = await page.evaluate(async () => T.api.careSession("ACT-1").essentials());
  assert.equal(r.ok, false);
  assert.equal(r.status, 0, "no answer is no answer");
  assert.equal(r.code, "unreachable");
  assert.equal(r.balance, undefined, "not the helper's own saved figures");
});

test("when the server stops accepting the helper's session, the phone stays signed in", async () => {
  const { page, server } = await rig();
  server.expire = true;
  const out = await page.evaluate(async () => {
    const r = await T.api.careSession("ACT-1").essentials();
    await T.settle();
    return { r, own: T.own(), events: T.events };
  });
  assert.equal(out.r.ok, false);
  assert.equal(out.r.status, 401);
  assert.equal(out.r.code, "auth_token_invalid");
  assert.equal(out.own, "OWN");
  assert.ok(!out.events.some((e) => e[0] === "signedOut"), "no sign-out for the phone");
});

test("the care calls never throw: a refusal comes back as the server's words", async () => {
  const context = await browser.newContext();
  await context.route(PAGE, (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>t</title>" }));
  await context.route(`${API}/**`, (r) => r.fulfill({ status: 409, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ success: false, code: "bank_closed", message: "Open your own GLOOBAL Bank first." }) }));
  const page = await context.newPage();
  await page.goto(PAGE);
  await page.addScriptTag({ type: "module", content: `
    function gloobalSessionReadRaw() { return null; }
    function gloobalAuthToken() { return "OWN"; }
    function gloobalAuthTokenSave() {}
    function gloobalAuthTokenClear() {}
    ${SESSION_STUBS}
    ${src("backend/services/storage/localCopy.js")}
    ${src("backend/services/api/httpClient.js")}
    ${src("backend/services/api/gloobalApi.js")}
    window.T = { api: GloobalApi };` });
  await page.waitForFunction(() => !!window.T);
  const r = await page.evaluate(() => T.api.careAdd({ name: "Kabir Sharma" }));
  assert.deepEqual([r.ok, r.status, r.code, r.message], [false, 409, "bank_closed", "Open your own GLOOBAL Bank first."]);
  await context.close();
});

test("the screens are in the build and opened from My Essentials", () => {
  const build = src("build_app.mjs");
  for (const f of ["features/care/CarePeopleScreen.jsx", "features/care/CareHelperPanel.jsx"]) {
    assert.ok(build.includes(`"${f}"`), `${f} is built`);
  }
  const ess = code("frontend/features/essentials/EssentialsScreen.jsx");
  assert.match(ess, /<CareEntryCard\b/);
  assert.match(ess, /<CarePeopleScreen onClose=/);
  // The old children card is gone for good: a child is a person of their own now.
  assert.doesNotMatch(ess, /EssentialsChildrenCard|addEssentialsChild/);
});

test("adding someone sends what the server checks: their document, who the helper is to them, and an adult's yes", () => {
  const s = code("frontend/features/care/CarePeopleScreen.jsx");
  assert.match(s, /GloobalApi\.careAdd\(\{\s*name: name\.trim\(\), birthDate: birth, relationship, relationshipNote:/);
  assert.match(s, /document: \{ kind, number: number\.trim\(\) \}/);
  assert.match(s, /consent: adult \? consent : undefined/);
  assert.match(s, /guardianship: adult && consent === "guardianship" \? \{ number: order\.trim\(\) \} : undefined/);
  // Every relationship the server takes, and only those.
  const server = fs.readFileSync(new URL("server/models/CareLink.js", ROOT), "utf8");
  const theirs = JSON.parse(server.match(/const RELATIONSHIPS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const ours = [...s.matchAll(/\{ kind: "(\w+)", label: "[^"]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(ours, theirs);
});

test("inside their account: payments ask for the helper's PIN and go out on the helper's session", () => {
  const p = code("frontend/features/care/CareHelperPanel.jsx");
  assert.match(p, /GloobalApi\.careSession\(token\)/);
  assert.match(p, /session\.current\.send\(\{/);
  assert.match(p, /session\.current\.draw\(left, generateRequestId\(\)\)/);
  assert.match(p, /<GloobalPinPanel testid="care-helper-pin"/);
  // Nothing in the panel signs the phone in, or keeps the session anywhere.
  assert.doesNotMatch(p, /GloobalApi\.sendTransaction|gloobalAuthTokenSave|localStorage|sessionStorage/);
  const people = code("frontend/features/care/CarePeopleScreen.jsx");
  assert.doesNotMatch(people, /gloobalAuthTokenSave|localStorage|sessionStorage/);
});
