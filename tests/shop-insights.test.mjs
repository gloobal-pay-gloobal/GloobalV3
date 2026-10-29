// tests/shop-insights.test.mjs
//
// Owner insights: views, scans and item taps counted per shop per day,
// readable only by the owner, never counting the owner, never storing who.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const server = () => readSource("server/server.js");

test("only the owner can read insights", () => {
  assert.match(server(), /app\.get\('\/api\/creator\/:symbolId\/insights', lookupLimit, requireAuth, requireSelf\('symbolId'\),/);
});

test("the owner's own visits do not count, and a person counts once a day", () => {
  const s = server();
  assert.match(s, /if \(symbolId && symbolId === req\.authUser\.symbolId\) return res\.json\(\{ success: true, counted: false \}\);/);
  assert.match(s, /if \(!creatorStatOnce\(`\$\{type\}\|\$\{req\.authUser\._id\}\|\$\{symbolId\}`\)\) return/);
});

test("counters, not a log of who looked", () => {
  const m = readSource("server/models/CreatorStat.js");
  assert.match(m, /views: \{ type: Number, default: 0 \}/);
  assert.ok(!/viewer|userId|fromUser/i.test(m.replace(/\/\/.*$/gm, "")), "no viewer id is stored");
});

test("views, scans and taps are recorded where they happen", () => {
  const page = readSource("frontend/features/creator/CreatorPage.jsx");
  assert.match(page, /if \(!isOwner && creator && creator\.symbolId\) GloobalApi\.creatorEvent\(creator\.symbolId, "view"\);/);
  assert.match(page, /GloobalApi\.creatorEvent\(creator\.symbolId, "item", id\);/);
  assert.match(readSource("frontend/App.jsx"), /if \(named\) GloobalApi\.creatorEvent\(parsed\.gloobalId, "scan"\);/);
  assert.match(page, /\{ key: "insights", label: "Insights", Icon: BarChartInsights,/);
  assert.match(page, /\{insightsOpen && isOwner \? <ShopInsightsSheet/);
});
