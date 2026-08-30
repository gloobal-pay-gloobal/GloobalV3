// tests/cold-start.test.mjs
//
// The most-reported bug in the app: "sometimes it fails to load balance when
// I register or re-login".
//
// It was never intermittent. The backend is a Render FREE instance, which
// spins down after ~15 minutes without traffic — its own logs show four
// separate instance ids starting in one day, with multi-hour gaps. The
// balance read is the FIRST call the app makes on reaching the dashboard, so
// opening the app after a break lands on a cold start essentially every
// time, and a single unreachable response painted "balance unavailable" and
// left it there until the person found Retry themselves.
//
// The codebase already knew about cold starts — gloobalApiIsUnreachable and
// GLOOBAL_API_WAKING_MESSAGE exist and are used by login and registration.
// The balance read simply never used that knowledge. These tests hold the
// retry to the two rules that make it safe.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const domain = loadDomain([
  "gloobalApiWithWakeRetry",
  "GloobalApiError",
  "GLOOBAL_API_WAKE_RETRY_DELAYS_MS"
]);

// status 0 is what the client reports when a request got no answer at all —
// a timeout, an offline moment, or a container still booting.
const unreachable = () => new domain.GloobalApiError("no answer", 0);
const realError = (status) => new domain.GloobalApiError("nope", status);

