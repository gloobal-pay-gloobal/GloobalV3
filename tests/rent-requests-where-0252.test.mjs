// tests/rent-requests-where-0252.test.mjs
//
// 0252: requests were sent and stored, and the Rent home showed their count,
// but its column was squeezed to one screen and the rows collapsed to nothing.
// The bell now leads to them; + More finds a place by pin code or name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const rs = readSource("frontend/features/rent/RentScreen.jsx");
const link = readSource("frontend/features/rent/rentLink.jsx");
const ui = readSource("frontend/features/rent/rentProfile.jsx");

test("the Rent home can't squeeze its rows away", () => {
  assert.match(rs, /gap: 13, minHeight: "100%", flexShrink: 0 \}\}>/);
});

test("back, Rent in the centre, and a bell that counts only what waits on me", () => {
  assert.match(rs, /<NavBackButton onClick=\{onClose\} \/><span style=\{\{ flex: 1, textAlign: "center"/);
  assert.match(rs, /data-testid="rent-bell"/);
  assert.match(rs, /const received = links\.filter\(rentLinkIsForMe\)\.length;/);
  assert.doesNotMatch(rs, /data-testid="rent-requests"/);
});

test("received requests offer accept and decline; what I sent can still be opened", () => {
  assert.match(link, /function RentRequestsPage\(/);
  assert.match(link, /GloobalApi\.declineRentLink\(l\.id\)/);
  assert.match(link, /data-testid="rent-sent"/);
});

test("a request arriving while Rent is open shows up", () => {
  assert.match(rs, /setInterval\(refresh, 30000\)/);
});

test("scrollbars are hidden across the app, and scrolling is not", () => {
  const css = readSource("gloobal-essentials-preview/src/styles/global.css");
  assert.match(css, /\*::-webkit-scrollbar \{\s*display: none;/);
});

test("+ More searches a place and clearing it goes back to my own location", () => {
  assert.match(ui, /rpChip\("km-more", "\+ More"/);
  assert.match(ui, /set\(\{ here: \{ lat: p\.lat, lng: p\.lng \}, place: p\.name, km: f\.km \|\| RP_KM_AROUND_PLACE \}\)/);
  assert.match(ui, /set\(\{ place: "", here: null, km: 0 \}\)/);
});

test("Rent finds a place with the same search as the map", () => {
  assert.match(ui, /GloobalApi\.geoSearch\(term\)/);
});

test("the Stamps screen draws no scroll bar of its own, which the rule above can't hide", () => {
  assert.doesNotMatch(readSource("frontend/features/identity/passportStamps.jsx"), /passport-scroll-thumb|thumbRef/);
});
