// tests/location-gate.test.mjs
//
// Location is now a PRECONDITION of paying — a deliberate reversal of the
// previous design, which captured it fire-and-forget after the payment had
// already settled on the principle that "location must never gate or delay
// financial validity".
//
// That makes this the only code in the app that refuses to move money, which
// earns it tests of its own. Two things are being guarded, and they fail in
// opposite directions:
//
//   1. It must actually block. A gate with a path around it is not a gate,
//      and the way this regresses is a new payment entry point that simply
//      forgets to ask.
//   2. It must not block the wrong people. A denial and a timeout are
//      different events, and conflating them tells someone who DID allow
//      that they refused — while they are standing at a till.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const domain = loadDomain(["captureBrowserGeo", "LOCATION_STATUS", "LocationObservation"]);

// Swap in a fake navigator.geolocation for one call. The real
// captureBrowserGeo reads the global, which is exactly what the browser
// gives it, so this exercises the true code path rather than a copy.
async function withGeolocation(impl, run) {
  const hadNavigator = "navigator" in globalThis;
  const previous = hadNavigator ? globalThis.navigator : undefined;
  // `navigator` is a getter-only global in newer Node, so it has to be
  // redefined rather than assigned.
  Object.defineProperty(globalThis, "navigator", {
    value: impl === null ? {} : { geolocation: impl },
    configurable: true,
    writable: true
  });
  try {
    return await run();
  } finally {
    if (hadNavigator) {
      Object.defineProperty(globalThis, "navigator", { value: previous, configurable: true, writable: true });
    } else {
      delete globalThis.navigator;
    }
  }
}

