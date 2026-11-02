// tests/link-another-bank-0203.test.mjs
//
//   node --test tests/link-another-bank-0203.test.mjs
//
// 0203: since 0190 the Home "Add Bank" tile opens GLOOBAL Bank, and the
// list of other banks (AddBankScreen) could not be reached from anywhere.
// It is reached from inside GLOOBAL Bank again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

test("GLOOBAL Bank has a Link another bank row", () => {
  const s = readSource("frontend/screens/Banks/GloobalBankScreen.jsx");
  assert.match(s, /data-testid="bank-link-another"\s*onClick=\{onOpenAddBank\}/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /onOpenAddBank=\{onOpenBank\}\s*onToast=\{showToast2\}/);
});

test("and so does the opening screen, for somebody with no account yet", () => {
  assert.match(readSource("frontend/features/bank/bankOpen.jsx"), /data-testid="bank-open-link-another" onClick=\{onOpenAddBank\}/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /<BankOpenFlow\s*symbolId=\{myGloobalId\}\s*onOpenAddBank=\{onOpenBank\}/);
});

test("the list opens above both, so Back returns to them", () => {
  assert.match(readSource("frontend/screens/Banks/AddBankScreen.jsx"), /zIndex: 330/);
  assert.match(readSource("frontend/App.jsx"), /activeScreen === "bank" && <ScreenErrorBoundary name="Add bank"[^>]*><AddBankScreen/);
});
