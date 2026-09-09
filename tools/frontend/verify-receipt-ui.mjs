// Drives the real app in a real browser and checks what a receipt actually
// SHOWS: its flag, its payment reference, and its Creator Share reference.
//
//   node tools/frontend/verify-receipt-ui.mjs
//
// Why this exists alongside server/tests/receipt-reference-and-flag.test.mjs:
// that suite proves the API returns two distinct references and the right
// country on every row. It cannot prove any of them reach the screen. The
// whole defect being fixed here lived on the client — a projection field the
// mapper read as empty, and a display fallback that quietly printed the
// PAYMENT's id under "Share transaction ID" — and every one of those renders
// perfectly happily. Only a browser can answer whether the two ids on a
// reopened receipt are different.
//
// Expects, already running:
//   * the API on 127.0.0.1:5212 against a THROWAWAY database
//   * Vite on localhost:5173 with VITE_API_URL pointing at that API
//
// It seeds its own accounts and payments through the real routes, then signs
// in through the real login screen — restoring a session only pre-fills the
// identity, and reaching the dashboard still costs the PIN.

import { chromium } from "playwright";

const APP = process.env.VERIFY_APP_URL || "http://localhost:5173";
const API = process.env.VERIFY_API_URL || "http://127.0.0.1:5212";

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const PAYER = symbolId(2);
const MERCHANT = symbolId(5);
const PLAIN = symbolId(6);
const PIN = "246813";

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const post = (path, body, token) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const patch = (path, body, token) =>
  fetch(`${API}${path}`, {
    method: "PATCH",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const textOf = (page) => page.evaluate(() => document.body.innerText);

const clickLabel = (page, label) => page.evaluate((wanted) => {
  const hit = [...document.querySelectorAll("button,[role=button]")]
    .find((el) => el.getAttribute("aria-label") === wanted);
  if (hit) { hit.click(); return true; }
  return false;
}, label);

const clickText = (page, pattern) => page.evaluate((source) => {
  const re = new RegExp(source, "i");
  const hit = [...document.querySelectorAll("button,[role=button]")]
    .find((el) => re.test(el.textContent || "") || re.test(el.getAttribute("aria-label") || ""));
  if (hit) { hit.click(); return true; }
  return false;
}, pattern);

// The receipt as a person sees it: which reference is printed under which
// label, whether a Creator Share tab is offered at all, and which country
// the flag image is actually of.
//
// The flag is read from the image URL rather than from an emoji character,
// because that URL is what the renderer resolves the country to — a check
// against the emoji would pass on a platform that draws no flag at all.
const readReceipt = (page) => page.evaluate(() => {
  const body = document.body.innerText;
  // The reference is drawn one symbol per span so each can carry its own
  // colour, and innerText puts a line break between them — so it is read
  // from the DOM rather than from the rendered text. The box is the only
  // monospace container on the receipt holding a full 20-symbol value; the
  // "From payment" line beneath it is a span inside a longer sentence.
  const idHolder = [...document.querySelectorAll("div")]
    .map((d) => ({ d, value: (d.textContent || "").replace(/\s/g, "") }))
    .filter(({ d, value }) => ((d.getAttribute("style") || "").includes("monospace")) && value.length === 20)
    .pop();
  const flagImg = document.querySelector("[data-testid=receipt-flag] img");
  const src = flagImg ? flagImg.getAttribute("src") || "" : "";
  const isoMatch = src.match(/\/([a-z]{2})\.png/i);
  return {
    hasFlag: !!document.querySelector("[data-testid=receipt-flag]"),
    flagIso: isoMatch ? isoMatch[1].toUpperCase() : "",
    hasShareTab: [...document.querySelectorAll("button")].some((b) => /creator share/i.test(b.textContent || "")),
    paymentIdLabelled: /Transaction ID/i.test(body),
    shareIdLabelled: /Share transaction ID/i.test(body),
    printedId: idHolder ? idHolder.value : "",
  };
});

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

async function seed() {
  // Seeded through the real routes only. Country and cashback rate are the
  // two account facts these receipts depend on, and both are set through
  // the app's own endpoints rather than written into the database, so this
  // proves the same path a real account takes.
  const payerToken = await registerAccount(PAYER, "+919000000081", "Receipt Payer");
  const merchantToken = await registerAccount(MERCHANT, "+919000000082", "Receipt Merchant");
  await registerAccount(PLAIN, "+919000000083", "No Share Merchant");

  // The merchant chooses to share 5% back. Set through the Creator's own
  // route, so the share leg these receipts are about is minted by exactly
  // the arrangement a real Creator account would have.
  await patch("/api/creator/cashback-rate", { symbolId: MERCHANT, cashbackRate: 0.05 }, merchantToken);
  return payerToken;
}

async function run() {
  console.log(`app: ${APP}\napi: ${API}\n`);

  console.log("0. seed two payments through the real API");
  const payerToken = await seed();

  const shared = await post("/api/transactions/send", {
    senderSymbolId: PAYER, receiverSymbolId: MERCHANT, amount: 1200, note: "browser check", pin: PIN,
  }, payerToken);
  check("the shared payment was accepted", shared.status === 201, `status=${shared.status}`);
  const paymentRef = shared.body?.transaction?.referenceId || "";
  const shareRef = shared.body?.shareTransaction?.referenceId || "";
  check("the API minted two different references", !!paymentRef && !!shareRef && paymentRef !== shareRef);

  const plain = await post("/api/transactions/send", {
    senderSymbolId: PAYER, receiverSymbolId: PLAIN, amount: 150, note: "no share", pin: PIN,
  }, payerToken);
  check("the zero-share payment was accepted", plain.status === 201, `status=${plain.status}`);
  const plainRef = plain.body?.transaction?.referenceId || "";
  check("it minted no share leg", !plain.body?.shareTransaction);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  console.log("\n1. sign in through the real login screen");
  const login = await post("/api/login", { symbolId: PAYER, pin: PIN });
  check("the seeded account signs in", Boolean(login.body?.token), login.body?.message || "");

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.evaluate(([token, user]) => {
    window.localStorage.setItem("gloobal.session.v1", JSON.stringify({
      user, phoneNumber: user.mobileNumber || "", token, savedAt: Date.now(),
    }));
    try { window.localStorage.setItem("gloobal.permissions.seen.v1", "1"); } catch (e) {}
  }, [login.body.token, login.body.user]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  await clickLabel(page, "Log in");
  await page.waitForTimeout(1200);
  for (const digit of PIN) {
    await clickLabel(page, `Digit ${digit}`);
    await page.waitForTimeout(110);
  }
  await clickLabel(page, "Log in");
  await page.waitForTimeout(6000);
  let body = await textOf(page);
  check("the dashboard is reached after the PIN", !/\d\/6/.test(body), body.slice(0, 120));

  console.log("\n2. open History from the profile tab");
  await page.locator("button", { hasText: /^Profile$/ }).first().click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await clickText(page, "^History$");
  await page.waitForTimeout(2500);
  body = await textOf(page);
  check("the history screen is open", /Received|Paid/i.test(body), body.slice(0, 120));

  // Rows are addressed by the sentence a screen reader reads out, which
  // names the counterparty AND the amount — the payment and its share leg
  // are both "Receipt Merchant", and only the amount tells them apart.
  const openRow = (pattern) => page.evaluate((source) => {
    const re = new RegExp(source);
    const hit = [...document.querySelectorAll("button,[role=button]")]
      .find((el) => re.test(el.getAttribute("aria-label") || ""));
    if (hit) { hit.click(); return hit.getAttribute("aria-label"); }
    return "";
  }, pattern);

  console.log("\n3. reopen the shared payment's receipt from history");
  const openedShared = await openRow("^Receipt Merchant, .1,200");
  await page.waitForTimeout(1500);
  check("the payment receipt opened", !!openedShared, openedShared);

  const receipt = await readReceipt(page);
  check("the receipt draws a flag", receipt.hasFlag);
  check("the flag resolves to a real country", /^[A-Z]{2}$/.test(receipt.flagIso), `flag=${receipt.flagIso}`);
  check("the payment tab prints the payment's own reference", receipt.printedId === paymentRef,
    `printed=${receipt.printedId} expected=${paymentRef}`);
  check("a Creator Share tab is offered", receipt.hasShareTab);
  const paymentFlagIso = receipt.flagIso;

  console.log("\n4. the Creator Share tab prints ITS OWN reference");
  await clickText(page, "^Creator Share$");
  await page.waitForTimeout(900);
  const shareView = await readReceipt(page);
  check("the label says Share transaction ID", shareView.shareIdLabelled);
  check("it prints the share leg's reference", shareView.printedId === shareRef,
    `printed=${shareView.printedId} expected=${shareRef}`);
  check("it is NOT the payment's reference", shareView.printedId !== paymentRef, `payment=${paymentRef}`);
  check("the flag is still there on the share tab", shareView.hasFlag);
  check("and it names the same country as the payment tab", shareView.flagIso === paymentFlagIso,
    `${shareView.flagIso} vs ${paymentFlagIso}`);

  console.log("\n5. close and reopen — the same two references, the same flag");
  await clickText(page, "^Done$");
  await page.waitForTimeout(1200);
  await openRow("^Receipt Merchant, .1,200");
  await page.waitForTimeout(1500);
  const reopened = await readReceipt(page);
  check("the payment reference is unchanged after reopening", reopened.printedId === paymentRef,
    `printed=${reopened.printedId}`);
  check("the flag is unchanged after reopening", reopened.flagIso === paymentFlagIso,
    `${reopened.flagIso} vs ${paymentFlagIso}`);
  await clickText(page, "^Creator Share$");
  await page.waitForTimeout(900);
  const reopenedShare = await readReceipt(page);
  check("the share reference is unchanged after reopening", reopenedShare.printedId === shareRef,
    `printed=${reopenedShare.printedId}`);

  console.log("\n6. the share leg's own row opens under its own reference");
  await clickText(page, "^Done$");
  await page.waitForTimeout(1200);
  const openedShareRow = await openRow("^Receipt Merchant, \\+");
  await page.waitForTimeout(1500);
  check("the share row opened", !!openedShareRow, openedShareRow);
  const shareRowReceipt = await readReceipt(page);
  check("it prints the share leg's own reference", shareRowReceipt.printedId === shareRef,
    `printed=${shareRowReceipt.printedId} expected=${shareRef}`);
  check("it draws a flag", shareRowReceipt.hasFlag, `flag=${shareRowReceipt.flagIso}`);

  console.log("\n7. a payment that shares nothing offers no Creator Share receipt");
  await clickText(page, "^Done$");
  await page.waitForTimeout(1200);
  const openedZero = await openRow("^No Share Merchant");
  await page.waitForTimeout(1500);
  check("the zero-share receipt opened", !!openedZero, openedZero);
  const zero = await readReceipt(page);
  check("it prints its own payment reference", zero.printedId === plainRef,
    `printed=${zero.printedId} expected=${plainRef}`);
  check("no Creator Share tab is offered", !zero.hasShareTab);
  check("no share reference is printed anywhere", !zero.shareIdLabelled);
  check("it still draws a flag", zero.hasFlag);


  console.log(`\nconsole errors: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 5)) console.log(`  ${e.slice(0, 160)}`);

  await browser.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
