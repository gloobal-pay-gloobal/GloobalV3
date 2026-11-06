// tests/bazaar-map.test.mjs
//
// 0253: the Bazaar map. A real map with other businesses taken out, shops by
// their own logo, details on a tap, Start to directions, and an owner placing
// their own pin. The browser run of all this is described in the map's PR; these
// hold the rules in place.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readSource } from "./harness.mjs";

const require = createRequire(import.meta.url);
const gm = () => readSource("frontend/features/bazaar/gloobalMap.jsx");
const map = () => readSource("frontend/features/bazaar/bazaarMap.jsx");

function cleanStyle() {
  const s = gm();
  const ctx = vm.createContext({ Math });
  vm.runInContext(s.slice(s.indexOf("function gloobalMapCleanStyle"), s.indexOf("function useGloobalMap")), ctx);
  return ctx;
}

test("only GLOOBAL's shops are marked: other businesses come out of the map", () => {
  const f = cleanStyle();
  const out = f.gloobalMapCleanStyle({ layers: [{ id: "road", type: "line", "source-layer": "transportation" }, { id: "shop", type: "symbol", "source-layer": "poi" }, { id: "b3d", type: "fill-extrusion", "source-layer": "building" }] });
  assert.deepEqual(Array.from(out.layers, (l) => l.id), ["road"]);
  assert.match(gm(), /transformStyle: \(_, next\) => gloobalMapCleanStyle\(next\)/);
});

test("the circle is the size asked for", () => {
  const ring = cleanStyle().gloobalMapCircle(27.55, 76.63, 2).geometry.coordinates[0];
  assert.ok(Math.abs(Math.abs(ring[18][1] - 27.55) * 110.574 - 2) < 0.01);
  assert.deepEqual(Array.from(ring[0]), Array.from(ring[ring.length - 1]), "closed");
});

test("the map library loads only when a map opens, and under the site's policy", () => {
  assert.match(gm(), /import\("maplibre-gl\/dist\/maplibre-gl-csp\.js"\)/);
  const toml = readSource("netlify.toml");
  assert.match(toml, /connect-src 'self' https:\/\/gloobal-pay\.onrender\.com https:\/\/tiles\.openfreemap\.org;/);
  assert.match(toml, /worker-src 'self';/, "no blob: worker");
  assert.match(gm(), /new lib\.AttributionControl/, "the map's data requires its credit");
});

test("a logo is the pin, a tap gives details, Start goes to directions", () => {
  assert.match(map(), /data-testid="map-pin"[\s\S]*<BusinessMark name=\{s\.handle \|\| ""\} logo=\{s\.logo\}/);
  assert.match(map(), /onClick=\{\(e\) => \{ e\.stopPropagation\(\); pick\(s\); \}\}/);
  assert.match(map(), /creatorAddressDirectionsUrl\(\{ lat: shop\.lat, lng: shop\.lng \}\)/);
  assert.match(map(), /straight line/, "the distance says what it is");
});

test("a shop with no point is never drawn at the middle of the ocean", () => {
  const s = map();
  const ctx = vm.createContext({ Number });
  vm.runInContext(s.slice(s.indexOf("function bazaarMapHasPoint"), s.indexOf("\n", s.indexOf("function bazaarMapHasPoint"))), ctx);
  assert.equal(ctx.bazaarMapHasPoint({ lat: null, lng: null }), false);
  assert.equal(ctx.bazaarMapHasPoint({ lat: 27.5, lng: 76.6 }), true);
});

test("only a public, pinned address is on the map, and points are rounded", () => {
  const s = readSource("server/server.js");
  assert.match(s, /match\['creatorProfile\.addressPublic'\] = true;/);
  assert.match(s, /'creatorProfile\.listed': \{ \$ne: false \}, 'creatorProfile\.hiddenByGloobal': \{ \$ne: true \}/);
  assert.match(s, /row\.lat = Math\.round\(Number\(a\.lat\) \* 1e4\) \/ 1e4;/);
  assert.match(s, /lat: near \? r\.lat : null,/);
  assert.match(s, /address: near \? r\.address : null,/);
});

test("a list stays ten shops; a map shows the whole circle", () => {
  const b = require("../server/lib/bazaar.js");
  const rows = Array.from({ length: 80 }, (_, i) => ({ _id: `u${i}`, handle: `shop${i}`, distanceM: i }));
  const vol = new Map();
  assert.equal(b.bazaarRank(rows, vol, {}).length, 10);
  assert.equal(b.bazaarRank(rows, vol, { limit: b.BAZAAR_MAP_RESULT_LIMIT }).length, 60);
});

test("an owner places the pin, and can't confirm from too far out", () => {
  assert.match(gm(), /disabled=\{!map \|\| !close\}/);
  assert.match(gm(), /GLOOBAL_MAP_PIN_MIN_ZOOM = 15/);
  const addr = readSource("frontend/features/creator/creatorAddress.jsx");
  assert.match(addr, /<GloobalPinScreen start=/);
  // A landmark and a shop number are the owner's: reading a map never overwrites them.
  assert.match(addr, /for \(const k of \["area", "city", "state", "pin"\]\) if \(parts\[k\]\) next\[k\] = parts\[k\];/);
});

test("place search and address reads share one request a second", () => {
  const s = readSource("server/server.js");
  assert.match(s, /app\.get\('\/api\/geo\/search', lookupLimit, requireAuth,/);
  assert.match(s, /if \(String\(url\)\.includes\('nominatim\.openstreetmap\.org'\)\) await geoNominatimWait\(\);/);
});
