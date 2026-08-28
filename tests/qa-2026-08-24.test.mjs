// tests/qa-2026-08-24.test.mjs
//
// Regressions for the six defects found in the founder's cross-country field
// test on 24 August 2026. Kept apart from money-path.test.mjs because these
// are tied to one dated report rather than to the money model itself — if a
// finding is later superseded by a product decision, the whole file moves
// with it.
//
// Two of the founder's nine observations are deliberately absent: the
// third-payment "insufficient balance" and the "sent 5000, received 1000"
// report. Neither was reproduced, and a test written against a guessed cause
// would assert the guess rather than the behaviour.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadDomain, readSource } from "./harness.mjs";

// Every hand-written source file in the app, so a test can assert that
// something appears NOWHERE rather than only that it appears somewhere.
// The generated bundle is excluded: it is a concatenation of these files
// and would report every hit twice.
function sourceFiles() {
  const roots = ["frontend", "backend"];
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) found.push(full);
    }
  };
  for (const root of roots) walk(path.join(ROOT, root));
  return found;
}

const domain = loadDomain(["createFinancialCore"]);
const INR = "INR";
const round2 = (n) => Number(n.toFixed(2));

const newCore = () =>
  domain.createFinancialCore({
    userId: "t",
    currency: INR,
    openingBankBalance: 10000,
    logLevel: "silent"
  });

const serverSeed = (id, over = {}) => ({
  id,
  business: "Jio",
  amountPaid: 1000,
  cashbackRate: 0.02,
  yearsAccrued: 1,
  plantedAt: "2025-08-20T10:00:00Z",
  ...over
});

describe("signing out clears the ledger before the next account arrives", () => {
  // The trap: LedgerProvider holds the core in a useRef and never rebuilds it,
  // so account B reuses account A's ledger. Because hydrateGrantsFromServer
  // restores only into an EMPTY grant list — its guard against double-counting
  // a seed it cannot match by id — B's real seeds were never fetched in and
  // A's stayed on screen. The PayLater limit is the sum of seed values, so B
  // was also borrowing against A's cashback.
  test("account A's seeds do not survive into account B", () => {
    const core = newCore();
    core.hydrateGrantsFromServer([serverSeed("a1"), serverSeed("a2")]);
    assert.equal(core.essentialsService.listGrants().length, 2);

    core.resetForAccountSwitch();
    assert.equal(core.essentialsService.listGrants().length, 0, "A grants must be gone");

    // And B can now actually hydrate — the whole point of clearing.
    assert.equal(core.hydrateGrantsFromServer([serverSeed("b1")]), 1);
    assert.equal(core.essentialsService.listGrants()[0].key, "srv-b1");
  });

  test("account A PayLater due does not survive into account B", () => {
    const core = newCore();
    core.reconcilePaylaterDue(2500);
    core.resetForAccountSwitch();
    // Reconciling B's real due starts from zero, not from A's 2500.
    assert.equal(core.reconcilePaylaterDue(400), 400);
  });

  test("the bank balance is emptied rather than carried across", () => {
    const core = newCore();
    core.reconcileBankBalance(7350);
    core.resetForAccountSwitch();
    // Back to zero, so B's first reconcile posts B's whole balance.
    assert.equal(core.reconcileBankBalance(9810), 9810);
  });

  test("resetting an already-empty ledger is harmless", () => {
    const core = newCore();
    core.resetForAccountSwitch();
    core.resetForAccountSwitch();
    assert.equal(core.essentialsService.listGrants().length, 0);
  });
});

