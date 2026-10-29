// tests/quick-pay-bar.test.mjs
//
// The dashboard's search: a spinning globe into Coverage, and a box that
// takes a Gloobal ID, a pay link, a mobile number or a creator name, checks
// who it is on →, and only then offers Pay — which opens Send, never pays.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const bar = () => readSource("frontend/features/payee/quickPayBar.jsx");

function classify() {
  const link = readSource("backend/utils/gloobalPayLink.js");
  const s = bar();
  const ctx = vm.createContext({ URL });
  vm.runInContext(`${link}\n${s.slice(s.indexOf("function quickPayClassify"), s.indexOf("function QuickPayBar("))}`, ctx);
  return ctx;
}

test("one box reads all four kinds of thing", () => {
  const c = classify();
  assert.deepEqual({ ...c.quickPayClassify("−+×=○□●■−+×=") }, { kind: "id", value: "−+×=○□●■−+×=", side: "either" });
  const shop = c.quickPayClassify("https://gloobalv3.netlify.app/s/012345670123");
  assert.equal(shop.kind, "id");
  assert.equal(shop.side, "shop");
  assert.equal(c.quickPayClassify("+91 98765-43210").kind, "mobile");
  assert.equal(c.quickPayClassify("98765 43210").value, "9876543210");
  assert.deepEqual({ ...c.quickPayClassify("Rasoi Ghar") }, { kind: "name", value: "rasoi.ghar" });
  assert.equal(c.quickPayClassify("रसोई.ghar").kind, "name");
  assert.equal(c.quickPayClassify("hello world again!").kind, "unknown");
  assert.equal(c.quickPayClassify("   "), null);
});

test("a bare ten digits gets the account's own dial code outside India", () => {
  const c = classify();
  assert.equal(c.quickPayMobile("7700900123", "+44"), "+447700900123");
  assert.equal(c.quickPayMobile("9876543210", "+91"), "9876543210", "the server already reads ten digits as Indian");
  assert.equal(c.quickPayMobile("+919876543210", "+44"), "+919876543210");
});

test("found goes straight to Send; you cannot pay yourself", () => {
  const s = bar();
  assert.match(s, /if \(id && myGloobalId && id === myGloobalId\) \{\s*setError\("That's you\."\);/);
  // No card and no Pay button in between (the founder's ask).
  assert.match(s, /if \(result\) \{\s*setText\(""\);\s*setNameMode\(false\);\s*if \(result\.kind === "creator"\) \{ if \(onPayCreator\) onPayCreator\(\{ creator: result\.creator \}\); \}\s*else if \(onPayPerson\) onPayPerson\(result\.payee\);/);
  assert.doesNotMatch(s, /data-quickpay-result/);
  const app = readSource("frontend/App.jsx");
  assert.match(app, /onPayPerson=\{\(payee\) => \{[\s\S]{0,160}openSendToPayee\(payee\);/);
});

test("the globe still opens Coverage, and a paste checks straight away", () => {
  const s = bar();
  assert.match(s, /onClick=\{onOpenCoverage\}\s*aria-label="Gloobal coverage"/);
  assert.match(s, /animation: "quickPayGlobe 12s linear infinite"/);
  assert.match(s, /\.quickpay-globe-spin \{ animation: none !important; \}/);
  assert.match(s, /setText\(pasted\);\s*lookUp\(pasted\);/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /<QuickPayBar\s+myGloobalId=\{myGloobalId\}/);
});

test("one smart pad: digits and ID symbols together, letters on their own key", () => {
  const s = bar();
  assert.match(s, /inputMode="none"/);
  assert.match(s, /onFocus=\{\(\) => \{ if \(!nameMode\) setPadOpen\(true\); \}\}/);
  assert.doesNotMatch(s, /QUICK_PAY_MODES/, "the three tabs are back");
  assert.match(s, /var QUICK_PAY_PAD_ROWS = \[/);
  assert.match(s, /\["name", "0", "back", "\\u25CF", "\\u25A0"\]/);
  assert.match(s, /if \(key === "name"\) \{ setText\(""\); setPadOpen\(false\); setNameField\("first"\); setNameMode\(true\); return; \}/);
  assert.match(s, /<CreatorNameKeyboard\s+open\s+header=\{/);
  assert.match(readSource("frontend/features/creator/nameKeyboard.jsx"), />\{header\}\{/);
});

test("twelve ID symbols check at once, Paste checks at once", () => {
  const s = bar();
  assert.match(s, /if \(chars\.length === QUICK_PAY_ID_LENGTH && chars\.every\(\(ch\) => DIAL_SYMBOLS\.indexOf\(ch\) >= 0\)\) lookUp\(next\);/);
  assert.match(s, /pasted = String\(await navigator\.clipboard\.readText\(\) \|\| ""\)\.trim\(\);/);
  assert.match(s, /setText\(pasted\);\s*setPadOpen\(false\);\s*setNameMode\(false\);\s*lookUp\(pasted\);/);
});

test("a number abroad: the flag chip picks the country code", () => {
  const s = bar();
  assert.match(s, /onClick=\{\(\) => setPicking\(true\)\}/);
  assert.match(s, /<CountryPickerScreen\s+topCountries=\{TOP_COUNTRIES\}/);
  assert.match(s, /quickPayMobile\(what\.value, dialCountry \? dialCountry\.dialCode : dialCode\)/);
  const c = classify();
  assert.equal(c.quickPayMobile("07700900123", "+44"), "+447700900123", "a leading 0 is dropped before the code");
  assert.equal(c.quickPayMobile("5551234567", "+1"), "+15551234567");
});
