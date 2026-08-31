// lib/auditTrail.js — the AuditLog write path.
//
//   node --test tests/audit-trail.test.mjs
//
// A pure unit test: no database, no server, no network. That is the point of
// the module existing separately from server.js — the property under test is
// "this can never hurt its caller", and the only honest way to check it is to
// hand it a model that fails in each of the ways a real one can.
//
// Audit finding GLB-24. The behaviour being locked in:
//
//   1. An asynchronous write failure is swallowed  (was already true)
//   2. A SYNCHRONOUS throw is swallowed too        (was NOT true — it
//      propagated into the calling route, and at the call sites inside the
//      money-moving Mongo transaction would have aborted the payment)
//   3. Every failure is counted and kept, so broken audit logging is
//      discoverable instead of being one line on stderr

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

const { createAuditRecorder } = require(join(BACKEND, "lib/auditTrail"));

// Swallows the console.error the recorder is supposed to emit, so a passing
// run stays readable, and keeps the lines for assertions.
const collectingLogger = () => {
  const lines = [];
  return { lines, error: (message) => lines.push(String(message)) };
};

const REQ = { ip: "203.0.113.7", headers: { "user-agent": "test-agent" } };

test("a successful write is counted and the caller sees nothing", async () => {
  const rows = [];
  const logger = collectingLogger();
  const { recordAudit, auditHealth } = createAuditRecorder(
    { create: async (row) => { rows.push(row); return row; } },
    { logger }
  );

  await recordAudit({ action: "test.ok", status: "success", message: "fine", req: REQ });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "test.ok");
  assert.equal(rows[0].ipAddress, "203.0.113.7");
  assert.equal(rows[0].userAgent, "test-agent");
  assert.deepEqual(logger.lines, []);

  const health = auditHealth();
  assert.equal(health.written, 1);
  assert.equal(health.failed, 0);
});

test("an ASYNCHRONOUS write failure never reaches the caller, and is counted", async () => {
  const logger = collectingLogger();
  const { recordAudit, auditHealth } = createAuditRecorder(
    { create: async () => { throw new Error("connection reset by peer"); } },
    { logger }
  );

  // The assertion is that this line does not throw.
  await recordAudit({ action: "test.async-fail", req: REQ });

  const health = auditHealth();
  assert.equal(health.failed, 1, "the failure was counted");
  assert.equal(health.callerFaults, 0, "a dropped connection is not the caller's fault");
  assert.equal(health.written, 0);
  assert.match(health.lastError, /connection reset/);
  assert.equal(health.lastAction, "test.async-fail");
  assert.equal(logger.lines.length, 1);
});

test("a SYNCHRONOUS throw never reaches the caller either — the regression this fix exists for", async () => {
  const logger = collectingLogger();
  // The old implementation was `Model.create({...}).catch(...)`. A model that
  // throws before returning a promise — Mongoose casting a metadata value it
  // refuses, or the model reference simply being wrong — produced no promise
  // for `.catch` to attach to, so the exception escaped into the route.
  const { recordAudit, auditHealth } = createAuditRecorder(
    { create: () => { throw new TypeError("Cannot read properties of undefined"); } },
    { logger }
  );

  let escaped = null;
  try {
    await recordAudit({ action: "test.sync-throw", req: REQ });
  } catch (error) {
    escaped = error;
  }

  assert.equal(escaped, null, "a synchronous throw must not escape recordAudit");
  assert.equal(auditHealth().failed, 1);
  assert.equal(auditHealth().written, 0);
});

test("calling it without awaiting cannot produce an unhandled rejection", async () => {
  const logger = collectingLogger();
  const { recordAudit } = createAuditRecorder(
    { create: async () => { throw new Error("write timeout"); } },
    { logger }
  );

  // This is how every call site in server.js actually calls it: fire and
  // forget, inside a route, mid-transaction. An unhandled rejection here
  // would take the process down under Node's default settings.
  let unhandled = null;
  const onUnhandled = (reason) => { unhandled = reason; };
  process.on("unhandledRejection", onUnhandled);

  recordAudit({ action: "test.fire-and-forget", req: REQ });
  await new Promise((resolve) => setTimeout(resolve, 50));

  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, null);
});

test("a record the CALLER built wrong is reported differently from a transient failure", async () => {
  const logger = collectingLogger();
  const validationError = new Error("AuditLog validation failed: action: Path `action` is required.");
  validationError.name = "ValidationError";

  const { recordAudit, auditHealth } = createAuditRecorder(
    { create: async () => { throw validationError; } },
    { logger }
  );

  await recordAudit({ action: "test.invalid", req: REQ });

  const health = auditHealth();
  assert.equal(health.failed, 1);
  assert.equal(health.callerFaults, 1, "a ValidationError is a bug in the call site, not weather");
  assert.match(logger.lines[0], /REJECTED/, "and it says so, so it can be alerted on separately");
});

test("a model whose create() returns a non-promise does not blow up", async () => {
  const logger = collectingLogger();
  const { recordAudit, auditHealth } = createAuditRecorder(
    { create: () => undefined },
    { logger }
  );

  await recordAudit({ action: "test.nonthenable", req: REQ });

  assert.equal(auditHealth().failed, 0);
  assert.deepEqual(logger.lines, []);
});

test("health survives a mixed run and reports the last failure", async () => {
  const logger = collectingLogger();
  let failNext = false;
  const { recordAudit, auditHealth } = createAuditRecorder(
    { create: async () => { if (failNext) throw new Error("boom"); return {}; } },
    { logger }
  );

  await recordAudit({ action: "a" });
  failNext = true;
  await recordAudit({ action: "b" });
  failNext = false;
  await recordAudit({ action: "c" });

  const health = auditHealth();
  assert.equal(health.written, 2);
  assert.equal(health.failed, 1);
  assert.equal(health.lastAction, "b");
  assert.ok(health.lastErrorAt instanceof Date);
});