describe("the displayed cashback rate is the rate that was used", () => {
  // The founder's report: "Cashback 2.4% - 118.00" against a 5000 payment,
  // when 2.4% of 5000 is 120. The money was right and the label was not — the
  // stored rate is 2.36%, and 5000 x 0.0236 is exactly 118.
  const pct = (rate) => (rate * 100).toFixed(2);

  test("2.36 percent of 5000 is 118, and the label says 2.36", () => {
    assert.equal(round2(5000 * 0.0236), 118);
    assert.equal(pct(0.0236), "2.36");
  });

  test("a rate that really is 2.4 percent still yields 120", () => {
    assert.equal(round2(5000 * 0.024), 120);
    assert.equal(pct(0.024), "2.40");
  });

  test("a rate that really is 2.6 percent still yields 130", () => {
    assert.equal(round2(5000 * 0.026), 130);
    assert.equal(pct(0.026), "2.60");
  });

  // toFixed(1) is what produced the mismatch: it maps distinct,
  // separately-settable rates onto one label.
  test("one decimal collapses rates that pay out differently", () => {
    const oneDp = (rate) => (rate * 100).toFixed(1);
    assert.equal(oneDp(0.0236), oneDp(0.024), "2.36 and 2.40 both render as 2.4");
    assert.notEqual(round2(5000 * 0.0236), round2(5000 * 0.024), "but they pay out 118 vs 120");
  });

  test("no screen rounds the cashback rate to one decimal any more", () => {
    for (const file of [
      "frontend/features/assets/AssetsScreen.jsx",
      "frontend/screens/Dashboard/Dashboard.jsx"
    ]) {
      const src = readSource(file);
      assert.ok(
        !/cashbackRate \* 100\)\.toFixed\(1\)/.test(src),
        `${file} must not render the cashback rate at one decimal`
      );
    }
  });

  // The slider is what makes 2.36% reachable in the first place. If it is ever
  // constrained to one decimal, the display precision above can follow it
  // down — but until then these two must agree.
  test("the display precision matches what the slider can produce", () => {
    const src = readSource("frontend/screens/Dashboard/Dashboard.jsx");
    assert.ok(
      /step=\{0\.01\}/.test(src),
      "My Share offers 0.01 steps, so the rate needs two decimals to render losslessly"
    );
  });
});

describe("the dashboard hydration effects watch every id they read", () => {
  // The balance was wrong until a refresh because the effect resolved its id
  // from `registeredUser.symbolId || secureId` but listed only registeredUser
  // as a dependency. Arriving before the id existed took the early return, and
  // nothing ever re-ran it. A refresh appeared to fix it only because session
  // restore populates the id before stage becomes "dashboard".
  const src = readSource("frontend/App.jsx");

  // Was `>= 3` when the balance and the assets/PayLater reads were two
  // separate effects doing identical identity handling. They are one
  // function now (hydrateAccount), so there is one fewer place to get this
  // wrong — but the rule itself is unchanged and is asserted on whatever
  // effects do exist, plus on the hydration callback below.
  test("no hydration effect depends on registeredUser without secureId", () => {
    const deps = src.match(/\}, \[stage, registeredUser[^\]]*\]\);/g) || [];
    assert.ok(deps.length >= 2, `expected the hydration and history effects, found ${deps.length}`);
    for (const dep of deps) {
      assert.ok(dep.includes("secureId"), `reads secureId but does not watch it: ${dep}`);
    }
  });

  test("the hydration callback watches both ids it resolves from", () => {
    // hydrateAccount reads `registeredUser.symbolId || secureId`, so a
    // useCallback that closes over only one of them would go stale on the
    // path where the id arrives in the other — the original bug, moved.
    const callback = src.match(/const hydrateAccount = useCallback11\([\s\S]*?\}, \[([^\]]*)\]\);/);
    assert.ok(callback, "hydrateAccount must exist as a useCallback");
    assert.ok(callback[1].includes("registeredUser"), "hydrateAccount must watch registeredUser");
    assert.ok(callback[1].includes("secureId"), "hydrateAccount must watch secureId");
  });

  test("signing out clears the previous account's balance verdict", () => {
    // Without this, account B inherited A's "error" (or A's "ready") until
    // B's own read landed - the same class of bug as the stale ledger the
    // test below covers, in the balance rather than the seeds.
    const startOver = src.match(/const handleStartOver = \(\) => \{[\s\S]*?\n  \};/);
    assert.ok(startOver, "handleStartOver must exist");
    assert.ok(
      /setBalanceStatus\("loading"\)/.test(startOver[0]),
      "handleStartOver must reset balanceStatus, or the next account inherits this one's verdict"
    );
  });

  test("loading is never rendered as a balance", () => {
    // The whole first-login report: `loading` and `ready` rendered
    // identically, so the local ledger's opening float was shown as a
    // confirmed figure while the server was still being asked.
    const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
    assert.ok(
      /balanceStatus === "loading" \? <BalanceLoading/.test(dash),
      "the dashboard must show a loading state, not a figure, while the balance is unconfirmed"
    );
    assert.ok(
      /balanceStatus === "error" \? <BalanceError/.test(dash),
      "a failed read must be its own state with a retry, not a number"
    );
    assert.ok(
      !/Balance unavailable/.test(dash),
      "the old single-boolean copy must be gone - it conflated loading with failure"
    );
  });

  test("signing out resets the ledger", () => {
    assert.ok(
      /resetForAccountSwitch\(\);/.test(src),
      "handleStartOver must empty the ledger before the next account signs in"
    );
  });
});

