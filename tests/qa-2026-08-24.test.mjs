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
import { loadDomain, readSource } from "./harness.mjs";

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

  test("no hydration effect depends on registeredUser without secureId", () => {
    const deps = src.match(/\}, \[stage, registeredUser[^\]]*\]\);/g) || [];
    assert.ok(deps.length >= 3, `expected the balance, assets and history effects, found ${deps.length}`);
    for (const dep of deps) {
      assert.ok(dep.includes("secureId"), `reads secureId but does not watch it: ${dep}`);
    }
  });

  test("signing out resets the ledger", () => {
    assert.ok(
      /resetForAccountSwitch\(\);/.test(src),
      "handleStartOver must empty the ledger before the next account signs in"
    );
  });
});

describe("the prototype transaction limit describes its own currency", () => {
  // numericAmount is the face amount in the RECEIVER's currency, so the cap is
  // 5000 of whatever the recipient is paid in — about 52 USD for a US account
  // paying into India at 95. The message claimed "Rs." in every corridor.
  const src = readSource("server/server.js");

  test("the limit message no longer hardcodes rupees", () => {
    assert.ok(
      !/Prototype transaction limit is Rs\./.test(src),
      "the limit is not always denominated in INR"
    );
  });

  test("it states the basis of the cap", () => {
    assert.ok(
      /in the recipient's own currency/.test(src),
      "the message must say which currency the number is in"
    );
  });
});

describe("the permissions gate never claims an unasked permission", () => {
  const src = readSource("frontend/components/dialogs/registerLogin.jsx");

  // Contacts was marked "granted" purely from feature detection — a green
  // "Allowed" tick for someone who had never been asked anything.
  test("contacts support detection does not report granted", () => {
    assert.ok(
      !/contacts: supported \? "granted"/.test(src),
      "detecting the API is not the same as being granted anything"
    );
    assert.ok(
      /contacts: supported \? "ready"/.test(src),
      "supported-but-not-yet-asked needs its own state"
    );
  });

  test("the gate renders that state honestly", () => {
    assert.ok(
      /Asks when used/.test(src),
      "the ready state must read as a future ask, not a granted permission"
    );
  });

  // The three permissions that DO have a real browser answer must keep asking
  // for one rather than following contacts into detection-only.
  test("camera, location and notifications still call the real API", () => {
    assert.ok(/mediaDevices\.getUserMedia\(\{ video: true \}\)/.test(src), "camera must actually request");
    assert.ok(/geolocation\.getCurrentPosition\(/.test(src), "location must actually request");
    assert.ok(/Notification\.requestPermission\(\)/.test(src), "notifications must actually request");
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
