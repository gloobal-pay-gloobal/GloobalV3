// tests/add-bank-v2-0209.test.mjs
//
//   node --test tests/add-bank-v2-0209.test.mjs
//
// 0209: Link a bank, as the founder drew it (v2). It replaces the screen
// that said "Bank globally. One ID for all.", showed a globe, and put a
// padlock on every bank ("Locked until live APIs connect") — while linking
// already worked inside GLOOBAL Bank. The server side, with both ₹1 checks,
// is checked against a real database in server/tests/bank-link.test.mjs.
// (This replaces tests/add-bank-layout.test.mjs, which tested the globe.)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const bank = strip(readSource("frontend/screens/Banks/AddBankScreen.jsx"));

describe("what is gone", () => {
  test("no globe, no slogan, no locks", () => {
    for (const w of ["Bank globally", "One ID for all", "Locked until live APIs connect", "ServiceLock", "globe"]) assert.ok(!bank.includes(w), `still says "${w}"`);
  });
});

describe("1 · pick your bank", () => {
  test("logo inside its box, the name outside, under it", () => {
    assert.match(bank, /function LinkBankLogo\(/);
    assert.match(bank, /data-testid="link-bank-tile"[\s\S]*?<LinkBankLogo [^>]*size=\{56\} \/><span[^>]*>\{b\.name\}<\/span>/);
  });
  test("popular three to a row, then by UPI ID, then every bank A–Z", () => {
    assert.match(bank, /data-testid="link-bank-popular" style=\{\{ display: "grid", gridTemplateColumns: "repeat\(3, minmax\(0, 1fr\)\)"/);
    assert.match(bank, /Link by UPI ID instead/);
    assert.match(bank, /localeCompare/);
    assert.match(bank, /data-testid="link-bank-all"/);
  });
});

describe("2 · your linked banks come first", () => {
  test("with the first as primary, up to five, and the money actions", () => {
    assert.match(bank, /linked · up to 5/);
    assert.match(bank, />Primary</);
    assert.match(bank, /"Add money"\], \["send", "[^"]+", "Send to bank"\], \["history", "[^"]+", "Transfers"\]/);
    assert.match(bank, /<BankMoneyScreen start=\{money\}/);
  });
});

describe("3 · two ways to prove it's yours, both ₹1", () => {
  test("pay ₹1 from it (fastest), or type the numbers and ₹1 is sent", () => {
    assert.match(bank, /option\("rupee", [^,]+, `Pay \$\{one\} from this bank`, "Fastest"/);
    assert.match(bank, /option\("typed", [^,]+, "Type account number & IFSC"/);
    assert.match(bank, /GloobalApi\.linkBankByRupee\(/);
  });
  test("the IFSC is half-filled from the bank tapped", () => {
    assert.match(bank, /setCode\(india && prefix \? `\$\{prefix\}0` : ""\)/);
  });
  test("what the ₹1 told us is shown, name beside name", () => {
    assert.match(bank, /\["Name at the bank", result\.nameAtBank\]/);
    assert.match(bank, /\["Your GLOOBAL name", myName \|\| "—"\]/);
  });
  test("test mode says so", () => assert.match(bank, /Test mode\./));
});

describe("4 · linked, and what next; and GLOOBAL Bank first", () => {
  test("straight into add money and send", () => assert.match(bank, /Add money from it/));
  test("without GLOOBAL Bank, one strip to open it", () => {
    assert.match(bank, /testId="link-bank-open-first"/);
    assert.match(strip(readSource("frontend/App.jsx")), /onOpenGloobalBank=\{\(\) => \{ requestCloseActiveScreen\(\); goToDashboardDestination\("bank"\); \}\}/);
  });
});