describe("the prototype transaction limit is the sender's own money", () => {
  // Twice wrong before this. The message said "Rs." in every corridor, and
  // the cap itself was denominated in the RECEIVER's currency — so a US
  // account paying into India hit a ceiling of 5,000 INR, about $53, which
  // is what "why can't I send more than about $53" actually was.
  const src = readSource("server/server.js");

  test("the message no longer hardcodes rupees", () => {
    assert.ok(
      !/Prototype transaction limit is Rs\./.test(src),
      "the limit is not always denominated in INR"
    );
  });

  test("the cap is measured against the sender's source amount", () => {
    assert.ok(
      /sourceFaceAmount > maxPrototypeAmount/.test(src),
      "the ceiling must apply to the money leaving the sender's balance"
    );
    assert.ok(
      /limitBasis: 'sender-currency'/.test(src),
      "the refusal must say which side the cap belongs to"
    );
  });

  test("the message names the sender's currency", () => {
    assert.ok(
      /Prototype transaction limit is \$\{maxPrototypeAmount\} \$\{senderCurrency\}/.test(src),
      "the message must carry the real currency code, not a fixed one"
    );
  });

  test("the default ceiling is five million", () => {
    assert.ok(
      /PROTOTYPE_TRANSACTION_MAX_AMOUNT \|\| 5000000/.test(src),
      "the send route's default cap must be 5,000,000 of the sender's currency"
    );
  });
});

