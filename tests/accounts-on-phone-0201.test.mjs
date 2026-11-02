// tests/accounts-on-phone-0201.test.mjs
//
//   node --test tests/accounts-on-phone-0201.test.mjs
//
// 0201: accounts on this phone — a list on Profile, Add account, and a
// switch that is always a sign-in with the other account's own PIN.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const store = () => code("backend/services/api/sessionStore.js");

test("the list keeps no token, five at most", () => {
  const s = store();
  const fn = s.slice(s.indexOf("function gloobalAccountsRemember"), s.indexOf("function gloobalAccountsForget"));
  assert.doesNotMatch(fn, /token/);
  assert.match(s, /var GLOOBAL_ACCOUNTS_MAX = 5;/);
  assert.match(fn, /mobileTail: tail/);
  assert.doesNotMatch(fn, /mobileNumber: /, "never the whole number");
});

test("every saved session is remembered, and a new GLOOBAL ID follows its account", () => {
  const s = store();
  assert.match(s, /gloobalAccountsRemember\(user\);\s*\}/);
  assert.match(s, /gloobalAccountsRename\(parsed\.user\.symbolId, newSymbolId\);/);
});

test("switching signs out first and opens that account's PIN", () => {
  const app = code("frontend/App.jsx");
  assert.match(app, /window\.sessionStorage\.setItem\(ACCOUNT_NEXT_KEY, JSON\.stringify\(next\)\);[\s\S]{0,120}handleStartOver\(\);/);
  assert.match(app, /if \(!accountNext \|\| stage !== "phone" \|\| flipping\) return;/);
  assert.match(app, /setLoginIdentifier\(next\.symbolId\);\s*setLoginIdResolved\(true\);\s*flipTo\("loginAuth"\);/);
  assert.match(app, /onSwitchAccount=\{switchToSavedAccount\}/);
});

test("Profile shows the row, the sheet asks before switching", () => {
  const d = code("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(d, /<AccountsOnPhoneRow currentId=\{currentSymbolId \|\| myGloobalId\}/);
  const sheet = code("frontend/features/accounts/accountsOnPhone.jsx");
  assert.match(sheet, /Switch and enter PIN/);
  assert.match(sheet, /remove one to add another/);
  assert.match(readSource("build_app.mjs"), /"features\/accounts\/accountsOnPhone\.jsx",\s*"screens\/Dashboard\/Dashboard\.jsx"/);
});
