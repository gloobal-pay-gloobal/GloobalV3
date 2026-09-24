// tests/notifications-enable.test.mjs
//
// The Notifications sheet's Enable button must never be a silent no-op.
//
// ── The bug this file exists for ────────────────────────────────────────────
//
// Enable called askForPaymentNotifications(), which asks ONCE EVER (the
// gloobal.notifyAsked.v1 flag). The onboarding Alerts card or the
// post-payment offer usually spends that ask first. Dismiss it, and
// permission stays "default": the guard returned without calling
// Notification.requestPermission(), the sheet set "default" again, and the
// button just reappeared. A real grant then threw the subscribe result away,
// so a server with push disabled still looked like success.
//
// ── How this is tested ─────────────────────────────────────────────────────
//
// The REAL component, clicked in Chromium. The generated bundle is built with
// one extra line exporting NotificationsSheet, rendered open with
// pushState="default". Notification, the service worker and PushManager are
// stubbed in the page (headless Chromium has no push service), and the API is
// answered by Playwright routes, so every step of the click path is observed:
// requestPermission → /api/push/public-key → pushManager.subscribe →
// POST /api/push/subscribe (with the bearer token) → the row's final text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW = path.join(ROOT, "gloobal-essentials-preview");
const API = "https://gloobal-pay.onrender.com";

let env;
async function setup() {
  if (env) return env;
  execFileSync(process.execPath, [path.join(ROOT, "build_app.mjs")], { cwd: ROOT });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-notif-enable-"));
  const src = path.join(PREVIEW, "src");
  const bundleCopy = path.join(src, `__notif_sheet_bundle.${process.pid}.jsx`);
  const entry = path.join(src, `__notif_sheet_entry.${process.pid}.jsx`);
  fs.writeFileSync(
    bundleCopy,
    fs.readFileSync(path.join(src, "GloobalApp.jsx"), "utf8") + "\nexport { NotificationsSheet as __TestNotificationsSheet };\n"
  );
  fs.writeFileSync(
    entry,
    `import React from "react";
     import ReactDOM from "react-dom/client";
     import { __TestNotificationsSheet as Sheet } from "./${path.basename(bundleCopy)}";
     ReactDOM.createRoot(document.getElementById("root")).render(
       <Sheet open={true} onClose={() => {}} pushState="default" />
     );`
  );
  try {
    const esbuildEntry = createRequire(path.join(PREVIEW, "package.json")).resolve("esbuild");
    const esbuild = (await import(pathToFileURL(esbuildEntry).href)).default;
    esbuild.buildSync({
      entryPoints: [entry], bundle: true, jsx: "automatic",
      outfile: path.join(tmp, "app.js"), absWorkingDir: PREVIEW,
      define: { "process.env.NODE_ENV": '"development"' }, logLevel: "silent",
    });
  } finally {
    fs.rmSync(entry, { force: true });
    fs.rmSync(bundleCopy, { force: true });
  }
  fs.writeFileSync(path.join(tmp, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  const server = http.createServer((req, res) => {
    const file = req.url.startsWith("/app.js") ? "app.js" : "index.html";
    res.writeHead(200, { "Content-Type": file === "app.js" ? "text/javascript" : "text/html" });
    res.end(fs.readFileSync(path.join(tmp, file)));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  env = { tmp, server, browser, origin: `http://127.0.0.1:${server.address().port}` };
  return env;
}
test.after(async () => {
  if (!env) return;
  await env.browser.close();
  env.server.close();
  fs.rmSync(env.tmp, { recursive: true, force: true });
});

// A valid-looking P-256 public key; the stub PushManager never decodes it
// beyond the app's own base64url → bytes conversion.
const PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

// Opens the sheet with the browser answering `permissionAnswer` to the
// prompt, and the server reporting push `enabled`. Returns what happened.
async function openSheet({ permissionAnswer, enabled = true, asked = true, signedIn = true, subscribeStatus = 201 }) {
  const { browser, origin } = await setup();
  const context = await browser.newContext();
  const calls = { publicKey: 0, subscribe: [] };
  await context.route(`${API}/**`, async (route) => {
    const req = route.request();
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (url.pathname === "/api/push/public-key") {
      calls.publicKey += 1;
      return json(200, { success: true, enabled, publicKey: enabled ? PUBLIC_KEY : null });
    }
    if (url.pathname === "/api/push/subscribe") {
      calls.subscribe.push({ auth: req.headers()["authorization"] || "", body: req.postDataJSON() });
      return json(subscribeStatus, subscribeStatus < 300 ? { success: true, promotional: false } : { success: false, message: "boom" });
    }
    if (url.pathname.startsWith("/api/notifications")) return json(200, { success: true, notifications: [], unreadCount: 0 });
    return json(404, { success: false });
  });
  const page = await context.newPage();
  await page.addInitScript(({ permissionAnswer, asked, signedIn }) => {
    window.__prompts = 0;
    window.__subscribes = 0;
    let permission = "default";
    class FakeNotification { constructor() {} }
    Object.defineProperty(FakeNotification, "permission", { get: () => permission });
    FakeNotification.requestPermission = async () => {
      window.__prompts += 1;
      permission = permissionAnswer;
      return permissionAnswer;
    };
    window.Notification = FakeNotification;
    window.PushManager = function PushManager() {};
    const pushManager = {
      permissionState: async () => (permission === "granted" ? "granted" : permission === "denied" ? "denied" : "prompt"),
      getSubscription: async () => null,
      subscribe: async (opts) => {
        window.__subscribes += 1;
        return {
          endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
          options: opts,
          toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint", keys: { p256dh: "BPp256dhKeyForTest", auth: "authSecret" } }),
          unsubscribe: async () => true,
        };
      },
    };
    const registration = { pushManager, showNotification: async () => {} };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve(registration), addEventListener() {}, removeEventListener() {}, getRegistration: async () => registration },
    });
    if (asked) localStorage.setItem("gloobal.notifyAsked.v1", "true");
    if (signedIn) {
      localStorage.setItem("gloobal.session.v1", JSON.stringify({
        user: { symbolId: "TESTID", mobileNumber: "+911111111111" }, token: "test-bearer-token", savedAt: Date.now(),
      }));
    }
  }, { permissionAnswer, asked, signedIn });
  const warnings = [];
  page.on("console", (m) => { if (m.type() === "warning") warnings.push(m.text()); });
  await page.goto(origin);
  const button = page.getByRole("button", { name: "Enable" });
  await button.waitFor({ timeout: 15000 });
  await button.click();
  // Wait for the row to leave its in-flight state.
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "…"), null, { timeout: 15000 });
  await page.waitForTimeout(150);
  const status = await page.locator('[role="status"]').allTextContents();
  const buttons = await page.getByRole("button").allTextContents();
  const prompts = await page.evaluate(() => window.__prompts);
  const subscribes = await page.evaluate(() => window.__subscribes);
  await context.close();
  return { calls, status: status.join(" "), buttons, prompts, subscribes, warnings };
}

