// server/lib/auditTrail.js
//
// The AuditLog write path, lifted out of server.js so it can be tested
// directly against a stub model instead of only through a live HTTP request.
//
// ── What this is, and what it deliberately is not ────────────────────────
//
// An audit write is an observability side-channel. It must never be able to
// fail, slow down, or change the outcome of the request it is describing —
// a payment that moved money correctly must not be turned into a 500 because
// the log line for it could not be persisted. That design decision is not up
// for revision here; it is why every call site can call this inline, without
// awaiting, in the middle of a money-moving route.
//
// ── What was actually wrong (audit finding GLB-24) ───────────────────────
//
// The previous implementation was:
//
//   AuditLog.create({...}).catch((error) => console.error(...));
//
// Two problems, one of them a real hazard:
//
//  1. It only caught ASYNCHRONOUS failure. `AuditLog.create(...)` can throw
//     synchronously — a malformed metadata value that Mongoose rejects while
//     casting, or (the case that actually matters) the model reference being
//     undefined. A synchronous throw is not a rejected promise, so `.catch`
//     never sees it: the exception propagates out of recordAudit, into the
//     route that called it, and — for the call sites inside a money-moving
//     Mongo transaction — aborts that transaction. A logging helper that can
//     abort a payment is the exact opposite of what this is for.
//
//  2. Every failure was equally invisible. One line on stderr, no count, no
//     way for anything to notice that audit logging had been silently broken
//     for a week. "Swallowed" and "unnoticed" are different properties, and
//     only the first one is intentional.
//
// So: still fire-and-forget, still never throws into its caller — but now it
// cannot escape by the synchronous door either, and every failure is counted
// and kept, so a health check or a test can see that writes are failing.
// Nothing here is fail-closed; the call sites are unchanged.

// Failures are grouped by whether they are worth waking somebody for.
//
// A ValidationError/CastError means the CALLER built a bad audit record —
// that is a bug in server.js, it will recur on every identical request, and
// no amount of retrying fixes it. Anything else (a dropped connection, a
// replica-set election, a write timeout) is transient infrastructure noise
// that says nothing about the code.
const isCallerFault = (error) =>
  error?.name === 'ValidationError' ||
  error?.name === 'CastError' ||
  error?.name === 'StrictModeError';

/**
 * Builds a recorder bound to an AuditLog model.
 *
 * Injecting the model rather than requiring it keeps this unit-testable: a
 * test can hand in a stub whose create() rejects, or throws synchronously,
 * and assert that the caller is unaffected either way.
 *
 * @param {{ create: Function }} AuditLog
 * @param {{ logger?: Console }} [options]
 */
function createAuditRecorder(AuditLog, { logger = console } = {}) {
  const health = {
    written: 0,
    failed: 0,
    callerFaults: 0,
    lastError: null,
    lastErrorAt: null,
    lastAction: null,
  };

  const noteFailure = (action, error) => {
    health.failed += 1;
    health.lastError = error?.message || String(error);
    health.lastErrorAt = new Date();
    health.lastAction = action;

    if (isCallerFault(error)) {
      health.callerFaults += 1;
      // Named distinctly from the transient case so it can be alerted on
      // separately: this one is a bug in the call site, not weather.
      logger.error(
        `AuditLog REJECTED action "${action}" — the record itself is invalid, so every ` +
        `request of this shape will fail the same way. This is a bug in the caller, ` +
        `not a transient write failure: ${health.lastError}`
      );
      return;
    }

    logger.error(`AuditLog write failed for action "${action}": ${health.lastError}`);
  };

  /**
   * Records one audit row. Returns a promise that ALWAYS resolves — call
   * sites are free to ignore it, and awaiting it can never reject.
   */
  function recordAudit({ userId = null, action, status = 'info', message = '', req = null, metadata = {} }) {
    // The synchronous half. Building the document, and the create() call
    // itself, both run inside this try — which is the whole point of the
    // fix: a throw from either used to escape into the calling route.
    try {
      const pending = AuditLog.create({
        userId,
        action,
        status,
        message,
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '',
        userAgent: req?.headers?.['user-agent'] || '',
        metadata,
      });

      // A stub (or a future model) that returns something non-thenable must
      // not make this blow up on `.then`.
      if (!pending || typeof pending.then !== 'function') {
        health.written += 1;
        return Promise.resolve();
      }

      return pending.then(
        () => { health.written += 1; },
        (error) => { noteFailure(action, error); }
      );
    } catch (error) {
      noteFailure(action, error);
      return Promise.resolve();
    }
  }

  /**
   * A snapshot of how audit logging is actually going. Read by tests, and
   * available to anything that wants to notice writes have stopped landing.
   */
  function auditHealth() {
    return { ...health };
  }

  return { recordAudit, auditHealth };
}

module.exports = { createAuditRecorder };
