// tests/register-header-shots.mjs — pictures of making a GLOOBAL ID at a
// phone's size: the number (Create) and choosing the ID (Choose).
//   SHOT=/path/prefix node tests/register-header-shots.mjs
import { buildOnce, openPage, teardown } from "./browser-harness.mjs";
const SHOT = process.env.SHOT || "/tmp/register";
const W = Number(process.env.W || 360), H = Number(process.env.H || 712);
await buildOnce();
const { page, context, errors } = await openPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const ok = (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, available: true }) });
await page.route("**/api/otp/send", ok); await page.route("**/api/otp/verify", ok); await page.route("**/api/users/available**", ok);
await page.getByRole("button", { name: "I am IN" }).click();
await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 15000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOT}-1-number.png` });
for (const d of "9876543210") await page.getByLabel(`Digit ${d}`, { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOT}-2-number-typed.png` });
await page.getByLabel("Create", { exact: true }).click();
await page.getByTestId("gloobal-code-step").waitFor({ timeout: 10000 });
await page.getByLabel("Verify code", { exact: true }).click();
await page.getByTestId("gloobal-symbol-step").waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOT}-3-choose.png` });
await page.getByLabel("Use suggested Gloobal ID 1").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOT}-4-choose-filled.png` });
await page.getByLabel("Choose", { exact: true }).click();
await page.getByText("Who invited you?").waitFor({ timeout: 10000 });
await page.getByLabel("How inviting works", { exact: true }).click();
await page.locator("[data-referral-help]").waitFor({ timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOT}-5-referral-help.png` });
await page.locator("[data-referral-help]").evaluate((n) => { let el = n; while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; if (el) el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOT}-6-referral-help-end.png` });
console.log(JSON.stringify({ errors }));
await context.close();
await teardown();
