// tests/names-mix-and-brands.test.mjs
//
// Patch 0136, the founder's asks:
//   - र and R together in one word: alphabets may mix in a name part, but
//     never letters that look the same (Latin with Cyrillic/Greek/Armenian);
//   - the big brands reserved as EITHER part of a creator name, in Hindi
//     spellings too — only when TAKING a name, never when looking one up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const require = createRequire(join(ROOT, "server", "package.json"));
const reservedBrands = require(join(ROOT, "server/lib/reservedBrands.js"));
const server = readSource("server/server.js");
const PURE = server.slice(server.indexOf("const CREATOR_HANDLE_PART_MAX"), server.indexOf("async function creatorHandleTaken"));
const { buildCreatorHandle, creatorBrandRefusal } = new Function("reservedBrands",
  `${PURE}\n return { buildCreatorHandle, creatorBrandRefusal };`)(reservedBrands);

test("र and R in one part are a name now", () => {
  for (const [a, b] of [["रR", ""], ["Rघर", ""], ["rasoiघर", "ghar"], ["chaiवाला", ""]]) {
    const built = buildCreatorHandle(a, b);
    assert.equal(built.ok, true, `${a}.${b} was refused: ${built.message}`);
  }
});

test("letters that look the same still cannot be mixed", () => {
  const built = buildCreatorHandle("rаsoi", "ghar"); // one Cyrillic а
  assert.equal(built.ok, false);
  assert.equal(built.code, "mixed_scripts");
  assert.equal(buildCreatorHandle("rasοi", "").code, "mixed_scripts"); // Greek ο
});

test("the brands are reserved as either part, and in Hindi", () => {
  const no = (a, b) => creatorBrandRefusal(buildCreatorHandle(a, b), "");
  for (const [a, b] of [["netflix", ""], ["netflix", "india"], ["india", "netflix"], ["Amazon", ""], ["नेटफ्लिक्स", ""], ["अमेज़ॉन", "store"], ["tata", ""], ["जियो", ""], ["flipkart", "deals"]]) {
    const r = no(a, b);
    assert.ok(r && r.code === "reserved_brand", `${a}.${b} was not reserved`);
  }
  assert.match(no("netflix", "").message, /kept for the brand Netflix/);
  for (const [a, b] of [["rasoi", "ghar"], ["रसोई", "घर"], ["sharma", "sweets"], ["chai", "point"], ["gupta", "kirana"]]) {
    assert.equal(no(a, b), null, `${a}.${b} was reserved by mistake`);
  }
  assert.ok(reservedBrands.RESERVED_BRANDS.length >= 500, "fewer than 500 brands");
});

test("a shop that held a brand name before keeps it, and lookups still find it", () => {
  assert.equal(creatorBrandRefusal(buildCreatorHandle("amazon", "store"), "amazon.store"), null);
  // Only the taking routes check brands; buildCreatorHandle itself does not.
  assert.equal(buildCreatorHandle("netflix", "").ok, true);
  assert.equal((server.match(/= creatorBrandRefusal\(built, /g) || []).length, 2);
});