describe("a waking server is retried; an awake one is not", () => {
  test("succeeds without retrying when the server answers", async () => {
    let calls = 0;
    const outcome = await domain.gloobalApiWithWakeRetry(async () => {
      calls += 1;
      return { balance: 10000 };
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.balance, 10000);
    assert.equal(calls, 1, "an awake server must not be called twice");
  });

  test("retries through a cold start and returns the eventual answer", async () => {
    // The real scenario: the first few attempts hit a booting container,
    // then it comes up.
    let calls = 0;
    const outcome = await domain.gloobalApiWithWakeRetry(async () => {
      calls += 1;
      if (calls < 3) throw unreachable();
      return { balance: 4200 };
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.balance, 4200);
    assert.equal(calls, 3);
  });

  for (const status of [401, 404, 500]) {
    test(`a ${status} fails immediately — it is a real answer, not a wake-up`, async () => {
      // Retrying these would delay a legitimate error by half a minute, and
      // on a route with side effects could repeat them.
      let calls = 0;
      const outcome = await domain.gloobalApiWithWakeRetry(async () => {
        calls += 1;
        throw realError(status);
      });
      assert.equal(outcome.ok, false);
      assert.equal(outcome.error.status, status);
      assert.equal(calls, 1, `a ${status} must not be retried`);
    });
  }

  test("gives up after the configured attempts rather than retrying forever", async () => {
    let calls = 0;
    const outcome = await domain.gloobalApiWithWakeRetry(async () => {
      calls += 1;
      throw unreachable();
    });
    assert.equal(outcome.ok, false);
    assert.equal(calls, domain.GLOOBAL_API_WAKE_RETRY_DELAYS_MS.length + 1);
  });

  test("reports that it is waking, so the UI need not call it an error", async () => {
    const waking = [];
    await domain.gloobalApiWithWakeRetry(
      async () => { throw unreachable(); },
      { onWaking: (n) => waking.push(n) }
    );
    assert.deepEqual(waking, [1, 2, 3, 4]);
  });

  test("stops the moment the caller is cancelled", async () => {
    // The screen can be left, or the account switched, part-way through a
    // ~37-second window. Continuing would apply one account's balance to
    // whoever is signed in by the time it lands.
    let calls = 0;
    let cancelled = false;
    const outcome = await domain.gloobalApiWithWakeRetry(
      async () => { calls += 1; throw unreachable(); },
      { isCancelled: () => cancelled, onWaking: () => { cancelled = true; } }
    );
    assert.equal(outcome.cancelled, true);
    assert.equal(calls, 1, "must not keep attempting after cancellation");
  });

  test("never throws — a wake-up inside an effect must not become an unhandled rejection", async () => {
    const outcome = await domain.gloobalApiWithWakeRetry(async () => {
      throw new Error("something entirely unexpected");
    });
    assert.equal(outcome.ok, false);
    assert.ok(outcome.error);
  });

  test("the delays climb rather than repeat", () => {
    // A cold start is a container booting, not a dropped packet. Asking
    // every second does not make it boot faster.
    const delays = domain.GLOOBAL_API_WAKE_RETRY_DELAYS_MS;
    for (let i = 1; i < delays.length; i += 1) {
      assert.ok(delays[i] > delays[i - 1], `delay ${i} (${delays[i]}) must exceed ${delays[i - 1]}`);
    }
    const total = delays.reduce((a, b) => a + b, 0);
    assert.ok(total >= 30000, `only ${total}ms of patience — a Render spin-up takes longer`);
  });
});

describe("the account hydration actually uses it", () => {
  const app = readSource("frontend/App.jsx");
  // Anchored on the hydration cycle itself — the ONE code path the first
  // read, the refresh control and pull-to-refresh all share. Wiring the
  // retry anywhere else would leave two of those three uncovered.
  const at = app.indexOf("const hydrateAccount = useCallback11");
  const cycle = app.slice(at, app.indexOf("const hydrateAccountRef", at));

  test("the hydration cycle is found where the test expects it", () => {
    // If this fails the slice below is asserting against nothing, and every
    // test under it would pass vacuously.
    assert.ok(at > 0, "hydrateAccount not found in App.jsx");
    assert.ok(cycle.length > 500, "hydration cycle slice looks wrong");
  });

  test("the reads go through the wake retry", () => {
    assert.match(cycle, /gloobalApiWithWakeRetry\(/);
    assert.match(cycle, /GloobalApi\.getProfile\(symbolId\)/);
  });

  test("assets and PayLater are retried WITH the profile, not left behind", () => {
    // They are inside the retried attempt. A cold start takes all three
    // down together, and recovering only the balance would leave the seed
    // list and the PayLater due silently empty until the next refresh.
    const attemptStart = cycle.indexOf("gloobalApiWithWakeRetry(");
    const attemptEnd = cycle.indexOf("isCancelled:");
    assert.ok(attemptEnd > attemptStart, "options must follow the attempt");
    const attempt = cycle.slice(attemptStart, attemptEnd);
    assert.match(attempt, /GloobalApi\.getAssets\(symbolId\)/);
    assert.match(attempt, /GloobalApi\.getPaylater\(symbolId\)/);
  });

  test("only an UNREACHABLE profile asks for another pass", () => {
    // Rethrowing on any rejection would turn a 401 into a 37-second wait.
    assert.match(cycle, /gloobalApiIsUnreachable\(profile\.reason\)/);
  });

  test("waking is a distinct state from error", () => {
    // "Still starting up" and "could not be loaded" are different things to
    // tell someone, and only one of them deserves a red error.
    assert.match(cycle, /setBalanceStatus\("waking"\)/);
    assert.match(cycle, /setBalanceStatus\("error"\)/);
  });

  test("a switched account never has a balance written onto it", () => {
    assert.match(cycle, /isCancelled: \(\) => hydratedForRef\.current !== symbolId/);
    assert.match(cycle, /if \(outcome\.cancelled\) return false;/);
  });

  test("giving up is reported as an error, not left on the spinner", () => {
    // Exhausting the retries must resolve the screen. Leaving it in
    // "waking" forever is the original bug wearing a nicer label.
    assert.match(cycle, /if \(!outcome\.ok\) \{/);
  });
});

describe("the dashboard can tell waking apart from loading", () => {
  const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");

  test("waking renders the spinner, never the red failure", () => {
    // The regression this guards: adding a fourth status and forgetting the
    // render branch, so "waking" falls through to the balance figure — and
    // shows the local ledger's fictional number, which is the very bug the
    // three-state balance was introduced to kill.
    assert.match(dash, /balanceStatus === "loading" \|\| balanceStatus === "waking"/);
    assert.match(dash, /<BalanceLoading waking=\{balanceStatus === "waking"\} \/>/);
  });

  test("it says something different while waking", () => {
    assert.match(dash, /waking \? "Waking the server…" : "Loading balance…"/);
  });
});