describe("permissions are asked for where they are used, and never claimed", () => {
  // Rewritten on 26 August 2026. The original three tests asserted against
  // the registration-time permissions gate — the screen that asked for
  // camera, location, contacts and notifications up front and rendered each
  // one's state. That screen is gone: 2dcab5f replaced it with an explainer
  // that asks for nothing, and moved every request to the moment the
  // capability is actually used.
  //
  // The defect those tests were written for is NOT gone, and is still what
  // is guarded here: a permission must never be reported as granted on the
  // strength of the API merely existing. What changed is where the guarantee
  // lives. Behaviour is covered end-to-end in tests/browser.test.mjs, which
  // drives a real Chromium and reads the permission states back out of it;
  // these assertions hold the ARCHITECTURE those behaviours depend on, which
  // a browser cannot check: that the ask happens in one place per capability,
  // and that the onboarding screen is not that place.
  const gate = readSource("frontend/components/dialogs/registerLogin.jsx");

  test("the onboarding screen requests nothing", () => {
    // The whole point of just-in-time. A prompt is a one-shot resource —
    // browsers remember a denial per origin and offer no way to ask again —
    // so spending it during registration, before the person has seen the
    // feature it belongs to, is how permissions get denied for good.
    assert.ok(
      !/mediaDevices\.getUserMedia\(/.test(gate),
      "the onboarding screen must not open the camera"
    );
    assert.ok(
      !/geolocation\.getCurrentPosition\(/.test(gate),
      "the onboarding screen must not ask for location"
    );
    assert.ok(
      !/Notification\.requestPermission\(/.test(gate),
      "the onboarding screen must not ask for notifications"
    );
  });

  test("it explains what will be asked for, and when", () => {
    // It is allowed to name the capabilities — that is its whole job. What
    // it may not do is imply any of them has already been granted.
    for (const capability of ["Location", "Camera", "Contacts", "Alerts"]) {
      assert.ok(
        new RegExp(`label: "${capability}"`).test(gate),
        `the explainer must still name ${capability}`
      );
    }
  });

  test("no screen reports a permission as granted from feature detection", () => {
    // The original defect, stated in the form it can still recur: Contacts
    // has no standing grant to hold (the Contact Picker API prompts fresh on
    // every call), so nothing may derive one from the API's presence.
    assert.ok(
      !/contacts:\s*supported\s*\?\s*"granted"/.test(gate),
      "detecting the API is not the same as being granted anything"
    );
    assert.ok(
      !/navigator\.contacts[\s\S]{0,80}granted/.test(gate),
      "a Contacts grant may not be inferred from navigator.contacts existing"
    );
  });

  test("each capability is requested in exactly one place, and it is the place that uses it", () => {
    // The three real browser permissions, and the module that owns each ask.
    // A second caller appearing anywhere is the regression this catches: it
    // means some other screen has started prompting on its own.
    const owners = [
      ["frontend/components/common/qrScanner.jsx", /mediaDevices\.getUserMedia\(/, "the camera belongs to the QR scanner"],
      ["backend/domain/provenance/LocationResolver.js", /geolocation\.getCurrentPosition\(/, "location belongs to the provenance resolver"],
      ["frontend/hooks/usePaymentNotifications.js", /Notification\.requestPermission\(/, "notifications belong to the payment notifier"]
    ];
    for (const [file, pattern, why] of owners) {
      assert.ok(pattern.test(readSource(file)), `${why} — ${file} must make the request`);
    }

    // "Exactly one place" is the half that actually decays. Every other
    // source file in the tree must be free of these calls, or some screen
    // has quietly started prompting on its own again.
    const owned = new Set(owners.map(([file]) => path.join(ROOT, file.replace(/\//g, path.sep))));
    const offenders = [];
    for (const file of sourceFiles()) {
      if (owned.has(file)) continue;
      const src = fs.readFileSync(file, "utf8");
      for (const [, pattern] of owners) {
        if (pattern.test(src)) offenders.push(`${path.relative(ROOT, file)} :: ${pattern}`);
      }
    }
    assert.deepEqual(offenders, [], "only the owning module may request each permission");
  });

  test("the notification prompt comes after a payment, not before one", () => {
    // A permission prompt answers itself when it arrives right after money
    // has moved: they just paid someone, and the offer is to be told when
    // the next one lands. Asking during onboarding is why these get denied.
    const notifications = readSource("frontend/hooks/usePaymentNotifications.js");
    assert.ok(
      /After a payment succeeds, never before/.test(notifications),
      "the module must still document when it asks"
    );
    assert.ok(
      /if \(Notification\.permission !== "default"\) return Notification\.permission;/.test(notifications),
      "an already-answered permission must never be re-prompted"
    );
    assert.ok(
      /paymentNotificationsAlreadyAsked\(\)/.test(notifications),
      "a dismissed prompt must not be asked again — that is how an origin gets auto-denied"
    );
  });

  test("a location refusal and a location timeout stay different events", () => {
    // Carried over from the gate this replaced, because the payment path now
    // depends on it: someone indoors who ALLOWED location gets a timeout,
    // and telling them they refused — at a till — is the worst failure this
    // screen has.
    const resolver = readSource("backend/domain/provenance/LocationResolver.js");
    assert.ok(/DENIED/.test(resolver) && /TIMEOUT/.test(resolver), "both outcomes must be modelled");
    assert.ok(
      !/code === 1 \|\| .*code === 3/.test(resolver),
      "PERMISSION_DENIED and TIMEOUT must not be collapsed into one branch"
    );
  });
});

describe("the production Permissions-Policy allows what the app needs", () => {
  // An empty allowlist () disables a feature for every origin, the page's own
  // included. camera=() and geolocation=() meant the QR scanner and the
  // location check could not work on Netlify however correct their code was —
  // getUserMedia rejected before the browser prompt was ever reached.
  const toml = readSource("netlify.toml");
  const header = (toml.match(/Permissions-Policy\s*=\s*"([^"]+)"/) || [])[1] || "";

  test("the header is still set", () => {
    assert.ok(header, "netlify.toml must still send a Permissions-Policy");
  });

  test("camera and geolocation are allowed for this origin", () => {
    assert.ok(/camera=\(self\)/.test(header), `camera must be (self), got: ${header}`);
    assert.ok(/geolocation=\(self\)/.test(header), `geolocation must be (self), got: ${header}`);
  });

  test("neither is left as an empty allowlist", () => {
    assert.ok(!/camera=\(\)/.test(header), "camera=() disables the camera everywhere");
    assert.ok(!/geolocation=\(\)/.test(header), "geolocation=() disables location everywhere");
  });

  test("microphone stays off — nothing in the app records audio", () => {
    assert.ok(/microphone=\(\)/.test(header), "the policy should stay as narrow as the app needs");
  });
});
