// tests/rent-profile-0249.test.mjs
//
// 0249: an owner's rent profile — a rent name of its own (first.second,
// unique across GLOOBAL, shop names included), listings (room / PG bed,
// flat / house, shop / office, parking / other) with photos, the same cost
// and conditions a connected rent carries, an exact pin — found in GLOOBAL
// Bazaar → Rent, where anyone can Request to rent (terms filled in from the
// listing) or Chat. The whole flow ran end to end with two phones against a
// real server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const srv = readSource("server/lib/rentProfile.js");
const ui = readSource("frontend/features/rent/rentProfile.jsx");

test("a rent name is free of every shop name and every other rent name", () => {
  assert.match(srv, /if \(await creatorHandleTaken\(built\.handle, null\)\) return \{ ok: false, code: 'taken', message: 'A shop already has that name\.' \};/);
  assert.match(readSource("server/server.js"), /if \(await RentProfile\.exists\(\{ handle \}\)\) return true;/, "and a shop can't take a rent name");
});

test("a listing carries the same terms a connected rent does, and an exact pin", () => {
  assert.match(srv, /const terms = cleanTerms\(/);
  assert.match(srv, /if \(!Number\.isFinite\(lat\) \|\| !Number\.isFinite\(lng\)/);
  assert.match(srv, /const PHOTO_MAX = 6;/);
});

test("Bazaar shows only active listings, by type, rent and distance", () => {
  assert.match(srv, /const match = \{ status: 'active' \};/);
  assert.match(srv, /match\['terms\.rent'\] = \{ \$lte: max \};/);
  // 0251: the second Rent card in Bazaar is gone; the search is inside Rent.
  assert.doesNotMatch(readSource("frontend/features/bazaar/bazaar.jsx"), /data-testid="bazaar-rent-entry"|RentBazaarScreen/);
});

test("0251: one Rent — its search bar, type chips and filter find what is to rent", () => {
  const rs = readSource("frontend/features/rent/RentScreen.jsx");
  assert.match(rs, /data-testid="rent-find-search"/);
  assert.match(rs, /data-testid=\{`rent-find-type-\$\{key\}`\}/);
  assert.match(rs, /data-testid="rent-find-filter"/);
  assert.match(rs, /const finding = !!\(findQ\.trim\(\) \|\| findType \|\| findBrowse \|\| rentFindActive\(findF\)\);/);
  assert.match(rs, /\{finding \? <RentFind q=\{findQ\} type=\{findType\} filters=\{findF\}/, "results replace own rent while finding");
  assert.match(rs, /const clearFind = \(\) => \{ setFindQ\(""\); setFindType\(""\); setFindBrowse\(false\);/, "clear brings own rent back");
  assert.doesNotMatch(ui, /function RentBazaarScreen/);
  assert.match(ui, /function RentFind\(\{ q, type, filters, onCount, onToast \}\)/);
  assert.match(ui, /function RentFilterSheet\(/);
  assert.match(ui, /RP_KM_CHIPS = \[\[2, "Near me · 2 km"\], \[5, "Near me · 5 km"\], \[0, "Anywhere"\]\]/);
  assert.match(ui, /\$\{count\} to rent/);
});

test("a request from a listing starts from the listing's terms", () => {
  assert.match(readSource("server/lib/rentLink.js"), /proposal: \{ name, rent, dueDay, moveIn, listingId \},/);
  assert.match(readSource("frontend/features/rent/rentLink.jsx"), /rlDraftFrom\(link\.listingTerms \|\| null, link\.proposal\)/);
  assert.match(ui, /listingId: l\.id/);
});

test("the owner's mobile number is never in a listing", () => {
  const out = srv.slice(srv.indexOf("function listingOut"), srv.indexOf("function cleanListing"));
  assert.doesNotMatch(out, /mobileNumber/);
  assert.match(out, /owner\.fullName && !owner\.nameIsMobile \? owner\.fullName/, "a name that is only a mobile number is not shown");
});

test("in the bundle before the Rent screen that opens it", () => {
  const b = readSource("build_app.mjs");
  assert.ok(b.indexOf('"features/rent/rentProfile.jsx"') > 0 && b.indexOf('"features/rent/rentProfile.jsx"') < b.indexOf('"features/rent/RentScreen.jsx"'));
});
