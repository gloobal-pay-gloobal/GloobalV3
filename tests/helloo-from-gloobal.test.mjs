// Helloo from GLOOBAL: a Helloo row in the Profile list that opens Helloo,
// and a Helloo button on the GLOOBAL QR card that opens Helloo's "Send to…"
// with the pay link — beside Share, which still opens the phone's own sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const qr = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");

test("the QR card has a Helloo button that sends the pay link to Helloo", () => {
  assert.match(qr, /var GLOOBAL_HELLOO_APP = "https:\/\/gloobalhelloo\.netlify\.app";/);
  assert.match(qr, /\/\?sharetext=\$\{encodeURIComponent\(/);
  assert.match(qr, /data-testid="qr-share-helloo"[\s\S]{0,200}gloobalOpenHelloo\(`[\s\S]{0,140}\$\{payload\}`\)/);
  assert.match(qr, /onClick=\{handleShare\}/, "the phone's own share sheet is still there");
});

test("the Profile list has a Helloo row with Helloo's mark, opening Helloo", () => {
  assert.match(dash, /\["Helloo", "Sound pay", "Complaints & reports"\]/);
  assert.match(dash, /label === "Helloo"\s*\?\s*gloobalOpenHelloo\(""\)/);
  assert.match(dash, /label === "Helloo" && <GloobalHellooMark/);
});
