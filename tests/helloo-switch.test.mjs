// tests/helloo-switch.test.mjs — HELLOO_SOCIAL=off (or HELLOO / SOCIAL) turns those routes off.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../server/package.json", import.meta.url));
const { hellooSwitch } = require("./lib/hellooSwitch");

const hit = (sw, path) => { let out = "next"; const res = { status: (s) => ({ json: (b) => { out = [s, b.code]; } }) }; sw.middleware({ path }, res, () => {}); return out; };

test("on by default: nothing is closed", () => {
  const sw = hellooSwitch({});
  assert.deepEqual([sw.helloo, sw.social], [true, true]);
  for (const p of ["/api/helloo/chats", "/api/social/feed", "/api/work/cards", "/api/paylater/me"]) assert.equal(hit(sw, p), "next");
});

test("HELLOO_SOCIAL=off closes Helloo, Social and Work, and nothing of GLOOBAL", () => {
  const sw = hellooSwitch({ HELLOO_SOCIAL: "off" });
  assert.deepEqual([sw.helloo, sw.social], [false, false]);
  for (const p of ["/api/helloo/chats", "/api/helloo", "/api/social/feed", "/api/work/cards"]) assert.deepEqual(hit(sw, p), [404, "not_open"]);
  for (const p of ["/api/paylater/me", "/api/essentials/me", "/api/transactions/send", "/api/hellooish", "/api/socialx"]) assert.equal(hit(sw, p), "next");
});

test("each on its own", () => {
  const h = hellooSwitch({ HELLOO: "false" });
  assert.deepEqual([h.helloo, h.social, hit(h, "/api/helloo/calls"), hit(h, "/api/social/feed")], [false, true, [404, "not_open"], "next"]);
  const s = hellooSwitch({ SOCIAL: "0" });
  assert.deepEqual([s.helloo, s.social, hit(s, "/api/helloo/calls"), hit(s, "/api/work/x")], [true, false, "next", [404, "not_open"]]);
});

test("server.js puts the switch in front of Helloo and Social, and the live socket follows it", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../server/server.js", import.meta.url), "utf8");
  assert.ok(src.indexOf("app.use(hellooSocial.middleware)") < src.indexOf("helloo.mount(app, requireAuth)"));
  assert.ok(src.indexOf("app.use(hellooSocial.middleware)") < src.indexOf("createSocial({"));
  assert.match(src, /if \(hellooSocial\.helloo\) helloo\.attachLive\(httpServer\);/);
});