test("Enable prompts even after the once-only ask was spent, and subscribes", async () => {
  const r = await openSheet({ permissionAnswer: "granted", asked: true });
  assert.equal(r.prompts, 1, "requestPermission must be called by the tap");
  assert.equal(r.calls.publicKey, 1, "fetches the VAPID public key");
  assert.equal(r.subscribes, 1, "pushManager.subscribe is called");
  assert.equal(r.calls.subscribe.length, 1, "POST /api/push/subscribe is sent");
  assert.equal(r.calls.subscribe[0].auth, "Bearer test-bearer-token", "as the signed-in account");
  assert.equal(r.calls.subscribe[0].body.endpoint, "https://fcm.googleapis.com/fcm/send/test-endpoint");
  assert.equal(r.status, "", "the prompt row is gone once subscribed");
  assert.ok(!r.buttons.includes("Enable"));
});

test("server without VAPID: says so instead of pretending to succeed", async () => {
  const r = await openSheet({ permissionAnswer: "granted", enabled: false });
  assert.equal(r.prompts, 1);
  assert.equal(r.calls.subscribe.length, 0, "nothing to subscribe to");
  assert.match(r.status, /can't send them to devices yet/);
  assert.ok(r.buttons.includes("Try again"));
});

test("prompt dismissed: explains, and Enable stays available", async () => {
  const r = await openSheet({ permissionAnswer: "default" });
  assert.equal(r.prompts, 1);
  assert.match(r.status, /weren't turned on/);
  assert.ok(r.buttons.includes("Enable"));
});

test("permission denied: settings path, no button", async () => {
  const r = await openSheet({ permissionAnswer: "denied" });
  assert.match(r.status, /blocked for Gloobal/);
  assert.ok(!r.buttons.includes("Enable") && !r.buttons.includes("Try again"));
});

test("subscribe rejected by the server: visible failure, logged, retryable", async () => {
  const r = await openSheet({ permissionAnswer: "granted", subscribeStatus: 500 });
  assert.equal(r.calls.subscribe.length, 1);
  assert.match(r.status, /Couldn't turn on notifications/);
  assert.ok(r.buttons.includes("Try again"));
  assert.ok(r.warnings.some((w) => /enabling notifications did not complete/.test(w)), "the error is logged, not swallowed");
});

test("signed out: no subscribe attempt, and it says why", async () => {
  const r = await openSheet({ permissionAnswer: "granted", signedIn: false });
  assert.equal(r.calls.publicKey, 0);
  assert.match(r.status, /Sign in to turn on notifications/);
});
