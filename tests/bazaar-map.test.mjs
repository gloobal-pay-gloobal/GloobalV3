// tests/bazaar-map.test.mjs
//
// Near me on a map: OpenStreetMap tiles at the zoom that fits the circle,
// pins by the same projection, credit on the map, and the tile host
// allowed in the CSP and nowhere else.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const map = () => readSource("frontend/features/bazaar/bazaarMap.jsx");

function fns() {
  const s = map();
  const ctx = vm.createContext({ Math });
  vm.runInContext(s.slice(s.indexOf("var BAZAAR_MAP_TILE"), s.indexOf("function BazaarMap(")), ctx);
  return ctx;
}

test("the circle fits the map at the chosen zoom", () => {
  const f = fns();
  for (const km of [0.5, 1, 2, 5, 10]) {
    const z = f.bazaarMapZoom(27.55, km, 320);
    const px = (km * 1000 * 2) / f.bazaarMapMpp(27.55, z);
    assert.ok(px <= 320, `${km} km is ${Math.round(px)}px wide at zoom ${z}`);
    assert.ok(px > 320 / 2.3 / 2.2, `${km} km is needlessly small at zoom ${z}`);
  }
});

test("pins use the tiles' own projection", () => {
  const f = fns();
  const p = f.bazaarMapWorldPx(0, 0, 0);
  assert.ok(Math.abs(p.x - 128) < 1e-9 && Math.abs(p.y - 128) < 1e-9, "0,0 is the centre of the world tile");
});

test("credit on the map, and the CSP allows the tile host", () => {
  assert.match(map(), /© OpenStreetMap contributors/);
  assert.match(map(), /https:\/\/tile\.openstreetmap\.org\/\$\{zoom\}\/\$\{wx\}\/\$\{ty\}\.png/);
  const toml = readSource("netlify.toml");
  assert.match(toml, /img-src 'self' data: blob: [^;]*https:\/\/tile\.openstreetmap\.org;/);
  assert.match(toml, /connect-src 'self' https:\/\/gloobal-pay\.onrender\.com;/, "connect-src is unchanged");
});

test("the server sends points only with Near me, rounded", () => {
  const s = readSource("server/server.js");
  assert.match(s, /row\.lat = Math\.round\(Number\(a\.lat\) \* 1e4\) \/ 1e4;/);
  assert.match(s, /lat: near \? r\.lat : null,/);
  assert.match(readSource("frontend/features/bazaar/bazaar.jsx"), /\{near && asMap \? <BazaarMap center=\{here\}/);
});
