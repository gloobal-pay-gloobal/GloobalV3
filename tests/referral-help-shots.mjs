// tests/referral-help-shots.mjs — pictures of "How inviting works" at a
// phone's size: at sign-up (a person paying, then a business paying), and on
// My Referral Network (personal side, then the Creator side, which opens on
// the business example).
//   SHOT=/path/prefix node tests/referral-help-shots.mjs
import { buildOnce, openPage, teardown, login, ACCOUNTS } from "./browser-harness.mjs";
const SHOT = process.env.SHOT || "/tmp/refhelp";
const W = Number(process.env.W || 360), H = Number(process.env.H || 740);
const out = {};
await buildOnce();

// Scroll the sheet so `sel` sits near the top of it.
const scrollTo = (page, sel) => page.locator(sel).first().evaluate((n) => { let el = n.parentElement; while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; if (el) el.scrollTop += n.getBoundingClientRect().top - el.getBoundingClientRect().top - 12; });
const gets = (page) => page.locator("[data-referral-gets]").allTextContents();

{
  const { page, context, errors } = await openPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const ok = (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, available: true }) });
  await page.route("**/api/otp/send", ok); await page.route("**/api/otp/verify", ok); await page.route("**/api/users/available**", ok);
  await page.getByRole("button", { name: "I am IN" }).click();
  await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 15000 });
  for (const d of "9876543210") await page.getByLabel(`Digit ${d}`, { exact: true }).click();
  await page.getByLabel("Create", { exact: true }).click();
  await page.getByTestId("gloobal-code-step").waitFor({ timeout: 10000 });
  await page.getByLabel("Verify code", { exact: true }).click();
  await page.getByTestId("gloobal-symbol-step").waitFor({ timeout: 10000 });
  await page.getByLabel("Use suggested Gloobal ID 1").click();
  await page.waitForTimeout(400);
  await page.getByLabel("Choose", { exact: true }).click();
  await page.getByText("Who invited you?").waitFor({ timeout: 10000 });
  await page.getByLabel("How inviting works", { exact: true }).click();
  await page.locator('[data-referral-help="signup"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT}-1-signup-top.png` });
  await scrollTo(page, "[role=tablist]"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}-2-signup-person.png` });
  out.person = await gets(page);
  await page.getByTestId("referral-help-tab-business").click(); await page.waitForTimeout(400);
  await scrollTo(page, "[role=tablist]"); await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT}-3-signup-business.png` });
  out.business = await gets(page);
  await scrollTo(page, "[data-referral-tree]"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}-4-signup-tree.png` });
  out.signupErrors = errors.slice();
  await context.close();
}

{
  const { page, context, errors } = await openPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, account: ACCOUNTS.india });
  await login(page, ACCOUNTS.india);
  await page.locator('[aria-label="Open app map"]').first().click({ timeout: 20000 });
  await page.getByText("Referral Network", { exact: true }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: "How your network works" }).click({ timeout: 15000 });
  await page.locator('[data-referral-help="network"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT}-5-network-top.png` });
  await scrollTo(page, "[role=tablist]"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}-6-network-person.png` });
  out.networkStartsOn = await page.locator("[data-referral-line]").getAttribute("data-referral-line");
  // Phone Back closes the sheet and leaves the network screen showing.
  await page.goBack(); await page.waitForTimeout(600);
  out.backClosesSheet = (await page.locator("[data-referral-help]").count()) === 0 && (await page.getByRole("button", { name: "How your network works" }).count()) === 1;
  out.networkErrors = errors.slice();
  await context.close();
}

// The Creator side: the same screen opens on the business example.
{
  const { page, context, errors } = await openPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, account: ACCOUNTS.india });
  await login(page, ACCOUNTS.india);
  await page.locator('[aria-label="Switch to creator profile"]').first().click({ timeout: 20000 });
  await page.locator('[aria-label="Switch to personal profile"]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT}-7-creator-home.png` });
  await page.locator('[aria-label="Open app map"]').first().click({ timeout: 20000 });
  await page.getByText("Referral Network", { exact: true }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: "How your network works" }).click({ timeout: 15000 });
  await page.locator('[data-referral-help="network"]').waitFor({ timeout: 5000 });
  await scrollTo(page, "[role=tablist]"); await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT}-8-creator-business.png` });
  out.creatorStartsOn = await page.locator("[data-referral-line]").getAttribute("data-referral-line");
  await scrollTo(page, "[data-referral-tree]"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}-9-creator-notes.png` });
  out.creatorErrors = errors.slice();
  await context.close();
}

console.log(JSON.stringify(out));
await teardown();
