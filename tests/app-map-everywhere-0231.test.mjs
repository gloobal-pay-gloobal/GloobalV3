// tests/app-map-everywhere-0231.test.mjs
//
//   node --test tests/app-map-everywhere-0231.test.mjs
//
// 0231: the app-map button is on every screen. It is a slim tab against
// the edge (so it stops covering buttons), its icon is the app's screens as
// four tiles with one lit, and it hides only where a tap on it would throw
// something away. Screens tell the map where the person is.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const map = readSource("frontend/components/common/appMap.jsx");

describe("which place the map lights", () => {
  const ctx = vm.createContext({});
  vm.runInContext(map.slice(map.indexOf("function appMapHereKey"), map.indexOf("// The floating button: draggable")), ctx);
  const pick = (reports, fallback = "dashboard") => ctx.appMapHereKey(reports, fallback);

  test("nothing reported: App's own key", () => {
    assert.equal(pick([]), "dashboard");
  });
  test("the deepest screen wins, whatever order they reported in", () => {
    assert.equal(pick([{ id: 5, key: "myshop", level: 2 }, { id: 9, key: "payservices", level: 1 }]), "myshop");
  });
  test("among equals, the newest", () => {
    assert.equal(pick([{ id: 3, key: "assets", level: 1 }, { id: 4, key: "gbank", level: 1 }]), "gbank");
  });
});

describe("the button", () => {
  test("is an edge tab with the four-tiles icon, not the folded map", () => {
    assert.ok(!/MapNavIcon/.test(map), "the folded-map icon is gone");
    assert.match(map, /function MapScreensIcon/);
    assert.match(map, /var MAP_TAB_THICK = 26;/);
    assert.match(map, /function mapTabShape\(edge\)/);
  });
  test("lights the screen a dashboard screen reports, unless App knows better", () => {
    assert.match(map, /window\.addEventListener\("gloobal:mapHere", onHere\)/);
    assert.match(map, /currentKey && currentKey !== "dashboard" \? currentKey : appMapHereKey\(hereReports, currentKey\)/);
    assert.match(map, /currentKey=\{hereKey\}/);
  });
});

describe("it stays on every ordinary screen", () => {
  const stays = {
    "frontend/features/assets/AssetsScreen.jsx": "assets",
    "frontend/features/hooman/HoomanScoreFlow.jsx": "ghscore",
    "frontend/features/coverage/CoverageDashboard.jsx": "coverage",
    "frontend/features/coverage/OurNumbers.jsx": "coverage",
    "frontend/features/creator/creatorShops.jsx": "myshop",
    "frontend/features/creator/nameMarket.jsx": "creatorSetup"
  };
  for (const [file, key] of Object.entries(stays)) {
    test(file.split("/").pop(), () => {
      const s = readSource(file);
      assert.ok(!/gloobal:blockingOverlay/.test(s), "no longer hides the map");
      assert.ok(s.includes(`useAppMapHere("${key}")`), `reports ${key}`);
    });
  }
  test("CreatorPage, CreatorSetupScreen, ChoiceSheets, AddBankScreen and the dashboard", () => {
    for (const f of [
      "frontend/features/creator/CreatorPage.jsx",
      "frontend/features/creator/CreatorSetupScreen.jsx",
      "frontend/features/choices/ChoiceSheets.jsx",
      "frontend/screens/Banks/AddBankScreen.jsx"
    ]) assert.ok(!/gloobal:blockingOverlay/.test(readSource(f)), f);
    const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
    assert.ok(!/gloobal:blockingOverlay/.test(dash), "Pay & Services and Referral no longer hide it");
    assert.match(dash, /useAppMapHere\(dashMapHere, 1\)/);
  });
});

describe("it stands aside only where a tap would throw something away", () => {
  test("the PIN on Send, the pay PIN, the bank's PIN and code, the amount pad", () => {
    assert.match(readSource("frontend/screens/SendMoney/SendMoney.jsx"), /useMapStandsAside\(pinOpen\)/);
    assert.match(readSource("frontend/components/payments/PayPinModal.jsx"), /useMapStandsAside\(open\)/);
    assert.match(readSource("frontend/features/bank/bankOpen.jsx"), /useMapStandsAside\(screen === "pin" \|\| screen === "otp"\)/);
    assert.match(readSource("frontend/features/bank/bankMoney.jsx"), /useMapStandsAside\(screen === "confirm"\)/);
    assert.match(readSource("frontend/components/inputs/amountPad.jsx"), /useMapStandsAside\(Boolean\(field\)\)/);
  });
  test("the camera, photo crop, payments in flight and the keyboards still hide it", () => {
    for (const f of [
      "frontend/components/common/qrScanner.jsx",
      "frontend/components/common/photoCropper.jsx",
      "frontend/components/dialogs/PaymentProcessing.jsx",
      "frontend/components/dialogs/PaymentUnlock.jsx",
      "frontend/features/payee/quickPayBar.jsx",
      "frontend/features/creator/nameKeyboard.jsx"
    ]) assert.match(readSource(f), /gloobal:blockingOverlay/, f);
  });
  test("the amount pad's width and centring are not inside a comment", () => {
    assert.match(readSource("frontend/components/inputs/amountPad.jsx"), /zIndex: 10050, maxWidth: 480, margin: "0 auto",/);
  });
});
