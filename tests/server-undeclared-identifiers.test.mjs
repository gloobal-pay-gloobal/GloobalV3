// tests/server-undeclared-identifiers.test.mjs
//
//   node --test tests/server-undeclared-identifiers.test.mjs
//
// Nothing in server.js may reference a name that is not declared in it.
//
// ── The failure this is built for ──────────────────────────────────────
//
// Removing the GEU growth prototype deleted a block of server.js that
// happened to contain resolveOwnCurrency. POST /api/assets/claim-interest
// survives the removal and calls it on every claim.
//
// Every check in the project passed. `node --check server.js` validates
// syntax, and the syntax was fine. The bundle built. The frontend suites
// were green. The financial-principles suite was green — it tests the
// browser's domain simulation, which does not import server.js at all. The
// defect existed only at request time:
//
//   ReferenceError: resolveOwnCurrency is not defined
//       at server.js:5433:27
//   FAIL a second claim pays nothing — status=500 claimed=undefined
//
// It was caught by asset-seed-integrity.test.mjs, which needs MONGO_URI and
// a replica set, takes thirteen seconds, and had never been run in the
// sandbox where the deletion was written. That is a real test doing real
// work, and it should stay. But it is the expensive way to learn that a
// name is missing.
//
// This is the cheap way. No database, no network, no server boot, about a
// second — and it fails on the same defect.
//
// ── Why the problem is specific to this file ───────────────────────────
//
// server.js is one ~10,000-line script in a single scope, and function
// declarations hoist across the whole of it. A helper at the bottom is
// callable from the top. That is ordinary JavaScript, and it means a
// deletion at line 10,816 can break a route at line 5,449 with no overlap
// in the diff, no import to update, and nothing for a reviewer reading the
// patch to notice.
//
// The same hazard is why tools/frontend/scan-undeclared.mjs exists for the
// concatenated bundle. This is its counterpart for the server.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { undeclaredIn } from "../tools/backend/scan-server-undeclared.mjs";

const SERVER = fileURLToPath(new URL("../server/server.js", import.meta.url));

test("every identifier server.js references is declared somewhere in it", () => {
  const findings = undeclaredIn(SERVER);

  assert.deepEqual(
    findings,
    [],
    findings.length
      ? `server.js references ${findings.length} name(s) it never declares. Each one is a ReferenceError at ` +
        `request time for whichever route reaches it first:\n` +
        findings.map((f) => `  server.js:${f.line}  ${f.name}`).join("\n") +
        `\n\nIf a name was deleted along with a block it happened to sit in, restore the ` +
        `declaration rather than the block.`
      : undefined
  );
});

// The guard on the guard. A scanner that cannot fail is worse than no
// scanner, because it reads as coverage.
test("and the scanner would actually notice if one went missing", () => {
  const { readFileSync, writeFileSync, mkdtempSync } = require_fs();
  const { join } = require_path();
  const { tmpdir } = require_os();

  // A file that calls something it never declares — the shape of the real
  // defect, reduced to four lines.
  const dir = mkdtempSync(join(tmpdir(), "undeclared-"));
  const broken = join(dir, "broken.js");
  writeFileSync(broken, [
    "function live(user) {",
    "  return helperThatWasDeleted(user);",
    "}",
    "module.exports = { live };",
  ].join("\n"));

  const findings = undeclaredIn(broken);
  assert.equal(findings.length, 1, "the scanner missed a name with no binding anywhere");
  assert.equal(findings[0].name, "helperThatWasDeleted");

  // And it does not cry wolf over a name that IS declared, further down the
  // file than its use — which is the whole reason the real bug was invisible.
  const fine = join(dir, "fine.js");
  writeFileSync(fine, [
    "function live(user) {",
    "  return helperDeclaredLater(user);",
    "}",
    "function helperDeclaredLater(user) { return user; }",
    "module.exports = { live };",
  ].join("\n"));

  assert.deepEqual(undeclaredIn(fine), [], "the scanner flagged a hoisted declaration as missing");
});

// node:test files are ESM here; these three are needed only inside the second
// test and are pulled in lazily rather than at module load.
function require_fs() { return globalThis.process.getBuiltinModule("node:fs"); }
function require_path() { return globalThis.process.getBuiltinModule("node:path"); }
function require_os() { return globalThis.process.getBuiltinModule("node:os"); }
