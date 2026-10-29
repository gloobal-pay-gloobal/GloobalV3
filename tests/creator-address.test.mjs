// tests/creator-address.test.mjs
//
// The creator's address in parts — shop no., street & area, landmark, PIN,
// city, state — with "Detect my location", PIN lookup, and Directions for
// customers. The privacy rule did not move: nobody but the owner gets the
// text OR the map point unless the address is public.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const server = () => readSource("server/server.js");
const fields = () => readSource("frontend/features/creator/creatorAddress.jsx");

function serverFn(name) {
  const src = server();
  const at = src.indexOf(`function ${name}(`);
  const end = src.indexOf("\n}\n", at) + 3;
  return src.slice(at, end);
}

const ctx = vm.createContext({});
vm.runInContext(`var CREATOR_ADDRESS_LIMITS = { line1: 120, area: 120, landmark: 100, pin: 10, city: 60, state: 60 };
${serverFn("creatorAddressPartsIn")}
${serverFn("creatorAddressCompose")}
${serverFn("geoPartsFromNominatim")}`, ctx);

test("the parts compose into the one line older readers use", () => {
  const r = ctx.creatorAddressPartsIn({ line1: "C-482", area: "Surya  Nagar", landmark: "Hanuman Mandir", pin: "301001", city: "Alwar", state: "Rajasthan" });
  assert.equal(r.ok, true);
  assert.equal(ctx.creatorAddressCompose(r.value), "C-482, Surya Nagar, Near Hanuman Mandir, Alwar, Rajasthan 301001");
});

test("a PIN, a map point and each part are checked", () => {
  assert.equal(ctx.creatorAddressPartsIn({ pin: "30<1>" }).code, "invalid_pin");
  assert.equal(ctx.creatorAddressPartsIn({ lat: 91, lng: 10 }).code, "invalid_location");
  assert.equal(ctx.creatorAddressPartsIn({ landmark: "x".repeat(101) }).code, "invalid_address");
  assert.equal(ctx.creatorAddressPartsIn({ pin: "SW1A 1AA" }).ok, true, "a UK postcode fits");
  const p = ctx.creatorAddressPartsIn({ lat: 27.55301234567, lng: 76.6346 }).value;
  assert.equal(p.lat, 27.553012, "rounded to about 11cm");
});

test("GPS puts the road in the street box, not the shop number", () => {
  const p = ctx.geoPartsFromNominatim({ road: "Kala Kuan Road", suburb: "Surya Nagar", city: "Alwar", state: "Rajasthan", postcode: "301001" });
  assert.equal(p.line1, "");
  assert.equal(p.area, "Kala Kuan Road, Surya Nagar");
  assert.equal(p.city, "Alwar");
  assert.equal(p.pin, "301001");
});

test("the point is public only when the address is", () => {
  assert.match(server(), /addressParts: profile\.addressPublic \? creatorAddressPartsOut\(profile\.addressParts\) : null,/);
  assert.match(server(), /set\['creatorProfile\.address'\] = creatorAddressCompose\(parts\.value\);/);
  assert.match(readSource("frontend/features/creator/CreatorPage.jsx"),
    /creator\.addressPublic && creatorAddressHasPoint\(creator\.addressParts\) \? <a/);
});

test("lookups go through our server, identified and cached", () => {
  const s = server();
  assert.match(s, /app\.get\('\/api\/geo\/reverse', lookupLimit, requireAuth,/);
  assert.match(s, /app\.get\('\/api\/geo\/pin\/:pin', lookupLimit, requireAuth,/);
  assert.match(s, /'User-Agent': GEO_USER_AGENT/);
  assert.match(s, /https:\/\/api\.postalpincode\.in\/pincode\/\$\{pin\}/);
  // The app's CSP allows only its own API — the phone never calls these.
  assert.ok(!/nominatim|postalpincode/.test(fields()));
});

test("detection never overwrites the landmark, and an old one-line address survives", () => {
  const f = fields();
  assert.match(f, /for \(const k of \["area", "city", "state", "pin"\]\) if \(parts\[k\]\) next\[k\] = parts\[k\];/);
  assert.match(f, /if \(!next\.line1 && parts\.line1\) next\.line1 = parts\.line1;/);
  assert.ok(!/next\.landmark =/.test(f));
  assert.match(f, /function creatorAddressInitial\(creator\)/);
  assert.match(readSource("frontend/features/creator/CreatorSetupScreen.jsx"), /useState53\(\(\) => creatorAddressInitial\(creator\)\)/);
});