describe("a refusal and a failed fix are not the same event", () => {
  test("the browser's PERMISSION_DENIED (code 1) reads as DENIED", async () => {
    const observation = await withGeolocation(
      { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
      () => domain.captureBrowserGeo({ timeoutMs: 50 })
    );
    assert.equal(observation.status, domain.LOCATION_STATUS.DENIED);
  });

  test("the browser's TIMEOUT (code 3) reads as TIMEOUT, never DENIED", async () => {
    // The distinction the whole gate turns on. Someone indoors who ALLOWED
    // location gets code 3, and calling that a refusal would accuse them of
    // something they did not do and offer them advice that cannot help.
    const observation = await withGeolocation(
      { getCurrentPosition: (_ok, fail) => fail({ code: 3 }) },
      () => domain.captureBrowserGeo({ timeoutMs: 50 })
    );
    assert.equal(observation.status, domain.LOCATION_STATUS.TIMEOUT);
    assert.notEqual(observation.status, domain.LOCATION_STATUS.DENIED);
  });

  test("no geolocation API at all reads as UNAVAILABLE", async () => {
    const observation = await withGeolocation(null, () => domain.captureBrowserGeo({ timeoutMs: 50 }));
    assert.equal(observation.status, domain.LOCATION_STATUS.UNAVAILABLE);
  });

  test("a silent browser resolves as TIMEOUT rather than hanging the payment", async () => {
    // getCurrentPosition is permitted to never call back. Without the
    // internal deadline this would leave a payment waiting forever on a
    // promise that never settles.
    const observation = await withGeolocation(
      { getCurrentPosition: () => {} },
      () => domain.captureBrowserGeo({ timeoutMs: 60 })
    );
    assert.equal(observation.status, domain.LOCATION_STATUS.TIMEOUT);
  });

  test("a granted fix carries real coordinates, never an invented one", async () => {
    const observation = await withGeolocation(
      { getCurrentPosition: (ok) => ok({ coords: { latitude: 12.97, longitude: 77.59, accuracy: 8 } }) },
      () => domain.captureBrowserGeo({ timeoutMs: 50 })
    );
    assert.equal(observation.status, domain.LOCATION_STATUS.AVAILABLE);
    assert.equal(observation.latitude, 12.97);
    assert.equal(observation.longitude, 77.59);
  });
});

describe("the gate maps each outcome to the right consequence", () => {
  const gate = readSource("frontend/hooks/usePaymentLocation.js");

  test("only an AVAILABLE reading lets a payment through", () => {
    assert.match(
      gate,
      /observation\.status === LOCATION_STATUS\.AVAILABLE[\s\S]{0,200}?return \{ ok: true/,
      "ok:true must be reachable only from an AVAILABLE reading"
    );
  });

  test("a failed reading is never cached", () => {
    // Caching a denial would keep blocking for the full cache window after
    // the person had already fixed it in settings — the retry button would
    // appear to do nothing.
    const afterFailure = gate.slice(gate.indexOf("A failed read must never be cached"));
    assert.match(afterFailure, /cached = \{ observation: null, capturedAt: 0 \}/);
  });

  test("the retry asks for a longer window than the first attempt", () => {
    const first = Number((gate.match(/PAYMENT_LOCATION_TIMEOUT_MS = (\d+)/) || [])[1]);
    const retry = Number((gate.match(/PAYMENT_LOCATION_RETRY_TIMEOUT_MS = (\d+)/) || [])[1]);
    assert.ok(first > 0 && retry > first, `retry (${retry}ms) must exceed first attempt (${first}ms)`);
  });

  test("a reused fix is fresh enough to still describe this payment", () => {
    // Reuse exists so paying twice does not mean waiting for satellites
    // twice. Too long a window and the record would place a payment where
    // the person no longer is, which defeats the reason for capturing it.
    const maxAge = Number((gate.match(/PAYMENT_LOCATION_MAX_AGE_MS = (\d+)/) || [])[1]);
    assert.ok(maxAge > 0 && maxAge <= 5 * 60 * 1000, `cache window ${maxAge}ms is too long to be honest`);
  });
});

describe("every payment path asks — a gate with a way around it is not a gate", () => {
  const app = readSource("frontend/App.jsx");

  // The three handlers that move money. Send Money reaches the backend via
  // handleRemoteSend; Scan & Pay and Pay a Business post through
  // executeTransaction directly and would otherwise slip past.
  for (const handler of ["handleRemoteSend", "handleScanBiometricVerify", "handlePayBusiness"]) {
    test(`${handler} consults the gate`, () => {
      const start = app.indexOf(`const ${handler} = `);
      assert.ok(start > -1, `${handler} not found — did it get renamed?`);
      const body = app.slice(start, start + 1200);
      assert.match(body, /passesLocationGate/, `${handler} must await passesLocationGate before posting`);
    });
  }

  test("the gate runs before handleRemoteSend's early exits", () => {
    // handleRemoteSend returns `skipped` for an unregistered receiver and
    // for a signed-out sender, and those paths still fall through to the
    // LOCAL ledger leg, which still writes a history row. Gating after them
    // would leave exactly one unguarded way to record a payment.
    const start = app.indexOf("const handleRemoteSend = ");
    const body = app.slice(start, start + 1600);
    assert.ok(
      body.indexOf("passesLocationGate") < body.indexOf("skipped: true"),
      "the location check must come before the skipped/local-simulation exits"
    );
  });

  test("a captured fix does not survive a sign-out", () => {
    // Otherwise one person's whereabouts would be attached to the next
    // person's first payment on a shared device.
    assert.match(app, /forgetPaymentLocation\(\);/);
  });

  test("provenance receives the reading the payment was authorised against", () => {
    // Not a second fix taken moments later: two readings can legitimately
    // differ, and the record would then disagree with the check that let
    // the payment through.
    const start = app.indexOf("const reportSenderLocation");
    const body = app.slice(start, start + 700);
    assert.match(body, /gatedLocationRef\.current/);
  });
});

describe("the blocking screen says the right thing for each cause", () => {
  const modal = readSource("frontend/components/dialogs/LocationRequiredModal.jsx");

  test("it distinguishes all three causes", () => {
    for (const reason of ["timeout", "denied", "unavailable"]) {
      assert.match(modal, new RegExp(`${reason}: \\{`), `no copy for the ${reason} case`);
    }
  });

  test("it offers no retry when the device simply cannot do location", () => {
    // A retry button that cannot possibly succeed is worse than none: it
    // sends someone hunting for a permission screen that does not exist.
    const unavailable = modal.slice(modal.indexOf("unavailable: {"), modal.indexOf("unavailable: {") + 400);
    assert.match(unavailable, /canRetry: false/);
  });

  test("it never claims the app can undo a browser-level block", () => {
    const denied = modal.slice(modal.indexOf("denied: {"), modal.indexOf("denied: {") + 700);
    assert.match(denied, /device settings/i, "the denied case must point at device settings");
  });
});

describe("notifications are asked for once, at a moment that has earned it", () => {
  const notify = readSource("frontend/hooks/usePaymentNotifications.js");
  const app = readSource("frontend/App.jsx");

  test("the ask happens after a payment, not during onboarding", () => {
    // A prompt is one-shot: browsers remember a denial per origin forever.
    // Spending it before the person has seen a payment is how it gets denied.
    const complete = app.slice(app.indexOf("const handleSendMoneyComplete"), app.indexOf("const handleSendMoneyComplete") + 900);
    assert.match(complete, /offerPaymentNotificationsAfterPayment\(\)/);
  });

  test("the onboarding screen requests nothing at all any more", () => {
    const register = readSource("frontend/components/dialogs/registerLogin.jsx");
    const gate = register.slice(
      register.indexOf("function PermissionsGateScreen"),
      register.indexOf("function PhoneConnector")
    );
    for (const request of ["Notification.requestPermission", "getUserMedia", "getCurrentPosition", "navigator.contacts"]) {
      assert.ok(!gate.includes(request), `the explainer must not call ${request}`);
    }
  });

  test("the explainer shows WHEN each permission is asked, as a picture", () => {
    const register = readSource("frontend/components/dialogs/registerLogin.jsx");
    const gate = register.slice(
      register.indexOf("function PermissionsGateScreen"),
      register.indexOf("function PhoneConnector")
    );
    // Each row is a PAIR — the capability and the moment it is asked for,
    // read as a sentence without words. Losing the `When` half would leave
    // four unexplained icons, which is decoration, not communication.
    assert.equal((gate.match(/When: \w+MomentIcon/g) || []).length, 4, "each row needs its moment icon");
  });

  test("the screen carries almost no language", () => {
    // Gloobal is meant to work for someone who reads no English, and the ID
    // system already commits to that. This screen is held to it: single-noun
    // labels, which survive translation, rather than sentences, which do not.
    const register = readSource("frontend/components/dialogs/registerLogin.jsx");
    const gate = register.slice(
      register.indexOf("function PermissionsGateScreen"),
      register.indexOf("function PhoneConnector")
    );
    const labels = (gate.match(/label: "([^"]+)"/g) || []).map((m) => m.split('"')[1]);
    assert.equal(labels.length, 4);
    for (const label of labels) {
      assert.ok(label.split(" ").length === 1, `"${label}" should be a single word`);
    }
  });

  test("but the consent boundary is still stated in words", () => {
    // Which permission is mandatory is the one thing a pictogram must not
    // carry: something a person has to guess at is not consent.
    const register = readSource("frontend/components/dialogs/registerLogin.jsx");
    const gate = register.slice(
      register.indexOf("function PermissionsGateScreen"),
      register.indexOf("function PhoneConnector")
    );
    assert.match(gate, /Required to send money/);
  });

  test("it never asks twice", () => {
    // Notification.permission reads "default" both for never-asked and for
    // dismissed-without-choosing, and re-prompting the latter is how an
    // origin gets auto-denied permanently.
    assert.match(notify, /paymentNotificationsAlreadyAsked\(\)/);
    assert.match(notify, /GLOOBAL_NOTIFY_ASKED_KEY/);
  });

  test("a transaction can only ever notify once, across reloads", () => {
    // The poll re-reads the same rows on every tick.
    assert.match(notify, /paymentAlreadyNotified\(txnId\)/);
    assert.match(notify, /window\.localStorage/);
  });

  test("the first poll primes the dedupe instead of notifying the backlog", () => {
    // Otherwise switching notifications on would dump the entire received
    // history into the tray at once.
    // Anchor on the priming BRANCH, not the first mention of the ref — the
    // sign-out re-prime references it earlier and would slice the wrong block.
    const branch = app.indexOf("if (!receivedNotifyPrimedRef.current)");
    assert.ok(branch > -1, "the priming branch is missing");
    const primed = app.slice(branch, branch + 400);
    assert.match(primed, /markPaymentNotified/);
  });

  test("polling stops when the tab is not visible", () => {
    assert.match(app, /document\.visibilityState !== "visible"/);
  });

  test("storage failures cannot break a payment", () => {
    // localStorage throws outright in Safari private mode.
    const guarded = (notify.match(/try \{/g) || []).length;
    assert.ok(guarded >= 5, `expected every storage access guarded, found ${guarded} try blocks`);
  });
});
