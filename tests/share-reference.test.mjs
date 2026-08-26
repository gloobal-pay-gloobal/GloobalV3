// tests/share-reference.test.mjs
//
// A Creator Share reference must be minted in the same alphabet as the
// payment reference it sits beside.
//
// They appear together on one receipt — "Share transaction ID" above "From
// payment" — and until now one was twenty Gloobal symbols and the other was
// `GLOOBAL-SHR-DXNLE3AXRQ2`. Two identifiers for two halves of the same
// movement, printed inches apart, looking like they came from different
// systems.
//
// The deeper reason is the one the ID system exists for. A Gloobal ID is
// symbols rather than letters so that it reads identically to someone who
// reads no Latin script. An identifier spelling DXNLE3AXRQ2 quietly opts out
// of that promise, on the one screen where a person is most likely to be
// copying a value down or reading it to somebody else.
//
// This exercises the REAL generator rather than a copy of it, which means
// loading a server module whose siblings need mongoose. The two models it
// pulls in are only used inside mintShareLegAndReceipts — never by the
// generator — so a stub is enough to get the module loaded, and stubbing is
// honest here in a way that reimplementing the generator would not be.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { ROOT, readSource } from "./harness.mjs";

const GLOOBAL_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const REFERENCE_LENGTH = 20;

let createShareReferenceId;
let tmp;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-share-ref-"));
  fs.mkdirSync(path.join(tmp, "lib"));
  fs.mkdirSync(path.join(tmp, "models"));
  fs.copyFileSync(
    path.join(ROOT, "server/lib/merchantShareFlow.js"),
    path.join(tmp, "lib/merchantShareFlow.js")
  );
  for (const model of ["Transaction", "Receipt"]) {
    fs.writeFileSync(
      path.join(tmp, "models", `${model}.js`),
      "module.exports = { create: async () => ({}) };\n"
    );
  }
  const require = createRequire(import.meta.url);
  ({ createShareReferenceId } = require(path.join(tmp, "lib/merchantShareFlow.js")));
});

after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe("a share reference is written in the Gloobal alphabet", () => {
  test("it is exactly twenty symbols", () => {
    for (let i = 0; i < 200; i += 1) {
      // Spread, not .length — these are multi-byte characters and a plain
      // .length would count code units, quietly passing a 20-code-unit
      // string that is not 20 symbols.
      assert.equal([...createShareReferenceId()].length, REFERENCE_LENGTH);
    }
  });

  test("every character comes from the eight symbols", () => {
    for (let i = 0; i < 200; i += 1) {
      for (const ch of createShareReferenceId()) {
        assert.ok(GLOOBAL_SYMBOLS.includes(ch), `"${ch}" is not a Gloobal symbol`);
      }
    }
  });

  test("no Latin letters, digits or prefix survive", () => {
    // The specific regression: `GLOOBAL-SHR-DXNLE3AXRQ2`.
    for (let i = 0; i < 200; i += 1) {
      const reference = createShareReferenceId();
      assert.ok(!/[A-Za-z0-9-]/.test(reference), `still contains Latin characters: ${reference}`);
    }
  });

  test("it matches the shape of a PAYMENT reference exactly", () => {
    // The whole point. If server.js ever changes its own length or
    // alphabet, this fails rather than letting the two drift apart again.
    const server = readSource("server/server.js");
    const paymentLength = Number(
      (server.match(/TRANSACTION_REFERENCE_LENGTH = (\d+)/) || [])[1]
    );
    const paymentAlphabet = (server.match(/const GLOOBAL_SYMBOLS = \[([^\]]+)\]/) || [])[1];
    assert.equal(paymentLength, REFERENCE_LENGTH, "payment reference length changed");
    for (const symbol of GLOOBAL_SYMBOLS) {
      assert.ok(paymentAlphabet.includes(symbol), `payment alphabet lost ${symbol}`);
    }
  });

  test("references do not repeat", () => {
    // Not a uniqueness guarantee — the unique index on referenceId is what
    // actually enforces that, and a collision surfaces as a rejected write.
    // This only catches a generator that has stopped being random at all,
    // which is the failure that would otherwise pass every check above.
    const references = new Set();
    for (let i = 0; i < 5000; i += 1) references.add(createShareReferenceId());
    assert.equal(references.size, 5000);
  });

  test("all eight symbols actually get used", () => {
    // A generator with an off-by-one in its index range would silently drop
    // the last symbol and still satisfy every test above it.
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      for (const ch of createShareReferenceId()) seen.add(ch);
    }
    assert.equal(seen.size, GLOOBAL_SYMBOLS.length, `only ${seen.size} of 8 symbols appear`);
  });

  test("it is minted with crypto randomness, not Math.random", () => {
    // This identifies money. Math.random is predictable across a process.
    const source = readSource("server/lib/merchantShareFlow.js");
    const at = source.indexOf("function randomSymbolReference");
    // Strip comments first. The function's own comment says "crypto
    // .randomInt, not Math.random" — grepping the prose as if it were code
    // makes the explanation of the rule look like a violation of it.
    const generator = source.slice(at, at + 400).replace(/^\s*\/\/.*$/gm, "");
    assert.match(generator, /crypto\.randomInt/);
    assert.ok(!/Math\.random/.test(generator), "the reference must not be minted with Math.random");
  });
});
